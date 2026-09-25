// ============================================================
//  Recruit (ยาก) — มือปืนที่ทุกนัดต้องเล็งเอง (QTE คลิกจุดบนจอ)
//
//  ค่าสถานะ: พลังชีวิต 5 · เกราะ 2 · แต้มสกิล 0/8 · กระสุน 6/6 (p.recruit.bullets)
//  [Armor]: การโจมตีปกติที่เข้ามาขณะยังมีเกราะ = กันทั้งหมัด (ไม่เสียอะไรเลย) แต่ถูกโจมตีครบทุก 2 ครั้ง เกราะ -1
//           ความเสียหายจากสกิลกินเกราะตามปกติ · เกราะไม่ฟื้นเองตามจังหวะของสนาม (blocksArmorRegen)
//
//  สกิลติดตัว มือปืนต้องมีมาตรฐาน
//    - ชนะแล้วโจมตีปกติ = QTE จุดแดง 7 จุด 7 วินาที (คลิกโดน >= 6 = สำเร็จ)
//        สำเร็จ: ความเสียหาย 1 · กระสุน -1 · 30% ได้โจมตีอีกครั้ง (QTE ใหม่)
//        ไม่สำเร็จ: ความเสียหาย 0 · กระสุน -2
//      กระสุนหมด = ยิงไม่ได้ (จบเฟสโจมตีทันที)
//    - โจมตีปกติและสกิล: HeadShot 25% ความเสียหาย +1 (โรลต่อเป้าหมาย)
//    - สกิลที่ใช้กระสุน ยิงโดนแล้วมอบ "เลือดไหล" 2 หน่วย
//  สกิลพิเศษ เตรียมตัว (1 แต้ม · ปุ่มแยก ไม่กินโควตาสกิลของเทิร์น)
//    Bandage (3 ครั้ง/เกม): ฟื้นพลังชีวิต 2 + ล้างสถานะผิดปกติ แล้วติด "ห้ามจั่ว" 1 เทิร์น
//    Reload: กระสุนเต็ม 6 แล้วติด "ห้ามใช้สกิล" 1 เทิร์น · Armor (2 ครั้ง/เกม): เกราะ +1 แล้วติด "ห้ามใช้สกิล" 1 เทิร์น
//  สกิลพื้นฐาน Desert Eagle (4 + กระสุน 3 · คูลดาวน์ 2) — เลือกเป้าก่อน แล้ว QTE จุดแดง 8 จุด 7 วินาที (>= 7)
//    สำเร็จ: เจาะเกราะ 2 · 30% ได้ยิงซ้ำอีกนัดทันที (เลือกเป้าใหม่ได้) · ไม่สำเร็จ: วีดีโอ Fail_1 แล้วเสียพลังชีวิต 2
//  สกิลรอง FAMAS (4 + กระสุน 6 · คูลดาวน์ 3) — QTE จุดวิ่ง 7 วินาที (คลิกโดน 1 ครั้ง)
//    สำเร็จ: เลือก 2 คน คนละ 3 (ลดเกราะก่อน · มีคู่ต่อสู้ 2 คนขึ้นไปห้ามเลือกซ้ำ) · ไม่สำเร็จ: เสียพลังชีวิต 2
//  ท่าไม้ตาย Barrett M82A1 (6 + กระสุน 6 · คูลดาวน์ 3) — เลือกเป้าก่อน แล้ว QTE จุดวิ่ง
//    สำเร็จ: วีดีโอ (เต็มครั้งแรกครั้งเดียว) แล้วเจาะเกราะ 4 + สตั้นทันที 1 เทิร์น
//    ไม่สำเร็จ: เสียพลังชีวิต 2 + สตั้นตัวเองทันที 2 เทิร์น
//  "เสียพลังชีวิต 2" = ทะลุเกราะ ตายได้ · "สตั้นทันที" = ล็อกมือ (เปิดไพ่) ในเทิร์นที่โดนเลย
//
//  QTE ของ Recruit เป็นระบบแยกจาก QTE กลาง (p.qte = กดปุ่ม w/a/s/d) — เก็บที่ p.recruit.qte
//  ไม่มี setTimeout ฝั่ง server: เก็บเส้นตายเป็น ms แล้วตัดสินตอนคำตอบมาถึง (แพทเทิร์นเดียวกับโจทย์ของอุซากิ)
//  นาฬิกาหยุดเมื่อเกมไม่ได้อยู่ในเฟสของ QTE นั้น (คัตซีนคั่น) · เฟสโจมตีมีตัวจับเวลาของ server เป็นตาข่ายกันค้าง
// ============================================================

