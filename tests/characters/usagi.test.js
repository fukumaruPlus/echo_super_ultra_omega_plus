// อุซากิ — กติกาหลักของ characters/usagi.js ด้วย engine จำลอง + ด่านโควตาสกิลจริงใน server
const test = require('node:test');
const assert = require('node:assert/strict');
const usagi = require('../../characters/usagi');

function makeEngine(players, extra = {}) {
  const logs = [];
  const cutscenes = [];
  const engine = {
    players,
    roundNumber: 1,
    gameState: 'PLAYING',
    effectSourceId: null,
    log: (m) => logs.push(m),
    queueCutscene: (p, k) => cutscenes.push(k),
    nextTransformCounter: () => 1,
    shopItemName: (it) => it.type,
    healHp(p, n) { const before = p.hp; p.hp = Math.min(7, p.hp + n); return p.hp - before; },
    applyBuff(p, key, amt, turns) { p.statuses[key] = Math.max(p.statuses[key] || 0, turns); },
    sameTeam: (a, b) => !!(a.teamId && a.teamId === b.teamId && a.id !== b.id),
    withEffectSource(src, fn) { const prev = engine.effectSourceId; engine.effectSourceId = src.id; try { return fn(); } finally { engine.effectSourceId = prev; } },
    dealMixed(t, n) { const a = Math.min(t.armor, n); t.armor -= a; t.hp -= n - a; },
    resolveDamageAftermath(t) { if (t.hp <= 0) t.alive = false; },
    scoreOf: (p) => p.cards.reduce((n, c) => n + c.value, 0),
    bustedOf: (p) => p.cards.reduce((n, c) => n + c.value, 0) > 21,
    voidUltimateOnBust: () => {},
    ...extra,
  };
  return { engine, logs, cutscenes };
}
const player = (id, over = {}) => ({ id, name: id, characterId: 'kai', alive: true, hp: 4, armor: 3, statuses: {}, cards: [], inventory: [], teamId: null, ...over });
const bunny = (over = {}) => { const p = player('u', { characterId: 'usagi', ...over }); usagi.resetCombat(p); return p; };

test('basic: eat an item — 5+ coins heals 3 + resist 2, cheaper heals 1 + resist 1, 2 uses per turn', () => {
  const u = bunny({ hp: 2, inventory: [{ uid: 'a', type: 'gutsGun', price: 8 }, { uid: 'b', type: 'fortune', price: 3 }, { uid: 'c', type: 'resist', price: 4 }] });
  const { engine } = makeEngine({ u });
  assert.equal(usagi.canUseSkill(engine, u, 'basic', [], 'zzz'), false, 'must pick an item that exists');
  assert.equal(usagi.canUseSkill(engine, u, 'basic', [], 'a'), true);
  usagi.applyInstantSkill(engine, u, 'basic', [], 'a');
  assert.equal(u.hp, 5);
  assert.equal(u.statuses.resist, 2);
  assert.equal(u.inventory.length, 2, 'the item is eaten');
  u.statuses = {};
  usagi.applyInstantSkill(engine, u, 'basic', [], 'b');
  assert.equal(u.hp, 6);
  assert.equal(u.statuses.resist, 1);
  assert.equal(usagi.canUseSkill(engine, u, 'basic', [], 'c'), false, 'only 2 uses per turn');
  usagi.onRoundStartTick(engine, u);
  assert.equal(usagi.canUseSkill(engine, u, 'basic', [], 'c'), true, 'quota refills next turn');
});

test('secondary: see the target score first, accept swaps whole hands (bust included), decline keeps them', () => {
  const u = bunny({ cards: [{ value: 5 }, { value: 4 }] });
  const t = player('t', { cards: [{ value: 10 }, { value: 9 }, { value: 8 }] });
  const { engine, cutscenes } = makeEngine({ u, t });
  assert.equal(usagi.canUseSkill(engine, u, 'secondary', ['u']), false, 'cannot pick yourself');
  usagi.applyInstantSkill(engine, u, 'secondary', ['t']);
  const priv = usagi.privateState(engine, u);
  assert.equal(priv.usagiSwapOffer.score, 27);
  assert.equal(priv.usagiSwapOffer.busted, true);
  assert.equal(usagi.answerSwap(engine, u, true), true);
  assert.deepEqual(cutscenes, ['usagiSwap'], 'the swap video plays first');
  usagi.applySwap(engine, u);
  assert.equal(engine.scoreOf(u), 27);
  assert.equal(u.busted, true, 'the bust comes along');
  assert.equal(engine.scoreOf(t), 9);
  assert.equal(t.busted, false);

  usagi.applyInstantSkill(engine, u, 'secondary', ['t']);
  assert.equal(usagi.answerSwap(engine, u, false), false);
  assert.equal(engine.scoreOf(u), 27, 'declining changes nothing');
  assert.equal(u.usagiSwapOffer, null);
});

test('math questions always have integer answers', () => {
  for (let i = 0; i < 500; i++) {
    const { q, a } = usagi.makeQuestion();
    assert.ok(Number.isInteger(a), q);
    const [x, op, y] = q.split(' ');
    const want = op === '+' ? +x + +y : op === '-' ? x - y : op === '×' ? x * y : x / y;
    assert.equal(a, want, q);
  }
});

