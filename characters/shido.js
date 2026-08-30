// ============================================================
//  อิสึกะ ชิโด (patch 2.9 new) — ภูติ / Sandalphon / ฝากด้วยนะตัวฉัน
//  + สกิลติดตัว "ขอพลังให้ฉันด้วย"
//
//  แกนกลางคือ "การถูกตีแล้วเอาความเจ็บนั้นมาใช้": สกิลติดตัวบันทึกความเสียหายก้อนล่าสุดที่ชิโดรับ
//  จากผู้เล่นคนอื่น (ทางไหนก็ตาม — โจมตีปกติ/สกิล/ปืน/ดีบัฟ) แล้ว Sandalphon แปลงตัวเลขนั้น
//  เป็นพลังโจมตีของดาบ
//
//    p.shidoRecorded  ตัวเลขที่บันทึกไว้ — เริ่มที่ 3 และไม่มีทางต่ำกว่านั้น
//                     โดนแรงกว่าเดิม = บันทึกทับ · โดนเบากว่าเดิม = ร่วงกลับเป็น 3 (ไม่ใช่คงค่าสูงเดิมไว้)
//    shidoSword       สถานะ Sandalphon 3 เทิร์น · statusAmt = พลังดาบที่ "ล็อกไว้ตอนกด" · ฟื้นแต้มสกิล +1/เทิร์น
//                     -> attackBaseOverride **แทนที่** พลังโจมตีปกติ (ไม่ใช่บวกทับฐาน 1)
//                     -> โดนตีใหม่ระหว่างที่ดาบยังอยู่ = อัปเดตแค่ p.shidoRecorded ดาบไม่เปลี่ยนค่า
//                        จนกว่าจะกดสกิลใหม่ (ค่าที่ใช้จริงอ่านจาก statusAmt เสมอ ไม่ใช่จาก shidoRecorded)
//
//  ท่าไม้ตาย "ฝากด้วยนะตัวฉัน" เป็นกับดักที่ **ไม่มีใครรู้ว่าเปิดอยู่** — จึงไม่ใช้ p.statuses
//  (สถานะทุกตัวถูกเปิดให้ทุกคนเห็นตอน SUMMARY/ATTACK ผ่าน revealAll) แต่เก็บที่ p.shidoGuardTurns
//  ซึ่ง buildStateFor ส่งให้ **เจ้าของคนเดียว** และไม่มี log/skillFlash/คัตซีนใดๆ ตอนกด
//  วีดีโอจะโผล่ก็ต่อเมื่อกับดักทำงานจริง (ชิโดตาย) เป็นรอยต่อก่อนขึ้นเทิร์นถัดไป
// ============================================================

const ID = "shido";

// ---------- สกิลติดตัว ขอพลังให้ฉันด้วย ----------
//  ค่าที่บันทึกไว้ทำงานแบบ "ไต่ขึ้นอย่างเดียว หรือไม่ก็ร่วงกลับพื้น":
//    โดนแรงกว่าที่บันทึกไว้  -> บันทึกทับด้วยค่าใหม่
//    โดนเบากว่าที่บันทึกไว้  -> ค่าที่บันทึกร่วงกลับเป็น RECORD_BASE (ไม่ได้บันทึกค่าเบานั้น และไม่คงค่าสูงเดิมไว้)
//    โดนเท่ากันพอดี          -> คงเดิม
//  ผลคือถ้าอยากได้ดาบแรง ต้องโดนหนักติดๆ กัน เผลอโดนตอดทีเดียวก็ลงมาที่พื้น 3 ทันที
const RECORD_BASE = 3;           // ค่าเริ่มต้นและพื้นของการบันทึก — ไม่มีทางต่ำกว่านี้

