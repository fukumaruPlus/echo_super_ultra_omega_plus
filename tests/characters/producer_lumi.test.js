const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const lumi = require('../../characters/producer_lumi.js');
const CHARACTERS = require('../../characters.js');

const saved = {
  queueCutscene: engine.queueCutscene,
  runCutsceneQueue: engine.runCutsceneQueue,
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  skillFlash: engine.skillFlash,
};

let queued = [];
let flashes = [];

test.before(() => {
  engine.queueCutscene = (p, key) => { queued.push(key); };
  engine.runCutsceneQueue = (onDone) => { if (onDone) onDone(); };
  engine.startPhaseTimer = () => {};
  engine.broadcastState = () => {};
  engine.skillFlash = (f) => { flashes.push(f); };
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
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, cardBonus: 0,
  };
}

function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = []; flashes = [];
  const L = mk('L', 'producer_lumi', 1);
  const A = mk('A', 'temari', 2);
  const C = mk('C', 'temari', 3);
  engine.players.L = L; engine.players.A = A; engine.players.C = C;
  for (const p of [L, A, C]) lumi.resetCombat(p);
  L.hp = lumi.IDOL_HP; L.armor = lumi.IDOL_ARMOR;
  engine.setRoundNumber(3);
  engine.setGameMode('ffa');
  engine.setGameState('PLAYING');
  return { L, A, C };
}

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('ข้อมูลตัวละครลงทะเบียนครบ (ท่าไม้ตาย 5 แบบ + luminous + ช่องชุบไอดอล)', () => {
  const ch = CHARACTERS.CHAR_BY_ID.producer_lumi;
  assert.ok(ch);
  assert.equal(ch.difficulty, 'special');
  assert.equal(ch.unique, true);
  assert.equal(ch.basic.cost, 0, 'สลับไอดอลไม่เสียแต้มสกิล');
  assert.equal(ch.basic2.cost, 6);
  assert.equal(ch.secondary.cost, 4);
  assert.equal(ch.ultimate2.cost, 6);
  for (const key of lumi.IDOL_KEYS) {
    assert.ok(ch[`ultimate_${key}`], `ต้องมีท่าไม้ตายของ ${key}`);
    assert.equal(ch[`ultimate_${key}`].cost, 6);
  }
});

test('คลิปทุกตัวต้อง afterReveal:false (คิวเองจากโค้ด — กันเล่นซ้ำ/โดน voidUltimateOnBust ลบ)', () => {
  const keys = lumi.IDOL_KEYS.map((k) => `lumiUlt_${k}`).concat(['lumiLuminous', 'lumiBurst']);
  for (const k of keys) {
    assert.ok(engine.TRANSFORMS[k], `ต้องมีคลิป ${k}`);
    assert.equal(engine.TRANSFORMS[k].afterReveal, false, `${k} ต้องไม่เป็น afterReveal`);
  }
});

// ---------------------------------------------------------------- หลอดเลือด 2 ชั้น
test('ค่าสถานะ: หลอดเป็นของไอดอล (5/3) ตอนยืนอยู่ · ของโปรดิวเซอร์ (3/0) เมื่อล้ม', () => {
  const { L } = setup();
  assert.equal(engine.maxHpOf(L), lumi.IDOL_HP);
  assert.equal(engine.maxArmorOf(L), lumi.IDOL_ARMOR);
  L.lumiIdolDown = true;
  assert.equal(engine.maxHpOf(L), lumi.PRODUCER_HP);
  assert.equal(engine.maxArmorOf(L), 0);
});

test('ไอดอลล้ม: ไม่ตกรอบ · หลอดสลับไปเป็นของโปรดิวเซอร์ · สถานะของไอดอลถูกล้าง', () => {
  const { L } = setup();
  L.statuses.weak = 3; L.statusAmt.weak = 1;
  L.armor = 2;
  L.hp = 0;
  engine.instantDeath(L);
  assert.equal(L.alive, true, 'ไอดอลล้มไม่ใช่การตกรอบ');
  assert.equal(lumi.idolDown(L), true);
  assert.equal(L.hp, lumi.PRODUCER_HP);
  assert.equal(L.armor, 0);
  assert.ok(!L.statuses.weak, 'สถานะเป็นของไอดอลที่ล้มไปแล้ว ต้องถูกล้าง');
});

