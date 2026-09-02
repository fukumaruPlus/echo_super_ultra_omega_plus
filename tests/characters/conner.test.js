const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, resolveRound } = require('../../server.js');
const conner = require('../../characters/conner.js');

const saved = {
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  endTurn: engine.endTurn,
  skillFlash: engine.skillFlash,
  triggerCutscene: engine.triggerCutscene,
  queueCutscene: engine.queueCutscene,
  pausePlayingForCutscene: engine.pausePlayingForCutscene,
};

// วีดีโอที่ถูกคิวไว้ระหว่างเทสต์ — ใช้ยืนยันว่าคลิปชุดไล่ล่าเล่น "ทุกครั้ง" ไม่ใช่ครั้งเดียวต่อเกม
let queued = [];

test.before(() => {
  engine.startPhaseTimer = () => {};
  engine.broadcastState = () => {};
  engine.endTurn = () => {};
  engine.skillFlash = () => {};
  engine.triggerCutscene = (p, key) => {
    if (p.cutsceneShown[key]) return;
    p.cutsceneShown[key] = true;
    queued.push(key);
  };
  engine.queueCutscene = (p, key) => queued.push(key);
  engine.pausePlayingForCutscene = () => {};
});

test.after(() => {
  engine.clearPhaseTimer();
  Object.assign(engine, saved);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 7, armor: 3, shield: 0, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], cardBonus: 0, skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
  };
}

// สนามสะอาด: คอนเนอร์ + คู่ต่อสู้ 2 คน (C = คอนเนอร์, A = เป้าหมาย, B = คนนอกวงไล่ล่า)
function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = [];
  const c = mk('C', 'conner', 1);
  const a = mk('A', 'temari', 2);
  const b = mk('B', 'tohno', 3);
  for (const p of [c, a, b]) conner.resetCombat(p);
  engine.players.C = c;
  engine.players.A = a;
  engine.players.B = b;
  engine.setRoundNumber(3);
  engine.setGameState('PLAYING');
  return { c, a, b };
}

function withRandom(values, fn) {
  const real = Math.random;
  let i = 0;
  Math.random = () => (i < values.length ? values[i++] : 0.999);
  try { return fn(); } finally { Math.random = real; }
}

// ---------- สกิลติดตัว 1 สืบสวน ----------

test('ความเครียด: ไม่ลงที่ตัวคอนเนอร์เอง และไม่ทำงานเลยถ้าไม่มีคอนเนอร์ในสนาม', () => {
  const { c, a } = setup();
  conner.onSkillUsed(engine, c);
  assert.equal(conner.stressOf(c), 0);
  conner.onSkillUsed(engine, a);
  assert.equal(conner.stressOf(a), 1);
  c.alive = false; // คอนเนอร์ตาย = ระบบสืบสวนหยุดทำงาน (ค่าที่สะสมไว้ยังค้าง)
  conner.onSkillUsed(engine, a);
  assert.equal(conner.stressOf(a), 1);
});

test('ความเครียด: การจั่วไพ่นับ +1 ครั้งเดียวต่อเทิร์นไม่ว่าจะจั่วกี่ใบ', () => {
  const { a } = setup();
  conner.onCardDraw(engine, a);
  conner.onCardDraw(engine, a);
  conner.onCardDraw(engine, a);
  assert.equal(conner.stressOf(a), 1);
  conner.onRoundStartTick(engine, a); // เทิร์นใหม่ -> โควตาเต็มอีกครั้ง
  conner.onCardDraw(engine, a);
  assert.equal(conner.stressOf(a), 2);
});

test('ความเครียด: โจมตีปกติใส่คอนเนอร์ทำให้ "ผู้โจมตี" เครียด +2 (ไม่ใช่คอนเนอร์)', () => {
  const { c, a } = setup();
  conner.onConnerAttacked(engine, a, c);
  assert.equal(conner.stressOf(a), 2);
  assert.equal(conner.stressOf(c), 0);
});

