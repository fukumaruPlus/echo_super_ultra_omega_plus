// เกราะ Mark 42 (ไอเทมร้านค้า) — ผ่าน engine จริง (server.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, mark42Control } = require('../server.js');
const Mark42 = require('../characters/_mark42.js');

const blank = (id, characterId, position) => ({
  id, name: id, position, characterId, alive: true, connected: true, cards: [], statuses: {}, statusAmt: {},
  seen: {}, cutsceneShown: {}, inventory: [], teamId: null, gold: 30,
});
function setup() {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  engine.players.A = blank('A', 'temari', 1);
  engine.players.B = blank('B', 'kai', 2);
  engine.players.C = blank('C', 'temari', 3);
  engine.setGameMode('ffa');
  engine.startMatch();
  engine.clearPhaseTimer();
  engine.setGameState('PLAYING');
  engine.setRoundNumber(5);
  for (const p of Object.values(engine.players)) {
    p.locked = false; p.hp = 7; p.armor = 1; p.shield = 0; p.statuses = {}; p.statusAmt = {}; p.inventory = []; p.gold = 30;
    Mark42.resetCombat(p);
  }
  cutscenes.length = 0;
  return engine.players;
}
const giveSuit = (p) => engine.grantInventoryItem(p, { type: 'mark42', price: 15 });
const use = (p, mode, targetId) => engine.useInventoryItem(p.id, p.inventory.find((i) => i.type === 'mark42').uid, { mode, targetId });
function attack(by, target) {
  engine.setGameState('ATTACK');
  engine.setAttackerId(by);
  engine.doAttack(by, target);
  engine.clearPhaseTimer();
  engine.setGameState('PLAYING');
}

const saved = { triggerCutscene: engine.triggerCutscene, queueCutscene: engine.queueCutscene, skillFlash: engine.skillFlash };
const cutscenes = [];
test.before(() => {
  // ไม่มีคลิปเข้าคิวจริง = ผลที่รอหลังวีดีโอลงทันที
  engine.triggerCutscene = (p, k) => cutscenes.push(k);
  engine.queueCutscene = (p, k) => cutscenes.push(k);
  engine.skillFlash = () => {};
});
test.after(() => { Object.assign(engine, saved); for (const id of Object.keys(engine.players)) delete engine.players[id]; });
test.afterEach(() => engine.clearPhaseTimer());

test('ใส่ให้ตัวเอง: เกราะชุด 7 แทนตัวจริง · พลังโจมตี +1 · ภาพเปลี่ยน · หน้าจอแสดงเลือด 0/0', () => {
  const { A, B } = setup();
  giveSuit(A);
  use(A, 'self');
  assert.ok(A.mark42);
  assert.equal(A.inventory.length, 0);
  assert.equal(engine.displayImg(A), Mark42.IMG.suit);
  const st = engine.buildStateFor('A').players.find((p) => p.id === 'A');
  assert.deepEqual([st.hp, st.maxHp, st.armor, st.maxArmor], [0, 0, 7, 7]);
  attack('A', 'B');
  assert.equal(B.hp + B.armor, 8 - 2, 'พลังโจมตี 1 + 1');
  attack('B', 'A');
  assert.equal(A.mark42.armor, 6, 'ชุดรับแทน');
  assert.deepEqual([A.hp, A.armor], [7, 1], 'เลือด/เกราะจริงไม่ถูกแตะ');
});

test('ชุดพังจากการต่อสู้ = กลับร่างเดิม (ดาเมจเกินหายไป) · เจ้าของซื้อใหม่ไม่ได้ 10 เทิร์น', () => {
  const { A } = setup();
  giveSuit(A);
  use(A, 'self');
  engine.dealDirect(A, 20); // แรงมาก + เจาะเกราะ
  assert.equal(A.mark42, null);
  assert.equal(A.alive, true);
  assert.deepEqual([A.hp, A.armor], [7, 1]);
  assert.equal(Mark42.buyLockLeft(engine, A), 11);
  assert.equal(Mark42.canBuy(engine, A), false);
  engine.setRoundNumber(16);
  assert.equal(Mark42.canBuy(engine, A), true);
});

