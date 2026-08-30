// ============================================================
//  Hisakawa Sister - one player slot, two separate twins
// ============================================================

const { NO_TICK_STATUS } = require("./_universal_status");

const BASE = "/characters/hisakawa_sister";
const TWIN_MAX_HP = 3;
const TWIN_MAX_ARMOR = 2;
const STAGE_TURNS = 5;
const TALENT_TURNS = 5;
const DREAM_TURNS = 5;
const LIMIT_TURNS = 3;
const REVIVE_COST = 6;
const SWITCH_COST = 1;
const TWIN_KEYS = ["nagi", "hayate"];
// แฝดอีกคนออกมาโจมตีรอบ 2 ทุกครั้งที่โจมตีโดน (การันตี 100% — ทั้งจากการชนะและจาก "จังหวะนี้แหละ")
const DREAM_FOLLOWUP_DMG = 2;        // ดาเมจคงที่ของหมัดที่ 2
const COUPLE_BUFF_KEYS = ["hisakawaStage", "hisakawaTalent", "hisakawaDream"];

const PATHS = {
  select: `${BASE}/hisakawa_sister.webp`,
  nagi: `${BASE}/nagi/nagi.png`,
  hayate: `${BASE}/hayate/hayate.png`,
  switchToHayate: `${BASE}/skill1/hasakawa_skill1.1_hayate.png`,
  switchToNagi: `${BASE}/skill1/hasakawa_skill1.1_nagi.png`,
  revive: `${BASE}/skill1/hasakawa_skill1.2.png`,
  nagiSkill2: `${BASE}/nagi/skill2/nagi_skill2.png`,
  hayateSkill2: `${BASE}/hayate/skill2/hayate_skill2.png`,
  nagiSkill3: `${BASE}/nagi/skill3/nagi_skill3.png`,
  hayateSkill3: `${BASE}/hayate/skill3/hayate_skill3.png`,
  sunday: `${BASE}/skill3/hisakawa_skill3.jpg`,
  sundayVideo: `${BASE}/skill3/hisakawa_skill3.mp4`,
  sundayBg: `${BASE}/skill3/hisakawa_skill3_background.webp`,
};

function clone(obj) {
  return { ...(obj || {}) };
}

function makeTwin(key) {
  return {
    key,
    name: key === "nagi" ? "นากิ ฮิซากาว่า" : "ฮายาเตะ ฮิซากาว่า",
    img: key === "nagi" ? PATHS.nagi : PATHS.hayate,
    hp: TWIN_MAX_HP,
    armor: TWIN_MAX_ARMOR,
    alive: true,
    statuses: {},
    statusAmt: {},
  };
}

function ensure(p) {
  if (!p || p.characterId !== "hisakawa_sister") return null;
  if (!p.hisakawa) {
    p.hisakawa = {
      active: "nagi",
      controlTurns: 0,
      twins: { nagi: makeTwin("nagi"), hayate: makeTwin("hayate") },
    };
  }
  for (const key of TWIN_KEYS) if (!p.hisakawa.twins[key]) p.hisakawa.twins[key] = makeTwin(key);
  return p.hisakawa;
}

function twinOf(p, key) {
  const h = ensure(p);
  return h ? h.twins[key || h.active] : null;
}

function activeTwin(p) {
  const h = ensure(p);
  return h ? h.twins[h.active] : null;
}

function otherKey(key) {
  return key === "nagi" ? "hayate" : "nagi";
}

function otherTwin(p) {
  const h = ensure(p);
  return h ? h.twins[otherKey(h.active)] : null;
}

function liveTwins(p) {
  const h = ensure(p);
  return h ? TWIN_KEYS.map((key) => h.twins[key]).filter((t) => t.alive) : [];
}

function bothAlive(p) {
  return liveTwins(p).length === 2;
}

function anyTwinDead(p) {
  const h = ensure(p);
  return !!h && TWIN_KEYS.some((key) => !h.twins[key].alive);
}

