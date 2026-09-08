const test = require('node:test');
const assert = require('node:assert/strict');
const Seraph = require('../seraph');
const { engine } = require('../server');

test.beforeEach(() => {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  for (const id of ['p1', 'p2']) engine.players[id] = {
    id, name: id, alive: true, characterId: 'kai', inventory: [], cards: [],
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
  };
  Seraph.startMatch(engine);
  engine.setGameState('SERAPH_PLACE');
  engine.setShopItems([1, 2, 3].map((id) => ({ id, type: 'armor', value: 1, price: 2, sold: false })));
  Seraph.startPlacePhase(engine, () => {});
});

test.afterEach(() => {
  Seraph.reset();
  engine.clearPhaseTimer();
  engine.setOverloadForceActive(false);
  engine.setOverloadForceCount(0);
  engine.setGameMode('ffa');
  engine.setShopItems([]);
  for (const id of Object.keys(engine.players)) delete engine.players[id];
});

test('shopping before and after a visit preserves one location per day; ready locks both', () => {
  const p = engine.players.p1;
  engine.buyShopItem(p.id, 1);
  assert.equal(p.inventory.length, 1);
  assert.equal(p.scPlace, null);
  Seraph.choosePlace(engine, p.id, 'library');
  engine.buyShopItem(p.id, 2);
  assert.equal(p.scSkillLevel, 2);
  assert.equal(p.inventory.length, 2);
  assert.equal(p.gold, 6);
  Seraph.choosePlace(engine, p.id, 'church', { option: 'hp' });
  assert.equal(p.scCapHp, 3);
  Seraph.readyPlace(engine, p.id);
  engine.buyShopItem(p.id, 3);
  assert.equal(p.gold, 6);
  assert.equal(engine.shopItems[2].sold, false);
  const reconnected = Seraph.stateFor(engine, p.id);
  assert.equal(reconnected.ready, true);
  assert.equal(reconnected.place, 'library');
  assert.equal(reconnected.shopOpen, false);
  assert.ok(reconnected.places.every((place) => !place.available));
  assert.equal(Seraph.stateFor(engine, 'p2').ready, false);
});

test('ready without a location skips the visit and the final shopper controls day completion', () => {
  let finished = 0;
  Seraph.startPlacePhase(engine, () => { finished++; Seraph.finishPlacePhase(engine); });
  Seraph.readyPlace(engine, 'p1');
  Seraph.choosePlace(engine, 'p1', 'room');
  assert.equal(engine.players.p1.inventory.length, 0);
  assert.equal(finished, 0);
  engine.buyShopItem('p2', 1);
  assert.equal(engine.players.p2.inventory.length, 1);
  Seraph.readyPlace(engine, 'p2');
  Seraph.readyPlace(engine, 'p2');
  assert.equal(finished, 1);
  assert.equal(engine.players.p1.scPlace, null);
  assert.equal(engine.players.p2.scPlace, null);
  Seraph.advanceDay(engine);
  Seraph.startPlacePhase(engine, () => {});
  assert.equal(Seraph.stateFor(engine, 'p1').ready, false);
  assert.equal(Seraph.canShop(engine.players.p1), true);
});

test('purchases reject other phases, eliminated players, sold stock, and duel day', () => {
  engine.setGameState('PLAYING');
  engine.buyShopItem('p1', 1);
  assert.equal(engine.shopItems[0].sold, false);
  engine.setGameState('SERAPH_PLACE');
  engine.players.p1.scEliminated = true;
  engine.buyShopItem('p1', 1);
  assert.equal(engine.shopItems[0].sold, false);
  engine.players.p1.scEliminated = false;
  engine.buyShopItem('p1', 1);
  engine.buyShopItem('p2', 1);
  assert.equal(engine.players.p2.gold, 10);
  Seraph.beginDuelDay(engine);
  engine.buyShopItem('p2', 2);
  assert.equal(engine.shopItems[1].sold, false);
});

test('safety timeout never grants a second location to players who already visited', () => {
  Seraph.choosePlace(engine, 'p1', 'library');
  Seraph.finishPlacePhase(engine);
  assert.equal(engine.players.p1.scSkillLevel, 2);
  assert.equal(engine.players.p1.scPlace, 'library');
  assert.deepEqual(engine.players.p1.scStat.places, { library: 1 });
});

test('Moon Cell blocks Overload Force during investigation and duel, including direct triggers', () => {
  for (const duel of [false, true]) {
    if (duel) Seraph.beginDuelDay(engine);
    engine.triggerOverloadForce();
    assert.equal(engine.overloadForceActive, false);
    assert.equal(engine.overloadForceCount, 0);
  }
});
