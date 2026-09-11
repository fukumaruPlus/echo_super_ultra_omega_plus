const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const cay = require('../../characters/cayenne.js');
const CHARACTERS = require('../../characters.js');

const saved = {
  triggerCutscene: engine.triggerCutscene,
  skillFlash: engine.skillFlash,
};
const realRandom = Math.random;

let triggered = [];

test.before(() => {
  engine.triggerCutscene = (p, key) => { triggered.push(key); };
  engine.skillFlash = () => {};
});

test.after(() => {
  engine.clearPhaseTimer();
  Math.random = realRandom;
  Object.assign(engine, saved);
});

test.afterEach(() => {
  engine.clearPhaseTimer();
  Math.random = realRandom;
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 10, maxHpPenalty: 0, armor: 0, shield: 0, tempHp: 0,
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 20, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, cardBonus: 0,
  };
}

function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  triggered = [];
  const K = mk('K', 'cayenne', 1);
  const A = mk('A', 'temari', 2);
  const C = mk('C', 'temari', 3);
  engine.players.K = K; engine.players.A = A; engine.players.C = C;
  cay.resetCombat(K);
  engine.setRoundNumber(3);
  engine.setGameMode('ffa');
  engine.setGameState('PLAYING');
  return { K, A, C };
}

function gepard(K) {
  K.statuses.cayGepard = cay.GEPARD_TURNS;
}

function attack(K, target) {
  engine.setGameState('ATTACK');
  engine.setAttackerId(K.id);
  engine.doAttack(K.id, target.id);
  engine.clearPhaseTimer();
}

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('ข้อมูลตัวละครลงทะเบียนครบ (กลาง · 2/4/8 แต้ม · สกิลติดตัว 2 ช่อง)', () => {
  const ch = CHARACTERS.CHAR_BY_ID.cayenne;
  assert.ok(ch);
  assert.equal(ch.difficulty, 'medium');
  assert.equal(ch.basic.cost, 2);
  assert.equal(ch.secondary.cost, 4);
  assert.equal(ch.ultimate.cost, 8);
  assert.ok(ch.passive && ch.passive2);
  assert.equal(engine.CHAR_HOOKS.cayenne, cay);
});

test('วีดีโอทั้ง 3 คลิปมีในตาราง และต้อง afterReveal:false (คิวเองจากโค้ด)', () => {
  for (const k of ['cayGepard', 'cayBarrage', 'cayMissile']) {
    assert.ok(engine.TRANSFORMS[k] && engine.TRANSFORMS[k].video, `ต้องมีคลิป ${k}`);
    assert.equal(engine.TRANSFORMS[k].afterReveal, false);
  }
});

test('เริ่มเกม: กระสุน 3 แม็ก แรงใจ 0', () => {
  const { K } = setup();
  assert.equal(cay.ammoOf(K), 3);
  assert.equal(K.cayMorale, 0);
});

// ---------------------------------------------------------------- สกิลพื้นฐาน
test('ปืนพกหน่วยรบ: กระสุน +1 (เพดาน 3) · แรงใจ +1 · ติดปืนพก · ไม่กินโควตาสกิล · 1 ครั้ง/เทิร์น', () => {
  const { K } = setup();
  K.cayAmmo = 1;
  engine.useSkill('K', 'basic');
  assert.equal(K.cayAmmo, 2);
  assert.equal(K.cayMorale, 1);
  assert.equal(K.statuses.cayPistol, 1);
  assert.equal(K.skillPoints, 18);
  assert.ok(!K.skillUsedRound, 'ไม่นับเป็นการใช้สกิลของเทิร์น');

  engine.useSkill('K', 'basic');
  assert.equal(K.skillPoints, 18, 'กดซ้ำในเทิร์นเดียวกันไม่ได้');

  K.cayAmmo = 3;
  engine.setRoundNumber(4);
  engine.useSkill('K', 'basic');
  assert.equal(K.cayAmmo, 3, 'กระสุนไม่เกิน 3');
  assert.equal(K.cayMorale, 2);
});