// การซิงก์มี 2 ระดับ — แยกกันเพราะ "แหล่งความจริง" ต่างกัน:
//   syncIn()     = รับช่วงร่างใหม่เต็มรูปแบบ (เริ่มเกม / สลับตัว / แฝดล้ม / ชุบ) -> เขียนทับ p ทั้งก้อน
//   syncVitals() = รีเฟรชแค่เลือด/เกราะ ไม่แตะ p.statuses เลย
// ระหว่างที่แฝดคนหนึ่งคุมอยู่ p.statuses คือแหล่งความจริง (server.js เขียนสถานะใส่ p ตรงๆ หลายจุด
// เช่น nodraw/noskill/stagger ตอน dealRound, ไอเทมร้านค้า, freecast, dawn) — ถ้าใช้ syncIn เต็มรูปแบบ
// ในจังหวะเหล่านั้นสถานะพวกนี้จะถูกล้างทิ้งเงียบๆ จึงต้องใช้ syncVitals และให้ฝั่งแฝดเขียนแบบ
// write-through (setTwinStatus/delTwinStatus) มิเรอร์ลง p ทันทีเมื่อเป็นแฝดที่กำลังคุมอยู่
function syncIn(p) {
  const t = activeTwin(p);
  if (!t) return;
  p.hp = t.hp;
  p.armor = t.armor;
  p.statuses = clone(t.statuses);
  p.statusAmt = clone(t.statusAmt);
}

function syncVitals(p) {
  const t = activeTwin(p);
  if (!t) return;
  p.hp = t.hp;
  p.armor = t.armor;
}

function syncOut(p) {
  const t = activeTwin(p);
  if (!t) return;
  t.hp = Math.max(0, p.hp || 0);
  t.armor = Math.max(0, p.armor || 0);
  t.alive = p.alive !== false && t.hp > 0;
  t.statuses = clone(p.statuses);
  t.statusAmt = clone(p.statusAmt);
}

function statusOn(t, key) {
  return ((t && t.statuses && t.statuses[key]) || 0) > 0;
}

function skillStatus(skill) {
  return skill?.status || skill?.effect?.status;
}

function isActive(p, t) {
  const h = p && p.hisakawa;
  return !!h && h.twins[h.active] === t;
}

// เขียนสถานะลงแฝด + มิเรอร์ลง p ทันทีถ้าเป็นแฝดที่กำลังคุมอยู่ (แทนการ syncIn ทับทั้งก้อน)
function setTwinStatus(p, t, key, turns, amount) {
  t.statuses[key] = turns;
  if (amount != null) {
    t.statusAmt = t.statusAmt || {};
    t.statusAmt[key] = amount;
  }
  if (!isActive(p, t)) return;
  p.statuses[key] = turns;
  if (amount != null) {
    p.statusAmt = p.statusAmt || {};
    p.statusAmt[key] = amount;
  }
}

function delTwinStatus(p, t, key) {
  delete t.statuses[key];
  if (t.statusAmt) delete t.statusAmt[key];
  if (!isActive(p, t)) return;
  delete p.statuses[key];
  if (p.statusAmt) delete p.statusAmt[key];
}

function applyStatus(p, t, key, turns, amount) {
  if (!t || !t.alive) return;
  const nextTurns = Math.max(t.statuses[key] || 0, turns);
  const nextAmt = amount == null ? null : Math.max((t.statusAmt && t.statusAmt[key]) || 0, amount);
  setTwinStatus(p, t, key, nextTurns, nextAmt);
}

function applyCoupleStatus(p, key, turns) {
  const h = ensure(p);
  if (!h) return;
  for (const t of Object.values(h.twins)) {
    setTwinStatus(p, t, key, Math.max(t.statuses[key] || 0, turns));
  }
}

function addFortune(p, t, n = 1) {
  if (!t || !t.alive) return;
  setTwinStatus(p, t, "fortune", Math.min(3, (t.statuses.fortune || 0) + n));
}

function damageTwin(t, n) {
  for (let i = 0; i < n && t.alive; i++) {
    if (t.armor > 0) t.armor--;
    else t.hp--;
    if (t.hp <= 0) {
      t.hp = 0;
      t.alive = false;
    }
  }
}

