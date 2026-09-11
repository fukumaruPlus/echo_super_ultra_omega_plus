// ============================================================
//  ริต้า เบอร์นัล / ฟีนิกซ์ (patch 2.1.6) — หัวใจที่ไม่ดับมอด (ลุกไหม้ตัวเอง) / ฝันไปเถอะ (สะท้อนดาเมจ) /
//  ฝืนใช้งาน NTD-Sytem (ท่าไม้ตาย 1) / ไม่อยากให้ใครต้องเจ็บปวด (ท่าไม้ตาย 2: ล่อเป้า+สะสมความเจ็บปวด) /
//  อย่าอยู่เลย แกน่ะ! (สกิลรอง 2: ลบ/แบนท่าไม้ตายเป้าหมาย) / ถ้าเลือกได้ อยากเกิดเป็นอะไรหรอ? (สกิลติดตัว 1: เกิดใหม่) /
//  ขอแค่ได้พบกันอีก (สกิลติดตัว 2: ปลดปล่อยความเจ็บปวดตอนตกรอบจริง)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม, characters/hikaru.js สำหรับกลไก hburn ร่วม
//  หมายเหตุ: สถานะ "hburn" (ลุกไหม้) เป็นฟิลด์ที่ใช้ร่วมกับ characters/hikaru.js — ดูหมายเหตุที่ hikaru.js
//  บล็อก "อย่าอยู่เลย แกน่ะ!" (purge) ตอนโจมตีโดน ยังอยู่ server.js เพราะเป็นเกือบทั้งหมดการเรียก shared infra
//  ของชิกิ (SHIKI_CANCELABLE_ULTS/shikiUltNameOf/clearWitherLines) — เหมือนกับที่ godslay-cancel ของชิกิเองก็
//  ยังอยู่ server.js ด้วยเหตุผลเดียวกัน (ดู shiki.js's หมายเหตุ) — มีแค่ effect "phenexPurge" (บังคับแต้มจั่ว) ที่ย้ายมาที่นี่
//  ระบบยื่นข้อเสนอ "เลือกเป้าหมายปลดปล่อยความเจ็บปวด" (phenexReleaseAsk, socket handler phenexRelease) ยังอยู่
//  server.js เป็น thin wrapper — เรียก resolvePendingRelease/resolveRelease ที่นี่
// ============================================================

const PHENEX_SELF_BURN = 2;       // หัวใจที่ไม่ดับมอด: ติดลุกไหม้ตัวเอง +2 หน่วย
const PHENEX_BURN_MAX = 5;        // ลุกไหม้ (ตัวเอง): สะสมได้ไม่เกิน 5 หน่วย
const PHENEX_REFLECT_COST_HP = 2; // ฝันไปเถอะ: เสียพลังชีวิต 2 หน่วยไม่สนเกราะตอนกด
const PHENEX_NTD_COST_HP = 3;     // ฝืนใช้งาน NTD-Sytem: เสียพลังชีวิต 3 หน่วยไม่สนเกราะตอนกด
const PHENEX_BAN_ULT_TURNS = 3;   // อย่าอยู่เลย แกน่ะ!: ไม่มีท่าไม้ตายให้ลบ -> แบนท่าไม้ตายเป้าหมาย 3 เทิร์นแทน (มีสำเนาใน server.js สำหรับ purge resolution)
const PHENEX_FORCE_SCORE = 20;    // อย่าอยู่เลย แกน่ะ!: บังคับแต้มการจั่วเป็น 20 ทันที
const PHENEX_NTD_ATK_BONUS = 1;   // ฝืนใช้งาน NTD-Sytem: พลังโจมตีพื้นฐาน +1

