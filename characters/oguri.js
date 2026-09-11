// ============================================================
//  โอกูริ แคป (Rework) — Breakfast / Training (+บัฟเสริม Flow/Bonus/Sunny Day) / GrayBeast (ร่าง Zone) /
//  Burnout (ร่างหมดแรง) / The Beat of Victory (ท่าไม้ตาย 1) / Ashen Trail: Cinderella Gray (ท่าไม้ตาย 2)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: `oguriGoldStacks`/`oguriChargeCapOf`/`oguriAshenReady`/`oguriAddEnergy`/`oguriAddCharge` ยังอยู่
//  server.js เพราะถูกอ่านจาก shared infra หลายจุด (maxArmorOf, displayImg, buildStateFor, doAttack's shared
//  damage-sum, useSkill's ultimate-selection gate) — เปิดผ่าน engine.oguriGoldStacks(p) ฯลฯ แทน
// ============================================================

const OGURI_CHARGE_GAIN_MIN = 6;   // Stamina ชาร์จ: ได้รับทุกเทิร์น 6-12 หน่วย (สุ่ม) — Rework: เดิม 8-16
const OGURI_CHARGE_GAIN_MAX = 12;
const OGURI_CHARGE_CAP_MAX_BONUS = 48; // Training: เพิ่มความจุได้สูงสุดสะสม +48 (รวมเพดานสูงสุด 100 — engine.oguriChargeCapOf(p) คำนวณเพดานจริง)
const OGURI_GOLD_TURNS = 6;        // ยุคทอง อยู่ 6 เทิร์น (รีเฟรชเมื่อได้แต้มใหม่)
const OGURI_GRAYBEAST_SP_TURNS = 2; // GrayBeast: แต้มสกิล +1 ทุก 2 เทิร์น (Energy +1 ได้ทุกเทิร์น)
const OGURI_BURNOUT_TURNS = 2;     // Burnout: คงอยู่ 2 เทิร์น
const OGURI_BURNOUT_ENERGY_PENALTY = 2; // Burnout: Breakfast ได้ Energy ลดลง -2
const OGURI_BURNOUT_DECAY_TURNS = 2; // Burnout: มอบสถานะผุพัง 2 เทิร์น
const OGURI_BREAKFAST_HEAL = 1;    // Breakfast: ฟื้นเลือด 1
const OGURI_BREAKFAST_ENERGY = 4;  // Breakfast: Energy +4 ปกติ (Burnout ลดเหลือ +2)
const OGURI_TRAIN_ENERGY_COST = 4; // Training: หัก Energy 4
const OGURI_TRAIN_CAP_GAIN_MIN = 3; // Training: เพิ่มความจุ Stamina ชาร์จ 3-7 หน่วย (สุ่ม) — Rework: เดิม 4-8
const OGURI_TRAIN_CAP_GAIN_MAX = 7;
const OGURI_TRAIN_BASE = 0.6;      // โอกาสฝึกฝนสำเร็จพื้นฐาน 60%
const OGURI_TRAIN_BONUS_RATE = 0.8; // บัฟ Bonus ทำงานอยู่: โอกาสสำเร็จเพิ่มเป็น 80%
const OGURI_TRAIN_FAIL_DMG = 1;    // ฝึกฝนล้มเหลว: ดาเมจ 1 หน่วยไม่สนเกราะ
const OGURI_TRAIN_EXTRA_ROLL = 0.25; // ฝึกฝนสำเร็จ: โอกาส 25% ได้บัฟเสริมเพิ่มอีก 1 อัน
const OGURI_TRAIN_FLOW_W = 0.40;   // บัฟเสริม 3 แบบ (สุ่มถ่วงน้ำหนัก): Flow 40%
const OGURI_TRAIN_BONUS_W = 0.40;  // Bonus 40%
const OGURI_TRAIN_SUNNY_W = 0.20;  // Sunny Day 20%
const OGURI_FLOW_TURNS = 3;        // Flow: อยู่ 3 เทิร์น หรือจนกว่าจะถูกโจมตี
const OGURI_FLOW_DODGE = 0.5;      // Flow: โอกาสหลบการโจมตี 50%
const OGURI_BONUS_TURNS = 3;       // Bonus: อยู่ 3 เทิร์น
const OGURI_SUNNY_TURNS = 3;       // Sunny Day: อยู่ 3 เทิร์น
const OGURI_SUNNY_FORTUNE = 1;     // Sunny Day: ได้โชคลาภ +1 ทุกเทิร์นที่มีบัฟนี้
const OGURI_ULT_CHARGE_COST = 35;  // The Beat of Victory: Stamina ชาร์จ 35
const OGURI_ULT_NOREGEN_TURNS = 2; // เป้าหมาย: เกินเยียวยา 2 เทิร์น
const OGURI_ULT_STAGGER_TURNS = 2; // เป้าหมาย: ชะงัก 2 เทิร์น (ฟื้นฟูแต้มสกิลไม่ได้)
const OGURI_ASHEN_DRAWS = 2;       // Ashen Trail: บังคับทุกคนจั่วเพิ่ม 2 ใบ
const OGURI_ASHEN_DMG = 2;         // Ashen Trail: โจมตีทุกคนที่ไพ่แตกหลังเปิดไพ่
const OGURI_ASHEN_CARD_BONUS = 8;  // Ashen Trail: คู่ต่อสู้ทุกคนบวกแต้มการ์ด +8
const OGURI_GOLD_ATK_PER = 1;      // ยุคทอง: พลังโจมตี +1 ทุกๆแต้มที่ติดอยู่บนตัว
const OGURI_GOLD_ATK_CAP = 2;      // ยุคทอง: พลังโจมตีบวกได้ไม่เกิน 2 หน่วย
const OGURI_ULT_ATK_BONUS = 2;     // The Beat of Victory: พลังโจมตี +2

