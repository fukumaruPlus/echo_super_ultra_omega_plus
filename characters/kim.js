// ============================================================
//  Bamboo-Hatted Kim (พิเศษ · เลือกได้คนเดียวต่อเกม)
//
//  ค่าสถานะ: พลังชีวิต 8 · เกราะ ("โล่") 2 · แต้มสกิล 0/8 · พลังโจมตีพื้นฐาน 1
//  ทรัพยากรเฉพาะตัว 2 อย่าง (เก็บที่ p.kim — ไม่ใช่ p.statuses จึงไม่ลดเทิร์น/ล้างไม่ได้/ต้านไม่ได้)
//    Resentful Scabbard 0/100 — ได้จาก "ได้รับความเสียหาย" (ทุกชนิด) +3-10 · "สร้างความเสียหายโดน" (รวมสวนกลับ) +3-8 · "ถูกหลบ" +10
//      30+ สร้างความเสียหายแล้วฟื้นพลังชีวิต +1 · 55+ เลือดไหล/เหน็บชาที่มอบให้คนอื่น +1 เทิร์น
//      80+ พลังโจมตี +1 · ถูกโจมตีฟื้นแต้มสกิล +1 · เข้าร่าง Awake (วีดีโอครั้งเดียว + เพลงค้าง + ท่าไม้ตายเป็นท่า 2)
//      100 สร้างความเสียหายแล้วฟื้นพลังชีวิตเพิ่มอีก +1
//    Poise 0/50 — 1 หน่วย = คริติคอล 1.2% (สูงสุด 60%) ×2 · คริติคอลเมื่อไหร่ -15 · ทุก 3 เทิร์นลด 2-5
//      โจมตีปกติ (โดนหรือถูกหลบ) ได้ Poise +1-4
//
//  สกิลติดตัว ฝักดาบที่เต็มไปด้วยความขุ่นเคือง
//    - Resentment: ความเสียหายที่มากกว่าพลังชีวิตที่เหลือ -> ค้างที่ 1 (ครั้งเดียวต่อเกม — ดักที่ instantDeath)
//    - โยนเหรียญทุกต้นเทิร์น หัว/ก้อย 50/50 — เสียพลังชีวิตไปทุก 1 หน่วย ก้อย +3%
//        ก้อย: พลังชีวิต <= 5 เกราะ +1 · >= 5 Poise +1-3   (ที่ 5 พอดีได้ทั้งคู่ตามตัวอักษรสเปค)
//        หัว:  พลังชีวิต <= 4 คริติคอล +15% ทั้งเทิร์น · >= 5 แต้มสกิล +1
//    - มี Yield My Flesh + To Claim Their Bones พร้อมกัน -> รวมเป็น Yield My Flesh To Claim Their Bones
//
//  สกิลพื้นฐาน ชักดาบ (3 · คูลดาวน์ 2) — การโจมตีปกติครั้งถัดไปที่โดน: Poise +2-5 + เลือดไหล/เหน็บชา 1 เทิร์น
//  สกิลรอง ฟาดฟันลง (5 · คูลดาวน์ 3) — Counter Stance 2 เทิร์น (โดนดาเมจจากโจมตีปกติ/สกิล = สวนกลับ · คริติคอลได้)
//    สวนกลับ "ดาเมจจากสกิล" หน่วงไว้ลงตอน flushCounters (จุดเดียวกับสวนกลับของ ORT — หลังสกิล/ไอเทม/คลิปจบ)
//    ไม่สวนกลางท่อดาเมจของสกิลคนอื่น · ดาเมจจากสถานะ/ไอเทม/แพ้จั่วไม่นับ
//  ท่าไม้ตาย 1 จักเฉือนเลือดเนื้อตน (7 · คูลดาวน์ 3) — หลังเปิดไพ่
//    หัว: กดแล้วจั่วต่อไม่ได้ + แต้มกลายเป็น 0 · ก้อย: ปรับแต้มเป็น 20 (21 พอดีไม่ทำงาน)
//    เปิดไพ่แพ้ -> To Claim Their Bones · แล้วได้ Yield My Flesh เสมอ
//  ท่าไม้ตาย 2 ข้าจักเฉือนเลือดเนื้อตนเพื่อผ่าอัฐิศัตรู (8 + พลังชีวิต 1 · คูลดาวน์ 5) — ก่อนเปิดไพ่
//    ก้อย: ทุกคนติดเปราะบาง 1 เทิร์น · ได้ Yield My Flesh To Claim Their Bones
//
//  บัพรวมร่าง (Yield My Flesh To Claim Their Bones) — อยู่จนกว่าจะโดนดาเมจจากโจมตีปกติ/สกิล:
//    ล่อเป้าทุกคน (คิว taunter เดียวกับยุย/ริต้า/แบทแมน) · ถูกตีแล้วสวน (พลังโจมตี + คริติคอล) +1
//    และทุกคนที่เหลือโดน 1 หน่วย · ทุกคนที่โดนติดเลือดไหล + เหน็บชา · Poise +2-8
//
//  "เหน็บชา" (numb) เป็นดีบัฟ Universal ใหม่ (ดู numbFizzles ใน _universal_status.js)
//  ดีบัฟที่ Kim มอบ "ในเทิร์นถัดไป" จองไว้ที่ p.kimNumbPending แล้วแปลงเป็นสถานะจริงต้นเทิร์น
//  (ถ้าใส่ 1 เทิร์นตอนเฟสโจมตีเลย ลูปลดเทิร์นของ endTurn จะกินทิ้งก่อนได้มีผล)
// ============================================================