function clearCoupleBuffs(p) {
  const h = ensure(p);
  if (!h) return;
  for (const t of Object.values(h.twins)) {
    for (const key of COUPLE_BUFF_KEYS) delTwinStatus(p, t, key);
  }
}

function publicTwin(p, t, active) {
  return {
    key: t.key,
    name: t.name,
    img: t.img,
    hp: t.hp,
    maxHp: TWIN_MAX_HP,
    armor: t.armor,
    maxArmor: TWIN_MAX_ARMOR,
    alive: !!t.alive,
    active: !!active,
    statuses: clone(active ? p.statuses : t.statuses),
    statusAmt: clone(active ? p.statusAmt : t.statusAmt),
  };
}

function skillVoice(p, tier, skill) {
  const h = ensure(p);
  if (!h) return null;
  // เรียกหลัง applySkill() เสมอ -> ตอนสลับตัว h.active คือแฝดที่ "เพิ่งออกมา" แล้ว
  //  ต้องได้ยินเสียงของคนที่ออกมา (ตรงกับภาพบนปกสกิล) ไม่ใช่คนที่เพิ่งหลบเข้าไปพัก
  const voiceTwin = h.active;
  if (tier === "ultimate" && skillStatus(skill) === "hisakawaDream") return null;
  const n = tier === "ultimate" ? 3 : tier === "secondary" ? 2 : 1;
  return `hisakawa_${voiceTwin}_${n}`;
}

