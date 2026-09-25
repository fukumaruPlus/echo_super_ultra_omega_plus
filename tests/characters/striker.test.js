// สไตรเกอร์ ยูเรก้า — กลไกต่อสู้ + สิทธิ์ตามบทบาท + การนับทีม ผ่าน engine จริง (server.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../../server.js');
const { engine, pairAllows, strikerApprove, strikerRepairStart, strikerRepairDone } = server;
const striker = require('../../characters/striker.js');
const CHARACTERS = require('../../characters.js');

const realRandom = Math.random;
const blank = (id, characterId, position) => ({
  id, name: id, position, characterId, alive: true, connected: true, cards: [], statuses: {}, statusAmt: {},
  seen: {}, cutsceneShown: {}, inventory: [], teamId: null,
});
function setup(extra = []) {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  engine.players.S = blank('S', 'striker', 1);
  engine.players.S.pair = { role: 'pilot', hostName: 'S', hostReady: true, co: { name: 'G', connected: true, ready: true } };
  engine.players.T = blank('T', 'temari', 2);
  extra.forEach((c, n) => { engine.players[`X${n}`] = blank(`X${n}`, c, 3 + n); });
  engine.setGameMode('ffa');
  engine.startMatch();
  engine.clearPhaseTimer();
  engine.setGameState('PLAYING');
  engine.setRoundNumber(3); // startMatch ยังค้างฉากเปิดตัว (รอบ 0) — ตั้งเป็นกลางเกม
  for (const p of Object.values(engine.players)) {
    p.locked = false; p.skillPoints = 8; p.skillUsedRound = false;
    p.hp = engine.maxHpOf(p); p.armor = 0; p.shield = 0; p.statuses = {}; p.statusAmt = {};
    striker.resetCombat(p);
  }
  Math.random = () => 0.99; // ไม่หลบ / ไม่สวน / ไม่ได้จังหวะ
  cutscenes.length = 0; // ทิ้งวีดีโอเปิดตัวของ startMatch
  return { S: engine.players.S, T: engine.players.T };
}
function attack(by, target) {
  engine.setGameState('ATTACK');
  engine.setAttackerId(by);
  engine.doAttack(by, target);
  engine.clearPhaseTimer();
}

const saved = { triggerCutscene: engine.triggerCutscene, queueCutscene: engine.queueCutscene, skillFlash: engine.skillFlash };
const cutscenes = [];
test.before(() => {
  // ไม่มีคลิปเข้าคิว = ผลที่รอหลังวีดีโอลงทันที
  engine.triggerCutscene = (p, k) => cutscenes.push(k);
  engine.queueCutscene = (p, k) => cutscenes.push(k);
  engine.skillFlash = () => {};
});
test.after(() => { Object.assign(engine, saved); for (const id of Object.keys(engine.players)) delete engine.players[id]; });
test.afterEach(() => { Math.random = realRandom; engine.clearPhaseTimer(); cutscenes.length = 0; });

test('ข้อมูล: พลังชีวิต 12 · เกราะ 3 · แต้มสกิล 16 · ตัวละครคู่ 1 คู่ต่อเกม · ราคา 0/5/1-9/12', () => {
  const c = CHARACTERS.CHAR_BY_ID.striker;
  assert.equal(c.pair, true);
  assert.equal(c.unique, true);
  assert.deepEqual([c.basic.cost, c.secondary.cost, c.ultimate.cost, c.ultimate2.cost], [0, 5, 1, 12]);
  const { S } = setup();
  assert.equal(engine.maxHpOf(S), 12);
  assert.equal(engine.maxArmorOf(S), 3);
  assert.equal(engine.maxSkillOf(S), 16);
});

test('สิทธิ์ตามบทบาท: นักบินจั่ว/เปิดการ์ด/โจมตี · พลปืนสกิล/ร้าน/ไอเทม · นักบินหลุดพลปืนเปิดการ์ดแทนได้แต่จั่วไม่ได้', () => {
  const p = { pair: { role: 'pilot', co: { connected: true } }, connected: true };
  assert.equal(pairAllows(p, 'pilot', 'hit'), true);
  assert.equal(pairAllows(p, 'pilot', 'useSkill'), false);
  assert.equal(pairAllows(p, 'gunner', 'useSkill'), true);
  assert.equal(pairAllows(p, 'gunner', 'buyShopItem'), true);
  assert.equal(pairAllows(p, 'gunner', 'hit'), false);
  assert.equal(pairAllows(p, 'gunner', 'attack'), false);
  assert.equal(pairAllows(p, 'gunner', 'lock'), false);
  assert.equal(pairAllows(p, 'gunner', 'toggleReady'), true, 'เหตุการณ์ที่ไม่ใช่ของบทบาทไหนทำได้ทั้งคู่');
  p.connected = false; // host = นักบิน หลุด
  assert.equal(pairAllows(p, 'gunner', 'lock'), true);
  assert.equal(pairAllows(p, 'gunner', 'hit'), false);
  assert.equal(pairAllows({ connected: true }, null, 'hit'), true, 'ตัวละครปกติไม่ถูกกรอง');
});

