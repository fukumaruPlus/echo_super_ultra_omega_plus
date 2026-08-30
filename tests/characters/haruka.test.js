const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const haruka = require('../../characters/haruka.js');
const universal = require('../../characters/_universal_status.js');

const cutsceneFns = {
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
  Object.assign(engine, cutsceneFns);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 7, armor: 3, shield: 0, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    harukaBasicUses: 0, harukaBleedProcs: 0, harukaStunPending: 0,
  };
}

// สนามสะอาด: ฮารุกะ 1 คน + คู่ต่อสู้ 1 คน
function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = [];
  const h = mk('H', 'haruka', 1);
  const a = mk('A', 'temari', 2);
  engine.players.H = h;
  engine.players.A = a;
  engine.setRoundNumber(3);
  return { h, a };
}

// ครอบ Math.random ให้คืนค่าที่กำหนดตามลำดับ
function withRandom(values, fn) {
  const real = Math.random;
  let i = 0;
  Math.random = () => (i < values.length ? values[i++] : 0.999);
  try { return fn(); } finally { Math.random = real; }
}

// ---------------------------------------------------------------- สถานะ "เลือดไหล" (Universal)
test('เลือดไหล: สะสมได้ไม่เกินเพดาน และ "ต้านสถานะผิดปกติ" กันไว้ได้ทั้งก้อน', () => {
  const { a } = setup();
  assert.equal(universal.applyBleed(a, 2), 2);
  assert.equal(a.statuses.hbleed, 2);
  assert.equal(universal.applyBleed(a, 10), universal.HBLEED_MAX - 2);
  assert.equal(a.statuses.hbleed, universal.HBLEED_MAX);

  const { a: b } = setup();
  b.statuses.resist = 2;
  assert.equal(universal.applyBleed(b, 3), 0);
  assert.equal(b.statuses.hbleed, undefined);
});

test('เลือดไหล: ติกต้นเทิร์นทำดาเมจ 1 หน่วย (ลดเกราะก่อน) แล้วลดจำนวนลง 1', () => {
  const { a } = setup();
  a.armor = 1;
  universal.applyBleed(a, 3);
  universal.tickBleed(engine, a);
  assert.equal(a.armor, 0, 'ลดเกราะก่อน');
  assert.equal(a.hp, 7);
  assert.equal(a.statuses.hbleed, 2);
  universal.tickBleed(engine, a);
  assert.equal(a.hp, 6, 'ไม่มีเกราะแล้วเข้าเลือดจริง');
  assert.equal(a.statuses.hbleed, 1);
});

test('เลือดไหล: การฟื้นพลังชีวิตเหลือครึ่งเดียว แต่การฟื้น 1 หน่วยไม่ถูกลด', () => {
  const { a } = setup();
  a.hp = 1;
  universal.applyBleed(a, 2);
  assert.equal(engine.healHp(a, 4), 2, 'ฟื้น 4 -> 2');
  a.hp = 1;
  assert.equal(engine.healHp(a, 3), 1, 'ฟื้น 3 -> 1 (ปัดลง)');
  a.hp = 1;
  assert.equal(engine.healHp(a, 1), 1, 'ฟื้น 1 หน่วยไม่ถูกลด');
  delete a.statuses.hbleed;
  a.hp = 1;
  assert.equal(engine.healHp(a, 4), 4, 'ไม่มีเลือดไหลแล้ว ฟื้นเต็ม');
});

test('เลือดไหล: อยู่ในรายการที่ "ต้านสถานะผิดปกติ" ล้างได้ และไม่ถูกลดเทิร์นซ้ำในลูป endTurn', () => {
  assert.ok(universal.BASIC_DEBUFF_CLEAR.includes('hbleed'));
  assert.ok(universal.NO_TICK_STATUS.has('hbleed'));
  const { a } = setup();
  universal.applyBleed(a, 4);
  universal.cleanseDebuffs(a);
  assert.equal(a.statuses.hbleed, undefined);
});

// ---------------------------------------------------------------- สกิลติดตัว อมาซอน
test('อมาซอน: เลือดไหลไม่ทำร้ายฮารุกะ กลับฟื้นพลังชีวิตแทน', () => {
  const { h } = setup();
  h.hp = 3;
  universal.applyBleed(h, 2);
  universal.tickBleed(engine, h);
  assert.equal(h.hp, 4, 'ฟื้นแทนการเสียเลือด');
  assert.equal(h.armor, 3, 'เกราะไม่ถูกแตะ');
  assert.equal(h.statuses.hbleed, 1);
});

