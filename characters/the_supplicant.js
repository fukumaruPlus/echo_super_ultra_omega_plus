// ============================================================
//  ผู้วิงวอน — The Supplicant (patch 3.4 new)
//  Prayer / Armor of Faith / Mark of Judgment + สกิลติดตัว "Vessel of Prayers ภาชนะคำวิงวอน"
//
//  ตัวละครสายซัพพอร์ตล้วน: ไม่มีท่าที่ทำดาเมจตรงๆ เลยสักท่าเดียว ทุกอย่างหมุนรอบ "การล้างดีบัฟ"
//  ซึ่งเป็นทั้งประโยชน์ที่ให้เพื่อน และเป็นทรัพยากรของตัวเอง (คำวิงวอน 0/15 -> ปลดล็อกบัฟถาวร 3 ขั้น)
//
//  จุดที่ต่างจากตัวละครอื่นอย่างมีนัยสำคัญ 3 อย่าง:
//   1) กดสกิลได้ 2 ครั้งต่อเทิร์น (โควตาแยกของตัวเอง supSkillUsesRound — แพทเทิร์นเดียวกับไค ชิซากิ)
//   2) "เกราะศรัทธา" เป็นชั้นเกราะที่ 2 ซ้อนอยู่หลังเกราะหลัก — ดูดดาเมจที่หัว loseHp()
//      (จุดคอขวดเดียวกับร่างรถของแบทแมน จึงครอบคลุมดาเมจทะลุเกราะทุกช่องทาง)
//   3) ผู้ที่ติด "ลูกแกะน้อยรู้แจ้ง" เล็งผู้วิงวอนไม่ได้เลย (สกิล/ไอเทม/โจมตีปกติ)
//
//  สถานะเฉพาะตัว (ล้างไม่ได้ทั้งหมด — ไม่อยู่ใน BASIC_DEBUFF_CLEAR):
//   supFaith (เกราะศรัทธา)  amt 1-3  ให้ "คุ้มครอง 1" + "เสริมพลัง 1" ตราบที่ยังเหลือ
//   supJudge (ตราพิพากษา)   5 เทิร์น นับ "คำพิพากษา"/"ความเมตตา" ที่ p.supJudgeCount
//   supPunish (ลงทัณฑ์)     3 เทิร์น ให้ "ชา" + "ตาบอด"
//   supLamb (ลูกแกะน้อยรู้แจ้ง) 3 เทิร์น ให้ "อ่อนแอ 1" + "เปราะบาง 1" และเล็งผู้วิงวอนไม่ได้
//
//  ⚠️ ผลพ่วงของ supFaith/supLamb (คุ้มครอง/เสริมพลัง/อ่อนแอ/เปราะบาง) จงใจ "ไม่" ใส่เป็นสถานะจริง
//  แต่คิดสดที่จุดคำนวณดาเมจผ่าน statusAmtBonus() — เพราะถ้าใส่เป็นสถานะจริง จะโดน "ต้านสถานะผิดปกติ"
//  หรือการล้างดีบัฟของคนอื่นถอดออกได้ ซึ่งขัดกับสเปคที่ระบุว่าสถานะแม่ล้างไม่ได้
//  ด้วยเหตุผลเดียวกัน "ชา"/"ตาบอด" ของลงทัณฑ์ก็เป็นผลพ่วงที่เช็คสด (chaaActive/blindActive)
// ============================================================

const ID = "the_supplicant";

// ---------- ค่าสถานะพื้นฐาน ----------
const SUP_MAX_HP = 5;
const SUP_MAX_ARMOR = 5;

// ---------- สกิลติดตัว Vessel of Prayers ----------
const PRAYER_MAX = 15;      // คลังคำวิงวอน 0/15
const TIER_FLOW = 4;        // ครบ 4  -> "กระแสเวท" ถาวร
const TIER_ENERGY = 8;      // ครบ 8  -> + ฟื้นพลังงาน +1 ต่อการล้าง 1 ขั้น
const TIER_FAITH = 12;      // ครบ 12 -> + เกราะศรัทธา +1 ต่อการล้าง 1 ขั้น
const SPELLFLOW_AMT = 1;

