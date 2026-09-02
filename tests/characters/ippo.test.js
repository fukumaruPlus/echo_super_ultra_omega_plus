const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const ippo = require('../../characters/ippo.js');
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
    hp: 5, armor: 0, shield: 0, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    ippoStandDodge: 0, ippoCharge: 0, ippoUpper: false, ippoExtraAtk: 0, ippoCd: {}, ippoStunPending: 0,
  };
}

function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = [];
  const i = mk('I', 'ippo', 1);
  const a = mk('A', 'temari', 2);
  a.hp = 7;
  engine.players.I = i;
  engine.players.A = a;
  engine.setRoundNumber(3);
  engine.setGameMode('ffa');
  return { i, a };
}

// ครอบ Math.random ให้คืนค่าที่กำหนด (โรลหลบหลีก: ค่า < pct/100 = หลบติด)
function withRandom(values, fn) {
  const real = Math.random;
  let n = 0;
  Math.random = () => (n < values.length ? values[n++] : 0.999);
  try { return fn(); } finally { Math.random = real; }
}
const DODGE = 0.0;   // หลบติดแน่นอน
const NO_DODGE = 0.99; // หลบไม่ติดแน่นอน

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('อิปโป: ค่าสถานะพื้นฐานตรงสเปค (เลือด 5 · เกราะเพดาน 4 · หลบ 20%)', () => {
  const c = CHARACTERS.CHAR_BY_ID.ippo;
  assert.ok(c);
  assert.equal(c.basic.cost, 3);
  assert.equal(c.secondary.cost, 4);
  assert.equal(c.ultimate.cost, 6);
  assert.equal(ippo.MAX_HP, 5);
  assert.equal(ippo.MAX_ARMOR, 4);
  assert.equal(ippo.BASE_DODGE, 20);
  assert.equal(ippo.DEMPSEY_MAX, 3);

  const { i } = setup();
  assert.equal(engine.maxHpOf(i), 5, 'engine ใช้เพดานเลือดของอิปโปจริง');
  assert.equal(engine.maxArmorOf(i), 4, 'engine ใช้เพดานเกราะ 4');
});

// ---------------------------------------------------------------- สกิลติดตัว ผู้ยืนหยัด
test('ผู้ยืนหยัด: หลบสำเร็จ -> เล่นวีดีโอ + อัตราหลบสะสม +10% (ตัน +20%) + แต้มสกิล +1', () => {
  const { i } = setup();
  i.skillPoints = 0;
  assert.equal(ippo.dodgeChance(i), 20, 'ฐาน 20%');

  withRandom([DODGE], () => ippo.tryDodge(engine, i, 'ทดสอบ'));
  assert.equal(i.ippoStandDodge, 10);
  assert.equal(ippo.dodgeChance(i), 30);
  assert.equal(i.skillPoints, 1, 'ฟื้นแต้มสกิล +1');
  assert.ok(queued.includes('ippoDodge'), 'เล่นวีดีโอหลบหลีก');

  withRandom([DODGE], () => ippo.tryDodge(engine, i, 'ทดสอบ'));
  assert.equal(i.ippoStandDodge, 20);
  withRandom([DODGE], () => ippo.tryDodge(engine, i, 'ทดสอบ'));
  assert.equal(i.ippoStandDodge, 20, 'ตันที่ +20%');
  assert.equal(ippo.dodgeChance(i), 40);
});

test('ผู้ยืนหยัด: โดนตีเข้าเต็มๆ -> อัตราหลบที่สะสมไว้หายหมด', () => {
  const { i, a } = setup();
  withRandom([DODGE], () => ippo.tryDodge(engine, i, 'ทดสอบ'));
  assert.equal(i.ippoStandDodge, 10);

  withRandom([NO_DODGE], () => engine.withEffectSource(a, () => engine.dealMixed(i, 1, true)));
  assert.equal(i.ippoStandDodge, 0, 'สะสมหายหมดเมื่อโดนตี');
  assert.equal(ippo.dodgeChance(i), 20, 'กลับไปที่ฐาน');
});

test('ผู้ยืนหยัด: ตีคนที่ติดสตั้น พลังโจมตีพื้นฐาน +1', () => {
  const { i, a } = setup();
  const base = computeAttackBase(engine, i, a).base;
  a.statuses.stun = 2;
  assert.equal(computeAttackBase(engine, i, a).base, base + ippo.STUN_ATK_BONUS);
});

