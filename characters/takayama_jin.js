// ============================================================
//  ทาคายามะ จิน (ความยาก ปานกลาง) — ไข่ต้ม / กระชาก (บังคับเป้าหมาย) / Alpha (แปลงร่าง)
//  + สกิลติดตัว "ความบ้าคลั่ง" (เลือดสำรองตอนตายในอัลฟา) · "ฉันได้กลิ่นเลือด" (สวนกลับ 3 แบบ) · "มนุษย์ธรรมดา"
//
//  ร่าง "อัลฟา" (ท่าไม้ตาย) เป็นแกนกลางของตัวละคร — เปลี่ยนพฤติกรรมเกือบทุกอย่างขณะทำงานอยู่:
//    · โจมตีปกติแปะ "เลือดไหล" ให้เป้าหมาย 3 หน่วยทุกครั้ง (onAttackLanded)
//    · ชนะการโจมตีปกติแล้วมีโอกาส 50% ตีพลาด — ดาเมจ 0 แต่ยังนับว่าโจมตีไปแล้ว (tryMiss)
//    · มีเป้าหมายให้เลือกมากกว่า 1 คน = สุ่มเป้าหมายเสมอ ไม่ใช่ผู้เล่นเลือก (maybeRandomTarget)
//    · ไม่มีเกราะแล้วโดนดาเมจ = เลือดไหลตัวเอง 1 หน่วย (ไม่จำกัดจำนวนครั้งต่อเทิร์น — onDamaged)
//    · "เลือดไหล" ของตัวเองไม่ทำร้ายจิน กลับฟื้นเลือดแทน (hbleedHeals — เฉพาะตอนอยู่ในอัลฟาเท่านั้น)
//    · ตายขณะอยู่ในอัลฟา = ยังไม่ตายจริง มีเลือดสำรอง (หนี้) — ต้องฟื้นเลือดชดเชยให้กลับมาเป็นเลือดจริง (≥1)
//      ก่อนต้นเทิร์นถัดไป ไม่งั้นตายจริงทันที — ดาเมจที่ได้รับเพิ่มระหว่างติดหนี้จะเพิ่มหนี้ต่อไปเรื่อยๆ ไม่ตายซ้ำทันที
//      (ดู p.jinShadowHp: เก็บ "เลือดจริงที่ควรจะเป็น" แบบติดลบได้ไว้ต่างหาก — p.hp ถูกตรึงไว้ที่ 1 ระหว่างติดหนี้)
//
//  "ฉันได้กลิ่นเลือด" ทำงานเฉพาะในอัลฟาเช่นกัน — ทุกครั้งที่โดนดาเมจ (ไม่ว่าทางใด) จะแปะเลือดไหลให้ผู้โจมตี
//  + ฟื้นแต้มสกิลให้จิน แล้วมีโอกาสสวนกลับ 3 แบบ (ดู onSmellBlood/adjustIncomingDamage) เพิ่มโอกาสได้ด้วยสถานะ
//  "เครื่องใน" จากสกิลรอง "กระชาก" ซึ่งดันอัตราสวนกลับ "ทั้ง 3 แบบ" ขึ้นเป็น 50% เท่ากันหมด
//  (ใช้ได้เฉพาะในอัลฟา — บังคับเป้าหมายที่มีเลือดไหลอยู่แล้วให้โจมตี/ใช้สกิลใส่จิน
//  แทนที่จะเลือกเป้าหมายเองได้ 1 เทิร์น — ตัวบังคับจริงอยู่ที่ server.js's doAttack()/dealMixed()/dealDirect()/dealArmorOnly())
// ============================================================

const ID = "jin";

// ---------- ไข่ต้ม (สกิลพื้นฐาน) ----------
const BASIC_USES_PER_TURN = 2;
const BASIC_HEAL_HP = 2;
const BASIC_HEAL_SKILL = 3;
const BASIC_ROLL_HP = 50; // 0-49 ฟื้นเลือด · 50-99 ฟื้นแต้มสกิล (50/50)

