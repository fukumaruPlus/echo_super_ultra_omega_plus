// ============================================================
//  ORT — บอสประเภท "มหันตภัย" (บอตเท่านั้น ผู้เล่นเลือกเล่นไม่ได้)
//  ตอนนี้เกิดในโหมด Type Mercury (Raid) ตั้งแต่เทิร์นแรก — server.js สร้างผู้เล่นปลอม id ORT_ID ที่นั่งตำแหน่ง 8
//
//  ค่าพื้นฐาน
//   · หลอดเลือด: 1 หลอด = เลือด 7 เกราะ 3 · หลอดแตก -> หลอดถัดไปเริ่มเต็ม (ดาเมจที่เกินทิ้งไป) · หลอดสุดท้ายแตก = ตาย
//     (ดักที่ instantDeath() ผ่าน tryBarBreak — จุดเดียวที่ "ตาย" ได้ ครอบทั้งเลือดหมดและสกิลสังหารทันที)
//   · พลังโจมตี 1 หน่วย (+1 ต่อการสังหารผู้เล่นจริง สูงสุด ATK_MAX รวม)
//   · คริติคอล 75% = ดาเมจ ×2 (ทั้งโจมตีปกติและสวนกลับ)
//   · สังหารทันที 20% เฉพาะโจมตีปกติ (ผ่านด่าน Apple guy / มิยาโกะ / killSealed เหมือนเนตรทุกตัว)
//   · ต้านการสังหาร: สกิลสังหารที่โอกาสต่ำกว่า KILL_RESIST_MIN ใช้กับ ORT ไม่ได้เลย
//     ตั้งแต่ KILL_RESIST_MIN ขึ้นไป (และทอยติด) = เสีย 1 หลอด ไม่ได้ตายทั้งตัว
//   · ไม่มีแต้มสกิล/เหรียญ (server.js กันที่ maxSkillOf/addSkill/addGold)
//
//  สกิลติดตัว 1 ศัตรูของเหล่า Echo — สกิลแรกที่ผู้เล่นกดในเทิร์นหนึ่ง "ข้อมูลสูญหาย" กดไม่ได้ LOST_TURNS (2) เทิร์นถัดไป
//    (กดสกิลอื่นแทน = ช่องที่ถูกลบย้ายไปที่สกิลนั้นในเทิร์นถัดไป และนับ 2 เทิร์นใหม่ · ครบ 2 เทิร์นแล้วหายเอง)
//    · p.ortPendingLost = tier แรกที่กดในเทิร์นนี้ (ยังไม่มีผล) -> onRoundStart แปลงเป็น p.ortLostTier
//    · p.ortLostUntil = เลขรอบสุดท้ายที่ยังถูกลบอยู่ (เก็บเป็นเลขรอบ ไม่ใช่ตัวนับ — ไม่ต้องมีใครลดให้)
//  สกิลติดตัว 2 สิ่งต้องห้ามของจักรวาล
//    · โชคลาภ +1 เมื่อ ORT มีไพ่ในมือครบ 2 ใบ (ใบที่ 3 จึงเป็นการจั่วแบบโชคลาภ) — 1 ครั้งต่อเทิร์น
//    · สวนกลับทันทีเมื่อ: ถูกสกิลทำดาเมจ (รวมสกิลหมู่) / ถูกเลือกเป็นเป้าของสกิล (แม้เป็นบัฟ/ดีบัฟ) / ถูกยิงด้วยปืน
//      ไม่จำกัดครั้ง · 1 การกระทำ = สวนกลับ 1 ครั้ง · ติดคริติคอลได้ ไม่ทอยสังหาร · การโจมตีปกติไม่ทำให้สวนกลับ
//      -> จองไว้ใน counterQueue แล้ว server.js เรียก flushCounters() ท้ายการกระทำนั้น
//  สกิลติดตัว 3 การวิวัฒนาการ — สังหารผู้เล่นจริงได้ = หลอดเลือด +1 (ไม่จำกัด) และพลังโจมตี +1 (รวมสูงสุด ATK_MAX)
// ============================================================