test('โปรดิวเซอร์เลือดหมด = ตกรอบจริง', () => {
  const { L } = setup();
  L.hp = 0;
  engine.instantDeath(L);      // ครั้งที่ 1 — ไอดอลล้ม
  assert.equal(L.alive, true);
  L.hp = 0;
  engine.instantDeath(L);      // ครั้งที่ 2 — โปรดิวเซอร์หมด
  assert.equal(L.alive, false);
});

test('ชุบไอดอล: เลือด 3 เกราะ 2 และเก็บเลือดโปรดิวเซอร์ที่เหลือไว้', () => {
  const { L } = setup();
  L.hp = 0;
  engine.instantDeath(L);
  L.hp = 2;                    // โปรดิวเซอร์โดนตีไป 1
  lumi.applyRevive(engine, L);
  assert.equal(lumi.idolDown(L), false);
  assert.equal(L.hp, lumi.REVIVE_HP);
  assert.equal(L.armor, lumi.REVIVE_ARMOR);
  assert.equal(L.lumiProducerHp, 2, 'เลือดโปรดิวเซอร์ที่เหลือถูกพักไว้ ไม่หายไป');
});

// ---------------------------------------------------------------- สลับไอดอล
test('สลับไอดอล: เปลี่ยนตัว + เล่นเสียงพูด + โปรดิวเซอร์ฟื้นเลือด 1', () => {
  const { L } = setup();
  L.lumiProducerHp = lumi.PRODUCER_HP;
  L.hp = 2;
  lumi.applySwitch(engine, L, 'haruka');
  assert.equal(lumi.idolKeyOf(L), 'haruka');
  assert.equal(L.hp, 3, 'ฟื้นพลังชีวิต 1');
  assert.equal(flashes.at(-1).sound, 'lumi_voice_haruka', 'เล่นเสียงพูดประจำตัวไอดอล');
});

test('สลับไอดอล: เลือกคนเดิมไม่ได้ · ระหว่างท่าไม้ตายทำงานสลับไม่ได้', () => {
  const { L } = setup();
  assert.equal(lumi.canUseSkill(engine, L, 'basic', 'haruka'), true);
  assert.equal(lumi.canUseSkill(engine, L, 'basic', lumi.idolKeyOf(L)), false, 'เลือกคนที่ยืนอยู่ไม่ได้');
  assert.equal(lumi.canUseSkill(engine, L, 'basic', 'ไม่มีคนนี้'), false);
  L.statuses.lumiUlt = 5;
  assert.equal(lumi.canUseSkill(engine, L, 'basic', 'haruka'), false, 'ระหว่างท่าไม้ตายสลับไม่ได้');
});

test('ไอดอลล้ม: ช่องแรกกลายเป็นชุบไอดอล · สกิลรอง/ท่าไม้ตายกดไม่ได้', () => {
  const { L } = setup();
  const ch = CHARACTERS.CHAR_BY_ID.producer_lumi;
  L.lumiIdolDown = true;
  assert.equal(lumi.dynamicSkillFor(L, ch, 'basic').name, ch.basic2.name);
  assert.equal(lumi.canUseSkill(engine, L, 'basic'), true);
  assert.equal(lumi.canUseSkill(engine, L, 'secondary'), false);
  assert.equal(lumi.canUseSkill(engine, L, 'ultimate'), false);
});

// ---------------------------------------------------------------- ผลติดตัวรายไอดอล
test('ผลติดตัว ฮารุกะ: แต้มสกิล +1 ต่อเทิร์น', () => {
  const { L } = setup();
  L.lumiIdol = 'haruka'; L.skillPoints = 0;
  lumi.onRoundStartTick(engine, L);
  assert.equal(L.skillPoints, 1);
});

test('ผลติดตัว อันซุ: เหรียญ +1 ต่อเทิร์น', () => {
  const { L } = setup();
  L.lumiIdol = 'anzu'; L.gold = 0;
  lumi.onRoundStartTick(engine, L);
  assert.equal(L.gold, 1);
});

