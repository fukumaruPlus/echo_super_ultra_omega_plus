// ============================================================
//  มาคุโนะอุจิ อิปโป (patch 3.3 new) — Guard Up / Uper Cut / Dempsey roll
//  + สกิลติดตัว "ผู้ยืนหยัด"
//
//  นักมวยที่เล่นเกม "ยิ่งหลบได้ ยิ่งแรง" — อัตราหลบหลีกเป็นทรัพยากรหลักของตัวละคร
//  ซ้อนทับได้ 3 ชั้น (ดู dodgeChance) และการหลบสำเร็จคือสิ่งที่ป้อนทุกอย่างให้เขา:
//    · ผู้ยืนหยัด  -> หลบสำเร็จ = อัตราหลบ +10% (สูงสุด +20% · หายทันทีเมื่อโดนตี) + แต้มสกิล +1
//    · Dempsey roll -> หลบสำเร็จ = สะสม Dempsey Charge +1 (สูงสุด 3)
//  แล้วเทหมดหน้าตักตอนโจมตี: Dempsey Charge ทุก 1 หน่วย = โจมตีเพิ่ม 1 ครั้ง (สูงสุด 3)
//  พอโจมตีสำเร็จปุ๊บ บัฟหายทั้งก้อน -> วนกลับไปสะสมใหม่
//
//  โครงหลบหลีกยืมแพทเทิร์นเดียวกับเอจิ (characters/eiji.js) เพราะเป็นระบบเดียวกัน:
//    tryDodge() ตัดสินโรล · tryAttackDodge() เสียบใน doAttack() · adjustIncomingDamage() กันดาเมจสกิล
//  ต่างกันที่อิปโป **ไม่มีโควตาหลบต่อเทิร์น** (เอจิหลบได้ 1 ครั้ง/เทิร์น) — ของอิปโปหลบได้ไม่จำกัด
//  เพราะทั้งตัวละครถูกออกแบบให้หมุนรอบการหลบ ถ้าจำกัดโควตาจะไม่มีทางสะสม Charge ได้เลย
// ============================================================

const ID = "ippo";

// ---------- ค่าสถานะพื้นฐาน ----------
const IPPO_MAX_HP = 5;
const IPPO_MAX_ARMOR = 4;        // "โล่ 4" = เกราะ (เพดาน 4 แทน 3 ปกติ)
const BASE_DODGE = 20;           // อัตราหลบหลีกพื้นฐาน (%)

// ---------- สกิลติดตัว ผู้ยืนหยัด ----------
const STAND_DODGE_STEP = 10;     // หลบสำเร็จ -> อัตราหลบ +10%
const STAND_DODGE_MAX = 20;      // สะสมได้สูงสุด +20% (หายทั้งหมดเมื่อโดนตี)
const STAND_SKILL_REFUND = 1;    // หลบสำเร็จ -> แต้มสกิล +1
const STUN_ATK_BONUS = 1;        // ตีคนที่ติดสตั้น -> พลังโจมตีพื้นฐาน +1

// ---------- สกิลพื้นฐาน Guard Up ----------
const GUARD_COOLDOWN = 3;        // คูลดาวน์ (เทิร์น)
const GUARD_ARMOR = 2;           // ฟื้นเกราะ

// ---------- สกิลรอง Uper Cut ----------
const UPPER_COOLDOWN = 3;
const UPPER_STUN_TURNS = 1;      // เป้าหมายไม่มีเกราะ -> สตั้น (เริ่มมีผลเทิร์นถัดไป)
const UPPER_DECAY_TURNS = 3;     // เป้าหมายมีเกราะ -> ผุพัง

// ---------- ท่าไม้ตาย Dempsey roll ----------
const DEMPSEY_COOLDOWN = 4;
const DEMPSEY_MAX = 3;           // Dempsey Charge สะสมสูงสุด (0/3)
const DEMPSEY_DODGE_STEP = 10;   // 1 หน่วย -> อัตราหลบ +10% (สูงสุด 30% = 3 หน่วย)
const DEMPSEY_MUSIC = "ippo_theme";

const IMG = {
  base: "/characters/ippo/ippo_profile.png",
  skill1: "/characters/ippo/skill1/ippo_skill1.png",
  skill2: "/characters/ippo/skill2/ippo_skill2.png",
  skill3: "/characters/ippo/skill3/ippo_skill3.png",
};

