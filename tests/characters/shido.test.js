const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const shido = require('../../characters/shido.js');
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
    shidoRecorded: shido.RECORD_BASE, shidoGuardTurns: 0, shidoDeathVideoPending: false,
    shidoRewindPending: false, shidoRewindLock: 0,
  };
}

// สนามสะอาด: ชิโด 1 คน + คู่ต่อสู้ 2 คน (เกราะ 0 ทุกคน เพื่อให้ดาเมจเข้าเลือดตรงๆ)
function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = [];
  const s = mk('S', 'shido', 1);
  const a = mk('A', 'temari', 2);
  const b = mk('B', 'kuwagata', 3);
  engine.players.S = s;
  engine.players.A = a;
  engine.players.B = b;
  engine.setRoundNumber(3);
  return { s, a, b };
}

// ยิงดาเมจใส่ชิโดในนามของผู้เล่นคนอื่น (ผ่านท่อจริง -> ผ่าน adjustIncomingDamage)
function hit(from, target, n) {
  engine.withEffectSource(from, () => { engine.dealMixed(target, n, true); });
}

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('ชิโด: อยู่ใน roster กลุ่ม "พิเศษ" · unique · สกิลครบและค่าใช้ตรงสเปค', () => {
  const c = CHARACTERS.CHAR_BY_ID.shido;
  assert.ok(c, 'ต้องมีตัวละคร shido ใน characters.js');
  assert.equal(c.difficulty, 'special');
  assert.equal(c.unique, true, 'เลือกได้แค่ 1 คนต่อเกม');
  assert.equal(c.basic.cost, 2);
  assert.equal(c.secondary.cost, 4);
  assert.equal(c.ultimate.cost, 8);
  assert.ok(c.passive, 'ต้องมีสกิลติดตัว');
});

// ---------------------------------------------------------------- สกิลติดตัว ขอพลังให้ฉันด้วย
test('ขอพลังให้ฉันด้วย: เริ่มที่ 3 · โดนแรงกว่าเดิมบันทึกทับ · โดนเบากว่าเดิมร่วงกลับ 3', () => {
  const { s, a } = setup();
  assert.equal(s.shidoRecorded, 3, 'ค่าเริ่มต้นคือพื้น 3');

  hit(a, s, 5);
  assert.equal(s.shidoRecorded, 5, 'แรงกว่าเดิม -> บันทึกทับ');

  hit(a, s, 6);
  assert.equal(s.shidoRecorded, 6);

  hit(a, s, 2);
  assert.equal(s.shidoRecorded, shido.RECORD_BASE, 'เบากว่าที่บันทึกไว้ -> ร่วงกลับพื้น 3 (ไม่ใช่ 2 และไม่คง 6)');
});

test('ขอพลังให้ฉันด้วย: โดนเท่ากับที่บันทึกไว้พอดี -> ค่าคงเดิม', () => {
  const { s, a } = setup();
  hit(a, s, 5);
  assert.equal(s.shidoRecorded, 5);
  hit(a, s, 5);
  assert.equal(s.shidoRecorded, 5, 'เท่ากันพอดีไม่นับว่าเบากว่า');
});

test('ขอพลังให้ฉันด้วย: ดาเมจที่ไม่มีต้นตอเป็นผู้เล่นอื่น ไม่แตะค่าที่บันทึกไว้', () => {
  const { s } = setup();
  hit(engine.players.A, s, 5);
  assert.equal(s.shidoRecorded, 5);

  engine.dealMixed(s, 1, false); // ไม่มี effectSource
  assert.equal(s.shidoRecorded, 5, 'ดาเมจไร้ต้นตอไม่ดีดค่าลง');

  engine.withEffectSource(s, () => { engine.dealMixed(s, 1, false); }); // ทำร้ายตัวเอง
  assert.equal(s.shidoRecorded, 5, 'ดาเมจของตัวเองไม่ดีดค่าลง');
});

