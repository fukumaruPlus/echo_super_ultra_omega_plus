const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const arjuna = require('../../characters/arjuna.js');
const CHARACTERS = require('../../characters.js');

const saved = {
  queueCutscene: engine.queueCutscene,
  runCutsceneQueue: engine.runCutsceneQueue,
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  skillFlash: engine.skillFlash,
};

let queued = [];

test.before(() => {
  engine.queueCutscene = (p, key) => { queued.push(key); };
  engine.runCutsceneQueue = (onDone) => { if (onDone) onDone(); };
  engine.startPhaseTimer = () => {};
  engine.broadcastState = () => {};
  engine.skillFlash = () => {};
});

test.after(() => {
  engine.clearPhaseTimer();
  Object.assign(engine, saved);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 7, maxHpPenalty: 0, armor: 0, shield: 0, tempHp: 0,
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    colorTrigger: null, cardBonus: 0,
    arjunaAttackers: {}, arjunaUltCd: 0, hasKilled: false,
  };
}

function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = [];
  const j = mk('J', 'arjuna', 1);
  const a = mk('A', 'temari', 2);
  const b = mk('B', 'temari', 3);
  engine.players.J = j;
  engine.players.A = a;
  engine.players.B = b;
  engine.setRoundNumber(3);
  engine.setGameMode('ffa');
  return { j, a, b };
}

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('ข้อมูลตัวละครลงทะเบียนครบ', () => {
  const ch = CHARACTERS.CHARACTERS.find((c) => c.id === 'arjuna');
  assert.ok(ch);
  assert.equal(ch.difficulty, 'medium');
  assert.equal(ch.basic.cost, 4);
  assert.equal(ch.secondary.cost, 4);
  assert.equal(ch.ultimate.cost, 6);
});

// ---------------------------------------------------------------- สกิลติดตัว หัวใจที่เที่ยงธรรม
test('หัวใจที่เที่ยงธรรม: ตีคนที่ยังไม่เคยโจมตีอรชุน ดาเมจ -1', () => {
  const { j, a } = setup();
  const c = computeAttackBase(engine, j, a);
  assert.equal(c.base, 0, 'ฐาน 1 - 1 = 0');
  assert.equal(c.arjunaMercy, true);
});

test('หัวใจที่เที่ยงธรรม: เมื่อเป้าหมายเคยลงมือกับอรชุนแล้ว โทษ -1 หายไป', () => {
  const { j, a } = setup();
  arjuna.onAttacked(engine, a, j);
  assert.equal(arjuna.everAttackedArjuna(j, a), true);
  const c = computeAttackBase(engine, j, a);
  assert.equal(c.base, 1);
  assert.ok(!c.arjunaMercy);
});

test('หัวใจที่เที่ยงธรรม: ตีคนที่เคยสังหารผู้เล่นอื่น แรงขึ้น +1', () => {
  const { j, a } = setup();
  arjuna.onAttacked(engine, a, j); // ล้างโทษ -1 ออกก่อน เพื่อดูผลของ +1 ล้วนๆ
  a.hasKilled = true;
  const c = computeAttackBase(engine, j, a);
  assert.equal(c.base, 2);
  assert.equal(c.arjunaWrath, true);
});

test('หัวใจที่เที่ยงธรรม: ทั้งสองเงื่อนไขพร้อมกันหักล้างกันพอดี', () => {
  const { j, a } = setup();
  a.hasKilled = true; // ไม่เคยตีอรชุน (-1) แต่เคยฆ่าคนอื่น (+1)
  const c = computeAttackBase(engine, j, a);
  assert.equal(c.base, 1);
});

test('หัวใจที่เที่ยงธรรม: บันทึกผู้ลงมือเฉพาะเมื่อเป้าหมายคืออรชุนเท่านั้น', () => {
  const { j, a, b } = setup();
  arjuna.onAttacked(engine, a, b);
  assert.deepEqual(j.arjunaAttackers, {});
});

