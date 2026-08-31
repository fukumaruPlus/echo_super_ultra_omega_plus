const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const eiji = require('../../characters/eiji.js');
const YunaMod = require('../../characters/yuna.js');

const cutsceneFns = {
  triggerCutscene: engine.triggerCutscene,
  queueCutscene: engine.queueCutscene,
  runCutsceneQueue: engine.runCutsceneQueue,
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  endTurn: engine.endTurn,
};

test.before(() => {
  engine.triggerCutscene = () => {};
  engine.queueCutscene = () => {};
  // runCutsceneQueue ตัวจริงตั้ง gameState = "CUTSCENE" แล้วรอ timer — ในเทสต์ให้เดินต่อทันที
  engine.runCutsceneQueue = (onDone) => { if (onDone) onDone(); };
  // startPhaseTimer/endTurn ถูกตัดออก ไม่งั้นการจบฉากโจมตีจะไหลต่อเข้า endTurn -> dealRound
  //  แล้ววนทั้งเทิร์นแบบซิงโครนัสจนเทสต์ค้าง (เราสนใจแค่ผลของหมัดนั้นหมัดเดียว)
  engine.startPhaseTimer = () => {};
  engine.endTurn = () => {};
  engine.broadcastState = () => {};
});

test.after(() => {
  // doAttack เรียก startPhaseTimer "ตัวในโมดูล" ไม่ใช่ engine.startPhaseTimer ที่เรา stub ไว้
  //  -> setInterval ตัวจริงถูกตั้งขึ้นและค้างอยู่ ทำให้โปรเซสเทสต์ไม่ยอมจบ ต้องเคลียร์ทิ้งเอง
  engine.clearPhaseTimer();
  Object.assign(engine, cutsceneFns);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 4, armor: 4, shield: 0, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, locked: false, result: null, connected: true,
  };
}

// สนามสะอาด: เอจิ 1 คน + คู่ต่อสู้ 1 คน
function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  const e = mk('E', 'eiji', 1);
  const a = mk('A', 'temari', 2);
  a.hp = 7; a.armor = 3;
  engine.players.E = e;
  engine.players.A = a;
  engine.setRoundNumber(3);
  return { e, a };
}

const vitals = (p) => p.hp + p.armor;

// ---------------------------------------------------------------- คูลดาวน์ท่าไม้ตาย (patch 2.9.3)
test('ไม่ว่ายังก็ตาม: หมดเวลาแล้วติดคูลดาวน์ 3 เทิร์น ก่อนจะกดซ้ำได้', () => {
  const { e } = setup();
  const r = engine.roundNumber;
  assert.equal(eiji.canUseSkill(engine, e, 'ultimate'), true, 'ตอนเริ่มกดได้ปกติ');

  e.statuses.eijiUlt = 1;
  assert.equal(eiji.canUseSkill(engine, e, 'ultimate'), false, 'ระหว่างทำงานอยู่กดซ้ำไม่ได้');

  // จำลอง endTurn: สถานะหมดอายุ -> server เรียก onUltExpire ให้
  delete e.statuses.eijiUlt;
  eiji.onUltExpire(engine, e);
  assert.equal(e.eijiUltLock, r + eiji.ULT_COOLDOWN_TURNS);

  for (let i = 1; i <= eiji.ULT_COOLDOWN_TURNS; i++) {
    engine.setRoundNumber(r + i);
    assert.equal(eiji.canUseSkill(engine, e, 'ultimate'), false, `รอบที่ ${r + i} ยังติดคูลดาวน์`);
    assert.equal(eiji.ultCooldownLeft(engine, e), eiji.ULT_COOLDOWN_TURNS - i + 1, 'ตัวเลขบนการ์ดนับถอยหลังถูกต้อง');
  }

  engine.setRoundNumber(r + eiji.ULT_COOLDOWN_TURNS + 1);
  assert.equal(eiji.ultCooldownLeft(engine, e), 0);
  assert.equal(eiji.canUseSkill(engine, e, 'ultimate'), true, 'ครบ 3 เทิร์นแล้วกดได้');
});