const ID = "recruit";
const DIR = "/characters/Recruit";

const RECRUIT_MAX_HP = 5;
const RECRUIT_MAX_ARMOR = 2;
const BULLET_MAX = 6;
const ARMOR_HITS_PER_UNIT = 2;
const HEADSHOT_CHANCE = 0.25;
const BLEED_TURNS = 2;
const QTE_MS = 7000;
const QTE_GRACE_MS = 400;
const SELF_DMG = 2;

// mode -> รูปแบบ QTE
const QTE = {
  attack: { kind: "dots", total: 7, need: 6 },
  basic: { kind: "dots", total: 8, need: 7 },
  secondary: { kind: "chase", total: 1, need: 1 },
  ultimate: { kind: "chase", total: 1, need: 1 },
};
const ATTACK_BULLETS = { hit: 1, miss: 2 };
const SKILL_BULLETS = { basic: 3, secondary: 6, ultimate: 6 };
const COOLDOWN = { basic: 2, secondary: 3, ultimate: 3 };
const EXTRA_ATTACK_CHANCE = 0.30;
const DE_BONUS_CHANCE = 0.30;
const DE_DMG = 2;
const FAMAS_DMG = 3;
const FAMAS_TARGETS = 2;
const BARRETT_DMG = 4;
const BARRETT_STUN = 1;
const BARRETT_SELF_STUN = 2;

const PREP_COST = 1;
const PREP = {
  bandage: { name: "Bandage", uses: 3 },
  reload: { name: "Reload", uses: null },
  armor: { name: "Armor", uses: 2 },
};
const BANDAGE_HEAL = 2;

const IMG = {
  base: `${DIR}/PFP.png`,
  skill1: `${DIR}/สกิลพื้นฐาน/สกิลพื้นฐาน.webp`,
  skill2: `${DIR}/สกิลรอง/สกิลรอง.jpg`,
  skill3: `${DIR}/สกิลอันติเมต/สกิลอันติเมต.jpg`,
  bandage: `${DIR}/สกิลพิเศษ/รักษา.webp`,
  reload: `${DIR}/สกิลพิเศษ/รีโหลด.png`,
  armor: `${DIR}/สกิลพิเศษ/เกราะ.webp`,
};
const VIDEO = { fail: `${DIR}/สกิลพื้นฐาน/Fail_1.mov`, ult: `${DIR}/สกิลอันติเมต/สกิลอัลติเมติ.mp4` };
// คีย์เสียงฝั่ง client (client/src/audio.js)
const SFX = {
  attack: "recruit_attack", basic: "recruit_basic", secondary: "recruit_secondary", ultimate: "recruit_ult",
  bandage: "recruit_bandage", reload: "recruit_reload", armor: "recruit_armor",
};

const isRecruit = (p) => !!p && p.characterId === ID && !!p.recruit;
const roll = (chance) => Math.random() < chance;
// id ของจุด: ลำดับ + สุ่ม — ลำดับกันซ้ำในชุดเดียวกัน (ต่อให้สุ่มชนกัน) · ส่วนสุ่มกันเดาข้ามรอบ
const newId = (i) => `${i}-${Math.random().toString(36).slice(2, 8)}`;

function freshState() {
  return {
    bullets: BULLET_MAX,
    prepUses: { bandage: PREP.bandage.uses, armor: PREP.armor.uses },
    armorHits: 0,       // การโจมตีปกติที่เกราะรับไว้ (ครบ 2 = เกราะ -1)
    cd: {},             // คูลดาวน์รายช่อง = เลขรอบสุดท้ายที่ยังติด
    qte: null,          // QTE ที่กำลังเล่น (ดู startQte)
    pick: null,         // รอเลือกเป้าหลัง QTE สำเร็จ { mode, need, dmg, pierce }
    shot: false,        // QTE ของโจมตีปกติผ่านแล้ว — doAttack รอบนี้คือการยิงจริง
    headshot: false,    // หมัดที่กำลังจะออกติด HeadShot (โรลตอน QTE ผ่าน — ห้ามโรลใน damageBonus)
    extraAtk: false,    // 30% ได้โจมตีอีกครั้ง
  };
}

