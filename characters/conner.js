// ============================================================
//  คอนเนอร์ RK800 (patch 2.7 new) — วิเคราะห์สถานการณ์ / ข่มขวัญ-จับกุม / จัดการปิดคดี
//  + สกิลติดตัว "สืบสวน" · "จับกุมขั้นเด็ดขาด" · "ปัญญาประดิษฐ์" · "การป้องกันตัว"
//
//  แกนกลางของตัวละครคือมิเตอร์ "ความเครียด" (p.connorStress 0-10) ที่ติดอยู่กับ **ผู้เล่นคนอื่นทุกคน**
//  ไม่ใช่ที่ตัวคอนเนอร์เอง — เป็นตัวเลข UI ล้วน ไม่ใช่สถานะ จึงต้าน/ล้างไม่ได้ และไม่อยู่ในลูปลดเทิร์นของ endTurn()
//    0-3  = ผู้ต้องสงสัย    (suspect)   — สกิลรองได้แค่ผลพื้นฐาน
//    4-8  = ผู้กระทำความผิด (offender)  — สกิลรองได้โบนัสเพิ่ม (วีดีโอ + ฟื้นแต้มสกิลให้คอนเนอร์)
//    9-10 = อาชญากร        (criminal)  — สกิลรองเปิดฉาก "จับกุมขั้นเด็ดขาด" · ท่าไม้ตายเล็งได้เฉพาะระดับนี้
//  โบนัสสะสมขึ้นตามระดับ: อาชญากรได้ผลของผู้กระทำความผิดด้วย
//  ระดับถูกประเมิน **หลัง** บวกความเครียดของสกิลรองแล้วเสมอ (8 -> 9 = จับกุมได้ในหมัดเดียวกัน)
//
//  ส่วนที่ซับซ้อนที่สุดคือ "การไล่ล่า" (สกิลติดตัว 2) — โหมดกติกาพิเศษ 3 เทิร์นที่
//    · ระงับการสรุปรอบปกติทั้งหมด (ไม่มีผู้ชนะ/ผู้แพ้/ดาเมจแพ้จั่ว/ดาเมจไพ่แตก/แต้มสกิลจากการแพ้)
//    · แช่แข็งผู้เล่นที่ไม่เกี่ยวข้อง (บังคับไพ่แตก + ล็อกไพ่ + ห้ามจั่ว/กดสกิล/ใช้ไอเทม) แต่ไม่โดนดาเมจ
//    · ข้ามเฟส ATTACK ทุกเทิร์น เหลือแค่ จั่ว -> สรุปแต้ม
//    · นับแต้มดวลระหว่างคอนเนอร์กับเป้าหมาย 3 ครั้ง (เทิร์นที่แต้มสูงกว่าได้ 1 แต้ม · เสมอ = ไม่มีใครได้)
//  สถานะการไล่ล่าเก็บที่ตัวคอนเนอร์ (p.connorChase) ไม่ใช่ตัวแปร module — สแนปช็อต Overload Force
//  จึงย้อนคืนได้ครบเหมือนฟิลด์อื่น และรีเซ็ตทิ้งเองผ่าน resetCombat()
//
//  วีดีโอ: connor_arrest_* / connor_passive4 / connor_skill3 เล่น **ทุกครั้ง** (queueCutscene ตรงๆ)
//          ส่วน connor_skill2 (สอบปากคำ) และ conner_openning (เปิดตัว) เล่นครั้งเดียวต่อเกม (triggerCutscene)
// ============================================================

const ID = "conner";

// ---------- สกิลติดตัว 1 สืบสวน (ความเครียด) ----------
const STRESS_MAX = 10;
const STRESS_OFFENDER = 4;          // 4-8 = ผู้กระทำความผิด
const STRESS_CRIMINAL = 9;          // 9-10 = อาชญากร
const STRESS_PER_ACTION = 1;        // กดสกิล / ใช้ไอเทม / ชนะ / จั่วไพ่ (จั่วนับ 1 ครั้งต่อเทิร์นไม่ว่ากี่ใบ)
const STRESS_ON_HIT_CONNOR = 2;     // โจมตีปกติใส่คอนเนอร์ -> ผู้โจมตีเครียด +2
const STRESS_DECAY_TURN = 1;        // ลดลง 1 หน่วยต่อเทิร์น
// balance 3.4.2: เดิมไพ่แตกลดความเครียดเพิ่มอีก 1 (STRESS_DECAY_BUST) — ตัดทิ้งแล้ว
//  เพราะเปิดช่องให้เป้าหมายที่โดนไล่บี้ "ยอมไพ่แตกทิ้งเทิร์น" เพื่อกดความเครียดเป็นลบสุทธิ
//  = จับกุมไม่ได้ตลอดเกม และมันย้อนแก่นตัวละครด้วย (คนที่พิรุธควรเครียดขึ้น ไม่ใช่ลง)

// ---------- สกิลพื้นฐาน วิเคราะห์สถานการณ์ (rework 3.4.2) ----------
//  คาดการณ์ "ลำดับการกระทำของเป้าหมายในเทิร์นที่แล้ว" — ยิ่งทายถูกมาก ผลยิ่งเยอะเป็นขั้นๆ
//  กติกาที่ตกลงไว้ (ถามผู้เล่นแล้ว):
//   · นับแบบ "เทียบช่องต่อช่อง" — ทายผิดกลางทางแล้วช่องหลังยังมีสิทธิ์ถูกได้
//   · รางวัลเป็นเส้นตรง N:N — ถูก N ข้อ ได้พลังชีวิต +N และแต้มสกิล +N
//   · ลำดับจริงนับ "เฉพาะครั้งแรก" ของแต่ละประเภท จึงยาวสุด 4 ช่อง (ตรงกับสเปคที่ให้เลือก 4 ข้อ)
//   · ทายว่า "ไม่ได้ทำอะไรเลย" ได้ (ส่งลำดับว่าง) — ถูกก็นับเป็นถูกทุกข้อ แต่ได้ 0 ข้อจึงไม่มีเลือด/แต้มสกิล
const PREDICT_ORDER = ["draw", "item", "skill", "shop"]; // เลข 1-4 ที่ผู้เล่นเห็นบนปุ่ม
const PREDICT_LABEL = { draw: "จั่วการ์ด", item: "ใช้ไอเทม", skill: "ใช้สกิล", shop: "ซื้อของ" };
const PREDICT_HEAL_PER = 1;         // ถูก 1 ข้อ = ฟื้นพลังชีวิต 1
const PREDICT_SKILL_PER = 1;        // ถูก 1 ข้อ = ฟื้นแต้มสกิล 1
const PREDICT_PERFECT_STRESS = 5;   // ทายถูกทุกข้อ = ความเครียดเป้าหมาย +5
const PREDICT_MUSIC = "conner_think"; // conner_think.m4a — เล่นตอนกดใช้งาน

