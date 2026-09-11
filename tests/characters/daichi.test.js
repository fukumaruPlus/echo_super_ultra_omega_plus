const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const daichi = require('../../characters/daichi.js');
const CHARACTERS = require('../../characters.js');

const saved = {
  triggerCutscene: engine.triggerCutscene,
  skillFlash: engine.skillFlash,
};
const realRandom = Math.random;
let savedDeck = null;
let triggered = [];

test.before(() => {
  savedDeck = engine.centralDeck;
  engine.triggerCutscene = (p, key) => { triggered.push(key); };
  engine.skillFlash = () => {};
});

test.after(() => {
  engine.clearPhaseTimer();
  Math.random = realRandom;
  engine.setCentralDeck(savedDeck);
  Object.assign(engine, saved);
});

test.afterEach(() => {
  engine.clearPhaseTimer();
  Math.random = realRandom;
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 6, maxHpPenalty: 0, armor: 0, shield: 0, tempHp: 0,
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
  const D = mk('D', 'daichi', 1);
  const A = mk('A', 'temari', 2);
  const C = mk('C', 'temari', 3);
  A.hp = 10; C.hp = 10;
  engine.players.D = D; engine.players.A = A; engine.players.C = C;
  for (const p of [D, A, C]) daichi.resetCombat(p);
  engine.setRoundNumber(3);
  engine.setGameMode('ffa');
  engine.setGameState('PLAYING');
  return { D, A, C };
}

function unite(D) { D.statuses.daichiUnite = daichi.UNITE_TURNS; }

function attack(D, target) {
  engine.setGameState('ATTACK');
  engine.setAttackerId(D.id);
  engine.doAttack(D.id, target.id);
  engine.clearPhaseTimer();
}

const card = (value) => ({ value, color: 'red' });

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('ข้อมูลตัวละครลงทะเบียนครบ (ง่าย · 1/3/6 แต้ม)', () => {
  const ch = CHARACTERS.CHAR_BY_ID.daichi;
  assert.ok(ch);
  assert.equal(ch.difficulty, 'easy');
  assert.equal(ch.basic.cost, 1);
  assert.equal(ch.secondary.cost, 3);
  assert.equal(ch.ultimate.cost, 6);
  assert.equal(engine.CHAR_HOOKS.daichi, daichi);
});

test('วีดีโอทั้ง 4 คลิปมีในตาราง และต้อง afterReveal:false', () => {
  for (const k of ['daichiUnite', 'daichiGomora', 'daichiEleking', 'daichiBemstar']) {
    assert.ok(engine.TRANSFORMS[k] && engine.TRANSFORMS[k].video, `ต้องมีคลิป ${k}`);
    assert.equal(engine.TRANSFORMS[k].afterReveal, false);
  }
});

// ---------------------------------------------------------------- การ์ดไซเบอร์
test('การ์ดไซเบอร์: ค่าเริ่มต้นโกโมร่า · ฟื้นเลือด 1 · สุ่มการ์ด · 2 ครั้ง/เทิร์น · ไม่กินโควตาสกิล', () => {
  const { D } = setup();
  assert.equal(D.daichiCard, 'gomora');
  Math.random = () => 0.5; // index 1 = เอเลคิง
  engine.useSkill('D', 'basic');
  assert.equal(D.hp, 7);
  assert.equal(D.daichiCard, 'eleking');
  assert.equal(D.skillPoints, 19);
  assert.ok(!D.skillUsedRound, 'ไม่นับเป็นการใช้สกิลของเทิร์น');

  Math.random = () => 0.9; // index 2 = เบมสตาร์
  engine.useSkill('D', 'basic');
  assert.equal(D.daichiCard, 'bemstar');
  engine.useSkill('D', 'basic');
  assert.equal(D.skillPoints, 18, 'ครั้งที่ 3 ในเทิร์นเดียวกันกดไม่ได้');

  daichi.onRoundStartTick(engine, D);
  assert.equal(D.daichiBasicUses, 0, 'โควตาเต็มใหม่ทุกเทิร์น');
});

test('ช่องพื้นฐาน/รองเปลี่ยนภาพตามการ์ดที่ถืออยู่', () => {
  const { D } = setup();
  const ch = CHARACTERS.CHAR_BY_ID.daichi;
  D.daichiCard = 'bemstar';
  assert.equal(daichi.dynamicSkillFor(D, ch, 'basic').img, daichi.CARDS.bemstar.cardImg);
  assert.equal(daichi.dynamicSkillFor(D, ch, 'secondary').img, daichi.CARDS.bemstar.skillImg);
});

// ---------------------------------------------------------------- มาUNITEกัน
test('มาUNITEกัน: unite 5 เทิร์น · พลังโจมตี +1 · ภาพ/เพลง · กดซ้ำไม่ได้ระหว่างผลยังอยู่', () => {
  const { D, A } = setup();
  const before = computeAttackBase(engine, D, A).base;
  engine.useSkill('D', 'ultimate');
  assert.equal(D.statuses.daichiUnite, 5);
  assert.ok(triggered.includes('daichiUnite'));
  assert.equal(computeAttackBase(engine, D, A).base, before + 1);
  assert.equal(engine.displayImg(D), daichi.IMG.unite);
  assert.equal(daichi.activeMusic(engine).music, 'daichi_theme');
  assert.equal(daichi.canUseSkill(engine, D, 'ultimate'), false);
});

// ---------------------------------------------------------------- ไพ่ตายของฉัน
test('ไพ่ตายของฉัน: ต้องอยู่ใน unite · สวมเกราะตามการ์ด · สลับการ์ดไม่เปลี่ยนเกราะ · สวมแบบเดิมซ้ำไม่ได้', () => {
  const { D } = setup();
  assert.equal(daichi.canUseSkill(engine, D, 'secondary'), false, 'ไม่มี unite กดไม่ได้');
  unite(D);
  engine.useSkill('D', 'secondary');
  assert.equal(D.daichiArmor, 'gomora');
  assert.ok(triggered.includes('daichiGomora'));
  assert.equal(engine.displayImg(D), daichi.CARDS.gomora.armorImg);
  assert.equal(daichi.canUseSkill(engine, D, 'secondary'), false, 'เกราะแบบเดิมซ้ำไม่ได้');

  D.daichiCard = 'eleking';
  assert.equal(D.daichiArmor, 'gomora', 'สลับการ์ดแล้วเกราะยังเป็นแบบเดิม');
  assert.equal(daichi.canUseSkill(engine, D, 'secondary'), true);
  D.skillUsedRound = false;
  engine.useSkill('D', 'secondary');
  assert.equal(D.daichiArmor, 'eleking');
});

test('unite หมดเวลา -> เกราะหลุด', () => {
  const { D } = setup();
  unite(D);
  D.daichiArmor = 'gomora';
  delete D.statuses.daichiUnite;
  daichi.onUniteExpire(engine, D);
  assert.equal(D.daichiArmor, null);
  assert.notEqual(engine.displayImg(D), daichi.CARDS.gomora.armorImg);
});

test('เกราะไม่ทำงานถ้าไม่อยู่ใน unite', () => {
  const { D, A } = setup();
  D.daichiArmor = 'gomora';
  Math.random = () => 0;
  attack(D, A);
  assert.equal(D.daichiExtraPending, false);
});

// ---------------------------------------------------------------- เกราะโกโมร่า
test('เกราะโกโมร่า: สุ่มผ่านได้โจมตีเพิ่ม 1 ครั้ง · ครั้งเพิ่มไม่สุ่มต่อ', () => {
  const { D, A } = setup();
  unite(D); D.daichiArmor = 'gomora';
  Math.random = () => 0;
  attack(D, A);
  assert.equal(D.daichiExtraPending, true);
  assert.equal(daichi.startExtraAttack(engine, D), true);
  assert.equal(engine.gameState, 'ATTACK');
  assert.equal(engine.attackerId, 'D');

  attack(D, A);
  assert.equal(D.daichiExtraPending, false, 'ครั้งเพิ่มไม่สุ่มโจมตีเพิ่มอีก');
  assert.equal(daichi.startExtraAttack(engine, D), false);
  assert.equal(D.daichiInExtra, false);
});

test('เกราะโกโมร่า: สุ่มไม่ผ่านไม่ได้ตีเพิ่ม', () => {
  const { D, A } = setup();
  unite(D); D.daichiArmor = 'gomora';
  Math.random = () => 0.6;
  attack(D, A);
  assert.equal(D.daichiExtraPending, false);
});

// ---------------------------------------------------------------- เกราะเอเลคิง
test('เกราะเอเลคิง: 30% สตั้นเป้าหมาย 1 เทิร์นเริ่มเทิร์นถัดไป · ต้านทานได้', () => {
  const { D, A, C } = setup();
  unite(D); D.daichiArmor = 'eleking';
  Math.random = () => 0;
  attack(D, A);
  assert.ok(!A.statuses.stun, 'ยังไม่ติดสตั้นในเทิร์นที่โดน');
  assert.equal(A.daichiStunPending, 1);
  daichi.applyPendingStun(engine, A);
  assert.equal(A.statuses.stun, 1);

  C.statuses.resist = 1;
  attack(D, C);
  daichi.applyPendingStun(engine, C);
  assert.ok(!C.statuses.stun, 'ต้านสถานะกันได้');

  Math.random = () => 0.35;
  const { D: D2, A: A2 } = setup();
  unite(D2); D2.daichiArmor = 'eleking';
  attack(D2, A2);
  assert.equal(A2.daichiStunPending, 0, 'สุ่มเกิน 30% ไม่ติด');
});

// ---------------------------------------------------------------- เกราะเบมสตาร์
test('เกราะเบมสตาร์: ความเสียหายที่ได้รับฟื้นคืนเป็นพลังชีวิตเทิร์นถัดไป (สูงสุด 3)', () => {
  const { D } = setup();
  unite(D);
  D.daichiCard = 'bemstar';
  engine.useSkill('D', 'secondary');
  assert.equal(D.daichiArmor, 'bemstar');
  D.armor = 1;
  engine.withEffectSource('A', () => engine.dealMixed(D, 5)); // เกราะ 1 + เลือด 4
  assert.equal(D.hp, 2);
  assert.equal(daichi.publicState(D).bemstarOwed, 3);
  D.dmgHp = 0; D.dmgArmor = 0; // เกมจริงรีเซ็ตตัวนับของหน้าสรุปผลตอนต้นเทิร์น — การฟื้นคืนต้องไม่พึ่งตัวนับนั้น
  daichi.onRoundStartTick(engine, D);
  assert.equal(D.hp, 5, 'ฟื้นสูงสุด 3');
  engine.withEffectSource('A', () => engine.dealMixed(D, 1));
  daichi.onRoundStartTick(engine, D);
  assert.equal(D.hp, 5, 'เทิร์นถัดไปนับใหม่ — โดน 1 ฟื้น 1');
});

// ---------------------------------------------------------------- ข้อมูลจำลอง / ตัดการ์ด
test('ข้อมูลจำลอง: ไพ่แตกจากการจั่ว -> ล้างมือแล้วได้การ์ดใหม่ 1 ใบ · 1 ครั้งต่อเทิร์น', () => {
  const { D } = setup();
  D.cards = [card(10), card(9)];
  engine.setCentralDeck([card(5), card(5), card(5), card(5)]);
  engine.hit('D');
  assert.equal(D.cards.length, 1);
  assert.equal(D.busted, false);

  D.cards = [card(10), card(9)];
  engine.hit('D');
  assert.equal(D.busted, true, 'ครั้งที่ 2 ในเทิร์นเดียวกันแตกตามปกติ');
});

test('มาUNITEกัน: ตัดการ์ดใบที่ทำให้แตก เก็บไว้บวกเทิร์นหน้า (ก่อนข้อมูลจำลอง · 1 ครั้งต่อเทิร์น)', () => {
  const { D } = setup();
  unite(D);
  D.cards = [card(10), card(9)];
  engine.setCentralDeck([card(5), card(5), card(5), card(5)]);
  engine.hit('D');
  assert.equal(D.cards.length, 2, 'ใบที่ทำให้แตกถูกตัดออก');
  assert.equal(D.busted, false);
  assert.deepEqual(D.daichiStored.map((c) => c.value), [5]);
  assert.equal(D.daichiSimRound, 0, 'ข้อมูลจำลองยังไม่ถูกใช้');

  engine.hit('D');
  assert.equal(D.cards.length, 1, 'ตัดการ์ดใช้ไปแล้ว -> ข้อมูลจำลองทำงานแทน');
  assert.equal(D.busted, false);

  engine.setRoundNumber(4);
  D.cards = [card(3)];
  daichi.onRoundStartTick(engine, D);
  assert.deepEqual(D.cards.map((c) => c.value), [3, 5], 'การ์ดที่เก็บไว้บวกเข้ามือเทิร์นใหม่');
  assert.equal(D.daichiStored.length, 0);
});

test('ตัวละครอื่นไม่ได้รับผลข้อมูลจำลอง', () => {
  const { A } = setup();
  A.cards = [card(10), card(9)];
  engine.setCentralDeck([card(5), card(5)]);
  engine.hit('A');
  assert.equal(A.busted, true);
});
