// ============================================================
//  ไรโด ฮิคารุ (patch 2.1.3) — MonsterLive (Black King) / Ultlive Ultraman Ginga (สกิลรอง 1) /
//  Ginga Strium (ท่าไม้ตาย, สกิลรองเปลี่ยนเป็นลำแสงสโตเรียม) / หัวใจที่ลุกไหม้ (สกิลติดตัว 2)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: "hburn" (ลุกไหม้) เป็นสถานะ Universal (ดาเมจ 1/เทิร์น, ค่าเริ่มต้น) — กลไก tick หลัก
//  ย้ายไปอยู่ characters/_universal_status.js's tickBurn(engine, p) แล้ว ไฟล์นี้มีแค่ hook 2 ตัวที่
//  tickBurn เรียกกลับมาถาม: hburnHeals(p) (ฮิคารุฮีลแทนรับดาเมจเมื่อไหร่ — ระหว่างร่าง Ginga Strium เท่านั้น)
//  และ hburnLabel(p) (ชื่อ flavor ที่ใช้ใน log ตอนฮีล) — ไม่ต้องแก้ _universal_status.js เพื่อเพิ่ม hook พวกนี้
//  `upgCap(p)` ใน server.js ตอนนี้เป็นแค่ wrapper บางๆ ที่เรียกเข้ามาที่นี่
// ============================================================

const HIKARU_MONSTER_ARMOR_HEAL = 2;  // MonsterLive: ฟื้นเกราะทันที +2
const HIKARU_MONSTER_TURNS = 3;       // MonsterLive: คงอยู่ 3 เทิร์น (แค่ log ที่นี่ — คงอยู่จริงตั้งค่าผ่าน status)
const HIKARU_UPG2_CAP = 20;           // UPG! (สกิลพื้นฐาน 2 ระหว่างร่าง Ginga): เพดานแต้มจั่วไพ่
const HIKARU_GINGA_TURNS = 5;         // Ultlive Ultraman Ginga (สกิลรอง 1): คงอยู่ 5 เทิร์น
const HIKARU_STRIUM_TURNS = 5;        // Ginga Strium (ท่าไม้ตาย): คงอยู่ 5 เทิร์น (แค่ log ที่นี่)
const HIKARU_STRIUM_SELF_BURN = 5;    // Ginga Strium: ติดลุกไหม้ใส่ตัวเองทันทีตอนแปลงร่าง
const HIKARU_STRIUM_HIT_BURN = 2;     // Ginga Strium/ลำแสงสโตเรียม: โจมตีโดนเป้าหมาย -> ติดลุกไหม้ให้เป้าหมาย
const HIKARU_BURN_MAX = 6;            // ลุกไหม้: สะสมได้ไม่เกิน 6 หน่วยต่อผู้เล่น

