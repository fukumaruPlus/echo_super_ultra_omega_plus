// ============================================================
//  โมโรโบชิ ดัน (patch 2.8 new) — ไม้ค้ำ / นายทำให้ฉันผิดหวัง / ฉันบอกว่าอย่าหนี + อย่าให้ฉันต้องเฆี่ยนตี
//  + สกิลติดตัว "ครูฝึกสุดเหี้ยม" · "อาการบาดเจ็บ"
//
//  ครูฝึกที่ไม่ได้สู้ด้วยหมัดตัวเอง — พลังโจมตีปกติของเขาเป็น 0 หน่วยตายตัว (สกิลติดตัว 2 อาการบาดเจ็บ)
//  แต่ยังถูกบัฟทับได้ทุกทาง (computeAttackBase บวกบัฟ ungated ต่อจาก attackBaseOverride ตามปกติ)
//  ดาเมจของเขาจึงมาจาก "ผลของการที่คนอื่นเล่นพลาด" ล้วนๆ:
//    · ครูฝึกสุดเหี้ยม — ใครไพ่แตกโดนเพิ่มอีก 1 หน่วย (ทุกคนยกเว้นดันเอง)
//    · จงหลบแต่อย่าหนี — เป้าหมายที่ถูกขับรถตาม แพ้แต้ม = 1 หน่วย · ไพ่แตก = 2 หน่วย
//    · ศิษย์ — คนที่รับบัฟไปแล้วดันมาตีดัน โดนสวนคืน 3 หน่วย (แลกมาด้วยการที่บัฟหลุดทันที)
//
//  สถานะทั้ง 3 ตัวเป็นสถานะนับเทิร์นปกติ (ลดเทิร์นในลูปของ endTurn ได้เลย ไม่ต้อง continue):
//    danCrutch   (ที่ตัวดัน)    3 เทิร์น — ฟื้นพลังชีวิต 1 หน่วยต่อเทิร์น · ระหว่างติดอยู่กดซ้ำไม่ได้
//    danDisciple (ที่เป้าหมาย)  3 เทิร์น — เป้าหมายได้ ATK +1 แต่ถ้าตีดันจะโดนสวน + ดันรับดาเมจจากเขาน้อยลง 2
//    danChase    (ที่เป้าหมาย)  5 เทิร์น — ลงโทษทุกเทิร์นที่แพ้/ไพ่แตก · ตีดันครบ 2 ครั้ง = สลัดหลุดก่อนกำหนด
//                               · ระหว่างไล่ตามอยู่ ดันฟื้นแต้มสกิล +1 ต่อเทิร์น
//
//  วีดีโอทุกคลิปของตัวละครนี้เรียกผ่าน queueCutscene ตรงๆ = **เล่นทุกครั้ง** ไม่มีคลิปไหนเล่นครั้งเดียวต่อเกม
//  (dan_passive.mp4 ตั้ง noIntro ใน TRANSFORMS ด้วย — ตัดการ์ดเปิดตัว 950ms ทิ้ง เข้าวีดีโอเลย)
// ============================================================

const ID = "dan";

// ---------- สกิลพื้นฐาน ไม้ค้ำ ----------
const CRUTCH_TURNS = 3;
const CRUTCH_HEAL = 1;              // ฟื้นพลังชีวิตต่อเทิร์น (ติกตอนเริ่มเทิร์น)

// ---------- สกิลรอง นายทำให้ฉันผิดหวัง ----------
const DISCIPLE_TURNS = 3;
const DISCIPLE_ATK_BONUS = 1;       // อ่านจริงที่ computeAttackBase ใน server.js (บัฟ ungated ข้ามตัวละคร)
const DISCIPLE_COUNTER_DMG = 3;     // ศิษย์โจมตีปกติใส่ดัน -> สวนคืน (แล้วสถานะ "ศิษย์" หลุดทันที)
const DISCIPLE_DMG_REDUCE = 2;      // ความเสียหายที่ดันได้รับ "จากศิษย์" ลดลง

