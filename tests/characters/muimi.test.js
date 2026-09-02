const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase, attackSoundOf } = require('../../server.js');
const { CHAR_BY_ID } = require('../../characters.js');
const muimi = require('../../characters/muimi.js');

const originalFns = {
  queueCutscene: engine.queueCutscene,
  skillFlash: engine.skillFlash,
  broadcastState: engine.broadcastState,
  checkAllLocked: engine.checkAllLocked,
};

let queued = [];

test.before(() => {
  engine.queueCutscene = (p, key) => { queued.push(key); };
  engine.skillFlash = () => {};
  engine.broadcastState = () => {};
  engine.checkAllLocked = () => {};
});

test.after(() => {
  Object.assign(engine, originalFns);
  engine.setGameMode('ffa');
  engine.setGameState('LOBBY');
});

test.afterEach(() => {
  engine.setGameMode('ffa');
  engine.setGameState('LOBBY');
});

function mk(id, characterId, position, teamId = null) {
  return {
    id, name: id, characterId, position, teamId, alive: true, connected: true,
    hp: 4, armor: 0, shield: 0, skillPoints: 4, statuses: {}, statusAmt: {},
    seen: {}, cutsceneShown: {}, cards: [], inventory: [], evadeStacks: [],
    locked: false, busted: false, result: null, isWinner: false, isLoser: false,
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, skillUsedRound: false,
    transformAt: 0,
  };
}

function setup() {
  for (const key of Object.keys(engine.players)) delete engine.players[key];
  queued = [];
  engine.setRoundNumber(3);
  const m = mk('M', 'muimi', 1);
  const a = mk('A', 'temari', 2);
  const b = mk('B', 'kuwagata', 3);
  engine.players.M = m;
  engine.players.A = a;
  engine.players.B = b;
  muimi.resetCombat(m);
  return { m, a, b };
}

function withRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = real; }
}

test('ข้อมูลตัวละครมุยมิเป็นระดับง่าย ใช้ชื่อสถานะภาษาไทย และมีสกิลครบตามค่าใช้', () => {
  const c = CHAR_BY_ID.muimi;
  assert.ok(c);
  assert.equal(c.name, 'มุยมิ');
  assert.equal(c.difficulty, 'easy');
  assert.equal(c.basic.cost, 0);
  assert.equal(c.basic.ammo, 2);
  assert.equal(c.secondary.cost, 4);
  assert.equal(c.ultimate.cost, 8);
  assert.match(c.secondary.desc, /ดาบเก่าๆ/);
  assert.match(c.ultimate.desc, /ดาบสะบั้น/);
  assert.ok(c.passive && c.passive2);
});

test('เสบียงฉุกเฉินฟื้นชีวิตและแต้มสกิล กดได้เทิร์นละครั้ง รวม 2 ครั้งต่อเกม', () => {
  const { m } = setup();
  m.hp = 2;
  m.skillPoints = 1;
  assert.equal(muimi.canUseSkill(engine, m, 'basic'), true);
  muimi.applyInstantSkill(engine, m, 'basic');
  assert.equal(m.hp, 4);
  assert.equal(m.skillPoints, 3);
  assert.equal(m.muimiEmergencyUses, 1);
  assert.equal(muimi.canUseSkill(engine, m, 'basic'), false, 'รอบเดียวกันกดซ้ำไม่ได้');

  engine.setRoundNumber(4);
  assert.equal(muimi.canUseSkill(engine, m, 'basic'), true);
  muimi.applyInstantSkill(engine, m, 'basic');
  assert.equal(m.muimiEmergencyUses, 0);
  engine.setRoundNumber(5);
  assert.equal(muimi.canUseSkill(engine, m, 'basic'), false, 'ครบสองครั้งแล้วหมดทั้งเกม');
});