test('สังหารทันทีระหว่างใส่ชุด = แค่ชุดพัง · แพ้จั่ว/สถานะ ลงชุด', () => {
  const { A } = setup();
  giveSuit(A);
  use(A, 'self');
  engine.damageSoft(A);
  A.statuses.hbleed = 2;
  require('../characters/_universal_status').tickBleed(engine, A);
  assert.equal(A.mark42.armor, 5);
  engine.instantDeath(A);
  assert.equal(A.alive, true);
  assert.equal(A.mark42, null);
  assert.equal(A.hp, 7);
});

test('ใส่ให้คนอื่น: คนใส่ถอดเองไม่ได้ · เจ้าของเรียกคืน (เกราะที่เหลือตามมา) / ถอดกลับเข้ากระเป๋า', () => {
  const { A, B } = setup();
  giveSuit(A);
  use(A, 'give', 'B');
  assert.equal(B.mark42.ownerId, 'A');
  assert.equal(A.mark42Owned.wearerId, 'B');
  mark42Control('B', 'remove');
  assert.ok(B.mark42, 'คนใส่ถอดเองไม่ได้ (ไม่ใช่เจ้าของ)');
  engine.dealMixed(B, 2);
  assert.equal(B.mark42.armor, 5);
  mark42Control('A', 'recall');
  assert.equal(B.mark42, null);
  assert.equal(A.mark42.armor, 5, 'เรียกคืนพร้อมเกราะที่เหลือ');
  assert.deepEqual(cutscenes, ['mark42SuitSome', 'mark42Recall']);
  mark42Control('A', 'remove');
  assert.equal(A.mark42, null);
  assert.equal(A.inventory[0].type, 'mark42');
  assert.equal(A.inventory[0].armor, 5);
  assert.equal(Mark42.canBuy(engine, A), false, 'ยังมีชุดในกระเป๋า = ซื้อซ้ำไม่ได้');
});

test('ระเบิด: ใส่ให้แล้วระเบิดทันที 4 (ลดเกราะก่อน) · สั่งระเบิดชุดบนตัวคนอื่น = ชุดพังแล้ว 4 ลงตัวจริง', () => {
  const { A, B, C } = setup();
  giveSuit(A);
  use(A, 'bomb', 'B');
  assert.equal(B.mark42, null);
  assert.deepEqual([B.armor, B.hp], [0, 4]);
  assert.equal(A.inventory.length, 0, 'ชุดถูกใช้ไปแล้ว');
  assert.equal(Mark42.buyLockLeft(engine, A), 0, 'ระเบิดเองไม่ติดคูลดาวน์');

  giveSuit(A);
  use(A, 'give', 'C');
  mark42Control('A', 'detonate');
  assert.equal(C.mark42, null);
  assert.deepEqual([C.armor, C.hp], [0, 4]);
  assert.equal(A.mark42Owned, null);
});

test('ใส่ซ้อนไม่ได้ · ORT ใส่ไม่ได้ · ซื้อจากร้านได้ชุดเดียว', () => {
  const { A, B } = setup();
  giveSuit(A);
  use(A, 'give', 'B');
  giveSuit(A); // สมมติได้มาอีกชุด
  use(A, 'give', 'B');
  assert.equal(A.inventory.length, 1, 'B ใส่อยู่แล้ว ใส่ซ้อนไม่ได้');
  B.isBoss = true;
  assert.equal(Mark42.validWearer(engine, { ...B, mark42: null, isBoss: true, id: '__ort__' }), false);

  const { A: A2 } = setup();
  engine.setShopItems([{ id: 's1', type: 'mark42', price: 15, sold: false }, { id: 's2', type: 'mark42', price: 15, sold: false }]);
  engine.buyShopItem('A', 's1');
  engine.buyShopItem('A', 's2');
  assert.equal(A2.inventory.filter((i) => i.type === 'mark42').length, 1);
  assert.equal(A2.gold, 15);
});
