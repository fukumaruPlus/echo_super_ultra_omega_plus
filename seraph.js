// ============================================================
//  SE.RA.PH Moon Cell — โหมดผจญภัย (รอบละ 5 วัน)
//  กติกา: SERAPH_MOONCELL.md · งานภาพ: SERAPH_SCENES.md
//
//  โมดูลนี้ถือ state ของ "โหมด" ทั้งหมด (วัน/เฟส/คู่ดวล/คิว) แล้วให้ server.js
//  เรียกผ่านจุดเชื่อมที่กำหนดไว้ไม่กี่จุด — ไม่ require server.js กลับ (จะ circular)
//  เข้าถึง state ของเกมผ่าน engine.* เหมือน characters/<id>.js ทุกตัว
//
//  หลักการ: วันที่ 1-4 = แข่งแต้มล้วน ไม่มีดาเมจ ไม่มีสกิล · วันที่ 5 = ดวลคัดออกตัวต่อตัว
// ============================================================

// ---------- ค่าเริ่มต้นของผู้เล่น (SERAPH_MOONCELL.md §2) ----------
const START_HP = 3;
const START_ARMOR = 2;
const START_SKILL_CAP = 4;
const MAX_SKILL_CAP = 8;
const START_GOLD = 10;
const START_SKILL_LEVEL = 1;
const MAX_SKILL_LEVEL = 6;

const MATRIX_MAX = 4;          // สะสมได้สูงสุด 4 แต้ม
const MATRIX_PER_TARGET = 3;   // ลงบนเป้าหมายเดียวได้สูงสุด 3
const DAYS_PER_CYCLE = 5;
const PAIRING_DAY = 2;         // จบวันนี้ = ประกาศคู่ดวล
const DUEL_DAY = 5;

const PLACE_SECONDS = 20;      // เวลาเลือกสถานที่ (SERAPH_SCENES.md S4)
const DUEL_START_SKILL = 4;    // แต้มสกิลตอนเริ่มดวล
const CYCLE_END_GOLD = 5;      // จบรอบทุกคนได้ +5

// ระดับทักษะ -> tier ที่ปลดล็อก (SERAPH_MOONCELL.md §3)
const UNLOCK_AT = { basic: 1, secondary: 3, ultimate: 6 };

const PLACES = ["room", "church", "park", "library", "store"];
const PLACE_NAME = {
  room: "ห้องพัก", church: "โบสถ์", park: "สวนสาธารณะ",
  library: "ห้องสมุด", store: "ร้านสะดวกซื้อ"
};

// ของฟรีจากห้องพัก — **คนละคลังกับร้านค้า** (SERAPH_MOONCELL.md §5)
// ทุกชิ้น "ราคาเกิน 3 เหรียญ" ตามสเปก จึงไม่มีของถูกปนมา
const ROOM_ITEMS = [
  { type: "skill", size: "big", name: "แคปซูลเวทเข้มข้น", amount: 3, weight: 18 },
  { type: "armor", name: "เกราะสำรอง", amount: 2, weight: 20 },
  { type: "heal", name: "ชุดปฐมพยาบาล", amount: 2, weight: 20 },
  { type: "resist", name: "ยาต้านสถานะ", turns: 2, weight: 16 },
  { type: "fortune", name: "เครื่องรางโชคลาภ", turns: 2, weight: 14 },
  { type: "guard", name: "เครื่องกำบังสนาม", amount: 1, turns: 2, weight: 12 }
];

// ============================================================
//  state ของโหมด (module-level — อยู่ตราบที่แมตช์ยังไม่จบ)
// ============================================================
let on = false;
let day = 1;
let cycleRound = 1;
let phase = "draw";      // draw | place | duel
let places = {};         // { playerId: placeKey } ของวันนี้
let placeDone = {};      // { playerId: true } ส่งผลเรียบร้อยแล้ว
let pairs = [];          // [{ a, b, done, winnerId }]
let byeId = null;
let duelIndex = 0;       // คู่ที่กำลังลงสนาม
let pendingLog = [];

function reset() {
  on = false; day = 1; cycleRound = 1; phase = "draw";
  places = {}; placeDone = {}; pairs = []; byeId = null; duelIndex = 0;
  onAllPlaced = null;
  pendingLog = [];
}

