// ============================================================
//  โทโนะ ชิกิ (rework · ยาก · เลือกได้คนเดียวต่อเกม)
//
//  สกิลพื้นฐาน ขอบคุณอาจารย์มากๆ (0 แต้ม · ก่อนเปิดการ์ด · สลับได้ไม่จำกัด ไม่นับโควตาสกิลของเทิร์น)
//    "ใจเย็น" (ค่าเริ่มต้น): โจมตีปกติโดน = ฟื้นพลังชีวิต 1 · สกิลติดตัว 2 ทำงาน · สกิลติดตัว 1 ไม่ทำงาน
//    "เดือดดาล": สกิลติดตัว 1 ทำงาน · สกิลติดตัว 2 ไม่ทำงาน · หลบหลีก 15%
//  สกิลรอง เชือดเฉือน (4) — กดไม่ได้ถ้ามี "หลับให้สบาย" · ได้ "จบสิ้นซะ" (อยู่จนกว่าจะได้โจมตี)
//    ตอนได้โจมตี: พลังโจมตี -1 และโจมตีปกติ 4 ครั้ง (เลือกเป้าใหม่ได้ทุกครั้ง · ตี 0 ก็นับว่าตีโดน)
//  ท่าไม้ตาย มองเห็นแล้ว!! (6) — กดไม่ได้ถ้ามี "จบสิ้นซะ" · ได้ "หลับให้สบาย" (อยู่จนกว่าจะได้โจมตี)
//    + "แม่นยำ" 1 เทิร์น (บัฟ Universal เจาะการหลบทุกแบบ) · ภาพเปลี่ยนเป็น tohno_death ระหว่างรอ
//    การโจมตีครั้งถัดไป: พลังโจมตี +1 แล้วระเบิดรอยร้าวทั้งหมดบนเป้า = ดาเมจ +จำนวนรอยร้าว (รอยร้าวหมด)
//    ระเบิดแล้วรอยร้าวถูกใช้ไปเสมอ แม้โล่กันครั้งจะรับดาเมจไว้ · โดนหลบ = ท่าหายแต่รอยร้าวยังอยู่
//  สกิลติดตัว 1 Mystic eye of death perception (อ่อน) — ตีโดน = รอยร้าว +1 บนเป้า (สูงสุด 8 · ถูกหลบไม่ขึ้น)
//    รอยร้าวลด 1 ขั้นทุก 10 เทิร์น (เพิ่มเมื่อไหร่เริ่มนับใหม่) · เก็บที่ตัวเป้า t.tohnoCrack (ทุกคนเห็น)
//  สกิลติดตัว 2 ตระกูลโทโนะ — หลบหลีก 5% · ตีโดนแล้ว 10% ได้โจมตีอีกครั้ง (ต่อเป็นลูกโซ่ได้ เพดาน CHAIN_CAP)
//    ระหว่างเชือดเฉือน ทอยเฉพาะครั้งที่ 4 · ครั้งที่ได้เพิ่มจากไม้ตายเป็นการตีธรรมดา (ไม่ระเบิดซ้ำ)
//
//  การโจมตีต่อเนื่อง (เชือดเฉือน/ตีเพิ่ม) เปิดจากหัว endTurn (continueAttack) แบบเดียวกับคาเยนน์
//  เพราะหมัดที่ถูกหลบ return ตั้งแต่ด่านหลบ ไม่ผ่าน postAttackFollowup — ถูกหลบก็ยังตีต่อได้ครบ
// ============================================================

const ID = "tohno";
const DIR = "/characters/tohno";
const UPD = `${DIR}/tohno_update`;

const MODES = { calm: "ใจเย็น", rage: "เดือดดาล" };
const CALM_HEAL = 1;
const RAGE_DODGE = 15;
const CLAN_DODGE = 5;
const CLAN_EXTRA_CHANCE = 0.10;
const CHAIN_CAP = 5;
const FINISH_HITS = 4;
const FINISH_ATK = -1;
const REST_ATK = 1;
const CRACK_MAX = 8;
const CRACK_DECAY_TURNS = 10;
const VOICE_GAP_MS = 1500; // เสียงร้องตอนโดนตี: สกิลเดียวลงหลายก้อน = ร้องครั้งเดียว