test('ไม่ว่ายังก็ตาม: คูลดาวน์ถูกล้างเมื่อเริ่มแมตช์ใหม่', () => {
  const { e } = setup();
  e.eijiUltLock = engine.roundNumber + 3;
  eiji.resetCombat(e);
  assert.equal(e.eijiUltLock, 0);
  assert.equal(eiji.ultCooldownLeft(engine, e), 0);
});
const maxOrdinal = (e) => { for (let i = 0; i < eiji.ORDINAL_MAX; i++) eiji.pressOrdinal(engine, e); };

test('กลโกง Ordinal Scale: กด 1 ครั้ง = หลบ +20% และสละแต้มสกิล 1', () => {
  const { e } = setup();
  assert.equal(eiji.dodgeChance(e), 0);
  assert.equal(eiji.pressOrdinal(engine, e), true);
  assert.equal(eiji.dodgeChance(e), 20);
  assert.equal(e.skillPoints, 7);
});

test('กลโกง Ordinal Scale: กดได้สูงสุด 5 ครั้ง (รวม 100%) และอัตราหลบรวมไม่เกิน 100%', () => {
  const { e } = setup();
  maxOrdinal(e);
  assert.equal(eiji.dodgeChance(e), 100);
  assert.equal(eiji.pressOrdinal(engine, e), false, 'กดครั้งที่ 6 ไม่ได้');
  e.statuses.eijiSwift = 3;
  e.statuses.eijiUlt = 5;
  assert.equal(eiji.dodgeChance(e), 100, 'ซ้อนกับว่องไว/ท่าไม้ตายแล้วยังไม่เกินเพดาน');
});

test('อัตราหลบซ้อนทับได้จากทั้ง 3 แหล่ง', () => {
  const { e } = setup();
  e.statuses.eijiSwift = 3;
  assert.equal(eiji.dodgeChance(e), 20, 'ว่องไว 20%');
  e.statuses.eijiUlt = 5;
  assert.equal(eiji.dodgeChance(e), 40, 'ว่องไว + ไม่ว่ายังก็ตาม = 40%');
  eiji.pressOrdinal(engine, e);
  assert.equal(eiji.dodgeChance(e), 60, 'บวก Ordinal Scale อีก 1 ครั้ง');
});

test('หลบความเสียหายจากสกิลได้จริง (dealMixed / dealDirect) และได้แต้มสกิลคืน +2', () => {
  const { e } = setup();
  e.statuses.eijiSwift = 3;
  maxOrdinal(e); // 100% — ผลลัพธ์จึงไม่ขึ้นกับการสุ่ม
  const spBefore = e.skillPoints;
  const before = vitals(e);
  engine.dealMixed(e, 3);
  assert.equal(vitals(e), before, 'ดาเมจสกิลถูกหลบหมด');
  assert.equal(e.skillPoints, Math.min(engine.maxSkillOf(e), spBefore + 2), 'สกิลติดตัว 2: หลบสำเร็จ +2');
  assert.equal(e.eijiDodgeUsedRound, true);
});

test('หลบดาเมจทะลุเกราะ (dealDirect) ได้ด้วย', () => {
  const { e } = setup();
  maxOrdinal(e);
  const before = e.hp;
  engine.dealDirect(e, 2);
  assert.equal(e.hp, before);
});

test('โควตาหลบมีแค่ 1 ครั้งต่อเทิร์น — ก้อนที่ 2 โดนเต็ม', () => {
  const { e } = setup();
  maxOrdinal(e);
  engine.dealMixed(e, 3);
  const before = vitals(e);
  engine.dealMixed(e, 2);
  assert.equal(vitals(e), before - 2);
});

test('หลบการโจมตีปกติได้จริง และเกมไม่ค้างที่เฟส ATTACK', () => {
  const { e, a } = setup();
  maxOrdinal(e);
  engine.setGameState('ATTACK');
  engine.setAttackerId(a.id);
  const before = vitals(e);
  engine.doAttack(a.id, e.id);
  assert.equal(vitals(e), before, 'ไม่เสียเลือด/เกราะ');
  assert.equal(engine.lastAttack.dodge, true);
  assert.equal(engine.lastAttack.dmg, 0);
  assert.notEqual(engine.gameState, 'ATTACK', 'ต้องเดินต่อ ไม่ค้างรอเลือกเป้า');
});

