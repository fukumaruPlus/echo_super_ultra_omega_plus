// ============================================================
//  สึงาชิ ทาคุโตะ (patch 2.2 new / 2.2.3 / 2.2.4 / 2.2.5) — ฉันได้ยินเสียงของโลก / Star Sword Emeraude+Saphir /
//  หอกผู้พิชิต / อย่างนายน่ะ จะไปเข้าใจอะไร (ท่าไม้ตาย 1) / ร่วมเดินทางไปกับฉันเถอะ (ท่าไม้ตาย 2) / กันตาย (สกิลติดตัว 1)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม, characters/kuwagata.js สำหรับกลไกกันตายที่ใช้ dispatcher เดียวกัน
//  หมายเหตุ: เงื่อนไข gate (isTakutoEmeraude/isTakutoSaphir/isTakutoUlt2/isTakutoUlt3 ใน useSkill(), takutoLanceAtk
//  ในส่วนคำนวณดาเมจของ doAttack()) ยังอยู่ server.js เพราะเป็นแค่เงื่อนไข boolean ล้วนๆ ไม่มี body ให้ย้าย
// ============================================================

const TAKUTO_APPRIVOISE_TURNS = 10; // ฉันคว้ามันได้แล้ว: กันตายทำงาน -> นับเวลาใหม่เต็ม 10 เทิร์น (patch 2.2.3)
const TAKUTO_FORTUNE_GRANT = 2;     // สกิลติดตัว 1: กันตายทำงานเมื่อไหร่ มอบโชคลาภ 2 หน่วย
const TAKUTO_BEATSAVE_HEAL = 2;     // สกิลติดตัว 1 (patch 2.2.4): กันตายทำงาน -> ฟื้นพลังชีวิต +2 เพิ่มเติม
const TAKUTO_BEATSAVE_ARMOR = 2;    // สกิลติดตัว 1 (patch 2.2.4): กันตายทำงาน -> ฟื้นเกราะ +2 เพิ่มเติม
const TAKUTO_HEAL_BASIC = 1;        // ฉันได้ยินเสียงของโลก: ฟื้นพลังชีวิต +1 (patch 2.2.4 — เดิม 2)
const TAKUTO_STAR_NEED = 5;         // ดวงดาวสะสมครบ 5 -> ฉันคว้ามันได้แล้ว (Apprivoise!) ทันที
const TAKUTO_ULT_CARD_SCORE = 19;   // ท่าไม้ตายที่ 1: แต้มการ์ดของตัวเองพุ่งเป็น 19 ทันที
const TAKUTO_THIRD_ATK_CHANCE = 0.5; // ท่าไม้ตายที่ 1 (พิชิตแสงดาว): หลังคอมโบ Saphir+Emeraude มีโอกาส 50% ได้โจมตีต่อครั้งที่ 3
const TAKUTO_ULT2_DMG = 6;          // ท่าไม้ตายที่ 2 ร่วมเดินทางไปกับฉันเถอะ (patch 2.2.5): ระเบิดใส่ทุกคนรวมตัวเอง 6 หน่วย
const TAKUTO_LANCE_HEAL = 3;        // หอกผู้พิชิต: ฟื้นพลังชีวิตตัวเอง +3 หน่วยหลังโจมตี
const TAKUTO_ATK_BONUS = 1;         // ฉันคว้ามันได้แล้ว (Apprivoise!): พลังโจมตีถาวร +1

