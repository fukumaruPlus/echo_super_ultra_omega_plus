// Recruit — QTE คลิกจุดแดง / [Armor] / กระสุน / สกิลพิเศษ ผ่าน engine จริง (server.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const recruit = require('../../characters/recruit.js');
const CHARACTERS = require('../../characters.js');

const realRandom = Math.random;
const NO_LUCK = () => 0.99; // ไม่ติด HeadShot / ไม่ได้โจมตีหรือยิงเพิ่ม

const blank = (id, characterId, position) => ({
  id, name: id, position, characterId, alive: true, connected: true, cards: [], statuses: {}, statusAmt: {},
  seen: {}, cutsceneShown: {}, inventory: [], teamId: null,
});
// temari / kai ไม่มีการหลบแบบสุ่ม — ใช้เป็นคู่ต่อสู้ได้โดยเทสต์ไม่แกว่ง
function setup(extra = []) {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  engine.players.R = blank('R', 'recruit', 1);
  engine.players.T = blank('T', 'temari', 2);
  extra.forEach((c, n) => { engine.players[`X${n}`] = blank(`X${n}`, c, 3 + n); });
  engine.setGameMode('ffa');
  engine.startMatch();
  engine.clearPhaseTimer();
  engine.setGameState('PLAYING');
  for (const p of Object.values(engine.players)) {
    p.locked = false; p.skillPoints = 8; p.skillUsedRound = false;
    p.hp = engine.maxHpOf(p); p.armor = 0; p.shield = 0; p.statuses = {}; p.statusAmt = {};
    recruit.resetCombat(p);
  }
  Math.random = NO_LUCK;
  return { R: engine.players.R, T: engine.players.T };
}
const qte = (R) => R.recruit.qte;
const clickDots = (R, n) => { for (const d of qte(R).dots.slice(0, n)) engine.recruitQteHit('R', d.id); };
const expire = (R) => { qte(R).deadline = Date.now() - 1000; engine.recruitQteDone('R'); };
function startAttack(by, target) {
  engine.setGameState('ATTACK');
  engine.setAttackerId(by);
  engine.doAttack(by, target);
}

const saved = { triggerCutscene: engine.triggerCutscene, queueCutscene: engine.queueCutscene, skillFlash: engine.skillFlash };
const cutscenes = [];
test.before(() => {
  // ไม่มีคลิปเข้าคิว = ผลที่รอ "หลังวีดีโอ" ลงทันที
  engine.triggerCutscene = (p, k) => cutscenes.push(k);
  engine.queueCutscene = (p, k) => cutscenes.push(k);
  engine.skillFlash = () => {};
});
test.after(() => { Object.assign(engine, saved); for (const id of Object.keys(engine.players)) delete engine.players[id]; });
test.afterEach(() => { Math.random = realRandom; engine.clearPhaseTimer(); cutscenes.length = 0; });

test('ข้อมูล: พลังชีวิต 5 · เกราะ 2 · กระสุน 6 · ราคา 4/4/6', () => {
  const c = CHARACTERS.CHAR_BY_ID.recruit;
  assert.equal(c.difficulty, 'hard');
  assert.deepEqual([c.basic.cost, c.secondary.cost, c.ultimate.cost], [4, 4, 6]);
  const { R } = setup();
  assert.equal(engine.maxHpOf(R), 5);
  assert.equal(engine.maxArmorOf(R), 2);
  assert.equal(R.recruit.bullets, 6);
});

test('[Armor]: การโจมตีปกติชนเกราะถูกกันทั้งหมัด · ครบ 2 ครั้งเกราะ -1 · ไม่ฟื้นเอง', () => {
  const { R } = setup();
  R.armor = 2;
  startAttack('T', 'R');
  engine.clearPhaseTimer();
  assert.equal(R.hp, 5);
  assert.equal(R.armor, 2, 'ครั้งแรกเกราะยังอยู่');
  startAttack('T', 'R');
  engine.clearPhaseTimer();
  assert.equal(R.armor, 1, 'ครบ 2 ครั้ง เกราะ -1');
  assert.equal(R.hp, 5);
  assert.equal(recruit.blocksArmorRegen(R), true);
  engine.dealMixed(R, 2); // ดาเมจจากสกิลกินเกราะตามปกติ
  assert.equal(R.armor, 0);
  assert.equal(R.hp, 4);
});