test('ความเครียด: ลดลง 1 ต่อเทิร์น และไพ่แตกไม่ช่วยลดเพิ่ม (พื้นล่างที่ 0)', () => {
  const { a } = setup();
  a.connorStress = 5;
  conner.onEndTurnDecay(engine, a);
  assert.equal(conner.stressOf(a), 4);
  // balance 3.4.2: ไพ่แตกเคยลดความเครียดเพิ่มอีก 1 — เปิดช่องให้เป้าหมายยอมไพ่แตกทิ้งเทิร์น
  //  เพื่อกดความเครียดเป็นลบสุทธิจนจับกุมไม่ได้ตลอดเกม
  a.busted = true;
  conner.onEndTurnDecay(engine, a);
  assert.equal(conner.stressOf(a), 3, 'ไพ่แตกแล้วก็ยังลดแค่ 1 เท่าเดิม');
  a.connorStress = 1;
  conner.onEndTurnDecay(engine, a);
  assert.equal(conner.stressOf(a), 0);
});

test('ข่มขวัญ: ระดับผู้กระทำความผิดขึ้นไป บีบความเครียดได้ทีละ 2 (คิดจากระดับก่อนกด)', () => {
  const { c, a } = setup();
  a.connorStress = 3; // ผู้ต้องสงสัย -> +1 (ข้ามไปเป็นผู้กระทำความผิดพอดี)
  conner.applyIntimidate(engine, c, a);
  assert.equal(conner.stressOf(a), 4);
  conner.applyIntimidate(engine, c, a); // คราวนี้เริ่มจากผู้กระทำความผิด -> +2
  assert.equal(conner.stressOf(a), 6);
});

test('ระดับ: 0-3 ผู้ต้องสงสัย · 4-8 ผู้กระทำความผิด · 9-10 อาชญากร (เพดาน 10)', () => {
  const { a } = setup();
  const lv = (n) => { a.connorStress = n; return conner.levelKeyOf(a); };
  assert.equal(lv(0), 'suspect');
  assert.equal(lv(3), 'suspect');
  assert.equal(lv(4), 'offender');
  assert.equal(lv(8), 'offender');
  assert.equal(lv(9), 'criminal');
  a.connorStress = 0;
  conner.addStress(engine, a, 99);
  assert.equal(conner.stressOf(a), conner.STRESS_MAX);
});

test('ความเครียด: การเติมโน้ตของคีตกวีนับเป็นการกดสกิล +1 ต่อครั้ง', () => {
  const { a } = setup();
  a.characterId = 'bard';
  a.skillPoints = 8;
  a.bardNotes = [];
  a.bardNotesUsed = 0;
  engine.useSkill(a.id, 'basic');
  assert.equal(a.bardNotes.length, 1);
  assert.equal(conner.stressOf(a), 1);
  engine.useSkill(a.id, 'secondary');
  assert.equal(a.bardNotes.length, 2);
  assert.equal(conner.stressOf(a), 2);
});

// ---------- สกิลพื้นฐาน วิเคราะห์สถานการณ์ ----------

// ยิงคาดการณ์ 1 ครั้ง: ตั้งลำดับที่ทายไว้แล้วเรียกผ่านท่อจริงของ useSkill (applyInstantSkill)
function predict(c, target, guess) {
  c.connorGuess = conner.sanitizeGuess(guess);
  return conner.applyInstantSkill(engine, c, 'basic', target);
}

test('บันทึกลำดับการกระทำ: เก็บเฉพาะครั้งแรกของแต่ละประเภท และหมุนเป็น "เทิร์นที่แล้ว" ตอนขึ้นเทิร์นใหม่', () => {
  const { c, a } = setup();
  conner.onCardDraw(engine, a);
  conner.onSkillUsed(engine, a);
  conner.onCardDraw(engine, a);   // จั่วซ้ำ — ไม่เข้าลำดับอีก
  conner.onShopBuy(engine, a);
  assert.deepEqual(a.connorActions, ['draw', 'skill', 'shop']);
  conner.onRoundStartTick(engine, a);
  assert.deepEqual(conner.actionsPrevOf(a), ['draw', 'skill', 'shop']);
  assert.deepEqual(a.connorActions, []);
});

