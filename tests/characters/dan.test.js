const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const dan = require('../../characters/dan.js');
const CHARACTERS = require('../../characters.js');

const cutsceneFns = {
  triggerCutscene: engine.triggerCutscene,
  queueCutscene: engine.queueCutscene,
  runCutsceneQueue: engine.runCutsceneQueue,
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  endTurn: engine.endTurn,
};

let queued = [];
let onlyFor = {};

test.before(() => {
  engine.triggerCutscene = () => {};
  engine.queueCutscene = (p, key, only) => { queued.push(key); onlyFor[key] = only || null; };
  engine.runCutsceneQueue = (onDone) => { if (onDone) onDone(); };
  engine.startPhaseTimer = () => {};
  engine.endTurn = () => {};
  engine.broadcastState = () => {};
});

test.after(() => {
  engine.clearPhaseTimer();
  Object.assign(engine, cutsceneFns);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 7, armor: 0, shield: 0, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    danChaseTargetId: null, danChaseBy: null, danDiscipleBy: null, danLoseStreak: 0, danChaseHits: 0,
  };
}

// สนามสะอาด: ดัน 1 คน + คู่ต่อสู้ 2 คน (เกราะ 0 ทุกคน เพื่อให้ดาเมจเข้าเลือดตรงๆ อ่านผลง่าย)
function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = [];
  onlyFor = {};
  const d = mk('D', 'dan', 1);
  const a = mk('A', 'temari', 2);
  const b = mk('B', 'kuwagata', 3);
  engine.players.D = d;
  engine.players.A = a;
  engine.players.B = b;
  engine.setRoundNumber(3);
  return { d, a, b };
}

// บังคับให้ bustedOf(p) คืน true — คิดจากแต้มไพ่จริง (calculateScore > 21) ไม่ใช่ธง p.busted
function bust(p) { p.cards = [{ value: 10 }, { value: 10 }, { value: 10 }]; p.busted = true; }

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('ดัน: อยู่ใน roster กลุ่ม "เอาฮา" พร้อมสกิลครบทั้ง 4 ช่อง และค่าใช้ตรงสเปค', () => {
  const c = CHARACTERS.CHAR_BY_ID.dan;
  assert.ok(c, 'ต้องมีตัวละคร dan ใน characters.js');
  assert.equal(c.difficulty, 'fun');
  assert.equal(c.basic.cost, 2);
  assert.equal(c.secondary.cost, 3);
  assert.equal(c.ultimate.cost, 6);
  assert.equal(c.ultimate2.cost, 2);
  assert.equal(c.ultimate2.name, 'อย่าให้ฉันต้องเฆี่ยนตี');
  assert.ok(c.passive && c.passive2, 'ต้องมีสกิลติดตัวครบ 2 อัน');
});

// ---------------------------------------------------------------- สกิลติดตัว 2 อาการบาดเจ็บ
test('อาการบาดเจ็บ: พลังโจมตีปกติฐานของดันเป็น 0 — แต่บัฟยังบวกทับได้', () => {
  const { d, a } = setup();
  assert.equal(computeAttackBase(engine, d, a).base, 0);
  d.statuses.empower = 2; // เสริมพลัง (บัฟกลาง)
  assert.equal(computeAttackBase(engine, d, a).base, 1, 'บัฟบวกทับค่าฐาน 0 ได้ตามปกติ');
  assert.equal(computeAttackBase(engine, a, d).base, 1, 'ตัวละครอื่นยังใช้ฐาน 1 ตามเดิม');
});

// ---------------------------------------------------------------- สกิลพื้นฐาน ไม้ค้ำ
test('ไม้ค้ำ: ฟื้นเลือด 1 หน่วยต่อเทิร์น 3 เทิร์น และกดซ้ำระหว่างมีผลไม่ได้', () => {
  const { d } = setup();
  d.hp = 3;
  dan.applyCrutch(engine, d);
  assert.equal(d.statuses.danCrutch, dan.CRUTCH_TURNS);
  assert.equal(dan.canUseSkill(engine, d, 'basic'), false, 'ระหว่างมีผลอยู่ กดซ้ำไม่ได้');

  dan.onRoundStartTick(engine, d);
  assert.equal(d.hp, 4, 'ฟื้น 1 หน่วยตอนเริ่มเทิร์น');
  dan.onRoundStartTick(engine, d);
  assert.equal(d.hp, 5);

  delete d.statuses.danCrutch;
  assert.equal(dan.canUseSkill(engine, d, 'basic'), true, 'หมดเวลาแล้วกดใหม่ได้');
  dan.onRoundStartTick(engine, d);
  assert.equal(d.hp, 5, 'สถานะหมดแล้วไม่ฟื้นต่อ');
});

