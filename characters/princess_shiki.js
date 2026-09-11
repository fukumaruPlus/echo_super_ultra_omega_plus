// ============================================================
//  เจ้าหญิงราก (เรียวกิ ชิกิ) (patch 2.2.7) — Mystical Eye of Death Perception (Truth) /
//  อืม ฉันเข้าใจแล้ว (สกิลพื้นฐาน) / อย่าทำอะไรไม่เข้าท่าเลย (สกิลรอง) / ทุกอย่างจะต้องราบรื่น (ท่าไม้ตาย)
//  ดู characters/index.js สำหรับไฟล์มัดรวม
//
//  หมายเหตุ: ตัวนี้ใช้ shared infra ของเรียวกิ ชิกิ ร่วมกันหลายชิ้น (ยังอยู่ server.js ตามเดิม)
//    - godslay / shikiCancelUltimate / SHIKI_CANCELABLE_ULTS: สกิลรอง "อย่าทำอะไรไม่เข้าท่าเลย"
//      ทำงานเหมือน "นายมีฝีมือแค่ไหนหรอ?" ทุกประการ (ใช้วีดีโอ shiki_passive2.mp4 ตัวเดียวกัน)
//      ต่างกันแค่ชื่อท่า/อายุ 1 เทิร์น และฟื้นเลือดให้ตัวเองเมื่อยกเลิกสำเร็จจริง
//    - deathline (เส้นชีวิต): สถานะเดียวกับของเรียวกิ ชิกิ/เทเปา — ที่นี่เขียนตรงๆ เหมือนเทเปา
//      (ไม่ผ่าน shikiGiveLifeline เพราะเพดาน/แหล่งที่มาเป็นของตัวเอง คนละกติกากับโหมดท่าไม้ตายของเรียวกิ)
//    - "เนตรมณะ" (netramana) เป็นสถานะ Universal ตัวใหม่ — ตรรกะสังหารอยู่ characters/_universal_status.js
//      + จุดโรลใน doAttack() ของ server.js (ตัวละครไหนก็ติดบัฟนี้แล้วใช้ได้ ไม่ผูกกับเจ้าหญิงราก)
// ============================================================

const PSHIKI_SKILL_REGEN = 1;          // สกิลติดตัว: แต้มสกิลฟื้นเองทุกๆ 1 เทิร์น (เพิ่มจากที่ทุกคนได้ตอนจบเทิร์น)
const PSHIKI_LINE_MAX = 3;             // สกิลติดตัว: เส้นชีวิตที่แจกให้ผู้โจมตี สะสมได้สูงสุด 3 หน่วยต่อคน (ถาวร)
const PSHIKI_LINE_PER_HIT = 1;         // สกิลติดตัว: ถูกโจมตี 1 ครั้ง -> ผู้โจมตีติดเส้นชีวิต +1
const PSHIKI_KILL_CHANCE_PER_LINE = 0.10; // สกิลติดตัว: เส้นชีวิต 1 หน่วย = โอกาสสังหาร 10% (กติกาเดียวกับเทเปา)
const PSHIKI_BLEED_COST = 3;           // อืม ฉันเข้าใจแล้ว: เสียพลังชีวิตไม่สนเกราะ 3 หน่วย
const PSHIKI_BLADE_TURNS = 1;          // อืม ฉันเข้าใจแล้ว: สถานะ "ชักดาบ" คงอยู่ 1 เทิร์น
const PSHIKI_BLADE_HEAL = 2;           // ชักดาบ: ได้โจมตีจริง -> ฟื้นพลังชีวิต 2 หน่วย
const PSHIKI_SEAL_TURNS = 1;           // อย่าทำอะไรไม่เข้าท่าเลย: ชาร์จยกเลิกท่าไม้ตายอยู่ได้ 1 เทิร์น (1 ครั้ง)
const PSHIKI_SEAL_HEAL = 3;            // อย่าทำอะไรไม่เข้าท่าเลย: ยกเลิกสำเร็จ -> ฟื้นพลังชีวิต 3 หน่วย
const PSHIKI_ULT_TURNS = 5;            // ทุกอย่างจะต้องราบรื่น: เนตรมณะคงอยู่ 5 เทิร์น
const PSHIKI_PROFILE_IMG = "/characters/princess_shiki/p_shiki.jpg";
const PSHIKI_ULT_IMG = "/characters/princess_shiki/p_shiki_skill3.jpg";