module.exports = {
  id: "phenex",

  // ดาเมจ contribution (เกิดใหม่แล้ว +1 / NTD-System +1) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const phenexRebornAtk = !!attacker.phenexReborn;
    const phenexNtdAtk = (attacker.statuses.phenexNtd || 0) > 0 || !!attacker.phenexNtdPermanent;
    ctx.phenexRebornAtk = phenexRebornAtk;
    ctx.phenexNtdAtk = phenexNtdAtk;
    return (phenexRebornAtk ? 1 : 0) + (phenexNtdAtk ? PHENEX_NTD_ATK_BONUS : 0);
  },

  // เรียกจาก characters/_universal_status.js's tickBurn — ฟีนิกซ์ฮีลจากลุกไหม้เสมอ (ไม่มีเงื่อนไข)
  hburnHeals(p) {
    return p.characterId === "phenex";
  },

  // เรียกจาก tickBurn เช่นกัน — ชื่อ flavor ที่ใช้ใน log ตอนลุกไหม้กลายเป็นการฮีล
  hburnLabel() {
    return "ขอแค่ได้พบกันอีก";
  },

  // สกิลติดตัว 1 ถ้าเลือกได้ อยากเกิดเป็นอะไรหรอ?: ตายครั้งแรก -> เกิดใหม่แทนตกรอบ (ครั้งเดียวต่อเกม)
  //  เรียกจาก instantDeath()'s shared function — คืน true ถ้าเกิดใหม่สำเร็จ (ผู้เรียกต้อง return ทันที ไม่ใช่ตกรอบ)
  tryRebirth(engine, p) {
    if (!(p.characterId === "phenex" && !p.phenexReborn && !engine.passiveSealed(p))) return false;
    p.phenexReborn = true;
    p.alive = true;
    p.result = null;
    p.locked = false;
    p.hp = engine.maxHpOf(p);
    p.armor = engine.maxArmorOf(p);
    p.tempHp = 0;
    delete p.statuses.phenexReflect;
    delete p.statuses.phenexBanUlt;
    delete p.statuses.phenexNtd; // เลิกนับเทิร์นแบบปกติ — เปลี่ยนเป็น flag ถาวรแทน
    p.phenexNtdPermanent = true;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "phenexRebirth"); // phenex_passive.mp4
    engine.log(`🔥🕊️ ${p.name} ถ้าเลือกได้ อยากเกิดเป็นอะไรหรอ? — เกิดใหม่ด้วยพลังชีวิต/เกราะเต็ม! เปิดใช้งาน NTD-Sytem ถาวรฟรี พลังโจมตีพื้นฐาน +1 ถาวร (ท่าไม้ตายเปลี่ยนเป็น "ไม่อยากให้ใครต้องเจ็บปวด" ถาวร)`);
    return true;
  },

  // สกิลติดตัว 2 ขอแค่ได้พบกันอีก: ตกรอบจริง (ระหว่างท่าไม้ตาย 2 ทำงาน) -> ปลดปล่อยความเจ็บปวดสะสม
  //  เรียกจาก instantDeath()'s shared function ก่อน p.alive=false — เตรียม/ยิงทันทีถ้ามีเป้าเดียว มิฉะนั้นรอผู้เล่นเลือก
  maybeReleasePainOnDeath(engine, p) {
    if (!(p.characterId === "phenex" && (p.phenexPain || 0) > 0 && ((p.statuses.phenexTaunt || 0) > 0 || p.phenexTauntGrace))) return;
    const pain = p.phenexPain || 0;
    p.phenexPain = 0;
    if (pain <= 0) return;
    const pool = Object.values(engine.players).filter((o) => o.alive && o.id !== p.id);
    if (!pool.length) return;
    if (pool.length === 1) { this.resolveRelease(engine, p, pool[0], pain); return; }
    p.phenexReleaseAsk = { pain, options: pool.map((o) => o.id) };
  },

  // ปลดปล่อยความเจ็บปวดสะสมใส่เป้าหมาย (ไม่สนการหลบหลีก) — เรียกจากทั้ง maybeReleasePainOnDeath (เป้าเดียว)
  //  และ server.js's phenexRelease socket handler / auto-resolve-at-reveal loop (ผู้เล่นเลือกเอง/หมดเวลา)
  resolveRelease(engine, p, target, pain) {
    if (!target || !target.alive) return;
    engine.triggerCutscene(p, "phenexRelease"); // phenex_passive2.mp4
    engine.dealMixed(target, pain); // ไม่ผ่านระบบหลบหลีกปกติ — ยิงตรงแบบไม่สนการหลบหลีกเสมอ (ยังลดเกราะก่อนตามปกติ)
    engine.log(`💔🔥 ${p.name} ขอแค่ได้พบกันอีก — ปลดปล่อยความเจ็บปวดที่สะสม ${pain} หน่วยใส่ ${target.name} (ไม่สนการหลบหลีก)!`);
    if (target.alive && target.hp <= 0) {
      engine.instantDeath(target);
      if (!target.alive) engine.log(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
    }
  },

  // เรียกจาก loseHp()/loseArmor()'s shared functions — ไม่อยากให้ใครต้องเจ็บปวด: ระหว่างล่อเป้า สะสม "ความเจ็บปวด" +1 ทุกหน่วยที่เสีย
  onHpLost(p) {
    if (p.characterId === "phenex" && (p.statuses.phenexTaunt || 0) > 0) p.phenexPain = (p.phenexPain || 0) + 1;
  },
  onArmorLost(p) {
    if (p.characterId === "phenex" && (p.statuses.phenexTaunt || 0) > 0) p.phenexPain = (p.phenexPain || 0) + 1;
  },

  // เรียกจาก useSkill() ในส่วน effect — หัวใจที่ไม่ดับมอด: ติดลุกไหม้ตัวเอง (phenexIgnite เป็น trigger เฉยๆ แปลงเป็นสแตค hburn ทันที)
  activateIgnite(engine, p) {
    delete p.statuses.phenexIgnite;
    p.statuses.hburn = Math.min(PHENEX_BURN_MAX, (p.statuses.hburn || 0) + PHENEX_SELF_BURN);
    engine.log(`🔥 ${p.name} หัวใจที่ไม่ดับมอด — ติดลุกไหม้ตัวเอง +${PHENEX_SELF_BURN} หน่วย (${p.statuses.hburn}/${PHENEX_BURN_MAX})`);
  },

  // เรียกจาก useSkill() ในส่วน effect — ฝันไปเถอะ: เสียพลังชีวิตไม่สนเกราะทันที แล้วตั้งรับสะท้อนดาเมจ
  activateReflect(engine, p) {
    engine.dealDirect(p, PHENEX_REFLECT_COST_HP);
    engine.maybeBeatSave(p); engine.maybeBeatMode(p); engine.maybeWakeKotone(p);
    engine.log(`🪞 ${p.name} ฝันไปเถอะ — เสียพลังชีวิต ${PHENEX_REFLECT_COST_HP} หน่วย (ไม่สนเกราะ) แล้วตั้งรับ ${p.statuses.phenexReflect || 0} เทิร์น สะท้อนความเสียหายที่ได้รับกลับผู้โจมตีทั้งหมด`);
    if (p.alive && p.hp <= 0) {
      engine.instantDeath(p);
      if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — ฝืนใช้งาน NTD-Sytem (ท่าไม้ตาย 1): เสียพลังชีวิตแล้วเปิด NTD-System
  activateNtd(engine, p) {
    engine.triggerCutscene(p, "phenexNtd");
    engine.dealDirect(p, PHENEX_NTD_COST_HP);
    engine.maybeBeatSave(p); engine.maybeBeatMode(p); engine.maybeWakeKotone(p);
    engine.log(`⚙️ ${p.name} ฝืนใช้งาน NTD-Sytem — เสียพลังชีวิต ${PHENEX_NTD_COST_HP} หน่วย (ไม่สนเกราะ) เปิดใช้งาน NTD-System ${p.statuses.phenexNtd || 0} เทิร์น (สกิลรองเปลี่ยนเป็นอย่าอยู่เลย แกน่ะ!)`);
    if (p.alive && p.hp <= 0) {
      engine.instantDeath(p);
      if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — ไม่อยากให้ใครต้องเจ็บปวด (ท่าไม้ตาย 2): ล่อเป้าทุกคนมาที่ตัวเอง
  activateTaunt(engine, p) {
    engine.triggerCutscene(p, "phenexTaunt");
    engine.log(`🥺 ${p.name} ไม่อยากให้ใครต้องเจ็บปวด — ล่อเป้าหมายการโจมตีของทุกคนมาที่ตัวเอง ${p.statuses.phenexTaunt || 0} เทิร์น (ใช้สกิล/จั่วไพ่ไม่ได้ระหว่างนี้ แต่ยังโจมตีได้ถ้าชนะ)`);
  },

  // เรียกจาก useSkill() ในส่วน effect — อย่าอยู่เลย แกน่ะ!: บังคับแต้มการจั่วเป็น 20 ทันที (ผลต่อการโจมตีจริง — purge — ดูใน server.js's doAttack)
  activatePurge(engine, p) {
    if (engine.calculateScore(p.cards) < PHENEX_FORCE_SCORE) {
      engine.drawToScore(p, PHENEX_FORCE_SCORE);
      engine.log(`🎯 ${p.name} อย่าอยู่เลย แกน่ะ! — จั่วการ์ดจากกองกลางจนแต้มถึง ${PHENEX_FORCE_SCORE} (ได้ ${engine.calculateScore(p.cards)} แต้ม${p.busted ? " — แตก!" : ""})`);
    } else {
      engine.log(`🎯 ${p.name} อย่าอยู่เลย แกน่ะ! — แต้ม ${engine.calculateScore(p.cards)} อยู่แล้ว ไม่มีผลกับแต้มการจั่ว`);
    }
  },

  // เรียกจาก doAttack() ตอนเลือกเป้าหมาย — ไม่อยากให้ใครต้องเจ็บปวด: หาผู้ล่อเป้า คืน player หรือ null
  findTaunter(engine, attacker) {
    return this.findTaunters(engine, attacker)[0] || null;
  },
  findTaunters(engine, attacker) {
    return engine.alivePlayers().filter(
      (r) => r.id !== attacker.id && r.characterId === "phenex" && (r.statuses.phenexTaunt || 0) > 0 && !engine.sealActive(r)
    );
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ — ฝันไปเถอะ: สะท้อนความเสียหายทั้งหมดกลับผู้โจมตีแทนที่จะรับเอง (จบการโจมตีทันที)
  //  คืน true ถ้าทำงาน (ผู้เรียกต้อง return ทันที)
  tryReflectHit(engine, attacker, target, dmg) {
    if (!(target.characterId === "phenex" && (target.statuses.phenexReflect || 0) > 0 && target.alive && attacker.id !== target.id)) return false;
    engine.triggerCutscene(target, "phenexReflect");
    const reflectDmg = dmg;
    delete target.statuses.phenexReflect; // สะท้อนได้แค่ครั้งเดียวใน 3 เทิร์น — สะท้อนสำเร็จแล้วผลจบทันที
    engine.dealMixed(attacker, reflectDmg);
    engine.maybeBeatSave(attacker); engine.maybeBeatMode(attacker); engine.maybeWakeKotone(attacker);
    attacker.wasAttacked = true;
    attacker.phenexLastHitBy = target.id;
    target.wasAttacked = true;
    engine.log(`🪞 ${target.name} ฝันไปเถอะ — สะท้อนความเสียหาย -${reflectDmg} กลับให้ ${attacker.name}! (ผลจบลงทันที)`);
    if (attacker.alive && attacker.hp <= 0) {
      engine.instantDeath(attacker);
      if (!attacker.alive) engine.log(`💀 ${attacker.name} เลือดจริงหมด ตกรอบ!`);
    }
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, reflect: true,
      skills: [{ name: `ฝันไปเถอะ — สะท้อน -${reflectDmg}`, img: "/characters/rita/skill2/phenex_skill2.jpg", by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, () => engine.runCutsceneQueue(engine.endTurn));
      engine.broadcastState();
    });
    return true;
  },
};