test('ผลติดตัว มิไร: พลังชีวิต +1 ทุก 2 เทิร์น (ไม่ใช่ทุกเทิร์น)', () => {
  const { L } = setup();
  L.lumiIdol = 'mirai'; L.hp = 2;
  lumi.onRoundStartTick(engine, L);
  assert.equal(L.hp, 2, 'เทิร์นแรกยังไม่ฟื้น');
  lumi.onRoundStartTick(engine, L);
  assert.equal(L.hp, 3, 'ครบ 2 เทิร์นจึงฟื้น');
});

test('ผลติดตัว คาโฮะ: พลังโจมตีพื้นฐาน +1', () => {
  const { L, A } = setup();
  L.lumiIdol = 'kohaku';
  assert.equal(computeAttackBase(engine, L, A).base, 1);
  L.lumiIdol = 'kaho';
  assert.equal(computeAttackBase(engine, L, A).base, 2);
});

test('ผลติดตัว โคฮารุ: ไพ่ใบแรกของเทิร์นถูกหักลบ (1 ครั้งต่อเทิร์น)', () => {
  const { L } = setup();
  L.lumiIdol = 'kohaku';
  const c1 = { value: 7, color: 'red' };
  lumi.onCardDraw(engine, L, c1);
  assert.equal(c1.value, -7, 'ใบแรกพลิกเครื่องหมาย');
  const c2 = { value: 5, color: 'red' };
  lumi.onCardDraw(engine, L, c2);
  assert.equal(c2.value, 5, 'ใบที่ 2 ในเทิร์นเดียวกันไม่โดน');
  lumi.onRoundStartTick(engine, L); // เทิร์นใหม่ = สิทธิ์เต็มใหม่
  const c3 = { value: 4, color: 'red' };
  lumi.onCardDraw(engine, L, c3);
  assert.equal(c3.value, -4);
});

test('ผลติดตัว: ไอดอลล้มแล้วผลติดตัวหยุดทำงานทั้งหมด', () => {
  const { L, A } = setup();
  L.lumiIdol = 'kaho'; L.lumiIdolDown = true;
  assert.equal(computeAttackBase(engine, L, A).base, 1, 'ไม่ได้โบนัสของคาโฮะ');
  assert.equal(lumi.hasPassive(L, 'kaho'), false);
});

// ---------------------------------------------------------------- ฝึกซ้อม
test('ฝึกซ้อม: 3 เทิร์น · โจมตีปกติไม่ได้ · แต้มสกิล+เลือดฟื้นทุกเทิร์น · แต้มไอดอล +1', () => {
  const { L } = setup();
  L.skillPoints = 0; L.hp = 2;
  lumi.applyTrain(engine, L);
  assert.equal(L.statuses.lumiTrain, lumi.TRAIN_TURNS);
  assert.equal(L.lumiPoints, 1);
  assert.equal(lumi.cannotAttack(L), true);
  lumi.onRoundStartTick(engine, L);
  assert.equal(L.skillPoints, 1);
  assert.equal(L.hp, 3);
});

test('ฝึกซ้อม: กดซ้ำระหว่างผลยังอยู่ไม่ได้', () => {
  const { L } = setup();
  assert.equal(lumi.canUseSkill(engine, L, 'secondary'), true);
  lumi.applyTrain(engine, L);
  assert.equal(lumi.canUseSkill(engine, L, 'secondary'), false);
});

// ---------------------------------------------------------------- แต้ม "ไอดอล"
test('แต้มไอดอล: กดท่าไม้ตายครั้งไหนก็ +1 (กดคนเดิมซ้ำก็นับ) · ตันที่ 6', () => {
  const { L } = setup();
  for (let i = 0; i < 8; i++) {
    delete L.statuses.lumiUlt;
    lumi.applyUlt(engine, L);
  }
  assert.equal(L.lumiPoints, lumi.POINTS_NEED, 'ตันที่ 6');
  assert.equal(lumi.luminousReady(L), true);
});

