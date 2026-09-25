// ============================================================
//  สไตรเกอร์ ยูเรก้า (พิเศษ · เลือกได้ 1 คู่ต่อเกม) — ตัวละครที่ผู้เล่น 2 คนบังคับร่วมกัน
//
//  ระบบคู่หู (ห้องรอ / socket / สิทธิ์ตามบทบาท) อยู่ใน server.js ทั้งหมด (ดู "Striker Eureka: คู่หู")
//    ในเกมมีระเบียนผู้เล่นแค่ 1 ระเบียน — engine ต่อสู้จึงเห็นยูเรก้าเป็นผู้เล่นคนเดียว "แพ้ก็แพ้คู่" โดยธรรมชาติ
//    นักบิน (pilot) = จั่ว / เปิดการ์ด / เลือกเป้าโจมตี / ซ่อม / อนุมัติท่าไม้ตาย 2
//    พลปืน (gunner) = สกิล / ซื้อของ / ใช้ไอเทม
//  ไฟล์นี้คือกลไกต่อสู้ของตัวละครล้วนๆ
//
//  ค่าสถานะ: พลังชีวิต 12 · เกราะ 3 · แต้มสกิลสูงสุด 16
//  สกิลพื้นฐาน มือมีด (0 · ไม่กินโควตา): สลับโหมด — พลังโจมตีเหลือ 1 แต่โจมตีโดนมอบเลือดไหล 2
//  สกิลรอง กำจัดศัตรูให้สิ้น (5): "หมัดเหล็ก" 1 ครั้ง — โจมตีปกติ +1 และปาดบัฟล่าสุดของเป้าหมาย
//    ต่อยคนเดิมที่เพิ่งโดนหมัดเหล็กครั้งก่อน = คอมโบ: เป้าหมายสตั้น 1 เทิร์นตั้งแต่เทิร์นถัดไป (แล้วรีเซ็ตกลับเป็นแบบธรรมดา)
//  ท่าไม้ตาย 1 ระบบขีปนาวุธ (1-9 แต้ม): กระสุน 1 นัด/แต้ม สุ่มลงศัตรู คนละไม่เกิน 4
//  ท่าไม้ตาย 2 เป็นเกียรติมากครับ (12 · พลังชีวิต <= 7): คู่หูอนุมัติก่อน (อนุมัติแล้วค่อยหักแต้ม)
//    นับถอยหลัง 4 เทิร์น ความแรง 4 +1 ต่อเทิร์นที่รอ (สูงสุด 8) · กดซ้ำ (อนุมัติอีกครั้ง) = ระเบิดทันที
//    ระเบิด = ทุกคนรับความเสียหาย + ยูเรก้าตายเอง (ระบบกันตายยังช่วยได้) · ระหว่างนับถอยหลังกดสกิลอื่นไม่ได้
//  สกิลติดตัว Mark 5: หลบ 5% · พลังโจมตีพื้นฐาน 2 · ยังมีเกราะ = แต้มสกิล +1 ต่อเทิร์น
//  สกิลติดตัว เตาปฏิกรณ์นิวเคลียร์: พลังชีวิต <= 7 ท่าไม้ตายเปลี่ยนเป็นท่า 2 (วีดีโอครั้งแรกครั้งเดียว)
//    + ถูกโจมตีปกติ 15% แทงสวนด้วยพลังโจมตีปกติขณะนั้น
//  สกิลติดตัว งานช่าง: QTE ต่อสายไฟ สำเร็จฟื้นพลังชีวิต 2 · ซ่อมแล้วเทิร์นนั้นชนะก็โจมตีไม่ได้ · คูลดาวน์ 2 เทิร์น
//  สกิลติดตัว อาศัยจังหวะ (โหมดทีมเท่านั้น): ฝั่งตรงข้ามตีแล้ว 15% ได้โจมตีปกติตาม
// ============================================================

const ID = "striker";
const DIR = "/characters/striker";