test('โจมตีปกติ: QTE 7 จุด โดน 6 = ยิงโดน 1 กระสุน -1 · โดน 5 = พลาด กระสุน -2', () => {
  const { R, T } = setup();
  startAttack('R', 'T');
  assert.equal(qte(R).mode, 'attack');
  assert.equal(qte(R).dots.length, 7);
  assert.equal(T.hp, 7, 'ยังไม่ยิงจนกว่า QTE จะจบ');
  clickDots(R, 6);
  expire(R);
  engine.clearPhaseTimer();
  assert.equal(T.hp, 6);
  assert.equal(R.recruit.bullets, 5);

  startAttack('R', 'T');
  clickDots(R, 5);
  expire(R);
  engine.clearPhaseTimer();
  assert.equal(T.hp, 6, 'พลาด = ไม่มีความเสียหาย');
  assert.equal(R.recruit.bullets, 3);
  assert.equal(engine.gameState, 'ATTACKING');
});

test('โจมตีปกติ: คลิกครบทุกจุดจบ QTE ทันที · HeadShot +1 · กระสุนหมดยิงไม่ได้', () => {
  const { R, T } = setup();
  startAttack('R', 'T');
  Math.random = () => 0.1; // ติด HeadShot + ได้โจมตีอีกครั้ง
  clickDots(R, 7);
  engine.clearPhaseTimer();
  assert.equal(qte(R), null);
  assert.equal(T.hp, 5, '1 + HeadShot 1');

  R.recruit.bullets = 0;
  R.recruit.extraAtk = false;
  startAttack('R', 'T');
  engine.clearPhaseTimer();
  assert.equal(qte(R), null, 'ไม่มี QTE');
  assert.equal(T.hp, 5);
  assert.equal(engine.gameState, 'ATTACKING');
});

test('Desert Eagle: เลือกเป้า -> QTE 8 จุด โดน 7 = เจาะเกราะ 2 + เลือดไหล 2 · พลาด = วีดีโอแล้วเสียเลือด 2', () => {
  const { R, T } = setup();
  T.armor = 2;
  engine.useSkill('R', 'basic');
  assert.equal(qte(R), null, 'ต้องเลือกเป้าก่อน');
  engine.useSkill('R', 'basic', ['T']);
  assert.equal(R.skillPoints, 4);
  assert.equal(R.recruit.bullets, 3);
  assert.equal(qte(R).dots.length, 8);
  clickDots(R, 7);
  expire(R);
  assert.equal(T.armor, 2, 'เจาะเกราะ');
  assert.equal(T.hp, 5);
  assert.equal(T.statuses.hbleed, 2);
  assert.equal(recruit.cooldownLeft(engine, R, 'basic'), 3);

  R.recruit.cd = {}; R.skillUsedRound = false; R.skillPoints = 8;
  engine.useSkill('R', 'basic', ['T']);
  clickDots(R, 6);
  expire(R);
  assert.deepEqual(cutscenes, ['recruitFail']);
  assert.equal(R.hp, 3, 'พลาด = เสียพลังชีวิต 2');
});

test('Desert Eagle: 30% ได้ยิงอีกนัด (เลือกเป้าใหม่)', () => {
  const { R, T } = setup();
  engine.useSkill('R', 'basic', ['T']);
  Math.random = () => 0.1;
  clickDots(R, 8);
  assert.equal(T.hp, 4, '2 + HeadShot');
  assert.equal(R.recruit.pick.mode, 'bonus');
  engine.recruitPick('R', ['T']);
  assert.equal(T.hp, 1);
  assert.equal(R.recruit.pick, null);
});

