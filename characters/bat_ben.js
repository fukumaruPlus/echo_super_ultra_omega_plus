// ============================================================
//  แบทแมน (เบน แอฟเฟล็ก) (patch 3.1) — รถแบทโมบิล / นายลืมของน่ะ / เข้ามาเลย / อัศวินรัตติกาล
//
//  patch 3.1: ถอด "เร้นเงา" ออกจากเกมทั้งหมด แล้วแทนที่ด้วย "รถแบทโมบิล" (กดได้ครั้งเดียวต่อเกม)
//  ซึ่งเป็น **ร่างที่ 2 ของตัวละคร** — ขึ้นรถแล้วสลับทั้งสามช่องสกิลเป็นเวอร์ชันรถ (basic2/secondary2/ultimate2)
//
//  กลไกสำคัญของร่างรถอยู่ที่ "ท่อดาเมจ" ทั้งหมด และรวมศูนย์ไว้ที่ carAbsorb() จุดเดียว
//  ซึ่งถูกเรียกจาก **หัวของ loseHp()** — จุดคอขวดเดียวที่พลังชีวิตจะลดลงได้:
//    · ระหว่างอยู่บนรถ พลังชีวิตของแบทแมนลดไม่ได้เลย ความเสียหายไปลงที่เกราะ (= พลังชีวิตของรถ) แทน
//    · การโจมตี "ทะลุเกราะ" (dealDirect) จึงกลายเป็นความเสียหายที่เกราะโดยอัตโนมัติ = สกิลติดตัว 2 "รถคู่ใจ"
//    · เกราะหมดเมื่อไหร่ = รถพัง -> เล่นวีดีโอ แล้วคืนร่างด้วยพลังชีวิตเต็ม 7 (กดขึ้นรถอีกไม่ได้ตลอดเกม)
//  เขียนแยกไฟล์ตั้งแต่ต้น (ไม่เคยอยู่ใน server.js) — ดู characters/index.js สำหรับไฟล์มัดรวม
//
//  หมายเหตุ: กลไก 2 อย่างของตัวนี้เกาะกับ shared infra ของ server.js จึงมี call site อยู่ที่นั่นด้วย
//    1) เร้นเงาหมดเวลาเอง -> onStealthExpire() ถูกเรียกจากลูปลดเทิร์นสถานะใน endTurn()
//       (แพทเทิร์นเดียวกับ "wither" ของเรียวกิ ชิกิ)
//    2) กรรมถึงตัว (batKarma) รอเลือกเป้าหมายส่งต่อความเสียหาย -> p.batKarmaAsk + socket handler
//       'batKarmaSend' ยังอยู่ server.js (แพทเทิร์นเดียวกับ phenexReleaseAsk ของริต้า เบอร์นัล)
//
//  patch 2.2.7.1: เร้นเงาไม่มีข้อเสียเมื่อโดนความเสียหายอีกแล้ว — เดิมโดนตีทีเดียวสถานะสลายทันที
//  (กับดักไม่ทำงาน + ฮีลหยุด) ตอนนี้อยู่ครบ 3 เทิร์นเสมอ ฮีล +1 ทุกเทิร์นไม่มีเงื่อนไข และจบด้วยกับดักเสมอ
//  จึงไม่มี onDamaged() แล้ว (เอา hook ออกจาก loseHp()/loseArmor() ใน server.js ด้วย)
// ============================================================