// ---------------------------------------------------------------- สกิลพื้นฐาน ตะเกียงไฟที่ดับมอด
test('ตะเกียงไฟที่ดับมอด: ให้เยียวยา 3 เทิร์น + ฟื้นคืนชีพ 3 เทิร์น', () => {
  const { j } = setup();
  arjuna.applyLamp(engine, j);
  assert.equal(j.statuses.mend, 3);
  assert.equal(j.statusAmt.mend, 1);
  assert.equal(j.statuses.arjunaRevive, 3);
});

test('ตะเกียงไฟที่ดับมอด: กดซ้ำไม่ได้เมื่อผลทั้ง 2 ยังอยู่ แต่กดได้ถ้าเหลืออย่างเดียว', () => {
  const { j } = setup();
  arjuna.applyLamp(engine, j);
  assert.equal(arjuna.canUseSkill(engine, j, 'basic'), false);
  delete j.statuses.mend;
  assert.equal(arjuna.canUseSkill(engine, j, 'basic'), true, 'เหลือแค่ฟื้นคืนชีพ = กดใหม่ได้');
});

test('ฟื้นคืนชีพ: ตายแล้วฟื้นทันทีด้วยเลือด 1 เกราะ 0 และสถานะหายไป', () => {
  const { j } = setup();
  arjuna.applyLamp(engine, j);
  j.armor = 3;
  j.hp = 0;
  engine.instantDeath(j);
  assert.equal(j.alive, true);
  assert.equal(j.hp, 1);
  assert.equal(j.armor, 0);
  assert.ok(!j.statuses.arjunaRevive, 'ใช้แล้วหายไป');
});

test('ฟื้นคืนชีพ: ใช้ได้ครั้งเดียว — ตายซ้ำในเทิร์นเดียวกันคือตกรอบจริง', () => {
  const { j } = setup();
  arjuna.applyLamp(engine, j);
  j.hp = 0;
  engine.instantDeath(j);
  j.hp = 0;
  engine.instantDeath(j);
  assert.equal(j.alive, false);
});

// ---------------------------------------------------------------- สกิลรอง ขจัดความชั่วร้าย
test('สังหารโลกา: พลังโจมตี +1 และ +1 ต่อดีบัฟเสีย 1 ตัวของเป้าหมาย', () => {
  const { j, a } = setup();
  arjuna.onAttacked(engine, a, j); // ตัดโทษ -1 ของสกิลติดตัวออก
  arjuna.applySlay(engine, j);
  assert.equal(j.statuses.arjunaSlay, 5);
  assert.equal(computeAttackBase(engine, j, a).base, 2, 'ไม่มีดีบัฟ: 1 + 1');
  a.statuses.weak = 2; a.statusAmt.weak = 1;
  a.statuses.stun = 1;
  a.statuses.hburn = 3;
  assert.equal(arjuna.debuffCount(engine, a), 3);
  assert.equal(computeAttackBase(engine, j, a).base, 5, '1 + 1 + 3 ดีบัฟ');
});

test('ขจัดความชั่วร้าย: กดซ้ำไม่ได้ระหว่างผลยังอยู่', () => {
  const { j } = setup();
  arjuna.applySlay(engine, j);
  assert.equal(arjuna.canUseSkill(engine, j, 'secondary'), false);
});

// ---------------------------------------------------------------- ท่าไม้ตาย Mahapralaya
test('Mahapralaya: แจกเปราะบางให้ทุกคนยกเว้นตัวเอง + คิววีดีโอ + ติดคูลดาวน์ 5 เทิร์น', () => {
  const { j, a, b } = setup();
  arjuna.startPralaya(engine, j);
  assert.equal(a.statuses.fragile, 3);
  assert.equal(a.statusAmt.fragile, 1);
  assert.equal(b.statuses.fragile, 3);
  assert.ok(!j.statuses.fragile, 'อรชุนไม่ติดเปราะบางของตัวเอง');
  assert.deepEqual(queued, ['arjunaPralaya']);
  assert.equal(arjuna.ultCooldownLeft(engine, j), arjuna.PRALAYA_COOLDOWN);
  assert.equal(arjuna.canUseSkill(engine, j, 'ultimate'), false);
});