const STRIKER_MAX_HP = 12;
const STRIKER_MAX_ARMOR = 3;
const STRIKER_MAX_SKILL = 16;
const BASE_ATK = 2;
const KNIFE_ATK = 1;
const KNIFE_BLEED = 2;
const DODGE_PCT = 5;
const REACTOR_HP = 7;
const COUNTER_CHANCE = 0.15;
const MISSILE_MIN = 1;
const MISSILE_MAX = 9;
const MISSILE_CAP_PER_TARGET = 4;
const HONOR_COST = 12;
const HONOR_BASE = 4;
const HONOR_MAX = 8;
const HONOR_TURNS = 4;
const REPAIR_HEAL = 2;
const REPAIR_COOLDOWN = 2;
const REPAIR_MS = 10000;
const REPAIR_GRACE_MS = 500;
const WIRE_COLORS = ["red", "blue", "yellow", "pink"];
const TIMING_CHANCE = 0.15;
const FIST_STUN_TURNS = 1;

const IMG = {
  base: `${DIR}/striker.jpg`,
  skill1: `${DIR}/skill1/striker_skill1.webp`,
  skill2: `${DIR}/skill2/striker_skill2.webp`,
  skill3: `${DIR}/skill3/striker_skill3.jpg`,
  skill32: `${DIR}/skill3/striker_skill3.2.jpg`,
};
const VIDEO = {
  intro: `${DIR}/striker_intro.mp4`,
  knife: `${DIR}/skill1/striker_skill1.mp4`,
  fist: `${DIR}/skill2/striker_skill2.mp4`,
  fistFinal: `${DIR}/skill2/striker_skill2_final.mp4`,
  missile: `${DIR}/skill3/striker_skill3.mp4`,
  arm: `${DIR}/skill3/striker_skill3.2.mp4`,
  boom: `${DIR}/skill3/striker_skill3.2_final.mp4`,
  counter: `${DIR}/striker_passive.mp4`,
  reactor: `${DIR}/striker_passive2.mp4`,
  timing: `${DIR}/striker_passive3.mp4`,
};
// คีย์เสียงฝั่ง client (client/src/audio.js)
const SFX = { attack: "striker_hit", bomb: "striker_bomb" };

const isStriker = (p) => !!p && p.characterId === ID && !!p.striker;
const roll = (chance) => Math.random() < chance;

function freshState() {
  return {
    knife: false,          // มือมีดเปิดอยู่
    fist: false,           // หมัดเหล็กรอหมัดถัดไป
    fistTargetId: null,    // เป้าหมายของหมัดเหล็กครั้งล่าสุด (ต่อยคนเดิมซ้ำ = คอมโบ)
    honor: null,           // เป็นเกียรติมากครับ: { armedRound } ระหว่างนับถอยหลัง
    approval: null,        // รอคู่หูอนุมัติ { kind: "arm" | "detonate" }
    detonatePending: false,// ครบกำหนดแล้ว ระเบิดตอนเข้าเฟสจั่วไพ่ (หลังวีดีโอ)
    reactorShown: false,   // วีดีโอเตาปฏิกรณ์เล่นไปแล้ว
    repairUntil: 0,        // คูลดาวน์ซ่อม = เลขรอบสุดท้ายที่ยังติด
    repairedRound: 0,      // เทิร์นที่เข้าไปซ่อม (ชนะก็โจมตีไม่ได้)
    repair: null,          // QTE ต่อสายไฟ { left, right, deadline }
    timingRound: 0,        // อาศัยจังหวะ: ใช้สิทธิ์ไปแล้วเทิร์นไหน
    after: null,           // งานที่ต้องลงหลังวีดีโอของสกิลที่เพิ่งกด (server ดึงไปใช้)
  };
}
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

