// ============================================================
//  ผู้สังหารเมจ (mageslayer) — Song's Curse (คำสาปบรรเลงทำนอง — พาสซีฟถาวร) /
//  Witch Mark (ตราล่าเวท, สกิลพื้นฐาน Cost 0) / Mana Burden (ภาระเวท, สกิลรอง Cost 3) /
//  Mana Rupture (ระเบิดมานา, อัลติเมต Cost 7)
//  ดู characters/index.js สำหรับไฟล์มัดรวม, server.js's useSkill()/doAttack()/dealMixed()/endTurn() สำหรับจุดเรียก
//
//  หมายเหตุ Song's Curse: ห้ามฟื้นพลังงานปกติทุกทาง — hardcode เช็คตรงใน server.js's addSkill()
//  (ไม่ใช่สถานะ ต้านไม่ได้) การขโมยพลังงาน (ตราล่าเวท / ดูดซับเวท) ใช้ direct assignment ตรงๆ
//  จึงทะลุข้อจำกัดนี้ได้ (ไม่เรียกผ่าน engine.addSkill เลย)
//
//  สถานะเฉพาะตัวละคร 2 ตัว
//   - mageslayerMark (ตราล่าเวท): ดาเมจทุกประเภทจากผู้สังหารเมจใส่เป้าหมายนี้ = ขโมยพลังงานเท่าดาเมจ (min 1 / max 5)
//     + ทุก 2 เทิร์นขโมยอัตโนมัติ 1 หน่วย — ถาวรจนกว่าจะย้ายมาร์ก/ถูกต้านสถานะผิดปกติล้าง
//   - manaLeech (ดูดซับเวท): เป้าหมายกดสกิล/ฟื้นพลังงาน (ไอเทม/พาสซีฟ/การ์ดรังสรร) → 35% ถูกขโมย 1 หน่วย
//     (ถ้าเป้าหมายติด mageslayerMark อยู่ด้วย โอกาสเพิ่มเป็น 60%)
// ============================================================

const MS_FURY_MAX = 3;             // Fury: สะสมสูงสุด 3 ขั้น
const MS_FURY_CHANCE = 0.35;       // Fury: โอกาสสะสมเมื่อแตก/แต้มต่ำสุด
const MS_FURY_HEAL = [0, 2, 3, 3];        // index = ขั้น Fury → "สูบพลังชีวิต" (ฟื้นเลือด) ที่ได้รับ (buff)
const MS_FURY_LEECH_TURNS = [0, 2, 4, 5]; // index = ขั้น Fury → จำนวนเทิร์นของ [ดูดซับเวท] ที่มอบให้เป้าหมาย (buff)
const MS_FURY_EMPOWER_TIER = 3;    // Fury ขั้นนี้ขึ้นไปได้ [เสริมพลัง] (empower) เพิ่มด้วย
const MS_LEECH_CHANCE = 0.35;      // ดูดซับเวท: โอกาสขโมยพลังงานเมื่อเป้าหมายกดสกิล/ฟื้นพลังงาน
const MS_LEECH_CHANCE_MARKED = 0.6; // ดูดซับเวท: โอกาสเพิ่มเป็น 60% ถ้าเป้าหมายติด [ตราล่าเวท] ด้วย
const MS_MARK_STEAL_MIN = 1;       // ตราล่าเวท: ขโมยพลังงานอย่างน้อย 1 หน่วย
const MS_MARK_STEAL_MAX = 5;       // ตราล่าเวท: ขโมยพลังงานอย่างมาก 5 หน่วย
const MS_MARK_TICK_TURNS = 2;      // ตราล่าเวท: ทุก 2 เทิร์นขโมยพลังงานเป้าหมาย 1 หน่วย
const MS_MARK_COOLDOWN = 2;        // ตราล่าเวท: คูลดาวน์ 2 เทิร์นหลังใช้
const MS_OVERSTEAL_WEAK_TURNS = 2; // ตราล่าเวท: ขโมยเกินพลังงานที่เหลือ → เป้าหมายติด [อ่อนแอ] -1 เป็นเวลา 2 เทิร์น
const MS_RUPTURE_TURNS = 2;        // ระเบิดมานา: ติดสถานะ 2 เทิร์น แล้วจึงระเบิด
const MS_BURDEN_TURNS = 5;         // ภาระเวท / ดูดซับเวท จาก Mana Burden: 5 เทิร์น
const MS_BURDEN_COOLDOWN = 7;      // Mana Burden: คูลดาวน์ 7 เทิร์นหลังใช้ (nerf)