test('luminous: ใช้แล้วแต้มไอดอลกลับเป็น 0 และช่องท่าไม้ตายกลับไปเป็นของไอดอล', () => {
  const { L } = setup();
  const ch = CHARACTERS.CHAR_BY_ID.producer_lumi;
  L.lumiPoints = lumi.POINTS_NEED;
  assert.equal(lumi.dynamicSkillFor(L, ch, 'ultimate').name, 'luminous');
  lumi.applyLuminous(engine, L);
  assert.equal(L.lumiPoints, 0);
  assert.ok(queued.includes('lumiLuminous'));
  delete L.statuses.lumiLuminous;
  assert.equal(lumi.dynamicSkillFor(L, ch, 'ultimate').name, ch[`ultimate_${lumi.idolKeyOf(L)}`].name);
});

test('[regression] ไอดอลทุกคนต้องมีภาพปกของตัวเอง — ทั้งช่องแรกและช่องท่าไม้ตาย', () => {
  // เคยพลาด: สลับ dynamicSkillFor ไว้แค่ที่ useSkill ลืม buildStateFor
  //  ผลคือ "กดแล้วได้ท่าถูก แต่ปุ่มค้างที่ชื่อ/ภาพของไอดอลค่าเริ่มต้นตลอด"
  const ch = CHARACTERS.CHAR_BY_ID.producer_lumi;
  const { L } = setup();
  const seenBasic = new Set();
  const seenUlt = new Set();
  for (const key of lumi.IDOL_KEYS) {
    L.lumiIdol = key;
    const b = lumi.dynamicSkillFor(L, ch, 'basic');
    const u = lumi.dynamicSkillFor(L, ch, 'ultimate');
    assert.ok(b.img.includes(`/${key}/`), `ปกสกิลพื้นฐานต้องเป็นภาพของ ${key} — ได้ ${b.img}`);
    assert.ok(u.img.includes(`/${key}/`), `ปกท่าไม้ตายต้องเป็นภาพของ ${key} — ได้ ${u.img}`);
    assert.equal(u.name, ch[`ultimate_${key}`].name);
    seenBasic.add(b.img);
    seenUlt.add(u.img);
  }
  assert.equal(seenBasic.size, lumi.IDOL_KEYS.length, 'ภาพช่องแรกต้องไม่ซ้ำกันเลย');
  assert.equal(seenUlt.size, lumi.IDOL_KEYS.length, 'ภาพท่าไม้ตายต้องไม่ซ้ำกันเลย');
});

test('[regression] buildStateFor ต้องสลับปุ่มให้ตรงกับ useSkill (ไม่ใช่แค่ฝั่งเดียว)', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '../../server.js'), 'utf8');
  const n = (src.match(/producer_lumi\.dynamicSkillFor/g) || []).length;
  assert.ok(n >= 3, `ต้องเรียก dynamicSkillFor ทั้งใน useSkill และ buildStateFor (basic+ultimate) — พบ ${n} จุด`);
});

// ---------------------------------------------------------------- ท่าไม้ตาย 1 (5 แบบ)
test('ท่าไม้ตาย: สลับตามไอดอลที่ยืนอยู่ และเล่นคลิปของไอดอลคนนั้น', () => {
  const ch = CHARACTERS.CHAR_BY_ID.producer_lumi;
  for (const key of lumi.IDOL_KEYS) {
    const { L } = setup();
    L.lumiIdol = key;
    assert.equal(lumi.dynamicSkillFor(L, ch, 'ultimate').name, ch[`ultimate_${key}`].name);
    lumi.applyUlt(engine, L);
    assert.equal(L.lumiUltIdol, key);
    assert.ok(queued.includes(`lumiUlt_${key}`), `ต้องเล่นคลิปของ ${key}`);
  }
});

test('ท่าไม้ตาย: กดซ้ำไม่ได้จนกว่าผลเดิมจะหมด', () => {
  const { L } = setup();
  assert.equal(lumi.canUseSkill(engine, L, 'ultimate'), true);
  lumi.applyUlt(engine, L);
  assert.equal(lumi.canUseSkill(engine, L, 'ultimate'), false);
});

