// ============================================================
//  เทเปา (patch 2.2 new) — วันนี้อากาศดีจัง (ทำอาหาร) / เป็นแบบนี้นี่เอง (ครุ่นคิด) / นายเป็นคนทำตัวเองนะ (ท่าไม้ตาย: สังหารตามเส้นชีวิต)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: ระบบ "เส้นชีวิต" (deathline) เป็นสถานะที่ตัวละครอื่นใช้ร่วมด้วย (ชิกิ: deatheye/wither ท่าไม้ตาย,
//  ฟีนิกซ์: อย่าอยู่เลย แกน่ะ! purge) — shikiGiveLifeline/clearWitherLines/SHIKI_DEATHLINE_MAX ยังอยู่ server.js
//  เป็น shared infra (ดู characters/shiki.js's หมายเหตุ) — เทเปาเขียน/อ่าน target.statuses.deathline ตรงๆ
//  เหมือนเดิม ไม่ผ่าน shikiGiveLifeline เพราะเป็น mechanic ของเทเปาเอง (ไม่ใช่การ "มอบ" แบบชิกิ)
// ============================================================

const TEPEU_COOK_TURNS = 2;           // วันนี้อากาศดีจัง: ทำอาหารครบ 2 เทิร์น -> ได้ "มื้อที่สุข" เข้าคลัง
const TEPEU_MEAL_HEAL = 3;            // มื้อที่สุข: ฟื้นพลังชีวิต +3 เมื่อใช้จากคลัง
const TEPEU_PONDER_TURNS = 3;         // เป็นแบบนี้นี่เอง: ครุ่นคิด 3 เทิร์น จั่วไพ่ไม่ได้ (ยังโจมตีได้ถ้าชนะ)
const TEPEU_PONDER_SKILL_GAIN = 1;    // ครุ่นคิด: จบเทิร์นได้แต้มสกิลเพิ่ม +1 (เทิร์นสุดท้ายได้ +2 แทน)
const TEPEU_PONDER_SKILL_GAIN_LAST = 2;
const TEPEU_DEATHLINE_CAP = 5;        // เส้นชีวิตที่เทเปาเกี่ยวข้อง สะสมได้สูงสุด 5 หน่วยต่อคน
const TEPEU_LOSE_STREAK_DECAY = 3;    // แพ้ติดกันเกิน 3 เทิร์น -> เส้นชีวิตลด 1 (แพ้ชนะสลับกันไปมาจะไม่ลด)
const TEPEU_KILL_CHANCE_PER_LINE = 0.10; // นายเป็นคนทำตัวเองนะ: เส้นชีวิต 1 หน่วย = โอกาสสังหาร 10%
const TEPEU_EYE_TURNS = 1;            // นายเป็นคนทำตัวเองนะ: ฉากหลัง/เพลงจบ (แบบโทโนะ ชิกิ) คงอยู่ถึงจบเทิร์นที่ผลทำงานเท่านั้น