const ID = "ort";
const BAR_HP = 7;
const BAR_ARMOR = 3;
const ATK_BASE = 1;
const ATK_MAX = 3;
const CRIT_CHANCE = 0.75;
const KILL_CHANCE = 0.2;
const KILL_RESIST_MIN = 0.4;
const RAID_BARS = 5;
const NORMAL_BARS = 3;
const FORTUNE_AT_HAND = 2;
const LOST_TURNS = 2;
const TIERS = ["basic", "secondary", "ultimate"];
const TIER_NAME = { basic: "สกิลพื้นฐาน", secondary: "สกิลรอง", ultimate: "ท่าไม้ตาย" };
const IMG = { base: "/characters/ort/ort_body.jpg" };

const isOrt = (p) => !!p && p.characterId === ID;
const bossOf = (engine) => Object.values(engine.players).find((p) => isOrt(p) && p.alive) || null;

// สวนกลับที่จองไว้ระหว่างการกระทำหนึ่ง (Set ของ id ผู้กระทำ — ซ้ำในการกระทำเดียวกันนับครั้งเดียว)
const counterQueue = new Set();
let flushing = false;

module.exports = {
  id: ID,
  BAR_HP, BAR_ARMOR, ATK_MAX, LOST_TURNS, RAID_BARS, NORMAL_BARS, KILL_RESIST_MIN, CRIT_CHANCE, KILL_CHANCE, IMG,
  isOrt,
  bossOf,

  // ---------- สร้าง/รีเซ็ต ----------
  initBoss(p, bars) {
    p.ortBars = bars;
    p.ortAtk = ATK_BASE;
    p.ortKills = 0;
    p.ortFortuneRound = 0;
    p.ortReactiveCredits = 0;
    p.ortCritPending = false;
    p.hp = BAR_HP;
    p.armor = BAR_ARMOR;
    p.skillPoints = 0;
    p.gold = 0;
    p.inventory = [];
  },
  // ฟิลด์ของสกิลติดตัว 1 ที่ติดบนผู้เล่นจริง — ต้องล้างทุกแมตช์ (server.js resetCombat)
  resetCombat(p) {
    p.ortLostTier = null;
    p.ortLostUntil = 0;
    p.ortPendingLost = null;
    p.ortFirstSkillRound = 0;
  },
  resetMatch() { counterQueue.clear(); flushing = false; },

  maxHp() { return BAR_HP; },
  maxArmor() { return BAR_ARMOR; },
  attackBaseOverride(engine, attacker) { return attacker.ortAtk || ATK_BASE; },

  // ---------- หลอดเลือด ----------
  // เรียกจากหัว instantDeath(): คืน true = หลอดแตกแต่ยังไม่ตาย (ผู้เรียกต้อง return)
  tryBarBreak(engine, p) {
    if (!isOrt(p) || (p.ortBars || 1) <= 1) return false;
    p.ortBars--;
    p.hp = BAR_HP;
    p.armor = BAR_ARMOR;
    p.alive = true;
    engine.log(`💠 หลอดเลือดของ ${p.name} แตก! เหลืออีก ${p.ortBars} หลอด`);
    engine.ortFx("break");
    return true;
  },
  // ต้านการสังหาร — ใช้กับทุกสกิลสังหารทันที (ผ่าน miyakoKillChance ใน server.js + เทเปาที่ไม่ได้ผ่านจุดนั้น)
  killChanceAgainst(target, chance) {
    if (!isOrt(target)) return chance;
    return chance < KILL_RESIST_MIN ? 0 : chance;
  },

  // ---------- การจั่ว (AI) ----------
  // เป้าแต้ม: แซงแต้มสูงสุดของผู้เล่นจริง 1 แต้ม ไม่ต่ำกว่า 17 ไม่เกินเพดาน — เห็นแต้มจริงตามแบบบอสยูกิเดิม
  //  (ผู้ใช้กังวลว่าบอตจะไม่ชนะเลย จึงยอมให้ "โกง" ข้อนี้)
  targetScore(engine, p) {
    const humans = engine.alivePlayers().filter((o) => !isOrt(o));
    const best = Math.max(0, ...humans.map((o) => (engine.bustedOf(o) ? -1 : engine.scoreOf(o))));
    const cap = engine.scoreCap(p);
    if (!isFinite(cap)) return Math.max(1, best + 1); // Overload Force: ไม่มีเพดาน
    return Math.min(cap, Math.max(17, best + 1));
  },
  // จั่ว 1 ใบ (คืน true ถ้าได้ไพ่) — ใช้โชคลาภถ้ามี แล้วเช็คสกิลติดตัว 2 (ครบ 2 ใบในมือ = โชคลาภ +1)
  drawOne(engine, p) {
    if (!p.alive || engine.centralDeck.length === 0) return false;
    if ((p.statuses.stun || 0) > 0 || (p.statuses.sleep || 0) > 0 || (p.statuses.nodraw || 0) > 0) return false;
    if (engine.bustedOf(p) || engine.scoreOf(p) >= this.targetScore(engine, p)) return false;
    let card = null;
    if (!engine.overloadForceActive && (p.statuses.fortune || 0) > 0) {
      p.statuses.fortune--;
      if (p.statuses.fortune <= 0) delete p.statuses.fortune;
      const cur = engine.calculateScore(p.cards);
      for (const target of engine.fortuneTargetList(cur)) {
        const need = target - cur;
        if (need < 1 || need > 10) continue;
        card = engine.drawFromCentralDeck((c) => !c.special && c.value === need);
        if (card) { engine.log(`🍀 ${p.name} โชคลาภทำงาน — แต้มรวมเป็น ${target}`); break; }
      }
    }
    if (!card) card = engine.drawCardFor(p);
    if (!card) return false;
    p.cards.push(card);
    engine.onCardDrawn(p, card);
    p.busted = engine.bustedOf(p);
    this.checkFortune(engine, p);
    return true;
  },
  checkFortune(engine, p) {
    if (p.cards.length < FORTUNE_AT_HAND || p.ortFortuneRound === engine.roundNumber) return;
    p.ortFortuneRound = engine.roundNumber;
    p.statuses.fortune = (p.statuses.fortune || 0) + 1;
    engine.log(`🍀 ${p.name} สิ่งต้องห้ามของจักรวาล — ได้โชคลาภ +1`);
  },
  // ผู้เล่นจริงจั่ว 1 ครั้ง -> ORT จั่วตามได้ 1 ใบ (ถ้ายังไม่ถึงเป้า)
  onHumanDraw(engine, human) {
    const boss = bossOf(engine);
    if (!boss || isOrt(human) || engine.gameState !== "PLAYING") return;
    this.drawOne(engine, boss);
  },
  // ทุกคนเปิดไพ่แล้ว — จั่วแก้มืออีกได้ไม่เกิน 2 ใบ (เห็นแต้มจริงของทุกคนแล้ว)
  finalDraw(engine) {
    const boss = bossOf(engine);
    if (!boss) return null;
    for (let i = 0; i < 2; i++) if (!this.drawOne(engine, boss)) break;
    return boss;
  },

  // ---------- โจมตีปกติ ----------
  pickTarget(engine, boss) {
    const pool = engine.attackableTargets(boss.id);
    if (!pool.length) return null;
    const load = (o) => (o.hp || 0) + (o.armor || 0);
    const low = Math.min(...pool.map(load));
    const weakest = pool.filter((o) => load(o) === low);
    return weakest[Math.floor(Math.random() * weakest.length)];
  },
  // สังหารทันที 20% — แพทเทิร์นเดียวกับ tohno.onAttack (คืน true = doAttack ต้อง return)
  onAttackKill(engine, attacker, target) {
    if (engine.killSealed(attacker)) return false;
    const chance = engine.miyakoKillChance(target, KILL_CHANCE);
    if (!(Math.random() < chance)) return false;
    if (engine.appleGuyDodgesKill(attacker, target)) return true;
    engine.instantDeath(target);
    target.wasAttacked = true;
    engine.log(target.alive
      ? `☠️ ${attacker.name} เล็งสังหาร ${target.name} — แต่ ${target.name} หนีความตายไปได้!`
      : `☠️ ${attacker.name} ลบข้อมูลของ ${target.name} ทิ้ง — สังหารทันที! (โอกาส ${Math.round(chance * 100)}%)`);
    engine.ortFx("attack");
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.colorOf(attacker),
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.colorOf(target),
      dmg: 0, kill: !target.alive,
      skills: [{ name: "สังหารทันที", img: IMG.base, by: attacker.name, color: engine.colorOf(attacker), side: "atk" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME + 2, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },
  // คริติคอล 75% — คูณยอดสุทธิท้ายสุด (แพทเทิร์นเดียวกับดาบของเอจิ)
  applyCrit(engine, attacker, dmg, fx) {
    if (!isOrt(attacker) || dmg <= 0) {
      if (isOrt(attacker)) engine.ortFx("attack");
      return dmg;
    }
    const crit = Math.random() < CRIT_CHANCE;
    fx.crit = crit;
    engine.ortFx(crit ? "crit" : "attack");
    return crit ? dmg * 2 : dmg;
  },

  // ---------- สกิลติดตัว 1: ศัตรูของเหล่า Echo ----------
  skillErased(engine, p, tier) {
    return !!bossOf(engine) && !isOrt(p) && TIERS.includes(tier) && p.ortLostTier === tier
      && engine.roundNumber <= (p.ortLostUntil || 0);
  },
  onSkillUsed(engine, p, tier) {
    if (!bossOf(engine) || isOrt(p) || !TIERS.includes(tier)) return;
    if (p.ortFirstSkillRound === engine.roundNumber) return; // นับเฉพาะสกิลแรกของเทิร์น
    p.ortFirstSkillRound = engine.roundNumber;
    p.ortPendingLost = tier;
  },
  // ต้นเทิร์น: สกิลแรกของเทิร์นที่แล้ว "ข้อมูลสูญหาย" — คืนจำนวนคนที่เพิ่งโดนลบ (ใช้ยิงอนิเมชัน)
  onRoundStart(engine) {
    const boss = bossOf(engine);
    let erased = 0;
    for (const p of Object.values(engine.players)) {
      if (isOrt(p)) continue;
      if (!boss) { p.ortLostTier = null; p.ortLostUntil = 0; p.ortPendingLost = null; continue; }
      // ครบ 2 เทิร์นแล้ว -> ข้อมูลกลับมา
      if (p.ortLostTier && engine.roundNumber > (p.ortLostUntil || 0)) { p.ortLostTier = null; p.ortLostUntil = 0; }
      if (!p.ortPendingLost) continue;
      p.ortLostTier = p.ortPendingLost;
      p.ortLostUntil = engine.roundNumber + LOST_TURNS - 1;
      p.ortPendingLost = null;
      if (p.alive) {
        erased++;
        engine.log(`📡 ${TIER_NAME[p.ortLostTier]} ของ ${p.name} ข้อมูลสูญหาย — ใช้ไม่ได้ ${LOST_TURNS} เทิร์น`);
      }
    }
    if (erased) engine.ortFx("lost");
  },

  // ---------- สกิลติดตัว 2: สวนกลับ ----------
  // เรียกเมื่อผู้เล่นจริงทำดาเมจสกิลใส่ / เล็งสกิลใส่ / ยิงปืนใส่ ORT
  queueCounter(engine, sourceId) {
    if (flushing) return; // ดาเมจสะท้อนระหว่างสวนกลับ ห้ามจองต่อ (กันสวนกันไปมาไม่รู้จบ)
    const boss = bossOf(engine);
    const src = engine.players[sourceId];
    if (!boss || !src || isOrt(src) || !src.alive) return;
    counterQueue.add(src.id);
  },
  // ฮุคดาเมจขาเข้า — ดาเมจที่ไม่ใช่โจมตีปกติจากผู้เล่นจริง = ถูกสกิล/ปืนทำดาเมจ
  adjustIncomingDamage(engine, p, n, isNormalAttack) {
    if (isOrt(p) && !isNormalAttack && n > 0 && engine.effectSourceId && engine.effectSourceId !== p.id) {
      this.queueCounter(engine, engine.effectSourceId);
    }
    return n;
  },
  flushCounters(engine) {
    if (flushing || !counterQueue.size) return 0;
    const boss = bossOf(engine);
    const ids = [...counterQueue];
    counterQueue.clear();
    if (!boss) return 0;
    flushing = true;
    let fired = 0;
    try {
      for (const id of ids) {
        const t = engine.players[id];
        if (!t || !t.alive || !boss.alive) continue;
        const crit = Math.random() < CRIT_CHANCE;
        const dmg = (boss.ortAtk || ATK_BASE) * (crit ? 2 : 1);
        engine.withEffectSource(boss, () => {
          engine.dealMixed(t, dmg);
          t.wasAttacked = true;
          engine.resolveDamageAftermath(t);
        });
        fired++;
        // ป้ายเด้งบนกระดานทุกครั้งที่สวน — สวนหลายคนติดกันจะได้เห็นครบทุกคน (ท่าบนตัวบอสเล่นทับกันจนดูเหมือนครั้งเดียว)
        engine.skillFlash({ name: `สวนกลับ ${t.name} -${dmg}${crit ? " คริติคอล" : ""}`, img: IMG.base, by: boss.name, color: engine.colorOf(boss) });
        engine.log(`⚡ ${boss.name} สวนกลับ ${t.name} -${dmg}${crit ? " (คริติคอล)" : ""}${t.alive ? "" : " — ตกรอบ!"}`);
      }
    } finally { flushing = false; }
    if (fired) engine.ortFx("counter");
    return fired;
  },

  // ---------- สกิลติดตัว 3: การวิวัฒนาการ ----------
  // เรียกจาก instantDeath() หลังผู้เล่นตายจริง — ตัดสินผู้สังหารจาก effectSourceId
  //  ผู้เล่นที่ ORT ตีจนเลือดหมดส่วนใหญ่ "ตาย" ตอนกวาดท้ายเทิร์น (ไม่มี effectSourceId แล้ว) —
  //  จึงดูผู้ทำดาเมจล่าสุดในเทิร์นเดียวกันด้วย (server.js บันทึกไว้ที่ adjustIncomingDamage)
  onKill(engine, victim) {
    const lastHit = victim.lastDamageRound === engine.roundNumber ? engine.players[victim.lastDamageSourceId] : null;
    const killer = engine.players[engine.effectSourceId] || lastHit;
    if (!isOrt(killer) || isOrt(victim) || !killer.alive) return;
    killer.ortKills = (killer.ortKills || 0) + 1;
    killer.ortBars = (killer.ortBars || 1) + 1;
    const atkUp = (killer.ortAtk || ATK_BASE) < ATK_MAX;
    if (atkUp) killer.ortAtk = (killer.ortAtk || ATK_BASE) + 1;
    engine.log(`🧬 ${killer.name} วิวัฒนาการ — หลอดเลือด +1 (รวม ${killer.ortBars})${atkUp ? ` · พลังโจมตี +1 (รวม ${killer.ortAtk})` : " · พลังโจมตีเต็มแล้ว"}`);
    engine.ortFx("evolve");
  },

  // เทิร์นที่เหลือของช่องที่ถูกลบ (0 = ไม่มี) — ส่งให้เจ้าของคนเดียว
  lostTurnsLeft(engine, p) {
    if (!this.skillErased(engine, p, p.ortLostTier)) return 0;
    return (p.ortLostUntil || 0) - engine.roundNumber + 1;
  },

  // ข้อมูลที่ client ใช้วาดบอส (ส่งทุกคนเหมือนกัน)
  publicState(p) {
    return { bars: p.ortBars || 1, atk: p.ortAtk || ATK_BASE, atkMax: ATK_MAX, kills: p.ortKills || 0 };
  },
};
