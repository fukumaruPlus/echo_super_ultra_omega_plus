// ============================================================
//  มหาเทพ อรชุน — Arjuna (patch 3.4 new)
//  ตะเกียงไฟที่ดับมอด / ขจัดความชั่วร้าย / Mahapralaya + สกิลติดตัว "หัวใจที่เที่ยงธรรม"
//
//  เทพผู้พิพากษาความชอบธรรม: ทั้งตัวละครถูกออกแบบให้ "ลงโทษคนที่ก้าวร้าว และละเว้นคนที่ยังไม่แตะเรา"
//   · หัวใจที่เที่ยงธรรม  -> ตีคนที่ยังไม่เคยโจมตีอรชุน เบาลง 1 · ตีคนที่เคยสังหารคนอื่น แรงขึ้น 1
//   · ขจัดความชั่วร้าย    -> ยิ่งเป้าหมายสกปรกด้วยดีบัฟมากเท่าไหร่ ยิ่งเจ็บมากเท่านั้น
//   · Mahapralaya        -> ล้างโลกทีเดียวใส่ทุกคน ด้วยพลังโจมตีปกติของอรชุนเอง
//
//  หมายเหตุเรื่องข้อมูลที่ต้องเก็บข้ามเทิร์น (2 อย่าง ทั้งคู่ไม่ใช่สถานะ จึงไม่โดนล้าง/ลดเทิร์น):
//   · p.arjunaAttackers = { [attackerId]: true } — ใครเคยโจมตีอรชุนบ้าง (เก็บที่ตัวอรชุน)
//   · p.hasKilled = true — ผู้เล่นคนนี้เคยสังหารผู้เล่นอื่น (เก็บที่ตัวผู้สังหาร ตั้งจาก instantDeath)
//  ทั้งสองค่าตั้งใจให้เป็น "ประวัติของทั้งเกม" ไม่หมดอายุ และไม่ถูกล้างด้วยต้านสถานะผิดปกติ
// ============================================================

const ID = "arjuna";

// ---------- สกิลพื้นฐาน ตะเกียงไฟที่ดับมอด ----------
const LAMP_MEND_AMT = 1;    // "เยียวยา" 1 หน่วย = ฟื้นพลังชีวิต 1/เทิร์น
const LAMP_TURNS = 3;       // ทั้งเยียวยาและฟื้นคืนชีพ คงอยู่ 3 เทิร์น
const REVIVE_HP = 1;        // ฟื้นคืนชีพด้วยพลังชีวิต 1 หน่วย เกราะ 0
const REVIVE_ARMOR = 0;

// ---------- สกิลรอง ขจัดความชั่วร้าย ----------
const SLAY_TURNS = 5;
const SLAY_ATK = 1;         // พลังโจมตี +1
const SLAY_PER_DEBUFF = 1;  // ดาเมจเพิ่ม 1 ต่อดีบัฟเสีย 1 ตัวที่เป้าหมายมี

// ---------- ท่าไม้ตาย Mahapralaya ----------
const PRALAYA_COOLDOWN = 5; // หลังทำงานแล้ว ต้องรออีก 5 เทิร์นจึงกดได้อีก (balance 3.4.1: เดิม 3)
const PRALAYA_FRAGILE = 1;  // "เปราะบาง" 1 หน่วยให้ทุกคน
const PRALAYA_FRAGILE_TURNS = 3;

// ---------- สกิลติดตัว หัวใจที่เที่ยงธรรม ----------
const JUST_MERCY = 1;   // ตีคนที่ไม่เคยโจมตีเรา — ดาเมจ -1
const JUST_WRATH = 1;   // ตีคนที่เคยสังหารผู้เล่นอื่น — ดาเมจ +1

const IMG = {
  base: "/characters/arjuna/arjuna.jpeg",
  skill1: "/characters/arjuna/arjuna_skill1.jpg",
  skill2: "/characters/arjuna/arjuna_skill2.jpg",
  skill3: "/characters/arjuna/arjuna_skill3.jpg",
};