module.exports = {
  id: "tepeu",

  // เรียกจาก afterResolve()'s resolveAllKills — คิดโอกาสสังหารจากเส้นชีวิตที่เป้าหมายมี (1 หน่วย = 10%)
  //  พลาด/ไม่มีเส้นชีวิต -> ล้างเส้นชีวิตของเป้าหมายทั้งหมด — วีดีโอเล่นไปแล้วตอนกด (useSkill) จุดนี้แค่ตัดสินผล
  resolveKill(engine, p, t) {
    const lines = t.statuses.deathline || 0;
    // ORT (ต้านการสังหาร): ท่านี้ไม่ได้ผ่าน miyakoKillChance จึงต้องเรียกด่านของ ORT เอง
    const chance = engine.CHAR_HOOKS.ort.killChanceAgainst(t, lines * TEPEU_KILL_CHANCE_PER_LINE);
    p.transformAt = engine.nextTransformCounter(); // เพลง/ฉากหลังใช้ลำดับล่าสุด (กรณีมีเทเปาหลายคน)
    p.tepeuEyeTurns = TEPEU_EYE_TURNS;
    if (lines > 0 && Math.random() < chance) {
      engine.log(`💀 ${p.name} นายเป็นคนทำตัวเองนะ — สังหาร ${t.name} สำเร็จ! (เส้นชีวิต ${lines} หน่วย = โอกาส ${Math.round(chance * 100)}%)`);
      engine.instantDeath(t);
      t.wasAttacked = true;
      if (!t.alive) engine.log(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
    } else {
      delete t.statuses.deathline;
      if (t.statusAmt) delete t.statusAmt.deathline;
      engine.log(`💫 ${p.name} นายเป็นคนทำตัวเองนะ — พลาด! เส้นชีวิตของ ${t.name} ถูกล้างทั้งหมด (มีอยู่ ${lines} หน่วย = โอกาสแค่ ${Math.round(chance * 100)}%)`);
    }
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย นายเป็นคนทำตัวเองนะ (คนอื่นเท่านั้น)
  prepareKillTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — วันนี้อากาศดีจัง: เริ่มทำอาหาร 2 เทิร์น
  applyCookEffect(engine, p) {
    p.tepeuCookTurns = TEPEU_COOK_TURNS;
    p.statuses.tepeuCook = 1; // ป้ายสถานะ "กำลังทำอาหาร" (ให้ engine จัดการนับเทิร์นเองผ่าน tepeuCookTurns — ไม่ลดเทิร์นผ่านลูปทั่วไป)
    engine.log(`🍳 ${p.name} วันนี้อากาศดีจัง — เริ่มทำอาหาร! อีก ${TEPEU_COOK_TURNS} เทิร์นจะได้ "มื้อที่สุข" เข้าคลัง (ระหว่างนี้กดสกิลนี้ซ้ำไม่ได้)`);
  },

  // เรียกจาก useSkill() ในส่วน effect — เป็นแบบนี้นี่เอง: ครุ่นคิด 3 เทิร์น จั่วไพ่ไม่ได้ (ยังโจมตีได้ถ้าชนะ)
  applyPonderEffect(engine, p) {
    p.tepeuPonderTurns = TEPEU_PONDER_TURNS;
    p.statuses.tepeuPonder = 1; // ป้ายสถานะ "ครุ่นคิด" (ให้ engine จัดการนับเทิร์นเองผ่าน tepeuPonderTurns — ไม่ลดเทิร์นผ่านลูปทั่วไป)
    engine.log(`🤔 ${p.name} เป็นแบบนี้นี่เอง — เริ่มครุ่นคิด ${TEPEU_PONDER_TURNS} เทิร์น (จั่วไพ่ไม่ได้ แต่ยังโจมตีได้ถ้าชนะ — จบเทิร์นได้แต้มสกิลเพิ่ม เทิร์นสุดท้ายได้ +${TEPEU_PONDER_SKILL_GAIN_LAST})`);
  },

  // เรียกจาก useSkill() ในส่วน effect — นายเป็นคนทำตัวเองนะ: เลือกเป้าหมาย + เล่นวีดีโอทันที (ผลสังหารทำงานหลังเปิดไพ่) คืน flashSuffix
  applyKillEffect(engine, p, target, skillName) {
    if (engine.satoruOnTargeted(target, p, `สกิล ${skillName} `).negated) {
      return " — ถูกลบล้าง";
    }
    p.tepeuKillTargetId = target.id;
    engine.triggerCutscene(p, "tepeuUlt"); // วีดีโอเล่นทันทีตอนกด — ผลสังหารจะรู้หลังเปิดไพ่
    engine.log(`💀 ${p.name} นายเป็นคนทำตัวเองนะ — เล็งเป้าหมาย ${target.name} ไว้ (ผลจะทำงานหลังทุกคนเปิดไพ่)`);
    return ` — เลือกเป้าหมาย ${target.name} (ผลจะทราบหลังเปิดไพ่)`;
  },

  // เรียกจาก resolveRound() ตอนตัดสินผู้ชนะ — รีเซ็ตเคาน์เตอร์แพ้ติดกัน + สมองอันชาญฉลาด (ผู้ชนะการจั่วไพ่ติดเส้นชีวิต +1 ถ้ามีเทเปากำลังครุ่นคิดอยู่)
  onRoundWin(engine, w, combatants) {
    w.tepeuLoseStreak = 0; // ชนะ -> เคาน์เตอร์แพ้ติดกัน (เทเปา) รีเซ็ต
    const tepeuPondering = combatants.filter((q) => q.characterId === "tepeu" && (q.tepeuPonderTurns || 0) > 0);
    if (!tepeuPondering.length) return;
    if (engine.resistActive(w)) {
      engine.log(`🛡️ ${w.name} ต้านสถานะผิดปกติ — สมองอันชาญฉลาดไม่มีผล`);
      return;
    }
    const dlCur = w.statuses.deathline || 0;
    const added = Math.min(tepeuPondering.length, Math.max(0, TEPEU_DEATHLINE_CAP - dlCur));
    if (added <= 0) return;
    w.statuses.deathline = dlCur + added;
    engine.log(`🧠 ${tepeuPondering.map((p) => p.name).join(", ")} สมองอันชาญฉลาด — ${w.name} ชนะการจั่วไพ่ ได้เส้นชีวิต +${added} จากเทเปาที่ครุ่นคิด ${tepeuPondering.length} คน (สะสม ${w.statuses.deathline}/${TEPEU_DEATHLINE_CAP})`);
  },

  // เรียกจาก resolveRound() — มีเทเปายังอยู่ในสนาม -> ใครแพ้ติดกันเกิน 3 เทิร์น เส้นชีวิตลดลง 1 หน่วย (แพ้ชนะสลับกันไปมาไม่ลด)
  onRoundLoseStreak(engine, combatants) {
    if (!combatants.some((q) => q.characterId === "tepeu")) return;
    for (const l of combatants.filter((p) => p.isLoser)) {
      l.tepeuLoseStreak = (l.tepeuLoseStreak || 0) + 1;
      if (l.tepeuLoseStreak > TEPEU_LOSE_STREAK_DECAY && (l.statuses.deathline || 0) > 0) {
        l.statuses.deathline--;
        if (l.statuses.deathline <= 0) { delete l.statuses.deathline; if (l.statusAmt) delete l.statusAmt.deathline; }
        engine.log(`📉 ${l.name} แพ้ติดกัน ${l.tepeuLoseStreak} เทิร์น — เส้นชีวิตลดลง 1 หน่วย (เหลือ ${l.statuses.deathline || 0})`);
      }
    }
  },

  // เรียกจาก afterResolve() — นายเป็นคนทำตัวเองนะ: ผลสังหาร/พลาดทำงานหลังเปิดไพ่ทุกคน (ไพ่แตก = สกิลไม่ทำงาน)
  //  หลบหลีกของ Apple guy (ระหว่างชิวๆครับน้องๆ) รอดพ้นความสามารถสังหารทันทีนี้ได้เหมือนกัน
  resolveAllKills(engine) {
    for (const p of engine.alivePlayers()) {
      if (!p.tepeuKillTargetId) continue;
      const t = engine.players[p.tepeuKillTargetId];
      p.tepeuKillTargetId = null;
      if (engine.bustedOf(p)) {
        engine.log(`💥 ${p.name} ไพ่แตก! นายเป็นคนทำตัวเองนะใช้งานไม่ได้ — แต้มสกิลเสียฟรี`);
        continue;
      }
      if (!t || !t.alive) continue;
      if (engine.appleGuyDodgesKill(p, t)) continue;
      this.resolveKill(engine, p, t);
    }
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ — การโจมตีปกติมอบสถานะ "เส้นชีวิต" ให้เป้าหมาย +1 เสมอ (ไม่ต้องติดครุ่นคิดก็ได้)
  grantDeathlineOnAttack(engine, attacker, target) {
    if (attacker.characterId !== "tepeu") return;
    if (engine.resistActive(target)) {
      engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติดเส้นชีวิตเพิ่ม`);
      return;
    }
    const cur = target.statuses.deathline || 0;
    if (cur >= TEPEU_DEATHLINE_CAP) return;
    target.statuses.deathline = cur + 1;
    engine.log(`🍽️ ${attacker.name} การโจมตีปกติ — ${target.name} ติดเส้นชีวิต +1 (สะสม ${target.statuses.deathline}/${TEPEU_DEATHLINE_CAP})`);
  },

  // เรียกจาก dealRound()'s ท้ายเทิร์น — ครุ่นคิด (+แต้มสกิล) / ทำอาหาร (ส่ง "มื้อที่สุข" เข้าคลังเมื่อครบ) / ฉากหลังท่าไม้ตายนับถอยหลัง
  onTurnEndTick(engine) {
    for (const p of engine.alivePlayers()) {
      if ((p.tepeuPonderTurns || 0) > 0) {
        const gain = p.tepeuPonderTurns === 1 ? TEPEU_PONDER_SKILL_GAIN_LAST : TEPEU_PONDER_SKILL_GAIN;
        engine.addSkill(p, gain);
        engine.log(`🤔 ${p.name} ครุ่นคิด — จบเทิร์นได้แต้มสกิลเพิ่ม +${gain}`);
        p.tepeuPonderTurns--;
        if (p.tepeuPonderTurns === 0) delete p.statuses.tepeuPonder;
      }
    }
    for (const p of engine.alivePlayers()) {
      if ((p.tepeuCookTurns || 0) > 0) {
        p.tepeuCookTurns--;
        if (p.tepeuCookTurns === 0) {
          delete p.statuses.tepeuCook;
          p.inventory = p.inventory || [];
          p.inventory.push({ uid: `tepeu_meal_${Date.now()}_${Math.floor(Math.random() * 1e6)}`, type: "tepeuMeal", value: TEPEU_MEAL_HEAL });
          engine.log(`🍲 ${p.name} วันนี้อากาศดีจัง — ทำอาหารเสร็จแล้ว! ได้ "มื้อที่สุข" เข้าคลัง (ฟื้นพลังชีวิต +${TEPEU_MEAL_HEAL} เมื่อใช้)`);
        }
      }
    }
    for (const p of Object.values(engine.players)) {
      if ((p.tepeuEyeTurns || 0) > 0) p.tepeuEyeTurns--;
    }
  },
};