// ---------------------------------------------------------------- สกิลรอง นายทำให้ฉันผิดหวัง
test('ศิษย์: ได้พลังโจมตี +1 และดันมีศิษย์ได้ทีละคนเดียว', () => {
  const { d, a, b } = setup();
  dan.applyDisciple(engine, d, a);
  assert.equal(a.statuses.danDisciple, dan.DISCIPLE_TURNS);
  assert.equal(a.danDiscipleBy, 'D');
  assert.equal(computeAttackBase(engine, a, b).base, 1 + dan.DISCIPLE_ATK_BONUS);

  dan.applyDisciple(engine, d, b);
  assert.equal(a.statuses.danDisciple, undefined, 'ศิษย์คนเก่าถูกปลดทันที');
  assert.equal(a.danDiscipleBy, null);
  assert.equal(b.statuses.danDisciple, dan.DISCIPLE_TURNS);
});

test('ศิษย์: ตีดัน -> เล่นวีดีโอแล้วโดนสวนคืน 3 หน่วย', () => {
  const { d, a } = setup();
  dan.applyDisciple(engine, d, a);
  const fx = dan.onAttackedNormally(engine, a, d);
  assert.ok(fx, 'ต้องสวนกลับ');
  assert.equal(fx.dmg, dan.DISCIPLE_COUNTER_DMG);
  assert.equal(a.hp, 7 - dan.DISCIPLE_COUNTER_DMG);
  assert.deepEqual(queued, ['danDisciple'], 'คิววีดีโอ dan_skill2.mp4');
  assert.equal(a.statuses.danDisciple, undefined, 'สวนไปแล้วสถานะ "ศิษย์" หลุดทันที');
  assert.equal(a.danDiscipleBy, null);
  assert.equal(dan.onAttackedNormally(engine, a, d), null, 'หมัดถัดไปไม่โดนสวนอีก');
  assert.equal(a.hp, 7 - dan.DISCIPLE_COUNTER_DMG, 'ไม่มีดาเมจสวนซ้ำ');
});

test('ศิษย์: คนที่ไม่ใช่ศิษย์ตีดัน ไม่มีการสวนกลับ', () => {
  const { d, a, b } = setup();
  dan.applyDisciple(engine, d, a);
  assert.equal(dan.onAttackedNormally(engine, b, d), null);
  assert.equal(b.hp, 7);
  assert.deepEqual(queued, []);
});

test('ศิษย์: ความเสียหายที่ดันได้รับจากศิษย์ของตัวเองลดลง 2 หน่วย', () => {
  const { d, a, b } = setup();
  dan.applyDisciple(engine, d, a);

  engine.withEffectSource(a, () => { engine.dealMixed(d, 3, true); });
  assert.equal(d.hp, 7 - (3 - dan.DISCIPLE_DMG_REDUCE), 'ดาเมจจากศิษย์ถูกลด 2');

  engine.withEffectSource(b, () => { engine.dealMixed(d, 3, true); });
  assert.equal(d.hp, 7 - 1 - 3, 'ดาเมจจากคนอื่นไม่ถูกลด');
});

// ---------------------------------------------------------------- ท่าไม้ตาย 1 ฉันบอกว่าอย่าหนี
test('จงหลบแต่อย่าหนี: เป้าหมายแพ้แต้ม -1 หน่วย · ไพ่แตก -2 หน่วย พร้อมวีดีโอคนละคลิป', () => {
  const { d, a } = setup();
  dan.applyChase(engine, d, a);
  assert.equal(a.statuses.danChase, dan.CHASE_TURNS);
  assert.equal(d.danChaseTargetId, 'A');

  a.isLoser = true;
  dan.onAfterResolve(engine);
  assert.equal(a.hp, 7 - dan.CHASE_LOSE_DMG);
  assert.equal(a.danLoseStreak, 1);
  assert.ok(queued.includes('danChaseLose'), 'แพ้แต้ม -> dan_skill3_hit1.mp4');

  queued = [];
  a.isLoser = false;
  bust(a);
  dan.onAfterResolve(engine);
  assert.equal(a.hp, 7 - dan.CHASE_LOSE_DMG - dan.CHASE_BUST_DMG - dan.BUST_EXTRA_DMG,
    'ไพ่แตกโดนทั้งรถชน 2 และครูฝึกสุดเหี้ยมอีก 1');
  assert.ok(queued.includes('danChaseBust'), 'ไพ่แตก -> dan_skill3_hit2.mp4');
  assert.equal(a.danLoseStreak, 0, 'ไพ่แตกไม่นับเป็นสตรีคแพ้แต้ม');
});