module.exports = {
  id: ID,
  IMG, VIDEO, SFX,
  MAX_HP: STRIKER_MAX_HP, MAX_ARMOR: STRIKER_MAX_ARMOR, MAX_SKILL: STRIKER_MAX_SKILL,
  BASE_ATK, KNIFE_ATK, DODGE_PCT, REACTOR_HP, COUNTER_CHANCE, MISSILE_MAX, MISSILE_CAP_PER_TARGET,
  HONOR_COST, HONOR_BASE, HONOR_MAX, HONOR_TURNS, REPAIR_HEAL, REPAIR_COOLDOWN, REPAIR_MS, WIRE_COLORS, TIMING_CHANCE,

  maxHp() { return STRIKER_MAX_HP; },
  maxArmor() { return STRIKER_MAX_ARMOR; },
  maxSkill() { return STRIKER_MAX_SKILL; },
  attackSound(p) { return isStriker(p) ? SFX.attack : undefined; },
  isStriker,

  resetCombat(p) {
    p.striker = p.characterId === ID ? freshState() : null;
    p.strikerStunPending = 0; // คอมโบหมัดเหล็ก: สตั้นที่เริ่มเทิร์นถัดไป (ติดที่เป้าหมาย)
  },

  // ---------- เปิดตัว ----------
  maybeQueueIntro(engine) {
    let queued = false;
    for (const p of engine.alivePlayers()) {
      if (!isStriker(p)) continue;
      engine.queueCutscene(p, "strikerIntro");
      queued = true;
    }
    return queued;
  },

  // ---------- ค่าสถานะ / พลังโจมตี ----------
  reactorOn(p) { return isStriker(p) && p.hp <= REACTOR_HP; },
  honorOn(p) { return isStriker(p) && !!p.striker.honor; },
  attackBaseOverride(engine, attacker) { return isStriker(attacker) && attacker.striker.knife ? KNIFE_ATK : BASE_ATK; },
  damageBonus(engine, attacker) { return isStriker(attacker) && attacker.striker.fist ? 1 : 0; },
  dynamicSkillFor(p, ch, tier) {
    if (tier === "ultimate" && this.reactorOn(p)) return ch.ultimate2;
    return ch[tier];
  },
  skipsTurnQuota(p, tier) { return isStriker(p) && tier === "basic"; },
  // ซ่อมแล้ว = เทิร์นนั้นโจมตีไม่ได้
  cannotAttack(engine, p) { return isStriker(p) && p.striker.repairedRound === engine.roundNumber; },

  // ราคาจริงของท่าไม้ตาย: ขีปนาวุธ = จำนวนที่เลือก · ท่า 2 หักตอนคู่หูอนุมัติ (กดขอ = 0)
  //  คืน null = ใช้ราคาใน characters.js ตามปกติ
  skillCost(p, tier, item) {
    if (!isStriker(p) || tier !== "ultimate") return null;
    if (this.reactorOn(p)) return 0;
    return this.missileCount(item);
  },
  // เพดานราคาของยูเรก้าไม่ใช่ SKILL_COST_MAX (8) — แต้มสูงสุด 16 และท่าไม้ตายราคา 9/12
  costCap(p, fallback) { return isStriker(p) ? STRIKER_MAX_SKILL : fallback; },
  missileCount(item) {
    const n = Math.floor(Number(item));
    return Number.isFinite(n) && n >= MISSILE_MIN && n <= MISSILE_MAX ? n : null;
  },

  // ---------- useSkill ----------
  canUseSkill(engine, p, tier, item) {
    if (!isStriker(p)) return true;
    const s = p.striker;
    if (s.approval) return false; // รอคู่หูตอบอยู่
    if (s.honor) return tier === "ultimate"; // นับถอยหลังอยู่ — กดได้แค่ท่านี้ซ้ำเพื่อระเบิดทันที
    if (tier === "secondary") return !s.fist;
    if (tier === "ultimate" && !this.reactorOn(p)) return this.missileCount(item) != null;
    if (tier === "ultimate") return (p.skillPoints || 0) >= HONOR_COST;
    return true;
  },
  // ท่าไม้ตาย 2 ไม่ลงผลตอนกด — ขออนุมัติจากคู่หูก่อน (server เรียกแทน applyInstantSkill แล้วจบ useSkill ทันที)
  needsApproval(p, tier) { return isStriker(p) && tier === "ultimate" && this.reactorOn(p); },
  requestApproval(engine, p) {
    const kind = p.striker.honor ? "detonate" : "arm";
    p.striker.approval = { kind };
    engine.log(kind === "arm"
      ? `☢️ ${p.name} ขอเปิดใช้ "เป็นเกียรติมากครับ" — รอคู่หูอนุมัติ`
      : `☢️ ${p.name} ขอระเบิดทันที — รอคู่หูอนุมัติ`);
  },
  applyInstantSkill(engine, p, tier, item) {
    if (!isStriker(p)) return "";
    const s = p.striker;
    s.after = null;
    if (tier === "basic") {
      s.knife = !s.knife;
      if (s.knife) engine.triggerCutscene(p, "strikerKnife"); // วีดีโอครั้งแรกที่เปิดเท่านั้น
      engine.log(s.knife
        ? `🔪 ${p.name} มือมีด — พลังโจมตีเหลือ ${KNIFE_ATK} แต่โจมตีโดนมอบเลือดไหล ${KNIFE_BLEED}`
        : `🔪 ${p.name} เก็บมีด — กลับมาโจมตีด้วยพลังโจมตี ${BASE_ATK}`);
      return s.knife ? " — เปิด" : " — ปิด";
    }
    if (tier === "secondary") {
      s.fist = true;
      engine.log(`👊 ${p.name} กำจัดศัตรูให้สิ้น — "หมัดเหล็ก" พร้อม: โจมตีปกติครั้งถัดไป +1 และปาดบัฟล่าสุดของเป้าหมาย`);
      return " — หมัดเหล็ก";
    }
    if (tier === "ultimate") {
      const n = this.missileCount(item);
      engine.queueCutscene(p, "strikerMissile"); // วีดีโอก่อน แล้วค่อยยิง
      s.after = () => this.fireMissiles(engine, p, n);
      engine.log(`🚀 ${p.name} ระบบขีปนาวุธ — ยิง ${n} นัด`);
      return ` — ${n} นัด`;
    }
    return "";
  },
  takeAfter(p) {
    if (!isStriker(p)) return null;
    const fn = p.striker.after;
    p.striker.after = null;
    return fn;
  },

  // ---------- ท่าไม้ตาย 1: ระบบขีปนาวุธ ----------
  fireMissiles(engine, p, n) {
    if (!p.alive || !n) return;
    const got = {};
    for (let i = 0; i < n; i++) {
      const pool = engine.alivePlayers().filter((t) => t.id !== p.id && !engine.sameTeam(p, t) && (got[t.id] || 0) < MISSILE_CAP_PER_TARGET);
      if (!pool.length) break; // ทุกคนรับครบเพดานแล้ว — นัดที่เหลือเสียเปล่า
      const t = pool[Math.floor(Math.random() * pool.length)];
      got[t.id] = (got[t.id] || 0) + 1;
    }
    engine.skillFlash({ name: "ระบบขีปนาวุธ — ยิง!", img: IMG.skill3, by: p.name, color: engine.colorOf(p), sound: SFX.bomb });
    const parts = [];
    for (const [id, dmg] of Object.entries(got)) {
      const t = engine.players[id];
      if (!t || !t.alive) continue;
      engine.dealMixed(t, dmg);
      t.wasAttacked = true;
      engine.resolveDamageAftermath(t);
      parts.push(`${t.name} -${dmg}${t.alive ? "" : " (ตกรอบ)"}`);
    }
    engine.log(`🚀 ${p.name} ขีปนาวุธ ${n} นัดตกใส่ ${parts.join(" · ") || "ไม่มีใคร"}`);
  },

  // ---------- ท่าไม้ตาย 2: เป็นเกียรติมากครับ ----------
  honorPower(engine, p) {
    const s = p.striker;
    const waited = s.honor ? Math.max(0, engine.roundNumber - s.honor.armedRound) : 0;
    return Math.min(HONOR_MAX, HONOR_BASE + waited);
  },
  // คู่หูตอบ — คืน { after } ถ้ามีผลที่ต้องลงหลังวีดีโอ · null = ไม่มีอะไรเกิดขึ้น
  answerApproval(engine, p, accept) {
    const ask = isStriker(p) && p.striker.approval;
    if (!ask) return null;
    p.striker.approval = null;
    if (!accept) {
      engine.log(`☢️ คู่หูของ ${p.name} ไม่อนุมัติ — ไม่เกิดอะไรขึ้น (ไม่เสียแต้มสกิล)`);
      return null;
    }
    if (ask.kind === "arm") {
      if (!p.alive || p.striker.honor || (p.skillPoints || 0) < HONOR_COST) {
        engine.log(`☢️ ${p.name} แต้มสกิลไม่พอเปิดใช้ "เป็นเกียรติมากครับ" แล้ว`);
        return null;
      }
      p.skillPoints -= HONOR_COST;
      p.skillUsedRound = true;
      p.striker.honor = { armedRound: engine.roundNumber };
      p.striker.knife = false;
      engine.queueCutscene(p, "strikerArm");
      engine.skillFlash({ name: "เป็นเกียรติมากครับ — เริ่มนับถอยหลัง", img: IMG.skill32, by: p.name, color: engine.colorOf(p) });
      engine.log(`☢️ ${p.name} เป็นเกียรติมากครับ — นับถอยหลัง ${HONOR_TURNS} เทิร์นก่อนระเบิดตัวเอง (ความแรงเริ่ม ${HONOR_BASE} เพิ่มเทิร์นละ 1 สูงสุด ${HONOR_MAX})`);
      return { after: null };
    }
    if (!p.striker.honor) return null;
    engine.queueCutscene(p, "strikerBoom");
    engine.log(`☢️ คู่หูของ ${p.name} อนุมัติ — ระเบิดทันที!`);
    return { after: () => this.explode(engine, p) };
  },
  explode(engine, p) {
    const s = p.striker;
    if (!s.honor || !p.alive) { if (s) { s.honor = null; s.detonatePending = false; } return; }
    const dmg = this.honorPower(engine, p);
    s.honor = null;
    s.detonatePending = false;
    engine.skillFlash({ name: `เป็นเกียรติมากครับ — ระเบิด ${dmg}!`, img: IMG.skill32, by: p.name, color: engine.colorOf(p), sound: SFX.bomb });
    const hit = [];
    engine.withEffectSource(p, () => {
      for (const t of engine.alivePlayers()) {
        if (t.id === p.id) continue;
        engine.dealMixed(t, dmg);
        t.wasAttacked = true;
        engine.resolveDamageAftermath(t);
        hit.push(`${t.name}${t.alive ? "" : " (ตกรอบ)"}`);
      }
    });
    engine.log(`💥 ${p.name} เป็นเกียรติมากครับ — ระเบิดตัวเอง! ทุกคนรับความเสียหาย ${dmg}${hit.length ? ` (${hit.join(", ")})` : ""}`);
    // ฆ่าตัวเอง — ไม่ force: ระบบกันตายยังช่วยให้รอดได้ตามที่ตกลงกันไว้
    engine.instantDeath(p);
    engine.log(p.alive ? `🛡️ ${p.name} รอดจากการระเบิดของตัวเอง!` : `💀 ${p.name} สละชีพ — ตกรอบพร้อมคู่หู`);
  },
  approvalPending(engine) {
    return engine.alivePlayers().some((p) => isStriker(p) && (p.striker.approval || p.striker.repair));
  },
  // เปิดไพ่แล้วยังไม่ตอบ = ไม่อนุมัติ · QTE ซ่อมที่ค้าง = ล้มเหลว
  sweep(engine) {
    for (const p of engine.alivePlayers()) {
      if (!isStriker(p)) continue;
      if (p.striker.approval) this.answerApproval(engine, p, false);
      if (p.striker.repair) this.finishRepair(engine, p, null);
    }
  },

  // ---------- ต้นเทิร์น (เรียกกับผู้เล่นทุกคน) ----------
  onRoundStartTick(engine, p) {
    if (p.strikerStunPending > 0) {
      const turns = p.strikerStunPending;
      p.strikerStunPending = 0;
      if (p.alive) {
        if (engine.applyDebuff(p, "stun", null, turns)) engine.log(`😵 ${p.name} โดนหมัดเหล็กซ้ำเมื่อเทิร์นก่อน — ติดสตั้น ${turns} เทิร์น!`);
        else engine.log(`🛡️ ${p.name} ต้านสถานะผิดปกติ — ไม่ติดสตั้นจากหมัดเหล็ก`);
      }
    }
    if (!isStriker(p) || !p.alive) return;
    const s = p.striker;
    s.approval = null;
    if (p.armor > 0) {
      engine.addSkill(p, 1, "passive");
      engine.log(`⚙️ ${p.name} Mark 5 — ยังมีเกราะ ฟื้นแต้มสกิล +1`);
    }
    this.checkReactor(engine, p);
    if (s.honor) {
      const waited = engine.roundNumber - s.honor.armedRound;
      if (waited >= HONOR_TURNS) {
        s.detonatePending = true;
        engine.queueCutscene(p, "strikerBoom"); // dealRound เล่นคลิปที่คิวไว้ แล้วค่อยระเบิด (flushDetonation)
      } else {
        engine.log(`☢️ ${p.name} นับถอยหลังระเบิด — อีก ${HONOR_TURNS - waited} เทิร์น (ความแรงตอนนี้ ${this.honorPower(engine, p)})`);
      }
    }
  },
  flushDetonation(engine) {
    for (const p of engine.alivePlayers()) if (isStriker(p) && p.striker.detonatePending) this.explode(engine, p);
  },
  // เตาปฏิกรณ์: พลังชีวิตลงมาถึง 7 ครั้งแรก = วีดีโอ (เล่นครั้งเดียว)
  checkReactor(engine, p) {
    if (!this.reactorOn(p) || !p.alive || p.striker.reactorShown) return false;
    p.striker.reactorShown = true;
    engine.queueCutscene(p, "strikerReactor");
    engine.log(`☢️ ${p.name} เตาปฏิกรณ์นิวเคลียร์ทำงาน — ท่าไม้ตายเปลี่ยนเป็น "เป็นเกียรติมากครับ" · ถูกโจมตีปกติมีโอกาสแทงสวน ${Math.round(COUNTER_CHANCE * 100)}%`);
    return true;
  },

  // ---------- การโจมตีปกติ ----------
  // หลบ 5% (โจมตีปกติเท่านั้น) — แพทเทิร์นเดียวกับอิปโป
  tryAttackDodge(engine, attacker, target) {
    if (!isStriker(target) || !target.alive) return false;
    if (Math.random() * 100 >= DODGE_PCT) return false;
    target.wasAttacked = true;
    engine.log(`💨 หลบหลีก! ${target.name} หลบการโจมตีของ ${attacker.name} ได้ (Mark 5 · ${DODGE_PCT}%)`);
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.colorOf(attacker),
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.colorOf(target),
      dmg: 0, dodge: true,
      skills: [{ name: `Mark 5 — หลบหลีก (${DODGE_PCT}%)`, img: IMG.base, by: target.name, color: engine.colorOf(target), side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },
  // หมัดเหล็ก: ผ่านด่านหลบมาแล้วเท่านั้นถึงใช้ท่า (หลบได้ = ท่ายังไม่หาย) — ปาดบัฟก่อนหมัดลง + คิววีดีโอ
  //  คืน { combo, stripped } หรือ null
  prepareFistOnAttack(engine, attacker, target) {
    if (!isStriker(attacker) || !attacker.striker.fist) return null;
    const s = attacker.striker;
    s.fist = false;
    const combo = s.fistTargetId === target.id;
    s.fistTargetId = combo ? null : target.id; // คอมโบได้รอบเดียว — ต่อยครั้งถัดไปกลับเป็นแบบธรรมดา
    const stripped = engine.stripLatestBuff(target);
    engine.queueCutscene(attacker, combo ? "strikerFistFinal" : "strikerFist");
    if (combo) target.strikerStunPending = Math.max(target.strikerStunPending || 0, FIST_STUN_TURNS);
    engine.log(`👊 ${attacker.name} หมัดเหล็ก${combo ? " (ซ้ำเป้าเดิม!)" : ""} — ${target.name}${stripped ? ` เสียบัฟ "${stripped.label}"` : " ไม่มีบัฟให้ปาด"}${combo ? ` · จะติดสตั้น ${FIST_STUN_TURNS} เทิร์นตั้งแต่เทิร์นถัดไป` : ""}`);
    return { combo, stripped };
  },
  // หมัดลงแล้ว: มือมีดมอบเลือดไหล
  onAttackLanded(engine, attacker, target) {
    if (!isStriker(attacker) || !attacker.striker.knife || !target || !target.alive) return 0;
    const bled = engine.applyBleed(target, KNIFE_BLEED);
    engine.log(bled > 0 ? `🔪 ${attacker.name} มือมีด — ${target.name} เลือดไหล +${bled}` : `🛡️ ${target.name} ต้านเลือดไหลจากมือมีดไว้ได้`);
    return bled;
  },
  // ถูกโจมตีปกติ (หมัดลงแล้ว) — เตาปฏิกรณ์ 15% แทงสวน
  onAttackedNormally(engine, attacker, target) {
    if (!isStriker(target) || !target.alive || !attacker || !attacker.alive || attacker.id === target.id) return null;
    this.checkReactor(engine, target);
    if (!this.reactorOn(target) || engine.sameTeam(target, attacker) || !roll(COUNTER_CHANCE)) return null;
    const dmg = Math.max(0, engine.attackPowerAgainst(target, attacker) || 0);
    engine.queueCutscene(target, "strikerCounter");
    engine.withEffectSource(target, () => {
      engine.dealMixed(attacker, dmg);
      attacker.wasAttacked = true;
      engine.resolveDamageAftermath(attacker);
    });
    engine.log(`🗡️ ${target.name} เตาปฏิกรณ์ — แทงสวน ${attacker.name} -${dmg}${attacker.alive ? "" : " ตกรอบ!"}`);
    return { dmg, videoQueued: true };
  },

  // ---------- งานช่าง: QTE ต่อสายไฟ ----------
  canRepair(engine, p) {
    if (!isStriker(p) || !p.alive || p.striker.repair) return false;
    return this.repairCooldown(engine, p) <= 0;
  },
  repairCooldown(engine, p) {
    if (!isStriker(p) || !p.striker.repairUntil) return 0; // ยังไม่เคยซ่อม
    return Math.max(0, p.striker.repairUntil - engine.roundNumber + 1);
  },
  startRepair(engine, p) {
    const s = p.striker;
    s.repairedRound = engine.roundNumber;           // เข้าไปซ่อมแล้ว = เทิร์นนี้ชนะก็โจมตีไม่ได้
    s.repairUntil = engine.roundNumber + REPAIR_COOLDOWN;
    s.repair = { left: shuffle(WIRE_COLORS), right: shuffle(WIRE_COLORS), deadline: Date.now() + REPAIR_MS };
    engine.log(`🔧 ${p.name} เข้าไปซ่อม — ต่อสายไฟให้ครบภายใน ${REPAIR_MS / 1000} วินาที (เทิร์นนี้โจมตีไม่ได้)`);
  },
  // pairs = [[ซ้าย, ขวา], ...] ตำแหน่ง index · null = หมดเวลา/ยกเลิก
  finishRepair(engine, p, pairs) {
    const r = isStriker(p) && p.striker.repair;
    if (!r) return false;
    p.striker.repair = null;
    const inTime = Date.now() <= r.deadline + REPAIR_GRACE_MS;
    const ok = inTime && Array.isArray(pairs) && pairs.length === WIRE_COLORS.length
      && new Set(pairs.map((x) => Array.isArray(x) && x[0])).size === WIRE_COLORS.length
      && pairs.every((x) => Array.isArray(x) && r.left[x[0]] && r.left[x[0]] === r.right[x[1]]);
    if (!ok) { engine.log(`🔧 ${p.name} ต่อสายไฟไม่สำเร็จ — ซ่อมไม่ได้`); return false; }
    const healed = engine.healHp(p, REPAIR_HEAL);
    engine.log(`🔧 ${p.name} ซ่อมสำเร็จ — ฟื้นพลังชีวิต +${healed}`);
    return true;
  },

  // ---------- อาศัยจังหวะ (โหมดทีม): ฝั่งตรงข้ามตีแล้ว 15% ได้โจมตีตาม ----------
  //  เรียกจาก postAttackFollowup() เป็นลำดับท้าย (หลังคอมโบ/ตีเพิ่มของฝั่งนั้นจบหมดแล้ว)
  startTimingAttack(engine, attacker) {
    if (!engine.teamModeActive() || !attacker) return false;
    const s = engine.alivePlayers().find((p) => isStriker(p) && p.id !== attacker.id && !engine.sameTeam(p, attacker)
      && p.striker.timingRound !== engine.roundNumber && !this.cannotAttack(engine, p)
      && !((p.statuses.stun || 0) > 0) && !((p.statuses.sleep || 0) > 0));
    if (!s) return false;
    s.striker.timingRound = engine.roundNumber; // โรลครั้งเดียวต่อเทิร์น
    if (!roll(TIMING_CHANCE) || !engine.attackableTargets(s.id).length) return false;
    engine.log(`⚡ ${s.name} อาศัยจังหวะ — สวนกลับหลังฝั่งตรงข้ามโจมตี!`);
    engine.queueCutscene(s, "strikerTiming");
    engine.runCutsceneQueue(() => {
      engine.setAttackerId(s.id);
      engine.setGameState("ATTACK");
      engine.startPhaseTimer(engine.ATTACK_TIME, () => {
        const t = engine.attackableTargets(engine.attackerId);
        if (t.length) engine.doAttack(engine.attackerId, t[Math.floor(Math.random() * t.length)].id);
        if (engine.gameState === "ATTACK") engine.endTurn();
      });
      engine.broadcastState();
    });
    return true;
  },

  // ---------- ข้อมูลให้ client ----------
  publicState(engine, p) {
    if (!isStriker(p)) return undefined;
    const s = p.striker;
    return {
      knife: s.knife, fist: s.fist, fistTargetId: s.fistTargetId, reactor: this.reactorOn(p),
      honor: s.honor ? { power: this.honorPower(engine, p), left: Math.max(0, HONOR_TURNS - (engine.roundNumber - s.honor.armedRound)) } : null,
      approval: s.approval ? s.approval.kind : null,
      repairing: !!s.repair,
      repairCd: this.repairCooldown(engine, p),
      repairedNow: s.repairedRound === engine.roundNumber,
    };
  },
  privateState(engine, p) {
    if (!isStriker(p) || !p.striker.repair) return {};
    const r = p.striker.repair;
    return { strikerRepair: { left: r.left, right: r.right, leftMs: Math.max(0, r.deadline - Date.now()), totalMs: REPAIR_MS } };
  },
};
