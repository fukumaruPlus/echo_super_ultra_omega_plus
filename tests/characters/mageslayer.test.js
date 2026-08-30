// Direct unit tests for characters/mageslayer.js (ผู้สังหารเมจ / Mage Slayer 25/8/69 rework) —
// Song's Curse (addSkill gate + damage bonus + Fury), Witch Mark energy-steal math / over-steal weaken /
// every-2-turn tick / mark move, ดูดซับเวท (manaLeech) 35%/60% drain, Mana Rupture damage+seal tiers,
// and Mana Burden hitting everyone EXCEPT the caster.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const { NO_TICK_STATUS } = require('../../characters/_universal_status.js');
const mageslayer = require('../../characters/mageslayer.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'mageslayer', hp: 5, armor: 2, skillPoints: 4,
    statuses: {}, statusAmt: {}, cutsceneShown: {}, seen: {},
    mageslayerMarkedId: null, mageslayerHasMarked: false, mageslayerMarkTick: 0,
  }, over);
  engine.players[id] = p;
  return p;
}

// เรียก fn โดยบังคับให้ Math.random() คืนค่า v (ใช้บังคับ/กันโรล 35%)
function withRandom(v, fn) {
  const orig = Math.random;
  Math.random = () => v;
  try { return fn(); } finally { Math.random = orig; }
}

// ---------- Song's Curse ----------

test('Song\'s Curse: engine.addSkill() is a permanent no-op for mageslayer (any amount, any source)', () => {
  const p = mkPlayer({ skillPoints: 2 });
  engine.addSkill(p, 5);
  engine.addSkill(p, 5, 'item');
  assert.equal(p.skillPoints, 2, 'no regen from the shared addSkill() choke point');
});

test('damageBonus: only the +1 Song\'s Curse bonus — Fury no longer adds damage', () => {
  const ms = mkPlayer({ skillPoints: 2, statuses: { mageslayerFury: 3 } });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 5 });
  assert.equal(mageslayer.damageBonus(engine, ms, target), 1, '+1 song bonus only, 3 Fury stacks contribute nothing');
  const lowEnergyTarget = mkPlayer({ characterId: 'tohno', skillPoints: 0 });
  assert.equal(mageslayer.damageBonus(engine, ms, lowEnergyTarget), 0, 'target holds less energy — no bonus at all');
  assert.equal(mageslayer.damageBonus(engine, mkPlayer({ characterId: 'tohno' }), target), 0, 'zero for non-mageslayer attackers');
});

// ---------- Fury ----------

test('onBustOrLoseRoll: 35% roll grants 1 Fury stack, capped at 3 stages', () => {
  const ms = mkPlayer({ statuses: { mageslayerFury: 1 } });
  withRandom(0, () => {
    mageslayer.onBustOrLoseRoll(engine, ms);
    assert.equal(ms.statuses.mageslayerFury, 2);
    mageslayer.onBustOrLoseRoll(engine, ms);
    assert.equal(ms.statuses.mageslayerFury, 3, 'reaches the new max of 3');
  });
  const other = mkPlayer({ characterId: 'tohno' });
  withRandom(0, () => mageslayer.onBustOrLoseRoll(engine, other));
  assert.equal(other.statuses.mageslayerFury || 0, 0, 'no-op for non-mageslayer');
});

test('onBustOrLoseRoll: at 3 Fury stacks the effect switches to granting a ยาโชคลาภ item instead', () => {
  const ms = mkPlayer({ statuses: { mageslayerFury: 3 }, inventory: [] });
  withRandom(0, () => mageslayer.onBustOrLoseRoll(engine, ms));
  assert.equal(ms.statuses.mageslayerFury, 3, 'Fury stays capped');
  assert.equal(ms.statuses.fortune || 0, 0, 'no longer the โชคลาภ status');
  assert.equal(ms.inventory.length, 1, 'one item lands in the inventory');
  assert.equal(ms.inventory[0].type, 'fortune', 'น้ำยาบัฟโชคลาภ');
  withRandom(0, () => mageslayer.onBustOrLoseRoll(engine, ms));
  assert.equal(ms.inventory.length, 2, 'stacks up — one item per successful roll');
});

test('onBustOrLoseRoll: a failed 35% roll grants nothing at all', () => {
  const ms = mkPlayer({ inventory: [] });
  withRandom(0.9, () => mageslayer.onBustOrLoseRoll(engine, ms));
  assert.equal(ms.statuses.mageslayerFury || 0, 0);
  assert.equal(ms.inventory.length, 0);
});