test('วิเคราะห์สถานการณ์: นับแบบเทียบช่องต่อช่อง — ผิดกลางทางแล้วช่องหลังยังถูกได้', () => {
  // จริง [draw, item, skill] · ทาย [draw, skill, skill] -> ช่อง 1 ถูก, ช่อง 2 ผิด, ช่อง 3 ถูก = 2
  const r = conner.scorePrediction(['draw', 'item', 'skill'], ['draw', 'skill', 'skill']);
  assert.equal(r.correct, 2);
  assert.equal(r.perfect, false);
  // ยาวไม่เท่ากัน = ไม่มีทาง perfect แม้ช่องที่ทายมาจะถูกหมด
  const r2 = conner.scorePrediction(['draw', 'item', 'skill'], ['draw']);
  assert.equal(r2.correct, 1);
  assert.equal(r2.perfect, false);
});

test('วิเคราะห์สถานการณ์: รางวัลเป็นเส้นตรง N:N (เลือด +N · แต้มสกิล +N)', () => {
  const { c, a } = setup();
  a.connorActionsPrev = ['draw', 'item', 'skill'];
  c.hp = 2; c.skillPoints = 0;
  predict(c, a, ['draw', 'item']);   // ถูก 2 ช่องแรก
  assert.equal(c.hp, 4, 'ถูก 2 ข้อ = เลือด +2');
  assert.equal(c.skillPoints, 2, 'ถูก 2 ข้อ = แต้มสกิล +2');
  assert.equal(conner.stressOf(a), 0, 'ยังไม่ครบทั้งลำดับ = ไม่มีความเครียด +5');
  assert.ok(!c.connorReadId, 'ยังไม่ได้สิทธิ์เห็นแต้มการ์ด');
});

test('วิเคราะห์สถานการณ์: ทายผิดหมด ไม่ได้อะไรเลย', () => {
  const { c, a } = setup();
  a.connorActionsPrev = ['draw', 'item'];
  c.hp = 2; c.skillPoints = 0;
  predict(c, a, ['shop', 'skill']);
  assert.equal(c.hp, 2);
  assert.equal(c.skillPoints, 0);
  assert.equal(conner.stressOf(a), 0);
});

test('วิเคราะห์สถานการณ์: ถูกครบทั้งลำดับ -> ความเครียด +5 และเห็นแต้มการ์ดของเป้าหมาย', () => {
  const { c, a } = setup();
  a.connorActionsPrev = ['draw', 'skill'];
  c.hp = 1; c.skillPoints = 0;
  predict(c, a, ['draw', 'skill']);
  assert.equal(c.hp, 3, 'ถูก 2 ข้อ = เลือด +2');
  assert.equal(c.skillPoints, 2);
  assert.equal(conner.stressOf(a), conner.PREDICT_PERFECT_STRESS);
  assert.equal(conner.readsScoreOf(c, a), true);
  assert.equal(conner.readsScoreOf(c, engine.players.B), false, 'เห็นของเป้าหมายคนเดียว');
  conner.onRoundStartTick(engine, c);
  assert.equal(conner.readsScoreOf(c, a), false, 'หมดสิทธิ์เมื่อขึ้นเทิร์นใหม่');
});

test('วิเคราะห์สถานการณ์: ทาย "ไม่ได้ทำอะไรเลย" ถูก = นับเป็นถูกทุกข้อ แต่ได้ 0 ข้อจึงไม่มีเลือด/แต้มสกิล', () => {
  const { c, a } = setup();
  a.connorActionsPrev = [];
  c.hp = 2; c.skillPoints = 0;
  predict(c, a, []);
  assert.equal(c.hp, 2, 'ถูก 0 ข้อ = ไม่ได้เลือด');
  assert.equal(c.skillPoints, 0);
  assert.equal(conner.stressOf(a), conner.PREDICT_PERFECT_STRESS, 'แต่ยังนับเป็นถูกทั้งลำดับ');
  assert.equal(conner.readsScoreOf(c, a), true);
});

test('วิเคราะห์สถานการณ์: ทายว่างทั้งที่เป้าหมายทำอะไรไป = ผิด ไม่ได้อะไร', () => {
  const { c, a } = setup();
  a.connorActionsPrev = ['draw'];
  predict(c, a, []);
  assert.equal(conner.stressOf(a), 0);
  assert.ok(!c.connorReadId);
});

test('วิเคราะห์สถานการณ์: payload ผิดรูปถูกปฏิเสธ · ตัวซ้ำถูกยุบเหลือครั้งแรก', () => {
  assert.equal(conner.sanitizeGuess(['draw', 'ระเบิด']), null, 'คีย์แปลกปลอม = ไม่รับ');
  assert.deepEqual(conner.sanitizeGuess(['draw', 'skill', 'draw']), ['draw', 'skill']);
  assert.deepEqual(conner.sanitizeGuess([]), []);
});