test('อมาซอน: การฟื้นพลังชีวิตของฮารุกะไม่ถูกเลือดไหลลดครึ่ง', () => {
  const { h } = setup();
  h.hp = 1;
  universal.applyBleed(h, 3);
  assert.equal(engine.healHp(h, 4), 4);
});

test('อมาซอน: ไม่มีเกราะแล้วโดนดาเมจ -> เลือดไหลตัวเอง +1 สูงสุด 3 ครั้ง/เทิร์น', () => {
  const { h } = setup();
  h.armor = 0;
  for (let i = 0; i < 5; i++) assert.equal(haruka.onDamaged(engine, h), i < 3);
  assert.equal(h.statuses.hbleed, 3);
  assert.equal(h.harukaBleedProcs, 3);
  haruka.onRoundStartTick(engine, h);
  assert.equal(h.harukaBleedProcs, 0, 'โควตาเต็มใหม่ทุกเทิร์น');
});

test('อมาซอน: ยังมีเกราะ/โล่อยู่ = ไม่ติดเลือดไหล', () => {
  const { h } = setup();
  h.armor = 1;
  assert.equal(haruka.onDamaged(engine, h), false);
  h.armor = 0; h.shield = 1;
  assert.equal(haruka.onDamaged(engine, h), false);
  assert.equal(h.statuses.hbleed, undefined);
});

test('อมาซอน: ท่อดาเมจจริง (dealMixed) ทำให้ฮารุกะเลือดไหลเองเมื่อเกราะหมด', () => {
  const { h } = setup();
  h.armor = 0;
  engine.dealMixed(h, 1);
  assert.equal(h.hp, 6);
  assert.equal(h.statuses.hbleed, 1);
});

test('อมาซอน: สวนกลับทำงานเฉพาะระหว่างโอเมก้า และตั้งสตั้นให้เทิร์นถัดไป', () => {
  const { h, a } = setup();
  // ยังไม่มีโอเมก้า -> ไม่สวนแม้โรลติด
  assert.equal(withRandom([0], () => haruka.tryCounter(engine, a, h)), null);

  h.statuses.harukaOmega = 5;
  assert.equal(withRandom([0.9], () => haruka.tryCounter(engine, a, h)), null, 'โรลไม่ติด (>=15%)');

  const fx = withRandom([0.1], () => haruka.tryCounter(engine, a, h));
  assert.ok(fx);
  assert.equal(fx.dmg, 1);
  assert.equal(fx.videoQueued, true);
  assert.equal(queued.at(-1), 'harukaCounter', 'คิววีดีโอไว้เล่นก่อนสรุปความเสียหาย');
  assert.equal(a.armor, 2, 'สวนกลับ 1 หน่วย (ลดเกราะก่อน)');
  assert.equal(a.harukaStunPending, 1, 'สตั้นเริ่มมีผลเทิร์นถัดไป');
  assert.equal(a.statuses.stun, undefined, 'ยังไม่สตั้นในเทิร์นนี้');
  assert.equal(fx.bled, 2);
  assert.equal(a.statuses.hbleed, 2, 'สวนกลับแปะเลือดไหลให้ผู้โจมตี 2 หน่วย');
});

// ---------------------------------------------------------------- สกิลพื้นฐาน
test('ไข่ต้ม และอาหารเสริม: กดได้ 2 ครั้งต่อเทิร์น แล้วปุ่มถูกปิด (ไม่นับเป็นการใช้สกิลของเทิร์น)', () => {
  const { h } = setup();
  assert.equal(haruka.canUseSkill(engine, h, 'basic'), true);
  withRandom([0.1], () => haruka.applyInstantSkill(engine, h, 'basic'));
  assert.equal(haruka.canUseSkill(engine, h, 'basic'), true);
  withRandom([0.1], () => haruka.applyInstantSkill(engine, h, 'basic'));
  assert.equal(haruka.canUseSkill(engine, h, 'basic'), false, 'ครบ 2 ครั้งแล้ว');
  haruka.onRoundStartTick(engine, h);
  assert.equal(haruka.canUseSkill(engine, h, 'basic'), true, 'โควตาเต็มใหม่ทุกเทิร์น');
});

test('ไข่ต้ม และอาหารเสริม: สุ่มผล 3 แบบตามช่วง 35 / 35 / 30', () => {
  const { h } = setup();
  h.hp = 3; h.armor = 0; h.skillPoints = 2;

  withRandom([0.20], () => haruka.applyMeal(engine, h));   // 20% -> ฟื้นพลังชีวิต
  assert.equal(h.hp, 5);

  haruka.onRoundStartTick(engine, h);
  withRandom([0.50], () => haruka.applyMeal(engine, h));   // 50% -> ฟื้นเกราะ
  assert.equal(h.armor, 2);

  haruka.onRoundStartTick(engine, h);
  withRandom([0.85], () => haruka.applyMeal(engine, h));   // 85% -> ฟื้นแต้มสกิล
  assert.equal(h.skillPoints, 5);
});