const IMG = {
  base: `${DIR}/tohno.webp`,
  death: `${DIR}/tohno_death.jpg`,
  basic: `${DIR}/tohno_skill1.webp`,
  secondary: `${UPD}/tohno_skill2.jpg`,
  ultimate: `${UPD}/tohno_skill3.jpg`,
};
// คีย์เสียงฝั่ง client (client/src/audio.js)
const SFX = {
  hit: "tohno_hit",
  hitVoice: ["tohno_voice_hit1", "tohno_voice_hit2", "tohno_voice_hit3", "tohno_voice_hit4", "tohno_voice_hit5", "tohno_voice_hit6"],
  hurt: ["tohno_hurt1", "tohno_hurt2"],
  skill: ["tohno_skill1", "tohno_skill2"],
};

const isTohno = (p) => !!p && p.characterId === ID && !!p.tohno;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function freshState() {
  return {
    mode: "calm",
    finish: false,        // "จบสิ้นซะ" รอการโจมตี
    rest: false,          // "หลับให้สบาย" รอการโจมตี
    seq: null,            // ชุดเชือดเฉือนที่กำลังตี { hit } (1..FINISH_HITS)
    burst: false,         // หมัดนี้คือหมัดระเบิดรอยร้าว (ใช้ "หลับให้สบาย" ไปแล้ว)
    plain: false,         // หมัดนี้เป็นการตีธรรมดา (ไม่ใช่ผลของสกิล) — ใช้เลือกเสียงฟัน
    voice: null,          // เสียงพากย์ของหมัดนี้ (สุ่มครั้งเดียวต่อหมัด · ทุกหมัดรวมหมัดของสกิล)
    extraPending: false,  // ตระกูลโทโนะ: ได้ตีอีกครั้ง (เปิดที่ continueAttack)
    hurtPending: null,    // เสียงร้องที่โดนระหว่างเฟสโจมตี — รอขึ้นพร้อมการ์ดสรุป (ไม่ทับคลิปที่คิวไว้)
    ultVideo: false,      // กดไม้ตายครั้งนี้เล่นวีดีโอเต็ม = ไม่เล่นเสียงพากย์สกิลทับ
    chain: 0,             // จำนวนครั้งที่ได้ตีเพิ่มในเทิร์นนี้
    voiceAt: 0,
  };
}