test('FAMAS: คลิกจุดวิ่งโดน -> เลือก 2 คน คนละ 3 (ห้ามซ้ำเมื่อมีคู่ต่อสู้พอ) · พลาดเสียเลือด 2', () => {
  const { R, T } = setup(['kai']);
  const X = engine.players.X0;
  engine.useSkill('R', 'secondary');
  assert.equal(qte(R).kind, 'chase');
  clickDots(R, 1);
  assert.equal(R.recruit.pick.need, 2);
  engine.recruitPick('R', ['T', 'T']);
  assert.ok(R.recruit.pick, 'มีคู่ต่อสู้ 2 คน ห้ามเลือกซ้ำ');
  engine.recruitPick('R', ['T', 'X0']);
  assert.equal(T.hp, 4);
  assert.equal(X.hp, engine.maxHpOf(X) - 3);

  R.recruit.cd = {}; R.skillUsedRound = false; R.skillPoints = 8; R.recruit.bullets = 6;
  engine.useSkill('R', 'secondary');
  expire(R);
  assert.equal(R.hp, 3);
});

test('Barrett: สำเร็จ = วีดีโอ + เจาะเกราะ 4 + สตั้นเป้าหมายทันที · พลาด = เสียเลือด 2 + สตั้นตัวเอง 2', () => {
  const { R, T } = setup();
  engine.useSkill('R', 'ultimate', ['T']);
  clickDots(R, 1);
  assert.deepEqual(cutscenes, ['recruitUlt']);
  assert.equal(T.hp, 3);
  assert.equal(T.statuses.stun, 1);
  assert.equal(T.locked, true);

  R.recruit.cd = {}; R.skillUsedRound = false; R.skillPoints = 8; R.recruit.bullets = 6;
  T.locked = false; // ไม่ให้สตั้นตัวเองไปครบเงื่อนไขเปิดไพ่แล้วสรุปรอบ (ดาเมจแพ้จั่วจะปนผล)
  engine.useSkill('R', 'ultimate', ['T']);
  expire(R);
  assert.equal(R.hp, 3);
  assert.equal(R.statuses.stun, 2);
  assert.equal(R.locked, true);
});

test('เตรียมตัว: ไม่กินโควตา · Reload ห้ามสกิล · Bandage ฮีล+ล้าง+ห้ามจั่ว (3 ครั้ง) · Armor 2 ครั้ง', () => {
  const { R } = setup();
  R.hp = 2; R.recruit.bullets = 0; R.statuses.weak = 2;
  engine.recruitPrep('R', 'bandage');
  assert.equal(R.hp, 4);
  assert.equal(R.statuses.weak, undefined);
  assert.equal(R.statuses.nodraw, 1);
  assert.equal(R.recruit.prepUses.bandage, 2);
  assert.equal(R.skillUsedRound, false, 'ไม่กินโควตาสกิลของเทิร์น');
  engine.recruitPrep('R', 'armor');
  assert.equal(R.armor, 1);
  assert.equal(R.statuses.noskill, 1);
  engine.recruitPrep('R', 'reload');
  assert.equal(R.recruit.bullets, 0, 'ติดห้ามใช้สกิลอยู่ กดไม่ได้');
  delete R.statuses.noskill;
  engine.recruitPrep('R', 'reload');
  assert.equal(R.recruit.bullets, 6);
  assert.equal(R.skillPoints, 5);
});

test('QTE ค้างกันเปิดไพ่ · หมดเวลาเฟสจั่วแล้วนับจุดที่คลิกได้ตอนนั้น · นัดที่รอเลือกเป้าถูกสุ่มให้', () => {
  const { resolveRound } = require('../../server.js');
  const { R, T } = setup();
  engine.useSkill('R', 'basic', ['T']);
  clickDots(R, 7); // พอสำเร็จแล้ว แต่ยังไม่หมดเวลา
  R.cards = [{ value: 2, color: 'red' }]; T.cards = [{ value: 10, color: 'blue' }]; // Recruit แพ้จั่ว — T ไม่โดนดาเมจแพ้
  R.locked = true; T.locked = true;
  engine.checkAllLocked();
  assert.equal(engine.gameState, 'PLAYING', 'ยังรอ QTE ให้จบก่อน');
  assert.ok(qte(R));
  Math.random = () => 0.1; // ติดนัดที่ 2 ของ Desert Eagle ด้วย
  resolveRound(); // หมดเวลาเฟสจั่ว
  engine.clearPhaseTimer();
  assert.equal(qte(R), null);
  assert.equal(R.recruit.pick, null, 'นัดที่รอเลือกเป้าถูกสุ่มให้แล้ว');
  assert.equal(T.hp, 1, 'สองนัด นัดละ 2 + HeadShot');
});
