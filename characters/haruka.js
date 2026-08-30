// ============================================================
//  มิซึซาว่า ฮารุกะ (patch 2.5 new) — ไข่ต้ม และอาหารเสริม / amazon punish / New Omega
//  + สกิลติดตัว "อมาซอน"
//
//  แกนกลางของตัวละครคือสถานะ Universal ตัวใหม่ "เลือดไหล" (hbleed — ดู characters/_universal_status.js)
//    · ฝั่งรุก: ท่าไม้ตาย "โอเมก้า" ทำให้การโจมตีปกติแปะเลือดไหลให้เป้าหมายทีละ 3 หน่วย
//              แล้วสกิลรอง "จงไปสู่สุขติ" จุดชนวนให้ระเบิดออกมาทั้งกองในหมัดเดียว (ต้องสะสมครบ 3 หน่วยก่อน)
//    · ฝั่งรับ: ฮารุกะไม่เจ็บจากเลือดไหล กลับฟื้นพลังชีวิตแทน — และยิ่งเกราะแตกยิ่งเลือดไหลเอง (สูงสุด 3/เทิร์น)
//              จึงเป็นตัวละครที่ "ยิ่งโดนตียิ่งฟื้น" ตราบใดที่ยังไม่มีเกราะ
//
//  ลำดับที่ต้องระวังใน doAttack(): อ่านเลือดไหลของเป้าหมายเพื่อคิดระเบิด (applyPunish) ต้องมา "ก่อน"
//  การแปะเลือดไหลก้อนใหม่จากโอเมก้า (onAttackLanded) ไม่งั้นหมัดเดียวจะแปะแล้วระเบิดทันทีในตัวเอง
// ============================================================

const ID = "haruka";

// ---------- ไข่ต้ม และอาหารเสริม (สกิลพื้นฐาน) ----------
const BASIC_USES_PER_TURN = 2;   // กดได้ 2 ครั้งต่อเทิร์น — ไม่นับเป็นการใช้สกิลของเทิร์น (ยังเหลือสิทธิ์ใช้สกิลอื่นอีก 1 ครั้ง)
const BASIC_HEAL_HP = 2;         // ผลที่ 1: ฟื้นพลังชีวิต 2 หน่วย (35%)
const BASIC_HEAL_ARMOR = 2;      // ผลที่ 2: ฟื้นเกราะ 2 หน่วย (35%)
const BASIC_HEAL_SKILL = 3;      // ผลที่ 3: ฟื้นแต้มสกิล 3 หน่วย (30%)
const BASIC_ROLL_HP = 35;        // % สะสม: 0-34 = เลือด · 35-69 = เกราะ · 70-99 = แต้มสกิล
const BASIC_ROLL_ARMOR = 70;

// ---------- amazon punish (สกิลรอง) ----------
const PUNISH_TURNS = 3;          // "จงไปสู่สุขติ" ทำงานได้ตลอด 3 เทิร์น
//  patch 2.8.1: เดิมระเบิดครั้งเดียวแล้วสถานะหาย — ตอนนี้อยู่ครบ 3 เทิร์น จุดชนวนได้ทุกหมัดที่เข้าเกณฑ์
const PUNISH_BLEED_NEED = 3;     // เป้าหมายต้องมีเลือดไหลอย่างน้อย 3 หน่วยถึงจะระเบิด

// ---------- New Omega (ท่าไม้ตาย) ----------
const OMEGA_TURNS = 10;          // patch 2.8.1: 5 -> 10 เทิร์น
// "ระเบิดแต้มการ์ด" — ทำงาน 1 ครั้งต่อการกดท่าไม้ตาย 1 ครั้ง (กดใหม่ = ระเบิดใหม่ ไม่ใช่ทุกเทิร์นที่โอเมก้าติดอยู่)
//  บังคับให้ผู้เล่นทุกคน "ยกเว้นฮารุกะ" ไพ่แตกทันทีในเทิร์นนั้น ต่อให้เปิดไพ่ไปแล้วก็ตาม
//  แต่ยกเว้นความเสียหายจากการไพ่แตกให้ (เอฟเฟกต์ตัวละครอื่นที่เกาะกับ "คนไพ่แตก" ยังทำงานตามปกติ)
const OMEGA_BLEED_ON_ATK = 3;    // ระหว่างโอเมก้า: โจมตีปกติแปะเลือดไหลให้เป้าหมาย 3 หน่วย
//  หมายเหตุ: โอเมก้า "ไม่" เพิ่มพลังโจมตีปกติแล้ว (patch 2.5.1) — จุดแข็งทั้งหมดไปอยู่ที่การสะสมเลือดไหลแทน
//  3 หน่วยต่อหมัดแปลว่าตีหมัดเดียวก็ถึงเกณฑ์ระเบิดของ amazon punish (PUNISH_BLEED_NEED) พอดี

