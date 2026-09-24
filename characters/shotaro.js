// ============================================================
//  ฮิดาริ โชว์ทาโร่ (กลาง)
//
//  สกิลพื้นฐาน ยอดนักสืบ (2 แต้ม) — เลือกผู้เล่น 1 คน (ไม่ใช่ตัวเอง) แล้วทายแต้มสุดท้ายของเขาในเทิร์นนี้
//    ตัวเลือก: 0-10 · 11-20 · 21 พอดี · แต้มเกิน (ไพ่แตก) — ตัดสินตอนเปิดไพ่จากแต้มสุดท้าย
//    ทายถูก: ฟื้นพลังชีวิต 2 · ความน่าสงสัย +1 (สูงสุด 3) · เป้าหมายติด "ช็อต" 2 เทิร์น
//    คำทายเป็นความลับ (เห็นเจ้าตัวคนเดียว) — ประกาศผลตอนเปิดไพ่
//  สกิลรอง Maximum Drive (6 แต้ม · ต้องอยู่ในร่างโจ๊กเกอร์) — ติดตัวไว้จนกว่าจะได้โจมตีปกติครั้งถัดไป
//    หมัดนั้น: ดาเมจ +1 · ปาดบัฟล่าสุดของเป้าหมาย 1 อย่าง (ก่อนหมัดลง) · ลุกไหม้ 2 + เปราะบาง 3 เทิร์น (หลังหมัดลง)
//    วีดีโอ shotaru_skill2 เล่นทุกครั้งก่อนฉากสรุปความเสียหาย · ถูกหลบ = ไม่มีวีดีโอ ท่าไม่หาย (ได้ใช้หมัดถัดไป)
//    ร่างโจ๊กเกอร์หมดก่อนได้ตี = ท่าหายไปพร้อมร่าง
//  ท่าไม้ตาย Lost Driver (2 แต้ม · ต้องมีความน่าสงสัย 3 · ใช้หมดเมื่อกด) — ร่าง "โจ๊กเกอร์" 10 เทิร์น พลังโจมตี +1
//    วีดีโอ shotaru_skill3 เต็มครั้งแรกครั้งเดียว (triggerCutscene) · กดซ้ำระหว่างเป็นโจ๊กเกอร์ไม่ได้
//  สกิลติดตัว ยอดนักสืบเจ้าปัญหา — ร่างโจ๊กเกอร์: กดโจมตีปกติแล้วเป้าหมายติด "เปราะบาง" 1 ทันที (หมัดนั้นแรงขึ้น)
//    อยู่ 1 เทิร์น = หายเองตอนจบเทิร์นตามลูปกลาง · ถ้าเป้าหมายมีเปราะบางอยู่แล้วไม่แตะของเดิม
// ============================================================

const ID = "shotaro";
const SUSPICION_MAX = 3;
const JOKER_TURNS = 10;
const GUESS_HEAL = 2;
const GUESS_SHOCK_TURNS = 2;
const DRIVE_BURN = 2;
const DRIVE_FRAGILE_TURNS = 3;
const GUESSES = {
  low: { label: "0-10", test: (s, bust) => !bust && s <= 10 },
  mid: { label: "11-20", test: (s, bust) => !bust && s >= 11 && s <= 20 },
  top: { label: "21 พอดี", test: (s, bust) => !bust && s === 21 },
  bust: { label: "แต้มเกิน", test: (s, bust) => bust },
};
const IMG = {
  base: "/characters/shotaro/shotaro.jpg",
  skill1: "/characters/shotaro/shotaro_skill1.webp",
  skill2: "/characters/shotaro/shotaro_skill2.jpg",
  skill3: "/characters/shotaro/shotaro_skill3.jpg",
};
const VIDEO = { drive: "/characters/shotaro/shotaru_skill2.mp4", joker: "/characters/shotaro/shotaru_skill3.mp4" };

const isShotaro = (p) => !!p && p.characterId === ID;
const jokerOn = (p) => ((p.statuses && p.statuses.shotaroJoker) || 0) > 0;

