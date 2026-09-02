// ============================================================
// มุยมิ — เสบียงฉุกเฉิน / ดาบสนิม / ดาบสะบั้นหอคอยสวรรค์
// ============================================================

const ID = "muimi";

const EMERGENCY_USES = 2;
const RUSTY_TURNS = 3;
const TOWER_TURNS = 2;
const RESIST_TURNS = 3;
const TOWER_ATK_BONUS = 3;
const ULT_COOLDOWN_TURNS = 5;
const HEART_LOSSES = 3;
const HEART_CHANCE = 0.5;

const IMG = {
  base: "/characters/muimi/muimi.webp",
  ultimate: "/characters/muimi/muimi_ub.webp",
  skill1: "/characters/muimi/muimi_skill1.webp",
  skill2: "/characters/muimi/muimi_skill2.png",
  skill3: "/characters/muimi/muimi_skill3.webp",
};

function isMuimi(p) { return !!p && p.characterId === ID; }
function rustyActive(p) { return isMuimi(p) && ((p.statuses && p.statuses.muimiRusty) || 0) > 0; }
function towerActive(p) { return isMuimi(p) && ((p.statuses && p.statuses.muimiTower) || 0) > 0; }

function forceBustOpponents(engine, owner, reason) {
  let affected = 0;
  for (const target of Object.values(engine.players)) {
    if (!target.alive || target.id === owner.id || engine.sameTeam(owner, target)) continue;
    // เป็นคำสั่งให้ไพ่แตกโดยตรง ไม่ใช่ดีบัฟ จึงไม่ผ่าน applyDebuff และต้านสถานะป้องกันไม่ได้
    target.muimiForcedBustRound = engine.roundNumber;
    target.busted = true;
    affected++;
  }
  engine.log(`💥 ${owner.name} ${reason} — บังคับให้คู่ต่อสู้ไพ่แตก ${affected} คน`);
  return affected;
}

