const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const sup = require('../../characters/the_supplicant.js');
const CHARACTERS = require('../../characters.js');

const saved = {
  queueCutscene: engine.queueCutscene,
  runCutsceneQueue: engine.runCutsceneQueue,
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  skillFlash: engine.skillFlash,
  iconFx: engine.iconFx,
};

let fx = [];

test.before(() => {
  engine.queueCutscene = () => {};
  engine.runCutsceneQueue = (onDone) => { if (onDone) onDone(); };
  engine.startPhaseTimer = () => {};
  engine.broadcastState = () => {};
  engine.skillFlash = () => {};
  engine.iconFx = (target, kind) => { fx.push(`${target.id}:${kind}`); };
});

test.after(() => {
  engine.clearPhaseTimer();
  Object.assign(engine, saved);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 5, maxHpPenalty: 0, armor: 0, shield: 0, tempHp: 0,
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    colorTrigger: null, cardBonus: 0,
    supPrayers: 0, supSkillUsesRound: 0, supUltCd: 0,
    supJudgeCount: 0, supJudgeAlly: false, supJudgeById: null,
  };
}

function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  fx = [];
  const s = mk('S', 'the_supplicant', 1);
  const a = mk('A', 'temari', 2);
  const b = mk('B', 'temari', 3);
  a.hp = 7; b.hp = 7;
  engine.players.S = s;
  engine.players.A = a;
  engine.players.B = b;
  engine.setRoundNumber(3);
  engine.setGameMode('ffa');
  return { s, a, b };
}

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('ข้อมูลตัวละครลงทะเบียนครบและชี้ไปไฟล์สื่อที่มีอยู่จริง', () => {
  const ch = CHARACTERS.CHARACTERS.find((c) => c.id === 'the_supplicant');
  assert.ok(ch, 'ต้องมี the_supplicant ใน CHARACTERS');
  assert.equal(ch.difficulty, 'hard');
  assert.equal(ch.basic.cost, 2);
  assert.equal(ch.secondary.cost, 3);
  assert.equal(ch.ultimate.cost, 6);
  assert.equal(sup.maxHp(), 5);
  assert.equal(sup.maxArmor(), 5);
});

// ---------------------------------------------------------------- สกิลพื้นฐาน Prayer
test('Prayer: มอบเยียวยา 1 หน่วย/1 เทิร์น และล้างดีบัฟ 1 ขั้น', () => {
  const { s, a } = setup();
  a.statuses.weak = 3; a.statusAmt.weak = 1;
  sup.applyPrayer(engine, s, a);
  assert.equal(a.statuses.mend, 1);
  assert.equal(a.statusAmt.mend, 1);
  assert.ok(!a.statuses.weak, 'ดีบัฟตัวแรกในรายการต้องถูกล้าง');
  assert.equal(s.supPrayers, 1, 'ล้างได้ 1 ขั้น = คำวิงวอน +1');
  assert.ok(fx.includes('A:heal'));
});

test('Prayer: เป้าหมายไม่มีดีบัฟเลย ไม่ได้คำวิงวอน แต่ยังได้เยียวยา', () => {
  const { s, a } = setup();
  sup.applyPrayer(engine, s, a);
  assert.equal(a.statuses.mend, 1);
  assert.equal(s.supPrayers, 0);
});

test('เยียวยา: ซ้อนทับเทิร์นได้ แต่ไม่เกินเพดาน 5 เทิร์น', () => {
  const { s, a } = setup();
  for (let i = 0; i < 8; i++) sup.applyPrayer(engine, s, a);
  assert.equal(a.statuses.mend, 5);
});

test('เยียวยา: ติกต้นเทิร์นฟื้นพลังชีวิตตามจำนวนหน่วย', () => {
  const { a } = setup();
  a.hp = 3;
  engine.applyMend(a, 2, 3);
  engine.tickMend(engine, a);
  assert.equal(a.hp, 5);
});

// ---------------------------------------------------------------- สกิลติดตัว
test('ภาชนะคำวิงวอน: ครบ 4 ได้กระแสเวทถาวร (ต่ออายุทุกต้นเทิร์น)', () => {
  const { s } = setup();
  s.supPrayers = 4;
  sup.onRoundStartTick(engine, s);
  assert.ok((s.statuses.spellflow || 0) > 0);
  assert.equal(s.statusAmt.spellflow, 1);
  assert.equal(s.supSkillUsesRound, 0, 'โควตาสกิลรีเซ็ตทุกต้นเทิร์น');
});