test('พลังโจมตี: ท่าไม้ตายให้ +1 ยกเว้น Tsubasa 283 ของคาโฮะ', () => {
  for (const key of ['haruka', 'anzu', 'mirai', 'kohaku']) {
    const { L, A } = setup();
    L.lumiIdol = key;
    lumi.applyUlt(engine, L);
    assert.equal(computeAttackBase(engine, L, A).base, 2, `${key} ต้องได้ +1`);
  }
  const { L, A } = setup();
  L.lumiIdol = 'kaho';
  lumi.applyUlt(engine, L);
  // คาโฮะได้ +1 จากผลติดตัวอยู่แล้ว แต่ท่าไม้ตายของเธอไม่เพิ่มให้อีก
  assert.equal(computeAttackBase(engine, L, A).base, 2, 'ได้จากผลติดตัวอย่างเดียว ไม่ใช่จากท่า');
});

test('Mishiro 346 (อันซุ): ขโมยของ 1 ชิ้น · คนเดิมซ้ำไม่ได้ · ไม่มีของ = ฟื้นเลือด', () => {
  const { L, A, C } = setup();
  L.lumiIdol = 'anzu';
  lumi.applyUlt(engine, L);
  A.inventory = [{ uid: 'x1', type: 'armor', value: 1 }];
  lumi.onAttackLanded(engine, L, A);
  assert.equal(A.inventory.length, 0, 'ของถูกขโมยไป');
  assert.equal(L.inventory.length, 1);
  lumi.onAttackLanded(engine, L, A);
  assert.equal(L.inventory.length, 1, 'ขโมยคนเดิมซ้ำในรอบท่าเดียวกันไม่ได้');
  L.hp = 2;
  lumi.onAttackLanded(engine, L, C); // C ไม่มีของ
  assert.equal(L.hp, 3, 'ไม่มีของให้ขโมย = ฟื้นเลือด 1');
});

test('Tsubasa 283 (คาโฮะ): หลบหลีก 40% · โจมตีปกติฟื้นแต้มสกิล', () => {
  const { L, A } = setup();
  L.lumiIdol = 'kaho';
  assert.equal(lumi.dodgeChance(L), 0, 'ยังไม่กดท่า = ไม่มีการหลบ');
  lumi.applyUlt(engine, L);
  assert.equal(lumi.dodgeChance(L), lumi.KAHO_DODGE);
  L.skillPoints = 0;
  lumi.onAttackLanded(engine, L, A);
  assert.equal(L.skillPoints, 1);
});

test('Million star 765 (มิไร): ดาเมจหน่วง 1 เทิร์น · คนทำตายก่อน = ไม่เกิดขึ้น', () => {
  const { L, A } = setup();
  L.lumiIdol = 'mirai';
  lumi.applyUlt(engine, L);
  const hp0 = L.hp;
  engine.withEffectSource(A, () => engine.dealMixed(L, 2, true));
  assert.equal(L.hp + L.armor, hp0 + lumi.IDOL_ARMOR, 'เทิร์นนี้ยังไม่โดนอะไรเลย');
  assert.equal(L.lumiPending.length, 1);
  A.alive = false;
  lumi.onRoundStartTick(engine, L);
  assert.equal(L.hp + L.armor, hp0 + lumi.IDOL_ARMOR, 'คนทำตายก่อน ดาเมจหายไปเลย');
  assert.equal(L.lumiPending.length, 0);
});

test('Million star 765: คนทำยังอยู่ -> ดาเมจลงในเทิร์นถัดไป', () => {
  const { L, A } = setup();
  L.lumiIdol = 'mirai'; L.armor = 0;
  lumi.applyUlt(engine, L);
  const hp0 = L.hp;
  engine.withEffectSource(A, () => engine.dealMixed(L, 2, true));
  assert.equal(L.hp, hp0);
  lumi.onRoundStartTick(engine, L);
  assert.equal(L.hp, hp0 - 2, 'ลงผลในเทิร์นถัดไป');
});

test('Million star 765: ดาเมจจากสถานะ (ไม่มีเจ้าของ) ไม่ถูกหน่วง — ไม่งั้นเป็นภูมิคุ้มกันถาวร', () => {
  const { L } = setup();
  L.lumiIdol = 'mirai'; L.armor = 0;
  lumi.applyUlt(engine, L);
  const hp0 = L.hp;
  L._statusDamage = true;
  engine.dealMixed(L, 1);
  L._statusDamage = false;
  assert.equal(L.hp, hp0 - 1, 'ดาเมจจากสถานะลงทันที');
});