test('ขอพลังให้ฉันด้วย: สกิลติดตัวถูกผนึก -> ไม่บันทึกอะไรเลย', () => {
  const { s, a } = setup();
  s.statuses.nanayaSeal = 3; // ผนึกสกิลติดตัว
  hit(a, s, 6);
  assert.equal(s.shidoRecorded, shido.RECORD_BASE);
});

// ---------------------------------------------------------------- สกิลพื้นฐาน ภูติ
test('ภูติ: ฟื้นเลือด 1/เทิร์น และกดซ้ำระหว่างมีผลไม่ได้ (ไม่มีการดูดเลือดจากการโจมตีแล้ว)', () => {
  const { s } = setup();
  s.hp = 3;
  shido.applySpirit(engine, s);
  assert.equal(s.statuses.shidoSpirit, shido.SPIRIT_TURNS);
  assert.equal(shido.canUseSkill(engine, s, 'basic'), false);

  shido.onRoundStartTick(engine, s);
  assert.equal(s.hp, 4, 'ฟื้น 1 หน่วยตอนเริ่มเทิร์น');
  shido.onRoundStartTick(engine, s);
  assert.equal(s.hp, 5);

  assert.equal(shido.onAttackLanded, undefined, 'ฮุคดูดเลือดถูกถอดออกแล้ว');

  delete s.statuses.shidoSpirit;
  shido.onRoundStartTick(engine, s);
  assert.equal(s.hp, 5, 'หมดเวลาแล้วไม่ฟื้นต่อ');
  assert.equal(shido.canUseSkill(engine, s, 'basic'), true);
});

// ---------------------------------------------------------------- สกิลรอง Sandalphon
test('Sandalphon: แทนที่พลังโจมตีปกติด้วยค่าที่บันทึกไว้ (ไม่ใช่บวกทับฐาน 1)', () => {
  const { s, a } = setup();
  assert.equal(computeAttackBase(engine, s, a).base, 1, 'ยังไม่ชักดาบ = ฐานปกติ 1');

  hit(a, s, 5);
  shido.applySword(engine, s);
  assert.equal(s.statuses.shidoSword, shido.SWORD_TURNS);
  assert.equal(s.statusAmt.shidoSword, 5);
  assert.equal(computeAttackBase(engine, s, a).base, 5, 'แทนที่ ไม่ใช่ 1+5');
});

test('Sandalphon: ค่าดาบถูกล็อกตอนกด — โดนตีใหม่ระหว่างนี้ดาบไม่เปลี่ยนค่า', () => {
  const { s, a } = setup();
  hit(a, s, 5);
  shido.applySword(engine, s);
  assert.equal(computeAttackBase(engine, s, a).base, 5);

  hit(a, s, 7);
  assert.equal(s.shidoRecorded, 7, 'ค่าที่บันทึกอัปเดตแล้ว');
  assert.equal(computeAttackBase(engine, s, a).base, 5, 'แต่ดาบยังเป็นค่าที่ล็อกไว้ตอนกด');

  shido.applySword(engine, s); // กดใหม่ถึงจะอัปเดต
  assert.equal(computeAttackBase(engine, s, a).base, 7);
});

test('Sandalphon: ระหว่างที่ดาบยังอยู่ ฟื้นแต้มสกิล +1 ต่อเทิร์น', () => {
  const { s } = setup();
  s.skillPoints = 2;
  shido.onRoundStartTick(engine, s);
  assert.equal(s.skillPoints, 2, 'ยังไม่ได้ชักดาบ = ไม่ฟื้น');

  shido.applySword(engine, s);
  shido.onRoundStartTick(engine, s);
  assert.equal(s.skillPoints, 2 + shido.SWORD_SKILL_REGEN);
  shido.onRoundStartTick(engine, s);
  assert.equal(s.skillPoints, 2 + shido.SWORD_SKILL_REGEN * 2);

  delete s.statuses.shidoSword;
  shido.onRoundStartTick(engine, s);
  assert.equal(s.skillPoints, 2 + shido.SWORD_SKILL_REGEN * 2, 'ดาบหมดเวลาแล้วหยุดฟื้น');
});