module.exports = {
  id: "princess_shiki",
  LINE_MAX: PSHIKI_LINE_MAX,
  BLADE_TURNS: PSHIKI_BLADE_TURNS,
  SEAL_TURNS: PSHIKI_SEAL_TURNS,
  SEAL_HEAL: PSHIKI_SEAL_HEAL,
  ULT_TURNS: PSHIKI_ULT_TURNS,
  PROFILE_IMG: PSHIKI_PROFILE_IMG,
  ULT_IMG: PSHIKI_ULT_IMG,

  // ---------- สกิลติดตัว Mystical Eye of Death Perception (Truth) ----------
  // เรียกจาก afterSummary()/doAttack() — โจมตีปกติไม่ได้เลย เว้นแต่กำลังติด "ชักดาบ" (สกิลพื้นฐาน) อยู่
  cannotAttack(p) {
    return p.characterId === "princess_shiki" && !((p.statuses.pshikiBlade || 0) > 0);
  },

  // เรียกจาก dealRound() ต้นเทิร์น — แต้มสกิลฟื้นเองทุกๆ 1 เทิร์น
  onRoundStartTick(engine, p) {
    if (p.characterId !== "princess_shiki" || !p.alive) return;
    if (engine.passiveSealed(p)) return;
    const before = p.skillPoints;
    engine.addSkill(p, PSHIKI_SKILL_REGEN);
    if (p.skillPoints > before) engine.log(`👁️ ${p.name} Mystical Eye of Death Perception (Truth) — แต้มสกิลฟื้นเอง +${p.skillPoints - before} (มี ${p.skillPoints})`);
  },

  // เรียกจาก doAttack() ตอนถูกโจมตี — ผู้โจมตีติด "เส้นชีวิต" +1 ถาวร (สูงสุด 3 หน่วยต่อคน)
  grantDeathlineOnAttacked(engine, attacker, target) {
    if (target.characterId !== "princess_shiki" || !attacker.alive) return;
    if (engine.passiveSealed(target)) return;
    if (attacker.id === target.id) return;
    if (engine.resistActive(attacker)) {
      engine.log(`🛡️ ${attacker.name} ต้านสถานะผิดปกติ — โจมตี ${target.name} แล้วไม่ติดเส้นชีวิตเพิ่ม`);
      return;
    }
    const cur = attacker.statuses.deathline || 0;
    if (cur >= PSHIKI_LINE_MAX) {
      engine.log(`🩸 ${attacker.name} เส้นชีวิตจากเนตรของ ${target.name} เต็มเพดานแล้ว (${cur}/${PSHIKI_LINE_MAX})`);
      return;
    }
    attacker.statuses.deathline = Math.min(PSHIKI_LINE_MAX, cur + PSHIKI_LINE_PER_HIT);
    engine.log(`🩸 ${target.name} Mystical Eye of Death Perception (Truth) — ${attacker.name} ลงมือโจมตี จึงติดเส้นชีวิต +${attacker.statuses.deathline - cur} ถาวร (สะสม ${attacker.statuses.deathline}/${PSHIKI_LINE_MAX})`);
  },

  // เรียกจาก doAttack() ตอนเจ้าหญิงรากได้โจมตีปกติ (ผ่านชักดาบ) — คิดโอกาสสังหารจากเส้นชีวิตของเป้าหมาย
  //  คืน true ถ้าสังหารสำเร็จ (ผู้เรียกต้อง return ทันที) — เนตรมณะคิดแยกเป็นสถานะ Universal ใน doAttack
  onAttackDeathline(engine, attacker, target) {
    if (attacker.characterId !== "princess_shiki") return false;
    if (engine.passiveSealed(attacker) || engine.killSealed(attacker)) return false;
    const lines = target.statuses.deathline || 0;
    if (lines <= 0) return false;
    const chance = engine.miyakoKillChance(target, lines * PSHIKI_KILL_CHANCE_PER_LINE);
    if (Math.random() >= chance) {
      engine.miyakoSurvivedKillAttempt(target);
      engine.log(`👁️ ${attacker.name} มองเห็นเส้นชีวิต ${lines} หน่วยของ ${target.name} (โอกาส ${Math.round(chance * 100)}%) — แต่ยังไม่ถึงคราว`);
      return false;
    }
    if (engine.appleGuyDodgesKill(attacker, target)) return true; // Apple guy: หลบสังหารทันทีได้
    engine.queueCutscene(attacker, "pshikiKill"); // เล่นวีดีโอก่อนสังหารทุกครั้ง
    engine.instantDeath(target);
    target.wasAttacked = true;
    if (!target.alive) engine.log(`👁️💀 Mystical Eye of Death Perception (Truth) — ${attacker.name} ตัดเส้นชีวิต ${lines} หน่วยของ ${target.name} (โอกาส ${Math.round(chance * 100)}%) — สังหารทันที!`);
    else engine.log(`👁️💀 Mystical Eye of Death Perception (Truth) — ${attacker.name} ตัดเส้นชีวิตของ ${target.name} — แต่ ${target.name} เกิดใหม่หนีความตายไปได้!`);
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, kill: !target.alive,
      skills: [{ name: "Mystical Eye of Death Perception (Truth) — สังหารทันที", img: PSHIKI_ULT_IMG, by: attacker.name, color: engine.POSITION_COLORS[attacker.position] || "#888", side: "atk" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME + 2, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // ---------- สกิลพื้นฐาน อืม ฉันเข้าใจแล้ว ----------
  // เรียกจาก useSkill()'s gate — ชักดาบยังค้างอยู่ กดซ้ำไม่ได้ (เสียเลือดฟรี)
  canCastBlade(p) {
    return !((p.statuses.pshikiBlade || 0) > 0);
  },

  // เรียกจาก useSkill() ในส่วน effect (สถานะ pshikiBlade ถูก applyEffect ตั้งให้แล้ว)
  activateBlade(engine, p) {
    engine.dealDirect(p, PSHIKI_BLEED_COST); // ไม่สนเกราะ
    engine.maybeBeatSave(p); engine.maybeBeatMode(p); engine.maybeWakeKotone(p);
    engine.log(`🗡️ ${p.name} อืม ฉันเข้าใจแล้ว — เสียพลังชีวิต ${PSHIKI_BLEED_COST} หน่วย (ไม่สนเกราะ) แลกกับการชักดาบออกมา ${PSHIKI_BLADE_TURNS} เทิร์น: เทิร์นนี้โจมตีปกติได้ และหากได้โจมตีจริงจะฟื้นพลังชีวิต +${PSHIKI_BLADE_HEAL}`);
    if (p.alive && p.hp <= 0) {
      engine.instantDeath(p);
      if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
  },

  // เรียกจาก doAttack() หลังโจมตีสำเร็จ — ชักดาบ: ได้โจมตีจริงแล้วฟื้นพลังชีวิต (คืนจำนวนที่ฟื้น 0 = ไม่เข้าเงื่อนไข)
  applyBladeHeal(engine, attacker) {
    if (!(attacker.characterId === "princess_shiki" && (attacker.statuses.pshikiBlade || 0) > 0)) return 0;
    const heal = engine.healHp(attacker, PSHIKI_BLADE_HEAL);
    engine.log(`🗡️ ${attacker.name} อืม ฉันเข้าใจแล้ว — ดาบได้ทำงาน ฟื้นพลังชีวิต +${heal}`);
    return heal;
  },

  // ---------- สกิลรอง อย่าทำอะไรไม่เข้าท่าเลย ----------
  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย (คนอื่นเท่านั้น · ยังมีชาร์จค้างอยู่กดซ้ำไม่ได้)
  prepareSealTarget(engine, p, targets) {
    if ((p.statuses.godslay || 0) > 0) return null;
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — มอบเส้นชีวิต +1 ให้เป้าหมาย + ตัวเองได้ชาร์จยกเลิกท่าไม้ตาย 1 ครั้ง
  applySealEffect(engine, p, target, skillName) {
    p.statuses.godslay = PSHIKI_SEAL_TURNS; // ใช้ชาร์จตัวเดียวกับเรียวกิ ชิกิ — แต่อยู่แค่ 1 เทิร์น
    if (engine.satoruOnTargeted(target, p, `สกิล ${skillName} `).negated) {
      engine.log(`🗡️ ${p.name} อย่าทำอะไรไม่เข้าท่าเลย — พร้อมยกเลิกท่าไม้ตายของผู้เล่นอื่น 1 ครั้ง (${PSHIKI_SEAL_TURNS} เทิร์น)`);
      return " — เส้นชีวิตถูกลบล้าง";
    }
    let dlMsg;
    if (engine.resistActive(target)) {
      dlMsg = "ต้านสถานะผิดปกติ — ไม่ติดเส้นชีวิตเพิ่ม";
    } else {
      const cur = target.statuses.deathline || 0;
      if (cur >= PSHIKI_LINE_MAX) {
        dlMsg = `เส้นชีวิตเต็มเพดานแล้ว (${cur}/${PSHIKI_LINE_MAX})`;
      } else {
        target.statuses.deathline = Math.min(PSHIKI_LINE_MAX, cur + 1);
        dlMsg = `ติดเส้นชีวิต +${target.statuses.deathline - cur} (สะสม ${target.statuses.deathline}/${PSHIKI_LINE_MAX})`;
      }
    }
    engine.log(`🗡️ ${p.name} อย่าทำอะไรไม่เข้าท่าเลย — ${target.name} ${dlMsg} และ ${p.name} พร้อมยกเลิกท่าไม้ตายของผู้เล่นอื่น 1 ครั้ง (${PSHIKI_SEAL_TURNS} เทิร์น · ยกเลิกสำเร็จฟื้นพลังชีวิต +${PSHIKI_SEAL_HEAL})`);
    return ` — เตือนสติ ${target.name}`;
  },

  // เรียกจาก shikiCancelUltimate() ใน server.js — ยกเลิกท่าไม้ตายสำเร็จจริง -> ฟื้นพลังชีวิตให้ตัวเอง
  onSealSuccess(engine, slayer) {
    if (slayer.characterId !== "princess_shiki") return;
    const heal = engine.healHp(slayer, PSHIKI_SEAL_HEAL);
    engine.log(`🗡️💚 ${slayer.name} อย่าทำอะไรไม่เข้าท่าเลย — ยกเลิกสำเร็จ ฟื้นพลังชีวิต +${heal}`);
  },

  // ---------- ท่าไม้ตาย ทุกอย่างจะต้องราบรื่น ----------
  // เรียกจาก useSkill() ในส่วน effect (สถานะ pshikiUlt ถูก applyEffect ตั้งให้แล้ว)
  //  บัฟ "เนตรมณะ" ให้ผู้เล่นทุกคนบนสนาม (รวมตัวเอง) — ฉากหลังซ้อนแบบโทโนะ ชิกิ + เพลง p_shiki_theme
  activateUlt(engine, p) {
    p.transformAt = engine.nextTransformCounter(); // เพลง/ฉากหลังใช้ลำดับล่าสุด (กรณีมีเจ้าหญิงรากหลายคน)
    const names = [];
    for (const o of engine.alivePlayers()) {
      engine.applyBuff(o, "netramana", null, PSHIKI_ULT_TURNS); // บัฟ ไม่ใช่ดีบัฟ — ต้านสถานะผิดปกติไม่บล็อก
      names.push(o.name);
    }
    engine.log(`👁️✨ ${p.name} ทุกอย่างจะต้องราบรื่น — เปิดตาให้ทุกคนบนสนามเห็น "เนตรมณะ" ${PSHIKI_ULT_TURNS} เทิร์น (${names.join(", ")}) — การโจมตีปกติของทุกคนมีโอกาสสังหารทันที ${Math.round(engine.NETRAMANA_KILL_CHANCE * 100)}%`);
  },
};