test('onAttackPostDamage: Fury is spent all at once — lifesteal 2/3/3 and ดูดซับเวท for 2/4/5 turns', () => {
  for (const [stage, heal, turns] of [[1, 2, 2], [2, 3, 4], [3, 3, 5]]) {
    const ms = mkPlayer({ hp: 1, statuses: { mageslayerFury: stage } });
    const target = mkPlayer({ characterId: 'tohno', skillPoints: 10 });
    mageslayer.onAttackPostDamage(engine, ms, target, 2);
    assert.equal(ms.hp, 1 + heal, `stage ${stage} lifesteal heals ${heal}`);
    assert.equal(ms.statuses.mageslayerFury || 0, 0, 'stack fully cleared, not decremented by 1');
    assert.equal(target.statuses.manaLeech, turns, `stage ${stage} grants ${turns} turns of ดูดซับเวท`);
  }
});

test('onAttackPostDamage: only Fury stage 3 also grants เสริมพลัง +1 (empower) to the mageslayer', () => {
  for (const stage of [1, 2]) {
    const ms = mkPlayer({ hp: 1, statuses: { mageslayerFury: stage } });
    mageslayer.onAttackPostDamage(engine, ms, mkPlayer({ characterId: 'tohno' }), 2);
    assert.equal(ms.statuses.empower || 0, 0, `stage ${stage} grants no เสริมพลัง`);
  }
  const ms3 = mkPlayer({ hp: 1, statuses: { mageslayerFury: 3 } });
  mageslayer.onAttackPostDamage(engine, ms3, mkPlayer({ characterId: 'tohno' }), 2);
  assert.equal(ms3.statuses.empower, 1, 'empower: +1 damage on the next attack');
});

test('the Fury stage-3 เสริมพลัง runs on empower — +1 damage, no turn decay, spent on attack', () => {
  const ms = mkPlayer({ hp: 1, statuses: { mageslayerFury: 3 } });
  const target = mkPlayer({ characterId: 'nanaya', skillPoints: 0 });
  mageslayer.onAttackPostDamage(engine, ms, target, 2);
  // ไม่อยู่ในตารางลดเทิร์น — คงอยู่ข้ามเทิร์นจนกว่าจะได้โจมตี (doAttack ลบให้เองที่ server.js)
  assert.ok(NO_TICK_STATUS.has('empower'), 'empower ไม่ลดเทิร์นเอง');
  const withBuff = computeAttackBase(engine, ms, target).base;
  delete ms.statuses.empower;
  const withoutBuff = computeAttackBase(engine, ms, target).base;
  assert.equal(withBuff - withoutBuff, 1, 'บัฟให้ดาเมจ +1 ตอนที่ยังติดอยู่');
});

test('onAttackPostDamage: with no Fury stacks nothing happens (no heal, no ดูดซับเวท, no เสริมพลัง)', () => {
  const ms = mkPlayer({ hp: 3 });
  const target = mkPlayer({ characterId: 'tohno' });
  mageslayer.onAttackPostDamage(engine, ms, target, 4);
  assert.equal(ms.hp, 3);
  assert.equal(target.statuses.manaLeech || 0, 0);
  assert.equal(ms.statuses.empower || 0, 0);
});

// ---------- ตราล่าเวท (Witch Mark) ----------

test('applyWitchMark: marks the target, records mageslayerMarkedId, sets mageslayerHasMarked permanently', () => {
  const ms = mkPlayer();
  const t = mkPlayer({ characterId: 'tohno' });
  mageslayer.applyWitchMark(engine, ms, t);
  assert.equal(t.statuses.mageslayerMark, 999);
  assert.equal(ms.mageslayerMarkedId, t.id);
  assert.equal(ms.mageslayerHasMarked, true);
  assert.equal(ms.mageslayerWitchMarkReadyRound, engine.roundNumber + 2, '2-turn cooldown');
});

test('applyWitchMark: casting again moves the mark — clears it from the old target first', () => {
  const ms = mkPlayer();
  const t1 = mkPlayer({ characterId: 'tohno' });
  const t2 = mkPlayer({ characterId: 'riddhe' });
  mageslayer.applyWitchMark(engine, ms, t1);
  mageslayer.applyWitchMark(engine, ms, t2);
  assert.equal(t1.statuses.mageslayerMark || 0, 0, 'old target unmarked');
  assert.equal(t2.statuses.mageslayerMark, 999);
  assert.equal(ms.mageslayerMarkedId, t2.id);
});

