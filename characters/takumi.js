// ============================================================
//  ทาคุมิ ฟุจิวาระ (takumi) — เกียร์ธรรมดา (ดาเมจโบนัส+ฮีลตอนลงเกียร์กลับ 1) /
//  ขึ้นเกียร์ / ลงเกียร์ / ถึงจะมองไม่เห็น แต่ฉันยังอยู่ (ท่าไม้ตาย — บังตากระดานทั้งหมด)
//  ดู characters/index.js สำหรับไฟล์มัดรวม, server.js's useSkill()/buildStateFor()/afterResolve() สำหรับจุดเรียก
//  หมายเหตุ: งบสกิลรวม 5 ครั้ง/เทิร์น (p.takumiSkillUsesRound) ก็อปแพทเทิร์นของไค (kaiSkillUsesRound) ตรงๆ
//  แค่ขยายให้ครอบคลุมท่าไม้ตายด้วยและเพดานเปลี่ยนเป็น 5 — จัดการที่ server.js's useSkill() โดยตรง ไม่ใช่ในไฟล์นี้
// ============================================================

const TAKUMI_GEAR_MAX = 6;
const TAKUMI_GEAR_MIN = 1;
const TAKUMI_GEAR_ATK3 = 1;  // เกียร์ >= 3: ดาเมจ +1
const TAKUMI_GEAR_ATK6 = 1;  // เกียร์ >= 6: ดาเมจ +1 เพิ่มอีก (รวม +2 ที่เกียร์ 6)
const TAKUMI_GEARDOWN_HEAL_CAP = 4; // ลงเกียร์กลับมาที่ 1 พอดี: ฮีลสูงสุด 4 (คิดจากเกียร์ก่อนกดครั้งนี้ - 1)
const TAKUMI_BLACKOUT_TURNS = 3;    // ถึงจะมองไม่เห็น แต่ฉันยังอยู่: คงอยู่ 3 เทิร์น (หรือจนกว่าจะมีคนไพ่แตก)
const TAKUMI_BLACKOUT_DMG = 3;      // ทริกเกอร์: คนแรกที่ไพ่แตก โดนดาเมจ 3 หน่วย (เจาะเกราะก่อน)
const TAKUMI_BLACKOUT_DECAY_TURNS = 3; // ทริกเกอร์: เป้าหมายติดผุพัง 3 เทิร์น

