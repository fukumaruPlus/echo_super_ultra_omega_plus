// ============================================================
//  เอจิ (patch 2.4 new) — ว่องไว / ความแค้น / ไม่ว่ายังก็ตาม
//  + สกิลติดตัว 1 ผู้เล่นอันดับ 2 · 2 ฉันอยากเจอเธออีก · 3 กลโกง Ordinal Scale
//
//  แกนกลางของตัวละครคือ "อัตราหลบหลีก" ที่ซ้อนทับได้จาก 3 แหล่ง (ดู dodgeChance)
//    ว่องไว (eijiSwift)  +20%   · ไม่ว่ายังก็ตาม (eijiUlt) +20%  · Ordinal Scale +20% ต่อสแตค (สูงสุด 5)
//  "หลบสำเร็จ" ได้ 1 ครั้งต่อเทิร์นเท่านั้น (p.eijiDodgeUsedRound) — กันทั้งการโจมตีปกติและดาเมจจากสกิล
//  โรลไม่ติดไม่กินโควตา จึงยังได้ลุ้นกับหมัด/สกิลถัดไปในเทิร์นเดียวกัน
//  UI ฝั่ง client โชว์ % ปัจจุบันเป็นป้ายเฉพาะตัว (แบบเกียร์ของทาคุมิ) ไม่ใช่สถานะสะสม
//
//  หมายเหตุ: ไม่ใช้สถานะ evade กลาง (_universal_status) เพราะกลไกคนละแบบ —
//  evade กลางเป็น "สแตคที่ถูกกินทีละครั้ง" ส่วนของเอจิเป็น "% รวมต่อเทิร์น" ที่คิดสดทุกครั้ง
// ============================================================

const ID = "eiji";

const EIJI_MAX_HP = 4;              // พลังชีวิตพื้นฐาน 4 หน่วย (แทน MAX_HP ปกติ)
const EIJI_MAX_ARMOR = 4;           // เกราะพื้นฐาน 4 หน่วย (แทน MAX_ARMOR ปกติ)

// ---------- ว่องไว (สกิลพื้นฐาน) ----------
const SWIFT_TURNS = 3;
const SWIFT_DODGE = 20;             // +20% ต่อการหลบ 1 ครั้ง/เทิร์น (รวมกับท่าไม้ตายเป็น 40%)
const SWIFT_HEAL = 1;               // ระหว่างมีผล ฟื้นพลังชีวิต +1 ต่อเทิร์น
const SWIFT_ARMOR_ON_CAST = 2;      // กดปุ๊บฟื้นเกราะให้ทันที 2 หน่วย
const SWIFT_EXPIRE_REFUND = 2;      // "ความเร็วสูง" หมดอายุ -> คืนแต้มสกิลที่ใช้ไป 2 หน่วย

// ---------- ความแค้น (สกิลรอง) ----------
const SWORD_TURNS = 3;
const SWORD_PCT_PER_UNIT = 10;      // ระหว่างมีดาบ: โอกาสดาเมจ 2 เท่า = (เกราะ + พลังชีวิตของเอจิ) × 10%

// ---------- ไม่ว่ายังก็ตาม (ท่าไม้ตาย) ----------
const ULT_TURNS = 5;
const ULT_COOLDOWN_TURNS = 3;    // หมดเวลาท่าไม้ตายแล้วห้ามกดซ้ำอีกกี่เทิร์น (แพทเทิร์นเดียวกับชิโด)
const ULT_DODGE = 20;               // +20% ต่อการหลบ 1 ครั้ง/เทิร์น
const ULT_CARD_TIME = 40;           // เวลาช่วงจั่วการ์ดถูกบีบเหลือ 40 วินาที
const ULT_SKILL_REGEN = 1;          // ระหว่างท่าไม้ตายทำงาน ฟื้นแต้มสกิล +1 ต่อเทิร์น

// ---------- สกิลติดตัว 1: ผู้เล่นอันดับ 2 ----------
const DOUBLE_BASE_PCT = 20;         // โอกาสดาเมจ 2 เท่าติดตัว 20% แม้ไม่ได้กดสกิลรอง
const DOUBLE_HIT_HEAL = 1;          // ติดดาเมจ 2 เท่าเมื่อไหร่ ฟื้นพลังชีวิต +1 (คอมโบกับสกิลรอง)
const DRAW_TIME_CUT = 5;            // จั่ว 1 ใบ = เวลาเทิร์นลด 5 วิ
const DRAW_TIME_CUT_LONGING = 10;   // ระหว่างมีบัฟ Longing ของยูนะบนตัวเอง ลด 10 วิแทน
const INTERRUPT_CHANCE = 0.25;      // 25% ขัดจังหวะผู้ชนะที่ไปตีคนอื่น
const INTERRUPT_DMG = 1;            // สวนคืนผู้ชนะ 1 หน่วย