test('All star 765 (ฮารุกะ): จองหมัดที่ 2 ครั้งเดียวต่อเทิร์น', () => {
  const { L, A } = setup();
  L.lumiIdol = 'haruka';
  lumi.applyUlt(engine, L);
  lumi.onAttackLanded(engine, L, A);
  assert.equal(L.lumiExtraAtk, 1);
  L.lumiExtraAtk = 0;
  lumi.onAttackLanded(engine, L, A);
  assert.equal(L.lumiExtraAtk, 0, 'เทิร์นเดียวจองได้ครั้งเดียว');
  lumi.onRoundStartAfterLoop(engine); // เทิร์นใหม่
  lumi.onAttackLanded(engine, L, A);
  assert.equal(L.lumiExtraAtk, 1);
});

test('[regression] Million star 765: ดาเมจที่หน่วงไว้ต้องสลายไปพร้อมไอดอล ไม่ไหลไปฆ่าโปรดิวเซอร์', () => {
  // ก้อนที่หน่วงไว้คือดาเมจที่ "ไอดอลรับไว้แล้ว" — ถ้าปล่อยค้าง มันจะไปลงหลอดโปรดิวเซอร์ที่มีแค่ 3
  //  และไม่มีเกราะ = ดาเมจที่เล็งไอดอลเต็มหลอดฆ่าทั้งตัวละครได้ในทีเดียว (ขัดกฎแกนของตัวละคร)
  const { L, A } = setup();
  L.lumiIdol = 'mirai';
  lumi.applyUlt(engine, L);
  engine.withEffectSource(A, () => engine.dealMixed(L, 3, true));
  assert.equal(L.lumiPending.length, 1, 'ดาเมจถูกหน่วงไว้');
  L.hp = 0; L.armor = 0;
  engine.instantDeath(L);                       // ไอดอลล้มจากเหตุอื่น
  assert.equal(L.hp, lumi.PRODUCER_HP);
  assert.equal(L.lumiPending.length, 0, 'คิวถูกล้างพร้อมไอดอล');
  lumi.onRoundStartTick(engine, L);
  assert.equal(L.hp, lumi.PRODUCER_HP, 'โปรดิวเซอร์ไม่โดนดาเมจที่เล็งไอดอลไว้');
  assert.equal(L.alive, true);
});

test('Million star 765: หลายก้อนในเทิร์นเดียวลงผลพร้อมกันในเทิร์นถัดไป (ยอดรวมไม่เปลี่ยน)', () => {
  const { L, A } = setup();
  L.lumiIdol = 'mirai'; L.armor = 0;
  lumi.applyUlt(engine, L);
  const hp0 = L.hp;
  for (let i = 0; i < 3; i++) engine.withEffectSource(A, () => engine.dealMixed(L, 1, true));
  assert.equal(L.hp, hp0, 'เทิร์นนี้ยังไม่โดนเลย');
  assert.equal(L.lumiPending.length, 3);
  lumi.onRoundStartTick(engine, L);
  assert.equal(L.hp, hp0 - 3, 'ลงพร้อมกันทั้ง 3 ก้อน');
});

test('โคฮารุ: หักลบจากแต้มที่มีอยู่จริง และมีพื้นล่างที่ 0 ตามกติกากลางของเกม', () => {
  const { L } = setup();
  L.lumiIdol = 'kohaku';
  L.cards = [{ value: 15, color: 'red' }];
  const c = { value: 9, color: 'red' };
  lumi.onCardDraw(engine, L, c);
  L.cards.push(c);
  assert.equal(engine.scoreOf(L), 6, '15 - 9 = 6');
  // scoreOf() ของเกมมีพื้นล่างที่ 0 อยู่แล้ว (เหมือน cardBonus ติดลบของไบเลธ) — ติดลบไม่ได้
  const { L: L2 } = setup();
  L2.lumiIdol = 'kohaku';
  L2.cards = [{ value: 3, color: 'red' }];
  const c2 = { value: 9, color: 'red' };
  lumi.onCardDraw(engine, L2, c2);
  L2.cards.push(c2);
  assert.equal(engine.scoreOf(L2), 0);
  assert.equal(engine.bustedOf(L2), false, 'แต้มต่ำไม่ใช่ไพ่แตก');
});