// ---------- กระชาก (สกิลรอง) ----------
const ORGANS_TURNS = 1;      // "เครื่องใน": 1 เทิร์น
const GRAB_FORCE_TURNS = 1;  // เป้าหมายถูกบังคับให้ดาเมจทุกชนิดลงที่จินแทน 1 เทิร์น

// ---------- Alpha (ท่าไม้ตาย) ----------
const ALPHA_TURNS = 5;
const ALPHA_BLEED_ON_ATK = 3;

// ---------- ความบ้าคลั่ง (สกิลติดตัว 1) ----------
const MADNESS_MISS_CHANCE = 0.5;
const FAKE_HP_RESERVE = 7; // ค่าอ้างอิงเชิงฟังก์ชัน (ดู tryFakeDeath) — จำนวนจริงคำนวณจากดาเมจที่ทะลุ 0 ไป

// ---------- ฉันได้กลิ่นเลือด (สกิลติดตัว 2) ----------
const SMELL_BLEED_ON_HIT = 2;
const CAPTURED_CHANCE = 0.15;
const CAPTURED_CHANCE_ORGANS = 0.50;
const CAPTURED_NODRAW_TURNS = 1;
const CAPTURED_HEAL = 2;
const ARM_CHANCE = 0.10;
const ARM_CHANCE_ORGANS = 0.50;
const ARM_NOSKILL_TURNS = 1;
const ARM_HEAL = 1;
const THIS_IS_ME_CHANCE = 0.30;
const THIS_IS_ME_CHANCE_ORGANS = 0.50;
const THIS_IS_ME_BLEED_NEED = 5;

const IMG = {
  base: "/characters/jin/jin.webp",
  alpha: "/characters/jin/alpha.webp",
  skill1: "/characters/jin/skill1/jin_skill1.jpg",
  skill2: "/characters/jin/skill2/jin_skill2.jpg",
  skill3: "/characters/jin/skill3/jin_skill3.jpg",
};

function isJin(p) { return !!p && p.characterId === ID; }
function alphaOn(p) { return isJin(p) && ((p.statuses && p.statuses.jinAlpha) || 0) > 0; }
function organsOn(p) { return isJin(p) && ((p.statuses && p.statuses.jinOrgans) || 0) > 0; }
function bleedOf(p) { return (p && p.statuses && p.statuses.hbleed) || 0; }