module.exports = {
  id: ID,
  IMG, SFX, MODES,
  CALM_HEAL, RAGE_DODGE, CLAN_DODGE, CLAN_EXTRA_CHANCE, CHAIN_CAP, FINISH_HITS, CRACK_MAX, CRACK_DECAY_TURNS,
  DEATH_IMG: IMG.death,

  resetCombat(p) {
    p.tohno = p.characterId === ID ? freshState() : null;
    p.tohnoCrack = 0;   // รอยร้าวบนตัวผู้เล่นคนนี้ (ใครก็ติดได้)
    p.tohnoCrackAt = 0; // เทิร์นล่าสุดที่รอยร้าวเพิ่ม/ลด (เริ่มนับ 10 เทิร์นใหม่)
  },

  // ร่างระหว่างถือ "หลับให้สบาย" = tohno_death (+ ภาพซ้อนฉากหลัง/เพลงประจำตัว)
  deathForm(p) { return isTohno(p) && p.alive && p.tohno.rest; },
  displayImg(p) { return this.deathForm(p) ? IMG.death : null; },
  dodgeChance(p) {
    if (!isTohno(p)) return 0;
    return p.tohno.mode === "rage" ? RAGE_DODGE : CLAN_DODGE;
  },

  // ---------- สกิล ----------
  validateBasicItem(item) { return item === "calm" || item === "rage"; },
  canUseSkill(engine, p, tier) {
    if (!isTohno(p)) return true;
    const t = p.tohno;
    if (tier === "secondary") return !t.finish && !t.rest;
    if (tier === "ultimate") return !t.rest && !t.finish;
    return true;
  },
  // เสียงพากย์ตอนกด — ไม้ตายที่เพิ่งเล่นวีดีโอเต็ม (ครั้งแรกของเกม) ไม่เล่นทับคลิป
  skillSound(p, tier) {
    if (tier === "ultimate" && isTohno(p) && p.tohno.ultVideo) return null;
    return tier === "secondary" || tier === "ultimate" ? pick(SFX.skill) : null;
  },
  applyInstantSkill(engine, p, tier, item) {
    if (!isTohno(p)) return "";
    const t = p.tohno;
    if (tier === "basic") {
      t.mode = item === "rage" ? "rage" : "calm";
      engine.log(t.mode === "rage"
        ? `🔪 ${p.name} ขอบคุณอาจารย์มากๆ — "เดือดดาล": ตีโดนสร้างรอยร้าว · หลบหลีก ${RAGE_DODGE}%`
        : `🔪 ${p.name} ขอบคุณอาจารย์มากๆ — "ใจเย็น": ตีโดนฟื้นพลังชีวิต +${CALM_HEAL} · หลบหลีก ${CLAN_DODGE}% · ${Math.round(CLAN_EXTRA_CHANCE * 100)}% ได้ตีอีกครั้ง`);
      return ` — ${MODES[t.mode]}`;
    }
    if (tier === "secondary") {
      t.finish = true;
      engine.log(`🔪 ${p.name} เชือดเฉือน — ได้ "จบสิ้นซะ": ครั้งถัดไปที่ได้โจมตี พลังโจมตี -1 แต่ตีได้ ${FINISH_HITS} ครั้ง`);
      return " — จบสิ้นซะ";
    }
    if (tier === "ultimate") {
      t.rest = true;
      engine.applyBuff(p, "accurate", null, 1);
      p.transformAt = engine.nextTransformCounter(); // ภาพ/เพลงร่างนี้ใช้ลำดับล่าสุด
      t.ultVideo = !(p.cutsceneShown && p.cutsceneShown.tohnoSkill1);
      engine.triggerCutscene(p, "tohnoSkill1"); // ครั้งแรกวีดีโอเต็ม ครั้งต่อไปแจ้งเตือน
      engine.log(`👁️ ${p.name} มองเห็นแล้ว!! — ได้ "หลับให้สบาย" และ "แม่นยำ" 1 เทิร์น: การโจมตีครั้งถัดไปพลังโจมตี +${REST_ATK} และระเบิดรอยร้าวบนเป้าหมาย`);
      return " — หลับให้สบาย · แม่นยำ";
    }
    return "";
  },

  // ---------- การโจมตีปกติ ----------
  // เรียกที่หัว doAttack() (ก่อนด่านหลบทั้งหมด): ตัดสินว่าหมัดนี้เป็นหมัดแบบไหน แล้วใช้สถานะที่รอไว้
  beginAttack(engine, a) {
    if (!isTohno(a)) return;
    const t = a.tohno;
    t.burst = false;
    t.plain = false;
    t.voice = pick(SFX.hitVoice);
    if (t.seq) return; // หมัดถัดไปของชุดเชือดเฉือน (continueAttack ขยับเลขครั้งแล้ว)
    if (t.finish) {
      t.finish = false;
      t.seq = { hit: 1 };
      engine.log(`🔪 ${a.name} จบสิ้นซะ — เชือดเฉือนครั้งที่ 1/${FINISH_HITS}`);
      return;
    }
    if (t.rest) {
      t.rest = false;
      t.burst = true;
      return;
    }
    t.plain = true;
  },
  // อ่านสถานะล้วน (computeAttackBase ถูกเรียกจาก buildStateFor ด้วย — ห้ามแก้ state ตรงนี้)
  damageBonus(engine, attacker) {
    if (!isTohno(attacker)) return 0;
    return (attacker.tohno.seq ? FINISH_ATK : 0) + (attacker.tohno.burst ? REST_ATK : 0);
  },
  attackSound(p) { return isTohno(p) && p.tohno.plain ? SFX.hit : undefined; },
  attackVoice(p) { return isTohno(p) && p.tohno.voice ? p.tohno.voice : undefined; },

  // ผ่านด่านหลบมาแล้ว — ระเบิดรอยร้าว (หมัดของ "หลับให้สบาย") · คืนดาเมจใหม่
  applyBurst(engine, attacker, target, dmg, fx) {
    if (!isTohno(attacker) || !attacker.tohno.burst) return dmg;
    attacker.tohno.burst = false;
    const n = target.tohnoCrack || 0;
    target.tohnoCrack = 0;
    target.tohnoCrackAt = engine.roundNumber;
    fx.cracks = n;
    fx.fired = true;
    engine.queueCutscene(attacker, "tohnoBurst"); // เล่นทุกครั้ง ก่อนการ์ดสรุปความเสียหาย
    fx.videoQueued = true;
    engine.log(`👁️💥 ${attacker.name} มองเห็นแล้ว!! — ระเบิดรอยร้าว ${n} ขั้นบนตัว ${target.name} (ดาเมจ +${n})`);
    return dmg + n;
  },

  // หมัดลงแล้ว (หลังดาเมจ · ตี 0 ก็นับ) — คืนชื่อเอฟเฟกต์ไว้โชว์บนการ์ดสรุป
  onAttackLanded(engine, attacker, target) {
    if (!isTohno(attacker)) return [];
    const t = attacker.tohno;
    const fx = [];
    if (t.mode === "calm") {
      const h = engine.healHp(attacker, CALM_HEAL);
      if (h > 0) fx.push(`ใจเย็น — ฟื้นพลังชีวิต +${h}`);
      // ตระกูลโทโนะ: ระหว่างชุดเชือดเฉือน ทอยเฉพาะครั้งสุดท้าย
      const lastOfSeq = !t.seq || t.seq.hit >= FINISH_HITS;
      if (lastOfSeq && t.chain < CHAIN_CAP && Math.random() < CLAN_EXTRA_CHANCE) {
        t.extraPending = true;
        fx.push("ตระกูลโทโนะ — ได้โจมตีอีกครั้ง!");
        engine.log(`🔪 ${attacker.name} ตระกูลโทโนะ — ได้โจมตีอีกครั้ง!`);
      }
    } else if (target && target.alive) {
      const before = target.tohnoCrack || 0;
      target.tohnoCrack = Math.min(CRACK_MAX, before + 1);
      target.tohnoCrackAt = engine.roundNumber;
      fx.push(`Mystic eye — รอยร้าว ${target.tohnoCrack}/${CRACK_MAX}`);
      engine.log(`👁️ ${attacker.name} Mystic eye of death perception — รอยร้าวบนตัว ${target.name} ${target.tohnoCrack}/${CRACK_MAX}`);
    }
    return fx;
  },

  // โทโนะถูกโจมตีปกติ: หลบหลีก (ใจเย็น 5% / เดือดดาล 15%) — แพทเทิร์นเดียวกับ Mark 5 ของสไตรเกอร์
  tryAttackDodge(engine, attacker, target) {
    if (!isTohno(target) || !target.alive) return false;
    const pct = this.dodgeChance(target);
    if (Math.random() * 100 >= pct) return false;
    const src = target.tohno.mode === "rage" ? "เดือดดาล" : "ตระกูลโทโนะ";
    target.wasAttacked = true;
    engine.log(`💨 หลบหลีก! ${target.name} หลบการโจมตีของ ${attacker.name} ได้ (${src} · ${pct}%)`);
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.colorOf(attacker),
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.colorOf(target),
      dmg: 0, dodge: true,
      skills: [{ name: `${src} — หลบหลีก (${pct}%)`, img: IMG.base, by: target.name, color: engine.colorOf(target), side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // ได้รับความเสียหายจากคนอื่น (ทุกชนิด) -> ร้องเสียงเจ็บ · ไม่แก้ค่าดาเมจ
  //  ระหว่างเฟสโจมตี ดาเมจลงก่อนคลิปที่คิวไว้ (สวนกลับ/หมัดพิเศษ) -> เก็บเสียงไว้เล่นพร้อมการ์ดสรุปแทน ไม่ให้ทับคลิป
  adjustIncomingDamage(engine, p, n) {
    if (!isTohno(p) || !p.alive || !(n > 0)) return n;
    const src = engine.effectSourceId;
    if (!src || src === p.id) return n;
    if (engine.gameState === "ATTACK" || engine.gameState === "ATTACKING") {
      if (!p.tohno.hurtPending) p.tohno.hurtPending = pick(SFX.hurt);
      return n;
    }
    const now = Date.now();
    if (now - (p.tohno.voiceAt || 0) >= VOICE_GAP_MS) {
      p.tohno.voiceAt = now;
      engine.sfx(pick(SFX.hurt));
    }
    return n;
  },

  // เสียงร้องที่รอขึ้นการ์ดสรุป — ดึงแล้วล้าง (โทโนะมีได้คนเดียวต่อเกม)
  takeHurtVoice(engine) {
    let v;
    for (const p of Object.values(engine.players)) {
      if (!isTohno(p) || !p.tohno.hurtPending) continue;
      v = v || p.tohno.hurtPending;
      p.tohno.hurtPending = null;
    }
    return v;
  },

  // ---------- โจมตีต่อ (เรียกจากหัว endTurn — ทุกทางจบหมัดไหลมาที่นี่) ----------
  //  คืน true = เปิดเฟส ATTACK ใหม่แล้ว (ผู้เรียกต้อง return)
  continueAttack(engine) {
    // ดาเมจที่ลงหลังการ์ดสรุปไปแล้ว (เช่น สวนกลับที่ลงตอนจบหมัด) ไม่มีการ์ดให้เกาะ -> ร้องตอนนี้เลย
    engine.sfx(this.takeHurtVoice(engine));
    for (const p of Object.values(engine.players)) {
      if (!isTohno(p)) continue;
      const t = p.tohno;
      if (!t.seq && !t.extraPending) continue;
      const canHit = p.alive && engine.attackableTargets(p.id).length > 0;
      if (t.seq && t.seq.hit < FINISH_HITS && canHit) {
        t.seq.hit++;
        engine.log(`🔪 ${p.name} จบสิ้นซะ — เชือดเฉือนครั้งที่ ${t.seq.hit}/${FINISH_HITS}`);
        this.openAttack(engine, p);
        return true;
      }
      t.seq = null;
      if (t.extraPending) {
        t.extraPending = false;
        if (canHit && t.chain < CHAIN_CAP) {
          t.chain++;
          this.openAttack(engine, p);
          return true;
        }
      }
    }
    return false;
  },
  openAttack(engine, p) {
    engine.setAttackerId(p.id);
    engine.setGameState("ATTACK");
    engine.startPhaseTimer(engine.ATTACK_TIME, () => {
      const t = engine.attackableTargets(engine.attackerId);
      if (t.length) engine.doAttack(engine.attackerId, t[Math.floor(Math.random() * t.length)].id);
      // doAttack ปฏิเสธเป้าได้ — อย่าให้เฟส ATTACK ค้าง
      if (engine.gameState === "ATTACK") engine.endTurn();
    });
    engine.broadcastState();
  },

  // ---------- ต้นเทิร์น (เรียกกับผู้เล่นทุกคน) ----------
  onRoundStartTick(engine, p) {
    // รอยร้าวค้างครบ 10 เทิร์นโดยไม่เพิ่ม -> ลด 1 ขั้น แล้วเริ่มนับใหม่
    if ((p.tohnoCrack || 0) > 0 && engine.roundNumber - (p.tohnoCrackAt || 0) >= CRACK_DECAY_TURNS) {
      p.tohnoCrack--;
      p.tohnoCrackAt = engine.roundNumber;
      engine.log(`🩹 รอยร้าวบนตัว ${p.name} จางลง 1 ขั้น (เหลือ ${p.tohnoCrack}/${CRACK_MAX})`);
    }
    if (!isTohno(p)) return;
    const t = p.tohno;
    t.seq = null;
    t.burst = false;
    t.extraPending = false;
    t.chain = 0;
  },

  // ---------- เพลง / ข้อมูลให้ client ----------
  activeMusic(engine) {
    let best = null;
    for (const p of engine.alivePlayers()) {
      if (!this.deathForm(p)) continue;
      if (!best || (p.transformAt || 0) > best.at) best = { music: "tohno", at: p.transformAt || 0 };
    }
    return best;
  },
  publicState(p) {
    if (!isTohno(p)) return undefined;
    const t = p.tohno;
    return { mode: t.mode, finish: t.finish, rest: t.rest, seqHit: t.seq ? t.seq.hit : 0, seqMax: FINISH_HITS, dodge: this.dodgeChance(p) };
  },
};