test('แรงใจครบ 5 -> แปลงร่างเกพาร์ด 10 เทิร์น (ภาพ/เพลง/เสียงปืน) และแรงใจรีเซ็ต', () => {
  const { K } = setup();
  K.cayMorale = 4;
  engine.useSkill('K', 'basic');
  assert.equal(K.statuses.cayGepard, 10);
  assert.equal(K.cayMorale, 0);
  assert.deepEqual(triggered, ['cayGepard']);
  assert.equal(engine.displayImg(K), cay.IMG.gepard);
  assert.equal(cay.attackSound(K), 'cayenne_gun');
  assert.equal(cay.activeMusic(engine).music, 'cayenne_theme');

  // ระหว่างเป็นเกพาร์ด แรงใจไม่สะสม
  engine.setRoundNumber(4);
  engine.useSkill('K', 'basic');
  assert.equal(K.cayMorale, 0);

  cay.onGepardExpire(engine, K);
  delete K.statuses.cayGepard;
  assert.equal(K.cayMorale, 0);
  assert.notEqual(engine.displayImg(K), cay.IMG.gepard, 'หมดร่างแล้วกลับเป็นภาพปกติ');
  assert.equal(cay.attackSound(K), undefined);
});

// ---------------------------------------------------------------- สกิลรอง / ท่าไม้ตาย: ต้องเป็นเกพาร์ด
test('สกิลรอง/ท่าไม้ตายกดไม่ได้ถ้าไม่ใช่เกพาร์ด หรือกระสุนไม่พอ', () => {
  const { K } = setup();
  assert.equal(cay.canUseSkill(engine, K, 'secondary'), false);
  assert.equal(cay.canUseSkill(engine, K, 'ultimate'), false);
  gepard(K);
  assert.equal(cay.canUseSkill(engine, K, 'secondary'), true);
  assert.equal(cay.canUseSkill(engine, K, 'ultimate'), true);
  K.cayAmmo = 1;
  assert.equal(cay.canUseSkill(engine, K, 'ultimate'), false, 'มิสไซล์ต้องใช้ 2 แม็ก');
  K.cayAmmo = 0;
  assert.equal(cay.canUseSkill(engine, K, 'secondary'), false);
});

test('แน่จริงก็หลบสิ: ใช้กระสุน 1 · บรรจุค้างไว้ · กดซ้ำระหว่างบรรจุค้างไม่ได้', () => {
  const { K } = setup();
  gepard(K);
  engine.useSkill('K', 'secondary');
  assert.equal(K.cayAmmo, 2);
  assert.equal(K.cayBarrage, true);
  assert.equal(cay.canUseSkill(engine, K, 'secondary'), false);
});

// ---------------------------------------------------------------- ชุดกระสุน 4 นัด
test('ชุดกระสุน: นัดละ 1 · นัดที่ 4 ไม่ลั่น (สุ่มไม่ผ่าน) · บัฟพลังโจมตีของผู้ยิงไม่มีผล', () => {
  const { K, A } = setup();
  K.cayBarrage = true;
  K.statuses.might = 3; K.statusAmt.might = 3; // บัฟต้องไม่มีผล
  Math.random = () => 0.99;                     // ไม่ติดเปราะบาง · นัดที่ 4 ไม่ลั่น
  attack(K, A);
  assert.equal(A.hp, 7, '3 นัด นัดละ 1');
  assert.equal(engine.lastAttack.dmg, 3);
  assert.equal(K.cayBarrage, false, 'ออกหมัดแล้วใช้ชุดกระสุนไป');
});

test('ชุดกระสุน + เกพาร์ด: เปราะบางจากนัดก่อนเพิ่มดาเมจตั้งแต่นัดถัดไป (ไม่ใช่นัดที่แปะ)', () => {
  const { K, A } = setup();
  gepard(K);
  K.cayBarrage = true;
  Math.random = () => 0;                         // ติดเปราะบางทุกนัด · นัดที่ 4 ลั่น
  attack(K, A);
  // นัด 1 = 1 (แปะเปราะบางหลังโดน) · นัด 2-4 = 2 ต่อนัด (เปราะบาง 1 ไม่ซ้อนจำนวน)
  assert.equal(A.hp, 10 - (1 + 2 + 2 + 2));
  assert.equal(engine.lastAttack.dmg, 7);
  assert.equal(A.statusAmt.fragile, 1);
  assert.equal(A.statuses.fragile, cay.FRAGILE_TURNS);
});