module.exports = {
  id: "hikaru",

  // ดาเมจ contribution (Ginga/Ginga Strium +1 / Ginga no Uta +1) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const gingastriumAtk = (attacker.statuses.gingastrium || 0) > 0;
    const ginga = (attacker.statuses.ginga || 0) > 0 && !gingastriumAtk;
    const lastStanding = (ginga || gingastriumAtk) && engine.alivePlayers().filter((p) => p.id !== attacker.id).length === 1;
    ctx.gingastriumAtk = gingastriumAtk;
    ctx.ginga = ginga;
    ctx.lastStanding = lastStanding;
    return ((ginga || gingastriumAtk) ? 1 : 0) + (gingastriumAtk ? 1 : 0) + (lastStanding ? 1 : 0);
  },

  // เพดานแต้มขณะ UPG! (patch 2.1.3): ใช้ได้เฉพาะระหว่างร่าง Ginga — เรียกผ่าน server.js's upgCap(p) wrapper
  upgCap() {
    return HIKARU_UPG2_CAP;
  },

  // เรียกจาก characters/_universal_status.js's tickBurn — ระหว่างร่าง Ginga Strium ลุกไหม้กลายเป็นการฮีลแทนดาเมจ
  hburnHeals(p) {
    return p.characterId === "hikaru" && (p.statuses.gingastrium || 0) > 0;
  },

  // เรียกจาก tickBurn เช่นกัน — ชื่อ flavor ที่ใช้ใน log ตอนลุกไหม้กลายเป็นการฮีล
  hburnLabel() {
    return "หัวใจที่ลุกไหม้";
  },

  // เรียกจาก useSkill() ในส่วน effect — MonsterLive: เพิ่มเพดานเกราะ +2 (ผ่าน maxArmorOf) และฟื้นเกราะทันที +2
  activateMonster(engine, p) {
    engine.triggerCutscene(p, "monster");
    const healed = engine.healArmor(p, HIKARU_MONSTER_ARMOR_HEAL);
    engine.log(`🛡️ ${p.name} MonsterLive — เพดานเกราะ +2 และฟื้นเกราะ +${healed} (คงอยู่ ${HIKARU_MONSTER_TURNS} เทิร์น — เกราะที่เสียจะฟื้นเป็นเลือดแทน)`);
  },

  // เรียกจาก useSkill() ในส่วน effect — Ultlive Ultraman Ginga (สกิลรอง 1): แปลงร่าง Ginga ทันทีก่อนเปิดไพ่
  activateGinga(engine, p) {
    p.seen.ginga = true;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "ginga");
    engine.log(`🎵 ${p.name} Ultlive Ultraman Ginga — แปลงร่าง Ginga ${HIKARU_GINGA_TURNS} เทิร์น! การโจมตีกลายเป็นตีหมู่ (สกิลพื้นฐานเปลี่ยนเป็น UPG!)`);
  },

  // เรียกจาก useSkill() ในส่วน effect — Ginga Strium (ท่าไม้ตาย): แทนที่ร่าง Ginga ทันที + ติดลุกไหม้ตัวเอง
  activateGingaStrium(engine, p) {
    delete p.statuses.ginga;
    p.seen.gingastrium = true;
    p.transformAt = engine.nextTransformCounter();
    engine.triggerCutscene(p, "gingastrium");
    const selfResisted = engine.resistActive(p);
    if (!selfResisted) p.statuses.hburn = Math.min(HIKARU_BURN_MAX, (p.statuses.hburn || 0) + HIKARU_STRIUM_SELF_BURN);
    engine.log(`🔥🎵 ${p.name} Ginga Strium! แปลงร่าง ${HIKARU_STRIUM_TURNS} เทิร์น (แทนที่ร่าง Ginga) พลังโจมตี +1${selfResisted ? " (ต้านสถานะผิดปกติของตัวเอง — ไม่ติดลุกไหม้)" : ` ติดลุกไหม้ตัวเอง ${HIKARU_STRIUM_SELF_BURN} หน่วย`} (สกิลรองเปลี่ยนเป็นลำแสงสโตเรียม)`);
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ — Ginga Strium: โจมตีโดนเป้าหมาย -> ติดลุกไหม้ให้เป้าหมาย / ถูกโจมตีขณะอยู่ในร่างนี้ -> ผู้โจมตีติดลุกไหม้สวนกลับ
  onAttackBurnApply(engine, attacker, target) {
    if (attacker.characterId === "hikaru" && (attacker.statuses.gingastrium || 0) > 0 && target.hp > 0) {
      if (engine.resistActive(target)) {
        engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติดลุกไหม้`);
      } else {
        target.statuses.hburn = Math.min(HIKARU_BURN_MAX, (target.statuses.hburn || 0) + HIKARU_STRIUM_HIT_BURN);
        engine.log(`🔥 ${target.name} ติดลุกไหม้ +${HIKARU_STRIUM_HIT_BURN} จาก Ginga Strium (${target.statuses.hburn}/${HIKARU_BURN_MAX})`);
      }
    }
    if (target.characterId === "hikaru" && (target.statuses.gingastrium || 0) > 0 && attacker.alive && attacker.id !== target.id) {
      if (engine.resistActive(attacker)) {
        engine.log(`🛡️ ${attacker.name} ต้านสถานะผิดปกติ — ไม่ติดลุกไหม้สวนกลับ`);
      } else {
        attacker.statuses.hburn = Math.min(HIKARU_BURN_MAX, (attacker.statuses.hburn || 0) + HIKARU_STRIUM_HIT_BURN);
        engine.log(`🔥 Ginga Strium สวนกลับ! ${attacker.name} ติดลุกไหม้ +${HIKARU_STRIUM_HIT_BURN} จากการโจมตี ${target.name} (${attacker.statuses.hburn}/${HIKARU_BURN_MAX})`);
      }
    }
  },

  // เรียกจาก doAttack() — Ginga: ตีหมู่ — คนที่ไม่ใช่เป้าหมายเสียเกราะ -1 (Ginga no Uta ไม่มีผลกับการตีหมู่)
  onAttackGingaSplash(engine, attacker, target, ginga) {
    if (!ginga) return;
    const splashHit = [];
    for (const o of engine.alivePlayers()) {
      if (o.id === attacker.id || o.id === target.id) continue;
      let admg = 1;
      if ((o.statuses.monster || 0) > 0) admg = Math.max(0, admg - 1);
      engine.dealArmorOnly(o, admg);
      o.wasAttacked = true;
      splashHit.push(o);
    }
    if (splashHit.length) engine.log(`ตีหมู่ Ginga! ผู้เล่นอื่นเสียเกราะ -1`);
  },

  // เรียกจาก doAttack() — ลำแสงสโตเรียม: ตีหมู่ — คนอื่นรับดาเมจเท่ากับลุกไหม้ที่ติดอยู่ แล้วติดลุกไหม้เพิ่ม
  onAttackStoriumSplash(engine, attacker, target, storiumAtk) {
    if (!storiumAtk) return;
    const splashHit = [];
    for (const o of engine.alivePlayers()) {
      if (o.id === attacker.id || o.id === target.id) continue;
      const preBurn = o.statuses.hburn || 0;
      if (preBurn > 0) engine.dealMixed(o, preBurn);
      engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeWakeKotone(o);
      o.wasAttacked = true;
      splashHit.push({ p: o, dmg: preBurn });
    }
    if (splashHit.length) engine.log(`🌟 ลำแสงสโตเรียม ตีหมู่! ${splashHit.map((h) => `${h.p.name} -${h.dmg}`).join(", ")}`);
    for (const { p: o } of splashHit) {
      if (o.hp <= 0) continue;
      if (engine.resistActive(o)) {
        engine.log(`🛡️ ${o.name} ต้านสถานะผิดปกติ — ไม่ติดลุกไหม้จากลำแสงสโตเรียม`);
      } else {
        o.statuses.hburn = Math.min(HIKARU_BURN_MAX, (o.statuses.hburn || 0) + HIKARU_STRIUM_HIT_BURN);
        engine.log(`🔥 ${o.name} ติดลุกไหม้ +${HIKARU_STRIUM_HIT_BURN} จากลำแสงสโตเรียม (${o.statuses.hburn}/${HIKARU_BURN_MAX})`);
      }
    }
  },

  // เรียกจาก doAttack() — Ginga no Uta: กำจัดเป้าหมายได้ขณะอยู่ในร่าง Ginga Strium -> ต่ออายุ +1 เทิร์น
  onAttackExtendOnKill(engine, attacker, target, hpBefore, gingastriumAtk) {
    if (!(attacker.characterId === "hikaru" && gingastriumAtk && hpBefore > 0 && target.hp <= 0)) return;
    attacker.statuses.gingastrium = (attacker.statuses.gingastrium || 0) + 1;
    engine.log(`🎵 Ginga no Uta: ${attacker.name} กำจัด ${target.name} — ท่าไม้ตายคงอยู่ +1 เทิร์น`);
  },

  // เรียกจาก loseArmor()'s shared function — MonsterLive: เกราะลดลง -> ฟื้นพลังชีวิต +1 ตามจำนวนครั้งที่เรียก
  onArmorLost(engine, p) {
    if (p.characterId === "hikaru" && (p.statuses.monster || 0) > 0) engine.healHp(p, 1);
  },
};