test('หลบหลีก: ไม่มีโควตาต่อเทิร์น — หลบได้หลายครั้งในเทิร์นเดียว', () => {
  const { i } = setup();
  withRandom([DODGE, DODGE, DODGE], () => {
    assert.equal(ippo.tryDodge(engine, i, 'ครั้งที่ 1'), true);
    assert.equal(ippo.tryDodge(engine, i, 'ครั้งที่ 2'), true);
    assert.equal(ippo.tryDodge(engine, i, 'ครั้งที่ 3'), true);
  });
});

// ---------------------------------------------------------------- Guard Up
test('Guard Up: ฟื้นเกราะ 2 · ติดคูลดาวน์ 3 เทิร์น', () => {
  const { i } = setup();
  const r = engine.roundNumber;
  ippo.applyGuard(engine, i);
  assert.equal(i.armor, ippo.GUARD_ARMOR);
  assert.equal(ippo.canUseSkill(engine, i, 'basic'), false, 'ติดคูลดาวน์');

  // บล็อกครบ 3 เทิร์นเต็ม (รอบ r+1 ถึง r+3) แล้วกดได้อีกครั้งที่ r+4 — คอนเวนชันเดียวกับคูลดาวน์ของเอจิ
  for (let n = 1; n <= ippo.GUARD_COOLDOWN; n++) {
    engine.setRoundNumber(r + n);
    assert.equal(ippo.canUseSkill(engine, i, 'basic'), false, `รอบ ${r + n} ยังติดคูลดาวน์`);
    assert.equal(ippo.cooldownLeft(engine, i, 'basic'), ippo.GUARD_COOLDOWN - n + 1, 'ตัวเลขบนการ์ดนับถอยหลังถูกต้อง');
  }
  engine.setRoundNumber(r + ippo.GUARD_COOLDOWN + 1);
  assert.equal(ippo.cooldownLeft(engine, i, 'basic'), 0);
  assert.equal(ippo.canUseSkill(engine, i, 'basic'), true, 'ครบแล้วกดได้');
});

test('Guard Up: เกราะเต็มเพดาน 4 แล้วฟื้นเกินไม่ได้', () => {
  const { i } = setup();
  i.armor = 3;
  ippo.applyGuard(engine, i);
  assert.equal(i.armor, 4, 'ตันที่เพดาน 4');
});

// ---------------------------------------------------------------- Uper Cut
test('Uper Cut: เป้าหมายไม่มีเกราะ -> สตั้นเริ่มมีผลเทิร์นถัดไป', () => {
  const { i, a } = setup();
  ippo.applyUpper(engine, i);
  assert.equal(i.ippoUpper, true);

  const fx = ippo.resolveUpper(engine, i, a, 0); // เกราะก่อนโดนหมัด = 0
  assert.equal(fx.kind, 'stun');
  assert.equal(a.statuses.stun, undefined, 'ยังไม่สตั้นทันที');
  assert.equal(a.ippoStunPending, ippo.UPPER_STUN_TURNS);

  ippo.applyPendingStun(engine, a); // จำลองต้นเทิร์นถัดไป
  assert.equal(a.statuses.stun, ippo.UPPER_STUN_TURNS, 'สตั้นเริ่มมีผลเทิร์นถัดไป');
  assert.equal(i.ippoUpper, false, 'ใช้ไปแล้ว');
});

test('Uper Cut: เป้าหมายมีเกราะ -> ผุพัง 3 เทิร์น', () => {
  const { i, a } = setup();
  ippo.applyUpper(engine, i);
  const fx = ippo.resolveUpper(engine, i, a, 2); // มีเกราะ 2 ก่อนโดนหมัด
  assert.equal(fx.kind, 'decay');
  assert.equal(a.statuses.decay, ippo.UPPER_DECAY_TURNS);
  assert.equal(a.ippoStunPending, 0, 'ไม่สตั้น');
});

test('Uper Cut: ตัดสินจากเกราะ "ก่อน" โดนหมัด — หมัดพังเกราะหมดพอดีก็ยังนับว่ามีเกราะ', () => {
  const { i, a } = setup();
  ippo.applyUpper(engine, i);
  a.armor = 0; // หมัดพังเกราะหมดไปแล้ว แต่ก่อนหมัดมี 1
  const fx = ippo.resolveUpper(engine, i, a, 1);
  assert.equal(fx.kind, 'decay', 'ยังนับว่ามีเกราะ');
});

test('Uper Cut: กดแล้วติดคูลดาวน์ 3 เทิร์น', () => {
  const { i } = setup();
  const r2 = engine.roundNumber;
  ippo.applyUpper(engine, i);
  assert.equal(ippo.canUseSkill(engine, i, 'secondary'), false);
  engine.setRoundNumber(r2 + ippo.UPPER_COOLDOWN);
  assert.equal(ippo.canUseSkill(engine, i, 'secondary'), false, 'ยังไม่ครบ');
  engine.setRoundNumber(r2 + ippo.UPPER_COOLDOWN + 1);
  assert.equal(ippo.canUseSkill(engine, i, 'secondary'), true, 'ครบ 3 เทิร์นแล้วกดได้');
});