// ---------- getters ที่ server.js เรียกบ่อย ----------
const active = () => on;
const currentDay = () => day;
const currentCycle = () => cycleRound;
const currentPhase = () => phase;
const isDuelDay = () => on && day === DUEL_DAY;
/** วันที่ 1-4: ไม่มีดาเมจ ไม่มีสกิล ไม่มีเฟสโจมตี (SERAPH_MOONCELL.md §5) */
const noCombat = () => on && day < DUEL_DAY;
/** รอบเลขคู่ = กลางคืนทั้งรอบ (SERAPH_SCENES.md §6 — 1 รอบ = 1 ช่วงเวลา) */
const isNight = () => on && cycleRound % 2 === 0;

// ============================================================
//  เริ่มแมตช์
// ============================================================
function startMatch(engine) {
  reset();
  on = true;
  for (const p of Object.values(engine.players)) initPlayer(engine, p);
  pendingLog.push(`🌙 SE.RA.PH Moon Cell — รอบที่ ${cycleRound} เริ่มขึ้น · วันที่ 1 จาก 5`);
}

/** ค่าเริ่มต้นรายผู้เล่น — **ค่าพลังเดิมของตัวละครถูกละทิ้งทั้งหมด ทุกตัวเท่ากันหมด** */
function initPlayer(engine, p) {
  p.scCapHp = START_HP;
  p.scCapArmor = START_ARMOR;
  p.scCapSkill = START_SKILL_CAP;
  p.scSkillLevel = START_SKILL_LEVEL;
  p.scMatrix = 0;              // แต้มที่ถืออยู่ (ยังไม่ได้ลง)
  p.scPlaced = {};             // { targetId: 1..3 } แต้มที่ลงบนคนอื่น
  p.scSeen = [];               // playerId ที่เราเคยเห็นตัวละครแล้ว (เห็นของตัวเองเสมอ)
  p.scSpectator = false;       // วันที่ 5: ไม่ได้ลงสนามคู่นี้
  p.scEliminated = false;
  p.hp = START_HP;
  p.armor = START_ARMOR;
  p.skillPoints = 0;
  p.gold = START_GOLD;
}

/** ฟิลด์ที่ต้องล้างทุกครั้งที่ resetCombat (กันค้างข้ามแมตช์ — GAME_SYSTEM.md gotcha #11) */
function resetFields(p) {
  p.scCapHp = 0; p.scCapArmor = 0; p.scCapSkill = 0; p.scSkillLevel = 0;
  p.scMatrix = 0; p.scPlaced = {}; p.scSeen = [];
  p.scSpectator = false; p.scEliminated = false; p.scPlace = null;
}

// ============================================================
//  เพดานค่าสถานะ — ทับค่าเฉพาะตัวละครทุกตัว (SERAPH_MOONCELL.md §2 + §14 ข้อ 4)
// ============================================================
const maxHp = (p) => Math.max(1, p.scCapHp || START_HP);
const maxArmor = (p) => Math.max(0, p.scCapArmor || 0);
const maxSkill = (p) => Math.max(1, p.scCapSkill || START_SKILL_CAP);

/** tier นี้ปลดล็อกหรือยังตามระดับทักษะ */
function tierUnlocked(p, tier) {
  const need = UNLOCK_AT[tier];
  if (!need) return true;
  return (p.scSkillLevel || START_SKILL_LEVEL) >= need;
}

/** ราคาสกิลตามระดับทักษะ (2 / 4 / 6) — ทับค่าของตัวละคร */
const TIER_COST = { basic: 2, secondary: 4, ultimate: 6 };
const costOf = (tier) => TIER_COST[tier];

// ============================================================
//  กองไพ่ 40 ใบ — ถอด King / Queen / Joker (SERAPH_MOONCELL.md §10)
// ============================================================
function deckCards(CARD_COLORS) {
  const deck = [];
  for (let v = 1; v <= 10; v++) for (const color of CARD_COLORS) deck.push({ value: v, color });
  return deck;
}

// ============================================================
//  ใครลงสนามในเทิร์นนี้
//   วันที่ 1-4 = ทุกคนที่ยังไม่ตกรอบ · วันที่ 5 = เฉพาะคู่ที่กำลังดวล
// ============================================================
function combatants(engine) {
  const alive = Object.values(engine.players).filter((p) => p.alive && !p.scEliminated);
  if (!isDuelDay()) return alive;
  const pair = pairs[duelIndex];
  if (!pair) return [];
  return alive.filter((p) => p.id === pair.a || p.id === pair.b);
}