test('applyWitchMark: a resisted target is not marked (mageslayerMarkedId stays unset)', () => {
  const ms = mkPlayer();
  const t = mkPlayer({ characterId: 'tohno', statuses: { resist: 1 } });
  mageslayer.applyWitchMark(engine, ms, t);
  assert.equal(t.statuses.mageslayerMark || 0, 0);
  assert.equal(ms.mageslayerMarkedId, null);
});

test('cleanseDebuffs: ต้านทานสถานะผิดปกติ wipes ตราล่าเวท and ดูดซับเวท off the target', () => {
  const universal = require('../../characters/_universal_status.js');
  const t = mkPlayer({ characterId: 'tohno', statuses: { mageslayerMark: 999, manaLeech: 5, resist: 1 }, mageslayerMarks: { x: true } });
  universal.cleanseDebuffs(t);
  assert.equal(t.statuses.mageslayerMark || 0, 0);
  assert.equal(t.statuses.manaLeech || 0, 0);
  assert.equal(t.mageslayerMarks, undefined, 'caster map cleared with the status');
});

test('stealEnergy: direct-assignment transfer bypasses Song\'s Curse (target loses, attacker gains, clamped to what target has)', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 3 });
  const stolen = mageslayer.stealEnergy(engine, ms, target, 4);
  assert.equal(stolen, 3, 'clamped to what target actually had');
  assert.equal(target.skillPoints, 0);
  assert.equal(ms.skillPoints, 3, 'direct assignment — reaches mageslayer despite Song\'s Curse');
});

test('onDamageDealt: steals energy equal to the damage, clamped to [1,5]', () => {
  for (const [dmg, want] of [[1, 1], [3, 3], [5, 5], [9, 5]]) {
    const ms = mkPlayer({ skillPoints: 0 });
    const target = mkPlayer({ characterId: 'tohno', skillPoints: 8 });
    mageslayer.applyWitchMark(engine, ms, target);
    mageslayer.onDamageDealt(engine, ms, target, dmg);
    assert.equal(ms.skillPoints, want, `damage ${dmg} -> steal ${want}`);
    assert.equal(target.skillPoints, 8 - want);
  }
});

test('onDamageDealt: only fires for the mageslayer who owns the mark, and only on real damage', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const other = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 8 });
  mageslayer.applyWitchMark(engine, ms, target);
  mageslayer.onDamageDealt(engine, other, target, 3);
  assert.equal(other.skillPoints, 0, 'another mageslayer without a mark on this target steals nothing');
  mageslayer.onDamageDealt(engine, ms, target, 0);
  assert.equal(ms.skillPoints, 0, 'zero damage steals nothing');
  const unmarked = mkPlayer({ characterId: 'riddhe', skillPoints: 8 });
  mageslayer.onDamageDealt(engine, ms, unmarked, 3);
  assert.equal(ms.skillPoints, 0, 'unmarked target is untouched');
});

test('onDamageDealt: stealing more than the target has left applies อ่อนแอ -1 for 2 turns', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 3 });
  mageslayer.applyWitchMark(engine, ms, target);
  mageslayer.onDamageDealt(engine, ms, target, 4); // ต้องการ 4 แต่เหลือ 3
  assert.equal(target.skillPoints, 0);
  assert.equal(ms.skillPoints, 3, 'only what was actually there gets transferred');
  assert.equal(target.statuses.weak, 2);
  assert.equal(target.statusAmt.weak, 1, '-1 damage');
});

test('onDamageDealt: an exact-drain (steal == remaining energy) does NOT weaken the target', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 3 });
  mageslayer.applyWitchMark(engine, ms, target);
  mageslayer.onDamageDealt(engine, ms, target, 3);
  assert.equal(target.statuses.weak || 0, 0);
});

test('tickWitchMark: steals 1 energy from the marked target every 2 turns', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const target = mkPlayer({ characterId: 'tohno', skillPoints: 5 });
  mageslayer.applyWitchMark(engine, ms, target);
  mageslayer.tickWitchMark(engine);
  assert.equal(ms.skillPoints, 0, 'turn 1 — nothing yet');
  mageslayer.tickWitchMark(engine);
  assert.equal(ms.skillPoints, 1, 'turn 2 — 1 energy siphoned');
  assert.equal(target.skillPoints, 4);
  mageslayer.tickWitchMark(engine);
  assert.equal(ms.skillPoints, 1, 'turn 3 — nothing');
  mageslayer.tickWitchMark(engine);
  assert.equal(ms.skillPoints, 2, 'turn 4 — siphons again');
});