test('วิเคราะห์สถานการณ์: กดไม่ได้ในเทิร์นแรก และระหว่างอยู่ในโหมดจับกุมขั้นเด็ดขาด', () => {
  const { c, a } = setup();
  assert.equal(conner.canUseSkill(engine, c, 'basic'), true);
  engine.setRoundNumber(1);
  assert.equal(conner.canUseSkill(engine, c, 'basic'), false, 'เทิร์นแรกยังไม่มี "เทิร์นที่แล้ว" ให้ทาย');
  engine.setRoundNumber(5);
  c.connorChase = { targetId: a.id, round: 0, mine: 0, theirs: 0 };
  assert.equal(conner.canUseSkill(engine, c, 'basic'), false);
});

// ---------- สกิลรอง ข่มขวัญ/จับกุม ----------

test('ข่มขวัญ: ระดับผู้ต้องสงสัย ได้แค่ผลพื้นฐาน (+1 เครียด, -1 แต้มสกิลเป้าหมาย)', () => {
  const { c, a } = setup();
  a.skillPoints = 5;
  c.skillPoints = 4;
  conner.applyInstantSkill(engine, c, 'secondary', a);
  assert.equal(conner.stressOf(a), 1);
  assert.equal(a.skillPoints, 4);
  assert.equal(c.skillPoints, 4);          // ยังไม่ได้โบนัสคืนแต้ม
  assert.equal(queued.includes('connorInterrogate'), false);
});

test('ข่มขวัญ: ระดับถูกประเมินหลังบวกความเครียด — 3 -> 4 ได้โบนัสผู้กระทำความผิดทันที', () => {
  const { c, a } = setup();
  a.connorStress = 3;
  c.skillPoints = 4;
  conner.applyInstantSkill(engine, c, 'secondary', a);
  assert.equal(conner.levelKeyOf(a), 'offender');
  assert.equal(c.skillPoints, 5);                        // ฟื้นแต้มสกิลให้ตัวเอง +1
  assert.equal(queued.includes('connorInterrogate'), true);
});

test('ข่มขวัญ: ระดับอาชญากรได้โบนัสสะสม (ผู้กระทำความผิด + คำขาดจับกุม)', () => {
  const { c, a } = setup();
  a.connorStress = 8;
  c.skillPoints = 4;
  conner.applyInstantSkill(engine, c, 'secondary', a);
  assert.equal(conner.levelKeyOf(a), 'criminal');
  assert.equal(c.skillPoints, 5);                        // โบนัสผู้กระทำความผิดยังได้
  assert.ok(a.connorArrestAsk);                          // และเปิดฉากจับกุมต่อ
  assert.equal(a.connorArrestAsk.fromId, c.id);
});

// ---------- สกิลติดตัว 2 จับกุมขั้นเด็ดขาด ----------

test('ยอมจำนน: ความเครียดเป็น 0 + สตั้น 3 เทิร์น + ผู้ต้องหา 5 เทิร์น (ไม่มีการไล่ล่า)', () => {
  const { c, a } = setup();
  a.connorStress = 9;
  conner.askArrest(engine, c, a);
  conner.answerArrest(engine, a, true);
  assert.equal(conner.stressOf(a), 0);
  assert.equal(a.statuses.stun, 3);
  assert.equal(a.statuses.accused, 5);
  assert.equal(conner.chaseActive(engine), false);
});

test('ขัดขืน: เริ่มไล่ล่า เล่นวีดีโอ และแช่ผู้เล่นนอกวง (บังคับไพ่แตก + ล็อกไพ่)', () => {
  const { c, a, b } = setup();
  a.connorStress = 9;
  conner.askArrest(engine, c, a);
  conner.answerArrest(engine, a, false);
  assert.equal(conner.chaseActive(engine), true);
  assert.equal(queued.includes('connorArrest1'), true);
  assert.equal(b.connorFrozen, true);
  assert.equal(b.locked, true);
  assert.equal(engine.bustedOf(b), true);
  // จั่วไพ่: คอนเนอร์กับเป้าหมายยังจั่วได้ คนนอกจั่วไม่ได้
  assert.equal(conner.actionBlocked(engine, c), false);
  assert.equal(conner.actionBlocked(engine, a), false);
  assert.equal(conner.actionBlocked(engine, b), true);
  // สกิล/ไอเทม: ห้ามทุกคนระหว่างไล่ล่า รวมคอนเนอร์และเป้าหมายเอง
  assert.equal(conner.skillBlocked(engine, c), true);
  assert.equal(conner.skillBlocked(engine, a), true);
  assert.equal(conner.skillBlocked(engine, b), true);
  conner.endChase(engine, c);
  assert.equal(conner.skillBlocked(engine, c), false);
});