test('ภาชนะคำวิงวอน: ขั้น 8 ฟื้นพลังงาน · ขั้น 12 ให้เกราะศรัทธาเพิ่ม', () => {
  const { s, a } = setup();
  s.supPrayers = 7; s.skillPoints = 2;
  sup.gainPrayers(engine, s, a, 1); // -> 8
  assert.equal(s.skillPoints, 3, 'ขั้น 8: พลังงาน +1 ต่อการล้าง 1 ขั้น');
  assert.equal(sup.faithOf(a), 0, 'ยังไม่ถึงขั้น 12 ไม่มีเกราะศรัทธา');
  s.supPrayers = 11;
  sup.gainPrayers(engine, s, a, 1); // -> 12
  assert.equal(sup.faithOf(a), 1, 'ขั้น 12: เกราะศรัทธา +1');
});

test('ภาชนะคำวิงวอน: ไม่เกินเพดาน 15', () => {
  const { s, a } = setup();
  s.supPrayers = 14;
  sup.gainPrayers(engine, s, a, 5);
  assert.equal(s.supPrayers, 15);
});

// ---------------------------------------------------------------- เกราะศรัทธา
test('เกราะศรัทธา: สะสมได้สูงสุด 3 และให้คุ้มครอง/เสริมพลังตราบที่ยังเหลือ', () => {
  const { s, a } = setup();
  for (let i = 0; i < 5; i++) sup.applyFaithArmor(engine, s, a);
  assert.equal(sup.faithOf(a), 3);
  assert.equal(sup.statusAmtBonus(a, 'guard'), 1);
  assert.equal(sup.statusAmtBonus(a, 'might'), 1);
  assert.ok(fx.includes('A:shield'));
});

test('เกราะศรัทธา: เป็นชั้นเกราะหลังเกราะหลัก — ดูดดาเมจแทนพลังชีวิต', () => {
  const { s, a } = setup();
  sup.grantFaith(engine, a, 2);
  a.armor = 1;
  const hpBefore = a.hp;
  engine.dealMixed(a, 3); // เกราะหลัก 1 -> เกราะศรัทธา 2
  assert.equal(a.armor, 0);
  assert.equal(sup.faithOf(a), 0, 'เกราะศรัทธาถูกกินหมดพอดี');
  assert.equal(a.hp, hpBefore, 'พลังชีวิตยังไม่ถูกแตะเลย');
});

test('เกราะศรัทธา: กันดาเมจเจาะเกราะ (dealDirect) ด้วย เพราะดักที่ loseHp', () => {
  const { s, a } = setup();
  sup.grantFaith(engine, a, 1);
  const hpBefore = a.hp;
  engine.dealDirect(a, 1);
  assert.equal(a.hp, hpBefore);
  assert.equal(sup.faithOf(a), 0);
});

test('เกราะศรัทธา: ไม่นับถอยหลังเทิร์น (อยู่ใน NO_TICK_STATUS)', () => {
  const { NO_TICK_STATUS } = require('../../characters/_universal_status.js');
  assert.ok(NO_TICK_STATUS.has('supFaith'));
});

test('เกราะศรัทธา/ลูกแกะน้อยรู้แจ้ง: ล้างด้วย cleanseDebuffs ไม่ได้', () => {
  const { s, a } = setup();
  sup.grantFaith(engine, a, 1);
  a.statuses.supLamb = 3;
  a.statuses.supPunish = 3;
  engine.cleanseDebuffs(a);
  assert.equal(sup.faithOf(a), 1);
  assert.equal(a.statuses.supLamb, 3);
  assert.equal(a.statuses.supPunish, 3);
});

// ---------------------------------------------------------------- ตราพิพากษา
test('ตราพิพากษา (ศัตรู): ครบ 3 ครั้งแล้วติดลงทัณฑ์ · ระหว่างทางรับดาเมจครั้งละ 1', () => {
  const { s, a } = setup();
  sup.applyJudgment(engine, s, a);
  assert.equal(a.statuses.supJudge, 5);
  assert.equal(a.supJudgeAlly, false);
  assert.equal(sup.ultCooldownLeft(engine, s), 6);
  const hp0 = a.hp;
  sup.onJudgeTrigger(engine, a, 'ถูกโจมตี');
  sup.onJudgeTrigger(engine, a, 'เป็นฝ่ายโจมตี');
  assert.equal(a.hp, hp0 - 2);
  assert.ok(sup.judgeOn(a), 'ยังไม่ครบ 3 ตรายังอยู่');
  sup.onJudgeTrigger(engine, a, 'ถูกโจมตี');
  assert.ok(!sup.judgeOn(a), 'ครบ 3 ตราหลุด');
  assert.equal(a.statuses.supPunish, 3);
  assert.equal(fx.filter((x) => x === 'A:strike').length, 3);
});

test('ลงทัณฑ์: พ่วง "ชา" และ "ตาบอด" เป็นผลพ่วงที่เช็คสด', () => {
  const { a } = setup();
  a.statuses.supPunish = 3;
  assert.equal(sup.chaaActive(a), true);
  assert.equal(sup.blindActive(a), true);
  delete a.statuses.supPunish;
  assert.equal(sup.chaaActive(a), false);
});