test('เสบียงฉุกเฉินไม่กินสิทธิ์สกิลหลักของเทิร์น แต่สกิลรองกินสิทธิ์ตามปกติ', () => {
  const { m } = setup();
  engine.setGameState('PLAYING');
  m.skillPoints = 4;
  engine.useSkill(m.id, 'basic');
  assert.equal(m.skillUsedRound, false);
  assert.equal(m.muimiEmergencyUses, 1);
  engine.useSkill(m.id, 'secondary');
  assert.equal(m.skillUsedRound, true);
  assert.equal(m.statuses.muimiRusty, muimi.RUSTY_TURNS);
});

test('ดาบสนิมกับดาบสะบั้นล็อกกันเองตามสถานะ', () => {
  const { m } = setup();
  muimi.applyInstantSkill(engine, m, 'secondary');
  assert.equal(muimi.canUseSkill(engine, m, 'ultimate'), false);
  delete m.statuses.muimiRusty;
  m.statuses.muimiTower = 2;
  assert.equal(muimi.canUseSkill(engine, m, 'secondary'), false);
  assert.equal(muimi.canUseSkill(engine, m, 'ultimate'), true, 'ท่าไม้ตายกดซ้ำได้ถ้าดาบสนิมไม่ทำงาน');
});

test('ดาบสะบั้นหมดลงแล้วคูลดาวน์ 3 เทิร์น ก่อนใช้ท่าไม้ตายซ้ำได้', () => {
  const { m } = setup();
  engine.setRoundNumber(10);
  muimi.onUltExpire(engine, m);
  assert.equal(m.muimiUltLock, 10 + muimi.ULT_COOLDOWN_TURNS);

  engine.setRoundNumber(11);
  assert.equal(muimi.ultCooldownLeft(engine, m), 3);
  assert.equal(muimi.canUseSkill(engine, m, 'ultimate'), false);
  engine.setRoundNumber(12);
  assert.equal(muimi.ultCooldownLeft(engine, m), 2);
  engine.setRoundNumber(13);
  assert.equal(muimi.ultCooldownLeft(engine, m), 1);
  assert.equal(muimi.canUseSkill(engine, m, 'ultimate'), false);
  engine.setRoundNumber(14);
  assert.equal(muimi.ultCooldownLeft(engine, m), 0);
  assert.equal(muimi.canUseSkill(engine, m, 'ultimate'), true);
});

test('ท่าไม้ตายบังคับเฉพาะศัตรูให้ไพ่แตก ต้านสถานะกันไม่ได้ และสลับคลิปเต็ม/สั้น', () => {
  const { m, a, b } = setup();
  engine.setGameMode('duo');
  m.teamId = 'red';
  b.teamId = 'red';
  a.teamId = 'blue';
  a.statuses.resist = 9;
  m.skillPoints = 8;

  muimi.applyInstantSkill(engine, m, 'ultimate');
  assert.equal(engine.bustedOf(a), true, 'ศัตรูแตกแม้มีต้านสถานะ');
  assert.equal(engine.bustedOf(b), false, 'เพื่อนร่วมทีมไม่โดน');
  assert.equal(engine.bustedOf(m), false, 'ตัวเองไม่โดน');
  assert.equal(m.statuses.muimiTower, 2);
  assert.equal(m.statuses.resist, 3);
  assert.equal(muimi.displayImg(m), muimi.IMG.ultimate);
  assert.deepEqual(queued, ['muimiUltimateFull']);

  engine.setRoundNumber(4);
  muimi.applyInstantSkill(engine, m, 'ultimate');
  assert.deepEqual(queued, ['muimiUltimateFull', 'muimiUltimateShort']);
});

test('คัตซีนท่าไม้ตายเผื่อเวลาจากความยาวจริงและเล่นเพลงที่กำหนด', () => {
  const full = engine.TRANSFORMS.muimiUltimateFull;
  const short = engine.TRANSFORMS.muimiUltimateShort;
  assert.equal(full.video, '/characters/muimi/muimi_skill3.mp4');
  assert.equal(full.seconds, 24);
  assert.equal(short.video, '/characters/muimi/muimi_skill3_short.mp4');
  assert.equal(short.seconds, 12);
  assert.equal(full.music, 'muimi');
  assert.equal(short.music, 'muimi');
});

