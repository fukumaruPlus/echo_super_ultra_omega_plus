// ORT (บอสมหันตภัย) — กติกาหลักของ characters/ort.js ด้วย engine จำลอง
const test = require('node:test');
const assert = require('node:assert/strict');
const ort = require('../../characters/ort');

function makeEngine(players, extra = {}) {
  const logs = [];
  const fx = [];
  const engine = {
    players,
    roundNumber: 1,
    effectSourceId: null,
    log: (m) => logs.push(m),
    ortFx: (k) => fx.push(k),
    skillFlash: () => {},
    colorOf: () => "#fff",
    withEffectSource(src, fn) { const prev = engine.effectSourceId; engine.effectSourceId = src.id || src; try { return fn(); } finally { engine.effectSourceId = prev; } },
    dealMixed(t, n) { const a = Math.min(t.armor, n); t.armor -= a; t.hp -= n - a; },
    resolveDamageAftermath(t) { if (t.hp <= 0) t.alive = false; },
    ...extra,
  };
  return { engine, logs, fx };
}
const boss = (bars = 5) => {
  const p = { id: '__ort__', characterId: 'ort', name: 'ORT', alive: true, statuses: {}, cards: [] };
  ort.initBoss(p, bars);
  return p;
};
const human = (id, tier) => ({ id, characterId: 'hikaru', name: id, alive: true, hp: 7, armor: 3, statuses: {}, ortLostTier: tier || null, ortPendingLost: null, ortFirstSkillRound: 0 });

test('bar break refills HP/armor and only the last bar is fatal', () => {
  const b = boss(2);
  const { engine, fx } = makeEngine({ [b.id]: b });
  b.hp = 0; b.armor = 0;
  assert.equal(ort.tryBarBreak(engine, b), true);
  assert.equal(b.ortBars, 1);
  assert.equal(b.hp, 7);
  assert.equal(b.armor, 3);
  assert.deepEqual(fx, ['break']);
  assert.equal(ort.tryBarBreak(engine, b), false, 'last bar dies for real');
});

test('raid bars scale with players: 5 up to 4 players, +1 each after (7 players = 8)', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(ort.raidBarsFor), [5, 5, 5, 5, 6, 7, 8]);
});

test('kill resistance: chances below 40% do nothing to ORT', () => {
  const b = boss();
  assert.equal(ort.killChanceAgainst(b, 0.2), 0);
  assert.equal(ort.killChanceAgainst(b, 0.39), 0);
  assert.equal(ort.killChanceAgainst(b, 0.4), 0.4);
  assert.equal(ort.killChanceAgainst(b, 1), 1);
  assert.equal(ort.killChanceAgainst(human('x'), 0.2), 0.2, 'players are unaffected');
});

test('evolution: +1 bar every kill, attack capped at 3 total', () => {
  const b = boss(5);
  const players = { [b.id]: b };
  const { engine } = makeEngine(players);
  engine.effectSourceId = b.id;
  for (let i = 0; i < 4; i++) ort.onKill(engine, human('v' + i));
  assert.equal(b.ortBars, 9);
  assert.equal(b.ortAtk, 3);
  // ตายตอนกวาดท้ายเทิร์น (ไม่มี effectSourceId) แต่ ORT ตีเป็นคนสุดท้ายในเทิร์นนี้ = นับให้ ORT
  engine.effectSourceId = null;
  engine.roundNumber = 7;
  ort.onKill(engine, { ...human('late'), lastDamageSourceId: b.id, lastDamageRound: 7 });
  assert.equal(b.ortBars, 10, 'kill from the end-of-turn sweep still counts');
  ort.onKill(engine, { ...human('stale'), lastDamageSourceId: b.id, lastDamageRound: 6 });
  assert.equal(b.ortBars, 10, 'a hit from an earlier turn does not count');
  engine.effectSourceId = 'someone-else';
  ort.onKill(engine, human('v9'));
  assert.equal(b.ortBars, 10, 'kills by others do not count');
});

test('data lost: first skill of a turn is erased for 2 turns, moves when another skill is used', () => {
  const b = boss();
  const h = human('p1');
  const players = { [b.id]: b, [h.id]: h };
  const { engine } = makeEngine(players);
  engine.roundNumber = 1;
  ort.onSkillUsed(engine, h, 'basic');
  ort.onSkillUsed(engine, h, 'secondary'); // only the first skill of the turn counts
  assert.equal(ort.skillErased(engine, h, 'basic'), false, 'not erased during the same turn');
  engine.roundNumber = 2;
  ort.onRoundStart(engine);
  assert.equal(ort.skillErased(engine, h, 'basic'), true);
  assert.equal(ort.skillErased(engine, h, 'secondary'), false);
  assert.equal(ort.lostTurnsLeft(engine, h), 2);
  engine.roundNumber = 3;
  ort.onRoundStart(engine);
  assert.equal(ort.skillErased(engine, h, 'basic'), true, 'still erased on the 2nd turn');
  assert.equal(ort.lostTurnsLeft(engine, h), 1);
  engine.roundNumber = 4;
  ort.onRoundStart(engine);
  assert.equal(ort.skillErased(engine, h, 'basic'), false, 'data comes back after 2 turns');
  assert.equal(h.ortLostTier, null);
  // using a different skill moves the erasure next turn and restarts the 2 turns
  ort.onSkillUsed(engine, h, 'secondary');
  engine.roundNumber = 5;
  ort.onRoundStart(engine);
  ort.onSkillUsed(engine, h, 'ultimate');
  engine.roundNumber = 6;
  ort.onRoundStart(engine);
  assert.equal(ort.skillErased(engine, h, 'secondary'), false);
  assert.equal(ort.skillErased(engine, h, 'ultimate'), true);
  assert.equal(ort.lostTurnsLeft(engine, h), 2);
  // ORT gone -> nothing is erased
  b.alive = false;
  assert.equal(ort.skillErased(engine, h, 'ultimate'), false);
});

test('counter: one counter per offender per action, no ping-pong', () => {
  const b = boss();
  const h = human('p1');
  const players = { [b.id]: b, [h.id]: h };
  const { engine, fx } = makeEngine(players);
  ort.queueCounter(engine, h.id);
  ort.adjustIncomingDamage.call(ort, engine, b, 2, false); // effectSourceId null -> ignored
  engine.effectSourceId = h.id;
  ort.adjustIncomingDamage.call(ort, engine, b, 2, false);
  engine.effectSourceId = null;
  ort.adjustIncomingDamage.call(ort, engine, b, 1, true); // normal attack never counters
  assert.equal(ort.flushCounters(engine), 1);
  assert.ok(h.hp + h.armor < 10, 'the offender took damage');
  assert.deepEqual(fx, ['counter']);
  assert.equal(ort.flushCounters(engine), 0, 'queue is empty afterwards');
});