// ---------- สกิลพื้นฐาน ภูติ ----------
const SPIRIT_TURNS = 3;
const SPIRIT_HEAL = 1;           // ฟื้นพลังชีวิตต่อเทิร์น (ติกตอนเริ่มเทิร์น)
const SPIRIT_LIFESTEAL = 1;      // โจมตีปกติแล้วฟื้นพลังชีวิตเพิ่ม

// ---------- สกิลรอง Sandalphon ----------
const SWORD_TURNS = 3;
const SWORD_SKILL_REGEN = 1;     // ระหว่างที่ดาบยังอยู่: ฟื้นแต้มสกิลให้เทิร์นละเท่านี้
const SWORD_MUSIC = "shido_theme"; // shido_theme.mp3 — เล่นค้างตลอดที่ดาบยังอยู่

// ---------- ท่าไม้ตาย ฝากด้วยนะตัวฉัน ----------
const GUARD_TURNS = 3;           // กับดักเปิดอยู่กี่เทิร์น (นับถอยหลังบนการ์ดสกิล เห็นคนเดียว)
const REWIND_TURNS = 5;          // ย้อนเวลากลับไปกี่เทิร์น
const REWIND_HEAL = 2;           // ย้อนกลับมาแล้วฟื้นพลังชีวิตให้ชิโดเพิ่มอีก
const REWIND_LOCK_TURNS = 5;     // ย้อนแล้วห้ามกดท่าไม้ตายอีกกี่เทิร์น (กันย้อนวนไม่รู้จบ — ดูหมายเหตุด้านล่าง)

const IMG = {
  base: "/characters/shido/shido.jpg",
  skill1: "/characters/shido/shido_skill1.jpg",
  skill2: "/characters/shido/shido_skill2.png",
  skill3: "/characters/shido/shido_skill3.jpg",
};

function isShido(p) { return !!p && p.characterId === ID; }
function spiritOn(p) { return ((p && p.statuses && p.statuses.shidoSpirit) || 0) > 0; }
function swordOn(p) { return ((p && p.statuses && p.statuses.shidoSword) || 0) > 0; }
function swordPower(p) { return (p && p.statusAmt && p.statusAmt.shidoSword) || 0; }

