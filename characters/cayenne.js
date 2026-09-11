// ============================================================
//  คาเยนน์ ซูซูชิโระ (กลาง)
//  ปืนพกหน่วยรบ / แน่จริงก็หลบสิ / มิสไซล์แห่งคำอำลา
//  + สกิลติดตัว "ทหารผ่านศึก" และ "ร่วมร่างสหายแห่งเทพ"
//
//  ทรัพยากร 2 อย่าง (ทุกคนเห็นได้):
//   - กระสุน (p.cayAmmo 0-3 แม็ก): เริ่ม 3 · สกิลพื้นฐาน +1 · สกิลรองใช้ 1 · ท่าไม้ตายใช้ 2
//   - แรงใจ (p.cayMorale 0-5): ได้จากสกิลพื้นฐานอย่างเดียว ครบ 5 = แปลงร่าง "เกพาร์ด" 10 เทิร์น
//     ระหว่างเป็นเกพาร์ดไม่สะสม · หมดร่างแล้วเริ่มนับจาก 0 ใหม่
//
//  ⚠️ วีดีโอทั้ง 3 คลิป (แปลงร่าง / แน่จริงก็หลบสิ / มิสไซล์) เล่นอย่างละ 1 ครั้งต่อเกม
//   ใช้ engine.triggerCutscene ซึ่งจำไว้ที่ p.cutsceneShown (ล้างทุกแมตช์ใหม่ใน resetCombat)
//   ครั้งถัดไปขึ้นเป็นการ์ดแจ้งเตือนเล็กแทน
// ============================================================

const ID = "cayenne";
const BASE = "/characters/cayenne";

const IMG = {
  base: `${BASE}/cayenne.jpg`,
  gepard: `${BASE}/gepard.webp`,
  skill1: `${BASE}/skill1/cayenne_skill1.jpg`,
  skill2: `${BASE}/skill2/cayenne_skill2.png`,
  skill3: `${BASE}/skill3/cayenne_skill3.jpg`,
};
const VIDEO = {
  gepard: `${BASE}/gepard.mp4`,
  skill2: `${BASE}/skill2/cayenne_skill2.mp4`,
  skill3: `${BASE}/skill3/cayenne_skill3.mp4`,
};

// ---------- ทหารผ่านศึก ----------
const AMMO_START = 3;
const AMMO_MAX = 3;

// ---------- ร่วมร่างสหายแห่งเทพ ----------
const MORALE_NEED = 5;
const GEPARD_TURNS = 10;
const FRAGILE_CHANCE = 0.3;
const FRAGILE_AMT = 1;
//  "เปราะบาง 1 เทิร์น" แปะกลางเฟสโจมตี — ลูปลดเทิร์นท้ายเทิร์นจะกินไป 1 ทันที
//  จึงตั้ง 2 เพื่อให้คงอยู่ถึงการโจมตีครั้งถัดไปจริง (ภายในชุดกระสุนเดียวกันก็เห็นผลตั้งแต่ครั้งถัดไป)
const FRAGILE_TURNS = 2;

// ---------- สกิลพื้นฐาน ปืนพกหน่วยรบ ----------
const PISTOL_AMMO = 1;
const PISTOL_MORALE = 1;
const PISTOL_HEAL = 3;

// ---------- สกิลรอง แน่จริงก็หลบสิ ----------
//  การโจมตีปกติ 1 ครั้ง -> โจมตีปกติจริง 3 ครั้งติดกัน (แต่ละครั้งมีอนิเมชัน/สรุปความเสียหายของตัวเอง)
const BARRAGE_AMMO = 1;
const BARRAGE_HITS = 3;
const BARRAGE_LAST_CHANCE = 0.5; // ครั้งที่ 3 มีโอกาสเกิดขึ้น 50%
const BULLET_DMG = 1;

// ---------- ท่าไม้ตาย มิสไซล์แห่งคำอำลา ----------
const MISSILE_AMMO = 2;
const MISSILES = 8;
const MISSILE_CAP = 4; // 1 คนรับได้ไม่เกิน 4 ลูก

const MUSIC = "cayenne_theme";

function isCay(p) { return !!p && p.characterId === ID; }
function gepardOn(p) { return isCay(p) && ((p.statuses && p.statuses.cayGepard) || 0) > 0; }
function ammoOf(p) { return isCay(p) ? Math.max(0, Math.min(AMMO_MAX, p.cayAmmo || 0)) : 0; }
function pendingTotal(p) {
  return isCay(p) && Array.isArray(p.cayPending) ? p.cayPending.reduce((s, it) => s + (it.n || 0), 0) : 0;
}