// ---------- สกิลติดตัว อมาซอน ----------
const SELF_BLEED_PER_TURN = 3;   // ไม่มีเกราะแล้วโดนดาเมจ -> เลือดไหลตัวเอง +1 (สูงสุด 3 ครั้ง/เทิร์น)
const SELF_BLEED_AMOUNT = 1;
const COUNTER_CHANCE = 0.15;     // โดนโจมตีปกติ -> 15% ตีคืน (เฉพาะระหว่างโอเมก้าทำงาน)
const COUNTER_DMG = 1;
const COUNTER_STUN_TURNS = 1;    // ผู้โจมตีติดสตั้น 1 เทิร์น โดยเริ่มมีผล "เทิร์นถัดไป"
const COUNTER_BLEED = 2;         // ผู้โจมตีติด "เลือดไหล" 2 หน่วยจากการสวนกลับด้วย

const IMG = {
  base: "/characters/haruka/haruka.webp",
  ult: "/characters/haruka/new_omega.jpg",
  skill1: "/characters/haruka/skill1/haruka_skill1.jpg",
  skill2: "/characters/haruka/skill2/haruka_skill2.jpg",
  skill3: "/characters/haruka/skill3/haruka_skill3.webp",
};

function isHaruka(p) { return !!p && p.characterId === ID; }
function omegaOn(p) { return isHaruka(p) && ((p.statuses && p.statuses.harukaOmega) || 0) > 0; }
function punishOn(p) { return isHaruka(p) && ((p.statuses && p.statuses.harukaPunish) || 0) > 0; }
function bleedOf(p) { return (p && p.statuses && p.statuses.hbleed) || 0; }