module.exports = {
  id: "mageslayer",

  MS_FURY_MAX,
  MS_FURY_HEAL,
  MS_FURY_LEECH_TURNS,
  MS_LEECH_CHANCE,
  MS_LEECH_CHANCE_MARKED,
  MS_MARK_TICK_TURNS,
  MS_BURDEN_COOLDOWN,

  // ดาเมจ contribution — เรียกจาก computeAttackBase()
  //  Song's Curse: +1 ใส่เป้าหมายที่ "มีพลังงานมากกว่าเธอ" — เท่านี้เท่านั้น
  //  Fury ไม่บวกดาเมจแล้ว (nerf): เหลือแค่ "สูบพลังชีวิต" = ฟื้นเลือด + มอบดูดซับเวท ที่ onAttackPostDamage
  damageBonus(engine, attacker, target) {
    if (attacker.characterId !== "mageslayer") return 0;
    return (target.skillPoints || 0) > (attacker.skillPoints || 0) ? 1 : 0;
  },

  // ---------- ตราล่าเวท (Witch Mark) ----------

  // เป้าหมายนี้ติดตราล่าเวทของ ms อยู่จริงไหม (เช็คทั้ง 3 ฝั่งกันสถานะค้างหลังถูกล้าง/ย้ายมาร์ก)
  isMarkedBy(ms, target) {
    if (!ms || !target || ms.id === target.id) return false;
    if (ms.mageslayerMarkedId !== target.id) return false;
    if (!(((target.statuses && target.statuses.mageslayerMark) || 0) > 0)) return false;
    if (target.mageslayerMarks && !target.mageslayerMarks[ms.id]) return false;
    return true;
  },

  // ล้างตราล่าเวทของ ms ออกจากเป้าหมายเดิม (ใช้ตอนย้ายมาร์ก หรือมาร์กถูกต้านสถานะล้างทิ้ง)
  clearMarkFrom(ms, old) {
    if (!old) return;
    if (old.mageslayerMarks) delete old.mageslayerMarks[ms.id];
    const remaining = Object.keys(old.mageslayerMarks || {}).length;
    if (remaining > 0) old.statuses.mageslayerMark = 999;
    else {
      delete old.mageslayerMarks;
      delete old.statuses.mageslayerMark;
      if (old.statusAmt) delete old.statusAmt.mageslayerMark;
    }
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย 1 คน (คนอื่นเท่านั้น)
  prepareWitchMarkTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — มาร์กเป้าหมาย (ย้ายมาร์กจากเป้าหมายเดิมถ้ามี)
  applyWitchMark(engine, p, target) {
    if (p.mageslayerMarkedId) {
      this.clearMarkFrom(p, engine.players[p.mageslayerMarkedId]);
      p.mageslayerMarkedId = null;
    }
    p.mageslayerMarkTick = 0; // ตัวนับ "ทุก 2 เทิร์น" เริ่มใหม่ทุกครั้งที่ย้ายมาร์ก
    if (!((target.statuses.mageslayerMark || 0) > 0)) target.mageslayerMarks = {};
    if (!engine.applyDebuff(target, "mageslayerMark", null, 999)) {
      engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ตราล่าเวทไม่ติด`);
      return " — ต้านสถานะผิดปกติ";
    }
    target.mageslayerMarks = target.mageslayerMarks || {};
    target.mageslayerMarks[p.id] = true;
    target.statuses.mageslayerMark = 999;
    p.mageslayerMarkedId = target.id;
    p.mageslayerHasMarked = true;
    p.mageslayerWitchMarkReadyRound = engine.roundNumber + MS_MARK_COOLDOWN;
    engine.triggerCutscene(p, "mageslayerWitchMark");
    engine.log(`🎯 ${p.name} Witch Mark — มาร์ก ${target.name} ด้วยตราล่าเวท (เคลื่อนย้ายได้ ถาวรจนกว่าจะย้าย/ถูกล้าง)`);
    return ` — มาร์ก ${target.name}`;
  },

  // ขโมยพลังงาน n หน่วย — direct assignment ทะลุ Song's Curse — คืนจำนวนที่ขโมยได้จริง
  stealEnergy(engine, attacker, target, n) {
    const stolen = Math.max(0, Math.min(n, target.skillPoints || 0));
    if (stolen <= 0) return 0;
    target.skillPoints -= stolen;
    attacker.skillPoints = Math.min(engine.maxSkillOf(attacker), attacker.skillPoints + stolen);
    return stolen;
  },

  // ตราล่าเวท: จุดรวมของ "ดาเมจทุกประเภท" — เรียกจาก dealMixed/dealDirect/dealArmorOnly ใน server.js
  //  (ปืน GUTS / ดาเมจสกิล / การโจมตีปกติ ผ่านท่อเดียวกันหมด) โดยดูต้นตอจาก effectSourceId
  //  ขโมยพลังงานเท่าดาเมจ (ต่ำสุด 1 สูงสุด 5) — ถ้าจำนวนที่จะขโมยเกินพลังงานที่เป้าหมายเหลือ
  //  เป้าหมายติด [อ่อนแอ] -1 เป็นเวลา 2 เทิร์น
  onDamageDealt(engine, ms, target, dmg) {
    if (!ms || ms.characterId !== "mageslayer") return 0;
    if (!(dmg > 0)) return 0;
    if (!target || !this.isMarkedBy(ms, target)) return 0;
    const want = Math.max(MS_MARK_STEAL_MIN, Math.min(MS_MARK_STEAL_MAX, dmg));
    const before = target.skillPoints || 0;
    const stolen = this.stealEnergy(engine, ms, target, want);
    if (stolen > 0) {
      engine.log(`🔮 ${ms.name} ตราล่าเวท — ขโมยพลังงาน ${target.name} ${stolen} หน่วย (ดาเมจ ${dmg} → min ${MS_MARK_STEAL_MIN}/max ${MS_MARK_STEAL_MAX})`);
    }
    if (want > before && target.alive) {
      if (engine.applyDebuff(target, "weak", 1, MS_OVERSTEAL_WEAK_TURNS)) {
        engine.log(`🥀 ${ms.name} ตราล่าเวท — ขโมยพลังงานเกินที่ ${target.name} เหลืออยู่ (${want} > ${before}) ติด [อ่อนแอ] -1 ${MS_OVERSTEAL_WEAK_TURNS} เทิร์น`);
      } else {
        engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติด [อ่อนแอ] จากตราล่าเวท`);
      }
    }
    return stolen;
  },

  // เรียกจาก endTurn() — ตราล่าเวท: ทุก 2 เทิร์นขโมยพลังงานเป้าหมาย 1 หน่วยให้ผู้สังหารเมจ
  //  (ทำหน้าที่ reconcile มาร์กที่ถูก "ต้านสถานะผิดปกติ" ล้างทิ้งไปด้วย)
  tickWitchMark(engine) {
    for (const ms of engine.alivePlayers()) {
      if (ms.characterId !== "mageslayer" || !ms.mageslayerMarkedId) continue;
      const t = engine.players[ms.mageslayerMarkedId];
      if (!t || !t.alive || !this.isMarkedBy(ms, t)) {
        this.clearMarkFrom(ms, t);
        ms.mageslayerMarkedId = null;
        ms.mageslayerMarkTick = 0;
        continue;
      }
      ms.mageslayerMarkTick = (ms.mageslayerMarkTick || 0) + 1;
      if (ms.mageslayerMarkTick % MS_MARK_TICK_TURNS !== 0) continue;
      const stolen = this.stealEnergy(engine, ms, t, 1);
      if (stolen > 0) engine.log(`🔮 ${ms.name} ตราล่าเวท — ครบ ${MS_MARK_TICK_TURNS} เทิร์น ขโมยพลังงาน ${t.name} ${stolen} หน่วย`);
      else engine.log(`🔮 ${ms.name} ตราล่าเวท — ครบ ${MS_MARK_TICK_TURNS} เทิร์น แต่ ${t.name} ไม่มีพลังงานให้ขโมย`);
    }
  },

  // ---------- ดูดซับเวท (manaLeech) ----------
  // เรียกจาก useSkill() (กดสกิลสำเร็จ) และ addSkill() ที่ระบุแหล่งที่มา (ไอเทม/พาสซีฟ/การ์ดรังสรร)
  //  เป้าหมายที่ติด [ดูดซับเวท] มีโอกาส 35% ถูกขโมยพลังงาน 1 หน่วยให้ผู้สังหารเมจ
  //  (buff) ถ้าเป้าหมายติด [ตราล่าเวท] อยู่ด้วย โอกาสเพิ่มเป็น 60%
  leechChanceFor(target) {
    return (((target && target.statuses && target.statuses.mageslayerMark) || 0) > 0)
      ? MS_LEECH_CHANCE_MARKED
      : MS_LEECH_CHANCE;
  },

  onEnergyAction(engine, p) {
    if (!p || !p.alive || !(((p.statuses && p.statuses.manaLeech) || 0) > 0)) return;
    const chance = this.leechChanceFor(p);
    for (const ms of engine.alivePlayers()) {
      if (ms.characterId !== "mageslayer" || ms.id === p.id) continue;
      if (Math.random() >= chance) continue;
      const stolen = this.stealEnergy(engine, ms, p, 1);
      if (stolen > 0) engine.log(`🩸 ${ms.name} ดูดซับเวท (${Math.round(chance * 100)}%) — ${p.name} ถูกขโมยพลังงาน ${stolen} หน่วย`);
    }
  },

  // ---------- Fury ----------
  // เรียกจาก doAttack() หลังคำนวณดาเมจ — Fury ใช้หมดพร้อมกันในการโจมตีปกติครั้งเดียว
  //  (buff) สูบพลังชีวิตตามตาราง MS_FURY_HEAL (ขั้น 1/2/3 = +2/+3/+3) และมอบ [ดูดซับเวท]
  //  ตาม MS_FURY_LEECH_TURNS (2/4/5 เทิร์น) — ขั้น 3 ได้ [เสริมพลัง] +1 เพิ่มด้วย
  //  **ไม่บวกดาเมจของการโจมตีครั้งนี้** (nerf เดิม) — เสริมพลังไปมีผลกับการโจมตีครั้งถัดไป
  //  ใช้สถานะ `empower` (ไม่ใช่ `might`): ไม่ลดเทิร์น คงอยู่จนกว่าจะได้โจมตี แล้วหมดไปทันที
  onAttackPostDamage(engine, attacker, target, dmg) {
    if (attacker.characterId !== "mageslayer") return;
    const fury = Math.min(MS_FURY_MAX, attacker.statuses.mageslayerFury || 0);
    if (fury <= 0) return;
    const drain = MS_FURY_HEAL[fury] || 0;
    const heal = engine.healHp(attacker, drain);
    delete attacker.statuses.mageslayerFury;
    if (attacker.statusAmt) delete attacker.statusAmt.mageslayerFury;
    engine.log(`😤 ${attacker.name} Fury ขั้น ${fury} — สูบพลังชีวิต +${drain} (ฟื้นเลือด +${heal}) แล้วเคลียร์สต็อก`);
    if (fury >= MS_FURY_EMPOWER_TIER) {
      attacker.statuses.empower = 1; // ไม่ซ้อนทับ — หมดไปทันทีเมื่อได้โจมตีครั้งถัดไป
      engine.log(`💪 ${attacker.name} Fury ขั้น ${fury} — ได้รับ [เสริมพลัง] +1 (การโจมตีครั้งถัดไป แล้วหมดไป)`);
    }
    const turns = MS_FURY_LEECH_TURNS[fury] || 0;
    if (turns > 0 && target && target.alive) {
      if (engine.applyDebuff(target, "manaLeech", null, turns)) {
        engine.log(`🩸 ${attacker.name} Fury ขั้น ${fury} — ${target.name} ติด [ดูดซับเวท] ${turns} เทิร์น`);
      } else {
        engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติด [ดูดซับเวท] จาก Fury`);
      }
    }
  },

  // เรียกจาก server.js's bust/แต้มต่ำสุด trigger
  //  ปกติ: 35% สะสม Fury +1 (สูงสุด 3 ขั้น) — ถ้า Fury เต็ม 3 ขั้นแล้ว เอฟเฟกต์เปลี่ยนเป็น
  //  35% ได้ไอเทม "ยาโชคลาภ" +1 ชิ้นเข้าคลังแทน (buff: เดิมได้ [โชคลาภ] +1 เป็นสถานะ)
  onBustOrLoseRoll(engine, p) {
    if (p.characterId !== "mageslayer") return;
    if (Math.random() >= MS_FURY_CHANCE) return;
    if ((p.statuses.mageslayerFury || 0) >= MS_FURY_MAX) {
      engine.grantInventoryItem(p, { type: "fortune" });
      engine.log(`🍀 ${p.name} Fury เต็ม ${MS_FURY_MAX} ขั้น — ได้รับไอเทม [น้ำยาบัฟโชคลาภ] +1 ชิ้นเข้าคลังแทน`);
      return;
    }
    p.statuses.mageslayerFury = Math.min(MS_FURY_MAX, (p.statuses.mageslayerFury || 0) + 1);
    engine.log(`😤 ${p.name} Fury — สะสมพลังโกรธ +1 (${p.statuses.mageslayerFury}/${MS_FURY_MAX})`);
  },

  // ---------- Mana Rupture (อัลติเมต — ใส่ดีบัฟก่อนเปิดการ์ด ระเบิดเมื่อสถานะหมดเวลา) ----------
  prepareRuptureTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  ruptureDamageForEnergy(energy) {
    if (energy >= 7) return 1;
    if (energy >= 2) return 3;
    return 5;
  },

  // ผนึกพลังเวทย์ที่แถมมากับดาเมจ (พลังงาน 7-8 ไม่มี / 2-6 = 2 เทิร์น / 0-1 = 3 เทิร์น)
  ruptureSealForEnergy(energy) {
    if (energy >= 7) return 0;
    if (energy >= 2) return 2;
    return 3;
  },

  applyRuptureEffect(engine, p, target, skillName) {
    if (engine.satoruOnTargeted(target, p, `สกิล ${skillName} `).negated) return " — ถูกลบล้าง";
    target.statuses = target.statuses || {};
    target.statuses.manaRupture = Math.max(target.statuses.manaRupture || 0, MS_RUPTURE_TURNS);
    const energy = target.skillPoints || 0;
    const dmg = this.ruptureDamageForEnergy(energy);
    const seal = this.ruptureSealForEnergy(energy);
    target.manaRuptures = target.manaRuptures || [];
    target.manaRuptures.push({ casterId: p.id, dmg, seal, energy, round: engine.roundNumber + MS_RUPTURE_TURNS });
    engine.log(`💥 ${p.name} Mana Rupture — ${target.name} ติด [ระเบิดมานา] ${MS_RUPTURE_TURNS} เทิร์น (พลังงาน ${energy} → ดาเมจ ${dmg}${seal > 0 ? ` + ผนึกพลังเวทย์ ${seal} เทิร์น` : ""})`);
    return ` — ${target.name} ติดระเบิดมานา`;
  },

  resolveManaRupture(engine, caster, target, pending) {
    const { energy: e, dmg, seal } = pending;
    engine.dealMixed(target, dmg, true);
    engine.maybeBeatSave(target); engine.maybeBeatMode(target); engine.maybeEva3(target); engine.maybeWakeKotone(target);
    target.wasAttacked = true;
    engine.log(`💥 ${caster ? caster.name : "Mana Rupture"} — ระเบิดมานาของ ${target.name} ทำงาน (พลังงานตอนติดดีบัฟ ${e}) รับดาเมจ -${dmg}`);
    // เสียง SFX_Skill_2.mp3 ดังตอน "สถานะหมดเวลาแล้วระเบิด" ไม่ใช่ตอนกดใช้สกิล
    engine.skillFlash({
      name: `💥 Mana Rupture — ${target.name} ระเบิดมานา -${dmg}`,
      img: "/characters/mageslayer/Pic_skill_2.jpg",
      by: caster ? caster.name : "Mana Rupture",
      color: caster ? engine.colorOf(caster) : "#9B4F96",
      sound: "mageslayer_skill2",
    });
    if (seal > 0 && target.alive) {
      if (engine.applyDebuff(target, "manaSeal", null, seal)) engine.log(`⛔ ${target.name} ติด [ผนึกพลังเวทย์] ${seal} เทิร์นจากระเบิดมานา`);
      else engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติด [ผนึกพลังเวทย์]`);
    }
    if (target.alive && target.hp <= 0) {
      engine.instantDeath(target);
      if (!target.alive) engine.log(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
    }
  },

  resolveDueRuptures(engine) {
    for (const target of Object.values(engine.players)) {
      if (!Array.isArray(target.manaRuptures)) continue;
      if (!target.alive) {
        delete target.manaRuptures;
        delete target.statuses.manaRupture;
        if (target.statusAmt) delete target.statusAmt.manaRupture;
        continue;
      }
      const due = target.manaRuptures.filter((x) => x.round <= engine.roundNumber);
      target.manaRuptures = target.manaRuptures.filter((x) => x.round > engine.roundNumber);
      for (const pending of due) {
        if (!target.alive) break;
        const caster = engine.players[pending.casterId];
        // ระเบิดมานานับเป็น "ดาเมจสกิล" ของผู้ร่าย — ต้องมี effectSource เพื่อให้ตราล่าเวท/friendly-fire ทำงานถูกต้อง
        engine.withEffectSource(caster || null, () => this.resolveManaRupture(engine, caster, target, pending));
      }
      if (!target.manaRuptures.length) {
        delete target.manaRuptures;
        delete target.statuses.manaRupture;
        if (target.statusAmt) delete target.statusAmt.manaRupture;
      }
    }
  },

  // ---------- Mana Burden (สกิลรอง — คูลดาวน์ 7 เทิร์น) ----------
  // เรียกจาก useSkill()'s gate — ยังติดคูลดาวน์อยู่ไหม
  burdenOnCooldown(engine, p) {
    return engine.roundNumber < (p.mageslayerBurdenReadyRound || 0);
  },
  // ผู้เล่นทุกคนในสนาม "ไม่รวมตนเอง" ติด [ดูดซับเวท] 5 เทิร์น + [ภาระเวท] +1 5 เทิร์น (สะสมไม่เกิน SPELLBURDEN_MAX)
  //  ใช้ซ้ำใส่คนเดิมขณะสถานะยังอยู่ = ไม่ต่ออายุ (เวลาที่เหลือเดินต่อจากของเดิม)
  applyManaBurden(engine, p) {
    for (const t of engine.alivePlayers()) {
      if (t.id === p.id) continue; // ไม่รวมตนเอง
      if (engine.friendlyEffectBlocked(t)) continue;
      if (engine.resistActive(t)) {
        engine.log(`🛡️ ${t.name} ต้านสถานะผิดปกติ — ไม่ติดภาระเวท/ดูดซับเวทจาก Mana Burden`);
        continue;
      }
      // ภาระเวท: ผ่าน helper กลาง (สะสม +1 ถึงเพดาน SPELLBURDEN_MAX · ใช้ซ้ำใส่คนเดิมไม่ต่ออายุ)
      engine.applySpellburden(t, MS_BURDEN_TURNS);
      // ดูดซับเวท: กฎ "ไม่ต่ออายุ" เดียวกัน (resist ถูกเช็คไปแล้วด้านบน)
      engine.setTurnsNoRefresh(t, "manaLeech", MS_BURDEN_TURNS);
      engine.log(`⛓️🩸 ${p.name} Mana Burden — ${t.name} ติดภาระเวท +1 (สะสม ${t.statusAmt.spellburden}/${engine.SPELLBURDEN_MAX}) และดูดซับเวท (เหลือ ${t.statuses.manaLeech} เทิร์น)`);
    }
    p.mageslayerBurdenReadyRound = engine.roundNumber + MS_BURDEN_COOLDOWN;
    engine.log(`⏳ ${p.name} Mana Burden — ติดคูลดาวน์ ${MS_BURDEN_COOLDOWN} เทิร์น`);
  },
};