module.exports = {
  id: ID,
  IMG, VIDEO, SFX, QTE, PREP,
  MAX_HP: RECRUIT_MAX_HP, MAX_ARMOR: RECRUIT_MAX_ARMOR, BULLET_MAX, QTE_MS, SKILL_BULLETS, COOLDOWN,
  HEADSHOT_CHANCE, EXTRA_ATTACK_CHANCE, DE_BONUS_CHANCE,

  maxHp() { return RECRUIT_MAX_HP; },
  maxArmor() { return RECRUIT_MAX_ARMOR; },
  blocksArmorRegen(p) { return isRecruit(p); },
  attackSound(p) { return isRecruit(p) ? SFX.attack : undefined; },

  resetCombat(p) {
    p.recruit = p.characterId === ID ? freshState() : null;
  },

  // ---------- คูลดาวน์ (เลขรอบ — นับตั้งแต่เทิร์นถัดไป) ----------
  cooldownLeft(engine, p, tier) {
    if (!isRecruit(p)) return 0;
    return Math.max(0, (p.recruit.cd[tier] || 0) - engine.roundNumber + 1);
  },

  // ---------- [Armor]: การโจมตีปกติชนเกราะ = กันทั้งหมัด · ครบ 2 ครั้งเกราะ -1 ----------
  adjustIncomingDamage(engine, p, n, isNormalAttack) {
    if (!isRecruit(p) || !isNormalAttack || !(p.armor > 0)) return n;
    p.recruit.armorHits++;
    if (p.recruit.armorHits >= ARMOR_HITS_PER_UNIT) {
      p.recruit.armorHits = 0;
      engine.loseArmor(p);
      engine.log(`🛡️ ${p.name} [Armor] รับการโจมตีครบ ${ARMOR_HITS_PER_UNIT} ครั้ง — เกราะ -1 (เหลือ ${p.armor})`);
    } else {
      engine.log(`🛡️ ${p.name} [Armor] กันการโจมตีไว้ทั้งหมัด (${p.recruit.armorHits}/${ARMOR_HITS_PER_UNIT})`);
    }
    return 0;
  },

  // ---------- QTE ----------
  startQte(engine, p, mode, targetId) {
    const cfg = QTE[mode];
    // จุดแดงสุ่มตำแหน่งบนจอ (เปอร์เซ็นต์ของพื้นที่ QTE) — จุดวิ่งให้ client สุ่มเส้นทางเอง
    const dots = Array.from({ length: cfg.total }, (_, i) => ({ id: newId(i), x: 8 + Math.random() * 84, y: 14 + Math.random() * 72 }));
    p.recruit.qte = { mode, kind: cfg.kind, total: cfg.total, need: cfg.need, dots, hits: [], targetId: targetId || null,
      deadline: Date.now() + QTE_MS, leftMs: QTE_MS, paused: false };
    return p.recruit.qte;
  },
  qteActive(p) { return isRecruit(p) && !!p.recruit.qte; },
  // เฟสที่ QTE นั้นเดินได้ — ออกนอกเฟสนั้น (คัตซีนคั่น) นาฬิกาหยุด
  syncPause(engine) {
    for (const p of Object.values(engine.players)) {
      const qz = isRecruit(p) && p.recruit.qte;
      if (!qz) continue;
      const running = engine.gameState === (qz.mode === "attack" ? "ATTACK" : "PLAYING");
      if (!running && !qz.paused) { qz.paused = true; qz.leftMs = Math.max(0, qz.deadline - Date.now()); }
      else if (running && qz.paused) { qz.paused = false; qz.deadline = Date.now() + qz.leftMs; }
    }
  },
  // คลิกโดนจุด — คืน true ถ้าเล่นครบแล้ว (ผู้เรียกต้อง finish ต่อ)
  hitDot(engine, p, dotId) {
    const qz = isRecruit(p) && p.recruit.qte;
    if (!qz || qz.paused || Date.now() > qz.deadline + QTE_GRACE_MS) return false;
    if (!qz.dots.some((d) => d.id === dotId) || qz.hits.includes(dotId)) return false;
    qz.hits.push(dotId);
    return qz.hits.length >= qz.total || (qz.kind === "chase" && qz.hits.length >= qz.need);
  },
  // client แจ้งหมดเวลา — เชื่อเฉพาะเมื่อเลยเส้นตายจริง (ไม่งั้นเล่นจบก่อนเวลาเพื่อหนีไม่ได้ก็ไม่เสียอะไร แต่กันไว้ให้ตรงสเปค)
  timeUp(p) {
    const qz = isRecruit(p) && p.recruit.qte;
    return !!qz && !qz.paused && Date.now() >= qz.deadline - 300;
  },
  // ปิด QTE แล้วคืนผล { mode, ok, hits, total, need, targetId }
  takeQte(p) {
    const qz = isRecruit(p) && p.recruit.qte;
    if (!qz) return null;
    p.recruit.qte = null;
    return { mode: qz.mode, ok: qz.hits.length >= qz.need, hits: qz.hits.length, total: qz.total, need: qz.need, targetId: qz.targetId };
  },

  // ---------- โจมตีปกติ ----------
  hasBullets(p) { return isRecruit(p) && p.recruit.bullets > 0; },
  // QTE ของโจมตีปกติจบ: หักกระสุน + โรล HeadShot/โจมตีอีกครั้ง (ผลสำเร็จจะยิงจริงผ่าน doAttack ต่อ)
  settleAttack(engine, p, res) {
    const r = p.recruit;
    const spend = res.ok ? ATTACK_BULLETS.hit : ATTACK_BULLETS.miss;
    r.bullets = Math.max(0, r.bullets - spend);
    if (!res.ok) {
      engine.log(`🔫 ${p.name} เล็งพลาด (QTE ${res.hits}/${res.total}) — ไม่โดนเป้า · กระสุน -${spend} (เหลือ ${r.bullets})`);
      return;
    }
    r.shot = true;
    r.headshot = roll(HEADSHOT_CHANCE);
    r.extraAtk = roll(EXTRA_ATTACK_CHANCE);
    engine.log(`🔫 ${p.name} เล็งติด (QTE ${res.hits}/${res.total}) · กระสุน -${spend} (เหลือ ${r.bullets})${r.headshot ? " — HeadShot!" : ""}${r.extraAtk ? " · ได้โจมตีอีกครั้ง" : ""}`);
  },
  // doAttack รอบที่ยิงจริง: ใช้ธงแล้วหมด
  consumeShot(p) {
    if (!isRecruit(p) || !p.recruit.shot) return false;
    p.recruit.shot = false;
    return true;
  },
  // พลังโจมตีพื้นฐาน 1 เสมอ + HeadShot (อ่านธงที่โรลไว้แล้ว — computeAttackBase ถูกเรียกจาก buildStateFor ด้วย ห้ามสุ่มตรงนี้)
  damageBonus(engine, attacker) {
    return isRecruit(attacker) && attacker.recruit.headshot ? 1 : 0;
  },
  consumeHeadshot(p) {
    if (!isRecruit(p) || !p.recruit.headshot) return false;
    p.recruit.headshot = false;
    return true;
  },
  // เปิดเฟสโจมตีอีกครั้ง (30%) — เรียกจาก postAttackFollowup · คืน true = เปิดเฟสแล้ว
  startExtraAttack(engine, attacker) {
    if (!isRecruit(attacker) || !attacker.alive || !attacker.recruit.extraAtk) return false;
    attacker.recruit.extraAtk = false;
    if (!attacker.recruit.bullets) { engine.log(`🔫 ${attacker.name} ได้โจมตีอีกครั้ง แต่กระสุนหมด`); return false; }
    const targets = engine.attackableTargets(attacker.id);
    if (!targets.length) return false;
    engine.log(`🔫 ${attacker.name} ได้โจมตีอีกครั้ง!`);
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

  // ---------- สกิล ----------
  validTarget(engine, p, t) {
    return !!t && t.alive && t.id !== p.id && !engine.sameTeam(p, t) && !engine.sealActive(t);
  },
  canUseSkill(engine, p, tier, targets) {
    if (!isRecruit(p)) return true;
    const r = p.recruit;
    if (r.qte || r.pick) return false; // ยังเล่น QTE / ยังเลือกเป้าไม่เสร็จ
    if (this.cooldownLeft(engine, p, tier) > 0) return false;
    if (r.bullets < SKILL_BULLETS[tier]) return false;
    if (tier === "basic" || tier === "ultimate") {
      const t = engine.players[Array.isArray(targets) ? targets[0] : null];
      if (!this.validTarget(engine, p, t)) return false;
    }
    return true;
  },
  applyInstantSkill(engine, p, tier, targets) {
    if (!isRecruit(p)) return "";
    const r = p.recruit;
    r.bullets -= SKILL_BULLETS[tier];
    r.cd[tier] = engine.roundNumber + COOLDOWN[tier];
    const targetId = tier === "secondary" ? null : targets[0];
    this.startQte(engine, p, tier, targetId);
    const t = targetId ? engine.players[targetId] : null;
    engine.log(`🎯 ${p.name} ${tier === "basic" ? "Desert Eagle" : tier === "secondary" ? "FAMAS" : "Barrett M82A1"} — เล็ง${t ? ` ${t.name}` : ""}! (กระสุน -${SKILL_BULLETS[tier]} เหลือ ${r.bullets})`);
    return t ? ` → ${t.name}` : "";
  },

  // ยิงโดน 1 เป้า: HeadShot 25% (+1) · เลือดไหล 2
  shoot(engine, p, t, base, pierce, label) {
    if (!t || !t.alive) return null;
    const hs = roll(HEADSHOT_CHANCE);
    const n = base + (hs ? 1 : 0);
    if (pierce) engine.dealDirect(t, n); else engine.dealMixed(t, n);
    t.wasAttacked = true;
    const bled = engine.applyBleed(t, BLEED_TURNS);
    engine.log(`🔫 ${p.name} ${label} ยิง ${t.name} -${n}${pierce ? " (เจาะเกราะ)" : ""}${hs ? " — HeadShot!" : ""}${bled > 0 ? ` · เลือดไหล ${bled}` : ""}`);
    engine.resolveDamageAftermath(t);
    if (!t.alive) engine.log(`💀 ${t.name} ตกรอบ!`);
    return { n, hs };
  },
  selfHurt(engine, p) {
    engine.dealDirect(p, SELF_DMG);
    engine.log(`🩸 ${p.name} ปืนดีดกลับ — เสียพลังชีวิต ${SELF_DMG}`);
    engine.resolveDamageAftermath(p);
    if (!p.alive) engine.log(`💀 ${p.name} ตกรอบ!`);
  },
  stunNow(p, turns) {
    p.statuses.stun = Math.max(p.statuses.stun || 0, turns);
    p.locked = true; // สตั้นทันที = ทำอะไรต่อไม่ได้ในเทิร์นนี้ (ไพ่ที่มีอยู่ถูกเปิด)
  },

  // QTE ของสกิลจบ — คืน { after } = งานที่ต้องทำ "หลังวีดีโอ" (ผู้เรียกจัดคิวเล่นก่อนถ้ามีคลิปในคิว)
  resolveSkill(engine, p, res) {
    const t = res.targetId ? engine.players[res.targetId] : null;
    const flash = (name, img, sound) => engine.skillFlash({ name, img, by: p.name, color: engine.colorOf(p), sound });
    if (res.mode === "basic") {
      if (!res.ok) {
        engine.log(`🎯 ${p.name} Desert Eagle พลาด (QTE ${res.hits}/${res.total})`);
        engine.queueCutscene(p, "recruitFail");
        return { after: () => this.selfHurt(engine, p) };
      }
      flash(`Desert Eagle — ยิงโดน (${res.hits}/${res.total})`, IMG.skill1, SFX.basic);
      return {
        after: () => {
          if (this.shoot(engine, p, t, DE_DMG, true, "Desert Eagle") && roll(DE_BONUS_CHANCE)) {
            p.recruit.pick = { mode: "bonus", need: 1, dmg: DE_DMG, pierce: true, label: "Desert Eagle (นัดที่ 2)" };
            engine.log(`🎯 ${p.name} Desert Eagle — ได้ยิงอีกนัด! เลือกเป้าหมาย`);
          }
        },
      };
    }
    if (res.mode === "secondary") {
      if (!res.ok) {
        engine.log(`🎯 ${p.name} FAMAS พลาด (QTE ไม่โดนเป้า)`);
        return { after: () => this.selfHurt(engine, p) };
      }
      flash("FAMAS — ล็อกเป้าได้ เลือก 2 คน", IMG.skill2, SFX.secondary);
      p.recruit.pick = { mode: "famas", need: FAMAS_TARGETS, dmg: FAMAS_DMG, pierce: false, label: "FAMAS" };
      engine.log(`🎯 ${p.name} FAMAS — ล็อกเป้าได้! เลือกเป้าหมาย ${FAMAS_TARGETS} คน คนละ ${FAMAS_DMG}`);
      return {};
    }
    if (res.mode === "ultimate") {
      if (!res.ok) {
        engine.log(`🎯 ${p.name} Barrett M82A1 พลาด (QTE ไม่โดนเป้า)`);
        return {
          after: () => {
            this.selfHurt(engine, p);
            if (p.alive) { this.stunNow(p, BARRETT_SELF_STUN); engine.log(`😵 ${p.name} แรงสะท้อนของ Barrett — สตั้น ${BARRETT_SELF_STUN} เทิร์น`); }
          },
        };
      }
      engine.triggerCutscene(p, "recruitUlt"); // วีดีโอเต็มครั้งแรกครั้งเดียว
      return {
        after: () => {
          flash("Barrett M82A1 — ยิงโดน!", IMG.skill3, SFX.ultimate);
          const hit = this.shoot(engine, p, t, BARRETT_DMG, true, "Barrett M82A1");
          if (hit && t.alive) {
            if (engine.applyDebuff(t, "stun", null, BARRETT_STUN)) { t.locked = true; engine.log(`😵 ${t.name} โดน Barrett — สตั้น ${BARRETT_STUN} เทิร์น`); }
            else engine.log(`🛡️ ${t.name} ต้านสถานะผิดปกติ — ไม่ติดสตั้น`);
          }
        },
      };
    }
    return {};
  },

  // ---------- เลือกเป้าหลัง QTE สำเร็จ (Desert Eagle นัดที่ 2 / FAMAS) ----------
  pickOptions(engine, p) {
    return engine.alivePlayers().filter((t) => this.validTarget(engine, p, t));
  },
  // คืน true = ลงผลแล้ว
  applyPick(engine, p, targetIds) {
    const pick = isRecruit(p) && p.recruit.pick;
    if (!pick || !Array.isArray(targetIds)) return false;
    const options = this.pickOptions(engine, p);
    const ids = targetIds.slice(0, pick.need);
    if (ids.length !== pick.need || !ids.every((id) => options.some((o) => o.id === id))) return false;
    // "มีผู้เล่นมากกว่า 2 ห้ามเลือกซ้ำ" — คู่ต่อสู้ที่เลือกได้มีคนเดียวถึงจะยิงซ้ำคนเดิมได้
    if (options.length >= pick.need && new Set(ids).size !== ids.length) return false;
    p.recruit.pick = null;
    for (const id of ids) this.shoot(engine, p, engine.players[id], pick.dmg, pick.pierce, pick.label);
    return true;
  },
  // เปิดไพ่แล้วยังไม่เลือก = สุ่มให้ (ไม่ทิ้งนัดที่ได้มา)
  sweepPick(engine) {
    for (const p of engine.alivePlayers()) {
      const pick = isRecruit(p) && p.recruit.pick;
      if (!pick) continue;
      const pool = this.pickOptions(engine, p);
      if (!pool.length) { p.recruit.pick = null; continue; }
      const ids = [];
      const bag = [...pool];
      for (let i = 0; i < pick.need; i++) {
        if (!bag.length) bag.push(...pool); // คู่ต่อสู้ไม่พอ = ยิงซ้ำได้
        ids.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0].id);
      }
      engine.log(`🎯 ${p.name} ไม่ได้เลือกเป้า — ${pick.label} เลือกเป้าให้เอง`);
      engine.withEffectSource(p, () => this.applyPick(engine, p, ids));
    }
  },
  pickPending(engine) {
    return engine.alivePlayers().some((p) => isRecruit(p) && (p.recruit.pick || p.recruit.qte));
  },

  // ---------- สกิลพิเศษ เตรียมตัว ----------
  canPrep(engine, p, kind) {
    if (!isRecruit(p) || !PREP[kind]) return false;
    if (p.recruit.qte || p.recruit.pick) return false;
    if ((p.skillPoints || 0) < PREP_COST) return false;
    if (PREP[kind].uses != null && !(p.recruit.prepUses[kind] > 0)) return false;
    return true;
  },
  applyPrep(engine, p, kind) {
    const r = p.recruit;
    if (PREP[kind].uses != null) r.prepUses[kind]--;
    if (kind === "bandage") {
      const healed = engine.healHp(p, BANDAGE_HEAL);
      const purged = engine.cleanseDebuffs(p);
      p.statuses.nodraw = Math.max(p.statuses.nodraw || 0, 1);
      engine.log(`🩹 ${p.name} Bandage — ฟื้นพลังชีวิต +${healed}${purged ? ` · ล้างสถานะผิดปกติ ${purged} อย่าง` : ""} · ห้ามจั่ว 1 เทิร์น (เหลือ ${r.prepUses.bandage} ครั้ง)`);
      return ` — พลังชีวิต +${healed}`;
    }
    if (kind === "reload") {
      r.bullets = BULLET_MAX;
      p.statuses.noskill = Math.max(p.statuses.noskill || 0, 1);
      engine.log(`🔄 ${p.name} Reload — กระสุนเต็ม ${BULLET_MAX}/${BULLET_MAX} · ห้ามใช้สกิล 1 เทิร์น`);
      return ` — กระสุน ${BULLET_MAX}/${BULLET_MAX}`;
    }
    const got = engine.healArmor(p, 1);
    p.statuses.noskill = Math.max(p.statuses.noskill || 0, 1);
    engine.log(`🛡️ ${p.name} Armor — เกราะ +${got} · ห้ามใช้สกิล 1 เทิร์น (เหลือ ${r.prepUses.armor} ครั้ง)`);
    return ` — เกราะ +${got}`;
  },

  onRoundStartTick(engine, p) {
    if (!isRecruit(p)) return;
    p.recruit.extraAtk = false;
    p.recruit.shot = false;
    p.recruit.headshot = false;
  },

  // ---------- ข้อมูลให้ client ----------
  publicState(p) {
    if (!isRecruit(p)) return undefined;
    const r = p.recruit;
    return { bullets: r.bullets, bulletMax: BULLET_MAX, armorHits: r.armorHits, bandage: r.prepUses.bandage, armorUses: r.prepUses.armor, aiming: !!r.qte };
  },
  privateState(engine, p) {
    if (!isRecruit(p)) return {};
    const r = p.recruit;
    const qz = r.qte;
    return {
      recruitCd: { basic: this.cooldownLeft(engine, p, "basic"), secondary: this.cooldownLeft(engine, p, "secondary"), ultimate: this.cooldownLeft(engine, p, "ultimate") },
      recruitQte: qz ? {
        mode: qz.mode, kind: qz.kind, total: qz.total, need: qz.need, hits: qz.hits,
        dots: qz.dots, paused: qz.paused, perMs: QTE_MS,
        leftMs: qz.paused ? qz.leftMs : Math.max(0, qz.deadline - Date.now()),
      } : null,
      recruitPick: r.pick ? {
        mode: r.pick.mode, need: r.pick.need, label: r.pick.label,
        allowRepeat: this.pickOptions(engine, p).length < r.pick.need,
      } : null,
    };
  },
};