// ---------------------------------------------------------------- Dempsey roll
test('Dempsey roll: หลบสำเร็จสะสม Charge (ตัน 3) · ทุกหน่วยให้หลบ +10%', () => {
  const { i } = setup();
  ippo.applyDempsey(engine, i);
  assert.equal(ippo.dempseyActive(i), true);
  assert.equal(ippo.chargeOf(i), 0);
  assert.ok(queued.includes('ippoDempsey'), 'เล่นวีดีโอเข้าท่า');
  assert.equal(ippo.canUseSkill(engine, i, 'ultimate'), false, 'กดซ้ำระหว่างบัฟยังอยู่ไม่ได้');

  withRandom([DODGE, DODGE, DODGE, DODGE], () => {
    for (let n = 0; n < 4; n++) ippo.tryDodge(engine, i, 'ทดสอบ');
  });
  assert.equal(ippo.chargeOf(i), ippo.DEMPSEY_MAX, 'ตันที่ 3 หน่วย');
  // ฐาน 20 + ผู้ยืนหยัดตัน 20 + Charge 3x10 = 70
  assert.equal(ippo.dodgeChance(i), 20 + ippo.STAND_DODGE_MAX + ippo.DEMPSEY_MAX * ippo.DEMPSEY_DODGE_STEP);
});

test('Dempsey roll: โจมตีสำเร็จ -> เทหมดหน้าตัก บัฟหายทั้งก้อน + เล่นวีดีโอ', () => {
  const { i } = setup();
  ippo.applyDempsey(engine, i);
  withRandom([DODGE, DODGE], () => { ippo.tryDodge(engine, i); ippo.tryDodge(engine, i); });
  assert.equal(ippo.chargeOf(i), 2);
  queued = [];

  const extra = ippo.consumeCharge(engine, i);
  assert.equal(extra, 2, 'ได้โจมตีเพิ่ม 2 ครั้ง');
  assert.ok(queued.includes('ippoRoll'), 'เล่นวีดีโอ Dempsey roll');
  assert.equal(ippo.dempseyActive(i), false, 'บัฟหายทั้งก้อน');
  assert.equal(ippo.chargeOf(i), 0);
  assert.equal(ippo.consumeCharge(engine, i), 0, 'เทซ้ำไม่ได้');
});

test('Dempsey roll: มีบัฟแต่ยังไม่มี Charge -> ท่าคลายออกโดยไม่ได้ตีเพิ่ม', () => {
  const { i } = setup();
  ippo.applyDempsey(engine, i);
  assert.equal(ippo.consumeCharge(engine, i), 0);
  assert.equal(ippo.dempseyActive(i), false, 'บัฟหายอยู่ดี');
});

test('Dempsey roll: เปิดเฟสโจมตีเพิ่มทีละครั้งจนหมด', () => {
  const { i } = setup();
  i.ippoExtraAtk = 2;
  assert.equal(ippo.startExtraAttack(engine, i), true);
  assert.equal(i.ippoExtraAtk, 1);
  assert.equal(ippo.startExtraAttack(engine, i), true);
  assert.equal(i.ippoExtraAtk, 0);
  assert.equal(ippo.startExtraAttack(engine, i), false, 'หมดแล้วไม่เปิดเฟสอีก');
});

test('Dempsey roll: ไม่มีเป้าหมายให้ตี -> ล้างคิวโจมตีเพิ่มทิ้ง ไม่ค้าง', () => {
  const { i, a } = setup();
  a.alive = false;
  i.ippoExtraAtk = 3;
  assert.equal(ippo.startExtraAttack(engine, i), false);
  assert.equal(i.ippoExtraAtk, 0, 'ล้างทิ้ง ไม่ค้างข้ามเทิร์น');
});

// ---------------------------------------------------------------- คูลดาวน์
test('คูลดาวน์: ถูกล้างเมื่อเริ่มแมตช์ใหม่', () => {
  const { i } = setup();
  ippo.applyGuard(engine, i);
  ippo.applyUpper(engine, i);
  ippo.resetCombat(i);
  assert.equal(ippo.cooldownLeft(engine, i, 'basic'), 0);
  assert.equal(ippo.cooldownLeft(engine, i, 'secondary'), 0);
  assert.equal(i.ippoStandDodge, 0);
  assert.equal(i.ippoCharge, 0);
});