// ---------- สกิลรอง ข่มขวัญ/จับกุม ----------
const INTIMIDATE_STRESS = 1;        // ความเครียดที่เพิ่มให้เป้าหมาย (ระดับผู้ต้องสงสัย)
// balance 3.4.2: ยิ่งคดีแน่นหนา ยิ่งบีบได้แรงขึ้น — ที่ระดับผู้กระทำความผิดขึ้นไปเพิ่มทีละ 2
//  แก้ปัญหาที่สกิลรอง +1 หักล้างพอดีกับดีเคย์ -1 จนความเครียดไต่ไม่ขึ้น
//  คิดจากระดับ "ก่อน" กดครั้งนี้ (ระดับหลังกดยังใช้ตัดสินโบนัสอื่นเหมือนเดิม)
const INTIMIDATE_STRESS_HIGH = 2;
const INTIMIDATE_SKILL_DRAIN = 1;   // แต้มสกิลที่ดูดออกจากเป้าหมาย
const INTIMIDATE_SELF_REFUND = 1;   // ระดับผู้กระทำความผิดขึ้นไป: ฟื้นแต้มสกิลให้ตัวเอง

// ---------- ท่าไม้ตาย จัดการปิดคดี ----------
const CLOSE_CASE_DMG = 5;

// ---------- สกิลติดตัว 2 จับกุมขั้นเด็ดขาด ----------
const CHASE_ROUNDS = 3;             // นับแต้มดวลกันสูงสุด 3 ครั้ง
const CHASE_CLINCH = 2;             // ใครถึง 2 แต้มก่อน = ชนะทันที ไม่ต้องนับให้ครบ 3 (เสียงข้างมากของ 3)
const SURRENDER_STUN = 3;           // ยอมจำนน: สตั้น 3 เทิร์น
const SURRENDER_ACCUSED = 5;        // ยอมจำนน: ติด "ผู้ต้องหา" 5 เทิร์น
const CAUGHT_STUN = 3;              // ขัดขืนแล้วแพ้: สตั้น 3 เทิร์น
const CAUGHT_ACCUSED = 5;           // ขัดขืนแล้วแพ้: ติด "ผู้ต้องหา" 5 เทิร์น
const CAUGHT_DMG = 3;               // ขัดขืนแล้วแพ้: ความเสียหาย 3 หน่วย
const ESCAPED_CONNOR_STUN = 3;      // ขัดขืนแล้วชนะ: คอนเนอร์สตั้น 3 เทิร์น
const CHASE_MUSIC = "conner_theme"; // conner_theme.m4a — เพลงไล่ล่า (ออร่าขอบจอแดงคู่กัน)

// ---------- สกิลติดตัว 3 ปัญญาประดิษฐ์ ----------
const REVIVE_DELAY = 10;            // ฟื้นคืนชีพ 10 เทิร์นหลังตาย
const REVIVE_MAX = 2;               // 2 ครั้งต่อเกม
const REVIVE_HP = 3;
const REVIVE_ARMOR = 2;

// ---------- สกิลติดตัว 4 การป้องกันตัว ----------
const ACCUSED_ATK_BONUS = 2;        // โจมตีปกติใส่คนที่ติด "ผู้ต้องหา" แรงขึ้น +2
// balance 3.4.2: 15% -> 35% · เงื่อนไข "คนที่ไม่ใช่คนเดิม" กรองไปครึ่งหนึ่งอยู่แล้ว
//  โอกาสจริงที่ผู้เล่นได้เห็นท่านี้จึงต่ำกว่า 15% มาก (มีคลิปเตรียมไว้แต่แทบไม่เคยได้เล่น)
const COUNTER_CHANCE = 0.35;
const COUNTER_DMG = 1;              // สร้างความเสียหายคืนใส่ผู้โจมตีทั้ง 2 คน คนละ 1

const IMG = {
  base: "/characters/connor/conner.webp",
  skill1: "/characters/connor/conner_skill1.jpg",
  skill2: "/characters/connor/skill2/conner_skill2.jpg",
  skill3: "/characters/connor/skill3/conner_skill3.webp",
};

const LEVELS = {
  suspect:  { key: "suspect",  name: "ผู้ต้องสงสัย",     icon: "🔎", color: "#9AA5B1" },
  offender: { key: "offender", name: "ผู้กระทำความผิด", icon: "⚠️", color: "#E5B33B" },
  criminal: { key: "criminal", name: "อาชญากร",         icon: "🚨", color: "#C0392B" },
};

function isConner(p) { return !!p && p.characterId === ID; }
// บอสยูกิอยู่นอกระบบสืบสวนทั้งหมด — ไม่มีความเครียด เล็งด้วยสกิลรอง/ท่าไม้ตายไม่ได้
//  (สตั้นจากการจับกุมจะทำให้ลูป autoPlayYuuki ของบอสค้าง และบอสไม่ได้ "กดสกิล" ให้เก็บสถิติอยู่แล้ว)
function isBoss(engine, p) {
  const boss = typeof engine.yuukiBoss === "function" ? engine.yuukiBoss() : null;
  return !!p && !!boss && p.id === boss.id;
}
function stressOf(p) { return Math.max(0, Math.min(STRESS_MAX, (p && p.connorStress) || 0)); }
function levelKeyOf(p) {
  const n = stressOf(p);
  if (n >= STRESS_CRIMINAL) return "criminal";
  if (n >= STRESS_OFFENDER) return "offender";
  return "suspect";
}

// คอนเนอร์ที่ยัง "ทำงานอยู่" ในสนาม — ตายหรือสกิลติดตัวถูกผนึก = มิเตอร์ความเครียดหยุดทำงาน
//  (ค่าที่สะสมไว้ยังค้างอยู่เฉยๆ รอเขากลับมาด้วยสกิลติดตัว 3)
function connerOf(engine) {
  return Object.values(engine.players).find((p) => isConner(p) && p.alive && !engine.passiveSealed(p)) || null;
}
// ใช้กับ UI/วีดีโอเปิดตัว: คอนเนอร์คนใดก็ได้ในแมตช์ (รวมที่ตายรอฟื้นคืนชีพ) — มีได้คนเดียวต่อเกมอยู่แล้ว
function connerSlot(engine) {
  return Object.values(engine.players).find((p) => isConner(p)) || null;
}

// โหมดทีม: ผลด้านลบของคอนเนอร์ต้องไม่ลงเพื่อนร่วมทีมตัวเอง (คอนเวนชันเดียวกับไบเลธ/เอสคานอร์)
function friendlyTo(engine, owner, other) {
  if (!owner || !other || owner.id === other.id) return false;
  if (typeof engine.withEffectSource !== "function" || typeof engine.friendlyEffectBlocked !== "function") return false;
  return !!engine.withEffectSource(owner, () => engine.friendlyEffectBlocked(other));
}

