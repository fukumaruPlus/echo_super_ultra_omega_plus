// ============================================================
//  คาซามะ ไดสุเกะ (patch 4.3 new) — CAST OFF / Clock Up / Rider Shooting
//    · สกิลติดตัว   Zect               -> ดู characters/_zect.js (ใช้ร่วมกับโซ ยากุรุมะ)
//    · สกิลพื้นฐาน  CAST OFF / PUT ON  -> สลับโหมด ฟรี (กดระหว่าง Clock Up ไม่ได้)
//    · สกิลรอง     Clock Up / Over    -> หยุดเวลาทั้งสนาม ฟรี (ต้องอยู่ใน CAST OFF)
//    · ท่าไม้ตาย    Rider Shooting     -> หมัดถัดไปล้างเกราะ 1 แล้วตีแรงขึ้น (ต้องอยู่ใน CAST OFF)
//
//  แกน CAST OFF / Clock Up / Zect อยู่ใน characters/_zect.js ทั้งหมด ไฟล์นี้เก็บเฉพาะ
//  ท่าไม้ตายกับไฟล์สื่อของตัวเอง — แก้กติกา Zect ต้องไปแก้ที่ _zect.js ที่เดียว
// ============================================================

const Z = require("./_zect");

const ID = "daisuke";

// ---------- ท่าไม้ตาย Rider Shooting ----------
const RIDER_ATK = 1;    // พลังโจมตีพื้นฐาน +1 ของหมัดนั้น
const RIDER_STRIP = 1;  // ล้างเกราะเป้าหมายได้สูงสุดกี่หน่วยก่อนลงดาเมจ

const IMG = {
  base: "/characters/daisuke/daisuke.webp",       // หน้าเลือกตัว + ฉากเปิดตัว
  putOn: "/characters/daisuke/drake_put_on.jpg",  // ร่างบนสนาม โหมด PUT ON (ค่าเริ่มต้น)
  cassOff: "/characters/daisuke/daisuke_cass_off.jpg",
  skill1: "/characters/daisuke/daisuke_skill1.png",
  skill2: "/characters/daisuke/daisuke_skill2.jpg",
  skill3: "/characters/daisuke/daisuke_skill3.jpg",
};
const VIDEO = {
  intro: "/characters/daisuke/daisuke.mp4",
  cassOff: "/characters/daisuke/daisuke_skill1.mp4",
  clockUp: "/characters/daisuke/daisuke_skill2.mp4",
  rider: "/characters/daisuke/daisuke_skill3.mp4",
};

function isDaisuke(p) { return !!p && p.characterId === ID; }
function riderArmed(p) { return isDaisuke(p) && !!p.daisukeRider; }