// ---------------------------------------------------------------- ท่าไม้ตาย
test('New Omega: ให้สถานะโอเมก้า 10 เทิร์น กดซ้ำได้ และเปลี่ยนภาพประจำตัว', () => {
  const { h } = setup();
  assert.equal(haruka.canUseSkill(engine, h, 'ultimate'), true);
  assert.equal(haruka.displayImg(h), null);
  haruka.applyInstantSkill(engine, h, 'ultimate');
  assert.equal(h.statuses.harukaOmega, haruka.OMEGA_TURNS);
  assert.equal(haruka.OMEGA_TURNS, 10);
  assert.equal(haruka.canUseSkill(engine, h, 'ultimate'), true, 'กดซ้ำได้ เพื่อระเบิดแต้มการ์ดอีกครั้ง');
  assert.equal(haruka.displayImg(h), haruka.IMG.ult);
});

test('New Omega: ระเบิดแต้มการ์ด — ทุกคนยกเว้นฮารุกะไพ่แตก และไม่รับดาเมจจากการแตก', () => {
  const { h, a } = setup();
  a.cards = [{ value: 5 }];
  a.locked = true; // เปิดไพ่ไปแล้วก็ยังโดนบังคับแตก

  haruka.applyInstantSkill(engine, h, 'ultimate');
  assert.equal(haruka.forcedBust(a), true);
  assert.equal(engine.bustedOf(a), true, 'บังคับแตกทับผลการคิดแต้มจริง');
  assert.equal(haruka.bustDamageImmune(a), true, 'ยกเว้นความเสียหายจากการไพ่แตก');
  assert.equal(haruka.forcedBust(h), false, 'ฮารุกะไม่โดนของตัวเอง');
  assert.equal(engine.bustedOf(h), false);

  // ธงมีผลแค่เทิร์นที่กด — ต้นเทิร์นถัดไปถูกล้าง ต้องกดใหม่ถึงจะระเบิดอีกครั้ง
  haruka.clearBurst(a);
  assert.equal(haruka.forcedBust(a), false);
  assert.equal(engine.bustedOf(a), false);
});

test('New Omega: การโจมตีปกติแปะเลือดไหล 3 หน่วย', () => {
  const { h, a } = setup();
  assert.equal(haruka.onAttackLanded(engine, h, a), 0, 'ไม่มีโอเมก้า = ไม่แปะ');
  h.statuses.harukaOmega = 5;
  assert.equal(haruka.onAttackLanded(engine, h, a), 3);
  assert.equal(a.statuses.hbleed, 3, 'หมัดเดียวถึงเกณฑ์ระเบิดของ amazon punish พอดี');
  assert.equal(haruka.onAttackLanded(engine, h, a), 3);
  assert.equal(a.statuses.hbleed, 6, 'สะสมต่อได้จนเต็มเพดาน');
});

test('New Omega: ไม่เพิ่มพลังโจมตีปกติแล้ว (ตัดโบนัส +1 ออก)', () => {
  const { h, a } = setup();
  const { computeAttackBase } = require('../../server.js');
  assert.equal(haruka.damageBonus, undefined, 'ไม่มีฮุค damageBonus อีกแล้ว');
  assert.equal(computeAttackBase(engine, h, a).base, 1);
  h.statuses.harukaOmega = 5;
  assert.equal(computeAttackBase(engine, h, a).base, 1, 'อยู่ในโอเมก้าก็ยังเป็นพลังโจมตีฐาน 1');
});

// ---------------------------------------------------------------- สกิลรอง
test('amazon punish: ต้องมีโอเมก้าถึงกดได้ และกดซ้ำไม่ได้ระหว่างจงไปสู่สุขติ', () => {
  const { h } = setup();
  assert.equal(haruka.canUseSkill(engine, h, 'secondary'), false, 'ไม่มีโอเมก้า = disable');
  h.statuses.harukaOmega = 5;
  assert.equal(haruka.canUseSkill(engine, h, 'secondary'), true);
  haruka.applyInstantSkill(engine, h, 'secondary');
  assert.equal(h.statuses.harukaPunish, 3);
  assert.equal(haruka.canUseSkill(engine, h, 'secondary'), false, 'ยังทำงานอยู่ = disable');
});