test('โหมดทีม: ยูเรก้านับเป็นทีมเต็ม — duo 3 ระเบียน (2:1) · trio 4 ระเบียน (2 คนบังคับ : 3)', () => {
  setup(['kai']); // S (คู่) + T + X0 = 3 ระเบียน
  assert.equal(engine.validGameMode('duo'), true);
  assert.equal(engine.validGameMode('trio'), false);
  engine.players.X1 = blank('X1', 'kai', 5); // 4 ระเบียน
  assert.equal(engine.validGameMode('trio'), true);
  assert.equal(engine.validGameMode('duo'), false, 'duo ต้องเป็นจำนวนช่องคู่');
});

test('มือมีด: สลับโหมด ไม่กินโควตา · พลังโจมตี 1 + เลือดไหล 2 · วีดีโอครั้งแรกที่เปิด', () => {
  const { S, T } = setup();
  engine.useSkill('S', 'basic');
  assert.equal(S.striker.knife, true);
  assert.equal(S.skillUsedRound, false, 'ไม่กินโควตาสกิลของเทิร์น');
  assert.deepEqual(cutscenes, ['strikerKnife']);
  attack('S', 'T');
  assert.equal(T.hp, 6, 'พลังโจมตีเหลือ 1');
  assert.equal(T.statuses.hbleed, 2);
  engine.setGameState('PLAYING'); // กลับเข้าเฟสจั่วไพ่ (สกิลกดได้เฉพาะช่วงนี้)
  engine.useSkill('S', 'basic');
  assert.equal(S.striker.knife, false);
  attack('S', 'T');
  assert.equal(T.hp, 4, 'พลังโจมตีพื้นฐาน 2');
});

test('หมัดเหล็ก: +1 ปาดบัฟล่าสุด · ต่อยคนเดิมซ้ำ = สตั้นเทิร์นถัดไป (รอบเดียว)', () => {
  const { S, T } = setup();
  engine.applyBuff(T, 'guard', 1, 3);
  engine.useSkill('S', 'secondary');
  assert.equal(S.skillPoints, 3);
  assert.equal(striker.canUseSkill(engine, S, 'secondary'), false, 'กดซ้ำระหว่างยังมีผลไม่ได้');
  attack('S', 'T');
  assert.equal(T.statuses.guard, undefined, 'บัฟถูกปาด');
  assert.equal(T.hp, 5, '2 + 1 - คุ้มครอง 1 (คุ้มครองถูกคิดไปก่อนปาด — ลำดับเดียวกับ Rider Slash)');
  assert.equal(cutscenes.at(-1), 'strikerFist');
  assert.equal(T.strikerStunPending || 0, 0);

  S.striker.fist = true; // กดรอบที่สอง
  attack('S', 'T');
  assert.equal(cutscenes.at(-1), 'strikerFistFinal');
  assert.equal(T.strikerStunPending, 1);
  striker.onRoundStartTick(engine, T);
  assert.equal(T.statuses.stun, 1, 'สตั้นเริ่มเทิร์นถัดไป');

  S.striker.fist = true; // หลังคอมโบ กลับเป็นแบบธรรมดา
  attack('S', 'T');
  assert.equal(cutscenes.at(-1), 'strikerFist');
});

test('ขีปนาวุธ: เลือก 1-9 แต้ม · ไม่โดนตัวเอง · คนละไม่เกิน 4 (นัดเกินเสียเปล่า)', () => {
  const { S, T } = setup();
  S.skillPoints = 16;
  engine.useSkill('S', 'ultimate', [], 12);
  assert.equal(S.skillPoints, 16, 'เกิน 9 นัดกดไม่ได้');
  engine.useSkill('S', 'ultimate', [], 9);
  assert.equal(S.skillPoints, 7, 'ราคาเท่าจำนวนนัด (เกินเพดาน 8 ของตัวละครปกติได้)');
  assert.deepEqual(cutscenes, ['strikerMissile']);
  assert.equal(T.hp, 3, 'รับได้แค่ 4');
  assert.equal(S.hp, 12);
});