function inCurrentDuel(p) {
  if (!isDuelDay()) return true;
  const pair = pairs[duelIndex];
  return !!pair && (p.id === pair.a || p.id === pair.b);
}

// ============================================================
//  ต้นเทิร์น — server.js เรียกจาก dealRound()
// ============================================================
function onDealRound(engine) {
  if (!on) return;
  if (isDuelDay()) {
    phase = "duel";
    const pair = pairs[duelIndex];
    for (const p of Object.values(engine.players)) {
      p.scSpectator = !pair || (p.id !== pair.a && p.id !== pair.b);
      if (p.scSpectator) { p.cards = []; p.locked = true; p.busted = false; }
    }
  } else {
    phase = "draw";
    for (const p of Object.values(engine.players)) p.scSpectator = false;
  }
}

// ============================================================
//  วันที่ 1-4: ผู้ชนะรับรางวัลแทนเฟสโจมตี (SERAPH_MOONCELL.md §5 ขั้นที่ 2)
// ============================================================
function onRoundWinner(engine, w) {
  if (!noCombat() || !w) return;
  const before = w.scMatrix || 0;
  w.scMatrix = Math.min(MATRIX_MAX, before + 1);
  if (w.scMatrix > before) engine.log(`◆ ${w.name} ชนะประจำวัน — Matrix +1 (${w.scMatrix}/${MATRIX_MAX})`);
  else engine.log(`◆ ${w.name} ชนะประจำวัน — Matrix เต็มแล้ว (${MATRIX_MAX}/${MATRIX_MAX}) แต้มใหม่สูญไป`);
}

// ============================================================
//  เฟสเลือกสถานที่ (S4) — เปิดหลังสรุปแต้มของวันที่ 1-4
// ============================================================
// server.js เป็นเจ้าของ startPhaseTimer/clearPhaseTimer (มีตัวเดียวทั้งเกม) โมดูลนี้จึงถือแค่ข้อมูล
// แล้วให้ server เป็นคนตั้งเวลา/ปิดเฟส — onAllPlaced คือ callback ที่ server ฝากไว้ให้เรียกเมื่อครบคน
let onAllPlaced = null;

function startPlacePhase(engine, allPlacedCb) {
  phase = "place";
  places = {};
  placeDone = {};
  onAllPlaced = allPlacedCb;
  for (const p of Object.values(engine.players)) p.scPlace = null;
}

/** ปิดเฟส: คนที่ยังไม่เลือกถูกสุ่มให้ แล้วกลับสู่เฟสจั่วไพ่ */
function finishPlacePhase(engine) {
  autoAssign(engine);
  phase = "draw";
  onAllPlaced = null;
}

/** ยังมีคนที่ยังไม่ส่งผลอยู่ไหม */
function placePending(engine) {
  return Object.values(engine.players).filter((p) => p.alive && !p.scEliminated && !placeDone[p.id]);
}

/** หมดเวลาแล้วยังไม่เลือก -> สุ่มให้ (ธรรมเนียมเดียวกับเฟส ATTACK) */
function autoAssign(engine) {
  for (const p of placePending(engine)) {
    const options = PLACES.filter((k) => placeAvailable(engine, p, k));
    const key = options[Math.floor(Math.random() * options.length)] || "room";
    engine.log(`⏱️ ${p.name} ไม่ได้เลือกทันเวลา — ระบบจัดให้ที่ ${PLACE_NAME[key]}`);
    applyPlace(engine, p, key, {});
  }
}

/** สถานที่นี้ผู้เล่นคนนี้เข้าได้ไหม */
function placeAvailable(engine, p, key) {
  if (key === "park") return (p.scMatrix || 0) > 0;
  if (key === "library") return (p.scSkillLevel || 1) < MAX_SKILL_LEVEL;
  if (key === "store") return (p.gold || 0) > 0;
  return true;
}