module.exports = {
  id: ID,
  IMG, VIDEO, GUESSES, SUSPICION_MAX, JOKER_TURNS,

  resetCombat(p) {
    p.shotaroSuspicion = 0;
    p.shotaroGuess = null; // { targetId, pick } — รอตัดสินตอนเปิดไพ่
    p.shotaroDrive = false; // Maximum Drive ติดตัวรอหมัดถัดไป
  },
  jokerOn,

  // ร่างโจ๊กเกอร์หมด -> Maximum Drive ที่ยังไม่ได้ใช้หายไปด้วย
  onRoundStartTick(engine, p) {
    if (isShotaro(p) && p.shotaroDrive && !jokerOn(p)) {
      p.shotaroDrive = false;
      engine.log(`🃏 ${p.name} ร่างโจ๊กเกอร์หมดเวลา — Maximum Drive ที่ยังไม่ได้ใช้หายไป`);
    }
  },

  canUseSkill(engine, p, tier, targets, item) {
    if (tier === "basic") {
      const t = engine.players[Array.isArray(targets) ? targets[0] : null];
      return !!(t && t.alive && t.id !== p.id && GUESSES[item]);
    }
    if (tier === "secondary") return jokerOn(p) && !p.shotaroDrive;
    if (tier === "ultimate") return !jokerOn(p) && (p.shotaroSuspicion || 0) >= SUSPICION_MAX;
    return true;
  },

  applyInstantSkill(engine, p, tier, targets, item) {
    if (tier === "basic") {
      const t = engine.players[targets[0]];
      p.shotaroGuess = { targetId: t.id, pick: item };
      return ` → ${t.name}`; // ไม่บอกคำทายบนป้ายที่ทุกคนเห็น
    }
    if (tier === "secondary") {
      p.shotaroDrive = true;
      return " — หมัดถัดไป";
    }
    if (tier === "ultimate") {
      p.shotaroSuspicion = 0;
      p.statuses.shotaroJoker = JOKER_TURNS;
      p.transformAt = engine.nextTransformCounter();
      engine.triggerCutscene(p, "shotaroJoker"); // วีดีโอเต็มครั้งแรกครั้งเดียว ครั้งถัดไปเป็นการ์ดแจ้งเตือน
      return "";
    }
    return "";
  },

  // ---------- ตัดสินคำทาย (resolveRound — ไพ่ทุกคนนิ่งแล้ว) ----------
  resolveGuesses(engine) {
    for (const p of Object.values(engine.players)) {
      if (!isShotaro(p) || !p.shotaroGuess) continue;
      const { targetId, pick } = p.shotaroGuess;
      p.shotaroGuess = null;
      const t = engine.players[targetId];
      const g = GUESSES[pick];
      if (!p.alive || !t || !g) continue;
      const bust = engine.bustedOf(t);
      const score = engine.scoreOf(t);
      const right = t.alive && g.test(score, bust);
      if (!right) {
        engine.log(`🔍 ${p.name} ยอดนักสืบ — ทาย ${t.name} "${g.label}" ผิด (ได้ ${bust ? "แต้มเกิน" : `${score} แต้ม`})`);
        continue;
      }
      const healed = engine.healHp(p, GUESS_HEAL);
      p.shotaroSuspicion = Math.min(SUSPICION_MAX, (p.shotaroSuspicion || 0) + 1);
      const shocked = engine.withEffectSource(p, () => engine.applyShock(t, GUESS_SHOCK_TURNS));
      engine.log(`🔍 ${p.name} ยอดนักสืบ — ทาย ${t.name} "${g.label}" ถูก! ฟื้นพลังชีวิต +${healed} · ความน่าสงสัย ${p.shotaroSuspicion}/${SUSPICION_MAX}${shocked ? ` · ${t.name} ติดช็อต ${GUESS_SHOCK_TURNS} เทิร์น` : ` · ${t.name} ต้านช็อตไว้ได้`}`);
    }
  },

  // ---------- โจมตีปกติ ----------
  // ตอนกดโจมตี (ก่อนด่านหลบ): ร่างโจ๊กเกอร์แปะเปราะบาง 1 ให้เป้าหมายทันที — หมัดนี้จึงแรงขึ้นเลย
  onAttack(engine, attacker, target) {
    if (!isShotaro(attacker) || !jokerOn(attacker) || !target || !target.alive) return;
    if (((target.statuses && target.statuses.fragile) || 0) > 0) return; // มีเปราะบางอยู่แล้ว ไม่แตะของเดิม
    if (engine.applyDebuff(target, "fragile", 1, 1)) engine.log(`🃏 ${attacker.name} ยอดนักสืบเจ้าปัญหา — ${target.name} ติดเปราะบาง`);
  },
  driveArmed(attacker) { return isShotaro(attacker) && !!attacker.shotaroDrive && jokerOn(attacker); },
  // หลังผ่านด่านหลบแล้ว (หมัดจะลงแน่): ปาดบัฟล่าสุดทิ้งก่อนหมัดลง + คิววีดีโอ — ท่าถูกใช้ตรงนี้
  prepareDriveOnAttack(engine, attacker, target) {
    if (!this.driveArmed(attacker)) return false;
    attacker.shotaroDrive = false;
    attacker.shotaroDriveHit = target.id;
    const stripped = engine.stripLatestBuff(target);
    if (stripped) engine.log(`🃏 Maximum Drive — ปาดบัฟ "${stripped.label}" ของ ${target.name} ทิ้ง`);
    engine.queueCutscene(attacker, "shotaroDrive"); // เล่นทุกครั้ง ก่อนฉากสรุปความเสียหาย
    return true;
  },
  // หลังหมัดลง: ลุกไหม้ + เปราะบาง 3 เทิร์น (มีผลกับหมัดถัดๆ ไป)
  afterDriveHit(engine, attacker, target) {
    if (!isShotaro(attacker) || attacker.shotaroDriveHit !== (target && target.id)) return;
    attacker.shotaroDriveHit = null;
    if (!target.alive) return;
    const res = engine.resistActive(target);
    if (!res) target.statuses.hburn = Math.min(6, (target.statuses.hburn || 0) + DRIVE_BURN);
    engine.applyDebuff(target, "fragile", 1, DRIVE_FRAGILE_TURNS);
    engine.log(`🃏 Maximum Drive — ${target.name} ${res ? "ต้านสถานะไว้ได้" : `ลุกไหม้ +${DRIVE_BURN} · เปราะบาง ${DRIVE_FRAGILE_TURNS} เทิร์น`}`);
  },
  damageBonus(engine, attacker) {
    if (!isShotaro(attacker)) return 0;
    return (jokerOn(attacker) ? 1 : 0) + (this.driveArmed(attacker) ? 1 : 0);
  },

  publicState(p) {
    return { suspicion: p.shotaroSuspicion || 0, suspicionMax: SUSPICION_MAX, joker: jokerOn(p), drive: !!p.shotaroDrive };
  },
  // คำทายของเทิร์นนี้ — เห็นเจ้าตัวคนเดียว
  privateState(engine, p) {
    if (!isShotaro(p) || !p.shotaroGuess) return {};
    const t = engine.players[p.shotaroGuess.targetId];
    return { shotaroGuess: { targetName: t ? t.name : "", label: (GUESSES[p.shotaroGuess.pick] || {}).label || "" } };
  },
};