const ID = "kim";
const DIR = "/characters/Bamboo-Hatted Kim";

const KIM_MAX_HP = 8;
const KIM_MAX_ARMOR = 2;

const SCABBARD_MAX = 100;
const SCABBARD_HEAL1 = 30;
const SCABBARD_EXTEND = 55;
const SCABBARD_AWAKE = 80;
const SCABBARD_HEAL2 = 100;
const SCABBARD_HIT_TAKEN = [3, 10];
const SCABBARD_HIT_LANDED = [3, 8];
const SCABBARD_DODGED = 10;

const POISE_MAX = 50;
const POISE_CRIT_PER = 1.2;     // % ต่อ 1 หน่วย
const POISE_CRIT_CAP = 60;      // %
const CRIT_POISE_COST = 15;
const POISE_DECAY_EVERY = 3;
const POISE_DECAY = [2, 5];
const HEADS_CRIT = 15;          // % (หัว + พลังชีวิต <= 4)
const TAILS_PER_HP = 3;         // % ก้อยเพิ่มต่อพลังชีวิตที่เสียไป 1 หน่วย
const ATTACK_POISE = [1, 4];    // โจมตีปกติ = Poise +1-4

const DRAW_POISE = [2, 5];
const STANCE_POISE = [1, 6];
const BONES_POISE = [2, 8];
const TAILS_POISE = [1, 3];

const COOLDOWN = { basic: 2, secondary: 3, ultimate: 3, ultimate2: 5 };
const COUNTER_TURNS = 2;
const ULT2_HP_COST = 1;
const AFFLICT_TURNS = 1;

const IMG = {
  base: `${DIR}/bamboo-hatted-kim Profile.png`,
  awake: `${DIR}/Bamboo-Hatted Kim_Awake_1.png`,
  skill1: `${DIR}/สกิลพื้นฐาน/Card Draw of the Sword.webp`,
  skill2: `${DIR}/สกิลรอง/Card Overthrow.webp`,
  ult1: `${DIR}/สกิลอัลติเมต/Card Yield My Flesh.webp`,
  ult2: `${DIR}/สกิลอัลติเมต/Card To Claim Their Bones.webp`,
};
const VIDEO = { awake: `${DIR}/Bamboo-Hatted Kim Awake Vedio.mp4` };
// คีย์เสียงฝั่ง client (client/src/audio.js)
const SFX = { basic: "kim_draw", secondary: "kim_overthrow", stance: "kim_counter", bones: "kim_bones" };
const MUSIC = "kim_awake";

const isKim = (p) => !!p && p.characterId === ID && !!p.kim;
const rnd = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const awake = (p) => isKim(p) && p.kim.scabbard >= SCABBARD_AWAKE;

function freshState() {
  return {
    scabbard: 0, poise: 0,
    coin: null,            // "heads" | "tails" ของเทิร์นนี้
    drawArmed: false,      // ชักดาบรอหมัดถัดไป
    ymf: false,            // Yield My Flesh
    tctb: false,           // To Claim Their Bones
    bones: false,          // Yield My Flesh To Claim Their Bones
    ultPending: null,      // ท่าไม้ตาย 1 รอผลตอนเปิดไพ่ { coin }
    noDrawRound: 0,        // ท่าไม้ตาย 1 (หัว): ห้ามจั่วถึงเปิดไพ่ของเทิร์นนี้
    cd: {},                // คูลดาวน์รายช่อง = เลขรอบสุดท้ายที่ยังติด
    awakeSeen: false,
    resentUsed: false,
    pendingAtk: null,      // { ref } — ออกหมัดแล้ว รอดูว่าโดนหรือถูกหลบ
    counterQueue: [],      // id ผู้ที่ทำดาเมจจากสกิลใส่ Kim — สวนกลับตอน flushCounters
  };
}