module.exports = {
  id: "oguri",

  // ดาเมจ contribution (ยุคทอง +N สูงสุด 2 / The Beat of Victory +2) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const oguriGoldAtk = Math.min(OGURI_GOLD_ATK_CAP, Math.floor(engine.oguriGoldStacks(attacker) / OGURI_GOLD_ATK_PER));
    const victoryAtk = (attacker.statuses.victorybeat || 0) > 0;
    ctx.oguriGoldAtk = oguriGoldAtk;
    ctx.victoryAtk = victoryAtk;
    return oguriGoldAtk + (victoryAtk ? OGURI_ULT_ATK_BONUS : 0);
  },

  // เรียกจาก dealRound() ต้นเทิร์น — Stamina ชาร์จ / เข้า-ออกร่าง Zone (GrayBeast) / Burnout / Sunny Day
  onRoundStartTick(engine, p) {
    if (p.characterId !== "oguri") return;
    const chargeGain = OGURI_CHARGE_GAIN_MIN + Math.floor(Math.random() * (OGURI_CHARGE_GAIN_MAX - OGURI_CHARGE_GAIN_MIN + 1));
    engine.oguriAddCharge(p, chargeGain);
    engine.log(`🔋 ${p.name} Stamina ชาร์จ +${chargeGain} (${p.stamina}/${engine.oguriChargeCapOf(p)})`);
    // ร่าง Zone ผูกกับยุคทอง: ไม่มียุคทองเหลือ -> ร่าง Zone และ GrayBeast หายไปทันที
    if ((p.statuses.graybeast || 0) > 0 && engine.oguriGoldStacks(p) <= 0) {
      delete p.statuses.graybeast;
      delete p.seen.graybeast;
      p.oguriZoneTurns = 0;
      engine.log(`🐴 ${p.name} ยุคทองหมดลง — ร่าง Zone และ GrayBeast จางหายไป`);
    }
    // ยุคทองครบ 3 -> เข้าสู่ร่าง Zone (คงอยู่ตราบใดที่ยังมียุคทอง)
    if (!((p.statuses.graybeast || 0) > 0) && engine.oguriGoldStacks(p) >= engine.OGURI_GOLD_MAX) {
      p.statuses.graybeast = 1; // ไม่ลดเทิร์น — หายเมื่อยุคทองหมด
      p.seen.graybeast = true;  // ให้เพลง oguri_theme เล่นค้างระหว่างอยู่ร่าง Zone
      p.oguriZoneTurns = 0;
      p.transformAt = engine.nextTransformCounter();
      engine.triggerCutscene(p, "graybeast");
      engine.log(`🐴⚡ ${p.name} ยุคทองครบ ${engine.OGURI_GOLD_MAX} แต้ม — เข้าสู่ร่าง Zone! ได้รับ GrayBeast (Energy +1 ทุกเทิร์น และแต้มสกิล +1 ทุก ${OGURI_GRAYBEAST_SP_TURNS} เทิร์น)`);
    }
    // GrayBeast: Energy +1 ทุกเทิร์น และแต้มสกิล +1 ทุก 2 เทิร์น
    if ((p.statuses.graybeast || 0) > 0) {
      engine.oguriAddEnergy(p, 1);
      p.oguriZoneTurns = (p.oguriZoneTurns || 0) + 1;
      let spMsg = "";
      if (p.oguriZoneTurns >= OGURI_GRAYBEAST_SP_TURNS) {
        p.oguriZoneTurns = 0;
        engine.addSkill(p, 1);
        spMsg = " และแต้มสกิล +1";
      }
      engine.log(`🐴 ${p.name} GrayBeast — Energy +1 (${p.oguriEnergy}/${engine.OGURI_ENERGY_MAX})${spMsg}`);
    }
    // Energy หมด -> เข้าสู่ร่างหมดแรง (Burnout) 2 เทิร์น (Rework: ไม่เช็คยุคทองอีกต่อไป — แม้อยู่ร่าง Zone ก็เข้าได้ถ้า Energy หมด)
    //  บั๊กเดิม: เช็คแค่ Energy<=0 อย่างเดียวทุกต้นเทิร์น ทำให้ตราบใด Energy ยังไม่ฟื้น (ซึ่ง Burnout เองก็ลด Energy ที่ได้จาก Breakfast ด้วย)
    //  จะ set burnout = 2 ทับซ้ำใหม่ทุกเทิร์นไม่มีที่สิ้นสุด ไม่มีวันนับถอยหลังจนครบ 2 เทิร์นแล้วหายไปสักที
    //  แก้โดยเช็คเพิ่มว่ายังไม่ติด Burnout อยู่ก่อน — ถ้าติดอยู่แล้วปล่อยให้นับถอยหลังตามระบบสถานะทั่วไป ไม่ต้อง refresh ซ้ำ
    if ((p.oguriEnergy || 0) <= 0 && !((p.statuses.burnout || 0) > 0)) {
      p.statuses.burnout = OGURI_BURNOUT_TURNS;
      p.statuses.decay = Math.max(p.statuses.decay || 0, OGURI_BURNOUT_DECAY_TURNS);
      engine.log(`🐴💦 ${p.name} Energy หมด — เข้าสู่ร่างหมดแรง (Burnout)! Breakfast ได้ Energy ลดลง -${OGURI_BURNOUT_ENERGY_PENALTY} และติดผุพัง ${OGURI_BURNOUT_DECAY_TURNS} เทิร์น`);
    }
    // Sunny Day: ได้รับโชคลาภ +1 ทุกเทิร์นที่มีบัฟนี้
    if ((p.statuses.sunny || 0) > 0) {
      p.statuses.fortune = Math.min(engine.BARD_FORTUNE_MAX, (p.statuses.fortune || 0) + OGURI_SUNNY_FORTUNE);
      p.fortuneIdle = 0;
      engine.log(`☀️ ${p.name} Sunny Day — ได้รับโชคลาภ +${OGURI_SUNNY_FORTUNE}`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — Breakfast: ฟื้นเลือด + Energy + เต็มอิ่ม คืน flashSuffix
  applyBreakfast(engine, p) {
    const burnoutOn = (p.statuses.burnout || 0) > 0;
    const energyGain = Math.max(0, OGURI_BREAKFAST_ENERGY - (burnoutOn ? OGURI_BURNOUT_ENERGY_PENALTY : 0));
    engine.healHp(p, OGURI_BREAKFAST_HEAL);
    engine.oguriAddEnergy(p, energyGain);
    p.statuses.fullbelly = 1; // สะสมได้ 1 — หมดหลังจบเทิร์นที่กดใช้
    engine.log(`🥖 ${p.name} Breakfast — ฟื้นเลือด +${OGURI_BREAKFAST_HEAL} Energy +${energyGain}${burnoutOn ? " (ลดลงจาก Burnout)" : ""} (${p.oguriEnergy}/${engine.OGURI_ENERGY_MAX}) และเต็มอิ่ม (ดาเมจที่ได้รับ -1 ถึงจบเทิร์น)`);
    return ` — Energy ${p.oguriEnergy}/${engine.OGURI_ENERGY_MAX}`;
  },

  // เรียกจาก useSkill() ในส่วน effect — Training: หัก Energy, เพิ่มความจุ Stamina ชาร์จเสมอ แล้วสุ่มฝึกฝนสำเร็จ/ล้มเหลว คืน flashSuffix
  applyTraining(engine, p) {
    engine.oguriAddEnergy(p, -OGURI_TRAIN_ENERGY_COST);
    const capGain = OGURI_TRAIN_CAP_GAIN_MIN + Math.floor(Math.random() * (OGURI_TRAIN_CAP_GAIN_MAX - OGURI_TRAIN_CAP_GAIN_MIN + 1));
    p.oguriChargeCapBonus = Math.min(OGURI_CHARGE_CAP_MAX_BONUS, (p.oguriChargeCapBonus || 0) + capGain);
    const bonusOn = (p.statuses.trainBonus || 0) > 0;
    const successRate = bonusOn ? OGURI_TRAIN_BONUS_RATE : OGURI_TRAIN_BASE;
    const capMsg = `เพิ่มความจุ Stamina ชาร์จ +${capGain} (${engine.oguriChargeCapOf(p)})`;
    let flashSuffix;
    if (Math.random() < successRate) {
      engine.addSkill(p, 1);
      p.statusAmt = p.statusAmt || {};
      const wasGoldMaxed = (p.statusAmt.goldenera || 0) >= engine.OGURI_GOLD_MAX; // Rework: เต็ม 3 อยู่แล้วก่อนหน้า -> ไม่ต่อเวลาให้อีก กันร่าง Zone ค้างถาวร
      p.statusAmt.goldenera = Math.min(engine.OGURI_GOLD_MAX, (p.statusAmt.goldenera || 0) + 1);
      if (!wasGoldMaxed) p.statuses.goldenera = OGURI_GOLD_TURNS; // รีเฟรชเวลาเฉพาะตอนยังไม่เต็ม 3 (รวมครั้งที่เพิ่งครบ 3 พอดี)
      // ฝึกฝนสำเร็จ: โอกาส 25% ได้บัฟเสริมเพิ่มอีก 1 อัน — Flow 40% / Bonus 40% / Sunny Day 20%
      let extraMsg = "";
      if (Math.random() < OGURI_TRAIN_EXTRA_ROLL) {
        const r = Math.random();
        if (r < OGURI_TRAIN_FLOW_W) {
          p.statuses.flow = OGURI_FLOW_TURNS;
          extraMsg = ` และได้บัฟเสริม Flow (โอกาสหลบการโจมตี ${Math.round(OGURI_FLOW_DODGE * 100)}% — ${OGURI_FLOW_TURNS} เทิร์นหรือจนกว่าจะถูกโจมตี)`;
        } else if (r < OGURI_TRAIN_FLOW_W + OGURI_TRAIN_BONUS_W) {
          p.statuses.trainBonus = OGURI_BONUS_TURNS;
          extraMsg = ` และได้บัฟเสริม Bonus (โอกาสฝึกฝนสำเร็จเพิ่มเป็น ${Math.round(OGURI_TRAIN_BONUS_RATE * 100)}% — ${OGURI_BONUS_TURNS} เทิร์น)`;
        } else {
          p.statuses.sunny = OGURI_SUNNY_TURNS;
          extraMsg = ` และได้บัฟเสริม Sunny Day (โชคลาภ +${OGURI_SUNNY_FORTUNE} ทุกเทิร์น — ${OGURI_SUNNY_TURNS} เทิร์น)`;
        }
      }
      flashSuffix = ` — ฝึกฝนสำเร็จ! ยุคทอง ${p.statusAmt.goldenera}/${engine.OGURI_GOLD_MAX}`;
      engine.log(`🏃 ${p.name} Training — ${capMsg} — ฝึกฝนสำเร็จ! แต้มสกิล +1 และยุคทอง +1 (${p.statusAmt.goldenera}/${engine.OGURI_GOLD_MAX})${extraMsg}`);
    } else {
      engine.dealDirect(p, OGURI_TRAIN_FAIL_DMG);
      engine.maybeBeatSave(p); engine.maybeBeatMode(p);
      flashSuffix = " — ฝึกฝนล้มเหลว!";
      engine.log(`🏃💢 ${p.name} Training — ${capMsg} — ฝึกฝนล้มเหลว! รับดาเมจ -${OGURI_TRAIN_FAIL_DMG} (ไม่สนเกราะ)`);
      if (p.alive && p.hp <= 0) {
        engine.instantDeath(p);
        if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
    engine.triggerCutscene(p, "oguriTrain"); // ครั้งแรกเล่นวีดีโอเต็ม / ครั้งถัดไปแจ้งเตือนเล็กๆ
    if (engine.hasQueuedCutscene()) engine.pausePlayingForCutscene();
    return flashSuffix;
  },

  // เรียกจาก useSkill() ในส่วน effect — The Beat of Victory (ท่าไม้ตาย 1): หัก Stamina ชาร์จ, ผลจริงเกิดตอนโจมตีติด (ดู applyVictoryEffect)
  activateVictory(engine, p) {
    engine.oguriAddCharge(p, -OGURI_ULT_CHARGE_COST);
    engine.log(`🏆 ${p.name} The Beat of Victory — ใช้ Stamina ชาร์จ ${OGURI_ULT_CHARGE_COST} (เหลือ ${p.stamina}/${engine.oguriChargeCapOf(p)}) หากชนะเทิร์นนี้ พลังโจมตี +2 (ซ้อนทับกับยุคทองได้) และเป้าหมายติดเกินเยียวยา+ชะงัก ${OGURI_ULT_STAGGER_TURNS} เทิร์น`);
  },

  // เรียกจาก useSkill() ในส่วน effect — Ashen Trail: Cinderella Gray (ท่าไม้ตาย 2): หัก Stamina ชาร์จ, บังคับทุกคนจั่วเพิ่ม+ห้ามใช้สกิล
  activateAshenTrail(engine, p) {
    engine.oguriAddCharge(p, -engine.OGURI_ULT2_CHARGE_COST);
    p.statuses.ashen = 1; // มีผลถึงจบเทิร์นนี้ (โจมตีทุกคนที่แตกหลังเปิดไพ่ — ดู onAfterResolveAshenTrail)
    p.transformAt = engine.nextTransformCounter();
    const bustedNames = [];
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      for (let i = 0; i < OGURI_ASHEN_DRAWS; i++) {
        const c = engine.drawCardFor(o);
        if (c) { o.cards.push(c); engine.onCardDrawn(o, c); }
      }
      o.cardBonus = (o.cardBonus || 0) + OGURI_ASHEN_CARD_BONUS;
      o.busted = engine.bustedOf(o);
      if (engine.resistActive(o)) engine.log(`🛡️ ${o.name} ต้านสถานะผิดปกติ — ยังใช้สกิลได้ตามปกติ`);
      else o.statuses.noskill = Math.max(o.statuses.noskill || 0, 1); // ห้ามใช้สกิลตลอดเทิร์นนี้
      if (o.busted) {
        o.locked = true;
        engine.voidUltimateOnBust(o);
        bustedNames.push(o.name);
      }
    }
    engine.log(`🐴🔥 ${p.name} Ashen Trail: Cinderella Gray — ใช้ Stamina ชาร์จ ${engine.OGURI_ULT2_CHARGE_COST}! ทุกคนถูกบังคับจั่วเพิ่ม ${OGURI_ASHEN_DRAWS} ใบ บวกแต้มการ์ด +${OGURI_ASHEN_CARD_BONUS} และห้ามใช้สกิลตลอดเทิร์นนี้${bustedNames.length ? ` — ${bustedNames.join(", ")} ไพ่แตก!` : ""}`);
    engine.triggerCutscene(p, "oguriAshen"); // เล่นวีดีโอทันทีก่อนเปิดไพ่
    if (engine.hasQueuedCutscene()) engine.pausePlayingForCutscene();
  },

  // เรียกจาก doAttack() ตอนเลือกเป้าหมาย — Flow: โอกาสหลบการโจมตี 50% ใช้แล้วหมดไปไม่ว่าจะหลบสำเร็จหรือไม่ คืน true ถ้าหลบสำเร็จ (ผู้เรียกต้อง return ทันที)
  tryFlowDodge(engine, attacker, target) {
    if (!(target.characterId === "oguri" && (target.statuses.flow || 0) > 0)) return false;
    delete target.statuses.flow;
    if (Math.random() < OGURI_FLOW_DODGE) {
      target.wasAttacked = true;
      engine.log(`💨 ${target.name} Flow — หลบการโจมตีของ ${attacker.name} ได้!`);
      engine.setLastAttack({
        byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
        targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
        dmg: 0, dodge: true,
        skills: [{ name: "Flow (หลบพ้น)", img: engine.displayImg(target), by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
      });
      engine.runCutsceneQueue(() => {
        engine.setGameState("ATTACKING");
        engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
        engine.broadcastState();
      });
      return true;
    }
    engine.log(`💢 ${target.name} Flow — หลบไม่พ้น`);
    return false;
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจแล้ว — The Beat of Victory: เป้าหมายติดเกินเยียวยา+ชะงัก
  applyVictoryEffect(engine, target) {
    if (!target.alive) return;
    if (engine.resistActive(target)) {
      engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติดเกินเยียวยา/ชะงัก`);
      return;
    }
    target.statuses.nohealing = Math.max(target.statuses.nohealing || 0, OGURI_ULT_NOREGEN_TURNS);
    target.staggerNext = Math.max(target.staggerNext || 0, OGURI_ULT_STAGGER_TURNS);
    engine.log(`🏆 The Beat of Victory! ${target.name} ติดเกินเยียวยา ${OGURI_ULT_NOREGEN_TURNS} เทิร์น และชะงัก ${OGURI_ULT_STAGGER_TURNS} เทิร์น (ฟื้นฟูแต้มสกิลไม่ได้)`);
  },

  // เรียกจาก afterResolve() หลังเปิดไพ่ทุกคนแล้ว — Ashen Trail: โจมตีทุกคนที่ไพ่แตก
  onAfterResolveAshenTrail(engine) {
    for (const p of engine.alivePlayers()) {
      if (p.characterId !== "oguri" || !((p.statuses.ashen || 0) > 0)) continue;
      if (engine.bustedOf(p)) {
        engine.log(`💥 ${p.name} ไพ่แตกเอง! Ashen Trail ไม่ไล่โจมตีต่อ`);
        continue;
      }
      const hits = engine.alivePlayers().filter((o) => o.id !== p.id && engine.bustedOf(o));
      for (const o of hits) {
        engine.dealMixed(o, OGURI_ASHEN_DMG);
        engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeWakeKotone(o);
        o.wasAttacked = true;
        if (o.alive && o.hp <= 0) { engine.instantDeath(o); if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`); }
      }
      if (hits.length) engine.log(`🐴🔥 Ashen Trail! ${p.name} ควบทะยานเหยียบทุกคนที่ไพ่แตก — ${hits.map((o) => o.name).join(", ")} รับความเสียหาย -${OGURI_ASHEN_DMG}`);
      else engine.log(`🐴 Ashen Trail — ไม่มีใครไพ่แตก การไล่ล่าจบลงอย่างว่างเปล่า`);
    }
  },
};
