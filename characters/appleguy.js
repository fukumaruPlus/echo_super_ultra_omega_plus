// ============================================================
//  Apple guy (patch 1.8) — เอาแบบนี้ได้ไหม / เอาไปสิ / ชิวๆ ไม่โดนหรอกครับ (สกิลติดตัว) / หลบสังหารทันที
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: appleGuyDodgesKill() ใน server.js เป็น universal-dispatcher wrapper ที่ tohno.js และ
//  ตัวละครสังหารทันทีอื่นๆ เรียกผ่าน engine.appleGuyDodgesKill(attacker, target) — ตรรกะจริงอยู่ที่นี่
// ============================================================

const APPLE_ITEMS = {
  drink:  { name: "เครื่องดื่มชูกำลัง", img: "/characters/appleguy/appleguy_skill1.1.jpg" },
  iphone: { name: "ไอโฟนเครื่องใหม่", img: "/characters/appleguy/appleguy_skill1.2.png" },
  promo:  { name: "ใบโปรโมทสินค้า", img: "/characters/appleguy/appleguy_skill1.3.jpg" },
};
const APPLE_ATK_MAX = 2;      // บัฟพลังโจมตีจากการมอบของ ซ้อนทับได้สูงสุด 2 หน่วย
const APPLE_ATK_DURATION = 3; // แต่ละหน่วยคงอยู่ 3 เทิร์นแยกกัน
const APPLE_GIVE_USES = 2;    // เอาไปสิ ใช้ได้จำกัด 2 ครั้ง (เติมจากสกิลติดตัวเมื่อหลบสำเร็จ)
const CHILL_DODGE_MID = 50;   // อัตราหลบขั้นกลาง (%)
const CHILL_DODGE_MIN = 25;   // อัตราหลบต่ำสุด (%)

