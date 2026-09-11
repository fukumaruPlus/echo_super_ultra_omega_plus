const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, captureTurnSnapshot, restoreTurnSnapshot, clearTurnSnapshot } = require('../server.js');

function makePlayer(id, extra = {}) {
  return {
    id, name: id, characterId: 'tohno', position: 1, avatar: 0,
    connected: true, socketId: 'socket-' + id, sessionToken: 'token-' + id,
    alive: true, hp: 7, armor: 5, shield: 0, tempHp: 0, dmgHp: 0,
    skillPoints: 6, skillUsedRound: false, gold: 10, inventory: [{ uid: 'i1', itemId: 'potion' }],
    cards: [], locked: false, busted: false, result: null,
    statuses: {}, statusAmt: {}, colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 },
    ...extra,
  };
}

test.afterEach(() => {
  clearTurnSnapshot();
  engine.clearPhaseTimer();
  engine.setGameMode('ffa');
  engine.setOverloadForceActive(false);
  engine.setOverloadForceCount(0);
  for (const id of Object.keys(engine.players)) delete engine.players[id];
});

test('turn rollback refunds skill points, the per-turn skill quota, items and damage dealt', () => {
  const user = makePlayer('user');
  const victim = makePlayer('victim');
  engine.players.user = user;
  engine.players.victim = victim;
  captureTurnSnapshot();

  // ผู้เล่นกดสกิลหลังเปิดไพ่ + ใช้ไอเทม ก่อน Overload Force จะทำงาน
  user.skillPoints -= 4;
  user.skillUsedRound = true;
  user.inventory = [];
  user.gold = 3;
  victim.hp = 2;
  victim.armor = 0;
  victim.statuses.stun = 1;

  assert.equal(restoreTurnSnapshot(), true);
  assert.equal(user.skillPoints, 6, 'แต้มสกิลถูกคืน');
  assert.equal(user.skillUsedRound, false, 'โควตาสกิล 1 อัน/เทิร์นถูกคืน');
  assert.deepEqual(user.inventory, [{ uid: 'i1', itemId: 'potion' }], 'ไอเทมถูกคืน');
  assert.equal(user.gold, 10);
  assert.equal(victim.hp, 7);
  assert.equal(victim.armor, 5);
  assert.deepEqual(victim.statuses, {}, 'ดีบัฟที่เกิดในเทิร์นนั้นถูกย้อนทิ้ง');
});

test('turn rollback revives a player killed during the rolled-back turn but keeps live connection data', () => {
  const p = makePlayer('dead');
  engine.players.dead = p;
  captureTurnSnapshot();

  p.alive = false;
  p.hp = 0;
  p.socketId = 'socket-new';
  p.connected = false;

  restoreTurnSnapshot();
  assert.equal(p.alive, true);
  assert.equal(p.hp, 7);
  assert.equal(p.socketId, 'socket-new', 'ข้อมูลการเชื่อมต่อเป็นของปัจจุบัน ไม่ถูกย้อน');
  assert.equal(p.connected, false);
});

test('restoreTurnSnapshot is a no-op without a snapshot and cannot be replayed twice', () => {
  const p = makePlayer('solo');
  engine.players.solo = p;
  captureTurnSnapshot();
  p.skillPoints = 0;
  assert.equal(restoreTurnSnapshot(), true);
  p.skillPoints = 1;
  assert.equal(restoreTurnSnapshot(), false, 'สแนปช็อตถูกใช้ไปแล้ว');
  assert.equal(p.skillPoints, 1);
});

test('Overload Force ครั้งที่ 3 ยังเป็นสนามปกติ (ไม่มีบอสให้เรียกอีกแล้ว)', () => {
  engine.setGameMode('ffa');
  engine.players.a = makePlayer('a');
  engine.players.b = makePlayer('b');
  engine.setOverloadForceCount(2); // ครั้งถัดไปคือครั้งที่ 3

  engine.triggerOverloadForce();

  assert.equal(engine.overloadForceCount, 3);
  assert.equal(engine.cutsceneInfo.kind, 'overloadForce');
});
