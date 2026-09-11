// ============================================================
//  ไดจิ โอโซระ (ง่าย)
//  การ์ดไซเบอร์ / ไพ่ตายของฉัน / มาUNITEกัน + สกิลติดตัว "ข้อมูลจำลอง"
//
//  การ์ดไซเบอร์ (p.daichiCard) = การ์ดที่ถืออยู่ตอนนี้ (โกโมร่า/เอเลคิง/เบมสตาร์) — สุ่มใหม่ทุกครั้งที่กดสกิลพื้นฐาน
//  เกราะ (p.daichiArmor) = เกราะที่สวมอยู่จริง — เปลี่ยนเฉพาะตอนกด "ไพ่ตายของฉัน" (สลับการ์ดไม่ทำให้เกราะเปลี่ยน)
//  เกราะทำงานได้เฉพาะระหว่าง "unite" (ท่าไม้ตาย) — unite หมดเวลา เกราะหลุดไปด้วย
//
//  ⚠️ วีดีโอทั้ง 4 คลิป (unite + เกราะ 3 แบบ) เล่นอย่างละ 1 ครั้งต่อเกมผ่าน engine.triggerCutscene
// ============================================================

const ID = "daichi";
const BASE = "/characters/daichi";

const IMG = {
  base: `${BASE}/daichi.webp`,
  unite: `${BASE}/ultraman_x.webp`,
  skill3: `${BASE}/skill3/daichi_skill3.jpg`,
};
const UNITE_VIDEO = `${BASE}/skill3/daiji_skill3.mp4`;

// ---------- การ์ดไซเบอร์ 3 ใบ + เกราะคู่กัน ----------
const CARDS = {
  gomora: {
    key: "gomora", name: "โกโมร่า", armorName: "เกราะโกโมร่า",
    cardImg: `${BASE}/skill1/daichi_skill1_G.webp`, skillImg: `${BASE}/skill2/daichi_skill2_G.jpg`,
    armorImg: `${BASE}/armor/GomoraArmor.jpg`, video: `${BASE}/armor/gomora_armor.mp4`, cut: "daichiGomora",
    effect: "การโจมตีปกติมีโอกาส 50% ได้โจมตีเพิ่มอีก 1 ครั้ง",
  },
  eleking: {
    key: "eleking", name: "เอเลคิง", armorName: "เกราะเอเลคิง",
    cardImg: `${BASE}/skill1/daichi_skill1_E.webp`, skillImg: `${BASE}/skill2/daichi_skill2_E.jpg`,
    armorImg: `${BASE}/armor/ElekingArmor.jpg`, video: `${BASE}/armor/elec_armor.mp4`, cut: "daichiEleking",
    effect: "การโจมตีปกติมีโอกาส 30% ทำให้เป้าหมายติดสตั้น 1 เทิร์นในเทิร์นถัดไป (ต้านทานได้)",
  },
  bemstar: {
    key: "bemstar", name: "เบมสตาร์", armorName: "เกราะเบมสตาร์",
    cardImg: `${BASE}/skill1/daichi_skill1_B.webp`, skillImg: `${BASE}/skill2/daichi_skill2_B.jpg`,
    armorImg: `${BASE}/armor/BemstarArmor.jpg`, video: `${BASE}/armor/bemstar_armor.mp4`, cut: "daichiBemstar",
    effect: "ความเสียหายที่ได้รับ ฟื้นกลับเป็นพลังชีวิตในเทิร์นถัดไป (สูงสุด 3 หน่วย)",
  },
};
const CARD_KEYS = ["gomora", "eleking", "bemstar"];
const DEFAULT_CARD = "gomora";

// ---------- สกิลพื้นฐาน การ์ดไซเบอร์ ----------
const BASIC_USES = 2;  // กดได้ 2 ครั้งต่อเทิร์น — ไม่นับเป็นการใช้สกิลของเทิร์น
const BASIC_HEAL = 1;

// ---------- เกราะ ----------
const GOMORA_EXTRA_CHANCE = 0.5;
const ELEKING_STUN_CHANCE = 0.3;
const ELEKING_STUN_TURNS = 1;
const BEMSTAR_HEAL_CAP = 3;