/** ผู้เล่นเลือกสถานที่ + ส่งตัวเลือกย่อยมาพร้อมกัน */
function choosePlace(engine, id, key, opts = {}) {
  if (!on || phase !== "place") return;
  const p = engine.players[id];
  if (!p || !p.alive || p.scEliminated) return;
  if (placeDone[id]) return;
  if (!PLACES.includes(key) || !placeAvailable(engine, p, key)) return;
  applyPlace(engine, p, key, opts);
  // ทุกคนส่งผลครบแล้ว -> ให้ server ปิดเฟสทันที ไม่ต้องรอหมดเวลา
  if (!placePending(engine).length && onAllPlaced) onAllPlaced();
  else engine.broadcastState();
}

function applyPlace(engine, p, key, opts) {
  places[p.id] = key;
  placeDone[p.id] = true;
  p.scPlace = key;
  if (key === "room") return placeRoom(engine, p);
  if (key === "church") return placeChurch(engine, p, opts.option);
  if (key === "park") return placePark(engine, p, opts.targets);
  if (key === "library") return placeLibrary(engine, p);
  if (key === "store") return; // ซื้อของผ่าน buyShopItem ระหว่างเฟสนี้อยู่แล้ว
}

// ---------- ห้องพัก: สุ่มของฟรี 1 ชิ้น (คนละคลังกับร้านค้า) ----------
function placeRoom(engine, p) {
  const total = ROOM_ITEMS.reduce((s, it) => s + it.weight, 0);
  let r = Math.random() * total;
  let pick = ROOM_ITEMS[0];
  for (const it of ROOM_ITEMS) { r -= it.weight; if (r <= 0) { pick = it; break; } }
  p.inventory.push({ ...pick, uid: `sc${Date.now()}${Math.floor(Math.random() * 1000)}`, free: true });
  p.scLastGift = pick.name;
  engine.log(`🛏️ ${p.name} พักที่ห้องพัก — ได้รับ "${pick.name}" มาฟรี 1 ชิ้น`);
}

// ---------- โบสถ์: เพิ่มความจุ 1 อย่าง ครั้งละ 1 ----------
function placeChurch(engine, p, option) {
  const opt = ["hp", "armor", "skill"].includes(option) ? option : "hp";
  if (opt === "hp") {
    p.scCapHp = (p.scCapHp || START_HP) + 1;
    p.hp = Math.min(p.scCapHp, p.hp + 1); // ความจุใหม่เติมให้เต็มทันที (วันธรรมดาไม่มีดาเมจอยู่แล้ว)
    engine.log(`⛪ ${p.name} สวดที่โบสถ์ — ความจุพลังชีวิต +1 (${p.scCapHp})`);
  } else if (opt === "armor") {
    p.scCapArmor = (p.scCapArmor || START_ARMOR) + 1;
    p.armor = Math.min(p.scCapArmor, p.armor + 1);
    engine.log(`⛪ ${p.name} สวดที่โบสถ์ — ความจุเกราะ +1 (${p.scCapArmor})`);
  } else {
    p.scCapSkill = Math.min(MAX_SKILL_CAP, (p.scCapSkill || START_SKILL_CAP) + 1);
    engine.log(`⛪ ${p.name} สวดที่โบสถ์ — ความจุแต้มสกิล +1 (${p.scCapSkill}/${MAX_SKILL_CAP})`);
  }
}

// ---------- สวนสาธารณะ: ลงแต้ม Matrix ใส่เป้าหมาย ----------
function placePark(engine, p, targets) {
  const list = Array.isArray(targets) ? targets : [];
  let used = 0;
  for (const tid of list) {
    if ((p.scMatrix || 0) <= 0) break;
    const t = engine.players[tid];
    if (!t || t.id === p.id || !t.alive || t.scEliminated) continue;
    const cur = p.scPlaced[tid] || 0;
    if (cur >= MATRIX_PER_TARGET) continue;
    p.scPlaced[tid] = cur + 1;
    p.scMatrix--;
    used++;
  }
  if (used > 0) engine.log(`🌳 ${p.name} เฝ้าดูจากสวนสาธารณะ — ลงแต้ม Matrix ${used} แต้ม (เหลือ ${p.scMatrix})`);
  else engine.log(`🌳 ${p.name} แวะสวนสาธารณะแต่ไม่ได้ลงแต้มอะไร`);
}