test('จงหลบแต่อย่าหนี: ต้องตีดันครบ 2 ครั้งถึงจะสลัดหลุด + คืนแต้มสกิลให้ดัน 3', () => {
  const { d, a } = setup();
  dan.applyChase(engine, d, a);
  d.skillPoints = 2;

  assert.equal(dan.onChasedAttacked(engine, a, d), false, 'ครั้งแรกยังไม่หลุด');
  assert.equal(a.statuses.danChase, dan.CHASE_TURNS);
  assert.equal(a.danChaseHits, 1);
  assert.equal(d.skillPoints, 2, 'ยังไม่คืนแต้ม');

  assert.equal(dan.onChasedAttacked(engine, a, d), true, 'ครั้งที่ 2 หลุด');
  assert.equal(a.statuses.danChase, undefined);
  assert.equal(a.danChaseBy, null);
  assert.equal(d.danChaseTargetId, null);
  assert.equal(d.skillPoints, 2 + dan.CHASE_EARLY_REFUND, 'จบก่อนกำหนด -> คืนแต้มสกิล 3');
});

test('จงหลบแต่อย่าหนี: ตีคนอื่นไม่นับเป็นการสู้กลับ', () => {
  const { d, a, b } = setup();
  dan.applyChase(engine, d, a);
  assert.equal(dan.onChasedAttacked(engine, a, b), false);
  assert.equal(dan.onChasedAttacked(engine, a, b), false);
  assert.equal(a.statuses.danChase, dan.CHASE_TURNS, 'ยังถูกไล่ตามอยู่');
  assert.equal(a.danChaseHits, 0);
});

test('จงหลบแต่อย่าหนี: หมดเวลาครบ 5 เทิร์นเอง -> ไม่คืนแต้มสกิล', () => {
  const { d, a } = setup();
  dan.applyChase(engine, d, a);
  d.skillPoints = 2;
  delete a.statuses.danChase;
  dan.onStatusExpire(engine, a, 'danChase');
  assert.equal(d.skillPoints, 2, 'อยู่ครบเทิร์น ไม่ใช่การจบก่อนกำหนด');
  assert.equal(d.danChaseTargetId, null);
});

test('จงหลบแต่อย่าหนี: เป้าหมายตกรอบ -> หยุดทำงาน และคืนแต้มให้ดันแค่ครั้งเดียว', () => {
  const { d, a } = setup();
  dan.applyChase(engine, d, a);
  d.skillPoints = 0;
  a.hp = 0;
  engine.instantDeath(a);
  assert.equal(a.alive, false);
  assert.equal(a.statuses.danChase, undefined);
  assert.equal(d.danChaseTargetId, null);
  assert.equal(d.skillPoints, dan.CHASE_EARLY_REFUND, 'คืน 3 หน่วย ไม่ซ้ำซ้อน');
  // เรียก stopChase ซ้ำต้องไม่คืนอีก (จุดที่เรียกตามหลัง instantDeath ในโค้ดจริง)
  dan.onDeath(engine, a);
  assert.equal(d.skillPoints, dan.CHASE_EARLY_REFUND);
});

test('จงหลบแต่อย่าหนี: ขับรถตามได้ทีละคน — เปลี่ยนเป้าแล้วคนเก่าหลุด', () => {
  const { d, a, b } = setup();
  dan.applyChase(engine, d, a);
  dan.applyChase(engine, d, b);
  assert.equal(a.statuses.danChase, undefined);
  assert.equal(b.statuses.danChase, dan.CHASE_TURNS);
  assert.equal(d.danChaseTargetId, 'B');
});

test('จงหลบแต่อย่าหนี: ดันเปลี่ยนเป้าหมายเอง -> ไม่คืนแต้ม (กันกดวนรีดแต้ม)', () => {
  const { d, a, b } = setup();
  dan.applyChase(engine, d, a);
  d.skillPoints = 1;
  dan.applyChase(engine, d, b);
  assert.equal(d.skillPoints, 1);
});

