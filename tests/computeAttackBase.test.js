// Regression net for doAttack()'s damage-bonus formula, extracted as computeAttackBase()
// (see server.js). Phase 1 of the contribution-list redesign plan: this suite locks in
// the CURRENT behavior of all ~32 terms so the upcoming per-character extraction (Phase 2)
// can be verified against it after every batch, one character at a time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeAttackBase, engine } = require('../server.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'tohno', hp: 5, armor: 2, coins: 0,
    statuses: {}, statusAmt: {}, appleAtkBuffs: [],
  }, over);
  engine.players[id] = p;
  return p;
}

function base(attackerOver = {}, targetOver = {}) {
  const attacker = mkPlayer(attackerOver);
  const target = mkPlayer(Object.assign({ characterId: 'nanaya' }, targetOver));
  return computeAttackBase(engine, attacker, target).base;
}

test('baseline: plain attacker vs plain target = 1', () => {
  assert.equal(base(), 1);
});

// ---------- simple flat-status terms (Batch A candidates) ----------
test('veilAtk (oberon "veil" status): +1, applies to ANY carrier (Oberon grants it to the whole team, not just self)', () => {
  assert.equal(base({ characterId: 'oberon', statuses: { veil: 2 } }), 1, 'oberon carrying veil: +1 veil, -1 oberonZero = net 0 on top of base 1');
  assert.equal(base({ characterId: 'tohno', statuses: { veil: 2 } }), 2, 'non-oberon carrying veil still gets +1');
});
test('oberonZero: oberon attacker gets -1 base (0 total, floored elsewhere not here)', () => {
  assert.equal(base({ characterId: 'oberon' }), 0);
});
test('empowerAtk (bard Rejuvenation): +1', () => {
  assert.equal(base({ statuses: { empower: 1 } }), 2);
});
test('appleAtk (appleguy give-buff stacks): +N (array length)', () => {
  assert.equal(base({ characterId: 'appleguy', appleAtkBuffs: ['a', 'b', 'c'] }), 4);
});
test('kotoneLove (รัก รักที่สุดเลย): +floor(piggy/5) capped at 3, only for kotone characterId', () => {
  assert.equal(base({ characterId: 'kotone', piggy: 7, statuses: { kotoneLove: 1 } }), 2, 'floor(7/5)=1');
  assert.equal(base({ characterId: 'kotone', piggy: 15, statuses: { kotoneLove: 1 } }), 4, 'floor(15/5)=3');
  assert.equal(base({ characterId: 'kotone', piggy: 40, statuses: { kotoneLove: 1 } }), 4, 'capped at +3');
  assert.equal(base({ characterId: 'kotone', piggy: 15 }), 1, 'no bonus without the buff');
  assert.equal(base({ characterId: 'tohno', piggy: 15, statuses: { kotoneLove: 1 } }), 1, 'kotoneLove must not apply to non-kotone');
});
test('phenexRebornAtk: +1', () => {
  assert.equal(base({ characterId: 'phenex', phenexReborn: true }), 2);
});
test('phenexNtdAtk (phenexNtd status OR permanent flag): +1', () => {
  assert.equal(base({ characterId: 'phenex', statuses: { phenexNtd: 1 } }), 2);
  assert.equal(base({ characterId: 'phenex', phenexNtdPermanent: true }), 2);
});
test('takutoAtk (apprivoise form): +1', () => {
  assert.equal(base({ characterId: 'takuto', statuses: { apprivoise: 1 } }), 2);
});