// ---------- ห้องสมุด: ระดับทักษะ +1 ----------
function placeLibrary(engine, p) {
  const before = p.scSkillLevel || START_SKILL_LEVEL;
  if (before >= MAX_SKILL_LEVEL) return;
  p.scSkillLevel = before + 1;
  engine.log(`📚 ${p.name} อ่านหนังสือที่ห้องสมุด — ระดับทักษะ ${before} → ${p.scSkillLevel}`);
  if (p.scSkillLevel === UNLOCK_AT.secondary) {
    p.scUnlocked = "secondary";
    engine.log(`🔓 ${p.name} ปลดล็อก "สกิลรอง" แล้ว`);
  } else if (p.scSkillLevel === UNLOCK_AT.ultimate) {
    p.scUnlocked = "ultimate";
    engine.log(`🔓 ${p.name} ปลดล็อก "ท่าไม้ตาย" แล้ว`);
    if ((p.scCapSkill || START_SKILL_CAP) < TIER_COST.ultimate) {
      engine.log(`⚠️ แต่ความจุแต้มสกิลของ ${p.name} มีแค่ ${p.scCapSkill} — ท่าไม้ตายต้องการ ${TIER_COST.ultimate} (ไปเพิ่มที่โบสถ์)`);
    }
  }
}

// ============================================================
//  จบวัน -> วันถัดไป / ประกาศคู่ / เข้าวันดวล / จบรอบ
//  คืนค่า "สิ่งที่ server ต้องทำต่อ": { next: "day"|"pairing"|"duelDay"|"cycleEnd" }
// ============================================================
function advanceDay(engine) {
  if (!on) return { next: "day" };
  if (day === PAIRING_DAY) {
    makePairs(engine);
    day++;
    return { next: "pairing" };
  }
  if (day < DUEL_DAY) {
    day++;
    if (day === DUEL_DAY) return { next: "duelDay" };
    return { next: "day" };
  }
  return { next: "day" };
}

/** จับคู่ดวลแบบสุ่ม — คนที่เหลือ (เลขคี่) ผ่านเข้ารอบถัดไปฟรี */
function makePairs(engine) {
  const alive = Object.values(engine.players).filter((p) => p.alive && !p.scEliminated);
  const pool = [...alive];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  pairs = [];
  byeId = pool.length % 2 === 1 ? pool.pop().id : null;
  for (let i = 0; i < pool.length; i += 2) {
    pairs.push({ a: pool[i].id, b: pool[i + 1].id, done: false, winnerId: null });
  }
  duelIndex = 0;
  for (const pr of pairs) {
    const a = engine.players[pr.a], b = engine.players[pr.b];
    engine.log(`⚔️ คู่ดวลวันที่ 5 — ${a.name} ปะทะ ${b.name}`);
  }
  if (byeId) engine.log(`✨ ${engine.players[byeId].name} จับคู่ไม่ลงตัว — ผ่านเข้ารอบถัดไปโดยไม่ต้องดวล`);
}

/** เข้าวันที่ 5: ทุกคนได้แต้มสกิลเริ่มต้น 4 + เปิดเผยตัวละครของคู่ที่ลงสนาม */
function beginDuelDay(engine) {
  day = DUEL_DAY;
  phase = "duel";
  duelIndex = 0;
  for (const p of Object.values(engine.players)) {
    if (!p.alive || p.scEliminated) continue;
    p.skillPoints = Math.min(maxSkill(p), DUEL_START_SKILL);
  }
  revealCurrentPair(engine);
}

/** เปิดเผยตัวละครของคู่ที่กำลังลงสนามให้ "ทุกคนที่ดูอยู่" (SERAPH_MOONCELL.md §9) */
function revealCurrentPair(engine) {
  const pair = pairs[duelIndex];
  if (!pair) return;
  for (const viewer of Object.values(engine.players)) {
    if (!Array.isArray(viewer.scSeen)) viewer.scSeen = [];
    for (const id of [pair.a, pair.b]) {
      if (!viewer.scSeen.includes(id)) viewer.scSeen.push(id);
    }
  }
  const a = engine.players[pair.a], b = engine.players[pair.b];
  if (a && b) engine.log(`👁 เปิดเผยตัวตน — ${a.name} คือ ${charName(engine, a)} · ${b.name} คือ ${charName(engine, b)}`);
}

function charName(engine, p) {
  const ch = engine.CHAR_BY_ID[p.characterId];
  return ch ? ch.name : "???";
}