test('เป็นเกียรติมากครับ: อนุมัติก่อนค่อยหักแต้ม · ไม่อนุมัติไม่เสียอะไร · นับถอยหลังแล้วระเบิดเอง ความแรงเพิ่มเทิร์นละ 1', () => {
  const { S, T } = setup();
  S.hp = 7; S.skillPoints = 16;
  const round = engine.roundNumber;
  engine.useSkill('S', 'ultimate');
  assert.equal(S.striker.approval.kind, 'arm');
  assert.equal(S.skillPoints, 16, 'ยังไม่หักแต้มจนกว่าจะอนุมัติ');
  strikerApprove('S', false);
  assert.equal(S.striker.approval, null);
  assert.equal(S.skillPoints, 16);

  engine.useSkill('S', 'ultimate');
  strikerApprove('S', true);
  assert.equal(S.skillPoints, 4);
  assert.ok(S.striker.honor);
  assert.equal(striker.canUseSkill(engine, S, 'basic'), false, 'ระหว่างนับถอยหลังกดสกิลอื่นไม่ได้');
  engine.setRoundNumber(round + 2);
  assert.equal(striker.honorPower(engine, S), 6);
  engine.setRoundNumber(round + 4);
  striker.onRoundStartTick(engine, S);
  assert.equal(S.striker.detonatePending, true);
  striker.flushDetonation(engine);
  assert.equal(T.alive, false, 'ครบกำหนด แรง 8 (พลังชีวิต 7)');
  assert.equal(S.alive, false, 'ยูเรก้าตกรอบพร้อมคู่หู');
});

test('เป็นเกียรติมากครับ: กดซ้ำขอระเบิดทันที (อนุมัติอีกครั้ง) แรงตามเวลาที่รอ', () => {
  const { S, T } = setup();
  S.hp = 5; S.skillPoints = 16;
  const round = engine.roundNumber;
  engine.useSkill('S', 'ultimate');
  strikerApprove('S', true);
  engine.setRoundNumber(round + 1);
  S.skillUsedRound = false;
  engine.setGameState('PLAYING');
  engine.useSkill('S', 'ultimate');
  assert.equal(S.striker.approval.kind, 'detonate');
  strikerApprove('S', true);
  assert.equal(T.hp, 7 - 5);
  assert.equal(S.alive, false);
});

test('เตาปฏิกรณ์: เลือด <= 7 ท่าไม้ตายเปลี่ยน + วีดีโอครั้งเดียว · ถูกตี 15% แทงสวนเท่าพลังโจมตีปกติ', () => {
  const { S, T } = setup();
  S.hp = 8;
  Math.random = () => 0.1; // ติดแทงสวน (และหลบ 5% ไม่ติดเพราะ 0.1*100 >= 5)
  attack('T', 'S');
  assert.equal(S.hp, 7);
  assert.ok(cutscenes.includes('strikerReactor'));
  assert.ok(cutscenes.includes('strikerCounter'));
  assert.equal(T.hp, 5, 'แทงสวนด้วยพลังโจมตีปกติ 2');
  const st = engine.buildStateFor('S').players.find((p) => p.id === 'S');
  assert.equal(st.character.ultimate.name, CHARACTERS.CHAR_BY_ID.striker.ultimate2.name);
  attack('T', 'S');
  assert.equal(cutscenes.filter((k) => k === 'strikerReactor').length, 1, 'วีดีโอเตาปฏิกรณ์ครั้งเดียว');
});

test('Mark 5: หลบ 5% · ยังมีเกราะฟื้นแต้มสกิล +1 ต่อเทิร์น', () => {
  const { S, T } = setup();
  Math.random = () => 0.01;
  attack('T', 'S');
  assert.equal(S.hp, 12, 'หลบได้');
  S.skillPoints = 0; S.armor = 1;
  striker.onRoundStartTick(engine, S);
  assert.equal(S.skillPoints, 1);
  S.armor = 0;
  striker.onRoundStartTick(engine, S);
  assert.equal(S.skillPoints, 1, 'ไม่มีเกราะ = ไม่ได้');
  void T;
});

test('งานช่าง: ต่อสายถูกฟื้นเลือด 2 · ผิดไม่ได้ · เทิร์นที่ซ่อมชนะก็โจมตีไม่ได้ · คูลดาวน์ 2 เทิร์น', () => {
  const { S } = setup();
  S.hp = 5;
  strikerRepairStart('S');
  const r = S.striker.repair;
  assert.ok(r);
  const good = r.left.map((c, i) => [i, r.right.indexOf(c)]);
  strikerRepairDone('S', good);
  assert.equal(S.hp, 7);
  assert.equal(striker.cannotAttack(engine, S), true);
  assert.equal(striker.repairCooldown(engine, S), 3, 'รอ 2 เทิร์นเต็มนับจากเทิร์นหน้า');
  strikerRepairStart('S');
  assert.equal(S.striker.repair, null, 'ติดคูลดาวน์');

  S.striker.repairUntil = 0;
  strikerRepairStart('S');
  const r2 = S.striker.repair;
  const bad = r2.left.map((c, i) => [i, (r2.right.indexOf(c) + 1) % 4]);
  strikerRepairDone('S', bad);
  assert.equal(S.hp, 7, 'ต่อผิดสีไม่ฟื้น');
});