// ---------------------------------------------------------------- luminous
test('luminous: รวมผลติดตัวและความสามารถท่าไม้ตายของทั้ง 5 คน', () => {
  const { L } = setup();
  lumi.applyLuminous(engine, L);
  for (const key of lumi.IDOL_KEYS) {
    assert.equal(lumi.hasPassive(L, key), true, `ผลติดตัวของ ${key}`);
    assert.equal(lumi.hasUlt(L, key), true, `ความสามารถท่าของ ${key}`);
  }
  assert.equal(lumi.dodgeChance(L), lumi.KAHO_DODGE, 'ได้การหลบของคาโฮะด้วย');
});

test('luminous: พลังโจมตี +1 ไม่ซ้อนทับ (ผลติดตัวคาโฮะ +1 และท่า +1 รวมเป็น 3 ไม่ใช่มากกว่านั้น)', () => {
  const { L, A } = setup();
  lumi.applyLuminous(engine, L);
  // ฐาน 1 + ผลติดตัวคาโฮะ 1 + ท่าไม้ตาย 1 (ก้อนเดียว ไม่คูณ 5 แบบ) = 3
  assert.equal(computeAttackBase(engine, L, A).base, 3);
});

test('luminous: ถูกตีครบตามจำนวนคู่ต่อสู้ -> คิวคลิป burst แล้วฟื้นเลือด 2 เกราะ 1', () => {
  const { L, A, C } = setup();
  lumi.applyLuminous(engine, L);
  L.hp = 1; L.armor = 0;
  assert.equal(lumi.onAttackedNormally(engine, A, L), false, 'ครั้งที่ 1 จาก 2');
  assert.equal(lumi.onAttackedNormally(engine, C, L), true, 'ครั้งที่ 2 = ครบ');
  assert.ok(queued.includes('lumiBurst'));
  lumi.flushBurst(engine);
  assert.equal(L.hp, 3, 'ฟื้นเลือด 2');
  assert.equal(L.armor, 1, 'ฟื้นเกราะ 1');
  assert.equal(lumi.onAttackedNormally(engine, A, L), false, 'จ่ายรางวัลแล้วไม่ซ้ำในท่าเดียวกัน');
});

test('[regression] luminous: นับ "จำนวนครั้ง" ไม่ใช่จำนวนคน — คนเดิมตีซ้ำก็นับ', () => {
  const { L, A } = setup();
  lumi.applyLuminous(engine, L);
  L.hp = 1; L.armor = 0;
  assert.equal(lumi.onAttackedNormally(engine, A, L), false, 'ครั้งที่ 1');
  assert.equal(lumi.onAttackedNormally(engine, A, L), true, 'คนเดิมตีซ้ำครั้งที่ 2 ก็ครบ');
  lumi.flushBurst(engine);
  assert.equal(L.hp, 3);
  assert.equal(L.armor, 1);
});

test('[regression] luminous: จุดนับต้องอยู่ก่อนด่านหลบหลีกใน doAttack', () => {
  // luminous มีการหลบ 40% ของคาโฮะติดมาด้วย — ถ้านับหลังด่านหลบ หมัดที่ถูกหลบ (~40%) จะหายไปเงียบๆ
  //  จนรางวัลแทบไม่มีทางเกิดขึ้นเลย (บั๊กที่ผู้เล่นเจอจริง)
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
  const iCount = src.indexOf('producer_lumi.onAttackedNormally');
  const iDodge = src.indexOf('producer_lumi.tryAttackDodge');
  const iEiji = src.indexOf('eiji.tryAttackDodge(engine, attacker, target)');
  assert.ok(iCount > 0 && iDodge > 0 && iEiji > 0);
  assert.ok(iCount < iEiji, 'ต้องนับก่อนด่านหลบของเอจิ');
  assert.ok(iCount < iDodge, 'ต้องนับก่อนด่านหลบของตัวเอง');
});