test('amazon punish: เลือดไหลไม่ถึง 3 หน่วย = ไม่เกิดอะไร และสถานะยังไม่ถูกใช้', () => {
  const { h, a } = setup();
  h.statuses.harukaPunish = 3;
  universal.applyBleed(a, 2);
  const ctx = {};
  assert.equal(haruka.applyPunish(engine, h, a, 1, ctx), 1, 'ดาเมจไม่เปลี่ยน');
  assert.equal(h.statuses.harukaPunish, 3, 'สถานะยังอยู่');
  assert.equal(a.statuses.hbleed, 2, 'เลือดไหลไม่ถูกล้าง');
  assert.equal(ctx.videoQueued, undefined);
});

test('amazon punish: เลือดไหล 3 หน่วยขึ้นไป = ระเบิดรวมกับหมัด ล้างเลือดไหล แต่สถานะยังอยู่ครบ 3 เทิร์น', () => {
  const { h, a } = setup();
  h.statuses.harukaPunish = 3;
  universal.applyBleed(a, 4);
  const ctx = {};
  assert.equal(haruka.applyPunish(engine, h, a, 2, ctx), 6, 'โจมตีปกติ 2 + เลือดไหล 4');
  assert.equal(h.statuses.harukaPunish, 3, 'สถานะไม่ถูกใช้หมด — จุดชนวนซ้ำได้ตลอด 3 เทิร์น');
  assert.equal(a.statuses.hbleed, undefined, 'เลือดไหลถูกล้างทั้งหมด');
  assert.equal(ctx.videoQueued, true);
  assert.equal(ctx.punishStacks, 4);
  assert.equal(queued.at(-1), 'harukaPunish', 'คิววีดีโอไว้เล่นก่อนสรุปความเสียหาย');
});

test('amazon punish: จุดชนวนได้หลายครั้งตลอด 3 เทิร์น (สะสมเลือดไหลใหม่ครบก็ระเบิดได้อีก)', () => {
  const { h, a } = setup();
  h.statuses.harukaPunish = 3;
  universal.applyBleed(a, 3);
  assert.equal(haruka.applyPunish(engine, h, a, 1, {}), 4, 'ระเบิดครั้งที่ 1');
  assert.equal(a.statuses.hbleed, undefined);

  universal.applyBleed(a, 5);
  assert.equal(haruka.applyPunish(engine, h, a, 1, {}), 6, 'สะสมใหม่ครบแล้วระเบิดได้อีก');
  assert.equal(a.statuses.hbleed, undefined);
  assert.equal(h.statuses.harukaPunish, 3);
});

test('amazon punish: ไม่มีสถานะ = ไม่จุดชนวนแม้เป้าหมายเลือดไหลเต็ม', () => {
  const { h, a } = setup();
  universal.applyBleed(a, 5);
  assert.equal(haruka.applyPunish(engine, h, a, 3, {}), 3);
  assert.equal(a.statuses.hbleed, 5);
});

test('New Omega: เสียงโจมตีปกติเปลี่ยนเป็น hit_haruka.mp3 เฉพาะระหว่างโอเมก้า', () => {
  const { h, a } = setup();
  const { attackSoundOf } = require('../../server.js');
  assert.equal(attackSoundOf(h), undefined, 'ปกติใช้เสียงกลาง');
  h.statuses.harukaOmega = 5;
  assert.equal(attackSoundOf(h), 'haruka_attack');
  delete h.statuses.harukaOmega;
  assert.equal(attackSoundOf(h), undefined, 'ออกจากร่างแล้วกลับไปใช้เสียงกลาง');
  assert.equal(attackSoundOf(a), undefined, 'ตัวละครอื่นไม่ได้รับผล');
});

// ---------------------------------------------------------------- คอมโบเต็มรูปแบบ
test('คอมโบ: โอเมก้าแปะเลือดไหล 1 หมัด แล้ว punish ระเบิดได้ในหมัดที่ 2', () => {
  const { h, a } = setup();
  h.statuses.harukaOmega = 5;
  haruka.onAttackLanded(engine, h, a);
  assert.equal(a.statuses.hbleed, 3, 'หมัดเดียวก็ถึงเกณฑ์แล้ว');
  h.statuses.harukaPunish = 3;
  // หมัดที่ 2: อ่านค่าเลือดไหลก่อน (3) -> ระเบิด แล้วค่อยแปะก้อนใหม่หลังดาเมจลง
  assert.equal(haruka.applyPunish(engine, h, a, 1, {}), 4, 'โจมตีปกติ 1 + เลือดไหล 3');
  haruka.onAttackLanded(engine, h, a);
  assert.equal(a.statuses.hbleed, 3, 'กองใหม่เริ่มนับจาก 0 หลังระเบิด');
});
