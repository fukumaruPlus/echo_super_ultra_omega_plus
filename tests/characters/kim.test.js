// Bamboo-Hatted Kim — กติกาหลักของ characters/kim.js ผ่าน engine จริง (server.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const kim = require('../../characters/kim.js');
const CHARACTERS = require('../../characters.js');

const realRandom = Math.random;
function withRandom(v, fn) {
  const seq = Array.isArray(v) ? v : null;
  let i = 0;
  Math.random = () => (seq ? (i < seq.length ? seq[i++] : 0.99) : v);
  try { return fn(); } finally { Math.random = realRandom; }
}

const blank = (id, characterId, position) => ({
  id, name: id, position, characterId, alive: true, connected: true, cards: [], statuses: {}, statusAmt: {},
  seen: {}, cutsceneShown: {}, inventory: [], teamId: null,
});

// temari / kai ไม่มีการหลบแบบสุ่ม — ใช้เป็นคู่ต่อสู้ได้โดยเทสต์ไม่แกว่ง
function setup(extra = []) {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  engine.players.K = blank('K', 'kim', 1);
  engine.players.T = blank('T', 'temari', 2);
  extra.forEach((c, n) => { engine.players[`X${n}`] = blank(`X${n}`, c, 3 + n); });
  engine.setGameMode('ffa');
  engine.startMatch();
  engine.clearPhaseTimer();
  engine.setGameState('PLAYING');
  for (const p of Object.values(engine.players)) {
    p.locked = false; p.skillPoints = 8; p.skillUsedRound = false;
    p.hp = engine.maxHpOf(p); p.armor = 0; p.shield = 0; p.statuses = {}; p.statusAmt = {};
    kim.resetCombat(p); // เทิร์นแรกของ startMatch โยนเหรียญไปแล้ว — เริ่มจากศูนย์ทุกเทสต์
  }
  const K = engine.players.K;
  return { K, T: engine.players.T };
}
// เปิดเฟสโจมตีแล้วให้ by ตี target ผ่าน doAttack จริง
function attack(byId, targetId) {
  engine.setGameState('ATTACK');
  engine.setAttackerId(byId);
  engine.doAttack(byId, targetId);
  engine.clearPhaseTimer();
}

const saved = { triggerCutscene: engine.triggerCutscene, queueCutscene: engine.queueCutscene, skillFlash: engine.skillFlash };
const cutscenes = [];
test.before(() => {
  engine.triggerCutscene = (p, k) => cutscenes.push(k);
  engine.queueCutscene = (p, k) => cutscenes.push(k);
  engine.skillFlash = () => {};
});
test.after(() => { Object.assign(engine, saved); for (const id of Object.keys(engine.players)) delete engine.players[id]; });
test.afterEach(() => { Math.random = realRandom; engine.clearPhaseTimer(); cutscenes.length = 0; });

test('ข้อมูล: พลังชีวิต 8 · เกราะ 2 · ราคา 3/5/7/8 · เลือกได้คนเดียว · อยู่หมวดพิเศษ', () => {
  const c = CHARACTERS.CHAR_BY_ID.kim;
  assert.equal(c.unique, true);
  assert.equal(c.difficulty, 'special');
  assert.deepEqual([c.basic.cost, c.secondary.cost, c.ultimate.cost, c.ultimate2.cost], [3, 5, 7, 8]);
  const { K } = setup();
  assert.equal(engine.maxHpOf(K), 8);
  assert.equal(engine.maxArmorOf(K), 2);
  assert.equal(K.kim.scabbard, 0);
  assert.equal(K.kim.poise, 0);
  assert.equal(kim.damageBonus(engine, K), 0, 'พลังโจมตีพื้นฐาน 1');
});

test('โยนเหรียญ: 50/50 ตอนเลือดเต็ม · เสียเลือดทุก 1 หน่วย ก้อย +5% · ผลของหัว/ก้อยตามพลังชีวิต', () => {
  const { K } = setup();
  withRandom(0.49, () => kim.onRoundStartTick(engine, K));
  assert.equal(K.kim.coin, 'tails');
  assert.ok(K.kim.poise >= 1 && K.kim.poise <= 3, 'ก้อย + เลือด >= 5 -> Poise +1-3');

  K.skillPoints = 0;
  withRandom(0.51, () => kim.onRoundStartTick(engine, K));
  assert.equal(K.kim.coin, 'heads');
  assert.equal(K.skillPoints, 1, 'หัว + เลือด >= 5 -> แต้มสกิล +1');

  K.hp = 4; // เสียไป 4 -> ก้อย 70%
  withRandom(0.69, () => kim.onRoundStartTick(engine, K));
  assert.equal(K.kim.coin, 'tails');
  assert.equal(K.armor, 1, 'ก้อย + เลือด <= 5 -> เกราะ +1');
  withRandom(0.71, () => kim.onRoundStartTick(engine, K));
  assert.equal(K.kim.coin, 'heads');
  K.kim.poise = 0;
  assert.equal(kim.critChance(K), 15, 'หัว + เลือด <= 4 -> คริติคอล +15%');
});