test('Sandalphon: กดได้เสมอ และพลังดาบต่ำสุดคือ 3', () => {
  const { s, a } = setup();
  assert.equal(shido.canUseSkill(engine, s, 'secondary'), true, 'ยังไม่เคยโดนตีก็กดได้');
  shido.applySword(engine, s);
  assert.equal(s.statusAmt.shidoSword, shido.RECORD_BASE);
  assert.equal(computeAttackBase(engine, s, a).base, 3);
});

// ---------------------------------------------------------------- ท่าไม้ตาย ฝากด้วยนะตัวฉัน
test('ฝากด้วยนะตัวฉัน: เป็นสกิลเงียบ ไม่ใช้ p.statuses และกดซ้ำระหว่างเปิดอยู่ไม่ได้', () => {
  const { s } = setup();
  shido.applyGuard(engine, s);
  assert.equal(s.shidoGuardTurns, shido.GUARD_TURNS);
  assert.equal(s.statuses.shidoGuard, undefined, 'ไม่อยู่ใน statuses จึงไม่โผล่ตอน revealAll');
  assert.equal(shido.silentSkill(s, 'ultimate'), true, 'ต้องไม่มีแบนเนอร์/ไม่เข้า roundSkills');
  assert.equal(shido.guardActive(s), true, 'ใช้บังแต้มสกิลให้คนอื่นเห็นเต็มหลอด');
  assert.equal(shido.canUseSkill(engine, s, 'ultimate'), false);

  // นับถอยหลังเองท้ายเทิร์น (ไม่ได้อยู่ในลูปลดเทิร์นของ statuses)
  for (let left = shido.GUARD_TURNS - 1; left >= 0; left--) {
    shido.onEndTurn(engine, s);
    assert.equal(s.shidoGuardTurns, left);
  }
  assert.equal(shido.guardActive(s), false);
  assert.equal(shido.canUseSkill(engine, s, 'ultimate'), true);
});

test('ฝากด้วยนะตัวฉัน: ตายระหว่างกับดักเปิด -> จองการย้อนเวลา + คิววีดีโอรอยต่อ', () => {
  const { s } = setup();
  shido.applyGuard(engine, s);
  s.hp = 0;
  engine.instantDeath(s);
  assert.equal(s.alive, false, 'ตกรอบจริงก่อน ไม่ใช่การกันตาย');
  assert.equal(s.shidoRewindPending, true);
  assert.equal(s.shidoGuardTurns, 0, 'กับดักถูกใช้ไปแล้ว');
  assert.equal(shido.rewindPending(engine), true, 'เกมยังจบไม่ได้');

  assert.deepEqual(queued, [], 'วีดีโอยังไม่คิวตอนตาย');
  shido.flushDeathVideo(engine);
  assert.deepEqual(queued, ['shidoGuard'], 'คิวตอน endTurn = เล่นเป็นรอยต่อหลังหน้าจอโจมตี');
  shido.flushDeathVideo(engine);
  assert.deepEqual(queued, ['shidoGuard'], 'ไม่คิวซ้ำ');
});

test('ฝากด้วยนะตัวฉัน: ตายตอนกับดักไม่ได้เปิด -> ไม่มีการย้อนเวลา', () => {
  const { s } = setup();
  s.hp = 0;
  engine.instantDeath(s);
  assert.equal(s.shidoRewindPending, false);
  assert.equal(shido.rewindPending(engine), false);
});

// ---- ย้อนเวลาจริง: ใช้ระบบสแนปช็อตของ engine ตัวเดียวกับ Overload Force ----
//  จำลองประวัติด้วยการเรียก engine.pushSnapshotHistory ผ่าน dealRound ไม่ได้ในเทสต์ระดับ hook
//  จึงยัดสแนปช็อตเข้าไปเองผ่าน API ที่ engine เปิดไว้ แล้วตรวจว่า applyRewind คืนสภาพครบ
function snapNow(round) {
  engine.setRoundNumber(round);
  engine.pushSnapshotHistory();
}