module.exports = {
  id: ID,
  IMG,
  EMERGENCY_USES,
  RUSTY_TURNS,
  TOWER_TURNS,
  RESIST_TURNS,
  TOWER_ATK_BONUS,
  ULT_COOLDOWN_TURNS,
  HEART_LOSSES,
  HEART_CHANCE,

  rustyActive,
  towerActive,

  resetCombat(p) {
    p.muimiEmergencyUses = EMERGENCY_USES;
    p.muimiEmergencyUsedRound = 0;
    p.muimiLoseStreak = 0;
    p.muimiHeartRound = 0;
    p.muimiForcedBustRound = 0;
    p.muimiUltCasts = 0;
    p.muimiUltCastRound = 0;
    p.muimiUltLock = 0;
  },

  displayImg(p) { return towerActive(p) ? IMG.ultimate : null; },

  forcedBust(engine, p) {
    return !!p && p.muimiForcedBustRound === engine.roundNumber;
  },

  canUseSkill(engine, p, tier) {
    if (!isMuimi(p)) return true;
    if (tier === "basic") {
      return (p.muimiEmergencyUses || 0) > 0 && p.muimiEmergencyUsedRound !== engine.roundNumber;
    }
    if (tier === "secondary") return !towerActive(p);
    if (tier === "ultimate") return !rustyActive(p) && this.ultCooldownLeft(engine, p) <= 0;
    return true;
  },

  onUltExpire(engine, p) {
    if (!isMuimi(p)) return;
    p.muimiUltLock = Math.max(p.muimiUltLock || 0, engine.roundNumber + ULT_COOLDOWN_TURNS);
    engine.log(`⏳ ${p.name} ดาบสะบั้นหมดเวลาแล้ว — ใช้ดาบสะบั้นหอคอยสวรรค์ซ้ำไม่ได้อีก ${ULT_COOLDOWN_TURNS} เทิร์น`);
  },

  ultCooldownLeft(engine, p) {
    if (!isMuimi(p)) return 0;
    // สถานะหมดตอนท้ายรอบ จึงบวก 1 เพื่อให้สามรอบถัดไปแสดง 3 -> 2 -> 1 และกดได้ในรอบต่อจากนั้น
    return Math.max(0, (p.muimiUltLock || 0) - engine.roundNumber + 1);
  },

  applyInstantSkill(engine, p, tier) {
    p.statuses ||= {};
    if (tier === "basic") {
      p.muimiEmergencyUses = Math.max(0, (p.muimiEmergencyUses || 0) - 1);
      p.muimiEmergencyUsedRound = engine.roundNumber;
      const hp = engine.healHp(p, 2);
      const before = p.skillPoints;
      engine.addSkill(p, 2);
      const sp = p.skillPoints - before;
      engine.log(`🍖 ${p.name} ใช้เสบียงฉุกเฉิน — ฟื้นพลังชีวิต +${hp} และแต้มสกิล +${sp} (เหลือ ${p.muimiEmergencyUses} ครั้ง)`);
      return ` — พลังชีวิต +${hp} · แต้มสกิล +${sp}`;
    }
    if (tier === "secondary") {
      p.statuses.muimiRusty = RUSTY_TURNS;
      engine.log(`🗡️ ${p.name} ได้รับสถานะ “ดาบเก่าๆ” ${RUSTY_TURNS} เทิร์น`);
      return " — ได้รับสถานะ ดาบเก่าๆ";
    }
    if (tier === "ultimate") {
      p.statuses.muimiTower = TOWER_TURNS;
      p.statuses.resist = Math.max(p.statuses.resist || 0, RESIST_TURNS);
      p.muimiUltCastRound = engine.roundNumber;
      p.muimiUltCasts = (p.muimiUltCasts || 0) + 1;
      p.transformAt = engine.nextTransformCounter();
      forceBustOpponents(engine, p, "ดาบสะบั้นหอคอยสวรรค์");
      engine.queueCutscene(p, p.muimiUltCasts === 1 ? "muimiUltimateFull" : "muimiUltimateShort");
      engine.log(`⚔️ ${p.name} ได้รับสถานะ “ดาบสะบั้น” ${TOWER_TURNS} เทิร์น และ “ต้านสถานะผิดปกติ” ${RESIST_TURNS} เทิร์น`);
      return " — คู่ต่อสู้ไพ่แตก · ได้รับสถานะ ดาบสะบั้น";
    }
    return "";
  },

  damageBonus(engine, attacker, target, ctx) {
    if (!towerActive(attacker)) return 0;
    ctx.muimiTowerAtk = TOWER_ATK_BONUS;
    return TOWER_ATK_BONUS;
  },

  onAttackLanded(engine, attacker) {
    if (!isMuimi(attacker)) return null;
    if (towerActive(attacker)) {
      const hp = engine.healHp(attacker, 2);
      let extended = false;
      if (!engine.passiveSealed(attacker)) {
        attacker.statuses.muimiTower++;
        extended = true;
      }
      engine.log(`⚔️ ${attacker.name} ดาบสะบั้น — ฟื้นพลังชีวิต +${hp}${extended ? " และยืดเวลาท่าไม้ตาย +1 เทิร์น" : ""}`);
      return { mode: "tower", hp, sp: 0, extended };
    }
    if (rustyActive(attacker)) {
      const hp = engine.healHp(attacker, 1);
      const before = attacker.skillPoints;
      engine.addSkill(attacker, 1);
      const sp = attacker.skillPoints - before;
      engine.log(`🗡️ ${attacker.name} ดาบเก่าๆ — ฟื้นพลังชีวิต +${hp} และแต้มสกิล +${sp}`);
      return { mode: "rusty", hp, sp, extended: false };
    }
    return null;
  },

  blocksOverloadForce(engine) {
    return Object.values(engine.players).some(
      (p) => p.alive && towerActive(p) && !engine.passiveSealed(p)
    );
  },

  onAfterRoundScores(engine, combatants) {
    for (const p of combatants) {
      if (!isMuimi(p)) continue;
      if (engine.passiveSealed(p)) {
        p.muimiLoseStreak = 0;
        p.muimiHeartRound = 0;
        continue;
      }
      // การกดท่าไม้ตายในรอบนี้นับเป็นแพ้สำหรับหัวใจนักสู้ แม้มุยมิจะชนะและได้โจมตี
      const lost = engine.bustedOf(p) || !!p.isLoser || p.muimiUltCastRound === engine.roundNumber;
      if (!lost) {
        p.muimiLoseStreak = 0;
        continue;
      }
      p.muimiLoseStreak = Math.min(HEART_LOSSES, (p.muimiLoseStreak || 0) + 1);
      if (p.muimiLoseStreak >= HEART_LOSSES) {
        p.muimiHeartRound = engine.roundNumber + 1;
        engine.log(`❤️‍🔥 ${p.name} แพ้ต่อเนื่องครบ ${HEART_LOSSES} ครั้ง — “หัวใจนักสู้” จะสุ่มทำงานในเทิร์นถัดไป`);
      }
    }
  },

  onRoundStartAfterLoop(engine) {
    for (const p of Object.values(engine.players)) {
      if (!p.alive || !isMuimi(p) || p.muimiHeartRound !== engine.roundNumber) continue;
      p.muimiHeartRound = 0;
      p.muimiLoseStreak = 0; // รีเซ็ตหลังสุ่มทั้งกรณีสำเร็จและล้มเหลว
      if (engine.passiveSealed(p)) {
        engine.log(`🚫 ${p.name} ถูกผนึกสกิลติดตัว — “หัวใจนักสู้” ไม่ทำงาน`);
        continue;
      }
      const success = Math.random() < HEART_CHANCE;
      if (success) forceBustOpponents(engine, p, "หัวใจนักสู้ทำงาน");
      else engine.log(`💔 ${p.name} สุ่ม “หัวใจนักสู้” ไม่สำเร็จ`);
      if (engine.skillFlash) engine.skillFlash({
        name: success ? "หัวใจนักสู้ — ทำงานสำเร็จ" : "หัวใจนักสู้ — ไม่สำเร็จ",
        img: IMG.base,
        by: p.name,
        color: engine.colorOf ? engine.colorOf(p) : "#888",
      });
    }
  },
};