test('ชักดาบ: คูลดาวน์ 2 เทิร์น · หมัดถัดไปได้ Poise + เลือดไหล และเหน็บชาเริ่มเทิร์นหน้า', () => {
  const { K, T } = setup();
  engine.setRoundNumber(5);
  engine.useSkill('K', 'basic');
  assert.equal(K.skillPoints, 5);
  assert.equal(K.kim.drawArmed, true);
  assert.equal(kim.cooldownLeft(engine, K, 'basic'), 3, 'กดเทิร์น 5 -> ติดเทิร์น 6-7 (โชว์ 3 ระหว่างเทิร์นที่กด)');
  engine.setRoundNumber(7);
  assert.equal(kim.cooldownLeft(engine, K, 'basic'), 1);
  engine.setRoundNumber(8);
  assert.equal(kim.cooldownLeft(engine, K, 'basic'), 0, 'กดได้อีกทีเทิร์น 8');

  withRandom(0.99, () => attack('K', 'T'));
  assert.equal(K.kim.drawArmed, false);
  assert.equal(K.kim.poise, 5, 'Poise +2-5 (สุ่มสูงสุด)');
  assert.equal(K.kim.scabbard, 8, 'โจมตีโดน ฝักดาบ +3-8');
  assert.equal(T.statuses.hbleed, 1);
  assert.equal(T.kimNumbPending, 1);
  assert.equal(T.statuses.numb, undefined, 'เหน็บชายังไม่ติดในเทิร์นนี้');
  kim.onRoundStartTick(engine, T);
  assert.equal(T.statuses.numb, 1, 'ติดตอนต้นเทิร์นถัดไป');
});

test('Counter Stance: ถูกโจมตีปกติแล้วสวนกลับ + เลือดไหล + ฝักดาบจากการถูกตี', () => {
  const { K, T } = setup();
  engine.useSkill('K', 'secondary');
  assert.equal(K.statuses.kimCounter, 2);
  const before = T.hp;
  withRandom(0.99, () => attack('T', 'K'));
  assert.equal(T.hp, before - 1, 'สวนกลับด้วยพลังโจมตีพื้นฐาน 1');
  assert.equal(T.statuses.hbleed, 1);
  assert.equal(K.kim.scabbard, 10, 'ถูกโจมตี ฝักดาบ +3-10');
  assert.equal(K.statuses.kimCounter, 2, 'สวนได้ตลอดอายุสถานะ');
});

test('จักเฉือนเลือดเนื้อตน (หัว): จั่วไม่ได้ แต้ม 0 แพ้ -> To Claim Their Bones + Yield My Flesh = รวมร่าง', () => {
  const { K, T } = setup();
  K.kim.coin = 'heads';
  K.cards = [{ value: 10, color: 'red' }, { value: 9, color: 'red' }];
  T.cards = [{ value: 5, color: 'blue' }];
  engine.useSkill('K', 'ultimate');
  assert.equal(K.skillPoints, 1);
  const n = K.cards.length;
  engine.hit('K');
  assert.equal(K.cards.length, n, 'จั่วไม่ได้หลังกด');
  K.locked = true; T.locked = true;
  withRandom(0.99, () => engine.checkAllLocked());
  engine.clearPhaseTimer();
  assert.equal(engine.scoreOf(K), 0);
  assert.equal(K.isLoser, true);
  assert.equal(K.kim.bones, true, 'ได้ทั้งสองบัพพร้อมกัน -> รวมร่างทันที');
  assert.equal(K.kim.ymf, false);
  assert.equal(K.kim.tctb, false);
  assert.equal(kim.canUseSkill(engine, K, 'ultimate'), false, 'ใช้ไม่ได้ระหว่างบัพรวมร่าง');
});

test('จักเฉือนเลือดเนื้อตน (ก้อย): ปรับแต้มเป็น 20 แล้วได้ Yield My Flesh (พลังโจมตี +1)', () => {
  const { K, T } = setup();
  K.kim.coin = 'tails';
  K.cards = [{ value: 4, color: 'red' }];
  T.cards = [{ value: 3, color: 'blue' }];
  engine.useSkill('K', 'ultimate');
  K.locked = true; T.locked = true;
  withRandom(0.99, () => engine.checkAllLocked());
  engine.clearPhaseTimer();
  assert.equal(engine.scoreOf(K), 20);
  assert.equal(K.isWinner, true);
  assert.equal(K.kim.ymf, true);
  assert.equal(K.kim.tctb, false, 'ไม่แพ้ = ไม่ได้ To Claim Their Bones');
  assert.equal(kim.damageBonus(engine, K), 1);
});