module.exports = {
  id: "takumi",

  // ดาเมจ contribution (เกียร์ >= 3 -> +1, เกียร์ >= 6 -> +1 เพิ่มอีก รวม +2) — เรียกจาก computeAttackBase()
  //  คำนวณสดจาก p.takumiGear ตรงๆ ไม่ใช่ status ที่มีอายุ
  damageBonus(engine, attacker) {
    if (attacker.characterId !== "takumi") return 0;
    const gear = attacker.takumiGear || TAKUMI_GEAR_MIN;
    let bonus = 0;
    if (gear >= 3) bonus += TAKUMI_GEAR_ATK3;
    if (gear >= 6) bonus += TAKUMI_GEAR_ATK6;
    return bonus;
  },

  // เรียกจาก useSkill() ในส่วน effect — สกิลพื้นฐาน "ขึ้นเกียร์"
  applyGearUp(engine, p) {
    const before = p.takumiGear || TAKUMI_GEAR_MIN;
    p.takumiGear = Math.min(TAKUMI_GEAR_MAX, before + 1);
    engine.log(`⚙️⬆️ ${p.name} ขึ้นเกียร์ — เกียร์ ${before} → ${p.takumiGear}${p.takumiGear === before ? " (เต็มแล้ว)" : ""}`);
    return ` — เกียร์ ${p.takumiGear}`;
  },

  // เรียกจาก useSkill() ในส่วน effect — สกิลรอง "ลงเกียร์" (ตกที่ 1 พอดี = ฮีลตามสูตร คิดจากเกียร์ก่อนกดครั้งนี้เท่านั้น)
  applyGearDown(engine, p) {
    const before = p.takumiGear || TAKUMI_GEAR_MIN;
    p.takumiGear = Math.max(TAKUMI_GEAR_MIN, before - 1);
    if (p.takumiGear === TAKUMI_GEAR_MIN && before > TAKUMI_GEAR_MIN) {
      const heal = engine.healHp(p, Math.min(TAKUMI_GEARDOWN_HEAL_CAP, before - 1));
      engine.log(`⚙️❤️ ${p.name} ลงเกียร์ — เกียร์ ${before} → 1 (กลับมาที่ 1 พอดี) ฟื้นพลังชีวิต +${heal}`);
      return ` — เกียร์ 1 (ฟื้น +${heal})`;
    }
    engine.log(`⚙️⬇️ ${p.name} ลงเกียร์ — เกียร์ ${before} → ${p.takumiGear}${p.takumiGear === before ? " (ต่ำสุดแล้ว)" : ""}`);
    return ` — เกียร์ ${p.takumiGear}`;
  },

  // เรียกจาก useSkill() ในส่วน effect — ท่าไม้ตาย "ถึงจะมองไม่เห็น แต่ฉันยังอยู่": บังตากระดานทั้งหมด 3 เทิร์น
  activateBlackout(engine, p) {
    p.statuses.takumiBlackout = TAKUMI_BLACKOUT_TURNS;
    p.takumiBlackoutFired = false;
    p.transformAt = engine.nextTransformCounter(); // ตัดสินลำดับเพลง forever.mp3 (เผื่อมีทาคุมิหลายคน)
    engine.triggerCutscene(p, "takumiBlackoutStart");
    engine.log(`🌑 ${p.name} ถึงจะมองไม่เห็น แต่ฉันยังอยู่ — บังตากระดานทั้งหมด ${TAKUMI_BLACKOUT_TURNS} เทิร์น (หรือจนกว่าจะมีคนไพ่แตก)`);
  },

  // บังตากระดานกำลังทำงานอยู่ไหม (มีใครติด takumiBlackout อยู่บ้างไหม) — แบบเดียวกับ moonCellActive()
  isBlackoutActive(engine) {
    return engine.takumiBlackoutActive();
  },

  // เรียกจาก afterResolve() (หลังผลแพ้/ชนะ/ดาเมจปกติของรอบเกิดก่อนแล้ว) — คนแรกที่ไพ่แตกระหว่างบัฟยังทำงาน
  //  (เรียงตามลำดับที่นั่ง — เอาแค่คนแรก) โดนดาเมจ 3 หน่วย (เจาะเกราะก่อน) + ผุพัง 3 เทิร์น แล้วจบสถานะทันที
  tryBustTrigger(engine) {
    const takumis = engine.alivePlayers().filter(
      (p) => p.characterId === "takumi" && (p.statuses.takumiBlackout || 0) > 0 && !p.takumiBlackoutFired
    );
    if (!takumis.length) return;
    const seated = Object.values(engine.players || {}).filter((p) => p.alive).sort((a, b) => a.position - b.position);
    const target = seated.find((p) => engine.bustedOf(p));
    if (!target) return;
    for (const takumi of takumis) {
      takumi.takumiBlackoutFired = true;
      engine.queueCutscene(takumi, "takumiBlackoutBust");
      if (target.alive) {
        engine.dealMixed(target, TAKUMI_BLACKOUT_DMG, true);
        engine.maybeBeatSave(target); engine.maybeBeatMode(target); engine.maybeWakeKotone(target);
        target.wasAttacked = true;
        if (target.alive && target.hp <= 0) {
          engine.instantDeath(target);
          if (!target.alive) engine.log(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
        }
        if (target.alive) {
          if (engine.applyDebuff(target, "decay", null, TAKUMI_BLACKOUT_DECAY_TURNS)) {
            engine.log(`🌑💥 ${takumi.name} ถึงจะมองไม่เห็น แต่ฉันยังอยู่ — ${target.name} ไพ่แตกก่อนใคร! รับดาเมจ -${TAKUMI_BLACKOUT_DMG} (เจาะเกราะก่อน) และติดผุพัง ${TAKUMI_BLACKOUT_DECAY_TURNS} เทิร์น`);
          } else {
            engine.log(`🌑🛡️ ${takumi.name} ถึงจะมองไม่เห็น แต่ฉันยังอยู่ — ${target.name} รับดาเมจ -${TAKUMI_BLACKOUT_DMG} แต่ต้านสถานะผิดปกติ ไม่ติดผุพัง`);
          }
        }
      }
      delete takumi.statuses.takumiBlackout;
      if (takumi.statusAmt) delete takumi.statusAmt.takumiBlackout;
      engine.log(`🌑 ${takumi.name} บังตากระดานสิ้นสุดลง — กลับมามองเห็นกันได้ตามปกติ`);
    }
  },
};