test('tickWitchMark: reconciles a mark that was cleansed away (mageslayerMarkedId is released)', () => {
  const ms = mkPlayer();
  const target = mkPlayer({ characterId: 'tohno' });
  mageslayer.applyWitchMark(engine, ms, target);
  delete target.statuses.mageslayerMark; // ถูกต้านทานสถานะผิดปกติล้างทิ้ง
  mageslayer.tickWitchMark(engine);
  assert.equal(ms.mageslayerMarkedId, null);
  assert.equal(ms.mageslayerMarkTick, 0);
});

// ---------- ดูดซับเวท (manaLeech) ----------

test('onEnergyAction: a manaLeech target has a 35% chance to be drained 1 energy', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const t = mkPlayer({ characterId: 'tohno', skillPoints: 3, statuses: { manaLeech: 5 } });
  withRandom(0, () => mageslayer.onEnergyAction(engine, t));
  assert.equal(t.skillPoints, 2);
  assert.equal(ms.skillPoints, 1);
});

test('leechChanceFor / onEnergyAction: a ตราล่าเวท target is drained at 60% instead of 35%', () => {
  assert.equal(mageslayer.leechChanceFor({ statuses: { manaLeech: 5 } }), 0.35, 'plain ดูดซับเวท stays at 35%');
  assert.equal(mageslayer.leechChanceFor({ statuses: { manaLeech: 5, mageslayerMark: 999 } }), 0.6, 'marked target rolls at 60%');

  // roll 0.5: misses the 35% window, lands inside the 60% one
  const msA = mkPlayer({ skillPoints: 0 });
  const unmarked = mkPlayer({ characterId: 'tohno', skillPoints: 3, statuses: { manaLeech: 5 } });
  withRandom(0.5, () => mageslayer.onEnergyAction(engine, unmarked));
  assert.equal(unmarked.skillPoints, 3, '0.5 fails the base 35% roll');
  assert.equal(msA.skillPoints, 0);

  const marked = mkPlayer({ characterId: 'riddhe', skillPoints: 3, statuses: { manaLeech: 5, mageslayerMark: 999 } });
  withRandom(0.5, () => mageslayer.onEnergyAction(engine, marked));
  assert.equal(marked.skillPoints, 2, '0.5 passes the boosted 60% roll');
  assert.equal(msA.skillPoints, 1);
});

test('onEnergyAction: ตราล่าเวท alone (no ดูดซับเวท) still drains nothing', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const markedOnly = mkPlayer({ characterId: 'tohno', skillPoints: 3, statuses: { mageslayerMark: 999 } });
  withRandom(0, () => mageslayer.onEnergyAction(engine, markedOnly));
  assert.equal(markedOnly.skillPoints, 3);
  assert.equal(ms.skillPoints, 0);
});

test('onEnergyAction: no manaLeech status = no drain, and a failed roll drains nothing', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const clean = mkPlayer({ characterId: 'tohno', skillPoints: 3 });
  withRandom(0, () => mageslayer.onEnergyAction(engine, clean));
  assert.equal(clean.skillPoints, 3);
  const leeched = mkPlayer({ characterId: 'riddhe', skillPoints: 3, statuses: { manaLeech: 5 } });
  withRandom(0.9, () => mageslayer.onEnergyAction(engine, leeched));
  assert.equal(leeched.skillPoints, 3);
  assert.equal(ms.skillPoints, 0);
});

test('addSkill: a tagged restore on a manaLeech target routes through the leech (untagged engine grants do not)', () => {
  const ms = mkPlayer({ skillPoints: 0 });
  const t = mkPlayer({ characterId: 'tohno', skillPoints: 0, statuses: { manaLeech: 5 } });
  withRandom(0, () => engine.addSkill(t, 2)); // แต้มพื้นฐานจบเทิร์น — ไม่มี src
  assert.equal(ms.skillPoints, 0, 'untagged grants never trigger ดูดซับเวท');
  withRandom(0, () => engine.addSkill(t, 2, 'item'));
  assert.equal(ms.skillPoints, 1, 'tagged restore (item/passive/card) triggers the 35% drain');
});

// ---------- Mana Rupture ----------