// ---------- ท่าไม้ตาย มาUNITEกัน ----------
const UNITE_TURNS = 5;
const UNITE_ATK = 1;
const MUSIC = "daichi_theme";

function isDaichi(p) { return !!p && p.characterId === ID; }
function uniteOn(p) { return isDaichi(p) && ((p.statuses && p.statuses.daichiUnite) || 0) > 0; }
function cardOf(p) { return CARDS[(p && p.daichiCard) || DEFAULT_CARD] || CARDS[DEFAULT_CARD]; }
function armorOf(p) { return uniteOn(p) && p.daichiArmor ? CARDS[p.daichiArmor] || null : null; }
function damageTotal(p) { return (p.dmgHp || 0) + (p.dmgArmor || 0); }

module.exports = {
  id: ID,
  IMG,
  UNITE_VIDEO,
  CARDS,
  CARD_KEYS,
  DEFAULT_CARD,
  BASIC_USES,
  BASIC_HEAL,
  GOMORA_EXTRA_CHANCE,
  ELEKING_STUN_CHANCE,
  ELEKING_STUN_TURNS,
  BEMSTAR_HEAL_CAP,
  UNITE_TURNS,
  UNITE_ATK,
  uniteOn,
  armorOf,
  cardOf,

  // ---------- ฟิลด์เฉพาะตัวละคร: ต้องล้างทุกแมตช์ใหม่ (เรียกจาก resetCombat ของ server.js) ----------
  resetCombat(p) {
    p.daichiCard = DEFAULT_CARD; // การ์ดไซเบอร์ที่ถืออยู่
    p.daichiArmor = null;        // เกราะที่สวมอยู่ (ทำงานเฉพาะระหว่าง unite)
    p.daichiBasicUses = 0;       // การ์ดไซเบอร์ กดไปแล้วกี่ครั้งในเทิร์นนี้
    p.daichiCutRound = 0;        // มาUNITEกัน: ตัดการ์ดที่ทำให้แตกไปแล้วในรอบไหน (1 ครั้ง/เทิร์น)
    p.daichiSimRound = 0;        // ข้อมูลจำลอง: ล้างการ์ดไปแล้วในรอบไหน (1 ครั้ง/เทิร์น)
    p.daichiStored = [];         // การ์ดที่ถูกตัดไว้ รอบวกเพิ่มในเทิร์นหน้า
    p.daichiExtraPending = false; // เกราะโกโมร่า: สุ่มผ่านแล้ว รอเปิดเฟสโจมตีเพิ่ม
    p.daichiInExtra = false;     // กำลังโจมตีครั้งเพิ่มอยู่ (ครั้งเพิ่มไม่สุ่มต่อ)
    p.daichiBemstarBase = null;  // เกราะเบมสตาร์: ยอดความเสียหายสะสมตอนเริ่มนับ (null = ไม่ได้นับอยู่)
    p.daichiBemstarOwed = 0;     // เกราะเบมสตาร์: ความเสียหายที่ต้องฟื้นคืนตอนต้นเทิร์นหน้า
    p.daichiStunPending = 0;     // เกราะเอเลคิง (ติดที่เป้าหมาย): สตั้นที่จะลงตอนต้นเทิร์นถัดไป
  },

  displayImg(p) {
    const armor = armorOf(p);
    if (armor) return armor.armorImg;
    return uniteOn(p) ? IMG.unite : null;
  },

  activeMusic(engine) {
    let best = null;
    for (const p of engine.alivePlayers()) {
      if (!uniteOn(p)) continue;
      if (!best || (p.transformAt || 0) > best.at) best = { music: MUSIC, at: p.transformAt || 0 };
    }
    return best;
  },

  // ช่องสกิลเปลี่ยนภาพ/ชื่อตามการ์ดที่ถืออยู่ — ต้องใช้สูตรเดียวกันทั้ง publicState และ useSkill
  dynamicSkillFor(p, ch, tier) {
    const card = cardOf(p);
    if (tier === "basic") return { ...ch.basic, name: `การ์ดไซเบอร์ — ${card.name}`, img: card.cardImg };
    if (tier === "secondary") return { ...ch.secondary, name: `ไพ่ตายของฉัน — ${card.armorName}`, desc: `${ch.secondary.desc} · ตอนนี้ถือการ์ด${card.name}: ${card.effect}`, img: card.skillImg };
    return ch[tier];
  },
  cardImg(p) { return cardOf(p).cardImg; },

  publicState(p) {
    if (!isDaichi(p)) return undefined;
    const card = cardOf(p);
    const armor = armorOf(p);
    return {
      card: card.key,
      cardName: card.name,
      cardEffect: card.effect,
      armor: armor ? armor.key : null,
      armorName: armor ? armor.armorName : null,
      armorEffect: armor ? armor.effect : null,
      unite: uniteOn(p),
      basicUses: p.daichiBasicUses || 0,
      basicMax: BASIC_USES,
      stored: (p.daichiStored || []).reduce((s, c) => s + (c.value || 0), 0),
      storedCount: (p.daichiStored || []).length,
      bemstarOwed: Math.min(BEMSTAR_HEAL_CAP, this.bemstarPreview(p)),
    };
  },

  // ---------- useSkill ----------
  canUseSkill(engine, p, tier) {
    if (!isDaichi(p)) return true;
    if (tier === "basic") return (p.daichiBasicUses || 0) < BASIC_USES;
    // สวมเกราะใบเดิมซ้ำไม่ได้ (เสียแต้มฟรี) — ต้องสุ่มการ์ดใบอื่นมาก่อน
    if (tier === "secondary") return uniteOn(p) && p.daichiArmor !== (p.daichiCard || DEFAULT_CARD);
    if (tier === "ultimate") return !uniteOn(p);
    return false;
  },
  applyInstantSkill(engine, p, tier) {
    if (!isDaichi(p)) return "";
    if (tier === "basic") return this.applyCyberCard(engine, p);
    if (tier === "secondary") return this.applyArmor(engine, p);
    if (tier === "ultimate") return this.applyUnite(engine, p);
    return "";
  },

  // ---------- สกิลพื้นฐาน การ์ดไซเบอร์ ----------
  applyCyberCard(engine, p) {
    p.daichiBasicUses = (p.daichiBasicUses || 0) + 1;
    const heal = engine.healHp(p, BASIC_HEAL);
    const key = CARD_KEYS[Math.floor(Math.random() * CARD_KEYS.length)];
    p.daichiCard = key;
    const card = CARDS[key];
    engine.log(`🃏 ${p.name} การ์ดไซเบอร์ — ได้การ์ด${card.name} · ฟื้นพลังชีวิต +${heal} (กดได้อีก ${Math.max(0, BASIC_USES - p.daichiBasicUses)} ครั้งในเทิร์นนี้)`);
    return ` → ${card.name} · พลังชีวิต +${heal}`;
  },

  // ---------- สกิลรอง ไพ่ตายของฉัน ----------
  applyArmor(engine, p) {
    const card = cardOf(p);
    this.settleBemstar(p); // ถอดเกราะเบมสตาร์ -> ความเสียหายที่นับไว้แล้วยังฟื้นคืนเทิร์นหน้าตามเดิม
    p.daichiArmor = card.key;
    if (card.key === "bemstar") p.daichiBemstarBase = damageTotal(p);
    engine.triggerCutscene(p, card.cut);
    engine.log(`🛡️ ${p.name} ไพ่ตายของฉัน — สวม${card.armorName}! ${card.effect}`);
    return ` → ${card.armorName}`;
  },

  // ---------- ท่าไม้ตาย มาUNITEกัน ----------
  applyUnite(engine, p) {
    p.statuses.daichiUnite = UNITE_TURNS;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "daichiUnite");
    engine.log(`✨ ${p.name} มาUNITEกัน! — ได้รับสถานะ "unite" ${UNITE_TURNS} เทิร์น · พลังโจมตี +${UNITE_ATK} · สวมเกราะได้ด้วยไพ่ตายของฉัน`);
    return "";
  },
  damageBonus(engine, attacker) {
    return uniteOn(attacker) ? UNITE_ATK : 0;
  },
  onUniteExpire(engine, p) {
    if (!isDaichi(p)) return;
    this.settleBemstar(p);
    const had = p.daichiArmor ? CARDS[p.daichiArmor] : null;
    p.daichiArmor = null;
    engine.log(`✨ ${p.name} unite สิ้นสุด${had ? ` — ${had.armorName}หลุดออกไปด้วย` : ""}`);
  },

  // ---------- เกราะเบมสตาร์: นับความเสียหายที่ได้รับ (เกราะ+เลือด) แล้วฟื้นคืนตอนต้นเทิร์นหน้า ----------
  settleBemstar(p) {
    if (p.daichiBemstarBase == null) return;
    p.daichiBemstarOwed = (p.daichiBemstarOwed || 0) + Math.max(0, damageTotal(p) - p.daichiBemstarBase);
    p.daichiBemstarBase = null;
  },
  bemstarPreview(p) {
    const live = p.daichiBemstarBase == null ? 0 : Math.max(0, damageTotal(p) - p.daichiBemstarBase);
    return (p.daichiBemstarOwed || 0) + live;
  },

  // ---------- doAttack: หลังลงความเสียหายของหมัดนี้แล้ว (หมัดที่ถูกหลบไม่มาถึงตรงนี้) ----------
  afterMainHit(engine, attacker, target) {
    const armor = armorOf(attacker);
    if (!armor) return null;
    if (armor.key === "gomora") {
      if (attacker.daichiInExtra || Math.random() >= GOMORA_EXTRA_CHANCE) return null;
      attacker.daichiExtraPending = true;
      engine.log(`🦖 ${attacker.name} เกราะโกโมร่า — ได้โจมตีเพิ่มอีก 1 ครั้ง!`);
      return { kind: "gomora", text: "เกราะโกโมร่า — ได้โจมตีเพิ่มอีก 1 ครั้ง!", img: armor.armorImg };
    }
    if (armor.key === "eleking") {
      if (!target || !target.alive || Math.random() >= ELEKING_STUN_CHANCE) return null;
      target.daichiStunPending = Math.max(target.daichiStunPending || 0, ELEKING_STUN_TURNS);
      engine.log(`⚡ ${attacker.name} เกราะเอเลคิง — ${target.name} ถูกไฟฟ้าช็อต จะติดสตั้นในเทิร์นถัดไป (ต้านทานได้)`);
      return { kind: "eleking", text: `เกราะเอเลคิง — ${target.name} จะติดสตั้นเทิร์นหน้า`, img: armor.armorImg };
    }
    return null;
  },
  attackFx(engine, attacker, res) {
    if (!res) return [];
    return [{ name: res.text, img: res.img, by: attacker.name, color: engine.colorOf(attacker), side: "atk" }];
  },

  // เกราะโกโมร่า: เรียกจาก postAttackFollowup — คืน true = เปิดเฟสโจมตีเพิ่มแล้ว ผู้เรียกต้อง return
  startExtraAttack(engine, attacker) {
    if (!isDaichi(attacker)) return false;
    if (!attacker.daichiExtraPending || !attacker.alive) {
      attacker.daichiExtraPending = false;
      attacker.daichiInExtra = false;
      return false;
    }
    attacker.daichiExtraPending = false;
    if (!engine.attackableTargets(attacker.id).length) { attacker.daichiInExtra = false; return false; }
    attacker.daichiInExtra = true;
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

  // เกราะเอเลคิง: สตั้นที่ติดไว้เมื่อเทิร์นก่อน -> ลงผลตอนนี้ (เรียกกับผู้เล่นทุกคน ก่อนบล็อกเช็คสตั้นต้นเทิร์น)
  applyPendingStun(engine, p) {
    if (!p || !(p.daichiStunPending > 0)) return;
    const turns = p.daichiStunPending;
    p.daichiStunPending = 0;
    if (engine.applyDebuff(p, "stun", null, turns)) engine.log(`⚡ ${p.name} โดนเกราะเอเลคิงช็อตเมื่อเทิร์นก่อน — ติดสถานะสตั้น ${turns} เทิร์น!`);
    else engine.log(`🛡️ ${p.name} ต้านผลของเกราะเอเลคิงไว้ได้ — ไม่ติดสตั้น`);
  },

  // ---------- ต้นเทิร์น (หลังแจกไพ่ใบแรกแล้ว) ----------
  onRoundStartTick(engine, p) {
    if (!isDaichi(p)) return;
    p.daichiBasicUses = 0;
    p.daichiExtraPending = false;
    p.daichiInExtra = false;
    if (!p.alive) return;
    // มาUNITEกัน: การ์ดที่ถูกตัดไว้เมื่อเทิร์นก่อน บวกเพิ่มเข้ามือเทิร์นนี้
    const stored = Array.isArray(p.daichiStored) ? p.daichiStored : [];
    if (stored.length) {
      p.daichiStored = [];
      for (const c of stored) {
        p.cards.push(c);
        engine.onCardDrawn(p, c);
      }
      engine.log(`✨ ${p.name} มาUNITEกัน — การ์ดที่ตัดไว้เมื่อเทิร์นก่อน (${stored.map((c) => c.value).join(", ")}) บวกเพิ่มเข้ามือเทิร์นนี้`);
    }
    // เกราะเบมสตาร์: ฟื้นคืนความเสียหายของเทิร์นก่อน (สูงสุด 3)
    this.settleBemstar(p);
    const owed = Math.min(BEMSTAR_HEAL_CAP, p.daichiBemstarOwed || 0);
    p.daichiBemstarOwed = 0;
    if (owed > 0) {
      const heal = engine.healHp(p, owed);
      engine.log(`🦇 ${p.name} เกราะเบมสตาร์ — ดูดซับความเสียหายเมื่อเทิร์นก่อน ฟื้นพลังชีวิต +${heal}`);
    }
    if (armorOf(p) && p.daichiArmor === "bemstar") p.daichiBemstarBase = damageTotal(p);
  },

  // ---------- ไพ่แตกจากการจั่ว: มาUNITEกัน (ตัดการ์ด) มาก่อน แล้วค่อยข้อมูลจำลอง (ล้างมือ) ----------
  //  เรียกจาก hit() / drawToScore() ของ server ก่อนตัดสิน p.busted
  cardBust(engine, p) {
    if (engine.overloadForceActive) return false;
    if (p.statuses && (p.statuses.upg || p.statuses.fiber)) return false;
    return engine.calculateScore(p.cards) + (p.cardBonus || 0) > 21;
  },
  onDrawCheck(engine, p) {
    if (!isDaichi(p) || !p.alive || !this.cardBust(engine, p)) return null;
    const color = engine.colorOf(p);
    let result = null;
    if (uniteOn(p) && p.daichiCutRound !== engine.roundNumber && p.cards.length > 1) {
      const card = p.cards.pop();
      p.daichiCutRound = engine.roundNumber;
      p.daichiStored = [...(p.daichiStored || []), card];
      engine.log(`✨ ${p.name} มาUNITEกัน — การ์ด ${card.value} จะทำให้แต้มเกิน! ตัดออกแล้วเก็บไว้บวกเพิ่มเทิร์นหน้า`);
      engine.skillFlash({ name: `มาUNITEกัน — ตัดการ์ด ${card.value} ไว้ใช้เทิร์นหน้า`, img: IMG.unite, by: p.name, color });
      result = "cut";
      if (!this.cardBust(engine, p)) return result;
    }
    if (p.daichiSimRound !== engine.roundNumber) {
      p.daichiSimRound = engine.roundNumber;
      const discarded = p.cards.length;
      p.cards = [];
      const c = engine.drawFromCentralDeck((card) => !card.special);
      if (c) { p.cards.push(c); engine.onCardDrawn(p, c); }
      engine.log(`💾 ${p.name} ข้อมูลจำลอง — ไพ่แตก! ล้างการ์ดทิ้งทั้งหมด ${discarded} ใบ แล้วจั่วใหม่${c ? ` ได้ ${c.value}` : " (กองกลางหมด)"}`);
      engine.skillFlash({ name: "ข้อมูลจำลอง — ล้างการ์ดแล้วจั่วใหม่", img: IMG.base, by: p.name, color });
      result = "sim";
    }
    return result;
  },
};