test('ชุดกระสุน: "หลบหลีก" หลบได้ทีละนัด — นัดแรกถูกหลบแต่นัดที่เหลือยังยิงต่อ', () => {
  const { K, A } = setup();
  K.cayBarrage = true;
  engine.grantEvadeStack(A);
  A.statusAmt.evade = 100;
  Math.random = () => 0.99;                      // หลบหลีก 100% ผ่าน · นัดที่ 4 ไม่ลั่น
  attack(K, A);
  assert.equal(A.hp, 8, 'นัด 1 ถูกหลบ นัด 2-3 เข้า');
  assert.ok(!A.statuses.evade, 'สแตคหลบถูกใช้ไป 1');
  assert.equal(engine.gameState, 'ATTACKING', 'การโจมตีไม่จบตั้งแต่นัดแรกที่ถูกหลบ');
});

test('ดีบัฟของเป้าหมายมีผลกับกระสุน (คุ้มครองลดดาเมจต่อนัด)', () => {
  const { K, A } = setup();
  K.cayBarrage = true;
  A.statuses.guard = 3; A.statusAmt.guard = 1;
  Math.random = () => 0.99;
  attack(K, A);
  assert.equal(A.hp, 10, 'คุ้มครอง 1 กินกระสุนนัดละ 1 หมด');
});

// ---------------------------------------------------------------- โจมตีปกติ
test('เกพาร์ด: โจมตีปกติติดเปราะบาง 50% โดยหมัดนั้นยังไม่แรงขึ้น · ไม่ใช่เกพาร์ดไม่ติด', () => {
  const { K, A, C } = setup();
  Math.random = () => 0;
  attack(K, A);
  assert.ok(!A.statuses.fragile, 'ร่างปกติไม่ติดเปราะบาง');

  gepard(K);
  const base = computeAttackBase(engine, K, C).base;
  attack(K, C);
  assert.equal(C.hp, 10 - base, 'หมัดที่แปะเปราะบางยังไม่แรงขึ้น');
  assert.equal(C.statusAmt.fragile, 1);
});

test('ปืนพก: โจมตีปกติเข้าเป้าฟื้นพลังชีวิต 3 ครั้งเดียวแล้วหมด', () => {
  const { K, A } = setup();
  K.hp = 3;
  K.statuses.cayPistol = 1;
  Math.random = () => 0.99;
  attack(K, A);
  assert.equal(K.hp, 6);
  assert.ok(!K.statuses.cayPistol);
});

// ---------------------------------------------------------------- ทหารผ่านศึก
test('ทหารผ่านศึก: ไม่ใช่เกพาร์ด = ความเสียหายเลื่อนไปต้นเทิร์นถัดไป · เกพาร์ดโดนทันที', () => {
  const { K } = setup();
  K.armor = 1;
  engine.withEffectSource('A', () => engine.dealMixed(K, 3));
  assert.equal(K.hp, 10);
  assert.equal(K.armor, 1);
  assert.equal(cay.pendingTotal(K), 3);
  cay.onRoundStartTick(engine, K);
  assert.equal(K.armor, 0, 'ลงผลด้วยช่องทางเดิม (เกราะก่อน)');
  assert.equal(K.hp, 8);
  assert.equal(cay.pendingTotal(K), 0);

  gepard(K);
  engine.withEffectSource('A', () => engine.dealMixed(K, 2));
  assert.equal(K.hp, 6);
});