// ---------- terms with cross-cutting values reused later in doAttack (Batch B candidates) ----------
test('doomBaseAtk replaces the universal base-1 with weapon atk; doomLockonAtk adds on top vs a locked-on target', () => {
  const attacker = mkPlayer({ characterId: 'doomguy', doomWeapon: 'shotgun' });
  const target = mkPlayer({ characterId: 'tohno', statuses: { doomLockon: 1 } });
  assert.equal(computeAttackBase(engine, attacker, target).base, 3, 'shotgun atk=2 + lockon bonus=1');
  const target2 = mkPlayer({ characterId: 'tohno' });
  assert.equal(computeAttackBase(engine, attacker, target2).base, 2, 'shotgun atk=2, no lockon target');
});
test('doomCrucible overrides weapon atk entirely (7)', () => {
  const attacker = mkPlayer({ characterId: 'doomguy', doomWeapon: 'bfg', statuses: { doomCrucible: 1 } });
  const target = mkPlayer({ characterId: 'tohno' });
  assert.equal(computeAttackBase(engine, attacker, target).base, 7);
});
test('kotoneLove reports ctx for the attack-fx card and coin-consumption step', () => {
  const attacker = mkPlayer({ characterId: 'kotone', piggy: 12, statuses: { kotoneLove: 1 } });
  const target = mkPlayer({ characterId: 'tohno' });
  const dayEngine = Object.assign(Object.create(engine), { isNightRound: () => false });
  const result = computeAttackBase(dayEngine, attacker, target);
  assert.equal(result.base, 3, 'ฐาน 1 + floor(12/5)=2');
  assert.equal(result.kotoneLove, true);
  assert.equal(result.kotoneLoveDmg, 2);
});
test('oguriGoldAtk: capped at OGURI_GOLD_ATK_CAP even with excess stacks; victoryAtk adds OGURI_ULT_ATK_BONUS', () => {
  const attacker = mkPlayer({ characterId: 'oguri', statuses: { victorybeat: 1 } });
  const oguriEngine = Object.assign(Object.create(engine), { oguriGoldStacks: () => 99 });
  const target = mkPlayer({ characterId: 'tohno' });
  assert.equal(computeAttackBase(oguriEngine, attacker, target).base, 1 + 2 + 2, 'base 1 + gold cap 2 + victory bonus 2');
});
test('miyakoAtkBonusOn: via "yaak" stack or via miyakoUlt, only for miyako, +1', () => {
  assert.equal(base({ characterId: 'miyako', statuses: { yaak: 1 } }), 2);
  assert.equal(base({ characterId: 'miyako', statuses: { miyakoUlt: 1 } }), 2);
  assert.equal(base({ characterId: 'tohno', statuses: { yaak: 1 } }), 1, 'yaak ignored for non-miyako');
});
test('ginga (hikaru Ultlive form): +1', () => {
  mkPlayer({ characterId: 'tohno' }); // a 3rd live player so lastStanding doesn't also fire here
  assert.equal(base({ characterId: 'hikaru', statuses: { ginga: 1 } }), 2);
});
test('gingastriumAtk: counted twice by design (ginga||gingastrium, plus gingastrium again) = +2', () => {
  mkPlayer({ characterId: 'tohno' }); // a 3rd live player so lastStanding doesn't also fire here
  assert.equal(base({ characterId: 'hikaru', statuses: { gingastrium: 1 } }), 3);
});
test('lastStanding (hikaru, only one opponent left on the whole field): +1 on top of ginga', () => {
  const attacker = mkPlayer({ characterId: 'hikaru', statuses: { ginga: 1 } });
  const target = mkPlayer({ characterId: 'tohno' });
  // beforeEach cleared engine.players, so attacker+target are the only two alive -> lastStanding true
  assert.equal(computeAttackBase(engine, attacker, target).base, 3, 'ginga(1) + lastStanding(1) = +2 on top of base 1');
});

// ---------- ctx passthrough sanity (values needed by post-damage hooks downstream) ----------
test('ctx carries raw flags needed by downstream post-damage hooks, not just the summed base', () => {
  mkPlayer({ characterId: 'tohno' }); // ผู้เล่นคนที่ 3 กัน lastStanding ไม่ให้ทำงานร่วมด้วย
  const attacker = mkPlayer({ characterId: 'hikaru', statuses: { storium: 1 } });
  const target = mkPlayer({ characterId: 'tohno' });
  const result = computeAttackBase(engine, attacker, target);
  assert.equal(result.storiumAtk, true, 'raw boolean must survive for the storium damage-override step');
  assert.equal(result.base, 1);
});
