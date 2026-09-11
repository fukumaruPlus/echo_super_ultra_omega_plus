const BASE = "/characters/ignis";
const DARK_TURNS = 5;
const WAIL_MAX = 5;

function darkOn(p) {
  return !!(p && p.statuses && (p.statuses.triggerDarkForm || 0) > 0);
}

function syncWail(p) {
  p.statuses = p.statuses || {};
  p.statusAmt = p.statusAmt || {};
  const stacks = Math.max(0, Math.min(WAIL_MAX, p.triggerDarkWail || 0));
  p.triggerDarkWail = stacks;
  if (stacks > 0) {
    p.statuses.triggerDarkWail = 999;
    p.statusAmt.triggerDarkWail = stacks;
  } else {
    delete p.statuses.triggerDarkWail;
    delete p.statusAmt.triggerDarkWail;
  }
}

function selectedTarget(engine, p, targets) {
  const id = Array.isArray(targets) ? targets[0] : targets;
  const target = engine.players && engine.players[id];
  if (!target || !target.alive || target.id === p.id) return null;
  if (engine.sameTeam && engine.sameTeam(p, target)) return null;
  return target;
}

module.exports = {
  id: "ignis",
  DARK_TURNS,
  WAIL_MAX,
  darkOn,

  displayImg(p) {
    return darkOn(p) ? `${BASE}/trigger_dark.jpg` : `${BASE}/ignis.webp`;
  },

  ensureBlackSparklence(p) {
    if (!p || p.characterId !== "ignis") return;
    p.inventory = p.inventory || [];
    if (!p.inventory.some((it) => it.type === "blackSparklence")) {
      p.inventory.unshift({ uid: `black_sparklence_${p.id}`, type: "blackSparklence" });
    }
    syncWail(p);
  },

  canUseTriggerDarkKey(engine, p) {
    if (!p || !p.alive || p.characterId !== "ignis") return false;
    if (darkOn(p)) return false;
    return (p.inventory || []).some((it) => it.type === "blackSparklence");
  },

  activateTriggerDark(engine, p) {
    if (!this.canUseTriggerDarkKey(engine, p)) return false;
    p.statuses = p.statuses || {};
    p.statuses.triggerDarkForm = DARK_TURNS;
    if (engine.healHp) engine.healHp(p, 2);
    if (engine.nextTransformCounter) p.transformAt = engine.nextTransformCounter();
    if (engine.triggerCutscene) engine.triggerCutscene(p, "triggerDarkHenshin");
    if (engine.log) engine.log(`${p.name} ใช้ Trigger Dark Key แปลงร่างเป็น Trigger Dark ${DARK_TURNS} เทิร์น`);
    syncWail(p);
    return true;
  },

  restoreFromTriggerDark(engine, p) {
    if (!p || p.characterId !== "ignis") return;
    delete p.statuses.triggerDarkForm;
    if (engine.log) engine.log(`${p.name} คืนร่างจาก Trigger Dark — ต้องซื้อ Trigger Dark Key ใหม่เพื่อใช้ซ้ำ`);
    syncWail(p);
  },

  dynamicSkillFor(p, ch, tier) {
    if (!ch) return null;
    if (tier === "secondary" || tier === "ultimate") return darkOn(p) ? ch[tier] : null;
    return ch[tier];
  },

  canUseSkill(engine, p, tier) {
    if (tier === "secondary" || tier === "ultimate") return darkOn(p);
    return true;
  },

  prepareStealTarget(engine, p, targets) {
    return selectedTarget(engine, p, targets);
  },

  prepareImpactTarget(engine, p, targets) {
    return selectedTarget(engine, p, targets);
  },

  applySteal(engine, p, target) {
    if (!target) return "";
    p.inventory = p.inventory || [];
    target.inventory = target.inventory || [];
    const candidates = target.inventory
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => it.type !== "blackSparklence");
    let stolen = null;
    if (candidates.length) {
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      stolen = target.inventory.splice(picked.idx, 1)[0];
      p.inventory.push({ ...stolen, uid: `stolen_${p.id}_${Date.now()}_${Math.floor(Math.random() * 100000)}` });
      engine.addGold(p, 2);
    }
    const healed = engine.healHp ? engine.healHp(p, 2) : 0;
    if (engine.log) {
      engine.log(stolen
        ? `${p.name} ขโมย ${engine.shopItemName ? engine.shopItemName(stolen) : "ไอเท็ม"} จาก ${target.name} และได้เงินแถม 2 เหรียญ (ฟื้น ${healed})`
        : `${p.name} พยายามขโมยของจาก ${target.name} แต่กระเป๋าว่าง (ฟื้น ${healed})`);
    }
    return stolen ? " ขโมยสำเร็จ +2 เหรียญ" : " ไม่เจอของให้ขโมย";
  },

  applySkill(engine, p, tier) {
    if (tier === "secondary") {
      const affected = engine.alivePlayers ? engine.alivePlayers() : Object.values(engine.players || {}).filter((o) => o.alive);
      for (const target of affected) {
        target.triggerDarkWail = Math.min(WAIL_MAX, (target.triggerDarkWail || 0) + 2);
        syncWail(target);
      }
      const healed = engine.healHp ? engine.healHp(p, 1) : 0;
      if (engine.log) engine.log(`${p.name} ใช้เสียงร้องไห้ — ทุกคนได้รับ อวดครวญ +2 (สูงสุด ${WAIL_MAX}) และ ${p.name} ฟื้นพลังชีวิต +${healed}`);
    }
    return "";
  },

  applyImpact(engine, p, target) {
    const damage = target ? Math.min(WAIL_MAX, target.triggerDarkWail || 0) : 0;
    if (target && target.alive && damage > 0 && engine.dealMixed) engine.dealMixed(target, damage);

    for (const player of Object.values(engine.players || {})) {
      player.triggerDarkWail = 0;
      syncWail(player);
    }

    if (!target || !target.alive) {
      if (engine.log) engine.log(`💨 Impact ของ ${p.name} พลาดเป้า — เป้าหมายตกรอบไปก่อนวีดีโอจบ และล้าง อวดครวญ ทั้งหมดบนสนาม`);
      return 0;
    }

    if (engine.log) engine.log(`💥 ${p.name} ใช้ Impact ใส่ ${target.name} — อวดครวญ ${damage} หน่วย สร้างความเสียหาย ${damage} หน่วย และล้าง อวดครวญ ทั้งหมดบนสนาม`);
    if (engine.maybeBeatSave) engine.maybeBeatSave(target);
    if (engine.maybeBeatMode) engine.maybeBeatMode(target);
    if (engine.maybeWakeKotone) engine.maybeWakeKotone(target);
    if (target.alive && target.hp <= 0 && engine.instantDeath) {
      engine.instantDeath(target);
      if (!target.alive && engine.log) engine.log(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
    }
    return damage;
  },

  damageBonus(engine, attacker, target, ctx) {
    if (!darkOn(attacker)) return 0;
    const bonus = engine.isNightRound && engine.isNightRound(engine.roundNumber) ? 2 : 1;
    if (ctx) ctx.triggerDarkAtk = bonus;
    return bonus;
  },

  onAttackLanded() { return []; },

  extraSkillRegen(engine, p) {
    if (!darkOn(p)) return 0;
    if (engine.passiveSealed && engine.passiveSealed(p)) return 0;
    return engine.isNightRound && !engine.isNightRound(engine.roundNumber) ? 1 : 0;
  },

  extraGoldRegen(engine, p) {
    if (!p || p.characterId !== "ignis") return 0;
    if (engine.passiveSealed && engine.passiveSealed(p)) return 0;
    return engine.isNightRound && !engine.isNightRound(engine.roundNumber) ? 1 : 0;
  },
};