test('ไล่ล่า: นับแต้ม 3 ครั้ง — เทิร์นเสมอไม่มีใครได้แต้ม และวีดีโอเล่นครบทุกครั้ง', () => {
  const { c, a } = setup();
  a.connorStress = 9;
  conner.askArrest(engine, c, a);
  conner.answerArrest(engine, a, false);
  queued = [];

  const setScores = (mine, theirs) => {
    c.cards = [{ value: mine, color: 'red' }];
    a.cards = [{ value: theirs, color: 'red' }];
  };

  setScores(10, 5);                       // ครั้งที่ 1: คอนเนอร์ได้แต้ม
  assert.equal(conner.chaseResolveRound(engine), true);
  assert.deepEqual([c.connorChase.mine, c.connorChase.theirs], [1, 0]);
  assert.equal(queued.includes('connorArrest2'), true);

  setScores(7, 7);                        // ครั้งที่ 2: เสมอ = ไม่มีใครได้แต้ม
  conner.chaseResolveRound(engine);
  assert.deepEqual([c.connorChase.mine, c.connorChase.theirs], [1, 0]);
  assert.equal(queued.includes('connorArrest3'), true);

  setScores(4, 9);                        // ครั้งที่ 3: เป้าหมายได้แต้ม -> จบที่ 1:1
  conner.chaseResolveRound(engine);
  assert.equal(conner.chaseActive(engine), false);
});

test('ไล่ล่า: ใครถึง 2 แต้มก่อน ตัดจบทันทีไม่ต้องนับครบ 3 ครั้ง', () => {
  const { c, a } = setup();
  a.connorStress = 9;
  a.armor = 0;
  conner.askArrest(engine, c, a);
  conner.answerArrest(engine, a, false);
  queued = [];

  const setScores = (mine, theirs) => {
    c.cards = [{ value: mine, color: 'red' }];
    a.cards = [{ value: theirs, color: 'red' }];
  };

  setScores(10, 4);                       // 1 : 0
  conner.chaseResolveRound(engine);
  assert.deepEqual([c.connorChase.mine, c.connorChase.theirs], [1, 0]);
  assert.equal(queued.includes('connorArrest2'), true);

  setScores(9, 3);                        // 2 : 0 -> ตัดจบทันทีตั้งแต่ครั้งที่ 2
  conner.chaseResolveRound(engine);
  assert.equal(conner.chaseActive(engine), false);
  assert.equal(queued.includes('connorArrest3'), false); // ข้ามคลิประหว่างทาง
  assert.equal(queued.includes('connorArrestTrue'), true);
  assert.equal(a.statuses.stun, 3);
});

test('ไล่ล่า: เป้าหมายถึง 2 แต้มก่อนก็ตัดจบทันทีเหมือนกัน', () => {
  const { c, a } = setup();
  a.connorStress = 9;
  conner.askArrest(engine, c, a);
  conner.answerArrest(engine, a, false);
  queued = [];
  const setScores = (mine, theirs) => {
    c.cards = [{ value: mine, color: 'red' }];
    a.cards = [{ value: theirs, color: 'red' }];
  };
  setScores(3, 10);
  conner.chaseResolveRound(engine);
  setScores(2, 9);
  conner.chaseResolveRound(engine);
  assert.equal(conner.chaseActive(engine), false);
  assert.equal(queued.includes('connorArrestFalse'), true);
  assert.equal(c.statuses.stun, 3);
});