test('ทหารผ่านศึก: ครอบคลุมดาเมจแพ้จั่ว/ไพ่แตก (damageSoft) และทะลุเกราะ', () => {
  const { K } = setup();
  K.armor = 2;
  engine.damageSoft(K);
  engine.damageSoft(K);
  engine.withEffectSource('A', () => engine.dealDirect(K, 1));
  assert.equal(K.armor, 2);
  assert.equal(K.hp, 10);
  assert.equal(cay.pendingTotal(K), 3);
  cay.onRoundStartTick(engine, K);
  assert.equal(K.armor, 0, 'damageSoft ลงเกราะก่อน');
  assert.equal(K.hp, 9, 'ดาเมจทะลุเกราะลงเลือดตรง');
});

test('ทหารผ่านศึก: ความเสียหายที่เลื่อนไว้ฆ่าได้จริงตอนลงผล', () => {
  const { K } = setup();
  K.hp = 2;
  engine.withEffectSource('A', () => engine.dealMixed(K, 5));
  assert.equal(K.alive, true);
  cay.onRoundStartTick(engine, K);
  assert.equal(K.alive, false);
});

test('ทหารผ่านศึก: หมัดที่ถูกเลื่อนขึ้นป้ายฝั่งป้องกัน', () => {
  const { K, A } = setup();
  A.characterId = 'temari';
  engine.setGameState('ATTACK');
  engine.setAttackerId('A');
  engine.doAttack('A', 'K');
  engine.clearPhaseTimer();
  assert.equal(K.hp, 10);
  assert.ok(cay.pendingTotal(K) > 0);
  assert.ok(engine.lastAttack.skills.some((s) => s.name.includes('ทหารผ่านศึก')));
});

// ---------------------------------------------------------------- มิสไซล์
test('สุ่มมิสไซล์: รวม 8 ลูก เพดาน 4 ลูก/คน', () => {
  assert.deepEqual([...cay.rollMissiles([{ id: 'a' }]).values()], [4]);
  assert.deepEqual([...cay.rollMissiles([{ id: 'a' }, { id: 'b' }]).values()], [4, 4]);
  for (let i = 0; i < 50; i++) {
    const hits = [...cay.rollMissiles([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]).values()];
    assert.equal(hits.reduce((s, n) => s + n, 0), 8);
    assert.ok(hits.every((n) => n <= 4));
  }
});

test('มิสไซล์แห่งคำอำลา: ใช้กระสุน 2 · ยิงเฉพาะฝ่ายตรงข้าม รวม 8 หน่วย', () => {
  const { K, A, C } = setup();
  gepard(K);
  engine.useSkill('K', 'ultimate');
  assert.equal(K.cayAmmo, 1);
  assert.ok(triggered.includes('cayMissile'));
  assert.equal((10 - A.hp) + (10 - C.hp), 8);
  assert.equal(K.hp, 10, 'ไม่โดนตัวเอง');
});

// ---------------------------------------------------------------- วีดีโออย่างละ 1 ครั้งต่อเกม
test('แน่จริงก็หลบสิ: วีดีโอเล่นก่อนยิงเฉพาะครั้งแรกของเกม ครั้งถัดไปขึ้นแค่การ์ดแจ้งเตือน', () => {
  const { K } = setup();
  K.cayBarrage = true;
  assert.equal(cay.barrageNeedsVideo(K), true);
  cay.startBarrageVideo(engine, K);
  assert.equal(cay.barrageNeedsVideo(K), false, 'กันวนซ้ำหลังวีดีโอ');
  assert.equal(cay.consumeBarrage(engine, K), true);
  assert.deepEqual(triggered, ['cayBarrage'], 'ไม่แจ้งซ้ำหลังเพิ่งเล่นวีดีโอ');

  K.cutsceneShown.cayBarrage = true;
  K.cayBarrage = true;
  assert.equal(cay.barrageNeedsVideo(K), false, 'เคยเล่นแล้วในเกมนี้');
  cay.consumeBarrage(engine, K);
  assert.deepEqual(triggered, ['cayBarrage', 'cayBarrage'], 'ครั้งถัดไปผ่าน triggerCutscene -> การ์ดแจ้งเตือน');
});