test('ย้อนเวลา: คืนพลังชีวิต/เกราะ/เหรียญ/แต้มสกิล/สถานะ และปลุกคนที่ตายไปแล้ว', () => {
  const { s, a, b } = setup();
  engine.clearSnapshotHistory();

  // --- สภาพ ณ รอบที่ 5 (จุดที่จะย้อนกลับไป) ---
  s.hp = 4; s.armor = 2; s.gold = 12; s.skillPoints = 7;
  a.hp = 5; a.gold = 4;
  b.hp = 7;
  snapNow(5);
  for (let r = 6; r <= 10; r++) snapNow(r); // เดินหน้าอีก 5 เทิร์น

  // --- สภาพปัจจุบัน (รอบที่ 10) พังยับ ---
  s.hp = 1; s.armor = 0; s.gold = 0; s.skillPoints = 0;
  s.statuses.stun = 3;
  a.hp = 1; a.gold = 30;
  b.alive = false; b.hp = 0;

  shido.applyGuard(engine, s);
  s.hp = 0;
  engine.instantDeath(s);
  assert.equal(shido.applyRewind(engine, engine.players.S), true);

  const s2 = engine.players.S, a2 = engine.players.A, b2 = engine.players.B;
  assert.equal(s2.alive, true, 'ชิโดกลับมามีชีวิต');
  assert.equal(s2.hp, 4 + shido.REWIND_HEAL, 'คืนเลือดของรอบที่ 5 แล้วฟื้นเพิ่มอีก 2');
  assert.equal(s2.armor, 2);
  assert.equal(s2.gold, 12, 'ย้อนเหรียญ');
  assert.equal(s2.skillPoints, 7, 'ย้อนแต้มสกิล');
  assert.equal(s2.statuses.stun, undefined, 'ย้อนสถานะ');
  assert.equal(a2.hp, 5);
  assert.equal(a2.gold, 4);
  assert.equal(b2.alive, true, 'คนที่ตายไปแล้วกลับมา');
  assert.equal(b2.hp, 7);
  assert.equal(engine.roundNumber, 4, 'ตั้งเป็น snap.round - 1 เพื่อให้ dealRound ++ กลับเป็นรอบที่ 5');
  assert.equal(shido.rewindPending(engine), false);
});

test('ย้อนเวลา: คูลดาวน์ 5 เทิร์นรอดจากการย้อน (กันย้อนวนไม่รู้จบ)', () => {
  const { s } = setup();
  engine.clearSnapshotHistory();
  s.skillPoints = 8;
  snapNow(5);
  for (let r = 6; r <= 10; r++) snapNow(r);

  shido.applyGuard(engine, s);
  s.hp = 0;
  engine.instantDeath(s);
  shido.applyRewind(engine, engine.players.S);

  const s2 = engine.players.S;
  assert.equal(s2.skillPoints, 8, 'แต้มสกิลถูกย้อนคืนมาเต็ม');
  assert.equal(s2.shidoRewindLock, 5 + shido.REWIND_LOCK_TURNS, 'แต่คูลดาวน์ไม่ถูกย้อนทิ้ง');

  engine.setRoundNumber(5);
  assert.equal(shido.canUseSkill(engine, s2, 'ultimate'), false, 'ยังกดไม่ได้ทั้งที่แต้มเต็ม');
  engine.setRoundNumber(5 + shido.REWIND_LOCK_TURNS - 1);
  assert.equal(shido.canUseSkill(engine, s2, 'ultimate'), false);
  engine.setRoundNumber(5 + shido.REWIND_LOCK_TURNS);
  assert.equal(shido.canUseSkill(engine, s2, 'ultimate'), true, 'ครบ 5 เทิร์นแล้วกดได้');
});

test('ย้อนเวลา: ยังไม่มีประวัติให้ย้อน -> ตาข่ายสำรองคืนชีพด้วยเลือดขั้นต่ำ', () => {
  const { s } = setup();
  engine.clearSnapshotHistory();
  shido.applyGuard(engine, s);
  s.hp = 0;
  engine.instantDeath(s);
  assert.equal(shido.applyRewind(engine, s), true);
  assert.equal(s.alive, true);
  assert.equal(s.hp, shido.REWIND_HEAL);
});