test('ไล่ล่า: เสมอ (1:1) = คอนเนอร์แพ้ — เป้าหมายหนีรอด คอนเนอร์สตั้น 3 เทิร์น', () => {
  const { c, a } = setup();
  a.connorStress = 9;
  conner.startChase(engine, c, a, false);
  queued = [];
  conner.finishChase(engine, c, a, { targetId: a.id, round: 3, mine: 1, theirs: 1 });
  assert.equal(queued.includes('connorArrestFalse'), true);
  assert.equal(conner.stressOf(a), 0);
  assert.equal(c.statuses.stun, 3);
  assert.equal(a.statuses.accused, undefined);
  assert.equal(conner.chaseActive(engine), false);
});

test('ไล่ล่า: คอนเนอร์ชนะ — เป้าหมายเสียเลือด 3 สตั้น 3 ผู้ต้องหา 5 และความเครียดเป็น 0', () => {
  const { c, a } = setup();
  a.connorStress = 10;
  a.armor = 0;
  conner.startChase(engine, c, a, false);
  queued = [];
  const hpBefore = a.hp;
  conner.finishChase(engine, c, a, { targetId: a.id, round: 3, mine: 2, theirs: 1 });
  assert.equal(queued.includes('connorArrestTrue'), true);
  assert.equal(a.hp, hpBefore - 3);
  assert.equal(a.statuses.stun, 3);
  assert.equal(a.statuses.accused, 5);
  assert.equal(conner.stressOf(a), 0);
  assert.equal(conner.chaseActive(engine), false);
});

test('ไล่ล่า: คอนเนอร์ตายกลางคัน -> cleanupChase ปลดธง "ถูกแช่" ของทุกคน', () => {
  const { c, a, b } = setup();
  conner.startChase(engine, c, a, false);
  assert.equal(b.connorFrozen, true);
  c.alive = false;
  conner.cleanupChase(engine);
  assert.equal(b.connorFrozen, false);
  assert.equal(engine.bustedOf(b), false);
  assert.equal(c.connorChase, null);
});

// ---------- สกิลติดตัว 3 ปัญญาประดิษฐ์ ----------

test('ฟื้นคืนชีพ: ครบ 10 เทิร์นถึงจะกลับมา ด้วยเลือด 3 เกราะ 2 และได้แค่ 2 ครั้งต่อเกม', () => {
  const { c } = setup();
  engine.setRoundNumber(5);
  c.alive = false;
  conner.onDeath(engine, c);
  assert.equal(c.connorReviveRound, 15);

  engine.setRoundNumber(14);
  assert.equal(conner.maybeRevive(engine, c), false); // ยังไม่ครบ 10 เทิร์น
  engine.setRoundNumber(15);
  assert.equal(conner.maybeRevive(engine, c), true);
  assert.equal(c.alive, true);
  assert.equal(c.hp, 3);
  assert.equal(c.armor, 2);
  assert.equal(c.connorRevives, 1);

  // ครั้งที่ 2 ยังได้ — ครั้งที่ 3 หมดโควตา
  c.alive = false;
  conner.onDeath(engine, c);
  engine.setRoundNumber(25);
  assert.equal(conner.maybeRevive(engine, c), true);
  assert.equal(c.connorRevives, 2);
  c.alive = false;
  conner.onDeath(engine, c);
  assert.equal(c.connorReviveRound, 0);
});

// ---------- สกิลติดตัว 4 การป้องกันตัว ----------

test('การป้องกันตัว: ตีคนที่ติด "ผู้ต้องหา" แรงขึ้น +2 (คนอื่นไม่ได้โบนัสนี้)', () => {
  const { c, a } = setup();
  assert.equal(conner.damageBonus(engine, c, a), 0);
  a.statuses.accused = 2;
  assert.equal(conner.damageBonus(engine, c, a), 2);
  assert.equal(conner.damageBonus(engine, engine.players.B, a), 0); // ไม่ใช่คอนเนอร์ = ไม่ได้โบนัส
});