test('Yield My Flesh To Claim Their Bones: ล่อเป้า · สวน +1 · ฟันคนอื่น 1 · หายหลังถูกตี', () => {
  const { K, T } = setup(['kai']);
  const X = engine.players.X0;
  K.kim.bones = true;
  const tHp = T.hp, xHp = X.hp;
  withRandom(0.99, () => attack('T', 'X0')); // เล็งคนอื่น แต่ถูกดึงมาที่ Kim
  assert.equal(K.hp, 7, 'Kim รับหมัดแทน');
  assert.equal(T.hp, tHp - 2, 'สวนกลับ 1 + 1');
  assert.equal(X.hp, xHp - 1, 'คนอื่นโดนคนละ 1');
  assert.equal(T.statuses.hbleed, 1);
  assert.equal(X.statuses.hbleed, 1);
  assert.equal(K.kim.bones, false);
  assert.equal(K.kim.poise, 8, 'Poise +2-8');
});

test('Resentment: ความเสียหายเกินพลังชีวิตครั้งแรกค้างที่ 1 · ครั้งที่สองตายจริง', () => {
  const { K } = setup();
  K.hp = 3;
  engine.dealMixed(K, 10);
  engine.resolveDamageAftermath(K);
  assert.equal(K.alive, true);
  assert.equal(K.hp, 1);
  assert.equal(K.kim.resentUsed, true);
  engine.dealMixed(K, 5);
  engine.resolveDamageAftermath(K);
  assert.equal(K.alive, false);
});

test('ฝักดาบครบ 80: ร่าง Awake (วีดีโอ · ภาพ · พลังโจมตี +1 · ท่าไม้ตาย 2) · ท่า 2 จ่ายเลือด 1 + เปราะบางตอนก้อย', () => {
  const { K, T } = setup();
  K.kim.scabbard = 75;
  kim.addScabbard(engine, K, 5, 'ทดสอบ');
  assert.deepEqual(cutscenes, ['kimAwake']);
  assert.equal(kim.isAwake(K), true);
  assert.equal(engine.displayImg(K), kim.IMG.awake);
  assert.equal(kim.damageBonus(engine, K), 1);
  const st = engine.buildStateFor('K');
  const me = st.players.find((p) => p.id === 'K');
  assert.equal(me.character.ultimate.name, CHARACTERS.CHAR_BY_ID.kim.ultimate2.name);

  K.kim.coin = 'tails';
  engine.useSkill('K', 'ultimate');
  assert.equal(K.skillPoints, 0);
  assert.equal(K.hp, 7, 'จ่ายพลังชีวิต 1');
  assert.equal(K.kim.bones, true);
  assert.equal(T.statuses.fragile, 1);
  assert.equal(kim.cooldownLeft(engine, K, 'ultimate'), 6, 'คูลดาวน์ 5 เทิร์นนับจากเทิร์นหน้า');
});

test('คริติคอลจาก Poise: 1.2%/หน่วย (เพดาน 60%) ×2 และ Poise -15', () => {
  const { K } = setup();
  K.kim.poise = 50;
  assert.equal(kim.critChance(K), 60);
  const fx = {};
  assert.equal(withRandom(0.59, () => kim.applyCrit(engine, K, 2, fx)), 4);
  assert.equal(fx.crit, true);
  assert.equal(K.kim.poise, 35);
  assert.equal(withRandom(0.61, () => kim.applyCrit(engine, K, 2, {})), 2, '60% ไม่ติด');
});

test('ถูกหลบ: ฝักดาบ +10 แทนการได้จากหมัดโดน', () => {
  const { K, T } = setup();
  engine.grantEvadeStack(T);
  T.statusAmt.evade = 100;
  withRandom(0.99, () => attack('K', 'T'));
  assert.equal(K.kim.scabbard, 0, 'ยังไม่ตัดสินจนจบเทิร์น');
  kim.flushMiss(engine);
  assert.equal(K.kim.scabbard, 10);
});

test('เหน็บชา: 30% กดสกิลแล้วไม่ทำงาน แต่แต้มสกิลถูกหัก', () => {
  const { K } = setup();
  K.statuses.numb = 1;
  withRandom(0.1, () => engine.useSkill('K', 'secondary'));
  assert.equal(K.skillPoints, 3, 'หักแต้มแล้ว');
  assert.equal(K.statuses.kimCounter, undefined, 'แต่ผลไม่เกิด');
  assert.equal(K.skillUsedRound, true, 'โควตาของเทิร์นถูกใช้ไปแล้ว');
});