// ---------- สกิลติดตัว 2: ฉันอยากเจอเธออีก ----------
const YUNA_PITY_BONUS = 0.05;       // หน้าต่างยูนะที่ไม่ติด -> โอกาสรอบหน้า +5% เพิ่มจากระบบกันดวงซวยปกติ
const DODGE_SKILL_REFUND = 2;       // หลบสำเร็จ 1 ครั้ง = ฟื้นแต้มสกิล +2

// ---------- สกิลติดตัว 3: กลโกง Ordinal Scale ----------
const ORDINAL_MAX = 5;              // กดสะสมได้สูงสุด 5 ครั้งต่อเทิร์น
const ORDINAL_COST = 1;             // 1 ครั้ง = สละแต้มสกิล 1 แต้ม
const ORDINAL_DODGE = 20;           // 1 ครั้ง = +20% (กด 5 ครั้ง = +100%)
const DODGE_PCT_CAP = 100;          // เพดานอัตราหลบรวม — กัน UI โชว์เกิน 100% ตอนซ้อนกับว่องไว/ท่าไม้ตาย

// ---------- เอฟเฟกต์เฉพาะตัวตอนยูนะทำงาน ----------
const LONGING_PUNISH_DMG = 1;       // Longing ลงคนอื่น -> เอจิสวนใส่คนที่ฟื้นคืนชีพ 1 หน่วย + ปิดบัฟยูนะ
const DELETE_DECAY_TURNS = 1;       // Delete ลงคนอื่น -> เอจิตีปกติใส่เป้านั้น มอบ "ผุพัง" 1 เทิร์น
const DELETE_SELF_TURNS = 3;        // Delete ลงเอจิเอง -> อยู่แค่ 3 เทิร์น (แทน 5)
const SMILE_SELF_HEAL = 1;          // Smile for You ลงเอจิเอง -> โจมตีปกติฟื้นพลังชีวิต +1

const IMG = {
  base: "/characters/eiji/eiji.webp",
  ult: "/characters/eiji/eiji_change.jpg",
  skill1: "/characters/eiji/skill1/eiji_skill1.jpg",
  skill2: "/characters/eiji/skill2/eiji_skill2.jpg",
  skill3: "/characters/eiji/skill3/eiji_skill3.jpg",
  passive3: "/characters/eiji/passive/eiji_passive3.webp",
};

function isEiji(p) { return !!p && p.characterId === ID; }
function swiftOn(p) { return isEiji(p) && ((p.statuses && p.statuses.eijiSwift) || 0) > 0; }
function swordOn(p) { return isEiji(p) && ((p.statuses && p.statuses.eijiSword) || 0) > 0; }
function ultOn(p) { return isEiji(p) && ((p.statuses && p.statuses.eijiUlt) || 0) > 0; }
function ordinalStacks(p) { return isEiji(p) ? Math.min(ORDINAL_MAX, p.eijiOrdinal || 0) : 0; }

// อัตราหลบหลีกรวมของเทิร์นนี้ (%) — ซ้อนทับได้ทั้ง 3 แหล่งตามสเปก
function dodgeChance(p) {
  if (!isEiji(p)) return 0;
  const raw = (swiftOn(p) ? SWIFT_DODGE : 0) + (ultOn(p) ? ULT_DODGE : 0) + ordinalStacks(p) * ORDINAL_DODGE;
  return Math.min(DODGE_PCT_CAP, raw);
}

// เอจิที่ยังอยู่ในสนาม (ใช้กับกลไกที่ทำงานแม้เอจิไม่ใช่คนกด — สกิลติดตัว 1/2 และเอฟเฟกต์ยูนะ)
function aliveEiji(engine, exceptId) {
  return engine.alivePlayers().find((p) => isEiji(p) && p.id !== exceptId) || null;
}