test('การป้องกันตัว: สวนกลับเฉพาะตอนผู้โจมตีเปลี่ยนหน้า และคิววีดีโอก่อนลงดาเมจ', () => {
  const { c, a, b } = setup();
  a.armor = 0; b.armor = 0;
  // คนแรกที่ตี: ยังไม่มี "คนก่อนหน้า" ให้เทียบ -> ไม่โรลเลย
  assert.equal(withRandom([0.01], () => conner.onAttackedNormally(engine, a, c)), false);
  // คนเดิมตีซ้ำ -> ไม่โรล
  assert.equal(withRandom([0.01], () => conner.onAttackedNormally(engine, a, c)), false);
  // คนละคน + ทอยติด 15% -> คิววีดีโอไว้ แต่ยังไม่มีดาเมจจนกว่าจะ resolvePendingCounter
  queued = [];
  const aHp = a.hp; const bHp = b.hp;
  assert.equal(withRandom([0.01], () => conner.onAttackedNormally(engine, b, c)), true);
  assert.equal(queued.includes('connorSelfDefense'), true);
  assert.equal(a.hp, aHp);
  assert.equal(b.hp, bHp);
  conner.resolvePendingCounter(engine);
  assert.equal(a.hp, aHp - 1);
  assert.equal(b.hp, bHp - 1);
});

test('การป้องกันตัว: ทอยไม่ติด (>= 15%) ไม่เกิดอะไรเลย', () => {
  const { c, a, b } = setup();
  conner.onAttackedNormally(engine, a, c);
  assert.equal(withRandom([0.9], () => conner.onAttackedNormally(engine, b, c)), false);
  assert.equal(c.connorCounterPending, null);
});

// ---------- โหมดไล่ล่าระงับกติกาปกติของ resolveRound ----------

test('resolveRound: ระหว่างไล่ล่าไม่มีผู้ชนะ/ผู้แพ้ และไม่มีใครเสียเลือดจากการแพ้จั่ว', () => {
  const { c, a, b } = setup();
  conner.startChase(engine, c, a, false);
  c.cards = [{ value: 10, color: 'red' }];
  a.cards = [{ value: 3, color: 'red' }];   // แต้มน้อยสุดแบบปกติจะโดนดาเมจแพ้
  const hp = { c: c.hp, a: a.hp, b: b.hp };
  const armor = { c: c.armor, a: a.armor, b: b.armor };
  resolveRound();
  assert.equal(c.hp, hp.c); assert.equal(a.hp, hp.a); assert.equal(b.hp, hp.b);
  assert.equal(c.armor, armor.c); assert.equal(a.armor, armor.a); assert.equal(b.armor, armor.b);
  assert.equal(c.result, 'safe');
  assert.equal(a.result, 'safe');
  assert.equal(b.result, 'safe');
  assert.equal(c.connorChase.round, 1);
});

// ---------- ท่าไม้ตาย จัดการปิดคดี ----------

test('จัดการปิดคดี: เล็งได้เฉพาะระดับอาชญากร และดาเมจ 6 หน่วย', () => {
  const { c, a } = setup();
  a.connorStress = 8;
  assert.equal(conner.canUseSkill(engine, c, 'ultimate'), false);
  assert.equal(conner.prepareTarget(engine, c, 'ultimate', [a.id]), null);
  a.connorStress = 9;
  assert.equal(conner.canUseSkill(engine, c, 'ultimate'), true);
  assert.equal(conner.prepareTarget(engine, c, 'ultimate', [a.id]), a);

  a.armor = 0;
  const hpBefore = a.hp;
  conner.applyCloseCase(engine, c, a);
  assert.equal(conner.CLOSE_CASE_DMG, 5);
  assert.equal(a.hp, hpBefore - conner.CLOSE_CASE_DMG);
});

test('จัดการปิดคดี: หลบหลีกได้ — สแตคหลบถูกใช้และดาเมจไม่ลง', () => {
  const { c, a } = setup();
  a.connorStress = 10;
  a.armor = 0;
  engine.grantEvadeStack(a, 100);
  const hpBefore = a.hp;
  withRandom([0.1], () => conner.applyCloseCase(engine, c, a));
  assert.equal(a.hp, hpBefore);
  assert.equal(a.statuses.evade || 0, 0);
});

test('จัดการปิดคดี: วีดีโอเล่นทุกครั้งที่ปล่อยท่า (ไม่ใช่ครั้งเดียวต่อเกม)', () => {
  const { c } = setup();
  queued = [];
  conner.queueCloseCaseVideo(engine, c);
  conner.queueCloseCaseVideo(engine, c);
  conner.queueCloseCaseVideo(engine, c);
  assert.deepEqual(queued, ['connorCloseCase', 'connorCloseCase', 'connorCloseCase']);
});