/**
 * เช็คหลังจบเทิร์นของวันที่ 5 ว่าคู่นี้จบหรือยัง
 * คืน: "continue" ดวลต่อ · "nextPair" ไปคู่ถัดไป · "cycleEnd" หมดคิวแล้ว
 */
function checkDuelProgress(engine) {
  if (!isDuelDay()) return "continue";
  const pair = pairs[duelIndex];
  if (!pair) return "cycleEnd";
  const a = engine.players[pair.a], b = engine.players[pair.b];
  const aDead = !a || !a.alive;
  const bDead = !b || !b.alive;
  if (!aDead && !bDead) return "continue";

  pair.done = true;
  const loser = aDead ? a : b;
  const winner = aDead ? b : a;
  if (loser) {
    loser.scEliminated = true;
    engine.log(`💀 ${loser.name} ถูกลบออกจาก SE.RA.PH — ตกรอบ`);
  }
  if (winner) {
    pair.winnerId = winner.id;
    engine.log(`🏅 ${winner.name} ผ่านเข้ารอบถัดไป`);
  }
  duelIndex++;
  if (duelIndex >= pairs.length) return "cycleEnd";
  revealCurrentPair(engine);
  return "nextPair";
}

/** จบรอบ: รีเซ็ต/ฟื้น/รางวัล (SERAPH_MOONCELL.md §8) */
function endCycle(engine) {
  for (const p of Object.values(engine.players)) {
    if (p.scEliminated) continue;
    p.skillPoints = 0;
    p.scPlaced = {};              // แต้มที่ลงบนเป้าหมายถูกล้าง (ที่ยังไม่ได้ลงยังอยู่)
    p.hp = maxHp(p);              // ฟื้นเต็ม
    p.armor = maxArmor(p);
    p.scSpectator = false;
    engine.addGold(p, CYCLE_END_GOLD);
  }
  pairs = [];
  byeId = null;
  duelIndex = 0;
  day = 1;
  cycleRound++;
  phase = "draw";
  engine.log(`🌙 จบรอบที่ ${cycleRound - 1} — ทุกคนได้ +${CYCLE_END_GOLD} เหรียญ · ฟื้นพลังชีวิตและเกราะเต็ม`);
  engine.log(`🌗 รอบที่ ${cycleRound} เริ่มขึ้น (${isNight() ? "กลางคืน" : "กลางวัน"}) · วันที่ 1 จาก 5`);
}

/** เหลือผู้รอดคนเดียว = จบเกม */
function survivors(engine) {
  return Object.values(engine.players).filter((p) => p.alive && !p.scEliminated);
}

// ============================================================
//  การมองเห็นตัวตน (SERAPH_MOONCELL.md §9)
// ============================================================
/** viewer เห็นตัวละครของ target ไหม */
function canSee(viewer, target) {
  if (!on) return true;
  if (!viewer || !target) return false;
  if (viewer.id === target.id) return true;
  return Array.isArray(viewer.scSeen) && viewer.scSeen.includes(target.id);
}