// ---------------------------------------------------------------- สกิลติดตัว 1 ครูฝึกสุดเหี้ยม
test('ครูฝึกสุดเหี้ยม: ทุกคนที่ไพ่แตกโดนเพิ่ม 1 หน่วย ยกเว้นดันเอง — วีดีโอขึ้นครั้งเดียวต่อเทิร์น', () => {
  const { d, a, b } = setup();
  bust(a); bust(b); bust(d);
  dan.onAfterResolve(engine);
  assert.equal(a.hp, 7 - dan.BUST_EXTRA_DMG);
  assert.equal(b.hp, 7 - dan.BUST_EXTRA_DMG);
  assert.equal(d.hp, 7, 'ดันไม่โดนสกิลติดตัวของตัวเอง');
  assert.deepEqual(queued.filter((k) => k === 'danScold'), ['danScold'], 'คลิปด่าขึ้นครั้งเดียวถึงจะแตกหลายคน');
  assert.deepEqual(onlyFor.danScold.slice().sort(), ['A', 'B'], 'เล่นให้เฉพาะคนที่ไพ่แตกเห็น ไม่ใช่ทุกคน');
});

test('ครูฝึกสุดเหี้ยม: ดันตกรอบ/ถูกผนึกสกิลติดตัว -> ไม่มีผลบวกดาเมจไพ่แตก', () => {
  const { d, a } = setup();
  bust(a);
  d.alive = false;
  dan.onAfterResolve(engine);
  assert.equal(a.hp, 7);
  assert.deepEqual(queued, []);
});

// ---------------------------------------------------------------- ท่าไม้ตาย 2 อย่าให้ฉันต้องเฆี่ยนตี
test('อย่าให้ฉันต้องเฆี่ยนตี: ปลดล็อกเมื่อเป้าหมายแพ้แต้มติดกัน 2 ครั้ง (ไม่นับไพ่แตก)', () => {
  const { d, a } = setup();
  const ch = CHARACTERS.CHAR_BY_ID.dan;
  dan.applyChase(engine, d, a);
  assert.equal(dan.whipReady(engine, d), false);
  assert.equal(dan.dynamicSkillFor(engine, d, ch, 'ultimate').name, ch.ultimate.name);

  a.isLoser = true;
  dan.onAfterResolve(engine);
  assert.equal(a.danLoseStreak, 1);
  assert.equal(dan.whipReady(engine, d), false, 'แพ้ครั้งเดียวยังไม่พอ');

  dan.onAfterResolve(engine);
  assert.equal(a.danLoseStreak, 2);
  assert.equal(dan.whipReady(engine, d), true);
  assert.equal(dan.dynamicSkillFor(engine, d, ch, 'ultimate').name, 'อย่าให้ฉันต้องเฆี่ยนตี');

  // เล็งเป้าเดิมอัตโนมัติ ไม่ต้องส่ง targets มา
  assert.equal(dan.prepareTarget(engine, d, 'ultimate', []), a);

  const hpBefore = a.hp;
  dan.applyWhip(engine, d, a);
  assert.equal(a.hp, hpBefore - dan.WHIP_DMG);
});

test('อย่าให้ฉันต้องเฆี่ยนตี: เป้าหมายหลุดสถานะไปแล้ว -> ไม่ลงดาเมจซ้ำ', () => {
  const { d, a } = setup();
  dan.applyChase(engine, d, a);
  dan.onChasedAttacked(engine, a, d);
  dan.onChasedAttacked(engine, a, d); // ตีดันครบ 2 ครั้ง = ปลดสถานะทิ้ง
  const hpBefore = a.hp;
  dan.applyWhip(engine, d, a);
  assert.equal(a.hp, hpBefore);
});

// ---------------------------------------------------------------- เก็บกวาดสถานะ
test('สถานะหมดอายุ: onStatusExpire ล้างธงทั้งฝั่งดันและฝั่งเป้าหมาย', () => {
  const { d, a } = setup();
  dan.applyChase(engine, d, a);
  dan.applyDisciple(engine, d, a);
  delete a.statuses.danChase;
  dan.onStatusExpire(engine, a, 'danChase');
  assert.equal(a.danChaseBy, null);
  assert.equal(d.danChaseTargetId, null);
  delete a.statuses.danDisciple;
  dan.onStatusExpire(engine, a, 'danDisciple');
  assert.equal(a.danDiscipleBy, null);
});

test('ดันตกรอบ: ทั้ง "จงหลบแต่อย่าหนี" และ "ศิษย์" ถูกปลดออกจากทุกคน', () => {
  const { d, a, b } = setup();
  dan.applyChase(engine, d, a);
  dan.applyDisciple(engine, d, b);
  d.hp = 0;
  engine.instantDeath(d);
  assert.equal(a.statuses.danChase, undefined);
  assert.equal(b.statuses.danDisciple, undefined);
  assert.equal(b.danDiscipleBy, null);
});