function isIppo(p) { return !!p && p.characterId === ID; }
function standStacks(p) { return isIppo(p) ? Math.min(STAND_DODGE_MAX, p.ippoStandDodge || 0) : 0; }
function chargeOf(p) { return isIppo(p) ? Math.min(DEMPSEY_MAX, p.ippoCharge || 0) : 0; }
function dempseyOn(p) { return isIppo(p) && (p.statuses.ippoDempsey || 0) > 0; }

// อัตราหลบหลีกรวมของตอนนี้ (%) — ฐาน 20 + ผู้ยืนหยัด (สูงสุด +20) + Dempsey Charge (สูงสุด +30)
function dodgeChance(p) {
  if (!isIppo(p)) return 0;
  return BASE_DODGE + standStacks(p) + chargeOf(p) * DEMPSEY_DODGE_STEP;
}

module.exports = {
  id: ID,
  IMG,
  MAX_HP: IPPO_MAX_HP,
  MAX_ARMOR: IPPO_MAX_ARMOR,
  BASE_DODGE,
  STAND_DODGE_STEP,
  STAND_DODGE_MAX,
  STAND_SKILL_REFUND,
  STUN_ATK_BONUS,
  GUARD_COOLDOWN,
  GUARD_ARMOR,
  UPPER_COOLDOWN,
  UPPER_STUN_TURNS,
  UPPER_DECAY_TURNS,
  DEMPSEY_COOLDOWN,
  DEMPSEY_MAX,
  DEMPSEY_DODGE_STEP,
  dodgeChance,
  chargeOf,
  standStacks,

  maxHp() { return IPPO_MAX_HP; },
  maxArmor() { return IPPO_MAX_ARMOR; },

  // ---------- ฟิลด์เฉพาะตัวละคร: ต้องล้างทุกแมตช์ใหม่ (เรียกจาก resetCombat ของ server.js) ----------
  resetCombat(p) {
    p.ippoStandDodge = 0;   // ผู้ยืนหยัด: % หลบที่สะสมจากการหลบสำเร็จ (0-20 · หายเมื่อโดนตี)
    p.ippoCharge = 0;       // Dempsey Charge ที่สะสมไว้ (0-3)
    p.ippoUpper = false;    // Uper Cut ติดอยู่ไหม (ลงผลกับการโจมตีครั้งถัดไป)
    p.ippoExtraAtk = 0;     // จำนวนครั้งโจมตีเพิ่มที่ค้างอยู่จาก Dempsey Charge
    p.ippoCd = {};          // คูลดาวน์รายสกิล: { basic, secondary, ultimate } = เลขรอบที่กดได้อีกครั้ง
  },

  // ---------- คูลดาวน์ (เก็บเป็น "เลขรอบ" ไม่ใช่ตัวนับ — ไม่ได้อยู่ใน p.statuses จึงไม่มีใครลดให้) ----------
  cooldownLeft(engine, p, tier) {
    if (!isIppo(p)) return 0;
    const until = (p.ippoCd && p.ippoCd[tier]) || 0;
    return Math.max(0, until - engine.roundNumber + 1);
  },
  setCooldown(engine, p, tier, turns) {
    p.ippoCd = p.ippoCd || {};
    p.ippoCd[tier] = engine.roundNumber + turns;
  },

  // ---------- useSkill: ด่านเงื่อนไขก่อนหักแต้ม ----------
  canUseSkill(engine, p, tier) {
    if (!isIppo(p)) return true;
    if (this.cooldownLeft(engine, p, tier) > 0) return false;
    // Dempsey roll: ระหว่างที่บัฟยังอยู่ กดซ้ำไม่ได้ (ไม่งั้นรีเซ็ตสแตคตัวเองทิ้ง)
    if (tier === "ultimate" && dempseyOn(p)) return false;
    return true;
  },

  // ---------- useSkill: ลงผลของสกิล ----------
  applyInstantSkill(engine, p, tier) {
    if (!isIppo(p)) return "";
    if (tier === "basic") return this.applyGuard(engine, p);
    if (tier === "secondary") return this.applyUpper(engine, p);
    if (tier === "ultimate") return this.applyDempsey(engine, p);
    return "";
  },

  // ---------- สกิลพื้นฐาน Guard Up ----------
  applyGuard(engine, p) {
    this.setCooldown(engine, p, "basic", GUARD_COOLDOWN);
    const got = engine.healArmor(p, GUARD_ARMOR);
    engine.log(`🥊 ${p.name} Guard Up — ยกการ์ดขึ้นรับ ฟื้นเกราะ +${got} (คูลดาวน์ ${GUARD_COOLDOWN} เทิร์น)`);
    return ` — เกราะ +${got}`;
  },

  // ---------- สกิลรอง Uper Cut ----------
  //  ทำงาน "หลังเปิดไพ่" ตามสเปค = ติดธงไว้ แล้วไปออกฤทธิ์ตอนโจมตีจริงในเฟส ATTACK
  applyUpper(engine, p) {
    this.setCooldown(engine, p, "secondary", UPPER_COOLDOWN);
    p.ippoUpper = true;
    engine.log(`🥊 ${p.name} Uper Cut — เตรียมหมัดเสยไว้แล้ว: การโจมตีครั้งถัดไป ถ้าเป้าหมายไม่มีเกราะจะมอบ "สตั้น" ${UPPER_STUN_TURNS} เทิร์น (เริ่มเทิร์นหน้า) · ถ้ามีเกราะจะมอบ "ผุพัง" ${UPPER_DECAY_TURNS} เทิร์น`);
    return " — เตรียมหมัดเสย";
  },

  // เรียกจาก doAttack() หลังลงความเสียหายแล้ว — คืน object สรุปผลไว้ทำการ์ดเอฟเฟกต์ (null = ไม่ได้ทำงาน)
  //  เช็คเกราะ "ก่อนโดนหมัดนี้" (armorBefore) เพราะหมัดอาจพังเกราะหมดพอดี ซึ่งไม่ควรพลิกผลของท่า
  resolveUpper(engine, attacker, target, armorBefore) {
    if (!isIppo(attacker) || !attacker.ippoUpper || !target || !target.alive) return null;
    attacker.ippoUpper = false;
    if (armorBefore > 0) {
      const ok = engine.applyDebuff(target, "decay", null, UPPER_DECAY_TURNS);
      engine.log(ok
        ? `🥊 ${attacker.name} Uper Cut — ${target.name} มีเกราะรับไว้ ติด "ผุพัง" ${UPPER_DECAY_TURNS} เทิร์น`
        : `🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติด "ผุพัง" จาก Uper Cut`);
      return { kind: "decay", ok };
    }
    // ไม่มีเกราะ = หมัดเข้าเต็มๆ -> สตั้นเริ่มมีผล "เทิร์นถัดไป" (แพทเทิร์นเดียวกับ Gargorgon Ray/อมาซอน)
    target.ippoStunPending = UPPER_STUN_TURNS;
    engine.log(`🥊 ${attacker.name} Uper Cut — ${target.name} ไม่มีเกราะรับ! หมัดเสยเข้าเต็มๆ เทิร์นถัดไปจะติด "สตั้น" ${UPPER_STUN_TURNS} เทิร์น`);
    return { kind: "stun", ok: true };
  },

  // ---------- ท่าไม้ตาย Dempsey roll ----------
  applyDempsey(engine, p) {
    this.setCooldown(engine, p, "ultimate", DEMPSEY_COOLDOWN);
    p.statuses.ippoDempsey = 1; // ธง "บัฟเปิดอยู่" — ไม่นับเทิร์น (ดู endTurn ที่ต้อง continue)
    p.ippoCharge = 0;
    p.transformAt = engine.nextTransformCounter();
    engine.queueCutscene(p, "ippoDempsey"); // อัลติเมท.mp4
    engine.log(`🥊 ${p.name} Dempsey roll — เข้าท่า! สะสม Dempsey Charge 0/${DEMPSEY_MAX} (หลบสำเร็จ +1 · ทุกหน่วยให้หลบหลีก +${DEMPSEY_DODGE_STEP}% และโจมตีเพิ่ม 1 ครั้ง) — หายทั้งก้อนเมื่อโจมตีสำเร็จ`);
    return " — เข้าท่า Dempsey";
  },

  // เพลงประจำท่า — เล่นค้างตลอดที่บัฟยังอยู่ (เรียกจาก activeSkillMusic)
  activeMusic(engine) {
    let best = null;
    for (const p of engine.alivePlayers()) {
      if (!dempseyOn(p)) continue;
      if (!best || (p.transformAt || 0) > best.at) best = { music: DEMPSEY_MUSIC, at: p.transformAt || 0 };
    }
    return best;
  },

  // ---------- หลบหลีก ----------
  //  ไม่มีโควตาต่อเทิร์นโดยตั้งใจ (ต่างจากเอจิ) — ทั้งตัวละครหมุนรอบการหลบ
  tryDodge(engine, p, what) {
    if (!isIppo(p) || !p.alive) return false;
    const pct = dodgeChance(p);
    if (pct <= 0) return false;
    if (Math.random() * 100 >= pct) {
      engine.log(`💢 ${p.name} พยายามหลบ${what ? ` ${what}` : ""} (${pct}%) แต่ไม่พ้น`);
      return false;
    }
    engine.queueCutscene(p, "ippoDodge"); // หลบหลีก.mp4 — เล่นทุกครั้งที่หลบสำเร็จ
    engine.log(`💨 หลบหลีก! ${p.name} หลบ${what ? ` ${what}` : "การโจมตี"}ได้ (${pct}%)`);
    // สกิลติดตัว ผู้ยืนหยัด: หลบสำเร็จ -> อัตราหลบสะสม +10% (สูงสุด +20) + แต้มสกิล +1
    const before = standStacks(p);
    p.ippoStandDodge = Math.min(STAND_DODGE_MAX, before + STAND_DODGE_STEP);
    if (p.ippoStandDodge > before) engine.log(`🧍 ${p.name} ผู้ยืนหยัด — อัตราหลบหลีกสะสม +${STAND_DODGE_STEP}% (รวม +${p.ippoStandDodge}%)`);
    engine.addSkill(p, STAND_SKILL_REFUND, "passive");
    engine.log(`✨ ${p.name} ผู้ยืนหยัด — หลบสำเร็จ ฟื้นแต้มสกิล +${STAND_SKILL_REFUND}`);
    // Dempsey roll: หลบสำเร็จ -> สะสม Charge +1
    if (dempseyOn(p) && chargeOf(p) < DEMPSEY_MAX) {
      p.ippoCharge = chargeOf(p) + 1;
      engine.log(`🌀 ${p.name} Dempsey Charge ${p.ippoCharge}/${DEMPSEY_MAX} — หลบหลีก ${dodgeChance(p)}% · โจมตีเพิ่ม ${p.ippoCharge} ครั้ง`);
    }
    return true;
  },

  // เรียกจาก doAttack() ก่อนคิดดาเมจ — คืน true ถ้าหลบพ้น (ผู้เรียกต้อง return ทันที)
  tryAttackDodge(engine, attacker, target) {
    if (!isIppo(target)) return false;
    if (!this.tryDodge(engine, target, `การโจมตีของ ${attacker.name}`)) return false;
    target.wasAttacked = true;
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, dodge: true,
      skills: [{ name: `หลบหลีก (${dodgeChance(target)}%)`, img: IMG.base, by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // เรียกจาก adjustIncomingDamage() — หลบดาเมจจากสกิล (การโจมตีปกติจัดการที่ tryAttackDodge แล้ว)
  //  และเป็นจุดที่ "โดนตี = อัตราหลบสะสมของผู้ยืนหยัดหายทั้งหมด"
  adjustIncomingDamage(engine, p, n, isNormalAttack) {
    if (!isIppo(p) || n <= 0) return n;
    if (!isNormalAttack && !p._statusDamage && this.tryDodge(engine, p, "ความเสียหายจากสกิล")) return 0;
    // หลบไม่พ้น (หรือเป็นการโจมตีปกติที่หลุดด่าน tryAttackDodge มาแล้ว) = โดนเต็มๆ
    if (standStacks(p) > 0) {
      engine.log(`🧍 ${p.name} ผู้ยืนหยัด — โดนหมัดเข้าเต็มๆ อัตราหลบหลีกที่สะสมไว้ (+${standStacks(p)}%) หายหมด`);
      p.ippoStandDodge = 0;
    }
    return n;
  },

  // ---------- สกิลติดตัว: ตีคนที่ติดสตั้น พลังโจมตีพื้นฐาน +1 ----------
  damageBonus(engine, attacker, target, ctx) {
    if (!isIppo(attacker) || !target) return 0;
    const stunned = (target.statuses.stun || 0) > 0;
    ctx.ippoStunAtk = stunned;
    return stunned ? STUN_ATK_BONUS : 0;
  },

  // ---------- โจมตีเพิ่มตาม Dempsey Charge ----------
  //  เรียกจาก doAttack() หลังหมัดลงแล้ว — คืนจำนวนครั้งที่ต้องตีเพิ่ม แล้วล้างบัฟทั้งก้อน
  //  (สเปค: "หายไปเมื่อโจมตีสำเร็จ" — เทหมดหน้าตักครั้งเดียว)
  consumeCharge(engine, p) {
    if (!dempseyOn(p)) return 0;
    const stacks = chargeOf(p);
    delete p.statuses.ippoDempsey;
    if (p.statusAmt) delete p.statusAmt.ippoDempsey;
    p.ippoCharge = 0;
    if (stacks > 0) {
      engine.queueCutscene(p, "ippoRoll"); // Dempsey roll.mp4 — เล่นตอนออกหมัดพร้อม Charge
      engine.log(`🥊🌀 ${p.name} DEMPSEY ROLL! — ปล่อยหมัดรัว ${stacks} ครั้งติด แล้วท่าคลายออก`);
    } else {
      engine.log(`🥊 ${p.name} ออกหมัดโดยยังไม่มี Dempsey Charge — ท่าคลายออกโดยเปล่าประโยชน์`);
    }
    return stacks;
  },
  // มีบัฟอยู่ไหม (ใช้เลือกวีดีโอ/แสดงผลฝั่ง client)
  dempseyActive(p) { return dempseyOn(p); },

  // ---------- เปิดเฟสโจมตีเพิ่มตาม Dempsey Charge ----------
  //  เรียกจาก postAttackFollowup() — คืน true = เปิดเฟส ATTACK ใหม่ (ผู้เรียกต้อง return ทันที)
  //  จำนวนครั้งที่เหลือเก็บที่ p.ippoExtraAtk แล้วนับถอยหลังทีละครั้ง (แพทเทิร์นเดียวกับคอมโบของทาคุโตะ)
  startExtraAttack(engine, attacker) {
    if (!isIppo(attacker) || !attacker.alive) return false;
    if (!(attacker.ippoExtraAtk > 0)) return false;
    const targets = engine.attackableTargets(attacker.id);
    if (targets.length === 0) { attacker.ippoExtraAtk = 0; return false; }
    attacker.ippoExtraAtk--;
    engine.log(`🥊🌀 ${attacker.name} DEMPSEY ROLL — หมัดต่อเนื่อง! (เหลืออีก ${attacker.ippoExtraAtk} ครั้งหลังหมัดนี้)`);
    engine.setAttackerId(attacker.id);
    engine.setGameState("ATTACK");
    engine.startPhaseTimer(engine.ATTACK_TIME, () => {
      const t = engine.attackableTargets(engine.attackerId);
      if (t.length) engine.doAttack(engine.attackerId, t[Math.floor(Math.random() * t.length)].id);
      else engine.endTurn();
    });
    engine.broadcastState();
    return true;
  },

  // ---------- ต้นเทิร์น: สตั้นที่ Uper Cut ตั้งไว้เมื่อเทิร์นก่อน เริ่มมีผลตอนนี้ ----------
  //  ต้องเรียก "ก่อน" บล็อกเช็คสตั้นของ startRound() ไม่งั้นสตั้นจะเลื่อนไปอีกเทิร์น
  //  (เหตุผลเดียวกับ Gargorgon Ray และอมาซอนของฮารุกะ)
  applyPendingStun(engine, p) {
    if (!p.ippoStunPending) return;
    const turns = p.ippoStunPending;
    p.ippoStunPending = 0;
    if (engine.applyDebuff(p, "stun", null, turns)) engine.log(`😵 ${p.name} โดน Uper Cut เมื่อเทิร์นก่อน — ติดสถานะสตั้น ${turns} เทิร์น!`);
    else engine.log(`🛡️ ${p.name} ต้านผลของ Uper Cut ไว้ได้ — ไม่ติดสตั้น`);
  },
};