test('ruptureDamageForEnergy / ruptureSealForEnergy: 7-8 = 1 dmg no seal, 2-6 = 3 dmg + seal 2, 0-1 = 5 dmg + seal 3', () => {
  for (const e of [7, 8]) {
    assert.equal(mageslayer.ruptureDamageForEnergy(e), 1);
    assert.equal(mageslayer.ruptureSealForEnergy(e), 0);
  }
  for (const e of [2, 4, 6]) {
    assert.equal(mageslayer.ruptureDamageForEnergy(e), 3);
    assert.equal(mageslayer.ruptureSealForEnergy(e), 2);
  }
  for (const e of [0, 1]) {
    assert.equal(mageslayer.ruptureDamageForEnergy(e), 5);
    assert.equal(mageslayer.ruptureSealForEnergy(e), 3);
  }
});

test('applyRuptureEffect: tags the target for 2 turns and schedules the blast 2 rounds out', () => {
  const caster = mkPlayer();
  const t = mkPlayer({ characterId: 'tohno', skillPoints: 4 });
  mageslayer.applyRuptureEffect(engine, caster, t, 'Mana Rupture');
  assert.equal(t.statuses.manaRupture, 2, 'status lasts 2 turns per the spec');
  assert.equal(t.manaRuptures.length, 1);
  assert.equal(t.manaRuptures[0].round, engine.roundNumber + 2, 'detonates when the status expires, not next turn');
  assert.equal(t.manaRuptures[0].dmg, 3);
  assert.equal(t.manaRuptures[0].seal, 2);
});

test('resolveManaRupture: applies the snapshot damage and the matching ผนึกพลังเวทย์ duration', () => {
  const caster = mkPlayer({ skillPoints: 0 });

  const t1 = mkPlayer({ characterId: 'tohno', hp: 10, armor: 0, skillPoints: 8 });
  mageslayer.resolveManaRupture(engine, caster, t1, { energy: 8, dmg: 1, seal: 0 });
  assert.equal(t1.hp, 9, 'tier 7-8 -> 1 damage');
  assert.equal(t1.statuses.manaSeal || 0, 0, 'no seal on the top tier');

  const t2 = mkPlayer({ characterId: 'tohno', hp: 10, armor: 0, skillPoints: 6 });
  mageslayer.resolveManaRupture(engine, caster, t2, { energy: 6, dmg: 3, seal: 2 });
  assert.equal(t2.hp, 7, 'tier 2-6 -> 3 damage');
  assert.equal(t2.statuses.manaSeal, 2);

  const t3 = mkPlayer({ characterId: 'tohno', hp: 10, armor: 0, skillPoints: 0 });
  mageslayer.resolveManaRupture(engine, caster, t3, { energy: 0, dmg: 5, seal: 3 });
  assert.equal(t3.hp, 5, 'tier 0-1 -> 5 damage');
  assert.equal(t3.statuses.manaSeal, 3);

  assert.equal(caster.skillPoints, 0, 'Mana Rupture returns no energy to the caster');
});

test('resolveDueRuptures: only fires once the scheduled round arrives, then clears the status', () => {
  const caster = mkPlayer();
  const t = mkPlayer({ characterId: 'tohno', hp: 10, armor: 0, skillPoints: 4 });
  mageslayer.applyRuptureEffect(engine, caster, t, 'Mana Rupture');
  const base = engine.roundNumber;
  try {
    engine.setRoundNumber(base + 1);
    mageslayer.resolveDueRuptures(engine);
    assert.equal(t.hp, 10, 'still armed after 1 turn');
    engine.setRoundNumber(base + 2);
    mageslayer.resolveDueRuptures(engine);
    assert.equal(t.hp, 7, 'detonates on the 2nd turn');
    assert.equal(t.statuses.manaRupture || 0, 0, 'status cleared afterwards');
  } finally {
    engine.setRoundNumber(base);
  }
});

// ---------- Mana Burden ----------

test('applyManaBurden: everyone EXCEPT the caster gets +1 ภาระเวท and 5 turns of ดูดซับเวท', () => {
  const caster = mkPlayer();
  const other = mkPlayer({ characterId: 'tohno' });
  const resistant = mkPlayer({ characterId: 'riddhe', statuses: { resist: 1 } });
  mageslayer.applyManaBurden(engine, caster);
  assert.equal(caster.statuses.spellburden || 0, 0, 'caster is excluded');
  assert.equal(caster.statuses.manaLeech || 0, 0, 'caster is excluded');
  assert.equal(other.statuses.spellburden, 5);
  assert.equal(other.statusAmt.spellburden, 1);
  assert.equal(other.statuses.manaLeech, 5);
  assert.equal(resistant.statuses.spellburden || 0, 0, 'resist blocks Mana Burden entirely');
  assert.equal(resistant.statuses.manaLeech || 0, 0);
});