test('ไม่มีบัฟหลบ = โดนโจมตีปกติตามปกติ (ไม่ได้หลบมั่ว)', () => {
  const { e, a } = setup();
  engine.setGameState('ATTACK');
  engine.setAttackerId(a.id);
  const before = vitals(e);
  engine.doAttack(a.id, e.id);
  assert.ok(vitals(e) < before);
});

test('ดาเมจแพ้จั่ว (damageSoft) ไม่ถูกหลบ และไม่กินโควตาหลบ', () => {
  const { e } = setup();
  maxOrdinal(e);
  const before = vitals(e);
  engine.damageSoft(e);
  assert.equal(vitals(e), before - 1);
  assert.ok(!e.eijiDodgeUsedRound);
});

test('ต้นเทิร์น: Ordinal Scale รีเซ็ต และโควตาหลบกลับมาใช้ได้', () => {
  const { e } = setup();
  maxOrdinal(e);
  engine.dealMixed(e, 1);
  eiji.onRoundStartTick(engine, e);
  assert.equal(eiji.ordinalStacks(e), 0);
  assert.equal(e.eijiDodgeUsedRound, false);
});

test('ท่าไม้ตายทำงานอยู่: ต้นเทิร์นได้แต้มสกิล +1', () => {
  const { e } = setup();
  e.statuses.eijiUlt = 5;
  e.skillPoints = 3;
  eiji.onRoundStartTick(engine, e);
  assert.equal(e.skillPoints, 4);
});

test('Longing ลงคนอื่น: บัฟถูกปิด + เอจิสวนคืนทะลุเกราะ 1 หน่วย', () => {
  const { e } = setup();
  const v = mk('V', 'temari', 3);
  engine.players.V = v;
  v.alive = false; v.hp = 0; v.armor = 3; // ตายด้วยดาเมจทะลุเกราะ -> ฟื้นมาพร้อมเกราะเดิม
  YunaMod.reviveWithLonging(engine, v);
  assert.equal(v.hp, 2, 'ฟื้น 3 แล้วโดนสวนทะลุเกราะ 1');
  assert.equal(v.armor, 3, 'เกราะไม่ถูกหมัดนี้กิน');
  assert.ok(!v.statuses.yunaLonging, 'บัฟ Longing ถูกปิด');
  assert.ok(!(v.statusAmt && v.statusAmt.yunaLonging), 'statusAmt ไม่ค้าง');
  assert.equal(engine.yunaEffect, null, 'เอฟเฟกต์สนาม + เพลงยูนะหยุด');
  assert.ok(e.alive);
});

test('Longing ลงคู่แฝดฮิซากาว่า: บัฟที่เก็บไว้บนตัวแฝดก็ต้องถูกปิดด้วย', () => {
  setup();
  const v = mk('V', 'hisakawa_sister', 3);
  engine.players.V = v;
  const twins = engine.CHAR_HOOKS.hisakawa_sister.publicState(v) && v.hisakawa.twins;
  twins.nagi.alive = false;
  twins.nagi.hp = 0;
  v.alive = false; v.hp = 0;
  YunaMod.reviveWithLonging(engine, v);
  for (const key of ['nagi', 'hayate']) {
    assert.ok(!v.hisakawa.twins[key].statuses.yunaLonging, `บัฟบนแฝด ${key} ต้องถูกล้าง`);
  }
  assert.equal(v.hisakawa.twins.nagi.hp, 2, 'แฝดที่ฟื้นโดนสวนคืน 1 หน่วย');
});

test('Longing ลงเอจิเอง: ทำงานตามปกติ ไม่สวนใส่ตัวเอง', () => {
  setup();
  const e = engine.players.E;
  e.alive = false; e.hp = 0;
  YunaMod.reviveWithLonging(engine, e);
  assert.equal(e.hp, 3, 'ไม่โดนสวนคืน');
  assert.equal(e.statuses.yunaLonging, 5, 'บัฟยังอยู่');
});