// ---------- ร่างรถแบทโมบิล (patch 3.1) ----------
const BAT_CAR_ARMOR = 7;              // พลังชีวิตของรถ (เป็นเกราะล้วน — เพดานเกราะถูกดันขึ้นเท่านี้ระหว่างอยู่บนรถ)
const BAT_CAR_REVERT_HP = 7;          // รถพังแล้วคืนร่างด้วยพลังชีวิตเต็ม
const BAT_SHOT_TURNS = 1;             // ลูกปรายล่อ: คงอยู่ 1 เทิร์น
const BAT_SHOT_CAP = 2;               // ลูกปรายล่อ: ความเสียหายที่เข้าถูกตัดให้เหลือไม่เกินเท่านี้
const BAT_GUN_TURNS = 3;              // ปืนติดรถ: คงอยู่ 3 เทิร์น (ทำงาน 1 ครั้ง)
const BAT_GUN_BONUS = 3;              // ปืนติดรถ: การโจมตีปกติแรงขึ้น
const BAT_DOOM_TURNS = 3;             // แกไม่รอดแน่: คงอยู่ 3 เทิร์น (ทำงาน 1 ครั้ง)
const BAT_DOOM_DMG = 4;               // แกไม่รอดแน่: พุ่งชนคนที่ไพ่แตก
const BAT_KARMA_TURNS = 2;            // กรรมถึงตัว: คงอยู่ 2 เทิร์น (ทำงานได้ 1 ครั้งแล้วหายไป · ราคา 4 แต้ม)
const BAT_KARMA_ULT_BONUS = 1;        // กรรมถึงตัว + เข้ามาเลย: ความเสียหายที่ส่งต่อ +1
const BAT_TAUNT_TURNS = 5;            // เข้ามาเลย: ล่อเป้าทุกคน 5 เทิร์น
const BAT_TAUNT_HEAL = 1;             // เข้ามาเลย: ฟื้นพลังชีวิต +1 ต่อเทิร์น
const BAT_NIGHT_GOLD = 1;             // อัศวินรัตติกาล: กลางคืนได้เหรียญ +1 ต่อเทิร์น
const BAT_NIGHT_ATK = 1;              // อัศวินรัตติกาล: กลางคืนพลังโจมตี +1
const BAT_PROFILE_IMG = "/characters/bat_ben/bat_ben.webp";
const BAT_SKILL2_IMG = "/characters/bat_ben/bat_ben_skill2.jpg";
const BAT_CAR_IMG = "/characters/bat_ben/bat_update/bat_ben_car.webp";
const BAT_GUN_IMG = "/characters/bat_ben/bat_update/skill2.2/bat_ben_skill2.2.png";