test('[regression] luminous: รางวัลต้องจ่ายได้แม้หมัดที่ทำให้ครบถูกหลบ (มีตาข่ายที่ endTurn)', () => {
  // หมัดที่ถูกหลบทำให้ doAttack return ตั้งแต่ด่านหลบ ไม่ผ่าน postAttackFollowup ที่เรียก flushBurst
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
  const n = (src.match(/producer_lumi\.flushBurst/g) || []).length;
  assert.ok(n >= 2, `flushBurst ต้องถูกเรียกทั้งที่ postAttackFollowup และ endTurn — พบ ${n} จุด`);
});

test('luminous: เหลือ 1vs1 ไม่นับรางวัล burst (ตัวนับก็ไม่ขยับ)', () => {
  const { L, A, C } = setup();
  C.alive = false;
  lumi.applyLuminous(engine, L);
  assert.equal(lumi.onAttackedNormally(engine, A, L), false);
  assert.equal(lumi.onAttackedNormally(engine, A, L), false, 'ตีกี่ครั้งก็ไม่ติด');
  assert.ok(!L.lumiHitCount, 'ไม่นับสะสมไว้ด้วย');
});

// ---------------------------------------------------------------- สกิลติดตัว
test('ความฝันของฉันคือเธอ: ไม่รับดาเมจแพ้/ไพ่แตก เฉพาะตอนท่าไม้ตายทำงาน', () => {
  const { L } = setup();
  assert.equal(lumi.isLossImmune(engine, L), false, 'ไม่มีท่าไม้ตาย = รับดาเมจตามปกติ');
  L.statuses.lumiUlt = 5;
  assert.equal(lumi.isLossImmune(engine, L), true);
  delete L.statuses.lumiUlt;
  L.statuses.lumiLuminous = 5;
  assert.equal(lumi.isLossImmune(engine, L), true, 'luminous ก็นับ');
});

// ---------------------------------------------------------------- integration
test('[integration] สลับไอดอลผ่าน useSkill จริง — ไม่กินโควตาสกิลของเทิร์น', () => {
  const { L } = setup();
  L.skillPoints = 8;
  engine.useSkill('L', 'basic', null, 'haruka');
  assert.equal(lumi.idolKeyOf(L), 'haruka');
  assert.equal(L.skillUsedRound, undefined, 'ช่องแรกไม่กินโควตาสกิล');
  assert.equal(L.skillPoints, 8, 'ไม่เสียแต้มสกิล (คอส 0)');
});

test('[integration] ท่าไม้ตายผ่าน useSkill จริง — หักแต้มและสลับตามไอดอลถูกต้อง', () => {
  const { L } = setup();
  L.lumiIdol = 'anzu'; L.skillPoints = 8;
  engine.setGameState('PLAYING');
  engine.useSkill('L', 'ultimate');
  assert.equal(L.lumiUltIdol, 'anzu');
  assert.equal(L.skillPoints, 2, 'หักคอส 6');
  assert.equal(L.lumiPoints, 1);
});

test('[integration] ไอดอลล้มแล้วกดชุบผ่าน useSkill จริง', () => {
  const { L } = setup();
  L.hp = 0;
  engine.instantDeath(L);
  L.skillPoints = 8;
  engine.setGameState('PLAYING');
  engine.useSkill('L', 'basic');
  assert.equal(lumi.idolDown(L), false);
  assert.equal(L.hp, lumi.REVIVE_HP);
  assert.equal(L.skillPoints, 2, 'หักคอส 6 ของช่องชุบ');
});

test('[regression] broadcastState ตัวจริงไม่พังในทุกสถานะ (กันบั๊ก TDZ ของ activeSkillMusic)', () => {
  const { L } = setup();
  const realBroadcast = saved.broadcastState;
  assert.doesNotThrow(() => realBroadcast());
  L.statuses.lumiUlt = 5; L.lumiUltIdol = 'haruka';
  assert.doesNotThrow(() => realBroadcast());
  delete L.statuses.lumiUlt;
  L.statuses.lumiLuminous = 5;
  assert.doesNotThrow(() => realBroadcast());
  delete L.statuses.lumiLuminous;
  L.lumiIdolDown = true;
  assert.doesNotThrow(() => realBroadcast());
});