module.exports = {
  id: ID,
  IMG,
  VIDEO,
  RIDER_ATK,
  RIDER_STRIP,
  // ค่าคงที่ที่ server.js/เทสต์อ่านผ่านตัวละคร (มาจากแกนร่วม)
  CASS_OFF_ATK: Z.CASS_OFF_ATK,
  PUT_ON_HEAL: Z.PUT_ON_HEAL,
  PUT_ON_EVERY: Z.PUT_ON_EVERY,
  CLOCK_UP_DRAIN: Z.CLOCK_UP_DRAIN,
  CLOCK_UP_CARD_TIME: Z.CLOCK_UP_CARD_TIME,
  CLOCK_UP_SAFETY: Z.CLOCK_UP_SAFETY,
  ZECT_DODGE: Z.ZECT_DODGE,
  ZECT_MIRROR_ATK: Z.ZECT_MIRROR_ATK,
  cassOff: Z.cassOff,
  clockUpOn: Z.clockUpOn,
  clockUpHosts: Z.clockUpHosts,
  freezeHosts: Z.freezeHosts,
  canToggleClockUp: Z.canToggleClockUp,
  actionBlocked: Z.actionBlocked,
  skillBlocked: Z.skillBlocked,
  cardPhaseSeconds: Z.cardPhaseSeconds,
  onHostLockIn: Z.onHostLockIn,
  blocksArmorRegen: Z.blocksArmorRegen,
  dodgeChance: Z.dodgeChance,
  skipsTurnQuota: Z.skipsTurnQuota,
  riderArmed,

  resetCombat(p) {
    Z.resetCombat(p);
    p.daisukeRider = false; // Rider Shooting อาร์มไว้แล้วไหม (ใช้หมดเมื่อออกหมัด)
  },

  displayImg(p) {
    if (!isDaisuke(p)) return null;
    return Z.cassOff(p) ? IMG.cassOff : IMG.putOn;
  },

  // วีดีโอเปิดตัวตอนเริ่มแมตช์ (ไม่มีคำบรรยาย ตามสเปก)
  maybeQueueIntro(engine) {
    let queued = false;
    for (const p of engine.alivePlayers()) {
      if (!isDaisuke(p)) continue;
      engine.queueCutscene(p, "daisukeIntro");
      queued = true;
    }
    return queued;
  },

  // ห้องนี้ถูกเรียกจาก server.js ทั้ง daisuke และ yaguruma กับผู้เล่นทุกคน
  //  แกน Zect มอง "ไรเดอร์ทุกคน" เหมือนกัน ถ้าไม่กันไว้ตรงนี้ ค่า Clock Up จะถูกหักสองรอบ (4/เทิร์น)
  //  และตัวนับ PUT ON จะเดินสองเท่า (ฟื้นเลือดทุกๆ 1.5 เทิร์นแทนที่จะเป็น 3)
  onRoundStartTick(engine, p) {
    if (!isDaisuke(p)) return;
    Z.onRoundStartTick(engine, p, (e, q, on, why) => this.setClockUp(e, q, on, why));
  },

  tryDodge(engine, p, what) { return Z.tryDodge(engine, p, what); },

  // เรียกจาก doAttack() ก่อนคิดดาเมจ — คืน true ถ้าหลบพ้น (ผู้เรียกต้อง return ทันที)
  tryAttackDodge(engine, attacker, target) {
    if (!isDaisuke(target)) return false;
    if (!Z.tryDodge(engine, target, `การโจมตีของ ${attacker.name}`)) return false;
    target.wasAttacked = true;
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, dodge: true,
      skills: [{ name: `Zect (${Z.ZECT_DODGE}%)`, img: IMG.cassOff, by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // ดาเมจ contribution: แกนร่วม (CAST OFF +1 · ตีไรเดอร์ที่ Clock Up ด้วยกัน +1) + ไรเดอร์ชูต +1
  damageBonus(engine, attacker, target, ctx) {
    if (!isDaisuke(attacker)) return 0;
    const rider = riderArmed(attacker);
    if (ctx) ctx.daisukeRider = rider;
    return Z.sharedDamageBonus(attacker, target, ctx) + (rider ? RIDER_ATK : 0);
  },

  // ---------- Rider Shooting: ล้างเกราะก่อนดาเมจปกติ ----------
  //  เกราะที่ล้างหายไปเฉยๆ ไม่ได้ซับดาเมจ แต่เกราะที่เหลือยังกันดาเมจตามปกติ
  //  ไม่มีเกราะให้ล้าง = ไม่เกิดอะไร เป็นการโจมตีปกติที่แรงขึ้นเฉยๆ
  //  วีดีโอเล่นทุกครั้งที่ออกหมัด (queueCutscene ไม่ใช่ triggerCutscene)
  stripArmorOnAttack(engine, attacker, target) {
    if (!riderArmed(attacker) || !target || !target.alive) return 0;
    const before = target.armor || 0;
    // Recruit [Armor]: ล้างเกราะก็นับเป็น "โดน 1 ครั้ง" (ครบ 2 ถึงลด 1) ไม่ใช่ล้างตามจำนวน
    const absorbed = engine.CHAR_HOOKS.recruit.absorbHit(engine, target);
    const strip = absorbed ? 0 : Math.min(RIDER_STRIP, before);
    for (let i = 0; i < strip; i++) engine.loseArmor(target);
    engine.queueCutscene(attacker, "daisukeRider");
    engine.log(strip > 0
      ? `🎯 ${attacker.name} RIDER SHOOTING! — เกราะของ ${target.name} ถูกล้างออก ${strip} หน่วยก่อนหมัดจะลง`
      : `🎯 ${attacker.name} RIDER SHOOTING! — ${target.name} ไม่มีเกราะให้ล้าง หมัดลงเต็มๆ ทันที`);
    return strip;
  },

  consumeRiderOnAttack(engine, attacker) {
    if (!riderArmed(attacker)) return;
    attacker.daisukeRider = false;
    engine.log(`🎯 ${attacker.name} ไรเดอร์ชูตถูกใช้ไปแล้ว — ต้องกดท่าไม้ตายใหม่`);
  },

  // ---------- useSkill ----------
  canUseSkill(engine, p, tier) {
    if (!isDaisuke(p)) return true;
    if (tier === "basic") return !Z.clockUpOn(p);          // สลับโหมดระหว่าง Clock Up ไม่ได้
    if (!Z.cassOff(p)) return false;
    if (tier === "secondary" && !Z.canToggleClockUp(p)) return false; // แต้มไม่พอจ่ายค่าต่อเทิร์น = เปิดไม่ได้                        // รอง/ท่าไม้ตายต้องอยู่ใน CAST OFF
    if (tier === "ultimate" && riderArmed(p)) return false; // อาร์มค้างอยู่กดซ้ำไม่ได้
    return true;
  },

  applyInstantSkill(engine, p, tier) {
    if (!isDaisuke(p)) return "";
    if (tier === "basic") return this.toggleCass(engine, p);
    if (tier === "secondary") return this.setClockUp(engine, p, !Z.clockUpOn(p));
    if (tier === "ultimate") return this.armRider(engine, p);
    return "";
  },

  toggleCass(engine, p) {
    const on = !Z.cassOff(p);
    p.zectCassOff = on;
    p.zectPutOnTurns = 0;
    p.transformAt = engine.nextTransformCounter();
    if (on) {
      engine.triggerCutscene(p, "daisukeCassOff"); // คลิปถอดเกราะ เล่นครั้งเดียวต่อเกม
      engine.log(`⚡ ${p.name} CAST OFF! — เกราะถูกปลดทิ้ง พลังโจมตีพื้นฐาน +${Z.CASS_OFF_ATK} แต่เกราะจะไม่ฟื้นอีกจนกว่าจะ PUT ON`);
      return " — CAST OFF";
    }
    engine.notifyTransform(p, "daisukePutOn");
    engine.log(`🛡️ ${p.name} PUT ON — สวมเกราะกลับ เกราะฟื้นได้ตามปกติ และฟื้นพลังชีวิต +${Z.PUT_ON_HEAL} ทุก ${Z.PUT_ON_EVERY} เทิร์น`);
    return " — PUT ON";
  },

  setClockUp(engine, p, on, why) {
    if (!isDaisuke(p) || on === Z.clockUpOn(p)) return "";
    p.zectClockUp = !!on;
    p.transformAt = engine.nextTransformCounter();
    if (on) {
      engine.queueCutscene(p, "daisukeClockUp"); // เล่นทุกครั้งที่กดเปิด — ห้ามใช้ triggerCutscene เพราะมันเล่นคลิปเต็มแค่ครั้งแรกต่อเกม
      engine.log(`⏱️ ${p.name} CLOCK UP — โลกหยุดนิ่ง ทุกคนขยับไม่ได้จนกว่าเขาจะเปิดไพ่ (แต้มสกิล -${Z.CLOCK_UP_DRAIN}/เทิร์น)`);
      return " — CLOCK UP";
    }
    engine.notifyTransform(p, "daisukeClockOver");
    engine.log(`⏱️ ${p.name} CLOCK OVER — เวลากลับมาเดินตามปกติ${why ? ` (${why})` : ""}`);
    return " — CLOCK OVER";
  },

  // คอนเนอร์กดไล่ล่าสวนขึ้นมา -> Clock Up ของไรเดอร์ทุกคนถูกตัดจังหวะ
  armRider(engine, p) {
    p.daisukeRider = true;
    engine.log(`🎯 ${p.name} RIDER SHOOTING — เล็งไว้แล้ว: หมัดถัดไปแรงขึ้น +${RIDER_ATK} และล้างเกราะเป้าหมาย ${RIDER_STRIP} หน่วยก่อนลงหมัด`);
    return " — เล็งไว้แล้ว";
  },

  cancelClockUpForChase(engine) {
    let any = false;
    for (const h of Z.clockUpHosts(engine)) {
      if (!isDaisuke(h)) continue;
      this.setClockUp(engine, h, false, "ถูกการไล่ล่าตัดจังหวะ");
      any = true;
    }
    return any;
  },

  publicState(p) {
    if (!isDaisuke(p)) return undefined;
    return {
      cassOff: Z.cassOff(p),
      clockUp: Z.clockUpOn(p),
      rider: riderArmed(p),
      putOnTurns: Z.cassOff(p) ? 0 : (p.zectPutOnTurns || 0),
      putOnEvery: Z.PUT_ON_EVERY,
      dodge: Z.dodgeChance(p),
    };
  },
};