test('ultimate: opponents (not teammates, not ORT) get 3 questions for 3 turns; wrong answers hurt', () => {
  const u = bunny({ teamId: 'A' });
  const mate = player('mate', { teamId: 'A' });
  const foe = player('foe', { teamId: 'B', hp: 4, armor: 1 });
  const boss = player('boss', { isBoss: true });
  const { engine } = makeEngine({ u, mate, foe, boss });
  usagi.applyInstantSkill(engine, u, 'ultimate');
  assert.equal(usagi.canUseSkill(engine, u, 'ultimate'), false, 'cannot stack while active');
  for (let turn = 0; turn < 3; turn++) {
    usagi.onRoundStartAfterLoop(engine);
    assert.ok(foe.usagiQuiz, `turn ${turn + 1}: the opponent gets a quiz`);
    assert.equal(mate.usagiQuiz || null, null, 'teammates are skipped');
    assert.equal(boss.usagiQuiz || null, null, 'ORT is skipped');
    const qz = foe.usagiQuiz;
    usagi.answerQuiz(engine, foe, qz.items[0].a);       // ถูก
    usagi.answerQuiz(engine, foe, qz.items[1].a + 1);   // ผิด
    usagi.answerQuiz(engine, foe, qz.items[2].a);       // ถูก
    assert.equal(foe.usagiQuiz, null, 'finished');
  }
  usagi.onRoundStartAfterLoop(engine);
  assert.equal(foe.usagiQuiz, null, 'no 4th turn');
  assert.equal(foe.armor + foe.hp, 5 - 3, 'one wrong answer per turn = 3 damage');
});

test('quiz clock pauses during cutscenes and unanswered questions count as wrong', () => {
  const u = bunny();
  const foe = player('foe', { hp: 7, armor: 0 });
  const { engine } = makeEngine({ u, foe });
  usagi.applyInstantSkill(engine, u, 'ultimate');
  usagi.onRoundStartAfterLoop(engine);
  foe.usagiQuiz.deadline = Date.now() + 3000;
  engine.gameState = 'CUTSCENE';
  usagi.syncPause(engine);
  assert.equal(foe.usagiQuiz.paused, true);
  assert.equal(usagi.answerQuiz(engine, foe, 1), false, 'answers are ignored while paused');
  assert.equal(foe.usagiQuiz.idx, 0);
  engine.gameState = 'PLAYING';
  usagi.syncPause(engine);
  assert.equal(foe.usagiQuiz.paused, false);
  assert.ok(foe.usagiQuiz.deadline > Date.now() + 2000, 'the remaining time is kept');
  usagi.sweepQuizzes(engine); // หมดเฟสจั่วไพ่ทั้งที่ยังไม่ตอบ
  assert.equal(foe.hp, 4, 'all 3 unanswered questions count as wrong');
});

test('passive ปรุๆ: +2 per attack (max 8), 7% crit each, ATK +1 from 5, decays after 3 idle turns', () => {
  const u = bunny();
  const { engine } = makeEngine({ u });
  usagi.onAttack(engine, u);
  usagi.onAttack(engine, u);
  assert.equal(u.usagiPuru, 4);
  assert.equal(usagi.damageBonus(engine, u), 0);
  usagi.onAttack(engine, u);
  assert.equal(u.usagiPuru, 6);
  assert.equal(usagi.damageBonus(engine, u), 1, 'ATK +1 from 5');
  usagi.onAttack(engine, u); usagi.onAttack(engine, u);
  assert.equal(u.usagiPuru, 8, 'capped at 8');

  const orig = Math.random;
  try {
    Math.random = () => 0.55; // < 8 × 7% = 56%
    assert.equal(usagi.applyCrit(engine, u, 3, {}), 6);
    Math.random = () => 0.57;
    assert.equal(usagi.applyCrit(engine, u, 3, {}), 3);
  } finally { Math.random = orig; }

  usagi.onRoundStartTick(engine, u);
  usagi.onRoundStartTick(engine, u);
  assert.equal(u.usagiPuru, 8);
  usagi.onRoundStartTick(engine, u);
  assert.equal(u.usagiPuru, 7, 'third idle turn drops 1');
  usagi.onRoundStartTick(engine, u);
  usagi.onAttack(engine, u); // ได้เพิ่ม -> เริ่มนับใหม่
  usagi.onRoundStartTick(engine, u);
  usagi.onRoundStartTick(engine, u);
  assert.equal(u.usagiPuru, 8, 'gaining resets the countdown');
});

test('server: Usagi basic does not use up the turn skill quota', () => {
  const { engine } = require('../../server.js');
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  try {
    engine.players.u = {
      id: 'u', name: 'U', position: 1, characterId: 'usagi', alive: true, connected: true, cards: [], statuses: {}, statusAmt: {}, seen: {},
      inventory: [], teamId: null,
    };
    engine.players.k = { id: 'k', name: 'K', position: 2, characterId: 'kai', alive: true, connected: true, cards: [], statuses: {}, statusAmt: {}, seen: {}, inventory: [], teamId: null };
    engine.setGameMode('ffa');
    engine.startMatch();
    engine.clearPhaseTimer();
    engine.setGameState('PLAYING');
    const u = engine.players.u;
    u.locked = false;
    u.skillPoints = 8;
    u.inventory = [{ uid: 'i1', type: 'resist', price: 4 }, { uid: 'i2', type: 'resist', price: 6 }];
    engine.useSkill('u', 'basic', [], 'i1');
    engine.useSkill('u', 'basic', [], 'i2');
    assert.equal(u.inventory.length, 0, 'both items eaten');
    assert.equal(u.skillPoints, 6, '1 point each');
    assert.equal(u.skillUsedRound, false, 'turn skill quota untouched');
  } finally {
    engine.clearPhaseTimer();
    for (const id of Object.keys(engine.players)) delete engine.players[id];
  }
});