// ============================================================
//  payload ที่ส่งให้ client (SERAPH_SCENES.md §8)
//  ทุกอย่างเป็น per-viewer — ข้อมูลสืบสวนของคนอื่นห้ามรั่ว
// ============================================================
function stateFor(engine, viewerId) {
  if (!on) return null;
  const me = engine.players[viewerId];
  const alive = Object.values(engine.players).filter((p) => p.alive && !p.scEliminated);
  // จำนวนคนที่ลง Matrix ระดับ 3 ใส่เรา — ส่งแค่ "จำนวน" ห้ามส่ง id (ไม่งั้นระบบสืบสวนพัง)
  let watchedBy = 0;
  if (me) {
    for (const o of Object.values(engine.players)) {
      if (o.id === viewerId) continue;
      if ((o.scPlaced && o.scPlaced[viewerId] || 0) >= MATRIX_PER_TARGET) watchedBy++;
    }
  }
  const pair = pairs[duelIndex] || null;
  return {
    day,
    cycleRound,
    night: isNight(),
    phase,
    noCombat: noCombat(),
    daysTotal: DAYS_PER_CYCLE,
    // --- ของผู้ชมคนนี้เท่านั้น ---
    place: me ? me.scPlace || null : null,
    placedCount: Object.keys(placeDone).length,
    totalPlayers: alive.length,
    matrixHeld: me ? me.scMatrix || 0 : 0,
    matrixMax: MATRIX_MAX,
    matrixPlaced: me ? { ...(me.scPlaced || {}) } : {},
    watchedBy,
    skillLevel: me ? me.scSkillLevel || START_SKILL_LEVEL : START_SKILL_LEVEL,
    skillLevelMax: MAX_SKILL_LEVEL,
    caps: me ? { hp: me.scCapHp, armor: me.scCapArmor, skill: me.scCapSkill } : null,
    unlocked: me ? {
      basic: tierUnlocked(me, "basic"),
      secondary: tierUnlocked(me, "secondary"),
      ultimate: tierUnlocked(me, "ultimate")
    } : null,
    eliminated: me ? !!me.scEliminated : false,
    // --- ข้อมูลสาธารณะ ---
    pairs: pairs.map((pr) => ({
      a: pr.a, b: pr.b,
      aName: engine.players[pr.a] ? engine.players[pr.a].name : "",
      bName: engine.players[pr.b] ? engine.players[pr.b].name : "",
      done: pr.done, winnerId: pr.winnerId
    })),
    bye: byeId,
    byeName: byeId && engine.players[byeId] ? engine.players[byeId].name : null,
    myOpponent: me ? opponentOf(me.id) : null,
    duelIndex,
    duelPair: pair ? { a: pair.a, b: pair.b } : null,
    spectating: me ? !!me.scSpectator : false,
    placeSeconds: PLACE_SECONDS,
    places: PLACES.map((k) => ({
      key: k, name: PLACE_NAME[k],
      available: me ? placeAvailable(engine, me, k) : false
    }))
  };
}

function opponentOf(id) {
  for (const pr of pairs) {
    if (pr.a === id) return pr.b;
    if (pr.b === id) return pr.a;
  }
  return null;
}

/** Matrix ระดับ 1: เห็นจำนวนไพ่ในมือของเป้าหมาย · ระดับ 3: เห็นแต้ม */
function matrixLevelOn(viewer, target) {
  if (!on || !viewer || !target) return 0;
  return (viewer.scPlaced && viewer.scPlaced[target.id]) || 0;
}

/** Matrix ระดับ 2: รับความเสียหายจากเป้าหมายน้อยลง 1 หน่วย */
function damageReduction(victim, sourceId) {
  if (!on || !victim || !sourceId) return 0;
  // ผู้ "รับ" ดาเมจต้องเป็นคนที่ลงแต้มไว้บนผู้โจมตี (ลง 2 แต้มบนใคร = กันดาเมจจากคนนั้น 1 หน่วย)
  const lv = (victim.scPlaced && victim.scPlaced[sourceId]) || 0;
  return lv >= 2 ? 1 : 0;
}

function takeLog() {
  const out = pendingLog;
  pendingLog = [];
  return out;
}

module.exports = {
  // ค่าคงที่
  START_HP, START_ARMOR, START_SKILL_CAP, MAX_SKILL_CAP, START_GOLD,
  START_SKILL_LEVEL, MAX_SKILL_LEVEL, MATRIX_MAX, MATRIX_PER_TARGET,
  DAYS_PER_CYCLE, PAIRING_DAY, DUEL_DAY, PLACE_SECONDS, DUEL_START_SKILL,
  CYCLE_END_GOLD, UNLOCK_AT, TIER_COST, PLACES, PLACE_NAME,
  // สถานะโหมด
  active, reset, startMatch, initPlayer, resetFields,
  currentDay, currentCycle, currentPhase, isDuelDay, noCombat, isNight,
  // กติกา
  maxHp, maxArmor, maxSkill, tierUnlocked, costOf, deckCards,
  combatants, inCurrentDuel, onDealRound, onRoundWinner,
  // เฟสสถานที่
  startPlacePhase, finishPlacePhase, choosePlace, placeAvailable, placePending,
  // วัน/คู่ดวล/รอบ
  advanceDay, makePairs, beginDuelDay, revealCurrentPair, checkDuelProgress,
  endCycle, survivors, opponentOf,
  // การมองเห็น + payload
  canSee, stateFor, matrixLevelOn, damageReduction, takeLog
};
