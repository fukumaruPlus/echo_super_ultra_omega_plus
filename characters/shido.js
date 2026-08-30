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
const GUARD_TURNS = 2;           // กับดักเปิดอยู่กี่เทิร์น (นับถอยหลังบนการ์ดสกิล เห็นคนเดียว)
const REVIVE_DELAY = 5;          // ตายระหว่างกับดักเปิด -> เกิดใหม่อีกกี่เทิร์น
const REVIVE_HP = 5;
const REVIVE_ARMOR = 3;
const REVIVE_SKILL = 4;          // ฟื้นแต้มสกิลให้ด้วยตอนกลับมา
const REVIVE_RUSH_ALIVE = 1;     // เหลือผู้เล่นอื่นไม่เกินเท่านี้คน -> ฟื้นเทิร์นถัดไปทันที ไม่ต้องรอครบ 5

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
  REVIVE_DELAY,
  REVIVE_HP,
  REVIVE_ARMOR,
  REVIVE_SKILL,

  // ---------- ฟิลด์เฉพาะตัวละคร: ต้องล้างทุกแมตช์ใหม่ (เรียกจาก resetCombat ของ server.js) ----------
  resetCombat(p) {
    p.shidoRecorded = RECORD_BASE; // ความเสียหายที่บันทึกไว้ (เริ่มที่พื้น 3 — ไม่มีทางต่ำกว่านี้)
    p.shidoGuardTurns = 0;        // ฝากด้วยนะตัวฉัน: กับดักเหลืออีกกี่เทิร์น (เห็นคนเดียว)
    p.shidoReviveRound = 0;       // ตายพร้อมกับดัก -> เทิร์นที่จะฟื้น (0 = ไม่มีคิว)
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
    if (tier === "ultimate") return (p.shidoGuardTurns || 0) <= 0; // กับดักเปิดค้างอยู่ = กดซ้ำไม่ได้
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

  // ---------- ท่าไม้ตาย: ชิโดตายระหว่างกับดักเปิดอยู่ -> จองคิวเกิดใหม่ ----------
  //  ไม่ใช่การกันตาย: ปล่อยให้ตกรอบจริงก่อน แล้วค่อยจองคิว (แพทเทิร์นเดียวกับคอนเนอร์ RK800)
  //  เรียกจาก instantDeath() หลังตั้ง p.alive = false แล้ว
  onDeath(engine, p) {
    if (!isShido(p) || (p.shidoGuardTurns || 0) <= 0) return;
    p.shidoGuardTurns = 0;
    p.shidoReviveRound = engine.roundNumber + REVIVE_DELAY;
    p.shidoDeathVideoPending = true; // เล่นเป็นรอยต่อท้ายเทิร์นนี้ (ดู flushDeathVideo)
    engine.log(`✨ ${p.name} ฝากด้วยนะตัวฉัน — ร่างสลายไป แต่จะกลับมาอีกครั้ง`);
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

  // ---------- เกมยังจบไม่ได้ถ้าชิโดกำลังรอเกิดใหม่ ----------
  //  ต่างจากคอนเนอร์ RK800 ที่ "เกมจบก่อนก็ไม่ได้ฟื้น" — ของชิโดระบุชัดว่าต้องรอเขากลับมาก่อน
  blocksGameOver(engine) {
    return Object.values(engine.players).some((p) => isShido(p) && !p.alive && (p.shidoReviveRound || 0) > 0);
  },

  // ---------- ฟื้นคืนชีพ — เรียกจาก dealRound() ก่อนบล็อกข้ามผู้เล่นที่ตายแล้ว ----------
  //  เร่งให้ฟื้นเทิร์นถัดไปทันทีถ้าเหลือผู้เล่นอื่นไม่เกิน 1 คน (ไม่งั้นเกมจะค้างรอครบ 5 เทิร์นโดยไม่มีอะไรเกิดขึ้น)
  maybeRevive(engine, p) {
    if (!isShido(p) || p.alive || (p.shidoReviveRound || 0) <= 0) return false;
    const othersAlive = engine.alivePlayers().filter((o) => o.id !== p.id).length;
    const rush = othersAlive <= REVIVE_RUSH_ALIVE;
    if (!rush && engine.roundNumber < p.shidoReviveRound) return false;
    p.shidoReviveRound = 0;
    p.alive = true;
    p.hp = Math.min(engine.maxHpOf(p), REVIVE_HP);
    p.armor = Math.min(engine.maxArmorOf(p), REVIVE_ARMOR);
    p.result = null;
    p.locked = false;
    p.shield = 0;
    p.statuses = {};
    p.statusAmt = {};
    p.shidoRecorded = RECORD_BASE; // กลับมาเริ่มนับใหม่จากพื้น
    // ฟื้นแต้มสกิลให้ด้วย ไม่งั้นกลับมาแบบกดอะไรไม่ได้เลย (ท่านี้กินไป 8 แต้ม)
    //  ตั้งค่าตรงๆ ไม่ผ่าน addSkill: ตอนนี้ยังไม่ผ่านด่านบล็อกการฟื้นแต้ม (stagger/manaSeal ฯลฯ)
    //  เพราะเพิ่งล้าง statuses ทิ้งไปแล้ว และ "การเกิดใหม่" ควรได้ทุนตั้งต้นเท่ากันเสมอ
    p.skillPoints = Math.min(engine.maxSkillOf(p), REVIVE_SKILL);
    engine.log(`✨ ${p.name} ฝากด้วยนะตัวฉัน — กลับมาอีกครั้งด้วยพลังชีวิต ${p.hp} เกราะ ${p.armor} และแต้มสกิล ${p.skillPoints}${rush ? " (เหลือคู่ต่อสู้คนสุดท้าย จึงฟื้นทันที)" : ""}!`);
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