// ---------- สกิลพื้นฐาน Prayer ----------
const PRAYER_MEND_AMT = 1;   // "เยียวยา" 1 หน่วย
const PRAYER_MEND_TURNS = 1; // ต่อ 1 เทิร์น (ซ้อนทับเทิร์นได้สูงสุด 5 ที่ระบบ mend)

// ---------- สกิลรอง Armor of Faith ----------
const FAITH_MAX = 3;   // เกราะศรัทธาสะสมสูงสุด 3 หน่วย
const FAITH_GUARD = 1; // ระหว่างมีเกราะศรัทธา: คุ้มครอง 1
const FAITH_MIGHT = 1; // ระหว่างมีเกราะศรัทธา: เสริมพลัง 1

// ---------- ท่าไม้ตาย Mark of Judgment ----------
const JUDGE_TURNS = 5;      // ตราพิพากษาคงอยู่ 5 เทิร์น
const JUDGE_NEED = 3;       // ครบ 3 ครั้งจึงสัมฤทธิ์ผล
const JUDGE_DMG = 1;        // ศัตรู: คำพิพากษา 1 ครั้ง = ดาเมจเพิ่ม 1
const JUDGE_ARMOR = 1;      // พันธมิตร: ความเมตตา 1 ครั้ง = ฟื้นเกราะ 1
const JUDGE_COOLDOWN = 6;
const PUNISH_TURNS = 3;     // ลงทัณฑ์ (ชา + ตาบอด)
const LAMB_TURNS = 3;       // ลูกแกะน้อยรู้แจ้ง (อ่อนแอ 1 + เปราะบาง 1)
const LAMB_WEAK = 1;
const LAMB_FRAGILE = 1;
const MERCY_MEND_AMT = 1;     // พันธมิตรครบ 3: "ฟื้นฟู" 1 หน่วย 3 เทิร์น (ใช้ระบบ "เยียวยา" เดียวกัน)
const MERCY_MEND_TURNS = 3;
const MERCY_FAITH_EXPIRE = 2; // พันธมิตรไม่ครบ 3 แล้วหมดเวลา: เกราะศรัทธา +2

const SKILL_USES_PER_TURN = 2; // กดสกิลได้ 2 ครั้งต่อเทิร์น

const IMG = {
  base: "/characters/the_supplicant/sup_profile.png",
  skill1: "/characters/the_supplicant/sup_skill1.jpg",
  skill2: "/characters/the_supplicant/sup_skill2.png",
  skill3: "/characters/the_supplicant/sup_skill3.jpg",
};

// เอฟเฟกต์ gif ที่เล่นทับไอคอนผู้เล่น (ระบบใหม่ patch 3.4 — ดู iconFx() ใน server.js / IconFxLayer ใน Game.jsx)
const FX = {
  heal: { gif: "/characters/the_supplicant/sup_heal.gif", sound: "sup_heal", ms: 2200 },
  shield: { gif: "/characters/the_supplicant/sup_shield.gif", sound: "sup_shield", ms: 2200 },
  strike: { gif: "/characters/the_supplicant/sup_strike.gif", sound: "sup_strike", ms: 2200 },
};
const ULT_GIF = "/characters/the_supplicant/sup_ult.gif"; // ค้างบนไอคอนเป้าหมายตลอดที่ตราพิพากษายังอยู่

function isSup(p) { return !!p && p.characterId === ID; }
function faithOf(p) {
  if (!p || !(((p.statuses && p.statuses.supFaith) || 0) > 0)) return 0;
  return Math.max(0, Math.min(FAITH_MAX, (p.statusAmt && p.statusAmt.supFaith) || 0));
}
function judgeOn(p) { return !!p && ((p.statuses && p.statuses.supJudge) || 0) > 0; }
function punishOn(p) { return !!p && ((p.statuses && p.statuses.supPunish) || 0) > 0; }
function lambOn(p) { return !!p && ((p.statuses && p.statuses.supLamb) || 0) > 0; }
function prayersOf(p) { return isSup(p) ? Math.max(0, Math.min(PRAYER_MAX, p.supPrayers || 0)) : 0; }