module.exports = {
  id: "hisakawa_sister",
  PATHS,
  TWIN_MAX_HP,
  TWIN_MAX_ARMOR,
  REVIVE_COST,
  SWITCH_COST,
  DREAM_FOLLOWUP_DMG,

  init(p) {
    p.hisakawa = null;
    p.hisakawaSwitchedRound = 0;
    p.hisakawaHayateAssist = false;
    p.hisakawaDreamPending = false;
    p.hisakawaDreamAtk = false;
    p.hisakawaBonusRound = 0;
    ensure(p);
    syncIn(p);
  },

  syncIn,
  syncVitals,
  syncOut,
  activeTwin,
  otherTwin,
  bothAlive,
  anyTwinDead,

  reviveFallenTwin(p, hp = TWIN_MAX_HP) {
    const h = ensure(p);
    if (!h) return null;
    const hadSurvivor = TWIN_KEYS.some((key) => h.twins[key].alive);
    const revived = hadSurvivor
      ? TWIN_KEYS.map((key) => h.twins[key]).find((t) => !t.alive)
      : h.twins[h.active];
    if (!revived) return null;
    revived.alive = true;
    revived.hp = Math.min(TWIN_MAX_HP, Math.max(1, hp));
    revived.armor = 0;
    if (!hadSurvivor) h.active = revived.key;
    h.controlTurns = 0;
    p.alive = true;
    p.result = null;
    p.locked = false;
    syncIn(p);
    return revived.key;
  },

  // ล้างสถานะ key หนึ่งออกจากแฝดทั้งคู่ — จำเป็นเพราะบัฟของคู่แฝดไม่ได้อยู่ที่ p.statuses
  //  (โค้ดที่ delete p.statuses[key] ตรงๆ จะไม่มีผลกับตัวละครนี้เลย) คืน true ถ้ามีอะไรถูกล้างจริง
  clearStatusOnTwins(p, key) {
    const h = ensure(p);
    if (!h) return false;
    let cleared = false;
    for (const twinKey of TWIN_KEYS) {
      const t = h.twins[twinKey];
      if (!t || !t.statuses || !t.statuses[key]) continue;
      delete t.statuses[key];
      if (t.statusAmt) delete t.statusAmt[key];
      cleared = true;
    }
    return cleared;
  },

  // เกราะฟื้น 1 หน่วยให้แฝดที่พักอยู่ (จังหวะเดียวกับคนที่คุมอยู่ — server.js คุมเงื่อนไขรอบ/armorLocked/MOON*CELL ให้แล้ว)
  regenRestingArmor(engine, p) {
    const h = ensure(p);
    if (!h) return;
    for (const key of TWIN_KEYS) {
      const t = h.twins[key];
      if (key === h.active || !t.alive) continue;
      if ((t.statuses.decay || 0) > 0) continue;  // ผุพัง: เกราะไม่ฟื้น
      if (t.armor >= TWIN_MAX_ARMOR) continue;
      t.armor++;
      engine.log(`👭 ${t.name} ที่พักอยู่ซ่อมเกราะให้ตัวเอง — เกราะ +1 (${t.armor}/${TWIN_MAX_ARMOR})`);
    }
  },

  applyBuffToTwin(p, twinKey, key, amount, turns) {
    const h = ensure(p);
    const t = h && h.twins[twinKey];
    if (!t || !t.alive) return false;
    applyStatus(p, t, key, turns, amount);
    return true;
  },

  maxHp() { return TWIN_MAX_HP; },
  maxArmor() { return TWIN_MAX_ARMOR; },
  displayImg(p) {
    const h = ensure(p);
    if (!h) return PATHS.select;
    // หมัดที่ 2 ของ "ฝันของเหล่าฝาแฝด": คนที่ออกมาตีคือแฝดอีกคน ไม่ใช่ตัวที่คุมอยู่
    const t = p.hisakawaDreamAtk ? h.twins[otherKey(h.active)] : h.twins[h.active];
    return t ? t.img : PATHS.select;
  },

  publicState(p, round) {
    const h = ensure(p);
    if (!h) return null;
    return {
      active: h.active,
      controlTurns: h.controlTurns || 0,
      // สลับตัวไปแล้วในเทิร์นนี้ -> ปุ่มสกิลพื้นฐานต้องขึ้น disable (เปลี่ยนกลับไม่ได้จนจบเทิร์น)
      switchedThisRound: round != null && (p.hisakawaSwitchedRound || 0) === round,
      twins: TWIN_KEYS.map((key) => publicTwin(p, h.twins[key], key === h.active)),
    };
  },

  dynamicSkillFor(p, ch, tier) {
    const h = ensure(p);
    if (!h) return ch[tier];
    if (tier === "basic") {
      if (anyTwinDead(p)) return ch.basic2;
      // ปกสกิลสลับตัวโชว์ภาพ "แฝดอีกคน" ที่กำลังจะออกมาแทน — เดิมค้างที่ภาพฮายาเตะเสมอ
      return { ...ch.basic, img: h.active === "nagi" ? PATHS.switchToHayate : PATHS.switchToNagi };
    }
    if (tier === "secondary") return h.active === "nagi" ? ch.secondary : ch.secondary2;
    if (tier === "ultimate") {
      const t = activeTwin(p);
      if (statusOn(t, "hisakawaStage") && statusOn(t, "hisakawaTalent")) return ch.ultimate3;
      return h.active === "nagi" ? ch.ultimate : ch.ultimate2;
    }
    return ch[tier];
  },

  canUseSkill(engine, p, tier, skill) {
    const h = ensure(p);
    if (!h) return false;
    const t = h.twins[h.active];
    if (!t || !t.alive) return false;
    if (tier === "basic" && skillStatus(skill) === "hisakawaSwitch") return (p.hisakawaSwitchedRound || 0) !== engine.roundNumber && bothAlive(p);
    if (tier === "basic" && skillStatus(skill) === "hisakawaRevive") return anyTwinDead(p);
    if (tier === "secondary" && skillStatus(skill) === "hisakawaLimit") return h.active === "nagi" && !statusOn(t, "hisakawaLimit");
    // จังหวะนี้แหละ: เป็นบัฟคู่ (ลงทั้งสองคน) — กดซ้ำไม่ได้ถ้ายังมีจังหวะค้างอยู่ที่ใครก็ตาม
    if (tier === "secondary" && skillStatus(skill) === "hisakawaTempo") return !TWIN_KEYS.some((key) => statusOn(h.twins[key], "hisakawaTempo"));
    if (tier === "ultimate" && skillStatus(skill) === "hisakawaDream") return statusOn(t, "hisakawaStage") && statusOn(t, "hisakawaTalent");
    return true;
  },

  applySkill(engine, p, tier, skill) {
    const h = ensure(p);
    const active = h.twins[h.active];
    const other = h.twins[otherKey(h.active)];
    let suffix = "";
    if (skillStatus(skill) === "hisakawaSwitch") {
      p.hisakawaSwitchedRound = engine.roundNumber;
      const outgoing = active;
      syncOut(p);
      outgoing.hp = Math.min(TWIN_MAX_HP, outgoing.hp + 2);
      engine.addSkill(p, 2);
      h.active = other.key;
      h.controlTurns = 0;
      if (statusOn(outgoing, "hisakawaLimit") && other.key === "hayate") {
        addFortune(p, other, 1);
        suffix = " — ฮายาเตะได้รับโชคลาภ +1";
      }
      syncIn(p);
      // สลับตัว = รีเซ็ตจำนวนครั้งใช้สกิล แฝดที่เพิ่งออกมามีสิทธิ์ใช้สกิลของตัวเองอีก 1 ครั้งในเทิร์นนี้
      p.skillUsedRound = false;
      p.hisakawaBonusRound = 0;
      engine.log(`🔁 ${p.name} สลับตัวเป็น ${other.name} — ${outgoing.name} ฟื้นพลังชีวิต 2 หน่วย${suffix}`);
    } else if (skillStatus(skill) === "hisakawaRevive") {
      const dead = TWIN_KEYS.map((key) => h.twins[key]).find((t) => !t.alive);
      if (!dead) return "";
      const coupleStatuses = {};
      for (const key of COUPLE_BUFF_KEYS) {
        const turns = Math.max(...Object.values(h.twins).map((t) => t.statuses?.[key] || 0));
        if (turns > 0) coupleStatuses[key] = turns;
      }
      dead.alive = true;
      dead.hp = TWIN_MAX_HP;
      dead.armor = 0;
      dead.statuses = coupleStatuses;
      dead.statusAmt = {};
      engine.log(`💫 ${p.name} ปลุก ${dead.name} กลับมาสู้ต่อ (${dead.hp}/${TWIN_MAX_HP}, เกราะ 0)`);
    } else if (skillStatus(skill) === "hisakawaLimit") {
      applyStatus(p, active, "hisakawaLimit", LIMIT_TURNS);
      engine.log(`🧡 ${active.name} อย่าทำอะไรเกินตัวสิ — ดาเมจที่ได้รับเบาลง 1 และโจมตีติดผกผัน`);
    } else if (skillStatus(skill) === "hisakawaTempo") {
      applyCoupleStatus(p, "hisakawaTempo", 999);
      engine.log(`💨 ${p.name} จังหวะนี้แหละ — ทั้งนากิและฮายาเตะ ใครคุมอยู่ตอนแต้มต่ำสุดแบบไม่เสมอ ก็ได้โจมตีหลังผู้ชนะ`);
    } else if (skillStatus(skill) === "hisakawaStage") {
      applyCoupleStatus(p, "hisakawaStage", STAGE_TURNS);
      engine.log(`🎤 ${p.name} Miracle Live — เปิดเวทีของพวกเรา ${STAGE_TURNS} เทิร์น`);
    } else if (skillStatus(skill) === "hisakawaTalent") {
      applyCoupleStatus(p, "hisakawaTalent", TALENT_TURNS);
      engine.log(`💃 ${p.name} Miracle Dance — พรสวรรค์ของพวกเราเพิ่มพลังโจมตี +2`);
    } else if (skillStatus(skill) === "hisakawaDream") {
      for (const t of Object.values(h.twins)) {
        delTwinStatus(p, t, "hisakawaStage");
        delTwinStatus(p, t, "hisakawaTalent");
      }
      applyCoupleStatus(p, "hisakawaDream", DREAM_TURNS);
      p.transformAt = engine.nextTransformCounter();
      engine.queueCutscene(p, "hisakawaSunday");
      engine.log(`🎁 ${p.name} O-KU-RI-MO-NO-Sunday — รวมเวทีและพรสวรรค์เป็นฝันของเหล่าฝาแฝด`);
    }
    // ทุกสกิลของแฝด (ยกเว้นสลับตัวที่รีเซ็ตโควตาให้เต็มอยู่แล้ว): กดแล้วยังใช้สกิลอื่นได้อีก 1 ครั้งในเทิร์นเดียวกัน
    //  (ให้โบนัสครั้งเดียวต่อเทิร์น — สลับตัวจะล้าง hisakawaBonusRound ให้แฝดที่ออกมาใหม่ได้โบนัสของตัวเองอีกครั้ง)
    if (skillStatus(skill) !== "hisakawaSwitch" && p.hisakawaBonusRound !== engine.roundNumber) {
      p.hisakawaBonusRound = engine.roundNumber;
      p.skillUsedRound = false;
      engine.log(`👭 ${p.name} ยังไม่หมดแรง — ใช้สกิลได้อีก 1 ครั้งในเทิร์นนี้`);
    }
    return suffix;
  },

  skillVoice,

  adjustIncomingDamage(engine, p, n) {
    const t = activeTwin(p);
    if (!t || !statusOn(t, "hisakawaLimit")) return n;
    return Math.max(0, n - 1);
  },

  damageBonus(engine, attacker, target, ctx) {
    const t = activeTwin(attacker);
    if (!t) return 0;
    let bonus = 0;
    if (statusOn(t, "hisakawaTalent") || statusOn(t, "hisakawaDream")) bonus += 2;
    if (ctx) ctx.hisakawaActiveTwin = t.key;
    return bonus;
  },

  onAttackLanded(engine, attacker, target) {
    const t = activeTwin(attacker);
    if (!t) return [];
    if (attacker.hisakawaDreamAtk) return []; // หมัดที่ 2 เป็นของแฝดอีกคน — ผลของตัวที่คุมอยู่ไม่ทำงาน
    const skills = [];
    if (t.key === "nagi" && statusOn(t, "hisakawaLimit") && target.alive) {
      if (engine.applyDebuff(target, "invert", null, 3)) engine.log(`🔄 ${t.name} มอบสถานะผกผันให้ ${target.name} 3 เทิร์น`);
      else engine.log(`🛡️ ${target.name} ต้านผกผันจาก ${t.name}`);
      skills.push({ name: "เท่าที่ไหว — ผกผัน", img: PATHS.nagiSkill2, by: t.name, side: "atk" });
    }
    return skills;
  },

  // ท่าไม้ตาย 3: โจมตีโดนแล้ว "จอง" การโจมตีรอบ 2 ของแฝดอีกคนทุกครั้ง (100%)
  //  ไม่ลงดาเมจตรงนี้ — เปิดเป็นเฟสโจมตีจริงอีกรอบใน startDreamFollowupAttack() ให้เลือกเป้าหมายเองได้
  maybeDreamFollowup(engine, attacker, target) {
    const h = ensure(attacker);
    if (!h || !bothAlive(attacker) || !target) return null;
    if (attacker.hisakawaDreamAtk) return null; // หมัดที่ 2 เองไม่ทอยต่ออีก (กันลูปไม่รู้จบ)
    const active = h.twins[h.active];
    const other = h.twins[otherKey(h.active)];
    if (!statusOn(active, "hisakawaDream")) return null;
    attacker.hisakawaDreamPending = true;
    engine.log(`🎁 ฝันของเหล่าฝาแฝด — ${other.name} เตรียมออกมาโจมตีต่อ`);
    return null;
  },

  // เปิดเฟสโจมตีรอบ 2 ของแฝดอีกคน (เรียกจาก postAttackFollowup() ของ server.js)
  //  เลือกเป้าหมายใหม่ได้เอง และเป็นการโจมตีจริงที่มีอนิเมชัน ไม่ใช่ดาเมจแฝงเหมือนเดิม
  startDreamFollowupAttack(engine, attacker) {
    if (!attacker || attacker.characterId !== "hisakawa_sister") return false;
    attacker.hisakawaDreamAtk = false; // หมัดที่ 2 (ถ้าเพิ่งตีไป) จบแล้ว
    if (!attacker.hisakawaDreamPending) return false;
    attacker.hisakawaDreamPending = false;
    const h = ensure(attacker);
    if (!h || !attacker.alive || !bothAlive(attacker)) return false;
    if (!engine.attackableTargets(attacker.id).length) return false;
    const other = h.twins[otherKey(h.active)];
    attacker.hisakawaDreamAtk = true;
    engine.setAttackerId(attacker.id);
    engine.setGameState("ATTACK");
    engine.log(`🎁 ฝันของเหล่าฝาแฝด — ${other.name} ออกมาโจมตีต่ออีก 1 ครั้ง (${DREAM_FOLLOWUP_DMG} หน่วย)`);
    engine.startPhaseTimer(engine.ATTACK_TIME, () => {
      const t = engine.attackableTargets(engine.attackerId);
      if (t.length) engine.doAttack(engine.attackerId, t[Math.floor(Math.random() * t.length)].id);
      else engine.endTurn();
    });
    engine.broadcastState();
    return true;
  },

  // หมัดที่ 2 กำลังทำงานอยู่ไหม (server.js ใช้ทับดาเมจให้คงที่ + เลือกภาพผู้โจมตี)
  isDreamAttack(p) {
    return !!(p && p.characterId === "hisakawa_sister" && p.hisakawaDreamAtk);
  },

  // ชื่อแฝดที่ออกมาตีหมัดที่ 2 (ใช้โชว์บนอนิเมชัน)
  dreamFollowupName(p) {
    const h = ensure(p);
    return h ? h.twins[otherKey(h.active)].name : "";
  },

  onAfterRoundScores(engine, combatants, winnerId, valFn) {
    for (const p of combatants) {
      const h = ensure(p);
      if (!h) continue;
      const t = h.twins[h.active];
      if (!statusOn(t, "hisakawaTempo") || !t.alive) continue;
      const score = valFn(p);
      if (score < 0) continue;
      const sameLow = combatants.filter((o) => valFn(o) === score);
      const low = Math.min(...combatants.map(valFn).filter((v) => v >= 0));
      if (score === low && sameLow.length === 1 && p.id !== winnerId) {
        // บัฟยังไม่ถูกใช้ตรงนี้ — ตัดทิ้งตอน startHayateAssistAttack() ที่ได้ออกโจมตีจริงเท่านั้น
        // (ผู้ชนะอาจโจมตีไม่ได้เลย เช่น หลับ/สตั้น/เร้นเงา ซึ่ง afterSummary() ข้าม postAttackFollowup ไปจบเทิร์น)
        p.hisakawaHayateAssist = true;
        engine.log(`💨 ${t.name} ได้จังหวะต่ำสุด — เตรียมโจมตีหลังผู้ชนะ`);
      }
    }
  },

  startHayateAssistAttack(engine, attacker) {
    const p = engine.alivePlayers().find((o) => o.characterId === "hisakawa_sister" && o.hisakawaHayateAssist);
    if (!p) return false;
    p.hisakawaHayateAssist = false;
    // บัฟคู่: ระหว่างรอคิว ผู้ชนะอาจตีจนคนที่จองไว้ล้ม — แฝดอีกคนที่ออกมาคุมแทนได้ออกโจมตีต่อแทนได้เลย
    const h = ensure(p);
    const runner = h && h.twins[h.active];
    if (!h || !runner || !runner.alive) return false;
    const targets = engine.attackableTargets(p.id);
    if (!targets.length) return false;
    for (const key of TWIN_KEYS) delTwinStatus(p, h.twins[key], "hisakawaTempo"); // บัฟคู่: ใช้แล้วหมดไปทั้งสองคน
    engine.setAttackerId(p.id);
    engine.log(`💨 ${runner.name} ได้โจมตีต่อจาก ${attacker ? attacker.name : "ผู้ชนะ"}`);
    return true;
  },

  onRoundStartTick(engine, p) {
    const h = ensure(p);
    if (!h) return;
    const active = h.twins[h.active];
    for (const key of TWIN_KEYS) {
      const t = h.twins[key];
      if (!t.alive || key === h.active) continue;
      let dmg = 0;
      if ((t.statuses.oblada || 0) > 0 && t.statuses.oblada % 2 === 1) dmg += 1;
      if ((t.statuses.hburn || 0) > 0) {
        dmg += 1;
        t.statuses.hburn = Math.max(0, t.statuses.hburn - 1);
        if (t.statuses.hburn <= 0) delete t.statuses.hburn;
      }
      if (dmg > 0) {
        damageTwin(t, dmg);
        if (!t.alive) {
          if (engine.tryYunaLongingForTwin) engine.tryYunaLongingForTwin(p);
        }
        engine.log(`👭 ${t.name} ที่พักอยู่ยังโดนผลค้างอยู่ — รับความเสียหาย -${dmg}`);
      }
    }
    if (active.alive) {
      h.controlTurns = (h.controlTurns || 0) + 1;
      if (statusOn(active, "hisakawaDream")) addFortune(p, active, 1);
      if (h.controlTurns >= 2 && h.controlTurns % 3 === 2) {
        applyStatus(p, active, "resist", 1, 1);
        engine.log(`👭 ${active.name} ควบคุมต่อเนื่อง — ได้ต้านสถานะผิดปกติ 1 เทิร์น`);
      }
    }
    syncVitals(p);
  },

  onEndTurnTick(engine, p) {
    const h = ensure(p);
    if (!h) return;
    // จังหวะที่จองไว้แต่ไม่ได้ใช้ (ผู้ชนะโจมตีไม่ได้ / ไม่มีเป้าให้ตี) ต้องไม่ค้างข้ามไปเทิร์นหน้า
    p.hisakawaHayateAssist = false;
    p.hisakawaDreamPending = false;
    p.hisakawaDreamAtk = false;
    for (const key of TWIN_KEYS) {
      const t = h.twins[key];
      if (key === h.active) continue;
      for (const s of Object.keys(t.statuses || {})) {
        // สถานะทั่วไปของแฝดที่ล้มจะหยุดไว้ตามเดิม แต่บัฟคู่ต้องนับเวลา
        // พร้อมกับแฝดที่ยังสู้ เพื่อไม่ให้การชุบดึงระยะเวลาเก่ากลับมาอีกครั้ง
        if (!t.alive && !COUPLE_BUFF_KEYS.includes(s)) continue;
        if (t.statuses[s] >= 999) continue;
        // ใช้รายการเดียวกับลูปลดเทิร์นใน endTurn() ของ server.js — ไม่งั้นมาร์กถาวร (ตราล่าเวท/
        // รังสรรค์/เส้นตาย) และบัฟที่รอโจมตีจะสลายไปเองเฉพาะตอนแฝดคนนั้นพักอยู่
        if (NO_TICK_STATUS.has(s)) continue;
        t.statuses[s]--;
        if (t.statuses[s] <= 0) {
          delete t.statuses[s];
          if (t.statusAmt) delete t.statusAmt[s];
        }
      }
    }
    syncVitals(p);
  },

  extraSkillRegen(p) {
    const h = ensure(p);
    if (!h) return 0;
    let gain = 0;
    const active = h.twins[h.active];
    if (statusOn(active, "hisakawaStage") || statusOn(active, "hisakawaDream")) gain += 1;
    if (!bothAlive(p)) gain += 1;
    return gain;
  },

  extraGoldRegen(p) {
    const h = ensure(p);
    return h && h.controlTurns >= 5 ? 1 : 0;
  },

  tryTwinDeath(engine, p) {
    const h = ensure(p);
    if (!h) return false;
    const deadKey = h.active;
    const dead = h.twins[deadKey];
    dead.hp = 0;
    dead.alive = false;
    dead.armor = 0;
    const next = TWIN_KEYS.find((key) => key !== deadKey && h.twins[key].alive);
    if (!next) {
      clearCoupleBuffs(p);
      return false;
    }
    h.active = next;
    h.controlTurns = 0;
    syncIn(p);
    p.alive = true;
    engine.log(`👭 ${dead.name} หมดสภาพต่อสู้ — ${h.twins[next].name} ออกมาควบคุมแทน`);
    return true;
  },

  reviveFromElimination(p, hp = TWIN_MAX_HP) {
    return !!this.reviveFallenTwin(p, hp);
  },
};

