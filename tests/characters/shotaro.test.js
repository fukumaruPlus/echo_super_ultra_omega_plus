// ฮิดาริ โชว์ทาโร่ — กติกาของ characters/shotaro.js + Maximum Drive ผ่าน doAttack จริงของ server
const test = require('node:test');
const assert = require('node:assert/strict');
const shotaro = require('../../characters/shotaro');
const { engine } = require('../../server.js');

function mockEngine(players) {
  const logs = [];
  return {
    logs,
    engine: {
      players,
      log: (m) => logs.push(m),
      bustedOf: (p) => p.cards.reduce((n, c) => n + c.value, 0) > 21,
      scoreOf: (p) => p.cards.reduce((n, c) => n + c.value, 0),
      healHp(p, n) { const b = p.hp; p.hp = Math.min(7, p.hp + n); return p.hp - b; },
      withEffectSource: (src, fn) => fn(),
      applyShock(p, turns) { p.statuses.shock = turns; return true; },
      nextTransformCounter: () => 1,
      triggerCutscene: () => {},
    },
  };
}
const player = (id, over = {}) => ({ id, name: id, characterId: 'kai', alive: true, hp: 3, armor: 3, statuses: {}, cards: [], ...over });
const detective = (over = {}) => { const p = player('s', { characterId: 'shotaro', ...over }); shotaro.resetCombat(p); return p; };
const hand = (...vals) => vals.map((value) => ({ value }));

test('guess: 4 choices judged on the final score at reveal; right = heal 2, suspicion +1, target shocked', () => {
  const cases = [['low', hand(4, 6), true], ['mid', hand(10, 5), true], ['top', hand(10, 9, 2), true], ['bust', hand(10, 9, 5), true], ['mid', hand(10, 9, 2), false], ['top', hand(10, 9, 5), false]];
  for (const [pick, cards, right] of cases) {
    const s = detective();
    const t = player('t', { cards });
    const { engine: e } = mockEngine({ s, t });
    assert.equal(shotaro.canUseSkill(e, s, 'basic', ['s'], pick), false, 'cannot guess yourself');
    assert.equal(shotaro.canUseSkill(e, s, 'basic', ['t'], 'nope'), false, 'must pick a valid choice');
    shotaro.applyInstantSkill(e, s, 'basic', ['t'], pick);
    assert.ok(shotaro.privateState(e, s).shotaroGuess, 'the guess is visible to the owner');
    shotaro.resolveGuesses(e);
    assert.equal(s.hp, right ? 5 : 3, `${pick} vs ${cards.map((c) => c.value)}`);
    assert.equal(s.shotaroSuspicion, right ? 1 : 0);
    assert.equal(t.statuses.shock || 0, right ? 2 : 0);
    assert.equal(s.shotaroGuess, null);
  }
});

test('suspicion caps at 3; Lost Driver needs 3, spends it, gives Joker for 10 turns and blocks re-use', () => {
  const s = detective({ shotaroSuspicion: 2 });
  const { engine: e } = mockEngine({ s });
  assert.equal(shotaro.canUseSkill(e, s, 'ultimate'), false);
  s.shotaroSuspicion = 3;
  assert.equal(shotaro.canUseSkill(e, s, 'ultimate'), true);
  assert.equal(shotaro.canUseSkill(e, s, 'secondary'), false, 'Maximum Drive needs Joker');
  shotaro.applyInstantSkill(e, s, 'ultimate');
  assert.equal(s.shotaroSuspicion, 0);
  assert.equal(s.statuses.shotaroJoker, 10);
  assert.equal(shotaro.damageBonus(e, s), 1, 'Joker ATK +1');
  s.shotaroSuspicion = 3;
  assert.equal(shotaro.canUseSkill(e, s, 'ultimate'), false, 'no re-use while Joker');
  assert.equal(shotaro.canUseSkill(e, s, 'secondary'), true);
  shotaro.applyInstantSkill(e, s, 'secondary');
  assert.equal(shotaro.damageBonus(e, s), 2, 'Joker +1 and Maximum Drive +1');
  assert.equal(shotaro.canUseSkill(e, s, 'secondary'), false, 'cannot stack Maximum Drive');
  // ร่างหมดก่อนได้ตี -> ท่าหายไปด้วย
  delete s.statuses.shotaroJoker;
  shotaro.onRoundStartTick(e, s);
  assert.equal(s.shotaroDrive, false);
});

// ---------- ผ่าน server จริง ----------
function setupDuel() {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  const base = (id, ch, pos) => ({ id, name: id.toUpperCase(), position: pos, characterId: ch, alive: true, connected: true, cards: [], statuses: {}, statusAmt: {}, seen: {}, inventory: [], teamId: null });
  engine.players.s = base('s', 'shotaro', 1);
  engine.players.t = base('t', 'kai', 2);
  engine.setGameMode('ffa');
  engine.startMatch();
  engine.clearPhaseTimer();
  const s = engine.players.s, t = engine.players.t;
  s.statuses.shotaroJoker = 5;
  s.shotaroDrive = true;
  t.hp = 7; t.armor = 0; t.statuses = {}; t.statusAmt = {};
  engine.setGameState('ATTACK');
  engine.setAttackerId('s');
  return { s, t };
}
test.afterEach(() => { engine.clearPhaseTimer(); });
test.after(() => { for (const id of Object.keys(engine.players)) delete engine.players[id]; });

test('Maximum Drive through doAttack: +1 damage, burn + fragile afterwards, video before the damage scene', () => {
  const { s, t } = setupDuel();
  const orig = engine.queueCutscene;
  const queued = [];
  engine.queueCutscene = (p, key) => { queued.push(key); return orig.call(engine, p, key); };
  try {
    engine.doAttack('s', 't');
  } finally { engine.queueCutscene = orig; }
  // ฐาน 1 + โจ๊กเกอร์ 1 + Drive 1 + เปราะบางของสกิลติดตัว 1 = 4
  assert.equal(t.hp, 3, `damage 4 (hp now ${t.hp})`);
  assert.equal(s.shotaroDrive, false, 'Maximum Drive is used up');
  assert.equal(t.statuses.hburn, 2, 'burn 2');
  assert.equal(t.statuses.fragile, 3, 'fragile 3 turns');
  assert.ok(queued.includes('shotaroDrive'), 'the drive video plays');
  assert.equal(engine.gameState, 'CUTSCENE', 'video first, damage scene after');
});

test('Maximum Drive stays armed when the target dodges', () => {
  const { s, t } = setupDuel();
  t.statuses.evade = 1; t.statusAmt.evade = 100; t.evadeStacks = [{ turns: 2 }];
  engine.doAttack('s', 't');
  assert.equal(t.hp, 7, 'dodged');
  assert.equal(s.shotaroDrive, true, 'Maximum Drive is not lost');
  assert.equal(t.statuses.hburn || 0, 0);
});