module.exports = {
  id: "takuto",

  // ดาเมจ contribution (Apprivoise! +1) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const takutoAtk = (attacker.statuses.apprivoise || 0) > 0 ? TAKUTO_ATK_BONUS : 0;
    ctx.takutoAtk = takutoAtk;
    return takutoAtk;
  },

  // เรียกจาก server.js's maybeBeatSave(p) (universal dispatcher) — ทำงานเฉพาะตอน Apprivoise! กำลังทำงานอยู่เท่านั้น
  //  (ร่างปกติไม่กันตาย — ดูสกิลติดตัว 3 แทน ซึ่งยังไม่ได้ย้าย) คืน true ถ้าทำงาน, false ถ้าเงื่อนไขไม่ครบ
  tryDeathSave(engine, p) {
    if (!((p.statuses.apprivoise || 0) > 0)) return false;
    p.hp = 1;
    p.beatSaved = true;
    p.statuses.apprivoise = TAKUTO_APPRIVOISE_TURNS; // กันตายทำงาน -> นับเวลาฉันคว้ามันได้แล้วใหม่เต็ม (ลดเทิร์นตามปกติต่อไป ไม่ถาวร)
    p.takutoAwakenAt = engine.nextTransformCounter(); // เพลง/ภาพซ้อนทับใช้ลำดับล่าสุด (กรณีมีทาคุโตะหลายคน)
    engine.triggerCutscene(p, "takutoAwaken"); // takuto_passive2.mp4 -> เปลี่ยนภาพเป็น tauburn_un.jpg + เพลง takuto2 ถาวร
    const healedHp = engine.healHp(p, TAKUTO_BEATSAVE_HEAL);
    const healedArmor = engine.healArmor(p, TAKUTO_BEATSAVE_ARMOR);
    p.statuses.fortune = Math.min(engine.BARD_FORTUNE_MAX, (p.statuses.fortune || 0) + TAKUTO_FORTUNE_GRANT);
    p.fortuneIdle = 0;
    engine.log(`✨ ${p.name} ฉันยัง...มองเห็นอยู่!!! — รอดจากความเสียหายถึงตาย! (กันตายได้ครั้งเดียวต่อเกม) ฟื้นพลังชีวิต +${healedHp} เกราะ +${healedArmor} ได้รับโชคลาภ +${TAKUTO_FORTUNE_GRANT} และร่างฉันคว้ามันได้แล้วนับเวลาใหม่เต็ม ${TAKUTO_APPRIVOISE_TURNS} เทิร์น`);
    return true;
  },

  // เรียกจาก useSkill() ในส่วน effect — ฉันได้ยินเสียงของโลก (สกิลพื้นฐาน ก่อน Apprivoise!): ฟื้นเลือด + สะสมดวงดาว ครบ 5 = แปลงร่าง
  applyBasicStar(engine, p) {
    const heal = engine.healHp(p, TAKUTO_HEAL_BASIC);
    p.statuses.star = (p.statuses.star || 0) + 1;
    engine.log(`⭐ ${p.name} ฉันได้ยินเสียงของโลก — ฟื้นพลังชีวิต +${heal} และดวงดาว +1 (${Math.min(p.statuses.star, TAKUTO_STAR_NEED)}/${TAKUTO_STAR_NEED})`);
    if (p.statuses.star >= TAKUTO_STAR_NEED) {
      delete p.statuses.star;
      p.statuses.apprivoise = TAKUTO_APPRIVOISE_TURNS; // คงอยู่ 10 เทิร์น (patch 2.2.3 — เดิมถาวร) — ลดเทิร์นปกติผ่านลูปทั่วไป
      p.seen.apprivoise = true;
      p.transformAt = engine.nextTransformCounter();
      // เคยกันตายมาก่อนแล้ว (ไม่ว่าตอนนี้จะยังอยู่ในร่างนั้นหรือคืนร่างไปแล้ว) -> แปลงร่างครั้งนี้เล่นวีดีโอ takuto_return.mp4 แทน takuto_passive.mp4 ปกติ
      engine.triggerCutscene(p, p.beatSaved ? "takutoReturn" : "apprivoise");
      engine.log(`✨ ${p.name} ฉันคว้ามันได้แล้ว — แปลงร่างเป็นทาวเบิร์น ${TAKUTO_APPRIVOISE_TURNS} เทิร์น! ปลดล็อกสกิลพื้นฐาน 2/สกิลรอง/ท่าไม้ตาย`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — Star Sword Emeraude (สกิลพื้นฐาน 2 หลัง Apprivoise!): ครบคู่กับ Saphir ก่อนหน้า -> รวมเป็นหอกผู้พิชิต
  applyEmeraude(engine, p) {
    if (p.beatSaved && (p.statuses.saphir || 0) > 0) {
      delete p.statuses.saphir;
      p.statuses.lance = 1;
      p.transformAt = engine.nextTransformCounter();
      engine.triggerCutscene(p, "takutoLance");
      engine.log(`⚔️ ${p.name} ทั้งสองสิ่งรวมเป็นหนึ่ง — ดาบทั้งคู่หลอมรวมเป็นหอกผู้พิชิต!`);
      return;
    }
    p.statuses.emeraude = 1;
    engine.log(`💚 ${p.name} Star Sword Emeraude — การโจมตีปกติครั้งถัดไปจะฟื้นพลังชีวิตตามความเสียหายที่ทำได้`);
    if ((p.statuses.saphir || 0) > 0) {
      engine.triggerCutscene(p, "takutoBothSwords");
      engine.log(`⚔️ ${p.name} มี Star Sword Emeraude และ Saphir พร้อมกัน — ถ้าพร้อมแล้วก็เข้ามาเลย!`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — Star Sword Saphir (สกิลรอง): ครบคู่กับ Emeraude ก่อนหน้า -> รวมเป็นหอกผู้พิชิต
  applySaphir(engine, p) {
    if (p.beatSaved && (p.statuses.emeraude || 0) > 0) {
      delete p.statuses.emeraude;
      p.statuses.lance = 1;
      p.transformAt = engine.nextTransformCounter();
      engine.triggerCutscene(p, "takutoLance");
      engine.log(`⚔️ ${p.name} ทั้งสองสิ่งรวมเป็นหนึ่ง — ดาบทั้งคู่หลอมรวมเป็นหอกผู้พิชิต!`);
      return;
    }
    p.statuses.saphir = 1;
    engine.log(`💙 ${p.name} Star Sword Saphir — ลำพังยังไม่มีผลอะไรเพิ่มเติม ต้องมี Emeraude ร่วมด้วยการโจมตีปกติครั้งถัดไปถึงจะได้โจมตีเพิ่มอีกครั้ง`);
    if ((p.statuses.emeraude || 0) > 0) {
      engine.triggerCutscene(p, "takutoBothSwords");
      engine.log(`⚔️ ${p.name} มี Star Sword Emeraude และ Saphir พร้อมกัน — ถ้าพร้อมแล้วก็เข้ามาเลย!`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — ท่าไม้ตาย 1: อย่างนายน่ะ จะไปเข้าใจอะไร (พิชิตแสงดาว)
  activateUlt2(engine, p) {
    p.statuses.takutoThirdAtk = 1; // หลังคอมโบ Saphir+Emeraude โอกาส 50% ได้โจมตีต่อครั้งที่ 3 (ดู startThirdAttack)
    p.takutoUlt2VideoPending = true; // วีดีโอเล่นตอนกดโจมตีจริงครั้งถัดไป ไม่ใช่ตอนกดสกิลนี้
    if (engine.calculateScore(p.cards) < TAKUTO_ULT_CARD_SCORE) {
      engine.drawToScore(p, TAKUTO_ULT_CARD_SCORE); // ต้องจั่วให้ถึงเป้าก่อน แล้วค่อยจำกัดจั่วครั้งถัดๆ ไป (ไม่งั้นการจั่วรอบนี้เองจะโดนจำกัดด้วย)
      p.hakunoLowDraw = true; // จั่วเพิ่มได้อีก แต่ได้แค่แต้ม 2 หรือ 3 เท่านั้น (50/50)
      engine.log(`👁️ ${p.name} อย่างนายน่ะ จะไปเข้าใจอะไร — จั่วการ์ดจากกองกลางจนแต้มถึง ${TAKUTO_ULT_CARD_SCORE} (ได้ ${engine.calculateScore(p.cards)} แต้ม${p.busted ? " — แตก!" : ""}) และการโจมตีคอมโบครั้งนี้มีโอกาสได้โจมตีเพิ่มเป็นครั้งที่ 3 (${Math.round(TAKUTO_THIRD_ATK_CHANCE * 100)}%)`);
    } else {
      engine.log(`👁️ ${p.name} อย่างนายน่ะ จะไปเข้าใจอะไร — แต้ม 21 อยู่แล้ว ไม่มีผลกับแต้มการจั่ว แต่การโจมตีคอมโบครั้งนี้มีโอกาสได้โจมตีเพิ่มเป็นครั้งที่ 3 (${Math.round(TAKUTO_THIRD_ATK_CHANCE * 100)}%)`);
    }
  },

  // เรียกจาก useSkill() ในส่วน effect — ท่าไม้ตาย 2: ร่วมเดินทางไปกับฉันเถอะ — ระเบิดใส่ทุกคนบนสนามรวมตัวเอง
  activateUlt3(engine, p) {
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "takutoUlt3");
    for (const o of engine.alivePlayers()) {
      engine.dealMixed(o, TAKUTO_ULT2_DMG);
      engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeWakeKotone(o);
      o.wasAttacked = true;
      if (o.alive && o.hp <= 0) {
        engine.instantDeath(o);
        if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
    engine.log(`💥 ${p.name} ร่วมเดินทางไปกับฉันเถอะ — ระเบิดพลังโจมตีรุนแรงใส่ทุกคนบนสนามรวมตัวเอง -${TAKUTO_ULT2_DMG}!`);
  },

  // เรียกจาก postAttackFollowup() (universal dispatcher) — Star Sword Saphir+Emeraude ร่วมกัน: โจมตีเพิ่มอีก 1 ครั้งทันที (การันตี)
  //  คืน true ถ้าเริ่มโจมตีต่อสำเร็จ (ผู้เรียกต้อง return ทันที)
  startComboReattack(engine, attacker) {
    if (!attacker.takutoComboReady) return false;
    attacker.takutoComboReady = false;
    const targets = engine.attackableTargets(attacker.id);
    if (targets.length === 0) return false;
    engine.log(`⚔️ ${attacker.name} Star Sword Saphir — โจมตีเพิ่มอีกครั้งทันที!`);
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

  // เรียกจาก postAttackFollowup() (universal dispatcher) — อย่างนายน่ะ จะไปเข้าใจอะไร: โอกาส 50% ได้โจมตีต่อครั้งที่ 3
  //  คืน true ถ้าเริ่มโจมตีต่อสำเร็จ (ผู้เรียกต้อง return ทันที)
  startThirdAttack(engine, attacker) {
    if (!((attacker.statuses.takutoThirdAtk || 0) > 0)) return false;
    delete attacker.statuses.takutoThirdAtk;
    if (Math.random() < TAKUTO_THIRD_ATK_CHANCE) {
      const targets = engine.attackableTargets(attacker.id);
      if (targets.length > 0) {
        engine.log(`⚔️ ${attacker.name} อย่างนายน่ะ จะไปเข้าใจอะไร — โจมตีต่อเป็นครั้งที่ 3 สำเร็จ!`);
        engine.setAttackerId(attacker.id);
        engine.setGameState("ATTACK");
        engine.startPhaseTimer(engine.ATTACK_TIME, () => {
          const t = engine.attackableTargets(engine.attackerId);
          if (t.length) engine.doAttack(engine.attackerId, t[Math.floor(Math.random() * t.length)].id);
          else engine.endTurn();
        });
        engine.broadcastState();
        return true;
      }
    } else {
      engine.log(`⚔️ ${attacker.name} อย่างนายน่ะ จะไปเข้าใจอะไร — โอกาสโจมตีครั้งที่ 3 ไม่สำเร็จ (${Math.round(TAKUTO_THIRD_ATK_CHANCE * 100)}%)`);
    }
    return false;
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจแล้ว — วีดีโอพิชิตแสงดาว/หอกผู้พิชิต + ผลหลังโจมตีของดาบทั้งสาม คืน true ถ้าต้องเลื่อนวีดีโอสรุปความเสียหาย
  onAttackPostDamage(engine, attacker, dmg) {
    let videoQueued = false;
    if (attacker.takutoUlt2VideoPending) {
      attacker.takutoUlt2VideoPending = false;
      videoQueued = true;
      engine.triggerCutscene(attacker, "takutoUlt2");
    }
    if ((attacker.statuses.lance || 0) > 0) {
      // หอกผู้พิชิต: ดาเมจถูกทับเป็นค่าคงที่ไปแล้ว (คำนวณในส่วนดาเมจของ doAttack) — ใช้แล้วล้างหอกทิ้ง ต้องรวมดาบใหม่อีกครั้ง
      delete attacker.statuses.lance;
      videoQueued = true;
      engine.triggerCutscene(attacker, "takutoLanceHit");
      const healed = engine.healHp(attacker, TAKUTO_LANCE_HEAL);
      engine.log(`⚔️ ${attacker.name} หอกผู้พิชิต — โจมตีคงที่ ${dmg} หน่วย และฟื้นพลังชีวิต +${healed} (หอกถูกใช้ไปแล้ว ต้องรวมดาบทั้งคู่ใหม่อีกครั้ง)`);
      return videoQueued;
    }
    const emeraudeOn = (attacker.statuses.emeraude || 0) > 0;
    const saphirOn = (attacker.statuses.saphir || 0) > 0;
    // วีดีโอ takuto_2sword.mp4 เล่นไปแล้วตอนกดสกิลที่ 2 ครบทั้งคู่ (ดู useSkill) — ตรงนี้แค่ใช้ผลจริงตอนโจมตี
    if (emeraudeOn) {
      delete attacker.statuses.emeraude;
      const heal = engine.healHp(attacker, dmg);
      engine.log(`💚 ${attacker.name} Star Sword Emeraude — ฟื้นพลังชีวิตตามความเสียหายที่ทำได้ +${heal}`);
    }
    // คอมโบโจมตี 2 ครั้งต้องมี Emeraude ร่วมด้วยเท่านั้น (การันตี — patch 2.2.3) — มี Saphir ลำพังไม่ได้โจมตีเพิ่มอีกต่อไป
    if (saphirOn) {
      delete attacker.statuses.saphir;
      if (emeraudeOn) attacker.takutoComboReady = true;
      else engine.log(`⚔️ ${attacker.name} Star Sword Saphir — ไม่มี Emeraude ร่วมด้วย จึงไม่ได้โจมตีเพิ่ม`);
    }
    return videoQueued;
  },
};