module.exports = {
  id: ID,
  MAX_HP: EIJI_MAX_HP,
  MAX_ARMOR: EIJI_MAX_ARMOR,
  ORDINAL_MAX,
  ORDINAL_COST,
  ULT_CARD_TIME,
  IMG,

  // ---------- helper ที่ server.js / client อ่านผ่าน buildStateFor ----------
  dodgeChance,
  ordinalStacks,
  ultActive: ultOn,
  // เพดานเลือด/เกราะเฉพาะตัว — เรียกจาก maxHpOf() / maxArmorOf()
  maxHp() { return EIJI_MAX_HP; },
  maxArmor() { return EIJI_MAX_ARMOR; },
  // ภาพประจำตัวระหว่างท่าไม้ตายทำงาน (null = ใช้ภาพปกติ) — เรียกจาก displayImg()
  displayImg(p) { return ultOn(p) ? IMG.ult : null; },

  // ---------- เงื่อนไขการกด — เรียกจาก useSkill() ก่อนหักแต้ม ----------
  canUseSkill(engine, p, tier) {
    if (tier === "basic") return !swiftOn(p);        // "ความเร็วสูง" ยังอยู่ = กดซ้ำไม่ได้
    if (tier === "secondary") return !swordOn(p);    // "ดาบแห่งความทรงจำ" ยังอยู่ = กดซ้ำไม่ได้
    if (tier === "ultimate") {
      if (ultOn(p)) return false;
      if (this.ultCooldownLeft(engine, p) > 0) return false; // เพิ่งหมดเวลาไป ยังอยู่ในคูลดาวน์
      // เอฟเฟกต์สนามยูนะทำงานอยู่ = กดไม่ได้ (ท่านี้เป็นการ "บังคับเปิด" สนามยูนะเอง)
      return !(engine.yunaEffect && engine.roundNumber <= engine.yunaWindowEnd);
    }
    return true;
  },

  // ---------- ผลของสกิลที่ทำงานทันที (instant) — เรียกจาก useSkill() ในส่วน effect ----------
  applyInstantSkill(engine, p, tier) {
    if (tier === "basic") return this.applySwift(engine, p);
    if (tier === "secondary") return this.applySword(engine, p);
    if (tier === "ultimate") return this.applyUlt(engine, p);
    return "";
  },

  // ว่องไว: บัฟตัวเอง 3 เทิร์น — หลบ +20% · ฟื้นเลือด +1 ต่อเทิร์น · กดปุ๊บได้เกราะทันที +2
  //  และเมื่อหมดอายุจะคืนแต้มสกิลที่ใช้ไป (ดู onSwiftExpire)
  applySwift(engine, p) {
    p.statuses.eijiSwift = SWIFT_TURNS;
    const armor = engine.healArmor(p, SWIFT_ARMOR_ON_CAST);
    engine.log(`💨 ${p.name} ว่องไว — ได้สถานะ "ความเร็วสูง" ${SWIFT_TURNS} เทิร์น (หลบหลีก +${SWIFT_DODGE}% · ฟื้นพลังชีวิต +${SWIFT_HEAL} ต่อเทิร์น) · ฟื้นเกราะทันที +${armor} · อัตราหลบตอนนี้ ${dodgeChance(p)}%`);
    return ` — หลบหลีก ${dodgeChance(p)}% · เกราะ +${armor}`;
  },

  // "ความเร็วสูง" หมดอายุ — คืนแต้มสกิลที่จ่ายไป เรียกจากลูปลดเทิร์นสถานะใน endTurn()
  onSwiftExpire(engine, p) {
    if (!isEiji(p)) return;
    engine.addSkill(p, SWIFT_EXPIRE_REFUND, "passive");
    engine.log(`💨 ${p.name} ความเร็วสูงหมดลง — คืนแต้มสกิลที่ใช้ไป +${SWIFT_EXPIRE_REFUND}`);
  },

  // ความแค้น: บัฟตัวเอง 3 เทิร์น — โจมตีปกติมีโอกาสดาเมจ 2 เท่า ตาม (เกราะ+พลังชีวิต) ของเอจิเอง
  applySword(engine, p) {
    p.statuses.eijiSword = SWORD_TURNS;
    const pct = this.doubleChance(p);
    engine.log(`⚔️ ${p.name} ความแค้น — ได้สถานะ "ดาบแห่งความทรงจำ" ${SWORD_TURNS} เทิร์น (โจมตีปกติมีโอกาส ${pct}% สร้างความเสียหาย 2 เท่า)`);
    return ` — ดาเมจ 2 เท่า ${pct}%`;
  },

  // โอกาสดาเมจ 2 เท่า
  //  สกิลติดตัว 1: ติดตัว 20% เสมอ แม้ไม่ได้กดสกิลรอง
  //  ระหว่างมี "ดาบแห่งความทรงจำ": ใช้สูตร (เกราะ + พลังชีวิต) × 10% แทน — ใช้ค่าที่สูงกว่า
  //  เพื่อไม่ให้การกดสกิลรองตอนเลือดน้อยกลายเป็นการ "ลด" โอกาสของตัวเอง
  doubleChance(p) {
    if (!isEiji(p)) return 0;
    if (!swordOn(p)) return DOUBLE_BASE_PCT;
    const sword = Math.min(100, ((p.hp || 0) + (p.armor || 0)) * SWORD_PCT_PER_UNIT);
    return Math.max(DOUBLE_BASE_PCT, sword);
  },

  // ไม่ว่ายังก็ตาม: บังคับเปิดเอฟเฟกต์สนามยูนะ Break Beat Bark! แบบพิเศษ 5 เทิร์น
  //  ทุกคน (รวมเอจิ) ได้พลังโจมตีปกติ +1 · เวลาช่วงจั่วการ์ดเหลือ 40 วิ · เอจิหลบ +20%
  applyUlt(engine, p) {
    p.statuses.eijiUlt = ULT_TURNS;
    p.transformAt = engine.nextTransformCounter();
    engine.setYunaTrigger({ effect: "beatbark", targetId: null, windowEnd: engine.roundNumber + ULT_TURNS - 1 });
    engine.triggerCutscene(p, "eijiUlt"); // eiji_skill3.mp4 -> ต่อด้วยเพลง eiji_ult (connect.m4a -> Break Beat Bark! loop)
    engine.log(`🔥 ${p.name} ไม่ว่ายังก็ตาม — บังคับเปิด Break Beat Bark! ${ULT_TURNS} เทิร์น! ทุกคนได้พลังโจมตีปกติ +1 · เวลาจั่วการ์ดเหลือ ${ULT_CARD_TIME} วินาที · เอจิหลบหลีก +${ULT_DODGE}% · แต้มสกิล +${ULT_SKILL_REGEN} ต่อเทิร์น`);
    return " — Break Beat Bark!";
  },

  // ---------- สกิลติดตัว 3: กลโกง Ordinal Scale (ปุ่มเฉพาะตัว ไม่นับเป็นการใช้สกิล) ----------
  //  คืน true ถ้ากดสำเร็จ — ผู้เรียก (server.js's eijiOrdinalScale) เป็นคนยิง skillFlash/broadcast
  pressOrdinal(engine, p) {
    if (!isEiji(p)) return false;
    if (ordinalStacks(p) >= ORDINAL_MAX) return false;
    if ((p.skillPoints || 0) < ORDINAL_COST) return false;
    p.skillPoints -= ORDINAL_COST;
    p.eijiOrdinal = (p.eijiOrdinal || 0) + 1;
    engine.log(`⏱️ ${p.name} กลโกง Ordinal Scale — เร่งความเร็ว (${p.eijiOrdinal}/${ORDINAL_MAX}) สละแต้มสกิล ${ORDINAL_COST} · อัตราหลบหลีกเทิร์นนี้ ${dodgeChance(p)}%`);
    return true;
  },

  // ---------- ต้นเทิร์น — เรียกจาก dealRound() ----------
  onRoundStartTick(engine, p) {
    p.eijiOrdinal = 0;          // Ordinal Scale รีเซ็ตทุกเทิร์น (มีผลแค่ภายในเทิร์นที่กด)
    p.eijiDodgeUsedRound = false; // โควตาหลบหลีก 1 ครั้งต่อเทิร์น
    if (swiftOn(p)) {
      const heal = engine.healHp(p, SWIFT_HEAL);
      if (heal > 0) engine.log(`💨 ${p.name} ความเร็วสูง — ฟื้นพลังชีวิต +${heal} (เหลืออีก ${p.statuses.eijiSwift} เทิร์น)`);
    }
    // ไม่ว่ายังก็ตาม: ระหว่างท่าไม้ตายทำงาน ฟื้นแต้มสกิล +1 ต่อเทิร์น
    if (ultOn(p)) {
      engine.addSkill(p, ULT_SKILL_REGEN, "passive");
      engine.log(`🔥 ${p.name} ไม่ว่ายังก็ตาม — ฟื้นแต้มสกิล +${ULT_SKILL_REGEN} (เหลืออีก ${p.statuses.eijiUlt} เทิร์น)`);
    }
  },

  // ---------- สกิลติดตัว 1: จั่วการ์ด 1 ใบ = บีบเวลาเทิร์นลง ----------
  //  เรียกจาก hit() ทุกครั้งที่เอจิจั่วได้ไพ่จริง
  onCardDraw(engine, p) {
    if (!isEiji(p)) return;
    // Longing ลงเอจิเอง: สกิลติดตัว 1 ถูกเสริมพลัง — ลด 10 วิแทน 5 วิ
    const cut = ((p.statuses && p.statuses.yunaLonging) || 0) > 0 ? DRAW_TIME_CUT_LONGING : DRAW_TIME_CUT;
    const left = engine.reduceCardTimer(cut);
    engine.log(`⏱️ ${p.name} ผู้เล่นอันดับ 2 — เวลาช่วงจั่วการ์ดลดลง ${cut} วินาที (เหลือ ${left} วิ)`);
  },

  // ---------- สกิลติดตัว 2: ดันโอกาสเกิดยูนะ (ระบบกันดวงซวยแรงขึ้น) ----------
  //  เรียกจาก characters/yuna.js's rollWindow() — คืน % เพิ่มเติมที่จะสะสมเมื่อหน้าต่างนี้ไม่ติด
  yunaPityBonus(engine) {
    return aliveEiji(engine) ? YUNA_PITY_BONUS : 0;
  },

  // ---------- หลบหลีก ----------
  //  หลบสำเร็จได้ 1 ครั้งต่อเทิร์น — ใช้ได้ทั้งกับการโจมตีปกติ (doAttack) และดาเมจจากสกิล (adjustIncomingDamage)
  //  คืน true = หลบพ้น
  tryDodge(engine, p, what) {
    if (!isEiji(p) || !p.alive) return false;
    if (p.eijiDodgeUsedRound) return false;
    const pct = dodgeChance(p);
    if (pct <= 0) return false;
    if (Math.random() * 100 >= pct) {
      // โรลไม่ติด = ยังไม่กินโควตา — โควตานับเฉพาะ "หลบได้จริง" เท่านั้น
      //  (โดนหมัดนี้เต็มๆ แล้วยังลุ้นหลบหมัด/สกิลถัดไปในเทิร์นเดียวกันได้อยู่)
      engine.log(`💢 ${p.name} พยายามหลบ${what ? ` ${what}` : ""} (${pct}%) แต่ไม่พ้น`);
      return false;
    }
    p.eijiDodgeUsedRound = true; // หลบสำเร็จแล้ว -> หมดโควตาของเทิร์นนี้
    engine.log(`💨 หลบหลีก! ${p.name} หลบ${what ? ` ${what}` : "การโจมตี"}ได้ (${pct}%)`);
    // สกิลติดตัว 2: หลบสำเร็จ = ฟื้นแต้มสกิล +2
    engine.addSkill(p, DODGE_SKILL_REFUND, "passive");
    engine.log(`✨ ${p.name} ฉันอยากเจอเธออีก — หลบสำเร็จ ฟื้นแต้มสกิล +${DODGE_SKILL_REFUND}`);
    return true;
  },

  // เรียกจาก doAttack() — หลบการโจมตีปกติ (จัดฉาก lastAttack เองแบบเดียวกับ oguri/appleguy)
  //  คืน true ถ้าหลบพ้น (ผู้เรียกต้อง return ทันที)
  tryAttackDodge(engine, attacker, target) {
    if (!isEiji(target)) return false;
    if (!this.tryDodge(engine, target, `การโจมตีของ ${attacker.name}`)) return false;
    target.wasAttacked = true; // patch 2.1.3.5: ถูกโจมตีไม่ได้แต้มสกิล (แม้หลบพ้น)
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, dodge: true,
      skills: [{ name: `หลบหลีก (${dodgeChance(target)}%)`, img: engine.displayImg(target), by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // เรียกจาก adjustIncomingDamage() (universal dispatcher) — หลบดาเมจจากสกิล
  //  การโจมตีปกติจัดการที่ tryAttackDodge ไปแล้ว จึงข้าม isNormalAttack ที่นี่
  adjustIncomingDamage(engine, p, n, isNormalAttack) {
    if (!isEiji(p) || n <= 0 || isNormalAttack || p._statusDamage) return n;
    return this.tryDodge(engine, p, "ความเสียหายจากสกิล") ? 0 : n;
  },

  // ---------- สกิลติดตัว 1: ขัดจังหวะผู้ชนะที่ไปตีคนอื่น ----------
  //  เรียกจาก doAttack() ก่อนคิดดาเมจ — เอจิต้อง "ไม่ชนะ + ไม่การ์ดแตก" และเป้าหมายต้องไม่ใช่เอจิ
  //  คืน true ถ้าขัดสำเร็จ (ผู้เรียกต้อง return ทันที — เทิร์นจบด้วยฉากสวนคืนแทน)
  tryInterrupt(engine, attacker, target) {
    if (!attacker || !target) return false;
    if (isEiji(attacker) || isEiji(target)) return false;
    const e = engine.alivePlayers().find((p) => isEiji(p) && !p.busted && p.id !== attacker.id && !engine.passiveSealed(p));
    if (!e) return false;
    if (engine.sameTeam(e, attacker)) return false; // โหมดทีม: ไม่สวนพวกเดียวกัน
    if (Math.random() >= INTERRUPT_CHANCE) return false;

    engine.log(`🚧 ${e.name} ผู้เล่นอันดับ 2 — ขัดจังหวะ ${attacker.name} ไม่ให้โจมตี ${target.name} ได้สำเร็จ!`);
    engine.triggerCutscene(e, "eijiInterrupt"); // eiji_passive1.mp4 เล่นก่อน แล้วค่อยเกิดความเสียหาย
    engine.withEffectSource(e, () => {
      engine.dealMixed(attacker, INTERRUPT_DMG);
      engine.maybeBeatSave(attacker); engine.maybeBeatMode(attacker); engine.maybeEva3(attacker);
      attacker.wasAttacked = true;
    });
    engine.log(`⚔️ ${e.name} สวนคืน ${attacker.name} -${INTERRUPT_DMG}`);
    engine.setLastAttack({
      byName: e.name, byImg: engine.displayImg(e), byColor: engine.POSITION_COLORS[e.position] || "#888",
      targetName: attacker.name, targetImg: engine.displayImg(attacker), targetColor: engine.POSITION_COLORS[attacker.position] || "#888",
      dmg: INTERRUPT_DMG,
      skills: [{ name: "ผู้เล่นอันดับ 2 (ขัดจังหวะ + สวนคืน)", img: IMG.base, by: e.name, color: engine.POSITION_COLORS[e.position] || "#888", side: "atk" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // ---------- การโจมตีปกติของเอจิ ----------
  // ความแค้น: โอกาสดาเมจ 2 เท่า — เรียกจาก doAttack() หลังคำนวณดาเมจฐานแล้ว
  //  คืนดาเมจใหม่ และตั้ง ctx.videoQueued = true เมื่อคิววีดีโอไว้ เพื่อให้ doAttack รู้ว่าต้องเล่นวีดีโอ
  //  "ก่อน" ขึ้นสรุปความเสียหาย (ค่าเริ่มต้นของ doAttack คือขึ้นสรุปก่อนแล้วค่อยเล่นวีดีโอที่ค้างคิว)
  applySwordDouble(engine, attacker, dmg, ctx) {
    if (!isEiji(attacker) || dmg <= 0) return dmg; // ทำงานตลอด — ฐาน 20% มาจากสกิลติดตัว 1
    const pct = this.doubleChance(attacker);
    const label = swordOn(attacker) ? "ดาบแห่งความทรงจำ" : "ผู้เล่นอันดับ 2";
    if (Math.random() * 100 >= pct) {
      engine.log(`⚔️ ${attacker.name} ${label} — ไม่ติดดาเมจ 2 เท่า (${pct}%)`);
      return dmg;
    }
    engine.log(`⚔️ ${attacker.name} ${label} ทำงาน (${pct}%) — ความเสียหาย ${dmg} → ${dmg * 2}!`);
    // สกิลติดตัว 1: ติดดาเมจ 2 เท่าเมื่อไหร่ ฟื้นพลังชีวิตให้ตัวเอง
    const heal = engine.healHp(attacker, DOUBLE_HIT_HEAL);
    if (heal > 0) engine.log(`💚 ${attacker.name} ผู้เล่นอันดับ 2 — ดาเมจ 2 เท่าทำงาน ฟื้นพลังชีวิต +${heal}`);
    engine.queueCutscene(attacker, "eijiSwordHit");
    if (ctx) ctx.videoQueued = true;
    return dmg * 2;
  },

  // Smile for You ลงคนอื่น: เอจิตีทะลุบัฟลดดาเมจของยูนะ — เรียกจาก doAttack() ตอนหักบัฟ smile
  ignoresYunaSmile(attacker) { return isEiji(attacker); },

  // เรียกจาก doAttack() หลังดาเมจลงจริง — Smile for You ลงเอจิเอง / Delete ลงคนอื่น
  onAttackLanded(engine, attacker, target) {
    if (!isEiji(attacker)) return;
    // Smile for You ลงเอจิเอง: การโจมตีปกติฟื้นพลังชีวิต +1
    if (((attacker.statuses && attacker.statuses.yunaSmile) || 0) > 0) {
      const heal = engine.healHp(attacker, SMILE_SELF_HEAL);
      if (heal > 0) engine.log(`💚 ${attacker.name} Smile for You — การโจมตีปกติฟื้นพลังชีวิต +${heal}`);
    }
    // Delete ลงคนอื่น: เอจิตีปกติใส่เป้านั้น -> มอบสถานะ "ผุพัง"
    if (target && target.alive && ((target.statuses && target.statuses.yunaDelete) || 0) > 0) {
      if (engine.applyDebuff(target, "decay", null, DELETE_DECAY_TURNS)) {
        engine.log(`💜 ${attacker.name} Delete — ${target.name} ติดสถานะ "ผุพัง" ${DELETE_DECAY_TURNS} เทิร์น (เกราะไม่ฟื้น)`);
      }
    }
  },

  // ---------- เอฟเฟกต์เฉพาะตัวตอนยูนะทำงาน ----------
  // Longing ลงคนอื่น: หลังฉากเปิดยูนะจบ -> เล่น eiji_passive_extra.mp4 แล้วเอจิสวนใส่คนที่ฟื้นคืนชีพ
  //  พร้อมปิดบัฟ Longing ของเป้าหมาย (เพลงหยุดตามไปด้วย เพราะ yunaEffect ถูกล้าง)
  //  เรียกจาก server.js ต่อท้าย YunaMod.reviveWithLonging()
  onYunaLonging(engine, revived) {
    if (!revived || isEiji(revived)) return; // ลงเอจิเอง = ทำงานตามปกติ (ผลเสริมอยู่ที่ onCardDraw)
    const e = aliveEiji(engine, revived.id);
    if (!e || engine.passiveSealed(e) || engine.sameTeam(e, revived)) return;

    // 1) ปิดบัฟยูนะก่อนเสมอ — ต้องมาก่อนคิววีดีโอ/ดาเมจ เพราะนี่คือผลหลักตามสเปก
    //    ("ทำให้บัฟยูนะของเป้าหมายหยุดทำงานลง เพลงก็หยุด") ถ้าขั้นตอนหลังพลาด ผลหลักต้องยังลงไปแล้ว
    //    คู่แฝดฮิซากาว่าเก็บบัฟไว้ที่ตัวแฝด ไม่ใช่ p.statuses — delete ตรงๆ จะไม่มีผลกับตัวละครนี้เลย
    delete revived.statuses.yunaLonging;
    if (revived.statusAmt) delete revived.statusAmt.yunaLonging; // ไม่ล้างด้วยจะค้างเป็นขยะ (statusAmtOf อ่านคู่กัน)
    const hisakawa = engine.CHAR_HOOKS && engine.CHAR_HOOKS.hisakawa_sister;
    if (hisakawa && hisakawa.clearStatusOnTwins) hisakawa.clearStatusOnTwins(revived, "yunaLonging");
    //  ถ้ามีท่าไม้ตายของเอจิทำงานค้างอยู่ ต้องคืนสนาม Break Beat Bark! กลับไป ไม่ใช่ล้างเป็น null
    //  (Longing เขียนทับ yunaEffect ตอนฟื้นคืนชีพ — ล้างทิ้งเฉยๆ จะพาเอฟเฟกต์ของท่าไม้ตายหายไปด้วย)
    const ultOwner = engine.alivePlayers().find((o) => ultOn(o));
    if (ultOwner) {
      engine.setYunaTrigger({ effect: "beatbark", targetId: null, windowEnd: engine.roundNumber + (ultOwner.statuses.eijiUlt || 1) - 1 });
    } else {
      engine.setYunaTrigger({ effect: null, targetId: null, windowEnd: 0 }); // ปิดเอฟเฟกต์สนาม + เพลงยูนะ
    }

    // 2) วีดีโอต่อท้ายคิว -> เล่นหลังฉากเปิดยูนะจบพอดี  3) แล้วค่อยลงความเสียหาย
    //    ใช้ dealDirect เพราะคนที่เพิ่งฟื้นคืนชีพยังมีเกราะเดิมติดตัวอยู่ (Longing ฟื้นแค่เลือด)
    //    ถ้าใช้ dealMixed เกราะจะกินหมัดนี้ไปเงียบๆ จนดูเหมือนเอจิไม่ได้ทำดาเมจอะไรเลย
    engine.queueCutscene(e, "eijiLonging");
    engine.withEffectSource(e, () => {
      engine.dealDirect(revived, LONGING_PUNISH_DMG);
      engine.maybeBeatSave(revived); engine.maybeBeatMode(revived); engine.maybeEva3(revived);
      revived.wasAttacked = true;
    });
    engine.log(`🥀 ${e.name} — ตามไปจบเรื่องกับ ${revived.name} ทันทีที่ฟื้นคืนชีพ (-${LONGING_PUNISH_DMG} ทะลุเกราะ) และบัฟ Longing ถูกปิดการใช้งาน`);
  },

  // Delete ลงเอจิเอง: ดีบัฟอยู่แค่ 3 เทิร์นแทน 5 — เรียกจาก characters/yuna.js ตอนแจกดีบัฟ
  yunaDeleteTurns(target, def) { return isEiji(target) ? DELETE_SELF_TURNS : def; },

  // ---------- คูลดาวน์ท่าไม้ตาย (patch 2.9.3) ----------
  //  "ไม่ว่ายังก็ตาม" หมดเวลาเมื่อไหร่ ล็อกไม่ให้กดซ้ำอีก ULT_COOLDOWN_TURNS เทิร์น
  //  เก็บเป็น "เลขรอบที่ล็อกถึง" ไม่ใช่ตัวนับถอยหลัง เพราะไม่ได้อยู่ใน p.statuses จึงไม่มีใครลดเทิร์นให้
  //  (เหตุผลเดียวกับ shidoRewindLock ของอิสึกะ ชิโด)
  ULT_COOLDOWN_TURNS,
  onUltExpire(engine, p) {
    if (!isEiji(p)) return;
    p.eijiUltLock = engine.roundNumber + ULT_COOLDOWN_TURNS;
    engine.log(`🔥 ${p.name} ไม่ว่ายังก็ตาม หมดเวลาแล้ว — ใช้ท่าไม้ตายซ้ำไม่ได้อีก ${ULT_COOLDOWN_TURNS} เทิร์น`);
  },
  // เทิร์นที่เหลือของคูลดาวน์ (0 = กดได้แล้ว) — ใช้ทั้งด่านเงื่อนไขและตัวเลขบนการ์ดสกิลฝั่ง client
  ultCooldownLeft(engine, p) {
    if (!isEiji(p)) return 0;
    return Math.max(0, (p.eijiUltLock || 0) - engine.roundNumber + 1);
  },

  // ---------- ฟิลด์ที่ต้องรีเซ็ตทุกแมตช์ — เรียกจาก resetCombat() ----------
  resetCombat(p) {
    p.eijiOrdinal = 0;            // กลโกง Ordinal Scale: สแตคที่กดสะสมในเทิร์นนี้ (0-5 · รีเซ็ตทุกเทิร์น)
    p.eijiDodgeUsedRound = false; // ใช้โควตาหลบหลีกของเทิร์นนี้ไปแล้วหรือยัง
    p.eijiUltLock = 0;            // คูลดาวน์ท่าไม้ตาย: ล็อกถึงรอบนี้ (ไม่ใช่สถานะ จึงต้องล้างเอง)
  },
};
