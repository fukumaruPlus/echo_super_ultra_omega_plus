const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const bat = require('../../characters/bat_ben.js');
const CHARACTERS = require('../../characters.js');

const saved = {
  triggerCutscene: engine.triggerCutscene,
  queueCutscene: engine.queueCutscene,
  runCutsceneQueue: engine.runCutsceneQueue,
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  endTurn: engine.endTurn,
};

let queued = [];

test.before(() => {
  engine.triggerCutscene = () => {};
  engine.queueCutscene = (p, key) => { queued.push(key); };
  engine.runCutsceneQueue = (onDone) => { if (onDone) onDone(); };
  engine.startPhaseTimer = () => {};
  engine.endTurn = () => {};
  engine.broadcastState = () => {};
});

test.after(() => {
  engine.clearPhaseTimer();
  Object.assign(engine, saved);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 7, armor: 0, shield: 0, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    batCar: false, batCarUsed: false,
  };
}

function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = [];
  const b = mk('B', 'bat_ben', 1);
  const a = mk('A', 'temari', 2);
  engine.players.B = b;
  engine.players.A = a;
  engine.setRoundNumber(3);   // เทิร์นคี่ = กลางวัน (กันโบนัสกลางคืนของสกิลติดตัวมารบกวนตัวเลข)
  engine.setGameMode('ffa');
  return { b, a };
}

function bust(p) { p.cards = [{ value: 10 }, { value: 10 }, { value: 10 }]; p.busted = true; }
const hit = (from, to, n) => engine.withEffectSource(from, () => engine.dealMixed(to, n, true));

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('แบทแมน: "เร้นเงา" ถูกถอดออกจากเกมแล้ว และมีชุดสกิลร่างรถครบ', () => {
  const c = CHARACTERS.CHAR_BY_ID.bat_ben;
  assert.equal(c.basic.name, 'รถแบทโมบิล');
  assert.equal(c.basic.cost, 2);
  assert.equal(c.basic2.name, 'ลูกปรายล่อ');
  assert.equal(c.basic2.cost, 3);
  assert.equal(c.secondary2.cost, 4);
  assert.equal(c.ultimate2.cost, 6);
  assert.ok(c.passive2, 'มีสกิลติดตัว 2 รถคู่ใจ');
  assert.equal(bat.onStealthExpire, undefined, 'ฮุคเร้นเงาถูกถอดออกหมดแล้ว');
  assert.equal(bat.cannotAttack, undefined);
});

// ---------------------------------------------------------------- รถแบทโมบิล
test('รถแบทโมบิล: กดได้ครั้งเดียวต่อเกม และสลับทั้งสามช่องสกิล', () => {
  const { b } = setup();
  const ch = CHARACTERS.CHAR_BY_ID.bat_ben;
  assert.equal(bat.canUseSkill(engine, b, 'basic'), true);
  assert.equal(bat.dynamicSkillFor(b, ch, 'basic').name, 'รถแบทโมบิล');

  bat.activateCar(engine, b);
  assert.equal(bat.inCar(b), true);
  assert.equal(b.armor, bat.CAR_ARMOR, 'เกราะ 7 = พลังชีวิตของรถ');
  assert.ok(queued.includes('batCar'));
  assert.equal(bat.dynamicSkillFor(b, ch, 'basic').name, 'ลูกปรายล่อ');
  assert.equal(bat.dynamicSkillFor(b, ch, 'secondary').name, 'ฉันไม่เคยฆ่าใคร แต่รถเป็นคนทำ');
  assert.equal(bat.dynamicSkillFor(b, ch, 'ultimate').name, 'ฉันไม่เคยปล่อยใครรอดพ้น');
});

test('รถแบทโมบิล: ความเสียหายลงเกราะเท่านั้น พลังชีวิตแตะไม่ได้', () => {
  const { b, a } = setup();
  bat.activateCar(engine, b);
  const hpBefore = b.hp;

  hit(a, b, 3);
  assert.equal(b.armor, bat.CAR_ARMOR - 3);
  assert.equal(b.hp, hpBefore, 'พลังชีวิตไม่ลดเลย');
  assert.equal(b.alive, true);
});

test('รถคู่ใจ (สกิลติดตัว 2): ดาเมจทะลุเกราะก็ลงแค่เกราะ', () => {
  const { b, a } = setup();
  bat.activateCar(engine, b);
  const hpBefore = b.hp;
  engine.withEffectSource(a, () => { engine.dealDirect(b, 3, true); }); // ปกติทะลุเกราะเข้าเลือดตรงๆ
  assert.equal(b.hp, hpBefore, 'ทะลุเกราะไม่ได้ระหว่างอยู่บนรถ');
  assert.equal(b.armor, bat.CAR_ARMOR - 3, 'ไปลงที่เกราะแทน');
});