module.exports = {
  id: ID,
  IMG,
  FX,
  ULT_GIF,
  MAX_HP: SUP_MAX_HP,
  MAX_ARMOR: SUP_MAX_ARMOR,
  PRAYER_MAX,
  TIER_FLOW,
  TIER_ENERGY,
  TIER_FAITH,
  FAITH_MAX,
  FAITH_GUARD,
  FAITH_MIGHT,
  JUDGE_TURNS,
  JUDGE_NEED,
  JUDGE_DMG,
  JUDGE_ARMOR,
  JUDGE_COOLDOWN,
  PUNISH_TURNS,
  LAMB_TURNS,
  MERCY_MEND_TURNS,
  MERCY_FAITH_EXPIRE,
  SKILL_USES_PER_TURN,
  faithOf,
  judgeOn,
  punishOn,
  lambOn,
  prayersOf,

  maxHp() { return SUP_MAX_HP; },
  maxArmor() { return SUP_MAX_ARMOR; },

  resetCombat(p) {
    p.supPrayers = 0;          // คลังคำวิงวอน 0/15
    p.supSkillUsesRound = 0;   // โควตากดสกิล 2 ครั้ง/เทิร์น
    p.supUltCd = 0;            // เลขรอบที่กดท่าไม้ตายได้อีกครั้ง (เก็บเป็นรอบ ไม่ใช่ตัวนับสถานะ)
    // ฟิลด์ของ "ผู้ถูกตราพิพากษา" อยู่ที่ตัวเป้าหมาย ไม่ใช่ที่ผู้วิงวอน — resetCombat ถูกเรียกกับทุกผู้เล่น
    //  จึงล้างที่นี่ได้ทีเดียวทั้งสองฝั่ง
    p.supJudgeCount = 0;       // นับคำพิพากษา/ความเมตตา 0-3
    p.supJudgeAlly = false;    // ตราที่ติดอยู่เป็นสายพันธมิตรหรือศัตรู
    p.supJudgeById = null;     // ผู้วิงวอนที่ประทับตรานี้
  },

  // ---------- คูลดาวน์ท่าไม้ตาย (เลขรอบ — รอดจากทั้งการลดเทิร์นและการย้อนเวลา) ----------
  ultCooldownLeft(engine, p) {
    if (!isSup(p)) return 0;
    return Math.max(0, (p.supUltCd || 0) - engine.roundNumber);
  },
  setUltCooldown(engine, p) {
    p.supUltCd = engine.roundNumber + JUDGE_COOLDOWN;
  },

  // ---------- ผลพ่วงของสถานะเฉพาะตัว (คิดสดที่จุดคำนวณดาเมจ ไม่ใช่สถานะจริง — ดูหัวไฟล์) ----------
  //  key: "guard" | "might" | "weak" | "fragile"
  statusAmtBonus(p, key) {
    if (!p) return 0;
    if (faithOf(p) > 0) {
      if (key === "guard") return FAITH_GUARD;
      if (key === "might") return FAITH_MIGHT;
    }
    if (lambOn(p)) {
      if (key === "weak") return LAMB_WEAK;
      if (key === "fragile") return LAMB_FRAGILE;
    }
    return 0;
  },

  // "ลงทัณฑ์" พ่วง "ชา" + "ตาบอด" — เช็คสดแบบเดียวกัน (สถานะแม่ล้างไม่ได้ ผลพ่วงจึงต้องไม่ถูกล้างไปด้วย)
  chaaActive(p) { return punishOn(p); },
  blindActive(p) { return punishOn(p); },

  // ---------- เกราะศรัทธา: ชั้นเกราะที่ 2 หลังเกราะหลัก ----------
  //  เรียกจากหัว loseHp() — คืน true = ดาเมจก้อนนี้ถูกเกราะศรัทธากินไปแล้ว ผู้เรียกต้อง return ทันที
  faithAbsorb(engine, p) {
    const left = faithOf(p);
    if (left <= 0) return false;
    const now = left - 1;
    if (now <= 0) {
      delete p.statuses.supFaith;
      if (p.statusAmt) delete p.statusAmt.supFaith;
      engine.log(`✝️💥 เกราะศรัทธาของ ${p.name} แตกสลาย — "คุ้มครอง"/"เสริมพลัง" ที่ติดมาด้วยหายไป`);
    } else {
      p.statusAmt.supFaith = now;
      engine.log(`✝️ เกราะศรัทธาของ ${p.name} รับความเสียหายแทน 1 หน่วย (เหลือ ${now}/${FAITH_MAX})`);
    }
    return true;
  },

  // ---------- หมัดที่ถูก "คุ้มครอง" ของเกราะศรัทธากันจนเหลือ 0 ก็ยังกร่อนเกราะศรัทธา 1 หน่วย ----------
  //  ⚠️ บั๊กที่แก้ (patch 3.4.3): พลังโจมตีปกติของเกมนี้คือ 1 หน่วย และเกราะศรัทธาให้ "คุ้มครอง 1"
  //  หมัดปกติจึงเหลือ 0 พอดี -> ไม่มีดาเมจไหลไปถึง loseHp() -> faithAbsorb() ไม่เคยถูกเรียก
  //  = เกราะศรัทธาไม่มีวันแตก และเจ้าของกลายเป็นอมตะต่อการโจมตีปกติถาวร (ไม่ใช่โล่ 3 ครั้งตามสเปค)
  //  แก้โดยให้ "หมัดที่ถูกกันจนเป็น 0" นับเป็นการทดสอบศรัทธา 1 ครั้ง กร่อนเกราะไป 1 หน่วยเหมือนกัน
  //  -> คุ้มครอง 1 ยังทำงานครบตามสเปค แต่โล่กลายเป็นของจำกัด (สูงสุด 3 หมัด) ตามที่ตั้งใจไว้แต่แรก
  //  rawDmg = ดาเมจก่อนหักตัวลดของฝั่งรับ · finalDmg = ที่ลงจริง
  absorbBlockedHit(engine, target, rawDmg, finalDmg) {
    if (!(rawDmg > 0) || finalDmg > 0) return false; // หมัดที่ลงดาเมจได้จริงถูกกินที่ loseHp ตามปกติอยู่แล้ว
    if (faithOf(target) <= 0) return false;
    engine.log(`✝️🛡️ ${target.name} เกราะศรัทธากันหมัดนี้ไว้ได้ทั้งหมด — แต่ศรัทธาสึกกร่อนไป 1 หน่วย`);
    return this.faithAbsorb(engine, target);
  },

  // มอบเกราะศรัทธา n หน่วย (เพดาน FAITH_MAX) — คืนจำนวนที่เพิ่มได้จริง
  grantFaith(engine, target, n) {
    const before = faithOf(target);
    const after = Math.min(FAITH_MAX, before + Math.max(1, n || 1));
    target.statuses.supFaith = 1; // ธง "มีเกราะศรัทธาอยู่" — ไม่นับเทิร์น (อยู่ใน NO_TICK_STATUS)
    target.statusAmt = target.statusAmt || {};
    target.statusAmt.supFaith = after;
    return after - before;
  },

  // ---------- "ผู้วิงวอนเล็งไม่ได้": คนที่ติดลูกแกะน้อยรู้แจ้งเล็งผู้วิงวอนไม่ได้เลย ----------
  //  คืน true = ห้ามเล็ง (ใช้ทั้งการโจมตีปกติ การเลือกเป้าสกิล และการใช้ไอเทมใส่คนอื่น)
  targetBlocked(actor, target) {
    if (!actor || !target || actor.id === target.id) return false;
    return isSup(target) && lambOn(actor);
  },

  // ---------- สกิลติดตัว: ล้างดีบัฟ 1 ขั้น แล้วเก็บคำวิงวอน ----------
  //  ตรรกะการล้าง 1 ขั้นย้ายไปเป็นของกลางที่ _universal_status.js แล้ว (อรชุนใช้ร่วมด้วย)
  cleanseOneStep(engine, target) { return engine.cleanseOneStep(target); },

  // เก็บคำวิงวอน + จ่ายรางวัลตามขั้น — เรียก "ทุกครั้ง" ที่ผู้วิงวอนล้างดีบัฟได้ steps ขั้น
  //  รางวัลขั้น 8/12 จ่ายต่อ "ขั้นที่ล้างได้" ตามสเปค (ท่าที่ล้างทีเดียวหลายตัวจึงจ่ายหลายหน่วย)
  gainPrayers(engine, sup, target, steps) {
    if (!isSup(sup) || !(steps > 0)) return;
    const before = prayersOf(sup);
    sup.supPrayers = Math.min(PRAYER_MAX, before + steps);
    const gained = sup.supPrayers - before;
    if (gained > 0) engine.log(`🙏 ${sup.name} ภาชนะคำวิงวอน — คำวิงวอน +${gained} (${sup.supPrayers}/${PRAYER_MAX})`);
    const tier = sup.supPrayers;
    if (tier >= TIER_ENERGY) {
      const got = engine.addSkill(sup, steps, "passive");
      if (got > 0) engine.log(`🙏✨ ภาชนะคำวิงวอนขั้น ${TIER_ENERGY} — ${sup.name} ฟื้นพลังงาน +${got}`);
    }
    if (tier >= TIER_FAITH) {
      const who = target || sup;
      const add = this.grantFaith(engine, who, steps);
      if (add > 0) engine.log(`🙏✝️ ภาชนะคำวิงวอนขั้น ${TIER_FAITH} — ${who.name} ได้รับเกราะศรัทธา +${add} (รวม ${faithOf(who)}/${FAITH_MAX})`);
    }
  },

  // "กระแสเวท" ถาวรตั้งแต่คำวิงวอนครบ 4 — ต่ออายุให้ทุกต้นเทิร์น
  //  why: สถานะ spellflow ยังนับถอยหลังตามปกติ การเติมใหม่เรื่อยๆ จึงถูกกว่าการยกเว้นการลดเทิร์น
  //  (ถ้ายกเว้น กระแสเวทที่ได้จากแหล่งอื่นของทุกตัวละครจะค้างถาวรไปด้วย)
  onRoundStartTick(engine, p) {
    if (!isSup(p)) return;
    p.supSkillUsesRound = 0;
    if (prayersOf(p) >= TIER_FLOW) engine.applyBuff(p, "spellflow", SPELLFLOW_AMT, 2);
  },

  // ---------- useSkill: ด่านเงื่อนไข ----------
  canUseSkill(engine, p, tier) {
    if (!isSup(p)) return true;
    if ((p.supSkillUsesRound || 0) >= SKILL_USES_PER_TURN) return false;
    if (tier === "ultimate" && this.ultCooldownLeft(engine, p) > 0) return false;
    return true;
  },

  // เลือกเป้าหมาย 1 คน (เลือกตัวเองได้ทุกท่า) — คืน player หรือ null ถ้าไม่ถูกต้อง
  prepareTarget(engine, p, targets) {
    const id = Array.isArray(targets) ? targets[0] : targets;
    const t = engine.players[id];
    if (!t || !t.alive) return null;
    return t;
  },

  // ---------- ลงผลของสกิล (เรียกจาก useSkill หลังหักแต้มแล้ว) ----------
  applyInstantSkill(engine, p, tier, target) {
    if (!isSup(p) || !target) return "";
    p.supSkillUsesRound = (p.supSkillUsesRound || 0) + 1;
    if (tier === "basic") return this.applyPrayer(engine, p, target);
    if (tier === "secondary") return this.applyFaithArmor(engine, p, target);
    if (tier === "ultimate") return this.applyJudgment(engine, p, target);
    return "";
  },

  // ---------- สกิลพื้นฐาน Prayer ----------
  applyPrayer(engine, sup, target) {
    engine.applyMend(target, PRAYER_MEND_AMT, PRAYER_MEND_TURNS);
    const steps = this.cleanseOneStep(engine, target);
    engine.log(`🙏 ${sup.name} Prayer — ${target.name} ได้รับ "เยียวยา" ${PRAYER_MEND_AMT} หน่วย (รวม ${target.statuses.mend} เทิร์น)${steps ? " และถูกล้างดีบัฟ 1 ขั้น" : ""}`);
    this.gainPrayers(engine, sup, target, steps);
    engine.iconFx(target, "heal");
    return ` — เยียวยา ${target.name}`;
  },

  // ---------- สกิลรอง Armor of Faith ----------
  applyFaithArmor(engine, sup, target) {
    const add = this.grantFaith(engine, target, 1);
    engine.log(add > 0
      ? `✝️ ${sup.name} Armor of Faith — ${target.name} ได้รับเกราะศรัทธา +${add} (รวม ${faithOf(target)}/${FAITH_MAX}) พร้อม "คุ้มครอง ${FAITH_GUARD}" และ "เสริมพลัง ${FAITH_MIGHT}"`
      : `✝️ ${sup.name} Armor of Faith — เกราะศรัทธาของ ${target.name} เต็มเพดาน ${FAITH_MAX} หน่วยแล้ว`);
    engine.iconFx(target, "shield");
    return ` — เกราะศรัทธา ${target.name}`;
  },

  // ---------- ท่าไม้ตาย Mark of Judgment ----------
  applyJudgment(engine, sup, target) {
    this.setUltCooldown(engine, sup);
    const ally = target.id === sup.id || engine.sameTeam(sup, target);
    target.statuses.supJudge = JUDGE_TURNS;
    target.supJudgeCount = 0;
    target.supJudgeAlly = ally;
    target.supJudgeById = sup.id;
    engine.log(ally
      ? `⚖️ ${sup.name} Mark of Judgment — ประทับตราพิพากษาสายเมตตาให้ ${target.name} ${JUDGE_TURNS} เทิร์น (ถูกโจมตี/เป็นฝ่ายโจมตี = ความเมตตา +1 · ครบ ${JUDGE_NEED} ครั้งจึงสัมฤทธิ์ผล)`
      : `⚖️ ${sup.name} Mark of Judgment — ประทับตราพิพากษาให้ ${target.name} ${JUDGE_TURNS} เทิร์น (ถูกโจมตี/เป็นฝ่ายโจมตี = คำพิพากษา +1 · ครบ ${JUDGE_NEED} ครั้งจึงลงทัณฑ์)`);
    return ` — ตราพิพากษา ${target.name}`;
  },

  // ทุกครั้งที่ผู้ถือตรา "ถูกโจมตี" หรือ "เป็นฝ่ายโจมตี" (นับแยกกันตามสเปค) — เรียกจาก doAttack() ทั้งสองฝั่ง
  //  why: ผู้โจมตีและผู้ถูกโจมตีอาจถือตราคนละใบพร้อมกันได้ จึงต้องยิงฮุคทีละฝั่ง ไม่ใช่ครั้งเดียว
  //  how = ข้อความสั้นๆ บอกสาเหตุ ("ถูกโจมตี" / "เป็นฝ่ายโจมตี") ใช้ทำ log ให้อ่านออกว่าตราเดินเพราะอะไร
  onJudgeTrigger(engine, p, how) {
    if (!judgeOn(p) || !p.alive) return null;
    p.supJudgeCount = (p.supJudgeCount || 0) + 1;
    const n = p.supJudgeCount;
    const ally = !!p.supJudgeAlly;
    if (ally) {
      const got = engine.healArmor(p, JUDGE_ARMOR);
      engine.log(`⚖️💚 ความเมตตา ${n}/${JUDGE_NEED} — ${p.name} ${how} ฟื้นเกราะ +${got}`);
    } else {
      engine.iconFx(p, "strike");
      engine.dealMixed(p, JUDGE_DMG);
      engine.log(`⚖️⚡ คำพิพากษา ${n}/${JUDGE_NEED} — ${p.name} ${how} รับความเสียหายเพิ่มเติม -${JUDGE_DMG}`);
      engine.resolveDamageAftermath(p);
      if (!p.alive) return { kind: "judge", n, dead: true };
    }
    if (n >= JUDGE_NEED) this.resolveJudgeComplete(engine, p);
    return { kind: ally ? "mercy" : "judge", n };
  },

  // ล้างตัวสถานะตรา (ใช้ร่วมกันทุกทางออก เพื่อให้กติกาการล้างตรงกันเสมอ)
  clearJudge(p) {
    delete p.statuses.supJudge;
    if (p.statusAmt) delete p.statusAmt.supJudge;
    p.supJudgeCount = 0;
    p.supJudgeById = null;
  },

  // ครบ 3 ครั้ง (เรียกต่อจาก onJudgeTrigger)
  resolveJudgeComplete(engine, p) {
    const ally = !!p.supJudgeAlly;
    const sup = engine.players[p.supJudgeById];
    this.clearJudge(p);
    if (ally) {
      engine.applyMend(p, MERCY_MEND_AMT, MERCY_MEND_TURNS);
      const purged = engine.cleanseDebuffs(p);
      if (sup && purged > 0) this.gainPrayers(engine, sup, p, purged);
      engine.log(`⚖️💚 ความเมตตาครบ ${JUDGE_NEED} — ${p.name} ได้รับ "ฟื้นฟู" ${MERCY_MEND_AMT} หน่วย ${MERCY_MEND_TURNS} เทิร์น และถูกล้างดีบัฟทั้งหมด (${purged})`);
    } else {
      const ok = !engine.resistActive(p);
      if (ok) p.statuses.supPunish = PUNISH_TURNS;
      engine.log(ok
        ? `⚖️⛓️ คำพิพากษาครบ ${JUDGE_NEED} — ${p.name} ติดสถานะ "ลงทัณฑ์" ${PUNISH_TURNS} เทิร์น (ชา + ตาบอด)`
        : `🛡️ ${p.name} ต้านสถานะผิดปกติ — ไม่ติด "ลงทัณฑ์" จากคำพิพากษา`);
    }
    p.supJudgeAlly = false;
  },

  // เรียกจาก endTurn() ตอนสถานะ supJudge หมดอายุเองโดยยังไม่ครบ 3 ครั้ง
  onJudgeExpire(engine, p) {
    const ally = !!p.supJudgeAlly;
    const sup = engine.players[p.supJudgeById];
    const purged = engine.cleanseDebuffs(p);
    if (sup && purged > 0) this.gainPrayers(engine, sup, p, purged);
    if (ally) {
      const add = this.grantFaith(engine, p, MERCY_FAITH_EXPIRE);
      engine.log(`⚖️✝️ ตราพิพากษาของ ${p.name} หมดเวลาโดยความเมตตายังไม่ครบ ${JUDGE_NEED} — ล้างดีบัฟทั้งหมด (${purged}) และได้รับเกราะศรัทธา +${add}`);
    } else {
      p.statuses.supLamb = LAMB_TURNS;
      engine.log(`⚖️🐑 ตราพิพากษาของ ${p.name} หมดเวลาโดยคำพิพากษายังไม่ครบ ${JUDGE_NEED} — ล้างดีบัฟทั้งหมด (${purged}) แต่ติด "ลูกแกะน้อยรู้แจ้ง" ${LAMB_TURNS} เทิร์น (อ่อนแอ ${LAMB_WEAK} · เปราะบาง ${LAMB_FRAGILE} · เล็งผู้วิงวอนไม่ได้)`);
    }
    p.supJudgeCount = 0;
    p.supJudgeById = null;
    p.supJudgeAlly = false;
  },

  // ผู้ถือตรา/ผู้วิงวอนตกรอบ -> ล้างสถานะที่ค้างอยู่ให้หมด (ไม่งั้นตราลอยอยู่โดยไม่มีเจ้าของ)
  onDeath(engine, p) {
    if (judgeOn(p)) this.clearJudge(p);
    if (!isSup(p)) return;
    for (const o of Object.values(engine.players)) {
      if (o.id !== p.id && o.supJudgeById === p.id) {
        this.clearJudge(o);
        engine.log(`⚖️ ผู้วิงวอนตกรอบ — ตราพิพากษาบน ${o.name} สลายไป`);
      }
    }
  },
};