module.exports = {
  id: "bat_ben",
  KARMA_TURNS: BAT_KARMA_TURNS,
  CAR_ARMOR: BAT_CAR_ARMOR,
  CAR_REVERT_HP: BAT_CAR_REVERT_HP,
  SHOT_TURNS: BAT_SHOT_TURNS,
  SHOT_CAP: BAT_SHOT_CAP,
  GUN_TURNS: BAT_GUN_TURNS,
  GUN_BONUS: BAT_GUN_BONUS,
  DOOM_TURNS: BAT_DOOM_TURNS,
  DOOM_DMG: BAT_DOOM_DMG,
  IMG_GUN: BAT_GUN_IMG,
  TAUNT_TURNS: BAT_TAUNT_TURNS,
  PROFILE_IMG: BAT_PROFILE_IMG,

  // ดาเมจ contribution — เรียกจาก computeAttackBase(): อัศวินรัตติกาล กลางคืนพลังโจมตี +1
  damageBonus(engine, attacker, target, ctx) {
    const batNightAtk = attacker.characterId === "bat_ben" &&
      engine.isNightRound(engine.roundNumber) && !engine.passiveSealed(attacker);
    ctx.batNightAtk = batNightAtk;
    // ปืนติดรถ: การโจมตีปกติครั้งถัดไปแรงขึ้น 3 หน่วย (สถานะถูกใช้ไปที่ doAttack หลังลงดาเมจ)
    const batGunAtk = attacker.characterId === "bat_ben" && (attacker.statuses.batGun || 0) > 0;
    ctx.batGunAtk = batGunAtk;
    return (batNightAtk ? BAT_NIGHT_ATK : 0) + (batGunAtk ? BAT_GUN_BONUS : 0);
  },

  // ---------- ลูกปรายล่อ: ตัดความเสียหายที่เข้าให้เหลือไม่เกิน 2 หน่วย ----------
  //  ทำที่ adjustIncomingDamage เพราะเป็นจุดที่เห็น "ขนาดก้อนดาเมจ" ก่อนถูกหั่นเข้าเกราะ/เลือด
  //  จึงครอบคลุมทุกท่อ (โจมตีปกติ/สกิล/ปืน/ดีบัฟ) ตามสเปคที่ว่า "ไม่ว่าจะแรงแค่ไหน"
  adjustIncomingDamage(engine, p, n) {
    if (p.characterId !== "bat_ben" || n <= BAT_SHOT_CAP) return n;
    if ((p.statuses.batShot || 0) <= 0) return n;
    engine.log(`🛡️ ${p.name} ลูกปรายล่อ — ความเสียหาย ${n} หน่วยถูกตัดเหลือ ${BAT_SHOT_CAP}`);
    return BAT_SHOT_CAP;
  },

  // ---------- ร่างรถแบทโมบิล ----------
  inCar(p) { return !!(p && p.characterId === "bat_ben" && p.batCar); },
  // เพดานเกราะระหว่างอยู่บนรถ (เรียกจาก maxArmorOf) — null = ใช้สูตรปกติ
  maxArmor(p) { return this.inCar(p) ? BAT_CAR_ARMOR : null; },
  // ภาพประจำตัวระหว่างอยู่บนรถ
  displayImg(p) { return this.inCar(p) ? BAT_CAR_IMG : null; },
  // กดขึ้นรถได้ไหม — ครั้งเดียวต่อเกม และรถพังแล้วกดอีกไม่ได้
  canCastCar(p) { return !p.batCar && !p.batCarUsed; },

  // **จุดรวมศูนย์ของร่างรถ** — เรียกจากหัว loseHp() คืน true = จัดการเองแล้ว ผู้เรียกต้องหยุดทันที
  //  ระหว่างอยู่บนรถ พลังชีวิตลดไม่ได้เลย: ความเสียหายไปลงเกราะ (พลังชีวิตของรถ) แทน
  //  ผลพลอยได้คือการโจมตี "ทะลุเกราะ" กลายเป็นความเสียหายที่เกราะไปด้วย = สกิลติดตัว 2 "รถคู่ใจ"
  carAbsorb(engine, p) {
    if (!this.inCar(p)) return false;
    if (p.armor > 0) {
      engine.loseArmor(p);
      if (p.armor <= 0) this.breakCar(engine, p);
      return true;
    }
    this.breakCar(engine, p); // ไม่มีเกราะเหลือแล้ว (เผื่อหลุดมาถึงตรงนี้) — รถพังทันที
    return true;
  },

  // เรียกจากท้าย loseArmor() — เกราะหมดพอดีโดยไม่เคยแตะ loseHp ก็ต้องนับว่ารถพังเหมือนกัน
  onArmorLost(engine, p) {
    if (this.inCar(p) && p.armor <= 0) this.breakCar(engine, p);
  },

  // รถพัง -> เล่นวีดีโอ แล้วคืนร่างด้วยพลังชีวิตเต็ม (กดขึ้นรถอีกไม่ได้ตลอดเกม)
  breakCar(engine, p) {
    if (!p.batCar) return;
    p.batCar = false;
    p.batCarUsed = true;
    p.armor = 0;
    p.hp = Math.min(engine.maxHpOf(p), BAT_CAR_REVERT_HP); // คืนร่างด้วยเลือดเต็ม
    // สถานะที่ผูกกับร่างรถล้วนๆ ไม่ควรค้างหลังคืนร่าง
    for (const k of ["batShot", "batGun", "batDoom"]) {
      delete p.statuses[k];
      if (p.statusAmt) delete p.statusAmt[k];
    }
    engine.queueCutscene(p, "batCarFail"); // bat_ben_car_fail.mp4
    engine.log(`🚗💥 ${p.name} รถแบทโมบิลพังยับ — คืนร่างด้วยพลังชีวิตเต็ม ${p.hp} หน่วย (ขึ้นรถอีกไม่ได้แล้วตลอดเกม)`);
  },

  // ---------- สกิลพื้นฐาน 1: รถแบทโมบิล ----------
  activateCar(engine, p) {
    p.batCar = true;
    p.batCarUsed = true;
    // พลังชีวิต "เต็มและแตะไม่ได้" ระหว่างอยู่บนรถ — ตั้งใจไม่เซ็ตเป็น 0 ตามตัวอักษรของสเปค
    //  เพราะเอนจินมีจุดกวาด `if (o.alive && o.hp <= 0) instantDeath(o)` อยู่หลายที่ (afterResolve,
    //  ท่อดาเมจ, ระเบิดของเอวา ฯลฯ) — hp 0 จะโดนกวาดตายทันทีทั้งที่รถยังไม่พัง
    //  ผลลัพธ์ที่ผู้เล่นเห็นเหมือนกันทุกประการ: carAbsorb กัน hp ไม่ให้ลดเลย เกราะ 7 คือชีวิตของรถจริงๆ
    //  และตอนรถพังก็ "คืนร่างด้วยเลือดเต็ม" พอดีเพราะเลือดไม่เคยถูกแตะ
    p.hp = engine.maxHpOf(p);
    p.armor = BAT_CAR_ARMOR;
    p.transformAt = engine.nextTransformCounter();
    engine.queueCutscene(p, "batCar"); // bat_ben_skill1.mp4 (ชุด bat_update)
    engine.log(`🚗 ${p.name} รถแบทโมบิล — "ฉันจะไม่ปล่อยแกหนีรอดหรอก" ขึ้นรถถาวรจนกว่ารถจะพัง! พลังชีวิตกลายเป็นเกราะล้วน ${BAT_CAR_ARMOR} หน่วย และสกิลทั้งสามช่องเปลี่ยนเป็นเวอร์ชันรถ`);
    return " — ขึ้นรถแบทโมบิล";
  },

  // ---------- สกิลพื้นฐาน 2: ลูกปรายล่อ ----------
  activateShot(engine, p) {
    p.statuses.batShot = BAT_SHOT_TURNS;
    engine.queueCutscene(p, "batCarShot"); // bat_ben_skill1.2.mp4
    engine.log(`🛡️ ${p.name} ลูกปรายล่อ — เทิร์นนี้ความเสียหายที่เข้าไม่ว่าจะแรงแค่ไหน จะเหลือแค่ ${BAT_SHOT_CAP} หน่วย`);
    return ` — ตัดดาเมจเหลือ ${BAT_SHOT_CAP}`;
  },

  // ---------- สกิลรอง 2: ฉันไม่เคยฆ่าใคร แต่รถเป็นคนทำ ----------
  activateGun(engine, p) {
    p.statuses.batGun = BAT_GUN_TURNS;
    engine.log(`🔫 ${p.name} ฉันไม่เคยฆ่าใคร แต่รถเป็นคนทำ — ติดตั้ง "ปืนติดรถ" ${BAT_GUN_TURNS} เทิร์น: การโจมตีปกติครั้งถัดไปแรงขึ้น ${BAT_GUN_BONUS} หน่วย (ทำงาน 1 ครั้ง)`);
    return " — ปืนติดรถ";
  },
  // ใช้สถานะไปหลังโจมตีปกติสำเร็จ (เรียกจาก doAttack) — คืน true ถ้าปืนเพิ่งทำงาน
  consumeGun(engine, p) {
    if (p.characterId !== "bat_ben" || (p.statuses.batGun || 0) <= 0) return false;
    delete p.statuses.batGun;
    if (p.statusAmt) delete p.statusAmt.batGun;
    engine.queueCutscene(p, "batGun"); // bat_ben_skill2.2.mp4 — เล่นก่อนขึ้นสรุปความเสียหาย
    engine.log(`🔫 ${p.name} ปืนติดรถทำงาน — ความเสียหาย +${BAT_GUN_BONUS} แล้วปืนหมดกระสุน`);
    return true;
  },

  // ---------- ท่าไม้ตาย 2: ฉันไม่เคยปล่อยใครรอดพ้น ----------
  activateDoom(engine, p) {
    p.statuses.batDoom = BAT_DOOM_TURNS;
    engine.log(`🚗 ${p.name} ฉันไม่เคยปล่อยใครรอดพ้น — เฝ้ารอ ${BAT_DOOM_TURNS} เทิร์น: ใครไพ่แตกเมื่อไหร่ แบทโมบิลจะพุ่งชนทันที ${BAT_DOOM_DMG} หน่วย (ทำงาน 1 ครั้ง)`);
    return " — แกไม่รอดแน่";
  },
  // เรียกจาก afterResolve() — รู้ผลไพ่แตกครบแล้ว
  onAfterResolve(engine) {
    for (const p of engine.alivePlayers()) {
      if (p.characterId !== "bat_ben" || (p.statuses.batDoom || 0) <= 0) continue;
      const victim = engine.alivePlayers().find(
        (o) => o.id !== p.id && engine.bustedOf(o) && !engine.withEffectSource(p, () => engine.friendlyEffectBlocked(o))
      );
      if (!victim) continue;
      delete p.statuses.batDoom;
      if (p.statusAmt) delete p.statusAmt.batDoom;
      engine.queueCutscene(p, "batDoom"); // bat_ben_skill3.2.mp4 — เล่นก่อนพุ่งชน
      engine.withEffectSource(p, () => {
        engine.dealMixed(victim, BAT_DOOM_DMG);
        victim.wasAttacked = true;
        engine.maybeBeatSave(victim); engine.maybeBeatMode(victim); engine.maybeEva3(victim); engine.maybeWakeKotone(victim);
      });
      engine.log(`🚗💥 ${p.name} ฉันไม่เคยปล่อยใครรอดพ้น — แบทโมบิลพุ่งชน ${victim.name} ที่ไพ่แตก -${BAT_DOOM_DMG}`);
      if (victim.alive && victim.hp <= 0) {
        engine.instantDeath(victim);
        if (!victim.alive) engine.log(`💀 ${victim.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
  },

  // ---------- useSkill/publicState: สลับชุดสกิลตามร่าง ----------
  dynamicSkillFor(p, ch, tier) {
    if (!this.inCar(p)) return ch[tier];
    if (tier === "basic") return ch.basic2;
    if (tier === "secondary") return ch.secondary2;
    if (tier === "ultimate") return ch.ultimate2;
    return ch[tier];
  },
  canUseSkill(engine, p, tier) {
    if (p.characterId !== "bat_ben") return true;
    if (this.inCar(p)) {
      if (tier === "basic") return !((p.statuses.batShot || 0) > 0);   // ลูกปรายล่อยังมีผล = กดซ้ำไม่ได้
      if (tier === "secondary") return !((p.statuses.batGun || 0) > 0); // ปืนยังไม่ได้ใช้ = ติดซ้ำไม่ได้
      if (tier === "ultimate") return !((p.statuses.batDoom || 0) > 0);
      return true;
    }
    if (tier === "basic") return this.canCastCar(p);
    if (tier === "secondary") return this.canCastKarma(p);
    return true;
  },
  applyInstantSkill(engine, p, tier) {
    if (p.characterId !== "bat_ben") return "";
    if (this.inCar(p)) {
      if (tier === "basic") return this.activateShot(engine, p);
      if (tier === "secondary") return this.activateGun(engine, p);
      if (tier === "ultimate") return this.activateDoom(engine, p);
      return "";
    }
    if (tier === "basic") return this.activateCar(engine, p);
    return "";
  },

  // ---------- สกิลติดตัว อัศวินรัตติกาล ----------
  // กันตายตอนกลางคืน 1 ครั้งต่อ "1 รอบกลางคืน" (รีใหม่เมื่อเข้ากลางคืนรอบถัดไป) — เรียกผ่าน maybeBeatSave()
  //  ตั้งใจไม่เซ็ต p.beatSaved (ต่างจากตัวละครอื่น) เพราะ beatSaved เป็นแฟลก "ครั้งเดียวต่อเกม" ที่จะปิดการกันตายถาวร
  tryDeathSave(engine, p) {
    if (p.characterId !== "bat_ben") return false;
    if (!engine.isNightRound(engine.roundNumber)) return false;
    const night = engine.nightCycleIndex(engine.roundNumber);
    if (p.batNightSaveUsedAt === night) return false; // คืนนี้ใช้ไปแล้ว — รอคืนถัดไป
    p.batNightSaveUsedAt = night;
    p.hp = 1;
    engine.log(`🦇🌙 ${p.name} อัศวินรัตติกาล — ราตรีปกป้องไว้! รอดจากความเสียหายถึงตาย เลือดค้างที่ 1 (กันตาย 1 ครั้งต่อ 1 คืน · คืนถัดไปกันได้อีก)`);
    return true;
  },

  // ต้นเทิร์น: เหรียญกลางคืน / ฟื้นเลือดจากเร้นเงา / ฟื้นเลือดจากเข้ามาเลย — เรียกจาก dealRound()
  onRoundStartTick(engine, p) {
    if (p.characterId !== "bat_ben" || !p.alive) return;
    // อัศวินรัตติกาล: กลางคืนได้เหรียญ +1 ต่อเทิร์น
    if (engine.isNightRound(engine.roundNumber) && !engine.passiveSealed(p)) {
      const before = p.gold || 0;
      engine.addGold(p, BAT_NIGHT_GOLD);
      if (p.gold > before) engine.log(`🦇🌙 ${p.name} อัศวินรัตติกาล — ราตรีคือถิ่นของเขา เหรียญ +${p.gold - before} (มี ${p.gold})`);
    }
    // เข้ามาเลย: ฟื้นพลังชีวิต +1 ต่อเทิร์นตลอดที่ล่อเป้าอยู่ (อยู่บนรถ = ไม่มีพลังชีวิตให้ฟื้น)
    if ((p.statuses.batTaunt || 0) > 0 && !this.inCar(p)) {
      const heal = engine.healHp(p, BAT_TAUNT_HEAL);
      engine.log(`🦇 ${p.name} เข้ามาเลย — ยิ่งเจ็บยิ่งแกร่ง ฟื้นพลังชีวิต +${heal} (เหลืออีก ${p.statuses.batTaunt} เทิร์น)`);
    }
  },

  // ---------- ฟิลด์เฉพาะตัวละคร: ต้องล้างทุกแมตช์ใหม่ (เรียกจาก resetCombat ของ server.js) ----------
  resetCombat(p) {
    p.batCar = false;      // อยู่บนรถแบทโมบิลอยู่ไหม
    p.batCarUsed = false;  // เคยขึ้นรถไปแล้วหรือยัง (กดได้ครั้งเดียวต่อเกม)
  },

  // ---------- สกิลรอง นายลืมของน่ะ ----------
  // เรียกจาก useSkill()'s gate — ยังมีกรรมถึงตัวค้างอยู่/ยังรอเลือกเป้าหมายส่งต่อ = กดซ้ำไม่ได้
  canCastKarma(p) {
    return !((p.statuses.batKarma || 0) > 0) && !p.batKarmaAsk;
  },

  // เรียกจาก useSkill() ในส่วน effect (สถานะ batKarma ถูก applyEffect ตั้งให้แล้ว)
  activateKarma(engine, p) {
    engine.log(`🎁 ${p.name} นายลืมของน่ะ — ตั้งรับ ${BAT_KARMA_TURNS} เทิร์น: ความเสียหายจากการถูกโจมตีครั้งถัดไปจะไม่เข้าตัวเอง แต่เลือกส่งต่อให้ผู้เล่น 1 คนแทน (ทำงานได้ 1 ครั้งแล้วหายไป)`);
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ ก่อนลงความเสียหายจริง — คืน true ถ้าดูดซับไว้แล้ว (ผู้เรียกต้อง return ทันที)
  tryKarmaAbsorb(engine, attacker, target, dmg) {
    if (!(target.characterId === "bat_ben" && (target.statuses.batKarma || 0) > 0 && target.alive && attacker.id !== target.id)) return false;
    delete target.statuses.batKarma; // ทำงานได้ครั้งเดียวต่อการกด — ดูดซับแล้วหายทันที
    if (target.statusAmt) delete target.statusAmt.batKarma;
    const tauntOn = (target.statuses.batTaunt || 0) > 0;
    const carried = Math.max(0, dmg) + (tauntOn ? BAT_KARMA_ULT_BONUS : 0);
    const pool = engine.alivePlayers().filter((o) => o.id !== target.id);
    target.wasAttacked = true;
    attacker.wasAttacked = true; // ผู้โจมตีลงมือไปแล้ว — เข้ามาเลยจะไม่สะท้อนซ้ำ (ความเสียหายถูกยกไปทั้งก้อน)
    engine.log(`🎁 ${target.name} นายลืมของน่ะ — รับความเสียหาย ${dmg} หน่วยจาก ${attacker.name} ไว้เต็มๆ แต่ไม่เข้าตัวเอง${tauntOn ? ` (เข้ามาเลยทำงานอยู่ — ส่งต่อ +${BAT_KARMA_ULT_BONUS})` : ""} เตรียมส่งคืน ${carried} หน่วย`);
    if (!pool.length || carried <= 0) {
      engine.log(`🎁 ${target.name} นายลืมของน่ะ — ไม่มีใครให้ส่งต่อ ความเสียหายสลายไปเฉยๆ`);
    } else {
      target.batKarmaAsk = { dmg: carried, from: attacker.id, options: pool.map((o) => o.id) };
    }
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, reflect: true,
      skills: [{ name: `นายลืมของน่ะ — รับไว้ ${carried} หน่วย`, img: BAT_SKILL2_IMG, by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, () => engine.runCutsceneQueue(engine.endTurn));
      engine.broadcastState();
    });
    return true;
  },

  // ส่งความเสียหายที่รับไว้ต่อให้เป้าหมายที่เลือก — เรียกจาก socket handler 'batKarmaSend' และจาก
  //  auto-resolve ตอนเปิดไพ่รอบถัดไป (ไม่ตอบ = สุ่มให้) ทั้งคู่อยู่ใน server.js
  resolveKarmaSend(engine, p, target, dmg) {
    if (!target || !target.alive || dmg <= 0) {
      engine.log(`🎁 ${p.name} นายลืมของน่ะ — ไม่มีเป้าหมายให้ส่งต่อ ความเสียหาย ${dmg} หน่วยสลายไป`);
      return;
    }
    engine.triggerCutscene(p, "batKarmaSend"); // bat_ben_skill2.mp4 — เล่นก่อนความเสียหายเกิดขึ้น
    engine.dealMixed(target, dmg); // ไม่ผ่านระบบหลบหลีกปกติ — ของที่ลืมไว้ต้องถึงมือเจ้าตัวเสมอ (ยังลดเกราะก่อน)
    target.wasAttacked = true;
    engine.maybeBeatSave(target); engine.maybeBeatMode(target); engine.maybeEva3(target); engine.maybeWakeKotone(target);
    engine.log(`🎁💥 ${p.name} นายลืมของน่ะ — ส่งความเสียหาย ${dmg} หน่วยคืนให้ ${target.name} (ไม่สนการหลบหลีก)!`);
    if (target.alive && target.hp <= 0) {
      engine.instantDeath(target);
      if (!target.alive) engine.log(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
    }
  },

  // ---------- ท่าไม้ตาย เข้ามาเลย ----------
  // เรียกจาก useSkill() ในส่วน effect (สถานะ batTaunt ถูก applyEffect ตั้งให้แล้ว)
  activateTaunt(engine, p) {
    p.transformAt = engine.nextTransformCounter(); // เพลง bat_ben_theme ใช้ลำดับล่าสุด (กรณีมีแบทแมนหลายคน)
    engine.triggerCutscene(p, "batTaunt"); // bat_ben_skill3.mp4 -> เพลง bat_ben_theme เล่นค้าง
    engine.log(`🦇 ${p.name} เข้ามาเลย — ล่อเป้าหมายการโจมตีของทุกคนมาที่ตัวเอง ${BAT_TAUNT_TURNS} เทิร์น! ความเสียหายที่โดนจะเกิดกับผู้โจมตีด้วยเท่ากัน · ฟื้นพลังชีวิต +${BAT_TAUNT_HEAL} ต่อเทิร์น · ใช้คู่กับนายลืมของน่ะ ความเสียหายที่ส่งต่อ +${BAT_KARMA_ULT_BONUS}`);
  },

  // เรียกจาก doAttack() ตอนเลือกเป้าหมาย — หาผู้ล่อเป้า คืน player หรือ null (แพทเทิร์นเดียวกับริดดี้/ริต้า)
  findTaunter(engine, attacker) {
    return this.findTaunters(engine, attacker)[0] || null;
  },
  findTaunters(engine, attacker) {
    return engine.alivePlayers().filter(
      (r) => r.id !== attacker.id && r.characterId === "bat_ben" && (r.statuses.batTaunt || 0) > 0 && !engine.sealActive(r)
    );
  },

  // เรียกจาก doAttack() หลังลงความเสียหายกับแบทแมนแล้ว — ความเสียหายเท่ากันเกิดกับผู้โจมตีด้วย
  //  (ต่างจาก "ฝันไปเถอะ" ของริต้า: อันนั้นย้ายความเสียหายไปทั้งก้อน อันนี้เกิดกับทั้งสองฝ่าย)
  applyTauntReflect(engine, attacker, target, dmg) {
    if (!(target.characterId === "bat_ben" && (target.statuses.batTaunt || 0) > 0 && attacker.id !== target.id)) return 0;
    if (dmg <= 0 || !attacker.alive) return 0;
    engine.dealMixed(attacker, dmg);
    attacker.wasAttacked = true;
    engine.maybeBeatSave(attacker); engine.maybeBeatMode(attacker); engine.maybeEva3(attacker); engine.maybeWakeKotone(attacker);
    engine.log(`🦇⚡ ${target.name} เข้ามาเลย — ความเสียหาย ${dmg} หน่วยที่ ${attacker.name} ลงมือ เกิดขึ้นกับ ${attacker.name} เองด้วย!`);
    if (attacker.alive && attacker.hp <= 0) {
      engine.instantDeath(attacker);
      if (!attacker.alive) engine.log(`💀 ${attacker.name} เลือดจริงหมด ตกรอบ!`);
    }
    return dmg;
  },

};