module.exports = {
  id: "appleguy",
  ITEMS: APPLE_ITEMS,
  GIVE_USES: APPLE_GIVE_USES,

  // ดาเมจ contribution (เอาไปสิ +1 ต่อบัฟ) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const appleAtk = attacker.appleAtkBuffs ? attacker.appleAtkBuffs.length : 0;
    ctx.appleAtk = appleAtk;
    return appleAtk;
  },

  // เรียกจาก useSkill()'s gate — ต้องเลือกของที่มีจริงเท่านั้น
  validateBasicItem(item) {
    return !!APPLE_ITEMS[item];
  },

  // เรียกจาก useSkill() ในส่วน effect (isApplePick === true) — เปลี่ยนของส่งมอบ คืน flashSuffix
  applyBasicPick(p, item, log) {
    p.appleItem = item;
    log(`🍎 ${p.name} เอาแบบนี้ได้ไหม — เปลี่ยนของส่งมอบเป็น ${APPLE_ITEMS[item].name}`);
    return ` — เลือก${APPLE_ITEMS[item].name}`;
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย เอาไปสิ (ต้องมีจำนวนใช้เหลือ + เลือกคนอื่น)
  prepareGiveTarget(engine, p, targets) {
    if ((p.appleGiveUses || 0) <= 0) return null;
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — มอบของที่เลือกให้เป้าหมายทันที + บัฟพลังโจมตี คืน flashSuffix
  applyGiveEffect(engine, p, appleTarget, skillName) {
    if (engine.satoruOnTargeted(appleTarget, p, `สกิล ${skillName} `).negated) {
      p.appleGiveUses = Math.max(0, (p.appleGiveUses || 0) - 1); // ของหลุดมือ — จำนวนใช้เสียไปตามปกติ
      return " — ถูกลบล้าง";
    }
    p.appleGiveUses = Math.max(0, (p.appleGiveUses || 0) - 1);
    const t = appleTarget;
    const itemKey = p.appleItem || "drink";
    const it = APPLE_ITEMS[itemKey];
    if (itemKey === "drink") {
      // เพิ่มแต้มสกิล 1 / เสียเลือด 1 ต่อเทิร์น คงอยู่ 2 เทิร์น (+1 ชดเชยการลดสถานะตอนจบเทิร์น)
      if (engine.resistActive(t)) {
        engine.log(`🛡️ ${t.name} ต้านสถานะผิดปกติ — เครื่องดื่มชูกำลังไม่มีผล`);
      } else {
        t.statuses.energy = Math.max(t.statuses.energy || 0, 3);
        engine.log(`🥤 ${p.name} เอาไปสิ — มอบเครื่องดื่มชูกำลังให้ ${t.name} (แต้มสกิล +1 / เสียเลือด 1 ต่อเทิร์น 2 เทิร์น)`);
      }
    } else if (itemKey === "iphone") {
      // ฟื้นเกราะ 2 หน่วย แต่เสียพลังชีวิต 1 หน่วยแบบไม่สนเกราะ
      engine.healArmor(t, 2);
      engine.dealDirect(t, 1);
      engine.maybeBeatSave(t);
      engine.maybeBeatMode(t);
     
      engine.log(`📱 ${p.name} เอาไปสิ — มอบไอโฟนเครื่องใหม่ให้ ${t.name} (เกราะ +2 / เสียเลือด 1 ไม่สนเกราะ)`);
      if (t.alive && t.hp <= 0) {
        engine.instantDeath(t);
        if (!t.alive) engine.log(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
      }
    } else {
      // ใบโปรโมทสินค้า: แต้มการ์ดของผู้รับถูกเปิดเผยให้ทุกคนเห็น คงอยู่ 1 เทิร์น
      if (engine.resistActive(t)) {
        engine.log(`🛡️ ${t.name} ต้านสถานะผิดปกติ — ใบโปรโมทสินค้าไม่มีผล`);
      } else {
        t.statuses.promo = 1;
        engine.log(`📢 ${p.name} เอาไปสิ — แปะใบโปรโมทสินค้าให้ ${t.name} (ทุกคนเห็นแต้มการ์ดตลอดเทิร์นนี้)`);
      }
    }
    // บัฟพลังโจมตี: มอบของแต่ละครั้ง +1 หน่วย ซ้อนทับได้สูงสุด 2 หน่วย แต่ละหน่วยคิดระยะเวลาคงอยู่แยกกัน
    p.appleAtkBuffs = p.appleAtkBuffs || [];
    if (p.appleAtkBuffs.length < APPLE_ATK_MAX) {
      p.appleAtkBuffs.push(APPLE_ATK_DURATION);
      engine.log(`🍎 ${p.name} พลังโจมตีจากการมอบของ +1 (${p.appleAtkBuffs.length}/${APPLE_ATK_MAX} หน่วย คงอยู่ ${APPLE_ATK_DURATION} เทิร์น)`);
    } else {
      engine.log(`🍎 ${p.name} พลังโจมตีจากการมอบของเต็มแล้ว (${APPLE_ATK_MAX}/${APPLE_ATK_MAX} หน่วย)`);
    }
    return ` — มอบ${it.name}ให้ ${t.name}`;
  },

  // เรียกจาก server.js's appleGuyDodgesKill(attacker, target) (universal dispatcher) — สกิลติดตัว: หลบสังหารทันที
  //  คืน true ถ้าหลบพ้น (ผู้เรียกต้อง return ทันที) — จบลำดับการโจมตีให้เรียบร้อยเหมือนหลบการโจมตีปกติ
  tryDodgeKill(engine, attacker, target) {
    if (!target || target.characterId !== "appleguy" || (target.statuses.chill || 0) <= 0 || engine.passiveSealed(target)) return false;
    const rate = Math.max(CHILL_DODGE_MIN, Math.min(100, target.chillDodge != null ? target.chillDodge : 100));
    if (Math.random() * 100 >= rate) return false;
    const firstDodge = rate === 100; // วีดีโอเล่นตอนหลบครั้งแรกที่ 100%
    target.chillDodge = rate > CHILL_DODGE_MID ? CHILL_DODGE_MID : CHILL_DODGE_MIN;
    engine.healHp(target, 1);
    target.appleGiveUses = Math.min(APPLE_GIVE_USES, (target.appleGiveUses || 0) + 1); // ไม่สามารถซ้อนทับได้ เกินเพดานตัดทิ้ง
    target.wasAttacked = true;
    engine.log(`🏖️ ${target.name} ชิวๆครับน้องๆ — หลบความสามารถสังหารทันทีของ ${attacker.name} ได้! ฟื้นพลังชีวิต +1 เติมเอาไปสิ +1 (อัตราหลบเหลือ ${target.chillDodge}%)`);
    if (firstDodge && !target.cutsceneShown.appleguyDodge) {
      target.cutsceneShown.appleguyDodge = true;
      engine.queueCutscene(target, "appleguyDodge");
    }
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, dodge: true,
      skills: [{ name: "ชิวๆครับน้องๆ (หลบสังหารทันที)", img: "/characters/appleguy/appleguy_skill3.jpg", by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // เรียกจาก doAttack() — สกิลติดตัว: ระหว่างชิวๆครับน้องๆ มีโอกาสหลบการถูกเลือกโจมตี (ไม่ใช่แค่สังหารทันที)
  //  คืน true ถ้าหลบพ้น (ผู้เรียกต้อง return ทันที) หรือ false ถ้าไม่ได้อยู่ในสถานะ chill/หลบไม่พ้น
  onAttackTryDodge(engine, attacker, target) {
    if (!(target.characterId === "appleguy" && (target.statuses.chill || 0) > 0 && !engine.passiveSealed(target))) return false;
    const rate = Math.max(CHILL_DODGE_MIN, Math.min(100, target.chillDodge != null ? target.chillDodge : 100));
    if (Math.random() * 100 < rate) {
      const firstDodge = rate === 100;
      target.chillDodge = rate > CHILL_DODGE_MID ? CHILL_DODGE_MID : CHILL_DODGE_MIN;
      engine.healHp(target, 1); // หลบได้ ฟื้นพลังชีวิต 1 หน่วย
      target.appleGiveUses = Math.min(APPLE_GIVE_USES, (target.appleGiveUses || 0) + 1);
      target.wasAttacked = true; // ถูกโจมตีไม่ได้แต้มสกิลอีกต่อไป (แม้หลบพ้น)
      engine.log(`🏖️ ${target.name} ชิวๆครับน้องๆ — หลบการโจมตีของ ${attacker.name} ได้! ฟื้นพลังชีวิต +1 เติมเอาไปสิ +1 (อัตราหลบเหลือ ${target.chillDodge}%)`);
      if (firstDodge && !target.cutsceneShown.appleguyDodge) {
        target.cutsceneShown.appleguyDodge = true;
        engine.queueCutscene(target, "appleguyDodge");
      }
      engine.setLastAttack({
        byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
        targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
        dmg: 0, dodge: true,
        skills: [{ name: "ชิวๆครับน้องๆ (หลบพ้น)", img: "/characters/appleguy/appleguy_skill3.jpg", by: target.name, color: engine.POSITION_COLORS[target.position] || "#888", side: "def" }],
      });
      engine.runCutsceneQueue(() => {
        engine.setGameState("ATTACKING");
        engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
        engine.broadcastState();
      });
      return true;
    }
    delete target.statuses.chill;
    engine.log(`💢 ${target.name} หลบไม่พ้น — ผลชิวๆครับน้องๆ จบลง`);
    return false;
  },

  // เรียกจาก dealRound() ต้นเทิร์น — บัฟพลังโจมตีจากการมอบของ นับถอยหลังแยกกันแต่ละหน่วย (5 เทิร์น/หน่วย)
  onRoundStartDecay(p) {
    if (p.appleAtkBuffs && p.appleAtkBuffs.length) {
      p.appleAtkBuffs = p.appleAtkBuffs.map((n) => n - 1).filter((n) => n > 0);
    }
  },

  // เรียกจาก afterResolve()'s เทเปา kill-resolution loop — เวอร์ชันหลบเฉพาะกิจสำหรับ "นายเป็นคนทำตัวเองนะ"
  //  (ไม่ผ่าน tryDodgeKill เพราะจุดเรียกใช้ continue แทน return — คืน true ถ้าหลบพ้น)
  tryDodgeTepeuKill(engine, byPlayer, t) {
    if (!(t.characterId === "appleguy" && !engine.passiveSealed(t) && (t.statuses.chill || 0) > 0)) return false;
    const dodgeRate = Math.max(CHILL_DODGE_MIN, Math.min(100, t.chillDodge != null ? t.chillDodge : 100));
    if (Math.random() * 100 >= dodgeRate) return false;
    const firstDodge = dodgeRate === 100;
    t.chillDodge = dodgeRate > CHILL_DODGE_MID ? CHILL_DODGE_MID : CHILL_DODGE_MIN;
    engine.healHp(t, 1);
    t.appleGiveUses = Math.min(APPLE_GIVE_USES, (t.appleGiveUses || 0) + 1);
    engine.log(`🏖️ ${t.name} ชิวๆครับน้องๆ — หลบนายเป็นคนทำตัวเองนะของ ${byPlayer.name} ได้! ฟื้นพลังชีวิต +1 เติมเอาไปสิ +1 (อัตราหลบเหลือ ${t.chillDodge}%)`);
    if (firstDodge && !t.cutsceneShown.appleguyDodge) { t.cutsceneShown.appleguyDodge = true; engine.queueCutscene(t, "appleguyDodge"); }
    return true;
  },
};