module.exports = {
  id: ID,
  IMG,
  VIDEO,
  AMMO_START,
  AMMO_MAX,
  MORALE_NEED,
  GEPARD_TURNS,
  FRAGILE_CHANCE,
  FRAGILE_AMT,
  FRAGILE_TURNS,
  PISTOL_AMMO,
  PISTOL_MORALE,
  PISTOL_HEAL,
  BARRAGE_AMMO,
  BARRAGE_HITS,
  BARRAGE_LAST_CHANCE,
  BULLET_DMG,
  MISSILE_AMMO,
  MISSILES,
  MISSILE_CAP,
  gepardOn,
  ammoOf,
  pendingTotal,

  // ---------- ฟิลด์เฉพาะตัวละคร: ต้องล้างทุกแมตช์ใหม่ (เรียกจาก resetCombat ของ server.js) ----------
  resetCombat(p) {
    p.cayAmmo = AMMO_START;  // กระสุน (แม็ก)
    p.cayMorale = 0;         // แรงใจ
    p.cayBarrage = false;    // แน่จริงก็หลบสิ บรรจุไว้แล้ว — ค้างจนกว่าจะได้ออกหมัดโจมตีปกติ
    p.cayBarrageShot = 0;    // ชุดกระสุนกำลังยิงอยู่: ครั้งที่เท่าไหร่ (0 = ไม่ได้ยิงชุดอยู่)
    p.cayBarrageTargetId = null; // เป้าหมายล่าสุดของชุด — ใช้ตอนหมดเวลาเลือกเป้าหมาย
    p.cayPistolRound = 0;    // เลขรอบที่กดปืนพกหน่วยรบไปแล้ว (1 ครั้ง/เทิร์น)
    p.cayPending = [];       // ความเสียหายที่ถูกเลื่อนไปเทิร์นถัดไป [{ n, fromId, kind, normal }]
    p._cayNoDelay = false;
    p._cayBarrageVideo = false;
  },

  displayImg(p) {
    return gepardOn(p) ? IMG.gepard : null;
  },

  // เพลงประจำร่างเกพาร์ด — ค้างตลอดที่ร่างยังอยู่ (คนแปลงร่างล่าสุดชนะ)
  activeMusic(engine) {
    let best = null;
    for (const p of engine.alivePlayers()) {
      if (!gepardOn(p)) continue;
      if (!best || (p.transformAt || 0) > best.at) best = { music: MUSIC, at: p.transformAt || 0 };
    }
    return best;
  },

  attackSound(p) {
    return gepardOn(p) ? "cayenne_gun" : undefined;
  },

  publicState(p) {
    if (!isCay(p)) return undefined;
    return {
      ammo: ammoOf(p),
      ammoMax: AMMO_MAX,
      morale: p.cayMorale || 0,
      moraleNeed: MORALE_NEED,
      gepard: gepardOn(p),
      barrage: !!p.cayBarrage,
      barrageShot: p.cayBarrageShot || 0,
      barrageHits: BARRAGE_HITS,
      pending: pendingTotal(p),
      pistolRound: p.cayPistolRound || 0,
    };
  },

  // ---------- useSkill: ด่านเงื่อนไขก่อนหักแต้ม ----------
  canUseSkill(engine, p, tier) {
    if (!isCay(p)) return true;
    if (tier === "basic") return p.cayPistolRound !== engine.roundNumber;
    if (tier === "secondary") return gepardOn(p) && !p.cayBarrage && ammoOf(p) >= BARRAGE_AMMO;
    if (tier === "ultimate") return gepardOn(p) && ammoOf(p) >= MISSILE_AMMO;
    return false;
  },

  // ---------- useSkill: ลงผลของสกิล (หลังหักแต้มแล้ว) ----------
  applyInstantSkill(engine, p, tier) {
    if (!isCay(p)) return "";
    if (tier === "basic") return this.applyPistol(engine, p);
    if (tier === "secondary") return this.applyBarrage(engine, p);
    if (tier === "ultimate") return this.applyMissileCast(engine, p);
    return "";
  },

  // ---------- สกิลพื้นฐาน ปืนพกหน่วยรบ ----------
  applyPistol(engine, p) {
    p.cayPistolRound = engine.roundNumber;
    const before = ammoOf(p);
    p.cayAmmo = Math.min(AMMO_MAX, before + PISTOL_AMMO);
    const gotAmmo = p.cayAmmo - before;
    p.statuses.cayPistol = 1;
    const parts = [`กระสุน +${gotAmmo} (${p.cayAmmo}/${AMMO_MAX})`];
    if (!gepardOn(p)) {
      p.cayMorale = Math.min(MORALE_NEED, (p.cayMorale || 0) + PISTOL_MORALE);
      parts.push(`แรงใจ ${p.cayMorale}/${MORALE_NEED}`);
      if (p.cayMorale >= MORALE_NEED) this.transform(engine, p);
    }
    engine.log(`🔫 ${p.name} ปืนพกหน่วยรบ — ${parts.join(" · ")} · ติด "ปืนพก" (โจมตีปกติครั้งถัดไปฟื้นพลังชีวิต ${PISTOL_HEAL})`);
    return ` — ${parts.join(" · ")}`;
  },

  // ---------- สกิลติดตัว 2: แรงใจครบ 5 -> เกพาร์ด ----------
  transform(engine, p) {
    p.cayMorale = 0;
    p.statuses.cayGepard = GEPARD_TURNS;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "cayGepard");
    engine.log(`🛡️ ${p.name} ร่วมร่างสหายแห่งเทพ — แรงใจครบ ${MORALE_NEED}! แปลงร่างเป็น "เกพาร์ด" ${GEPARD_TURNS} เทิร์น`);
  },
  onGepardExpire(engine, p) {
    if (!isCay(p)) return;
    p.cayMorale = 0;
    engine.log(`🛡️ ${p.name} ร่าง "เกพาร์ด" หมดเวลา — แรงใจเริ่มสะสมใหม่จาก 0`);
  },

  // ---------- สกิลรอง แน่จริงก็หลบสิ ----------
  //  ทำงานก่อนเปิดไพ่ = บรรจุกระสุนไว้ แล้วออกฤทธิ์ตอนโจมตีปกติจริงในเฟส ATTACK
  applyBarrage(engine, p) {
    p.cayAmmo = ammoOf(p) - BARRAGE_AMMO;
    p.cayBarrage = true;
    engine.log(`🎯 ${p.name} แน่จริงก็หลบสิ — การโจมตีปกติครั้งถัดไปจะกลายเป็นการโจมตี ${BARRAGE_HITS} ครั้งติดกัน (กระสุนเหลือ ${p.cayAmmo}/${AMMO_MAX})`);
    return ` — กระสุนเหลือ ${p.cayAmmo}/${AMMO_MAX}`;
  },
  barrageLoaded(p) { return isCay(p) && !!p.cayBarrage; },
  // วีดีโอ "แน่จริงก็หลบสิ" ยังไม่เคยเล่นในเกมนี้ -> doAttack ต้องเล่นก่อนแล้วค่อยเกิดความเสียหาย
  //  _cayBarrageVideo กันวนซ้ำ: doAttack ถูกเรียกใหม่หลังวีดีโอจบ (หรือทันทีถ้าไม่มีคลิปให้เล่น)
  barrageNeedsVideo(p) {
    return this.barrageLoaded(p) && !p._cayBarrageVideo && !(p.cutsceneShown && p.cutsceneShown.cayBarrage);
  },
  startBarrageVideo(engine, p) {
    p._cayBarrageVideo = true;
    engine.triggerCutscene(p, "cayBarrage");
  },
  // doAttack: หมัดนี้เป็นการโจมตีครั้งที่เท่าไหร่ของชุด (0 = โจมตีปกติธรรมดา)
  //  ครั้งแรก = ใช้ชุดกระสุนที่บรรจุไว้ · ครั้งที่ 2-3 เปิดมาจาก continueBarrage
  beginBarrageShot(engine, p, targetId) {
    if (!isCay(p)) return 0;
    if (p.cayBarrage) {
      p.cayBarrage = false;
      p.cayBarrageShot = 1;
      // วีดีโอเพิ่งเล่นไปตอนเข้า doAttack -> ไม่ต้องแจ้งซ้ำ · เล่นไปแล้วในเกมนี้ -> ขึ้นการ์ดแจ้งเตือนเล็กแทน
      if (p._cayBarrageVideo) p._cayBarrageVideo = false;
      else engine.triggerCutscene(p, "cayBarrage");
    }
    if (p.cayBarrageShot > 0) p.cayBarrageTargetId = targetId || null;
    return p.cayBarrageShot || 0;
  },

  // ชุดกระสุนยิงไม่ครบ -> เปิดเฟสโจมตีครั้งถัดไป (เรียกจากต้น endTurn — ทุกทางจบหมัดไหลมาที่นั่น
  //  ทั้งโดน/ถูกหลบ/ถูกสะท้อน/ถูกลบล้าง จึงหลบได้ทีละครั้งเสมอ) คืน true = เปิดเฟสโจมตีแล้ว ผู้เรียกต้อง return
  continueBarrage(engine) {
    for (const p of Object.values(engine.players)) {
      if (!isCay(p) || !(p.cayBarrageShot > 0)) continue;
      const next = p.cayBarrageShot + 1;
      const stop = (msg) => { p.cayBarrageShot = 0; p.cayBarrageTargetId = null; if (msg) engine.log(msg); };
      if (!p.alive || next > BARRAGE_HITS) { stop(); continue; }
      if (next === BARRAGE_HITS && Math.random() >= BARRAGE_LAST_CHANCE) {
        stop(`🎯 ${p.name} แน่จริงก็หลบสิ — ครั้งที่ ${next} ไม่ลั่นไก (โอกาส ${Math.round(BARRAGE_LAST_CHANCE * 100)}%)`);
        continue;
      }
      if (!engine.attackableTargets(p.id).length) { stop(); continue; }
      p.cayBarrageShot = next;
      engine.log(`🎯 ${p.name} แน่จริงก็หลบสิ — ยิงต่อครั้งที่ ${next}/${BARRAGE_HITS}`);
      engine.setAttackerId(p.id);
      engine.setGameState("ATTACK");
      engine.startPhaseTimer(engine.ATTACK_TIME, () => {
        // หมดเวลาเลือก: ยิงเป้าหมายเดิมถ้ายังเล็งได้ ไม่งั้นสุ่ม
        const t = engine.attackableTargets(engine.attackerId);
        if (!t.length) { engine.endTurn(); return; }
        const same = t.find((x) => x.id === p.cayBarrageTargetId);
        engine.doAttack(engine.attackerId, (same || t[Math.floor(Math.random() * t.length)]).id);
      });
      engine.broadcastState();
      return true;
    }
    return false;
  },

  // ความเสียหายต่อ 1 ครั้ง: 1 หน่วยคงที่ — บัฟฝั่งผู้ยิงไม่มีผล แต่ดีบัฟ/บัฟป้องกันของเป้าหมายมีผล
  bulletDamage(engine, target) {
    const sup = engine.CHAR_HOOKS.the_supplicant;
    let dmg = BULLET_DMG;
    const guard = ((target.statuses.guard || 0) > 0 ? (engine.statusAmtOf(target, "guard") || 1) : 0)
      + sup.statusAmtBonus(target, "guard");
    if (guard > 0) dmg = Math.max(0, dmg - guard);
    if ((target.statuses.discord || 0) > 0) dmg += 1;
    dmg += engine.statusAmtOf(target, "fragile") + sup.statusAmtBonus(target, "fragile");
    dmg += engine.statusAmtOf(target, "yunaDelete");
    const smile = engine.statusAmtOf(target, "yunaSmile");
    if (smile > 0) dmg = Math.max(0, dmg - smile);
    if ((target.statuses.fullbelly || 0) > 0) dmg = Math.max(0, dmg - 1);
    return Math.max(0, dmg);
  },

  // เกพาร์ด: โจมตีปกติแต่ละครั้งที่เข้าเป้ามีโอกาส 30% แปะ "เปราะบาง"
  //  แปะหลังความเสียหายของครั้งนั้นลงแล้วเสมอ -> มีผลตั้งแต่การโจมตีครั้งถัดไป
  rollFragile(engine, attacker, target) {
    if (!gepardOn(attacker) || !target || !target.alive) return false;
    if (Math.random() >= FRAGILE_CHANCE) return false;
    return !!engine.applyDebuff(target, "fragile", FRAGILE_AMT, FRAGILE_TURNS);
  },

  // ---------- doAttack: หลังลงความเสียหายของหมัดนี้แล้ว (หมัดที่ถูกหลบไม่มาถึงตรงนี้) ----------
  //  shot = ครั้งที่ของชุดกระสุน (0 = โจมตีปกติธรรมดา) · คืน null ถ้าไม่ใช่คาเยนน์
  afterMainHit(engine, attacker, target, shot) {
    if (!isCay(attacker)) return null;
    const res = { shot: shot || 0, fragile: this.rollFragile(engine, attacker, target), heal: 0 };
    // ปืนพก: การโจมตีปกติเข้าเป้า -> ฟื้นพลังชีวิต 3 (ครั้งเดียวแล้วหมด)
    if ((attacker.statuses.cayPistol || 0) > 0) {
      delete attacker.statuses.cayPistol;
      res.heal = engine.healHp(attacker, PISTOL_HEAL);
      engine.log(`🔫 ${attacker.name} ปืนพก — ฟื้นพลังชีวิต +${res.heal}`);
    }
    if (res.fragile) engine.log(`💔 ${attacker.name} เกพาร์ด — ${target.name} ติด "เปราะบาง"`);
    return res;
  },

  attackFx(engine, attacker, res) {
    if (!res) return [];
    const color = engine.colorOf(attacker);
    const out = [];
    if (res.shot > 0) out.push({ name: `แน่จริงก็หลบสิ — ครั้งที่ ${res.shot}/${BARRAGE_HITS}`, img: IMG.skill2, by: attacker.name, color, side: "atk" });
    if (res.fragile) out.push({ name: "เกพาร์ด — แปะเปราะบาง (มีผลครั้งถัดไป)", img: IMG.gepard, by: attacker.name, color, side: "atk" });
    if (res.heal > 0) out.push({ name: `ปืนพก — ฟื้นพลังชีวิต +${res.heal}`, img: IMG.skill1, by: attacker.name, color, side: "atk" });
    return out;
  },

  // ---------- ท่าไม้ตาย มิสไซล์แห่งคำอำลา ----------
  //  กดแล้วหักกระสุน + คิววีดีโอ · ความเสียหายลงหลังวีดีโอจบ (server เรียก fireMissiles)
  applyMissileCast(engine, p) {
    p.cayAmmo = ammoOf(p) - MISSILE_AMMO;
    engine.triggerCutscene(p, "cayMissile");
    return ` — กระสุนเหลือ ${p.cayAmmo}/${AMMO_MAX}`;
  },
  missileTargets(engine, p) {
    return engine.alivePlayers().filter((t) => t.id !== p.id && !engine.sameTeam(p, t) && !engine.sealActive(t));
  },
  // สุ่มทีละลูก: แต่ละลูกเลือกเป้าที่ยังไม่เต็มเพดาน 4 ลูกแบบเท่าๆ กัน
  rollMissiles(targets) {
    const hits = new Map(targets.map((t) => [t.id, 0]));
    for (let i = 0; i < MISSILES; i++) {
      const open = targets.filter((t) => hits.get(t.id) < MISSILE_CAP);
      if (!open.length) break;
      const t = open[Math.floor(Math.random() * open.length)];
      hits.set(t.id, hits.get(t.id) + 1);
    }
    return hits;
  },
  fireMissiles(engine, p) {
    if (!isCay(p) || !p.alive) return [];
    const targets = this.missileTargets(engine, p);
    if (!targets.length) {
      engine.log(`🚀 ${p.name} มิสไซล์แห่งคำอำลา — ไม่มีเป้าหมายบนสนาม`);
      return [];
    }
    const hits = this.rollMissiles(targets);
    const results = [];
    engine.withEffectSource(p, () => {
      for (const t of targets) {
        const n = hits.get(t.id) || 0;
        if (n <= 0 || !t.alive) continue;
        engine.dealMixed(t, n);
        engine.resolveDamageAftermath(t);
        results.push({ id: t.id, name: t.name, n });
        if (!t.alive) engine.log(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
      }
    });
    const summary = results.map((r) => `${r.name} -${r.n}`).join(" · ");
    engine.log(`🚀 ${p.name} มิสไซล์แห่งคำอำลา — ยิงมิสไซล์ ${MISSILES} ลูกขึ้นฟ้า: ${summary || "ไม่โดนใครเลย"}`);
    return results;
  },

  // ---------- สกิลติดตัว ทหารผ่านศึก: ไม่ใช่เกพาร์ด = ความเสียหายที่ได้รับเลื่อนไปเทิร์นถัดไป ----------
  //  เรียกจาก adjustIncomingDamage() ของ server — kind = ช่องทางที่ส่งมา ("direct"/"armor"/"mixed")
  //  คืน 0 = ถูกเลื่อน · ครอบคลุมทุกช่องทางรวมดาเมจจากสถานะ
  adjustIncomingDamage(engine, p, n, isNormalAttack, kind) {
    if (!isCay(p) || !(n > 0) || p._cayNoDelay || gepardOn(p) || !p.alive) return n;
    if (engine.passiveSealed(p)) return n;
    this.queueDelayed(engine, p, { n, fromId: engine.effectSourceId || null, kind: kind || "mixed", normal: !!isNormalAttack });
    return 0;
  },
  // ความเสียหายแบบ damageSoft (แพ้จั่ว/ไพ่แตก ฯลฯ ทีละ 1) — server เรียกก่อนลงผลจริง คืน true = ถูกเลื่อน
  delaySoft(engine, p) {
    if (!isCay(p) || p._cayNoDelay || gepardOn(p) || !p.alive) return false;
    if (engine.passiveSealed(p)) return false;
    this.queueDelayed(engine, p, { n: 1, fromId: engine.effectSourceId || null, kind: "soft", normal: false });
    return true;
  },
  queueDelayed(engine, p, entry) {
    p.cayPending = Array.isArray(p.cayPending) ? p.cayPending : [];
    // ดาเมจ damageSoft มาทีละ 1 — รวมก้อนกับก้อนก่อนหน้าชนิดเดียวกันจากคนเดิมเพื่อไม่ให้ log ท่วม
    const last = p.cayPending[p.cayPending.length - 1];
    if (entry.kind === "soft" && last && last.kind === "soft" && last.fromId === entry.fromId) last.n += entry.n;
    else p.cayPending.push(entry);
    if (entry.kind !== "soft" || !last || last.kind !== "soft") {
      engine.log(`⏳ ${p.name} ทหารผ่านศึก — ความเสียหาย ${entry.n} หน่วยถูกเลื่อนไปลงผลเทิร์นถัดไป`);
    }
  },
  onRoundStartTick(engine, p) {
    if (!isCay(p)) return;
    // ชุดกระสุนเป็นของเทิร์นก่อน — เริ่มเทิร์นใหม่แล้วต้องไม่ค้าง (กันการโจมตีปกติครั้งหน้ากลายเป็นกระสุนไปเอง)
    p.cayBarrageShot = 0;
    p.cayBarrageTargetId = null;
    if (!p.alive) return;
    this.resolvePendingDamage(engine, p);
  },
  resolvePendingDamage(engine, p) {
    const queue = Array.isArray(p.cayPending) ? p.cayPending : [];
    if (!queue.length) return;
    p.cayPending = [];
    const total = queue.reduce((s, it) => s + it.n, 0);
    engine.log(`⏳💥 ${p.name} ทหารผ่านศึก — ความเสียหายที่เลื่อนไว้ ${total} หน่วยลงผลตอนนี้`);
    for (const it of queue) {
      if (!p.alive) break;
      const from = it.fromId && engine.players[it.fromId];
      engine.withEffectSource(from || null, () => {
        p._cayNoDelay = true; // กันเลื่อนซ้ำวนไม่จบ
        try {
          if (it.kind === "soft") for (let i = 0; i < it.n && p.alive; i++) engine.damageSoft(p);
          else if (it.kind === "direct") engine.dealDirect(p, it.n, it.normal);
          else if (it.kind === "armor") engine.dealArmorOnly(p, it.n, it.normal);
          else engine.dealMixed(p, it.n, it.normal);
        } finally {
          p._cayNoDelay = false;
        }
        engine.resolveDamageAftermath(p);
      });
    }
    if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
  },
  // ป้ายฝั่งป้องกันใต้อนิเมชันโจมตี: หมัดนี้ถูกเลื่อนไปเทิร์นหน้าแทนที่จะลงทันที
  delayFx(engine, target, pendingBefore) {
    const moved = pendingTotal(target) - (pendingBefore || 0);
    if (!(moved > 0)) return null;
    return { name: `ทหารผ่านศึก — ความเสียหาย ${moved} หน่วยเลื่อนไปเทิร์นหน้า`, img: IMG.base, by: target.name, color: engine.colorOf(target), side: "def" };
  },
};