test('Mahapralaya: ล้างดีบัฟของอรชุนเองทั้งหมดตอนกด (ไม่แตะดีบัฟของคนอื่น)', () => {
  const { j, a } = setup();
  j.statuses.weak = 3; j.statusAmt.weak = 1;
  j.statuses.stun = 2;
  j.statuses.hburn = 4;
  a.statuses.weak = 3; a.statusAmt.weak = 1;
  arjuna.startPralaya(engine, j);
  assert.ok(!j.statuses.weak && !j.statuses.stun && !j.statuses.hburn, 'ดีบัฟของอรชุนถูกล้างหมด');
  assert.equal(a.statuses.weak, 3, 'ดีบัฟของคนอื่นไม่ถูกแตะ');
  assert.equal(a.statuses.fragile, 3, 'และยังโดนเปราะบางตามปกติ');
});

test('Mahapralaya: อรชุนไม่ล้างเปราะบางที่ท่าเพิ่งแจกของตัวเองทิ้ง (ล้างก่อนแจก)', () => {
  const { j } = setup();
  arjuna.startPralaya(engine, j);
  assert.ok(!j.statuses.fragile, 'ท่านี้ไม่แจกเปราะบางให้ตัวเองอยู่แล้ว');
});

test('Mahapralaya: เล่นวีดีโอทุกครั้งที่กด ไม่ใช่ครั้งแรกครั้งเดียว', () => {
  const { j } = setup();
  arjuna.startPralaya(engine, j);
  engine.setRoundNumber(engine.roundNumber + arjuna.PRALAYA_COOLDOWN);
  arjuna.startPralaya(engine, j);
  engine.setRoundNumber(engine.roundNumber + arjuna.PRALAYA_COOLDOWN);
  arjuna.startPralaya(engine, j);
  assert.deepEqual(queued, ['arjunaPralaya', 'arjunaPralaya', 'arjunaPralaya'],
    'ต้องใช้ queueCutscene (เล่นทุกครั้ง) ไม่ใช่ triggerCutscene (ครั้งเดียวต่อเกม)');
});

test('Mahapralaya: ความเสียหายเท่าพลังโจมตีปกติต่อเป้าหมายแต่ละคน', () => {
  const { j, a, b } = setup();
  arjuna.onAttacked(engine, a, j); // A เคยตีอรชุน -> ไม่ได้ส่วนลด · B ยังไม่เคย -> ดาเมจ 0
  arjuna.applySlay(engine, j);     // สังหารโลกา +1 (ใช้คู่กันได้ตามสเปค)
  const aHp = a.hp, bHp = b.hp;
  arjuna.applyPralaya(engine, j);
  assert.equal(aHp - a.hp, 2, 'A: ฐาน 1 + สังหารโลกา 1 = 2');
  assert.equal(bHp - b.hp, 1, 'B: (1 - 1 เมตตา) + สังหารโลกา 1 = 1');
});

test('Mahapralaya: เปราะบางของท่าไม่ทำให้ดาเมจของท่าเองบวมขึ้น (คิดจากพลังโจมตีล้วน)', () => {
  const { j, a } = setup();
  arjuna.onAttacked(engine, a, j);
  arjuna.startPralaya(engine, j);
  const before = a.hp;
  arjuna.applyPralaya(engine, j);
  assert.equal(before - a.hp, 1, 'ยังเป็น 1 แม้ A จะติดเปราะบาง 1 อยู่');
});

test('Mahapralaya: คูลดาวน์หมดแล้วกดได้อีกครั้ง', () => {
  const { j } = setup();
  arjuna.startPralaya(engine, j);
  engine.setRoundNumber(engine.roundNumber + arjuna.PRALAYA_COOLDOWN);
  assert.equal(arjuna.ultCooldownLeft(engine, j), 0);
  assert.equal(arjuna.canUseSkill(engine, j, 'ultimate'), true);
});

// ---------------------------------------------------------------- ธง hasKilled (ใช้ร่วมทุกตัวละคร)
test('instantDeath ตั้งธง hasKilled ให้ผู้สังหาร ไม่ใช่ให้ตัวเอง', () => {
  const { j, a, b } = setup();
  b.hp = 0;
  engine.withEffectSource(a, () => engine.instantDeath(b));
  assert.equal(a.hasKilled, true);
  assert.equal(b.hasKilled, false);
  assert.equal(j.hasKilled, false);
});