module.exports = {
  id: ID,
  IMG,
  BASIC_USES_PER_TURN,
  OMEGA_TURNS,
  PUNISH_TURNS,
  PUNISH_BLEED_NEED,
  OMEGA_BLEED_ON_ATK,

  // ภาพประจำตัวระหว่างท่าไม้ตายทำงาน (null = ใช้ภาพปกติ) — เรียกจาก displayImg()
  displayImg(p) { return omegaOn(p) ? IMG.ult : null; },
  omegaActive: omegaOn,
  punishActive: punishOn,

  // ---------- สถานะ "เลือดไหล" ฝั่งฮารุกะ (ฮุคของ _universal_status.js) ----------
  //  ไม่มีผลเสียกับเธอเลย: ติกรายเทิร์นกลายเป็นการฟื้นพลังชีวิต และไม่โดนผลลดการฟื้นเลือดครึ่งหนึ่ง
  hbleedHeals(p) { return isHaruka(p); },
  hbleedHarmless(p) { return isHaruka(p); },
  hbleedLabel(p) { return isHaruka(p) ? "อมาซอน" : null; },

  // ---------- เงื่อนไขการกด — เรียกจาก useSkill() ก่อนหักแต้ม ----------
  canUseSkill(engine, p, tier) {
    if (tier === "basic") return (p.harukaBasicUses || 0) < BASIC_USES_PER_TURN;
    if (tier === "secondary") {
      if (punishOn(p)) return false;   // "จงไปสู่สุขติ" ยังค้างรอจังหวะอยู่ = กดซ้ำไม่ได้
      return omegaOn(p);               // ต้องมีสถานะ "โอเมก้า" เท่านั้น
    }
    // patch 2.8.1: กดท่าไม้ตายซ้ำได้แม้ "โอเมก้า" ยังทำงานอยู่ — เพราะการระเบิดแต้มการ์ดผูกกับ
    //  "การกด 1 ครั้ง" ไม่ใช่ "ระหว่างที่โอเมก้าติดอยู่" ถ้ายังล็อกไว้เหมือนเดิมจะระเบิดซ้ำไม่ได้เลยตลอด 10 เทิร์น
    //  (กดซ้ำ = ต่ออายุโอเมก้าเป็น 10 เทิร์นใหม่ + ระเบิดแต้มการ์ดอีกครั้ง โดยจ่ายค่าสกิลเต็มทุกครั้ง)
    if (tier === "ultimate") return true;
    return true;
  },

  // ---------- ผลของสกิลที่ทำงานทันที (instant) — เรียกจาก useSkill() ในส่วน effect ----------
  applyInstantSkill(engine, p, tier) {
    if (tier === "basic") return this.applyMeal(engine, p);
    if (tier === "secondary") return this.applyPunishBuff(engine, p);
    if (tier === "ultimate") return this.applyOmega(engine, p);
    return "";
  },

  // ไข่ต้ม และอาหารเสริม: สุ่มฟื้นฟู 1 อย่างจาก 3 อย่าง (35/35/30)
  applyMeal(engine, p) {
    p.harukaBasicUses = (p.harukaBasicUses || 0) + 1;
    const left = Math.max(0, BASIC_USES_PER_TURN - p.harukaBasicUses);
    const roll = Math.random() * 100;
    const tail = ` (เหลือกดได้อีก ${left} ครั้งในเทิร์นนี้)`;
    if (roll < BASIC_ROLL_HP) {
      const heal = engine.healHp(p, BASIC_HEAL_HP);
      engine.log(`🥚 ${p.name} ไข่ต้ม และอาหารเสริม — ฟื้นพลังชีวิต +${heal}${tail}`);
      return ` — พลังชีวิต +${heal}`;
    }
    if (roll < BASIC_ROLL_ARMOR) {
      const armor = engine.healArmor(p, BASIC_HEAL_ARMOR);
      engine.log(`🥚 ${p.name} ไข่ต้ม และอาหารเสริม — ฟื้นเกราะ +${armor}${tail}`);
      return ` — เกราะ +${armor}`;
    }
    const before = p.skillPoints;
    engine.addSkill(p, BASIC_HEAL_SKILL, "passive");
    engine.log(`🥚 ${p.name} ไข่ต้ม และอาหารเสริม — ฟื้นแต้มสกิล +${p.skillPoints - before}${tail}`);
    return ` — แต้มสกิล +${p.skillPoints - before}`;
  },

  // amazon punish: ติดสถานะ "จงไปสู่สุขติ" ค้างไว้ รอจังหวะโจมตีปกติที่เป้าหมายเลือดไหลครบ 3 หน่วย
  applyPunishBuff(engine, p) {
    p.statuses.harukaPunish = PUNISH_TURNS;
    engine.log(`⚖️ ${p.name} amazon punish — ได้สถานะ "จงไปสู่สุขติ" ${PUNISH_TURNS} เทิร์น: การโจมตีปกติครั้งถัดไปจะจุดชนวน "เลือดไหล" ${PUNISH_BLEED_NEED} หน่วยขึ้นไปของเป้าหมายให้ระเบิดทั้งหมด`);
    return " — จงไปสู่สุขติ";
  },

  // New Omega: แปลงร่าง 10 เทิร์น — โจมตีปกติแปะเลือดไหล 3 หน่วย (ไม่มีโบนัสพลังโจมตีแล้ว)
  //  + ระเบิดแต้มการ์ด 1 ครั้งต่อการกด: ทุกคนยกเว้นฮารุกะไพ่แตกทันที (ไม่รับความเสียหายจากการแตก)
  applyOmega(engine, p) {
    this.detonateCards(engine, p);
    p.statuses.harukaOmega = OMEGA_TURNS;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "harukaOmega"); // haruka_skill3.mp4
    engine.log(`🦾 ${p.name} New Omega — เข้าสู่สถานะ "โอเมก้า" ${OMEGA_TURNS} เทิร์น: การโจมตีปกติมอบ "เลือดไหล" ${OMEGA_BLEED_ON_ATK} หน่วยให้เป้าหมายทุกครั้ง`);
    return " — โอเมก้า";
  },

  // ---------- สกิลติดตัว อมาซอน (1): ไม่มีเกราะแล้วโดนดาเมจ = เลือดไหลตัวเอง ----------
  //  เรียกจากท่อดาเมจกลางทุกเส้น (adjustIncomingDamage + damageSoft) จึงครอบคลุม "ความเสียหายไม่ว่าจะทางใด"
  //  เช็คเกราะ ณ ตอนที่ดาเมจกำลังจะลง (ก่อนหักจริง) — มีเกราะเหลืออยู่ = ก้อนนี้กินเกราะ ไม่นับว่าเลือดไหล
  onDamaged(engine, p) {
    if (!isHaruka(p) || !p.alive) return false;
    if ((p.armor || 0) > 0 || (p.shield || 0) > 0) return false;
    if ((p.harukaBleedProcs || 0) >= SELF_BLEED_PER_TURN) return false;
    const got = engine.applyBleed(p, SELF_BLEED_AMOUNT);
    if (!got) return false;
    p.harukaBleedProcs = (p.harukaBleedProcs || 0) + 1;
    engine.log(`🩸 ${p.name} อมาซอน — เกราะแตกแล้วยังโดนซ้ำ ติด "เลือดไหล" +${got} (รวม ${bleedOf(p)} · ครั้งที่ ${p.harukaBleedProcs}/${SELF_BLEED_PER_TURN} ของเทิร์นนี้)`);
    return true;
  },

  // ท่อดาเมจกลาง (dealMixed/dealDirect/dealArmorOnly + ปืน/สกิล/ดีบัฟ) เรียกผ่านตัวนี้ทุกเส้น
  //  ไม่ปรับตัวเลขดาเมจ — ใช้เป็นจุดดักว่า "ฮารุกะกำลังจะโดนดาเมจตอนไม่มีเกราะ" เท่านั้น
  //  (ดาเมจแพ้จั่วเดินผ่าน damageSoft ซึ่งไม่เรียกฟังก์ชันนี้ — server.js เรียก onDamaged ให้เองที่นั่น)
  adjustIncomingDamage(engine, p, n) {
    if (n > 0) this.onDamaged(engine, p);
    return n;
  },

  // ---------- สกิลติดตัว อมาซอน (2): ตีคืน 15% ระหว่างโอเมก้า (+ สตั้นเทิร์นหน้า + เลือดไหล 2) ----------
  //  เรียกจาก doAttack() หลังความเสียหายลงตัวฮารุกะแล้ว — คืน { dmg, videoQueued } ให้ผู้เรียกเอาไปทำป้ายสรุป
  //  วีดีโอถูก "คิว" ไว้ (ไม่ triggerCutscene ทันที) เพื่อให้ doAttack เล่นคลิปก่อนแล้วค่อยขึ้นสรุปความเสียหาย
  tryCounter(engine, attacker, target) {
    if (!isHaruka(target) || !target.alive || !attacker || !attacker.alive) return null;
    if (attacker.id === target.id) return null;
    if (!omegaOn(target)) return null;              // ทำงานเฉพาะตอนท่าไม้ตายทำงานอยู่
    if (engine.passiveSealed(target)) return null;
    if (engine.sameTeam(target, attacker)) return null;
    if (Math.random() >= COUNTER_CHANCE) return null;

    engine.queueCutscene(target, "harukaCounter"); // haruka_passive.mp4 เล่นก่อนสรุปความเสียหาย
    engine.withEffectSource(target, () => {
      engine.dealMixed(attacker, COUNTER_DMG);
      attacker.wasAttacked = true;
      engine.maybeBeatSave(attacker); engine.maybeBeatMode(attacker); engine.maybeEva3(attacker); engine.maybeWakeKotone(attacker);
    });
    engine.log(`🦿 ${target.name} อมาซอน — สวนกลับ ${attacker.name} ทันที -${COUNTER_DMG}`);
    if (attacker.alive && attacker.hp <= 0) {
      engine.instantDeath(attacker);
      if (!attacker.alive) engine.log(`💀 ${attacker.name} เลือดจริงหมด ตกรอบ!`);
    }
    // สตั้นเริ่มมีผล "เทิร์นถัดไป" — ตั้งธงไว้ให้ dealRound() แปลงเป็นสถานะจริง (แพทเทิร์นเดียวกับ Gargorgon Ray)
    //  ส่วน "เลือดไหล" ติดทันทีในเทิร์นนี้ (ผ่าน applyBleed จึงโดนต้านสถานะผิดปกติกันได้ตามปกติ)
    let stunned = false;
    let bled = 0;
    if (attacker.alive) {
      attacker.harukaStunPending = COUNTER_STUN_TURNS;
      stunned = true;
      engine.log(`🌑 ${attacker.name} โดนสวนกลับ — เทิร์นถัดไปจะติดสถานะสตั้น ${COUNTER_STUN_TURNS} เทิร์น`);
      bled = engine.applyBleed(attacker, COUNTER_BLEED);
      if (bled > 0) engine.log(`🩸 ${attacker.name} โดนสวนกลับ — ติด "เลือดไหล" +${bled} (รวม ${bleedOf(attacker)} หน่วย)`);
      else engine.log(`🩸 ${attacker.name} ต้านสถานะผิดปกติ/เลือดไหลเต็มเพดาน — "เลือดไหล" จากการสวนกลับไม่ติด`);
    }
    return { dmg: COUNTER_DMG, stunned, bled, videoQueued: true };
  },

  // ---------- amazon punish: จุดชนวนเลือดไหลของเป้าหมาย ----------
  //  เรียกจาก doAttack() หลังคิดดาเมจสุทธิแล้ว แต่ "ก่อน" ลงความเสียหายจริง — คืนดาเมจใหม่
  //  ctx.videoQueued = true เมื่อระเบิดสำเร็จ เพื่อให้ doAttack เล่น haruka_skill2.mp4 ก่อนขึ้นสรุปความเสียหาย
  //  เป้าหมายเลือดไหลไม่ถึง 3 หน่วย = ไม่เกิดอะไรเลย และ "จงไปสู่สุขติ" ยังไม่ถูกใช้ (รอหมัดหน้า)
  applyPunish(engine, attacker, target, dmg, ctx) {
    if (!isHaruka(attacker) || !punishOn(attacker) || !target) return dmg;
    const stacks = bleedOf(target);
    if (stacks < PUNISH_BLEED_NEED) {
      engine.log(`⚖️ ${attacker.name} จงไปสู่สุขติ — ${target.name} มี "เลือดไหล" ${stacks}/${PUNISH_BLEED_NEED} หน่วย ยังไม่ถึงเกณฑ์ระเบิด (สถานะยังคงอยู่)`);
      return dmg;
    }
    // patch 2.8.1: ไม่ลบ harukaPunish ทิ้งแล้ว — สถานะอยู่ครบ PUNISH_TURNS เทิร์น จุดชนวนซ้ำได้ทุกหมัดที่เข้าเกณฑ์
    //  (เลือดไหลของเป้าหมายยังถูกล้างทุกครั้งที่ระเบิด จึงต้องสะสมใหม่ให้ครบ 3 หน่วยก่อนถึงจะระเบิดได้อีก)
    delete target.statuses.hbleed;
    if (target.statusAmt) delete target.statusAmt.hbleed;
    engine.queueCutscene(attacker, "harukaPunish"); // haruka_skill2.mp4 เล่นก่อนสรุปความเสียหาย
    if (ctx) ctx.videoQueued = true;
    engine.log(`⚖️💥 ${attacker.name} จงไปสู่สุขติ — จุดชนวน "เลือดไหล" ${stacks} หน่วยของ ${target.name} ให้ระเบิดพร้อมการโจมตีปกติ: ${dmg} + ${stacks} = ${dmg + stacks} หน่วย (ล้างเลือดไหลทั้งหมด)`);
    if (ctx) ctx.punishStacks = stacks;
    return dmg + stacks;
  },

  // ---------- New Omega: ระเบิดแต้มการ์ด (1 ครั้งต่อการกดท่าไม้ตาย) ----------
  //  ตั้งธง p.harukaBurst ให้ทุกคนยกเว้นฮารุกะ -> bustedOf() คืน true ทันทีต่อให้เปิดไพ่ไปแล้ว
  //  ธงถูกล้างตอนเริ่มเทิร์นถัดไป (clearBurst) จึงมีผลแค่เทิร์นที่กด — กดใหม่ถึงจะระเบิดอีกครั้ง
  //  โหมดทีม: ไม่ลงเพื่อนร่วมทีมตัวเอง (คอนเวนชันเดียวกับเอฟเฟกต์ด้านลบตัวอื่น)
  detonateCards(engine, p) {
    let n = 0;
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      if (engine.withEffectSource(p, () => engine.friendlyEffectBlocked(o))) continue;
      o.harukaBurst = true;
      o.busted = true;
      n++;
    }
    if (n > 0) engine.log(`💥 ${p.name} New Omega — ระเบิดแต้มการ์ดของผู้เล่นอีก ${n} คนให้แตกทันที (ต่อให้เปิดไพ่ไปแล้ว) แต่ไม่มีใครรับความเสียหายจากการไพ่แตกครั้งนี้`);
    return n;
  },

  // bustedOf() เรียกเช็คทุกครั้ง — ธงนี้ทับผลการคิดแต้มจริงทั้งหมด
  forcedBust(p) { return !!(p && p.harukaBurst); },

  // ยกเว้น "ความเสียหายจากการไพ่แตก" ให้คนที่โดนบังคับแตก — เรียกจาก resolveRound()
  //  (เอฟเฟกต์ตัวละครอื่นที่เกาะกับคนไพ่แตก เช่น Ashen Trail / ครูฝึกสุดเหี้ยม ยังทำงานตามปกติ)
  bustDamageImmune(p) { return !!(p && p.harukaBurst); },

  // ล้างธงตอนเริ่มเทิร์นใหม่ — เรียกให้ผู้เล่น "ทุกคน" ในลูปต้นเทิร์นของ startRound()
  clearBurst(p) { if (p) p.harukaBurst = false; },

  // ---------- โอเมก้า: การโจมตีปกติแปะเลือดไหลให้เป้าหมาย ----------
  //  เรียกจาก doAttack() "หลัง" ความเสียหายลงแล้ว (และหลัง applyPunish อ่านค่าไปแล้ว)
  onAttackLanded(engine, attacker, target) {
    if (!isHaruka(attacker) || !omegaOn(attacker)) return 0;
    if (!target || !target.alive) return 0;
    const got = engine.applyBleed(target, OMEGA_BLEED_ON_ATK);
    if (!got) {
      engine.log(`🩸 ${target.name} ต้านสถานะผิดปกติ/เลือดไหลเต็มเพดาน — "เลือดไหล" จากโอเมก้าไม่ติด`);
      return 0;
    }
    engine.log(`🩸 ${attacker.name} โอเมก้า — ${target.name} ติด "เลือดไหล" +${got} (รวม ${bleedOf(target)} หน่วย)`);
    return got;
  },

  // ---------- ต้นเทิร์น — เรียกจาก dealRound() ----------
  onRoundStartTick(engine, p) {
    p.harukaBasicUses = 0;   // โควตาสกิลพื้นฐาน 2 ครั้ง เต็มใหม่ทุกเทิร์น
    p.harukaBleedProcs = 0;  // โควตาเลือดไหลจากสกิลติดตัว 3 ครั้ง เต็มใหม่ทุกเทิร์น
  },

  // ---------- ฟิลด์ที่ต้องรีเซ็ตทุกแมตช์ — เรียกจาก resetCombat() ----------
  resetCombat(p) {
    p.harukaBurst = false;      // โดนระเบิดแต้มการ์ดของ New Omega ในเทิร์นนี้ (บังคับไพ่แตก ไม่รับดาเมจจากการแตก)
    p.harukaBasicUses = 0;      // ไข่ต้ม และอาหารเสริม: กดไปแล้วกี่ครั้งในเทิร์นนี้ (0-2)
    p.harukaBleedProcs = 0;     // อมาซอน: เลือดไหลตัวเองไปแล้วกี่ครั้งในเทิร์นนี้ (0-3)
    p.harukaStunPending = 0;    // อมาซอน (ตีคืน): จำนวนเทิร์นสตั้นที่จะลงในเทิร์นถัดไป (ของ "ผู้โจมตี" ไม่ใช่ของฮารุกะ)
  },
};