// ---------- ท่าไม้ตาย x Longing: ทั้งคู่ใช้ตัวแปรสนามยูนะร่วมกัน จึงเขียนทับกันได้ ----------
test('ท่าไม้ตายทำงานอยู่ แล้วเกิด Longing กับคนอื่น — Break Beat Bark! ต้องไม่หาย', () => {
  const { e } = setup();
  eiji.applyUlt(engine, e);
  assert.equal(engine.yunaBeatBarkActive(), true, 'ตั้งต้น: สนามเปิดอยู่');

  const w = mk('W', 'satoru', 4);
  engine.players.W = w;
  w.alive = false; w.hp = 0;
  YunaMod.reviveWithLonging(engine, w);

  assert.equal(e.statuses.eijiUlt, 5, 'ท่าไม้ตายยังนับเทิร์นอยู่');
  assert.equal(engine.yunaBeatBarkActive(), true, 'Longing ต้องไม่พาเอฟเฟกต์สนามของท่าไม้ตายหายไป');
  assert.equal(engine.yunaEffect, 'beatbark', 'คืนสนาม Break Beat Bark! กลับหลังปิด Longing');
});

test('ท่าไม้ตายทำงานอยู่ แล้วเกิด Longing กับเอจิเอง — Break Beat Bark! ต้องไม่หาย', () => {
  const { e } = setup();
  eiji.applyUlt(engine, e);
  e.alive = false; e.hp = 0;
  YunaMod.reviveWithLonging(engine, e);

  assert.equal(e.statuses.eijiUlt, 5, 'ท่าไม้ตายยังนับเทิร์นอยู่');
  assert.equal(e.statuses.yunaLonging, 5, 'Longing ลงเอจิเองทำงานตามปกติ');
  assert.equal(engine.yunaBeatBarkActive(), true, 'สนามของท่าไม้ตายยังทำงานคู่กับ Longing ได้');
});

test('Longing ลงคนอื่นมาก่อน: ปิดทันที -> เอจิกดท่าไม้ตายได้เลย', () => {
  const { e } = setup();
  const w = mk('W', 'satoru', 4);
  engine.players.W = w;
  w.alive = false; w.hp = 0;
  YunaMod.reviveWithLonging(engine, w);
  assert.equal(engine.yunaEffect, null, 'ไม่มีท่าไม้ตายค้าง -> สนามถูกปิด');
  assert.equal(eiji.canUseSkill(engine, e, 'ultimate'), true);
});

test('Longing ลงเอจิเองมาก่อน: สนามยูนะเปิดอยู่ -> กดท่าไม้ตายไม่ได้ (ตามสเปก)', () => {
  const { e } = setup();
  e.alive = false; e.hp = 0;
  YunaMod.reviveWithLonging(engine, e);
  assert.equal(engine.yunaEffect, 'longing');
  assert.equal(eiji.canUseSkill(engine, e, 'ultimate'), false);
});

test('กดท่าไม้ตายซ้ำระหว่างที่ยังทำงานอยู่ไม่ได้', () => {
  const { e } = setup();
  eiji.applyUlt(engine, e);
  assert.equal(eiji.canUseSkill(engine, e, 'ultimate'), false);
});

// ---------- ปรับสมดุล: ดาเมจ 2 เท่าติดตัว + ว่องไวคืนแต้ม/ฟื้นเกราะ ----------
test('สกิลติดตัว 1: โอกาสดาเมจ 2 เท่าติดตัว 20% แม้ไม่ได้กดสกิลรอง', () => {
  const { e } = setup();
  assert.equal(eiji.doubleChance(e), 20);
});

test('สกิลรองยกระดับโอกาสดาเมจ 2 เท่า และไม่มีทางต่ำกว่าฐาน 20%', () => {
  const { e } = setup();
  e.hp = 4; e.armor = 4;
  e.statuses.eijiSword = 3;
  assert.equal(eiji.doubleChance(e), 80, '(4+4) x 10%');
  e.hp = 1; e.armor = 0;
  assert.equal(eiji.doubleChance(e), 20, 'สูตรได้ 10% แต่ต้องไม่ต่ำกว่าฐานติดตัว');
});

test('ดาเมจ 2 เท่าทำงาน: คูณดาเมจ + ฟื้นพลังชีวิต +1 + คิววีดีโอไว้เล่นก่อนสรุป', () => {
  const { e } = setup();
  e.hp = 2; e.armor = 0;              // ยังไม่เต็ม เพื่อให้ฟื้นเลือดได้จริง
  e.statuses.eijiSword = 3;           // (2+0) x 10% = 20% -> ใช้ฐาน 20%
  const rnd = Math.random;
  Math.random = () => 0;              // บังคับให้ติดแน่นอน
  try {
    const ctx = {};
    const out = eiji.applySwordDouble(engine, e, 3, ctx);
    assert.equal(out, 6, 'ดาเมจถูกคูณ 2');
    assert.equal(e.hp, 3, 'ฟื้นพลังชีวิต +1');
    assert.equal(ctx.videoQueued, true, 'ตั้งธงให้ doAttack เล่นวีดีโอก่อนสรุปความเสียหาย');
  } finally { Math.random = rnd; }
});