module.exports = {
  id: ID,
  IMG, VIDEO, SFX,
  MAX_HP: KIM_MAX_HP, MAX_ARMOR: KIM_MAX_ARMOR,
  SCABBARD_MAX, SCABBARD_HEAL1, SCABBARD_EXTEND, SCABBARD_AWAKE, SCABBARD_HEAL2,
  POISE_MAX, CRIT_POISE_COST, HEADS_CRIT, COOLDOWN, COUNTER_TURNS,

  maxHp() { return KIM_MAX_HP; },
  maxArmor() { return KIM_MAX_ARMOR; },
  isAwake: awake,

  resetCombat(p) {
    p.kim = p.characterId === ID ? freshState() : null;
    p.kimNumbPending = 0; // เหน็บชาที่ Kim จองไว้ให้คนนี้ (มีผลต้นเทิร์นถัดไป)
  },

  // ---------- คูลดาวน์ (เลขรอบ — นับตั้งแต่เทิร์นถัดไป) ----------
  cdKey(p, tier) { return tier === "ultimate" && awake(p) ? "ultimate2" : tier; },
  cooldownLeft(engine, p, tier) {
    if (!isKim(p)) return 0;
    const until = p.kim.cd[this.cdKey(p, tier)] || 0;
    return Math.max(0, until - engine.roundNumber + 1);
  },
  setCooldown(engine, p, key) {
    p.kim.cd[key] = engine.roundNumber + COOLDOWN[key];
  },

  // ---------- ทรัพยากร ----------
  addPoise(p, n) {
    const before = p.kim.poise;
    p.kim.poise = Math.max(0, Math.min(POISE_MAX, before + n));
    return p.kim.poise - before;
  },
  addScabbard(engine, p, n, why) {
    const before = p.kim.scabbard;
    p.kim.scabbard = Math.min(SCABBARD_MAX, before + n);
    const got = p.kim.scabbard - before;
    if (got > 0) engine.log(`🗡️ ${p.name} Resentful Scabbard +${got} (${why}) — รวม ${p.kim.scabbard}/${SCABBARD_MAX}`);
    if (before < SCABBARD_AWAKE && p.kim.scabbard >= SCABBARD_AWAKE) this.enterAwake(engine, p);
    return got;
  },
  enterAwake(engine, p) {
    p.transformAt = engine.nextTransformCounter(); // เพลงร่าง Awake เริ่มจากต้น
    engine.triggerCutscene(p, "kimAwake");          // วีดีโอเต็มครั้งแรกครั้งเดียว
    engine.log(`🌑 ${p.name} ความขุ่นเคืองล้นฝักดาบ — เข้าสู่ร่าง Awake! พลังโจมตี +1 · ถูกโจมตีฟื้นแต้มสกิล +1 · ท่าไม้ตายเปลี่ยนเป็น "ข้าจักเฉือนเลือดเนื้อตนเพื่อผ่าอัฐิศัตรู"`);
  },
  extraTurns(p) { return isKim(p) && p.kim.scabbard >= SCABBARD_EXTEND ? 1 : 0; },
  critChance(p) {
    if (!isKim(p)) return 0;
    const poise = Math.min(POISE_CRIT_CAP, p.kim.poise * POISE_CRIT_PER);
    const heads = p.kim.coin === "heads" && p.hp <= 4 ? HEADS_CRIT : 0;
    return Math.round((poise + heads) * 10) / 10;
  },
  rollCrit(engine, p, dmg, fx) {
    if (!isKim(p) || dmg <= 0) return dmg;
    const chance = this.critChance(p);
    if (!(Math.random() * 100 < chance)) return dmg;
    this.addPoise(p, -CRIT_POISE_COST);
    fx.crit = true;
    fx.chance = chance;
    engine.log(`💥 ${p.name} คริติคอล! (${chance}%) ความเสียหาย ×2 — Poise -${CRIT_POISE_COST}`);
    return dmg * 2;
  },
  healOnDamage(engine, p) {
    if (!isKim(p) || !p.alive) return 0;
    const n = (p.kim.scabbard >= SCABBARD_HEAL1 ? 1 : 0) + (p.kim.scabbard >= SCABBARD_HEAL2 ? 1 : 0);
    if (n <= 0) return 0;
    const got = engine.healHp(p, n);
    if (got > 0) engine.log(`🩸 ${p.name} Resentful Scabbard — สร้างความเสียหายแล้วฟื้นพลังชีวิต +${got}`);
    return got;
  },
  // เลือดไหล + เหน็บชา ให้คนที่โดนความเสียหาย (เหน็บชามีผลเทิร์นถัดไป)
  afflict(engine, kim, t) {
    if (!t || !t.alive || t.id === kim.id || engine.sameTeam(kim, t)) return;
    const turns = AFFLICT_TURNS + this.extraTurns(kim);
    const bled = engine.applyBleed(t, turns);
    t.kimNumbPending = Math.max(t.kimNumbPending || 0, turns);
    engine.log(`🩸 ${t.name} ${bled > 0 ? `ติดเลือดไหล ${bled}` : "ต้านเลือดไหลไว้ได้"} · เหน็บชา ${turns} เทิร์นจะเริ่มเทิร์นหน้า`);
  },
  tryMerge(engine, p) {
    if (!p.kim.ymf || !p.kim.tctb) return false;
    p.kim.ymf = false;
    p.kim.tctb = false;
    p.kim.bones = true;
    engine.log(`⚔️ ${p.name} Yield My Flesh + To Claim Their Bones รวมเป็น "Yield My Flesh To Claim Their Bones" — ทุกคนต้องโจมตี ${p.name} เท่านั้น!`);
    return true;
  },

  // ---------- สกิล ----------
  dynamicSkillFor(p, ch, tier) {
    if (tier === "ultimate" && awake(p)) return ch.ultimate2;
    return ch[tier];
  },
  skillSound(p, tier) { return tier === "basic" ? SFX.basic : tier === "secondary" ? SFX.secondary : null; },
  canUseSkill(engine, p, tier) {
    if (!isKim(p)) return true;
    if (this.cooldownLeft(engine, p, tier) > 0) return false;
    if (tier === "ultimate") {
      if (p.kim.bones) return false; // มีบัพรวมร่างอยู่ = ท่าไม้ตายทั้งสองกดไม่ได้
      if (awake(p)) return p.hp > ULT2_HP_COST; // จ่ายพลังชีวิต 1 ต้องไม่ใช่การฆ่าตัวเอง
    }
    return true;
  },
  applyInstantSkill(engine, p, tier) {
    if (!isKim(p)) return "";
    if (tier === "basic") {
      this.setCooldown(engine, p, "basic");
      p.kim.drawArmed = true;
      engine.log(`🗡️ ${p.name} ชักดาบ — การโจมตีครั้งถัดไป: Poise +2-5 และมอบเลือดไหล + เหน็บชา`);
      return " — เตรียมชักดาบ";
    }
    if (tier === "secondary") {
      this.setCooldown(engine, p, "secondary");
      p.statuses.kimCounter = COUNTER_TURNS;
      engine.log(`🗡️ ${p.name} ฟาดฟันลง — Counter Stance ${COUNTER_TURNS} เทิร์น: ถูกโจมตีปกติเมื่อไหร่จะสวนกลับทันที`);
      return ` — Counter Stance ${COUNTER_TURNS} เทิร์น`;
    }
    if (tier === "ultimate" && awake(p)) return this.applyUlt2(engine, p);
    if (tier === "ultimate") {
      this.setCooldown(engine, p, "ultimate");
      p.kim.ultPending = { coin: p.kim.coin };
      if (p.kim.coin === "heads") {
        p.kim.noDrawRound = engine.roundNumber;
        engine.log(`🗡️ ${p.name} จักเฉือนเลือดเนื้อตน (หัว) — จั่วต่อไม่ได้ และแต้มจะกลายเป็น 0 ตอนเปิดไพ่`);
        return " — หัว: แต้มจะเป็น 0";
      }
      engine.log(`🗡️ ${p.name} จักเฉือนเลือดเนื้อตน (ก้อย) — แต้มจะถูกปรับเป็น 20 ตอนเปิดไพ่`);
      return " — ก้อย: แต้มจะเป็น 20";
    }
    return "";
  },
  applyUlt2(engine, p) {
    this.setCooldown(engine, p, "ultimate2");
    engine.loseHp(p); // ราคา: พลังชีวิต 1 หน่วย (canUseSkill กันไว้แล้วว่าเหลือมากกว่า 1)
    let fragile = 0;
    if (p.kim.coin === "tails") {
      engine.withEffectSource(p, () => {
        for (const t of engine.alivePlayers()) {
          if (t.id === p.id || engine.sameTeam(p, t)) continue;
          if (engine.applyDebuff(t, "fragile", 1, 1)) fragile++;
        }
      });
    }
    p.kim.ymf = false;
    p.kim.tctb = false;
    p.kim.bones = true;
    p.transformAt = engine.nextTransformCounter();
    engine.log(`⚔️ ${p.name} ข้าจักเฉือนเลือดเนื้อตนเพื่อผ่าอัฐิศัตรู — เสียพลังชีวิต ${ULT2_HP_COST}${fragile ? ` · ${fragile} คนติดเปราะบาง 1 เทิร์น` : ""} · ได้ "Yield My Flesh To Claim Their Bones"`);
    return fragile ? ` — เปราะบาง ${fragile} คน` : "";
  },
  // ท่าไม้ตาย 1 (หัว) — จั่วไม่ได้จนเปิดไพ่
  blocksDraw(engine, p) {
    return isKim(p) && p.kim.noDrawRound === engine.roundNumber;
  },

  // ---------- เปิดไพ่ ----------
  //  เรียกจาก resolveRound() ก่อนหาผู้ชนะ (ผลเปลี่ยนแต้มจึงเปลี่ยนผู้ชนะ/ผู้แพ้ของรอบ)
  resolveUltScores(engine) {
    for (const p of engine.alivePlayers()) {
      if (!isKim(p) || !p.kim.ultPending) continue;
      const raw = engine.calculateScore(p.cards);
      if (p.kim.ultPending.coin === "heads") {
        p.cardBonus = -raw;
        engine.log(`🗡️ ${p.name} จักเฉือนเลือดเนื้อตน — แต้มกลายเป็น 0`);
      } else {
        const cur = raw + (p.cardBonus || 0);
        if (cur !== 21) {
          p.cardBonus = 20 - raw;
          engine.log(`🗡️ ${p.name} จักเฉือนเลือดเนื้อตน — ปรับแต้มจาก ${cur} เป็น 20`);
        } else {
          engine.log(`🗡️ ${p.name} จักเฉือนเลือดเนื้อตน — แต้ม 21 พอดี ไม่ต้องปรับ`);
        }
      }
      p.busted = engine.bustedOf(p);
    }
  },
  // เรียกหลังตัดสินผู้แพ้ของรอบ (p.isLoser) — ท่าไม้ตาย 1 ลงบัพ
  onRoundResult(engine) {
    for (const p of engine.alivePlayers()) {
      if (!isKim(p) || !p.kim.ultPending) continue;
      this.finishUlt(engine, p, !!p.isLoser);
    }
  },
  finishUlt(engine, p, lost) {
    p.kim.ultPending = null;
    if (lost && !p.kim.tctb && !p.kim.bones) {
      p.kim.tctb = true;
      engine.log(`🦴 ${p.name} เปิดไพ่แพ้ — ได้ "To Claim Their Bones" (ฟื้นแต้มสกิล +1 ทุกต้นเทิร์น)`);
    }
    if (!p.kim.ymf) {
      p.kim.ymf = true;
      engine.log(`🩸 ${p.name} ได้ "Yield My Flesh" — พลังโจมตี +1 · หมัดที่โดนมอบเลือดไหล + เหน็บชา`);
    }
    this.tryMerge(engine, p);
  },

  // ---------- ต้นเทิร์น (เรียกกับผู้เล่นทุกคน) ----------
  onRoundStartTick(engine, p) {
    if ((p.kimNumbPending || 0) > 0) {
      const turns = p.kimNumbPending;
      p.kimNumbPending = 0;
      if (p.alive) {
        if (engine.applyDebuff(p, "numb", null, turns)) engine.log(`🫨 ${p.name} ติด "เหน็บชา" ${turns} เทิร์น — กดสกิลมีโอกาส 30% ไม่ทำงาน`);
        else engine.log(`🛡️ ${p.name} ต้านสถานะผิดปกติ — ไม่ติด "เหน็บชา"`);
      }
    }
    if (!isKim(p) || !p.alive) return;
    const k = p.kim;
    // ตาข่าย: ท่าไม้ตาย 1 ค้าง (รอบถูกตัดทางลัดโดยการไล่ล่า/การแข่ง ไม่มีผู้แพ้) -> ลง Yield My Flesh อย่างเดียว
    if (k.ultPending) this.finishUlt(engine, p, false);
    k.pendingAtk = null;
    if (k.tctb) {
      engine.addSkill(p, 1, "passive");
      engine.log(`🦴 ${p.name} To Claim Their Bones — ฟื้นแต้มสกิล +1`);
    }
    if (engine.roundNumber % POISE_DECAY_EVERY === 0 && k.poise > 0) {
      const lost = -this.addPoise(p, -rnd(POISE_DECAY));
      if (lost > 0) engine.log(`🍃 ${p.name} Poise ลดลง ${lost} (เหลือ ${k.poise})`);
    }
    // โยนเหรียญ — เสียพลังชีวิตไปมากเท่าไหร่ ก้อยยิ่งง่าย
    const missing = Math.max(0, engine.maxHpOf(p) - p.hp);
    const tailsPct = Math.min(100, 50 + TAILS_PER_HP * missing);
    k.coin = Math.random() * 100 < tailsPct ? "tails" : "heads";
    const bits = [];
    if (k.coin === "tails") {
      if (p.hp <= 5) { const a = engine.healArmor(p, 1); if (a > 0) bits.push(`เกราะ +${a}`); }
      if (p.hp >= 5) { const g = this.addPoise(p, rnd(TAILS_POISE)); if (g > 0) bits.push(`Poise +${g}`); }
    } else {
      if (p.hp <= 4) bits.push(`คริติคอล +${HEADS_CRIT}% เทิร์นนี้`);
      if (p.hp >= 5) { engine.addSkill(p, 1, "passive"); bits.push("แต้มสกิล +1"); }
    }
    engine.log(`🪙 ${p.name} โยนเหรียญได้ "${k.coin === "tails" ? "ก้อย" : "หัว"}" (ก้อย ${tailsPct}%)${bits.length ? ` — ${bits.join(" · ")}` : ""}`);
  },

  // ---------- การโจมตีปกติ ----------
  damageBonus(engine, attacker) {
    if (!isKim(attacker)) return 0;
    return (awake(attacker) ? 1 : 0) + (attacker.kim.ymf ? 1 : 0);
  },
  // พลังโจมตีของการสวนกลับ: Yield My Flesh ไม่มีผลกับ Counter Stance (สเปค) — บัพรวมร่างไม่มี ymf อยู่แล้ว
  counterBase(p) { return 1 + (awake(p) ? 1 : 0); },

  // เรียกที่หัว doAttack() ก่อนด่านหลบทั้งหมด: จำไว้ว่า Kim ออกหมัด (ตัดสิน "ถูกหลบ" ทีหลัง)
  beforeAttack(engine, attacker) {
    this.flushMiss(engine);
    if (isKim(attacker)) attacker.kim.pendingAtk = { ref: engine.lastAttack };
  },
  // หมัดที่ออกไปแล้วไม่ได้ลง (onAttackLanded ไม่ได้ล้างธง) + ฉากล่าสุดเป็นการหลบ = ถูกหลบ -> +10
  //  เรียกจากหัว doAttack ถัดไปและหัว endTurn (ทุกเส้นทางหลบจบที่ endTurn)
  flushMiss(engine) {
    for (const p of Object.values(engine.players)) {
      if (!isKim(p) || !p.kim.pendingAtk) continue;
      const ref = p.kim.pendingAtk.ref;
      p.kim.pendingAtk = null;
      const la = engine.lastAttack;
      if (p.alive && la && la !== ref && la.dodge) {
        this.addScabbard(engine, p, SCABBARD_DODGED, "เป้าหมายหลบได้");
        this.addPoise(p, rnd(ATTACK_POISE)); // ออกหมัดแล้ว (ถูกหลบ) ก็ได้ Poise
      }
    }
  },
  applyCrit(engine, attacker, dmg, fx) {
    if (!isKim(attacker)) return dmg;
    return this.rollCrit(engine, attacker, dmg, fx);
  },
  // หมัดของ Kim ลงแล้ว (หลังดาเมจ) — คืนชื่อเอฟเฟกต์ไว้โชว์บนการ์ดสรุป
  onAttackLanded(engine, attacker, target, dmg) {
    if (!isKim(attacker)) return [];
    const k = attacker.kim;
    k.pendingAtk = null;
    const fx = [];
    this.addPoise(attacker, rnd(ATTACK_POISE)); // โจมตีปกติ = Poise +1-4
    if (dmg > 0) this.addScabbard(engine, attacker, rnd(SCABBARD_HIT_LANDED), "สร้างความเสียหาย");
    let afflicted = false;
    if (k.drawArmed) {
      k.drawArmed = false;
      const g = this.addPoise(attacker, rnd(DRAW_POISE));
      engine.withEffectSource(attacker, () => this.afflict(engine, attacker, target));
      afflicted = true;
      fx.push(`ชักดาบ — Poise +${g} · เลือดไหล + เหน็บชา`);
    }
    if (k.ymf && dmg > 0 && !afflicted) {
      engine.withEffectSource(attacker, () => this.afflict(engine, attacker, target));
      fx.push("Yield My Flesh — เลือดไหล + เหน็บชา");
    }
    if (dmg > 0) {
      const h = this.healOnDamage(engine, attacker);
      if (h > 0) fx.push(`Resentful Scabbard — ฟื้นพลังชีวิต +${h}`);
    }
    return fx;
  },

  // ได้รับความเสียหาย (ทุกชนิด — โจมตีปกติ/สกิล/สถานะ) -> ฝักดาบ +3-10 · ไม่แก้ค่าดาเมจ
  //  ท่อ dealMixed/dealDirect/dealArmorOnly ผ่านจุดนี้ครั้งเดียวต่อก้อน · ดาเมจแพ้จั่ว (damageSoft) server เรียก onSoftDamage แยก
  //  ดาเมจจากสกิล (ไม่ใช่โจมตีปกติ / สถานะ / ไอเทม) + มีท่าสวนอยู่ -> จองสวนกลับผู้ลงมือ (ลงตอน flushCounters)
  adjustIncomingDamage(engine, p, n, isNormalAttack) {
    if (!isKim(p) || !p.alive || !(n > 0)) return n;
    this.addScabbard(engine, p, rnd(SCABBARD_HIT_TAKEN), "ได้รับความเสียหาย");
    const src = engine.effectSourceId;
    // สวนกลับเฉพาะ "ดาเมจจากสกิล": ไม่นับสถานะ/ไอเทม · ไม่นับดาเมจที่เป็นการสวนกลับ (_counterDamage — กันสวนกันไปมากับ ORT)
    //  · ไม่นับดาเมจที่เกิดระหว่างเฟสโจมตี (ท่าสวนของคนอื่น เช่นเยอรมันซูเพล็ก — หมัดปกติของเขาสวนผ่าน onAttackedNormally อยู่แล้ว)
    const inAttackPhase = engine.gameState === "ATTACK" || engine.gameState === "ATTACKING";
    if (!isNormalAttack && !p._statusDamage && !p._itemDamage && !p._counterDamage && !inAttackPhase
        && src && src !== p.id && this.hasCounter(p)) {
      const q = p.kim.counterQueue || (p.kim.counterQueue = []);
      if (!q.includes(src)) q.push(src); // สกิลเดียวโดนหลายก้อน = สวนครั้งเดียว
    }
    return n;
  },
  hasCounter(p) { return isKim(p) && (p.kim.bones || (p.statuses.kimCounter || 0) > 0); },
  // สวนกลับดาเมจจากสกิลที่จองไว้ — คืน true ถ้ามีการสวนเกิดขึ้น (ผู้เรียก broadcast)
  flushCounters(engine) {
    let fired = false;
    for (const k of Object.values(engine.players)) {
      if (!isKim(k) || !(k.kim.counterQueue || []).length) continue;
      const q = k.kim.counterQueue;
      k.kim.counterQueue = [];
      for (const id of q) {
        const a = engine.players[id];
        if (!k.alive || !a || !a.alive || engine.sameTeam(k, a)) continue;
        if (k.kim.bones) this.counterBones(engine, k, a);
        else if ((k.statuses.kimCounter || 0) > 0) this.counterStance(engine, k, a);
        else continue;
        fired = true;
      }
    }
    return fired;
  },
  onSoftDamage(engine, p) {
    if (isKim(p) && p.alive) this.addScabbard(engine, p, rnd(SCABBARD_HIT_TAKEN), "ได้รับความเสียหาย");
  },

  // Kim ถูกโจมตีปกติ (หมัดลงแล้ว) — ร่าง Awake ฟื้นแต้มสกิล + สวนกลับ · คืน { name, dmg } เมื่อสวน
  //  (ฝักดาบจากการโดนตีได้ไปแล้วที่ adjustIncomingDamage)
  //  dmg = ความเสียหายของหมัดนั้น — ถูกกันจนเหลือ 0 = ไม่ได้ "ถูกความเสียหาย" จึงไม่สวน (บัพรวมร่างก็ไม่หาย)
  onAttackedNormally(engine, attacker, target, dmg) {
    if (!isKim(target) || !target.alive || !attacker || attacker.id === target.id) return null;
    const k = target.kim;
    if (awake(target)) {
      engine.addSkill(target, 1, "passive");
      engine.log(`🗡️ ${target.name} ร่าง Awake — ถูกโจมตี ฟื้นแต้มสกิล +1`);
    }
    if (!attacker.alive || engine.sameTeam(target, attacker) || !(dmg > 0)) return null;
    if (k.bones) return this.counterBones(engine, target, attacker);
    if ((target.statuses.kimCounter || 0) > 0) return this.counterStance(engine, target, attacker);
    return null;
  },
  hitBack(engine, kim, t, n) {
    t._counterDamage = true; // ดาเมจจากการสวนกลับ — ORT/Kim จะไม่สวนตอบ (กันสวนกันไปมาไม่รู้จบ)
    try { engine.dealMixed(t, n); } finally { t._counterDamage = false; }
    t.wasAttacked = true;
    engine.maybeBeatSave(t); engine.maybeBeatMode(t); engine.maybeWakeKotone(t);
    if (t.alive && t.hp <= 0) {
      engine.instantDeath(t);
      if (!t.alive) engine.log(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
    }
  },
  counterStance(engine, kim, attacker) {
    const fx = {};
    const dmg = this.rollCrit(engine, kim, this.counterBase(kim), fx);
    engine.withEffectSource(kim, () => {
      this.hitBack(engine, kim, attacker, dmg);
      this.afflict(engine, kim, attacker);
    });
    const g = this.addPoise(kim, rnd(STANCE_POISE));
    if (dmg > 0) this.addScabbard(engine, kim, rnd(SCABBARD_HIT_LANDED), "สวนกลับโดน");
    this.healOnDamage(engine, kim);
    engine.log(`⚔️ ${kim.name} Counter Stance — สวนกลับ ${attacker.name} -${dmg}${fx.crit ? " (คริติคอล)" : ""} · Poise +${g}`);
    engine.skillFlash({ name: `Counter Stance — สวนกลับ -${dmg}${fx.crit ? " (คริติคอล)" : ""}`, img: IMG.skill2, by: kim.name, color: engine.colorOf(kim), sound: SFX.stance });
    return { name: `Counter Stance — สวนกลับ -${dmg}${fx.crit ? " (คริติคอล ×2)" : ""}`, img: IMG.skill2, dmg };
  },
  counterBones(engine, kim, attacker) {
    const fx = {};
    // +1 หลังคิดคริติคอลแล้ว (สเปค)
    const dmg = this.rollCrit(engine, kim, this.counterBase(kim), fx) + 1;
    kim.kim.bones = false; // อยู่จนกว่าจะถูกโจมตี — ใช้แล้วหมด
    const splashed = [];
    engine.withEffectSource(kim, () => {
      this.hitBack(engine, kim, attacker, dmg);
      for (const o of engine.alivePlayers()) {
        if (o.id === kim.id || o.id === attacker.id || engine.sameTeam(kim, o)) continue;
        this.hitBack(engine, kim, o, 1);
        splashed.push(o);
      }
      for (const t of [attacker, ...splashed]) this.afflict(engine, kim, t);
    });
    const g = this.addPoise(kim, rnd(BONES_POISE));
    this.addScabbard(engine, kim, rnd(SCABBARD_HIT_LANDED), "สวนกลับโดน"); // สวนครั้งนี้ดาเมจ >= 1 เสมอ (+1 หลังคริติคอล)
    this.healOnDamage(engine, kim);
    engine.log(`⚔️ ${kim.name} Yield My Flesh To Claim Their Bones — สวนกลับ ${attacker.name} -${dmg}${fx.crit ? " (คริติคอล)" : ""}${splashed.length ? ` และฟันคนอื่นอีก ${splashed.length} คน คนละ -1` : ""} · Poise +${g}`);
    engine.skillFlash({ name: `Yield My Flesh To Claim Their Bones — สวนกลับ -${dmg}`, img: IMG.ult2, by: kim.name, color: engine.colorOf(kim), sound: SFX.bones });
    return { name: `Yield My Flesh To Claim Their Bones — สวนกลับ -${dmg}${fx.crit ? " (คริติคอล)" : ""} · คนอื่น -1`, img: IMG.ult2, dmg };
  },
  // บัพรวมร่าง: ล่อเป้าทุกคน (คิว taunter เดียวกับยุย/ริต้า/แบทแมน)
  findTaunters(engine, attacker) {
    return engine.alivePlayers().filter((r) => r.id !== attacker.id && isKim(r) && r.kim.bones && !engine.sealActive(r));
  },

  // ---------- Resentment: ค้างที่ 1 ครั้งเดียวต่อเกม (เรียกจากหัว instantDeath) ----------
  //  เฉพาะ "ตายเพราะเลือดหมด" (hp <= 0) — สังหารทันทีที่เลือดยังเหลืออยู่ไม่ใช่ "ความเสียหาย" จึงไม่นับ
  tryResentment(engine, p) {
    if (!isKim(p) || p.kim.resentUsed || p.hp > 0) return false;
    p.kim.resentUsed = true;
    p.hp = 1;
    engine.log(`😤 ${p.name} Resentment — ความขุ่นเคืองไม่ยอมให้ล้ม! พลังชีวิตค้างที่ 1`);
    return true;
  },

  // ---------- ภาพ / เพลง / ข้อมูลให้ client ----------
  displayImg(p) { return awake(p) ? IMG.awake : null; },
  activeMusic(engine) {
    let best = null;
    for (const p of engine.alivePlayers()) {
      if (!awake(p)) continue;
      if (!best || (p.transformAt || 0) > best.at) best = { music: MUSIC, at: p.transformAt || 0 };
    }
    return best;
  },
  publicState(p) {
    if (!isKim(p)) return undefined;
    const k = p.kim;
    return {
      scabbard: k.scabbard, scabbardMax: SCABBARD_MAX, poise: k.poise, poiseMax: POISE_MAX,
      crit: this.critChance(p), coin: k.coin, awake: awake(p),
      ymf: k.ymf, tctb: k.tctb, bones: k.bones, drawArmed: k.drawArmed, resentUsed: k.resentUsed,
    };
  },
  privateState(engine, p) {
    if (!isKim(p)) return {};
    return {
      kimCd: {
        basic: this.cooldownLeft(engine, p, "basic"),
        secondary: this.cooldownLeft(engine, p, "secondary"),
        ultimate: this.cooldownLeft(engine, p, "ultimate"),
      },
      kimNoDraw: this.blocksDraw(engine, p),
      kimUltPending: !!p.kim.ultPending,
    };
  },
};
