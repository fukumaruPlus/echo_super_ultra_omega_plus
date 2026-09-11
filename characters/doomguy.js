// ============================================================
//  ดูมกาย (DoomGuy, patch 2.2 full) — Quick Swap / Weapon (ความสามารถพิเศษตามอาวุธ) / Crucible (ท่าไม้ตาย) /
//  สกิลติดตัว (ฮีล+ชาร์จ Crucible ทุกครั้งที่โจมตี) / สกิลติดตัว 2 (เสมอแต้มยังได้โจมตี 50%)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: ตาราง `DOOM_WEAPONS`/`rollDoomWeapon`/ค่าคงที่ atk พื้นฐาน (DOOM_CRUCIBLE_ATK) ยังอยู่ server.js
//  เพราะถูกอ่านตรงๆ ใน doAttack()'s shared damage-sum expression (`doomBaseAtk`/`doomPierceAtk`) — นอกขอบเขต Phase 1
//  เปิดผ่าน engine.DOOM_WEAPONS/engine.rollDoomWeapon แทน
// ============================================================

module.exports = {
  id: "doomguy",

  // แทนที่ base 1 ทั่วไปด้วยดาเมจอาวุธที่ถืออยู่ (Crucible = 7 คงที่) — เรียกจาก computeAttackBase()
  attackBaseOverride(engine, attacker, target, ctx) {
    const doomBaseAtk = (attacker.statuses.doomCrucible || 0) > 0
      ? engine.DOOM_CRUCIBLE_ATK
      : (engine.DOOM_WEAPONS[attacker.doomWeapon] || engine.DOOM_WEAPONS.shotgun).atk;
    ctx.doomBaseAtk = doomBaseAtk;
    return doomBaseAtk;
  },

  // ดาเมจ contribution (ล็อคเป้า Heavy Cannon +1) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const doomLockonAtk = (target.statuses.doomLockon || 0) > 0 ? engine.DOOM_LOCKON_BONUS : 0;
    ctx.doomLockonAtk = doomLockonAtk;
    return doomLockonAtk;
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมายความสามารถพิเศษของอาวุธ (คนอื่นเท่านั้น)
  resolveWeaponTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก dealRound() ต้นเทิร์น (ลูปเดียวกับ tickBurn ใน _universal_status.js) — [โดนดูด] (Plasma Rifle):
  //  ดาเมจ 1/เทิร์น เจาะเกราะก่อน นับถอยหลังเอง — ต้อง exclude "doomDrain" จาก generic decay loop เพราะจัดการที่นี่แล้ว
  tickDrain(engine, p) {
    if (!p || !p.alive || !(((p.statuses && p.statuses.doomDrain) || 0) > 0)) return;
    engine.dealMixed(p, engine.DOOM_DRAIN_DMG);
    engine.log(`🌀 ${p.name} [โดนดูด] — เสียหาย -${engine.DOOM_DRAIN_DMG} (เจาะเกราะก่อน) (เหลืออีก ${p.statuses.doomDrain - 1} เทิร์น)`);
    engine.maybeBeatSave(p);
    engine.maybeBeatMode(p);
   
    engine.maybeWakeKotone(p);
    if (p.alive && p.hp <= 0) {
      engine.instantDeath(p);
      if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
    p.statuses.doomDrain = Math.max(0, p.statuses.doomDrain - 1);
    if (p.statuses.doomDrain <= 0) {
      delete p.statuses.doomDrain;
      if (p.statusAmt) delete p.statusAmt.doomDrain;
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — Quick Swap: สลับอาวุธทันที (ใช้ได้ 1 ครั้ง/เทิร์น)
  applyQuickSwap(engine, p) {
    p.doomQuickSwapUsed = true;
    p.doomWeapon = engine.rollDoomWeapon(p.doomWeapon);
    p.doomChaingunShieldUsed = false; // เปลี่ยนอาวุธ -> Chaingun's [ใช้ได้ครั้งเดียว] รีเซ็ตใหม่
    engine.log(`🔫 ${p.name} Quick Swap — สลับอาวุธเป็น ${engine.DOOM_WEAPONS[p.doomWeapon].name}!`);
  },

  // เรียกจาก useSkill() ในส่วน effect (หลัง io.emit skillFlash ที่ยังอยู่ server.js) — ใช้ความสามารถพิเศษของอาวุธที่ถืออยู่
  applyWeaponEffect(engine, p, doomW, doomTarget) {
    const wname = doomW.name;
    if (doomW.effect === "explode" && doomTarget) {
      if (engine.resistActive(doomTarget)) {
        engine.log(`🛡️ ${doomTarget.name} ต้านสถานะผิดปกติ — ${wname} ไม่มีผล`);
      } else {
        doomTarget.statuses.doomExplode = 1;
        engine.log(`💣 ${p.name} ${wname} — ${doomTarget.name} ติดสถานะระเบิด! (โจมตีโดนเมื่อไหร่จะระเบิดใส่คนอื่นสุ่ม 2 คน -1)`);
      }
    } else if (doomW.effect === "lockon" && doomTarget) {
      // patch: เอาทอย 40% ออก ติดสถานะ [ล็อคเป้า] แน่นอนเสมอ (ยังคงต้านสถานะผิดปกติได้ตามปกติ)
      if (engine.resistActive(doomTarget)) {
        engine.log(`🛡️ ${doomTarget.name} ต้านสถานะผิดปกติ — ${wname} ไม่มีผล`);
      } else {
        doomTarget.statuses.doomLockon = 1;
        engine.log(`🎯 ${p.name} ${wname} — ล็อคเป้า ${doomTarget.name} สำเร็จ! (โดนโจมตีครั้งถัดไปแรงขึ้น +1)`);
      }
    } else if (doomW.effect === "drain" && doomTarget) {
      if (engine.resistActive(doomTarget)) {
        engine.log(`🛡️ ${doomTarget.name} ต้านสถานะผิดปกติ — ${wname} ไม่มีผล`);
      } else if (engine.applyDebuff(doomTarget, "doomDrain", null, engine.DOOM_DRAIN_TURNS)) {
        engine.log(`🌀 ${p.name} ${wname} — ${doomTarget.name} ติดสถานะ [โดนดูด] (ดาเมจ ${engine.DOOM_DRAIN_DMG}/เทิร์น ${engine.DOOM_DRAIN_TURNS} เทิร์น เจาะเกราะก่อน)`);
      }
    } else if (doomW.effect === "shield") {
      // ใช้ได้ครั้งเดียวต่อการถืออาวุธนี้ (รีเซ็ตทุกครั้งที่เปลี่ยนอาวุธ — ดู server.js's applyQuickSwap/onRoundStartWeaponCycle)
      if (p.doomChaingunShieldUsed) {
        engine.log(`🛡️ ${p.name} ${wname} — ใช้ไปแล้วรอบถืออาวุธนี้ ให้โล่ซ้ำไม่ได้`);
      } else {
        p.doomChaingunShieldUsed = true;
        p.shield += 1;
        engine.log(`🛡️ ${p.name} ${wname} — เพิ่มโล่ +1 (ใช้ได้ครั้งเดียวต่อการถืออาวุธนี้)`);
      }
    } else if (doomW.effect === "bonusdmg" && doomTarget) {
      engine.dealMixed(doomTarget, engine.DOOM_ROCKET_BONUS_DMG);
      engine.maybeBeatSave(doomTarget); engine.maybeBeatMode(doomTarget); engine.maybeWakeKotone(doomTarget);
      doomTarget.wasAttacked = true;
      engine.log(`🚀 ${p.name} ${wname} — ยิงใส่ ${doomTarget.name} เพิ่มเติม -${engine.DOOM_ROCKET_BONUS_DMG}`);
      if (doomTarget.alive && doomTarget.hp <= 0) {
        engine.instantDeath(doomTarget);
        if (!doomTarget.alive) engine.log(`💀 ${doomTarget.name} เลือดจริงหมด ตกรอบ!`);
      }
    } else if (doomW.effect === "stun" && doomTarget) {
      if (engine.resistActive(doomTarget)) {
        engine.log(`🛡️ ${doomTarget.name} ต้านสถานะผิดปกติ — ${wname} ไม่มีผล`);
      } else {
        doomTarget.statuses.stun = Math.max(doomTarget.statuses.stun || 0, 1);
        engine.log(`💥 ${p.name} ${wname} — สตั้น ${doomTarget.name} 1 เทิร์น`);
      }
    } else if (doomW.effect === "bonusdmg2" && doomTarget) {
      // Ballista (patch): เลือกเป้าหมาย 1 คน โดนดาเมจเพิ่มเติมทันที (โครงเดียวกับ Rocket's bonusdmg)
      engine.dealMixed(doomTarget, engine.DOOM_BALLISTA_TARGET_DMG);
      engine.maybeBeatSave(doomTarget); engine.maybeBeatMode(doomTarget); engine.maybeWakeKotone(doomTarget);
      doomTarget.wasAttacked = true;
      engine.log(`🎯 ${p.name} ${wname} — ยิงใส่ ${doomTarget.name} เพิ่มเติม -${engine.DOOM_BALLISTA_TARGET_DMG}`);
      if (doomTarget.alive && doomTarget.hp <= 0) {
        engine.instantDeath(doomTarget);
        if (!doomTarget.alive) engine.log(`💀 ${doomTarget.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — Crucible (ท่าไม้ตาย): แปลงร่างทันที + บังคับทุกคนอื่นแตกจริง
  activateCrucible(engine, p) {
    p.seen.doomCrucible = true;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "doomCrucible");
    p.doomCharge = 0;
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      // แตกจริงแบบเดียวกับ Ashen Trail (โอกูริ) — บังคับจั่วเพิ่ม + บวกแต้มการ์ดตรงๆ การันตีเกิน 21 แม้เปิดไพ่/ล็อกไปแล้วก็ตาม
      for (let i = 0; i < engine.DOOM_CRUCIBLE_BUST_DRAWS; i++) {
        const c = engine.drawCardFor(o);
        if (c) { o.cards.push(c); engine.onCardDrawn(o, c); }
      }
      o.cardBonus = (o.cardBonus || 0) + engine.DOOM_CRUCIBLE_BUST_BONUS;
      o.busted = engine.bustedOf(o);
      o.locked = true;
      engine.voidUltimateOnBust(o);
      engine.dealDirect(o, engine.DOOM_CRUCIBLE_BUST_DMG);
      engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeWakeKotone(o);
      o.wasAttacked = true;
      if (o.alive && o.hp <= 0) { engine.instantDeath(o); if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`); }
    }
    engine.log(`⚔️ Crucible! ${p.name} คว้าดาบแห่งการล่า — บังคับทุกคนจั่วเพิ่ม ${engine.DOOM_CRUCIBLE_BUST_DRAWS} ใบ บวกแต้มการ์ด +${engine.DOOM_CRUCIBLE_BUST_BONUS} การันตีแตกทันที (แม้เปิดไพ่/ล็อกไปแล้ว) รับความเสียหาย -${engine.DOOM_CRUCIBLE_BUST_DMG} (พลังโจมตี 7 หน่วย คงอยู่จนกว่าจะได้โจมตี 1 ครั้ง)`);
  },

  // เรียกจาก resolveRound() ตอนตัดสินผู้ชนะ (ก่อนสุ่มผู้ชนะจากคนที่เสมอกัน) — สกิลติดตัว: เสมอแต้มปกติไม่มี
  //  เทิร์นโจมตี แต่มีโอกาส DOOM_TIE_ATTACK_CHANCE ที่จะได้เป็นผู้ชนะและยังได้โจมตี คืน true ถ้าทำงาน
  tryTieAttack(engine, winner) {
    if (!(winner && winner.alive && winner.characterId === "doomguy")) return false;
    if (engine.passiveSealed(winner)) return false; // สกิลติดตัวถูกปิดอยู่ (อันนี้ของนายรึเปล่า ฯลฯ)
    if (Math.random() >= engine.DOOM_TIE_ATTACK_CHANCE) return false;
    engine.log(`🎲 ${winner.name} Rip and Tear — เสมอแต้มแต่ยังได้โจมตี! (โอกาส ${Math.round(engine.DOOM_TIE_ATTACK_CHANCE * 100)}%)`);
    return true;
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจแล้ว — ฮีลตัวเอง+ชาร์จ Crucible / ล็อคเป้าใช้แล้วหมดฤทธิ์ / ระเบิด Combat Shotgun / กระจายดาเมจ Rocket Launcher / Crucible ใช้แล้วหมดฤทธิ์
  onAttackPostDamage(engine, attacker, target, dmg, doomLockonAtk) {
    const heal = engine.healHp(attacker, engine.DOOM_HEAL_ON_ATK);
    attacker.shield += engine.DOOM_SHIELD_ON_ATK;
    if (heal > 0) engine.log(`💉🛡️ ${attacker.name} สกิลติดตัว — ฮีลตัวเอง +${heal} และโล่ +${engine.DOOM_SHIELD_ON_ATK}`);
    else engine.log(`🛡️ ${attacker.name} สกิลติดตัว — โล่ +${engine.DOOM_SHIELD_ON_ATK}`);
    if ((attacker.doomCharge || 0) < engine.DOOM_CRUCIBLE_CHARGE_NEED && Math.random() < engine.DOOM_CHARGE_CHANCE) {
      attacker.doomCharge = (attacker.doomCharge || 0) + 1;
      engine.log(`🔥 ${attacker.name} สกิลติดตัว — ได้รับชาร์จ Crucible +1 (${attacker.doomCharge}/${engine.DOOM_CRUCIBLE_CHARGE_NEED})`);
    }
    // ล็อคเป้า (Heavy Cannon): ใช้แล้วหมดไปทันทีที่โจมตีโดน
    if (doomLockonAtk) {
      delete target.statuses.doomLockon;
      engine.log(`🎯 ${attacker.name} ล็อคเป้า — โจมตี ${target.name} แรงขึ้น +${engine.DOOM_LOCKON_BONUS} (บัฟหมดลง)`);
    }
    // ระเบิด (Combat Shotgun): โจมตีเป้าหมายที่ติดสถานะ -> ระเบิดใส่คนอื่นสุ่ม 2 คน
    if ((target.statuses.doomExplode || 0) > 0) {
      delete target.statuses.doomExplode;
      const pool = engine.alivePlayers().filter((o) => o.id !== attacker.id && o.id !== target.id);
      const hits = [];
      while (hits.length < engine.DOOM_EXPLODE_TARGETS && pool.length) hits.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      for (const o of hits) {
        engine.dealMixed(o, engine.DOOM_EXPLODE_DMG);
        engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeWakeKotone(o);
        o.wasAttacked = true;
        if (o.alive && o.hp <= 0) { engine.instantDeath(o); if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`); }
      }
      if (hits.length) engine.log(`💣 ระเบิด! ${target.name} ระเบิดใส่ ${hits.map((o) => o.name).join(", ")} -${engine.DOOM_EXPLODE_DMG}`);
    }
    // Rocket Launcher: การโจมตีปกติกระจายดาเมจใส่อีก 1 คนแบบสุ่มด้วย (ไม่นับ Crucible)
    if (!((attacker.statuses.doomCrucible || 0) > 0) && attacker.doomWeapon === "rocket" && engine.DOOM_WEAPONS.rocket.splash) {
      const pool = engine.alivePlayers().filter((o) => o.id !== attacker.id && o.id !== target.id);
      if (pool.length) {
        const o = pool[Math.floor(Math.random() * pool.length)];
        engine.dealMixed(o, dmg);
        engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeWakeKotone(o);
        o.wasAttacked = true;
        engine.log(`🚀 Rocket Launcher — ดาเมจกระจายใส่ ${o.name} ด้วย -${dmg}`);
        if (o.alive && o.hp <= 0) { engine.instantDeath(o); if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`); }
      }
    }
    // Crucible: ใช้พลังโจมตี 7 หน่วยไปแล้ว 1 ครั้ง — หายไปทันที (ไม่ใช่นับเทิร์นแบบเดิม)
    if ((attacker.statuses.doomCrucible || 0) > 0) {
      delete attacker.statuses.doomCrucible;
      engine.log(`⚔️ ${attacker.name} Crucible — ใช้พลังโจมตี 7 หน่วยไปแล้ว ดาบเสื่อมพลังลง กลับไปใช้อาวุธปืนตามปกติ`);
    }
  },

  // เรียกจาก dealRound() ต้นเทิร์น (ลูปเดียวกับที่รีเซ็ต p.kaiSkillUsesRound) — พาสซีฟ: ทุกต้นเทิร์นมีโอกาส 20% ได้ [โชคลาภ] +1 สแตค
  onRoundStartFortuneRoll(engine, p) {
    if (p.characterId !== "doomguy" || !p.alive) return;
    if (Math.random() >= engine.DOOM_FORTUNE_CHANCE) return;
    p.statuses.fortune = Math.min(engine.BARD_FORTUNE_MAX, (p.statuses.fortune || 0) + 1);
    p.fortuneIdle = 0;
    engine.log(`🍀 ${p.name} สกิลติดตัว — ได้โชคลาภ +1 (${p.statuses.fortune}/${engine.BARD_FORTUNE_MAX})`);
  },

  // เรียกจาก dealRound() ตอนจบเทิร์น (ในลูปสถานะร่วมท้ายเทิร์น) — Weapon: บังคับสลับอาวุธใหม่ทันที (ไม่ทำงานระหว่างถือ Crucible)
  onRoundStartWeaponCycle(engine, p) {
    if (!(p.characterId === "doomguy" && p.alive && (p.statuses.doomCrucible || 0) <= 0)) return;
    // Combat Shotgun/Heavy Cannon: มี [ระเบิด]/[ล็อคเป้า] ค้างอยู่ (ยังไม่โดนใช้) — ห้ามสลับอาวุธแม้จะเป็นการสลับอัตโนมัติตอนจบเทิร์นก็ตาม
    //  ปืนที่สุ่มได้จะติดตัวอยู่จนกว่าสถานะจะถูกใช้ (โดนโจมตี) เท่านั้น
    if (engine.doomWeaponMarkPending()) {
      engine.log(`🔫 ${p.name} Weapon — มี [ระเบิด]/[ล็อคเป้า] ค้างอยู่ ยังไม่โดนใช้ — สลับอาวุธอัตโนมัติงดไว้ก่อน`);
      return;
    }
    const oldW = engine.DOOM_WEAPONS[p.doomWeapon] ? engine.DOOM_WEAPONS[p.doomWeapon].name : "";
    p.doomWeapon = engine.rollDoomWeapon(p.doomWeapon);
    p.doomChaingunShieldUsed = false; // เปลี่ยนอาวุธ -> Chaingun's [ใช้ได้ครั้งเดียว] รีเซ็ตใหม่
    engine.log(`🔫 ${p.name} Weapon — จบเทิร์น สลับอาวุธจาก ${oldW} เป็น ${engine.DOOM_WEAPONS[p.doomWeapon].name} อัตโนมัติ`);
  },
};