// ---------- ท่าไม้ตาย 1 ฉันบอกว่าอย่าหนี ----------
const CHASE_TURNS = 5;
const CHASE_LOSE_DMG = 1;           // เป้าหมายแต้มแพ้
const CHASE_BUST_DMG = 2;           // เป้าหมายไพ่แตก
const CHASE_BREAK_HITS = 2;         // เป้าหมายต้องโจมตีปกติใส่ดันครบเท่านี้ครั้ง ถึงจะสลัดสถานะหลุด
const CHASE_EARLY_REFUND = 3;       // จบก่อนครบ 5 เทิร์น -> คืนแต้มสกิลให้ดัน
const CHASE_SKILL_REGEN = 1;        // ระหว่างไล่ตามอยู่: ฟื้นแต้มสกิลให้ดันเทิร์นละเท่านี้
const WHIP_STREAK = 2;              // แพ้แต้มติดกันครบเท่านี้ (ไม่นับไพ่แตก) -> ท่าไม้ตายกลายเป็นไม้ตาย 2

// ---------- ท่าไม้ตาย 2 อย่าให้ฉันต้องเฆี่ยนตี ----------
const WHIP_DMG = 1;

// ---------- สกิลติดตัว 1 ครูฝึกสุดเหี้ยม ----------
const BUST_EXTRA_DMG = 1;           // ใครไพ่แตกรับความเสียหายเพิ่ม (ทุกคนยกเว้นดัน)

// ---------- สกิลติดตัว 2 อาการบาดเจ็บ ----------
const INJURED_ATK = 0;              // พลังโจมตีปกติฐาน 0 หน่วย (บัฟทับได้)

const IMG = {
  base: "/characters/dan/dan.webp",
  skill1: "/characters/dan/skill1/dan_skill1.jpg",
  skill2: "/characters/dan/skill2/dan_skill2.webp",
  skill3: "/characters/dan/skill3/dan_skill3.1.png",
  skill3b: "/characters/dan/skill3/dan_skill3.2.jpg",
};

function isDan(p) { return !!p && p.characterId === ID; }
function crutchOn(p) { return (p && p.statuses && p.statuses.danCrutch) > 0; }
function discipleOn(p) { return (p && p.statuses && p.statuses.danDisciple) > 0; }
function chaseOn(p) { return (p && p.statuses && p.statuses.danChase) > 0; }

// ดันที่ยัง "ทำงานอยู่" — ตายหรือสกิลติดตัวถูกผนึก = ครูฝึกสุดเหี้ยมหยุดทำงาน
function danOf(engine) {
  return Object.values(engine.players).find((p) => isDan(p) && p.alive && !engine.passiveSealed(p)) || null;
}
// เจ้าของสถานะที่แปะไว้ (ใช้ id ที่จำไว้ ไม่ใช่ "ดันคนไหนก็ได้" — เผื่อวันหลังมีดันมากกว่า 1 คนในสนาม)
function ownerOf(engine, p, key) {
  const id = p && p[key];
  const owner = id && engine.players[id];
  return owner && owner.alive ? owner : null;
}

// โหมดทีม: ผลด้านลบของดันต้องไม่ลงเพื่อนร่วมทีมตัวเอง (คอนเวนชันเดียวกับคอนเนอร์/ไบเลธ)
function friendlyTo(engine, owner, other) {
  if (!owner || !other || owner.id === other.id) return false;
  if (typeof engine.withEffectSource !== "function" || typeof engine.friendlyEffectBlocked !== "function") return false;
  return !!engine.withEffectSource(owner, () => engine.friendlyEffectBlocked(other));
}

// ปลดสถานะไล่ตามออกจากเป้าหมาย + ล้าง mirror ที่ตัวดัน (จุดเดียวที่ยกเลิก "จงหลบแต่อย่าหนี")
//  refund = true -> เป็นการ "จบก่อนครบ 5 เทิร์น" คืนแต้มสกิลให้ดัน CHASE_EARLY_REFUND หน่วย
//  ตั้งใจไม่คืนตอนดันเปลี่ยนเป้าหมายเอง (นั่นคือการย้ายเป้า ไม่ใช่ท่าถูกสลัดหลุด — ไม่งั้นกดวนรีดแต้มได้)
//  และไม่ส่ง src ให้ addSkill เพราะเป็นการ "คืนของที่จ่ายไป" ไม่ใช่ช่องทางฟื้นพลังงานจริง (ดีบัฟดูดซับเวทไม่ควรโรล)
function stopChase(engine, target, reason, refund) {
  if (!target) return;
  // กันเรียกซ้ำ: instantDeath() -> onDeath() ปลดสถานะให้ไปแล้ว จุดที่เรียกตามหลังต้องไม่คืนแต้มซ้ำอีกรอบ
  if (!chaseOn(target) && !target.danChaseBy) return;
  const owner = ownerOf(engine, target, "danChaseBy") || danOf(engine);
  delete target.statuses.danChase;
  if (target.statusAmt) delete target.statusAmt.danChase;
  target.danChaseBy = null;
  target.danLoseStreak = 0;
  target.danChaseHits = 0;
  if (owner && owner.danChaseTargetId === target.id) owner.danChaseTargetId = null;
  if (reason) engine.log(reason);
  if (refund && owner && owner.alive) {
    engine.addSkill(owner, CHASE_EARLY_REFUND);
    engine.log(`⚡ ${owner.name} "ฉันบอกว่าอย่าหนี" จบก่อนครบ ${CHASE_TURNS} เทิร์น — คืนแต้มสกิล +${CHASE_EARLY_REFUND}`);
  }
}