module.exports = {
  id: ID,
  IMG,
  LEVELS,
  STRESS_MAX,
  STRESS_OFFENDER,
  STRESS_CRIMINAL,
  CHASE_ROUNDS,
  CHASE_CLINCH,
  REVIVE_MAX,
  REVIVE_DELAY,
  CLOSE_CASE_DMG,
  COUNTER_CHANCE,
  PREDICT_ORDER,
  PREDICT_LABEL,
  PREDICT_PERFECT_STRESS,
  INTIMIDATE_STRESS,
  INTIMIDATE_STRESS_HIGH,
  ACCUSED_ATK_BONUS,
  isConner,
  stressOf,
  levelKeyOf,
  connerOf,
  connerSlot,
  levelName(p) { return LEVELS[levelKeyOf(p)].name; },

  // ============================================================
  //  สกิลติดตัว 1 สืบสวน — มิเตอร์ความเครียด
  // ============================================================
  //  จุดเดียวที่แก้ค่านี้ได้ ทุกแหล่งต้องเรียกผ่านที่นี่ (เคารพเพดาน 0-10 และกติกา "ไม่ลงตัวคอนเนอร์เอง")
  //  ไม่เช็ค resist/ต้านสถานะโดยตั้งใจ — สเปคระบุว่าเป็น UI ไม่ใช่สถานะที่ล้างหรือต้านได้
  addStress(engine, p, n, why) {
    if (!p || !p.alive || isConner(p) || isBoss(engine, p)) return 0;
    if (!connerOf(engine)) return 0;             // ไม่มีคอนเนอร์ที่ยังทำงานอยู่ = ไม่มีระบบสืบสวน
    const before = stressOf(p);
    p.connorStress = Math.max(0, Math.min(STRESS_MAX, before + n));
    const diff = p.connorStress - before;
    if (diff !== 0 && why) {
      const lv = LEVELS[levelKeyOf(p)];
      engine.log(`🔍 ${p.name} ${why} — ความเครียด ${diff > 0 ? "+" : ""}${diff} (${p.connorStress}/${STRESS_MAX} · ${lv.icon} ${lv.name})`);
    }
    return diff;
  },

  // ============================================================
  //  บันทึก "ลำดับการกระทำต่อเทิร์น" — วัตถุดิบของสกิลพื้นฐาน วิเคราะห์สถานการณ์
  // ============================================================
  //  p.connorActions     = ลำดับของเทิร์นนี้ (กำลังสะสม)
  //  p.connorActionsPrev = ลำดับของเทิร์นที่แล้ว (สิ่งที่คอนเนอร์ต้องทาย)
  //  บันทึก "เฉพาะครั้งแรก" ของแต่ละประเภท ลำดับจึงยาวสุด 4 ช่อง — ตรงกับปุ่ม 4 ข้อที่ผู้เล่นเห็น
  //  ⚠️ บันทึกเสมอแม้ไม่มีคอนเนอร์ในสนาม (ต่างจาก addStress) เพราะคอนเนอร์ฟื้นคืนชีพกลับมาได้
  //  ด้วยสกิลติดตัว 3 — ถ้าหยุดบันทึกตอนเขาตาย เทิร์นแรกที่กลับมาจะไม่มีข้อมูลให้ทาย
  recordAction(engine, p, kind) {
    if (!p || !PREDICT_ORDER.includes(kind)) return;
    p.connorActions = p.connorActions || [];
    if (p.connorActions.includes(kind)) return; // นับเฉพาะครั้งแรกของแต่ละประเภท
    p.connorActions.push(kind);
  },
  // เรียกต้นเทิร์นจาก dealRound() — ต้องอยู่ "ก่อน" การกระทำใดๆ ของเทิร์นใหม่
  rotateActions(p) {
    if (!p) return;
    p.connorActionsPrev = p.connorActions || [];
    p.connorActions = [];
  },
  actionsPrevOf(p) { return Array.isArray(p && p.connorActionsPrev) ? p.connorActionsPrev : []; },

  // ---- ทริกเกอร์ที่ทำให้ความเครียดเพิ่ม (เรียกจาก server.js จุดละ 1 บรรทัด) ----
  onSkillUsed(engine, p) { this.recordAction(engine, p, "skill"); this.addStress(engine, p, STRESS_PER_ACTION, "ใช้สกิล"); },
  onItemUsed(engine, p) { this.recordAction(engine, p, "item"); this.addStress(engine, p, STRESS_PER_ACTION, "ใช้ไอเทม"); },
  // ซื้อของจากร้านค้ามายา — ไม่เพิ่มความเครียด (ไม่อยู่ในสเปคสกิลติดตัว) แต่เข้าลำดับการกระทำ
  onShopBuy(engine, p) { this.recordAction(engine, p, "shop"); },
  onRoundWin(engine, p) {
    this.addStress(engine, p, STRESS_PER_ACTION, "ชนะการจั่ว");
  },
  // การจั่วไพ่นับแค่ +1 ต่อเทิร์น ไม่ว่าจะจั่วกี่ใบ (ธงรีเซ็ตต้นเทิร์นที่ onRoundStartTick)
  onCardDraw(engine, p) {
    this.recordAction(engine, p, "draw"); // เข้าลำดับการกระทำเสมอ แม้โควตาความเครียดของเทิร์นจะเต็มแล้ว
    if (!p || p.connorStressDrewRound) return;
    p.connorStressDrewRound = true;
    this.addStress(engine, p, STRESS_PER_ACTION, "จั่วการ์ด");
  },
  // การโจมตีปกติที่ลงที่ตัวคอนเนอร์ -> "ผู้โจมตี" เครียด +2
  onConnerAttacked(engine, attacker, target) {
    if (!isConner(target) || !attacker) return;
    this.addStress(engine, attacker, STRESS_ON_HIT_CONNOR, `โจมตี ${target.name}`);
  },
  // ลดลง 1 หน่วยต่อเทิร์น (+1 ถ้าไพ่แตกในเทิร์นนั้น) — เรียกจาก endTurn() ก่อนล้างธงประจำเทิร์น
  onEndTurnDecay(engine, p) {
    if (!p || !p.alive || isConner(p) || stressOf(p) <= 0) return;
    if (!connerOf(engine)) return;
    this.addStress(engine, p, -STRESS_DECAY_TURN, "ผ่อนคลายลง");
  },

  // ============================================================
  //  เงื่อนไขการกดสกิล — เรียกจาก useSkill() ก่อนหักแต้ม
  // ============================================================
  canUseSkill(engine, p, tier) {
    // สกิลพื้นฐานกดไม่ได้ระหว่างอยู่ในโหมดจับกุมขั้นเด็ดขาด (สเปคระบุชัด)
    //  และกดไม่ได้ในเทิร์นแรก เพราะยังไม่มี "เทิร์นที่แล้ว" ให้คาดการณ์
    if (tier === "basic") return !this.chaseActive(engine) && engine.roundNumber > 1;
    // ท่าไม้ตายต้องมีเป้าหมายระดับอาชญากรอย่างน้อย 1 คน (เช็คตัวเป้าหมายจริงที่ prepareTarget อีกชั้น)
    if (tier === "ultimate") return this.criminalTargets(engine, p).length > 0;
    return true;
  },

  // เป้าหมายที่ถูกกฎ: ผู้เล่นอื่นที่ยังอยู่ ไม่ใช่เพื่อนร่วมทีม และไม่ถูกอาคมบัญชาคุ้มครอง
  legalTargets(engine, p) {
    return engine.alivePlayers().filter((o) => o.id !== p.id && !isBoss(engine, o) && !friendlyTo(engine, p, o) && !engine.sealActive(o));
  },
  criminalTargets(engine, p) {
    return this.legalTargets(engine, p).filter((o) => levelKeyOf(o) === "criminal");
  },
  //  สกิลพื้นฐาน (rework 3.4.2) ก็ต้องเลือกเป้าหมาย 1 คนแล้ว — ใช้ด่านเดียวกับสกิลรอง/ท่าไม้ตาย
  prepareTarget(engine, p, tier, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id || isBoss(engine, t)) return null;
    if (friendlyTo(engine, p, t) || engine.sealActive(t)) return null;
    // จัดการปิดคดี: เลือกได้เฉพาะระดับอาชญากรเท่านั้น
    if (tier === "ultimate" && levelKeyOf(t) !== "criminal") return null;
    return t;
  },

  // ============================================================
  //  ผลของสกิล (instant — ทำงานก่อนเปิดการ์ดทุกช่อง)
  // ============================================================
  applyInstantSkill(engine, p, tier, target) {
    if (tier === "basic") return this.applyPredict(engine, p, target);
    if (tier === "secondary") return this.applyIntimidate(engine, p, target);
    if (tier === "ultimate") return target ? ` — ปิดคดี ${target.name}` : "";
    return "";
  },

  // ---------- สกิลพื้นฐาน: วิเคราะห์สถานการณ์ (rework 3.4.2) ----------
  //  คาดการณ์ลำดับการกระทำของเป้าหมายในเทิร์นที่แล้ว
  //  ทำความสะอาดลำดับที่ผู้เล่นส่งมา: เอาเฉพาะคีย์ที่ถูกต้อง ตัดตัวซ้ำ และยาวไม่เกิน 4 ช่อง
  //  คืน array (อาจว่าง = ทายว่า "ไม่ได้ทำอะไรเลย") หรือ null ถ้า payload ผิดรูปจนใช้ไม่ได้
  sanitizeGuess(raw) {
    if (raw == null) return null;
    const arr = Array.isArray(raw) ? raw : [raw];
    const out = [];
    for (const k of arr) {
      if (!PREDICT_ORDER.includes(k)) return null; // มีคีย์แปลกปลอม = payload ผิดรูป ไม่เดาใจให้
      if (!out.includes(k)) out.push(k);
    }
    return out.slice(0, PREDICT_ORDER.length);
  },

  // เทียบช่องต่อช่อง — ทายผิดกลางทางแล้วช่องหลังยังมีสิทธิ์ถูกได้
  //  perfect = ความยาวเท่ากันและตรงทุกช่อง (รวมกรณีทั้งคู่ว่าง = ทาย "ไม่ได้ทำอะไรเลย" ถูก)
  scorePrediction(truth, guess) {
    const t = Array.isArray(truth) ? truth : [];
    const g = Array.isArray(guess) ? guess : [];
    let correct = 0;
    for (let i = 0; i < Math.max(t.length, g.length); i++) if (t[i] && g[i] && t[i] === g[i]) correct++;
    return { correct, perfect: t.length === g.length && correct === t.length };
  },

  applyPredict(engine, p, target) {
    const guess = p.connorGuess || [];
    p.connorGuess = null;
    if (!target || !target.alive) {
      engine.log(`🧠 ${p.name} วิเคราะห์สถานการณ์ — ไม่มีเป้าหมาย`);
      return " — ไม่มีเป้าหมาย";
    }
    const truth = this.actionsPrevOf(target);
    const { correct, perfect } = this.scorePrediction(truth, guess);
    const fmt = (a) => (a.length ? a.map((k, i) => `${i + 1}.${PREDICT_LABEL[k]}`).join(" → ") : "ไม่ได้ทำอะไรเลย");
    engine.log(`🧠 ${p.name} วิเคราะห์สถานการณ์ ${target.name} — คาดการณ์ "${fmt(guess)}" · ความจริงคือ "${fmt(truth)}"`);

    if (correct > 0) {
      const heal = engine.healHp(p, correct * PREDICT_HEAL_PER);
      const before = p.skillPoints;
      engine.addSkill(p, correct * PREDICT_SKILL_PER, "passive");
      engine.log(`🧠 ตรงกัน ${correct} ข้อ — ${p.name} ฟื้นพลังชีวิต +${heal} และแต้มสกิล +${p.skillPoints - before}`);
    } else if (!perfect) {
      engine.log(`🧠 ไม่ตรงสักข้อ — ${p.name} ประมวลผลพลาด ไม่ได้อะไรเลย`);
    }

    if (perfect) {
      this.addStress(engine, target, PREDICT_PERFECT_STRESS, `ถูก ${p.name} อ่านขาดทุกการกระทำ`);
      p.connorReadId = target.id; // เปิดแต้มการ์ดของเป้าหมายให้คอนเนอร์เห็นตลอดเทิร์นนี้
      engine.log(`🧠✨ ${p.name} อ่านขาดทั้งลำดับ! — ความเครียดของ ${target.name} +${PREDICT_PERFECT_STRESS} และมองเห็นแต้มการ์ดของเขาตลอดเทิร์นนี้`);
      return ` — อ่านขาด ${target.name}!`;
    }
    return ` — ตรงกัน ${correct}/${truth.length || guess.length || 0} ข้อ`;
  },

  // แต้มการ์ดของ p ถูกเปิดให้ viewer (คอนเนอร์) เห็นอยู่ไหม — เรียกจาก buildStateFor
  readsScoreOf(viewer, p) {
    return isConner(viewer) && !!viewer.connorReadId && viewer.connorReadId === p.id;
  },

  // ---------- สกิลรอง: ข่มขวัญ / จับกุม ----------
  applyIntimidate(engine, p, target) {
    if (!target || !target.alive) {
      engine.log(`🚔 ${p.name} ข่มขวัญ/จับกุม — ไม่มีเป้าหมาย`);
      return " — พลาดเป้า";
    }
    const lvBefore = levelKeyOf(target);
    const gain = lvBefore === "suspect" ? INTIMIDATE_STRESS : INTIMIDATE_STRESS_HIGH;
    this.addStress(engine, target, gain, `ถูก ${p.name} ข่มขวัญ`);
    const drained = Math.min(INTIMIDATE_SKILL_DRAIN, target.skillPoints || 0);
    if (drained > 0) target.skillPoints -= drained; // การโอนแต้มระหว่างผู้เล่น ไม่ผ่าน addSkill (ไม่ใช่ "ช่องทางฟื้นฟู")
    const lv = levelKeyOf(target); // ระดับถูกประเมินหลังบวกความเครียดแล้ว
    engine.log(`🚔 ${p.name} ข่มขวัญ/จับกุม ${target.name} — ความเครียด +${gain}${drained > 0 ? ` · แต้มสกิล -${drained}` : ""} (${LEVELS[lv].icon} ${LEVELS[lv].name})`);

    // โบนัสสะสมขึ้นตามระดับ: อาชญากรได้ผลของผู้กระทำความผิดด้วย
    if (lv === "offender" || lv === "criminal") {
      engine.triggerCutscene(p, "connorInterrogate"); // connor_skill2.mp4 — 1 ครั้งต่อเกม
      const before = p.skillPoints;
      engine.addSkill(p, INTIMIDATE_SELF_REFUND, "passive");
      const got = p.skillPoints - before;
      engine.log(`⚠️ ${target.name} อยู่ในระดับ "${LEVELS.offender.name}" ขึ้นไป — ${p.name} คุมสถานการณ์ได้${got > 0 ? ` · ฟื้นแต้มสกิล +${got}` : ""}`);
    }
    if (lv === "criminal") {
      // ตาข่ายสำรองกันเปิดฉากจับกุมซ้อน (ปกติกดสกิลรองระหว่างไล่ล่าไม่ได้อยู่แล้วผ่าน skillBlocked)
      if (this.chaseActive(engine)) {
        engine.log(`🚨 ${p.name} ยังไล่ล่าคนอื่นอยู่ — เปิดฉากจับกุม ${target.name} ซ้อนไม่ได้ (ได้แค่ผลข่มขวัญพื้นฐาน)`);
        return ` — ${target.name} ${LEVELS[lv].name}`;
      }
      this.askArrest(engine, p, target);
      return ` — จับกุม ${target.name}!`;
    }
    return ` — ${target.name} ${LEVELS[lv].name}`;
  },

  // ---------- ท่าไม้ตาย: จัดการปิดคดี ----------
  //  ลำดับตามสเปค: เลือกเป้าหมาย -> เล่นวีดีโอ -> ค่อยเกิดความเสียหาย
  //  useSkill() จึงคิววีดีโอไว้แล้วเรียก pausePlayingForCutscene(() => applyCloseCase(...)) ให้ผลลงหลังวีดีโอจบ
  //  เล่นวีดีโอทุกครั้งที่ปล่อยท่า (queueCutscene ตรงๆ ไม่ผ่าน triggerCutscene ที่จำกัดครั้งเดียวต่อเกม)
  //  ดาเมจจึงถูกหน่วงรอวีดีโอจบเสมอ — ผู้เรียกต้องลงดาเมจผ่าน applyCloseCase() หลังคัตซีนจบ
  queueCloseCaseVideo(engine, p) {
    engine.queueCutscene(p, "connorCloseCase"); // connor_skill3.mp4
  },
  applyCloseCase(engine, p, target) {
    if (!p || !p.alive || !target || !target.alive) return;
    engine.withEffectSource(p, () => {
      // "สามารถหลบหลีกได้" — กินสแตคหลบหลีกตามกติกากลาง (เหมือนการโจมตีปกติ)
      if ((target.statuses.evade || 0) > 0) {
        const pct = engine.statusAmtOf(target, "evade") || 100;
        engine.consumeEvadeStack(target);
        if (Math.random() * 100 < pct) {
          engine.log(`💨 หลบหลีก! ${target.name} หลบ "จัดการปิดคดี" ของ ${p.name} ได้ (${pct}%)`);
          return;
        }
        engine.log(`💨 ${target.name} พยายามหลบ "จัดการปิดคดี" (${pct}%) แต่ไม่พ้น`);
      }
      engine.dealMixed(target, CLOSE_CASE_DMG);
      target.wasAttacked = true;
      engine.maybeBeatSave(target); engine.maybeBeatMode(target); engine.maybeEva3(target); engine.maybeWakeKotone(target);
      engine.log(`⚖️ ${p.name} จัดการปิดคดี — ${target.name} รับความเสียหาย -${CLOSE_CASE_DMG}`);
      if (target.alive && target.hp <= 0) {
        engine.instantDeath(target);
        if (!target.alive) engine.log(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
      }
    });
  },

  // ============================================================
  //  สกิลติดตัว 2 จับกุมขั้นเด็ดขาด
  // ============================================================
  //  ยื่นคำขาดให้เป้าหมายระดับอาชญากร: ยอมจำนน หรือ ขัดขืน
  //  รอคำตอบแบบเดียวกับข้อเสนอสัญญา — ไม่ตอบก่อนเปิดไพ่ = ถือว่า "ขัดขืน" (การนิ่งเฉยไม่ใช่การยอมจำนน)
  askArrest(engine, conner, target) {
    target.connorArrestAsk = { fromId: conner.id };
    engine.skillFlash({ name: `จับกุมขั้นเด็ดขาด → ${target.name}`, img: IMG.skill2, by: conner.name, color: engine.colorOf(conner) });
    engine.log(`🚨 ${conner.name} ประกาศจับกุม ${target.name} ในฐานะ "${LEVELS.criminal.name}" — รอคำตอบ: ยอมจำนน หรือ ขัดขืน`);
  },
  // เป้าหมายตอบคำขาด (submit = true คือยอมจำนน) — live = ตอบเองระหว่างเฟสจั่วไพ่
  answerArrest(engine, target, submit, live = true) {
    const ask = target && target.connorArrestAsk;
    if (!ask) return false;
    target.connorArrestAsk = null;
    const conner = engine.players[ask.fromId];
    if (!conner || !conner.alive || !target.alive) return false;
    if (submit) return this.applySurrender(engine, conner, target);
    return this.startChase(engine, conner, target, live);
  },

  // ---------- ยอมจำนน ----------
  applySurrender(engine, conner, target) {
    engine.withEffectSource(conner, () => {
      target.connorStress = 0;
      if (engine.applyDebuff(target, "stun", null, SURRENDER_STUN)) engine.log(`😵 ${target.name} ยอมจำนน — ติดสถานะสตั้น ${SURRENDER_STUN} เทิร์น`);
      else engine.log(`🛡️ ${target.name} ยอมจำนน แต่ต้านสถานะไว้ได้ — ไม่ติดสตั้น`);
      if (engine.applyDebuff(target, "accused", null, SURRENDER_ACCUSED)) engine.log(`⛓️ ${target.name} ติดสถานะ "ผู้ต้องหา" ${SURRENDER_ACCUSED} เทิร์น`);
    });
    engine.log(`🚔 ${target.name} ยอมจำนนต่อ ${conner.name} — ความเครียดถูกรีเซ็ตเป็น 0`);
    engine.skillFlash({ name: `${target.name} ยอมจำนน`, img: IMG.skill2, by: conner.name, color: engine.colorOf(conner) });
    return true;
  },

  // ---------- ขัดขืน -> เริ่มการไล่ล่า ----------
  startChase(engine, conner, target, live) {
    conner.connorChase = { targetId: target.id, round: 0, mine: 0, theirs: 0 };
    conner.transformAt = engine.nextTransformCounter(); // เพลงไล่ล่าทับเพลงสกิลอื่นตามลำดับล่าสุด
    engine.queueCutscene(conner, "connorArrest1");      // วีดีโอไล่ล่าเล่นทุกครั้ง ไม่ใช่ครั้งเดียวต่อเกม
    engine.log(`🏃 ${target.name} เลือก "ขัดขืน" — ${conner.name} เริ่มการไล่ล่า! (นับแต้มดวลกัน ${CHASE_ROUNDS} เทิร์น)`);
    engine.log(`🚨 ระหว่างการไล่ล่า ผู้เล่นคนอื่นถูกแช่ไว้ (ไพ่แตกทันที กดอะไรไม่ได้ แต่ไม่รับความเสียหาย) และไม่มีเทิร์นโจมตี`);
    this.freezeOutsiders(engine, conner);
    // ตอบเองระหว่างเฟสจั่วไพ่ = พักเฟสเล่นวีดีโอทันทีแล้วกลับมาจั่วต่อด้วยเวลาที่เหลือ
    // ตอบตอนหมดเวลา (resolveRound เรียกแทน) = ปล่อยให้ afterResolve กวาดคิววีดีโอไปเล่นตามลำดับปกติ
    if (live && engine.gameState === "PLAYING") engine.pausePlayingForCutscene();
    return true;
  },

  chaseOwner(engine) {
    return Object.values(engine.players).find(
      (p) => isConner(p) && p.alive && p.connorChase && engine.players[p.connorChase.targetId]
    ) || null;
  },
  chaseActive(engine) { return !!this.chaseOwner(engine); },
  // คนนอกวงไล่ล่า: จั่วไพ่ไม่ได้ (คอนเนอร์กับเป้าหมายยังจั่วได้ตามปกติ — ต้องเอาไว้ดวลแต้มกัน)
  actionBlocked(engine, p) {
    const owner = this.chaseOwner(engine);
    if (!owner || !p) return false;
    return p.id !== owner.id && p.id !== owner.connorChase.targetId;
  },
  // ระหว่างการไล่ล่า **ห้ามทุกคนใช้สกิล/ไอเทม** รวมทั้งคอนเนอร์และเป้าหมายเอง — เหลือแค่การจั่วไพ่ล้วนๆ
  //  ตั้งใจให้เหนือกว่า "ทางหนี" ของคู่แฝดฮิซากาว่าด้วย (สกิลพื้นฐานของเธอที่ปกติอะไรก็ปิดกั้นไม่ได้)
  //  เพราะการไล่ล่าเป็นการดวลแต้มล้วน ไม่ควรมีใครแทรกอะไรเข้ามาได้เลย
  skillBlocked(engine, p) {
    return !!p && this.chaseActive(engine);
  },
  // บังคับไพ่แตก + ล็อกไพ่ให้คนนอกทั้งหมด (ไม่สนว่าเปิดไพ่ไปแล้วหรือยัง) — ไม่มีดาเมจตามมา
  freezeOutsiders(engine, owner) {
    const chase = owner && owner.connorChase;
    if (!chase) return;
    for (const o of engine.alivePlayers()) {
      if (o.id === owner.id || o.id === chase.targetId) continue;
      o.connorFrozen = true; // ทำให้ bustedOf() คืน true — ดาเมจแพ้/แตกถูกระงับทั้งหมดอยู่แล้วระหว่างไล่ล่า
      o.busted = true;
      o.locked = true;
    }
  },

  // ---------- สรุปรอบระหว่างการไล่ล่า ----------
  //  คืน true = จัดการรอบนี้เองแล้ว resolveRound() ต้องไม่ทำกติกาปกติต่อ
  chaseResolveRound(engine) {
    const owner = this.chaseOwner(engine);
    if (!owner) return false;
    const chase = owner.connorChase;
    const target = engine.players[chase.targetId];
    // ฝ่ายใดฝ่ายหนึ่งหลุดจากสนามกลางคัน -> ยกเลิกการไล่ล่าแบบไม่มีผู้ชนะ
    if (!target || !target.alive || !owner.alive) {
      engine.log("🚨 การไล่ล่าถูกยกเลิก — คู่กรณีไม่อยู่ในสนามแล้ว");
      this.endChase(engine, owner);
      return true;
    }
    chase.round++;
    const mine = engine.bustedOf(owner) ? -1 : engine.scoreOf(owner);
    const theirs = engine.bustedOf(target) ? -1 : engine.scoreOf(target);
    let line = `🏃 ไล่ล่าครั้งที่ ${chase.round}/${CHASE_ROUNDS} — ${owner.name} ${mine < 0 ? "ไพ่แตก" : `${mine} แต้ม`} vs ${target.name} ${theirs < 0 ? "ไพ่แตก" : `${theirs} แต้ม`}`;
    if (mine > theirs) { chase.mine++; line += ` -> ${owner.name} ได้ 1 แต้ม`; }
    else if (theirs > mine) { chase.theirs++; line += ` -> ${target.name} ได้ 1 แต้ม`; }
    else line += " -> เสมอ ไม่มีใครได้แต้ม";
    engine.log(`${line} (สกอร์รวม ${chase.mine} : ${chase.theirs})`);
    // ทุกคนได้ผลเป็น "ปลอดภัย" — ไม่มีผู้ชนะ/ผู้แพ้ของรอบระหว่างไล่ล่า
    for (const o of engine.alivePlayers()) o.result = "safe";

    // ตัดจบทันทีที่ฝ่ายใดฝ่ายหนึ่งถึง 2 แต้ม — เทิร์นที่เหลือพลิกผลไม่ได้แล้ว (สูงสุดได้อีกแค่ 1 แต้ม)
    //  จึงข้ามคลิประหว่างทาง (connorArrest3) ไปเล่นคลิปสรุปผลเลย
    const clinched = chase.mine >= CHASE_CLINCH || chase.theirs >= CHASE_CLINCH;
    if (!clinched && chase.round < CHASE_ROUNDS) {
      engine.queueCutscene(owner, chase.round === 1 ? "connorArrest2" : "connorArrest3");
      return true;
    }
    if (clinched && chase.round < CHASE_ROUNDS) {
      engine.log(`🚨 ${chase.mine > chase.theirs ? owner.name : target.name} ขึ้นนำ ${Math.max(chase.mine, chase.theirs)} แต้มแล้ว — ตัดสินผลการไล่ล่าทันทีโดยไม่ต้องนับให้ครบ ${CHASE_ROUNDS} ครั้ง`);
    }
    this.finishChase(engine, owner, target, chase);
    return true;
  },

  // ---------- จบการไล่ล่า ----------
  //  เสมอ (เช่น 1:1 หรือ 0:0) = คอนเนอร์แพ้ — ภาระการพิสูจน์อยู่ที่ฝ่ายจับกุม
  finishChase(engine, owner, target, chase) {
    const connerWins = chase.mine > chase.theirs;
    if (connerWins) {
      engine.queueCutscene(owner, "connorArrestTrue");
      engine.withEffectSource(owner, () => {
        target.connorStress = 0;
        engine.dealMixed(target, CAUGHT_DMG);
        target.wasAttacked = true;
        engine.maybeBeatSave(target); engine.maybeBeatMode(target); engine.maybeEva3(target); engine.maybeWakeKotone(target);
        if (engine.applyDebuff(target, "stun", null, CAUGHT_STUN)) engine.log(`😵 ${target.name} ถูกจับกุม — ติดสถานะสตั้น ${CAUGHT_STUN} เทิร์น`);
        if (engine.applyDebuff(target, "accused", null, CAUGHT_ACCUSED)) engine.log(`⛓️ ${target.name} ติดสถานะ "ผู้ต้องหา" ${CAUGHT_ACCUSED} เทิร์น`);
      });
      engine.log(`🚔 การไล่ล่าจบลง ${chase.mine} : ${chase.theirs} — ${owner.name} จับกุม ${target.name} สำเร็จ! ความเครียดรีเซ็ตเป็น 0 · ความเสียหาย -${CAUGHT_DMG}`);
      if (target.alive && target.hp <= 0) {
        engine.instantDeath(target);
        if (!target.alive) engine.log(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
      }
    } else {
      engine.queueCutscene(owner, "connorArrestFalse");
      target.connorStress = 0;
      if (engine.applyDebuff(owner, "stun", null, ESCAPED_CONNOR_STUN)) engine.log(`😵 ${owner.name} ตามไม่ทัน — ติดสถานะสตั้น ${ESCAPED_CONNOR_STUN} เทิร์น`);
      engine.log(`🏃 การไล่ล่าจบลง ${chase.mine} : ${chase.theirs} — ${target.name} หนีรอด! ความเครียดถูกรีเซ็ตเป็น 0`);
    }
    this.endChase(engine, owner);
  },
  endChase(engine, owner) {
    if (owner) owner.connorChase = null;
    for (const o of Object.values(engine.players)) o.connorFrozen = false;
  },
  // เก็บกวาดท้ายเทิร์น: การไล่ล่าจบ/ล่มไปแล้ว (เช่นคอนเนอร์ตายกลางคัน ทำให้ chaseOwner กลายเป็น null
  //  โดยไม่ผ่าน endChase) -> ต้องปลดธง "ถูกแช่" ของทุกคนเสมอ ไม่งั้นคนอื่นค้างไพ่แตกถาวรทั้งแมตช์
  cleanupChase(engine) {
    if (this.chaseActive(engine)) return;
    for (const o of Object.values(engine.players)) {
      if (o.connorFrozen) o.connorFrozen = false;
      if (isConner(o) && o.connorChase) o.connorChase = null;
    }
  },

  // เพลงไล่ล่า + ออร่าขอบจอแดง (เกตเดียวกับผลจริงของโหมดไล่ล่า)
  activeMusic(engine) {
    const owner = this.chaseOwner(engine);
    return owner ? { music: CHASE_MUSIC, at: owner.transformAt || 0 } : null;
  },
  fieldFx(engine) { return this.chaseActive(engine) ? "chase" : null; },

  // ============================================================
  //  สกิลติดตัว 3 ปัญญาประดิษฐ์ — ฟื้นคืนชีพ 10 เทิร์นหลังตาย (2 ครั้งต่อเกม)
  // ============================================================
  //  เรียกจาก instantDeath() หลังตกรอบจริงแล้ว — ไม่ใช่การกันตาย จึงไม่ขวางเงื่อนไขจบเกม
  //  (ถ้าเกมจบก่อนครบ 10 เทิร์น ก็ไม่ได้ฟื้น — ตามกติกาที่ตกลงไว้)
  onDeath(engine, p) {
    if (!isConner(p) || engine.passiveSealed(p)) return;
    if ((p.connorRevives || 0) >= REVIVE_MAX) return;
    p.connorReviveRound = engine.roundNumber + REVIVE_DELAY;
    engine.log(`🤖 ${p.name} ระบบสำรองเริ่มทำงาน — จะฟื้นคืนชีพในอีก ${REVIVE_DELAY} เทิร์น (เหลือโควตา ${REVIVE_MAX - (p.connorRevives || 0)} ครั้ง)`);
  },
  // เรียกจาก dealRound() ก่อนบล็อก "ผู้เล่นที่ตายแล้ว" ของลูปต้นเทิร์น
  maybeRevive(engine, p) {
    if (!isConner(p) || p.alive || !p.connorReviveRound) return false;
    if (engine.roundNumber < p.connorReviveRound) return false;
    p.connorReviveRound = 0;
    p.connorRevives = (p.connorRevives || 0) + 1;
    p.alive = true;
    p.result = null;
    p.locked = false;
    p.busted = false;
    p.cards = [];
    p.statuses = {};
    p.statusAmt = {};
    p.evadeStacks = [];
    p.hp = REVIVE_HP;
    p.armor = REVIVE_ARMOR;
    p.shield = 0;
    p.tempHp = 0;
    p.connorFrozen = false;
    engine.skillFlash({ name: "ปัญญาประดิษฐ์ — กลับมาทำงานอีกครั้ง", img: IMG.base, by: p.name, color: engine.colorOf(p) });
    engine.log(`🤖✨ ${p.name} หัวใจที่ไม่ใช่มนุษย์ — ฟื้นคืนชีพด้วยพลังชีวิต ${REVIVE_HP} เกราะ ${REVIVE_ARMOR} (ใช้ไปแล้ว ${p.connorRevives}/${REVIVE_MAX} ครั้ง)`);
    return true;
  },

  // ============================================================
  //  สกิลติดตัว 4 การป้องกันตัว
  // ============================================================
  //  โจมตีปกติใส่คนที่ติด "ผู้ต้องหา" แรงขึ้น +2 (เรียกจาก computeAttackBase)
  damageBonus(engine, attacker, target) {
    if (!isConner(attacker) || engine.passiveSealed(attacker)) return 0;
    return target && (target.statuses.accused || 0) > 0 ? ACCUSED_ATK_BONUS : 0;
  },

  //  ถูกโจมตีปกติโดย "คนที่ไม่ใช่คนเดิม" ติดต่อกัน -> 15% สวนกลับใส่ผู้โจมตีทั้ง 2 คน คนละ 1 หน่วย
  //  นับข้ามเทิร์นได้ (เก็บแค่ id ของคนที่ตีล่าสุด ไม่ผูกกับเลขเทิร์น)
  //  ลำดับตามสเปคคือ "วีดีโอก่อน แล้วจึงเกิดความเสียหาย" -> ที่นี่แค่คิววีดีโอ + จองคู่กรณีไว้
  //  แล้วปล่อยให้ resolvePendingCounter() ลงดาเมจใน postAttackFollowup() (ทำงานหลังคิววีดีโอเล่นจบ)
  onAttackedNormally(engine, attacker, target) {
    if (!isConner(target) || !target.alive || !attacker || engine.passiveSealed(target)) return false;
    const prevId = target.connorLastAttackerId || null;
    target.connorLastAttackerId = attacker.id;
    if (!prevId || prevId === attacker.id) return false;
    const prev = engine.players[prevId];
    if (!prev || !prev.alive) return false;
    if (Math.random() >= COUNTER_CHANCE) return false;
    target.connorCounterPending = [prev.id, attacker.id];
    engine.queueCutscene(target, "connorSelfDefense"); // connor_passive4.mp4 — เล่นทุกครั้งที่ทำงาน
    return true;
  },
  // เรียกจาก postAttackFollowup() — คิววีดีโอเล่นจบแล้วเท่านั้น
  resolvePendingCounter(engine) {
    for (const p of Object.values(engine.players)) {
      const pair = p.connorCounterPending;
      if (!pair) continue;
      p.connorCounterPending = null;
      if (!p.alive) continue;
      engine.withEffectSource(p, () => {
        for (const id of pair) {
          const o = engine.players[id];
          if (!o || !o.alive || engine.friendlyEffectBlocked(o)) continue;
          engine.dealMixed(o, COUNTER_DMG);
          o.wasAttacked = true;
          engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeEva3(o); engine.maybeWakeKotone(o);
          engine.log(`🛡️ ${p.name} การป้องกันตัว — สวนกลับใส่ ${o.name} -${COUNTER_DMG}`);
          if (o.alive && o.hp <= 0) {
            engine.instantDeath(o);
            if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`);
          }
        }
      });
    }
  },

  // ============================================================
  //  วีดีโอเปิดตัวตอนเริ่มเกม (conner_openning.mp4) — เรียกจาก startMatch()
  // ============================================================
  maybeQueueIntro(engine) {
    const p = connerSlot(engine);
    if (!p) return false;
    engine.queueCutscene(p, "connorIntro");
    return true;
  },

  // ============================================================
  //  ต้นเทิร์น
  // ============================================================
  onRoundStartTick(engine, p) {
    p.connorStressDrewRound = false; // โควตา "จั่วไพ่ = เครียด +1 ต่อเทิร์น" เต็มใหม่
    this.rotateActions(p);           // ลำดับการกระทำของเทิร์นที่แล้วถูกล็อกไว้ให้คอนเนอร์ทาย
    if (isConner(p)) { p.connorReadId = null; p.connorGuess = null; }
  },
  // เรียกท้ายลูปต้นเทิร์นของ dealRound() — แช่คนนอกวงไล่ล่าใหม่ทุกเทิร์น
  //  (ต้องอยู่หลังลูป เพราะในลูป dealRound จะตั้ง locked=false / แจกไพ่ใบแรกให้ทุกคนก่อน)
  onRoundStartAfterLoop(engine) {
    const owner = this.chaseOwner(engine);
    if (!owner) return;
    this.freezeOutsiders(engine, owner);
    engine.log(`🚨 การไล่ล่ายังดำเนินอยู่ (นับไปแล้ว ${owner.connorChase.round}/${CHASE_ROUNDS}) — ผู้เล่นคนอื่นถูกแช่ไว้ และเทิร์นนี้ไม่มีเฟสโจมตี`);
  },

  // ============================================================
  //  ฟิลด์ที่ต้องรีเซ็ตทุกแมตช์ — เรียกจาก resetCombat()
  // ============================================================
  resetCombat(p) {
    p.connorStress = 0;              // มิเตอร์ความเครียด (มีที่ผู้เล่นทุกคนยกเว้นคอนเนอร์)
    p.connorStressDrewRound = false; // เทิร์นนี้นับความเครียดจากการจั่วไปแล้วหรือยัง
    p.connorArrestAsk = null;        // คำขาดจับกุมที่รอเราตอบ ({ fromId })
    p.connorFrozen = false;          // ถูกแช่เพราะอยู่นอกวงไล่ล่า (บังคับไพ่แตก)
    p.connorActions = [];            // ลำดับการกระทำของเทิร์นนี้ (วัตถุดิบของวิเคราะห์สถานการณ์)
    p.connorActionsPrev = [];         // ลำดับการกระทำของเทิร์นที่แล้ว (สิ่งที่คอนเนอร์ต้องทาย)
    p.connorGuess = null;            // คอนเนอร์: ลำดับที่เพิ่งทายไว้ รอ applyPredict อ่าน
    p.connorReadId = null;           // คอนเนอร์: id เป้าหมายที่อ่านขาด (เห็นแต้มการ์ดตลอดเทิร์นนี้)
    p.connorChase = null;            // คอนเนอร์: สถานะการไล่ล่า { targetId, round, mine, theirs }
    p.connorRevives = 0;             // คอนเนอร์: ใช้ฟื้นคืนชีพไปแล้วกี่ครั้ง (สูงสุด 2)
    p.connorReviveRound = 0;         // คอนเนอร์: เทิร์นที่จะฟื้นคืนชีพ (0 = ไม่ได้รอฟื้น)
    p.connorLastAttackerId = null;   // คอนเนอร์: คนที่โจมตีปกติใส่เราล่าสุด (สกิลติดตัว 4)
    p.connorCounterPending = null;   // คอนเนอร์: คู่กรณีที่รอรับดาเมจสวนกลับหลังวีดีโอจบ
  },
};