module.exports = {
  id: ID,
  IMG,
  RECORD_BASE,
  SPIRIT_TURNS,
  SPIRIT_HEAL,
  SPIRIT_LIFESTEAL,
  SWORD_TURNS,
  SWORD_SKILL_REGEN,
  GUARD_TURNS,
  REWIND_TURNS,
  REWIND_HEAL,
  REWIND_LOCK_TURNS,

  // ---------- ฟิลด์เฉพาะตัวละคร: ต้องล้างทุกแมตช์ใหม่ (เรียกจาก resetCombat ของ server.js) ----------
  resetCombat(p) {
    p.shidoRecorded = RECORD_BASE; // ความเสียหายที่บันทึกไว้ (เริ่มที่พื้น 3 — ไม่มีทางต่ำกว่านี้)
    p.shidoGuardTurns = 0;        // ฝากด้วยนะตัวฉัน: กับดักเหลืออีกกี่เทิร์น (เห็นคนเดียว)
    p.shidoRewindPending = false; // ตายพร้อมกับดัก -> รอย้อนเวลาตอนจบเทิร์น
    p.shidoRewindLock = 0;        // ย้อนไปแล้ว: ห้ามกดท่าไม้ตายจนถึงรอบนี้ (ฟิลด์นี้ "ไม่ถูกย้อน")
    p.shidoDeathVideoPending = false; // รอเล่น shido_skill3.mp4 เป็นรอยต่อท้ายเทิร์นที่กับดักทำงาน
  },

  // ---------- สกิลติดตัว ขอพลังให้ฉันด้วย: บันทึกความเสียหายก้อนล่าสุด ----------
  //  แปะไว้ที่ adjustIncomingDamage เพราะเป็นจุดเดียวที่เห็น "ขนาดของก้อนดาเมจ" ก่อนถูกหั่นเข้าเกราะ/เลือด
  //  และทุกท่อ (dealMixed/dealDirect/dealArmorOnly) วิ่งผ่านที่นี่หมด -> ครอบคลุม "ทุกทาง" ตามสเปค
  //  หมายเหตุ: damageSoft (ดาเมจแพ้จั่ว/ไพ่แตก) ไม่ผ่านจุดนี้ — ตั้งใจ เพราะมันไม่ใช่ "ความเสียหายจากผู้เล่นอื่น"
  //  จึงไม่ควรมีสิทธิ์ดีดค่าที่บันทึกไว้ให้ร่วงกลับพื้น
  adjustIncomingDamage(engine, p, n) {
    if (!isShido(p) || n <= 0) return n;
    if (engine.passiveSealed(p)) return n;
    const srcId = engine.effectSourceId;
    const src = srcId && engine.players[srcId];
    if (!src || src.id === p.id) return n; // ดาเมจของตัวเอง/ไม่มีต้นตอที่เป็นผู้เล่น = ไม่แตะค่าที่บันทึกไว้
    const rec = Math.max(RECORD_BASE, p.shidoRecorded || RECORD_BASE);
    if (n > rec) {
      p.shidoRecorded = n;
      engine.log(`🩸 ${p.name} ขอพลังให้ฉันด้วย — บันทึกความเสียหาย ${n} หน่วยจาก ${src.name} (เดิม ${rec})`);
    } else if (n < rec) {
      p.shidoRecorded = RECORD_BASE;
      engine.log(`🩸 ${p.name} ขอพลังให้ฉันด้วย — โดน ${src.name} เพียง ${n} หน่วย เบากว่าที่บันทึกไว้ (${rec}) ค่าที่บันทึกร่วงกลับเป็น ${RECORD_BASE}`);
    }
    return n; // ไม่แก้ค่าดาเมจ แค่จดไว้เฉยๆ
  },

  // ---------- สกิลรอง Sandalphon: แทนที่พลังโจมตีปกติด้วยพลังดาบที่ล็อกไว้ ----------
  //  ค่าที่ใช้มาจาก statusAmt (ล็อกตอนกด) ไม่ใช่ p.shidoRecorded — โดนตีใหม่ระหว่างนี้ดาบจึงไม่เปลี่ยนค่า
  attackBaseOverride(engine, attacker) {
    if (!isShido(attacker) || !swordOn(attacker)) return 1;
    return Math.max(1, swordPower(attacker));
  },

  // เพลงประจำดาบ — เล่นค้างตลอดที่ Sandalphon ยังอยู่ (เรียกจาก activeSkillMusic ของ server.js)
  activeMusic(engine) {
    let best = null;
    for (const p of engine.alivePlayers()) {
      if (!isShido(p) || !swordOn(p)) continue;
      if (!best || (p.transformAt || 0) > best.at) best = { music: SWORD_MUSIC, at: p.transformAt || 0 };
    }
    return best;
  },

  // ---------- ต้นเทิร์น: ภูติฟื้นพลังชีวิต + นับถอยหลังกับดัก ----------
  onRoundStartTick(engine, p) {
    if (!isShido(p) || !p.alive) return;
    if (spiritOn(p)) {
      const healed = engine.healHp(p, SPIRIT_HEAL);
      if (healed > 0) engine.log(`🕊️ ${p.name} ภูติ — ฟื้นพลังชีวิต +${healed} (เหลือ ${p.statuses.shidoSpirit} เทิร์น)`);
    }
    // Sandalphon: ระหว่างที่ดาบยังอยู่ ฟื้นแต้มสกิลให้เทิร์นละ 1 หน่วย
    //  ส่ง src = "passive" เพราะเป็นช่องทางฟื้นพลังงานจริงของตัวละคร (ดีบัฟ "ดูดซับเวท" มีสิทธิ์โรลกัน)
    if (swordOn(p)) {
      const before = p.skillPoints;
      engine.addSkill(p, SWORD_SKILL_REGEN, "passive");
      const got = p.skillPoints - before;
      if (got > 0) engine.log(`⚔️ ${p.name} Sandalphon — ฟื้นแต้มสกิล +${got} (เหลือ ${p.statuses.shidoSword} เทิร์น)`);
    }
  },

  // ---------- useSkill: ด่านเงื่อนไขก่อนหักแต้ม ----------
  canUseSkill(engine, p, tier) {
    if (!isShido(p)) return true;
    if (tier === "basic") return !spiritOn(p);   // ภูติยังมีผลอยู่ = กดซ้ำไม่ได้
    // Sandalphon กดได้เสมอ — ค่าที่บันทึกมีพื้นอยู่ที่ 3 อยู่แล้ว ต่อให้ยังไม่เคยโดนตีเลย
    if (tier === "ultimate") {
      if ((p.shidoGuardTurns || 0) > 0) return false;              // กับดักเปิดค้างอยู่ = กดซ้ำไม่ได้
      if (engine.roundNumber < (p.shidoRewindLock || 0)) return false; // เพิ่งย้อนเวลาไป ยังอยู่ในคูลดาวน์
      return true;
    }
    return true;
  },

  // ---------- useSkill: ลงผลของสกิล (instant ทั้งหมด — ทำงานก่อนเปิดการ์ด) ----------
  applyInstantSkill(engine, p, tier) {
    if (!isShido(p)) return "";
    if (tier === "basic") return this.applySpirit(engine, p);
    if (tier === "secondary") return this.applySword(engine, p);
    if (tier === "ultimate") return this.applyGuard(engine, p);
    return "";
  },

  // สกิลพื้นฐาน ภูติ: ฟื้นเลือดต่อเทิร์น + ดูดเลือดจากการโจมตีปกติ
  applySpirit(engine, p) {
    p.statuses.shidoSpirit = SPIRIT_TURNS;
    engine.log(`🕊️ ${p.name} ภูติ — ฟื้นพลังชีวิต ${SPIRIT_HEAL} หน่วยต่อเทิร์น และการโจมตีปกติดูดพลังชีวิต ${SPIRIT_LIFESTEAL} หน่วย เป็นเวลา ${SPIRIT_TURNS} เทิร์น`);
    return ` (${SPIRIT_TURNS} เทิร์น)`;
  },

  // สกิลรอง Sandalphon: ล็อกพลังดาบ = ความเสียหายที่บันทึกไว้ล่าสุด
  applySword(engine, p) {
    const power = Math.max(RECORD_BASE, p.shidoRecorded || RECORD_BASE);
    p.statuses.shidoSword = SWORD_TURNS;
    p.statusAmt.shidoSword = power;
    p.transformAt = engine.nextTransformCounter(); // ลำดับเพลง (ทับ/ถูกทับโดยเพลงสกิลอื่น)
    engine.log(`⚔️ ${p.name} Sandalphon — ชักดาบด้วยพลัง ${power} หน่วย (แทนที่พลังโจมตีปกติ) เป็นเวลา ${SWORD_TURNS} เทิร์น · ระหว่างนี้ฟื้นแต้มสกิล +${SWORD_SKILL_REGEN} ต่อเทิร์น`);
    return ` — พลังดาบ ${power}`;
  },

  // ท่าไม้ตาย ฝากด้วยนะตัวฉัน: เปิดกับดักเงียบๆ ไม่มี log/แบนเนอร์/คัตซีนใดๆ
  //  (useSkill ของ server.js เช็ค silentSkill() แล้วข้าม skillFlash ให้)
  applyGuard(engine, p) {
    p.shidoGuardTurns = GUARD_TURNS;
    return "";
  },

  // ท่าไม้ตายนี้ห้ามประกาศให้ใครรู้ — server.js ใช้ตัดสินว่าจะข้าม skillFlash/roundSkills ไหม
  silentSkill(p, tier) { return isShido(p) && tier === "ultimate"; },

  // กับดักเปิดอยู่ไหม — buildStateFor ใช้ตัดสินว่าจะโชว์แต้มสกิลหลอก (เต็มหลอด) ให้คนอื่นเห็นหรือเปล่า
  guardActive(p) { return isShido(p) && (p.shidoGuardTurns || 0) > 0; },

  // ---------- สกิลพื้นฐาน ภูติ: ดูดพลังชีวิตจากการโจมตีปกติ ----------
  //  เรียกจาก doAttack() หลังความเสียหายลงแล้ว — คืนจำนวนที่ฟื้นจริง (0 = ไม่ได้ฟื้น)
  onAttackLanded(engine, attacker) {
    if (!isShido(attacker) || !attacker.alive || !spiritOn(attacker)) return 0;
    const healed = engine.healHp(attacker, SPIRIT_LIFESTEAL);
    if (healed > 0) engine.log(`🕊️ ${attacker.name} ภูติ — การโจมตีดูดพลังชีวิตกลับมา +${healed}`);
    return healed;
  },

  // ---------- ท่าไม้ตาย: ชิโดตายระหว่างกับดักเปิดอยู่ -> จองการย้อนเวลา ----------
  //  ไม่ใช่การกันตาย: ปล่อยให้ตกรอบจริงก่อน แล้วค่อยจองไว้ทำตอนจบเทิร์น
  //  (ย้อนเวลากลางท่อ instantDeath ไม่ได้ — โค้ดที่เรียกมันยังถือ reference ผู้เล่นชุดเก่าค้างอยู่ทั้งสแตก)
  //  เรียกจาก instantDeath() หลังตั้ง p.alive = false แล้ว
  onDeath(engine, p) {
    if (!isShido(p) || (p.shidoGuardTurns || 0) <= 0) return;
    p.shidoGuardTurns = 0;
    p.shidoRewindPending = true;
    p.shidoDeathVideoPending = true; // เล่นเป็นรอยต่อท้ายเทิร์นนี้ (ดู flushDeathVideo)
    engine.log(`✨ ${p.name} ฝากด้วยนะตัวฉัน — เวลากำลังจะหมุนกลับ...`);
  },

  // วีดีโอ shido_skill3.mp4 เล่น "หลังหน้าจอโจมตี" เป็นรอยต่อก่อนขึ้นเทิร์นถัดไป
  //  จึงคิวที่ endTurn() ไม่ใช่ตอนตาย — ไม่งั้น runCutsceneQueue ของ doAttack จะกินคลิปไปเล่นกลางฉากโจมตี
  flushDeathVideo(engine) {
    for (const p of Object.values(engine.players)) {
      if (!isShido(p) || !p.shidoDeathVideoPending) continue;
      p.shidoDeathVideoPending = false;
      engine.queueCutscene(p, "shidoGuard");
    }
  },

  // ---------- มีการย้อนเวลารออยู่ไหม ----------
  //  endTurn() ใช้ระงับเงื่อนไขจบเกมไว้ก่อน: ชิโดเพิ่งตาย เกมอาจนับว่าเหลือผู้ชนะคนสุดท้ายทั้งที่
  //  อีกครู่ทุกคนจะถูกย้อนกลับไปเป็นเมื่อ 5 เทิร์นก่อน (คนที่ตายไปแล้วก็กลับมา)
  rewindPending(engine) {
    return Object.values(engine.players).some((p) => isShido(p) && p.shidoRewindPending);
  },

  // ---------- ย้อนเวลากลับ 5 เทิร์น ----------
  //  เรียกจาก endTurn() "หลังวีดีโอเล่นจบ" และ "ก่อน" เงื่อนไขจบเกม/ขึ้นรอบถัดไป
  //  ย้อนทุกอย่างที่สแนปช็อตเก็บไว้: พลังชีวิต/เกราะ/สถานะ/แต้มสกิล/เหรียญ/ไอเทม/คนที่ตายไปแล้ว
  //  รวมถึงเลขรอบ + วงจรกลางวัน-กลางคืน + ของในร้านค้า
  //
  //  กันย้อนวนไม่รู้จบ: สแนปช็อตย้อนแต้มสกิล 8 หน่วยคืนให้ชิโดและลบร่องรอยว่าเคยกดท่านี้ไปด้วย
  //  ถ้าไม่กันอะไรเลยเขาจะกดย้อนซ้ำได้ทุกครั้งที่ตาย -> เกมไม่มีวันจบ
  //  จึงเก็บ p.shidoRewindLock ไว้ "นอกการย้อน" (ส่งผ่าน keepPerPlayer ของ applySnapshot)
  //  = ย้อนไปรอบ 7 แล้วล็อกถึงรอบ 12 -> ต้องเดินหน้าครบ 5 เทิร์นจริงๆ ก่อนถึงจะอาร์มกับดักได้อีก
  applyRewind(engine, p) {
    if (!isShido(p) || !p.shidoRewindPending) return false;
    p.shidoRewindPending = false;

    const snap = engine.snapshotBefore(REWIND_TURNS);
    if (!snap) {
      // ไม่มีประวัติให้ย้อน (เพิ่งเริ่มเกมจริงๆ) — ตาข่ายสำรอง: อย่างน้อยอย่าให้เขาตายฟรีทั้งที่จ่าย 8 แต้ม
      p.alive = true;
      p.hp = Math.max(1, Math.min(engine.maxHpOf(p), REWIND_HEAL));
      p.locked = false;
      p.result = null;
      engine.log(`⏳ ${p.name} ฝากด้วยนะตัวฉัน — ยังไม่มีอดีตให้ย้อนกลับไป จึงกลับมาด้วยพลังชีวิต ${p.hp}`);
      return true;
    }

    const shidoId = p.id;
    const lockUntil = snap.round + REWIND_LOCK_TURNS;
    engine.applySnapshot(snap, (live) => (live.id === shidoId
      ? { shidoRewindLock: lockUntil, shidoRewindPending: false, shidoGuardTurns: 0 }
      : null));
    engine.setRoundNumber(snap.round - 1); // dealRound() จะ ++ กลับเป็น snap.round แล้วเล่นเทิร์นนั้นใหม่
    engine.clearSnapshotHistory();         // ประวัติหลังจุดนี้เป็น "อนาคตที่ถูกลบทิ้ง" แล้ว

    // ชิโดฉบับที่ถูกย้อนกลับมา = object เดิม (applySnapshot เขียนทับในที่) แต่หยิบใหม่กันพลาด
    const me = engine.players[shidoId];
    if (me) {
      const healed = engine.healHp(me, REWIND_HEAL);
      engine.log(`⏳ ${me.name} ฝากด้วยนะตัวฉัน — ย้อนเวลากลับไปรอบที่ ${snap.round} ทุกอย่างกลับเป็นเหมือนเดิม!${healed > 0 ? ` (ฟื้นพลังชีวิตเพิ่ม +${healed})` : ""}`);
    }
    return true;
  },

  // ---------- นับถอยหลังกับดักท้ายเทิร์น ----------
  //  ไม่ได้อยู่ใน p.statuses จึงไม่เข้าลูปลดเทิร์นของ endTurn() ต้องลดเอง
  onEndTurn(engine, p) {
    if (!isShido(p) || (p.shidoGuardTurns || 0) <= 0) return;
    p.shidoGuardTurns--;
    // หมดเวลาแบบเงียบๆ เหมือนตอนกด — ไม่มี log ให้คนอื่นเดาได้ว่าเขาเคยเปิดกับดักไว้
  },
};
