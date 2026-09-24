// สถานะที่ "ไม่นับถอยหลังเทิร์น" — ค่าใน p.statuses เป็นสแตค/ธง ไม่ใช่จำนวนเทิร์นที่เหลือ
// ต้องตรงกับ NO_TICK_STATUS ใน characters/_universal_status.js ฝั่งเซิร์ฟเวอร์เสมอ
// (มีเทสต์ tests/permanentStatus.test.js คอยกันไม่ให้สองฝั่งหลุดจากกัน)
export const PERMANENT_STATUS_KEYS = new Set([
  "brianBoost", "brianCar", "cassius", "chill",
  "deathline", "doomCrucible", "doomDrain", "doomExplode", "doomLockon",
  "emeraude", "empower", "escanorFlare", "escanorFlareNoon", "escanorLastStand",
  "escanorMorning", "escanorNight", "escanorNoon", "escanorPunch", "escanorRhitta",
  "escanorRhittaNoon", "escanorSolar", "escanorSun", "evade", "fortune",
  "graybeast", "grit", "hakunoInvertReady", "hakunoNoRegenReady", "hbleed",
  "hburn", "healthfull", "hisakawaTempo", "ippoDempsey", "kaiCreation",
  "kaiPunishment", "kotoneLove", "kotoneReady", "kready", "lance",
  "linked", "mageslayerFury", "mageslayerMark", "melody", "miyakoCombo",
  "miyakoHeal", "miyakoUlt", "ohger", "overweight", "rsHopper",
  "saphir", "spear", "star", "supFaith", "takutoThirdAtk",
  "tepeuCook", "tepeuPonder", "triggerDarkWail", "triggerForm", "triggerLight",
  "triggerMulti", "triggerZeperion", "usagiMath", "yaak",
]);