test('ดาบเก่าๆ ฟื้น 1/1 ส่วนดาบสะบั้นเพิ่มโจมตี 3 ฟื้นชีวิต 2 และยืดเวลา 1 เทิร์น', () => {
  const { m, a } = setup();
  m.hp = 2;
  m.skillPoints = 2;
  m.statuses.muimiRusty = 3;
  const rusty = muimi.onAttackLanded(engine, m);
  assert.deepEqual(rusty, { mode: 'rusty', hp: 1, sp: 1, extended: false });
  assert.equal(m.hp, 3);
  assert.equal(m.skillPoints, 3);

  delete m.statuses.muimiRusty;
  m.statuses.muimiTower = 2;
  m.hp = 2;
  assert.equal(computeAttackBase(engine, m, a).base, 4, 'ฐาน 1 + ดาบสะบั้น 3');
  const tower = muimi.onAttackLanded(engine, m);
  assert.equal(tower.hp, 2);
  assert.equal(tower.extended, true);
  assert.equal(m.hp, 4);
  assert.equal(m.statuses.muimiTower, 3);
});

test('ใจที่ไม่ยอมแพ้กัน Overload Force เฉพาะขณะดาบสะบั้นและสกิลติดตัวไม่ถูกผนึก', () => {
  const { m } = setup();
  assert.equal(muimi.blocksOverloadForce(engine), false);
  m.statuses.muimiTower = 2;
  assert.equal(muimi.blocksOverloadForce(engine), true);
  m.statuses.nanayaSeal = 1;
  assert.equal(muimi.blocksOverloadForce(engine), false);
});

test('หัวใจนักสู้: ชนะจากการกดท่าไม้ตายยังเป็นแพ้ครั้งที่ 3 และสุ่มในเทิร์นถัดไป', () => {
  const { m, a } = setup();
  m.muimiLoseStreak = 2;
  m.muimiUltCastRound = engine.roundNumber;
  m.isWinner = true;
  muimi.onAfterRoundScores(engine, [m, a]);
  assert.equal(m.muimiLoseStreak, 3);
  assert.equal(m.muimiHeartRound, 4);

  engine.setRoundNumber(4);
  a.statuses.resist = 5;
  withRandom(0.1, () => muimi.onRoundStartAfterLoop(engine));
  assert.equal(engine.bustedOf(a), true, 'สุ่มสำเร็จแล้วต้านสถานะกันไม่ได้');
  assert.equal(m.muimiLoseStreak, 0);
  assert.equal(m.muimiHeartRound, 0);
});

test('หัวใจนักสู้รีเซ็ตจำนวนแพ้หลังสุ่มล้มเหลว และไม่โดนเพื่อนร่วมทีม', () => {
  const { m, a, b } = setup();
  engine.setGameMode('duo');
  m.teamId = b.teamId = 'red';
  a.teamId = 'blue';
  m.muimiLoseStreak = 3;
  m.muimiHeartRound = 3;

  withRandom(0.9, () => muimi.onRoundStartAfterLoop(engine));
  assert.equal(m.muimiLoseStreak, 0);
  assert.equal(engine.bustedOf(a), false);
  assert.equal(engine.bustedOf(b), false);

  m.muimiLoseStreak = 3;
  m.muimiHeartRound = 3;
  withRandom(0.1, () => muimi.onRoundStartAfterLoop(engine));
  assert.equal(engine.bustedOf(a), true);
  assert.equal(engine.bustedOf(b), false, 'เพื่อนร่วมทีมไม่โดนหัวใจนักสู้');
});

test('เสียงโจมตีสลับตามสถานะดาบสะบั้น', () => {
  const { m } = setup();
  assert.equal(attackSoundOf(m), 'muimi_normal_hit');
  m.statuses.muimiTower = 2;
  assert.equal(attackSoundOf(m), 'muimi_ub_hit');
});