test('รถแบทโมบิล: เกราะหมด = รถพัง คืนร่างด้วยเลือดเต็ม 7 และกดขึ้นรถอีกไม่ได้', () => {
  const { b, a } = setup();
  bat.activateCar(engine, b);
  b.hp = 2; // ต่อให้เลือดเหลือน้อยตอนขึ้นรถ ก็ต้องคืนร่างด้วยเลือดเต็ม
  queued = [];

  hit(a, b, bat.CAR_ARMOR);
  assert.equal(bat.inCar(b), false, 'รถพังแล้ว');
  assert.equal(b.armor, 0);
  assert.equal(b.hp, bat.CAR_REVERT_HP, 'คืนร่างด้วยเลือดเต็ม 7');
  assert.equal(b.alive, true, 'ไม่ตาย');
  assert.ok(queued.includes('batCarFail'), 'เล่นวีดีโอรถพัง');
  assert.equal(bat.canUseSkill(engine, b, 'basic'), false, 'ขึ้นรถอีกไม่ได้ตลอดเกม');
});

test('รถแบทโมบิล: สถานะของร่างรถถูกล้างตอนคืนร่าง', () => {
  const { b, a } = setup();
  bat.activateCar(engine, b);
  bat.activateGun(engine, b);
  bat.activateDoom(engine, b);
  hit(a, b, bat.CAR_ARMOR);
  assert.equal(b.statuses.batGun, undefined);
  assert.equal(b.statuses.batDoom, undefined);
});

// ---------------------------------------------------------------- ลูกปรายล่อ
test('ลูกปรายล่อ: ตัดความเสียหายทุกก้อนให้เหลือ 2 หน่วย', () => {
  const { b, a } = setup();
  bat.activateShot(engine, b);
  assert.equal(b.statuses.batShot, bat.SHOT_TURNS);
  assert.ok(queued.includes('batCarShot'), 'เล่นวีดีโอตอนกด');

  hit(a, b, 9);
  assert.equal(b.hp, 7 - bat.SHOT_CAP, 'โดน 9 เหลือ 2');

  b.hp = 7;
  hit(a, b, 1);
  assert.equal(b.hp, 6, 'ก้อนที่เล็กกว่า 2 อยู่แล้วไม่ถูกดัน');
});

// ---------------------------------------------------------------- ปืนติดรถ
test('ปืนติดรถ: โจมตีปกติแรงขึ้น 3 · ใช้แล้วหมดกระสุน + เล่นวีดีโอ', () => {
  const { b, a } = setup();
  const base = computeAttackBase(engine, b, a).base;
  bat.activateGun(engine, b);
  assert.equal(computeAttackBase(engine, b, a).base, base + bat.GUN_BONUS);

  assert.equal(bat.consumeGun(engine, b), true);
  assert.ok(queued.includes('batGun'));
  assert.equal(b.statuses.batGun, undefined, 'หมดกระสุน');
  assert.equal(computeAttackBase(engine, b, a).base, base);
  assert.equal(bat.consumeGun(engine, b), false, 'ยิงซ้ำไม่ได้');
});

// ---------------------------------------------------------------- แกไม่รอดแน่
test('แกไม่รอดแน่: มีคนไพ่แตก -> เล่นวีดีโอแล้วพุ่งชน 4 หน่วย (ทำงานครั้งเดียว)', () => {
  const { b, a } = setup();
  bat.activateDoom(engine, b);
  assert.equal(b.statuses.batDoom, bat.DOOM_TURNS);

  bat.onAfterResolve(engine);
  assert.equal(a.hp, 7, 'ยังไม่มีใครไพ่แตก = ไม่ทำงาน');
  assert.equal(b.statuses.batDoom, bat.DOOM_TURNS);

  bust(a);
  bat.onAfterResolve(engine);
  assert.equal(a.hp, 7 - bat.DOOM_DMG);
  assert.ok(queued.includes('batDoom'));
  assert.equal(b.statuses.batDoom, undefined, 'ทำงาน 1 ครั้งแล้วหายไป');

  a.hp = 7;
  bat.onAfterResolve(engine);
  assert.equal(a.hp, 7, 'ไม่ทำงานซ้ำ');
});

test('แกไม่รอดแน่: แบทแมนไพ่แตกเองไม่นับ', () => {
  const { b } = setup();
  bat.activateDoom(engine, b);
  bust(b);
  bat.onAfterResolve(engine);
  assert.equal(b.statuses.batDoom, bat.DOOM_TURNS, 'ยังไม่ถูกใช้');
});

// ---------------------------------------------------------------- กดซ้ำ
test('ร่างรถ: กดสกิลซ้ำระหว่างสถานะยังอยู่ไม่ได้', () => {
  const { b } = setup();
  bat.activateCar(engine, b);
  bat.activateShot(engine, b);
  assert.equal(bat.canUseSkill(engine, b, 'basic'), false);
  bat.activateGun(engine, b);
  assert.equal(bat.canUseSkill(engine, b, 'secondary'), false);
  bat.activateDoom(engine, b);
  assert.equal(bat.canUseSkill(engine, b, 'ultimate'), false);
});