test('applyManaBurden: ใช้ซ้ำใส่คนเดิมไม่รีเซ็ตเวลาคงอยู่ (แต่ยังสะสมจำนวนเพิ่ม)', () => {
  const caster = mkPlayer();
  const other = mkPlayer({ characterId: 'tohno' });
  mageslayer.applyManaBurden(engine, caster);
  // จำลองเวลาที่เดินไปแล้ว 3 เทิร์น
  other.statuses.spellburden = 2;
  other.statuses.manaLeech = 2;
  mageslayer.applyManaBurden(engine, caster);
  assert.equal(other.statuses.spellburden, 2, 'ภาระเวท: เวลาที่เหลือเดินต่อ ไม่ถูกต่ออายุ');
  assert.equal(other.statuses.manaLeech, 2, 'ดูดซับเวท: เวลาที่เหลือเดินต่อ ไม่ถูกต่ออายุ');
  assert.equal(other.statusAmt.spellburden, 2, 'จำนวนยังสะสมเพิ่มได้');
});

test('applyManaBurden: สถานะที่หมดอายุไปแล้ว ตั้งเวลาใหม่ได้ตามปกติ', () => {
  const caster = mkPlayer();
  const other = mkPlayer({ characterId: 'tohno' });
  mageslayer.applyManaBurden(engine, caster);
  delete other.statuses.spellburden;   // หมดอายุ (endTurn ล้าง statusAmt ให้ด้วยของจริง)
  delete other.statuses.manaLeech;
  delete other.statusAmt.spellburden;
  mageslayer.applyManaBurden(engine, caster);
  assert.equal(other.statuses.spellburden, 5);
  assert.equal(other.statuses.manaLeech, 5);
  assert.equal(other.statusAmt.spellburden, 1);
});

test('applyManaBurden: ภาระเวท stacks up to the shared SPELLBURDEN_MAX cap', () => {
  const caster = mkPlayer();
  const other = mkPlayer({ characterId: 'tohno', statusAmt: { spellburden: engine.SPELLBURDEN_MAX } });
  other.statuses.spellburden = 5;
  mageslayer.applyManaBurden(engine, caster);
  assert.equal(other.statusAmt.spellburden, engine.SPELLBURDEN_MAX, 'capped, never exceeds');
});

// ---------- Mana Burden: คูลดาวน์ 7 เทิร์น ----------

test('applyManaBurden: arms a 7-turn cooldown, and burdenOnCooldown() gates it until it expires', () => {
  const caster = mkPlayer();
  mkPlayer({ characterId: 'tohno' });
  const base = engine.roundNumber;
  try {
    assert.equal(mageslayer.burdenOnCooldown(engine, caster), false, 'ready before the first cast');
    mageslayer.applyManaBurden(engine, caster);
    assert.equal(caster.mageslayerBurdenReadyRound, base + mageslayer.MS_BURDEN_COOLDOWN);
    for (let i = 1; i < mageslayer.MS_BURDEN_COOLDOWN; i++) {
      engine.setRoundNumber(base + i);
      assert.equal(mageslayer.burdenOnCooldown(engine, caster), true, `still locked on turn +${i}`);
    }
    engine.setRoundNumber(base + mageslayer.MS_BURDEN_COOLDOWN);
    assert.equal(mageslayer.burdenOnCooldown(engine, caster), false, 'usable again after 7 turns');
  } finally {
    engine.setRoundNumber(base);
  }
});

test('applyManaBurden: recasting on a target that still has the debuff does NOT refresh its duration', () => {
  const caster = mkPlayer();
  const t = mkPlayer({ characterId: 'tohno' });
  mageslayer.applyManaBurden(engine, caster);
  assert.equal(t.statuses.spellburden, 5);
  assert.equal(t.statuses.manaLeech, 5);
  t.statuses.spellburden = 2; // เดินเวลาไป 3 เทิร์น
  t.statuses.manaLeech = 2;
  mageslayer.applyManaBurden(engine, caster);
  assert.equal(t.statuses.spellburden, 2, 'ภาระเวท: no-refresh — remaining turns keep counting down');
  assert.equal(t.statuses.manaLeech, 2, 'ดูดซับเวท: no-refresh too');
  assert.equal(t.statusAmt.spellburden, 2, 'only the stack amount goes up, capped at SPELLBURDEN_MAX');
});