function isArjuna(p) { return !!p && p.characterId === ID; }
function lampOn(p) { return !!p && ((p.statuses && p.statuses.arjunaRevive) || 0) > 0; }
function mendOn(p) { return !!p && ((p.statuses && p.statuses.mend) || 0) > 0; }
function slayOn(p) { return !!p && ((p.statuses && p.statuses.arjunaSlay) || 0) > 0; }

// จำนวน "ดีบัฟเสีย" ที่เป้าหมายมีอยู่ตอนนี้ — นับตามรายการดีบัฟพื้นฐานกลางของเกม
//  (นับ "จำนวนสถานะ" ไม่ใช่จำนวนเทิร์น/หน่วย — 1 ดีบัฟ = ดาเมจเพิ่ม 1 ตามสเปค)
function debuffCount(engine, target) {
  if (!target || !target.statuses) return 0;
  let n = 0;
  for (const k of engine.BASIC_DEBUFF_CLEAR) if ((target.statuses[k] || 0) > 0) n++;
  for (const k of engine.SOFT_DEBUFF_STEP) if ((target.statuses[k] || 0) > 0) n++;
  return n;
}

module.exports = {
  id: ID,
  IMG,
  LAMP_TURNS,
  LAMP_MEND_AMT,
  REVIVE_HP,
  SLAY_TURNS,
  SLAY_ATK,
  SLAY_PER_DEBUFF,
  PRALAYA_COOLDOWN,
  PRALAYA_FRAGILE,
  JUST_MERCY,
  JUST_WRATH,
  debuffCount,
  slayOn,

  resetCombat(p) {
    p.arjunaAttackers = {};  // ประวัติ "ใครเคยโจมตีอรชุน" ตลอดเกม (เก็บที่ตัวอรชุน)
    p.arjunaUltCd = 0;       // เลขรอบที่กด Mahapralaya ได้อีกครั้ง (เก็บเป็นรอบ ไม่ใช่ตัวนับสถานะ)
    p.hasKilled = false;     // ผู้เล่นคนนี้เคยสังหารผู้เล่นอื่นหรือยัง (ตั้งที่ instantDeath — ทุกตัวละครมีฟิลด์นี้)
  },

  // ---------- คูลดาวน์ท่าไม้ตาย ----------
  ultCooldownLeft(engine, p) {
    if (!isArjuna(p)) return 0;
    return Math.max(0, (p.arjunaUltCd || 0) - engine.roundNumber);
  },

  // ---------- สกิลติดตัว: บันทึกว่าใครเคยโจมตีอรชุน ----------
  //  เรียกจาก doAttack() ทุกครั้งที่มีการโจมตีปกติ (ไม่ว่าอรชุนจะเป็นเป้าหรือไม่ — ฮุคกรองเอง)
  //  บันทึก "ตอนโจมตี" ไม่ใช่ "ตอนโดนดาเมจ" เพื่อให้การโจมตีที่ถูกหลบ/กันไว้ก็ยังนับว่าเคยลงมือแล้ว
  onAttacked(engine, attacker, target) {
    if (!isArjuna(target) || !attacker || attacker.id === target.id) return;
    target.arjunaAttackers = target.arjunaAttackers || {};
    if (!target.arjunaAttackers[attacker.id]) {
      target.arjunaAttackers[attacker.id] = true;
      engine.log(`⚖️ ${target.name} หัวใจที่เที่ยงธรรม — จดจำไว้แล้วว่า ${attacker.name} เป็นฝ่ายลงมือก่อน`);
    }
  },

  everAttackedArjuna(arjuna, other) {
    return !!(arjuna && arjuna.arjunaAttackers && other && arjuna.arjunaAttackers[other.id]);
  },

  // ---------- โบนัส/โทษพลังโจมตี (เรียกจาก computeAttackBase ผ่าน damageBonus) ----------
  //  ctx ใช้ส่งผลลัพธ์กลับไปทำการ์ดเอฟเฟกต์ในฉากโจมตี
  damageBonus(engine, attacker, target, ctx) {
    if (!isArjuna(attacker) || !target) return 0;
    let bonus = 0;
    if (!this.everAttackedArjuna(attacker, target)) {
      bonus -= JUST_MERCY;
      ctx.arjunaMercy = true;
    }
    if (target.hasKilled) {
      bonus += JUST_WRATH;
      ctx.arjunaWrath = true;
    }
    // ขจัดความชั่วร้าย: พลังโจมตี +1 และดาเมจเพิ่มตามจำนวนดีบัฟเสียที่เป้าหมายมีอยู่
    if (slayOn(attacker)) {
      const n = debuffCount(engine, target);
      bonus += SLAY_ATK + n * SLAY_PER_DEBUFF;
      ctx.arjunaSlay = n;
    }
    return bonus;
  },

  // ---------- useSkill: ด่านเงื่อนไข ----------
  canUseSkill(engine, p, tier) {
    if (!isArjuna(p)) return true;
    // ตะเกียงไฟที่ดับมอด: กดซ้ำไม่ได้ถ้า "ผลทั้ง 2 อย่าง" (เยียวยา + ฟื้นคืนชีพ) ยังอยู่ครบทั้งคู่
    if (tier === "basic" && lampOn(p) && mendOn(p)) return false;
    // ขจัดความชั่วร้าย: กดซ้ำไม่ได้ถ้าผลยังอยู่
    if (tier === "secondary" && slayOn(p)) return false;
    if (tier === "ultimate" && this.ultCooldownLeft(engine, p) > 0) return false;
    return true;
  },

  // ---------- ลงผลของสกิล ----------
  applyInstantSkill(engine, p, tier) {
    if (!isArjuna(p)) return "";
    if (tier === "basic") return this.applyLamp(engine, p);
    if (tier === "secondary") return this.applySlay(engine, p);
    return ""; // ท่าไม้ตายลงผลหลังวีดีโอจบ — ดู applyPralaya()
  },

  // ---------- สกิลพื้นฐาน ตะเกียงไฟที่ดับมอด ----------
  applyLamp(engine, p) {
    engine.applyMend(p, LAMP_MEND_AMT, LAMP_TURNS);
    p.statuses.arjunaRevive = LAMP_TURNS;
    engine.log(`🪔 ${p.name} ตะเกียงไฟที่ดับมอด — ได้รับ "เยียวยา" ${LAMP_MEND_AMT} หน่วย (รวม ${p.statuses.mend} เทิร์น) และ "ฟื้นคืนชีพ" 1 ครั้ง ${LAMP_TURNS} เทิร์น (ฟื้นด้วยพลังชีวิต ${REVIVE_HP} เกราะ ${REVIVE_ARMOR})`);
    return " — เยียวยา + ฟื้นคืนชีพ";
  },

  // กันตาย: ตายระหว่าง "ฟื้นคืนชีพ" ยังไม่หมดเวลา -> ฟื้นทันทีด้วยเลือด 1 เกราะ 0 แล้วสถานะหายไป (1 ครั้ง)
  //  เรียกจาก instantDeath() ก่อนบันทึกความตายจริง (แพทเทิร์นเดียวกับ sothis ของไบเลธ)
  tryRevive(engine, p) {
    if (!isArjuna(p) || !lampOn(p) || engine.passiveSealed(p)) return false;
    delete p.statuses.arjunaRevive;
    if (p.statusAmt) delete p.statusAmt.arjunaRevive;
    p.alive = true;
    p.result = null;
    p.locked = false;
    p.hp = REVIVE_HP;
    p.armor = REVIVE_ARMOR;
    p.shield = 0;
    p.tempHp = 0;
    engine.skillFlash({ name: "ตะเกียงไฟที่ดับมอด — ฟื้นคืนชีพ", img: IMG.skill1, by: p.name, color: engine.colorOf(p) });
    engine.log(`🪔✨ ${p.name} ตะเกียงไฟที่ดับมอด — เปลวไฟที่ดับมอดลุกขึ้นอีกครั้ง! ฟื้นคืนชีพด้วยพลังชีวิต ${REVIVE_HP} หน่วย เกราะ ${REVIVE_ARMOR} หน่วย`);
    return true;
  },

  // ---------- สกิลรอง ขจัดความชั่วร้าย ----------
  applySlay(engine, p) {
    p.statuses.arjunaSlay = SLAY_TURNS;
    engine.log(`🔱 ${p.name} ขจัดความชั่วร้าย — ได้รับ "สังหารโลกา" ${SLAY_TURNS} เทิร์น (พลังโจมตี +${SLAY_ATK} · ดาเมจเพิ่ม +${SLAY_PER_DEBUFF} ต่อดีบัฟเสีย 1 ตัวที่เป้าหมายมี)`);
    return " — สังหารโลกา";
  },

  // ---------- ท่าไม้ตาย Mahapralaya ----------
  //  จองคิววีดีโอ + ตั้งคูลดาวน์ตอนกด แล้วลงดาเมจจริง "หลังวีดีโอจบ" (ดู applyPralaya)
  //  why: สเปคระบุลำดับชัด — แจกเปราะบาง -> เล่นวีดีโอ -> ค่อยสร้างความเสียหาย
  startPralaya(engine, p) {
    p.arjunaUltCd = engine.roundNumber + PRALAYA_COOLDOWN;
    // มหาประลัยชำระล้างตัวผู้ปล่อยท่าก่อนเป็นอย่างแรก — ล้างดีบัฟของอรชุนทั้งหมด
    //  ทำ "ตอนกด" ไม่ใช่หลังวีดีโอ เพื่อให้ได้ผลแน่นอนแม้เส้นทางคัตซีนจะไม่ทำงาน
    //  (และต้องอยู่ก่อนการแจกเปราะบางด้านล่าง ไม่งั้นถ้าวันหนึ่งท่านี้แจกให้ตัวเองด้วย จะโดนล้างทิ้งทันที)
    const purged = engine.cleanseDebuffs(p);
    engine.log(purged > 0
      ? `🌊✨ ${p.name} Mahapralaya — มหาประลัยชำระล้างดีบัฟของตัวเองออกทั้งหมด (${purged} สถานะ)`
      : `🌊 ${p.name} Mahapralaya — ไม่มีดีบัฟติดอยู่ให้ชำระล้าง`);
    let hit = 0;
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id) continue;
      if (engine.applyDebuff(o, "fragile", PRALAYA_FRAGILE, PRALAYA_FRAGILE_TURNS)) hit++;
    }
    engine.log(`🌊 ${p.name} Mahapralaya — มหาประลัยกลืนกินสนาม! ทุกคน (${hit} คน) ติด "เปราะบาง" ${PRALAYA_FRAGILE} หน่วย ${PRALAYA_FRAGILE_TURNS} เทิร์น`);
    p.transformAt = engine.nextTransformCounter();
    engine.queueCutscene(p, "arjunaPralaya");
    return " — มหาประลัย";
  },

  // ลงความเสียหายจริง — ความแรงเท่ากับ "การโจมตีปกติ" ของอรชุนต่อเป้าหมายคนนั้น
  //  (คิดผ่าน engine.attackPowerAgainst จึงรวมสกิลติดตัว/สังหารโลกาให้อัตโนมัติ ตามสเปคที่ว่าใช้คู่กันได้)
  applyPralaya(engine, p) {
    if (!isArjuna(p) || !p.alive) return;
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id || engine.sameTeam(p, o)) continue;
      const dmg = Math.max(0, engine.attackPowerAgainst(p, o) || 0);
      if (dmg <= 0) { engine.log(`🌊 ${o.name} ไม่ได้รับความเสียหายจาก Mahapralaya (พลังโจมตีสุทธิ 0)`); continue; }
      engine.dealMixed(o, dmg);
      engine.log(`🌊 Mahapralaya — ${o.name} รับความเสียหาย -${dmg} (เท่าพลังโจมตีปกติของ ${p.name})`);
      engine.resolveDamageAftermath(o);
      if (!o.alive) engine.log(`💀 ${o.name} ถูกมหาประลัยกลืนหายไป!`);
    }
  },
};