module.exports = {
  id: ID,
  IMG,
  BASIC_USES_PER_TURN,
  FAKE_HP_RESERVE,

  displayImg(p) { return alphaOn(p) ? IMG.alpha : null; },
  alphaActive: alphaOn,
  organsActive: organsOn,

  // ---------- Alpha: พลังโจมตีพื้นฐาน +1 ตลอดที่ยังอยู่ในร่าง ----------
  // เรียกจาก computeAttackBase()
  damageBonus(engine, attacker) {
    return alphaOn(attacker) ? 1 : 0;
  },

  // ---------- "เลือดไหล" ฝั่งจิน (ฮุคของ _universal_status.js) — เฉพาะตอนอยู่ในอัลฟาเท่านั้น ----------
  hbleedHeals(p) { return alphaOn(p); },
  hbleedLabel(p) { return alphaOn(p) ? "ความบ้าคลั่ง" : null; },

  // ---------- เงื่อนไขการกด — เรียกจาก useSkill() ก่อนหักแต้ม ----------
  canUseSkill(engine, p, tier) {
    if (tier === "basic") return (p.jinBasicUses || 0) < BASIC_USES_PER_TURN;
    if (tier === "secondary") return alphaOn(p);
    if (tier === "ultimate") return !alphaOn(p);
    return true;
  },

  // ---------- เป้าหมายของ "กระชาก" — ต้องมีสถานะ "เลือดไหล" ติดอยู่แล้วเท่านั้น ----------
  prepareGrabTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    if (engine.sameTeam(p, t) || engine.sealActive(t)) return null;
    if (bleedOf(t) <= 0) return null;
    return t;
  },

  // ---------- ผลของสกิลที่ทำงานทันที (instant) — เรียกจาก useSkill() ----------
  applyInstantSkill(engine, p, tier, target) {
    if (tier === "basic") return this.applyBoiledEgg(engine, p);
    if (tier === "secondary") return this.applyGrab(engine, p, target);
    if (tier === "ultimate") return this.applyAlpha(engine, p);
    return "";
  },

  // ---------- สกิลพื้นฐาน: ไข่ต้ม ----------
  applyBoiledEgg(engine, p) {
    p.jinBasicUses = (p.jinBasicUses || 0) + 1;
    const left = Math.max(0, BASIC_USES_PER_TURN - p.jinBasicUses);
    const tail = ` (เหลือกดได้อีก ${left} ครั้งในเทิร์นนี้)`;
    if (Math.random() * 100 < BASIC_ROLL_HP) {
      const heal = engine.healHp(p, BASIC_HEAL_HP);
      engine.log(`🥚 ${p.name} ไข่ต้ม — ฟื้นพลังชีวิต +${heal}${tail}`);
      return ` — พลังชีวิต +${heal}`;
    }
    const before = p.skillPoints;
    engine.addSkill(p, BASIC_HEAL_SKILL, "passive");
    const got = p.skillPoints - before;
    engine.log(`🥚 ${p.name} ไข่ต้ม — ฟื้นแต้มสกิล +${got}${tail}`);
    return ` — แต้มสกิล +${got}`;
  },

  // ---------- สกิลรอง: กระชาก ----------
  applyGrab(engine, p, target) {
    p.statuses.jinOrgans = ORGANS_TURNS;
    engine.log(`🫀 ${p.name} กระชาก — ได้สถานะ "เครื่องใน" ${ORGANS_TURNS} เทิร์น (เพิ่มอัตราสกิลติดตัว "ฉันได้กลิ่นเลือด" ทั้ง 3 แบบ)`);
    if (!target) return " — เครื่องใน";
    target.jinForcedById = p.id;
    engine.applyDebuff(target, "jinForced", null, GRAB_FORCE_TURNS);
    engine.log(`🫀 ${p.name} กระชาก — บังคับ ${target.name} ให้ดาเมจทุกชนิด (โจมตี/สกิล) ลงที่ ${p.name} แทน ${GRAB_FORCE_TURNS} เทิร์น`);
    return ` — บังคับ ${target.name}`;
  },

  // ---------- ท่าไม้ตาย: Alpha ----------
  applyAlpha(engine, p) {
    p.statuses.jinAlpha = ALPHA_TURNS;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "jinAlpha"); // jin_skill3.mp4
    engine.log(`🐺 ${p.name} Alpha — เข้าสู่สถานะ "อัลฟา" ${ALPHA_TURNS} เทิร์น: การโจมตีปกติมอบ "เลือดไหล" ${ALPHA_BLEED_ON_ATK} หน่วยให้เป้าหมายทุกครั้ง`);
    return " — อัลฟา";
  },

  // ---------- โจมตีปกติระหว่างอัลฟา: แปะเลือดไหล ----------
  // เรียกจาก doAttack() หลังความเสียหายลงแล้ว
  onAttackLanded(engine, attacker, target) {
    if (!isJin(attacker) || !alphaOn(attacker)) return 0;
    if (!target || !target.alive) return 0;
    const got = engine.applyBleed(target, ALPHA_BLEED_ON_ATK);
    if (!got) {
      engine.log(`🩸 ${target.name} ต้านสถานะผิดปกติ/เลือดไหลเต็มเพดาน — "เลือดไหล" จากอัลฟาไม่ติด`);
      return 0;
    }
    engine.log(`🩸 ${attacker.name} อัลฟา — ${target.name} ติด "เลือดไหล" +${got} (รวม ${bleedOf(target)} หน่วย)`);
    return got;
  },

  // ---------- ความบ้าคลั่ง: ชนะโจมตีปกติแล้ว 50% ตีพลาด (ดาเมจ 0 แต่ยังนับว่าโจมตีไปแล้ว) ----------
  // เรียกจาก doAttack() ก่อนลงความเสียหายจริง
  tryMiss(engine, attacker) {
    if (!isJin(attacker) || !alphaOn(attacker)) return false;
    if (Math.random() >= MADNESS_MISS_CHANCE) return false;
    engine.log(`😵‍💫 ${attacker.name} ความบ้าคลั่ง — ตีพลาด! (${Math.round(MADNESS_MISS_CHANCE * 100)}%)`);
    return true;
  },

  // ---------- ความบ้าคลั่ง: เป้าหมายหลายคน = สุ่มเสมอ ----------
  // เรียกจาก doAttack() ก่อนล็อกเป้าหมาย — คืน player ที่สุ่มได้ หรือ null ถ้าไม่ต้องสุ่ม (มีเป้าเดียว/ไม่ใช่จิน-อัลฟา)
  maybeRandomTarget(engine, attacker, chosenTarget) {
    if (!isJin(attacker) || !alphaOn(attacker)) return null;
    // เป้าหมายที่ถูก "บังคับ" ไว้แล้วโดยกติกาอื่น (คู่ปรับของไค ชิซากิ) ต้องไม่ถูกสุ่มทับ
    if (attacker.kaiRivalId && ((attacker.statuses.kaiRival1 || 0) > 0 || (attacker.statuses.kaiRival2 || 0) > 0)) return null;
    const pool = engine.alivePlayers().filter((o) => o.id !== attacker.id && !engine.sameTeam(attacker, o) && !engine.sealActive(o));
    if (pool.length <= 1) return null;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!chosenTarget || picked.id !== chosenTarget.id) {
      engine.log(`🎲 ${attacker.name} ความบ้าคลั่ง — สุ่มเป้าหมายเป็น ${picked.name}${chosenTarget ? ` (แทน ${chosenTarget.name})` : ""}`);
    }
    return picked;
  },

  // ---------- ความบ้าคลั่ง: ไม่มีเกราะแล้วโดนดาเมจ = เลือดไหลตัวเอง (ไม่จำกัดจำนวนครั้ง/เทิร์น) ----------
  onDamaged(engine, p) {
    if (!isJin(p) || !p.alive || !alphaOn(p)) return false;
    if ((p.armor || 0) > 0 || (p.shield || 0) > 0) return false;
    const got = engine.applyBleed(p, 1);
    if (!got) return false;
    engine.log(`🩸 ${p.name} ความบ้าคลั่ง — เกราะแตกแล้วยังโดนซ้ำ ติด "เลือดไหล" +${got} (รวม ${bleedOf(p)})`);
    return true;
  },

  // ---------- ความบ้าคลั่ง: ตายขณะอยู่ในอัลฟา = เลือดสำรอง (หนี้) แทนตายจริง ----------
  // เรียกจาก instantDeath()'s shared function — คืน true ถ้าใช้เลือดสำรองสำเร็จ (ผู้เรียกต้อง return ทันที)
  //  ⚠️ เงื่อนไขคือ "อยู่ในอัลฟา ณ ตอนที่ตาย" *หรือ* "ติดหนี้เลือดสำรองอยู่แล้ว" — ข้อหลังสำคัญมาก
  //     เพราะร่างอัลฟาอาจหมดอายุไปแล้ว (เช่นตายพอดีในเทิร์นสุดท้ายของร่าง) ระหว่างที่ยังใช้เลือดสำรองอยู่
  //     ถ้าเช็คแต่ alphaOn จะกลายเป็นว่าโดนดาเมจอีกนิดเดียวก็ตายจริงทันที ทั้งที่สเปคบอกว่าดาเมจต้อง "เพิ่มหนี้" ต่อ
  tryFakeDeath(engine, p) {
    if (!isJin(p) || p.jinFakeDeathResolving) return false;
    if (!alphaOn(p) && !this.debtActive(p)) return false;
    const shadow = p.jinShadowHp == null
      ? p.hp                      // ครั้งแรก: เก็บเลือดจริง (ติดลบได้) ไว้เป็นตัวตั้ง
      : p.jinShadowHp + (p.hp - 1); // ครั้งถัดไประหว่างติดหนี้: สะสมดาเมจก้อนใหม่เข้าไปในหนี้เดิม
    // เลือดสำรองมีจำกัด 7 หน่วย — ดาเมจที่ทะลุ 0 ลงไปเกินกว่านั้น = สำรองไม่พอ ตายจริงทันที
    if (-shadow >= FAKE_HP_RESERVE) {
      p.jinShadowHp = null;
      p.jinDebtRound = 0;
      engine.log(`🐺💀 ${p.name} ความบ้าคลั่ง — ความเสียหายทะลุพลังชีวิตสำรอง ${FAKE_HP_RESERVE} หน่วย เลือดสำรองไม่พอรับไหว ตายจริงทันที!`);
      return false;
    }
    // เทิร์นที่เริ่มติดหนี้ — ตั้งครั้งแรกครั้งเดียว (ดาเมจก้อนถัดๆ ไปไม่เลื่อนกำหนดตายออกไปเรื่อยๆ)
    if (p.jinShadowHp == null) p.jinDebtRound = engine.roundNumber;
    p.jinShadowHp = shadow;
    p.hp = 1;
    const debt = Math.max(0, 1 - shadow);
    engine.log(`🐺💀 ${p.name} ความบ้าคลั่ง — ยังไม่ตาย! ใช้พลังชีวิตสำรองรับไว้ก่อน (เหลือสำรอง ${FAKE_HP_RESERVE + shadow}/${FAKE_HP_RESERVE}) ต้องฟื้นเลือดอีก ${debt} หน่วยภายในเทิร์นถัดไป ไม่งั้นจะตายจริง`);
    return true;
  },
  debtActive(p) { return isJin(p) && p.jinShadowHp != null; },

  // ---------- ฮีลระหว่างติดหนี้: ไปลดหนี้ก่อน ไม่ใช่ขึ้น p.hp ตรงๆ ----------
  // เรียกจาก healHp()'s shared function แทนพฤติกรรมฮีลปกติทั้งหมดระหว่างติดหนี้
  healIntoDebt(engine, p, amount) {
    if (!(amount > 0)) return 0;
    // "ไร้ทางเยียวยา" ยังกันการฟื้นเลือดได้ตามปกติ — หนี้จึงไม่ถูกจ่ายเลย (ตายจริงต้นเทิร์นหน้า)
    if (engine.noHealActive(p)) return 0;
    const before = p.jinShadowHp;
    p.jinShadowHp = Math.min(engine.maxHpOf(p), p.jinShadowHp + amount);
    const gained = p.jinShadowHp - before;
    // จ่ายหนี้ครบเมื่อไหร่กลับมาเป็นเลือดจริงทันที ไม่ต้องรอถึงกำหนดตัดสิน
    if (p.jinShadowHp >= 1) {
      p.hp = Math.min(engine.maxHpOf(p), p.jinShadowHp);
      p.jinShadowHp = null;
      p.jinDebtRound = 0;
      engine.log(`❤️‍🩹 ${p.name} ความบ้าคลั่ง — ฟื้นเลือดสำรอง +${gained} · ชดเชยครบแล้ว กลับมาเป็นพลังชีวิตจริง ${p.hp} หน่วย!`);
      return gained;
    }
    engine.log(`❤️‍🩹 ${p.name} ความบ้าคลั่ง — ฟื้นเลือดสำรอง +${gained} (ยังขาดอีก ${1 - p.jinShadowHp} หน่วยถึงจะรอดพ้นความตาย)`);
    return gained;
  },

  // ---------- ต้นเทิร์น: ตัดสินหนี้เลือดสำรองที่ค้างจากเทิร์นก่อน ----------
  //  จินตายในเทิร์น N -> ต้องมี "เทิร์นถัดไป" (N+1) ทั้งเทิร์นไว้หาทางฟื้นเลือด
  //  จึงตัดสินตอนต้นเทิร์น N+2 (ไม่ใช่ N+1 ซึ่งเท่ากับไม่ให้โอกาสเลย)
  //  ถ้าจ่ายหนี้ครบระหว่างทาง healIntoDebt จะคืนร่างให้เองทันที เลยไม่ต้องเช็คกรณีรอดที่นี่
  debtDue(engine, p) {
    return this.debtActive(p) && engine.roundNumber > (p.jinDebtRound || 0) + 1;
  },
  resolveDebt(engine, p) {
    const debt = Math.max(0, 1 - p.jinShadowHp);
    engine.log(`💀 ${p.name} ความบ้าคลั่ง — ฟื้นเลือดไม่ทันภายในเทิร์นที่กำหนด (ขาดอีก ${debt} หน่วย) ตายจริงตามปกติ!`);
    p.jinShadowHp = null;
    p.jinDebtRound = 0;
    p.jinFakeDeathResolving = true;
    p.hp = 0;
    engine.instantDeath(p);
    p.jinFakeDeathResolving = false;
  },

  // ---------- ความบ้าคลั่ง: ท่อดาเมจกลาง — ใช้เป็นจุดดัก "จินกำลังจะโดนดาเมจ" เท่านั้น ไม่ปรับตัวเลข ----------
  //  เรียกจาก adjustIncomingDamage()'s shared wrapper — src = ต้นตอของดาเมจก้อนนี้ (ถ้ามี)
  //  ⚠️ การสวนกลับ "ห้าม" ทำงานที่นี่ เพราะจุดนี้อยู่ "ก่อน" ความเสียหายลงจริง และไม่มีทางคิววีดีโอให้เล่นก่อนสรุปผลได้
  //     จึงทำได้แค่ "ตรวจจับ + จองไว้" (queueSmellBlood) แล้วให้ resolvePendingCounters() ลงผลจริงหลังวีดีโอจบ
  //     — ดาเมจจากการโจมตีปกติถูกดักที่ doAttack() แทน (หลังดาเมจลง) จึงข้ามที่นี่
  adjustIncomingDamage(engine, p, n, isNormalAttack, src) {
    if (n > 0) this.onDamaged(engine, p);
    if (n > 0 && !isNormalAttack && !p._statusDamage) this.queueSmellBlood(engine, p, src, false);
    return n;
  },

  // ---------- ฉันได้กลิ่นเลือด: ตรวจจับ + จองการสวนกลับ (ทำงานเฉพาะในอัลฟา) ----------
  //  isNormalAttack=true เรียกจาก doAttack() หลังดาเมจลงแล้ว · false เรียกจากท่อดาเมจกลาง (ดาเมจจากสกิล)
  //  คืน true ถ้ามีวีดีโอสวนกลับเข้าคิว (ผู้เรียกใช้สั่งให้เล่นวีดีโอก่อนขึ้นป้ายสรุปความเสียหาย)
  queueSmellBlood(engine, p, attacker, isNormalAttack) {
    if (!isJin(p) || !p.alive || !alphaOn(p)) return false;
    if (engine.passiveSealed(p)) return false;
    if (!attacker || !attacker.alive || attacker.id === p.id) return false;
    if (engine.sameTeam(p, attacker)) return false;
    const organsBonus = organsOn(p);
    let queued = false;
    if (isNormalAttack) {
      // ผลพื้นฐาน "ถูกผู้เล่นโจมตีใส่": เลือดไหล 2 หน่วย + ฟื้นแต้มสกิลจิน 1 (ไม่มีวีดีโอ ลงผลทันที)
      const got = engine.applyBleed(attacker, SMELL_BLEED_ON_HIT);
      const before = p.skillPoints;
      engine.addSkill(p, 1, "passive");
      engine.log(`👃 ${p.name} ฉันได้กลิ่นเลือด — ${attacker.name} ติด "เลือดไหล" +${got} · ${p.name} ฟื้นแต้มสกิล +${p.skillPoints - before}`);
      if (Math.random() < (organsBonus ? CAPTURED_CHANCE_ORGANS : CAPTURED_CHANCE)) queued = this.pushCounter(engine, p, attacker, "captured") || queued;
    } else if (Math.random() < (organsBonus ? ARM_CHANCE_ORGANS : ARM_CHANCE)) {
      queued = this.pushCounter(engine, p, attacker, "arm") || queued;
    }
    // "นี่แหละตัวฉัน": ใช้ได้กับทั้งการโจมตีปกติและสกิล — เป้าหมายต้องมีเลือดไหลอย่างน้อย 5 หน่วย
    if (bleedOf(attacker) >= THIS_IS_ME_BLEED_NEED &&
        Math.random() < (organsBonus ? THIS_IS_ME_CHANCE_ORGANS : THIS_IS_ME_CHANCE)) {
      queued = this.pushCounter(engine, p, attacker, "thisIsMe") || queued;
    }
    return queued;
  },
  // จองการสวนกลับไว้ + คิววีดีโอทันที (วีดีโอเล่นก่อนเสมอ ผลจริงลงทีหลังที่ resolvePendingCounters)
  pushCounter(engine, p, attacker, kind) {
    p.jinCounterPending = p.jinCounterPending || [];
    if (p.jinCounterPending.some((c) => c.kind === kind && c.byId === attacker.id)) return false; // กันจองซ้ำแบบเดียวกันในก้อนเดียว
    p.jinCounterPending.push({ kind, byId: attacker.id });
    engine.queueCutscene(p, kind === "captured" ? "jinCaptured" : kind === "arm" ? "jinArm" : "jinThisIsMe");
    return true;
  },
  // มีการสวนกลับรออยู่ไหม (ผู้เรียกใช้ตัดสินว่าต้องเล่นวีดีโอก่อนขึ้นป้ายสรุปความเสียหายหรือไม่)
  hasPendingCounter(engine) {
    return Object.values(engine.players).some((o) => isJin(o) && (o.jinCounterPending || []).length > 0);
  },

  // ---------- ลงผลการสวนกลับจริง — เรียก "หลังวีดีโอเล่นจบแล้ว" เท่านั้น ----------
  //  (แพทเทิร์นเดียวกับ CHAR_HOOKS.conner.resolvePendingCounter — ดู postAttackFollowup ใน server.js)
  resolvePendingCounters(engine) {
    for (const p of Object.values(engine.players)) {
      const pending = p.jinCounterPending;
      if (!pending || !pending.length) continue;
      p.jinCounterPending = [];
      if (!isJin(p) || !p.alive) continue;
      for (const c of pending) {
        const attacker = engine.players[c.byId];
        if (!attacker || !attacker.alive) continue;
        if (c.kind === "captured") this.counterCaptured(engine, p, attacker);
        else if (c.kind === "arm") this.counterArm(engine, p, attacker);
        else this.counterThisIsMe(engine, p, attacker);
      }
    }
  },

  // การสวนกลับร่วม: โจมตีปกติใส่ผู้โจมตี แล้วเช็คตกรอบ
  counterHit(engine, p, attacker, dmg) {
    if (!(dmg > 0)) return;
    engine.withEffectSource(p, () => {
      if (engine.friendlyEffectBlocked(attacker)) return;
      engine.dealMixed(attacker, dmg, true);
      attacker.wasAttacked = true;
      engine.maybeBeatSave(attacker); engine.maybeBeatMode(attacker); engine.maybeEva3(attacker); engine.maybeWakeKotone(attacker);
      if (attacker.alive && attacker.hp <= 0) {
        engine.instantDeath(attacker);
        if (!attacker.alive) engine.log(`💀 ${attacker.name} เลือดจริงหมด ตกรอบ!`);
      }
    });
  },

  // ---------- "จับตัวได้แล้ว" (15%/20%): โดนโจมตีปกติ -> สวนกลับ + nodraw เทิร์นถัดไป + ฟื้น HP ----------
  counterCaptured(engine, p, attacker) {
    this.counterHit(engine, p, attacker, 1);
    engine.log(`🎯 ${p.name} จับตัวได้แล้ว — สวนกลับ ${attacker.name} -1`);
    if (attacker.alive) {
      attacker.jinNoDrawPending = CAPTURED_NODRAW_TURNS;
      engine.log(`🚫 ${attacker.name} โดนสวนกลับ — เทิร์นถัดไปจะจั่วการ์ดไม่ได้ ${CAPTURED_NODRAW_TURNS} เทิร์น`);
    }
    const heal = engine.healHp(p, CAPTURED_HEAL);
    engine.log(`❤️ ${p.name} จับตัวได้แล้ว — ฟื้นพลังชีวิต +${heal}`);
  },

  // ---------- "แขนข้างนี่ใช่ไหม ที่สร้างปัญหา" (10%/20%): โดนดาเมจจากสกิล -> สวนกลับ + noskill เทิร์นถัดไป + ฟื้น HP ----------
  counterArm(engine, p, attacker) {
    this.counterHit(engine, p, attacker, 1);
    engine.log(`💪 ${p.name} แขนข้างนี่ใช่ไหม ที่สร้างปัญหา — สวนกลับ ${attacker.name} -1`);
    if (attacker.alive) {
      attacker.jinNoSkillPending = ARM_NOSKILL_TURNS;
      engine.log(`🚫 ${attacker.name} โดนสวนกลับ — เทิร์นถัดไปจะใช้สกิลไม่ได้ ${ARM_NOSKILL_TURNS} เทิร์น`);
    }
    const heal = engine.healHp(p, ARM_HEAL);
    engine.log(`❤️ ${p.name} แขนข้างนี่ใช่ไหม ที่สร้างปัญหา — ฟื้นพลังชีวิต +${heal}`);
  },

  // ---------- "นี่แหละตัวฉัน" (30%/50%): เป้าหมายเลือดไหล >= 5 โจมตี/ใช้สกิลใส่จิน -> สวนกลับตามเลือดไหลที่มี + ล้างเลือดไหล ----------
  counterThisIsMe(engine, p, attacker) {
    const stacks = bleedOf(attacker);
    if (stacks <= 0) return; // เลือดไหลถูกล้างไปก่อนหน้าแล้ว (เช่นโดนสวนกลับซ้อน) — ไม่มีอะไรให้ระเบิด
    delete attacker.statuses.hbleed;
    if (attacker.statusAmt) delete attacker.statusAmt.hbleed;
    this.counterHit(engine, p, attacker, stacks);
    engine.log(`🔥 ${p.name} นี่แหละตัวฉัน — สวนกลับ ${attacker.name} -${stacks} (ล้าง "เลือดไหล" ทั้งหมด)`);
  },

  // ---------- ต้นเทิร์น ----------
  //  ⚠️ เรียกกับผู้เล่น "ทุกคน" ไม่ใช่แค่จิน — เพราะ nodraw/noskill ที่การสวนกลับตั้งไว้อยู่บนตัว "ผู้โจมตี"
  //  (แพทเทิร์นเดียวกับ harukaStunPending ที่ dealRound ประมวลผลให้ทุกคน)
  onRoundStartTick(engine, p) {
    if (!p || !p.alive) return;
    if (p.jinNoDrawPending > 0) {
      const turns = p.jinNoDrawPending;
      p.jinNoDrawPending = 0;
      if (engine.applyDebuff(p, "nodraw", null, turns)) engine.log(`🚫 ${p.name} โดนจับตัวได้แล้วเมื่อเทิร์นก่อน — จั่วการ์ดไม่ได้ ${turns} เทิร์น!`);
    }
    if (p.jinNoSkillPending > 0) {
      const turns = p.jinNoSkillPending;
      p.jinNoSkillPending = 0;
      if (engine.applyDebuff(p, "noskill", null, turns)) engine.log(`🚫 ${p.name} โดนแขนข้างนี่ใช่ไหมเมื่อเทิร์นก่อน — ใช้สกิลไม่ได้ ${turns} เทิร์น!`);
    }
    // ---- ส่วนที่เป็นของจินเองเท่านั้น ----
    if (!isJin(p)) return;
    p.jinBasicUses = 0;
    if (this.debtDue(engine, p)) this.resolveDebt(engine, p);
  },

  // ---------- ฟิลด์ที่ต้องรีเซ็ตทุกแมตช์ — เรียกจาก resetCombat() ----------
  resetCombat(p) {
    p.jinBasicUses = 0;
    p.jinShadowHp = null;
    p.jinFakeDeathResolving = false;
    p.jinForcedById = null;
    p.jinNoDrawPending = 0;
    p.jinNoSkillPending = 0;
    p.jinCounterPending = null;  // การสวนกลับที่จองไว้ รอลงผลหลังวีดีโอจบ ([{ kind, byId }])
    p.jinDebtRound = 0;          // เทิร์นที่เริ่มติดหนี้เลือดสำรอง (ตัดสินตอนต้นเทิร์นถัดจากเทิร์นถัดไป)
  },
};