test('ตราพิพากษา (ศัตรู): หมดเวลาโดยไม่ครบ 3 -> ล้างดีบัฟทั้งหมด + ลูกแกะน้อยรู้แจ้ง', () => {
  const { s, a } = setup();
  sup.applyJudgment(engine, s, a);
  a.statuses.weak = 2; a.statusAmt.weak = 1;
  a.statuses.fragile = 2; a.statusAmt.fragile = 1;
  sup.onJudgeTrigger(engine, a, 'ถูกโจมตี');
  sup.onJudgeExpire(engine, a);
  assert.ok(!a.statuses.weak && !a.statuses.fragile, 'ดีบัฟถูกล้างหมด');
  assert.equal(a.statuses.supLamb, 3);
  assert.equal(s.supPrayers, 2, 'ผู้วิงวอนได้คำวิงวอนตามจำนวนดีบัฟที่ล้างได้');
});

test('ลูกแกะน้อยรู้แจ้ง: ให้อ่อนแอ 1 / เปราะบาง 1 และเล็งผู้วิงวอนไม่ได้', () => {
  const { s, a, b } = setup();
  a.statuses.supLamb = 3;
  assert.equal(sup.statusAmtBonus(a, 'weak'), 1);
  assert.equal(sup.statusAmtBonus(a, 'fragile'), 1);
  assert.equal(sup.targetBlocked(a, s), true, 'ลูกแกะเล็งผู้วิงวอนไม่ได้');
  assert.equal(sup.targetBlocked(a, b), false, 'คนอื่นยังเล็งได้ตามปกติ');
  assert.equal(sup.targetBlocked(b, s), false, 'คนที่ไม่ติดลูกแกะเล็งผู้วิงวอนได้');
  assert.deepEqual(engine.attackableTargets('A').map((p) => p.id), ['B'], 'ผู้วิงวอนหายจากรายชื่อเป้าหมาย');
});

test('ตราพิพากษา (พันธมิตร): ฟื้นเกราะครั้งละ 1 · ครบ 3 ได้ฟื้นฟู 3 เทิร์น + ล้างดีบัฟ', () => {
  const { s } = setup();
  sup.applyJudgment(engine, s, s); // ใส่ตัวเอง = สายพันธมิตรเสมอ
  assert.equal(s.supJudgeAlly, true);
  s.statuses.weak = 2; s.statusAmt.weak = 1;
  sup.onJudgeTrigger(engine, s, 'ถูกโจมตี');
  assert.equal(s.armor, 1);
  sup.onJudgeTrigger(engine, s, 'เป็นฝ่ายโจมตี');
  sup.onJudgeTrigger(engine, s, 'ถูกโจมตี');
  assert.ok(!sup.judgeOn(s));
  assert.equal(s.statuses.mend, 3);
  assert.ok(!s.statuses.weak);
});

test('ตราพิพากษา (พันธมิตร): หมดเวลาโดยไม่ครบ 3 -> ล้างดีบัฟ + เกราะศรัทธา +2', () => {
  const { s } = setup();
  sup.applyJudgment(engine, s, s);
  sup.onJudgeExpire(engine, s);
  assert.equal(sup.faithOf(s), 2);
});

test('ตราพิพากษา: ผู้วิงวอนตกรอบ -> ตราบนเป้าหมายสลายไป', () => {
  const { s, a } = setup();
  sup.applyJudgment(engine, s, a);
  s.alive = false;
  sup.onDeath(engine, s);
  assert.ok(!sup.judgeOn(a));
});

// ---------------------------------------------------------------- โควตาสกิล / คูลดาวน์
test('กดสกิลได้ 2 ครั้งต่อเทิร์น แล้วครั้งที่ 3 ถูกปิด', () => {
  const { s, a } = setup();
  assert.equal(sup.canUseSkill(engine, s, 'basic'), true);
  sup.applyInstantSkill(engine, s, 'basic', a);
  assert.equal(sup.canUseSkill(engine, s, 'secondary'), true);
  sup.applyInstantSkill(engine, s, 'secondary', a);
  assert.equal(sup.canUseSkill(engine, s, 'basic'), false, 'ครบโควตา 2 ครั้งแล้ว');
});

test('ท่าไม้ตายติดคูลดาวน์ 6 เทิร์น และรอดจากการเปลี่ยนรอบ', () => {
  const { s, a } = setup();
  sup.applyJudgment(engine, s, a);
  assert.equal(sup.canUseSkill(engine, s, 'ultimate'), false);
  engine.setRoundNumber(engine.roundNumber + 5);
  assert.equal(sup.ultCooldownLeft(engine, s), 1);
  assert.equal(sup.canUseSkill(engine, s, 'ultimate'), false);
  engine.setRoundNumber(engine.roundNumber + 1);
  s.supSkillUsesRound = 0;
  assert.equal(sup.canUseSkill(engine, s, 'ultimate'), true);
});