test('ดาเมจ 2 เท่าไม่ติด: ดาเมจเท่าเดิม ไม่ฟื้นเลือด ไม่คิววีดีโอ', () => {
  const { e } = setup();
  e.hp = 2; e.armor = 0;
  const rnd = Math.random;
  Math.random = () => 0.99;
  try {
    const ctx = {};
    assert.equal(eiji.applySwordDouble(engine, e, 3, ctx), 3);
    assert.equal(e.hp, 2);
    assert.ok(!ctx.videoQueued);
  } finally { Math.random = rnd; }
});

test('ว่องไว: กดแล้วฟื้นเกราะทันที 2 หน่วย', () => {
  const { e } = setup();
  e.armor = 1;
  eiji.applySwift(engine, e);
  assert.equal(e.armor, 3);
  assert.equal(e.statuses.eijiSwift, 3);
});

test('ว่องไวหมดอายุ: คืนแต้มสกิลที่ใช้ไป +2', () => {
  const { e } = setup();
  e.skillPoints = 3;
  eiji.onSwiftExpire(engine, e);
  assert.equal(e.skillPoints, 5);
});

test('ตัวละครอื่นไม่ได้รับผลดาเมจ 2 เท่าของเอจิ', () => {
  const { a } = setup();
  assert.equal(eiji.doubleChance(a), 0);
  assert.equal(eiji.applySwordDouble(engine, a, 3, {}), 3);
});

// ---------- โควตาหลบต้องนับเฉพาะตอน "หลบได้จริง" ----------
test('โรลหลบไม่ติด: โดนเต็ม แต่ต้องไม่กินโควตาของเทิร์นนั้น', () => {
  const { e } = setup();
  e.statuses.eijiSwift = 3; // 20%
  const rnd = Math.random;
  Math.random = () => 0.99; // บังคับให้พลาด
  try {
    const before = vitals(e);
    engine.dealMixed(e, 1);
    assert.equal(vitals(e), before - 1, 'หลบไม่ได้ = โดนเต็ม');
    assert.ok(!e.eijiDodgeUsedRound, 'พลาดแล้วต้องไม่ถูกนับว่าใช้โควตาไปแล้ว');
  } finally { Math.random = rnd; }
});

test('พลาดก่อน แล้วค่อยหลบติดในเทิร์นเดียวกัน — ยังหลบได้', () => {
  const { e } = setup();
  e.statuses.eijiSwift = 3;
  const rnd = Math.random;
  try {
    Math.random = () => 0.99;            // หมัดแรก: พลาด
    const before = vitals(e);
    engine.dealMixed(e, 1);
    assert.equal(vitals(e), before - 1);

    Math.random = () => 0;               // หมัดที่สอง: ติด
    const mid = vitals(e);
    engine.dealMixed(e, 2);
    assert.equal(vitals(e), mid, 'หลบหมัดที่สองได้ เพราะโควตายังไม่ถูกใช้');
    assert.equal(e.eijiDodgeUsedRound, true);

    const after = vitals(e);             // หมัดที่สาม: โควตาหมดแล้ว
    engine.dealMixed(e, 2);
    assert.equal(vitals(e), after - 2, 'หลบสำเร็จไปแล้ว 1 ครั้ง หมัดถัดไปต้องโดนเต็ม');
  } finally { Math.random = rnd; }
});

test('โรลไม่ติดไม่ได้แต้มสกิลคืน (แต้มคืนเฉพาะตอนหลบสำเร็จ)', () => {
  const { e } = setup();
  e.statuses.eijiSwift = 3;
  e.skillPoints = 2;
  const rnd = Math.random;
  Math.random = () => 0.99;
  try {
    engine.dealMixed(e, 1);
    assert.equal(e.skillPoints, 2);
  } finally { Math.random = rnd; }
});