module.exports = {
  id: ID,
  IMG,
  CRUTCH_TURNS,
  CRUTCH_HEAL,
  DISCIPLE_TURNS,
  DISCIPLE_ATK_BONUS,
  DISCIPLE_COUNTER_DMG,
  DISCIPLE_DMG_REDUCE,
  CHASE_TURNS,
  CHASE_LOSE_DMG,
  CHASE_BUST_DMG,
  CHASE_BREAK_HITS,
  CHASE_EARLY_REFUND,
  CHASE_SKILL_REGEN,
  WHIP_STREAK,
  WHIP_DMG,
  BUST_EXTRA_DMG,

  // ---------- ฟิลด์เฉพาะตัวละคร: ต้องล้างทุกแมตช์ใหม่ (เรียกจาก resetCombat ของ server.js) ----------
  resetCombat(p) {
    p.danChaseTargetId = null; // ฝั่งดัน: id เป้าหมาย "จงหลบแต่อย่าหนี" ที่กำลังขับรถตามอยู่
    p.danChaseBy = null;       // ฝั่งเป้าหมาย: id ดันเจ้าของสถานะ
    p.danDiscipleBy = null;    // ฝั่งศิษย์: id ดันที่มอบสถานะให้
    p.danLoseStreak = 0;       // ฝั่งเป้าหมาย: จำนวนครั้งที่แพ้แต้มติดกัน (ไม่นับไพ่แตก)
    p.danChaseHits = 0;        // ฝั่งเป้าหมาย: จำนวนครั้งที่โจมตีปกติใส่ดันระหว่างถูกไล่ตาม (ครบ 2 = หลุด)
    p.danWhipRound = 0;        // ฝั่งดัน: รอบที่ใช้ "อย่าให้ฉันต้องเฆี่ยนตี" ได้ (0 = ยังไม่ปลดล็อก)
    p.danWhipTargetId = null;  // ฝั่งดัน: เป้าหมายที่หน้าต่างนี้เล็งไว้
  },

  // ---------- สกิลติดตัว 2 อาการบาดเจ็บ: พลังโจมตีปกติฐาน 0 หน่วย ----------
  //  ไม่เช็ค passiveSealed โดยตั้งใจ — เป็น "อาการบาดเจ็บ" ของตัวเขาเอง ไม่ใช่ผลที่ผนึกได้
  //  บัฟทุกตัวยังบวกทับได้ตามปกติ เพราะ computeAttackBase บวก veil/empower/partner/cardAtkBonus ต่อจากค่านี้
  attackBaseOverride(engine, attacker) {
    return isDan(attacker) ? INJURED_ATK : 1;
  },

  // ---------- สกิลรอง: ความเสียหายที่ดันได้รับ "จากศิษย์ของตัวเอง" ลดลง 2 หน่วย ----------
  //  ต้นตอดูจาก engine.effectSourceId (ทุก handler ที่ก่อดาเมจห่อ withEffectSource อยู่แล้ว)
  adjustIncomingDamage(engine, p, n) {
    if (!isDan(p) || n <= 0) return n;
    const srcId = engine.effectSourceId;
    const src = srcId && engine.players[srcId];
    if (!src || src.id === p.id) return n;
    if (!discipleOn(src) || src.danDiscipleBy !== p.id) return n;
    return Math.max(0, n - DISCIPLE_DMG_REDUCE);
  },

  // ---------- ต้นเทิร์น: ไม้ค้ำพยุงตัวเอง (เรียกในลูป onRoundStartTick ของ startRound) ----------
  onRoundStartTick(engine, p) {
    if (!isDan(p) || !p.alive) return;
    if (crutchOn(p)) {
      const healed = engine.healHp(p, CRUTCH_HEAL);
      if (healed > 0) engine.log(`🦯 ${p.name} ไม้ค้ำพยุงร่าง — ฟื้นพลังชีวิต +${healed} (เหลือ ${p.statuses.danCrutch} เทิร์น)`);
    }
    // "จงหลบแต่อย่าหนี" ยังไล่ตามอยู่ -> ฟื้นแต้มสกิลให้เทิร์นละ 1 หน่วย
    //  src = "passive" เพราะเป็นช่องทางฟื้นพลังงานจริงของตัวละคร (ดีบัฟ "ดูดซับเวท" มีสิทธิ์โรลกัน)
    const chased = this.chaseTargetOf(engine, p);
    if (chased) {
      const before = p.skillPoints;
      engine.addSkill(p, CHASE_SKILL_REGEN, "passive");
      const got = p.skillPoints - before;
      if (got > 0) engine.log(`🚗 ${p.name} ฉันบอกว่าอย่าหนี — ฟื้นแต้มสกิล +${got} (ไล่ตาม ${chased.name} อยู่ อีก ${chased.statuses.danChase} เทิร์น)`);
    }
  },

  // ---------- useSkill: ด่านเงื่อนไขก่อนหักแต้ม ----------
  canUseSkill(engine, p, tier) {
    if (!isDan(p)) return true;
    // ไม้ค้ำ: ระหว่างที่ยังมีผลอยู่ กดซ้ำไม่ได้
    if (tier === "basic" && crutchOn(p)) return false;
    // ท่าไม้ตาย 2 (อย่าให้ฉันต้องเฆี่ยนตี): ต้องมีเป้าหมาย "จงหลบแต่อย่าหนี" ที่ยังมีชีวิตอยู่
    if (tier === "ultimate" && this.whipReady(engine, p)) return !!this.whipTargetOf(engine, p);
    return true;
  },

  // เป้าหมาย "จงหลบแต่อย่าหนี" ที่ยังคาอยู่ (null = ไม่มี/ตายไปแล้ว/สถานะหมดอายุ)
  chaseTargetOf(engine, dan) {
    if (!dan || !dan.danChaseTargetId) return null;
    const t = engine.players[dan.danChaseTargetId];
    return t && t.alive && chaseOn(t) ? t : null;
  },

  // เป้าหมายของ "อย่าให้ฉันต้องเฆี่ยนตี" — จำแยกจาก danChaseTargetId โดยตั้งใจ
  //  เพราะหน้าต่างใช้งานถูกจองไว้ตั้งแต่ตอนสตรีคครบ ซึ่งอาจเป็นเทิร์นสุดท้ายของกับดักพอดี
  //  ถ้าไปอ่าน chaseTargetOf() ตอนกด สถานะจะหมดอายุไปแล้วและปุ่มจะหายก่อนได้กดจริง (บั๊กเดิม)
  whipTargetOf(engine, dan) {
    if (!dan || !dan.danWhipTargetId) return null;
    const t = engine.players[dan.danWhipTargetId];
    return t && t.alive ? t : null;
  },

  // ท่าไม้ตายสลับเป็น "อย่าให้ฉันต้องเฆี่ยนตี" ไหม
  //  ปลดล็อกเมื่อเป้าหมายแพ้แต้มติดกันครบ WHIP_STREAK ครั้ง (ไม่นับไพ่แตก) แล้วใช้ได้ "เทิร์นถัดไป 1 เทิร์น"
  //  ผูกกับเลขรอบ ไม่ผูกกับอายุของ danChase — กับดักหมดอายุพร้อมกันก็ยังต้องได้ใช้ตามที่ประกาศไว้
  whipReady(engine, dan) {
    if (!isDan(dan) || engine.passiveSealed(dan)) return false;
    if (engine.roundNumber !== (dan.danWhipRound || 0)) return false;
    return !!this.whipTargetOf(engine, dan);
  },

  // ---------- useSkill/publicState: เลือก object สกิลที่ใช้จริงของช่องนั้น ----------
  dynamicSkillFor(engine, p, ch, tier) {
    if (tier !== "ultimate") return ch[tier];
    return this.whipReady(engine, p) ? ch.ultimate2 : ch.ultimate;
  },

  // ---------- useSkill: ตรวจเป้าหมายที่ client ส่งมา (สกิลรอง + ท่าไม้ตาย 1) ----------
  prepareTarget(engine, p, tier, targets) {
    if (!isDan(p)) return null;
    // ท่าไม้ตาย 2 เล็งเป้าเดิมอัตโนมัติ ไม่ต้องให้ผู้เล่นเลือก
    if (tier === "ultimate" && this.whipReady(engine, p)) return this.whipTargetOf(engine, p);
    const id = Array.isArray(targets) ? targets[0] : targets;
    const t = id && engine.players[id];
    if (!t || !t.alive || t.id === p.id) return null;
    if (engine.sameTeam(p, t)) return null;
    if (engine.sealActive(t)) return null; // เรจูอาคมบัญชา: เล็งไม่ได้
    return t;
  },

  // ---------- useSkill: ลงผลของสกิลที่กด (instant ทั้งหมด — ทำงานก่อนเปิดการ์ด) ----------
  //  คืน suffix ต่อท้ายชื่อสกิลบนการ์ด skillFlash (string ว่าง = ไม่ต่อท้าย)
  applyInstantSkill(engine, p, tier, target) {
    if (!isDan(p)) return "";
    if (tier === "basic") return this.applyCrutch(engine, p);
    if (tier === "secondary") return this.applyDisciple(engine, p, target);
    if (tier === "ultimate") {
      // ท่าไม้ตาย 2 ลงดาเมจหลังวีดีโอจบ (useSkill เป็นคนคิววีดีโอ + หน่วงให้) — ที่นี่แค่รายงานเป้าหมาย
      if (this.whipReady(engine, p)) return target ? ` — ${target.name}` : "";
      return this.applyChase(engine, p, target);
    }
    return "";
  },

  // ---------- สกิลพื้นฐาน ไม้ค้ำ ----------
  applyCrutch(engine, p) {
    p.statuses.danCrutch = CRUTCH_TURNS;
    engine.log(`🦯 ${p.name} ไม้ค้ำ — พยุงตัวเอง ฟื้นพลังชีวิต ${CRUTCH_HEAL} หน่วยต่อเทิร์น เป็นเวลา ${CRUTCH_TURNS} เทิร์น`);
    return ` (${CRUTCH_TURNS} เทิร์น)`;
  },

  // ---------- สกิลรอง นายทำให้ฉันผิดหวัง ----------
  applyDisciple(engine, p, t) {
    if (!t) return "";
    // ศิษย์คนเก่าถูกปลดทันทีที่มอบให้คนใหม่ (ดันมีศิษย์ได้ทีละคน)
    for (const o of Object.values(engine.players)) {
      if (o.id !== t.id && discipleOn(o) && o.danDiscipleBy === p.id) {
        delete o.statuses.danDisciple;
        if (o.statusAmt) delete o.statusAmt.danDisciple;
        o.danDiscipleBy = null;
        engine.log(`🎓 ${o.name} พ้นสภาพศิษย์ของ ${p.name} — อาจารย์รับศิษย์คนใหม่แล้ว`);
      }
    }
    t.statuses.danDisciple = DISCIPLE_TURNS;
    t.danDiscipleBy = p.id;
    engine.log(`🎓 ${p.name} รับ ${t.name} เป็น "ศิษย์" ${DISCIPLE_TURNS} เทิร์น — พลังโจมตี +${DISCIPLE_ATK_BONUS} แต่ถ้าหันมาตีอาจารย์จะโดนสวนคืน ${DISCIPLE_COUNTER_DMG} หน่วย`);
    return ` — ศิษย์: ${t.name}`;
  },

  // ---------- ท่าไม้ตาย 1 ฉันบอกว่าอย่าหนี ----------
  applyChase(engine, p, t) {
    if (!t) return "";
    // ขับรถตามได้ทีละคน — เป้าหมายเดิมถูกปล่อยทันที
    const old = this.chaseTargetOf(engine, p);
    if (old && old.id !== t.id) stopChase(engine, old, `🚗 ${p.name} เลิกไล่ตาม ${old.name} — เปลี่ยนเป้าหมายใหม่`);
    t.statuses.danChase = CHASE_TURNS;
    t.danChaseBy = p.id;
    t.danLoseStreak = 0;
    t.danChaseHits = 0;
    p.danChaseTargetId = t.id;
    engine.log(`🚗 ${p.name} ฉันบอกว่าอย่าหนี! — ขับรถตาม ${t.name} ${CHASE_TURNS} เทิร์น (แพ้แต้ม -${CHASE_LOSE_DMG} · ไพ่แตก -${CHASE_BUST_DMG} · ต้องตีดันครบ ${CHASE_BREAK_HITS} ครั้งถึงจะสลัดหลุด)`);
    return ` — เป้าหมาย: ${t.name}`;
  },

  // ---------- ท่าไม้ตาย 2 อย่าให้ฉันต้องเฆี่ยนตี: ลงดาเมจหลังวีดีโอจบ ----------
  applyWhip(engine, p, t) {
    if (!isDan(p) || !t || !t.alive) return; // เป้าหมายตายระหว่างวีดีโอ -> ไม่ต้องลงดาเมจ
    p.danWhipRound = 0; // ใช้หน้าต่างนี้ไปแล้ว
    engine.withEffectSource(p, () => {
      engine.dealMixed(t, WHIP_DMG);
      t.wasAttacked = true;
      engine.maybeBeatSave(t); engine.maybeBeatMode(t); engine.maybeEva3(t); engine.maybeWakeKotone(t);
    });
    engine.log(`🥊 ${p.name} อย่าให้ฉันต้องเฆี่ยนตี — ${t.name} รับความเสียหาย -${WHIP_DMG}`);
    if (t.alive && t.hp <= 0) {
      engine.instantDeath(t);
      if (!t.alive) engine.log(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
    }
    if (!t.alive) stopChase(engine, t, `🚗 ${t.name} ตกรอบ — "จงหลบแต่อย่าหนี" หยุดทำงาน`, true);
  },

  // ---------- สกิลรอง: ศิษย์โจมตีปกติใส่ดัน -> เล่นวีดีโอ แล้วสวนคืน 3 หน่วย ----------
  //  เรียกจาก doAttack() หลังลงดาเมจจริง (จุดเดียวกับ conner.onAttackedNormally / haruka.tryCounter)
  //  คืน { dmg } เมื่อสวนสำเร็จ เพื่อให้ doAttack เล่นวีดีโอก่อนขึ้นสรุปความเสียหาย · null = ไม่เกิดอะไร
  onAttackedNormally(engine, attacker, target) {
    if (!isDan(target) || !target.alive || !attacker || !attacker.alive) return null;
    if (attacker.id === target.id) return null;
    if (!discipleOn(attacker) || attacker.danDiscipleBy !== target.id) return null;
    if (engine.sameTeam(target, attacker)) return null;

    engine.queueCutscene(target, "danDisciple"); // dan_skill2.mp4 เล่นก่อนสรุปความเสียหาย
    engine.withEffectSource(target, () => {
      engine.dealMixed(attacker, DISCIPLE_COUNTER_DMG);
      attacker.wasAttacked = true;
      engine.maybeBeatSave(attacker); engine.maybeBeatMode(attacker); engine.maybeEva3(attacker); engine.maybeWakeKotone(attacker);
    });
    engine.log(`🎓 ${target.name} นายทำให้ฉันผิดหวัง — สวนคืน ${attacker.name} ทันที -${DISCIPLE_COUNTER_DMG}`);
    // สวนได้ครั้งเดียวต่อการมอบ 1 ครั้ง แล้วสถานะ "ศิษย์" หลุดทันที
    //  ไม่งั้นเป้าหมายจะโจมตีดันไม่ได้เลยตลอด 3 เทิร์น (โดนสวน 3 หน่วยทุกหมัด) — ดันต้องกดสกิลรองใหม่ถึงจะรับศิษย์อีกครั้ง
    delete attacker.statuses.danDisciple;
    if (attacker.statusAmt) delete attacker.statusAmt.danDisciple;
    attacker.danDiscipleBy = null;
    engine.log(`🎓 ${attacker.name} พ้นสภาพ "ศิษย์" — สั่งสอนกันไปแล้วหนึ่งครั้ง`);
    if (attacker.alive && attacker.hp <= 0) {
      engine.instantDeath(attacker);
      if (!attacker.alive) engine.log(`💀 ${attacker.name} เลือดจริงหมด ตกรอบ!`);
    }
    return { dmg: DISCIPLE_COUNTER_DMG, videoQueued: true };
  },

  // ---------- ท่าไม้ตาย 1: เป้าหมายต้อง "ตีดัน" ครบ 2 ครั้ง ถึงจะสลัดสถานะหลุดก่อนเวลาปกติ ----------
  //  เรียกจาก doAttack() ตอนเริ่มโจมตี — นับที่ "ได้ออกหมัดใส่ดัน" ไม่ใช่ "ตีโดน"
  //  (ดันหลบ/กันดาเมจได้ก็ยังนับ — เป้าหมายเสียเทิร์นโจมตีของตัวเองไปแล้วเหมือนกัน)
  //  ตีคนอื่นไม่นับ: ต้องเป็นการหันมาสู้กับคนที่ไล่ตามเท่านั้น
  onChasedAttacked(engine, attacker, target) {
    if (!attacker || !chaseOn(attacker)) return false;
    if (!isDan(target)) return false;
    if (target.id !== attacker.danChaseBy) return false; // ดันคนอื่นที่ไม่ใช่คนไล่ตามอยู่
    attacker.danChaseHits = (attacker.danChaseHits || 0) + 1;
    if (attacker.danChaseHits < CHASE_BREAK_HITS) {
      engine.log(`🚗 ${attacker.name} สู้กลับ ${target.name} (${attacker.danChaseHits}/${CHASE_BREAK_HITS}) — ยังสลัด "จงหลบแต่อย่าหนี" ไม่หลุด`);
      return false;
    }
    stopChase(engine, attacker, `🚗 ${attacker.name} สู้กลับครบ ${CHASE_BREAK_HITS} ครั้ง — สลัด "จงหลบแต่อย่าหนี" หลุดก่อนเวลาปกติ!`, true);
    return true;
  },

  // ---------- afterResolve: ครูฝึกสุดเหี้ยม + จงหลบแต่อย่าหนี ----------
  //  ทำงานหลังเปิดไพ่ทุกคน (รู้ผลแพ้/ชนะ/ไพ่แตกครบแล้ว) และก่อนขึ้นสรุปผล
  //  ลำดับ: ลงโทษเป้าหมายไล่ตามก่อน แล้วค่อยกวาดคนไพ่แตกด้วยสกิลติดตัว — คลิปจึงเรียงตามลำดับเดียวกัน
  onAfterResolve(engine) {
    const dan = danOf(engine);
    if (!dan) return;

    // ---- ท่าไม้ตาย 1: เป้าหมายที่ถูกขับรถตาม ----
    const chased = this.chaseTargetOf(engine, dan);
    if (chased && !friendlyTo(engine, dan, chased)) {
      const busted = engine.bustedOf(chased);
      const lost = !busted && !!chased.isLoser;
      if (busted || lost) {
        const dmg = busted ? CHASE_BUST_DMG : CHASE_LOSE_DMG;
        // แพ้แต้มติดกัน (ไม่นับไพ่แตก) = เชื้อเพลิงของ "อย่าให้ฉันต้องเฆี่ยนตี"
        chased.danLoseStreak = lost ? (chased.danLoseStreak || 0) + 1 : 0;
        // สตรีคครบ -> จองสิทธิ์ใช้ "อย่าให้ฉันต้องเฆี่ยนตี" ไว้สำหรับเทิร์นถัดไปทันที
        //  จองที่ตัวดัน + จำ id เป้าหมายไว้เอง เพื่อให้รอดแม้ danChase จะหมดอายุใน endTurn เทิร์นเดียวกัน
        if (lost && chased.danLoseStreak >= WHIP_STREAK) {
          dan.danWhipRound = engine.roundNumber + 1;
          dan.danWhipTargetId = chased.id;
        }
        engine.queueCutscene(dan, busted ? "danChaseBust" : "danChaseLose");
        engine.withEffectSource(dan, () => {
          engine.dealMixed(chased, dmg);
          chased.wasAttacked = true;
          engine.maybeBeatSave(chased); engine.maybeBeatMode(chased); engine.maybeEva3(chased); engine.maybeWakeKotone(chased);
        });
        engine.log(`🚗 ${chased.name} ${busted ? "ไพ่แตก" : "แต้มแพ้"}ระหว่างถูกไล่ตาม — โดนชน -${dmg}${lost && chased.danLoseStreak >= WHIP_STREAK ? " (แพ้ติดกันครบ — เทิร์นหน้าดันเปลี่ยนเป็น \"อย่าให้ฉันต้องเฆี่ยนตี\")" : ""}`);
        if (chased.alive && chased.hp <= 0) {
          engine.instantDeath(chased);
          if (!chased.alive) engine.log(`💀 ${chased.name} เลือดจริงหมด ตกรอบ!`);
        }
        if (!chased.alive) stopChase(engine, chased, `🚗 ${chased.name} ตกรอบ — "จงหลบแต่อย่าหนี" หยุดทำงาน`, true);
      } else {
        chased.danLoseStreak = 0; // ไม่ได้แพ้แต้มเทิร์นนี้ = ตัดสตรีคทิ้ง
      }
    }

    // ---- สกิลติดตัว 1 ครูฝึกสุดเหี้ยม: ใครไพ่แตกโดนเพิ่ม 1 หน่วย (ทุกคนยกเว้นดัน) ----
    //  วีดีโอ "ไอ้โง่ เจ้าโง่ โง่จริงๆ" เป็นการด่าเฉพาะตัว — เล่นให้ **เฉพาะคนที่ไพ่แตก** เห็นเท่านั้น
    //  (ส่ง onlyFor ให้ queueCutscene · คนอื่นยังหยุดรอครบเวลาเดียวกันแต่จอไม่ขึ้นคลิป)
    //  และคิวคลิปเดียวต่อเทิร์นถึงจะมีคนแตกพร้อมกันหลายคน — รวมทุกคนไว้ในลิสต์เดียว
    const scoldTargets = [];
    for (const o of engine.alivePlayers()) {
      if (isDan(o) || !engine.bustedOf(o)) continue;
      if (friendlyTo(engine, dan, o)) continue;
      scoldTargets.push(o);
    }
    if (scoldTargets.length) engine.queueCutscene(dan, "danScold", scoldTargets.map((o) => o.id));
    for (const o of scoldTargets) {
      engine.withEffectSource(dan, () => {
        engine.dealMixed(o, BUST_EXTRA_DMG);
        o.wasAttacked = true;
        engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeEva3(o); engine.maybeWakeKotone(o);
      });
      engine.log(`👊 ครูฝึกสุดเหี้ยม — ${o.name} ไพ่แตก รับความเสียหายเพิ่ม -${BUST_EXTRA_DMG}`);
      if (o.alive && o.hp <= 0) {
        engine.instantDeath(o);
        if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`);
      }
      if (!o.alive && chaseOn(o)) stopChase(engine, o, `🚗 ${o.name} ตกรอบ — "จงหลบแต่อย่าหนี" หยุดทำงาน`, true);
    }
  },

  // ---------- เป้าหมาย/ดันตกรอบ -> เก็บกวาดสถานะที่ผูกกันไว้ ----------
  //  เรียกจาก instantDeath() — ถ้าไม่ทำ ธง danChaseTargetId จะค้างชี้ไปที่คนตายทั้งแมตช์
  onDeath(engine, p) {
    if (!p) return;
    if (chaseOn(p)) stopChase(engine, p, `🚗 ${p.name} ตกรอบ — "จงหลบแต่อย่าหนี" หยุดทำงาน`, true);
    if (!isDan(p)) return;
    const t = this.chaseTargetOf(engine, p);
    if (t) stopChase(engine, t, `🚗 ${p.name} ตกรอบ — "จงหลบแต่อย่าหนี" หยุดทำงาน`);
    for (const o of Object.values(engine.players)) {
      if (discipleOn(o) && o.danDiscipleBy === p.id) {
        delete o.statuses.danDisciple;
        if (o.statusAmt) delete o.statusAmt.danDisciple;
        o.danDiscipleBy = null;
      }
    }
  },

  // ---------- endTurn: สถานะหมดอายุเองตามลูปปกติ -> ล้าง mirror ให้ครบ ----------
  onStatusExpire(engine, p, key) {
    if (key === "danChase") {
      const owner = ownerOf(engine, p, "danChaseBy");
      if (owner && owner.danChaseTargetId === p.id) owner.danChaseTargetId = null;
      p.danChaseBy = null;
      p.danLoseStreak = 0;
      p.danChaseHits = 0;
      // อยู่ครบ CHASE_TURNS เทิร์นเต็ม = ไม่ใช่ "จบก่อนกำหนด" จึงไม่มีการคืนแต้มสกิล
      engine.log(`🚗 ${p.name} หลุดพ้นจาก "จงหลบแต่อย่าหนี" — หมดเวลาไล่ตาม`);
    } else if (key === "danDisciple") {
      p.danDiscipleBy = null;
      engine.log(`🎓 ${p.name} พ้นสภาพ "ศิษย์" — หมดเวลา`);
    }
  },
};
