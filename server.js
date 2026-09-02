// ============================================================
//  ECHO — Blackjack Skill Battle : เซิร์ฟเวอร์ + เอนจินเกม
//  - การ์ดสุ่มเลข 1-10 (ไม่ซ้ำในมือเดียวกัน) รวมแต้มใกล้ 21 สุดโดยไม่เกิน
//  - 1 รอบ: ไพ่ -> [CUTSCENE] -> สรุปผล -> โจมตี -> แบนเนอร์รอบ
//  - ระบบแปลงร่าง/cutscene/เพลงสกิลแบบ generic (Ginga / NewType Paradise / NT-D)
// ============================================================

// ตาข่ายสำรองชั้นสุดท้าย — ทุก socket handler ควรมี try/catch ของตัวเองแล้ว (ดู safeOn/onPlayerEvent)
//  นี่ป้องกันเผื่อโค้ดจุดอื่น (เช่น setTimeout/setInterval callback) โยน error ที่ไม่มีใครจับ ไม่ให้ process ทั้งตัว crash
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] เซิร์ฟเวอร์เจอข้อผิดพลาดที่ไม่ได้ถูกจับ — ทำงานต่อแทนที่จะปิดตัว:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection] Promise ถูกปฏิเสธโดยไม่มีใครจับ:", err);
});

const express = require("express");
const compression = require("compression");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const { CHARACTERS, CHAR_BY_ID, POSITION_COLORS, publicRoster } = require("./characters");
// ไฟล์มัดรวมสคริปต์ตัวละครที่แยกออกมาจากไฟล์นี้ (โฟลเดอร์ characters/ — คนละอันกับ characters.js ด้านบน)
const CHAR_HOOKS = require("./characters/index");
// ระบบสถานะ universal (buff/debuff กลาง) — ดู characters/_universal_status.js
const {
  SPELLBURDEN_MAX,
  statusAmtOf,
  applyBuff: rawApplyBuff,
  applyDebuff: rawApplyDebuff,
  setTurnsNoRefresh,
  applySpellburden: rawApplySpellburden,
  resistActive,
  BASIC_DEBUFF_CLEAR,
  SOFT_DEBUFF_STEP,
  cleanseDebuffs,
  coolReduction,
  MEND_MAX_TURNS,
  applyMend,
  tickMend,
  blindActive,
  noHealActive,
  invertActive,
  tickBurn,
  HBLEED_MAX,
  bleedActive,
  applyBleed,
  bleedHealPenalty,
  tickBleed,
  EVADE_STACK_MAX,
  EVADE_STACK_TURNS,
  grantEvadeStack,
  consumeEvadeStack,
  tickEvadeStacks,
} = require("./characters/_universal_status");
// เพดานค่าใช้พลังงานของสกิล: ตัวปรับราคา "ขาขึ้น" ทุกชนิด (กลางคืน / ภาระเวท) ดันราคาได้ไม่เกินนี้
//  สกิลที่ราคาแตะเพดานอยู่แล้ว (เช่นท่าไม้ตาย 8) จะไม่ถูกดันให้แพงขึ้นไปอีก — ส่วนกระแสเวทยังลดราคาได้ตามปกติ
const SKILL_COST_MAX = 8;
// "เนตรมณะ" (สถานะ Universal patch 2.2.7): โจมตีปกติมีโอกาสสังหารทันที — ตรรกะ predicate อยู่ไฟล์เดียวกัน
//  แต่จุดโรลจริงอยู่ใน doAttack() ของไฟล์นี้ (ต้องใช้ cutscene/lastAttack/เฟสโจมตี)
const { NETRAMANA_KILL_CHANCE, netramanaActive } = require("./characters/_universal_status");
// ยูนะ — ไอดอลเอฟเฟกต์สนาม (ไม่ใช่ตัวละครที่เล่นได้ ไม่อยู่ใน CHARACTERS/CHAR_HOOKS — require ตรงๆ เหมือน _universal_status)
const YunaMod = require("./characters/yuna");

const app = express();
const server = http.createServer(app);
// จำกัด origin ที่เชื่อมต่อ socket.io ได้ — ตั้ง ALLOWED_ORIGIN เป็นโดเมนจริงตอน deploy (เช่น
//  https://your-app.onrender.com) กัน third-party เว็บอื่นฝัง script มาเชื่อมต่อ/join เกมได้
//  ไม่ตั้งค่านี้ = ไม่จำกัด origin (ค่าเริ่มต้นเดิม) — เหมาะกับ dev ในเครื่องที่ยังไม่รู้โดเมนจริง
//  (dev ผ่าน Vite proxy ที่ :5173 อยู่แล้วไม่ต้องพึ่งค่านี้ เพราะ browser มองว่าเป็น same-origin)
const io = new Server(server, {
  // Socket events use small payloads; reject oversized packets before parsing.
  maxHttpBufferSize: 64 * 1024,
  cors: process.env.ALLOWED_ORIGIN ? { origin: process.env.ALLOWED_ORIGIN } : undefined,
  // state ที่ส่งเป็น JSON ภาษาไทย (ชื่อ/คำอธิบายสกิลของผู้เล่นทุกคน) บีบอัดได้หลายเท่าตัว
  //  socket.io v4 ปิด permessage-deflate ไว้เป็นค่าเริ่มต้น — เปิดเฉพาะแพ็กเก็ตที่ใหญ่พอจะคุ้มค่า CPU
  perMessageDeflate: { threshold: 1024 },
});

const clientDist = path.join(__dirname, "client", "dist");
const useReact = fs.existsSync(path.join(clientDist, "index.html"));
const staticDir = useReact ? clientDist : path.join(__dirname, "public");

// ไฟล์ตัวละคร (รูป/วิดีโอ/เพลง) ย้ายไปเก็บบน Cloudflare R2 แล้ว — ตั้ง ASSET_BASE_URL ไว้ค่อย redirect
// ไปที่นั่นแทนการเสิร์ฟจากเครื่องเอง (R2 ไม่คิดค่า egress ต่างจาก bandwidth ของ server หลักที่มีโควตา)
// ไม่ตั้งค่านี้ = fallback เสิร์ฟจากไฟล์ในเครื่องตามเดิม (เช่นตอน dev ในเครื่อง)
const ASSET_BASE_URL = process.env.ASSET_BASE_URL; // เช่น https://pub-xxxx.r2.dev
// โฟลเดอร์สื่อทั้งหมดที่ย้ายไป R2 — /characters (รูป/วิดีโอ/เพลงตัวละคร), /item (ปืนหน่วย GUTS
//  Select + คีย์/วีดีโอกระสุน), /overload_force (สนาม), /theme_song + /effect_sound (เพลง/เสียง),
//  /image (พื้นหลัง + สแปลช) — สามอันหลังยัง track ใน git อยู่ ต้องอัปขึ้น R2 ให้ครบก่อนถึงจะ redirect ติด
const R2_DIRS = ["characters", "item", "overload_force", "theme_song", "effect_sound", "image"];
if (ASSET_BASE_URL) {
  for (const dir of R2_DIRS) {
    app.get(`/${dir}/*`, (req, res) => res.redirect(302, ASSET_BASE_URL + req.path));
  }
}

// gzip ให้ index.html + bundle js/css ของ vite (637 KB -> ~170 KB) — compression ข้ามไฟล์ที่บีบมาแล้ว
//  อย่าง jpg/png/webp/mp3/mp4 ให้เองอยู่แล้ว จึงไม่เปลืองซีพียูฟรี ๆ กับไฟล์สื่อ
app.use(compression());
app.use(express.static(staticDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      // app shell ต้องเช็คของใหม่ทุกครั้ง ไม่งั้น deploy ใหม่แล้ว client ยังใช้โค้ดเก่าค้าง
      res.setHeader("Cache-Control", "no-cache");
    } else if (path.basename(path.dirname(filePath)) === "assets") {
      // ไฟล์ js/css ของ vite มี hash ในชื่อไฟล์อยู่แล้ว เปลี่ยนเนื้อหา = เปลี่ยนชื่อไฟล์ แคชยาวสุดได้เลย
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      // รูป/วิดีโอ/เพลงตัวละคร (ไฟล์ใหญ่ ชื่อไฟล์ไม่มี hash) แคช 30 วัน ลด bandwidth การโหลดซ้ำ
      res.setHeader("Cache-Control", "public, max-age=2592000");
    }
  },
}));
app.get(/^\/(?!socket\.io).*/, (req, res) => res.sendFile(path.join(staticDir, "index.html")));


// ---------- ค่าคงที่ ----------
const MAX_PLAYERS = 7; // patch 2.8: เปิดช่องผู้เล่นที่ 7 (บอสยูกิย้ายไปนั่งช่อง 8)
const CARD_TIME = 60;
const OVERLOAD_FORCE_CHANCE = 0.30;
const OVERLOAD_FORCE_CUTSCENE_SECONDS = 5; // overload_force_start.mp4 = 4.809s
const YUUKI_ID = "__yuuki_boss__";
const YUUKI_IMG = "/characters/yuuki/yuuki.jpg";
const YUUKI_SCALE = Object.freeze({
  1: { hp: 7, armor: 3 },
  2: { hp: 13, armor: 2 },
  3: { hp: 17, armor: 3 },
  4: { hp: 23, armor: 2 },
  5: { hp: 26, armor: 4 },
  6: { hp: 30, armor: 5 },
  7: { hp: 34, armor: 5 }, // patch 2.8: ช่องผู้เล่นที่ 7 — ต่อสเกลเดิม (+4 HP ต่อผู้เล่น 1 คน)
});
const YUUKI_VIDEO = {
  spawn: "/characters/yuuki/yuuki_overload.mp4",
  attack: "/characters/yuuki/yuuki_overload_n_attack.mp4",
  ultimate: "/characters/yuuki/yuuki_overload_ultimate.mp4",
  low: "/characters/yuuki/yuuki_overload_low.mp4",
  field: "/characters/yuuki/yuuki_overload_fill.mp4",
  end: "/characters/yuuki/yuuki_overload_end.mp4",
  win: "/characters/yuuki/yuuki_overload_win.mp4",
};
const SUMMARY_TIME = 5;
const ATTACK_TIME = 15;
const TRANSITION_TIME = 3;
const RECONNECT_GRACE_MS = Math.max(100, Number(process.env.RECONNECT_GRACE_MS) || 60_000);
const RESERVATION_TTL_MS = 120_000;
const ATTACKFX_TIME = 3;  // อนิเมชันบอกว่าใครตีใคร

const MAX_HP = 7;       // เลือดจริงพื้นฐาน (patch พิเศษ — เดิม 5)
const MAX_ARMOR = 3;    // เกราะเริ่มต้น (patch พิเศษ — เดิม 2)
const MAX_SKILL = 8;
const BEAM_AMMO = 2;    // กระสุน Beam Magnum ต่อเกม (บานาจ)
// ---------- ร้านค้ามายา + เศรษฐกิจเหรียญ (patch 2.2 full) ----------
const GOLD_MAX = 30;             // เพดานเหรียญต่อผู้เล่น
const GOLD_PER_TURN = 1;         // เหรียญที่ได้ทุกจบเทิร์น (ทุกคน)
const GOLD_WIN_BONUS = 1;        // เหรียญเพิ่มเมื่อชนะการจั่วไพ่
const SHOP_INTERVAL_TURNS = 5;   // ร้านค้าเปิดทุกๆ 5 เทิร์น
// เพดานเหรียญรายบุคคล — กระปุกออมสินน้องหมูน้อย (ฟุจิตะ โคโตเนะ) ขยายเพดานของเจ้าตัวเป็น 45
function goldCapOf(p) {
  if (p && p.characterId === "kotone") return CHAR_HOOKS.kotone.GOLD_CAP;
  return GOLD_MAX;
}
// จุดเดียวที่ "ได้รับเหรียญ" ผ่าน — คืนจำนวนที่เหลืออยู่ในกระเป๋าจริงหลังตัดตามเพดาน
//  ต้องเรียกผ่านตัวนี้เสมอ ไม่งั้นกระปุกออมสินของโคโตเนะจะไม่ทำงาน (สกิลติดตัวผูกกับจังหวะได้รับเหรียญ)
//  โคโตเนะ: กระปุกออมสิน "แบ่ง" เหรียญที่เพิ่งได้ไปเก็บ (หักออกจากกระเป๋า) จึงคืนยอดสุทธิ ไม่ใช่ยอดก่อนแบ่ง
function addGold(p, n) {
  if (!p || !(n > 0)) return 0;
  const cap = goldCapOf(p);
  const before = p.gold || 0;
  if (before >= cap) return 0;
  p.gold = Math.min(cap, before + n);
  const gained = p.gold - before;
  const saved = p.characterId === "kotone" ? (CHAR_HOOKS.kotone.onGoldGained(engine, p, gained) || 0) : 0;
  return gained - saved;
}
const SHOP_MAX_ITEMS = 15;       // จำนวนสินค้าสูงสุดต่อรอบร้านค้า (เดิม 6 -> 9 -> 15 หลังรวมร้านลุงเท่งเข้ามา)
const SHOP_CARD_COLOR_PRICE = 5; // ยาเปลี่ยนสีการ์ด: เลือกการ์ด 1 ใบในมือ เปลี่ยนเป็นสีที่ต้องการ
const SHOP_FORTUNE_PRICE = 5;
const SHOP_FORTUNE_AMOUNT = 2;   // ยาโชคลาภ: ได้โชคลาภ +2 หน่วยเมื่อใช้
const SHOP_RESIST_PRICE = 5;
const SHOP_RESIST_TURNS = 1;     // ยาต้านสถานะ: ต้านสถานะผิดปกติ 1 เทิร์น
const SHOP_ARMOR_PRICE = 3;
const SHOP_ARMOR_AMOUNT = 1;     // ยาฟื้นเกราะ: ฟื้นเกราะ +1 หน่วย
const SHOP_CARD_REMOVE_PRICE = 5; // ยาลดไพ่: ลดไพ่ใบล่าสุดของตัวเองออก 1 ใบ (กันแตกได้)
const SHOP_SKILL_SIZES = [
  { size: "small", amount: 1, price: 2, weight: 50 },   // สัดส่วนภายในกลุ่ม "ยาฟื้นแต้มสกิล"
  { size: "medium", amount: 4, price: 6, weight: 35 },
  { size: "large", amount: 6, price: 10, weight: 15 },
];
// ---------- ปืนหน่วย GUTS Select (เดิมอยู่ร้านลุงเท่ง — ยุบรวมเข้าร้านค้ามายาแล้ว) ----------
// ปืนเป็นไอเทมถาวร (มีได้กระบอกเดียว) กระสุนซื้อแยกอิสระ แต่ยิงไม่ได้ถ้าไม่มีปืน — ยิงได้ 1 นัด/เทิร์น ช่วงจั่วไพ่เท่านั้น
const ITEM_BASE = "/item";
const GUTS_GUN_PRICE = 15;
const GUTS_CHAA_TURNS = 2;       // Thunder Bullet: สภาพชาคงอยู่ 2 เทิร์น
const GUTS_NURSE_DMG = 4;         // Nursedessei Cannon: ดาเมจ (ลดเกราะก่อน)
const BLACK_SPARKLENCE_NURSE_COOLDOWN = 3; // Black Sparklence: หลังยิง Nursedessei ใช้ปืนไม่ได้ 3 เทิร์นถัดไป
const GUTS_AMMO = {
  shockwave: { id: "shockwave", name: "Shockwave Bullet",   price: 5,  img: `${ITEM_BASE}/guts_key/gomora_key.webp`,    cut: "gutsShockwave" },
  gargorgon: { id: "gargorgon", name: "Gargorgon Ray",      price: 5,  img: `${ITEM_BASE}/guts_key/gargorgon_key.webp`, cut: "gutsGargorgon" },
  thunder:   { id: "thunder",   name: "Thunder Bullet",     price: 5,  img: `${ITEM_BASE}/guts_key/eleking_key.webp`,   cut: "gutsThunder" },
  nurse:     { id: "nurse",     name: "Nursedessei Cannon", price: 10, img: `${ITEM_BASE}/guts_key/nurse_key.webp`,     cut: "gutsNurse", breaksGun: true },
  hyper_trigger: { id: "hyper_trigger", name: "Hyper Key Trigger", price: 20, img: `${ITEM_BASE}/guts_hyper_key/hyper_key_trigger.jpg`, cut: "triggerHenshin", transform: true },
  trigger_dark_key: { id: "trigger_dark_key", name: "Trigger Dark Key", price: 10, img: `${ITEM_BASE}/guts_hyper_key/hyper_key_trigger_dark.jpg`, cut: "triggerDarkHenshin", transformDark: true },
};
const GUTS_AMMO_IDS = Object.keys(GUTS_AMMO).filter((id) => id !== "hyper_trigger" && id !== "trigger_dark_key");
const SHOP_MAX_GUNS = 2;          // ปืนขึ้นได้สูงสุด 2 กระบอกต่อรอบที่ร้านรีสต็อก (ที่เกินสุ่มเป็นกระสุนแทน)
const SHOP_MAX_HYPER = 1;         // Hyper Key Trigger ขึ้นได้สูงสุด 1 ชิ้นต่อรอบ (ซื้อขาด — ที่เกินสุ่มเป็นกระสุนแทน)
// น้ำหนักกระสุนธรรมดาภายในกลุ่ม "กระสุน" (รวม = SHOP_WEIGHTS.gutsAmmo)
const SHOP_AMMO_WEIGHTS = { shockwave: 4, gargorgon: 4, thunder: 4, nurse: 2 };
// ตารางโอกาสออกสินค้าต่อ 1 ช่องสุ่ม (รวม 100) — ช่องล็อกช่องแรก (Trigger Dark Key) ไม่ผ่านตารางนี้
const SHOP_WEIGHTS = {
  cardColor: 15,
  fortune: 5,      // หายากสุด
  resist: 15,
  cardRemove: 12,
  skillPoint: 14,  // แตกย่อยตาม SHOP_SKILL_SIZES.weight
  armor: 14,
  gutsGun: 8,      // จำกัด SHOP_MAX_GUNS ต่อรอบ ที่เกินตกไปรวมกับกระสุน
  gutsAmmo: 14,    // แตกย่อยตาม SHOP_AMMO_WEIGHTS
  hyperTrigger: 3, // Hyper Key Trigger: ของแพงสุด สุ่มออก จำกัด SHOP_MAX_HYPER ต่อรอบ
};
// ---------- DoomGuy (patch 2.2 full) ----------
const DOOM_BASE = "/characters/doomguy";
const DOOM_WEAPONS = {
  shotgun:      { id: "shotgun", name: "Combat Shotgun", img: `${DOOM_BASE}/สกิลรอง/Combat shotgun.webp`, cost: 2, weight: 17, atk: 2, pierce: false, effect: "explode" },
  heavy:        { id: "heavy", name: "Heavy Cannon", img: `${DOOM_BASE}/สกิลรอง/Heavy Cannon.webp`, cost: 2, weight: 17, atk: 2, pierce: true, effect: "lockon" },
  plasma:       { id: "plasma", name: "Plasma Rifle", img: `${DOOM_BASE}/สกิลรอง/Plasma Rifle.webp`, cost: 2, weight: 17, atk: 1, pierce: true, effect: "drain" },
  chaingun:     { id: "chaingun", name: "Chaingun", img: `${DOOM_BASE}/สกิลรอง/Chaingun.webp`, cost: 2, weight: 17, atk: 2, pierce: false, effect: "shield" },
  rocket:       { id: "rocket", name: "Rocket Launcher", img: `${DOOM_BASE}/สกิลรอง/Rocket Launcher.webp`, cost: 5, weight: 10, atk: 3, pierce: false, splash: true, effect: "bonusdmg" },
  supershotgun: { id: "supershotgun", name: "Super Shotgun", img: `${DOOM_BASE}/สกิลรอง/Super shotgun.webp`, cost: 4, weight: 10, atk: 3, pierce: false, effect: "stun" },
  ballista:     { id: "ballista", name: "Ballista", img: `${DOOM_BASE}/สกิลรอง/Ballista.webp`, cost: 5, weight: 10, atk: 3, pierce: true, effect: "bonusdmg2" },
  bfg:          { id: "bfg", name: "BFG 9000", img: `${DOOM_BASE}/สกิลรอง/BFG9000.webp`, cost: 8, weight: 2, atk: 6, pierce: false, effect: null },
};
const DOOM_WEAPON_IDS = Object.keys(DOOM_WEAPONS);
const DOOM_STARTING_WEAPON = "shotgun";
const DOOM_LOCKON_CHANCE = 1; // patch: เอาทอย 40% ออก ติดสถานะ [ล็อคเป้า] แน่นอนเสมอ
const DOOM_EXPLODE_DMG = 1;
const DOOM_EXPLODE_TARGETS = 2;
const DOOM_LOCKON_BONUS = 1;
const DOOM_ROCKET_BONUS_DMG = 2;
const DOOM_BALLISTA_TARGET_DMG = 2; // Ballista (patch): เปลี่ยนจาก aoe ทุกคน 1 -> เลือกเป้าหมาย 1 คนโดนดาเมจเพิ่มเติม 2 (โครงเดียวกับ Rocket's bonusdmg)
const DOOM_DRAIN_DMG = 1;    // [โดนดูด] (Plasma Rifle): ดาเมจ 1/เทิร์น ผ่านเกราะก่อน
const DOOM_DRAIN_TURNS = 3;  // [โดนดูด]: คงอยู่ 3 เทิร์น
const DOOM_CRUCIBLE_ATK = 7;
const DOOM_CRUCIBLE_CHARGE_NEED = 5;
const DOOM_HEAL_ON_ATK = 1;
const DOOM_SHIELD_ON_ATK = 1; // patch: พาสซีฟเพิ่มโล่ +1 ทุกครั้งที่โจมตีโดน (นอกเหนือจากฮีล)
const DOOM_CHARGE_CHANCE = 0.35; // patch 2.2 new: 10% -> 25% -> 35%
const DOOM_TIE_ATTACK_CHANCE = 0.5; // เสมอแต้ม: มีโอกาสได้โจมตี 50%
const DOOM_FORTUNE_CHANCE = 0.2; // patch: ทุกต้นเทิร์นมีโอกาส 20% ได้ [โชคลาภ] +1 สแตค
const DOOM_CRUCIBLE_BUST_DMG = 2; // Crucible: บังคับทุกคนแตก -> รับความเสียหายเหมือนแพ้จั่ว/ไพ่แตก
const DOOM_CRUCIBLE_BUST_DRAWS = 2; // Crucible (patch 2.2.4): บังคับจั่วเพิ่ม 2 ใบ (แบบเดียวกับ Ashen Trail โอกูริ)
const DOOM_CRUCIBLE_BUST_BONUS = 8; // Crucible (patch 2.2.4): บวกแต้มการ์ดตรงๆ +8 การันตีแตกจริง แม้เปิดไพ่/ล็อกไปแล้ว
// ---------- สึงาชิ ทาคุโตะ (patch 2.2 new) ----------
// ค่าคงที่ของทาคุโตะส่วนใหญ่ย้ายไปอยู่ characters/takuto.js แล้ว — เหลือแค่ที่ shared damage-sum/decay loop ในไฟล์นี้ยังใช้อยู่
const TAKUTO_STAR_NEED = 5;           // ดวงดาวสะสมครบ 5 -> ฉันคว้ามันได้แล้ว (Apprivoise!) ทันที (ใช้ใน log ตอน apprivoise หมดเวลา)
const TAKUTO_APPRIVOISE_TURNS = 10;   // ฉันคว้ามันได้แล้ว: คงอยู่ 10 เทิร์น หมดแล้วกลับเป็นทาคุโตะปกติ ต้องเก็บดวงดาวใหม่ (patch 2.2.3 — เดิมถาวร)
const TAKUTO_LANCE_DMG = 5;           // หอกผู้พิชิต: การโจมตีปกติดาเมจคงที่ 5 หน่วย (คำนวณใน doAttack()'s shared damage-sum — นอกขอบเขต Phase 1)
// ---------- เทเปา (ชิกิ) — ค่าคงที่/ตรรกะทั้งหมดย้ายไปอยู่ characters/tepeu.js แล้ว ----------
// สุ่มอาวุธถัดไปแบบถ่วงน้ำหนัก (ไม่สุ่มซ้ำกระบอกเดิม)
function rollDoomWeapon(excludeId) {
  const total = DOOM_WEAPON_IDS.reduce((n, id) => n + (id === excludeId ? 0 : DOOM_WEAPONS[id].weight), 0);
  let r = Math.random() * total;
  for (const id of DOOM_WEAPON_IDS) {
    if (id === excludeId) continue;
    r -= DOOM_WEAPONS[id].weight;
    if (r <= 0) return id;
  }
  return DOOM_WEAPON_IDS.find((id) => id !== excludeId) || DOOM_WEAPON_IDS[0];
}
// ---------- บานาจ ลิงก์ — ลิงก์ Rework (patch 2.1.2) ----------
// Absorb shield/Full Assault ย้ายไปอยู่ characters/banagher.js แล้ว (แยกได้บางส่วน — NT-D/unibeam2 รอ characters/riddhe.js)
const BANAGHER_SHIELD_AMT = 2;   // Absorb shield: โล่ที่มอบให้เป้าหมาย (มีสำเนาใน banagher.js สำหรับ log — ค่านี้ใช้ฟื้นโล่ต้นเทิร์นที่ยังมีผลใน server.js)
const BANAGHER_ULT2_SPLASH_DMG = 3; // แสงที่ไม่อยู่เพียงลำพัง: ตีหมู่ผู้เล่นอื่นที่เหลือ (ยกเว้นริดดี้พันธมิตร)
const BANAGHER_ULT2_ALLY_COST = 8; // แสงที่ไม่อยู่เพียงลำพัง: หักแต้มสกิลริดดี้พันธมิตรด้วย 8 แต้ม (รวมคอสจริง 16 — ของตัวเอง 8 + พันธมิตร 8)
const BANAGHER_BASE_IMG = "/characters/banagher/banagher_update/unicorn_new.png"; // ภาพเริ่มเกม (ลงสนามแล้ว) — หน้าเลือกตัวละครยังใช้ภาพเดิม
const GAMBLER_USES = 3; // วอสก้าหน่อยน้อง ใช้ได้ต่อเกม (แกมเบลอร์)
const TEMP_HP_TURNS = 2; // เลือดชั่วคราว (แกมเบลอร์) หายเองภายใน 2 เทิร์น
const EVA_BLAST_DMG = 8; // ระเบิด fourth impact (เอวา 13) ใส่ทุกคนในสนาม (patch 2.2 alpha — เดิม 5)
// ---------- คุวากาตะโอเจอร์ (patch 2.2 alpha) ----------
// ---------- เอวานเกเลี่ยน หมายเลข 13 (patch 2.2 alpha) ----------
const EVA13_RSHOPPER_MAX = 3;          // RS-Hopper: ชาร์จสูงสุด (ใช้ตอน resetCombat/join init — ยังอยู่ server.js)


// ---------- ไรโด ฮิคารุ / อุลตร้าแมนกิงกะ (rework patch 2.1.3) ----------
//  สกิลพื้นฐาน 1 MonsterLive: เพดานเกราะ+2 ฟื้นเกราะทันที+2 คงอยู่ 3 เทิร์น — เกราะลด = ฟื้นเลือดตามเกราะที่เสีย
//    + ดาเมจที่ได้รับจากการโจมตี -1 (ใช้ terms เดิมของสถานะ monster) — ใช้สกิลรอง 1 ไม่ได้ระหว่างนี้
//  สกิลพื้นฐาน 2 UPG!: แทนสกิลพื้นฐาน 1 ระหว่างร่าง Ginga — เพดานแต้มจั่วไพ่ 20 (เดิม 16/19)
//  สกิลรอง 1 Ultlive Ultraman Ginga: ก่อนเปิดการ์ด แปลงร่าง Ginga 5 เทิร์น ตีหมู่ — เปลี่ยนสกิลพื้นฐานเป็น UPG!
//  สกิลรอง 2 ลำแสงสโตเรียม: แทนสกิลรอง 1 ระหว่างร่าง Ginga Strium — ดาเมจ = โจมตีปกติ(สูงสุด 4)+ลุกไหม้ที่เหลือ รวมไม่เกิน 8
//  ท่าไม้ตาย Ginga Strium: ต้องอยู่ในร่าง Ginga ตอนกลางวันเท่านั้น — แปลงร่าง 5 เทิร์น โจมตี+1 ลุกไหม้ตัวเอง 5
//    โจมตีโดนเป้าหมาย = ลุกไหม้เป้าหมาย +2 — เปลี่ยนสกิลรองเป็นลำแสงสโตเรียม
//  สกิลติดตัว 2 หัวใจที่ลุกไหม้: ระหว่างร่าง Ginga Strium ลุกไหม้ที่เกิดกับตัวเองรักษาแทนสร้างความเสียหาย
// ค่าคงที่ของฮิคารุส่วนใหญ่ย้ายไปอยู่ characters/hikaru.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const HIKARU_MONSTER_ARMOR_BONUS = 2; // MonsterLive: เพดานเกราะ +2 (maxArmorOf)
const HIKARU_STORIUM_ATK_CAP = 4;     // ลำแสงสโตเรียม: นับดาเมจจากการโจมตีปกติสูงสุด 4 (doAttack's shared damage-sum — นอกขอบเขต Phase 1)
const HIKARU_STORIUM_TOTAL_CAP = 8;   // ลำแสงสโตเรียม: ดาเมจรวมสูงสุด 8 (doAttack's shared damage-sum — นอกขอบเขต Phase 1)
const HIKARU_STRIUM_IMG = "/characters/hikaru/hikaru_update/ginga_strium.jpg"; // โปรไฟล์ระหว่างร่าง Ginga Strium (displayImg/TRANSFORMS)

// ---------- ฟุจิตะ โคโตเนะ (rework 2.3) ----------
// ค่าคงที่ของโคโตเนะอยู่ที่ characters/kotone.js ทั้งหมดแล้ว (เพดานเหรียญ/กระปุกอ่านผ่าน CHAR_HOOKS.kotone.*)
// Sleeping time: ถูกโจมตีระหว่างหลับจะไม่ปลุกโคโตเนะ — หลับยาว 3 เทิร์นเต็มโดยไม่สะดุ้งตื่น
// (คงฟังก์ชัน/จุดเรียกไว้เผื่อใช้ในอนาคต — ตอนนี้ไม่มีผลอะไรแล้ว)
function maybeWakeKotone(t) {
  return;
}

// แสงจันทร์ส่องวิญญาณ ร่างสปาด้า (ชเรด เอลัน, characters/shrade_elan.js) — wrapper รอบ CHAR_HOOKS.shrade_elan.maybeMoonBurst
function maybeMoonBurst(p) {
  CHAR_HOOKS.shrade_elan.maybeMoonBurst(engine, p);
}

// ============================================================
//  Bard : คีตกวี — ระบบประพันธ์เพลง / บรรเลงทำนอง / มิติมายาบรรเลง
// ============================================================
// ครบ 3 โน้ต -> หาบทเพลงตามลำดับโน้ต — ต้องเลือกเป้าหมายก่อนเสมอ (patch 2.0.5: ทุกบทเพลงมีเป้าหมาย)
function bardCompose(p, live) {
  const pattern = (p.bardNotes || []).join("");
  p.bardNotes = [];
  const song = BARD_SONGS[pattern];
  if (!song) return;
  if (song.need > 0) {
    // เป้าหมายที่เลือกได้มีพอดี/น้อยกว่าที่ต้องการ -> บทเพลงเลือกให้เองทันที ไม่ต้องรอ (กันเกมค้าง)
    const pool = alivePlayers().filter((o) => song.allowSelf || o.id !== p.id);
    if (pool.length <= song.need) {
      const picked = pool.slice(0, song.need).map((o) => o.id);
      lastLog.push(`🎼 ${p.name} ประพันธ์เพลง ${song.name} สำเร็จ — เป้าหมายมีเพียงพอดี บทเพลงเลือกให้อัตโนมัติ`);
      bardPerform(p, pattern, picked, live);
      return;
    }
    p.bardPending = { pattern, name: song.name, need: song.need, allowSelf: !!song.allowSelf };
    lastLog.push(`🎼 ${p.name} ประพันธ์เพลง ${song.name} สำเร็จ — กำลังเลือกเป้าหมาย (ไม่เลือกก่อนเปิดไพ่ = สุ่มเป้าหมาย)`);
    io.emit("skillFlash", { name: `🎼 ${song.name} — กำลังเลือกเป้าหมาย`, img: song.song === "crimson" ? BARD_CRIMSON_IMG : BARD_JADE_IMG, by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96" });
    return;
  }
  bardPerform(p, pattern, [], live);
}
// บรรเลงทำนอง: ใช้ผลบทเพลง + ท่อนทำนองตามสาย + พลังงาน +1
//  live = บรรเลงระหว่างช่วงจั่วการ์ด (เปิดมิติแล้วพักเกมเล่นวีดีโอได้) / false = บรรเลงตอนเปิดไพ่ (สุ่มเป้า)
function bardPerform(p, pattern, targets, live) {
  const song = BARD_SONGS[pattern];
  if (!song || !p.alive) return;
  const isCrimson = song.song === "crimson";
  CHAR_HOOKS.bard.applyBardSong(engine, p, pattern, targets);
  if (isCrimson) p.bloodSection = Math.min(BARD_SECTION_MAX, (p.bloodSection || 0) + 1);
  else p.soulSection = Math.min(BARD_SECTION_MAX, (p.soulSection || 0) + 1);
  addSkill(p, 1); // บรรเลงทำนองสำเร็จ ได้รับพลังงาน +1
  // เสียงบรรเลง: สาย Crimson = 01 / สาย Jade = 02
  io.emit("bardSfx", { kind: "perform", sound: isCrimson ? 1 : 2 });
  io.emit("skillFlash", { name: `🎼 บรรเลงทำนอง — ${song.name}`, img: isCrimson ? BARD_CRIMSON_IMG : BARD_JADE_IMG, by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96" });
  lastLog.push(`🎼 ${p.name} บรรเลงทำนอง ${song.name}! พลังงาน +1 (โลหิต ${p.bloodSection || 0}/${BARD_SECTION_MAX} · วิญญาณ ${p.soulSection || 0}/${BARD_SECTION_MAX})`);
  // มิติมายาบรรเลงวิญญาณ (patch 2.0.6): ทุกครั้งที่เกิดการบรรเลงทำนอง
  //  — คีตกวีทำดาเมจ 1 แบบสุ่มกับผู้เล่น 2 คน จนกว่ามิติจะสิ้นสุด
  if ((p.statuses.soulDim || 0) > 0) {
    const pool = alivePlayers().filter((t) => t.id !== p.id);
    const hits = [];
    while (hits.length < BARD_SOUL_TARGETS && pool.length) {
      hits.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    for (const t of hits) {
      dealMixed(t, BARD_SOUL_PERFORM_DMG);
      if (t.alive && t.hp <= 0) t.hp = 1; // มิติวิญญาณ: เป้าหมายไม่สามารถถูกฆ่าได้จากเอฟเฟกต์นี้ (เลือดค้างที่ 1)
      maybeBeatSave(t);
      maybeBeatMode(t);
      maybeEva3(t);
      maybeWakeKotone(t);
      t.wasAttacked = true;
    }
    if (hits.length) lastLog.push(`💚🌑 มิติมายาบรรเลงวิญญาณ — ทำนองของ ${p.name} บาดวิญญาณ ${hits.map((t) => t.name).join(", ")} -${BARD_SOUL_PERFORM_DMG} (ตายไม่ได้จากเอฟเฟกต์นี้)`);
  }
  CHAR_HOOKS.bard.maybeBardDim(engine, p, live);
}
// ผลของบทเพลงแต่ละแบบ / มิติมายาบรรเลง — ย้าย body ไป characters/bard.js แล้ว (ดู CHAR_HOOKS.bard)

// ---------- เจ้าแห่งเน็ตบ้าน (patch 1.9) ----------
//  ระบบสัญญา: ท่าไม้ตายยื่นข้อเสนอ -> เป้าหมายตอบรับ = เป็นคู่สัญญา (เกราะ +1 / โจมตี +1 ตลอดสัญญา)
//  คู่สัญญาใช้งานครบทุก 3 เทิร์น -> ถามต่อสัญญา (จ่าย 4 แต้มคืนให้เจ้าของ / ปฏิเสธ = เจ็บ 2 ไม่สนเกราะ)
const CONTRACT_FEE = 4;        // ค่าต่อสัญญา (แต้มสกิล) ส่งกลับให้เจ้าแห่งเน็ตบ้าน
const CONTRACT_CYCLE = 3;      // ถามต่อสัญญาทุกๆ N เทิร์นของการใช้งาน
const CONTRACT_ARMOR_BONUS = 1; // คู่สัญญา: เพดานเกราะ +1 (ฟื้นให้ทันทีตอนตอบรับ) — patch 1.9.1 ลดจาก 3
const FIBER_CAP = 19;          // เสือนอนกิน: คู่สัญญาจั่วไม่แตก แต่แต้มไม่เกิน 19
// บัฟที่ "กระชากสายแลน" ถอดออกชั่วคราว 1 เทิร์น (คืนให้ตอนจบเทิร์น — เทิร์นถัดไปกลับมามีผลต่อ)
const UNPLUG_BUFFS = ["upg", "monster", "ginga", "gingastrium", "storium", "absorb", "beam", "paradise", "ohger", "rachan",
  "song", "golden", "spear", "seal", "veil", "chill", "awaken", "vortarmor", "fourth", "fiber", "tiger", "fresh",
  "fullassault", "bshield", // patch 2.1.2: บานาจ ลิงก์ — Full Assault / Absorb shield
  "phenexReflect", "phenexNtd"]; // patch 2.1.6: ริต้า เบอร์นัล — ฝันไปเถอะ / ฝืนใช้งาน NTD-Sytem

// คู่สัญญาของเจ้าแห่งเน็ตบ้านคนนี้ / เจ้าแห่งเน็ตบ้านที่ผู้เล่นคนนี้ทำสัญญาด้วย / บัฟคู่สัญญาทำงานอยู่ไหม
//  — ย้าย body ไป characters/broadband_man.js แล้ว (ดู CHAR_HOOKS.broadband_man)
// เลือดจริงสูงสุดของผู้เล่น — Locacaca fruit (ซาโตรุ patch 2.0.8.2) ลด Max HP ได้ (ต่ำสุด 1)
//  คิชินามิ ฮาคุโนะ (patch 2.2.1): เพดานเลือดจริงคงที่ตามเพศ (ไม่ใช้ MAX_HP ปกติ) — ชาย 6 / หญิง 5
function maxHpOf(p) {
  if (p && p.id === YUUKI_ID) return Math.max(1, p.yuukiBaseHp || YUUKI_SCALE[1].hp);
  if (p && p.characterId === "escanor") {
    const escanorHp = CHAR_HOOKS.escanor.maxHp(p);
    if (escanorHp != null) return Math.max(1, escanorHp - ((p.maxHpPenalty) || 0));
  }
  if (p && p.characterId === "hakuno") {
    const base = p.hakunoGender === "female" ? HAKUNO_FEMALE_MAX_HP : HAKUNO_MALE_MAX_HP;
    return Math.max(1, base - ((p.maxHpPenalty) || 0));
  }
  if (p && p.characterId === "hisakawa_sister") return CHAR_HOOKS.hisakawa_sister.maxHp(p);
  // เอจิ (patch 2.4 new): พลังชีวิตพื้นฐาน 4 หน่วย (แทน MAX_HP ปกติ)
  if (p && p.characterId === "eiji") return Math.max(1, CHAR_HOOKS.eiji.maxHp() - ((p.maxHpPenalty) || 0));
  // มาคุโนะอุจิ อิปโป (patch 3.3 new): พลังชีวิตพื้นฐาน 5 หน่วย
  if (p && p.characterId === "ippo") return Math.max(1, CHAR_HOOKS.ippo.maxHp() - ((p.maxHpPenalty) || 0));
  // ผู้วิงวอน (patch 3.4 new): พลังชีวิตพื้นฐาน 5 หน่วย
  if (p && p.characterId === "the_supplicant") return Math.max(1, CHAR_HOOKS.the_supplicant.maxHp() - ((p.maxHpPenalty) || 0));
  return Math.max(1, MAX_HP - ((p && p.maxHpPenalty) || 0));
}
// ฟื้นเลือดจริงแบบเคารพสถานะ "ไม่ใช้งานต่อ" / "ไร้ทางเยียวยา" — คืนจำนวนที่ฟื้นได้จริง
// เชื่อมผล (patch 2.0.8): การเพิ่ม HP ถูกแชร์ให้คู่เชื่อมเท่ากันด้วย
// ผกผัน (patch 2.2.1): การฟื้นเลือดกลับกลายเป็นเสียเลือดแทน (ไม่สนเกราะ)
function healHp(p, amount) {
  if (invertActive(p)) {
    dealDirect(p, amount);
    lastLog.push(`🔄 ${p.name} ผกผัน — พลังชีวิตที่ควรฟื้น +${amount} กลับกลายเป็นเสียพลังชีวิต -${amount} แทน (ไม่สนเกราะ)`);
    if (p.alive && p.hp <= 0) { instantDeath(p); if (!p.alive) lastLog.push(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`); }
    return 0;
  }
  if (noHealActive(p)) return 0;
  // เลือดไหล (hbleed, สถานะ Universal patch 2.5): การฟื้นพลังชีวิตเหลือครึ่งเดียว
  //  (ฟื้นทีละ 1 หน่วยไม่ถูกลด · ฮารุกะไม่โดนผลนี้ — ตรรกะเต็มอยู่ characters/_universal_status.js)
  amount = bleedHealPenalty(engine, p, amount);
  const heal = Math.min(maxHpOf(p) - p.hp, amount);
  if (heal > 0) { p.hp += heal; hisakawaSyncOut(p); }
  if (heal > 0 && !linkMirror) {
    const buddies = linkedBuddiesOf(p);
    linkMirror = true;
    for (const b of buddies) {
      const bh = healHp(b, heal);
      if (bh > 0) lastLog.push(`🔗 เชื่อมผล — ${b.name} ฟื้นพลังชีวิตตาม ${p.name} +${bh}`);
    }
    linkMirror = false;
  }
  return heal;
}
// ฟื้นเกราะแบบเคารพเพดาน — คืนจำนวนที่ฟื้นได้จริง
// เชื่อมผล (patch 2.1.1): การฟื้นเกราะถูกแชร์ให้คู่เชื่อมเท่ากันด้วย
// ผกผัน (patch 2.2.1): การฟื้นเกราะกลับกลายเป็นเสียเกราะแทน
function healArmor(p, amount) {
  if (invertActive(p)) {
    if (friendlyEffectBlocked(p)) return 0;
    const lost = Math.max(0, Math.min(p.armor, amount));
    if (lost > 0) {
      p.armor -= lost;
      hisakawaSyncOut(p);
      lastLog.push(`🔄 ${p.name} ผกผัน — เกราะที่ควรฟื้น +${amount} กลับกลายเป็นเสียเกราะ -${lost} แทน`);
    }
    return 0;
  }
  const heal = Math.max(0, Math.min(maxArmorOf(p) - p.armor, amount));
  if (heal > 0) { p.armor += heal; hisakawaSyncOut(p); }
  if (heal > 0 && !linkMirror) {
    const buddies = linkedBuddiesOf(p);
    linkMirror = true;
    for (const b of buddies) {
      const bh = healArmor(b, heal);
      if (bh > 0) lastLog.push(`🔗 เชื่อมผล — ${b.name} ฟื้นเกราะตาม ${p.name} +${bh}`);
    }
    linkMirror = false;
  }
  return heal;
}

// ---------- ระบบกลางวัน/กลางคืน (patch 1.7 / ปรับเวลา+โบนัส patch 2.1.7) ----------
//  เริ่มเกมเป็นกลางวันเสมอ สลับทุก 5 เทิร์น: รอบ 1-5 กลางวัน, 6-10 กลางคืน, 11-15 กลางวัน, ...
//  จบเทิร์นกลางวัน = ทุกคนได้แต้มสกิลเพิ่ม +1 แต่แจกเฉพาะเช้าที่ 2, 4, 6, ... (เช้าที่ 1, 3, 5, ... ไม่มีโบนัส — ดู morningBonusActive)
//  กลางคืน = สุ่มสกิลพื้นฐาน/สกิลรองของแต่ละคนแพงขึ้น +1 ทุกเทิร์น (ดู nightTaxTier) — เกราะฟื้นทุก 2 เทิร์นเหมือนกันทั้งวัน/คืน
//  cycleShift: Lie Like Vortigern รีเซ็ตเวลากลางคืนให้เหลืออีก 5 เทิร์น — เลื่อนวงจรทั้งเกมไปข้างหน้า
const CYCLE_TURNS = 5;
let cycleShift = 0;
let nightResetPending = false; // ตั้งตอนกดท่าไม้ตาย 2 -> เริ่มนับกลางคืนใหม่ตั้งแต่เทิร์นถัดไป
// แสงสว่างที่สรรค์สร้าง (อควาเรียน patch 2.0): บังคับกลางวันจนถึงรอบที่กำหนด (เขียนทับวงจรปกติชั่วคราว)
let dayForceUntil = 0;
// เสียงไพเราะที่กึกก้อง (ชเรด เอลัน patch พิเศษ): ใช้ท่าไม้ตาย 1 -> รีเซ็ตกลางคืนใหม่ 3 เทิร์น (แบบ Vortigern)
//  และตราบใดที่มีชเรดร่างสปาด้ายังมีชีวิต ทุกค่ำคืน ฉากหลังจะเป็นราตรีของชเรด (change_fill.jpg)
function isNightRound(n) {
  // มิติมายาบรรเลง (Bard): โลหิต = นับเป็นตอนเช้า / วิญญาณ = นับเป็นตอนกลางคืน (อยู่เหนือทุกวงจร)
  const bardCycle = CHAR_HOOKS.bard.dimCycle(engine);
  if (bardCycle) return bardCycle === "night";
  if (n <= dayForceUntil) return false;
  const m = n - cycleShift;
  const block = m > 0 ? Math.floor((m - 1) / CYCLE_TURNS) : 0;
  // โหมด Over Load เริ่ม 5 เทิร์นแรกเป็นกลางคืน แล้วจึงสลับเป็นกลางวัน
  if (gameMode === "overload") return m > 0 && block % 2 === 0;
  return m > 0 && block % 2 === 1;
}
// patch 2.1.7: เช้าที่กี่ (1 = เช้าแรกของเกม, 2 = เช้าที่สอง, ...) — ใช้กำหนดว่าเช้าไหนแจกแต้มสกิลโบนัส
function dayCycleIndex(n) {
  const m = n - cycleShift;
  const block = m > 0 ? Math.floor((m - 1) / CYCLE_TURNS) : 0;
  return Math.floor(block / 2) + 1;
}
// patch 2.2.7: คืนที่กี่ของเกม (นับตามบล็อกวงจร ไม่ใช่จำนวนคืน) — ใช้เป็นคีย์ "1 ครั้งต่อ 1 คืน"
//  ของสกิลติดตัวแบทแมน (อัศวินรัตติกาล) — เลื่อนตาม cycleShift เหมือน isNightRound เสมอ
function nightCycleIndex(n) {
  const m = n - cycleShift;
  return m > 0 ? Math.floor((m - 1) / CYCLE_TURNS) : 0;
}
// patch 2.1.7: แต้มสกิลโบนัสตอนเช้า — แจกเฉพาะเช้าที่ 2, 4, 6, ... (เช้าที่ 1, 3, 5, ... ไม่มีโบนัส)
function morningBonusActive(n) {
  const bardCycle = CHAR_HOOKS.bard.dimCycle(engine);
  if (bardCycle) return bardCycle === "day"; // มิติมายาบรรเลงอยู่เหนือทุกวงจร ไม่นับเช้าคู่/คี่
  if (n <= dayForceUntil) return true;       // บังคับกลางวันชั่วคราว (โอเบรอน) — ให้โบนัสตามปกติ
  if (isNightRound(n)) return false;
  return dayCycleIndex(n) % 2 === 0;
}

// ---------- ชเรด เอลัน (patch พิเศษ) ----------
const SHRADE_MELODY_MAX = 5;    // ท่วงทำนอง สะสมได้สูงสุด (ครบ 5 ถึงใช้ท่าไม้ตาย 1 ได้)
const SHRADE_BLAST_DMG = 8;     // แด่เพื่อนรักของฉัน: ความเสียหายใส่ทุกคนบนสนามเมื่อครบกำหนด (patch 2.0.8.4 — เพิ่มจาก 5)
const SHRADE_SPADA_IMG = "/characters/shrade_elan/profile/spada.webp"; // ร่างสปาด้า (ถาวร)
const SHRADE_SPADA_NAME = "อควาเรียน สปาด้า";
// กำลังชาร์จแด่เพื่อนรักของฉันอยู่ไหม (ชเรด เอลัน, characters/shrade_elan.js) — wrapper รอบ CHAR_HOOKS.shrade_elan.charging

// ---------- Bard : คีตกวี (patch 2.2) ----------
// "โลหิตคือทำนอง วิญญาณคือบทกวี และทุกชีวิตล้วนเป็นเพียงโน้ตตัวหนึ่งในบทเพลงอันนิรันด์"
const BARD_MAX_SKILL = 9;         // Crescendo: พลังงานสูงสุด 9 (ตัวอื่น 8)
const BARD_NOTES_PER_TURN = 2;    // จำกัด 2 โน้ตต่อเทิร์น (patch 2.0.5)
const BARD_DIM_NOTES_PER_TURN = 6; // ระหว่างมิติมายาบรรเลง (โลหิต/วิญญาณ patch 2.0.8): ไม่ติดลิมิต 2 — กดสกิลได้สูงสุด 6 ครั้งต่อเทิร์น
const BARD_NOTE_COST = 1;         // ค่าใช้พลังงานต่อโน้ต (patch 2.0.5 — ลดจาก 2)
const BARD_NOTE_FREE_CHANCE = 0.15; // โอกาส 15% ที่จะไม่เสียพลังงานเมื่อใช้โน้ต (patch 2.0.6 — ลดจาก 20%)
const BARD_DIM_FORTUNE = 1;         // มิติมายาบรรเลง (patch 2.0.8): คีตกวีได้โชคลาภ 1 ครั้ง (ทั้งสองมิติ)
const BARD_DIM_EVADE = 1;           // มิติมายาบรรเลง (patch 2.0.8): คีตกวีได้หลบหลีก 1 ครั้ง (ทั้งสองมิติ)
const BARD_DIM_RESIST_TURNS = 3;    // มิติมายาบรรเลง (patch 2.0.8): คีตกวีได้ต้านสถานะผิดปกติ 3 เทิร์น
const BARD_BLOOD_FRAGILE = 1;       // มิติโลหิต (patch 2.0.8): ทุกคน (ยกเว้นคีตกวี) ติดเปราะบาง +1 ดาเมจ 3 เทิร์น
const BARD_FORTUNE_MAX = 3;         // โชคลาภ ซ้อนทับได้สูงสุด 3 ครั้ง (patch 2.0.6.1)
// โชคลาภ (patch 2.2 new — ปรับใหม่): จั่วปุ๊ป ถ้ามีบัฟสะสมอยู่ ใช้ 1 หน่วยทันทีแล้วหายไป
//  ปรับไพ่ที่จั่วให้แต้มรวมตกอยู่ 19-21 (ดู fortuneTargetList) — ไม่มีเงื่อนไขโอกาส/แต้มเริ่มต้นแล้ว
const BARD_SOUL_TARGETS = 2;        // มิติวิญญาณ: ทุกการบรรเลง ตีสุ่มผู้เล่น 2 คน (patch 2.0.6 — เดิมตีทุกคน)
const BARD_SECTION_MAX = 5;       // ท่อนทำนองสะสมครบ 5 ชั้น -> เปิดมิติมายาบรรเลง
const BARD_DIM_TURNS = 3;         // มิติมายาบรรเลงคงอยู่ 3 เทิร์น
const BARD_SOUL_PERFORM_DMG = 1;  // มิติวิญญาณ (patch 2.0.5): ทุกการบรรเลง Bard ตีทุกคน 1 หน่วย
const BARD_PROFILE_IMG = "/characters/bard/bard_new.jpg"; // patch 2.1.1: เปลี่ยนรูปประจำตัวคีตกวี
const BARD_CRIMSON_IMG = "/characters/bard/bard_crimson.png";
const BARD_JADE_IMG = "/characters/bard/bard_jade.png";
// บทเพลงทั้ง 8 (R = ❤️ Crimson, J = 💚 Jade) — need = จำนวนเป้าหมาย, allowSelf = เลือกตัวเองได้
// (patch 2.0.5: สลับผังบทเพลงใหม่ — สายเพลงนับจากโน้ตเสียงข้างมาก)
const BARD_SONGS = {
  RRR: { name: "Encore", song: "crimson", need: 1, allowSelf: true },           // หลบหลีก +100% โดนโจมตี 1 ครั้งถัดไป
  RRJ: { name: "Silent Cadence", song: "crimson", need: 1, allowSelf: false },  // ใบ้สกิล 1 เทิร์น + ขโมยพลังงาน 1
  RJR: { name: "Fate's Prelude", song: "crimson", need: 1, allowSelf: true },   // โชคลาภในการจั่วครั้งถัดไป
  JRR: { name: "Rejuvenation", song: "crimson", need: 1, allowSelf: true },     // HP +1 / เกราะ +1 / พลังงาน +1
  JJJ: { name: "Sanctuary Hymn", song: "jade", need: 1, allowSelf: true },      // ต้านสถานะผิดปกติ 3 เทิร์น
  JJR: { name: "Resonance", song: "jade", need: 2, allowSelf: true },           // เชื่อมผล 3 เทิร์น
  JRJ: { name: "Discord", song: "jade", need: 1, allowSelf: false },            // ขัดแย้ง +1 ดาเมจ 3 เทิร์น
  RJJ: { name: "Harmony", song: "jade", need: 1, allowSelf: true },             // คุ้มครอง -1 ดาเมจ 3 เทิร์น
};
// พลังงานสูงสุดของผู้เล่น (Bard = 9)
function maxSkillOf(p) {
  if (isYuuki(p)) return 0;
  return (p && p.characterId === "bard") ? BARD_MAX_SKILL : MAX_SKILL;
}
// มิติมายาบรรเลงที่เปิดอยู่บนสนาม: "day" (โลหิต) | "night" (วิญญาณ) | null — ย้าย body ไป characters/bard.js

// ============================================================
//  บัฟ & ดีบัฟพื้นฐาน (universal) — ย้าย body ไป characters/_universal_status.js แล้ว
//  (resistActive/applyDebuff/applyBuff/statusAmtOf/cleanseDebuffs/noHealActive/invertActive/
//   SPELLBURDEN_MAX/BASIC_DEBUFF_CLEAR/SOFT_DEBUFF_STEP — require() ไว้ด้านบนไฟล์นี้แล้ว)
// ============================================================
// เชื่อมผล (linked): คู่เชื่อมที่ยังมีผลอยู่ทั้งสองฝั่ง (การเพิ่ม-ลด HP แชร์เท่ากัน)
let linkMirror = false; // กันสะท้อนวนไม่รู้จบระหว่างคู่เชื่อม
function linkedBuddiesOf(p) {
  const bardBuddies = CHAR_HOOKS.bard.linkedBuddiesOf(engine, p);
  const kaiBuddy = CHAR_HOOKS.kai.kaiLinkedBuddyOf(engine, p);
  const all = kaiBuddy ? [...bardBuddies, kaiBuddy] : bardBuddies;
  return all.filter((buddy, index) => all.findIndex((x) => x.id === buddy.id) === index);
}
function linkedBuddyOf(p) {
  return linkedBuddiesOf(p)[0] || null;
}
// ---------- ไค ชิซากิ (kai) ----------
//  "เชื่อมต่อ" (kaiLink) — โค้ดแยกอิสระจาก linkedBuddyOf ของ Bard ข้างบนโดยสิ้นเชิง (ดู characters/kai.js)
//  kaiOverhaulSlots: เกมมีห้องเดียว ไม่มีระบบ multi-room (grep แล้วไม่พบ rooms[) — module-level array
//  [{ ownerId, playerId, status: "kaiCreation"|"kaiPunishment" }] แยกชุดละ 2 ช่องต่อ Kai เจ้าของมาร์ก
let kaiOverhaulSlots = [];
// ---------- เรียวกิ ชิกิ (patch 2.0.5 / rework 2.0.6) ----------
// ค่าคงที่ของชิกิเองส่วนใหญ่ย้ายไปอยู่ characters/shiki.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const SHIKI_DEATHLINE_MAX = 6;   // เส้นชีวิตสะสมถึง 6 -> โจมตีปกติระหว่างท่าไม้ตาย 1 = สังหารทันที (ใช้เป็น gate ก่อนเรียก CHAR_HOOKS.shiki)
const SHIKI_WITHER_PASSIVE_CAP = 2; // โหมดท่าไม้ตาย 2: สกิลติดตัว/สกิลรอง ให้เส้นชีวิตได้สูงสุด 2 หน่วย (ใช้ใน shikiGiveLifeline — shared กับ tepeu/phenex)
const SHIKI_WITHER_ATK_CAP = 5;  // ความตายที่โรยรา: เส้นชีวิตแปรเป็นดาเมจเสริมการโจมตีปกติ — พลังโจมตีรวมสูงสุด 5 ต่อครั้ง (คำนวณใน doAttack()'s shared damage-sum — นอกขอบเขต Phase 1)
const SHIKI_PROFILE_IMG = "/characters/shiki/shiki.jpg";
const SHIKI_DEATH_IMG = "/characters/shiki/shiki_death.jpg"; // ร่างระหว่างท่าไม้ตาย ฉันมองเห็นมันแล้ว
const SHIKI_WITHER_IMG = "/characters/shiki/shiki2.jpg";     // ร่างระหว่างท่าไม้ตาย 2 ความตายที่โรยรา
// เจ้าหญิงราก (patch 2.2.7): รูปที่ใช้บนป้ายสรุปการโจมตีตอน "เนตรมณะ" สังหารสำเร็จ (สถานะ Universal ใช้ร่วมทุกตัวละคร)
const PSHIKI_ULT_IMG = "/characters/princess_shiki/p_shiki_skill3.jpg";
// แบทแมน (patch 2.2.7): รูปที่ใช้บนป้ายสรุปการโจมตีตอนล่อเป้า/สะท้อนความเสียหาย
const BAT_SKILL3_IMG = "/characters/bat_ben/bat_ben_skill3.jpg";
// ---------- โทโนะ ชิกิ (patch 2.1.7) ----------
// ค่าคงที่/logic ส่วนใหญ่ย้ายไปอยู่ characters/tohno.js แล้ว — เหลือแค่ภาพที่โค้ดส่วนกลาง (TRANSFORMS/displayImg) ยังใช้อยู่
const TOHNO_DEATH_IMG = CHAR_HOOKS.tohno.DEATH_IMG; // ร่างระหว่างสกิลติดตัวเปิดใช้งาน (ระดับ 2 ขึ้นไป)
// ---------- นานายะ ชิกิ (patch 2.1.9) ----------
// ค่าคงที่/logic ทั้งหมดย้ายไปอยู่ characters/nanaya.js แล้ว
// สกิลติดตัวถูก "อันนี้ของนายรึเปล่า" หรือ MOON*CELL (คิชินามิ ฮาคุโนะ) ปิดใช้งานอยู่ไหม
//  (ใช้เช็คก่อนให้สกิลติดตัวของตัวละครอื่นทำงาน — MOON*CELL มีผลกับทุกคนยกเว้นเจ้าของท่าเอง)
function passiveSealed(p) {
  if (!p) return false;
  if (moonCellActive() && !((p.statuses && p.statuses.moonCell) > 0)) return true;
  return ((p.statuses && p.statuses.nanayaSeal) || 0) > 0;
}
// ---------- อาริมะ มิยาโกะ (patch 2.2.0) ----------
// ค่าคงที่ของมิยาโกะส่วนใหญ่ย้ายไปอยู่ characters/miyako.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const MIYAKO_KILL_REDUCE = 0.40;      // นั่นพี่จ๋าหรอ?: ลดโอกาสถูกสังหารทันทีลง 40% ทุกครั้งที่รอด (สะสม — ใช้ใน miyakoKillChance shared infra)
// ความสามารถสังหารทันทีถูก "หนูจะทำให้พี่ตาสว่างเอง" ปิดใช้งานอยู่ไหม (อาริมะ มิยาโกะ)
function killSealed(p) {
  return !!p && ((p.statuses && p.statuses.miyakoSeal) || 0) > 0;
}
// ตัวละครนี้ "มี" ความสามารถสังหารทันทีติดตัวไหม (โทโนะ ชิกิ / นานายะ ชิกิ: นับแม้กำลังปิดสกิลติดตัวไว้อยู่ — ป้องกันเปิดกลับมาใช้ทีหลัง
//  หลังโดนปิดใช้งานจากหนูจะทำให้พี่ตาสว่างเอง / เรียวกิ ชิกิ: ต้องมีท่าไม้ตายสังหารทันทีเปิดใช้งานอยู่จริงเท่านั้น เพราะเป็นทรัพยากรที่ต้องเสียแต้มเปิดใหม่)
function hasKillCapability(p) {
  if (!p || !p.alive) return false;
  if (p.characterId === "tohno") return true;
  if (p.characterId === "nanaya") return true;
  if (p.characterId === "shiki" && (((p.statuses.deatheye || 0) > 0) || ((p.statuses.wither || 0) > 0))) return true;
  // เจ้าหญิงราก (patch 2.2.7): สกิลติดตัวคิดโอกาสสังหารจากเส้นชีวิตเสมอเมื่อได้โจมตีปกติ
  if (p.characterId === "princess_shiki") return true;
  // "เนตรมณะ" (สถานะ Universal patch 2.2.7): ใครติดบัฟนี้ก็มีความสามารถสังหารทันทีระหว่างที่บัฟยังอยู่
  if (netramanaActive(p)) return true;
  return false;
}
// Apple guy: หลบหลีกสำเร็จระหว่างชิวๆครับน้องๆ สามารถรอดพ้นจากสกิลประเภท "สังหารทันที" ได้ด้วย
//  (universal-dispatcher wrapper — ตรรกะจริงอยู่ characters/appleguy.js — ตัวละครสังหารทันทีอื่นเรียกผ่าน engine.appleGuyDodgesKill)
function appleGuyDodgesKill(attacker, target) {
  return CHAR_HOOKS.appleguy.tryDodgeKill(engine, attacker, target);
}
// นั่นพี่จ๋าหรอ? (สกิลติดตัว): ลดโอกาสถูกสังหารทันทีของอาริมะ มิยาโกะ ตามจำนวนครั้งที่เคยรอด (สะสม 40%/ครั้ง)
function miyakoKillChance(target, baseChance) {
  if (!target || target.characterId !== "miyako") return baseChance;
  const resist = target.miyakoKillResist || 0;
  return Math.max(0, baseChance * (1 - MIYAKO_KILL_REDUCE * resist));
}
// เรียกเมื่ออาริมะ มิยาโกะ รอดจากการถูกสังหารทันที (การสังหารพลาด/ไม่เกิดขึ้น) — สะสมสกิลติดตัวเพิ่ม +1 ชั้น เสียพลังชีวิต 1 หน่วยไม่สนเกราะ
function miyakoSurvivedKillAttempt(target) {
  if (!target || target.characterId !== "miyako" || !target.alive) return;
  target.miyakoKillResist = (target.miyakoKillResist || 0) + 1;
  lastLog.push(`🥊 ${target.name} นั่นพี่จ๋าหรอ? — รอดจากการถูกสังหารทันที! โอกาสถูกสังหารทันทีในอนาคตลดลงอีก 40% (สะสม ${target.miyakoKillResist} ชั้น) เสียพลังชีวิต 1 หน่วย (ไม่สนเกราะ)`);
  dealDirect(target, 1);
  if (target.alive && target.hp <= 0) { instantDeath(target); if (!target.alive) lastLog.push(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`); }
}
// ---------- คิชินามิ ฮาคุโนะ (patch 2.2.1) ----------
// ค่าคงที่ของฮาคุโนะส่วนใหญ่ย้ายไปอยู่ characters/hakuno.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const HAKUNO_MALE_ARMOR_CAP = 4;      // ร่างชาย: เพดานเกราะคงที่ 4 หน่วย (maxArmorOf)
const HAKUNO_FEMALE_ARMOR_CAP = 5;    // ร่างหญิง: เพดานเกราะคงที่ 5 หน่วย (maxArmorOf)
const HAKUNO_MALE_MAX_HP = 6;         // ร่างชาย: เพดานเลือดจริงคงที่ 6 หน่วย (maxHpOf)
const HAKUNO_FEMALE_MAX_HP = 5;       // ร่างหญิง: เพดานเลือดจริงคงที่ 5 หน่วย (maxHpOf)
const HAKUNO_NORECOVER_TURNS = 3;     // ข้าขอบัญชา (หญิง) / MOON*CELL: ติดไร้ทางเยียวยา 3 เทิร์น (ใช้ใน MOON*CELL-end restore loop ที่ยังอยู่ server.js)
const HAKUNO_DRAW_LOW_VALUES = [2, 3]; // ข้าขอบัญชา (หญิง): จั่วเพิ่มระหว่างนี้ได้แค่ 2 หรือ 3 แต้ม (drawCardFor)
const HAKUNO_MOONCELL_NEED = 3;       // MOON*CELL: ต้องมีแต้มคำสาปแห่งดวงจันทร์ครบ 3 ต่อการเปิด 1 ครั้ง (useSkill's gate)
const HAKUNO_COMMAND_USES = 3;        // อาคมบัญชาระดับ EX+: ใช้ได้ 3 ครั้งต่อเกม (player factory + buildStateFor)
// สกิลติดตัว/ท่าไม้ตายถูก MOON*CELL ปิดใช้งานอยู่ไหม (มีผลกับทุกคนยกเว้นฮาคุโนะเจ้าของท่า)
function moonCellActive() {
  return Object.values(players).some((pp) => (pp.statuses && pp.statuses.moonCell) > 0);
}
// ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ — ท่าไม้ตายทำงานอยู่ไหม (บังตากระดานทั้งหมด — แบบเดียวกับ moonCellActive)
function takumiBlackoutActive() {
  return Object.values(players).some((pp) => (pp.statuses && pp.statuses.takumiBlackout) > 0);
}
// DoomGuy: มี [ระเบิด]/[ล็อคเป้า] ค้างอยู่บนใครสักคนไหม (Combat Shotgun/Heavy Cannon) — ค้างอยู่ระหว่างนี้กด Quick Swap สุ่มปืนใหม่ไม่ได้ จนกว่าจะโดนใช้ (โดนโจมตี)
function doomWeaponMarkPending() {
  return Object.values(players).some((pp) => (pp.statuses && (pp.statuses.doomExplode > 0 || pp.statuses.doomLockon > 0)));
}
// ยูนะ — Break Beat Bark! ทำงานอยู่ไหม (บัฟทั้งสนาม ไม่ใช่สถานะผู้เล่นคนเดียว เหมือน moonCellActive)
function yunaBeatBarkActive() {
  // เอจิ: ท่าไม้ตาย "ไม่ว่ายังก็ตาม" บังคับเปิด Break Beat Bark! — ถือ statuses.eijiUlt เป็นแหล่งความจริง
  //  ห้ามพึ่ง yunaEffect อย่างเดียว เพราะ Longing (ที่ทริกจากการตาย ไม่ผ่าน rollWindow) เขียนทับตัวแปรร่วมนี้
  //  ได้ทุกเมื่อ ทำให้เอฟเฟกต์สนามของท่าไม้ตายหายกลางคันทั้งที่ตัวท่ายังนับเทิร์นเหลืออยู่
  if (eijiUltFieldActive()) return true;
  return yunaEffect === "beatbark" && roundNumber <= yunaWindowEnd;
}
// ท่าไม้ตายที่ยกเลิกย้อนหลังได้ (เจ้าของท่ามาตีชิกิระหว่างถือชาร์จ) — สถานะท่าไม้ตายที่กำลังมีผลอยู่
const SHIKI_CANCELABLE_ULTS = ["gingastrium", "rachan", "paradise", "golden", "fourth", "chill",
  "kready", "lai", "vortigern", "deatheye", "wither", "shradecharge",
  "anata",                  // patch 2.0.8: เพิ่ม ANATA WAAAAAAAA (เทมาริ) — ครอบคลุมท่าไม้ตายทุกตัวละครที่เก็บเป็นสถานะ
  "bloodDim", "soulDim",    // patch 2.0.8.1: มิติมายาบรรเลงทั้งสอง (คีตกวี) นับเป็นท่าไม้ตาย — ยกเลิกย้อนหลังได้
  "victorybeat", "ashen",   // patch 2.0.8.1: ท่าไม้ตายโอกูริ แคป ทั้งสองท่า
  "riddhentd", "riddheguard", // patch 2.0.9: ท่าไม้ตายริดดี้ มาร์เซนาส ทั้งสองท่า
  "phenexNtd", "phenexTaunt", // patch 2.1.6: ท่าไม้ตายริต้า เบอร์นัล ทั้งสองท่า
  "batTaunt",                 // patch 2.2.7: เข้ามาเลย (แบทแมน)
  "pshikiUlt",                // patch 2.2.7: ทุกอย่างจะต้องราบรื่น (เจ้าหญิงราก)
  "harukaOmega",               // patch 2.5: New Omega (มิซึซาว่า ฮารุกะ) — สถานะล้วน ลบทิ้งได้ตรงๆ ไม่มี mirror ต้องเก็บกวาด
  "muimiTower"];               // มุยมิ: สถานะ “ดาบสะบั้น” จากดาบสะบั้นหอคอยสวรรค์
// ชื่อท่าไม้ตายจาก status (ใช้ตอนยกเลิกย้อนหลัง — บางท่าไม่มีใน TRANSFORMS/ข้อมูลสกิล)
function shikiUltNameOf(p, key) {
  if (key === "shradecharge") return "แด่เพื่อนรักของฉัน";
  if (key === "wither") return "ความตายที่โรยรา";
  if (key === "batTaunt") return "เข้ามาเลย";
  if (key === "pshikiUlt") return "ทุกอย่างจะต้องราบรื่น";
  if (key === "deatheye") return "ฉันมองเห็นมันแล้ว";
  if (key === "chill") return "ชิวๆครับน้องๆ";
  if (key === "bloodDim") return "มิติมายาบรรเลงโลหิต";
  if (key === "soulDim") return "มิติมายาบรรเลงวิญญาณ";
  if (key === "ashen") return "Ashen Trail: Cinderella Gray";
  if (key === "riddhentd") return "แกไม่มีสิทธิ์มาสั่งสอนฉัน";
  if (key === "riddheguard") return "ฉันจะไม่ยอมสูญเสียใครไปอีก";
  const t = TRANSFORMS[key];
  if (t && t.title) return t.title;
  const s = skillByStatus(p, key);
  return s ? s.name : key;
}
// จบความตายที่โรยรา (สังหารสำเร็จ/หมดเวลา/ถูกยกเลิก): ลบเส้นชีวิตส่วนที่ท่าไม้ตายแจกไปออกจากทุกคน
function clearWitherLines(shikiId = null) {
  for (const o of Object.values(players)) {
    const byOwner = o.witherAddedBy || {};
    const added = shikiId ? (byOwner[shikiId] || 0) : Object.values(byOwner).reduce((sum, n) => sum + n, 0);
    if (added > 0) {
      const cur = o.statuses.deathline || 0;
      const next = Math.max(0, cur - added);
      if (next > 0) o.statuses.deathline = next;
      else delete o.statuses.deathline;
    }
    if (shikiId) delete byOwner[shikiId];
    else o.witherAddedBy = {};
    if (shikiId && !Object.keys(byOwner).length) delete o.witherAddedBy;
  }
}
// มอบเส้นชีวิตจากสกิลติดตัว/สกิลรอง (โหมดท่าไม้ตาย 2: +1/ครั้ง และแหล่งปกติให้ได้ไม่เกิน 3)
function shikiGiveLifeline(shiki, target, amount) {
  if (resistActive(target)) return 0; // ต้านสถานะผิดปกติ: ไม่ได้เส้นชีวิตเพิ่ม (สแตคเดิมที่มีอยู่ก่อนหน้าไม่หาย)
  const cur = target.statuses.deathline || 0;
  if ((shiki.shikiUlt || "deatheye") === "wither") {
    if (cur >= SHIKI_WITHER_PASSIVE_CAP) return 0;
    const next = Math.min(SHIKI_WITHER_PASSIVE_CAP, cur + 1);
    target.statuses.deathline = next;
    return next - cur;
  }
  target.statuses.deathline = cur + amount;
  return amount;
}
// เทเปา: นายเป็นคนทำตัวเองนะ — ตรรกะย้ายไปอยู่ characters/tepeu.js ทั้งหมดแล้ว (ดู resolveAllKills)

// ---------- โอกูริ แคป (patch 2.0.8.1) ----------
//  ระบบ Stamina: เริ่มเกมได้ 8 แต้ม (สะสมสูงสุด 16) — ใช้เป็นทรัพยากรของสกิลรอง/ท่าไม้ตาย
//  ยุคทอง (goldenera): พลังโจมตี +1 / เพดานเกราะ +1 — สะสม 2 แต้ม อยู่ 3 เทิร์น หายเมื่อฝึกฝนล้มเหลว
//  ครบ 2 แต้ม -> เข้าร่าง Zone (GrayBeast: Stamina +1/เทิร์น, แต้มสกิล +1 ทุก 2 เทิร์น)
//  Stamina หมด + ไม่มียุคทอง -> ร่างหมดแรง (Burnout: ใช้ได้แค่ A Big Meal)
// ---------- โอกูริ แคป (Rework): Energy (ทรัพยากรของสกิล) + Stamina ชาร์จ (ทรัพยากรท่าไม้ตาย แยกกัน) ----------
const OGURI_ENERGY_START = 8;      // Energy: เริ่มเกมได้รับ 8 แต้ม
const OGURI_ENERGY_MAX = 16;       // Energy สะสมสูงสุด
const OGURI_CHARGE_BASE_CAP = 52;  // Stamina ชาร์จ: ความจุพื้นฐาน
const OGURI_CHARGE_CAP_MAX_BONUS = 48; // Training: เพิ่มความจุได้สูงสุดสะสม +48 (รวมเพดานสูงสุด 100)
const OGURI_CHARGE_GAIN_MIN = 6;   // Stamina ชาร์จ: ได้รับทุกเทิร์น 6-12 หน่วย (สุ่ม) — Rework: เดิม 8-16 (ค่าจริงที่ใช้คำนวณอยู่ใน characters/oguri.js)
const OGURI_CHARGE_GAIN_MAX = 12;
const OGURI_GOLD_MAX = 3;          // ยุคทอง สะสมสูงสุด (Rework: เดิม 2 -> 3)
const OGURI_GOLD_TURNS = 6;        // ยุคทอง อยู่ 6 เทิร์น (รีเฟรชเมื่อได้แต้มใหม่)
const OGURI_GOLD_ATK_PER = 1;      // ยุคทอง: พลังโจมตีพื้นฐาน +1 ทุกๆแต้มที่ติดอยู่บนตัว
const OGURI_GOLD_ATK_CAP = 2;      // ยุคทอง: พลังโจมตีบวกได้ไม่เกิน 2 หน่วย (Rework)
const OGURI_GOLD_ARMOR_AT = 2;     // ยุคทอง: ครบ 2 แต้มขึ้นไป ได้เพดานเกราะ +1 (Rework — เดิมแค่มียุคทองก็ได้แล้ว)
const OGURI_GRAYBEAST_SP_TURNS = 2; // GrayBeast: แต้มสกิล +1 ทุก 2 เทิร์น (Energy +1 ได้ทุกเทิร์น)
const OGURI_BURNOUT_TURNS = 2;     // Burnout: คงอยู่ 2 เทิร์น (ไม่ใช่ถาวรแบบเดิมแล้ว)
const OGURI_BURNOUT_ENERGY_PENALTY = 2; // Burnout: Breakfast ได้ Energy ลดลง -2
const OGURI_BURNOUT_DECAY_TURNS = 2; // Burnout: มอบสถานะผุพัง 2 เทิร์น
const OGURI_BREAKFAST_HEAL = 1;    // Breakfast: ฟื้นเลือด 1
const OGURI_BREAKFAST_ENERGY = 4;  // Breakfast: Energy +4 ปกติ (Burnout ลดเหลือ +2)
const OGURI_TRAIN_ENERGY_COST = 4; // Training: หัก Energy 4 (เดิมหัก Stamina)
const OGURI_TRAIN_CAP_GAIN_MIN = 3; // Training: เพิ่มความจุ Stamina ชาร์จ 3-7 หน่วย (สุ่ม) — Rework: เดิม 4-8 (ค่าจริงที่ใช้คำนวณอยู่ใน characters/oguri.js)
const OGURI_TRAIN_CAP_GAIN_MAX = 7;
const OGURI_TRAIN_BASE = 0.6;      // โอกาสฝึกฝนสำเร็จพื้นฐาน 60%
const OGURI_TRAIN_BONUS_RATE = 0.8; // บัฟ Bonus ทำงานอยู่: โอกาสสำเร็จเพิ่มเป็น 80%
const OGURI_TRAIN_FAIL_DMG = 1;    // ฝึกฝนล้มเหลว: ดาเมจ 1 หน่วยไม่สนเกราะ
const OGURI_TRAIN_EXTRA_ROLL = 0.25; // ฝึกฝนสำเร็จ: โอกาส 25% ได้บัฟเสริมเพิ่มอีก 1 อัน
const OGURI_TRAIN_FLOW_W = 0.40;   // บัฟเสริม 3 แบบ (สุ่มถ่วงน้ำหนัก): Flow 40%
const OGURI_TRAIN_BONUS_W = 0.40;  // Bonus 40%
const OGURI_TRAIN_SUNNY_W = 0.20;  // Sunny Day 20%
const OGURI_FLOW_TURNS = 3;        // Flow: อยู่ 3 เทิร์น หรือจนกว่าจะถูกโจมตี
const OGURI_FLOW_DODGE = 0.5;      // Flow: โอกาสหลบการโจมตี 50%
const OGURI_BONUS_TURNS = 3;       // Bonus: อยู่ 3 เทิร์น
const OGURI_SUNNY_TURNS = 3;       // Sunny Day: อยู่ 3 เทิร์น
const OGURI_SUNNY_FORTUNE = 1;     // Sunny Day: ได้โชคลาภ +1 ทุกเทิร์นที่มีบัฟนี้
const OGURI_ULT_CHARGE_COST = 35;  // The Beat of Victory: Stamina ชาร์จ 35
const OGURI_ULT_ATK_BONUS = 2;     // ชนะ: พลังโจมตีพื้นฐาน +2 (ซ้อนทับกับยุคทองได้)
const OGURI_ULT_NOREGEN_TURNS = 2; // เป้าหมาย: เกินเยียวยา 2 เทิร์น
const OGURI_ULT_STAGGER_TURNS = 2; // เป้าหมาย: ชะงัก 2 เทิร์น (ฟื้นฟูแต้มสกิลไม่ได้)
const OGURI_ULT2_CHARGE_COST = 80; // Ashen Trail: Stamina ชาร์จ 80 (ต้องมียุคทองครบด้วย) — Rework: เดิม 75
const OGURI_ASHEN_DRAWS = 2;     // Ashen Trail: บังคับทุกคนจั่วเพิ่ม 2 ใบ
const OGURI_ASHEN_DMG = 2;       // Ashen Trail: โจมตีทุกคนที่ไพ่แตกหลังเปิดไพ่
const OGURI_ASHEN_CARD_BONUS = 8; // Ashen Trail: คู่ต่อสู้ทุกคนบวกแต้มการ์ด +8
const OGURI_ZONE_IMG = "/characters/oguri/zone_form.jpg";
// แต้มยุคทองปัจจุบัน (เก็บจำนวนใน statusAmt คู่กับเวลาใน statuses)
function oguriGoldStacks(p) {
  return ((p.statuses && p.statuses.goldenera) || 0) > 0 ? ((p.statusAmt && p.statusAmt.goldenera) || 0) : 0;
}
// ความจุ Stamina ชาร์จปัจจุบัน (พื้นฐาน 52 + ที่เพิ่มจาก Training สะสมสูงสุด +48 = เพดาน 100)
function oguriChargeCapOf(p) {
  return OGURI_CHARGE_BASE_CAP + Math.min(OGURI_CHARGE_CAP_MAX_BONUS, p.oguriChargeCapBonus || 0);
}
// ยุคทองครบ + Stamina ชาร์จพอ -> ปลดล็อกท่าไม้ตาย 2 Ashen Trail แทนท่าไม้ตาย 1
function oguriAshenReady(p) {
  return oguriGoldStacks(p) >= OGURI_GOLD_MAX && (p.stamina || 0) >= OGURI_ULT2_CHARGE_COST;
}
// เพิ่ม/ลด Energy (0..16) — ทรัพยากรของ Breakfast/Training/GrayBeast
function oguriAddEnergy(p, n) {
  p.oguriEnergy = Math.max(0, Math.min(OGURI_ENERGY_MAX, (p.oguriEnergy || 0) + n));
}
// เพิ่ม/ลด Stamina ชาร์จ (0..ความจุปัจจุบัน) — ทรัพยากรของท่าไม้ตาย ได้รับอัตโนมัติทุกเทิร์น
function oguriAddCharge(p, n) {
  p.stamina = Math.max(0, Math.min(oguriChargeCapOf(p), (p.stamina || 0) + n));
}

// ---------- ซาโตรุ อาเคฟุ (universal-wrapper — ตรรกะจริงอยู่ characters/satoru.js) ----------
//  satoruOnTargeted() ถูกเรียกจากตัวละครอื่นแทบทุกตัวในเกม (engine.satoruOnTargeted) ก่อนใส่ผลสกิล/
//  ดาเมจใส่เป้าหมาย เพื่อให้สกิลติดตัวซาโตรุทำงานได้แม้ผู้เรียกไม่รู้จักซาโตรุเลย — ห้ามลบ wrapper นี้
const SATORU_PROFILE_IMG = "/characters/satoru/satoru.jpg";
function satoruOnTargeted(t, by, what) {
  if (!t || t.characterId !== "satoru") return { negated: false };
  return CHAR_HOOKS.satoru.onTargeted(engine, t, by, what);
}

// ---------- ริดดี้ มาร์เซนาส (patch 2.0.9) ----------
// ตรรกะ/ค่าคงที่ส่วนใหญ่ย้ายไปอยู่ characters/riddhe.js แล้ว — เหลือแค่ที่ shared infra (maxArmorOf/displayImg/
// buildStateFor/TRANSFORMS/socket-handler ข้อเสนอพันธมิตร) ในไฟล์นี้ยังใช้อยู่
const RIDDHE_ABSORB_ARMOR = 2;     // Absorb Shield: เพดานเกราะ + ฟื้นชั่วคราว +2 (maxArmorOf — มีสำเนาใน riddhe.js สำหรับ log)
const RIDDHE_BANSHEE_IMG = "/characters/riddhe/profile/banshee.png";   // ภาพปกเริ่มเกม (ค่าเริ่มต้น)
const RIDDHE_NTD_IMG = "/characters/riddhe/profile/banshee_ntd.png";   // ระหว่าง NT-D (ท่าไม้ตาย 1)
const RIDDHE_NTD2_IMG = "/characters/riddhe/profile/banshee_ntd2.jpg"; // ระหว่างท่าไม้ตาย 2 / หลังสกิลติดตัว 3 (ถาวร)
// ---------- ริต้า เบอร์นัล / ฟีนิกซ์ (patch 2.1.6) ----------
// ค่าคงที่ของฟีนิกซ์ส่วนใหญ่ย้ายไปอยู่ characters/phenex.js แล้ว — เหลือแค่ที่ shared infra ในไฟล์นี้ยังใช้อยู่
const PHENEX_BAN_ULT_TURNS = 3;   // อย่าอยู่เลย แกน่ะ!: ไม่มีท่าไม้ตายให้ลบ -> แบนท่าไม้ตายเป้าหมาย 3 เทิร์นแทน (purge resolution — ยังอยู่ server.js เพราะเรียก shiki's shared infra)
const PHENEX_BASE_IMG = "/characters/rita/profile/phenex.png";     // ภาพเริ่มเกม (ลงสนามแล้ว) ปกติ (displayImg/TRANSFORMS)
const PHENEX_NTD_IMG = "/characters/rita/profile/phenex_ntd.png";  // ระหว่างฝืนใช้งาน NTD-Sytem (displayImg/TRANSFORMS/fx)
// คู่พันธมิตรที่ยังมีผลอยู่ (characters/riddhe.js — wrapper รอบ CHAR_HOOKS.riddhe.allied)
function riddheAllied(p) {
  return CHAR_HOOKS.riddhe.allied(engine, p);
}
// กันตาย (ท่าไม้ตาย 2, characters/riddhe.js) — wrapper รอบ CHAR_HOOKS.riddhe.guardProtects
// ยกเลิกพันธมิตร (characters/riddhe.js) — wrapper รอบ CHAR_HOOKS.riddhe.breakAlliance


// ร่างกลางวัน/กลางคืนของโอเบรอน (สลับอัตโนมัติตามช่วงเวลา)
const OBERON_MORNING_IMG = "/characters/oberon/oberon_morning.jpg";
const OBERON_NIGHT_IMG = "/characters/oberon/oberon_night.jpg";

// รูปร่างโอเจอร์ (ใช้ทั้งท่าไม้ตายสวมเกราะราชัน และ Beat Mode)
const OHGER_FORM = "/characters/kuwagata/kuwakata_ohger_form.jpg";

// การแปลงร่าง/cutscene ต่อสถานะ — ตาราง data ล้วนๆ ~160 บรรทัด ย้ายไป characters/_transforms.js แล้ว
//  (factory function รับ path รูปที่ server.js ใช้ร่วมกับที่อื่นด้วย กันประกาศ path ซ้ำสองที่)
const TRANSFORMS = require("./characters/_transforms")({
  HIKARU_STRIUM_IMG, OBERON_NIGHT_IMG, OBERON_MORNING_IMG, SHRADE_SPADA_IMG, BARD_PROFILE_IMG,
  SHIKI_DEATH_IMG, SHIKI_PROFILE_IMG, SHIKI_WITHER_IMG, TOHNO_DEATH_IMG, OGURI_ZONE_IMG,
  RIDDHE_BANSHEE_IMG, RIDDHE_NTD_IMG, RIDDHE_NTD2_IMG, PHENEX_NTD_IMG, PHENEX_BASE_IMG, OHGER_FORM,
});


// ---------- สถานะเกมส่วนกลาง ----------
let players = {};
let gameState = "LOBBY"; // LOBBY | TEAM_MODE | TEAM_SETUP | PLAYING | CUTSCENE | SUMMARY | ATTACK | TRANSITION | GAMEOVER
let gameMode = "ffa"; // ffa | duo | trio | overload | pending
let teamSize = 1;
let teamCount = 0;
let winningTeamId = null;
let modeVotes = {};
let effectSourceId = null;
const TEAM_IDS = ["A", "B", "C"];
let timeLeft = 0;
let phaseTimerId = null;
let attackerId = null;
let roundWinnerId = null;
let roundTiedWin = false;  // ผู้ชนะได้จากการเสมอแต้ม -> ไม่มีเทิร์นโจมตีรอบนี้
let doomTieAttack = false; // DoomGuy สกิลติดตัว: เสมอแต้มแล้วโรลติด -> ได้เป็นผู้ชนะและได้โจมตีรอบนี้
let overloadForceActive = false; // สนามพิเศษมีผลเฉพาะเทิร์นที่สุ่มติด
let overloadForceSeq = 0;        // เริ่มวิดีโอและเพลงใหม่ทุกครั้งที่เกิด
let overloadForceCount = 0;      // ครั้งที่เกิดในแมตช์ — ครั้งที่ 3 ถูกแทนด้วยบอสยูกิ
let yuukiSpawned = false;         // ยูกิเกิดได้เพียงครั้งเดียวต่อเกม
let yuukiTurns = 0;               // นับเทิร์นบนสนามสำหรับ Star of Fall ทุก 5 เทิร์น
let yuukiAttackTargets = [];      // คิวโจมตี 2 เป้าหมายแบบไม่ซ้ำเมื่อยูกิชนะ
let yuukiLowShown = false;
let yuukiWinShown = false;
let yuukiDefeated = false;         // โหมด Over Load: โค่นบอสแล้วผู้เล่นทุกคนชนะทันทีเมื่อคัตซีนจบ
let yuukiReactiveDrawCredits = 0;  // ยูกิจั่วตอบโต้ได้สูงสุด 1 ใบต่อไพ่ที่มนุษย์จั่ว
let roundNumber = 0;
let centralDeck = []; // กองกลาง 43 ใบ (สับใหม่ทุกรอบใน dealRound())
let lastLog = [];
let reservations = {};
// playerId is independent from socket.id so a reconnect can reclaim the same player.
const sessions = new Map();          // sessionToken -> playerId
const socketPlayerIds = new Map();   // socket.id -> playerId
const disconnectTimers = new Map();  // playerId -> timeout
const reservationTimers = new Map(); // socket.id -> timeout
let cutsceneQueue = [];
let cutsceneInfo = null;
let cutsceneSeq = 0;      // id ต่อ cutscene (ให้ client remount วีดีโอ กันจอดำ)
let attackSeq = 0;        // id ต่อ lastAttack (ให้ client remount ฉากโจมตี กันแอนิเมชันไม่เล่นซ้ำเวลาตี/เป้าหมาย/ดาเมจซ้ำกัน)
let transformCounter = 0; // ลำดับการเปิดร่าง (ใช้เลือกเพลงตอนสวนท่ากัน)
let anataMusicSeq = 0;    // เพลง ANATA WAAAAAAAA เล่นระหว่างช่วงจั่วการ์ด จบเมื่อทุกคนเปิดไพ่
let oberonDevour = 0;     // ราตรีกลืนกิน: เปิดเมื่อโอเบรอนใช้ท่าไม้ตาย 2 (Vortigern) — หายไปเมื่อหมดกลางคืน (0 = ปิด)
let lastAttack = null;    // ข้อมูลการโจมตีล่าสุด (อนิเมชันใครตีใคร)
let roundSkills = [];     // สกิลที่ใช้ในรอบ (เก็บประวัติ — instant เด้งตอนใช้ / หลังเปิดไพ่โชว์ตอนโจมตี)
let allyWinFlag = false;  // ริดดี้ (patch 2.0.9): จบเกมแบบชนะทั้งคู่ (คงพันธมิตรตอนเหลือแค่คู่พันธมิตร)
let shopItems = [];       // ร้านค้ามายา (patch 2.3): สินค้าส่วนกลางของรอบปัจจุบัน (15 ชิ้น เปิดทุก 5 เทิร์น — ร้านเดียวรวมของลุงเท่งเดิม)
let shopRoundSeq = 0;     // ลำดับรอบร้านค้า (ใช้สร้าง id สินค้าไม่ให้ซ้ำกันข้ามรอบ)

// ---------- ยูนะ ไอดอลประจำสนาม (characters/yuna.js — ไม่ใช่ตัวละครที่เล่นได้ ไม่มี p เป็นของตัวเอง) ----------
const YUNA_IMG = "/characters/yuna/yuna.png";
const YUNA_COLOR = "#c9a7ff";
let yunaLongingUsed = false; // เพลง Longing ใช้ไปแล้วหรือยัง (ครั้งเดียวต่อเกม)
let yunaWindowEnd = 0;       // roundNumber ที่เอฟเฟกต์ปัจจุบันหมดผล (0 = ไม่มีเอฟเฟกต์ทำงานอยู่)
let yunaEffect = null;       // "longing" | "delete" | "smile" | "beatbark" | null
let yunaTargetId = null;     // เป้าหมาย delete/smile/longing — null สำหรับ beatbark (ทั้งสนาม)
let yunaMusicSeq = 0;        // เพิ่มทุกครั้งที่ยูนะ trigger ใหม่ -> client รีสตาร์ทเพลงจากต้น
let yunaLongingPendingId = null; // ตายในเทิร์น 1-10 แล้วรอฟื้นด้วย Longing — รอฉากโจมตีจบก่อน (ดู endTurn())
let yunaPity = 0;            // ระบบกันดวงซวย: หน้าต่างไหนไม่ติด +5% สะสมไปเรื่อยๆ ติดแล้วรีเซ็ตกลับ 0 (ดู characters/yuna.js's rollWindow)

const RESYNC_EVERY = 10; // ทุกกี่วินาทีถึงจะ broadcast state ตัวเต็ม (นอกนั้นส่งแค่ "tick")
function clearPhaseTimer() {
  if (phaseTimerId) clearInterval(phaseTimerId);
  phaseTimerId = null;
}
// เก็บ callback ของเฟสปัจจุบันไว้ (นอกเหนือจาก timeLeft) — ใช้ตอนต้อง "แทรก" คัตซีนแบบ async นอกรอบ
//  ปกติ (เช่น ริต้า เบอร์นัล ตอบคำถามปลดปล่อยความเจ็บปวดช้ากว่ารอบที่ตายจริง) แล้วต้องกลับมาที่เฟส/ตัวจับเวลาเดิมให้ถูกต้อง
let currentPhaseOnExpire = null;
function startPhaseTimer(seconds, onExpire) {
  clearPhaseTimer();
  timeLeft = seconds;
  currentPhaseOnExpire = onExpire;
  phaseTimerId = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) { clearPhaseTimer(); onExpire(); }
    // ทุกวินาที client ต้องการแค่ตัวเลขนับถอยหลัง — ส่ง "tick" (ไม่กี่ไบต์) แทน state ตัวเต็ม
    //  (state ตัวเต็มมีคำอธิบายสกิลของผู้เล่นทุกคน ~10 KB/คน = bandwidth มหาศาลถ้ายิงทุกวินาที)
    //  ยังคง broadcast ตัวเต็มทุก ๆ RESYNC_EVERY วิ เป็นตาข่ายกันเหนียว เผื่อมีจุดไหนแก้ state
    //  แล้วลืมเรียก broadcastState() เอง (เดิมตัวจับเวลากลบให้ภายใน 1 วิ)
    else if (timeLeft % RESYNC_EVERY === 0) broadcastState();
    else io.emit("tick", timeLeft);
  }, 1000);
}
function teamModeActive() {
  return gameMode === "duo" || gameMode === "trio";
}

// ============================================================
//  QTE (Quick Time Event) — ระบบกลาง ใช้ร่วมกันได้ทุกตัวละคร
//  ออกแบบให้ "ไม่มี timer ฝั่ง server เลย" โดยตั้งใจ:
//    · startPhaseTimer มีตัวเดียวทั้งเกมและถูกล้างทุกครั้งที่เปลี่ยนเฟส จะเอามาใช้ซ้อนไม่ได้
//    · setTimeout ต่อ QTE = มีโอกาสค้างเมื่อผู้เล่นหลุด/จบเทิร์น/กลับล็อบบี้
//  จึงเก็บแค่ "เส้นตาย" (deadline เป็น ms) แล้วตัดสินตอนคำตอบมาถึงแทน — เวลายังเป็นของ server เต็มร้อย
//  (client วิ่งแถบนับถอยหลังเองเพื่อความลื่น แต่โกงไม่ได้: ลำดับปุ่มถูกสุ่มและตรวจที่ server)
//
//  p.qte = { keys, idx, deadline, perNoteMs, tag }
//    tag = ใครเป็นเจ้าของ QTE นี้ — ใช้เลือกว่าจะเรียก callback ของตัวละครไหนตอนจบ
//  ผลลัพธ์ส่งกลับผ่าน CHAR_HOOKS[<เจ้าของ>].onQteDone(engine, p, ok, qte)
// ============================================================
const QTE_KEYS = ["w", "a", "s", "d"];
function startQte(p, { count, perNoteMs = 2000, tag }) {
  const keys = Array.from({ length: count }, () => QTE_KEYS[Math.floor(Math.random() * QTE_KEYS.length)]);
  p.qte = { keys, idx: 0, perNoteMs, deadline: Date.now() + perNoteMs, tag };
  return p.qte;
}
function clearQte(p) { if (p) p.qte = null; }
// มี QTE ค้างอยู่ไหม — checkAllLocked() ใช้กันไม่ให้สรุปรอบก่อนเจ้าตัวจะเล่นจบ
function qtePending() {
  return alivePlayers().some((p) => p.qte);
}
// จบ QTE แล้วส่งผลให้เจ้าของ (ok = ผ่านครบทุกตัว)
//  เจ้าของ QTE มักคิววีดีโอ "สำเร็จ/ล้มเหลว" ไว้ใน onQteDone — ต้องสั่งเล่นทันทีตรงนี้
//  ไม่งั้นคลิปจะค้างอยู่ในคิวไปโผล่ตอนจบรอบ (คนละจังหวะกับที่ผู้เล่นเพิ่งกดจบ)
//  pausePlayingForCutscene() พักเฟสจั่วไพ่แล้วคืนเวลาที่เหลือให้เมื่อคลิปจบ — แพทเทิร์นเดียวกับ useSkill()
function finishQte(p, ok) {
  const qte = p.qte;
  if (!qte) return;
  p.qte = null;
  const hook = CHAR_HOOKS[qte.tag];
  if (hook && hook.onQteDone) withEffectSource(p, () => hook.onQteDone(engine, p, ok, qte));
  if (gameState === "PLAYING" && cutsceneQueue.length) pausePlayingForCutscene();
}
// ผู้เล่นกดปุ่ม — ตรวจทั้ง "ตัวถูกไหม" และ "มาทันไหม" ที่ server
function qteKey(id, key) {
  const p = players[id];
  if (!p || !p.alive || !p.qte) return;
  const qte = p.qte;
  const late = Date.now() > qte.deadline;
  const wrong = String(key || "").toLowerCase() !== qte.keys[qte.idx];
  if (late || wrong) {
    lastLog.push(`🎸 ${p.name} ${late ? "กดไม่ทันจังหวะ" : "กดผิดตัว"} — QTE ล้มเหลว!`);
    finishQte(p, false);
    broadcastState();
    checkAllLocked();
    return;
  }
  qte.idx++;
  if (qte.idx >= qte.keys.length) { finishQte(p, true); }
  else qte.deadline = Date.now() + qte.perNoteMs; // ตัวถัดไปเริ่มนับใหม่
  broadcastState();
  checkAllLocked();
}
// client แจ้งว่านับถอยหลังหมดแล้ว — server ยังตรวจซ้ำเองว่าเลยเส้นตายจริง (กันแจ้งมั่ว)
function qteTimeout(id) {
  const p = players[id];
  if (!p || !p.qte || Date.now() <= p.qte.deadline) return;
  lastLog.push(`🎸 ${p.name} กดไม่ทันจังหวะ — QTE ล้มเหลว!`);
  finishQte(p, false);
  broadcastState();
  checkAllLocked();
}
// ตาข่ายสำรอง: หมดเฟสจั่วไพ่แล้วยังเล่นไม่จบ = ถือว่าพลาด (เหมือนข้อเสนออื่นที่ไม่ตอบ)
function sweepQte() {
  for (const p of alivePlayers()) if (p.qte) finishQte(p, false);
}
// เอจิ (patch 2.4 new): มีคนกดท่าไม้ตาย "ไม่ว่ายังก็ตาม" ค้างอยู่ไหม — ใช้บีบเวลาเฟสจั่วการ์ด
//  และกันไม่ให้ยูนะเกิดขึ้นเองแบบปกติระหว่างท่านี้ทำงาน
function eijiUltFieldActive() {
  return Object.values(players).some((p) => p.alive && CHAR_HOOKS.eiji.ultActive(p));
}
// เวลาของเฟสจั่วการ์ดในเทิร์นนี้ (ปกติ CARD_TIME · ระหว่าง Break Beat Bark! ของเอจิเหลือ 40 วิ)
function cardPhaseSeconds() {
  return eijiUltFieldActive() ? CHAR_HOOKS.eiji.ULT_CARD_TIME : CARD_TIME;
}
// เอจิ สกิลติดตัว 1: บีบเวลาที่เหลือของเฟสจั่วการ์ดลง n วินาที (เหลืออย่างน้อย 1 วิ) — คืนเวลาที่เหลือจริง
function reduceCardTimer(n) {
  if (gameState !== "PLAYING" || !(n > 0)) return timeLeft;
  timeLeft = Math.max(1, timeLeft - n);
  return timeLeft;
}
function sameTeam(a, b) {
  return !!(teamModeActive() && a && b && a.id !== b.id && a.teamId && b.teamId && a.teamId === b.teamId);
}
function friendlyEffectBlocked(target) {
  const source = effectSourceId && players[effectSourceId];
  return !!(source && target && sameTeam(source, target));
}
function withEffectSource(source, fn) {
  const prev = effectSourceId;
  effectSourceId = typeof source === "string" ? source : (source && source.id) || null;
  try { return fn(); }
  finally { effectSourceId = prev; }
}
// รีเฟรชเลือด/เกราะจากแฝดที่คุมอยู่ก่อนแตะค่าเหล่านั้น — ตั้งใจไม่แตะ p.statuses
//  (p.statuses คือแหล่งความจริงระหว่างเทิร์น การ syncIn เต็มรูปแบบตรงนี้จะล้างสถานะที่ engine
//   เขียนใส่ตรงๆ ทิ้ง เช่น nodraw/noskill/stagger ตอน dealRound, ไอเทมร้านค้า, freecast, dawn)
function hisakawaSyncIn(p) {
  if (p && p.characterId === "hisakawa_sister") CHAR_HOOKS.hisakawa_sister.syncVitals(p);
}
function hisakawaSyncOut(p) {
  if (p && p.characterId === "hisakawa_sister") CHAR_HOOKS.hisakawa_sister.syncOut(p);
}
function applyBuff(p, key, amount, turns) {
  hisakawaSyncIn(p);
  rawApplyBuff(p, key, amount, turns);
  hisakawaSyncOut(p);
}
function applyDebuff(p, key, amount, turns) {
  if (friendlyEffectBlocked(p)) return false;
  hisakawaSyncIn(p);
  const ok = rawApplyDebuff(p, key, amount, turns);
  hisakawaSyncOut(p);
  return ok;
}
// ภาระเวท (spellburden) — จุดเดียวที่ทุกตัวละคร/ทุกเอฟเฟกต์ต้องใช้ใส่สถานะนี้
//  กฎกลางอยู่ที่ _universal_status.js: สะสม +1 ถึง SPELLBURDEN_MAX · ใช้ซ้ำใส่คนเดิมไม่ต่ออายุ
//  ต่างจาก applyDebuff() ตรงที่กันเฉพาะ "เพื่อนร่วมทีมคนอื่น" ไม่กันการใส่ตัวเอง — เพราะมีสกิลที่
//  จงใจแลกภาระเวทของตัวเองเป็นพลัง (Dance Lession กลางคืนของโคโตเนะ) ต้องทำงานได้ในโหมดทีมด้วย
function applySpellburden(p, turns) {
  const source = effectSourceId && players[effectSourceId];
  if (source && p && source.id !== p.id && sameTeam(source, p)) return false;
  hisakawaSyncIn(p);
  const ok = rawApplySpellburden(p, turns);
  hisakawaSyncOut(p);
  return ok;
}
function pregameStateActive() {
  return gameState === "LOBBY" || gameState === "TEAM_MODE" || gameState === "TEAM_SETUP";
}
function resetTeamAssignments(resetMode = false) {
  for (const p of Object.values(players)) {
    p.teamId = null;
    p.teamConfirmed = false;
  }
  if (resetMode) {
    gameMode = "ffa";
    teamSize = 1;
    teamCount = 0;
    winningTeamId = null;
  }
}
function resetModeVotes() {
  modeVotes = {};
  for (const p of Object.values(players)) p.modeVote = null;
}
function resetPregameFlowToLobby() {
  gameState = "LOBBY";
  resetTeamAssignments(true);
  resetModeVotes();
  for (const p of Object.values(players)) p.ready = false;
}
function validGameMode(mode, count = Object.keys(players).length) {
  if (mode === "ffa") return count >= 2;
  if (mode === "overload") return count >= 2;
  if (mode === "duo") return count >= 4 && count % 2 === 0;
  if (mode === "trio") return count === 6;
  return false;
}
function modeOptionsFor(count = Object.keys(players).length) {
  return [
    { mode: "ffa", label: "Free For All", size: 1, enabled: validGameMode("ffa", count) },
    { mode: "overload", label: "Over Load", size: 1, enabled: validGameMode("overload", count) },
    { mode: "duo", label: "Duo", size: 2, enabled: validGameMode("duo", count) },
    { mode: "trio", label: "Trio", size: 3, enabled: validGameMode("trio", count) },
  ];
}
function currentTeamOptions() {
  return TEAM_IDS.slice(0, teamCount).map((id) => ({ id, label: `Team ${id}`, size: teamSize }));
}
function modeVoteSummary() {
  const list = Object.values(players);
  return modeOptionsFor(list.length).map((opt) => {
    const voters = list.filter((p) => modeVotes[p.id] === opt.mode).map((p) => p.id);
    return { ...opt, voters, voteCount: voters.length };
  });
}
function voteGameMode(playerId, mode) {
  if (gameState !== "TEAM_MODE") return;
  const p = players[playerId];
  if (!p || !validGameMode(mode)) return;
  modeVotes[playerId] = mode;
  p.modeVote = mode;
  const list = Object.values(players);
  const votes = list.map((o) => modeVotes[o.id]).filter(Boolean);
  if (votes.length === list.length) {
    const counts = votes.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {});
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (ranked[0] && (!ranked[1] || ranked[0][1] > ranked[1][1])) {
      startTeamSetup(ranked[0][0]);
      return;
    }
  }
  broadcastState();
}
function enterModeSelect() {
  if (gameState !== "LOBBY") return;
  const list = Object.values(players);
  if (list.length < 2 || !list.every((p) => p.ready)) return;
  resetTeamAssignments(false);
  resetModeVotes();
  gameMode = "pending";
  teamSize = 1;
  teamCount = 0;
  winningTeamId = null;
  gameState = "TEAM_MODE";
  broadcastState();
}
function startTeamSetup(mode) {
  const count = Object.keys(players).length;
  if (!validGameMode(mode, count)) return;
  resetModeVotes();
  if (mode === "ffa" || mode === "overload") {
    gameMode = mode;
    teamSize = 1;
    teamCount = 0;
    resetTeamAssignments(false);
    startMatch();
    return;
  }
  gameMode = mode;
  teamSize = mode === "duo" ? 2 : 3;
  teamCount = Math.floor(count / teamSize);
  resetTeamAssignments(false);
  gameState = "TEAM_SETUP";
  broadcastState();
}
function chooseTeam(playerId, teamId) {
  if (gameState !== "TEAM_SETUP") return;
  const p = players[playerId];
  if (!p || p.teamConfirmed) return;
  const id = String(teamId || "").toUpperCase();
  if (!currentTeamOptions().some((t) => t.id === id)) return;
  const members = Object.values(players).filter((o) => o.teamId === id);
  if (members.length >= teamSize && p.teamId !== id) return;
  p.teamId = id;
  p.teamConfirmed = false;
  broadcastState();
}
function confirmTeam(playerId, confirmed) {
  if (gameState !== "TEAM_SETUP") return;
  const p = players[playerId];
  if (!p || !p.teamId) return;
  p.teamConfirmed = !!confirmed;
  broadcastState();
  maybeStartTeamMatch();
}
function maybeStartTeamMatch() {
  if (gameState !== "TEAM_SETUP" || !teamModeActive()) return;
  const list = Object.values(players);
  if (!validGameMode(gameMode, list.length)) return;
  const fullTeams = currentTeamOptions().every((t) => list.filter((p) => p.teamId === t.id).length === teamSize);
  if (fullTeams && list.every((p) => p.teamId && p.teamConfirmed)) startMatch();
}
function aliveTeamIds(list = alivePlayers()) {
  return [...new Set(list.map((p) => p.teamId).filter(Boolean))];
}
function remainingTeamWinInfo(stillAlive = alivePlayers(), total = Object.keys(players).length) {
  if (!teamModeActive() || total < 2) return { over: false, teamId: null };
  if (yuukiBoss()) return aliveHumans().length ? { over: false, teamId: null } : { over: true, teamId: null };
  const aliveTeams = aliveTeamIds(stillAlive);
  return aliveTeams.length <= 1 ? { over: true, teamId: aliveTeams[0] || null } : { over: false, teamId: null };
}


// ============================================================
//  การ์ด — กองกลางร่วม 43 ใบ (เลข 1-10 x 4 สี = 40 + King/Queen/Joker อย่างละ 1)
// ============================================================
const CARD_COLORS = ["red", "blue", "green", "yellow"];
// รายชื่อการ์ดทั้ง 43 ใบแบบไม่สับ (ลำดับคงที่) — ใช้เป็นแม่แบบแสดงสมุดการ์ด (deckLedger) และเทียบว่าใบไหนถูกจั่วไปแล้ว
function canonicalDeckCards() {
  const deck = [];
  for (let v = 1; v <= 10; v++) for (const color of CARD_COLORS) deck.push({ value: v, color });
  deck.push({ special: "king" }, { special: "queen" }, { special: "joker" });
  return deck;
}
function cardKey(c) { return c.special || `${c.value}-${c.color}`; }
function buildCentralDeck() {
  const deck = canonicalDeckCards();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
// สุ่มดึง 1 ใบออกจาก centralDeck จริง โดยเลือกจาก index ที่ผ่าน predicate เท่านั้น (คืน null ถ้าไม่มีใบให้จั่ว)
function drawFromCentralDeck(predicate) {
  const idxPool = [];
  for (let i = 0; i < centralDeck.length; i++) if (!predicate || predicate(centralDeck[i])) idxPool.push(i);
  if (!idxPool.length) return null;
  const idx = idxPool[Math.floor(Math.random() * idxPool.length)];
  return centralDeck.splice(idx, 1)[0];
}
function drawCardFor(p) {
  if (!p || !p.alive) return null;
  // ข้าขอบัญชา (หญิง คิชินามิ ฮาคุโนะ patch 2.2.1): จั่วเพิ่มระหว่างนี้ได้แค่ 2 หรือ 3 แต้มเท่านั้น (ถ้ายังเหลือในกองกลาง)
  if (p.hakunoLowDraw) {
    const c = drawFromCentralDeck((card) => !card.special && HAKUNO_DRAW_LOW_VALUES.includes(card.value));
    if (c) return c;
  }
  return drawFromCentralDeck(null);
}
// แจกเริ่มรอบ: จั่วจากกองกลางเหมือนกัน แต่ห้ามได้การ์ดพิเศษ (King/Queen/Joker)
function drawInitialCard(p) {
  return drawFromCentralDeck((card) => !card.special);
}
// สกิล "บังคับแต้มพุ่งขึ้น" (ฮาคุโนะ/ทาคุโตะ/มิยาโกะ/ฟีนิกซ์ ฯลฯ): ต้องจั่วการ์ดจริงจากกองกลางไปเรื่อยๆ
//  จนกว่าแต้มจะถึงเป้าหมาย ไม่ใช่บวก cardBonus ลอยๆ — ไม่การันตีว่าจะหยุดที่เป้าเป๊ะเพราะการ์ด 1 ใบมีค่าแค่ 1-10
//  จั่วเกินจนแตกได้จริงถ้าดวงไม่ดี และหยุดเองถ้ากองกลางหมดพอดี
function drawToScore(p, target) {
  while (calculateScore(p.cards) < target) {
    const c = drawCardFor(p);
    if (!c) break;
    p.cards.push(c);
    onCardDrawn(p, c);
  }
  p.busted = bustedOf(p);
}
function calculateScore(cards) {
  let base = 0, hasJoker = false;
  for (const c of cards) {
    if (c.special === "joker") { hasJoker = true; continue; }
    if (c.special) continue; // King/Queen ไม่เพิ่มแต้ม
    base += c.value;
  }
  if (hasJoker) base += overloadForceActive ? 12 : Math.min(12, Math.max(0, 21 - base)); // Overload: Joker +12 ตายตัว
  return base;
}
const YELLOW_CARD_SKILL_BONUS = 2; // ไพ่เหลืองครบ 3 ใบ 1 ชุด = แต้มสกิล +2 (เดิม +1)
// สีการ์ดครบ 3 ใบ: บลูทำงานทันที (ต้านสถานะผิดปกติ), แดง/เขียว/เหลืองทำงานตอนเปิดไพ่ (ดู applyLockColorTriggers)
function checkBlueTrigger(p) {
  const blueCount = p.cards.filter((c) => c.color === "blue").length;
  const shouldHave = Math.floor(blueCount / 3);
  while (p.colorTrigger.blue < shouldHave) {
    p.colorTrigger.blue++;
    applyBuff(p, "resist", 1, 1);
    lastLog.push(`🔵 ${p.name} ครบไพ่ฟ้า 3 ใบ — ได้รับต้านสถานะผิดปกติทันที!`);
  }
}
// การ์ดพิเศษ: ทำงานทันทีตอนจั่วได้ (King/Queen) — Joker ทำงานตอนคิดคะแนนใน calculateScore
function applySpecialCardEffect(p, card) {
  if (!card || !card.special) return;
  if (card.special === "king") {
    const g = addGold(p, 10);
    lastLog.push(`👑 ${p.name} จั่วได้การ์ดราชา — ได้เหรียญ +${g}!`);
  } else if (card.special === "queen") {
    p.statuses.freecast = 1; // ใช้สกิลครั้งถัดไปไม่เสียแต้ม — หายเมื่อจบเทิร์นถ้าไม่ได้ใช้
    lastLog.push(`👸 ${p.name} จั่วได้การ์ดราชินี — ใช้สกิลได้ฟรี 1 ครั้งในเทิร์นนี้!`);
  }
}
// เรียกทุกครั้งที่มีการ์ดถูกเพิ่มเข้ามือ (แจกเริ่มรอบ / hit / บังคับจั่ว) เพื่อเช็คทริกเกอร์ที่ทำงานทันที
function onCardDrawn(p, card) {
  // อาจารย์ ไบเลธ (characters/byleth.js): ผล "ศึกษาเพิ่ม"/"พักผ่อน" ที่รอไพ่ใบถัดไปอยู่ — ทำงานก่อนทริกเกอร์อื่น
  if (p.characterId === "byleth") CHAR_HOOKS.byleth.onCardDraw(engine, p, card);
  checkBlueTrigger(p);
  applySpecialCardEffect(p, card);
  applyOverloadOverdrawPenalty(p);
  // หลักสูตร "จบการศึกษา" ของไบเลธ: นับการ์ดทุกใบของผู้เล่นทุกคนจากจุดรวมนี้
  // (รวมไพ่จากสภาพชา/สกิล/เอฟเฟกต์บังคับจั่ว ไม่ใช่แค่การกด hit ใบแรก)
  CHAR_HOOKS.byleth.onAnyCardDraw(engine, p);
  if (!isYuuki(p) && yuukiBoss() && gameState === "PLAYING") yuukiReactiveDrawCredits++;
}
// แดง/เขียว/เหลือง ครบ 3 ใบ: ประเมินครั้งเดียวตอนเปิดไพ่ (lock) จากมือสุดท้ายทั้งหมด
function applyLockColorTriggers(p) {
  for (const color of ["red", "green", "yellow"]) {
    const n = Math.floor(p.cards.filter((c) => c.color === color).length / 3);
    if (n <= 0) continue;
    if (color === "red") {
      p.statusAmt.cardAtkBonus = (p.statusAmt.cardAtkBonus || 0) + n;
      lastLog.push(`🔴 ${p.name} ครบไพ่แดง 3 ใบ — พลังโจมตีรอบนี้ +${n}`);
    } else if (color === "green") {
      for (let i = 0; i < n; i++) {
        const h = healHp(p, 1);
        if (h > 0) lastLog.push(`🟢 ${p.name} ครบไพ่เขียว 3 ใบ — ฟื้นพลังชีวิต +${h}`);
      }
    } else if (color === "yellow") {
      const gain = n * YELLOW_CARD_SKILL_BONUS;
      addSkill(p, gain, "card"); // การ์ดรังสรร (ไพ่เหลืองครบชุด) — นับเป็นการฟื้นพลังงานสำหรับ [ดูดซับเวท]
      lastLog.push(`🟡 ${p.name} ครบไพ่เหลือง 3 ใบ — แต้มสกิล +${gain}`);
    }
  }
}
// โชคลาภ (patch 2.2 new): เลือกลำดับแต้มเป้าหมาย (19/20/21) ที่จะพยายามปรับไพ่ที่จั่วให้ไปถึง โดยอิงจากแต้มรวมปัจจุบัน
//  คืนเป็นลิสต์เรียงลำดับ (ตัวที่สุ่มได้ก่อน แล้วค่อยลองตัวที่เหลือ) — ถ้าตัวแรกไม่มีไพ่ให้จั่วพอดี จะลองตัวถัดไปก่อนค่อยยอมแตก
function fortuneTargetList(currentScore) {
  if (currentScore === 20) return [21]; // ใกล้สุดแล้ว มีบัฟ = ไป 21 แน่นอน
  if (currentScore === 19) return Math.random() < 0.5 ? [21, 20] : [20, 21]; // ถึง 19 อยู่แล้ว สุ่ม 50/50 ว่าจะลองอันไหนก่อน
  const roll = Math.random();
  const primary = roll < 0.4 ? 19 : roll < 0.7 ? 20 : 21; // ปกติ: 19 = 40% / 20 = 30% / 21 = 30%
  return [primary, ...[19, 20, 21].filter((v) => v !== primary)];
}
// เพดานแต้มขณะ UPG! (ฮิคารุ, characters/hikaru.js) — wrapper รอบ CHAR_HOOKS.hikaru.upgCap
function scoreCap(p) {
  if (overloadForceActive) return Infinity;
  // แต้มสูงสุดที่รับได้ก่อนล็อกไพ่อัตโนมัติ (UPG! = เพดานของมัน, เสือนอนกิน (fiber) = 19, ปกติ = 21)
  if (p.statuses && p.statuses.upg) return CHAR_HOOKS.hikaru.upgCap(p);
  if (p.statuses && p.statuses.fiber) return FIBER_CAP;
  return 21;
}
function scoreOf(p) {
  // แต้มมีพื้นล่างที่ 0 เสมอ — cardBonus ติดลบ (เช่น "พักผ่อน" ของไบเลธ) หักได้มากสุดจนเหลือ 0 ไม่ติดลบ
  const raw = Math.max(0, calculateScore(p.cards) + (p.cardBonus || 0));
  if (p.statuses && p.statuses.upg) return Math.min(raw, CHAR_HOOKS.hikaru.upgCap(p));
  if (p.statuses && p.statuses.fiber) return Math.min(raw, FIBER_CAP);
  return raw;
}
function bustedOf(p) {
  // คอนเนอร์ RK800 (characters/conner.js): ระหว่างการไล่ล่า ผู้เล่นที่ไม่เกี่ยวข้องถูกบังคับให้ "ไพ่แตก" ทันที
  //  (ดาเมจไพ่แตก/ดาเมจแพ้ถูกระงับทั้งหมดในเทิร์นไล่ล่าอยู่แล้ว — ดู CHAR_HOOKS.conner.chaseResolveRound)
  if (p && p.connorFrozen) return true;
  // มิซึซาว่า ฮารุกะ (characters/haruka.js): New Omega ระเบิดแต้มการ์ด — บังคับแตกทันทีต่อให้เปิดไพ่ไปแล้ว
  //  ต้องอยู่ก่อน overloadForceActive เพราะเป็นการ "สั่งให้แตก" ตรงๆ ไม่ใช่ผลการคิดแต้มที่สนามปลดเพดานได้
  if (CHAR_HOOKS.haruka.forcedBust(p)) return true;
  // มุยมิ: ดาบสะบั้นหอคอยสวรรค์ / หัวใจนักสู้ สั่งให้ไพ่แตกโดยตรง ต้านสถานะป้องกันไม่ได้
  if (CHAR_HOOKS.muimi.forcedBust(engine, p)) return true;
  if (overloadForceActive) return false;
  if (p.statuses && (p.statuses.upg || p.statuses.fiber)) return false;
  return calculateScore(p.cards) + (p.cardBonus || 0) > 21;
}


// ============================================================
//  ต่อสู้ + เอฟเฟกต์สกิล
// ============================================================
function alivePlayers() { return Object.values(players).filter((p) => p.alive); }
function isYuuki(p) { return !!p && p.id === YUUKI_ID; }
function yuukiBoss() { const p = players[YUUKI_ID]; return p && p.alive ? p : null; }
function aliveHumans() { return alivePlayers().filter((p) => !isYuuki(p)); }

function queueYuukiCutscene(video, title, seconds = 8, kind = "yuuki") {
  cutsceneQueue.push({
    seconds,
    info: { kind, playerId: YUUKI_ID, name: "ยูกิ Overload", img: YUUKI_IMG,
      color: POSITION_COLORS[7], video, title, label: null },
  });
}

function createYuukiBoss() {
  if (yuukiSpawned) return players[YUUKI_ID] || null;
  const ch = CHAR_BY_ID.yuuki;
  const p = {
    id: YUUKI_ID, socketId: null, connected: true, ready: true, isBoss: true,
    teamId: null, teamConfirmed: true, modeVote: null,
    name: "ยูกิ Overload", position: 8, characterId: "yuuki", avatar: ch.avatar, img: ch.img,
    cards: [], locked: true, busted: false, result: null,
  };
  const scale = yuukiStatsForPlayerCount(Object.values(players).filter((o) => !isYuuki(o)).length);
  p.yuukiPlayerCount = scale.players;
  p.yuukiBaseHp = scale.hp;
  p.yuukiBaseArmor = scale.armor;
  players[YUUKI_ID] = p;
  resetCombat(p);
  p.ready = true;
  p.connected = true;
  p.isBoss = true;
  p.skillPoints = 0;
  p.gold = 0;
  p.inventory = [];
  yuukiSpawned = true;
  yuukiTurns = 0;
  yuukiLowShown = false;
  yuukiWinShown = false;
  yuukiDefeated = false;
  yuukiReactiveDrawCredits = 0;
  return p;
}

function yuukiStatsForPlayerCount(count) {
  const playersCount = Math.max(1, Math.min(MAX_PLAYERS, Math.trunc(Number(count) || 1))); // patch 2.8: เพดานตามจำนวนผู้เล่นจริง (7 คน)
  return { players: playersCount, ...YUUKI_SCALE[playersCount] };
}

function yuukiCanSafelyDraw(p) {
  if (isYuuki(p)) return true;
  if (!overloadForceActive) return true;
  const nextExtraDraw = (p.overloadExtraDraws || 0) + 1;
  return nextExtraDraw % 5 !== 0 || p.hp > 1;
}

function resetOverloadDrawCounter(p, ready = false) {
  if (!p) return;
  p.overloadExtraDraws = 0;
  p.overloadDrawReady = !!ready;
}

function autoPlayYuuki(finalize = true, maxDraws = finalize ? 2 : 1) {
  const p = yuukiBoss();
  if (!p || !p.cards || p.locked) return 0;
  // ยูกิเห็นคะแนนจริงของผู้เล่นทุกคนตอนทุกคนล็อกแล้ว และพยายามแซงคะแนนสูงสุด 1 แต้ม
  // ระหว่าง Overload Force ไม่มีเพดาน/ไพ่แตก และยูกิไม่รับโทษ HP จากการจั่วเกิน
  const humanScores = aliveHumans().map(scoreOf);
  const bestHumanScore = humanScores.length ? Math.max(...humanScores) : 0;
  const targetScore = overloadForceActive
    ? Math.max(1, bestHumanScore + 1)
    : Math.min(21, Math.max(17, bestHumanScore + 1));
  let drawnCount = 0;
  const drawLimit = Math.max(0, Math.trunc(Number(maxDraws) || 0));
  while (drawnCount < drawLimit && p.alive && centralDeck.length && scoreOf(p) < targetScore && !bustedOf(p) && yuukiCanSafelyDraw(p)) {
    let card = null;
    if ((p.statuses.fortune || 0) > 0) {
      p.statuses.fortune--;
      if (p.statuses.fortune <= 0) delete p.statuses.fortune;
      const cur = calculateScore(p.cards);
      if (overloadForceActive) {
        const need = targetScore - cur;
        if (need >= 1 && need <= 10) card = drawFromCentralDeck((c) => !c.special && c.value === need);
      } else {
        for (const target of fortuneTargetList(cur)) {
          const need = target - cur;
          if (need < 1 || need > 10) continue;
          card = drawFromCentralDeck((c) => !c.special && c.value === need);
          if (card) break;
        }
      }
    }
    if (!card) card = drawCardFor(p);
    if (!card) break;
    p.cards.push(card);
    onCardDrawn(p, card);
    p.busted = bustedOf(p);
    drawnCount++;
  }
  if (finalize) {
    applyLockColorTriggers(p);
    p.locked = true;
  }
  return drawnCount;
}

function applyYuukiUltimate() {
  const boss = yuukiBoss();
  if (!boss) return;
  const damage = boss.hp <= 4 ? 6 : 4;
  const healed = healHp(boss, 3);
  const hits = [];
  withEffectSource(boss, () => {
    for (let i = 0; i < damage; i++) {
      const pool = aliveHumans();
      if (!pool.length) break;
      const target = pool[Math.floor(Math.random() * pool.length)];
      damageSoft(target);
      resolveDamageAftermath(target);
      target.wasAttacked = true;
      hits.push(target.name);
    }
  });
  lastLog.push(`🌠 ${boss.name} ใช้ Star of Fall — ฟื้นพลังชีวิต +${healed} และเปิดฝนดาบ ${damage} หน่วย (${hits.join(", ") || "ไม่มีเป้าหมาย"})`);
}

// Song for you (เทมาริ patch 2.0.6): บัฟพลังขิงที่ล็อกไว้ตอนใช้สกิล (2 ชาม = +1)
function songActive(p) {
  return !!p && ((p.statuses && p.statuses.song) || 0) > 0;
}
// ---------- เทมาริ (patch 2.0.6) ----------
const TEMARI_ANATA_DRAWS = 3;    // ANATA WAAAAAAAA: บังคับจั่วเพิ่ม 3 ใบ (เพิ่มจาก 2)
// สถานะผิดปกติที่ Song for you ล้างออกได้ทั้งหมด (patch 2.0.8: เพิ่มดีบัฟพื้นฐานใหม่
//  และแยก ยามฟ้าสาง/เส้นชีวิต ออกไปลดทีละ 1 แทน — ดูใน st === "song")
const DEBUFF_KEYS = ["discord", "sleep", "stun", "nodraw", "noskill",
  "energy", "nohealing", "moonmark", "unplug", "weak", "fragile", "spellburden",
  "oblada", "hburn", "phenexBanUlt", "nanayaSeal", "miyakoSeal", "invert", "manaSeal", "manaRupture", "manaLeech", "mageslayerMark"];
// เกราะสูงสุดของผู้เล่น: ปกติ 2 — ระหว่างสวมเกราะราชัน (ท่าไม้ตายคุวากาตะ) เพิ่ม +3 เป็น 5
// ระหว่างสกิลติดตัว 3 เอวา 13 (เลือด <= 3) เพิ่ม +1
// ระหว่าง Lie Like Vortigern (โอเบรอน) เป้าหมายได้เพดานเกราะ +1
// ระหว่างเป็นคู่สัญญาเจ้าแห่งเน็ตบ้าน (สนใจใช้บริการเราไหม) เพิ่ม +3
function maxArmorOf(p) {
  if (p && p.id === YUUKI_ID) {
    const base = p.yuukiBaseArmor != null ? p.yuukiBaseArmor : YUUKI_SCALE[1].armor;
    return base
      + ((((p.statuses && p.statuses.vortarmor) || 0) > 0) ? 1 : 0)
      + (oguriGoldStacks(p) >= OGURI_GOLD_ARMOR_AT ? 1 : 0)
      + ((((p.statuses && p.statuses.absorbplus) || 0) > 0) ? RIDDHE_ABSORB_ARMOR : 0)
      + ((((p.statuses && p.statuses.riddheguard) || 0) > 0 || ((p.statuses && p.statuses.riddheward) || 0) > 0) ? 2 : 0)
      + (CHAR_HOOKS.broadband_man.contractBuffActive(engine, p) ? CONTRACT_ARMOR_BONUS : 0);
  }
  // คิชินามิ ฮาคุโนะ (patch 2.2.1): เพดานเกราะคงที่ตามเพศ (แทน MAX_ARMOR ปกติ) — ชาย 2 / หญิง 3
  // เอวานเกเลี่ยน หมายเลข 13 (patch 2.2 alpha): ไม่มีเกราะเลยตามปกติ (เพดาน 0) — ได้เพดาน +1 เฉพาะช่วงสกิลติดตัว 3 ทำงาน (ด้านล่าง)
  // แบทแมน: ระหว่างอยู่บนรถแบทโมบิล เพดานเกราะ = พลังชีวิตของรถ (7)
  const batCarArmor = CHAR_HOOKS.bat_ben.maxArmor(p);
  if (batCarArmor != null) return batCarArmor;
  const escanorArmor = (p && p.characterId === "escanor" && CHAR_HOOKS.escanor.maxArmor) ? CHAR_HOOKS.escanor.maxArmor(p) : null;
  // Last Stand: "เกราะ 0" เป็นค่าตายตัวของร่าง — คืนก่อนบวกโบนัสใดๆ ไม่งั้นบัฟเพดานเกราะจากเพื่อนร่วมทีมทะลุได้
  if (escanorArmor === 0) return 0;
  const armorBase = (p && p.characterId === "hakuno")
    ? (p.hakunoGender === "female" ? HAKUNO_FEMALE_ARMOR_CAP : HAKUNO_MALE_ARMOR_CAP)
    : (p && p.characterId === "hisakawa_sister") ? CHAR_HOOKS.hisakawa_sister.maxArmor(p)
    : (escanorArmor != null) ? escanorArmor
    : (p && p.characterId === "eva13") ? 0
    : (p && p.characterId === "ippo") ? CHAR_HOOKS.ippo.maxArmor() // อิปโป (patch 3.3 new): "โล่ 4" = เพดานเกราะ 4
    : (p && p.characterId === "the_supplicant") ? CHAR_HOOKS.the_supplicant.maxArmor() // ผู้วิงวอน (patch 3.4 new): เพดานเกราะ 5
    : (p && p.characterId === "eiji") ? CHAR_HOOKS.eiji.maxArmor() // เอจิ (patch 2.4 new): เกราะพื้นฐาน 4 หน่วย
    : MAX_ARMOR;
  return armorBase
    + ((((p.statuses && p.statuses.vortarmor) || 0) > 0) ? 1 : 0)
    + (oguriGoldStacks(p) >= OGURI_GOLD_ARMOR_AT ? 1 : 0) // ยุคทอง (โอกูริ Rework): ครบ 2 แต้มขึ้นไป เพดานเกราะ +1
    + ((p.characterId === "hikaru" && ((p.statuses && p.statuses.monster) || 0) > 0) ? HIKARU_MONSTER_ARMOR_BONUS : 0) // MonsterLive (ฮิคารุ patch 2.1.3): เพดานเกราะ +2
    // ริดดี้ (patch 2.0.9): Absorb Shield +2 (1 เทิร์น) / ท่าไม้ตาย 2 +2 ทั้งริดดี้ (riddheguard) และบานาจ (riddheward)
    + ((((p.statuses && p.statuses.absorbplus) || 0) > 0) ? RIDDHE_ABSORB_ARMOR : 0)
    + ((((p.statuses && p.statuses.riddheguard) || 0) > 0 || ((p.statuses && p.statuses.riddheward) || 0) > 0) ? 2 : 0)
    + (CHAR_HOOKS.broadband_man.contractBuffActive(engine, p) ? CONTRACT_ARMOR_BONUS : 0)
    + (CHAR_HOOKS.eva13.isEva3Active(engine, p) ? 1 : 0)
    + (CHAR_HOOKS.escanor.armorBonus(p) || 0);
}
// เรจูอาคมบัญชา คำสั่ง 1 (ฟุจิมารุ): อมตะ 1 เทิร์น — ไม่รับความเสียหายใดๆ
function sealActive(p) {
  return !!p && ((p.statuses && p.statuses.seal) || 0) > 0;
}
// Beat Mode (universal dispatcher — เรียกกลับเข้า characters/<id>.js ของแต่ละตัวละครที่มีกลไกนี้)
//  ตอนนี้มี kuwagata (ประกายเขี้ยวปฏิปักษ์) และ takuto (ฉันยัง...มองเห็นอยู่!!!) — ดู characters/kuwagata.js, characters/takuto.js
function beatActive(p) {
  const mod = CHAR_HOOKS[p && p.characterId];
  return !!(mod && mod.isBeatActive && mod.isBeatActive(engine, p));
}
function maybeBeatMode(p) {
  const mod = CHAR_HOOKS[p && p.characterId];
  if (mod && mod.maybeEnterBeatMode) mod.maybeEnterBeatMode(engine, p);
}
// กันตายทันทีเมื่อความเสียหายถึงตาย (ครั้งเดียวต่อเกม — ค้างที่ 1 หน่วย)
function maybeBeatSave(p) {
  if (!p || !p.alive || passiveSealed(p)) return false;
  if (p.beatSaved || p.hp >= 1) return false;
  const mod = CHAR_HOOKS[p.characterId];
  return !!(mod && mod.tryDeathSave && mod.tryDeathSave(engine, p));
}
// ---------- ริต้า เบอร์นัล / ฟีนิกซ์ (patch 2.1.6) ----------
// สกิลติดตัว 1 ถ้าเลือกได้ อยากเกิดเป็นอะไรหรอ?: ตายครั้งแรกในเกม -> เกิดใหม่ด้วยพลังชีวิต/เกราะเต็ม (ครั้งเดียวต่อเกม)
//  เปิด NTD-System ถาวรฟรี (ไม่เสียเลือด) + พลังโจมตีพื้นฐานถาวร +1 — ท่าไม้ตายเปลี่ยนเป็นท่า 2 / สกิลรองเปลี่ยนเป็นสกิลรอง 2 ถาวร
// ริต้า เบอร์นัล (characters/phenex.js) — wrapper รอบ CHAR_HOOKS.phenex.resolveRelease
// ตายกลางเทิร์น (เลือดหมดจากสกิล/ผลสถานะ): ตกรอบทันที
// force = true: ข้ามระบบกันตาย/เกิดใหม่ทั้งหมด (ใช้โดยสกิลติดตัว "ความปรารถนา" ของยุย ที่ระบุว่า
//  "ตายทันทีไม่สนเงื่อนไขอื่นๆ") — ยังผ่านการเก็บกวาดท้ายฟังก์ชันตามปกติทุกอย่าง
function instantDeath(p, force) {
  if (friendlyEffectBlocked(p)) return;
  if (isYuuki(p)) {
    const currentSource = players[effectSourceId];
    const killer = (currentSource && !isYuuki(currentSource)) ? currentSource : players[p.lastDamageSourceId];
    p.hp = 0; p.alive = false; p.result = "dead"; p.locked = true;
    overloadForceActive = false;
    yuukiDefeated = true;
    yuukiReactiveDrawCredits = 0;
    yuukiAttackTargets = [];
    queueYuukiCutscene(YUUKI_VIDEO.end, "YUUKI · DEFEATED", 7, "yuukiEnd");
    if (killer && !isYuuki(killer)) {
      killer.inventory = killer.inventory || [];
      killer.inventory.push({ uid: `hero_sword_${Date.now()}`, type: "heroSword" });
      lastLog.push(`⚔️ ${killer.name} โค่นยูกิได้และได้รับ “ดาบผู้กล้า” เข้ากระเป๋า!`);
    } else {
      lastLog.push("💀 ยูกิถูกโค่นลง แต่ไม่มีผู้เล่นที่ถูกนับเป็นผู้สังหารคนสุดท้าย");
    }
    return;
  }
  if (!force && p.characterId === "escanor" && CHAR_HOOKS.escanor.tryNoonRevive(engine, p)) return;
  if (!force && p.characterId === "hisakawa_sister" && resolveHisakawaTwinDeath(p)) return;
  // Ultraman Trigger: ตายในร่างพิเศษถือว่าตายจริง ไม่คืนร่างแทน
  // ริต้า เบอร์นัล (สกิลติดตัว 1 patch 2.1.6, characters/phenex.js): ตายครั้งแรก -> เกิดใหม่แทนที่จะตกรอบ (ครั้งเดียวต่อเกม)
  if (!force && p.characterId === "phenex" && CHAR_HOOKS.phenex.tryRebirth(engine, p)) return;
  // อาจารย์ ไบเลธ (สกิลติดตัว 2 sothis, characters/byleth.js): ตายครั้งแรก -> ย้อนเวลากลับมาด้วยเลือด 1 เกราะ 0 (ครั้งเดียวต่อเกม)
  if (!force && p.characterId === "byleth" && CHAR_HOOKS.byleth.tryRevive(engine, p)) return;
  // มหาเทพ อรชุน (ตะเกียงไฟที่ดับมอด, characters/arjuna.js): ตายระหว่าง "ฟื้นคืนชีพ" ยังไม่หมดเวลา -> ฟื้นทันที (เลือด 1 เกราะ 0)
  if (!force && p.characterId === "arjuna" && CHAR_HOOKS.arjuna.tryRevive(engine, p)) return;
  // ริต้า เบอร์นัล (สกิลติดตัว 2 patch 2.1.7, characters/phenex.js): ตกรอบจริงขณะท่าไม้ตาย 2 ยังทำงานอยู่ -> ปลดปล่อยความเจ็บปวดที่สะสมทั้งหมดก่อนตาย
  if (p.characterId === "phenex") CHAR_HOOKS.phenex.maybeReleasePainOnDeath(engine, p);
  p.hp = 0; p.alive = false; p.result = "dead"; p.locked = true;
  // คอนเนอร์ RK800 (สกิลติดตัว 3 ปัญญาประดิษฐ์): จองคิวฟื้นคืนชีพอีก 10 เทิร์น (ไม่ใช่การกันตาย — ตกรอบจริงก่อน)
  CHAR_HOOKS.conner.onDeath(engine, p);
  // โมโรโบชิ ดัน (characters/dan.js): เป้าหมาย "จงหลบแต่อย่าหนี"/ศิษย์ตกรอบ (หรือดันเองตกรอบ) -> ปลดสถานะทั้งสองฝั่ง
  // อิสึกะ ชิโด (characters/shido.js): ตายระหว่างกับดักเปิดอยู่ -> จองคิวเกิดใหม่ + คิววีดีโอรอยต่อ
  // ยุย (characters/yui.js): ตกรอบขณะมีคิวชุบชีวิตค้าง — ถ้าไม่เหลือใครแล้ว ให้เป้าหมายฟื้นทันที
  //  (ต้องอยู่ก่อน shido.onDeath ที่อาจย้อนเวลา — ลำดับไหนก็ได้ แต่ต้องอยู่ในชุดเดียวกัน)
  clearQte(p); // ตกรอบแล้ว QTE ที่ค้างอยู่ต้องหายไปด้วย (ไม่งั้นค้างข้ามการชุบชีวิต/ย้อนเวลา)
  CHAR_HOOKS.yui.onDeath(engine, p);
  CHAR_HOOKS.shido.onDeath(engine, p);
  CHAR_HOOKS.dan.onDeath(engine, p);
  // ผู้วิงวอน (characters/the_supplicant.js): ผู้ถือตราพิพากษา/ผู้วิงวอนตกรอบ -> ล้างตราที่ค้างอยู่ทั้งสองฝั่ง
  CHAR_HOOKS.the_supplicant.onDeath(engine, p);
  // มหาเทพ อรชุน (สกิลติดตัว หัวใจที่เที่ยงธรรม): จำไว้ว่าใครเคยสังหารผู้เล่นอื่น — ธงถาวรทั้งเกม
  //  อ่านจาก effectSourceId (ต้นตอของเอฟเฟกต์ที่กำลังทำงาน) เพราะ instantDeath ไม่มีพารามิเตอร์ผู้สังหาร
  const arjunaKiller = players[effectSourceId];
  if (arjunaKiller && arjunaKiller.id !== p.id) arjunaKiller.hasKilled = true;
  CHAR_HOOKS.kai.pruneOverhaulSlots(engine); // ไค ชิซากิ: ผู้ถือรังสรรค์/ลงทัณฑ์ตกรอบ -> ลบออกจาก Overhaul tracker
  // ยูนะ: เป้าหมายที่ได้รับพร (Delete/Smile for You/Longing) ตาย/หมดสภาพ -> เพลง+บัฟยูนะปิดลงทันที
  //  ยกเว้น Break Beat Bark เพราะมีผลทั้งสนาม ไม่ผูกกับผู้เล่นคนใดคนหนึ่งโดยเฉพาะ
  if (yunaEffect && yunaEffect !== "beatbark" && yunaTargetId === p.id) {
    yunaEffect = null; yunaTargetId = null; yunaWindowEnd = 0;
    delete p.statuses.yunaDelete; delete p.statuses.yunaSmile; delete p.statuses.yunaLonging;
  }
  // ยูนะ (เพลง Longing): คนแรกที่ตายระหว่างเทิร์น 1-10 -> ทำเครื่องหมายไว้ก่อน (ครั้งเดียวต่อเกม)
  //  ยังไม่ฟื้นคืนชีพทันที — ต้องรอให้ฉากโจมตี(ถ้ามี)จบก่อน แล้วค่อยฟื้น+ขึ้นวีดีโอ (ดู endTurn() จุดที่ตั้งค่า yunaLongingPendingId)
  if (!yunaLongingUsed && roundNumber >= 1 && roundNumber <= 10) {
    yunaLongingUsed = true;
    yunaLongingPendingId = p.id;
  }
}

// ---------- เอวานเกเลี่ยน หมายเลข 13 (universal-dispatcher wrappers — ตรรกะจริงอยู่ characters/eva13.js) ----------
function maybeEva3(p) {
  if (!p || !p.alive || p.characterId !== "eva13") return;
  CHAR_HOOKS.eva13.maybeEnterEva3(engine, p);
}

// สรุปผลหลังดาเมจจากสกิลของโมดูลตัวละคร: เรียกกันตาย/เปลี่ยนร่าง/ปลุก และตกรอบทันทีเมื่อ HP หมด
function resolveDamageAftermath(p) {
  if (!p || !p.alive) return;
  maybeBeatSave(p);
  maybeBeatMode(p);
  maybeEva3(p);
  maybeWakeKotone(p);
  if (p.alive && p.hp <= 0) instantDeath(p);
}

// ฮีลพร้อมล้น: เลือดจริง -> เกราะ -> เลือดชั่วคราว (หายเองใน 2 เทิร์น / หมดเมื่อรับดาเมจ)
//  คืนรายละเอียดว่าฮีลครั้งนี้ลงช่องไหนเท่าไหร่ (ใช้แจ้งผลใน log ให้ชัด)
function healOverflow(p, amount) {
  let left = amount;
  const toHp = healHp(p, left); // "ไม่ใช้งานต่อ" = ฟื้นเลือดจริงไม่ได้ (ล้นไปเกราะ/เลือดชั่วคราวได้ตามปกติ)
  left -= toHp;
  let toArmor = 0;
  if (left > 0) {
    toArmor = Math.min(left, Math.max(0, maxArmorOf(p) - p.armor));
    p.armor += toArmor; left -= toArmor;
  }
  if (left > 0) {
    p.tempHp = (p.tempHp || 0) + left;
    p.tempHpTurns = TEMP_HP_TURNS;
  }
  return { toHp, toArmor, toTemp: left };
}

function releaseReservation(socketId) {
  delete reservations[socketId];
  const timer = reservationTimers.get(socketId);
  if (timer) clearTimeout(timer);
  reservationTimers.delete(socketId);
}
function reservePosition(socketId, position) {
  releaseReservation(socketId);
  reservations[socketId] = position;
  reservationTimers.set(socketId, setTimeout(() => {
    releaseReservation(socketId);
    broadcastPositions();
  }, RESERVATION_TTL_MS));
}
function joinedPositions() { return Object.values(players).map((p) => p.position); }
function positionsFor(sid) {
  const joined = joinedPositions();
  const reserved = Object.entries(reservations).filter(([id]) => id !== sid).map(([, p]) => p);
  return [...new Set([...joined, ...reserved])];
}
function positionUsedByOther(pos, sid) {
  return joinedPositions().includes(pos) ||
    Object.entries(reservations).some(([id, p]) => id !== sid && p === pos);
}

// รูปที่แสดง: Beat Mode (ถาวรจนตาย) > ร่างสุดท้ายฟุจิมารุ (จนตาย) > Paradise (เหนือกว่าสกิลติดตัว NT-D)
//  > NT-D คงอยู่จนแก้แค้น > ไคจู Black King > Ginga > สวมเกราะราชัน
function displayImg(p) {
  if (p.characterId === "escanor" && CHAR_HOOKS.escanor.displayImg) return CHAR_HOOKS.escanor.displayImg(p);
  if (p.characterId === "ultraman_trigger") return "/characters/ultraman_trigger/trigger.webp";
  if (p.characterId === "hisakawa_sister") return CHAR_HOOKS.hisakawa_sister.displayImg(p);
  if (p.characterId === "ignis" && CHAR_HOOKS.ignis.displayImg) return CHAR_HOOKS.ignis.displayImg(p);
  // ฟุจิตะ โคโตเนะ: ระหว่างร่าง [พร้อมลุย] = ภาพ Kotone.png (null = ใช้ภาพปกติ)
  if (p.characterId === "kotone") { const kimg = CHAR_HOOKS.kotone.displayImg(p); if (kimg) return kimg; }
  // เอจิ: ระหว่างท่าไม้ตาย ไม่ว่ายังก็ตาม ทำงาน = ภาพ eiji_change.jpg (null = ใช้ภาพปกติ)
  if (p.characterId === "eiji") { const eimg = CHAR_HOOKS.eiji.displayImg(p); if (eimg) return eimg; }
  // ฮารุกะ: ระหว่างสถานะ "โอเมก้า" จากท่าไม้ตาย New Omega = ภาพ new_omega.jpg (null = ใช้ภาพปกติ)
  if (p.characterId === "haruka") { const himg = CHAR_HOOKS.haruka.displayImg(p); if (himg) return himg; }
  // มุยมิ: ระหว่างสถานะ “ดาบสะบั้น” ใช้ภาพท่าไม้ตาย
  if (p.characterId === "muimi") { const mimg = CHAR_HOOKS.muimi.displayImg(p); if (mimg) return mimg; }
  // แบทแมน: ระหว่างอยู่บนรถแบทโมบิล = ภาพรถ (null = ใช้ภาพปกติ)
  if (p.characterId === "bat_ben") { const bimg = CHAR_HOOKS.bat_ben.displayImg(p); if (bimg) return bimg; }
  // โอเบรอน: ร่างสลับตามช่วงเวลากลางวัน/กลางคืนเสมอ
  if (p.characterId === "oberon") return isNightRound(roundNumber) ? OBERON_NIGHT_IMG : OBERON_MORNING_IMG;
  // ชเรด เอลัน: รวมร่างทำนองเพลงแล้ว = ร่างอควาเรียน สปาด้า ถาวร
  if (p.characterId === "shrade_elan" && p.shradeForm) return SHRADE_SPADA_IMG;
  // เรียวกิ ชิกิ: ระหว่างท่าไม้ตาย ฉันมองเห็นมันแล้ว / ความตายที่โรยรา = ภาพสถานะท่าไม้ตาย
  if (p.characterId === "shiki" && (p.statuses.wither || 0) > 0) return SHIKI_WITHER_IMG;
  if (p.characterId === "shiki" && (p.statuses.deatheye || 0) > 0) return SHIKI_DEATH_IMG;
  // โทโนะ ชิกิ: มีดพับประจำตระกูล ระดับ 2 ขึ้นไป (เปิดใช้งานสกิลติดตัว) = ภาพ tohno_death
  if (p.characterId === "tohno" && (p.tohnoLevel || 1) >= 2) return TOHNO_DEATH_IMG;
  // คิชินามิ ฮาคุโนะ: ล็อบบี้ = hakuno.webp — ลงสนามเปลี่ยนภาพตามเพศปัจจุบัน
  if (p.characterId === "hakuno") {
    if (gameState === "LOBBY") return p.img;
    return p.hakunoGender === "female" ? "/characters/hakuno/profile/hakuno_female.webp" : "/characters/hakuno/profile/hakuno_male.png";
  }
  // โอกูริ แคป: ระหว่างร่าง Zone (GrayBeast) = ภาพ zone_form
  if (p.characterId === "oguri" && (p.statuses.graybeast || 0) > 0) return OGURI_ZONE_IMG;
  // ผู้สังหารเมจ: เคยใช้ Witch Mark ไปแล้ว (ถาวร) = MS02.png แทน MS01.png ปกติ
  if (p.characterId === "mageslayer") return p.mageslayerHasMarked ? "/characters/mageslayer/MS02.png" : "/characters/mageslayer/MS01.png";
  // ทาคุมิ ฟุจิวาระ: ภาพเปลี่ยนตามเกียร์ธรรมดา — เกียร์ 1-2: takumi1.webp / เกียร์ 3-5: takumi3.jpg / เกียร์ 6: takumi6.jpg
  if (p.characterId === "takumi") {
    const gear = p.takumiGear || 1;
    if (gear >= 6) return "/characters/takumi/takumi6.jpg";
    if (gear >= 3) return "/characters/takumi/takumi3.jpg";
    return "/characters/takumi/takumi1.webp";
  }
  // ริดดี้ มาร์เซนาส: ล็อบบี้ = riddhe.jpg — ลงสนามเป็นบันชี / NT-D (ท่าไม้ตาย 1) / ร่างดำมืด (ท่าไม้ตาย 2 หรือถาวรหลังสกิลติดตัว 3)
  if (p.characterId === "riddhe") {
    if (gameState === "LOBBY") return p.img;
    if ((p.statuses.riddheguard || 0) > 0 || p.riddheAvenger) return RIDDHE_NTD2_IMG;
    if ((p.statuses.riddhentd || 0) > 0) return RIDDHE_NTD_IMG;
    return RIDDHE_BANSHEE_IMG;
  }
  // ริต้า เบอร์นัล: ล็อบบี้ = rita.png — ลงสนามเป็น phenex.png ปกติ / phenex_ntd.png ระหว่างฝืนใช้งาน NTD-Sytem (ชั่วคราวหรือถาวร)
  if (p.characterId === "phenex") {
    if (gameState === "LOBBY") return p.img;
    if ((p.statuses.phenexNtd || 0) > 0 || p.phenexNtdPermanent) return PHENEX_NTD_IMG;
    return PHENEX_BASE_IMG;
  }
  if (p.seen && p.seen.beat) return OHGER_FORM;
  // สึงาชิ ทาคุโตะ (patch 2.2.5): สกิลติดตัว 1 กันตายทำงานไปแล้วสักครั้ง — ระหว่างที่ยังอยู่ในร่างฉันคว้ามันได้แล้ว ใช้ภาพ tauburn_un.jpg แทน tauburn.jpg ปกติ
  if (p.characterId === "takuto" && p.beatSaved && (p.statuses.apprivoise || 0) > 0) return TRANSFORMS.takutoAwaken.img;
  // เอวา 13: Fourth Impact (ท่าไม้ตาย) > สกิลติดตัว 3 (เลือด <= 3)
  if (p.seen && p.seen.fourth && (p.statuses.fourth || 0) > 0) return TRANSFORMS.fourth.img;
  if (p.seen && p.seen.eva3 && CHAR_HOOKS.eva13.isEva3Active(engine, p)) return TRANSFORMS.eva3.img;
  // NewType Paradise อยู่เหนือกว่าสกิลติดตัว NT-D — ระหว่างร่าง Paradise คงภาพ Paradise ไว้
  if (p.seen && p.seen.paradise && (p.statuses.paradise || 0) > 0) return TRANSFORMS.paradise.img;
  // บานาจ (patch 2.1.2): NT-D System (สกิลติดตัว 1) หรือฉันไม่อยากให้เราต้องมาสู้กัน (สกิลติดตัว 2) ทำงานอยู่ — ภาพร่าง NT-D
  if ((p.ntdTarget || p.ntdRivalId) && p.seen && (p.seen.ntd || p.seen.banagherPassive2)) return TRANSFORMS.ntd.img;
  // ไรโด ฮิคารุ (patch 2.1.3): Ginga Strium อยู่เหนือกว่า Ginga (สกิลรอง 1)
  if (p.characterId === "hikaru" && p.seen && p.seen.gingastrium && (p.statuses.gingastrium || 0) > 0) return HIKARU_STRIUM_IMG;
  // ไรโด ฮิคารุ (patch 2.1.6): แก้บั๊ก — MonsterLive (ไคจู Black King) เคยเปลี่ยนภาพได้ก่อน patch 2.1.3 แล้วหายไป คืนให้กลับมาเปลี่ยนภาพอีกครั้ง
  //  ลำดับความสำคัญ: Ginga Strium > ไคจู Black King > Ginga (ตามที่ระบุไว้ในคอมเมนต์ด้านบนฟังก์ชันนี้)
  if (p.characterId === "hikaru" && (p.statuses.monster || 0) > 0) return TRANSFORMS.monster.img;
  for (const key of ["ginga", "rachan", "golden", "apprivoise"]) {
    if (p.seen && p.seen[key] && (p.statuses[key] || 0) > 0) return TRANSFORMS[key].img;
  }
  // บานาจ ลิงก์ (patch 2.1.2): หน้าเลือกตัวละคร/ล็อบบี้ใช้ p.img เดิม — ลงสนามแล้วเปลี่ยนเป็น unicorn_new.png
  if (p.characterId === "banagher" && gameState !== "LOBBY") return BANAGHER_BASE_IMG;
  return p.img;
}
// เพลงสกิล: Ultraman Trigger ทับทุกเพลงระหว่างอยู่ในร่าง > Beat Mode > คนที่เปิดร่างล่าสุด
//  คืน { music, at } — at = ลำดับการเปิดร่าง ให้ client รู้ว่าเป็น "การเปิดครั้งใหม่"
//  (เปิดท่าซ้ำ / คนอื่นเปิดท่าเพลงเดียวกันทับ) -> เพลงต้องเริ่มใหม่จากต้น
function activeSkillMusic() {
  // คอนเนอร์ RK800 (characters/conner.js): เพลงไล่ล่า conner_theme ทับทุกเพลงตลอดช่วงจับกุมขั้นเด็ดขาด
  //  (เกตเดียวกับผลจริงของโหมดไล่ล่า — จบการไล่ล่าเมื่อไหร่เพลงกลับสู่ปกติทันที)
  const bestConner = CHAR_HOOKS.conner.activeMusic(engine);
  if (bestConner) return bestConner;
  // Ultraman Trigger: เพลงประจำร่างเล่นค้างตลอด 10 เทิร์นและมีลำดับสูงสุด
  let bestTrigger = null;
  for (const p of alivePlayers()) {
    if (p.characterId !== "ultraman_trigger") continue;
    if (!bestTrigger || (p.transformAt || 0) > bestTrigger.at) bestTrigger = { music: "trigger", at: p.transformAt || 0 };
  }
  if (bestTrigger) return bestTrigger;
  let bestBeat = null;
  for (const p of alivePlayers()) {
    if (p.seen && p.seen.beat) {
      if (!bestBeat || (p.beatAt || 0) > bestBeat.at) bestBeat = { music: "ex_guts", at: p.beatAt || 0 };
    }
  }
  if (bestBeat) return bestBeat;
  // มุยมิ: เพลงประจำท่าไม้ตายเล่นค้างตลอดช่วง “ดาบสะบั้น”
  let bestMuimi = null;
  for (const p of alivePlayers()) {
    if (CHAR_HOOKS.muimi.towerActive(p)) {
      if (!bestMuimi || (p.transformAt || 0) > bestMuimi.at) bestMuimi = { music: "muimi", at: p.transformAt || 0 };
    }
  }
  if (bestMuimi) return bestMuimi;
  let bestHisakawa = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "hisakawa_sister" && (p.statuses.hisakawaDream || 0) > 0) {
      if (!bestHisakawa || (p.transformAt || 0) > bestHisakawa.at) bestHisakawa = { music: "hisakawa_sunday", at: p.transformAt || 0 };
    }
  }
  if (bestHisakawa) return bestHisakawa;
  // ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ ทำงานอยู่ — เพลง forever เล่นค้าง (priority สูงกว่าเพลงตามเกียร์ ต่ำกว่า Beat Mode)
  let bestTakumiBlackout = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "takumi" && (p.statuses.takumiBlackout || 0) > 0) {
      if (!bestTakumiBlackout || (p.transformAt || 0) > bestTakumiBlackout.at) bestTakumiBlackout = { music: "forever", at: p.transformAt || 0 };
    }
  }
  if (bestTakumiBlackout) return bestTakumiBlackout;
  // สึงาชิ ทาคุโตะ (patch 2.2.5): สกิลติดตัว 1 กันตายทำงานไปแล้วสักครั้ง — ระหว่างที่ยังอยู่ในร่างฉันคว้ามันได้แล้ว เพลง takuto2 เล่นแทน takuto ปกติ
  let bestTakutoAwaken = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "takuto" && p.beatSaved && (p.statuses.apprivoise || 0) > 0) {
      if (!bestTakutoAwaken || (p.takutoAwakenAt || 0) > bestTakutoAwaken.at) bestTakutoAwaken = { music: "takuto2", at: p.takutoAwakenAt || 0 };
    }
  }
  if (bestTakutoAwaken) return bestTakutoAwaken;
  // แด่เพื่อนรักของฉัน (ชเรด เอลัน): เพลง shrade_theme เล่นค้างตลอดช่วงชาร์จ (รองจาก Beat Mode)
  let bestShrade = null;
  for (const p of alivePlayers()) {
    if (CHAR_HOOKS.shrade_elan.charging(p)) {
      if (!bestShrade || (p.transformAt || 0) > bestShrade.at) bestShrade = { music: "shrade", at: p.transformAt || 0 };
    }
  }
  if (bestShrade) return bestShrade;
  // มิติมายาบรรเลง (Bard): BGM มิติเล่นวนตลอด 3 เทิร์นที่มิติเปิดอยู่
  let bestBard = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "bard" && ((p.statuses.bloodDim || 0) > 0 || (p.statuses.soulDim || 0) > 0)) {
      if (!bestBard || (p.transformAt || 0) > bestBard.at) bestBard = { music: "bard_dim", at: p.transformAt || 0 };
    }
  }
  if (bestBard) return bestBard;
  // อาจารย์ ไบเลธ (characters/byleth.js): เพลงประจำหลักสูตรที่เปิดค้างอยู่ — สลับไฟล์ตามกลางวัน/กลางคืน
  //  (ฝั่ง client เล่นไฟล์ใหม่ต่อจากตำแหน่งเดิมผ่าน MUSIC_POSITION_GROUPS จึงไม่มีรอยสะดุดตอนสลับช่วงเวลา)
  const bestByleth = CHAR_HOOKS.byleth.activeMusic(engine, isNightRound(roundNumber));
  if (bestByleth) return bestByleth;
  // อิปโป (characters/ippo.js): เพลงประจำท่า Dempsey roll — เล่นค้างตลอดที่บัฟยังอยู่
  const bestIppo = CHAR_HOOKS.ippo.activeMusic(engine);
  if (bestIppo) return bestIppo;
  // ยุย (characters/yui.js): เพลงประจำท่าไม้ตายที่กำลังบรรเลงอยู่
  const bestYui = CHAR_HOOKS.yui.activeMusic(engine);
  if (bestYui) return bestYui;
  // อิสึกะ ชิโด (characters/shido.js): เพลง shido_theme เล่นค้างตลอดที่ Sandalphon ยังอยู่
  const bestShido = CHAR_HOOKS.shido.activeMusic(engine);
  if (bestShido) return bestShido;
  // เข้ามาเลย (แบทแมน patch 2.2.7): เพลง bat_ben_theme เล่นค้างตลอดที่ล่อเป้าอยู่
  let bestBat = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "bat_ben" && (p.statuses.batTaunt || 0) > 0) {
      if (!bestBat || (p.transformAt || 0) > bestBat.at) bestBat = { music: "bat_ben", at: p.transformAt || 0 };
    }
  }
  if (bestBat) return bestBat;
  // ทุกอย่างจะต้องราบรื่น (เจ้าหญิงราก patch 2.2.7): เพลง p_shiki_theme เล่นค้างระหว่างท่าไม้ตายทำงาน
  let bestPShiki = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "princess_shiki" && (p.statuses.pshikiUlt || 0) > 0) {
      if (!bestPShiki || (p.transformAt || 0) > bestPShiki.at) bestPShiki = { music: "p_shiki", at: p.transformAt || 0 };
    }
  }
  if (bestPShiki) return bestPShiki;
  // ฉันมองเห็นมันแล้ว / ความตายที่โรยรา (ชิกิ): เพลงประจำท่าเล่นค้างระหว่างท่าไม้ตายทำงาน
  let bestShiki = null;
  for (const p of alivePlayers()) {
    if (p.characterId !== "shiki") continue;
    if ((p.statuses.wither || 0) > 0) {
      if (!bestShiki || (p.transformAt || 0) > bestShiki.at) bestShiki = { music: "shiki2", at: p.transformAt || 0 };
    } else if ((p.statuses.deatheye || 0) > 0) {
      if (!bestShiki || (p.transformAt || 0) > bestShiki.at) bestShiki = { music: "shiki", at: p.transformAt || 0 };
    }
  }
  if (bestShiki) return bestShiki;
  // มีดพับประจำตระกูล (โทโนะ ชิกิ patch 2.1.7): เพลง tohno_theme เล่นค้างระหว่างสกิลติดตัวเปิดใช้งาน (ระดับ 2 ขึ้นไป)
  let bestTohno = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "tohno" && (p.tohnoLevel || 1) >= 2) {
      if (!bestTohno || (p.transformAt || 0) > bestTohno.at) bestTohno = { music: "tohno", at: p.transformAt || 0 };
    }
  }
  if (bestTohno) return bestTohno;
  // Mystic eye of death perception (นานายะ ชิกิ patch 2.1.9): เพลง nanaya_theme เล่นค้างระหว่างเปิดใช้งาน — ปิดพร้อมกับปิดสกิลติดตัว
  let bestNanaya = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "nanaya" && p.nanayaEyeOn) {
      if (!bestNanaya || (p.transformAt || 0) > bestNanaya.at) bestNanaya = { music: "nanaya", at: p.transformAt || 0 };
    }
  }
  if (bestNanaya) return bestNanaya;
  // นายเป็นคนทำตัวเองนะ (เทเปา ชิกิ): เพลง tepeu_theme เล่นค้างช่วงฉากหลังซ้อนแบบโทโนะ ชิกิ หลังท่าไม้ตายจบ
  let bestTepeu = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "tepeu" && (p.tepeuEyeTurns || 0) > 0) {
      if (!bestTepeu || (p.transformAt || 0) > bestTepeu.at) bestTepeu = { music: "tepeu", at: p.transformAt || 0 };
    }
  }
  if (bestTepeu) return bestTepeu;
  // Mana Burden (ผู้สังหารเมจ): เพลง mageslayer_ult เล่นค้างตามอายุของ Mana Burden ที่ตัวเองร่ายไว้
  //  (ผูกกับ p.statuses.mageslayerBurdenBgm ที่ตั้งตอนใช้สกิล — เดิมผูกกับ spellburden ของตัวเอง แต่สกิลไม่ใส่ให้ตัวเองแล้ว)
  let bestMageslayer = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "mageslayer" && (p.statuses.mageslayerBurdenBgm || 0) > 0) {
      if (!bestMageslayer || (p.transformAt || 0) > bestMageslayer.at) bestMageslayer = { music: "mageslayer_ult", at: p.transformAt || 0 };
    }
  }
  if (bestMageslayer) return bestMageslayer;
  // ทาคุมิ ฟุจิวาระ: เพลงประจำตัวตามเกียร์ธรรมดา — เกียร์ 3-5: all_around / เกียร์ 6: secret_love (เกียร์ 1-2 ไม่มีเพลงพิเศษ)
  let bestTakumiGear = null;
  for (const p of alivePlayers()) {
    if (p.characterId !== "takumi") continue;
    const gear = p.takumiGear || 1;
    const gearMusic = gear >= 6 ? "secret_love" : gear >= 3 ? "all_around" : null;
    if (!gearMusic) continue;
    if (!bestTakumiGear || (p.transformAt || 0) > bestTakumiGear.at) bestTakumiGear = { music: gearMusic, at: p.transformAt || 0 };
  }
  if (bestTakumiGear) return bestTakumiGear;
  // MOON*CELL (คิชินามิ ฮาคุโนะ patch 2.2.1): เพลง hakuno_theme เล่นค้างระหว่างท่าไม้ตายทำงาน
  let bestHakuno = null;
  for (const p of alivePlayers()) {
    if (p.characterId === "hakuno" && (p.statuses.moonCell || 0) > 0) {
      if (!bestHakuno || (p.transformAt || 0) > bestHakuno.at) bestHakuno = { music: "hakuno", at: p.transformAt || 0 };
    }
  }
  if (bestHakuno) return bestHakuno;
  // Wonder of U (ซาโตรุ patch 2.0.8.2): เพลงเล่นค้างตราบใดที่ยังมีผู้เล่นติด [Calamity] อยู่บนสนาม
  let bestWou = null;
  for (const p of alivePlayers()) {
    if (p.characterId !== "satoru") continue;
    if (!Object.values(players).some((o) => o.alive && (o.statuses.calamity || 0) > 0)) continue;
    if (!bestWou || (p.transformAt || 0) > bestWou.at) bestWou = { music: "wonderofu", at: p.transformAt || 0 };
  }
  if (bestWou) return bestWou;
  let best = null;
  for (const key of ["ginga", "gingastrium", "paradise", "rachan", "golden", "fourth", "graybeast", "doomCrucible", "apprivoise",
    // ฟุจิตะ โคโตเนะ: เพลงประจำร่าง [พร้อมลุย] + เพลงที่ขึ้นหลังปล่อยท่าไม้ตาย 3/4/5 (ค้างจนจบเทิร์น)
    "kready", "kawaii", "kcampus", "kshuki"]) {
    const t = TRANSFORMS[key];
    if (!t.music) continue;
    for (const p of alivePlayers()) {
      if (p.seen && p.seen[key] && (p.statuses[key] || 0) > 0) {
        if (!best || (p.transformAt || 0) > best.at) best = { music: t.music, at: p.transformAt || 0 };
      }
    }
  }
  return best;
}

// เลือดจริงลด 1 หน่วย — เลือดชั่วคราว (แกมเบลอร์) รับแทนก่อนเสมอ (หมดไปเพราะได้รับความเสียหาย)
// เชื่อมผล (patch 2.0.8): การลด HP จริงถูกแชร์ให้คู่เชื่อมเท่ากันด้วย (อมตะกันไว้ได้)
function loseHp(p) {
  hisakawaSyncIn(p);
  if (friendlyEffectBlocked(p)) return;
  // แบทแมนร่างรถแบทโมบิล (characters/bat_ben.js): พลังชีวิตลดไม่ได้เลย — ความเสียหายไปลงเกราะ (พลังชีวิตของรถ)
  //  ต้องอยู่บนสุดของ loseHp เพราะนี่คือจุดคอขวดเดียวที่ hp จะลดได้ ทำให้ครอบคลุมทั้งดาเมจทะลุเกราะ
  //  (dealDirect = สกิลติดตัว 2 "รถคู่ใจ") และดาเมจที่ทะลุเกราะมาเพราะเกราะหมดพอดี
  if (CHAR_HOOKS.bat_ben.carAbsorb(engine, p)) { hisakawaSyncOut(p); return; }
  // ผู้วิงวอน "เกราะศรัทธา" (characters/the_supplicant.js): เกราะชั้นที่ 2 ที่อยู่หลังเกราะหลัก
  //  เกราะหลักถูกหักที่ dealMixed/damageSoft ไปก่อนแล้ว ดาเมจที่มาถึง loseHp คือส่วนที่ทะลุเกราะหลักมา
  //  จึงเป็นจุดที่ถูกต้องของ "ชั้นหลัง" — และครอบคลุมดาเมจเจาะเกราะ (dealDirect) ด้วยโดยอัตโนมัติ
  if (CHAR_HOOKS.the_supplicant.faithAbsorb(engine, p)) { hisakawaSyncOut(p); return; }
  if ((p.tempHp || 0) > 0) { p.tempHp--; hisakawaSyncOut(p); return; }
  if (isYuuki(p) && effectSourceId && effectSourceId !== YUUKI_ID && players[effectSourceId]) p.lastDamageSourceId = effectSourceId;
  // ฉันจะไม่ยอมสูญเสียใครไปอีก (ริดดี้ patch 2.1.1): ริดดี้เองตายไม่ได้ — เลือดค้างที่ 1
  if (p.hp <= 1 && CHAR_HOOKS.riddhe.guardProtects(p)) {
    if (p.riddheSaveLoggedRound !== roundNumber) {
      p.riddheSaveLoggedRound = roundNumber;
      lastLog.push(`🛡️🤝 บันชีปกป้องตัวเอง ${p.name} — ฉันจะไม่ยอมสูญเสียใครไปอีก! เลือดค้างที่ 1 (ตายไม่ได้ระหว่างท่าไม้ตายทำงาน)`);
    }
    return;
  }
  p.hp--; p.dmgHp++;
  hisakawaSyncOut(p);
  if (isYuuki(p) && p.hp > 0 && p.hp <= 4 && !yuukiLowShown) {
    yuukiLowShown = true;
    queueYuukiCutscene(YUUKI_VIDEO.low, "OVERLOAD · LIMIT BREAK", 3, "yuukiLow");
    lastLog.push(`🌌 ${p.name} พลังชีวิตเหลือ ${p.hp} — Star of Fall เพิ่มเป็น 6 ดาเมจ และจะได้รับโชคลาภทุกเทิร์น!`);
  }
  // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล, characters/phenex.js): ระหว่างล่อเป้า สะสม "ความเจ็บปวด" +1 ทุกๆ 1 หน่วยเลือดจริงที่เสียไป
  CHAR_HOOKS.phenex.onHpLost(p);
  if (!linkMirror) {
    const buddies = linkedBuddiesOf(p);
    linkMirror = true;
    for (const b of buddies) if (!sealActive(b)) loseHp(b);
    linkMirror = false;
  }
}

// Overload Force: เริ่มนับเฉพาะไพ่ที่จั่วหลังคะแนนเกิน 21 และรีเซ็ตตัวนับใหม่ทุกเทิร์น
// ทุกใบที่ 5 ในช่วงคะแนนเกิน 21 จะเสีย HP จริง 1 หน่วย
// ใช้ loseHp เพื่อให้ระบบกันตาย/เชื่อมผล/ร่างพิเศษยังทำงานตามกติกาหลักของเกม
function applyOverloadOverdrawPenalty(p) {
  if (!overloadForceActive || !p || !p.alive || !p.overloadDrawReady) return;
  if (isYuuki(p)) return; // บอสยูกิได้รับการยกเว้นโทษ HP -1 จาก Overload Force
  if (calculateScore(p.cards) <= 21) return;
  p.overloadExtraDraws = (p.overloadExtraDraws || 0) + 1;
  if (p.overloadExtraDraws % 5 !== 0) return;
  const before = p.hp;
  loseHp(p);
  maybeBeatSave(p);
  maybeBeatMode(p);
  maybeEva3(p);
  if (p.alive && p.hp <= 0) instantDeath(p);
  const lost = Math.max(0, before - p.hp);
  lastLog.push(`⚡ ${p.name} จั่วเพิ่มครบ ${p.overloadExtraDraws} ใบใน Overload Force — HP -${lost}${p.alive ? "" : " และหมดสภาพต่อสู้!"}`);
}
// เชื่อมผล (patch 2.1.1): เกราะที่เสียจริงถูกแชร์ให้คู่เชื่อมเท่ากันด้วย (คนละช่องกับ HP)
function loseArmor(p) {
  hisakawaSyncIn(p);
  if (friendlyEffectBlocked(p)) return;
  if (isYuuki(p) && effectSourceId && effectSourceId !== YUUKI_ID && players[effectSourceId]) p.lastDamageSourceId = effectSourceId;
  p.armor--; p.dmgArmor++;
  hisakawaSyncOut(p);
  // MonsterLive (ฮิคารุ, characters/hikaru.js): เกราะลดลง -> ฟื้นพลังชีวิตตามเกราะที่เสียไป
  CHAR_HOOKS.hikaru.onArmorLost(engine, p);
  // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล, characters/phenex.js): ระหว่างล่อเป้า สะสม "ความเจ็บปวด" +1 ทุกๆ 1 หน่วยเกราะที่เสียไป
  CHAR_HOOKS.phenex.onArmorLost(p);
  // แบทแมนร่างรถ (characters/bat_ben.js): เกราะคือพลังชีวิตของรถ — หมดเมื่อไหร่คือรถพัง
  //  ต้องเช็คที่นี่ด้วย ไม่ใช่แค่ใน carAbsorb: ถ้าดาเมจพอดีกับเกราะที่เหลือ ท่อจะไม่เคยเรียก loseHp เลย
  CHAR_HOOKS.bat_ben.onArmorLost(engine, p);
  if (!linkMirror) {
    const buddies = linkedBuddiesOf(p);
    linkMirror = true;
    for (const b of buddies) if (!sealActive(b) && b.armor > 0) loseArmor(b);
    linkMirror = false;
  }
}
// เรจูอาคมบัญชา (อมตะ): ไม่รับความเสียหายใดๆ ตลอดเทิร์น — กันไว้กลางทางทุกช่องทางดาเมจ
function damageSoft(p) {
  hisakawaSyncIn(p);
  if (!p.alive || sealActive(p) || friendlyEffectBlocked(p)) return;
  // หลักสูตร "จบการศึกษา" ระบุว่าลดความเสียหายทุกช่องทาง จึงครอบคลุมแพ้จั่ว/ไพ่แตกด้วย
  // เรียกเฉพาะฮุคไบเลธตรงนี้: damageSoft เป็นดาเมจสถานะที่ไม่ควรเปิดระบบหลบ/ลดดาเมจ
  // ของตัวละครอื่น (เช่น ว่องไวของเอจิหรือ WineBarrel) ซึ่งจงใจใช้ได้กับท่อ skill/attack เท่านั้น
  if (p.characterId === "byleth" && CHAR_HOOKS.byleth.adjustIncomingDamage(engine, p, 1) <= 0) {
    hisakawaSyncOut(p);
    return;
  }
  // อมาซอน (ฮารุกะ, characters/haruka.js): ไม่มีเกราะแล้วโดนดาเมจ = เลือดไหลตัวเอง — damageSoft ไม่ผ่าน
  //  adjustIncomingDamage() จึงต้องเรียกฮุคเองที่นี่ ไม่งั้นดาเมจแพ้จั่วจะไม่นับเป็น "ความเสียหายทางใดก็ตาม"
  if (p.characterId === "haruka") CHAR_HOOKS.haruka.onDamaged(engine, p);
  if (p.shield > 0) { p.shield--; hisakawaSyncOut(p); return; }
  if (p.armor > 0) loseArmor(p);
  else loseHp(p);
  // คู่แฝดฮิซากาว่า: ดาเมจแพ้จั่ว/แตกก็ต้องสลับให้แฝดอีกคนออกมาคุมทันทีเหมือนท่อดาเมจอื่น
  //  ไม่งั้นจะยืนอยู่ด้วยแฝดที่เลือดหมดตลอดเฟส SUMMARY/ATTACK แล้วค่อยสลับตอน endTurn()
  resolveHisakawaTwinDeath(p);
  if (p.alive && p.hp <= 0 && p.characterId === "byleth") instantDeath(p);
}
// ระเบิด Fourth Impact (เอวา 13 patch 2.2 alpha): เคารพ "หลบหลีก" ของเป้าหมาย (เดิมทะลุหลบหลีกเสมอ) — คืน true ถ้าหลบพ้น
function evaBlastEvade(o, e) {
  if ((o.statuses.evade || 0) <= 0) return false;
  const evadePct = statusAmtOf(o, "evade") || 100;
  consumeEvadeStack(o);
  if (Math.random() * 100 < evadePct) {
    lastLog.push(`💨 หลบหลีก! ${o.name} หลบแรงระเบิดของ ${e.name} ได้ (${evadePct}%)`);
    return true;
  }
  lastLog.push(`💨 ${o.name} พยายามหลบแรงระเบิดของ ${e.name} แต่ไม่พ้น (${evadePct}%)`);
  return false;
}
// RS-Hopper ทั้งสองแบบ (universal-dispatcher wrappers — ตรรกะจริงอยู่ characters/eva13.js)
// isNormalAttack: true เฉพาะที่ doAttack() เรียก (การโจมตีจากการเลือกเป้าหมายในเทิร์นปกติ ไม่ว่าจะมีบัฟเสริมพลังหรือไม่)
// ตราล่าเวท (characters/mageslayer.js): ดาเมจ "ทุกประเภท" ที่ผู้สังหารเมจสร้างใส่เป้าหมายที่ติดตรา
//  (ปืน GUTS / ดาเมจสกิล / ระเบิดมานา / การโจมตีปกติ) จะขโมยพลังงานเท่าดาเมจ — เรียกจากท่อดาเมจกลางทั้ง 3 ตัว
//  แทนการไปแปะทีละจุด โดยดูต้นตอจาก effectSourceId (ทุก handler ห่อด้วย withEffectSource อยู่แล้ว)
function mageslayerMarkSteal(target, n) {
  if (!(n > 0) || !target) return;
  const src = effectSourceId && players[effectSourceId];
  if (!src || src.characterId !== "mageslayer" || src.id === target.id) return;
  CHAR_HOOKS.mageslayer.onDamageDealt(engine, src, target, n);
}
function adjustIncomingDamage(p, n, isNormalAttack) {
  // เย็นชื่นใจ (escanorCool, WineBarrel ของเอสคานอร์): สถานะ Universal — ไวน์ถูกขโมยไปใช้ได้
  //  ตรรกะจริงอยู่ characters/_universal_status.js (coolReduction)
  if (n > 0) n = Math.max(0, n - coolReduction(p, isNormalAttack));
  const hook = CHAR_HOOKS[p && p.characterId];
  return hook && hook.adjustIncomingDamage ? hook.adjustIncomingDamage(engine, p, n, isNormalAttack) : n;
}
function tryYunaLongingForTwin(p) {
  if (!p || p.characterId !== "hisakawa_sister" || yunaLongingUsed || roundNumber < 1 || roundNumber > 10) return false;
  if (!CHAR_HOOKS.hisakawa_sister.anyTwinDead(p)) return false;
  yunaLongingUsed = true;
  return YunaMod.reviveWithLonging(engine, p);
}
function resolveHisakawaTwinDeath(p) {
  if (!p || !p.alive || p.hp > 0 || p.characterId !== "hisakawa_sister") return false;
  const survived = CHAR_HOOKS.hisakawa_sister.tryTwinDeath(engine, p);
  if (survived) tryYunaLongingForTwin(p);
  return survived;
}
function dealDirect(p, n, isNormalAttack) {
  if (sealActive(p) || friendlyEffectBlocked(p)) return;
  n = adjustIncomingDamage(p, n, isNormalAttack);
  if (n <= 0) return;
  if (isNormalAttack) { if (CHAR_HOOKS.eva13.normalAttackFloor(engine, p, n)) return; }
  else if (CHAR_HOOKS.eva13.rsHopperBlock(engine, p)) return;
  for (let i = 0; i < n; i++) {
    if (!p.alive) return;
    if (p.shield > 0) { p.shield--; continue; }
    loseHp(p);
  }
  mageslayerMarkSteal(p, n);
  resolveHisakawaTwinDeath(p);
  // sothis ต้องฟื้นทันทีเมื่อเลือดหมด ไม่รอ sweep ตอนจบเทิร์น
  if (p.alive && p.hp <= 0 && p.characterId === "byleth") instantDeath(p);
}
function dealArmorOnly(p, n, isNormalAttack) {
  if (sealActive(p) || friendlyEffectBlocked(p)) return;
  n = adjustIncomingDamage(p, n, isNormalAttack);
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    if (p.shield > 0) { p.shield--; continue; }
    if (p.armor > 0) loseArmor(p);
  }
  mageslayerMarkSteal(p, n);
}
function dealMixed(p, n, isNormalAttack) { // เกราะก่อนแล้วเลือด (สำหรับ NT-D)
  if (sealActive(p) || friendlyEffectBlocked(p)) return;
  n = adjustIncomingDamage(p, n, isNormalAttack);
  if (n <= 0) return;
  if (isNormalAttack) { if (CHAR_HOOKS.eva13.normalAttackFloor(engine, p, n)) return; }
  else if (CHAR_HOOKS.eva13.rsHopperBlock(engine, p)) return;
  for (let i = 0; i < n; i++) {
    if (!p.alive) return;
    if (p.shield > 0) { p.shield--; continue; }
    if (p.armor > 0) loseArmor(p);
    else loseHp(p);
  }
  mageslayerMarkSteal(p, n);
  resolveHisakawaTwinDeath(p);
  // sothis ต้องฟื้นทันทีเมื่อเลือดหมด ไม่รอ sweep ตอนจบเทิร์น
  if (p.alive && p.hp <= 0 && p.characterId === "byleth") instantDeath(p);
}
// src = แหล่งที่มาของการฟื้นพลังงาน ("item" / "passive" / "card") — ใส่เฉพาะช่องทาง "ฟื้นฟู" จริงๆ
//  ที่ [ดูดซับเวท] (ผู้สังหารเมจ) ต้องตอบสนอง ไม่ใส่ให้แต้มพื้นฐานจบเทิร์น/ค่าชดเชยการแพ้/การโอนแต้มระหว่างผู้เล่น
function addSkill(p, n, src) {
  if (isYuuki(p)) return;
  // ชะงัก (โอกูริ Rework): ฟื้นฟูแต้มสกิลไม่ได้ทุกช่องทาง ระหว่างติดสถานะนี้
  if (((p.statuses && p.statuses.stagger) || 0) > 0) return;
  if (((p.statuses && p.statuses.manaSeal) || 0) > 0) return; // ผนึกพลังงาน (Universal): ฟื้นฟูแต้มสกิลไม่ได้ทุกช่องทาง
  if (p.characterId === "mageslayer") return; // Song's Curse: ฟื้นพลังงานได้เฉพาะการโจมตีเป้าหมายที่ติด Witch Mark ซึ่งไม่เรียก addSkill
  const before = p.skillPoints;
  p.skillPoints = Math.min(maxSkillOf(p), p.skillPoints + n); // Bard: เพดานพลังงาน 9
  p.gainedSkill += p.skillPoints - before;
  // ดูดซับเวท (characters/mageslayer.js): ฟื้นพลังงานจากไอเทม/พาสซีฟ/การ์ดรังสรร -> 35% ถูกผู้สังหารเมจขโมย 1 หน่วย
  if (src && p.skillPoints > before) CHAR_HOOKS.mageslayer.onEnergyAction(engine, p);
}

function applyEffect(p, effect) {
  if (!effect) return;
  if (Array.isArray(effect)) return effect.forEach((e) => applyOne(p, e));
  applyOne(p, effect);
}
function applyOne(p, e) {
  switch (e.type) {
    case "heal": healHp(p, e.amount); break;
    case "armor": healArmor(p, e.amount); break;
    case "points": addSkill(p, e.amount, "passive"); break;
    case "shield": p.shield += e.amount || 1; break;
    case "draw": for (let i = 0; i < (e.amount || 1); i++) { const c = drawCardFor(p); if (c) { p.cards.push(c); onCardDrawn(p, c); } } break;
    case "redraw": {
      p.cards = [];
      for (let i = 0; i < 2; i++) { const c = drawCardFor(p); if (c) { p.cards.push(c); onCardDrawn(p, c); } }
      break;
    }
    case "status": p.statuses[e.status] = e.turns || 1; break;
  }
}
function firePassive(p, trigger) {
  const ch = CHAR_BY_ID[p.characterId];
  if (ch && ch.passive && ch.passive.trigger === trigger) applyEffect(p, ch.passive.effect);
}
// หาข้อมูลสกิล (ชื่อ+รูป) จาก status ที่กำลังมีผล — ใช้โชว์ตอนอนิเมชันโจมตี ว่าดาเมจ/การป้องกันมาจากสกิลไหนของใคร
function skillByStatus(p, status) {
  const ch = CHAR_BY_ID[p.characterId];
  if (!ch) return null;
  for (const tier of ["basic", "secondary", "secondary2", "secondaryNight", "ultimate", "ultimate2", "ultimateNight"]) {
    const s = ch[tier];
    if (s && s.effect && !Array.isArray(s.effect) && s.effect.type === "status" && s.effect.status === status) {
      return { name: s.name, img: s.img || null, by: p.name, color: POSITION_COLORS[p.position] || "#888" };
    }
  }
  return null;
}
// นายมีฝีมือแค่ไหนหรอ? (ชิกิ patch 2.0.6): มีชิกิที่ถือชาร์จยกเลิกท่าไม้ตาย (godslay) อยู่บนสนาม
//  -> ท่าไม้ตายของผู้เล่นอื่นถูกยกเลิก (แต้มสกิลเสียฟรี — ไม่คืน)
//  วีดีโอเล่นเฉพาะ "ครั้งแรกของเจ้าของท่าคนนั้น" — โดนยกเลิกครั้งถัดไปเป็นแค่การแจ้งเตือน
//  คืนค่า true = มีวีดีโอเข้าคิว (ผู้เรียกต้องพัก/เล่นคิวเอง)
function shikiCancelUltimate(slayer, victim, skillName, skillImg) {
  delete slayer.statuses.godslay; // ใช้ได้ 1 ครั้งต่อการชาร์จ (สะสมไม่ได้)
  const t = TRANSFORMS.shikiSeal;
  // เจ้าหญิงราก (patch 2.2.7): ชาร์จตัวเดียวกัน แต่ชื่อท่าเป็น "อย่าทำอะไรไม่เข้าท่าเลย" และยกเลิกสำเร็จได้ฮีล
  const slayerSkillName = slayer.characterId === "princess_shiki" ? "อย่าทำอะไรไม่เข้าท่าเลย" : "นายมีฝีมือแค่ไหนหรอ?";
  lastLog.push(`👁️🗡️ ${slayer.name} ${slayerSkillName} — ยกเลิกท่าไม้ตาย ${skillName} ของ ${victim.name}! (แต้มสกิลเสียฟรี)`);
  CHAR_HOOKS.princess_shiki.onSealSuccess(engine, slayer);
  if (!victim.cutsceneShown.shikiSeal) {
    victim.cutsceneShown.shikiSeal = true; // ครั้งแรกของเจ้าของท่าคนนี้ = เล่นวีดีโอเต็ม
    cutsceneQueue.push({
      seconds: t.seconds,
      info: {
        playerId: victim.id, name: victim.name,
        img: skillImg || displayImg(victim), // ภาพสกิลท่าไม้ตายที่โดนยกเลิก
        img2: displayImg(victim),            // ภาพเจ้าของท่าที่โดน
        color: POSITION_COLORS[slayer.position] || "#9B4F96",
        video: t.video, title: t.title, label: `ถูก ${slayer.name} ยกเลิกท่าไม้ตาย`,
      },
    });
    return true;
  }
  // เคยโดนยกเลิกแล้ว: แจ้งเตือนเล็กๆ ว่าชิกิยกเลิกท่าไม้ตายของใคร ไม่หยุดเกม
  io.emit("transformNotice", {
    playerId: victim.id, name: slayer.name,
    img: skillImg || SHIKI_PROFILE_IMG, color: POSITION_COLORS[slayer.position] || "#9B4F96",
    title: t.title, label: `ยกเลิกท่าไม้ตาย ${skillName} ของ ${victim.name}`,
  });
  return false;
}

// ไพ่แตกก่อนเปิดไพ่ = ท่าไม้ตายที่เพิ่งกดในเทิร์นนี้ใช้งานไม่ได้ (แต้มสกิลที่จ่ายไปเสียฟรี)
function voidUltimateOnBust(p) {
  for (const key of Object.keys(TRANSFORMS)) {
    if (!TRANSFORMS[key].afterReveal) continue; // เฉพาะท่าไม้ตาย (ginga / paradise)
    if ((p.statuses[key] || 0) > 0 && !p.seen[key]) {
      delete p.statuses[key];
      lastLog.push(`💥 ${p.name} ไพ่แตก! ท่าไม้ตาย ${TRANSFORMS[key].title} ใช้งานไม่ได้ — แต้มสกิลเสียฟรี`);
    }
  }
  // ฟุจิตะ โคโตเนะ: ท่าไม้ตายในร่าง [พร้อมลุย] (kawaii/kcampus/kshuki) ทำงานที่ resolveRound ไม่ใช่ลูป afterReveal
  //  จึงต้องลบเองที่นี่ — แต้มสกิล/เหรียญที่จ่ายไปเสียฟรี (ร่างถูกถอดไปตั้งแต่ตอนกดแล้ว)
  if (p.characterId === "kotone") {
    for (const key of CHAR_HOOKS.kotone.FORM_ULT_KEYS) {
      if ((p.statuses[key] || 0) > 0 && !p.seen[key]) {
        delete p.statuses[key];
        lastLog.push(`💥 ${p.name} ไพ่แตก! ท่าไม้ตาย ${TRANSFORMS[key].title} ใช้งานไม่ได้ — แต้มสกิลและเหรียญเสียฟรี`);
      }
    }
  }
  // ANATA WAAAAAAAA (เทมาริ): ผู้ใช้ไพ่แตกเอง = ท่าไม้ตายเป็นโมฆะ
  if ((p.statuses.anata || 0) > 0 && p.anataTargets) {
    delete p.statuses.anata;
    p.anataTargets = null;
    anataMusicSeq = 0;
    lastLog.push(`💥 ${p.name} ไพ่แตก! ท่าไม้ตาย ANATA WAAAAAAAA ใช้งานไม่ได้ — แต้มสกิลเสียฟรี`);
  }
}

function resetRoundDisplay(p) {
  p.dmgHp = 0; p.dmgArmor = 0; p.gainedSkill = 0;
  p.wasAttacked = false; p.didAttackRound = false; p.isWinner = false; p.isLoser = false;
}
function resetCombat(p) {
  p.ready = false; // ห้องรอ: ต้องกดพร้อมใหม่ทุกครั้งที่กลับมาห้องรอ/เริ่มแมตช์ใหม่
  p.skillPoints = 0; p.alive = true; p.shield = 0;
  p.statuses = {}; p.seen = {}; p.ntdTarget = null; p.transformAt = 0; p.beatAt = 0;
  // ---------- บานาจ ลิงก์ (patch 2.1.2) ----------
  p.ntdRivalId = null;      // สกิลติดตัว 2: เป้าแก้แค้นพิเศษใส่ริดดี้ (ไม่ใช่พันธมิตร)
  p.bshieldOwnerId = null;  // Absorb shield: เจ้าของสกิลที่จะได้รับการฟื้นเลือดเมื่อโล่แตก
  p.riddheNtdLinked = null; // (ริดดี้) id บานาจที่มอบ NT-D System ให้ฟรีจาก NewType Paradise — ผูกอายุ
  p.statusAmt = {};      // จำนวน (amount) ของบัฟ/ดีบัฟพื้นฐาน (patch 2.0.8) — คู่กับ p.statuses
  p.armorLocked = false; // Beat Mode: กันตายแล้วเกราะจะไม่ฟื้นคืน
  p.beatSaved = false;   // Beat Mode: กันตายได้ครั้งเดียวต่อเกม (คล้าย Focus Sash)
  p.skillUsedRound = false; // ใช้สกิลได้ 1 อันต่อเทิร์น
  p.beamAmmo = BEAM_AMMO; // กระสุน Beam Magnum รีเซ็ตต้นเกม
  p.puddingCount = 0; // Rainbow Pudding: จำนวนครั้งที่กินสะสม (ไม่จำกัดจำนวนครั้ง — ครบทุกๆ 3 ครั้งจะอิ่ม)
  p.rsHopperRegenTimer = 0; // RS-Hopper (เอวา 13): นับเทิร์นสำหรับฟื้นชาร์จ (ครบ 3 = ฟื้น 1 ชาร์จ)
  if (p.characterId === "eva13") p.statuses.rsHopper = EVA13_RSHOPPER_MAX; // RS-Hopper: เริ่มเกมเต็ม 3 ชาร์จ
  // ---------- ร้านค้ามายา + เศรษฐกิจเหรียญ (patch 2.2 full) ----------
  p.gold = 0;        // เหรียญสะสม (เพดาน 30)
  p.inventory = [];  // ของที่ซื้อจากร้านค้า รอใช้ (รวมปืนหน่วย GUTS Select — หายทุกแมตช์ใหม่)
  p.triggerDarkWail = 0;           // อวดครวญ: สะสมบนผู้เล่นทุกคนจากเสียงร้องไห้ สูงสุด 5
  if (p.characterId === "ignis") CHAR_HOOKS.ignis.ensureBlackSparklence(p);
  p.gutsShotTurn = 0;              // ปืนหน่วย GUTS Select: เทิร์นล่าสุดที่ยิงไป (1 นัด/เทิร์น)
  p.blackSparklenceReadyRound = 0; // หลังยิง Nursedessei: รอบที่ Black Sparklence กลับมาใช้ได้
  p.hyperTriggerReadyRound = 0;    // Hyper Key Trigger: หลังคืนร่างรอ 5 เทิร์นก่อนใช้ซ้ำ
  p.triggerRecoveryTargetHp = 0;   // Ultraman Trigger: คืนร่างแล้วฟื้นเลือด +1/เทิร์นจนถึง HP ก่อนแปลงร่าง ถ้าโดนตีจะหยุด
  p.gutsGargorgonPending = false;  // Gargorgon Ray: รอแปลงเป็นสตั้นตอนต้นเทิร์นถัดไป
  p.escanorCharge = 0;
  p.escanorForcedMorning = 0;
  p.escanorPendingWine = 0;
  p.escanorLastStandUsed = false;
  p.escanorNoonSkillLossRound = 0;
  p.escanorSolarIdle = 0;
  // ---------- DoomGuy (patch 2.2 full) ----------
  if (p.characterId === "doomguy") p.doomWeapon = DOOM_STARTING_WEAPON; // เริ่มเกมได้ Combat Shotgun เสมอ
  p.doomQuickSwapUsed = false; // Quick Swap: 1 ครั้งต่อเทิร์น
  p.doomCharge = 0;            // ชาร์จสำหรับปลดล็อก Crucible (ครบ 5)
  p.doomChaingunShieldUsed = false; // Chaingun's [ใช้ได้ครั้งเดียว]: รีเซ็ตทุกครั้งที่เปลี่ยนอาวุธ
  // ---------- สึงาชิ ทาคุโตะ (patch 2.2 new) ----------
  p.takutoComboReady = false; // Saphir+Emeraude ร่วมกัน: รอ postAttackFollowup อ่านเพื่อโจมตีเพิ่มอีกครั้ง (patch 2.2.3 — เดิมเก็บเป็นโอกาส 50/50)
  p.takutoUlt2VideoPending = false; // อย่างนายน่ะ จะไปเข้าใจอะไร: รอโจมตีจริงครั้งถัดไปแล้วค่อยเล่นวีดีโอ
  p.takutoAwakenAt = 0;          // สกิลติดตัว 1 กันตายทำงานแล้ว: ลำดับสำหรับเพลง/ภาพซ้อนทับ (ถ้ามีทาคุโตะหลายคน)
  p.tonkatsu = 0;         // เทมาริ: ชามทงคัสสึที่กินสะสม (สูงสุด 3 — Song for you ล้างตอนใช้)
  p.songAtk = 0;          // Song for you: พลังขิงที่ล็อกไว้ตอนใช้สกิล (สูงสุด 2)
  p.noDrawNext = 0;       // จำนวนเทิร์นที่จั่วเพิ่มไม่ได้ เริ่มเทิร์นถัดไป (ทงคัสสึ / กำไรเท่าตัวโว้ย)
  p.noSkillNext = 0;      // จำนวนเทิร์นที่ใช้สกิลไม่ได้ เริ่มเทิร์นถัดไป (หอกลองกินัส เอวา 13)
  p.gamblerUses = GAMBLER_USES; // แกมเบลอร์: วอสก้าหน่อยน้อง 3 ครั้งต่อเกม (เวลาทองรีเซ็ตให้เต็ม)
  p.profit = 0;           // แกมเบลอร์: บัฟกำไรเท่าตัวโว้ย (+โจมตี, ทะลุเกราะ) สะสมจนกว่าจะได้ตี
  p.tempHp = 0;           // แกมเบลอร์: เลือดชั่วคราวจากฮีลล้น
  p.tempHpTurns = 0;      // เลือดชั่วคราวหายเองเมื่อครบ 2 เทิร์น
  p.anataTargets = null;  // เป้าหมาย ANATA WAAAAAAAA (ลับจนกว่าจะเปิดไพ่)
  p.sunriseDrop = 0; // โอเบรอน: จำนวนเทิร์นที่พลังชีวิตจะลดลงเทิร์นละ 1 อัตโนมัติ (หลังโดนฮีล 5)
  p.sleepFresh = false; // หลับไหล: เทิร์นที่เพิ่งโดนกล่อมยังไม่เริ่มนับ/ยังโจมตีได้
  p.appleItem = "drink"; // Apple guy: ของส่งมอบที่เลือกอยู่ (ค่าเริ่มต้น เครื่องดื่มชูกำลัง)
  p.appleAtkBuffs = [];  // Apple guy: บัฟพลังโจมตีจากการมอบของ — 1 หน่วย/ครั้ง (สูงสุด 2 หน่วย) นับถอยหลังแยกกัน 5 เทิร์น/หน่วย
  p.chillDodge = 100;    // Apple guy: อัตราหลบขณะชิวๆครับน้องๆ (%) — รีเซ็ตเมื่อเปิดท่าไม้ตายใหม่
  p.appleGiveUses = CHAR_HOOKS.appleguy.GIVE_USES; // Apple guy: จำนวนใช้ เอาไปสิ (เติมจากสกิลติดตัวเมื่อหลบสำเร็จ — ไม่สามารถซ้อนทับได้ เกินเพดานตัดทิ้ง)
  // ---------- ฟุจิตะ โคโตเนะ (rework 2.3) ----------
  p.piggy = 0;              // กระปุกออมสินน้องหมูน้อย: เงินที่หยอดไว้ (สูงสุด 15 — แปลงเป็นดาเมจผ่าน รัก รักที่สุดเลย)
  p.senaNext = false;       // โดนท่านประธานเซนะจังเจอตัว -> เทิร์นถัดไปสตั้น 1 เทิร์น
  p.kotoneExtraAtk = false; // Self-affirmation Explosion! Love Love: รอ postAttackFollowup อ่านเพื่อโจมตีเพิ่มอีก 1 ครั้ง
  // ---------- เอจิ (patch 2.4 new) ----------
  CHAR_HOOKS.conner.resetCombat(p); // คอนเนอร์: ความเครียดของทุกคน + คำขาดจับกุม/สถานะไล่ล่า/โควตาฟื้นคืนชีพ
  CHAR_HOOKS.byleth.resetCombat(p); // ความรู้/หลักสูตร/ผลทบทวนบทเรียนที่ค้าง + ธงสตั้น-ห้ามสกิลพื้นฐานที่หลักสูตรของไบเลธตั้งไว้ให้คนอื่น
  CHAR_HOOKS.haruka.resetCombat(p); // harukaBasicUses / harukaBleedProcs (โควตารายเทิร์น) + harukaStunPending (สตั้นค้างจากการสวนกลับ)
  CHAR_HOOKS.ippo.resetCombat(p);    // อิปโป: อัตราหลบสะสม / Dempsey Charge / คูลดาวน์รายสกิล
  // ผู้วิงวอน: คลังคำวิงวอน/โควตาสกิล 2 ครั้ง/เทิร์น + ฟิลด์ "ผู้ถูกตราพิพากษา" ซึ่งอยู่ที่ตัวเป้าหมาย (จึงล้างให้ทุกคน)
  CHAR_HOOKS.the_supplicant.resetCombat(p);
  // อรชุน: ประวัติผู้ที่เคยโจมตีอรชุน / คูลดาวน์ Mahapralaya + ธง hasKilled ซึ่งใช้ร่วมกันทุกตัวละคร
  CHAR_HOOKS.arjuna.resetCombat(p);
  CHAR_HOOKS.bat_ben.resetCombat(p); // แบทแมน: ร่างรถแบทโมบิล + โควตากดครั้งเดียวต่อเกม
  CHAR_HOOKS.yui.resetCombat(p);   // ยุย โยชิโอกะ: เพลงที่เล่นแล้ว / คิวชุบชีวิต / ธงกันลูปการจั่วตาม
  CHAR_HOOKS.shido.resetCombat(p); // อิสึกะ ชิโด: ดาเมจที่บันทึกไว้ / กับดักฝากด้วยนะตัวฉัน / คิวเกิดใหม่
  CHAR_HOOKS.dan.resetCombat(p); // โมโรโบชิ ดัน: เป้าหมาย "จงหลบแต่อย่าหนี" / ศิษย์ / สตรีคแพ้แต้มติดกัน
  CHAR_HOOKS.eiji.resetCombat(p); // eijiOrdinal (สแตค Ordinal Scale ของเทิร์นนี้) + eijiDodgeUsedRound (โควตาหลบ 1 ครั้ง/เทิร์น)
  CHAR_HOOKS.muimi.resetCombat(p); // มุยมิ: โควตาเสบียง / สตรีคหัวใจนักสู้ / จำนวนครั้งท่าไม้ตาย
  // ---------- เจ้าแห่งเน็ตบ้าน (patch 1.9) ----------
  p.contractPartner = null; // เจ้าแห่งเน็ตบ้าน: id คู่สัญญาปัจจุบัน (มีได้ 1 คน)
  p.contractWith = null;    // ฝั่งคู่สัญญา: id เจ้าแห่งเน็ตบ้านที่ทำสัญญาด้วย
  p.contractOffer = null;   // ข้อเสนอที่ยื่นไว้ รอเป้าหมายตอบ (id เป้าหมาย)
  p.contractTurns = 0;      // จำนวนเทิร์นที่คู่สัญญาใช้งานมาแล้ว (ครบทุก 3 = ถามต่อสัญญา)
  p.renewPending = false;   // ฝั่งคู่สัญญา: กำลังถูกถามต่อสัญญาในเทิร์นนี้
  p.skillDrain = 0;         // โดนปฏิเสธค่าปรับ: แต้มสกิลจบเทิร์นลด 1 (จำนวนเทิร์นที่เหลือ)
  p.skillDrainPending = 0;  // ค่าปรับเริ่มนับเทิร์นถัดไป (ย้ายเข้า skillDrain ตอนเริ่มเทิร์นใหม่)
  p.healNextTurn = 0;       // เสือนอนกิน: ฟื้นเลือด 1 หน่วยในเทิร์นถัดไป (กรณีไม่มีคู่สัญญา)
  p.unplugHold = null;      // กระชากสายแลน: บัฟที่ถูกถอดชั่วคราว (คืนให้ตอนจบเทิร์น)
  // ---------- ชเรด เอลัน (patch พิเศษ) ----------
  p.shradeForm = false;     // รวมร่างทำนองเพลงแล้ว (อควาเรียน สปาด้า — ถาวร โจมตี +2)
  // (patch พิเศษ: ราตรีของชเรดไม่ถาวรแล้ว — ใช้ nightResetPending รีเซ็ตกลางคืน 3 เทิร์นแทน)
  // ---------- Bard : คีตกวี (patch 2.2) ----------
  p.bardNotes = [];         // โน้ตในช่องประพันธ์เพลง (["R","J",...] สูงสุด 3 — ครบแล้วบรรเลงทันที)
  p.bardNotesUsed = 0;      // จำนวนโน้ตที่เติมในเทิร์นนี้ (จำกัด 2 — มิติโลหิตไม่จำกัด)
  p.bardPending = null;     // บทเพลงที่รอเลือกเป้าหมาย { pattern, name, need, allowSelf }
  p.bloodSection = 0;       // ท่อนทำนองแห่งโลหิต (ครบ 5 = มิติมายาบรรเลงโลหิต)
  p.soulSection = 0;        // ท่อนทำนองแห่งวิญญาณ (ครบ 5 = มิติมายาบรรเลงวิญญาณ)
  p.bardLinks = {};         // Resonance: คู่เชื่อมแยกตาม id Bard เจ้าของบทเพลง
  // ---------- ไค ชิซากิ (kai) ----------
  p.kaiLinkWith = null;     // เชื่อมต่อ (Overhaul#1): id คู่เชื่อม (มิเรอร์กัน — แยกจาก linkedWith ของ Bard)
  p.kaiRivalId = null;      // โทสะระงับด้วยโทสะ (Overhaul#3): id คู่ปรับที่ถูกบังคับโจมตี
  p.kaiSkillUsesRound = 0;   // มือซ้ายแห่งการรังสรรค์/มือขวาแห่งการลงทัณฑ์: งบรวม 2 ครั้งต่อเทิร์น ผสมกันได้อิสระ (เช่น รังสรรค์ 2 ครั้ง, หรือ 1+1)
  // ---------- ผู้สังหารเมจ (mageslayer) ----------
  p.mageslayerMarkedId = null;      // ตราล่าเวท: id เป้าหมายที่มาร์กอยู่ (เคลื่อนย้ายได้)
  p.mageslayerMarks = {};
  p.kaiMarksBy = {};
  p.moonMarksBy = {};
  p.mageslayerHasMarked = false;    // เคยใช้ Witch Mark หรือยัง (ถาวร — ขับเคลื่อนภาพโปรไฟล์ MS01→MS02)
  p.mageslayerWitchMarkReadyRound = 0; // Witch Mark: รอบที่กลับมาใช้ได้หลังคูลดาวน์ 2 เทิร์น
  p.mageslayerBurdenReadyRound = 0; // Mana Burden: รอบที่กลับมาใช้ได้หลังคูลดาวน์ 7 เทิร์น
  p.mageslayerMarkTick = 0;         // ตราล่าเวท: ตัวนับ "ทุก 2 เทิร์นขโมย 1 หน่วย"
  // ---------- ทาคุมิ ฟุจิวาระ (takumi) ----------
  p.takumiGear = 1;             // เกียร์ธรรมดา: 1-6 เริ่มเกม 1
  p.takumiSkillUsesRound = 0;   // งบสกิลรวม 5 ครั้ง/เทิร์น (พื้นฐาน/รอง/ท่าไม้ตาย ผสมกันได้อิสระ)
  p.takumiBlackoutFired = false; // ถึงจะมองไม่เห็น แต่ฉันยังอยู่: กันยิงซ้ำระหว่างสถานะเดียวกันยังทำงานอยู่
  // ---------- เรียวกิ ชิกิ (patch 2.0.6) ----------
  //  p.shikiUlt คงไว้ตามที่เลือกตอนเข้าห้อง (deatheye | wither) — ไม่รีเซ็ตระหว่างแมตช์
  p.witherAddedBy = {};     // เส้นชีวิตที่ความตายที่โรยราแจก แยกตาม id ชิกิเจ้าของท่า
  // ---------- โอกูริ แคป (Rework) ----------
  p.oguriEnergy = OGURI_ENERGY_START; // Energy: เริ่มเกมได้รับ 8 แต้ม (สะสมสูงสุด 16)
  p.stamina = 0;             // Stamina ชาร์จ: เริ่มเกม 0 หน่วย ได้รับอัตโนมัติทุกเทิร์น
  p.oguriChargeCapBonus = 0; // ความจุ Stamina ชาร์จที่เพิ่มจาก Training (สะสมสูงสุด +48)
  p.oguriZoneTurns = 0;     // นับเทิร์นระหว่างร่าง Zone (แต้มสกิล +1 ทุก 2 เทิร์น)
  p.staggerNext = 0;        // ติดชะงักตอนเริ่มเทิร์นถัดไป (จาก The Beat of Victory)
  // ---------- ซาโตรุ อาเคฟุ (patch 2.0.8.2) ----------
  p.maxHpPenalty = 0;       // Locacaca fruit: Max HP ที่ถูกลดถาวร (ของทุกคน — โดนผลไม้ได้)
  p.wouGuardCd = 0;         // สกิลติดตัวลบล้าง — คูลดาวน์ 2 เทิร์นต่อการใช้ (patch 2.0.8.3)
  p.calamityDraw = 0;       // [Calamity]: จำนวนไพ่ที่ถูกบังคับจั่วตอนเริ่มเทิร์นถัดไป
  p.locaOffer = null;       // ข้อเสนอผลโลกากากาที่ยื่นไว้ รอเป้าหมายตอบ (id เป้าหมาย)
  // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9) ----------
  p.allyPrompt = false;      // Event เริ่มเกม: รอริดดี้เลือกยื่นข้อเสนอพันธมิตร/เดินเส้นทางเดี่ยว
  p.allyOffer = null;        // ข้อเสนอพันธมิตรที่ยื่นไว้ รอบานาจตอบ (id เป้าหมาย)
  p.allyId = null;           // พันธมิตรบันชี × ยูนิคอร์น (ลิงก์ทั้งสองฝั่ง — ฝั่งริดดี้และฝั่งบานาจ)
  p.allyBreakAsk = null;     // ถูกคู่พันธมิตรตี -> รอเลือกยกเลิกพันธมิตรไหม { by, hp, armor }
  p.allyFinalAsk = false;    // เหลือแค่คู่พันธมิตรบนสนาม -> ริดดี้เลือกชนะทั้งคู่/สู้ต่อ
  p.riddheGrudge = 0;        // สกิลติดตัว 1: นับเทิร์นที่บานาจไม่โจมตีเรา (ครบ 3 = NT-D ฟรี)
  p.riddhePassiveUsed = false; // สกิลติดตัว 1: ท่าไม้ตายฟรีใช้ไปแล้ว (1 ครั้งต่อเกม)
  p.riddheAvenger = false;   // สกิลติดตัว 3 ทริกเกอร์แล้ว (ถาวร: โจมตี +1 / สกิลติดตัว 1 ใช้กับทุกคน / ร่างดำมืด / ท่า 1 ไม่เติมกระสุน)
  p.riddheGuardArmorLost = 0; // ท่าไม้ตาย 2: เกราะที่เสียสะสม (เรา+บานาจ) ระหว่างท่าทำงาน
  p.riddheGuardHealed = false; // ท่าไม้ตาย 2: ฟื้นเกราะ+วีดีโอพิเศษทำงานแล้ว (ครั้งเดียวต่อการเปิด)
  p.riddheSaveLoggedRound = 0; // กันตายบานาจ: log แจ้งครั้งเดียวต่อเทิร์น
  // ---------- ริต้า เบอร์นัล / ฟีนิกซ์ (patch 2.1.6) ----------
  p.phenexPain = 0;             // ไม่อยากให้ใครต้องเจ็บปวด: ความเจ็บปวดสะสม (ปลดปล่อยตอนตกรอบจริง)
  p.phenexReborn = false;       // ถ้าเลือกได้ อยากเกิดเป็นอะไรหรอ?: เกิดใหม่ไปแล้วหรือยัง (1 ครั้งต่อเกม)
  p.phenexNtdPermanent = false; // เปิด NTD-Sytem ถาวรฟรีจากสกิลติดตัว 1 (แทนสถานะนับเทิร์นปกติ)
  p.phenexLastHitBy = null;     // id ผู้โจมตีล่าสุดที่ทำให้เสียเลือด/เกราะ — ใช้เลือกเป้าปลดปล่อยความเจ็บปวด
  p.phenexReleaseAsk = null;    // ขอแค่ได้พบกันอีก: รอเลือกเป้าหมายปลดปล่อยความเจ็บปวด { pain, options: [id] }
  p.phenexTauntGrace = false;   // ไม่อยากให้ใครต้องเจ็บปวด: ตายเทิร์นที่ท่าไม้ตายหมดเวลาพอดี ยังนับว่าตายขณะทำงาน (patch 2.1.7)
  p.nightTaxTier = null;        // กลางคืน (patch 2.1.7): สกิลที่สุ่มโดนคืนนี้ใช้แต้มมากขึ้น +1 ("basic" | "secondary" | null)
  p.evadeStacks = [];            // หลบหลีก (สถานะ Universal): แต่ละสแตคมีอายุ EVADE_STACK_TURNS เทิร์นของตัวเอง
  p.fortuneIdle = 0;             // โชคลาภ (Bard patch 2.1.7): นับเทิร์นที่ไม่ได้ใช้ (ครบ 3 = หมดฤทธิ์เอง)
  p.tohnoLevel = 1;              // โทโนะ ชิกิ (patch 2.1.7): ระดับมีดพับประจำตระกูล 1-5 (1 = ปิดสกิลติดตัว, ค่าเริ่มต้น)
  // ---------- นานายะ ชิกิ (patch 2.1.9) ----------
  p.nanayaEyeOn = false;          // Mystic eye of death perception: เปิด/ปิดได้ระหว่างเกม (ค่าเริ่มต้นปิด)
  p.nanayaToggleUsed = false;     // เปิด/ปิดได้แค่ 1 ครั้งต่อเทิร์น (รีเซ็ตทุกเทิร์นใหม่)
  p.nanayaMissedThisAttack = false; // ใช้ภายในการโจมตีปัจจุบัน: เนตรมารพลาด -> เปิดโอกาสหัวใจฆาตกร
  p.nanayaReattackReady = false;  // หัวใจฆาตกร: กำลังรอเลือกโจมตีซ้ำ/ยกเลิกอยู่
  p.nanayaRestTurn = 0;           // พักผ่อนสักครู่: นับเทิร์น (ครบ 2 = ฟื้นเลือด)
  // ---------- เทเปา (ชิกิ) (patch 2.2 new) ----------
  p.tepeuCookTurns = 0;   // วันนี้อากาศดีจัง: นับถอยหลังทำอาหาร (0 = ไม่ได้ทำอยู่ กดใช้ได้)
  p.tepeuPonderTurns = 0; // เป็นแบบนี้นี่เอง: นับถอยหลังครุ่นคิด (0 = ไม่ได้ครุ่นคิดอยู่ กดใช้ได้/จั่วไพ่ได้)
  p.tepeuEyeTurns = 0;    // นายเป็นคนทำตัวเองนะ: ฉากหลัง/เพลงจบ (แบบโทโนะ ชิกิ) คงอยู่กี่เทิร์น
  p.tepeuLoseStreak = 0;  // แพ้ติดกันกี่เทิร์นแล้ว (ครบเกิน 3 = เส้นชีวิตลด 1 — รีเซ็ตทุกครั้งที่ชนะ)
  p.tepeuKillTargetId = null; // นายเป็นคนทำตัวเองนะ: เป้าหมายที่เล็งไว้ รอผลหลังเปิดไพ่ (afterResolve)
  // ---------- อาริมะ มิยาโกะ (patch 2.2.0) ----------
  p.miyakoComboHits = 0;          // เพลงหมัด อาริมะ: จำนวนครั้งที่ตีไปแล้วในคอมโบปัจจุบัน
  p.miyakoKillResist = 0;         // นั่นพี่จ๋าหรอ?: จำนวนชั้นที่สะสม (ลดโอกาสถูกสังหารทันที 40%/ชั้น)
  // ---------- คิชินามิ ฮาคุโนะ (patch 2.2.1) ----------
  p.hakunoGender = "male";        // เธอ/นาย คือฉันหรอ?: เพศปัจจุบัน (male | female — เริ่มเกมเป็นชายเสมอ)
  p.hakunoGenderSwitched = false; // สลับเพศได้อีก 1 ครั้งในเทิร์นนี้หรือยัง
  p.hakunoRestTurn = 0;           // ร่างชาย: นับเทิร์น (ครบ 2 = ฟื้นเลือด)
  p.hakunoMoonPoints = 0;         // แต้มคำสาปแห่งดวงจันทร์ สะสม (ครบ 3 = เปิด MOON*CELL ได้)
  p.hakunoLowDraw = false;        // ข้าขอบัญชา (หญิง): จั่วเพิ่มเทิร์นนี้ได้แค่ 2/3 แต้ม
  p.hakunoCommandUses = HAKUNO_COMMAND_USES; // อาคมบัญชาระดับ EX+: ใช้ได้ 3 ครั้งต่อเกม
  p.moonCellBackup = null;        // MOON*CELL: บัฟ/ดีบัฟที่ถูกล้างไว้ชั่วคราวของผู้เล่นอื่น (คืนให้ตอนหมดฤทธิ์)
  // ---------- แบทแมน (เบน แอฟเฟล็ก) (patch 2.2.7) ----------
  p.batNightSaveUsedAt = null; // อัศวินรัตติกาล: กันตายใช้ไปแล้วในคืนที่เท่าไหร่ (null = ยังไม่ใช้เลย)
  p.batKarmaAsk = null;        // นายลืมของน่ะ: รอเลือกเป้าหมายส่งต่อความเสียหาย { dmg, from, options: [id] }
  p.cutsceneShown = {}; // เล่นวีดีโอครั้งเดียวต่อเกม (per match)
  // เลือด/เกราะเริ่มเกม: คำนวณหลังรีเซ็ต statuses/maxHpPenalty/hakunoGender แล้วเท่านั้น
  // (maxHpOf/maxArmorOf อ่านค่าพวกนี้ — คำนวณก่อนหน้านั้นจะติดค่าเก่าจากแมตช์ที่แล้ว)
  p.hp = maxHpOf(p);
  p.armor = maxArmorOf(p);
  if (p.characterId === "hisakawa_sister") CHAR_HOOKS.hisakawa_sister.init(p);
}


// ============================================================
//  ส่งสถานะ
// ============================================================
// สถานะที่ผู้เล่นคนอื่นเห็นได้ระหว่างช่วงจั่วการ์ด (patch 1.7.1): โชว์ให้ดูของกันและกันได้
//  ยกเว้นสกิลหลังเปิดไพ่ที่เพิ่งกดรอไว้ในเทิร์นนี้ — เปิดเผยเมื่อทำงานแล้วเท่านั้น (กันสปอยล์)
const HIDDEN_UNTIL_REVEAL = [
  "beam", "ohger", "absorb", "spear", "nightmare", "beamplus", "unibeam2",
  "escanorSpearBurst", "escanorFlare", "escanorFlareNoon", "escanorPunch", "escanorRhitta", "escanorRhittaNoon",
];
function publicStatuses(p) {
  const out = {};
  for (const [k, v] of Object.entries(p.statuses || {})) {
    if (TRANSFORMS[k] && TRANSFORMS[k].afterReveal && !(p.seen && p.seen[k])) continue;
    if (HIDDEN_UNTIL_REVEAL.includes(k)) continue;
    out[k] = v;
  }
  if (p.ntdTarget || p.ntdRivalId) out.ntd = 1;
  return out;
}
function buildStateFor(viewerId) {
  const revealAll = gameState !== "PLAYING" && gameState !== "LOBBY" && gameState !== "TEAM_MODE" && gameState !== "TEAM_SETUP";
  // เพลง ANATA WAAAAAAAA ทับทุกเพลงระหว่างช่วงจั่วการ์ด — จบลงเมื่อทุกคนพร้อมเปิดไพ่แล้ว
  const nightNow = isNightRound(roundNumber);
  // ราตรีกลืนกิน: เปิดเมื่อโอเบรอนใช้ท่าไม้ตาย 2 (Lie Like Vortigern) — ฉากหลังกลางคืนกลายเป็น
  //  วีดีโอ oberon_background.mp4 + เพลงประจำตัวเล่นค้าง และหายไปเมื่อหมดกลางคืน
  const oberonBg = nightNow && oberonDevour > 0;
  // ราตรีถาวรของชเรด เอลัน: ฉากหลังกลายเป็น change_fill.jpg จนกว่าชเรดจะหมดสภาพต่อสู้
  const shradeBg = CHAR_HOOKS.shrade_elan.bgActive(engine); // กลางคืน + มีชเรดร่างสปาด้า = ฉากหลังราตรีของชเรด
  // MOON*CELL (คิชินามิ ฮาคุโนะ patch 2.2.1): ฉากหลังกลายเป็น hakuno_fill.jpg ระหว่างท่าไม้ตายทำงาน
  const hakunoBg = Object.values(players).some((p) => p.characterId === "hakuno" && (p.statuses.moonCell || 0) > 0);
  const hisakawaBg = Object.values(players).some((p) => p.alive && p.characterId === "hisakawa_sister" && (p.statuses.hisakawaDream || 0) > 0);
  // ฉันมองเห็นมันแล้ว (ชิกิ): ภาพ shiki_fill.png ซ้อนทับฉากหลัง | ความตายที่โรยรา: ฉากหลังวีดีโอ shiki_fill2.mp4
  //  โทโนะ ชิกิ (patch 2.1.7): มีดพับประจำตระกูล ระดับ 2 ขึ้นไป — ใช้ภาพซ้อนทับเดียวกับ "eye" (shiki_fill.png)
  //  นานายะ ชิกิ (patch 2.1.9): Mystic eye of death perception เปิดใช้งาน — ใช้ภาพซ้อนทับเดียวกัน (shiki_fill.png)
  const shikiBg = Object.values(players).some((p) => p.alive && p.characterId === "shiki" && (p.statuses.wither || 0) > 0)
    ? "wither"
    : Object.values(players).some((p) => p.alive && (
        (p.characterId === "shiki" && (p.statuses.deatheye || 0) > 0) ||
        (p.characterId === "tohno" && (p.tohnoLevel || 1) >= 2) ||
        (p.characterId === "nanaya" && p.nanayaEyeOn) ||
        (p.characterId === "tepeu" && (p.tepeuEyeTurns || 0) > 0) ||
        (p.characterId === "princess_shiki" && (p.statuses.pshikiUlt || 0) > 0)
      ))
      ? "eye" : null;
  // มิติมายาบรรเลง (Bard): ฉากหลังเปลี่ยนตามสายมิติ "blood" | "soul" | null
  const bardCycleNow = CHAR_HOOKS.bard.dimCycle(engine);
  const bardBg = bardCycleNow === "day" ? "blood" : bardCycleNow === "night" ? "soul" : null;
  // ยูนะ: เพลงล็อกทั้งสนาม ชนะทุกอย่างรวมถึง ANATA WAAAAAAAA ตลอด "ทุกเฟส" ของรอบ (จั่วไพ่/สรุปคะแนน/โจมตี) จนกว่าจะหมดเวลา
  //  ไม่ผูกกับ gameState==="PLAYING" เหมือน anata เพราะเอฟเฟกต์ยูนะไม่ได้จำกัดแค่ช่วงจั่วไพ่ — ตอน CUTSCENE ฝั่ง client เงียบเพลงเองอยู่แล้วไม่ต้องกันซ้ำที่นี่
  //  เอจิ: ท่าไม้ตาย ไม่ว่ายังก็ตาม เป็นคนบังคับเปิดสนาม Break Beat Bark! เอง — เพลงจึงเป็นลำดับ
  //  eiji_skill3_connect.m4a แล้วต่อด้วย Break Beat Bark!.mp3 วนลูป (MUSIC_SEQUENCES ฝั่ง client)
  const eijiUltOwner = Object.values(players).find((p) => p.alive && CHAR_HOOKS.eiji.ultActive(p));
  let sm = (overloadForceActive && gameState !== "CUTSCENE")
    ? { music: "overload_force", at: overloadForceSeq }
    : eijiUltOwner
    ? { music: "eiji_ult", at: eijiUltOwner.transformAt || 0 }
    : (yunaEffect && roundNumber <= yunaWindowEnd)
    ? { music: YunaMod.YUNA_MUSIC[yunaEffect], at: yunaMusicSeq }
    : (gameState === "PLAYING" && anataMusicSeq)
      ? { music: "temari_final_theme", at: anataMusicSeq }
      : activeSkillMusic();
  if (!sm && oberonBg) sm = { music: "oberon", at: oberonDevour }; // เพลงสกิล/ท่าไม้ตายอื่นยังทับได้
  // ข้อเสนอ/คำถามต่อสัญญา (เจ้าแห่งเน็ตบ้าน) ที่รอ "ผู้ชม state คนนี้" ตอบ — โชว์เฉพาะช่วงจั่วการ์ด
  const viewer = players[viewerId];
  let contractOffer = null;
  let connorArrestAsk = null; // คอนเนอร์ RK800: คำขาดจับกุมขั้นเด็ดขาดที่รอผู้ชมคนนี้ตอบ
  let renewAsk = null;
  let locaOffer = null;
  if (gameState === "PLAYING" && viewer && viewer.alive) {
    const offerer = Object.values(players).find((o) => o.alive && o.contractOffer === viewerId);
    // คอนเนอร์ RK800: คำขาด "ยอมจำนน / ขัดขืน" ที่ยื่นมาที่เรา
    if (viewer.connorArrestAsk) {
      const from = players[viewer.connorArrestAsk.fromId];
      if (from && from.alive) {
        connorArrestAsk = {
          fromId: from.id, from: from.name,
          color: POSITION_COLORS[from.position] || "#C0392B",
          img: CHAR_HOOKS.conner.IMG.skill2,
        };
      }
    }
    if (offerer) contractOffer = { fromId: offerer.id, from: offerer.name, color: POSITION_COLORS[offerer.position] || "#9B4F96", img: "/characters/broadband_man/broadband_man_skill3.jpg" };
    if (viewer.renewPending) {
      const boss = CHAR_HOOKS.broadband_man.contractBoss(engine, viewer);
      if (boss) renewAsk = { from: boss.name, fee: CONTRACT_FEE, color: POSITION_COLORS[boss.position] || "#9B4F96", img: "/characters/broadband_man/broadband_man.jpg" };
    }
    // Locacaca fruit (ซาโตรุ patch 2.0.8.2): ข้อเสนอผลไม้ที่รอผู้ชม state คนนี้ตอบ
    const locaFrom = Object.values(players).find((o) => o.alive && o.locaOffer === viewerId);
    if (locaFrom) locaOffer = { fromId: locaFrom.id, from: locaFrom.name, steal: CHAR_HOOKS.satoru.LOCA_STEAL, color: POSITION_COLORS[locaFrom.position] || "#9B4F96", img: "/characters/satoru/locaca.png" };
  }
  // ริต้า เบอร์นัล: ขอแค่ได้พบกันอีก — เลือกเป้าหมายปลดปล่อยความเจ็บปวด (ใช้ได้แม้ตกรอบไปแล้ว/ทุกเฟส)
  let phenexReleaseAsk = null;
  if (viewer && viewer.phenexReleaseAsk) {
    const options = viewer.phenexReleaseAsk.options
      .map((id) => players[id])
      .filter((o) => o && o.alive)
      .map((o) => ({ id: o.id, name: o.name, color: POSITION_COLORS[o.position] || "#9B4F96", img: displayImg(o) }));
    if (options.length) phenexReleaseAsk = { pain: viewer.phenexReleaseAsk.pain, options };
  }
  // แบทแมน: นายลืมของน่ะ — เลือกเป้าหมายส่งต่อความเสียหายที่รับไว้ (ทุกเฟส เหมือนของริต้า เบอร์นัล)
  let batKarmaAsk = null;
  if (viewer && viewer.batKarmaAsk) {
    const options = viewer.batKarmaAsk.options
      .map((id) => players[id])
      .filter((o) => o && o.alive)
      .map((o) => ({ id: o.id, name: o.name, color: POSITION_COLORS[o.position] || "#9B4F96", img: displayImg(o) }));
    if (options.length) batKarmaAsk = { dmg: viewer.batKarmaAsk.dmg, options };
  }
  // สมุดการ์ดกองกลาง: การ์ดทั้ง 43 ใบตามลำดับคงที่ + ใบไหนถูกจั่วไปแล้วในรอบนี้ (centralDeck สับใหม่ทุกรอบ — สมุดนี้จึงนับเฉพาะรอบปัจจุบัน)
  const remainingCardKeys = new Set(centralDeck.map(cardKey));
  const deckLedger = canonicalDeckCards().map((c) => ({ ...c, drawn: !remainingCardKeys.has(cardKey(c)) }));
  // คอนเนอร์ RK800: มีคอนเนอร์อยู่ในแมตช์นี้ไหม (มิเตอร์ความเครียดโผล่บน UI เฉพาะตอนมี)
  const connorInMatch = !!CHAR_HOOKS.conner.connerSlot(engine);
  // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9): popup ระบบพันธมิตร (ดู characters/riddhe.js's buildViewerState) ----------
  let allyChoices = null, allyOfferAsk = null, allyBreakAskUi = null, allyFinalAskUi = null;
  if (gameState === "PLAYING" && viewer && viewer.alive) {
    ({ allyChoices, allyOfferAsk, allyBreakAsk: allyBreakAskUi, allyFinalAsk: allyFinalAskUi } =
      CHAR_HOOKS.riddhe.buildViewerState(engine, viewer, RIDDHE_BANSHEE_IMG));
  }
  return {
    allyChoices,   // ริดดี้: รายชื่อบานาจให้เลือกยื่นข้อเสนอพันธมิตร
    allyOfferAsk,  // บานาจ: ข้อเสนอพันธมิตรที่รอเราตอบ
    allyBreakAsk: allyBreakAskUi, // ฝ่ายถูกคู่พันธมิตรตี: เลือกยกเลิกพันธมิตรไหม
    allyFinalAsk: allyFinalAskUi, // ริดดี้: เหลือแค่คู่พันธมิตร — คงพันธมิตร = ชนะทั้งคู่
    allyWin: allyWinFlag,         // จบเกมแบบชนะทั้งคู่ (สกิลติดตัว 2 ริดดี้)
    connorArrestAsk, // คอนเนอร์ RK800: คำขาด "ยอมจำนน / ขัดขืน" ที่รอเราตอบ (ไม่ตอบก่อนเปิดไพ่ = ขัดขืน)
    contractOffer, // ข้อเสนอสัญญาที่รอเราตอบ (สนใจใช้บริการเราไหม)
    renewAsk,      // คำถามต่อสัญญาที่รอเราตอบ (ชำระค่าบริการ)
    locaOffer,     // ข้อเสนอผลโลกากากาที่รอเราตอบ (ซาโตรุ)
    phenexReleaseAsk, // ริต้า เบอร์นัล: เลือกเป้าหมายปลดปล่อยความเจ็บปวด (ขอแค่ได้พบกันอีก)
    batKarmaAsk,      // แบทแมน: เลือกเป้าหมายส่งต่อความเสียหาย (นายลืมของน่ะ)
    // นานายะ ชิกิ (patch 2.1.9): หัวใจฆาตกร — กำลังรอเลือกโจมตีซ้ำ/ยกเลิกอยู่ (เฉพาะผู้เล่นที่เป็นเจ้าของสิทธิ์นี้)
    nanayaReattack: !!(viewer && viewer.nanayaReattackReady && gameState === "ATTACK" && attackerId === viewer.id),
    gameState,
    gameMode,
    teamSize,
    teamCount,
    teamOptions: currentTeamOptions(),
    modeOptions: modeOptionsFor(),
    modeVotes: modeVoteSummary(),
    winningTeamId,
    timeLeft,
    roundNumber,
    overloadForce: overloadForceActive,
    yuukiAlive: !!yuukiBoss(),
    yuukiVictory: !!yuukiBoss() && yuukiWinShown,
    overloadVictory: gameMode === "overload" && yuukiDefeated,
    deckEmpty: centralDeck.length === 0,
    cycle: nightNow ? "night" : "day", // กลางวัน/กลางคืน (สลับทุก 3 เทิร์น)
    oberonBg,
    shradeBg, // ราตรีของชเรด เอลัน (ฉากหลัง change_fill.jpg — ทุกค่ำคืนที่ยังอยู่ในร่างสปาด้า)
    hakunoBg, // MOON*CELL (คิชินามิ ฮาคุโนะ): ฉากหลัง hakuno_fill.jpg ระหว่างท่าไม้ตายทำงาน
    hisakawaBg, // ฝันของเหล่าฝาแฝด: ฉากหลัง O-KU-RI-MO-NO-Sunday
    bardBg,   // มิติมายาบรรเลง (Bard): "blood" | "soul" | null
    shikiBg,  // ฉันมองเห็นมันแล้ว (ชิกิ): ซ้อน shiki_fill.png ทับฉากหลังปัจจุบัน
    maxPlayers: MAX_PLAYERS,
    youId: viewerId,
    attackerId: gameState === "ATTACK" ? attackerId : null,
    winnerId: (gameState === "SUMMARY" || gameState === "ATTACK") ? roundWinnerId : null,
    skillMusic: sm ? sm.music : null,
    skillMusicSeq: sm ? sm.at : 0, // เปลี่ยน = การเปิดร่างครั้งใหม่ -> client เริ่มเพลงใหม่
    // อาจารย์ ไบเลธ: ออร่าขอบจอตามหลักสูตรที่เปิดอยู่ (normal/ex/end — คนละสีกัน) เกตเดียวกับผลจริงของหลักสูตร
    bylethFieldFx: (() => {
      const owner = Object.values(players).find((o) => o.alive && o.characterId === "byleth" && o.bylethCourse && !passiveSealed(o));
      return owner ? owner.bylethCourse : null;
    })(),
    // คอนเนอร์ RK800: ออร่าขอบจอแดงระหว่างการไล่ล่า + สกอร์ดวลให้ทุกคนเห็น (เกตเดียวกับผลจริงของโหมดไล่ล่า)
    connorFieldFx: CHAR_HOOKS.conner.fieldFx(engine),
    connorChase: (() => {
      const owner = CHAR_HOOKS.conner.chaseOwner(engine);
      if (!owner) return null;
      const t = players[owner.connorChase.targetId];
      return {
        byId: owner.id, by: owner.name,
        targetId: owner.connorChase.targetId, target: t ? t.name : "",
        round: owner.connorChase.round, rounds: CHAR_HOOKS.conner.CHASE_ROUNDS,
        mine: owner.connorChase.mine, theirs: owner.connorChase.theirs,
      };
    })(),
    yunaFieldFx: yunaBeatBarkActive() ? "beatbark" : null, // Break Beat Bark!: ออร่าขอบจอแดงทั้งสนาม (เกตเดียวกับผลจริง)
    // onlyFor: คลิปที่เล่นให้เฉพาะบางคนดู — คนนอกลิสต์ได้ null (หน้าจอไม่เล่นวีดีโอ แต่ยังรอครบเวลาเท่ากัน)
    cutscene: (gameState === "CUTSCENE" && cutsceneInfo && (!cutsceneInfo.onlyFor || cutsceneInfo.onlyFor.includes(viewerId)))
      ? cutsceneInfo : null,
    attack: gameState === "ATTACKING" ? lastAttack : null,
    log: (gameState === "SUMMARY" || gameState === "TRANSITION" || gameState === "GAMEOVER") ? lastLog : [],
    shop: shopItems, // ร้านค้ามายา (patch 2.3): สินค้าส่วนกลางร้านเดียว เห็นเหมือนกันทุกคน
    deckLedger, // สมุดการ์ด 43 ใบ + สถานะจั่วแล้ว/ยัง (ของรอบปัจจุบัน) — กดที่กองการ์ดกลางเพื่อดู
    players: Object.values(players).map((p) => {
      const mine = p.id === viewerId;
      const show = mine || revealAll;
      // ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ ทำงานอยู่ — บังตากระดานทั้งหมด (score/cards/hp/armor/shield ของทุกคนรวมตัวเอง, แต้มสกิลของทุกคนยกเว้นตัวเอง)
      const takumiBlackout = takumiBlackoutActive();
      // "ตาบอด" (สถานะ Universal patch 3.4 / ผลพ่วงของ "ลงทัณฑ์"): ผู้ที่ติดสถานะมองไม่เห็นอะไรเลย
      //  ใช้ช่องทางบังตาเดียวกับท่าไม้ตายของทาคุมิ ต่างกันที่นี่บังเฉพาะ "ผู้ชม" คนที่ตาบอด ไม่ใช่ทั้งสนาม
      const viewerBlind = !!viewer && (blindActive(viewer) || CHAR_HOOKS.the_supplicant.blindActive(viewer));
      const blackout = takumiBlackout || viewerBlind;
      // ใบโปรโมทสินค้า (Apple guy): แต้มการ์ดของคนติดสถานะถูกเปิดเผยให้ทุกคนเห็น (1 เทิร์น)
      const promoShow = (p.statuses.promo || 0) > 0;
      // นายยังมีอนาคตอีกยาวไกล (ริดดี้ patch 2.0.9): คู่พันธมิตรเห็นแต้มการ์ดของกันและกันได้ตลอด
      const allyShow = !!(viewer && viewer.alive && p.alive && p.allyId === viewer.id && viewer.allyId === p.id);
      // คอนเนอร์ RK800 (สกิลพื้นฐาน วิเคราะห์สถานการณ์): เทิร์นนี้เห็นไพ่และแต้มของทุกคน (เห็นคนเดียว ไม่แชร์ให้ใคร)
      const ch = CHAR_BY_ID[p.characterId] || {};
      const pub = (s) => (s ? { name: s.name, desc: s.desc, cost: s.cost, img: s.img, ammo: s.ammo } : null);
      // สกิลพื้นฐานสลับกลางคืน (โคโตเนะ) + Apple guy: ปกสกิลพื้นฐานเปลี่ยนตามของส่งมอบที่เลือกอยู่
      let basicPub = pub(nightNow && ch.basicNight ? ch.basicNight : ch.basic);
      if (basicPub && p.characterId === "appleguy") basicPub.img = (CHAR_HOOKS.appleguy.ITEMS[p.appleItem] || CHAR_HOOKS.appleguy.ITEMS.drink).img;
      let secondaryPub = pub(nightNow && ch.secondaryNight ? ch.secondaryNight : ch.secondary);
      let ultimatePub = pub(nightNow && ch.ultimateNight ? ch.ultimateNight : ch.ultimate);
      // ชเรด เอลัน: หลังรวมร่าง — สกิลพื้นฐาน/รองเปลี่ยนเป็นเวอร์ชันสปาด้า และปุ่มท่าไม้ตายเป็น แด่เพื่อนรักของฉัน
      if (ch.id === "shrade_elan" && p.shradeForm) {
        basicPub = pub(ch.basic2);
        secondaryPub = pub(ch.secondary2);
        ultimatePub = pub(ch.ultimate2);
      }
      // เรียวกิ ชิกิ: ท่าไม้ตายตามที่เลือกไว้ตอนเลือกตัว + ระหว่างความตายที่โรยรา ปกสกิล 1 เปลี่ยน
      if (ch.id === "shiki") {
        ultimatePub = pub((p.shikiUlt || "deatheye") === "wither" ? ch.ultimate2 : ch.ultimate);
        if (basicPub && (p.statuses.wither || 0) > 0) basicPub.img = "/characters/shiki/shiki_skill1.2.webp";
      }
      // คิชินามิ ฮาคุโนะ (patch 2.2.1): สกิลรองสลับตามเพศ + ปกสกิลพื้นฐาน (เธอ/นาย คือฉันหรอ?) โชว์ภาพเพศตรงข้ามเสมอ
      if (ch.id === "hakuno") {
        secondaryPub = pub(p.hakunoGender === "female" ? ch.secondary2 : ch.secondary);
        if (basicPub) basicPub.img = p.hakunoGender === "female" ? "/characters/hakuno/profile/hakuno_male.png" : "/characters/hakuno/profile/hakuno_female.webp";
      }
      // ไรโด ฮิคารุ (patch 2.1.3): ระหว่างร่าง Ginga — สกิลพื้นฐานเปลี่ยนเป็น UPG! / ระหว่างร่าง Ginga Strium — สกิลรองเปลี่ยนเป็นลำแสงสโตเรียม
      if (ch.id === "hikaru") {
        basicPub = pub(((p.statuses.ginga || 0) > 0 || (p.statuses.gingastrium || 0) > 0) ? ch.basic2 : ch.basic);
        secondaryPub = pub((p.statuses.gingastrium || 0) > 0 ? ch.secondary2 : ch.secondary);
      }
      if (ch.id === "escanor") {
        basicPub = pub(CHAR_HOOKS.escanor.dynamicSkillFor(engine, p, ch, "basic"));
        secondaryPub = pub(CHAR_HOOKS.escanor.dynamicSkillFor(engine, p, ch, "secondary"));
        ultimatePub = pub(CHAR_HOOKS.escanor.dynamicSkillFor(engine, p, ch, "ultimate"));
      }
      if (ch.id === "hisakawa_sister") {
        basicPub = pub(CHAR_HOOKS.hisakawa_sister.dynamicSkillFor(p, ch, "basic"));
        secondaryPub = pub(CHAR_HOOKS.hisakawa_sister.dynamicSkillFor(p, ch, "secondary"));
        ultimatePub = pub(CHAR_HOOKS.hisakawa_sister.dynamicSkillFor(p, ch, "ultimate"));
      }
      if (ch.id === "ignis") {
        basicPub = pub(CHAR_HOOKS.ignis.dynamicSkillFor(p, ch, "basic"));
        secondaryPub = pub(CHAR_HOOKS.ignis.dynamicSkillFor(p, ch, "secondary"));
        ultimatePub = pub(CHAR_HOOKS.ignis.dynamicSkillFor(p, ch, "ultimate"));
      }
      // ฟุจิตะ โคโตเนะ (rework 2.3): ร่าง [พร้อมลุย] ทับปุ่มทั้ง 3 ช่องด้วยท่าไม้ตาย 3/4/5 (ทับทั้งกลางวัน/กลางคืน)
      if (ch.id === "kotone") {
        basicPub = pub(CHAR_HOOKS.kotone.dynamicSkillFor(p, ch, "basic", nightNow));
        secondaryPub = pub(CHAR_HOOKS.kotone.dynamicSkillFor(p, ch, "secondary", nightNow));
        ultimatePub = pub(CHAR_HOOKS.kotone.dynamicSkillFor(p, ch, "ultimate", nightNow));
      }
      // แบทแมน (patch 3.1): ขึ้นรถแบทโมบิลแล้ว — ทั้งสามช่องเปลี่ยนเป็นเวอร์ชันรถ
      if (ch.id === "bat_ben" && CHAR_HOOKS.bat_ben.inCar(p)) {
        basicPub = pub(ch.basic2);
        secondaryPub = pub(ch.secondary2);
        ultimatePub = pub(ch.ultimate2);
      }
      // โมโรโบชิ ดัน (patch 2.8 new): สกิลติดตัว "ครูฝึกสุดเหี้ยม" — เป้าหมาย "จงหลบแต่อย่าหนี" แพ้แต้มติดกัน 2 ครั้ง
      //  -> ปุ่มท่าไม้ตายกลายเป็น "อย่าให้ฉันต้องเฆี่ยนตี" (ต้องคิดสูตรเดียวกับ useSkill เป๊ะ ไม่งั้นราคาบนปุ่มไม่ตรงกับที่หักจริง)
      if (ch.id === "dan") {
        ultimatePub = pub(CHAR_HOOKS.dan.dynamicSkillFor(engine, p, ch, "ultimate"));
      }
      // โอกูริ แคป (Rework): ยุคทองครบ 3 + Stamina ชาร์จ 75 ขึ้นไป — ท่าไม้ตายกลายเป็น Ashen Trail
      if (ch.id === "oguri") {
        ultimatePub = pub(oguriAshenReady(p) ? ch.ultimate2 : ch.ultimate);
      }
      // สึงาชิ ทาคุโตะ (patch 2.2 new): Apprivoise! ทำงานแล้ว — สกิลพื้นฐานเปลี่ยนเป็น Star Sword Emeraude ถาวร
      // patch 2.2.5: กันตาย (สกิลติดตัว 1) เคยทำงานไปแล้ว — ท่าไม้ตายเปลี่ยนเป็นร่วมเดินทางไปกับฉันเถอะถาวร (แทนพิชิตแสงดาว)
      if (ch.id === "takuto") {
        if ((p.statuses.apprivoise || 0) > 0) basicPub = pub(ch.basic2);
        ultimatePub = pub(p.beatSaved ? ch.ultimate2 : ch.ultimate);
      }
      // ริดดี้ มาร์เซนาส (patch 2.0.9): ระหว่างเป็นพันธมิตร — ท่าไม้ตายเปลี่ยนเป็นท่า 2 ฉันจะไม่ยอมสูญเสียใครไปอีก
      if (ch.id === "riddhe") {
        ultimatePub = pub(riddheAllied(p) ? ch.ultimate2 : ch.ultimate);
      }
      // บานาจ ลิงก์ (patch 2.1.2): ระหว่างร่าง NewType Paradise — สกิลรอง 1 เปลี่ยนเป็น Beam Magnum เสมอ
      //  ท่าไม้ตายเปลี่ยนเป็นแสงที่ไม่อยู่เพียงลำพัง เฉพาะตอนมีริดดี้เป็นพันธมิตรอยู่ด้วย
      if (ch.id === "banagher") {
        const banagherTransformed = (p.statuses.paradise || 0) > 0;
        secondaryPub = pub(banagherTransformed ? ch.secondary2 : ch.secondary);
        ultimatePub = pub((banagherTransformed && riddheAllied(p)) ? ch.ultimate2 : ch.ultimate);
      }
      // ริต้า เบอร์นัล (patch 2.1.6): ระหว่างฝืนใช้งาน NTD-Sytem — สกิลรองเปลี่ยนเป็นสกิลรอง 2 / เกิดใหม่แล้ว — ท่าไม้ตายเปลี่ยนเป็นท่าไม้ตาย 2 ถาวร
      if (ch.id === "phenex") {
        const ntdOn = (p.statuses.phenexNtd || 0) > 0 || p.phenexNtdPermanent;
        secondaryPub = pub(ntdOn ? ch.secondary2 : ch.secondary);
        ultimatePub = pub(p.phenexReborn ? ch.ultimate2 : ch.ultimate);
      }
      // DoomGuy (patch 2.2 full): สกิลรอง "Weapon" โชว์ชื่อ/ราคา/ภาพตามอาวุธที่ถืออยู่จริง
      if (ch.id === "doomguy") {
        const w = DOOM_WEAPONS[p.doomWeapon] || DOOM_WEAPONS.shotgun;
        const effDesc = {
          explode: "เลือกเป้าหมาย 1 คน ติดสถานะ [ระเบิด] — โดนโจมตีเมื่อไหร่จะระเบิดใส่คนอื่นสุ่ม 2 คน -1",
          lockon: `เลือกเป้าหมาย 1 คน ติด [ล็อคเป้า] แน่นอน — โดนโจมตีครั้งถัดไปแรงขึ้น +${DOOM_LOCKON_BONUS}`,
          drain: `เลือกเป้าหมาย 1 คน ติดสถานะ [โดนดูด] — ดาเมจ ${DOOM_DRAIN_DMG} หน่วยทุกเทิร์น ${DOOM_DRAIN_TURNS} เทิร์น (เจาะเกราะก่อน)`,
          shield: "เพิ่มโล่ของตัวเอง +1 (ใช้ได้ครั้งเดียวต่อการถืออาวุธนี้)",
          bonusdmg: `เลือกเป้าหมาย 1 คน โดนดาเมจเพิ่มเติมทันที -${DOOM_ROCKET_BONUS_DMG}`,
          stun: "เลือกเป้าหมาย 1 คน สตั้น 1 เทิร์น",
          bonusdmg2: `เลือกเป้าหมาย 1 คน โดนดาเมจเพิ่มเติมทันที -${DOOM_BALLISTA_TARGET_DMG}`,
        }[w.effect] || "ไม่มีความสามารถพิเศษ";
        secondaryPub = { name: `Weapon: ${w.name}`, desc: `ถือ ${w.name} อยู่ — โจมตีปกติ${w.pierce ? "เจาะเกราะ" : ""} ${w.atk} หน่วย. ${effDesc}`, cost: w.cost, img: w.img };
      }
      // กระแสเวท/ภาระเวท (สถานะ Universal): ราคาที่โชว์บนปุ่มสกิลต้องตรงกับที่ useSkill() คิดจริง — ไม่งั้นจะโชว์ราคาเก่าทับกับผลกลางคืนไม่ถูกต้อง
      const spellflowAmt = statusAmtOf(p, "spellflow");
      const spellburdenAmt = Math.min(SPELLBURDEN_MAX, statusAmtOf(p, "spellburden"));
      // กลางคืน (patch 2.1.7): สุ่มแล้วให้สกิลพื้นฐานหรือสกิลรอง (อย่างใดอย่างหนึ่ง) ใช้แต้มมากขึ้น +1 — ไม่มีผลกับท่าไม้ตาย
      //  ซ้อนกับกระแสเวท/ภาระเวทได้ แต่ตัวปรับขาขึ้นรวมกันแล้วต้องไม่ดันราคาเกิน SKILL_COST_MAX
      //  (สกิลที่ค่าใช้พลังงานถึงเพดานอยู่แล้วจะไม่แพงขึ้นไปอีก — ต้องตรงกับ useSkill() เป๊ะ)
      //  อาจารย์ ไบเลธ หลักสูตร "จบการศึกษา": สกิลรอง/ท่าไม้ตายถูกลง 1 แต้ม — หักก่อนกระแสเวทเหมือนใน useSkill()
      const showCost = (pub, tierName) => Math.min(
        SKILL_COST_MAX,
        Math.max(0, Math.max(0, pub.cost - CHAR_HOOKS.byleth.costDiscount(engine, tierName)) - spellflowAmt) + spellburdenAmt + (p.nightTaxTier === tierName ? 1 : 0),
      );
      // คอนเนอร์ (วิเคราะห์สถานการณ์ rework 3.4.2): "อ่านขาด" ทั้งลำดับแล้ว = เห็นแต้มการ์ดของเป้าหมาย
      //  คนนั้นคนเดียวตลอดเทิร์นนี้ (เดิมเปิดไพ่ + แต้ม + ประเมินดาเมจของทุกคนพร้อมกัน)
      const connorReads = !!viewer && CHAR_HOOKS.conner.readsScoreOf(viewer, p);
      if (basicPub) basicPub.cost = showCost(basicPub, "basic");
      if (secondaryPub) secondaryPub.cost = showCost(secondaryPub, "secondary");
      if (ultimatePub) ultimatePub.cost = showCost(ultimatePub, "ultimate");
      return {
        id: p.id,
        isBoss: isYuuki(p),
        name: p.name,
        avatar: p.avatar,
        img: displayImg(p),
        position: p.position,
        color: POSITION_COLORS[p.position] || "#888",
        teamId: p.teamId || null,
        teamConfirmed: !!p.teamConfirmed,
        modeVote: p.modeVote || null,
        locked: p.locked,
        busted: (show || promoShow || allyShow || connorReads) ? bustedOf(p) : false,
        result: p.result,
        cardCount: p.cards.length,
        cards: blackout ? null : (mine ? p.cards : null),
        score: blackout ? null : ((show || promoShow || allyShow || connorReads) ? scoreOf(p) : null),
        // Locacaca (ซาโตรุ): Max HP ลดถาวรได้ / ทาคุมิ: บังตาระหว่างท่าไม้ตายทำงาน (null = ซ่อนทั้งแถบ)
        // แบทแมนร่างรถแบทโมบิล: ส่ง 0/0 เพื่อให้ "ไม่มีพลังชีวิต เหลือแต่เกราะ" ตามสเปค
        //  (LifeBar วาดหัวใจตามจำนวน maxHp — 0 = ไม่มีหัวใจสักดวง แต่ยังไม่ใช่ null จึงไม่ขึ้น "???")
        //  ค่าจริงในเอนจินยังเต็มอยู่โดยตั้งใจ เพราะมีจุดกวาด `if (hp <= 0) instantDeath()` หลายที่
        //  ซึ่งจะฆ่าเขาทันทีทั้งที่รถยังไม่พัง — เกราะคือพลังชีวิตของรถตัวจริงอยู่แล้ว (ดู carAbsorb)
        hp: blackout ? null : (CHAR_HOOKS.bat_ben.inCar(p) ? 0 : p.hp),
        maxHp: blackout ? null : (CHAR_HOOKS.bat_ben.inCar(p) ? 0 : maxHpOf(p)),
        armor: blackout ? null : p.armor, maxArmor: blackout ? null : maxArmorOf(p),
        shield: blackout ? null : p.shield,
        tempHp: p.tempHp || 0, // เลือดชั่วคราว (แกมเบลอร์)
        // เอฟเฟครอบการ์ด (เห็นทุกคน): เขี้ยวปฏิปักษ์สีเขียว (ถาวร) / เกราะราชันสีแดง (ตอนสวม)
        beat: !!(p.seen && p.seen.beat),
        beatSaved: !!p.beatSaved,
        rachan: !!(p.seen && p.seen.rachan) && (p.statuses.rachan || 0) > 0,
        // ยูนะ: ออร่าเฉพาะเป้าหมาย (Longing สีทอง / Delete สีม่วง / Smile for You สีเขียว-ฟ้า) — beatbark ไม่มีเป้าหมายเดี่ยว ดู yunaFieldFx
        fieldAura: (p.id === yunaTargetId && roundNumber <= yunaWindowEnd) ? yunaEffect : null,
        hisakawa: p.characterId === "hisakawa_sister" ? CHAR_HOOKS.hisakawa_sister.publicState(p, roundNumber) : undefined,
        // ซาโตรุ (patch 2.0.8.2): แต้มสกิลถูกซ่อนจากผู้เล่นอื่นเสมอ (-1 = ซ่อน) / ทาคุมิ: บังตาแต้มสกิลของทุกคนยกเว้นตัวเองระหว่างท่าไม้ตายทำงาน (sentinel -1 แบบเดียวกัน กลับด้าน)
        // อิสึกะ ชิโด (patch 2.9): ระหว่าง "ฝากด้วยนะตัวฉัน" เปิดอยู่ คนอื่นเห็นแต้มสกิลเต็มหลอดเหมือนเดิม
        //  (ไม่งั้นแต้มที่หายไป 8 หน่วยจะเป็นเบาะแสว่าเขากดท่าไม้ตายไปแล้ว — ทั้งท่านี้ต้องไม่มีใครรู้)
        skillPoints: viewerBlind ? -1 : (takumiBlackout && !mine) ? -1 : ((p.characterId === "satoru" && !mine && !passiveSealed(p)) ? -1
          : ((!mine && CHAR_HOOKS.shido.guardActive(p)) ? maxSkillOf(p) : p.skillPoints)),
        // ตัวนับถอยหลังกับดักของชิโด — ส่งให้เจ้าของคนเดียว ไม่ใช่สถานะจึงไม่โผล่ตอน revealAll
        shidoGuard: mine && p.characterId === "shido" ? (p.shidoGuardTurns || 0) : undefined,
        // ความเสียหายล่าสุดที่ "ขอพลังให้ฉันด้วย" บันทึกไว้ (UI ป้ายเล็กบนแผงตัวเอง)
        shidoRecorded: mine && p.characterId === "shido" ? (p.shidoRecorded || 0) : undefined,
        // คูลดาวน์ห้ามกดท่าไม้ตายหลังย้อนเวลา (เทิร์นที่เหลือ) — ส่งให้เจ้าของคนเดียวเช่นกัน
        //  ใช้โชว์เป็นตัวเลขทับบนการ์ดสกิล คู่กับ shidoGuard (ตัวนับกับดักที่กำลังเปิดอยู่)
        shidoCd: mine && p.characterId === "shido"
          ? Math.max(0, (p.shidoRewindLock || 0) - roundNumber) : undefined,
        // เอจิ: คูลดาวน์ท่าไม้ตายหลัง "ไม่ว่ายังก็ตาม" หมดเวลา (เทิร์นที่เหลือ) — โชว์ทับบนการ์ดสกิล
        eijiUltCd: p.characterId === "eiji" ? CHAR_HOOKS.eiji.ultCooldownLeft(engine, p) : undefined,
        // QTE ที่กำลังเล่นอยู่ — ส่งให้ "เจ้าของคนเดียว" และส่งเฉพาะปุ่มตัวถัดไป
        //  (ส่งลำดับทั้งชุดไปให้ = เห็นล่วงหน้าทั้งเพลง หมดความหมายของ QTE)
        qte: mine && p.qte ? {
          key: p.qte.keys[p.qte.idx], idx: p.qte.idx, total: p.qte.keys.length,
          deadline: p.qte.deadline, perNoteMs: p.qte.perNoteMs,
        } : undefined,
        // ยุย: เพลงที่เลือกได้ + รายชื่อคนตายที่ชุบได้ (ทำเมนูฝั่ง client)
        yuiSongs: mine && p.characterId === "yui" ? CHAR_HOOKS.yui.songChoices(p) : undefined,
        yuiDead: mine && p.characterId === "yui"
          ? CHAR_HOOKS.yui.deadTargets(engine, p).map((o) => ({ id: o.id, name: o.name })) : undefined,
        maxSkill: maxSkillOf(p), // Bard: เพดานพลังงาน 9
        beamAmmo: p.beamAmmo,
        puddingCount: p.puddingCount || 0,
        gold: p.gold || 0, // ร้านค้ามายา (patch 2.2 full): เหรียญสะสม — ทุกคนเห็นของกันและกันได้
        goldMax: goldCapOf(p), // เพดานเหรียญรายบุคคล (โคโตเนะ 45 จากกระปุกออมสินน้องหมูน้อย)
        inventory: mine ? (p.inventory || []) : null, // ของในคลัง — เห็นแค่ของตัวเอง
        gutsShotTurn: mine ? (p.gutsShotTurn || 0) : undefined, // ปืน GUTS Select: ยิงไปแล้วเทิร์นไหน (เทียบกับ roundNumber = ยิงครบโควตาแล้ว)
        blackSparklenceCooldown: mine ? Math.max(0, (p.blackSparklenceReadyRound || 0) - roundNumber) : undefined,
        hyperTriggerCooldown: mine ? Math.max(0, (p.hyperTriggerReadyRound || 0) - roundNumber) : undefined,
        doomWeapon: p.doomWeapon || null, // DoomGuy: อาวุธที่ถืออยู่
        doomCharge: p.characterId === "doomguy" ? (p.doomCharge || 0) : undefined, // DoomGuy: ชาร์จ Crucible (เต็ม 5)
        doomWeaponHasEffect: p.characterId === "doomguy" ? !!(DOOM_WEAPONS[p.doomWeapon] || DOOM_WEAPONS.shotgun).effect : undefined, // DoomGuy: ปืนกระบอกนี้กดใช้ความสามารถพิเศษได้ไหม (Plasma Rifle/BFG 9000 ไม่มี)
        doomQuickSwapUsed: p.characterId === "doomguy" ? !!p.doomQuickSwapUsed : undefined, // DoomGuy: Quick Swap ใช้ไปแล้วในเทิร์นนี้หรือยัง (1 ครั้ง/เทิร์น)
        doomWeaponMarkPending: p.characterId === "doomguy" ? doomWeaponMarkPending() : undefined, // DoomGuy: [ระเบิด]/[ล็อคเป้า] ค้างอยู่ — สุ่มปืนใหม่ (Quick Swap) ไม่ได้จนกว่าจะโดนใช้
        gamblerUses: p.gamblerUses, // แกมเบลอร์: จำนวนวอสก้าหน่อยน้องคงเหลือ
        profit: p.profit || 0,      // แกมเบลอร์: บัฟกำไรเท่าตัวโว้ยสะสม
        sunriseDrop: p.sunriseDrop || 0, // โอเบรอน: จำนวนเทิร์นที่จะเสียเลือด 1/เทิร์นจากรุ่งอรุณแห่งวันใหม่
        appleItem: p.appleItem || "drink", // Apple guy: ของส่งมอบที่เลือกอยู่
        appleAtk: p.appleAtkBuffs ? p.appleAtkBuffs.length : 0, // Apple guy: บัฟพลังโจมตีจากการมอบของ (ซ้อนทับได้สูงสุด 2 หน่วย)
        appleGiveUses: p.appleGiveUses != null ? p.appleGiveUses : CHAR_HOOKS.appleguy.GIVE_USES, // Apple guy: จำนวนใช้ เอาไปสิ คงเหลือ
        muimiEmergencyUses: p.characterId === "muimi" ? (p.muimiEmergencyUses != null ? p.muimiEmergencyUses : CHAR_HOOKS.muimi.EMERGENCY_USES) : undefined,
        muimiEmergencyMax: p.characterId === "muimi" ? CHAR_HOOKS.muimi.EMERGENCY_USES : undefined,
        muimiEmergencyUsed: p.characterId === "muimi" ? p.muimiEmergencyUsedRound === roundNumber : undefined,
        muimiLoseStreak: p.characterId === "muimi" ? (p.muimiLoseStreak || 0) : undefined,
        muimiLoseStreakMax: p.characterId === "muimi" ? CHAR_HOOKS.muimi.HEART_LOSSES : undefined,
        muimiUltCd: mine && p.characterId === "muimi" ? CHAR_HOOKS.muimi.ultCooldownLeft(engine, p) : undefined,
        tepeuCookTurns: p.tepeuCookTurns || 0,     // เทเปา: วันนี้อากาศดีจัง — เทิร์นที่เหลือก่อนได้ "มื้อที่สุข" (0 = กดใช้ได้)
        tepeuPonderTurns: p.tepeuPonderTurns || 0, // เทเปา: เป็นแบบนี้นี่เอง — ครุ่นคิดเหลือกี่เทิร์น (0 = กดใช้ได้/จั่วไพ่ได้)
        // ---------- ฟุจิตะ โคโตเนะ (rework 2.3) ----------
        piggy: p.characterId === "kotone" ? (p.piggy || 0) : undefined,          // เงินในกระปุกออมสิน (สูงสุด 15)
        piggyMax: p.characterId === "kotone" ? CHAR_HOOKS.kotone.PIGGY_MAX : undefined,
        kotoneReady: p.characterId === "kotone" ? CHAR_HOOKS.kotone.readyStacks(p) : undefined, // [ความพร้อม] ที่สะสมอยู่
        kotoneReadyNeed: p.characterId === "kotone" ? CHAR_HOOKS.kotone.READY_NEED : undefined,
        kotoneReadyMax: p.characterId === "kotone" ? CHAR_HOOKS.kotone.READY_MAX : undefined,
        kotoneForm: p.characterId === "kotone" ? CHAR_HOOKS.kotone.formActive(p) : undefined,   // อยู่ในร่าง [พร้อมลุย] หรือไม่
        // ---------- เอจิ (patch 2.4 new): UI อัตราหลบหลีกปัจจุบัน (ไม่ใช่สถานะสะสม) ----------
        // อิปโป: อัตราหลบรวม · Dempsey Charge · คูลดาวน์รายสกิล (โชว์เป็นตัวเลขบนการ์ดสกิล)
        ippoDodge: p.characterId === "ippo" ? CHAR_HOOKS.ippo.dodgeChance(p) : undefined,
        ippoCharge: p.characterId === "ippo" ? CHAR_HOOKS.ippo.chargeOf(p) : undefined,
        ippoChargeMax: p.characterId === "ippo" ? CHAR_HOOKS.ippo.DEMPSEY_MAX : undefined,
        // ---------- ผู้วิงวอน (patch 3.4 new) ----------
        //  คำวิงวอนเป็นข้อมูลสาธารณะ (ทุกคนเห็น) เพราะขั้นของมันเปลี่ยนพฤติกรรมทั้งสนาม
        supPrayers: p.characterId === "the_supplicant" ? CHAR_HOOKS.the_supplicant.prayersOf(p) : undefined,
        supPrayersMax: p.characterId === "the_supplicant" ? CHAR_HOOKS.the_supplicant.PRAYER_MAX : undefined,
        supUltCd: mine && p.characterId === "the_supplicant" ? CHAR_HOOKS.the_supplicant.ultCooldownLeft(engine, p) : undefined,
        supSkillUses: p.characterId === "the_supplicant" ? (p.supSkillUsesRound || 0) : undefined,
        supSkillMax: p.characterId === "the_supplicant" ? CHAR_HOOKS.the_supplicant.SKILL_USES_PER_TURN : undefined,
        // เกราะศรัทธา/ตราพิพากษา ติดกับ "ใครก็ได้" ไม่ใช่แค่ผู้วิงวอน — ส่งให้ทุกคนเสมอ (0/false = ไม่มี)
        supFaith: CHAR_HOOKS.the_supplicant.faithOf(p) || undefined,
        supFaithMax: CHAR_HOOKS.the_supplicant.faithOf(p) ? CHAR_HOOKS.the_supplicant.FAITH_MAX : undefined,
        supJudge: CHAR_HOOKS.the_supplicant.judgeOn(p)
          ? { n: p.supJudgeCount || 0, need: CHAR_HOOKS.the_supplicant.JUDGE_NEED, ally: !!p.supJudgeAlly, gif: CHAR_HOOKS.the_supplicant.ULT_GIF } : undefined,
        // ---------- มหาเทพ อรชุน (patch 3.4 new) ----------
        arjunaUltCd: mine && p.characterId === "arjuna" ? CHAR_HOOKS.arjuna.ultCooldownLeft(engine, p) : undefined,
        ippoCd: p.characterId === "ippo" ? {
          basic: CHAR_HOOKS.ippo.cooldownLeft(engine, p, "basic"),
          secondary: CHAR_HOOKS.ippo.cooldownLeft(engine, p, "secondary"),
          ultimate: CHAR_HOOKS.ippo.cooldownLeft(engine, p, "ultimate"),
        } : undefined,
        eijiDodge: p.characterId === "eiji" ? CHAR_HOOKS.eiji.dodgeChance(p) : undefined,        // % หลบหลีกรวมของเทิร์นนี้
        eijiOrdinal: p.characterId === "eiji" ? CHAR_HOOKS.eiji.ordinalStacks(p) : undefined,    // สแตค Ordinal Scale ที่กดไปแล้ว
        eijiOrdinalMax: p.characterId === "eiji" ? CHAR_HOOKS.eiji.ORDINAL_MAX : undefined,
        eijiDodgeUsed: p.characterId === "eiji" ? !!p.eijiDodgeUsedRound : undefined,            // ใช้โควตาหลบของเทิร์นนี้ไปแล้วหรือยัง
        // ---------- มิซึซาว่า ฮารุกะ (patch 2.5 new): โควตาสกิลพื้นฐาน 2 ครั้ง/เทิร์น (UI ใช้ปิดปุ่มเมื่อครบ) ----------
        // ---------- อาจารย์ ไบเลธ (patch 2.6 new): UI แต้มความรู้ + สถานะหลักสูตร (ทุกคนเห็นได้ เพราะหลักสูตรมีผลทั้งสนาม) ----------
        bylethKnowledge: p.characterId === "byleth" ? CHAR_HOOKS.byleth.knowledgeOf(p) : undefined,
        bylethKnowledgeMax: p.characterId === "byleth" ? CHAR_HOOKS.byleth.KNOWLEDGE_MAX : undefined,
        bylethCourse: p.characterId === "byleth" ? (p.bylethCourse || null) : undefined,          // หลักสูตรที่เปิดค้างอยู่
        bylethNextDraw: p.characterId === "byleth" ? (p.bylethNextDraw || null) : undefined,      // ผลทบทวนบทเรียนที่รอไพ่ใบถัดไป
        bylethSkillUses: p.characterId === "byleth" ? (p.bylethSkillUsesRound || 0) : undefined,  // ภูมิปัญญา: กดสกิลไปแล้วกี่ครั้งในเทิร์นนี้
        bylethSkillMax: p.characterId === "byleth" ? CHAR_HOOKS.byleth.SKILL_USES_PER_TURN : undefined,
        bylethStrikeUsed: p.characterId === "byleth" ? !!p.bylethStrikeUses : undefined,          // ดาบต้องสาป (ฟาดทันที) ใช้โควตาเทิร์นนี้ไปแล้วหรือยัง
        bylethRevived: p.characterId === "byleth" ? !!p.bylethRevived : undefined,                // sothis: ใช้ฟื้นคืนชีพไปแล้วหรือยัง
        // ---------- คอนเนอร์ RK800 (patch 2.7 new) ----------
        //  มิเตอร์ความเครียดเป็นข้อมูลสาธารณะ (ทุกคนเห็นของกันและกัน) และโผล่เฉพาะตอนมีคอนเนอร์อยู่ในแมตช์
        connorStress: (connorInMatch && p.characterId !== "conner") ? CHAR_HOOKS.conner.stressOf(p) : undefined,
        connorStressMax: (connorInMatch && p.characterId !== "conner") ? CHAR_HOOKS.conner.STRESS_MAX : undefined,
        connorLevel: (connorInMatch && p.characterId !== "conner") ? CHAR_HOOKS.conner.levelKeyOf(p) : undefined,
        connorFrozen: !!p.connorFrozen, // ถูกแช่เพราะอยู่นอกวงไล่ล่า (บังคับไพ่แตก กดอะไรไม่ได้)
        connorRevives: p.characterId === "conner" ? (p.connorRevives || 0) : undefined,        // ใช้ฟื้นคืนชีพไปแล้วกี่ครั้ง
        connorRevivesMax: p.characterId === "conner" ? CHAR_HOOKS.conner.REVIVE_MAX : undefined,
        // โมโรโบชิ ดัน (patch 2.8): ช่องท่าไม้ตายตอนนี้เป็น "อย่าให้ฉันต้องเฆี่ยนตี" อยู่หรือเปล่า
        //  client ใช้ตัดสินว่าต้องให้จิ้มเป้าหมายก่อนไหม (ท่า 2 เล็งเป้าเดิมอัตโนมัติ) — อย่าเดาจากชื่อ/ราคาสกิล
        danWhip: p.characterId === "dan" ? CHAR_HOOKS.dan.whipReady(engine, p) : undefined,
        connorReviveIn: p.characterId === "conner" && !p.alive && p.connorReviveRound
          ? Math.max(0, p.connorReviveRound - roundNumber) : undefined,                         // เหลือกี่เทิร์นก่อนกลับมา
        // ลำดับการกระทำ "เทิร์นที่แล้ว" ของผู้เล่นคนนี้ — ส่งให้เจ้าตัวเท่านั้น (คอนเนอร์ต้องทายเอง ห้ามเห็น)
        connorActionsPrev: mine ? CHAR_HOOKS.conner.actionsPrevOf(p) : undefined,
        // ประเมินความเสียหายที่ผู้เล่นคนนี้จะฟาดใส่คอนเนอร์ได้ — เห็นเฉพาะคอนเนอร์ที่กำลังวิเคราะห์สถานการณ์
        connorScanned: connorReads ? true : undefined, // แต้มของคนนี้ถูกเปิดให้เราเห็นจาก "วิเคราะห์สถานการณ์"
        harukaBasicUses: p.characterId === "haruka" ? (p.harukaBasicUses || 0) : undefined,
        harukaBasicMax: p.characterId === "haruka" ? CHAR_HOOKS.haruka.BASIC_USES_PER_TURN : undefined,
        shradeForm: !!p.shradeForm,        // ชเรด เอลัน: รวมร่างทำนองเพลงแล้ว (อควาเรียน สปาด้า — ถาวร)
        bardNotes: p.bardNotes || [],      // Bard: โน้ตในช่องประพันธ์เพลง (ทุกคนเห็นได้)
        bardNotesUsed: p.bardNotesUsed || 0, // Bard: โน้ตที่เติมไปแล้วเทิร์นนี้ (จำกัด 2)
        bloodSection: p.bloodSection || 0, // Bard: ท่อนทำนองแห่งโลหิต (ครบ 5 = มิติโลหิต)
        soulSection: p.soulSection || 0,   // Bard: ท่อนทำนองแห่งวิญญาณ (ครบ 5 = มิติวิญญาณ)
        bardPending: p.bardPending ? { name: p.bardPending.name, need: p.bardPending.need, allowSelf: p.bardPending.allowSelf } : null, // Bard: บทเพลงรอเลือกเป้าหมาย
        // ไค ชิซากิ: สรุป Overhaul tracker (ชื่อผู้ถือ+ประเภทสถานะ) — เฉพาะผู้เล่นไคเท่านั้น (ตัวอื่นเห็น undefined)
        kaiOverhaulSlots: p.characterId === "kai" ? kaiOverhaulSlots.filter((s) => s.ownerId === p.id).map((s) => ({ playerId: s.playerId, name: (players[s.playerId] && players[s.playerId].name) || "", status: s.status, img: players[s.playerId] ? displayImg(players[s.playerId]) : null })) : undefined,
        mageslayerHasMarked: p.characterId === "mageslayer" ? !!p.mageslayerHasMarked : undefined, // ผู้สังหารเมจ: เคยใช้ Witch Mark หรือยัง
        mageslayerWitchMarkCooldown: p.characterId === "mageslayer" ? Math.max(0, (p.mageslayerWitchMarkReadyRound || 0) - roundNumber) : undefined,
        mageslayerBurdenCooldown: p.characterId === "mageslayer" ? Math.max(0, (p.mageslayerBurdenReadyRound || 0) - roundNumber) : undefined, // Mana Burden: คูลดาวน์ 7 เทิร์น
        escanorCharge: p.characterId === "escanor" ? (p.escanorCharge || 0) : undefined,
        escanorChargeMax: p.characterId === "escanor" ? CHAR_HOOKS.escanor.ESCANOR_CHARGE_MAX : undefined,
        escanorForm: p.characterId === "escanor" ? CHAR_HOOKS.escanor.formOf(p) : undefined,
        kaiRivalId: mine ? (p.kaiRivalId || null) : undefined, // ไค ชิซากิ: คู่ปรับที่ถูกบังคับโจมตี (เห็นแค่ตัวเอง — ฝั่งอื่นเช็คจาก statuses.kaiRival1/2 ได้)
        kaiSkillUsesRound: p.characterId === "kai" ? (p.kaiSkillUsesRound || 0) : undefined, // ไค: งบสกิล 2 ครั้งต่อเทิร์น ใช้ไปแล้วกี่ครั้ง
        takumiGear: p.characterId === "takumi" ? (p.takumiGear || 1) : undefined, // ทาคุมิ: เกียร์ธรรมดาปัจจุบัน (1-6)
        takumiSkillUsesRound: p.characterId === "takumi" ? (p.takumiSkillUsesRound || 0) : undefined, // ทาคุมิ: งบสกิล 5 ครั้งต่อเทิร์น ใช้ไปแล้วกี่ครั้ง
        shikiUlt: p.shikiUlt || "deatheye", // ชิกิ: ท่าไม้ตายที่เลือกตอนเข้าห้อง (deatheye | wither)
        stamina: p.stamina || 0,           // โอกูริ แคป: Stamina ชาร์จสะสม (ทรัพยากรท่าไม้ตาย)
        oguriEnergy: p.oguriEnergy || 0,   // โอกูริ แคป: Energy สะสม (สูงสุด 16 — ทรัพยากร Breakfast/Training)
        oguriChargeCap: p.characterId === "oguri" ? oguriChargeCapOf(p) : undefined, // โอกูริ แคป: ความจุ Stamina ชาร์จปัจจุบัน
        contractPartnerId: p.contractPartner || null, // เจ้าแห่งเน็ตบ้าน: คู่สัญญาปัจจุบัน
        contractWithId: p.contractWith || null,       // คู่สัญญา: ทำสัญญากับเจ้าแห่งเน็ตบ้านคนไหน
        allyId: p.allyId || null,                     // ริดดี้ (patch 2.0.9): คู่พันธมิตรบันชี × ยูนิคอร์น
        contractTurns: p.contractTurns || 0,          // จำนวนเทิร์นที่ใช้บริการมาแล้ว (ครบทุก 3 = ถามต่อสัญญา)
        skillDrain: p.skillDrain || 0,                // ค่าปรับปฏิเสธข้อเสนอ: แต้มจบเทิร์นลด 1 (เทิร์นที่เหลือ)
        chillDodge: p.chillDodge != null ? p.chillDodge : 100, // Apple guy: อัตราหลบปัจจุบัน (%)
        tonkatsu: p.tonkatsu || 0, // เทมาริ: ชามทงคัสสึสะสม (UI สะสมชาม)
        phenexPain: p.phenexPain || 0, // ริต้า เบอร์นัล: ความเจ็บปวดสะสม (ไม่อยากให้ใครต้องเจ็บปวด — ปลดปล่อยตอนตกรอบจริง)
        tohnoLevel: p.tohnoLevel || 1, // โทโนะ ชิกิ: ระดับมีดพับประจำตระกูลที่เลือกอยู่ (1-5)
        nanayaEyeOn: !!p.nanayaEyeOn,           // นานายะ ชิกิ: Mystic eye of death perception เปิดอยู่ไหม
        nanayaToggleUsed: !!p.nanayaToggleUsed, // นานายะ ชิกิ: เปิด/ปิดไปแล้วในเทิร์นนี้หรือยัง
        hakunoGender: p.hakunoGender || "male",         // คิชินามิ ฮาคุโนะ: เพศปัจจุบัน
        hakunoGenderSwitched: !!p.hakunoGenderSwitched, // คิชินามิ ฮาคุโนะ: สลับเพศไปแล้วในเทิร์นนี้หรือยัง
        hakunoMoonPoints: p.hakunoMoonPoints || 0,      // คิชินามิ ฮาคุโนะ: แต้มคำสาปแห่งดวงจันทร์สะสม
        hakunoCommandUses: p.hakunoCommandUses != null ? p.hakunoCommandUses : HAKUNO_COMMAND_USES, // อาคมบัญชาระดับ EX+ คงเหลือ
        atCap: scoreOf(p) >= scoreCap(p), // แต้มเต็มเพดาน (21/UPG) -> ปิดปุ่มจั่ว รอเปิดไพ่เอง
        skillUsed: !!p.skillUsedRound,    // ใช้สกิลไปแล้วในเทิร์นนี้ (1 อันต่อเทิร์น)
        ready: !!p.ready,                 // ห้องรอ: กดพร้อมแล้วหรือยัง
        connected: p.connected !== false,
        alive: p.alive,
        statuses: show ? { ...p.statuses, ...((p.ntdTarget || p.ntdRivalId) ? { ntd: 1 } : {}) } : publicStatuses(p),
        statusAmt: p.statusAmt || {}, // จำนวน (amount) ของบัฟ/ดีบัฟพื้นฐาน (patch 2.0.8)
        character: {
          // โอเบรอน: กลางคืนสลับชื่อ + สกิลรอง/ท่าไม้ตายเป็นเวอร์ชันกลางคืน (ฝันร้ายยามค่ำคืน / Lie Like Vortigern)
          id: ch.id,
          // ภาพประจำตัวละคร (ไม่ผูกกับร่าง/แฝดที่กำลังคุมอยู่) — ฉากเปิดตัวตอนแมตช์เริ่มใช้ภาพนี้
          img: ch.img,
          name: ch.id === "shrade_elan" && p.shradeForm ? SHRADE_SPADA_NAME
            : nightNow && ch.nightName ? ch.nightName : ch.name,
          passive: ch.passive ? { name: ch.passive.name, desc: ch.passive.desc } : null,
          // บานาจ ลิงก์ (patch 2.1.2): สกิลติดตัว 2 ฉันไม่อยากให้เราต้องมาสู้กัน — ตัวอื่นเป็น null
          passive2: ch.passive2 ? { name: ch.passive2.name, desc: ch.passive2.desc } : null,
          // นานายะ ชิกิ (patch 2.1.9): สกิลติดตัว 3 พักผ่อนสักครู่ — ตัวอื่นเป็น null
          passive3: ch.passive3 ? { name: ch.passive3.name, desc: ch.passive3.desc } : null,
          basic: basicPub,
          secondary: secondaryPub,
          ultimate: ultimatePub,
        },
        dmgHp: p.dmgHp, dmgArmor: p.dmgArmor, gainedSkill: p.gainedSkill,
        wasAttacked: p.wasAttacked, isWinner: p.isWinner, isLoser: p.isLoser,
      };
    }),
  };
}
function broadcastState() {
  CHAR_HOOKS.kai.pruneOverhaulSlots(engine); // เผื่อสถานะรังสรรค์/ลงทัณฑ์หายไปนอกช่องทาง Overhaul (เช่นถูกล้าง)
  for (const id of Object.keys(players)) io.to(id).emit("state", buildStateFor(id));
}
function broadcastPositions() {
  const taken = takenUniqueChars();
  for (const [sid, sock] of io.sockets.sockets) {
    sock.emit("positions", positionsFor(sid));
    sock.emit("takenChars", taken);
  }
}
// ตัวละคร unique ที่มีคนเลือกไปแล้วในแมตช์นี้ (หน้าเลือกตัวละครใช้ปิดการ์ดไม่ให้เลือกซ้ำ)
function takenUniqueChars() {
  return [...new Set(
    Object.values(players)
      .filter((p) => (CHAR_BY_ID[p.characterId] || {}).unique)
      .map((p) => p.characterId)
  )];
}


// ============================================================
//  cutscene
// ============================================================
// ครั้งแรกต่อเกม/ต่อคน = เล่นวีดีโอเต็ม (หยุดกระดาน), ครั้งต่อไป = แค่การ์ดแจ้งเตือนเล็กๆ ไม่หยุดเกม
function triggerCutscene(p, key) {
  // ท่าที่ไม่มีวีดีโอ (มีแต่ภาพ+เพลง เช่น kready ของโคโตเนะ) = แจ้งเตือนบนกระดานอย่างเดียว ไม่ตัดเข้าเฟส CUTSCENE
  if (!TRANSFORMS[key] || !TRANSFORMS[key].video) { notifyTransform(p, key); return; }
  if (p.cutsceneShown[key]) notifyTransform(p, key);
  else { p.cutsceneShown[key] = true; queueCutscene(p, key); }
}
// onlyFor (ไม่บังคับ): array ของ playerId ที่ "เห็นวีดีโอนี้" — คนอื่นยังหยุดรอตามจังหวะเดียวกัน
//  แต่ buildStateFor จะไม่ส่ง cutscene ให้ (client จึงวาดกระดานตามปกติแทนที่จะเล่นคลิป)
//  ใช้กับคลิปที่เป็นเรื่องส่วนตัวของผู้เล่นบางคน เช่น "ครูฝึกสุดเหี้ยม" ของดันที่ด่าเฉพาะคนที่ไพ่แตก
function queueCutscene(p, key, onlyFor) {
  const t = TRANSFORMS[key];
  if (!t || !t.video) return;
  cutsceneQueue.push({
    seconds: t.seconds,
    info: {
      playerId: p.id, name: p.name,
      img: t.img, color: POSITION_COLORS[p.position] || "#9B4F96",
      video: t.video, title: t.title, label: t.label, voice: t.voice || null,
      noIntro: !!t.noIntro, // true = ตัดการ์ดเปิดตัว 950ms ทิ้ง เข้าวีดีโอทันที (คลิปสั้นมาก)
      onlyFor: Array.isArray(onlyFor) && onlyFor.length ? [...onlyFor] : null,
    },
  });
}
// การ์ดแจ้งเตือนเล็กๆ (ครั้งที่ 2 เป็นต้นไป): ส่งทันทีแบบเดียวกับ skillFlash — ไม่ตัดเข้าเฟส CUTSCENE
// ไม่หยุดเวลา/กระดาน แค่บอกว่าใครใช้ท่าอะไรซ้ำ
function notifyTransform(p, key) {
  const t = TRANSFORMS[key];
  if (!t) return;
  io.emit("transformNotice", {
    playerId: p.id, name: p.name,
    img: t.img, color: POSITION_COLORS[p.position] || "#9B4F96",
    title: t.title, label: t.label,
  });
}
// ประกาศเปลี่ยนร่าง (เอฟเฟกต์ระเบิด + ชื่อ + เสียงพากย์) — ต่อจากวีดีโอ ก่อนขึ้นสรุปผล/คนอื่น
//  seconds ≈ ความยาวเสียงพากย์ เพื่อให้เสียงเล่นจบก่อนขึ้นฉากถัดไป (ไม่ทับวีดีโอคนอื่น)
function queueTransformAnnounce(p, kind) {
  const t = TRANSFORMS[kind];
  if (!t) return;
  cutsceneQueue.push({
    seconds: kind === "beat" ? 9 : 7,
    info: {
      playerId: p.id, name: p.name,
      img: OHGER_FORM, color: POSITION_COLORS[p.position] || "#9B4F96",
      title: t.title, voice: t.voice || null, kind, announce: true,
    },
  });
}
// พักช่วงจั่วการ์ดไว้ เล่น cutscene ให้จบ แล้วกลับมาจั่วต่อด้วยเวลาที่เหลือ
// (ใช้กับสกิลที่แปลงร่างทันทีก่อนเปิดไพ่ เช่น MonsterLive)
// after (ไม่บังคับ): งานที่ต้องทำ "หลังวีดีโอจบ" ก่อนกลับเข้าเฟสจั่วไพ่ — ใช้กับกระสุน GUTS Select
//  ที่ต้องเล่นวีดีโอก่อนแล้วค่อยให้ผลเสียหาย/สถานะโผล่บนกระดาน (ไม่ใช่ลดเลือดไปตั้งแต่ก่อนวีดีโอเล่น)
function pausePlayingForCutscene(after) {
  const remain = Math.max(3, timeLeft);
  clearPhaseTimer();
  runCutsceneQueue(() => {
    if (after) after();
    gameState = "PLAYING";
    startPhaseTimer(remain, resolveRound);
    broadcastState();
    checkAllLocked();
  });
}
function runCutsceneQueue(onDone) {
  if (cutsceneQueue.length === 0) { cutsceneInfo = null; onDone(); return; }
  const c = cutsceneQueue.shift();
  cutsceneInfo = { ...c.info, id: ++cutsceneSeq }; // id ใหม่ทุกครั้ง -> client remount วีดีโอ
  gameState = "CUTSCENE";
  startPhaseTimer(c.seconds, () => runCutsceneQueue(onDone));
  broadcastState();
}


// ============================================================
//  วงจรรอบ
// ============================================================
// ห้องรอ: ทุกคนกดพร้อมครบ (อย่างน้อย 2 คน) -> เริ่มเกมทันที ไม่ต้องกดปุ่มเริ่มเกมเอง
function checkLobbyReady() {
  if (gameState !== "LOBBY") return;
  const list = Object.values(players);
  if (list.length >= 2 && list.every((p) => p.ready)) enterModeSelect();
}
function startMatch() {
  delete players[YUUKI_ID];
  if (!teamModeActive()) {
    resetTeamAssignments(false);
    teamSize = 1;
    teamCount = 0;
  }
  winningTeamId = null;
  for (const p of Object.values(players)) resetCombat(p);
  roundNumber = 0;
  cycleShift = 0;
  nightResetPending = false;
  oberonDevour = 0;
  dayForceUntil = 0;
  yunaLongingUsed = false; yunaWindowEnd = 0; yunaEffect = null; yunaTargetId = null; yunaMusicSeq = 0; yunaLongingPendingId = null; yunaPity = 0;
  overloadForceActive = false;
  overloadForceCount = 0; yuukiSpawned = false; yuukiTurns = 0; yuukiAttackTargets = [];
  clearTurnSnapshot();
  yuukiLowShown = false; yuukiWinShown = false; yuukiDefeated = false; yuukiReactiveDrawCredits = 0;
  allyWinFlag = false;
  shopItems = []; // ล้างสต็อกร้านค้าเก่าค้างจากแมตช์ก่อน (รอเปิดใหม่ตอนเทิร์นที่ 5)
  kaiOverhaulSlots = []; // ไค ชิซากิ: ล้าง tracker Overhaul ทุกครั้งที่เริ่มแมตช์ใหม่
  // อาริมะ มิยาโกะ (characters/miyako.js): เจอ โทโนะ ชิกิ หรือ นานายะ ชิกิ ในเกมเดียวกัน -> เล่นวีดีโอ arima_shiki.mp4 ก่อนเริ่มเทิร์นแรก
  cutsceneQueue = [];
  if (gameMode === "overload") {
    // โหมดบอสต้องเปิดด้วยวิดีโอยูกิเสมอ ห้ามคิวเปิดตัวอื่นหรือ Overload Force แทรกนำหน้า
    cutsceneQueue = [];
    createYuukiBoss();
    overloadForceActive = true;
    overloadForceCount = 3;
    overloadForceSeq++;
    queueYuukiCutscene(YUUKI_VIDEO.spawn, "ยูกิ Overload", 9, "yuukiSpawn");
    lastLog.push("⚡ โหมด Over Load เริ่มขึ้น — ยูกิ Overload ปรากฏตัวทันที!");
    runCutsceneQueue(dealRound);
  } else {
    // คอนเนอร์ RK800: วีดีโอเปิดตัวเล่น 1 ครั้งตอนเริ่มเกม (ก่อนฉากคู่ปรับของมิยาโกะถ้ามีทั้งคู่)
    const connerIntro = CHAR_HOOKS.conner.maybeQueueIntro(engine);
    const miyakoIntro = CHAR_HOOKS.miyako.maybeQueueRivalIntro(engine);
    if (connerIntro || miyakoIntro) runCutsceneQueue(dealRound);
    else dealRound();
  }
}

// ---------- ร้านค้ามายา (patch 2.3: ยุบร้านลุงเท่งเข้ามาเป็นร้านเดียว) ----------
// สุ่มสินค้า 1 ชิ้นตามน้ำหนักใน SHOP_WEIGHTS (รวม 100):
//   เปลี่ยนสีการ์ด 15 / โชคลาภ 5 / ต้านสถานะ 15 / ยาลดไพ่ 12 / ฟื้นแต้มสกิล 14 / ฟื้นเกราะ 14 / ปืน GUTS 8 / กระสุน GUTS 14 / Hyper Key 3
//   allowGun = false (ปืนครบ SHOP_MAX_GUNS แล้ว) / allowHyper = false (Hyper Key ครบ SHOP_MAX_HYPER แล้ว)
//   -> น้ำหนักของที่เต็มโควตาตกไปรวมกับกระสุนธรรมดา
function pickWeighted(entries) {
  const total = entries.reduce((n, e) => n + e.w, 0);
  let r = Math.random() * total;
  for (const e of entries) { r -= e.w; if (r <= 0) return e.key; }
  return entries[entries.length - 1].key;
}
function rollShopAmmo() {
  const ammoId = pickWeighted(GUTS_AMMO_IDS.map((id) => ({ key: id, w: SHOP_AMMO_WEIGHTS[id] || 1 })));
  return { type: "gutsAmmo", ammo: ammoId, price: GUTS_AMMO[ammoId].price };
}
function rollShopItem(allowGun = true, allowHyper = true) {
  const weights = { ...SHOP_WEIGHTS };
  if (!allowGun) { weights.gutsAmmo += weights.gutsGun; weights.gutsGun = 0; }
  if (!allowHyper) { weights.gutsAmmo += weights.hyperTrigger; weights.hyperTrigger = 0; }
  const type = pickWeighted(Object.entries(weights).map(([key, w]) => ({ key, w })));
  if (type === "cardColor") return { type: "cardColor", price: SHOP_CARD_COLOR_PRICE };
  if (type === "fortune") return { type: "fortune", price: SHOP_FORTUNE_PRICE };
  if (type === "resist") return { type: "resist", price: SHOP_RESIST_PRICE };
  if (type === "cardRemove") return { type: "cardRemove", price: SHOP_CARD_REMOVE_PRICE };
  if (type === "skillPoint") {
    const size = pickWeighted(SHOP_SKILL_SIZES.map((s) => ({ key: s.size, w: s.weight })));
    const s = SHOP_SKILL_SIZES.find((x) => x.size === size);
    return { type: "skillPoint", size: s.size, value: s.amount, price: s.price };
  }
  if (type === "gutsGun") return { type: "gutsGun", price: GUTS_GUN_PRICE };
  if (type === "hyperTrigger") return { type: "gutsAmmo", ammo: "hyper_trigger", price: GUTS_AMMO.hyper_trigger.price };
  if (type === "gutsAmmo") return rollShopAmmo();
  return { type: "armor", value: SHOP_ARMOR_AMOUNT, price: SHOP_ARMOR_PRICE };
}
function shopItemName(item) {
  if (item.type === "cardColor") return "ยาเปลี่ยนสีการ์ด";
  if (item.type === "fortune") return "ยาโชคลาภ";
  if (item.type === "resist") return "ยาต้านสถานะ";
  if (item.type === "cardRemove") return "ยาลดไพ่";
  if (item.type === "skillPoint") return `ยาฟื้นแต้มสกิล +${item.value}`;
  if (item.type === "armor") return `ยาฟื้นเกราะ +${item.value}`;
  if (item.type === "gutsGun") return "ปืนหน่วย GUTS Select";
  if (item.type === "blackSparklence") return "Black Sparklence";
  if (item.type === "gutsAmmo") return (GUTS_AMMO[item.ammo] || {}).name || "กระสุน";
  return "สินค้า";
}
// เปิดร้านค้ามายา: สุ่มสินค้าใหม่ทั้งหมด 15 ช่อง (สินค้าประเภทเดียวกันขึ้นซ้ำได้)
//  ช่องแรกช่องเดียวเป็นช่องล็อก — Trigger Dark Key โผล่แน่นอน 1 ชิ้นทุกรอบ (อิกนิสต้องมีของซื้อเสมอ) และไม่ถูกสุ่มซ้ำในช่องอื่น
//  ที่เหลือ 14 ช่องสุ่มล้วน — Hyper Key Trigger ก็สุ่มออกเหมือนของอื่น (ไม่การันตีแล้ว) จำกัด 1 ชิ้น/รอบ
function openShop() {
  shopRoundSeq++;
  shopItems = [
    { id: `shop_${shopRoundSeq}_dark`, type: "gutsAmmo", ammo: "trigger_dark_key", price: GUTS_AMMO.trigger_dark_key.price, sold: false, soldTo: null },
  ];
  let guns = 0;
  let hypers = 0;
  for (let i = 1; i < SHOP_MAX_ITEMS; i++) {
    const rolled = rollShopItem(guns < SHOP_MAX_GUNS, hypers < SHOP_MAX_HYPER);
    if (rolled.type === "gutsGun") guns++;
    if (rolled.ammo === "hyper_trigger") hypers++;
    shopItems.push({ id: `shop_${shopRoundSeq}_${i}`, ...rolled, sold: false, soldTo: null });
  }
  lastLog.push(`🏪 ร้านค้ามายาเปิดแล้ว! มีสินค้า ${shopItems.length} ชิ้น: ${shopItems.map(shopItemName).join(", ")}`);
}
// แจกไอเทมเข้าคลังโดยตรง (ไม่ผ่านร้านค้า/ไม่เสียเหรียญ) — ใช้กับเอฟเฟกต์ตัวละครที่ "ได้รับไอเทม +1 ชิ้น"
//  item = { type, value?, size?, ammo? } รูปแบบเดียวกับของในร้าน — คืน item ที่เข้าคลังจริง
function grantInventoryItem(p, item) {
  if (!p || !item || !item.type) return null;
  p.inventory = p.inventory || [];
  const entry = { uid: `grant_${item.type}_${p.inventory.length}_${Date.now()}`, type: item.type, value: item.value, size: item.size, ammo: item.ammo };
  p.inventory.push(entry);
  return entry;
}
// ผู้เล่นมีปืนหน่วย GUTS Select อยู่ในกระเป๋าหรือยัง (มีได้กระบอกเดียว)
function hasGutsGun(p) {
  return (p.inventory || []).some((it) => it.type === "gutsGun");
}
function hasBlackSparklence(p) {
  return p && (p.inventory || []).some((it) => it.type === "blackSparklence");
}
function hasGutsWeapon(p) {
  return hasGutsGun(p) || hasBlackSparklence(p);
}
// ซื้อสินค้า: ใครกดก่อนได้ก่อน (Node เป็น single-thread — ประมวลผลทีละ event จึงไม่มี race condition จริง)
function buyShopItem(id, itemId) {
  const p = players[id];
  if (!p || !p.alive) return;
  const item = shopItems.find((it) => it.id === itemId);
  if (!item || item.sold) return;
  if ((p.gold || 0) < item.price) return;
  p.inventory = p.inventory || [];
  if (item.type === "gutsGun" && (hasGutsGun(p) || p.characterId === "ignis" || hasBlackSparklence(p))) return;
  if (item.type === "gutsAmmo" && item.ammo === "hyper_trigger" && (p.characterId === "ignis" || hasBlackSparklence(p))) return;
  if (item.type === "gutsAmmo" && (item.ammo === "hyper_trigger" || item.ammo === "trigger_dark_key") && p.inventory.some((it) => it.type === "gutsAmmo" && it.ammo === item.ammo)) return;
  item.sold = true;
  item.soldTo = p.id;
  p.gold -= item.price;
  p.inventory.push({ uid: `${item.id}_${p.inventory.length}_${Date.now()}`, type: item.type, value: item.value, size: item.size, ammo: item.ammo });
  lastLog.push(`🛍️ ${p.name} ซื้อ ${shopItemName(item)} จากร้านค้ามายา (-${item.price} เหรียญ)`);
  // คอนเนอร์ (วิเคราะห์สถานการณ์): "ซื้อของ" เป็น 1 ใน 4 การกระทำที่คอนเนอร์ต้องคาดการณ์
  CHAR_HOOKS.conner.onShopBuy(engine, p);
  broadcastState();
}
// ใช้ของในคลัง
const CARD_COLOR_NAME = { red: "แดง", blue: "ฟ้า", green: "เขียว", yellow: "เหลือง" };
function cardLabel(c) {
  if (!c) return "?";
  if (c.special) return { king: "ราชา", queen: "ราชินี", joker: "โจ๊กเกอร์" }[c.special] || c.special;
  return String(c.value);
}
function useInventoryItem(id, uid, opts = {}) {
  const p = players[id];
  if (!p || !p.alive) return;
  if (CHAR_HOOKS.conner.skillBlocked(engine, p)) return; // คอนเนอร์: ระหว่างการไล่ล่า ทุกคนใช้ไอเทมไม่ได้ (รวมคอนเนอร์กับเป้าหมาย)
  // ผู้วิงวอน (patch 3.4): "ลูกแกะน้อยรู้แจ้ง" กันการเล็งผู้วิงวอนด้วยไอเทมด้วย (เช่นกระสุน GUTS Select)
  if (opts && opts.targetId && CHAR_HOOKS.the_supplicant.targetBlocked(p, players[opts.targetId])) return;
  const idx = (p.inventory || []).findIndex((it) => it.uid === uid);
  if (idx < 0) return;
  const item = p.inventory[idx];
  let cutsceneKey = null;  // ตั้งค่าโดยกระสุน GUTS Select — ถ้ามีจะตัดเข้า CUTSCENE แทน broadcastState ปกติ
  let pendingShot = null;  // { item, target } ของกระสุนที่ยิง — ให้ผลจริงตอนวีดีโอจบ
  if (item.type === "cardColor") {
    if (gameState !== "PLAYING" || p.locked) return; // ใช้ได้เฉพาะช่วงกำลังจั่วไพ่อยู่เท่านั้น
    const cardIndex = Number(opts.cardIndex);
    const color = opts.color;
    const target = Number.isInteger(cardIndex) ? p.cards[cardIndex] : null;
    if (!target || target.special || !CARD_COLORS.includes(color)) return; // ต้องเลือกการ์ดเลข (ไม่ใช่การ์ดพิเศษ) + สีที่ถูกต้อง
    const oldColor = target.color;
    target.color = color;
    checkBlueTrigger(p); // เผื่อเปลี่ยนสีแล้วครบฟ้า 3 ใบพอดี
    lastLog.push(`🎨 ${p.name} ใช้ยาเปลี่ยนสีการ์ด — เปลี่ยนไพ่ ${cardLabel(target)} จาก${CARD_COLOR_NAME[oldColor]}เป็น${CARD_COLOR_NAME[color]}`);
  } else if (item.type === "fortune") {
    p.statuses.fortune = Math.min(BARD_FORTUNE_MAX, (p.statuses.fortune || 0) + SHOP_FORTUNE_AMOUNT);
    p.fortuneIdle = 0;
    lastLog.push(`🍀 ${p.name} ใช้ยาโชคลาภ — ได้โชคลาภ +${SHOP_FORTUNE_AMOUNT} จากคลัง`);
  } else if (item.type === "resist") {
    p.statuses.resist = Math.max(p.statuses.resist || 0, SHOP_RESIST_TURNS);
    lastLog.push(`🛡️ ${p.name} ใช้ยาต้านสถานะ — ต้านสถานะผิดปกติ ${SHOP_RESIST_TURNS} เทิร์น จากคลัง`);
  } else if (item.type === "cardRemove") {
    if (gameState !== "PLAYING" || p.locked || !p.cards || p.cards.length === 0) return;
    const removed = p.cards.pop();
    centralDeck.push(removed); // คืนไพ่ที่ลดออกกลับเข้ากองกลาง ให้คนอื่นจั่วได้อีก
    p.busted = bustedOf(p);
    lastLog.push(`✂️ ${p.name} ใช้ยาลดไพ่ — ลดไพ่ใบล่าสุด (${cardLabel(removed)}) ออก คืนเข้ากองกลาง${p.busted ? "" : " — ไพ่ไม่แตกแล้ว!"}`);
  } else if (item.type === "skillPoint") {
    addSkill(p, item.value, "item");
    lastLog.push(`⚡ ${p.name} ใช้ยาฟื้นแต้มสกิล +${item.value} จากคลัง (เพดาน ${maxSkillOf(p)})`);
  } else if (item.type === "armor") {
    const healed = healArmor(p, item.value);
    lastLog.push(`🔧 ${p.name} ใช้ยาฟื้นเกราะ +${healed} จากคลัง`);
  } else if (item.type === "heroSword") {
    if (gameState !== "PLAYING" || p.locked) return;
    p.statuses.heroSword = 2;
    lastLog.push(`⚔️ ${p.name} ใช้ “ดาบผู้กล้า” — พลังโจมตีปกติ +2 เป็นเวลา 2 เทิร์น`);
  } else if (item.type === "wineBarrel") {
    if (gameState !== "PLAYING" || p.locked) return; // ของกดใช้: ใช้ได้เฉพาะช่วงกำลังจั่วไพ่อยู่เท่านั้น
    if (!CHAR_HOOKS.escanor.useWineBarrel(engine, p, item)) return;
    lastLog.push(`🍷 ${p.name} ดื่ม ${item.name || `WineBarrel Lv.${item.level || 1}`} จากคลัง`);
  } else if (item.type === "tepeuMeal") {
    const healed = healHp(p, item.value);
    lastLog.push(`🍲 ${p.name} ใช้ "มื้อที่สุข" — ฟื้นพลังชีวิต +${healed} จากคลัง`);
  } else if (item.type === "gutsGun" || item.type === "blackSparklence") {
    return; // ปืนเป็นไอเทมถาวร ไม่ใช่ของกดใช้ — ต้อง return ก่อนถึง splice ท้ายฟังก์ชัน ไม่งั้นปืนหายทันทีที่กด
  } else if (item.type === "gutsAmmo") {
    if (item.ammo === "hyper_trigger") {
      const readyRound = p.hyperTriggerReadyRound || 0;
      if (gameState !== "PLAYING" || p.locked || !hasGutsGun(p) || p.gutsShotTurn === roundNumber || p.characterId === "ultraman_trigger" || p.characterId === "ignis" || hasBlackSparklence(p) || roundNumber < readyRound) return;
      if (!CHAR_HOOKS.ultraman_trigger.activate(engine, p)) return;
      p.gutsShotTurn = roundNumber;
      pausePlayingForCutscene();
      return;
    }
    if (item.ammo === "trigger_dark_key") {
      if (gameState !== "PLAYING" || p.locked || !hasBlackSparklence(p) || p.gutsShotTurn === roundNumber || roundNumber < (p.blackSparklenceReadyRound || 0)) return;
      if (!CHAR_HOOKS.ignis.activateTriggerDark(engine, p)) return;
      p.inventory.splice(idx, 1);
      p.gutsShotTurn = roundNumber;
      pausePlayingForCutscene();
      return;
    }
    const target = gutsFireTargetOf(p, item, opts.targetId);
    if (!target) return; // ยิงไม่ได้ = ไม่เสียกระสุน
    p.gutsShotTurn = roundNumber; // 1 นัดต่อเทิร์น — จองไว้ตั้งแต่ตอนกด กันยิงซ้ำระหว่างวีดีโอเล่นอยู่
    lastLog.push(`🔫 ${p.name} ยิง ${GUTS_AMMO[item.ammo].name} ใส่ ${target.name}!`);
    // วีดีโอเต็มจอของกระสุนแต่ละแบบเล่นครั้งเดียวต่อเกม "ต่อผู้ยิงแต่ละคน" (เก็บใน p.cutsceneShown เหมือน
    //  วีดีโอแปลงร่างของตัวละคร — รีเซ็ตทุกแมตช์ใหม่ใน resetCombat) ครั้งต่อไปเป็นการ์ดแจ้งเตือนเล็ก ไม่หยุดกระดาน
    const key = GUTS_AMMO[item.ammo].cut;
    if (p.cutsceneShown[key]) notifyTransform(p, key);
    else { p.cutsceneShown[key] = true; cutsceneKey = key; }
    pendingShot = { item, target };
  } else {
    return;
  }
  p.inventory.splice(idx, 1);
  // คอนเนอร์ RK800 (สกิลติดตัว 1 สืบสวน): การใช้ไอเทม 1 ครั้ง = ความเครียด +1
  CHAR_HOOKS.conner.onItemUsed(engine, p);
  if (cutsceneKey) {
    // เล่นวีดีโอก่อน แล้วค่อยให้ผลของกระสุนเกิดขึ้นตอนวีดีโอจบ (ผู้เล่นจะเห็นความเสียหายโผล่หลังจบวีดีโอ)
    queueCutscene(p, cutsceneKey);
    // ห่อ withEffectSource ซ้ำ: คอลแบ็กนี้ทำงาน "หลังวีดีโอจบ" ซึ่งหลุดออกจากขอบเขต effectSourceId ของ
    //  onPlayerEvent ไปแล้ว — ไม่ห่อ = ตราล่าเวท (ผู้สังหารเมจ) และ friendly-fire check ไม่รู้ว่าใครยิง
    pausePlayingForCutscene(() => withEffectSource(p, () => applyGutsBullet(p, pendingShot.item, pendingShot.target)));
  } else {
    if (pendingShot) applyGutsBullet(p, pendingShot.item, pendingShot.target); // ไม่มีวีดีโอ = ให้ผลทันที
    broadcastState();
  }
}
// ตรวจว่ายิงได้ไหม + คืนเป้าหมายที่ถูกต้อง (null = ยิงไม่ได้)
//  ยิงได้เฉพาะช่วงจั่วไพ่และยังไม่เปิดไพ่ / ต้องมีปืน / 1 นัดต่อเทิร์น / เป้าหมายต้องเป็นคนอื่นที่ยังไม่ตกรอบ
function gutsFireTargetOf(p, item, targetId) {
  if (gameState !== "PLAYING" || p.locked) return null;
  if (!hasGutsWeapon(p)) return null;
  if (hasBlackSparklence(p) && roundNumber < (p.blackSparklenceReadyRound || 0)) return null;
  if (p.gutsShotTurn === roundNumber) return null;
  if (!GUTS_AMMO[item.ammo]) return null;
  const target = players[targetId];
  if (!target || !target.alive || target.id === p.id || sameTeam(p, target)) return null;
  return target;
}
// ให้ผลของกระสุน — เรียกหลังวีดีโอจบเท่านั้น (ดู pausePlayingForCutscene)
function applyGutsBullet(p, item, target) {
  // Nursedessei Cannon: ยิงเสร็จปืนพัง หายจากกระเป๋า ต้องซื้อใหม่ (พังแม้เป้าหมายจะตกรอบไปก่อนแล้ว)
  if (GUTS_AMMO[item.ammo].breaksGun) {
    const gunIdx = (p.inventory || []).findIndex((it) => it.type === "gutsGun");
    if (gunIdx >= 0) p.inventory.splice(gunIdx, 1);
    else if (hasBlackSparklence(p)) p.blackSparklenceReadyRound = roundNumber + BLACK_SPARKLENCE_NURSE_COOLDOWN + 1;
  }
  if (!target || !target.alive) { // เป้าหมายตกรอบระหว่างวีดีโอเล่น — กระสุนสูญเปล่า
    lastLog.push(`💨 ${GUTS_AMMO[item.ammo].name} พลาดเป้า — ${target ? target.name : "เป้าหมาย"} ตกรอบไปก่อนแล้ว`);
    return;
  }
  if (item.ammo === "shockwave") {
    const before = target.armor;
    for (let i = 0; i < before; i++) { if (target.armor > 0) loseArmor(target); }
    mageslayerMarkSteal(target, before); // ตราล่าเวท: กระสุนนี้ทำลายเกราะด้วย loseArmor ตรงๆ ไม่ผ่านท่อ deal* จึงต้องเรียกเอง
    lastLog.push(before > 0
      ? `💥 Shockwave Bullet — เกราะของ ${target.name} ถูกทำลายทั้งหมด (-${before}) แต่พลังชีวิตจริงไม่ได้รับความเสียหาย`
      : `💨 Shockwave Bullet — ${target.name} ไม่มีเกราะให้ทำลาย กระสุนสูญเปล่า`);
  } else if (item.ammo === "gargorgon") {
    target.gutsGargorgonPending = true;
    lastLog.push(`🌑 Gargorgon Ray — ${target.name} จะติดสถานะสตั้นในเทิร์นถัดไป (ต้านทานได้)`);
  } else if (item.ammo === "thunder") {
    if (applyDebuff(target, "chaa", null, GUTS_CHAA_TURNS)) lastLog.push(`⚡ Thunder Bullet — ${target.name} ติดสถานะ [สภาพชา] ${GUTS_CHAA_TURNS} เทิร์น (กดจั่ว 1 ครั้งได้ไพ่ 2 ใบ)`);
    else lastLog.push(`🛡️ Thunder Bullet — ${target.name} ต้านสถานะผิดปกติไว้ได้ ไม่ติด [สภาพชา]`);
  } else if (item.ammo === "nurse") {
    dealMixed(target, GUTS_NURSE_DMG);
    lastLog.push(hasBlackSparklence(p)
      ? `☄️ Nursedessei Cannon — ${target.name} เสียหาย -${GUTS_NURSE_DMG} (ลดเกราะก่อน) และ Black Sparklence ของ ${p.name} ใช้งานไม่ได้ ${BLACK_SPARKLENCE_NURSE_COOLDOWN} เทิร์น!`
      : `☄️ Nursedessei Cannon — ${target.name} เสียหาย -${GUTS_NURSE_DMG} (ลดเกราะก่อน) และปืนของ ${p.name} พังหายไป!`);
    maybeBeatSave(target);
    maybeBeatMode(target);
    maybeEva3(target);
    maybeWakeKotone(target);
    if (target.alive && target.hp <= 0) {
      instantDeath(target);
      if (!target.alive) lastLog.push(`💀 ${target.name} เลือดจริงหมด ตกรอบ!`);
    }
  }
}

function dealRound() {
  clearPhaseTimer();
  roundNumber++;
  yuukiReactiveDrawCredits = 0;
  overloadForceActive = !!yuukiBoss(); // หลังยูกิเกิด Overload Force คงอยู่จนกว่าบอสจะตาย
  if (yuukiBoss()) yuukiTurns++;
  centralDeck = buildCentralDeck(); // กองกลาง 43 ใบ สับใหม่ทุกรอบ
  lastLog = [];
  attackerId = null;
  roundWinnerId = null;
  roundTiedWin = false;
  doomTieAttack = false;
  cutsceneQueue = []; // ล้างคิวเก่าก่อนเสมอ — ต้องอยู่ก่อน rollWindow/CHAR_HOOKS ด้านล่างทั้งหมด ไม่งั้นคัตซีนที่เพิ่งคิวไว้จะโดนล้างทิ้งไปด้วย
  cutsceneInfo = null;
  lastAttack = null;
  roundSkills = [];
  anataMusicSeq = 0;
  // Mana Rupture ทำงานต้นเทิร์นถัดไป ก่อนแจกไพ่/เริ่มการกระทำ
  CHAR_HOOKS.mageslayer.resolveDueRuptures(engine);
  // ร้านค้ามายา (patch 2.2 full): เปิดทุกๆ 5 เทิร์น ตอนเริ่มเทิร์นใหม่
  if (roundNumber % SHOP_INTERVAL_TURNS === 0) openShop();
  // ยูนะ ไอดอลประจำสนาม: ม้วนลูกเต๋าทุกๆ 5 เทิร์น เริ่มจากเทิร์นที่ 16 (16, 21, 26, ...)
  //  เอจิ: ระหว่างท่าไม้ตาย ไม่ว่ายังก็ตาม บังคับเปิดสนามอยู่ ยูนะจะไม่เกิดขึ้นเองแบบปกติ
  if (roundNumber >= 16 && (roundNumber - 16) % 5 === 0 && !eijiUltFieldActive()) YunaMod.rollWindow(engine, roundNumber);
  // รีเซ็ตเวลากลางคืน (Lie Like Vortigern): นับกลางคืนใหม่ — เทิร์นนี้เป็นคืนที่ 1 จาก 3
  const prevNight = isNightRound(roundNumber - 1); // เช็คด้วยวงจรเดิมก่อนเลื่อน (กันแบนเนอร์สลับเวลาเด้งผิด)
  if (nightResetPending) {
    nightResetPending = false;
    cycleShift = roundNumber - (CYCLE_TURNS + 1); // ให้เทิร์นนี้ตรงกับคืนแรกของวงจร
  }

  for (const p of Object.values(players)) {
    resetRoundDisplay(p);
    // ธงบังคับไพ่แตกของมุยมิผูกกับเลขเทิร์นอยู่แล้ว แต่ล้างค่าค้างไว้ให้ state อ่านง่ายและกัน snapshot เก่า
    if (p.muimiForcedBustRound !== roundNumber) p.muimiForcedBustRound = 0;
    p.shield = 0;
    // บานาจ (patch 2.1.2): Absorb shield — โล่ฟื้นให้ทุกต้นเทิร์นที่ผลยังอยู่ (คงอยู่ 2 เทิร์นตามสถานะ bshield)
    if ((p.statuses.bshield || 0) > 0) p.shield += BANAGHER_SHIELD_AMT;
    p.skillUsedRound = false; // เทิร์นใหม่ ใช้สกิลได้อีก 1 อัน
    // DoomGuy (patch 2.2 full): Quick Swap ใช้ได้อีก 1 ครั้งต่อเทิร์น
    if (p.characterId === "doomguy") p.doomQuickSwapUsed = false;
    if ((p.wouGuardCd || 0) > 0) p.wouGuardCd--; // ซาโตรุ (patch 2.0.8.3): คูลดาวน์ลบล้างลดลงทุกต้นเทิร์น (2 เทิร์นต่อการใช้)
    // Apple guy (characters/appleguy.js): บัฟพลังโจมตีแต่ละหน่วยนับถอยหลังแยกกัน — หมดอายุเองเมื่อครบ
    if (p.characterId === "appleguy") CHAR_HOOKS.appleguy.onRoundStartDecay(p);
    // เทเปา (patch 2.2 new): ทำอาหาร/ครุ่นคิด/ฉากหลังไม้ตาย นับถอยหลังที่ endTurn() แทน (ต้องอ่านค่าก่อนลดเพื่อรู้ "เทิร์นสุดท้าย" ให้ตรง)
    p.bardNotesUsed = 0;      // Bard: นับโน้ตใหม่ทุกเทิร์น (จำกัด 2 — มิติวิญญาณไม่จำกัด)
    p.kaiSkillUsesRound = 0;  // ไค: งบสกิล 2 ครั้ง (รังสรรค์/ลงทัณฑ์ ผสมกันได้อิสระ) เต็มใหม่ทุกเทิร์น
    p.takumiSkillUsesRound = 0; // ทาคุมิ: งบสกิลรวม 5 ครั้งต่อเทิร์น (พื้นฐาน/รอง/ท่าไม้ตาย ผสมกันได้อิสระ) เต็มใหม่ทุกเทิร์น
    CHAR_HOOKS.doomguy.onRoundStartFortuneRoll(engine, p); // DoomGuy: ทุกต้นเทิร์นมีโอกาส 20% ได้ [โชคลาภ] +1 สแตค
    p.anataTargets = null;
    p.hakunoLowDraw = false; // ข้าขอบัญชา (หญิง คิชินามิ ฮาคุโนะ): จำกัดจั่ว 2/3 แต้ม เฉพาะเทิร์นที่ใช้เท่านั้น
    // ห้ามจั่วการ์ดเพิ่มที่ตั้งไว้จากเทิร์นก่อน (ทงคัสสึ / กำไรเท่าตัวโว้ย) — noDrawNext เป็นจำนวนเทิร์น
    if (p.noDrawNext) {
      p.statuses.nodraw = Math.max(p.statuses.nodraw || 0, Number(p.noDrawNext) || 1);
      p.noDrawNext = 0;
    }
    // ห้ามใช้สกิลที่ตั้งไว้จากเทิร์นก่อน (หอกลองกินัส เอวา 13)
    if (p.noSkillNext) {
      p.statuses.noskill = Math.max(p.statuses.noskill || 0, Number(p.noSkillNext) || 1);
      p.noSkillNext = 0;
    }
    // ชะงัก (The Beat of Victory โอกูริ patch 2.0.8.1): ติดจากการถูกโจมตีเทิร์นก่อน — เริ่มมีผลเทิร์นนี้
    if (p.staggerNext) {
      p.statuses.stagger = Math.max(p.statuses.stagger || 0, Number(p.staggerNext) || 1);
      p.staggerNext = 0;
    }
    // ค่าปรับปฏิเสธข้อเสนอ (เจ้าแห่งเน็ตบ้าน): แต้มจบเทิร์นลด 1 — เริ่มนับเทิร์นถัดไปจากที่ปฏิเสธ
    if (p.skillDrainPending) {
      p.skillDrain = Math.max(p.skillDrain || 0, p.skillDrainPending);
      p.skillDrainPending = 0;
    }
    // คอนเนอร์ RK800 (สกิลติดตัว 3 ปัญญาประดิษฐ์): ครบ 10 เทิร์นหลังตาย -> กลับเข้าสนามด้วยเลือด 3 เกราะ 2
    //  ต้องอยู่ "ก่อน" บล็อกข้ามผู้เล่นที่ตายแล้ว ไม่งั้นเทิร์นที่ฟื้นจะไม่ได้รับไพ่ใบแรก
    if (!p.alive) CHAR_HOOKS.conner.maybeRevive(engine, p);
    // ยุย: สมบัติล้ำค่าที่สุด..... — ครบกำหนดแล้วชุบชีวิตเป้าหมายที่จองไว้ (ตัวยุยเองต้องยังอยู่)
    if (p.characterId === "yui") CHAR_HOOKS.yui.maybeRevive(engine, p);
    if (!p.alive) { p.cards = []; p.locked = true; p.busted = false; p.overloadDrawReady = false; continue; }

    if (isYuuki(p) && p.hp <= 4) {
      p.statuses.fortune = Math.min(BARD_FORTUNE_MAX, (p.statuses.fortune || 0) + 1);
      lastLog.push(`🍀 ${p.name} อยู่ในช่วงพลังชีวิตต่ำ — ได้โชคลาภ +1`);
    }

    // กลางคืน (patch 2.1.7): สุ่มใหม่ทุกเทิร์นว่าสกิลพื้นฐานหรือสกิลรอง (อย่างใดอย่างหนึ่ง) จะใช้แต้มมากขึ้น — ไม่มีผลกับท่าไม้ตาย
    if (isNightRound(roundNumber)) {
      const ch0 = CHAR_BY_ID[p.characterId];
      const taxCandidates = [];
      if (ch0 && ch0.basic) taxCandidates.push("basic");
      if (ch0 && ch0.secondary) taxCandidates.push("secondary");
      p.nightTaxTier = taxCandidates.length ? taxCandidates[Math.floor(Math.random() * taxCandidates.length)] : null;
    } else {
      p.nightTaxTier = null;
    }
    p.phenexTauntGrace = false; // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล): ผ่านเทิร์นที่หมดเวลาพอดีไปแล้ว ล้างค่านี้ทิ้ง

    // ---------- นานายะ ชิกิ (characters/nanaya.js) ----------
    p.nanayaToggleUsed = false; // Mystic eye of death perception: เปิด/ปิดได้อีก 1 ครั้งในเทิร์นใหม่นี้
    if (p.characterId === "nanaya") CHAR_HOOKS.nanaya.onRoundStartRest(engine, p);

    // ---------- คิชินามิ ฮาคุโนะ (patch 2.2.1, characters/hakuno.js) ----------
    p.hakunoGenderSwitched = false; // เธอ/นาย คือฉันหรอ?: สลับเพศได้อีก 1 ครั้งในเทิร์นใหม่นี้
    CHAR_HOOKS.hakuno.onRoundStartRest(engine, p);

    // รุ่งอรุณแห่งวันใหม่ (โอเบรอน): เสียพลังชีวิตเทิร์นละ 1 หน่วยแบบไม่สนเกราะ (รวม 2 เทิร์น)
    //  ผลด้านลบจากสกิลหักเลือดได้เรื่อยๆ แต่ห้ามตาย — ค้างที่พลังชีวิต 1 หน่วย
    if ((p.sunriseDrop || 0) > 0) {
      p.sunriseDrop--;
      if (p.hp > 1 || (p.tempHp || 0) > 0) {
        loseHp(p);
        lastLog.push(`🌄 ${p.name} ผลรุ่งอรุณแห่งวันใหม่จางลง — พลังชีวิต -1${p.sunriseDrop > 0 ? ` (เหลืออีก ${p.sunriseDrop} เทิร์น)` : ""}`);
      } else {
        lastLog.push(`🌄 ${p.name} ผลรุ่งอรุณแห่งวันใหม่จางลง — พลังชีวิตเหลือ 1 จึงไม่ลดต่อ`);
      }
    }

    // ---------- ซาโตรุ อาเคฟุ (patch 2.0.8.2): ดาเมจต่อเนื่องทุก 2 เทิร์น ----------
    //  สิ่งแปลกปลอม (Obla Di, Obla Da): ดาเมจ 1 / [Calamity]: ดาเมจตามเลเวล — ทำงานตอนเวลาคงเหลือเป็นเลขคี่
    {
      let dotDmg = 0;
      const dotFrom = [];
      if ((p.statuses.oblada || 0) > 0 && p.statuses.oblada % 2 === 1) { dotDmg += 1; dotFrom.push("สิ่งแปลกปลอม"); }
      if ((p.statuses.calamity || 0) > 0 && p.statuses.calamity % 2 === 1) {
        const lv = Math.max(1, (p.statusAmt && p.statusAmt.calamity) || 1);
        dotDmg += lv;
        dotFrom.push(`Calamity Lv${lv}`);
      }
      if (dotDmg > 0) {
        dealMixed(p, dotDmg);
        maybeBeatSave(p);
        maybeBeatMode(p);
        maybeEva3(p);
        p.wasAttacked = true;
        lastLog.push(`🌩️ ${p.name} ถูกหายนะกัดกิน (${dotFrom.join(" + ")}) — รับความเสียหาย -${dotDmg}`);
        if (p.alive && p.hp <= 0) {
          instantDeath(p);
          if (!p.alive) lastLog.push(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
          p.cards = [];
          p.locked = true;
          p.busted = false;
          continue;
        }
      }
    }

    // แด่เพื่อนรักของฉัน (ชเรด เอลัน): ระหว่างชาร์จไม่เสียเลือดแล้ว (patch พิเศษ) — แจ้งนับถอยหลังอย่างเดียว
    if (CHAR_HOOKS.shrade_elan.charging(p)) {
      lastLog.push(`🎻 ${p.name} บรรเลงบทเพลงสุดท้าย — เหลืออีก ${p.statuses.shradecharge} เทิร์นจะปลดปล่อย`);
    }

    // เครื่องดื่มชูกำลัง (Apple guy): เพิ่มแต้มสกิล 1 แต่เสียพลัง 1 หน่วยต่อเทิร์น
    //  ความเสียหายธรรมดา (โดนโล่/เกราะก่อน ไม่เจาะเกราะ) และไม่ถึงตาย — เลือดค้างที่ 1
    if ((p.statuses.energy || 0) > 0) {
      addSkill(p, 1, "item");
      if (p.shield > 0 || p.armor > 0 || (p.tempHp || 0) > 0 || p.hp > 1) {
        damageSoft(p);
        lastLog.push(`🥤 ${p.name} เครื่องดื่มชูกำลังออกฤทธิ์ — แต้มสกิล +1 เสียพลัง 1 หน่วย (เกราะก่อน)`);
      } else {
        lastLog.push(`🥤 ${p.name} เครื่องดื่มชูกำลังออกฤทธิ์ — แต้มสกิล +1 (พลังชีวิตเหลือ 1 จึงไม่ลด)`);
      }
    }

    // เกราะฟื้น 1 หน่วยทุก 2 เทิร์น (รอบเลขคู่) — เหมือนกันทั้งกลางวัน/กลางคืน (ยกเลิกโบนัสฟื้นทุกเทิร์นตอนกลางคืน patch 2.1.7)
    // Beat Mode: หลังกันตายทำงาน เกราะจะไม่ฟื้นคืน
    // หนูจะทำให้พี่ตาสว่างเอง (อาริมะ มิยาโกะ patch 2.2.0): เกราะไม่ฟื้นตามจำนวนเทิร์นที่เหลือ
    // MOON*CELL (คิชินามิ ฮาคุโนะ patch 2.2.1): เกราะไม่ฟื้นเลยระหว่างท่าไม้ตายทำงาน รวมถึงตัวเอง
    // [โหมงานหนัก] (โคโตเนะ patch 2.2.2): เปลี่ยนไปพังโล่แทนเกราะแล้ว — เกราะฟื้นได้ตามปกติ
    // ผุพัง (สถานะ Universal patch 2.2 beta — ไวท์เล็น "ฉันขอรับไปนะคะ"): เกราะไม่ฟื้นระหว่างมีผล
    //  แบทแมนร่างรถ: เกราะคือ "พลังชีวิตของรถ" ไม่ใช่เกราะจริง — ห้ามฟื้นเอง ไม่งั้นรถซ่อมตัวเองฟรีทุก 2 เทิร์น
    //  และจะไม่มีวันพังเลยถ้าโดนตีเบาๆ (สเปคระบุว่า "ขึ้นรถถาวรจนกว่ารถจะพัง" = ต้องพังได้จริง)
    if (!p.armorLocked && !((p.statuses.decay || 0) > 0) && !moonCellActive() && roundNumber % 2 === 0
        && !CHAR_HOOKS.bat_ben.blocksArmorRegen(p)) {
      healArmor(p, 1);
    }
    // คู่แฝดฮิซากาว่า: แฝดที่พักอยู่ฟื้นเกราะเองได้ตามจังหวะเดียวกัน แม้ไม่ได้ถูกควบคุมอยู่
    //  (เงื่อนไข "ผุพัง" คิดจากสถานะของแฝดคนนั้นเอง — ดู CHAR_HOOKS.hisakawa_sister.regenRestingArmor)
    if (!p.armorLocked && !moonCellActive() && roundNumber % 2 === 0) CHAR_HOOKS.hisakawa_sister.regenRestingArmor(engine, p);
    // เสือนอนกิน (เจ้าแห่งเน็ตบ้าน): ฟื้นพลังชีวิต 1 หน่วยในเทิร์นถัดไป (กรณีไม่มีคู่สัญญา)
    if ((p.healNextTurn || 0) > 0) {
      const heal = healHp(p, p.healNextTurn);
      if (heal > 0) lastLog.push(`🐯 ${p.name} เสือนอนกิน — ฟื้นพลังชีวิต +${heal}`);
      p.healNextTurn = 0;
    }
    // การตื่นขึ้น (Lai Rhyme Goodfellow โอเบรอน): ฟื้นพลังชีวิตเทิร์นละ 1 หน่วย
    if ((p.statuses.awaken || 0) > 0 && healHp(p, 1) > 0) {
      lastLog.push(`⏰ ${p.name} การตื่นขึ้น — ฟื้นพลังชีวิต +1`);
    }
    firePassive(p, "roundStart");

    // ---------- โอกูริ แคป (Rework): Stamina ชาร์จ / ยุคทอง / Zone (GrayBeast) / หมดแรง (Burnout) / Sunny Day — เช็คตอนเริ่มเทิร์น ----------
    CHAR_HOOKS.oguri.onRoundStartTick(engine, p);
    withEffectSource(p, () => CHAR_HOOKS.escanor.onRoundStartTick(engine, p, prevNight));
    CHAR_HOOKS.hisakawa_sister.onRoundStartTick(engine, p);

    // ---------- ลุกไหม้ (hburn, สถานะ Universal): ดาเมจ 1/เทิร์น สะสมสูงสุด 6 — ย้าย body ไป characters/_universal_status.js แล้ว ----------
    tickBurn(engine, p);
    // ---------- เลือดไหล (hbleed, สถานะ Universal patch 2.5): ดาเมจ 1/เทิร์น สะสมสูงสุด 6 (ฮารุกะฟื้นเลือดแทน) ----------
    tickBleed(engine, p);
    // ---------- [โดนดูด] (doomDrain, Plasma Rifle — DoomGuy): ดาเมจ 1/เทิร์น 3 เทิร์น เจาะเกราะก่อน ----------
    CHAR_HOOKS.doomguy.tickDrain(engine, p);
    // ---------- บานาจ (patch 2.1.2, characters/banagher.js): Full Assault — ตีหมู่ทุกคนต่อเนื่องทุกต้นเทิร์นที่ผลยังอยู่ ----------
    CHAR_HOOKS.banagher.onRoundStartFullAssaultTick(engine, p);
    p.cards = [];
    // New Omega (ฮารุกะ): ธงบังคับไพ่แตกมีผลแค่เทิร์นที่กด — กดใหม่ถึงจะระเบิดอีกครั้ง
    //  ต้องล้าง "ก่อน" แจกไพ่ใบแรกด้านล่าง ไม่งั้น onCardDrawn/bustedOf ระหว่างแจกจะยังอ่านธงของเทิร์นที่แล้ว
    CHAR_HOOKS.haruka.clearBurst(p);
    p.cardBonus = 0; // แต้มการ์ดโบนัส (Ashen Trail โอกูริ patch 2.1.1) — รีเซ็ตทุกเทิร์น
    p.colorTrigger = { red: 0, blue: 0, green: 0, yellow: 0 }; // นับจำนวนครั้งที่ทริกเกอร์สีนั้นทำงานไปแล้วในรอบนี้
    p.statusAmt.cardAtkBonus = 0; // พลังโจมตีจากการ์ดแดง — รีเซ็ตทุกรอบ
    resetOverloadDrawCounter(p, false); // ไพ่ตั้งต้นไม่นับเป็นไพ่จั่วเพิ่มของ Overload Force
    { const c = drawInitialCard(p); if (c) { p.cards.push(c); onCardDrawn(p, c); } }
    p.overloadDrawReady = overloadForceActive;
    p.locked = false;
    p.busted = false;
    p.result = null;

    // [Calamity] (ซาโตรุ patch 2.0.8.2): ถูกบังคับจั่วไพ่เพิ่มตามเลเวล ตอนเริ่มเทิร์นถัดจากที่โดน
    if ((p.calamityDraw || 0) > 0) {
      const n = p.calamityDraw;
      p.calamityDraw = 0;
      for (let i = 0; i < n; i++) { const c = drawCardFor(p); if (c) { p.cards.push(c); onCardDrawn(p, c); } }
      p.busted = bustedOf(p);
      lastLog.push(`🌩️ [Calamity] บังคับ ${p.name} จั่วไพ่เพิ่ม ${n} ใบ${p.busted ? " — ไพ่แตกตั้งแต่ต้นเทิร์น!" : ""}`);
      if (p.busted) {
        voidUltimateOnBust(p);
        maybeMoonBurst(p);
      }
    }

    // หลับไหล (Lie Like Vortigern โอเบรอน): ออกการกระทำใดๆ ไม่ได้ทั้งเทิร์น
    // และเสียพลังชีวิตแบบไม่สนเกราะเทิร์นละ 1 หน่วย — หักได้เรื่อยๆ แต่ห้ามตาย (ค้างที่ 1 หน่วย)
    if ((p.statuses.sleep || 0) > 0) {
      p.locked = true;
      if (p.hp > 1) { p.hp--; p.dmgHp++; hisakawaSyncOut(p); }
      lastLog.push(`💤 ${p.name} หลับไหลจากคำลวงของราชาภูติ — ขยับไม่ได้ (เหลืออีก ${p.statuses.sleep} เทิร์น)`);
    }

    // ---------- แบทแมน (characters/bat_ben.js): เหรียญกลางคืน / ฟื้นเลือดจากเร้นเงา / ฟื้นเลือดจากเข้ามาเลย ----------
    CHAR_HOOKS.bat_ben.onRoundStartTick(engine, p);
    // ---------- เจ้าหญิงราก (characters/princess_shiki.js): แต้มสกิลฟื้นเองทุกเทิร์น ----------
    CHAR_HOOKS.princess_shiki.onRoundStartTick(engine, p);
    // ---------- ฟุจิตะ โคโตเนะ (characters/kotone.js): Sleeping time (ฮีล/แต้มสกิลต่อเทิร์น) + สตั้นจากท่านประธานเซนะจัง ----------
    CHAR_HOOKS.kotone.onRoundStartTick(engine, p);
    // ---------- เอจิ (characters/eiji.js): รีเซ็ตโควตาหลบหลีก/Ordinal Scale + ฟื้นเลือดจากความเร็วสูง ----------
    if (p.characterId === "eiji") CHAR_HOOKS.eiji.onRoundStartTick(engine, p);
    // ---------- มิซึซาว่า ฮารุกะ (characters/haruka.js): รีเซ็ตโควตาสกิลพื้นฐาน 2 ครั้ง + โควตาเลือดไหลของสกิลติดตัว ----------
    if (p.characterId === "haruka") CHAR_HOOKS.haruka.onRoundStartTick(engine, p);
    // ---------- ยุย โยชิโอกะ (characters/yui.js): ล็อกมือระหว่างบรรเลงเพลงชุบชีวิต ----------
    if (p.characterId === "yui") CHAR_HOOKS.yui.onRoundStartTick(engine, p);
    // ---------- อิสึกะ ชิโด (characters/shido.js): ภูติ — ฟื้นพลังชีวิตต่อเทิร์น ----------
    if (p.characterId === "shido") CHAR_HOOKS.shido.onRoundStartTick(engine, p);
    // ---------- โมโรโบชิ ดัน (characters/dan.js): ไม้ค้ำพยุงร่าง — ฟื้นพลังชีวิตต่อเทิร์น ----------
    if (p.characterId === "dan") CHAR_HOOKS.dan.onRoundStartTick(engine, p);
    // ---------- คอนเนอร์ RK800 (characters/conner.js): รีเซ็ตโควตา "จั่วไพ่ = เครียด +1 ต่อเทิร์น" + ธงวิเคราะห์สถานการณ์ ----------
    CHAR_HOOKS.conner.onRoundStartTick(engine, p);
    // ---------- อาจารย์ ไบเลธ (characters/byleth.js): รีเซ็ตโควตาสกิล 5 ครั้ง + หลักสูตรกินความรู้เทิร์นละ 1 ----------
    if (p.characterId === "byleth") CHAR_HOOKS.byleth.onRoundStartTick(engine, p);
    // สตั้น/ห้ามใช้สกิลพื้นฐาน ที่หลักสูตรของไบเลธตั้งไว้เมื่อเทิร์นก่อน -> เริ่มมีผลตอนนี้
    //  ต้องอยู่ "ก่อน" บล็อกเช็คสตั้นด้านล่าง (เหตุผลเดียวกับ Gargorgon Ray) ไม่งั้นสตั้นจะเลื่อนไปอีกเทิร์น
    CHAR_HOOKS.byleth.applyPendingFromCourses(engine, p);
    // อิปโป (characters/ippo.js): Uper Cut ตั้งสตั้นไว้เมื่อเทิร์นก่อน -> เริ่มมีผลตอนนี้
    //  ต้องอยู่ "ก่อน" บล็อกเช็คสตั้นด้านล่าง ไม่งั้นสตั้นจะเลื่อนไปมีผลอีกเทิร์นหนึ่ง
    CHAR_HOOKS.ippo.applyPendingStun(engine, p);
    // ---------- ผู้วิงวอน (characters/the_supplicant.js): รีเซ็ตโควตาสกิล 2 ครั้ง + ต่ออายุ "กระแสเวท" ถาวร ----------
    CHAR_HOOKS.the_supplicant.onRoundStartTick(engine, p);
    // ---------- "เยียวยา" (สถานะ Universal patch 3.4): ฟื้นพลังชีวิตต่อเทิร์นตามจำนวนหน่วย ----------
    //  วางไว้ที่นี่ (ต้นเทิร์น) เหมือนลุกไหม้/เลือดไหล การลดเทิร์นทำที่ลูปกลางของ endTurn ตามปกติ
    tickMend(engine, p);
    // อมาซอน (ฮารุกะ สกิลติดตัว): โดนสวนกลับเมื่อเทิร์นก่อน -> สตั้นเริ่มมีผลตอนนี้
    //  ต้องอยู่ "ก่อน" บล็อกเช็คสตั้นด้านล่างเหมือน Gargorgon Ray ไม่งั้นสตั้นจะเลื่อนไปอีกเทิร์นหนึ่ง
    if (p.harukaStunPending > 0) {
      const turns = p.harukaStunPending;
      p.harukaStunPending = 0;
      if (applyDebuff(p, "stun", null, turns)) lastLog.push(`🌑 ${p.name} โดนอมาซอนสวนกลับเมื่อเทิร์นก่อน — ติดสถานะสตั้น ${turns} เทิร์น!`);
    }
    // Gargorgon Ray (ปืนหน่วย GUTS Select): ผลหน่วง 1 เทิร์น — เช็คต้านสถานะตอนนี้ (เป้าหมายซื้อยาต้านมากันไว้ทัน)
    //  ต้องอยู่ "ก่อน" บล็อกเช็คสตั้นด้านล่าง ไม่งั้นสตั้นจะข้ามไปมีผลอีกเทิร์นหนึ่ง
    if (p.gutsGargorgonPending) {
      p.gutsGargorgonPending = false;
      if (applyDebuff(p, "stun", null, 1)) lastLog.push(`🌑 ${p.name} โดน Gargorgon Ray เมื่อเทิร์นก่อน — ติดสถานะสตั้น 1 เทิร์น!`);
      else lastLog.push(`🛡️ ${p.name} ต้านผลของ Gargorgon Ray ไว้ได้ — ไม่ติดสตั้น`);
    }
    // สตั้น (สถานะพื้นฐาน patch 2.0.8): ทำอะไรไม่ได้จนจบเทิร์นหรือจนกว่าดีบัฟจะหมดเวลา
    if ((p.statuses.stun || 0) > 0) {
      p.locked = true;
      lastLog.push(`😵 ${p.name} ติดสถานะสตั้น — ขยับไม่ได้ทั้งเทิร์น! (เหลืออีก ${p.statuses.stun} เทิร์น)`);
    }

    // Bard (characters/bard.js): ถูกขัดจังหวะการประพันธ์ (หลับ/สตั้น/ใบ้สกิล ฯลฯ) -> โน้ตทั้งหมดถูกรีเซ็ต
    CHAR_HOOKS.bard.onRoundStartInterruptCheck(engine, p);
  }

  // ---------- เอสคานอร์ (characters/escanor.js): ลุกไหม้ที่ Last Stand แจกตอนต้นเทิร์น ----------
  //  ต้องแปะ "หลัง" ลูปต้นเทิร์นจบทั้งวง เพราะ tickBurn ของแต่ละคนอยู่ในลูปด้านบน — ถ้าแปะในลูป
  //  คนที่ยังวนไม่ถึงจะถูกกินหน่วยที่เพิ่งได้ทิ้งในเทิร์นเดียวกัน (ผลไม่เท่ากันตามลำดับที่นั่ง)
  CHAR_HOOKS.escanor.flushPendingBurn(engine);

  // ---------- คอนเนอร์ RK800 (characters/conner.js): การไล่ล่ายังดำเนินอยู่ -> แช่ผู้เล่นนอกวงใหม่ทุกเทิร์น ----------
  //  ต้องอยู่หลังลูปต้นเทิร์น เพราะในลูปเพิ่งตั้ง p.locked = false และแจกไพ่ใบแรกให้ทุกคนไปแล้ว
  CHAR_HOOKS.conner.onRoundStartAfterLoop(engine);
  // ---------- ยุย (characters/yui.js): girl don't cry — คนแต้มสกิลน้อยสุดในวงได้ +1 ----------
  //  ต้องอยู่หลังลูปต้นเทิร์น ไม่งั้นการเทียบ "ใครแต้มน้อยสุด" จะใช้ค่าคนละเทิร์นกันตามลำดับที่นั่ง
  CHAR_HOOKS.yui.onRoundStartAfterLoop(engine);
  // มุยมิ: ครบแพ้ต่อเนื่อง 3 ครั้งแล้วสุ่มหัวใจนักสู้ที่ต้นเทิร์นถัดไป หลังแจกไพ่ครบทั้งสนาม
  CHAR_HOOKS.muimi.onRoundStartAfterLoop(engine);

  // ความตายที่โรยรา (ชิกิ patch 2.0.8, characters/shiki.js): ทุกเทิร์นที่ท่าไม้ตายยังทำงาน มอบเส้นชีวิต +1 ให้ทุกคนยกเว้นตัวเอง
  CHAR_HOOKS.shiki.onRoundStartWitherTick(engine);

  // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9, characters/riddhe.js): Event เริ่มเกม + สกิลติดตัว 1 ----------
  CHAR_HOOKS.riddhe.onRoundStartAlert(engine);
  CHAR_HOOKS.riddhe.onRoundStartGrudgeTick(engine);

  // ชำระค่าบริการ (เจ้าแห่งเน็ตบ้าน, characters/broadband_man.js)
  CHAR_HOOKS.broadband_man.onRoundStartBillTick(engine);

  // สลับช่วงเวลากลางวัน/กลางคืน (ทุก 3 เทิร์น): โอเบรอนสลับร่างอัตโนมัติ (characters/oberon.js)
  const night = isNightRound(roundNumber);
  CHAR_HOOKS.oberon.onDayNightTransition(engine, night, roundNumber, prevNight);
  if (roundNumber > 1 && night !== prevNight) {
    lastLog.push(night ? "🌙 ราตรีมาเยือน — สุ่มสกิลพื้นฐาน/สกิลรองแพงขึ้น +1 ทุกเทิร์น" : "☀️ ฟ้าสางแล้ว — จบเทิร์นได้แต้มสกิลเพิ่ม +1");
    // เสียงไพเราะที่กึกก้อง (ชเรด เอลัน, characters/shrade_elan.js): เข้ากลางคืนพร้อมท่วงทำนองครบ 5 -> เล่นวีดีโอเปิดตัว
    if (night) CHAR_HOOKS.shrade_elan.onNightStart(engine);
    else if (yuukiBoss()) queueYuukiCutscene(YUUKI_VIDEO.field, "ของจริงมันเริ่มต่อจากนี้", 7, "yuukiField");
  }

  const yuukiUltimateDue = !!yuukiBoss() && yuukiTurns > 0 && yuukiTurns % 5 === 0;
  if (yuukiUltimateDue) queueYuukiCutscene(YUUKI_VIDEO.ultimate, "STAR OF FALL", 7, "yuukiUltimate");
  captureTurnSnapshot(); // จุดย้อนเวลาของเทิร์นนี้ (เอฟเฟกต์ต้นเทิร์นทำงานครบแล้ว ยังไม่มีใครกดอะไร)
  pushSnapshotHistory();  // เก็บใบเดียวกันเข้าประวัติย้อนหลัง 6 เทิร์น (ท่าไม้ตายของชิโดย้อนกลับไปหยิบ)
  gameState = "PLAYING";
  startPhaseTimer(cardPhaseSeconds(), resolveRound);
  if (cutsceneQueue.length) { pausePlayingForCutscene(yuukiUltimateDue ? applyYuukiUltimate : undefined); return; } // วีดีโอทำงานก่อนผล Star of Fall
  broadcastState();
  checkAllLocked();
}

function hit(id) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.locked) return;
  if (centralDeck.length === 0) return; // กองร่วมหมดแล้ว ทุกคนจั่วเพิ่มไม่ได้
  if ((p.statuses.nodraw || 0) > 0) return; // อิ่มทงคัสสึเกิน: เทิร์นนี้จั่วเพิ่มไม่ได้
  if (CHAR_HOOKS.shrade_elan.charging(p)) return; // แด่เพื่อนรักของฉัน: ระหว่างชาร์จจั่วการ์ดเพิ่มไม่ได้
  if ((p.statuses.riddheguard || 0) > 0) return; // ฉันจะไม่ยอมสูญเสียใครไปอีก (ริดดี้): จั่วการ์ดเพิ่มไม่ได้
  if ((p.statuses.phenexTaunt || 0) > 0) return; // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล): ระหว่างล่อเป้าจั่วการ์ดเพิ่มไม่ได้
  if ((p.tepeuPonderTurns || 0) > 0) return; // ครุ่นคิด (เทเปา): จั่วไพ่ไม่ได้ระหว่างนี้ (ยังโจมตีได้ถ้าชนะ)
  if (CHAR_HOOKS.conner.actionBlocked(engine, p)) return; // คอนเนอร์: อยู่นอกวงไล่ล่า -> ถูกแช่ ทำอะไรไม่ได้
  if (scoreOf(p) >= scoreCap(p)) return; // แต้มเต็มเพดาน (เช่น 21 พอดี) = จั่วไม่ได้ รอผู้ใช้ใช้สกิล/เปิดไพ่เอง
  // โชคลาภ (patch 2.2 new): จั่วปุ๊ป ถ้ามีบัฟสะสมอยู่ ใช้ 1 หน่วยทันทีแล้วหน่วยนั้นหายไป
  //  ปรับไพ่ที่จั่วให้แต้มรวมตกอยู่ 19-21 (สุ่มถ่วงน้ำหนัก มีเคสพิเศษถ้าแต้มปัจจุบันเป็น 19/20 อยู่แล้ว)
  //  ถ้าเป้าที่สุ่มได้ไม่มีไพ่ให้จั่วพอดี จะลองเป้าที่เหลือก่อน — ไม่มีไพ่ให้ตรงเป้าไหนเลยจริงๆ ค่อยจั่วแบบสุ่มตามปกติ (แตกได้ตามปกติ)
  let drawn = null;
  if (!overloadForceActive && (p.statuses.fortune || 0) > 0) {
    p.statuses.fortune--;
    p.fortuneIdle = 0;
    if (p.statuses.fortune <= 0) delete p.statuses.fortune;
    const cur = calculateScore(p.cards);
    let picked = null;
    for (const target of fortuneTargetList(cur)) {
      const need = target - cur;
      if (need < 1 || need > 10) continue;
      const c = drawFromCentralDeck((card) => !card.special && card.value === need);
      if (c) { picked = { target, card: c }; break; }
    }
    if (picked) {
      drawn = picked.card;
      p.cards.push(drawn);
      lastLog.push(`🍀 ${p.name} โชคลาภทำงาน — ได้ไพ่ที่ทำให้แต้มรวมเป็น ${picked.target}!`);
    } else {
      drawn = drawCardFor(p);
      if (drawn) p.cards.push(drawn);
      lastLog.push(`🍀 ${p.name} โชคลาภทำงาน แต่ไม่มีไพ่ที่ทำให้ถึงเป้าไหนได้เลย — จั่วแบบสุ่มตามปกติ`);
    }
  } else {
    drawn = drawCardFor(p);
    if (drawn) p.cards.push(drawn);
  }
  if (drawn) {
    onCardDrawn(p, drawn); CHAR_HOOKS.escanor.onCardDraw(engine, p); CHAR_HOOKS.eiji.onCardDraw(engine, p);
  }
  // สภาพชา (ดีบัฟ Universal — Thunder Bullet): กดจั่ว 1 ครั้ง ได้ไพ่ 2 ใบ
  //  ใบที่ 2 จั่วแบบสุ่มปกติเสมอ (โชคลาภช่วยแค่ใบแรก) และไม่เช็คเพดานแต้มซ้ำ — แตกได้ตามสภาพ
  //  ผู้วิงวอน "ลงทัณฑ์" พ่วง "ชา" มาด้วย — เป็นผลพ่วงที่เช็คสด ไม่ใช่สถานะจริง (ล้างไม่ได้ตามสเปค)
  if ((p.statuses.chaa || 0) > 0 || CHAR_HOOKS.the_supplicant.chaaActive(p)) {
    const extra = drawCardFor(p);
    if (extra) {
      p.cards.push(extra);
      onCardDrawn(p, extra);
      lastLog.push(`🌀 ${p.name} อยู่ในสภาพชา — จั่วติดมาอีกใบ (${cardLabel(extra)})`);
    }
  }
  // คอนเนอร์ RK800 (สกิลติดตัว 1 สืบสวน): การจั่วไพ่ทำให้เครียด +1 — นับครั้งเดียวต่อเทิร์นไม่ว่าจะจั่วกี่ใบ
  //  นับเฉพาะตอนได้ไพ่จริง (กองหมดกลางคัน = ไม่นับ)
  if (drawn) CHAR_HOOKS.conner.onCardDraw(engine, p);
  // ยุย (characters/yui.js): my soul your beats — ใครจั่ว คนอื่นในวงจั่วตามด้วย (กันลูปในฮุคเอง)
  if (drawn) CHAR_HOOKS.yui.onCardDraw(engine, p);
  p.busted = bustedOf(p);
  if (p.busted) { voidUltimateOnBust(p); maybeMoonBurst(p); CHAR_HOOKS.mageslayer.onBustOrLoseRoll(engine, p); }
  // ไพ่แตก: ไม่ล็อกอัตโนมัติ — ยังกดสกิล/ใช้ไอเทมได้ต่อไป จนกว่าจะกดเปิดไพ่เอง หรือทุกคนเปิดไพ่ครบ
  broadcastState();
  checkAllLocked();
}
function lock(id) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.locked) return;
  applyLockColorTriggers(p);
  p.locked = true;
  broadcastState();
  checkAllLocked();
}
// นานายะ ชิกิ: เปิด/ปิด Mystic eye of death perception (characters/nanaya.js)
function nanayaToggleEye(id) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.locked) return;
  if (p.characterId !== "nanaya") return;
  if (!CHAR_HOOKS.nanaya.toggleEye(engine, p)) return;
  io.emit("skillFlash", {
    name: `Mystic eye of death perception — ${p.nanayaEyeOn ? "เปิดใช้งาน" : "ปิดใช้งาน"}`,
    img: "/characters/nanaya/nanaya.png", by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96",
  });
  broadcastState();
}
// เอจิ สกิลติดตัว 3 (characters/eiji.js): ปุ่ม กลโกง Ordinal Scale — สละแต้มสกิล 1 แลกอัตราหลบ +10%
//  ไม่นับเป็นการใช้สกิลของเทิร์น จึงกดพร้อมสกิลอื่นได้ และกดซ้ำได้จนครบ 5 ครั้งต่อเทิร์น
function eijiOrdinalScale(id) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.locked) return;
  if (p.characterId !== "eiji") return;
  if (moonCellActive()) return; // MOON*CELL: สกิลทุกอย่างของทุกคนใช้ไม่ได้
  if (!CHAR_HOOKS.eiji.pressOrdinal(engine, p)) return;
  io.emit("skillFlash", {
    name: `กลโกง Ordinal Scale — เร่งความเร็ว ${CHAR_HOOKS.eiji.ordinalStacks(p)}/${CHAR_HOOKS.eiji.ORDINAL_MAX} (หลบหลีก ${CHAR_HOOKS.eiji.dodgeChance(p)}%)`,
    img: CHAR_HOOKS.eiji.IMG.passive3,
    by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96",
  });
  broadcastState();
}
function useSkill(id, tier, targets, item) {
  const p = players[id];
  if (!effectSourceId && p) return withEffectSource(p, () => useSkill(id, tier, targets, item));
  if (!p || !p.alive) return;
  if (gameState !== "PLAYING") return;
  if (!["basic", "secondary", "ultimate"].includes(tier)) return;
  // ผู้วิงวอน (patch 3.4): คนที่ติด "ลูกแกะน้อยรู้แจ้ง" เล็งผู้วิงวอนด้วยสกิลไม่ได้เลย
  //  กันที่ปากทางจุดเดียว จึงครอบคลุมทุกท่าของทุกตัวละครที่ส่ง targets มา โดยไม่ต้องแก้ prepareXTarget ทีละตัว
  if (Array.isArray(targets) && targets.some((tid) => CHAR_HOOKS.the_supplicant.targetBlocked(p, players[tid]))) return;
  // คู่แฝดฮิซากาว่า — สกิลพื้นฐาน 1 (สลับตัว/ชุบแฝด) คือ "ทางหนี" ประจำตัว: อะไรก็ตามที่ทำให้กดสกิลไม่ได้
  //  (สตั้น, หลับไหล, หอกลองกินัส, MOON*CELL ฯลฯ) จะไม่มีผลกับช่องนี้ช่องเดียว เพื่อให้ยังหนีไปคุมแฝดอีกคนได้เสมอ
  //  — แต่ยังต้องอยู่ในเฟสจั่วการ์ด และยังจำกัดสลับ 1 ครั้ง/เทิร์นตามเดิม (hisakawaSwitchedRound)
  const isHisakawaEscape = p.characterId === "hisakawa_sister" && tier === "basic";
  if (p.locked && !isHisakawaEscape) return;
  // MOON*CELL (คิชินามิ ฮาคุโนะ): สกิลทั้งหมดของทุกคนใช้ไม่ได้เลย (รวมของฮาคุโนะเจ้าของท่าเองด้วย — เหลือแค่สกิลติดตัว)
  if (moonCellActive() && !isHisakawaEscape) return;
  if (CHAR_HOOKS.conner.skillBlocked(engine, p)) return; // คอนเนอร์: ระหว่างการไล่ล่า ทุกคนกดสกิลไม่ได้ (รวมคอนเนอร์กับเป้าหมาย)
  if (CHAR_HOOKS.shrade_elan.charging(p)) return; // แด่เพื่อนรักของฉัน: ระหว่างชาร์จใช้สกิลอื่นไม่ได้
  if ((p.statuses.riddheguard || 0) > 0) return; // ฉันจะไม่ยอมสูญเสียใครไปอีก (ริดดี้): ระหว่างทำงานกดสกิลไม่ได้
  if ((p.statuses.phenexTaunt || 0) > 0) return; // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล): ระหว่างล่อเป้ากดสกิลไม่ได้เลย
  if (tier === "ultimate" && (p.statuses.phenexBanUlt || 0) > 0) return; // อย่าอยู่เลย แกน่ะ! (ริต้า เบอร์นัล): ถูกแบนท่าไม้ตายชั่วคราว
  // ---------- Bard : คีตกวี — เติมโน้ตประพันธ์เพลง (ช่องที่ 3 ไม่ใช่สกิล กดใช้ไม่ได้) ----------
  if (p.characterId === "bard") {
    if (tier === "ultimate") return; // ช่องประพันธ์เพลง — ไม่ใช่ปุ่มสกิล
    if ((p.statuses.noskill || 0) > 0) return;
    if (p.bardPending) return; // ต้องเลือกเป้าหมายบทเพลงที่ค้างอยู่ก่อน
    // จำกัด 2 โน้ตต่อเทิร์น (patch 2.0.5) — ระหว่างมิติมายาบรรเลง (โลหิต/วิญญาณ) ไม่ติดลิมิต 2
    //  แต่กดสกิลได้สูงสุด 6 ครั้งต่อเทิร์น (patch 2.0.8)
    const dimOn = (p.statuses.soulDim || 0) > 0 || (p.statuses.bloodDim || 0) > 0;
    if ((p.bardNotesUsed || 0) >= (dimOn ? BARD_DIM_NOTES_PER_TURN : BARD_NOTES_PER_TURN)) return;
    // กระแสเวท / ภาระเวท (patch 2.0.8) มีผลกับค่าโน้ตด้วย
    const noteCost = Math.min(SKILL_COST_MAX, Math.max(0, BARD_NOTE_COST - statusAmtOf(p, "spellflow")) + Math.min(SPELLBURDEN_MAX, statusAmtOf(p, "spellburden")));
    const noteBless = noteCost > 0 && (p.statuses.freecast || 0) > 0; // การ์ดราชินี: ใช้สกิลไม่เสียแต้ม 1 ครั้ง
    if (!noteBless && p.skillPoints < noteCost) return;
    const lucky = Math.random() < BARD_NOTE_FREE_CHANCE; // 15% ไม่เสียพลังงาน (พรสวรรค์)
    let free = lucky || noteCost === 0;
    if (!free) {
      if (noteBless) {
        p.statuses.freecast--;
        if (p.statuses.freecast <= 0) delete p.statuses.freecast;
        lastLog.push(`👸 ${p.name} การ์ดราชินี — เติมโน้ตนี้โดยไม่เสียพลังงาน`);
        free = true;
      } else {
        p.skillPoints -= noteCost;
      }
    }
    p.bardNotesUsed = (p.bardNotesUsed || 0) + 1;
    const note = tier === "basic" ? "R" : "J";
    p.bardNotes = p.bardNotes || [];
    p.bardNotes.push(note);
    io.emit("bardSfx", { kind: "note", idx: p.bardNotes.length }); // เสียงเติมโน๊ตตามช่องที่ 1-3
    io.emit("skillFlash", {
      name: `${note === "R" ? "Crimson ❤️" : "Jade 💚"} — โน้ตช่องที่ ${p.bardNotes.length}/3${dimOn ? " (มิติมายาบรรเลง)" : ""}${free ? " (พรสวรรค์ ไม่เสียพลังงาน)" : ""}`,
      img: note === "R" ? BARD_CRIMSON_IMG : BARD_JADE_IMG,
      by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96",
    });
    lastLog.push(`🎼 ${p.name} เติมโน้ต${note === "R" ? "ทำนองแห่งโลหิต ❤️" : "ทำนองแห่งวิญญาณ 💚"} (ช่องที่ ${p.bardNotes.length}/3)${free ? " — ไม่เสียพลังงาน" : ""}`);
    if (p.bardNotes.length >= 3) bardCompose(p, true);
    // คอนเนอร์ RK800 (สกิลติดตัว 1 สืบสวน): การเติมโน้ตคือ "การกดสกิล" ของคีตกวี (มีแค่พื้นฐาน/รอง)
    //  จึงนับความเครียด +1 ต่อครั้งเหมือนตัวละครอื่น — ช่องนี้ return ก่อนถึงจุดนับหลักของ useSkill()
    CHAR_HOOKS.conner.onSkillUsed(engine, p);
    // วีดีโอสวนกลับที่ค้างคิว (Wonder of U ซาโตรุ — บทเพลงเล็งใส่ซาโตรุ) เล่นทันทีช่วงจั่วการ์ด
    if (gameState === "PLAYING" && cutsceneQueue.length) pausePlayingForCutscene();
    broadcastState();
    checkAllLocked();
    return;
  }
  const ch = CHAR_BY_ID[p.characterId];
  let skill = ch && ch[tier];
  // ชเรด เอลัน: หลังรวมร่าง — สกิลพื้นฐานเปลี่ยนเป็นเวอร์ชันสปาด้า (4 แต้ม ฟื้นเลือดอย่างเดียว)
  //  และปุ่มท่าไม้ตายถูกแทนที่ด้วย แด่เพื่อนรักของฉัน
  if (ch && ch.id === "shrade_elan") {
    if (tier === "basic" && p.shradeForm) skill = ch.basic2;
    if (tier === "secondary" && p.shradeForm) skill = ch.secondary2;
    if (tier === "ultimate") skill = p.shradeForm ? ch.ultimate2 : ch.ultimate;
  }
  // เรียวกิ ชิกิ: ท่าไม้ตายตามที่เลือกไว้ตอนเลือกตัวละคร (ฉันมองเห็นมันแล้ว / ความตายที่โรยรา)
  if (ch && ch.id === "shiki" && tier === "ultimate") {
    skill = (p.shikiUlt === "wither") ? ch.ultimate2 : ch.ultimate;
  }
  // ริดดี้ มาร์เซนาส (patch 2.0.9): ระหว่างเป็นพันธมิตรกับบานาจ — ท่าไม้ตายเปลี่ยนเป็นท่า 2
  if (ch && ch.id === "riddhe" && tier === "ultimate") {
    skill = riddheAllied(p) ? ch.ultimate2 : ch.ultimate;
  }
  // บานาจ ลิงก์ (patch 2.1.2): ระหว่างร่าง NewType Paradise — สกิลรอง 1 เปลี่ยนเป็น Beam Magnum เสมอ
  //  ท่าไม้ตายเปลี่ยนเป็นแสงที่ไม่อยู่เพียงลำพัง เฉพาะตอนมีริดดี้เป็นพันธมิตรอยู่ด้วย
  if (ch && ch.id === "banagher") {
    const banagherTransformed = (p.statuses.paradise || 0) > 0;
    if (tier === "secondary") skill = banagherTransformed ? ch.secondary2 : ch.secondary;
    if (tier === "ultimate") skill = (banagherTransformed && riddheAllied(p)) ? ch.ultimate2 : ch.ultimate;
  }
  // ริต้า เบอร์นัล (patch 2.1.6): ระหว่างฝืนใช้งาน NTD-Sytem (ชั่วคราวหรือถาวรหลังสกิลติดตัว 1) — สกิลรองเปลี่ยนเป็นสกิลรอง 2
  //  หลังเกิดใหม่ (สกิลติดตัว 1 ทำงานแล้ว) — ท่าไม้ตายเปลี่ยนเป็นท่าไม้ตาย 2 ถาวร
  if (ch && ch.id === "phenex") {
    const ntdOn = (p.statuses.phenexNtd || 0) > 0 || p.phenexNtdPermanent;
    if (tier === "secondary") skill = ntdOn ? ch.secondary2 : ch.secondary;
    if (tier === "ultimate") skill = p.phenexReborn ? ch.ultimate2 : ch.ultimate;
  }
  // คิชินามิ ฮาคุโนะ (patch 2.2.1): สกิลรองสลับตามเพศ — ชาย = ข้าขอบัญชา (ผกผัน) / หญิง = ข้าขอบัญชา (ไร้ทางเยียวยา)
  if (ch && ch.id === "hakuno" && tier === "secondary") {
    skill = p.hakunoGender === "female" ? ch.secondary2 : ch.secondary;
  }
  // ไรโด ฮิคารุ (patch 2.1.3): ระหว่างร่าง Ginga หรือ Ginga Strium — สกิลพื้นฐานเปลี่ยนเป็น UPG! (basic2)
  //  ระหว่างร่าง Ginga Strium (ท่าไม้ตาย) — สกิลรองเปลี่ยนเป็นลำแสงสโตเรียม (secondary2)
  if (ch && ch.id === "hikaru") {
    if (tier === "basic") skill = ((p.statuses.ginga || 0) > 0 || (p.statuses.gingastrium || 0) > 0) ? ch.basic2 : ch.basic;
    if (tier === "secondary") skill = (p.statuses.gingastrium || 0) > 0 ? ch.secondary2 : ch.secondary;
  }
  // โอกูริ แคป (Rework): ยุคทองครบ 3 + Stamina ชาร์จ 75 ขึ้นไป = ท่าไม้ตายกลายเป็น Ashen Trail: Cinderella Gray
  if (ch && ch.id === "oguri") {
    if (tier === "ultimate") skill = oguriAshenReady(p) ? ch.ultimate2 : ch.ultimate;
  }
  if (ch && ch.id === "escanor") {
    skill = CHAR_HOOKS.escanor.prepareSkill(engine, p, tier, targets);
    if (!skill) return;
  }
  if (ch && ch.id === "hisakawa_sister") {
    skill = CHAR_HOOKS.hisakawa_sister.dynamicSkillFor(p, ch, tier);
  }
  if (ch && ch.id === "ignis") {
    skill = CHAR_HOOKS.ignis.dynamicSkillFor(p, ch, tier);
  }
  // สึงาชิ ทาคุโตะ (patch 2.2 new): Apprivoise! ทำงานแล้ว — สกิลพื้นฐานเปลี่ยนเป็น Star Sword Emeraude ถาวร
  if (ch && ch.id === "takuto" && tier === "basic" && (p.statuses.apprivoise || 0) > 0) skill = ch.basic2;
  // patch 2.2.5: กันตาย (สกิลติดตัว 1) เคยทำงานไปแล้ว — ท่าไม้ตายเปลี่ยนเป็นร่วมเดินทางไปกับฉันเถอะถาวร (แทนพิชิตแสงดาว)
  if (ch && ch.id === "takuto" && tier === "ultimate" && p.beatSaved) skill = ch.ultimate2;
  // โมโรโบชิ ดัน (patch 2.8 new): สกิลติดตัว "ครูฝึกสุดเหี้ยม" — เป้าหมาย "จงหลบแต่อย่าหนี" แพ้แต้มติดกัน 2 ครั้ง
  //  (ไม่นับไพ่แตก) -> ช่องท่าไม้ตายกลายเป็น "อย่าให้ฉันต้องเฆี่ยนตี" สำหรับเทิร์นนั้น (publicState คิดสูตรเดียวกัน)
  if (ch && ch.id === "dan") skill = CHAR_HOOKS.dan.dynamicSkillFor(engine, p, ch, tier);
  // แบทแมน (patch 3.1): ขึ้นรถแบทโมบิลแล้ว — ทั้งสามช่องเปลี่ยนเป็นเวอร์ชันรถ
  if (ch && ch.id === "bat_ben") skill = CHAR_HOOKS.bat_ben.dynamicSkillFor(p, ch, tier);
  if (!skill) return;
  const isEscanorSkill = p.characterId === "escanor";
  const isHisakawaSkill = p.characterId === "hisakawa_sister";
  const isIgnisSkill = p.characterId === "ignis";
  const isTriggerSkill = p.characterId === "ultraman_trigger";
  // โอเบรอน/โคโตเนะ: สกิลสลับตามช่วงเวลา — กลางคืนใช้เวอร์ชันกลางคืนแทน
  if (tier === "ultimate" && ch.ultimateNight && isNightRound(roundNumber)) skill = ch.ultimateNight;
  if (tier === "secondary" && ch.secondaryNight && isNightRound(roundNumber)) skill = ch.secondaryNight;
  if (tier === "basic" && ch.basicNight && isNightRound(roundNumber)) skill = ch.basicNight;
  // ฟุจิตะ โคโตเนะ (rework 2.3): ร่าง [พร้อมลุย] ทับปุ่มทั้ง 3 ช่อง — ต้องอยู่ "หลัง" การสลับกลางคืนด้านบน
  if (ch.id === "kotone") skill = CHAR_HOOKS.kotone.dynamicSkillFor(p, ch, tier, isNightRound(roundNumber));
  if (!skill) return;
  if ((p.statuses.noskill || 0) > 0 && !isHisakawaEscape) return; // โดนหอกลองกินัสปัก: เทิร์นนี้ใช้สกิลไม่ได้ (ยกเว้นทางหนีของฮิซากาว่า)
  if (isTriggerSkill && tier === "secondary" && (!(p.statuses.triggerCircle > 0) || p.statuses.triggerMulti > 0 || p.statuses.triggerZeperion > 0)) return;
  if (isTriggerSkill && tier === "ultimate" && (!(p.statuses.triggerCircle > 0) || p.statuses.triggerMulti > 0 || p.statuses.triggerZeperion > 0)) return;
  if (isHisakawaSkill && !CHAR_HOOKS.hisakawa_sister.canUseSkill(engine, p, tier, skill)) return;
  if (isIgnisSkill && !CHAR_HOOKS.ignis.canUseSkill(engine, p, tier, skill)) return;

  // เวลาทอง (แกมเบลอร์): แต้มที่ใช้ของสกิลพื้นฐาน/สกิลรองลดครึ่งหนึ่ง
  const isGambler = p.characterId === "gambler";
  const goldenOn = (p.statuses.golden || 0) > 0;
  let cost = skill.cost;
  if (isGambler && goldenOn && (tier === "basic" || tier === "secondary")) cost = Math.ceil(cost / 2);
  // กลางคืน (patch 2.1.7): สกิลที่สุ่มโดนคืนนี้ (พื้นฐาน/รอง อย่างใดอย่างหนึ่ง) ใช้แต้มมากขึ้น +1 — ไม่มีผลกับท่าไม้ตาย
  //  (เพดาน SKILL_COST_MAX คิดรวมทีเดียวกับภาระเวทด้านล่าง)
  const nightTax = p.nightTaxTier === tier ? 1 : 0;
  // ---------- โอกูริ แคป (Rework): เงื่อนไข Energy / Stamina ชาร์จ ----------
  const isOguri = p.characterId === "oguri";
  const isBreakfast = isOguri && tier === "basic";
  const isOguriTrain = isOguri && tier === "secondary";
  const isAshenTrail = isOguri && tier === "ultimate" && oguriAshenReady(p);
  const isVictoryBeat = isOguri && tier === "ultimate" && !isAshenTrail;
  if (isOguriTrain && (p.oguriEnergy || 0) < OGURI_TRAIN_ENERGY_COST) return; // Energy ไม่พอ
  if (isVictoryBeat && (p.stamina || 0) < OGURI_ULT_CHARGE_COST) return;  // Stamina ชาร์จไม่พอ
  // ยุคทองครบ 3 แต้ม: Training ใช้แต้มสกิลลดลง -1 (ใช้งานได้บ่อยขึ้น)
  if (isOguriTrain && oguriGoldStacks(p) >= OGURI_GOLD_MAX) cost = Math.max(0, cost - 1);
  // ---------- ซาโตรุ อาเคฟุ (characters/satoru.js) ----------
  const isSatoru = p.characterId === "satoru";
  if (isSatoru && tier === "ultimate") return; // Wonder of U ทำงานอัตโนมัติ — กดเองไม่ได้
  const isOblada = isSatoru && tier === "basic";     // Obla Di, Obla Da: เลือกเป้าหมาย 1 คน (คนอื่นเท่านั้น)
  let obladaTarget = null;
  if (isOblada) {
    obladaTarget = CHAR_HOOKS.satoru.prepareObladaTarget(engine, p, targets);
    if (!obladaTarget) return;
  }
  const isLoca = isSatoru && tier === "secondary";   // Locacaca fruit: เลือกตัวเอง หรือยื่นให้คนอื่น
  let locaTarget = null;
  if (isLoca) {
    locaTarget = CHAR_HOOKS.satoru.prepareLocaTarget(engine, p, targets);
    if (!locaTarget) return;
  }
  const isIgnisSteal = isIgnisSkill && tier === "basic";
  let ignisStealTarget = null;
  if (isIgnisSteal) {
    ignisStealTarget = CHAR_HOOKS.ignis.prepareStealTarget(engine, p, targets);
    if (!ignisStealTarget) return;
  }
  const isIgnisImpact = isIgnisSkill && tier === "ultimate";
  let ignisImpactTarget = null;
  if (isIgnisImpact) {
    ignisImpactTarget = CHAR_HOOKS.ignis.prepareImpactTarget(engine, p, targets);
    if (!ignisImpactTarget) return;
  }
  // อาจารย์ ไบเลธ หลักสูตร "จบการศึกษา": สกิลรอง/ท่าไม้ตายของทุกคนใช้แต้มสกิลลดลง 1 (สูตรเดียวกับที่ publicState โชว์บนปุ่ม)
  cost = Math.max(0, cost - CHAR_HOOKS.byleth.costDiscount(engine, tier));
  // กระแสเวท / ภาระเวท (สถานะพื้นฐาน patch 2.0.8): ใช้พลังงานลดลง/เพิ่มขึ้นตามจำนวนที่ระบุ
  cost = Math.max(0, cost - statusAmtOf(p, "spellflow"));
  //  ตัวปรับราคาขาขึ้นทั้งหมด (กลางคืน + ภาระเวท) รวมกันแล้วดันราคาได้ไม่เกิน SKILL_COST_MAX
  //  → สกิลที่ค่าใช้พลังงานถึงเพดานอยู่แล้ว (เช่นท่าไม้ตาย 8) จะไม่แพงขึ้นไปอีก
  cost = Math.min(SKILL_COST_MAX, cost + nightTax + Math.min(SPELLBURDEN_MAX, statusAmtOf(p, "spellburden")));
  // การ์ดราชินี: ใช้สกิลไม่เสียแต้ม 1 ครั้ง — ใช้กับสกิลที่มีค่าใช้จ่ายเท่านั้น
  const blessFree = cost > 0 && (p.statuses.freecast || 0) > 0;
  if (blessFree) cost = 0;
  if (p.skillPoints < cost) return;

  const st = skill.effect && !Array.isArray(skill.effect) && skill.effect.type === "status" ? skill.effect.status : null;
  const isHisakawaFreeAction = isHisakawaSkill && (st === "hisakawaSwitch" || st === "hisakawaRevive");

  // เวลาทอง (แกมเบลอร์): กดสกิลพื้นฐานซ้ำในเทิร์นเดียวได้ จนกว่าจำนวนใช้/แต้มจะหมด
  const isGamble = isGambler && tier === "basic";
  const gambleRepeat = isGamble && goldenOn;
  // เอาแบบนี้ได้ไหม (Apple guy สกิลพื้นฐาน): เลือกของส่งมอบ — ไม่นับเป็นการใช้สกิลของเทิร์น
  //  (ใช้แล้วยังเลือกใช้สกิลอื่นได้อีก 1 ครั้ง)
  const isApplePick = p.characterId === "appleguy" && tier === "basic";
  if (isApplePick && !CHAR_HOOKS.appleguy.validateBasicItem(item)) return; // ต้องเลือกของที่มีจริงเท่านั้น (characters/appleguy.js)
  // มุยมิ: เสบียงฉุกเฉินไม่นับโควตาสกิลหลัก แต่มีโควตา 1 ครั้ง/เทิร์น และ 2 ครั้ง/เกมของตัวเอง
  const isMuimi = p.characterId === "muimi";
  const isMuimiBasic = isMuimi && tier === "basic";
  if (isMuimi && !CHAR_HOOKS.muimi.canUseSkill(engine, p, tier)) return;
  // มีดพับประจำตระกูล (โทโนะ ชิกิ สกิลพื้นฐาน): เลือกระดับ 1-5 — ไม่นับเป็นการใช้สกิลของเทิร์น (กดเปลี่ยนกี่ครั้งก็ได้)
  const isTohnoPick = p.characterId === "tohno" && tier === "basic";
  if (isTohnoPick && !CHAR_HOOKS.tohno.validateBasicItem(item)) return; // ต้องเลือกระดับ 1-5 เท่านั้น (characters/tohno.js)
  // เธอ/นาย คือฉันหรอ? (คิชินามิ ฮาคุโนะ สกิลพื้นฐาน): สลับเพศ — ไม่นับเป็นการใช้สกิลของเทิร์น แต่กดสลับได้แค่ 1 ครั้งต่อเทิร์น
  const isHakunoGender = p.characterId === "hakuno" && tier === "basic";
  if (isHakunoGender && p.hakunoGenderSwitched) return;
  // DoomGuy (patch 2.2 full): สกิลติดตัว "ไม่ติดคูลดาวน์การใช้สกิล" — Quick Swap (พื้นฐาน) และ Weapon (รอง)
  //  ไม่นับเป็นการใช้สกิลของเทิร์น กดได้ทั้งคู่ในเทิร์นเดียวกัน (Quick Swap เองยังจำกัด 1 ครั้ง/เทิร์นแยกต่างหาก)
  const isDoomguyPick = p.characterId === "doomguy" && (tier === "basic" || tier === "secondary");
  // ไค ชิซากิ: มือซ้ายแห่งการรังสรรค์ (พื้นฐาน) + มือขวาแห่งการลงทัณฑ์ (รอง) ไม่นับเป็นการใช้สกิลของเทิร์นร่วมกัน
  //  งบรวม 2 ครั้งต่อเทิร์น ผสมกันได้อิสระ (เช่น รังสรรค์ 2 ครั้งใส่คนละเป้า, หรือ 1 รังสรรค์ + 1 ลงทัณฑ์)
  const isKaiPick = p.characterId === "kai" && (tier === "basic" || tier === "secondary");
  if (isKaiPick && (p.kaiSkillUsesRound || 0) >= 2) return;
  // ผู้วิงวอน (patch 3.4): กดสกิลได้ 2 ครั้งต่อเทิร์น ผสมช่องไหนก็ได้ (แพทเทิร์นเดียวกับไค)
  //  ประกาศไว้ตรงนี้เพราะด่านโควตาสกิลของเทิร์นด้านล่างต้องอ่านค่านี้ ส่วนเงื่อนไขเฉพาะท่าอยู่ที่ CHAR_HOOKS.the_supplicant.canUseSkill
  const isSupPick = p.characterId === "the_supplicant";
  // ทาคุมิ ฟุจิวาระ: ขึ้นเกียร์ (พื้นฐาน) / ลงเกียร์ (รอง) / ถึงจะมองไม่เห็น แต่ฉันยังอยู่ (ท่าไม้ตาย) ไม่นับเป็นการใช้สกิลของเทิร์นร่วมกัน
  //  งบรวม 5 ครั้งต่อเทิร์น ผสมกันได้อิสระ (แพทเทิร์นเดียวกับไค กว้างขึ้นครอบคลุมท่าไม้ตายด้วย) — ท่าไม้ตายกดซ้ำไม่ได้ผ่านเช็คทั่วไปด้านล่าง (takumiBlackout บล็อกเอง)
  const isTakumiPick = p.characterId === "takumi" && (tier === "basic" || tier === "secondary" || tier === "ultimate");
  if (isTakumiPick && (p.takumiSkillUsesRound || 0) >= 5) return;
  const isTakumiGearUp = p.characterId === "takumi" && tier === "basic";
  const isTakumiGearDown = p.characterId === "takumi" && tier === "secondary";
  const isTakumiBlackout = p.characterId === "takumi" && tier === "ultimate";
  // มิซึซาว่า ฮารุกะ: ไข่ต้ม และอาหารเสริม — ไม่นับเป็นการใช้สกิลของเทิร์น (แพทเทิร์นเดียวกับไค/ดูมกาย)
  //  กดได้ 2 ครั้งต่อเทิร์นตามโควตา harukaBasicUses แล้วยังเหลือสิทธิ์ใช้สกิลอื่นอีก 1 ครั้งตามปกติ
  const isHarukaBasic = p.characterId === "haruka" && tier === "basic";
  if (isHarukaBasic && (p.harukaBasicUses || 0) >= CHAR_HOOKS.haruka.BASIC_USES_PER_TURN) return;
  // อาจารย์ ไบเลธ: สกิลติดตัว "ภูมิปัญญา" — ทุกช่องไม่นับเป็นการใช้สกิลของเทิร์น แต่รวมกันได้ 5 ครั้งต่อเทิร์น
  //  (แพทเทิร์นเดียวกับทาคุมิ กว้างขึ้นครอบคลุมทั้ง 3 ช่อง — เงื่อนไขเฉพาะท่าอยู่ที่ CHAR_HOOKS.byleth.canUseSkill)
  const isBylethPick = p.characterId === "byleth";
  if (isBylethPick && (p.bylethSkillUsesRound || 0) >= CHAR_HOOKS.byleth.SKILL_USES_PER_TURN) return;
  if (isSupPick && (p.supSkillUsesRound || 0) >= CHAR_HOOKS.the_supplicant.SKILL_USES_PER_TURN) return;
  if (p.skillUsedRound && !gambleRepeat && !isSupPick && !isBylethPick && !isHarukaBasic && !isApplePick && !isMuimiBasic && !isTohnoPick && !isHakunoGender && !isDoomguyPick && !isKaiPick && !isTakumiPick && !isHisakawaFreeAction) return; // ใช้สกิลได้เพียง 1 อันต่อเทิร์น (ซ้ำ/ซ้อนไม่ได้)
  // MOON*CELL (คิชินามิ ฮาคุโนะ): ต้องมีแต้มคำสาปแห่งดวงจันทร์ครบ 3 เท่านั้น
  if (st === "moonCell" && (p.hakunoMoonPoints || 0) < HAKUNO_MOONCELL_NEED) return;
  // ข้าขอบัญชา (ชาย/หญิง คิชินามิ ฮาคุโนะ): กดซ้ำไม่ได้จนกว่าผลเดิมจะหมด
  if (st === "hakunoInvertReady" && (p.statuses.hakunoInvertReady || 0) > 0) return;
  if (st === "hakunoNoRegenReady" && (p.statuses.hakunoNoRegenReady || 0) > 0) return;
  // Beat Mode (ประกายเขี้ยว): ท่าไม้ตายใช้ไม่ได้เสมอ / สกิลพื้นฐานใช้ไม่ได้เฉพาะหลังกันตายทำงานแล้ว (patch 2.2 alpha)
  if (tier === "ultimate" && beatActive(p)) return;
  if (tier === "basic" && p.characterId === "kuwagata" && beatActive(p) && p.beatSaved) return;
  // ท่าไม้ตาย: กดซ้ำไม่ได้จนกว่าผลจะหมดเวลา (สวมเกราะราชันคงอยู่ถาวร = กดซ้ำไม่ได้อีกเลยตลอดเกม)
  if (tier === "ultimate" && st && (p.statuses[st] || 0) > 0) return;
  // เวลาทอง (แกมเบลอร์): ระหว่างบัฟยังอยู่ กดท่าไม้ตายซ้ำไม่ได้
  if (tier === "ultimate" && isGambler && goldenOn) return;
  // ---------- ไรโด ฮิคารุ / อุลตร้าแมนกิงกะ (rework patch 2.1.3) ----------
  // Ultlive Ultraman Ginga (สกิลรอง 1): ใช้ไม่ได้ระหว่างติด MonsterLive และกดซ้ำไม่ได้จนกว่าผลจะหมด
  const isHikaruGinga = p.characterId === "hikaru" && skill === ch.secondary;
  if (isHikaruGinga && (p.statuses.monster || 0) > 0) return;
  if (isHikaruGinga && (p.statuses.ginga || 0) > 0) return;
  // Ginga Strium (ท่าไม้ตาย): ต้องอยู่ในร่าง Ginga (สกิลรอง 1 ยังไม่หมดเวลา) และต้องเป็นตอนกลางวันเท่านั้นถึงใช้ได้
  if (tier === "ultimate" && p.characterId === "hikaru" && (!((p.statuses.ginga || 0) > 0) || isNightRound(roundNumber))) return;
  // Rainbow Pudding (คุวากาตะ): ไม่จำกัดจำนวนครั้งต่อเกม (patch 2.2 alpha)
  const isPudding = p.characterId === "kuwagata" && tier === "basic";
  // วอสก้าหน่อยน้อง (แกมเบลอร์): ใช้ได้ 3 ครั้งต่อเกม (เวลาทองรีเซ็ตให้เต็ม)
  if (isGamble && (p.gamblerUses || 0) <= 0) return;
  // หอกแห่งแคสเซียส (เอวา 13 patch 2.2 alpha): กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  const isCassius = p.characterId === "eva13" && tier === "basic";
  if (isCassius && (p.statuses.cassius || 0) > 0) return;
  // หอกลองกินัส (เอวา 13 patch 2.2 alpha): กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  if (p.characterId === "eva13" && tier === "secondary" && (p.statuses.spear || 0) > 0) return;
  // Fourth Impact (เอวา 13): ใช้ได้เมื่อสกิลติดตัว 3 (เลือด <= 4) ทำงานอยู่เท่านั้น
  if (st === "fourth" && !CHAR_HOOKS.eva13.isEva3Active(engine, p)) return;
  // Crucible (DoomGuy patch 2.2 full): ใช้ได้เมื่อชาร์จครบ 5 เท่านั้น
  if (st === "doomCrucible" && (p.doomCharge || 0) < DOOM_CRUCIBLE_CHARGE_NEED) return;
  // ม่านแห่งราตรี (โอเบรอน): กดซ้ำไม่ได้จนกว่าผลเพิ่มพลังโจมตีจะหมด
  const isVeil = p.characterId === "oberon" && tier === "basic";
  if (isVeil && (p.statuses.veil || 0) > 0) return;
  // พี่จ๋าอยู่ไหน (อาริมะ มิยาโกะ): กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  if (p.characterId === "miyako" && tier === "basic" && (p.statuses.miyakoHeal || 0) > 0) return;
  // เพลงหมัด อาริมะ (อาริมะ มิยาโกะ): กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  if (p.characterId === "miyako" && tier === "secondary" && (p.statuses.miyakoCombo || 0) > 0) return;
  // รุ่งอรุณแห่งวันใหม่ (โอเบรอน สกิลรองกลางวัน, characters/oberon.js)
  const isSunrise = p.characterId === "oberon" && tier === "secondary" && !isNightRound(roundNumber);
  let sunriseTarget = null;
  if (isSunrise) {
    sunriseTarget = CHAR_HOOKS.oberon.prepareSunriseTarget(engine, targets);
    if (!sunriseTarget) return;
  }
  // ฝันร้ายยามค่ำคืน (โอเบรอน สกิลรองกลางคืน, characters/oberon.js): self-buff ไม่มีเป้าหมาย — กดซ้ำไม่ได้ระหว่างมีผล
  const isNightmare = p.characterId === "oberon" && tier === "secondary" && isNightRound(roundNumber);
  if (isNightmare && (p.statuses.oberonSickle || 0) > 0) return;
  // เอาไปสิ (Apple guy สกิลรอง, characters/appleguy.js): เลือกผู้เล่น 1 คน (คนอื่นเท่านั้น) มอบของที่เลือกไว้ทันทีก่อนเปิดการ์ด
  const isAppleGive = p.characterId === "appleguy" && tier === "secondary";
  let appleTarget = null;
  if (isAppleGive) {
    appleTarget = CHAR_HOOKS.appleguy.prepareGiveTarget(engine, p, targets);
    if (!appleTarget) return;
  }
  // ---------- ฟุจิตะ โคโตเนะ (rework 2.3, characters/kotone.js) ----------
  //  ทุกท่าไม่ต้องเลือกเป้าหมาย (ตีหมู่/ใส่ตัวเอง) — เงื่อนไขการกดทั้งหมดอยู่ที่ canUseSkill()
  const isKotone = p.characterId === "kotone";
  const kotoneNight = isNightRound(roundNumber);
  const kotoneWasForm = isKotone && CHAR_HOOKS.kotone.formActive(p); // อยู่ร่าง [พร้อมลุย] ตอนกด (ท่าจะถอดร่างทีหลัง)
  if (isKotone && !CHAR_HOOKS.kotone.canUseSkill(engine, p, tier, skill, kotoneNight)) return;
  // ---------- เอจิ (characters/eiji.js) ----------
  const isEiji = p.characterId === "eiji";
  if (isEiji && !CHAR_HOOKS.eiji.canUseSkill(engine, p, tier)) return;
  // ---------- มิซึซาว่า ฮารุกะ (characters/haruka.js) ----------
  //  พื้นฐาน: โควตา 2 ครั้ง/เทิร์น · รอง: ต้องมี "โอเมก้า" และ "จงไปสู่สุขติ" ต้องไม่ค้างอยู่ · ท่าไม้ตาย: กดซ้ำไม่ได้ระหว่างโอเมก้า
  const isHaruka = p.characterId === "haruka";
  if (isHaruka && !CHAR_HOOKS.haruka.canUseSkill(engine, p, tier)) return;
  // ---------- อาจารย์ ไบเลธ (characters/byleth.js) ----------
  //  พื้นฐาน: กดไม่ได้ระหว่างหลักสูตรเปิดอยู่ · รอง: ต้องเลือกแบบ (strike/buff) และมีความรู้พอ · ท่าไม้ตาย: ต้องเลือกหลักสูตร/กดปิด
  let bylethStrikeTarget = null;
  if (isBylethPick) {
    if (!CHAR_HOOKS.byleth.canUseSkill(engine, p, tier, item)) return;
    if (tier === "secondary" && item === "strike") {
      bylethStrikeTarget = CHAR_HOOKS.byleth.prepareStrikeTarget(engine, p, targets);
      if (!bylethStrikeTarget) return;
    }
  }
  // ---------- คอนเนอร์ RK800 (characters/conner.js) ----------
  //  พื้นฐาน: กดไม่ได้ระหว่างโหมดจับกุมขั้นเด็ดขาด · รอง/ท่าไม้ตาย: ต้องเลือกเป้าหมาย 1 คน
  //  (ท่าไม้ตายเล็งได้เฉพาะระดับ "อาชญากร" — เช็คทั้งที่ canUseSkill (มีเป้าให้เล็งไหม) และ prepareTarget (เป้าที่ส่งมาถูกระดับไหม))
  const isConnerPick = p.characterId === "conner";
  let connerTarget = null;
  let connerCloseCase = null; // เป้าหมายของ "จัดการปิดคดี" ที่รอลงดาเมจหลังวีดีโอจบ
  if (isConnerPick) {
    if (!CHAR_HOOKS.conner.canUseSkill(engine, p, tier)) return;
    connerTarget = CHAR_HOOKS.conner.prepareTarget(engine, p, tier, targets);
    if (!connerTarget) return; // ทั้งสามช่องต้องเลือกเป้าหมาย 1 คนแล้ว (rework 3.4.2)
    if (tier === "basic") {
      // วิเคราะห์สถานการณ์: item = ลำดับการกระทำที่คาดการณ์ (array ว่างได้ = ทายว่า "ไม่ได้ทำอะไรเลย")
      const guess = CHAR_HOOKS.conner.sanitizeGuess(item);
      if (!guess) return; // payload ผิดรูป — ไม่หักแต้มสกิลทิ้ง
      p.connorGuess = guess;
    }
  }
  // ---------- ยุย โยชิโอกะ (characters/yui.js) ----------
  //  พื้นฐาน: ไม่กินโควตาสกิลของเทิร์น · สกิลรอง: กดซ้ำระหว่าง "นักมวยปล้ำ" ไม่ได้
  //  ท่าไม้ตาย: item = คีย์เพลงที่เลือก · เพลงชุบชีวิตต้องเลือกคนตายไว้ก่อนด้วย
  const isYuiPick = p.characterId === "yui";
  const isYuiBasic = isYuiPick && tier === "basic";
  if (isYuiPick) {
    if (!CHAR_HOOKS.yui.canUseSkill(engine, p, tier)) return;
    if (tier === "ultimate") {
      const song = CHAR_HOOKS.yui.SONGS[item];
      if (!song) return; // ต้องเลือกเพลงก่อนเสมอ
      if (song.key === "treasure") {
        const rt = CHAR_HOOKS.yui.prepareReviveTarget(engine, p, targets);
        if (!rt) return; // ไม่มีคนตายให้ชุบ = กดไม่ได้
        p.yuiReviveTargetId = rt.id;
      }
    }
  }
  // ---------- อิสึกะ ชิโด (characters/shido.js) ----------
  //  พื้นฐาน: กดซ้ำระหว่าง "ภูติ" มีผลไม่ได้ · สกิลรอง: ต้องมีดาเมจที่บันทึกไว้ >= 3 ก่อนถึงชักดาบได้
  //  ท่าไม้ตาย: กดซ้ำระหว่างกับดักเปิดอยู่ไม่ได้ (และเป็นสกิลเงียบ — ไม่มีแบนเนอร์/ไม่เข้า roundSkills)
  const isShidoPick = p.characterId === "shido";
  if (isShidoPick && !CHAR_HOOKS.shido.canUseSkill(engine, p, tier)) return;
  // ---------- โมโรโบชิ ดัน (characters/dan.js) ----------
  //  พื้นฐาน: กดซ้ำไม่ได้ระหว่างไม้ค้ำยังมีผล · สกิลรอง/ท่าไม้ตาย 1: ต้องเลือกเป้าหมาย 1 คน
  //  ท่าไม้ตาย 2 (อย่าให้ฉันต้องเฆี่ยนตี): เล็งเป้าหมายเดิมอัตโนมัติ ไม่ต้องให้ผู้เล่นส่ง targets มา
  const isDanPick = p.characterId === "dan";
  let danTarget = null;
  let danWhipTarget = null; // เป้าหมายของท่าไม้ตาย 2 ที่รอลงดาเมจหลังวีดีโอจบ
  if (isDanPick) {
    if (!CHAR_HOOKS.dan.canUseSkill(engine, p, tier)) return;
    if (tier === "secondary" || tier === "ultimate") {
      danTarget = CHAR_HOOKS.dan.prepareTarget(engine, p, tier, targets);
      if (!danTarget) return;
    }
  }
  // ---------- ชเรด เอลัน (patch พิเศษ) ----------
  const isShrade = p.characterId === "shrade_elan";
  const isShradeBasic = isShrade && tier === "basic";                        // เชิญรับฟัง
  const isShradeMoon = isShrade && tier === "secondary";                     // แสงจันทร์ส่องวิญญาณ
  const isShradeForm = isShrade && tier === "ultimate" && !p.shradeForm;     // รวมร่างทำนองเพลง
  const isShradeFinal = isShrade && tier === "ultimate" && p.shradeForm;     // แด่เพื่อนรักของฉัน
  if (isShradeForm) {
    if (!isNightRound(roundNumber)) return;                     // ปลดล็อกเฉพาะช่วงกลางคืน (สกิลติดตัว)
    if ((p.statuses.melody || 0) < SHRADE_MELODY_MAX) return;   // ต้องมีท่วงทำนองครบ 5
  }
  let shradeMoonTarget = null;
  if (isShradeMoon) {
    shradeMoonTarget = CHAR_HOOKS.shrade_elan.prepareMoonTarget(engine, p, targets);
    if (!shradeMoonTarget) return;
  }
  // ---------- เรียวกิ ชิกิ (patch 2.0.6, characters/shiki.js) ----------
  const isShikiLifeline = p.characterId === "shiki" && tier === "secondary"; // นายมีฝีมือแค่ไหนหรอ?
  let shikiLifelineTarget = null;
  if (isShikiLifeline) {
    shikiLifelineTarget = CHAR_HOOKS.shiki.prepareLifelineTarget(engine, p, targets);
    if (!shikiLifelineTarget) return;
  }
  // ---------- เจ้าหญิงราก (patch 2.2.7, characters/princess_shiki.js) ----------
  const isPShikiSeal = p.characterId === "princess_shiki" && tier === "secondary"; // อย่าทำอะไรไม่เข้าท่าเลย
  let pshikiSealTarget = null;
  if (isPShikiSeal) {
    pshikiSealTarget = CHAR_HOOKS.princess_shiki.prepareSealTarget(engine, p, targets);
    if (!pshikiSealTarget) return;
  }
  // อืม ฉันเข้าใจแล้ว (สกิลพื้นฐาน): ชักดาบยังค้างอยู่ กดซ้ำไม่ได้ (ไม่งั้นเสียเลือด 3 ฟรี)
  const isPShikiBlade = p.characterId === "princess_shiki" && tier === "basic";
  if (isPShikiBlade && !CHAR_HOOKS.princess_shiki.canCastBlade(p)) return;
  // ---------- แบทแมน (patch 3.1, characters/bat_ben.js) ----------
  //  ร่างปกติ: พื้นฐาน = รถแบทโมบิล (ครั้งเดียวต่อเกม) · รอง = นายลืมของน่ะ · ไม้ตาย = เข้ามาเลย
  //  ร่างรถ: ทั้งสามช่องเปลี่ยนเป็นเวอร์ชันรถ (ลูกปรายล่อ / ปืนติดรถ / แกไม่รอดแน่)
  // ---------- มาคุโนะอุจิ อิปโป (characters/ippo.js) ----------
  //  ทั้งสามช่องมีคูลดาวน์รายสกิล (เก็บเป็นเลขรอบ ไม่ใช่สถานะ) — ด่านเดียวกันทั้ง canUseSkill และปุ่มฝั่ง client
  const isIppoPick = p.characterId === "ippo";
  if (isIppoPick && !CHAR_HOOKS.ippo.canUseSkill(engine, p, tier)) return;
  // ---------- ผู้วิงวอน (characters/the_supplicant.js) ----------
  //  ทั้งสามช่องต้องเลือกเป้าหมาย 1 คน (เลือกตัวเองได้) — โควตา 2 ครั้ง/เทิร์นเช็คไปแล้วด้านบน (ดู isSupPick)
  let supTarget = null;
  if (isSupPick) {
    if (!CHAR_HOOKS.the_supplicant.canUseSkill(engine, p, tier)) return;
    supTarget = CHAR_HOOKS.the_supplicant.prepareTarget(engine, p, targets);
    if (!supTarget) return;
  }
  // ---------- มหาเทพ อรชุน (characters/arjuna.js) ----------
  //  ทุกช่องเป็น self-buff/ตีหมู่ ไม่ต้องเลือกเป้าหมาย — เงื่อนไขการกดซ้ำ/คูลดาวน์อยู่ที่ canUseSkill
  const isArjunaPick = p.characterId === "arjuna";
  if (isArjunaPick && !CHAR_HOOKS.arjuna.canUseSkill(engine, p, tier)) return;
  const isBatPick = p.characterId === "bat_ben";
  if (isBatPick && !CHAR_HOOKS.bat_ben.canUseSkill(engine, p, tier)) return;
  // ---------- บานาจ ลิงก์ (patch 2.1.2, characters/banagher.js): Absorb shield — เลือกเป้าหมาย 1 คน (เลือกตัวเองได้) ----------
  const isBanagherShield = p.characterId === "banagher" && tier === "basic";
  let banagherShieldTarget = null;
  if (isBanagherShield) {
    banagherShieldTarget = CHAR_HOOKS.banagher.prepareShieldTarget(engine, p, targets);
    if (!banagherShieldTarget) return;
  }
  // ---------- DoomGuy (patch 2.2 full): Quick Swap (สกิลพื้นฐาน) 1 ครั้งต่อเทิร์น / Weapon (สกิลรอง) แปรตามอาวุธที่ถืออยู่ ----------
  const isDoomSwap = p.characterId === "doomguy" && tier === "basic";
  if (isDoomSwap && p.doomQuickSwapUsed) return; // ใช้ได้ 1 ครั้งต่อเทิร์น
  if (isDoomSwap && doomWeaponMarkPending()) return; // Combat Shotgun/Heavy Cannon: [ระเบิด]/[ล็อคเป้า] ยังค้างอยู่ — สุ่มปืนใหม่ไม่ได้จนกว่าจะโดนใช้
  const isDoomWeapon = p.characterId === "doomguy" && tier === "secondary";
  const doomW = isDoomWeapon ? (DOOM_WEAPONS[p.doomWeapon] || DOOM_WEAPONS.shotgun) : null;
  if (isDoomWeapon) cost = doomW.cost;
  if (isDoomWeapon && !doomW.effect) return; // ปืนบางกระบอกไม่มีความสามารถพิเศษให้กด (BFG 9000)
  let doomTarget = null;
  if (isDoomWeapon && ["explode", "lockon", "stun", "bonusdmg", "bonusdmg2", "drain"].includes(doomW.effect)) {
    doomTarget = CHAR_HOOKS.doomguy.resolveWeaponTarget(engine, p, targets);
    if (!doomTarget) return;
  }
  // ---------- สึงาชิ ทาคุโตะ (patch 2.2 new / 2.2.5) ----------
  const takutoApprivoiseOn = p.characterId === "takuto" && (p.statuses.apprivoise || 0) > 0;
  // patch 2.2.5: มีหอกผู้พิชิตอยู่ = ถือว่าดาบทั้ง 2 อันทำงานอยู่ กดซ้ำไม่ได้เหมือนกัน (แสดงเป็น disable)
  const isTakutoEmeraude = p.characterId === "takuto" && tier === "basic" && takutoApprivoiseOn;
  if (isTakutoEmeraude && ((p.statuses.emeraude || 0) > 0 || (p.statuses.lance || 0) > 0)) return; // ยังไม่ถูกใช้ กดซ้ำไม่ได้
  const isTakutoSaphir = p.characterId === "takuto" && tier === "secondary";
  if (isTakutoSaphir && !takutoApprivoiseOn) return; // ต้องอยู่ในสถานะ Apprivoise! ก่อนเท่านั้น
  if (isTakutoSaphir && ((p.statuses.saphir || 0) > 0 || (p.statuses.lance || 0) > 0)) return; // ยังไม่ถูกใช้ กดซ้ำไม่ได้
  // patch 2.2.4: ท่าไม้ตาย 1 "อย่างนายน่ะ จะไปเข้าใจอะไร" (พิชิตแสงดาว) — ใช้ได้เฉพาะก่อนกันตายทำงาน ต้องมีดาบทั้ง 2 อันพร้อมกันเท่านั้น
  const isTakutoUlt2 = p.characterId === "takuto" && tier === "ultimate" && !p.beatSaved;
  if (isTakutoUlt2 && !((p.statuses.emeraude || 0) > 0 && (p.statuses.saphir || 0) > 0)) return;
  if (isTakutoUlt2 && (p.statuses.takutoThirdAtk || 0) > 0) return; // มีโอกาสค้างอยู่แล้ว กดซ้ำไม่ได้จนกว่าจะได้ใช้ผล
  // patch 2.2.5: ท่าไม้ตาย 2 "ร่วมเดินทางไปกับฉันเถอะ" — แทนท่าไม้ตาย 1 ถาวรหลังกันตายทำงานแล้ว ไม่ต้องมีดาบก็กดได้
  const isTakutoUlt3 = p.characterId === "takuto" && tier === "ultimate" && p.beatSaved;
  if (isTakutoUlt3 && !takutoApprivoiseOn) return; // ต้องอยู่ในสถานะฉันคว้ามันได้แล้วก่อนเท่านั้น
  // ---------- เจ้าแห่งเน็ตบ้าน (patch 1.9) ----------
  const isTiger = p.characterId === "broadband_man" && tier === "basic";     // เสือนอนกิน
  const isLan = p.characterId === "broadband_man" && tier === "secondary";   // กระชากสายแลน
  const isOffer = p.characterId === "broadband_man" && tier === "ultimate";  // สนใจใช้บริการเราไหม
  // กระชากสายแลน: ใช้ได้ก็ต่อเมื่อมีคู่สัญญาแล้ว
  if (isLan && !CHAR_HOOKS.broadband_man.contractPartnerOf(engine, p)) return;
  // สนใจใช้บริการเราไหม: ใช้ไม่ได้ระหว่างมีคู่สัญญา/มีข้อเสนอค้าง — เลือกเป้าหมาย 1 คน (คนอื่นเท่านั้น)
  let offerTarget = null;
  if (isOffer) {
    if (CHAR_HOOKS.broadband_man.contractPartnerOf(engine, p) || p.contractOffer) return;
    offerTarget = CHAR_HOOKS.broadband_man.prepareOfferTarget(engine, p, targets);
    if (!offerTarget) return;
  }
  // ---------- นานายะ ชิกิ: อันนี้ของนายรึเปล่า (characters/nanaya.js) ----------
  const isNanayaSilence = p.characterId === "nanaya" && tier === "basic";
  let nanayaSilenceTarget = null;
  if (isNanayaSilence) {
    nanayaSilenceTarget = CHAR_HOOKS.nanaya.prepareSilenceTarget(engine, p, targets);
    if (!nanayaSilenceTarget) return;
  }
  // ---------- เทเปา (ชิกิ): วันนี้อากาศดีจัง / เป็นแบบนี้นี่เอง / นายเป็นคนทำตัวเองนะ ----------
  // patch 2.2.6: ระหว่างทำอาหารหรือครุ่นคิดอยู่ฝั่งใดฝั่งหนึ่ง ใช้สกิลอื่นไม่ได้เลย (รวมกดอีกฝั่งด้วย) จนกว่าฝั่งที่ทำอยู่จะหมดเวลา
  if (p.characterId === "tepeu" && ((p.tepeuCookTurns || 0) > 0 || (p.tepeuPonderTurns || 0) > 0)) return;
  const isTepeuCook = p.characterId === "tepeu" && tier === "basic";
  const isTepeuPonder = p.characterId === "tepeu" && tier === "secondary";
  const isTepeuKill = p.characterId === "tepeu" && tier === "ultimate";
  let tepeuKillTarget = null;
  if (isTepeuKill) {
    tepeuKillTarget = CHAR_HOOKS.tepeu.prepareKillTarget(engine, p, targets);
    if (!tepeuKillTarget) return;
  }
  // ---------- ไค ชิซากิ (characters/kai.js): มือซ้ายแห่งการรังสรรค์ / มือขวาแห่งการลงทัณฑ์ — Overhaul ไม่ผ่านช่องนี้ (ดู kaiOverhaul()) ----------
  if (p.characterId === "kai" && tier === "ultimate") return; // Overhaul ไม่ใช่ปุ่มสกิลปกติ — กดเองไม่ได้
  const isKaiCreation = p.characterId === "kai" && tier === "basic";
  const isKaiPunishment = p.characterId === "kai" && tier === "secondary";
  let kaiMarkTarget = null;
  if (isKaiCreation || isKaiPunishment) {
    kaiMarkTarget = CHAR_HOOKS.kai.prepareMarkTarget(engine, p, targets);
    if (!kaiMarkTarget) return;
  }
  // ---------- ผู้สังหารเมจ (characters/mageslayer.js): Witch Mark / Mana Rupture / Mana Burden ----------
  const isMsWitchMark = p.characterId === "mageslayer" && tier === "basic";
  let msWitchMarkTarget = null;
  if (isMsWitchMark) {
    if (roundNumber < (p.mageslayerWitchMarkReadyRound || 0)) return;
    msWitchMarkTarget = CHAR_HOOKS.mageslayer.prepareWitchMarkTarget(engine, p, targets);
    if (!msWitchMarkTarget) return;
  }
  const isMsRupture = p.characterId === "mageslayer" && tier === "ultimate";
  let msRuptureTarget = null;
  if (isMsRupture) {
    msRuptureTarget = CHAR_HOOKS.mageslayer.prepareRuptureTarget(engine, p, targets);
    if (!msRuptureTarget) return;
  }
  const isMsBurden = p.characterId === "mageslayer" && tier === "secondary";
  if (isMsBurden && CHAR_HOOKS.mageslayer.burdenOnCooldown(engine, p)) return; // Mana Burden: คูลดาวน์ 7 เทิร์น

  if (st === "beam" && (p.beamAmmo || 0) <= 0) return; // Beam Magnum กระสุนหมด ใช้ไม่ได้
  if (st === "beamplus" && (p.beamAmmo || 0) <= 0) return; // Beam Magnum Plus (ริดดี้) กระสุนหมด ใช้ไม่ได้
  // บานาจ (patch 2.1.2): Full Assault กดซ้ำไม่ได้จนกว่าผลจะหมด
  if (st === "fullassault" && (p.statuses.fullassault || 0) > 0) return;
  // บานาจ (patch 2.1.2.3): แสงที่ไม่อยู่เพียงลำพัง — ต้องมีกระสุน Beam Magnum เหลืออย่างน้อย 1 นัดทั้งคู่ (ตัวเอง + ริดดี้พันธมิตร)
  //  และริดดี้พันธมิตรต้องมีแต้มสกิลเหลืออย่างน้อย 8 แต้มด้วย (คอสจริงรวม 16 — ของตัวเอง 8 + พันธมิตร 8)
  if (st === "unibeam2") {
    const rAlly = riddheAllied(p);
    if (!rAlly || (p.beamAmmo || 0) <= 0 || (rAlly.beamAmmo || 0) <= 0 || rAlly.skillPoints < BANAGHER_ULT2_ALLY_COST) return;
  }
  // Ohger Finish (patch 2.2 alpha): ใช้ได้โดยไม่มีเงื่อนไขแล้ว — กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  if (st === "ohger" && (p.statuses.ohger || 0) > 0) return;

  // ANATA WAAAAAAAA (เทมาริ): ต้องเลือกเป้าหมาย 1 คนก่อนใช้ (characters/temari.js)
  let anataTargets = null;
  if (st === "anata") {
    anataTargets = CHAR_HOOKS.temari.prepareAnataTargets(engine, p, targets);
    if (!anataTargets) return;
  }

  p.skillPoints -= cost;
  if (blessFree) {
    p.statuses.freecast--;
    if (p.statuses.freecast <= 0) delete p.statuses.freecast;
    lastLog.push(`👸 ${p.name} การ์ดราชินี — ใช้สกิลนี้โดยไม่เสียแต้มสกิล`);
  }
  if (!isApplePick && !isMuimiBasic && !isTohnoPick && !isHakunoGender && !isDoomguyPick && !isKaiPick && !isTakumiPick && !isHarukaBasic && !isBylethPick && !isHisakawaFreeAction && !isYuiBasic && !isSupPick) p.skillUsedRound = true; // สกิลเลือก/สลับและเสบียงฉุกเฉินไม่นับโควตาสกิลหลัก
  if (isKaiPick) p.kaiSkillUsesRound = (p.kaiSkillUsesRound || 0) + 1;
  if (isTakumiPick) p.takumiSkillUsesRound = (p.takumiSkillUsesRound || 0) + 1;

  // ---------- นายมีฝีมือแค่ไหนหรอ? (ชิกิ patch 2.0.6): ยกเลิกท่าไม้ตายทันทีที่มีผู้เล่นอื่นกด ----------
  //  มีชิกิถือชาร์จ godslay อยู่บนสนาม -> ท่าไม้ตายของผู้เล่นอื่นที่เพิ่งกดถูกยกเลิกทันที
  //  ไม่ว่าท่าจะทำงานก่อนหรือหลังเปิดการ์ด — แต้มสกิลที่จ่ายไปเสียฟรี (ไม่คืน) และเล่นวีดีโอแทนที่
  if (tier === "ultimate") {
    const slayer = alivePlayers().find(
      (s) => s.id !== p.id && s.characterId === "shiki" && (s.statuses.godslay || 0) > 0
    );
    if (slayer) {
      const hasVideo = shikiCancelUltimate(slayer, p, skill.name, skill.img);
      if (hasVideo) pausePlayingForCutscene();
      else { broadcastState(); checkAllLocked(); }
      return;
    }
  }

  // Rainbow Pudding (คุวากาตะ patch 2.2 alpha): characters/kuwagata.js
  if (isPudding) CHAR_HOOKS.kuwagata.applyBasicPudding(engine, p);

  // ---------- Gambler the gambling (characters/gambler.js) ----------
  let flashSuffix = ""; // ต่อท้ายชื่อสกิลบนป้ายเด้ง เพื่อบอกผลเสี่ยงโชคให้ทุกคนเห็น
  if (isGambler) flashSuffix = CHAR_HOOKS.gambler.resolveSkill(engine, p, tier) || "";
  // ---------- เอวา 13: หอกแห่งแคสเซียส (characters/eva13.js) ----------
  if (isCassius) CHAR_HOOKS.eva13.applyBasicCassius(p, engine.log);
  // ---------- โอเบรอน: ม่านแห่งราตรี (characters/oberon.js) ----------
  if (isVeil) CHAR_HOOKS.oberon.applyBasicVeil(engine, p);
  // ---------- โอเบรอน: รุ่งอรุณแห่งวันใหม่ / ฝันร้ายยามค่ำคืน (characters/oberon.js) ----------
  if (isSunrise && sunriseTarget) {
    const r = CHAR_HOOKS.oberon.applySunriseEffect(engine, p, sunriseTarget, skill.name);
    if (r) flashSuffix = r;
  }
  if (isNightmare) CHAR_HOOKS.oberon.activateNightmare(engine, p);
  // ---------- โทโนะ ชิกิ: มีดพับประจำตระกูล — เลือกระดับสกิลติดตัว 1-5 (กดเปลี่ยนกี่ครั้งก็ได้) (characters/tohno.js) ----------
  if (isTohnoPick) {
    flashSuffix = CHAR_HOOKS.tohno.applyBasicPick(engine, p, item);
  }
  // ---------- คิชินามิ ฮาคุโนะ (characters/hakuno.js): เธอ/นาย คือฉันหรอ? — สลับเพศ (กดได้แค่ 1 ครั้งต่อเทิร์น) ----------
  if (isHakunoGender) flashSuffix = CHAR_HOOKS.hakuno.applyGenderSwitch(engine, p);
  // ---------- Apple guy: เอาแบบนี้ได้ไหม / เอาไปสิ (characters/appleguy.js) ----------
  if (isApplePick) {
    flashSuffix = CHAR_HOOKS.appleguy.applyBasicPick(p, item, engine.log);
  }
  if (isAppleGive && appleTarget) {
    flashSuffix = CHAR_HOOKS.appleguy.applyGiveEffect(engine, p, appleTarget, skill.name);
  }
  // ---------- ฟุจิตะ โคโตเนะ (characters/kotone.js) ----------
  //  ท่าไม้ตายในร่าง [พร้อมลุย] จ่าย 6 เหรียญเพิ่มจากแต้มสกิล (ผลจริงทำงานหลังเปิดไพ่ที่ resolveFormUlts)
  if (isKotone) {
    flashSuffix = CHAR_HOOKS.kotone.payFormUltGold(engine, p, skill) || flashSuffix;
    flashSuffix = CHAR_HOOKS.kotone.applyInstantSkill(engine, p, tier, kotoneNight) || flashSuffix;
  }
  // ---------- เอจิ (characters/eiji.js): ว่องไว / ความแค้น / ไม่ว่ายังก็ตาม ----------
  if (isEiji) flashSuffix = CHAR_HOOKS.eiji.applyInstantSkill(engine, p, tier) || flashSuffix;
  // ---------- มิซึซาว่า ฮารุกะ (characters/haruka.js): ไข่ต้ม และอาหารเสริม / amazon punish / New Omega ----------
  if (isHaruka) flashSuffix = CHAR_HOOKS.haruka.applyInstantSkill(engine, p, tier) || flashSuffix;
  // ---------- มุยมิ: เสบียงฉุกเฉิน / ดาบสนิม / ดาบสะบั้นหอคอยสวรรค์ ----------
  if (isMuimi) flashSuffix = CHAR_HOOKS.muimi.applyInstantSkill(engine, p, tier) || flashSuffix;
  // ---------- ยุย โยชิโอกะ (characters/yui.js): ปากแจ๋ว / เยอรมันซูเพล็ก / ทำนองเพลงร็อก ----------
  if (isYuiPick) flashSuffix = CHAR_HOOKS.yui.applyInstantSkill(engine, p, tier, item) || flashSuffix;
  // ---------- อิสึกะ ชิโด (characters/shido.js): ภูติ / Sandalphon / ฝากด้วยนะตัวฉัน ----------
  if (isShidoPick) flashSuffix = CHAR_HOOKS.shido.applyInstantSkill(engine, p, tier) || flashSuffix;
  // ---------- โมโรโบชิ ดัน (characters/dan.js): ไม้ค้ำ / นายทำให้ฉันผิดหวัง / ฉันบอกว่าอย่าหนี ----------
  if (isDanPick) {
    flashSuffix = CHAR_HOOKS.dan.applyInstantSkill(engine, p, tier, danTarget) || flashSuffix;
    if (tier === "ultimate" && danTarget) {
      // ท่าไม้ตายทั้งสองแบบเล่นวีดีโอทุกครั้ง (queueCutscene ตรงๆ ไม่ใช่ triggerCutscene)
      //  ท่า 1 แค่แปะสถานะ -> เล่นวีดีโอเฉยๆ ก็พอ · ท่า 2 ลงดาเมจ -> หน่วงไว้ให้ลงหลังวีดีโอจบ
      if (CHAR_HOOKS.dan.whipReady(engine, p)) { queueCutscene(p, "danWhip"); danWhipTarget = danTarget; }
      else queueCutscene(p, "danChase");
    }
  }
  // ---------- คอนเนอร์ RK800 (characters/conner.js): วิเคราะห์สถานการณ์ / ข่มขวัญ-จับกุม / จัดการปิดคดี ----------
  if (isConnerPick) {
    flashSuffix = CHAR_HOOKS.conner.applyInstantSkill(engine, p, tier, connerTarget) || flashSuffix;
    if (tier === "ultimate" && connerTarget) {
      // สเปคระบุลำดับ "เล่นวีดีโอก่อน แล้วค่อยเกิดความเสียหาย" และวีดีโอท่านี้เล่นทุกครั้งที่ปล่อย
      //  จึงหน่วงดาเมจไว้เสมอ แล้วลงจริงหลังคัตซีนจบ (ดูจุดที่เรียก pausePlayingForCutscene ด้านล่าง)
      CHAR_HOOKS.conner.queueCloseCaseVideo(engine, p);
      connerCloseCase = connerTarget;
    }
  }
  // ---------- อาจารย์ ไบเลธ (characters/byleth.js): ทบทวนบทเรียน / ดาบต้องสาป / หลักสูตรการสอน ----------
  if (isBylethPick) flashSuffix = CHAR_HOOKS.byleth.applyInstantSkill(engine, p, tier, item, bylethStrikeTarget) || flashSuffix;
  // ---------- ชเรด เอลัน (characters/shrade_elan.js) ----------
  if (isShradeBasic) flashSuffix = CHAR_HOOKS.shrade_elan.applyBasicEffect(engine, p);
  if (isShradeMoon && shradeMoonTarget) flashSuffix = CHAR_HOOKS.shrade_elan.applyMoonEffect(engine, p, shradeMoonTarget, skill.name);
  if (isShradeForm) flashSuffix = CHAR_HOOKS.shrade_elan.activateForm(engine, p);
  if (isShradeFinal) CHAR_HOOKS.shrade_elan.activateFinal(engine, p);
  // ---------- เจ้าแห่งเน็ตบ้าน (characters/broadband_man.js): เสือนอนกิน / กระชากสายแลน / สนใจใช้บริการเราไหม ----------
  if (isTiger) flashSuffix = CHAR_HOOKS.broadband_man.applyTigerEffect(engine, p);
  if (isLan) flashSuffix = CHAR_HOOKS.broadband_man.applyUnplugEffect(engine, p, skill.name);
  if (isOffer && offerTarget) flashSuffix = CHAR_HOOKS.broadband_man.castOffer(engine, p, offerTarget, skill.name);
  // ---------- นานายะ ชิกิ: อันนี้ของนายรึเปล่า (characters/nanaya.js) ----------
  if (isNanayaSilence && nanayaSilenceTarget) {
    flashSuffix = CHAR_HOOKS.nanaya.applySilenceEffect(engine, p, nanayaSilenceTarget, skill.name);
  }
  // ---------- Apple guy: ชิวๆครับน้องๆ — รีเซ็ตอัตราหลบเป็น 100% ----------
  if (st === "chill") {
    p.chillDodge = 100;
    lastLog.push(`🏖️ ${p.name} ชิวๆครับน้องๆ — หลบหนีอย่างสบายใจ (จบเทิร์นได้แต้มสกิล +1 จนกว่าจะถูกโจมตี)`);
  }
  // ---------- ชิกิ: นายมีฝีมือแค่ไหนหรอ? (patch 2.0.6, characters/shiki.js) — เส้นชีวิต +1 + ชาร์จยกเลิกท่าไม้ตาย ----------
  if (isShikiLifeline && shikiLifelineTarget) {
    flashSuffix = CHAR_HOOKS.shiki.applyLifelineEffect(engine, p, shikiLifelineTarget, skill.name);
  }
  // ---------- เทเปา (characters/tepeu.js) ----------
  if (isTepeuCook) CHAR_HOOKS.tepeu.applyCookEffect(engine, p);
  if (isTepeuPonder) CHAR_HOOKS.tepeu.applyPonderEffect(engine, p);
  if (isTepeuKill && tepeuKillTarget) flashSuffix = CHAR_HOOKS.tepeu.applyKillEffect(engine, p, tepeuKillTarget, skill.name);
  // ---------- ไค ชิซากิ (characters/kai.js) ----------
  if (isKaiCreation && kaiMarkTarget) flashSuffix = CHAR_HOOKS.kai.applyMark(engine, p, kaiMarkTarget, "kaiCreation", "รังสรรค์");
  if (isKaiPunishment && kaiMarkTarget) flashSuffix = CHAR_HOOKS.kai.applyMark(engine, p, kaiMarkTarget, "kaiPunishment", "ลงทัณฑ์");
  // ---------- ผู้สังหารเมจ (characters/mageslayer.js) ----------
  if (isTriggerSkill) CHAR_HOOKS.ultraman_trigger.applySkill(engine, p, tier);
  if (isHisakawaSkill) flashSuffix = CHAR_HOOKS.hisakawa_sister.applySkill(engine, p, tier, skill) || flashSuffix;
  if (isIgnisSteal && ignisStealTarget) flashSuffix = CHAR_HOOKS.ignis.applySteal(engine, p, ignisStealTarget) || flashSuffix;
  if (isIgnisSkill && !isIgnisSteal && !isIgnisImpact) flashSuffix = CHAR_HOOKS.ignis.applySkill(engine, p, tier, skill) || flashSuffix;
  if (isIgnisImpact) queueCutscene(p, "triggerDarkImpact");
  if (isMsWitchMark && msWitchMarkTarget) flashSuffix = CHAR_HOOKS.mageslayer.applyWitchMark(engine, p, msWitchMarkTarget);
  if (isMsRupture && msRuptureTarget) flashSuffix = CHAR_HOOKS.mageslayer.applyRuptureEffect(engine, p, msRuptureTarget, skill.name);
  if (isMsBurden) {
    p.transformAt = ++transformCounter; // Mana Burden: BGM mageslayer_ult ใช้ลำดับนี้ตัดสินว่าใครล่าสุด
    p.statuses.mageslayerBurdenBgm = 5;  // ตัวจับเวลาเพลงพื้นหลัง (อายุเท่าภาระเวท/ดูดซับเวทที่แจกออกไป)
    CHAR_HOOKS.mageslayer.applyManaBurden(engine, p);
  }
  // ---------- ทาคุมิ ฟุจิวาระ (characters/takumi.js) ----------
  if (isTakumiGearUp) flashSuffix = CHAR_HOOKS.takumi.applyGearUp(engine, p);
  if (isTakumiGearDown) flashSuffix = CHAR_HOOKS.takumi.applyGearDown(engine, p);
  if (isTakumiBlackout) CHAR_HOOKS.takumi.activateBlackout(engine, p);
  // ---------- โอกูริ แคป (Rework, characters/oguri.js) ----------
  if (isBreakfast) flashSuffix = CHAR_HOOKS.oguri.applyBreakfast(engine, p);
  if (isOguriTrain) flashSuffix = CHAR_HOOKS.oguri.applyTraining(engine, p);
  if (isVictoryBeat) CHAR_HOOKS.oguri.activateVictory(engine, p);
  if (isAshenTrail) CHAR_HOOKS.oguri.activateAshenTrail(engine, p);

  // ---------- ซาโตรุ อาเคฟุ (characters/satoru.js) ----------
  if (isOblada && obladaTarget) {
    flashSuffix = CHAR_HOOKS.satoru.applyObladaEffect(engine, p, obladaTarget, skill.name);
  }
  if (isLoca && locaTarget) {
    flashSuffix = CHAR_HOOKS.satoru.applyLocaEffect(engine, p, locaTarget);
  }

  // ---------- แบทแมน (characters/bat_ben.js) ----------
  //  สกิลที่ไม่ได้ผูกกับสถานะ (รถแบทโมบิล + ทั้งสามช่องของร่างรถ) ลงผลผ่าน applyInstantSkill
  if (isIppoPick) flashSuffix = CHAR_HOOKS.ippo.applyInstantSkill(engine, p, tier) || flashSuffix;
  // ---------- ผู้วิงวอน / มหาเทพ อรชุน (patch 3.4) ----------
  if (isSupPick && supTarget) flashSuffix = CHAR_HOOKS.the_supplicant.applyInstantSkill(engine, p, tier, supTarget) || flashSuffix;
  if (isArjunaPick && tier !== "ultimate") flashSuffix = CHAR_HOOKS.arjuna.applyInstantSkill(engine, p, tier) || flashSuffix;
  // Mahapralaya: แจกเปราะบาง + คิววีดีโอตรงนี้ แล้วลงความเสียหายจริงหลังวีดีโอจบ (ดูท้ายฟังก์ชัน)
  let arjunaPralayaPending = false;
  if (isArjunaPick && tier === "ultimate") { flashSuffix = CHAR_HOOKS.arjuna.startPralaya(engine, p) || flashSuffix; arjunaPralayaPending = true; }
  if (isBatPick) flashSuffix = CHAR_HOOKS.bat_ben.applyInstantSkill(engine, p, tier) || flashSuffix;
  if (st === "batKarma") CHAR_HOOKS.bat_ben.activateKarma(engine, p);
  if (st === "batTaunt") CHAR_HOOKS.bat_ben.activateTaunt(engine, p);
  // ---------- เจ้าหญิงราก (characters/princess_shiki.js) ----------
  if (isPShikiSeal && pshikiSealTarget) {
    flashSuffix = CHAR_HOOKS.princess_shiki.applySealEffect(engine, p, pshikiSealTarget, skill.name);
  }
  if (st === "pshikiBlade") CHAR_HOOKS.princess_shiki.activateBlade(engine, p);
  if (st === "pshikiUlt") CHAR_HOOKS.princess_shiki.activateUlt(engine, p);
  // ---------- ชิกิ: ท่าไม้ตายทั้งสอง (characters/shiki.js) — เปิดเนตรมารแห่งความมรณะ / ความตายที่โรยรา ----------
  if (st === "deatheye") CHAR_HOOKS.shiki.activateDeatheye(engine, p);
  if (st === "wither") CHAR_HOOKS.shiki.activateWither(engine, p);

  // ทงคัสสึ 3 มื้อ (เทมาริ patch 2.0.6): นับชามสะสม (characters/temari.js)
  if (p.characterId === "temari" && tier === "basic") CHAR_HOOKS.temari.applyBasicTonkatsu(p);
  if (isEscanorSkill) CHAR_HOOKS.escanor.applySkill(engine, p, tier, targets);
  else if (!isHisakawaSkill && !isIgnisSkill) applyEffect(p, skill.effect);

  // ---------- บานาจ ลิงก์ (patch 2.1.2, characters/banagher.js) ----------
  if (isBanagherShield && banagherShieldTarget) CHAR_HOOKS.banagher.applyShieldEffect(engine, p, banagherShieldTarget);
  // ---------- DoomGuy (patch 2.2 full, characters/doomguy.js) ----------
  if (isDoomSwap) CHAR_HOOKS.doomguy.applyQuickSwap(engine, p);
  if (isDoomWeapon) {
    io.emit("skillFlash", { name: `🔫 ${doomW.name}`, img: doomW.img, by: p.name, color: POSITION_COLORS[p.position] || "#888", doomWeapon: p.doomWeapon }); // เสียงสกิลอาวุธ (เฉพาะฝั่ง client แปลว่าเสียงตามอาวุธ)
    CHAR_HOOKS.doomguy.applyWeaponEffect(engine, p, doomW, doomTarget);
  }
  // ---------- สึงาชิ ทาคุโตะ (patch 2.2 new, characters/takuto.js) ----------
  if (p.characterId === "takuto" && tier === "basic" && !takutoApprivoiseOn) CHAR_HOOKS.takuto.applyBasicStar(engine, p);
  if (isTakutoEmeraude) CHAR_HOOKS.takuto.applyEmeraude(engine, p);
  if (isTakutoSaphir) CHAR_HOOKS.takuto.applySaphir(engine, p);
  // ---------- สึงาชิ ทาคุโตะ ท่าไม้ตาย 1 (patch 2.2.4): อย่างนายน่ะ จะไปเข้าใจอะไร (พิชิตแสงดาว) — แทน Tau Missile เดิม ----------
  //  เงื่อนไข: ต้องมีดาบทั้ง 2 อัน (Emeraude+Saphir) พร้อมกันเท่านั้นถึงจะใช้ได้ (เช็คที่ gate ด้านบนแล้ว) — ใช้ได้เฉพาะก่อนกันตายทำงาน
  if (isTakutoUlt2) CHAR_HOOKS.takuto.activateUlt2(engine, p);
  // ---------- สึงาชิ ทาคุโตะ ท่าไม้ตาย 2 ใหม่ (patch 2.2.5): ร่วมเดินทางไปกับฉันเถอะ — แทนท่าไม้ตาย 1 ถาวรหลังกันตายทำงานแล้ว ----------
  if (isTakutoUlt3) CHAR_HOOKS.takuto.activateUlt3(engine, p);
  // Full Assault (characters/banagher.js): ตีหมู่ทุกคนทันที 1 หน่วย (เทิร์นถัดไปอีก 2 ครั้งผ่าน dealRound) แล้วเล่นวีดีโอ
  if (st === "fullassault") CHAR_HOOKS.banagher.activateFullAssault(engine, p);
  // NewType Paradise / แสงที่ไม่อยู่เพียงลำพัง (characters/banagher.js) — ทำงานก่อนเปิดการ์ด
  if (st === "paradise") CHAR_HOOKS.banagher.activateParadise(engine, p);
  if (st === "unibeam2") CHAR_HOOKS.banagher.activateUnibeam2(engine, p, cost);

  // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9, characters/riddhe.js) ----------
  if (st === "absorbplus") CHAR_HOOKS.riddhe.activateAbsorbShield(engine, p);
  if (st === "riddhentd") CHAR_HOOKS.riddhe.activateNtd(engine, p);
  if (st === "riddheguard") CHAR_HOOKS.riddhe.activateGuard(engine, p);

  // Song for you (เทมาริ patch 2.0.6.1): ล้างสถานะผิดปกติทั้งหมดของตัวเอง แล้วนำชามทงคัสสึมาบัฟตัวเอง
  //  1 ชาม = +1 พลังขิง — ใช้แล้วล้างชามทั้งหมด
  if (st === "song") {
    const bowls = p.tonkatsu || 0;
    const atk = bowls;
    p.songAtk = atk;
    p.tonkatsu = 0;
    // ล้างสถานะผิดปกติทั้งหมด (patch 2.0.8: ยามฟ้าสาง/เส้นชีวิต เป็นดีบัฟที่ยังไม่เกิดผลทันที — ลดลงทีละ 1 แทน)
    const cleansed = [];
    for (const k of DEBUFF_KEYS) {
      if ((p.statuses[k] || 0) > 0) {
        delete p.statuses[k];
        if (p.statusAmt) delete p.statusAmt[k];
        cleansed.push(k);
      }
    }
    for (const k of SOFT_DEBUFF_STEP) {
      if ((p.statuses[k] || 0) > 0) {
        p.statuses[k]--;
        if (p.statuses[k] <= 0) delete p.statuses[k];
        cleansed.push(k);
      }
    }
    if ((p.sunriseDrop || 0) > 0) { p.sunriseDrop = 0; cleansed.push("sunriseDrop"); }
    lastLog.push(`🎵 ${p.name} Song for you — ใช้ทงคัสสึ ${bowls} ชาม: พลังขิง +${atk} (ล้างชามทั้งหมด)${cleansed.length ? ` และล้างสถานะผิดปกติ ${cleansed.length} อย่าง` : ""}`);
  }

  // ANATA WAAAAAAAA (characters/temari.js): เก็บเป้าหมายไว้เป็นความลับ + เปิดเพลงจนกว่าทุกคนจะเปิดไพ่
  if (st === "anata") {
    p.anataTargets = CHAR_HOOKS.temari.applyUltimateEffect(engine, p, anataTargets, skill.name);
    anataMusicSeq = engine.nextTransformCounter();
  }

  // ---------- ไรโด ฮิคารุ (characters/hikaru.js) ----------
  if (st === "monster") CHAR_HOOKS.hikaru.activateMonster(engine, p);
  if (st === "ginga") CHAR_HOOKS.hikaru.activateGinga(engine, p);
  if (st === "gingastrium") CHAR_HOOKS.hikaru.activateGingaStrium(engine, p);

  // ---------- ริต้า เบอร์นัล / ฟีนิกซ์ (characters/phenex.js) ----------
  if (st === "phenexIgnite") CHAR_HOOKS.phenex.activateIgnite(engine, p);
  if (st === "phenexReflect") CHAR_HOOKS.phenex.activateReflect(engine, p);
  if (st === "phenexNtd") CHAR_HOOKS.phenex.activateNtd(engine, p);
  if (st === "phenexTaunt") CHAR_HOOKS.phenex.activateTaunt(engine, p);
  if (st === "phenexPurge") CHAR_HOOKS.phenex.activatePurge(engine, p);
  // ---------- อาริมะ มิยาโกะ (patch 2.2.0, characters/miyako.js) ----------
  if (st === "miyakoHeal") CHAR_HOOKS.miyako.activateHeal(engine, p);
  if (st === "miyakoCombo") CHAR_HOOKS.miyako.activateCombo(engine, p);
  if (st === "miyakoUlt") CHAR_HOOKS.miyako.activateUlt(engine, p);
  // ---------- คุวากาตะโอเจอร์: สวมเกราะราชัน (characters/kuwagata.js) ----------
  if (st === "rachan") {
    CHAR_HOOKS.kuwagata.applyRachanEffect(engine, p);
  }
  // ---------- เอวานเกเลี่ยน หมายเลข 13: Fourth Impact (characters/eva13.js) ----------
  if (st === "fourth") CHAR_HOOKS.eva13.applyFourthEffect(engine, p);
  // ---------- DoomGuy (characters/doomguy.js) — Crucible: แปลงร่างทันทีก่อนเปิดไพ่ทั้งหมด + บังคับทุกคนอื่นแตกทันที ----------
  if (st === "doomCrucible") CHAR_HOOKS.doomguy.activateCrucible(engine, p);
  // ---------- คิชินามิ ฮาคุโนะ (characters/hakuno.js) ----------
  if (st === "hakunoInvertReady") CHAR_HOOKS.hakuno.applyInvertCharge(engine, p);
  if (st === "hakunoNoRegenReady") CHAR_HOOKS.hakuno.applyNoRegenCharge(engine, p);
  if (st === "moonCell") CHAR_HOOKS.hakuno.applyMoonCellCast(engine, p);
  // ---------- โอเบรอน: Lie Like Vortigern (Rework 2 — ทำงานทันทีก่อนเปิดการ์ด, characters/oberon.js) ----------
  if (st === "vortigern") CHAR_HOOKS.oberon.applyVortigernEffect(engine, p);

  // ข้อเสียโคโตเนะ (characters/kotone.js): 20% เมื่อใช้สกิลพื้นฐาน/พื้นฐาน 2/สกิลรอง -> โดนท่านประธานเซนะจังเจอตัว สตั้นตัวเอง 1 เทิร์น
  if (isKotone) CHAR_HOOKS.kotone.maybeTriggerSena(engine, p, tier, kotoneWasForm);

  // ดูดซับเวท (characters/mageslayer.js): ทุกครั้งที่ผู้เล่นคนใดกดสกิลสำเร็จ — ถ้าติด [ดูดซับเวท] 35% ถูกขโมยพลังงาน 1
  CHAR_HOOKS.mageslayer.onEnergyAction(engine, p);
  CHAR_HOOKS.escanor.onSkillUsed(engine, p);

  // สกิลช่วงจั่วการ์ด (instant): เด้งโชว์ทันทีบนกระดานของทุกคน ไม่ต้องรอเปิดไพ่/ไม่ตัดจอดำ
  if (skill.instant) {
    // Apple guy: ป้ายเด้งของสกิลพื้นฐานโชว์รูปของที่เลือก
    const flashImg = isApplePick ? CHAR_HOOKS.appleguy.ITEMS[item].img
      : (skill.img || null);
    // เทเปา (ชิกิ): กดสกิลพื้นฐาน/สกิลรอง ให้เล่นเสียง tepeu_skill1_2 ก่อนเสมอ
    // คอนเนอร์: วิเคราะห์สถานการณ์เล่นเพลงคิด conner_think.m4a ทุกครั้งที่กด
    const flashSound = (isConnerPick && tier === "basic") ? "conner_think"
      : (isTepeuCook || isTepeuPonder) ? "tepeu_skill1_2" : isHisakawaSkill ? CHAR_HOOKS.hisakawa_sister.skillVoice(p, tier, skill) : null;
    // อิสึกะ ชิโด "ฝากด้วยนะตัวฉัน": สกิลเงียบ — ห้ามมีแบนเนอร์ให้ใครเห็นว่าเขากดอะไรไป
    if (!CHAR_HOOKS.shido.silentSkill(p, tier)) {
      io.emit("skillFlash", { name: skill.name + flashSuffix, img: flashImg, by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96", sound: flashSound });
    }
  }
  // จำสกิลที่ใช้ในรอบ (ท่าไม้ตายมี cutscene ของตัวเอง / สกิลหลังเปิดไพ่ไปโชว์ตอนโจมตี)
  // คอนเนอร์ RK800 (สกิลติดตัว 1 สืบสวน): การกดสกิล 1 ครั้ง = ความเครียด +1 (ไม่ลงที่ตัวคอนเนอร์เอง)
  CHAR_HOOKS.conner.onSkillUsed(engine, p);
  //  สกิลเงียบของชิโดไม่เข้า roundSkills ด้วย — รายการนี้ถูกอ่านโดยหลักสูตร "พิเศษ" ของไบเลธ
  //  ซึ่งจะลงโทษ "คนที่กดสกิลในเทิร์นนี้" = เป็นเบาะแสว่าชิโดกดอะไรไป
  if (!CHAR_HOOKS.shido.silentSkill(p, tier)) roundSkills.push({ playerId: id, tier, name: skill.name, img: skill.img || null, status: st }); // tier: หลักสูตร "พิเศษ" ของไบเลธอ่านว่าใครกดสกิลระดับไหนในเทิร์นนี้

  p.busted = bustedOf(p);
  if (p.busted) { voidUltimateOnBust(p); maybeMoonBurst(p); CHAR_HOOKS.mageslayer.onBustOrLoseRoll(engine, p); }
  // ไพ่แตก/ถึงเพดานพอดี: ไม่ล็อกอัตโนมัติ — ยังกดสกิล/ใช้ไอเทมได้ต่อไป จนกว่าจะกดเปิดไพ่เอง หรือทุกคนเปิดไพ่ครบ

  // วีดีโอสวนกลับที่ค้างคิว (Wonder of U ซาโตรุ) — เล่นทันทีช่วงจั่วการ์ด
  if (gameState === "PLAYING" && cutsceneQueue.length) {
    if (isIgnisImpact) pausePlayingForCutscene(() => CHAR_HOOKS.ignis.applyImpact(engine, p, ignisImpactTarget));
    else if (danWhipTarget) {
      // โมโรโบชิ ดัน: "อย่าให้ฉันต้องเฆี่ยนตี" — วีดีโอก่อน แล้วค่อยลงความเสียหาย (แพทเทิร์นเดียวกับจัดการปิดคดี)
      const dt = danWhipTarget;
      danWhipTarget = null;
      pausePlayingForCutscene(() => CHAR_HOOKS.dan.applyWhip(engine, p, dt));
    }
    else if (arjunaPralayaPending) {
      // มหาเทพ อรชุน: Mahapralaya — วีดีโอก่อน แล้วค่อยลงความเสียหายใส่ทุกคน (ลำดับตามสเปค)
      arjunaPralayaPending = false;
      pausePlayingForCutscene(() => CHAR_HOOKS.arjuna.applyPralaya(engine, p));
    }
    else if (connerCloseCase) {
      const t = connerCloseCase;
      connerCloseCase = null;
      pausePlayingForCutscene(() => CHAR_HOOKS.conner.applyCloseCase(engine, p, t));
    } else pausePlayingForCutscene();
  }
  // ตาข่ายสำรอง (คอนเนอร์ "จัดการปิดคดี"): ไม่ได้เข้าเส้นทางคัตซีนด้วยเหตุใดก็ตาม -> ลงดาเมจทันที
  //  ไม่งั้นแต้มสกิล 8 หน่วยหายไปเปล่าๆ โดยเป้าหมายไม่โดนอะไรเลย
  if (connerCloseCase) CHAR_HOOKS.conner.applyCloseCase(engine, p, connerCloseCase);
  // ตาข่ายสำรองเดียวกันของ "อย่าให้ฉันต้องเฆี่ยนตี" — ไม่ได้เข้าเส้นทางคัตซีน -> ลงดาเมจทันที
  if (danWhipTarget) CHAR_HOOKS.dan.applyWhip(engine, p, danWhipTarget);
  // ตาข่ายสำรองเดียวกันของ Mahapralaya — ไม่ได้เข้าเส้นทางคัตซีน -> ลงความเสียหายทันที
  if (arjunaPralayaPending) CHAR_HOOKS.arjuna.applyPralaya(engine, p);
  broadcastState();
  checkAllLocked();
}
// สกิลติดตัว อาคมบัญชาระดับ EX+ (คิชินามิ ฮาคุโนะ patch 2.2.1): เลือกใช้ได้ 3 ครั้งต่อเกม กดได้กี่ครั้งก็ได้ใน 1 เทิร์นจนกว่าจะหมด
function hakunoCommandSpell(id, command) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.locked) return;
  if (p.characterId !== "hakuno") return;
  const cmd = Number(command);
  if (![1, 2, 3].includes(cmd)) return;
  if ((p.hakunoCommandUses || 0) <= 0) return;
  p.hakunoCommandUses--;

  const what = CHAR_HOOKS.hakuno.applyCommandSpell(engine, p, cmd);
  const usesImg = p.hakunoCommandUses <= 0 ? "lost" : p.hakunoCommandUses === 1 ? "1left" : p.hakunoCommandUses === 2 ? "2left" : "full";
  io.emit("skillFlash", {
    name: `อาคมบัญชาระดับ EX+ — ${what}`,
    img: `/characters/hakuno/passive/${usesImg}.png`,
    by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96",
  });
  broadcastState();
}
// ---- ระบบสัญญา (เจ้าแห่งเน็ตบ้าน patch 1.9) ----
// ตอบข้อเสนอสัญญา (สนใจใช้บริการเราไหม): ตอบรับ = เป็นคู่สัญญา / ปฏิเสธ (หรือไม่ตอบก่อนเปิดไพ่) = โดนค่าปรับ
function resolveOffer(b, t, accept, timeout) {
  if (!b) return;
  b.contractOffer = null;
  if (!t || !t.alive) return;
  if (accept && b.alive) {
    if (t.contractWith && t.contractWith !== b.id) {
      lastLog.push(`📵 ข้อเสนอของ ${b.name} ถูกยกเลิก — ${t.name} มีคู่สัญญาอยู่แล้ว`);
      return;
    }
    b.contractPartner = t.id;
    t.contractWith = b.id;
    b.contractTurns = 0;
    // เพดานเกราะ +3 (ผ่าน contractBuffActive) พร้อมฟื้นเกราะให้ 3 หน่วยทันที
    healArmor(t, CONTRACT_ARMOR_BONUS);
    lastLog.push(`📶 ${t.name} ตอบรับข้อเสนอของ ${b.name} — เป็นคู่สัญญา! เกราะ +${CONTRACT_ARMOR_BONUS} และพลังโจมตี +1 ตลอดสัญญา`);
    io.emit("skillFlash", { name: `สนใจใช้บริการเราไหม — ${t.name} ตอบรับสัญญา!`, img: "/characters/broadband_man/broadband_man_skill3.jpg", by: b.name, color: POSITION_COLORS[b.position] || "#9B4F96" });
    for (const other of Object.values(players)) {
      if (other.id !== b.id && other.contractOffer === t.id) {
        other.contractOffer = null;
        lastLog.push(`📵 ข้อเสนอของ ${other.name} ถูกถอนอัตโนมัติ — ${t.name} เลือกทำสัญญากับ ${b.name} แล้ว`);
      }
    }
  } else {
    // ปฏิเสธ: เสียเลือด 1 ไม่สนเกราะ + แต้มสกิลจบเทิร์นลด 1 เป็นเวลา 3 เทิร์น (นับเทิร์นถัดไป)
    dealDirect(t, 1);
    maybeBeatSave(t);
    maybeBeatMode(t);
    maybeEva3(t);
    t.skillDrainPending = 3;
    lastLog.push(`📵 ${t.name} ${timeout ? "ไม่ตอบข้อเสนอ" : "ปฏิเสธข้อเสนอ"}ของ ${b.name} — เสียเลือด 1 ไม่สนเกราะ และแต้มสกิลจบเทิร์นลด 1 (3 เทิร์นถัดไป)`);
    io.emit("skillFlash", { name: `สนใจใช้บริการเราไหม — ${t.name} ปฏิเสธ`, img: "/characters/broadband_man/broadband_man_skill3.jpg", by: b.name, color: POSITION_COLORS[b.position] || "#9B4F96" });
    if (t.alive && t.hp <= 0) {
      instantDeath(t);
      if (!t.alive) lastLog.push(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
    }
  }
}
// ตอบคำถามต่อสัญญา (ชำระค่าบริการ): ต่อ = จ่าย 4 แต้มคืนเจ้าของ (ขาดเท่าไหร่รับความเสียหายแทน — สนใจเกราะ)
//  ปฏิเสธ (หรือไม่ตอบก่อนเปิดไพ่) = เสียเลือด 2 ไม่สนเกราะ + "ไม่ใช้งานต่อ" ฟื้นเลือดตัวเองไม่ได้ 1 เทิร์น + สัญญาสิ้นสุด
function resolveRenew(t, accept, timeout) {
  if (!t) return;
  t.renewPending = false;
  const b = CHAR_HOOKS.broadband_man.contractBoss(engine, t);
  if (!b) return; // เจ้าของสัญญาตาย/หายไปแล้ว
  if (accept) {
    const pay = Math.min(CONTRACT_FEE, t.skillPoints);
    const shortfall = CONTRACT_FEE - pay;
    t.skillPoints -= pay;
    if (pay > 0) addSkill(b, pay);
    if (shortfall > 0) {
      dealMixed(t, shortfall);
      maybeBeatSave(t);
      maybeBeatMode(t);
      maybeEva3(t);
    }
    lastLog.push(`📶 ${t.name} ต่อสัญญากับ ${b.name} — จ่ายแต้มสกิล ${pay} แต้ม${shortfall > 0 ? ` (ขาดอีก ${shortfall} รับเป็นความเสียหายแทน)` : ""}`);
    io.emit("skillFlash", { name: `ชำระค่าบริการ — ${t.name} ต่อสัญญา (จ่าย ${pay} แต้ม)`, img: "/characters/broadband_man/broadband_man.jpg", by: b.name, color: POSITION_COLORS[b.position] || "#9B4F96" });
  } else {
    dealDirect(t, 2);
    maybeBeatSave(t);
    maybeBeatMode(t);
    maybeEva3(t);
    if (!resistActive(t)) t.statuses.nohealing = Math.max(t.statuses.nohealing || 0, 1);
    b.contractPartner = null;
    b.contractTurns = 0;
    t.contractWith = null;
    lastLog.push(`[Contract] ${t.name} ${timeout ? "no response" : "declined"} renewal with ${b.name} - takes 2 direct damage${resistActive(t) ? " (resisted no-healing)" : " and gains no-healing for 1 turn"}; contract ended`);
    io.emit("skillFlash", { name: `ชำระค่าบริการ — ${t.name} ยกเลิกสัญญา`, img: "/characters/broadband_man/broadband_man.jpg", by: b.name, color: POSITION_COLORS[b.position] || "#9B4F96" });
  }
  if (t.alive && t.hp <= 0) {
    instantDeath(t);
    if (!t.alive) lastLog.push(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
  }
}
// ---- Locacaca fruit (ซาโตรุ patch 2.0.8.2) ----
// เป้าหมายตอบรับ = ฮีลเต็ม แลก Max HP -1 และจ่ายแต้มสกิล 4 ให้ซาโตรุ / ปฏิเสธ (หรือไม่ตอบ) = ไม่มีอะไรเกิดขึ้น
function resolveLoca(s, t, accept, timeout) {
  if (!s) return;
  s.locaOffer = null;
  if (!t || !t.alive) return;
  if (accept && s.alive) {
    t.maxHpPenalty = (t.maxHpPenalty || 0) + 1;
    t.hp = Math.min(t.hp, maxHpOf(t));
    const heal = healHp(t, MAX_HP);
    const pay = Math.min(CHAR_HOOKS.satoru.LOCA_STEAL, t.skillPoints);
    t.skillPoints -= pay;
    if (pay > 0) addSkill(s, pay);
    lastLog.push(`🍑 ${t.name} รับผลโลกากากาจาก ${s.name} — ฟื้นเลือดจนเต็ม +${heal} แลกกับ Max HP ลดถาวร 1 (เหลือ ${maxHpOf(t)}) และจ่ายแต้มสกิล ${pay} ให้ ${s.name}`);
    io.emit("skillFlash", { name: `Locacaca fruit — ${t.name} รับผลไม้!`, img: "/characters/satoru/locaca.png", by: s.name, color: POSITION_COLORS[s.position] || "#9B4F96" });
  } else {
    lastLog.push(`🍑 ${t.name} ${timeout ? "ไม่ตอบ" : "ปฏิเสธ"}ผลโลกากากาของ ${s.name} — ไม่มีอะไรเกิดขึ้น`);
    io.emit("skillFlash", { name: `Locacaca fruit — ${t.name} ปฏิเสธ`, img: "/characters/satoru/locaca.png", by: s.name, color: POSITION_COLORS[s.position] || "#9B4F96" });
  }
}
function answerLoca(id, accept, fromId = null) {
  const t = players[id];
  if (gameState !== "PLAYING" || !t || !t.alive) return;
  const s = fromId ? players[fromId] : Object.values(players).find((o) => o.alive && o.locaOffer === id);
  if (s && (!s.alive || s.locaOffer !== id)) return;
  if (!s) return;
  resolveLoca(s, t, accept, false);
  broadcastState();
  checkAllLocked();
}
// รับคำตอบจากเป้าหมาย (ตอบได้ระหว่างช่วงจั่วการ์ด แม้จะเปิดไพ่ไปแล้ว)
function answerContract(id, accept, fromId = null) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive) return;
  if (p.renewPending) {
    resolveRenew(p, accept, false);
    broadcastState();
    checkAllLocked();
    return;
  }
  const b = fromId ? players[fromId] : Object.values(players).find((o) => o.alive && o.contractOffer === id);
  if (b && (!b.alive || b.contractOffer !== id)) return;
  if (!b) return;
  resolveOffer(b, p, accept, false);
  broadcastState();
  checkAllLocked();
}
// ---- ระบบพันธมิตรบันชี × ยูนิคอร์น (ริดดี้ มาร์เซนาส patch 2.0.9) ----
// Event เริ่มเกม: ริดดี้เลือกบานาจที่จะยื่นข้อเสนอ (targetId) หรือปฏิเสธ (ไม่ส่ง targetId) = เดินเส้นทางเดี่ยว
function riddheChooseAlly(id, targetId) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || p.characterId !== "riddhe" || !p.allyPrompt) return;
  p.allyPrompt = false;
  const t = targetId ? players[targetId] : null;
  if (!t || !t.alive || t.characterId !== "banagher" || t.id === p.id) {
    lastLog.push(`🤖 ${p.name} เลือกเดินเส้นทางเดี่ยว — ไม่จับมือกับยูนิคอร์น`);
    broadcastState();
    checkAllLocked();
    return;
  }
  p.allyOffer = t.id;
  lastLog.push(`🤝 ${p.name} ยื่นข้อเสนอเป็นพันธมิตรให้ ${t.name} (ไม่ตอบก่อนเปิดไพ่ = ปฏิเสธ)`);
  io.emit("skillFlash", { name: "🤝 ข้อเสนอพันธมิตรบันชี", img: RIDDHE_BANSHEE_IMG, by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96" });
  broadcastState();
  checkAllLocked();
}
// บานาจตอบข้อเสนอพันธมิตร: ตอบรับ = จับมือเป็นพันธมิตร / ปฏิเสธ (หรือไม่ตอบก่อนเปิดไพ่) = ริดดี้เดินเส้นทางเดี่ยว
function resolveAllyOffer(r, t, accept, timeout) {
  if (!r) return;
  r.allyOffer = null;
  if (!t || !t.alive) return;
  if (accept && r.alive) {
    if (t.allyId && t.allyId !== r.id) {
      lastLog.push(`🤝💔 ข้อเสนอของ ${r.name} ถูกยกเลิก — ${t.name} มีพันธมิตรอยู่แล้ว`);
      return;
    }
    r.allyId = t.id;
    t.allyId = r.id;
    lastLog.push(`🤝 ${t.name} ตอบรับข้อเสนอของ ${r.name} — บันชีและยูนิคอร์นเป็นพันธมิตรกัน! (เห็นแต้มการ์ดของกันและกัน · ท่าไม้ตายริดดี้เปลี่ยนเป็น "ฉันจะไม่ยอมสูญเสียใครไปอีก")`);
    io.emit("skillFlash", { name: "🤝 พันธมิตรบันชี × ยูนิคอร์น", img: RIDDHE_BANSHEE_IMG, by: r.name, color: POSITION_COLORS[r.position] || "#9B4F96" });
    for (const other of Object.values(players)) {
      if (other.id !== r.id && other.characterId === "riddhe" && other.allyOffer === t.id) {
        other.allyOffer = null;
        lastLog.push(`🤝💔 ข้อเสนอของ ${other.name} ถูกถอนอัตโนมัติ — ${t.name} เลือกเป็นพันธมิตรกับ ${r.name} แล้ว`);
      }
    }
  } else {
    lastLog.push(`🤝💔 ${t.name} ${timeout ? "ไม่ตอบ" : "ปฏิเสธ"}ข้อเสนอพันธมิตรของ ${r.name} — ริดดี้เดินเส้นทางเดี่ยว`);
    io.emit("skillFlash", { name: "ข้อเสนอพันธมิตร — ถูกปฏิเสธ", img: RIDDHE_BANSHEE_IMG, by: r.name, color: POSITION_COLORS[r.position] || "#9B4F96" });
  }
}
function answerAllyOffer(id, accept, fromId = null) {
  const t = players[id];
  if (gameState !== "PLAYING" || !t || !t.alive) return;
  const r = fromId ? players[fromId] : Object.values(players).find((o) => o.alive && o.characterId === "riddhe" && o.allyOffer === id);
  if (r && (!r.alive || r.characterId !== "riddhe" || r.allyOffer !== id)) return;
  if (!r) return;
  resolveAllyOffer(r, t, accept, false);
  broadcastState();
  checkAllLocked();
}
// คู่พันธมิตรตีกันเอง: ฝ่ายที่ถูกตีเลือกยกเลิกพันธมิตรไหม — ยกเลิก = ฟื้นเลือด/เกราะที่เสียจากการโดนคู่ตีคืน
function answerAllyBreak(id, cancel) {
  const t = players[id];
  if (gameState !== "PLAYING" || !t || !t.alive || !t.allyBreakAsk) return;
  const ask = t.allyBreakAsk;
  t.allyBreakAsk = null;
  const o = players[ask.by];
  if (!cancel) {
    lastLog.push(`🤝 ${t.name} เลือกให้อภัย — พันธมิตรยังคงอยู่`);
    io.emit("skillFlash", { name: "🤝 พันธมิตรยังคงอยู่", img: RIDDHE_BANSHEE_IMG, by: t.name, color: POSITION_COLORS[t.position] || "#9B4F96" });
  } else {
    if ((ask.hp || 0) > 0) healHp(t, ask.hp);
    if ((ask.armor || 0) > 0) healArmor(t, ask.armor);
    lastLog.push(`💔 ${t.name} ยกเลิกพันธมิตร! ฟื้นสิ่งที่เสียไปจากการโดนคู่ตีคืน (เลือด +${ask.hp || 0} เกราะ +${ask.armor || 0})`);
    const r = t.characterId === "riddhe" ? t : (o && o.characterId === "riddhe" ? o : null);
    const b = t.characterId === "banagher" ? t : (o && o.characterId === "banagher" ? o : null);
    CHAR_HOOKS.riddhe.breakAlliance(engine, r, b);
    io.emit("skillFlash", { name: "💔 ยกเลิกพันธมิตร", img: RIDDHE_BANSHEE_IMG, by: t.name, color: POSITION_COLORS[t.position] || "#9B4F96" });
  }
  broadcastState();
  checkAllLocked();
}
// สกิลติดตัว 2 (นายยังมีอนาคตอีกยาวไกล): เหลือแค่คู่พันธมิตรบนสนาม — คงพันธมิตร = จบเกมชนะทั้งคู่ / ยกเลิก = สู้กันต่อ
function answerAllyFinal(id, keep) {
  const r = players[id];
  if (gameState !== "PLAYING" || !r || !r.alive || !r.allyFinalAsk) return;
  r.allyFinalAsk = false;
  const b = riddheAllied(r);
  if (!b) { broadcastState(); return; }
  if (keep) {
    allyWinFlag = true;
    lastLog.push(`🤝👑 ${r.name} และ ${b.name} เลือกยืนหยัดเคียงข้างกันจนถึงที่สุด — ชนะทั้งคู่!`);
    clearPhaseTimer();
    gameState = "GAMEOVER";
    timeLeft = 0;
    broadcastState();
  } else {
    CHAR_HOOKS.riddhe.breakAlliance(engine, r, b);
    io.emit("skillFlash", { name: "💔 ยกเลิกพันธมิตร — การต่อสู้ครั้งสุดท้ายเริ่มขึ้น", img: RIDDHE_BANSHEE_IMG, by: r.name, color: POSITION_COLORS[r.position] || "#9B4F96" });
    broadcastState();
    checkAllLocked();
  }
}
// Bard: รับเป้าหมายบทเพลงที่ประพันธ์เสร็จ (เลือกได้ระหว่างช่วงจั่วการ์ด แม้เปิดไพ่ไปแล้ว)
function bardTarget(id, targets) {
  const p = players[id];
  if (gameState !== "PLAYING" || !p || !p.alive || !p.bardPending) return;
  const song = p.bardPending;
  const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
  const valid = tgs.filter((tid) => {
    const t = players[tid];
    return t && t.alive && (song.allowSelf || tid !== p.id);
  });
  if (valid.length !== song.need) return;
  p.bardPending = null;
  bardPerform(p, song.pattern, valid, true);
  // วีดีโอสวนกลับที่ค้างคิว (Wonder of U ซาโตรุ) — เล่นทันทีช่วงจั่วการ์ด
  if (gameState === "PLAYING" && cutsceneQueue.length) pausePlayingForCutscene();
  broadcastState();
  checkAllLocked();
}
// ไค ชิซากิ (characters/kai.js): กดปุ่ม Overhaul — ต้องมีมาร์กรังสรรค์/ลงทัณฑ์ครบ 2 หน่วยบนกระดานก่อนถึงกดได้
function kaiOverhaul(id) {
  const p = players[id];
  if (!p || !p.alive || p.characterId !== "kai") return;
  if (gameState !== "PLAYING" || p.locked) return;
  const ownSlots = kaiOverhaulSlots.filter((slot) => slot.ownerId === p.id);
  if (ownSlots.length < 2) return;
  const [a, b] = ownSlots.slice(0, 2);
  const holderA = players[a.playerId];
  const holderB = players[b.playerId];
  if (!holderA || !holderA.alive || !holderB || !holderB.alive) return;
  CHAR_HOOKS.kai.resolveOverhaul(engine, holderA, a.status, holderB, b.status, p);
  kaiOverhaulSlots = kaiOverhaulSlots.filter((slot) => slot.ownerId !== p.id);
  for (const player of Object.values(players)) {
    if (player.kaiMarksBy) delete player.kaiMarksBy[p.id];
    for (const statusKey of ["kaiCreation", "kaiPunishment"]) {
      const remaining = Object.values(player.kaiMarksBy || {}).filter((marks) => marks[statusKey]).length;
      if (remaining > 0) player.statuses[statusKey] = 999;
      else {
        delete player.statuses[statusKey];
        if (player.statusAmt) delete player.statusAmt[statusKey];
      }
    }
    if (player.kaiMarksBy && !Object.keys(player.kaiMarksBy).length) delete player.kaiMarksBy;
  }
  p.transformAt = ++transformCounter;
  io.emit("skillFlash", { name: "Overhaul", img: displayImg(p), by: p.name, color: POSITION_COLORS[p.position] || "#9B4F96" });
  broadcastState();
  checkAllLocked();
}
function checkAllLocked() {
  if (gameState !== "PLAYING") return;
  const c = alivePlayers();
  // ยูกิจั่วตอบโต้ได้สูงสุด 1 ใบต่อไพ่ที่มนุษย์จั่ว และยังไม่ล็อกมือจนกว่าจะสรุปรอบ
  if (yuukiReactiveDrawCredits > 0) {
    const drawBudget = yuukiReactiveDrawCredits;
    yuukiReactiveDrawCredits = 0;
    autoPlayYuuki(false, drawBudget);
  }
  // รอคำตอบข้อเสนอ/ต่อสัญญา (เจ้าแห่งเน็ตบ้าน) / เป้าหมายบทเพลง (Bard) ก่อนเปิดไพ่อัตโนมัติ
  //  — หมดเวลาเฟสไพ่ = ถือว่าปฏิเสธ / สุ่มเป้าหมาย
  const pendingAnswer =
    c.some((p) => p.renewPending && CHAR_HOOKS.broadband_man.contractBoss(engine, p)) ||
    c.some((p) => p.contractOffer && players[p.contractOffer] && players[p.contractOffer].alive) ||
    c.some((p) => p.locaOffer && players[p.locaOffer] && players[p.locaOffer].alive) || // Locacaca (ซาโตรุ)
    c.some((p) => p.bardPending) ||
    // ระบบพันธมิตร (ริดดี้ patch 2.0.9): รอเลือก/ตอบข้อเสนอ/ตอบยกเลิกพันธมิตร ก่อนเปิดไพ่อัตโนมัติ
    c.some((p) => p.allyPrompt && c.some((o) => o.id !== p.id && o.characterId === "banagher")) ||
    c.some((p) => p.allyOffer && players[p.allyOffer] && players[p.allyOffer].alive) ||
    c.some((p) => p.allyBreakAsk) ||
    c.some((p) => p.allyFinalAsk) ||
    // คอนเนอร์ RK800: คำขาด "ยอมจำนน / ขัดขืน" ที่ยังไม่ตอบ (ไม่ตอบก่อนเปิดไพ่ = ขัดขืน)
    c.some((p) => p.connorArrestAsk && players[p.connorArrestAsk.fromId] && players[p.connorArrestAsk.fromId].alive) ||
    // QTE ที่ยังเล่นไม่จบ (ยุย: ทำนองเพลงร็อก) — คนอื่นจั่ว/เปิดไพ่ได้ตามปกติ แค่ยังไม่สรุปรอบให้
    qtePending();
  // ถ้าไม่เหลือใครรอดเลย (เช่น ทาคุโตะระเบิดใส่ทุกคนตายหมดรวมถึงตัวเอง) ก็ต้องสรุปผลด้วยเช่นกัน ไม่งั้นเกมค้าง
  const humans = c.filter((p) => !isYuuki(p));
  if (humans.every((p) => p.locked) && !pendingAnswer) resolveRound();
}

// ---------- ย้อนเทิร์น (Overload Force) ----------
// สแนปช็อตสภาพผู้เล่นทั้งหมด ณ "ต้นช่วงจั่วไพ่" ของเทิร์นปัจจุบัน (หลังเอฟเฟกต์ต้นเทิร์นทำงานครบแล้ว)
// ใช้ตอนเกิด Overload Force เพื่อย้อนทุกการกระทำในเทิร์นนั้นทิ้ง — คืนแต้มสกิล/โควตาสกิลที่กดไป/ไอเทม/เหรียญ
// ให้ครบ เพราะ Overload Force แจกไพ่ใหม่ในเทิร์นเดิม ถ้าไม่ย้อน คนที่กดสกิล "หลังเปิดไพ่" จะเสียของฟรี
let turnSnapshot = null;
// ประวัติสแนปช็อตต้นเทิร์นย้อนหลัง — ใช้โดยท่าไม้ตาย "ฝากด้วยนะตัวฉัน" (อิสึกะ ชิโด) ที่ย้อนเวลากลับ 5 เทิร์น
//  โครงสร้างเดียวกับ turnSnapshot ของ Overload Force เป๊ะ แค่เก็บหลายใบเป็นวงแหวนแทนใบเดียว
//  (เก็บ SNAPSHOT_HISTORY_MAX ใบพอ — ลึกกว่าที่ท่าไม้ตายต้องการ 1 ใบ เผื่อกรณีเทิร์นต้นเกม)
const SNAPSHOT_HISTORY_MAX = 6;
let snapshotHistory = [];
function buildSnapshot() {
  return {
    round: roundNumber,
    players: structuredClone(players),
    roundSkills: structuredClone(roundSkills),
    shopItems: structuredClone(shopItems),
    kaiOverhaulSlots: structuredClone(kaiOverhaulSlots),
    g: {
      cycleShift, nightResetPending, oberonDevour, dayForceUntil, transformCounter,
      yunaLongingUsed, yunaWindowEnd, yunaEffect, yunaTargetId, yunaLongingPendingId, yunaPity,
    },
  };
}
// นำสแนปช็อตกลับมาใช้ — โครงเดียวกับ restoreTurnSnapshot() แต่รับใบไหนก็ได้
//  keepPerPlayer: ฟิลด์ที่ "ห้ามย้อน" รายผู้เล่น (นอกเหนือจากข้อมูลการเชื่อมต่อ) เช่นคูลดาวน์ท่าไม้ตายของชิโด
//  ไม่งั้นการย้อนเวลาจะลบข้อมูลว่าเคยใช้ท่านี้ไปแล้ว = ย้อนวนได้ไม่จำกัด
function applySnapshot(snap, keepPerPlayer) {
  if (!snap) return false;
  for (const [id, saved] of Object.entries(snap.players)) {
    const live = players[id];
    if (!live) continue; // ออกจากเกมไปแล้ว — ไม่ปลุกกลับ
    const keep = {
      socketId: live.socketId, connected: live.connected,
      sessionToken: live.sessionToken, ready: live.ready,
    };
    if (typeof keepPerPlayer === "function") Object.assign(keep, keepPerPlayer(live) || {});
    for (const k of Object.keys(live)) delete live[k];
    Object.assign(live, structuredClone(saved), keep);
  }
  roundSkills = snap.roundSkills;
  shopItems = snap.shopItems;
  kaiOverhaulSlots = snap.kaiOverhaulSlots;
  ({
    cycleShift, nightResetPending, oberonDevour, dayForceUntil, transformCounter,
    yunaLongingUsed, yunaWindowEnd, yunaEffect, yunaTargetId, yunaLongingPendingId, yunaPity,
  } = snap.g);
  lastAttack = null;
  return true;
}
function pushSnapshotHistory() {
  try {
    snapshotHistory.push(buildSnapshot());
    while (snapshotHistory.length > SNAPSHOT_HISTORY_MAX) snapshotHistory.shift();
  } catch { /* structuredClone พังด้วยเหตุใดก็ตาม = ข้ามเทิร์นนี้ไป ไม่ใช่เรื่องคอขาดบาดตาย */ }
}
function clearSnapshotHistory() { snapshotHistory = []; }
// สแนปช็อตของ "N เทิร์นก่อนหน้า" — ถ้ายังไม่ลึกพอก็คืนใบเก่าสุดที่มี (ต้นเกมยังย้อนไม่ครบ 5)
function snapshotBefore(turns) {
  if (!snapshotHistory.length) return null;
  const idx = Math.max(0, snapshotHistory.length - 1 - turns);
  return snapshotHistory[idx];
}

function captureTurnSnapshot() {
  try {
    turnSnapshot = {
      players: structuredClone(players),
      roundSkills: structuredClone(roundSkills),
      shopItems: structuredClone(shopItems),
      kaiOverhaulSlots: structuredClone(kaiOverhaulSlots),
      g: {
        cycleShift, nightResetPending, oberonDevour, dayForceUntil, transformCounter,
        yunaLongingUsed, yunaWindowEnd, yunaEffect, yunaTargetId, yunaLongingPendingId, yunaPity,
      },
    };
  } catch { turnSnapshot = null; }
}

function clearTurnSnapshot() { turnSnapshot = null; clearSnapshotHistory(); }

function restoreTurnSnapshot() {
  const snap = turnSnapshot;
  turnSnapshot = null;
  if (!snap) return false;
  for (const [id, saved] of Object.entries(snap.players)) {
    const live = players[id];
    if (!live) continue; // ออกจากเกมไปแล้วระหว่างเทิร์น — ไม่ปลุกกลับ
    // ข้อมูลการเชื่อมต่อเป็นของ "ปัจจุบัน" เสมอ ห้ามย้อน ไม่งั้น reconnect/disconnect กลางเทิร์นจะพัง
    const keep = {
      socketId: live.socketId, connected: live.connected,
      sessionToken: live.sessionToken, ready: live.ready,
    };
    for (const k of Object.keys(live)) delete live[k];
    Object.assign(live, structuredClone(saved), keep);
  }
  roundSkills = snap.roundSkills;
  shopItems = snap.shopItems;
  kaiOverhaulSlots = snap.kaiOverhaulSlots;
  ({
    cycleShift, nightResetPending, oberonDevour, dayForceUntil, transformCounter,
    yunaLongingUsed, yunaWindowEnd, yunaEffect, yunaTargetId, yunaLongingPendingId, yunaPity,
  } = snap.g);
  lastAttack = null;
  return true;
}

function beginOverloadForceDraw() {
  centralDeck = buildCentralDeck();
  roundWinnerId = null;
  roundTiedWin = false;
  doomTieAttack = false;
  anataMusicSeq = 0;

  for (const p of Object.values(players)) {
    if (!p.alive) {
      p.cards = [];
      p.locked = true;
      p.busted = false;
      p.overloadDrawReady = false;
      continue;
    }
    p.cards = [];
    p.cardBonus = 0;
    p.colorTrigger = { red: 0, blue: 0, green: 0, yellow: 0 };
    p.statusAmt.cardAtkBonus = 0;
    delete p.statuses.freecast; // ไพ่ Queen จากมือเดิมถูกย้อนทิ้งไปพร้อมไพ่
    resetOverloadDrawCounter(p, false);
    const initial = drawInitialCard(p);
    if (initial) {
      p.cards.push(initial);
      onCardDrawn(p, initial);
    }
    p.overloadDrawReady = true;
    p.locked = (p.statuses.sleep || 0) > 0 || (p.statuses.stun || 0) > 0;
    p.busted = false;
    p.result = null;
    p.isWinner = false;
    p.isLoser = false;
  }

  lastLog.push("⚡ Overload Force เริ่มทำงาน — แจกไพ่ใหม่ในเทิร์นเดิม ปลดเพดาน 21 แต้ม!");
  gameState = "PLAYING";
  startPhaseTimer(cardPhaseSeconds(), resolveRound);
  broadcastState();
  checkAllLocked();
}

function triggerOverloadForce() {
  overloadForceCount++;
  overloadForceActive = true;
  overloadForceSeq++;
  // ย้อนทุกการกระทำในเทิร์นนี้ก่อนแจกไพ่ใหม่ — สกิลที่กดไป/แต้มสกิล/ไอเทม/เหรียญ ได้คืนทั้งหมด
  //  (บั๊กเดิม: สกิลที่ทำงาน "หลังเปิดไพ่" ถูกล้างทิ้งพร้อมมือไพ่ เจ้าของเสียแต้มกับสกิลไปฟรีๆ)
  if (restoreTurnSnapshot()) {
    lastLog.push("↩️ Overload Force ย้อนเวลาเทิร์นนี้กลับไปก่อนทุกการกระทำ — แต้มสกิล สกิลที่ใช้ และไอเทมถูกคืนทั้งหมด");
  }
  // ยูกิ Overload เกิดได้เฉพาะโหมด Over Load เท่านั้น — ffa/duo/trio ไม่มีทางเจอบอส
  if (gameMode === "overload" && overloadForceCount === 3 && !yuukiSpawned) {
    createYuukiBoss();
    yuukiTurns = 1;
    cutsceneQueue = [];
    queueYuukiCutscene(YUUKI_VIDEO.spawn, "ยูกิ Overload", 9, "yuukiSpawn");
    lastLog.push("⚡ Overload Force ครั้งที่ 3 ถูกแทนที่ — ยูกิ Overload ปรากฏตัว!");
    runCutsceneQueue(beginOverloadForceDraw);
    return;
  }
  cutsceneQueue = [{
    info: {
      kind: "overloadForce",
      video: "/overload_force/overload_force_start.mp4",
      title: "OVERLOAD FORCE",
    },
    seconds: OVERLOAD_FORCE_CUTSCENE_SECONDS,
  }];
  lastLog.push(`⚡ คะแนนสูงสุดเสมอกัน — Overload Force ทำงาน (${Math.round(OVERLOAD_FORCE_CHANCE * 100)}%)!`);
  runCutsceneQueue(beginOverloadForceDraw);
}

// ---- สรุปผล ----
function resolveRound() {
  clearPhaseTimer();
  for (const p of alivePlayers()) p.locked = true;
  anataMusicSeq = 0; // เพลง ANATA WAAAAAAAA จบลงเมื่อทุกคนพร้อมเปิดไพ่แล้ว

  // ข้อเสนอ/คำถามต่อสัญญา (เจ้าแห่งเน็ตบ้าน) ที่ยังไม่ตอบเมื่อถึงเวลาเปิดไพ่ = ถือว่าปฏิเสธ
  for (const p of Object.values(players)) {
    if (p.contractOffer) {
      if (p.alive) resolveOffer(p, players[p.contractOffer], false, true);
      else p.contractOffer = null;
    }
    if (p.renewPending) {
      if (p.alive) resolveRenew(p, false, true);
      else p.renewPending = false;
    }
    // Locacaca fruit (ซาโตรุ): ไม่ตอบก่อนเปิดไพ่ = ถือว่าปฏิเสธ
    if (p.locaOffer) {
      if (p.alive) resolveLoca(p, players[p.locaOffer], false, true);
      else p.locaOffer = null;
    }
    // แบทแมน: นายลืมของน่ะ — ยังไม่เลือกเป้าหมายส่งต่อก่อนเปิดไพ่รอบถัดไป = สุ่มให้
    if (p.batKarmaAsk) {
      const ask = p.batKarmaAsk;
      p.batKarmaAsk = null;
      const options = ask.options.map((id) => players[id]).filter((o) => o && o.alive);
      const target = options.length ? options[Math.floor(Math.random() * options.length)] : null;
      withEffectSource(p, () => CHAR_HOOKS.bat_ben.resolveKarmaSend(engine, p, target, ask.dmg));
    }
    // ริต้า เบอร์นัล: ขอแค่ได้พบกันอีก — ยังไม่เลือกเป้าหมายก่อนเปิดไพ่รอบถัดไป = สุ่มให้
    if (p.phenexReleaseAsk) {
      const ask = p.phenexReleaseAsk;
      p.phenexReleaseAsk = null;
      const options = ask.options.map((id) => players[id]).filter((o) => o && o.alive);
      const target = options.length ? options[Math.floor(Math.random() * options.length)] : null;
      withEffectSource(p, () => CHAR_HOOKS.phenex.resolveRelease(engine, p, target, ask.pain));
    }
    // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9): คำถามพันธมิตรที่ยังไม่ตอบเมื่อถึงเวลาเปิดไพ่ ----------
    if (p.allyPrompt) {
      p.allyPrompt = false;
      if (p.alive) lastLog.push(`🤖 ${p.name} ไม่ตัดสินใจ — เดินเส้นทางเดี่ยว`);
    }
    if (p.allyOffer) {
      if (p.alive) resolveAllyOffer(p, players[p.allyOffer], false, true);
      else p.allyOffer = null;
    }
    if (p.allyBreakAsk) {
      if (p.alive) lastLog.push(`🤝 ${p.name} ไม่ตอบ — คงพันธมิตรต่อไป`);
      p.allyBreakAsk = null;
    }
    // คอนเนอร์ RK800: ไม่ตอบคำขาดจับกุมก่อนเปิดไพ่ = ถือว่า "ขัดขืน" (การนิ่งเฉยไม่ใช่การยอมจำนน)
    //  live = false -> วีดีโอเริ่มไล่ล่าเข้าคิวไว้เฉยๆ ให้ afterResolve กวาดไปเล่น (ห้าม pausePlayingForCutscene ตอนนี้)
    if (p.connorArrestAsk) {
      if (p.alive) CHAR_HOOKS.conner.answerArrest(engine, p, false, false);
      else p.connorArrestAsk = null;
    }
    p.allyFinalAsk = false; // ไม่ตอบ = ยังไม่ตัดสินใจ (จะถูกถามใหม่ตอนจบเทิร์นถ้ายังเหลือแค่คู่พันธมิตร)
  }
  // QTE ที่ยังเล่นไม่จบเมื่อถึงเวลาเปิดไพ่ = ถือว่าพลาด (แต้มเสียฟรี) เหมือนข้อเสนออื่นที่ไม่ตอบ
  sweepQte();

  // Bard: บทเพลงที่ยังไม่ได้เลือกเป้าหมายเมื่อถึงเวลาเปิดไพ่ = สุ่มเป้าหมายอัตโนมัติ (บทเพลงไม่สูญเปล่า)
  for (const p of alivePlayers()) {
    if (!p.bardPending) continue;
    const song = p.bardPending;
    p.bardPending = null;
    const pool = alivePlayers().filter((o) => song.allowSelf || o.id !== p.id);
    const picked = [];
    while (picked.length < song.need && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
    }
    if (picked.length === song.need) {
      lastLog.push(`🎼 ${p.name} ไม่ได้เลือกเป้าหมาย ${song.name} — บทเพลงเลือกเป้าหมายเอง`);
      bardPerform(p, song.pattern, picked, false);
    }
  }

  // ANATA WAAAAAAAA (เทมาริ): เปิดเผยเป้าหมาย + บังคับจั่วเพิ่ม 2 ใบหลังเปิดไพ่
  // ทำงานก่อนท่าไม้ตายอื่นเสมอ — ถ้าเป้าหมายแตกจากการบังคับจั่ว ท่าไม้ตายที่เพิ่งกดจะเป็นโมฆะ
  const anataProcs = [];
  for (const u of alivePlayers()) {
    if (!u.anataTargets || !u.anataTargets.length) continue;
    if (bustedOf(u)) { u.anataTargets = null; continue; } // ผู้ใช้แตกเอง (โมฆะไปแล้วใน voidUltimateOnBust)
    for (const tid of u.anataTargets) {
      const t = players[tid];
      if (!t || !t.alive) continue;
      for (let i = 0; i < TEMARI_ANATA_DRAWS; i++) { const c = drawCardFor(t); if (c) { t.cards.push(c); onCardDrawn(t, c); } } // patch 2.0.6: จั่วเพิ่ม 3 ใบ
      t.busted = bustedOf(t);
      lastLog.push(`🎤 ANATA WAAAAAAAA! ${u.name} บังคับ ${t.name} จั่วเพิ่ม ${TEMARI_ANATA_DRAWS} ใบ${t.busted ? " — ไพ่แตก!" : ""}`);
      if (t.busted) { voidUltimateOnBust(t); maybeMoonBurst(t); }
      anataProcs.push({ u, t });
    }
    u.anataTargets = null;
  }

  // ฟุจิตะ โคโตเนะ (characters/kotone.js): ท่าไม้ตายในร่าง [พร้อมลุย] — ทำงานหลังเปิดไพ่ แต่ต้องอยู่ "ก่อน"
  //  การหาผู้ชนะ เพราะผล "บังคับแตก" เปลี่ยนผู้ชนะของรอบนี้ (เหตุผลเดียวกับ ANATA ด้านบน)
  CHAR_HOOKS.kotone.resolveFormUlts(engine);

  // อาจารย์ ไบเลธ หลักสูตร "พิเศษ" (characters/byleth.js): ลงโทษคนที่กดท่าไม้ตาย/สกิลพื้นฐานในเทิร์นนี้
  //  อยู่ก่อนการหาผู้ชนะเพราะความเสียหาย 1 หน่วยอาจทำให้มีคนตกรอบก่อนสรุปผล (เหตุผลเดียวกับ ANATA/โคโตเนะ)
  CHAR_HOOKS.byleth.applyExPunish(engine);

  // ตอนสรุปรอบยูกิจั่วแก้มือได้อีกไม่เกิน 2 ใบ แล้วจึงล็อกมือ
  yuukiReactiveDrawCredits = 0;
  autoPlayYuuki(true, 2);

  // ---------- คอนเนอร์ RK800 (สกิลติดตัว 2 จับกุมขั้นเด็ดขาด, characters/conner.js) ----------
  //  ระหว่างการไล่ล่า: ไม่มีผู้ชนะ/ผู้แพ้ ไม่มีดาเมจแพ้จั่ว/ไพ่แตก ไม่มี Overload Force — นับแค่แต้มดวลกัน
  //  (roundWinnerId ค้างเป็น null -> afterSummary จะข้ามเฟสโจมตีให้เองอยู่แล้ว แต่ยังกันซ้ำอีกชั้นที่นั่น)
  if (CHAR_HOOKS.conner.chaseResolveRound(engine)) {
    roundWinnerId = null;
    roundTiedWin = false;
    // ข้าม afterResolve() ทั้งก้อนโดยตั้งใจ — เอฟเฟกต์หลังเปิดไพ่ที่ยิงใส่ "คนที่ไพ่แตก" (Ashen Trail ของโอกูริ,
    //  ถึงจะมองไม่เห็นฯ ของทาคุมิ ฯลฯ) จะกวาดโดนคนที่ถูกแช่ไว้ ทั้งที่กติกาไล่ล่าระบุว่าพวกเขาไม่รับความเสียหาย
    //  จากการถูกบังคับให้ไพ่แตก -> ไปสรุปผลตรงๆ หลังเล่นคลิปที่คิวไว้จบ
    runCutsceneQueue(goSummary);
    return;
  }

  const combatants = alivePlayers();
  roundWinnerId = null;

  if (combatants.length < 2) {
    lastLog.push("รอบนี้ไม่มีการต่อสู้ (ผู้เล่นไม่พอ)");
    afterResolve();
    return;
  }

  const val = (p) => (bustedOf(p) ? -1 : scoreOf(p));
  const best = Math.max(...combatants.map(val));
  const worst = Math.min(...combatants.map(val));

  if (best >= 0) {
    const tied = combatants.filter((p) => val(p) === best);
    // สนาม Overload ต้องสุ่มก่อน Rip and Tear ของ DoomGuy เสมอ และเกิดได้เฉพาะตอนแต้มสูงสุดเสมอกันจริง
    if (!overloadForceActive && !CHAR_HOOKS.muimi.blocksOverloadForce(engine) && tied.length >= 2 && Math.random() < OVERLOAD_FORCE_CHANCE) {
      triggerOverloadForce();
      return;
    }
    // DoomGuy (characters/doomguy.js) สกิลติดตัว: เสมอแต้มกับผู้เล่นอื่น -> โรล DOOM_TIE_ATTACK_CHANCE
    //  "ก่อน" สุ่มผู้ชนะ ติดแล้วได้เป็นผู้ชนะและได้เทิร์นโจมตีทันที
    //  บั๊กเดิม (แก้ที่นี่): โรลนี้เคยอยู่ใน afterSummary() ซึ่งทำงานหลังสุ่มผู้ชนะไปแล้ว และเช็คเฉพาะคนที่
    //  ถูกสุ่มได้เท่านั้น -> ถ้าดูมกายเสมอแต่ไม่ถูกสุ่ม ก็ไม่ได้โรลเลย ทำให้โอกาสจริงถูกหารด้วยจำนวนคนที่เสมอ
    //  (เสมอหลายคนยังโรลรายตัว แต่โอกาสต่อ DoomGuy ต้องอิง DOOM_TIE_ATTACK_CHANCE ตามคำอธิบายสกิล)
    let w = null;
    if (tied.length > 1) {
      for (const d of tied.filter((p) => p.characterId === "doomguy")) {
        if (CHAR_HOOKS.doomguy.tryTieAttack(engine, d)) { w = d; doomTieAttack = true; break; }
      }
    }
    if (!w) w = tied[Math.floor(Math.random() * tied.length)];
    roundWinnerId = w.id;
    roundTiedWin = tied.length > 1; // เสมอแต้มกัน -> ยังได้แต้มสกิล/ท่าไม้ตายทำงานปกติ แต่ไม่มีเทิร์นโจมตี
    w.isWinner = true;
    w.result = "win";
    // เทเปา (characters/tepeu.js): รีเซ็ตเคาน์เตอร์แพ้ติดกัน + สมองอันชาญฉลาด
    CHAR_HOOKS.tepeu.onRoundWin(engine, w, combatants);
    // อาจารย์ ไบเลธ หลักสูตร "มาตราฐาน": ผู้ชนะติดสตั้น 1 เทิร์นในเทิร์นหน้า (ยกเว้นตัวไบเลธเอง)
    CHAR_HOOKS.byleth.onRoundWinner(engine, w);
    // คอนเนอร์ RK800 (สกิลติดตัว 1 สืบสวน): การชนะการจั่ว = ความเครียด +1
    CHAR_HOOKS.conner.onRoundWin(engine, w);
    // ระบบเหรียญ (patch 2.2 full): ชนะการจั่วได้เหรียญเพิ่ม +1 (เพดาน 30)
    if (!isYuuki(w)) addGold(w, GOLD_WIN_BONUS);
    // patch 2.1.3.5: ชนะจั่วการ์ดไม่ได้แต้มสกิลอีกต่อไป
    firePassive(w, "win");
    if (tied.length > 1) {
      if (doomTieAttack) lastLog.push(`เสมอที่ ${best} แต้ม — ${w.name} สกิลติดตัว Rip and Tear ทำงาน (โอกาส ${Math.round(DOOM_TIE_ATTACK_CHANCE * 100)}%) ได้เป็นผู้ชนะและยังได้โจมตี!`);
      else lastLog.push(`เสมอที่ ${best} แต้ม — สุ่มผู้ชนะได้ ${w.name} (เสมอ ไม่มีเทิร์นโจมตี)`);
    }
  }

  // ---------- อาจารย์ ไบเลธ หลักสูตร "จบการศึกษา": ปลดล็อกการโจมตีตอบหลังผู้ชนะตี ----------
  //  เงื่อนไขคือ "ไบเลธแต้มน้อยสุดของเทิร์นแบบไพ่ไม่แตก" ซึ่ง **ไม่ใช่ชุดเดียวกับ "ผู้แพ้ของเทิร์น"**
  //  บั๊กเดิม: มาร์กนี้ถูกวางไว้ในลูปผู้แพ้ซึ่งกรองด้วย val(p) === worst — แต่ val() ให้คนไพ่แตกเป็น -1
  //  ทำให้ worst = -1 ทันทีที่มีใครไพ่แตกแม้แต่คนเดียว ลูปนั้นจึงเหลือแต่คนไพ่แตก และเงื่อนไข
  //  !bustedOf(l) ที่คร่อมไว้ก็เป็นเท็จเสมอ = ไบเลธไม่เคยถูกมาร์กเลยทุกเทิร์นที่มีคนไพ่แตก
  //  (ผลคือ "ตีตอบ" แทบไม่ทำงานจริงในเกม) -> คิดจากกลุ่ม "ไพ่ไม่แตก" แยกออกมาต่างหาก
  {
    const unbusted = combatants.filter((p) => !bustedOf(p));
    if (unbusted.length > 1) {
      const lowest = Math.min(...unbusted.map((p) => scoreOf(p)));
      for (const l of unbusted) {
        if (l.characterId !== "byleth" || l.id === roundWinnerId) continue;
        if (scoreOf(l) === lowest) CHAR_HOOKS.byleth.markLowestScore(engine, l); // เสมอที่แต้มน้อยสุดก็นับ
      }
    }
  }

  if (best !== worst) {
    for (const l of combatants.filter((p) => val(p) === worst && p.id !== roundWinnerId)) {
      l.isLoser = true;
      l.result = "lose";
      // อาจารย์ ไบเลธ หลักสูตร "มาตราฐาน": ผู้แพ้ได้แต้มสกิลฟื้นเพิ่มอีก 1 หน่วย (มีผลกับทุกคน)
      CHAR_HOOKS.byleth.onRoundLoser(engine, l);
      if (sealActive(l)) {
        // เรจูอาคมบัญชา (อมตะ): ไม่รับความเสียหายใดๆ เทิร์นนี้
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`📜 ${l.name} อาคมบัญชาคุ้มครอง — ไม่รับความเสียหายจากการแพ้`);
        continue;
      }
      if (l.beatSaved) {
        // หลังกันตายทำงานแล้ว: ความเสียหายจากการแพ้ตอนจั่วการ์ดไม่มีผล ไม่ว่าห่าง 21 แค่ไหน
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`⚡ ${l.name} ประกายเขี้ยวปฏิปักษ์ — ไม่รับความเสียหายจากการแพ้`);
        continue;
      }
      if ((l.statuses.monster || 0) > 0) {
        // ร่างไคจู (MonsterLive): แพ้เพราะแต้มน้อยสุด/ไพ่แตก รับความเสียหายน้อยลง 1 หน่วย (1 -> 0)
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`🦖 ${l.name} ร่างไคจู — ไม่รับความเสียหายจากการแพ้`);
        continue;
      }
      if (bustedOf(l) && CHAR_HOOKS.byleth.bustDamageImmune(engine, l)) {
        // อาจารย์ ไบเลธ หลักสูตร "มาตราฐาน": คนที่ไพ่แตกไม่รับความเสียหายจากการที่แต้มเกิน 21 (ยังได้แต้มสกิลตามปกติ)
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`📗 ${l.name} หลักสูตร มาตราฐาน — ไม่รับความเสียหายจากการที่ไพ่แตก`);
        continue;
      }
      if (bustedOf(l) && CHAR_HOOKS.haruka.bustDamageImmune(l)) {
        // New Omega (ฮารุกะ): โดนบังคับให้ไพ่แตก จึงไม่รับความเสียหายจากการแตกครั้งนี้ (ยังได้แต้มสกิลปกติ)
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`💥 ${l.name} โดน New Omega ระเบิดแต้มการ์ด — ไม่รับความเสียหายจากการที่ไพ่แตก`);
        continue;
      }
      if (bustedOf(l) && CHAR_HOOKS.escanor.bustDamageImmune(l)) {
        // เอสคานอร์ร่าง Last Stand: ไม่รับความเสียหายจากการที่ไพ่แตก (ยังได้แต้มสกิลจากการแพ้ตามปกติ)
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`🔥 ${l.name} Last Stand — ไม่รับความเสียหายจากการที่ไพ่แตก`);
        continue;
      }
      if (CHAR_HOOKS.eva13.isLossImmune(engine, l)) {
        // สกิลติดตัว 2 เอวา 13 (ทุกอย่างไร้ความหมาย): ไม่รับดาเมจแพ้จั่ว/แตก
        //  — นอก fourth impact ทำงานเสมอ ยกเว้นสกิลติดตัว 3 (เลือด <= 3) ทำงานอยู่ | fourth impact = บังคับทำงาน
        addSkill(l, 1);
        firePassive(l, "lose");
        lastLog.push(`🌑 ${l.name} ทุกอย่างไร้ความหมาย — ไม่รับความเสียหายจากการแพ้`);
        continue;
      }
      const armorBefore = l.armor;
      let lossDmg = 1;
      // เต็มอิ่ม (Breakfast โอกูริ patch 2.0.8.1): ดาเมจที่ได้รับ -1 (รวมดาเมจแพ้จั่ว/แตก)
      if ((l.statuses.fullbelly || 0) > 0 && lossDmg > 0) {
        lossDmg = Math.max(0, lossDmg - 1);
        lastLog.push(`🥖 ${l.name} เต็มอิ่ม — ดาเมจจากการแพ้ลดลง 1`);
      }
      for (let i = 0; i < lossDmg; i++) damageSoft(l);
      // Absorb shield (บานาจ) / Absorb Shield (ริดดี้): ผู้แพ้เสียเกราะ -> แปลงเกราะที่เสียกลับเป็นพลังชีวิต
      const armorLost = armorBefore - l.armor;
      if (((l.statuses.absorb || 0) > 0 || (l.statuses.absorbplus || 0) > 0) && armorLost > 0) {
        const heal = healHp(l, armorLost);
        if (heal > 0) lastLog.push(`🛡️ ${l.name} Absorb shield แปลงเกราะที่เสีย ${armorLost} → พลังชีวิต +${heal}`);
      }
      // Beat Mode กันตาย: ทำงานทันทีแม้ความเสียหายถึงตายมาจากการแพ้จั่ว/แตก
      maybeBeatSave(l);
      addSkill(l, 1); // โดนความเสียหายเพราะแต้มห่างจาก 21 มากที่สุด +1
      CHAR_HOOKS.mageslayer.onBustOrLoseRoll(engine, l);
      firePassive(l, "lose");
      lastLog.push(`${l.name} แต้มน้อยสุด รับความเสียหาย -${lossDmg}`);
    }
  }
  for (const p of combatants) if (!p.result) p.result = "safe";
  // มุยมิ: นับแพ้/ไพ่แตกต่อเนื่องหลังผลของทุกคนถูกกำหนดครบแล้ว
  CHAR_HOOKS.muimi.onAfterRoundScores(engine, combatants);
  CHAR_HOOKS.hisakawa_sister.onAfterRoundScores(engine, combatants, roundWinnerId, val);

  // เทเปา (characters/tepeu.js): มีเทเปายังอยู่ในสนาม -> ใครแพ้ติดกันเกิน 3 เทิร์น เส้นชีวิตลดลง 1 หน่วย
  CHAR_HOOKS.tepeu.onRoundLoseStreak(engine, combatants);

  // สกิลติดตัว เนตรมารแห่งความมรณะ (ชิกิ, characters/shiki.js): เปิดไพ่แล้วแต้มเท่ากับผู้เล่นอื่น -> ติดเส้นชีวิตถาวร
  CHAR_HOOKS.shiki.onScoreTiePassive(engine, combatants);

  // สกิลติดตัว หิวอะโปรดิวเซอร์ (เทมาริ patch 1.7.6): เป้าหมาย ANATA WAAAAAAAA แพ้หรือไพ่แตก
  // -> โดนขิงจนช้ำ รับความเสียหายตามโบนัส Song for you เท่านั้น (ไม่นับพลังโจมตีปกติ — สูงสุด 2)
  // ต่อให้เทมาริไม่ชนะ/แพ้ในตานั้นก็ตาม — และฉากของสกิลนี้ขึ้นก่อนทุกท่าไม้ตาย
  let anataFinalShown = false;
  for (const { u, t } of anataProcs) {
    if (!t.alive || !(bustedOf(t) || t.isLoser)) continue;
    let dmg = songActive(u) ? (u.songAtk || 0) : 0;
    dealDirect(t, dmg); // patch 2.0.6: การขิงทำดาเมจแบบไม่สนเกราะ
    maybeBeatSave(t); // กันตายทำงานทันทีถ้าโดนขิงจนถึงตาย
    t.wasAttacked = true;
    addSkill(t, 1);
    lastLog.push(`🎤 หิวอะโปรดิวเซอร์! ${t.name} โดนขิงจนช้ำ -${dmg}`);
    if (!anataFinalShown) {
      anataFinalShown = true;
      triggerCutscene(u, "anataFinal"); // เข้าคิวก่อน afterResolve -> ขึ้นก่อนท่าไม้ตายอื่นเสมอ
    }
  }

  // สกิลติดตัว 1 เอวา 13: เลือดหมดตั้งแต่ช่วงสรุปผล (แพ้จั่ว/แตก/โดนขิง) ขณะ Fourth Impact ยังอยู่
  //  -> ตกรอบและระเบิดทันที ไม่ต้องรอจบเทิร์น (เลือดเหลือ 0 แล้ว ไม่ควรรอโดนตีอีกรอบ)
  for (const e of combatants) {
    if (!(e.alive && e.hp <= 0 && e.characterId === "eva13" && (e.statuses.fourth || 0) > 0)) continue;
    instantDeath(e);
    if (!e.alive) lastLog.push(`💀 ${e.name} เลือดจริงหมด ตกรอบ!`);
    lastLog.push(`💥 ${e.name} ไม่สามารถแก้ไขอะไรได้อีกแล้ว — ทุกสิ่งทุกอย่างไร้ความหมาย! ระเบิดใส่ทุกคน -${EVA_BLAST_DMG}`);
    for (const o of alivePlayers()) {
      if (o.id === e.id) continue;
      if (!evaBlastEvade(o, e)) dealMixed(o, EVA_BLAST_DMG);
      maybeBeatSave(o);
      maybeBeatMode(o);
      maybeEva3(o);
      maybeWakeKotone(o);
      o.wasAttacked = true;
    }
    triggerCutscene(e, "evaboom");
    // คนที่โดนแรงระเบิดจนเลือดหมด ตกรอบทันทีเช่นกัน
    for (const o of Object.values(players)) {
      if (o.alive && o.hp <= 0) {
        instantDeath(o);
        if (!o.alive) lastLog.push(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
  }

  afterResolve();
}

// เปิดร่างท่าไม้ตาย (หลังเปิดไพ่) -> cutscene ก่อนสรุปผล (สรุปผลไว้ท้ายสุดเสมอ)
//  หมายเหตุ: สกิลทั่วไปไม่มีแบนเนอร์ก่อนสรุปผลแล้ว — instant เด้งตอนใช้ / หลังเปิดไพ่ไปโชว์ตอนโจมตี
function afterResolve() {
  // ---------- เทเปา (characters/tepeu.js): นายเป็นคนทำตัวเองนะ — ผลสังหาร/พลาดทำงานหลังเปิดไพ่ทุกคน ----------
  CHAR_HOOKS.tepeu.resolveAllKills(engine);
  // ---------- Ashen Trail: Cinderella Gray (โอกูริ, characters/oguri.js): หลังเปิดไพ่ — โจมตีทุกคนที่ไพ่แตก ----------
  CHAR_HOOKS.oguri.onAfterResolveAshenTrail(engine);
  CHAR_HOOKS.escanor.onAfterResolve(engine);
  // ---------- ทาคุมิ ฟุจิวาระ (characters/takumi.js): ถึงจะมองไม่เห็น แต่ฉันยังอยู่ — คนแรกที่ไพ่แตกระหว่างบัฟยังทำงาน ----------
  CHAR_HOOKS.takumi.tryBustTrigger(engine);
  // ---------- โมโรโบชิ ดัน (characters/dan.js): "จงหลบแต่อย่าหนี" ลงโทษเป้าหมาย + ครูฝึกสุดเหี้ยมกวาดคนไพ่แตก ----------
  //  ต้องอยู่หลังเอฟเฟกต์ที่กวาดคนไพ่แตกตัวอื่น เพื่อให้ผลบวก 1 หน่วยของสกิลติดตัวเป็นชั้นสุดท้ายเสมอ
  CHAR_HOOKS.dan.onAfterResolve(engine);
  // ---------- ยุย (characters/yui.js): my soul your beats — ไพ่แตกกลางจังหวะเพลงรับความเสียหาย ----------
  CHAR_HOOKS.yui.onAfterResolve(engine);
  // ---------- แบทแมน (characters/bat_ben.js): แกไม่รอดแน่ — พุ่งชนคนที่ไพ่แตก ----------
  CHAR_HOOKS.bat_ben.onAfterResolve(engine);

  const activated = [];
  for (const p of alivePlayers()) {
    const pBusted = bustedOf(p); // ไพ่แตก = ท่าไม้ตายไม่ทำงาน (กันหลุดกรณีเพิ่งกดแล้วแตก)
    for (const key of Object.keys(TRANSFORMS)) {
      if (!TRANSFORMS[key].afterReveal) continue;
      if (pBusted) continue;
      if ((p.statuses[key] || 0) > 0 && !p.seen[key]) {
        p.seen[key] = true;
        p.transformAt = ++transformCounter;
        // สวมเกราะราชัน: เพิ่มแค่เพดานเกราะ +3 (ไม่ฟื้นเกราะให้ — เกราะที่มีคงเดิม รอฟื้นฟูเองต้นรอบ)
        // Lai Rhyme Goodfellow (โอเบรอน, characters/oberon.js) — Lie Like Vortigern ย้ายไปทำงานทันทีก่อนเปิดการ์ดแล้ว (ดู useSkill()'s st === "vortigern")
        if (key === "lai") CHAR_HOOKS.oberon.applyLaiEffect(engine, p);
        {
          const firstTime = !p.cutsceneShown[key];
          triggerCutscene(p, key);
          // ครั้งแรก (เล่นวีดีโอ): ต่อด้วยฉากประกาศเปลี่ยนร่าง (ระเบิด + เสียงพากย์) ก่อนขึ้นคนอื่น/สรุปผล
          if (firstTime && key === "rachan") queueTransformAnnounce(p, "rachan");
        }
        lastLog.push(`✨ ${p.name} ${TRANSFORMS[key].label} ${TRANSFORMS[key].title}!`);
        activated.push(p);
      }
    }
  }
  // สวนท่าไม้ตายกัน: เอาเพลงของผู้ชนะ (ถ้าไม่มีผู้ชนะ = คนที่เปิดหลังสุด ซึ่ง transformAt สูงสุดอยู่แล้ว)
  if (activated.length > 1) {
    const winner = activated.find((p) => p.id === roundWinnerId);
    if (winner) winner.transformAt = ++transformCounter;
  }
  // Beat Mode: ถ้าใครเลือดตกต่ำกว่า 3 จากการแพ้รอบนี้ -> เข้าประกายเขี้ยวปฏิปักษ์
  for (const p of alivePlayers()) maybeBeatMode(p);
  // สกิลติดตัว 3 เอวา 13: เลือดตกถึง <= 3 -> อย่าให้ฉันทำแแบบนี้เลย
  for (const p of alivePlayers()) maybeEva3(p);
  runCutsceneQueue(goSummary);
}

function goSummary() {
  gameState = "SUMMARY";
  startPhaseTimer(SUMMARY_TIME, afterSummary);
  broadcastState();
}

// ---- โจมตี ----
// เรจูอาคมบัญชา (อมตะ): ไม่ถูกเลือกเป็นเป้าโจมตีตลอดเทิร์น
// ---------- เอฟเฟกต์ gif ทับไอคอนผู้เล่น (ระบบใหม่ patch 3.4 — ผู้วิงวอน) ----------
//  ต่างจาก cutscene ตรงที่ "ไม่หยุดเกม": ยิงเป็น event ให้ client วาด gif ทับการ์ดของผู้เล่นคนนั้นแล้วหายไปเอง
//  ทุกคนเห็นเหมือนกัน (เป็นข้อมูลสนาม) — client จัดคิว/ตั้งเวลาเองจาก ms ที่ส่งไป (ดู IconFxLayer ใน Game.jsx)
function iconFx(target, kind) {
  const fx = CHAR_HOOKS.the_supplicant.FX[kind];
  if (!target || !fx) return;
  io.emit("iconFx", { targetId: target.id, kind, gif: fx.gif, sound: fx.sound, ms: fx.ms, seq: ++iconFxSeq });
}
let iconFxSeq = 0;

function attackableTargets(atkId) {
  const attacker = players[atkId];
  // ผู้วิงวอน (patch 3.4): คนที่ติด "ลูกแกะน้อยรู้แจ้ง" เล็งผู้วิงวอนไม่ได้เลย — กรองออกจากรายชื่อเป้าหมายตั้งแต่ต้นทาง
  return alivePlayers().filter((p) => p.id !== atkId && !sameTeam(attacker, p) && !sealActive(p)
    && !CHAR_HOOKS.the_supplicant.targetBlocked(attacker, p));
}
function afterSummary() {
  // คอนเนอร์ RK800 (สกิลติดตัว 2): ระหว่างการไล่ล่า ทุกเทิร์นเหลือแค่ จั่ว -> สรุปแต้ม ไม่มีเฟสโจมตีเลย
  if (CHAR_HOOKS.conner.chaseActive(engine)) { endTurn(); return; }
  const winner = players[roundWinnerId];
  // หลับไหล (Lie Like Vortigern): ผู้ชนะที่ยังหลับอยู่ ออกการกระทำไม่ได้ -> ไม่มีเทิร์นโจมตี
  //  (เทิร์นที่เพิ่งโดนกล่อม sleepFresh ยังโจมตีได้ — การหลับเริ่มเทิร์นถัดไป)
  if (winner && winner.alive && (winner.statuses.sleep || 0) > 0 && !winner.sleepFresh) {
    lastLog.push(`💤 ${winner.name} ยังหลับไหลอยู่ — ไม่มีเทิร์นโจมตี`);
    endTurn();
    return;
  }
  // โคโตเนะ: หลับพักผ่อน (Sleeping time) / สตั้นจากโหมงานหนัก / หนีท่านประธานเซนะ — ไม่มีเทิร์นโจมตี
  if (winner && winner.alive && (
    (winner.statuses.ksleep || 0) > 0 ||
    (winner.statuses.stun || 0) > 0 || // สตั้น (สถานะพื้นฐาน patch 2.0.8) — รวม kstun (โคโตเนะ [โหมงานหนัก]) เข้ามาแล้ว
    (winner.statuses.riddheguard || 0) > 0 // ฉันจะไม่ยอมสูญเสียใครไปอีก (ริดดี้): แม้ชนะการจั่วก็ตีไม่ได้
  )) {
    lastLog.push(`💤 ${winner.name} ไม่อยู่ในสภาพจะโจมตีใคร — ไม่มีเทิร์นโจมตี`);
    endTurn();
    return;
  }

  // อาจารย์ ไบเลธ หลักสูตร "พิเศษ" (characters/byleth.js): คนที่กดสกิลรองในเทิร์นนี้จะโจมตีไม่ได้
  if (winner && winner.alive && CHAR_HOOKS.byleth.blocksAttack(engine, winner)) {
    lastLog.push(`📕 ${winner.name} กดสกิลรองระหว่าง "หลักสูตร พิเศษ" — ไม่มีเทิร์นโจมตี`);
    endTurn();
    return;
  }

  // แบทแมน (characters/bat_ben.js): ระหว่างเร้นเงา ออกจากเงามืดมาโจมตีไม่ได้
  // เจ้าหญิงราก (characters/princess_shiki.js): สกิลติดตัว — โจมตีปกติไม่ได้เลย เว้นแต่ติด "ชักดาบ"
  if (winner && winner.alive && CHAR_HOOKS.princess_shiki.cannotAttack(winner)) {
    lastLog.push(`👁️ ${winner.name} ไม่ได้ชักดาบออกมา — ไม่มีเทิร์นโจมตี (สกิลติดตัว · ใช้สกิลพื้นฐาน "อืม ฉันเข้าใจแล้ว" เพื่อโจมตีได้)`);
    endTurn();
    return;
  }
  if (isYuuki(winner) && !roundTiedWin) {
    const forcedRivalId = winner.kaiRivalId && ((winner.statuses.kaiRival1 || 0) > 0 || (winner.statuses.kaiRival2 || 0) > 0)
      ? winner.kaiRivalId
      : null;
    const targets = attackableTargets(winner.id).filter((p) => !isYuuki(p) && (!forcedRivalId || p.id === forcedRivalId));
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
    yuukiAttackTargets = targets.slice(0, 2).map((p) => p.id);
    winner.yuukiAttacksThisTurn = 0;
    const first = yuukiAttackTargets.shift();
    if (first) {
      attackerId = winner.id;
      gameState = "ATTACK";
      doAttack(winner.id, first);
      return;
    }
    endTurn();
    return;
  }
  // DoomGuy (characters/doomguy.js) สกิลติดตัว: ปกติเสมอแต้มจะไม่มีเทิร์นโจมตี — โรลไปแล้วตอนตัดสิน
  //  ผู้ชนะใน resolveRound() (ห้ามโรลซ้ำที่นี่ ไม่งั้นโอกาสจริงจะถูกคูณซ้ำ)
  const doomTieOverride = doomTieAttack && !!winner && winner.alive && winner.characterId === "doomguy";
  if (winner && winner.alive && (!roundTiedWin || doomTieOverride)) {
    const targets = attackableTargets(winner.id);
    if (targets.length > 0) {
      attackerId = winner.id;
      gameState = "ATTACK";
      startPhaseTimer(ATTACK_TIME, () => {
        const t = attackableTargets(attackerId);
        if (t.length) doAttack(attackerId, t[Math.floor(Math.random() * t.length)].id);
        else endTurn();
      });
      broadcastState();
      return;
    }
  }
  endTurn();
}

// หัวใจฆาตกร (นานายะ ชิกิ สกิลติดตัว 2, characters/nanaya.js): เนตรมารพลาดสังหาร -> เปิดโอกาสโจมตีซ้ำทันที
//  (เปลี่ยนเป้าหมายได้ ไม่ต้องรอเทิร์นถัดไป — กดยกเลิกได้ผ่าน nanayaCancelReattack)
// เพลงหมัด อาริมะ (อาริมะ มิยาโกะ สกิลรอง patch 2.2.0): โจมตีต่อได้อีกหลายครั้ง โอกาสลดลงเป็นขั้น (100/75/50/25% สูงสุด 4 ครั้ง)
function postAttackFollowup(attacker) {
  // คอนเนอร์ RK800 (สกิลติดตัว 4 การป้องกันตัว): วีดีโอ connor_passive4 เล่นจบแล้ว -> ค่อยลงดาเมจสวนกลับ
  //  (จุดนี้อยู่หลัง runCutsceneQueue ของ doAttack เสมอ จึงได้ลำดับ "วีดีโอก่อน แล้วจึงเกิดความเสียหาย" ตามสเปค)
  CHAR_HOOKS.conner.resolvePendingCounter(engine);
  if (isYuuki(attacker)) {
    const next = yuukiAttackTargets.shift();
    if (next && attacker.alive && players[next]?.alive) {
      attackerId = attacker.id;
      gameState = "ATTACK";
      doAttack(attacker.id, next);
      return;
    }
    yuukiAttackTargets = [];
    endTurn();
    return;
  }
  if (attacker && attacker.alive && attacker.characterId === "nanaya") {
    if (CHAR_HOOKS.nanaya.startReattack(engine, attacker)) return;
  }
  // เพลงหมัด อาริมะ (characters/miyako.js): ต่อคอมโบตามโอกาสที่ลดหลั่นลงไป
  if (attacker && attacker.alive && attacker.characterId === "miyako") {
    if (CHAR_HOOKS.miyako.startComboReattack(engine, attacker)) return;
  }
  // สึงาชิ ทาคุโตะ (characters/takuto.js): Star Sword Saphir + Emeraude ร่วมกัน — โจมตีเพิ่มอีก 1 ครั้งทันที (การันตี)
  if (attacker && attacker.alive && attacker.characterId === "takuto") {
    if (CHAR_HOOKS.takuto.startComboReattack(engine, attacker)) return;
  }
  // สึงาชิ ทาคุโตะ (characters/takuto.js): อย่างนายน่ะ จะไปเข้าใจอะไร (พิชิตแสงดาว) — หลังคอมโบ Saphir+Emeraude โอกาส 50% ได้โจมตีต่อเป็นครั้งที่ 3
  if (attacker && attacker.alive && attacker.characterId === "takuto") {
    if (CHAR_HOOKS.takuto.startThirdAttack(engine, attacker)) return;
  }
  // อิปโป (characters/ippo.js): Dempsey roll — โจมตีต่อเนื่องตามจำนวน Dempsey Charge ที่สะสมไว้
  if (CHAR_HOOKS.ippo.startExtraAttack(engine, attacker)) return;
  // ฟุจิตะ โคโตเนะ (characters/kotone.js): Self-affirmation Explosion! Love Love — โจมตีเพิ่มอีก 1 ครั้ง
  if (attacker && attacker.alive && attacker.characterId === "kotone") {
    if (CHAR_HOOKS.kotone.startExtraAttack(engine, attacker)) return;
  }
  // คู่แฝดฮิซากาว่า (characters/hisakawa_sister.js): ฝันของเหล่าฝาแฝด — แฝดอีกคนออกมาโจมตีต่ออีก 1 ครั้ง
  //  (เลือกเป้าหมายเองได้ ดาเมจคงที่ 2) ต้องมาก่อนจังหวะอื่นเพราะเป็นส่วนหนึ่งของการโจมตีครั้งนี้
  if (CHAR_HOOKS.hisakawa_sister.startDreamFollowupAttack(engine, attacker)) return;
  // อาจารย์ ไบเลธ หลักสูตร "จบการศึกษา": แต้มน้อยสุดแบบไพ่ไม่แตก -> ได้โจมตีเพิ่มในเทิร์นเดียวกัน
  if (startBylethGraduationAttack()) {
    return;
  }
  if (CHAR_HOOKS.hisakawa_sister.startHayateAssistAttack(engine, attacker)) {
    gameState = "ATTACK";
    startPhaseTimer(ATTACK_TIME, () => {
      const t = attackableTargets(attackerId);
      if (t.length) doAttack(attackerId, t[Math.floor(Math.random() * t.length)].id);
      else endTurn();
    });
    broadcastState();
    return;
  }
  if (attacker) { delete attacker.statuses.miyakoHeal; delete attacker.statuses.yaak; }
  endTurn();
}

// หลักสูตร "จบการศึกษา": เปิดเฟสโจมตีเพิ่มของไบเลธจากจุดจบร่วมของเทิร์น
// จึงทำงานได้ทั้งหลังผู้ชนะโจมตี และกรณีผู้ชนะไม่มี/สละ/ถูกห้ามโจมตี
function startBylethGraduationAttack() {
  if (!CHAR_HOOKS.byleth.startCounterAttack(engine)) return false;
    gameState = "ATTACK";
    startPhaseTimer(ATTACK_TIME, () => {
      const t = attackableTargets(attackerId);
      if (t.length) doAttack(attackerId, t[Math.floor(Math.random() * t.length)].id);
      else endTurn();
    });
    broadcastState();
  return true;
}
// ยกเลิกการโจมตีซ้ำของหัวใจฆาตกร (characters/nanaya.js) — จบเทิร์นตามปกติ
function nanayaCancelReattack(id) {
  const p = players[id];
  if (!p || !p.alive || p.characterId !== "nanaya") return;
  CHAR_HOOKS.nanaya.cancelReattack(engine, p);
}

// สูตรคำนวณพลังโจมตีพื้นฐาน — ดึงออกมาจาก doAttack() ให้ทดสอบแยกได้ (ดู tests/computeAttackBase.test.js)
// ตัวละครที่ย้าย contribution มาไว้ที่ characters/<id>.js's damageBonus()/attackBaseOverride() แล้ว:
// oberon, broadband_man, eva13, kuwagata, appleguy, kotone, shrade_elan, phenex, takuto, hakuno,
// doomguy, gambler, oguri, riddhe, banagher, miyako, hikaru — ที่เหลือ (ungated/flag-only) ยังอยู่ที่นี่
// เสียงโจมตีปกติเฉพาะตัวละคร (คีย์ใน client/src/audio.js) — null = ใช้เสียง "attack" กลาง
//  ฮารุกะ: ระหว่างสถานะ "โอเมก้า" เท่านั้น (ออกจากร่างแล้วกลับไปใช้เสียงกลางตามเดิม)
function attackSoundOf(attacker) {
  if (!attacker) return undefined;
  if (attacker.characterId === "mageslayer") return "mageslayer_attack";           // BA.mp3
  if (attacker.characterId === "muimi") return CHAR_HOOKS.muimi.towerActive(attacker) ? "muimi_ub_hit" : "muimi_normal_hit";
  if (CHAR_HOOKS.haruka.omegaActive(attacker)) return "haruka_attack";             // hit_haruka.mp3
  if (CHAR_HOOKS.byleth.swordActive(attacker)) return "byleth_hit";                // hit_sound.mp3 (ดาบต้องสาป)
  return undefined;
}
function computeAttackBase(engine, attacker, target) {
  const hookCtx = {};
  const hook = engine.CHAR_HOOKS && engine.CHAR_HOOKS[attacker.characterId];
  const baseHook = (hook && hook.attackBaseOverride) ? hook.attackBaseOverride(engine, attacker, target, hookCtx) : 1;
  const hookBonus = (hook && hook.damageBonus) ? (hook.damageBonus(engine, attacker, target, hookCtx) || 0) : 0;

  const triggerForm = attacker.characterId === "ultraman_trigger";
  const storiumAtk = attacker.characterId === "hikaru" && (attacker.statuses.storium || 0) > 0;
  const paradiseAtk = (attacker.statuses.paradise || 0) > 0;
  // veilAtk/partnerAtk: ungated ตั้งใจ (แจกให้ผู้เล่นอื่นได้ ไม่ผูกกับตัวละครเจ้าของสกิล) — อยู่ที่นี่ ไม่ใช่ hook
  const veilAtk = !triggerForm && (attacker.statuses.veil || 0) > 0;
  const partnerAtk = !triggerForm && CHAR_HOOKS.broadband_man.contractBuffActive(engine, attacker);
  // ยุย โยชิโอกะ: girl don't cry (+1 ทั้งวง) และบัฟ "ทำนอง" ของคนที่ถูกชุบชีวิต (+2) — ungated ทั้งคู่
  const yuiRockAtk = !triggerForm && (attacker.statuses.yuiRock || 0) > 0;
  const yuiMelodyAtk = !triggerForm && (attacker.statuses.yuiMelody || 0) > 0;
  // ศิษย์ (โมโรโบชิ ดัน): ungated เหมือน veil/partner — เป็นบัฟที่แจกให้ผู้เล่นคนอื่น ไม่ผูกกับตัวละครเจ้าของสกิล
  const discipleAtk = !triggerForm && (attacker.statuses.danDisciple || 0) > 0;
  const isRevenge = attacker.characterId === "banagher" && attacker.ntdTarget && attacker.ntdTarget === target.id;
  const isRival = attacker.characterId === "banagher" && attacker.ntdRivalId && attacker.ntdRivalId === target.id;
  const ntdBonus = (isRevenge || isRival || paradiseAtk) ? 1 : 0;
  const empowerAtk = !triggerForm && (attacker.statuses.empower || 0) > 0;
  const oberonDayAtk = attacker.characterId === "oberon" && !engine.isNightRound(engine.roundNumber);
  const shradeDayOff = attacker.characterId === "shrade_elan" && attacker.shradeForm && !engine.isNightRound(engine.roundNumber);
  const phenexPurgeAtk = attacker.characterId === "phenex" && (attacker.statuses.phenexPurge || 0) > 0;
  const hakunoInvertAtk = attacker.characterId === "hakuno" && (attacker.statuses.hakunoInvertReady || 0) > 0;
  const hakunoNoRegenAtk = attacker.characterId === "hakuno" && (attacker.statuses.hakunoNoRegenReady || 0) > 0;
  const cardAtkBonus = triggerForm ? 0 : (attacker.statusAmt.cardAtkBonus || 0); // Trigger เสริมพลังตัวเองไม่ได้
  const heroSwordAtk = triggerForm ? 0 : (((attacker.statuses.heroSword || 0) > 0) ? 2 : 0);

  const base = baseHook + hookBonus + (veilAtk ? 1 : 0) + (empowerAtk ? 1 : 0) + (partnerAtk ? 1 : 0) + (discipleAtk ? CHAR_HOOKS.dan.DISCIPLE_ATK_BONUS : 0)
    + (yuiRockAtk ? CHAR_HOOKS.yui.ROCK_ATK : 0) + (yuiMelodyAtk ? CHAR_HOOKS.yui.MELODY_ATK : 0)
    + cardAtkBonus + heroSwordAtk;
  return {
    base,
    storiumAtk, paradiseAtk, isRevenge, isRival, ntdBonus, veilAtk, empowerAtk, partnerAtk, discipleAtk, yuiRockAtk, yuiMelodyAtk, cardAtkBonus, heroSwordAtk,
    oberonDayAtk, shradeDayOff, phenexPurgeAtk, hakunoInvertAtk, hakunoNoRegenAtk,
    ...hookCtx,
  };
}

// คอนเนอร์ RK800 (สกิลพื้นฐาน วิเคราะห์สถานการณ์): ประเมินพลังโจมตีปกติที่ attacker จะฟาดใส่ target ได้
//  อ่านจากท่อเดียวกับการโจมตีจริง (computeAttackBase) แต่เป็นแค่ "ค่าประเมิน" — โบนัสที่ตัดสินตอนตีจริง
//  (สังหารทันที/ล่อเป้า/หลบหลีก/ลดดาเมจฝั่งรับ) ไม่ถูกนับ · ห่อ try/catch เพราะเรียกจาก buildStateFor ทุก broadcast
function estimateAttackOn(attacker, target) {
  try {
    const c = computeAttackBase(engine, attacker, target);
    return Math.max(0, (c.base || 0) + (c.ntdBonus || 0));
  } catch { return null; }
}

function doAttack(byId, targetId) {
  if (gameState !== "ATTACK" || byId !== attackerId) return;
  const attacker = players[byId];
  if (!effectSourceId && attacker) return withEffectSource(attacker, () => doAttack(byId, targetId));
  let target = players[targetId];
  if (!attacker || !target || !target.alive || target.id === attacker.id || sameTeam(attacker, target) || sealActive(target)
      || CHAR_HOOKS.the_supplicant.targetBlocked(attacker, target)) { // ลูกแกะน้อยรู้แจ้ง: เล็งผู้วิงวอนไม่ได้
    // เป้าหมายยูกิอาจตาย/หายหรือป้องกันการเลือกเป้าระหว่างคัตซีน ห้ามปล่อยเฟส ATTACK ค้าง
    if (isYuuki(attacker)) postAttackFollowup(attacker);
    return;
  }
  if (CHAR_HOOKS.princess_shiki.cannotAttack(attacker)) return;       // เจ้าหญิงราก (patch 2.2.7): โจมตีไม่ได้ เว้นแต่ติดชักดาบ
  // ไค ชิซากิ: โทสะระงับด้วยโทสะ — มีคู่ปรับ (kaiRival1/kaiRival2 ยังไม่หมด) บังคับเป้าหมายมีแค่คู่ปรับเท่านั้น
  if (attacker.kaiRivalId && ((attacker.statuses.kaiRival1 || 0) > 0 || (attacker.statuses.kaiRival2 || 0) > 0) && target.id !== attacker.kaiRivalId) {
    if (isYuuki(attacker)) postAttackFollowup(attacker);
    return;
  }
  clearPhaseTimer();
  let yuukiAttackVideoQueued = false;
  if (isYuuki(attacker)) {
    attacker.yuukiAttacksThisTurn = (attacker.yuukiAttacksThisTurn || 0) + 1;
    if (attacker.yuukiAttacksThisTurn === 1) {
      queueYuukiCutscene(YUUKI_VIDEO.attack, "จงหวาดกลัว", 4, "yuukiAttack");
      yuukiAttackVideoQueued = true;
    }
  }
  attacker.didAttackRound = true;
  // โมโรโบชิ ดัน (characters/dan.js): เป้าหมายที่ถูกขับรถตาม "หันมาตีดัน" -> นับหมัด ครบ 2 ครั้งถึงสลัดหลุด
  //  วางไว้ตรงนี้ (ก่อนคิดดาเมจ) เพราะนับที่ "ได้ออกหมัด" ไม่ใช่ "ตีโดน" — ดันหลบได้ก็ยังนับให้
  CHAR_HOOKS.dan.onChasedAttacked(engine, attacker, target);
  attacker.nanayaReattackReady = false; // หัวใจฆาตกร (นานายะ ชิกิ): กำลังใช้โอกาสโจมตีซ้ำนี้อยู่ (หรือไม่เกี่ยวข้องกับตัวละครนี้)

  let riddheTaunted = false;
  let phenexTaunted = false;
  let batTaunted = false;
  // ตัวล่อเป้าทุกชนิดเข้าคิวเดียวกัน แล้วกระจายผู้โจมตีตามตำแหน่ง เพื่อไม่ให้คนแรก/ชนิดที่ประมวลผลทีหลังแย่งผลทั้งหมด
  const taunters = [
    ...CHAR_HOOKS.riddhe.findTaunters(engine, attacker),
    ...CHAR_HOOKS.phenex.findTaunters(engine, attacker),
    ...CHAR_HOOKS.bat_ben.findTaunters(engine, attacker),
    ...CHAR_HOOKS.yui.findTaunters(engine, attacker), // ยุย: ปากแจ๋ว
  ].filter((t) => !sameTeam(attacker, t)).sort((a, b) => a.position - b.position);
  if (taunters.length) {
    const taunter = taunters[Math.max(0, (attacker.position || 1) - 1) % taunters.length];
    if (target.id !== taunter.id) {
      const oldTarget = target;
      target = taunter;
      riddheTaunted = taunter.characterId === "riddhe";
      phenexTaunted = taunter.characterId === "phenex";
      batTaunted = taunter.characterId === "bat_ben";
      const label = riddheTaunted ? "🧲 Absorb Shield" : phenexTaunted ? "🥺 ไม่อยากให้ใครต้องเจ็บปวด" : "🦇 เข้ามาเลย";
      lastLog.push(`${label} — ${taunter.name} ล่อเป้า! การโจมตีของ ${attacker.name} ถูกดึงจาก ${oldTarget.name} มาที่ตัวเอง`);
    }
  }

  // ---------- ชิกิ: นายมีฝีมือแค่ไหนหรอ? — ยกเลิกท่าไม้ตายแบบย้อนหลัง (patch 2.0.6.1) ----------
  //  ท่าไม้ตายที่มีผลอยู่ก่อนชิกิได้ชาร์จ จะยกเลิกตอนกดไม่ได้ — แต่ถ้าเจ้าของท่ามาตีชิกิที่ถือชาร์จอยู่
  //  ชิกิจะยกเลิกท่าไม้ตายนั้นย้อนหลังทันที (ก่อนคำนวณดาเมจ — โบนัสจากท่านั้นไม่ทำงาน)
  //  patch 2.0.8: ย้ายมาเช็คก่อนการหลบหลีก/สังหารทุกกรณี — การเลือกตีชิกิถือว่า "มาตี" แล้ว ยกเลิกได้เสมอ
  if (target.characterId === "shiki" && (target.statuses.godslay || 0) > 0) {
    const ultKey = SHIKI_CANCELABLE_ULTS.find((k) => (attacker.statuses[k] || 0) > 0);
    if (ultKey) {
      const isBardDim = ultKey === "bloodDim" || ultKey === "soulDim";
      const ultName = shikiUltNameOf(attacker, ultKey);
      const ultImg = (TRANSFORMS[ultKey] && TRANSFORMS[ultKey].img)
        || (isBardDim ? TRANSFORMS.bardDim.img : ultKey === "ashen" ? TRANSFORMS.oguriAshen.img : displayImg(attacker));
      delete attacker.statuses[ultKey];
      if (ultKey === "muimiTower") CHAR_HOOKS.muimi.onUltExpire(engine, attacker);
      if (ultKey === "wither") clearWitherLines(attacker.id);       // ลบเฉพาะเส้นชีวิตที่ท่าของเจ้าของคนนี้แจกไว้
      if (ultKey === "anata") { attacker.anataTargets = null; anataMusicSeq = 0; } // ANATA WAAAAAAAA (patch 2.0.8)
      if (ultKey === "riddheguard") { const rb = riddheAllied(attacker); if (rb) delete rb.statuses.riddheward; } // ริดดี้ ท่า 2: ถอดเกราะฝั่งบานาจด้วย
      // มิติมายาบรรเลง (patch 2.0.8.1): มิติปิดลง — ท่อนทำนองทั้งหมดถูกรีเซ็ต (แบบเดียวกับมิติจบเอง)
      if (isBardDim) { attacker.bloodSection = 0; attacker.soulSection = 0; }
      lastLog.push(`👁️ ${target.name} มองขาดทุกการเคลื่อนไหว — ยกเลิก ${ultName} ของ ${attacker.name} แบบย้อนหลัง!`);
      shikiCancelUltimate(target, attacker, ultName, ultImg);
    }
  }

  // หลบหลีก (Encore / มิติมายาบรรเลง — Bard / สถานะพื้นฐาน patch 2.0.8): หลบการโดนโจมตีตาม % ที่ระบุ
  //  (ไม่ระบุ = 100%) — ซ้อนทับได้ หมดไปทีละ 1 ครั้งเมื่อถูกเลือกโจมตี ไม่ว่าหลบพ้นหรือไม่
  if ((target.statuses.evade || 0) > 0) {
    const evadePct = statusAmtOf(target, "evade") || 100;
    consumeEvadeStack(target);
    if (Math.random() * 100 < evadePct) {
      // patch 2.1.3.5: ถูกโจมตีไม่ได้แต้มสกิลอีกต่อไป (แม้หลบพ้น)
      target.wasAttacked = true;
      lastLog.push(`💨 หลบหลีก! ${target.name} หลบการโจมตีของ ${attacker.name} ได้ (${evadePct}%) — เหลือหลบหลีกอีก ${target.statuses.evade || 0} ครั้ง`);
      lastAttack = {
        id: ++attackSeq,
        byName: attacker.name, byImg: displayImg(attacker), byColor: POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined, // DoomGuy: อาวุธที่ใช้ยิงตอนนี้ (เสียงยิงฝั่ง client)
        byAttackSound: attackSoundOf(attacker), // เสียงโจมตีปกติเฉพาะตัว (ผู้สังหารเมจ / ฮารุกะระหว่างโอเมก้า)
        targetName: target.name, targetImg: displayImg(target), targetColor: POSITION_COLORS[target.position] || "#888",
        dmg: 0, dodge: true, fxMs: ATTACKFX_TIME * 1000,
        skills: [{ name: `หลบหลีก (${evadePct}%)`, img: BARD_CRIMSON_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888", side: "def" }],
      };
      gameState = "ATTACKING";
      startPhaseTimer(ATTACKFX_TIME, () => runCutsceneQueue(endTurn));
      broadcastState();
      return;
    }
    lastLog.push(`💨 ${target.name} พยายามหลบ (${evadePct}%) แต่ไม่พ้น — การโจมตีดำเนินต่อ (เหลือหลบหลีกอีก ${target.statuses.evade || 0} ครั้ง)`);
  }

  // ---------- ชิกิ: ฉันมองเห็นมันแล้ว (characters/shiki.js) — เป้าหมายเส้นตายครบ 6 = สังหารทันที (บังคับตาย) ----------
  const shikiEye = attacker.characterId === "shiki" && (attacker.statuses.deatheye || 0) > 0;
  if (shikiEye && !killSealed(attacker) && (target.statuses.deathline || 0) >= SHIKI_DEATHLINE_MAX) {
    if (CHAR_HOOKS.shiki.onAttackDeatheye(engine, attacker, target)) return;
  }

  // ---------- ชิกิ: ความตายที่โรยรา (characters/shiki.js) — ท่าไม้ตาย 2 (rework patch 2.0.8) ----------
  //  เส้นชีวิตไม่ใช่โอกาสสังหารอีกต่อไป — แปรเป็นดาเมจเสริมการโจมตีปกติแทน (คำนวณต่อในส่วนดาเมจด้านล่าง)
  //  ยังคงมีโอกาสสังหารทันที 1% คงที่ (เพิ่มไม่ได้)
  const shikiWither = attacker.characterId === "shiki" && (attacker.statuses.wither || 0) > 0;
  const witherLines = shikiWither ? (target.statuses.deathline || 0) : 0;
  if (shikiWither && !killSealed(attacker)) {
    if (CHAR_HOOKS.shiki.onAttackWither(engine, attacker, target)) return;
  }

  // ---------- โทโนะ ชิกิ: Mystic eye of death perception (patch 2.1.7) — ย้ายไป characters/tohno.js ----------
  if (attacker.characterId === "tohno") {
    if (CHAR_HOOKS.tohno.onAttack(engine, attacker, target)) return;
  }

  // ---------- เจ้าหญิงราก: Mystical Eye of Death Perception (Truth) (characters/princess_shiki.js) ----------
  //  ได้โจมตีปกติเมื่อไหร่ (ผ่าน "ชักดาบ") คิดโอกาสสังหารจากเส้นชีวิตที่อยู่บนตัวเป้าหมาย (1 หน่วย = 10%)
  if (attacker.characterId === "princess_shiki") {
    if (CHAR_HOOKS.princess_shiki.onAttackDeathline(engine, attacker, target)) return;
  }

  // ---------- "เนตรมณะ" (สถานะ Universal patch 2.2.7 — เจ้าหญิงราก "ทุกอย่างจะต้องราบรื่น") ----------
  //  ใครก็ตามที่ติดบัฟนี้ โจมตีปกติแล้วมีโอกาสสังหารเป้าหมายทันที 20% (คิดแยกจาก/หลังเนตรของแต่ละตัวละคร)
  //  วีดีโอสังหารขึ้นเฉพาะตอนเจ้าหญิงรากเป็นผู้ลงมือเอง — ตัวละครอื่นที่ได้บัฟไปสังหารเงียบๆ
  if (netramanaActive(attacker) && !killSealed(attacker)) {
    const netraChance = miyakoKillChance(target, NETRAMANA_KILL_CHANCE);
    if (Math.random() < netraChance) {
      if (appleGuyDodgesKill(attacker, target)) return; // Apple guy: หลบสังหารทันทีได้
      // วีดีโอสังหารเล่นเฉพาะตอนเจ้าหญิงรากเป็นคนลงมือเองเท่านั้น — คนอื่นที่ยืมบัฟนี้ไปใช้
      //  สังหารได้เงียบๆ (ขึ้นแค่ป้ายสรุปการโจมตี) กันวีดีโอของเจ้าหญิงรากเด้งใส่ทั้งสนามทุกครั้งที่ใครก็ตามสังหารสำเร็จ
      if (attacker.characterId === "princess_shiki") queueCutscene(attacker, "pshikiKill");
      instantDeath(target);
      target.wasAttacked = true;
      if (!target.alive) lastLog.push(`👁️✨💀 เนตรมณะ — ${attacker.name} มองทะลุความตายของ ${target.name} (โอกาส ${Math.round(netraChance * 100)}%) — สังหารทันที!`);
      else lastLog.push(`👁️✨💀 เนตรมณะ — ${attacker.name} มองทะลุความตายของ ${target.name} — แต่ ${target.name} เกิดใหม่หนีความตายไปได้!`);
      lastAttack = {
        id: ++attackSeq,
        byName: attacker.name, byImg: displayImg(attacker), byColor: POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
        targetName: target.name, targetImg: displayImg(target), targetColor: POSITION_COLORS[target.position] || "#888",
        dmg: 0, kill: !target.alive,
        skills: [{ name: "เนตรมณะ — สังหารทันที", img: PSHIKI_ULT_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888", side: "atk" }],
      };
      runCutsceneQueue(() => {
        gameState = "ATTACKING";
        startPhaseTimer(ATTACKFX_TIME + 2, endTurn);
        broadcastState();
      });
      return;
    }
    miyakoSurvivedKillAttempt(target);
  }

  // ---------- นานายะ ชิกิ: Mystic eye of death perception (characters/nanaya.js) ----------
  attacker.nanayaMissedThisAttack = false;
  if (attacker.characterId === "nanaya") {
    if (CHAR_HOOKS.nanaya.onAttack(engine, attacker, target)) return;
  }

  // สกิลติดตัว Apple guy (ชิวๆ ไม่โดนหรอกครับ, characters/appleguy.js): ขณะชิวๆครับน้องๆ ทำงาน มีโอกาสหลบการถูกเลือกโจมตี
  if (CHAR_HOOKS.appleguy.onAttackTryDodge(engine, attacker, target)) return;

  // โอกูริ แคป (Rework, characters/oguri.js — Training บัฟเสริม Flow): โอกาสหลบการโจมตี 50%
  if (CHAR_HOOKS.oguri.tryFlowDodge(engine, attacker, target)) return;
  if (CHAR_HOOKS.escanor.tryNightDodge(engine, attacker, target)) return;

  // มหาเทพ อรชุน (สกิลติดตัว หัวใจที่เที่ยงธรรม): จดจำว่าใครเป็นฝ่ายลงมือกับอรชุนก่อน
  //  บันทึก "ตอนเลือกเป้า" ไม่ใช่ตอนดาเมจลง — การโจมตีที่ถูกหลบ/กันไว้ก็ยังนับว่าเคยลงมือแล้ว
  //  จึงต้องอยู่ก่อนด่านหลบหลีกทั้งหมด
  CHAR_HOOKS.arjuna.onAttacked(engine, attacker, target);
  // เอจิ (characters/eiji.js): อัตราหลบหลีกรวม (ว่องไว + ไม่ว่ายังก็ตาม + Ordinal Scale) — 1 ครั้งต่อเทิร์น
  if (CHAR_HOOKS.eiji.tryAttackDodge(engine, attacker, target)) return;
  // อิปโป (characters/ippo.js): หลบการโจมตีปกติ — หลบพ้นแล้วจบเทิร์นด้วยฉากหลบ
  if (CHAR_HOOKS.ippo.tryAttackDodge(engine, attacker, target)) return;
  // เอจิ สกิลติดตัว 1 (ผู้เล่นอันดับ 2): ผู้ชนะไปตีคนอื่นที่ไม่ใช่เอจิ -> 25% ขัดจังหวะแล้วสวนคืน
  if (CHAR_HOOKS.eiji.tryInterrupt(engine, attacker, target)) return;

  // ---------- ซาโตรุ อาเคฟุ (patch 2.0.8.2): สกิลติดตัวลบล้างการโจมตี + Wonder of U สวนกลับ ----------
  if (target.characterId === "satoru") {
    const r = satoruOnTargeted(target, attacker, "การโจมตี");
    if (r.negated) {
      // patch 2.1.3.5: ถูกโจมตีไม่ได้แต้มสกิลอีกต่อไป
      target.wasAttacked = true;
      lastAttack = {
        id: ++attackSeq,
        byName: attacker.name, byImg: displayImg(attacker), byColor: POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined, // DoomGuy: อาวุธที่ใช้ยิงตอนนี้ (เสียงยิงฝั่ง client)
        byAttackSound: attackSoundOf(attacker), // เสียงโจมตีปกติเฉพาะตัว (ผู้สังหารเมจ / ฮารุกะระหว่างโอเมก้า)
        targetName: target.name, targetImg: displayImg(target), targetColor: POSITION_COLORS[target.position] || "#888",
        dmg: 0, dodge: true, fxMs: ATTACKFX_TIME * 1000,
        skills: [{ name: "อย่าได้ไล่ตามหัวหน้า (การโจมตีถูกลบล้าง)", img: SATORU_PROFILE_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888", side: "def" }],
      };
      runCutsceneQueue(() => { // วีดีโอ Wonder of U (ถ้าเพิ่งสวนกลับ) เล่นก่อนจบเทิร์น
        gameState = "ATTACKING";
        startPhaseTimer(ATTACKFX_TIME, endTurn);
        broadcastState();
      });
      return;
    }
    // ลบล้างติดคูลดาวน์อยู่ — การโจมตีดำเนินต่อ (Wonder of U อาจสวนกลับไปแล้วใน satoruOnTargeted)
  }

  // สูตรพลังโจมตีพื้นฐาน — ย้าย body ไป computeAttackBase() แล้ว (ดูก่อนหน้า doAttack ในไฟล์นี้)
  let {
    base,
    gingastriumAtk, ginga, storiumAtk, beam, paradiseAtk, ohger, spearAtk, profitAtk,
    isRevenge, isRival, ntdBonus, unibeam2Atk, lastStanding, veilAtk, empowerAtk, oberonZero,
    oberonDayAtk, appleAtk, tigerAtk, partnerAtk, kotoneLove, kotoneLoveDmg, shradeAtk,
    shradeDayOff, oguriGoldAtk, victoryAtk, beamPlusAtk, riddheNtdOn, riddheUltBonus, riddheP1Atk,
    riddheAvAtk, phenexPurgeAtk, miyakoUltAtk, hakunoInvertAtk, hakunoNoRegenAtk,
    rachanAtk, fourthAtk, doomLockonAtk, cardAtkBonus, heroSwordAtk,
    triggerCircleAtk, triggerMultiAtk, triggerZeperionAtk, triggerLightBonus, triggerMultiHighestHp, triggerMultiLowHpPenalty,
    triggerDarkAtk, muimiTowerAtk,
  } = computeAttackBase(engine, attacker, target);
  // ผกผัน (สถานะ Universal patch 2.2.1): โบนัสพลังโจมตีที่ควรได้ กลับกลายเป็นลดพลังโจมตีแทน (คำนวณรอบเพดานฐาน 1 หน่วย)
  if (invertActive(attacker)) base = Math.max(0, 1 - (base - 1));
  let dmg = base + ntdBonus;
  // เสริมพลัง / อ่อนแอ (สถานะพื้นฐาน patch 2.0.8): เพิ่ม/ลดดาเมจที่ทำได้ตามจำนวนที่ระบุ
  //  ผู้วิงวอน (patch 3.4): "เกราะศรัทธา" ให้เสริมพลัง 1 · "ลูกแกะน้อยรู้แจ้ง" ให้อ่อนแอ 1 / เปราะบาง 1
  //  คิดสดที่นี่แทนการใส่เป็นสถานะจริง เพราะสถานะแม่ทั้งสองตัวล้าง/ต้านไม่ได้ (ดูหัว characters/the_supplicant.js)
  const mightAtk = attacker.characterId === "ultraman_trigger" ? 0
    : statusAmtOf(attacker, "might") + CHAR_HOOKS.the_supplicant.statusAmtBonus(attacker, "might");
  if (mightAtk > 0) dmg += mightAtk;
  // ยูนะ: Longing (บัฟผู้ถูกฟื้นคืนชีพ +1 ถาวร 5 เทิร์น) / Break Beat Bark! (ทุกคน +1 เฉพาะโจมตีปกติ ไม่ใช่สกิล)
  const yunaLongingAtk = attacker.characterId === "ultraman_trigger" ? 0 : statusAmtOf(attacker, "yunaLonging");
  if (yunaLongingAtk > 0) dmg += yunaLongingAtk;
  const yunaBeatBark = attacker.characterId !== "ultraman_trigger" && yunaBeatBarkActive();
  if (yunaBeatBark) dmg += 1;
  const weakAtk = statusAmtOf(attacker, "weak") + CHAR_HOOKS.the_supplicant.statusAmtBonus(attacker, "weak");
  if (weakAtk > 0) dmg = Math.max(0, dmg - weakAtk);
  // ความตายที่โรยรา (ชิกิ patch 2.0.8): เส้นชีวิตของเป้าหมายแปรเป็นดาเมจเสริม +1 ต่อเส้น
  //  แต่พลังโจมตีรวมฝั่งผู้โจมตีไม่เกิน 5 หน่วยต่อการโจมตี
  if (shikiWither && witherLines > 0) {
    const before = dmg;
    dmg = Math.min(SHIKI_WITHER_ATK_CAP, dmg + witherLines);
    lastLog.push(`🥀 ความตายที่โรยรา — เส้นชีวิตของ ${target.name} แปรเป็นดาเมจเสริม +${Math.max(0, dmg - before)} (พลังโจมตีรวมสูงสุด ${SHIKI_WITHER_ATK_CAP})`);
  } else if (shikiWither) {
    dmg = Math.min(SHIKI_WITHER_ATK_CAP, dmg); // เพดานพลังโจมตีระหว่างท่าไม้ตาย 2 คงที่ 5
  }
  // ลำแสงสโตเรียม (ฮิคารุ patch 2.1.3): แทนที่ดาเมจทั้งหมดด้วยสูตรเฉพาะ — โจมตีปกติ(สูงสุด 4) + ลุกไหม้ที่เหลือของเป้าหมาย รวมไม่เกิน 8
  let storiumAtkPart = 0, storiumBurnPart = 0;
  if (storiumAtk) {
    storiumAtkPart = Math.min(HIKARU_STORIUM_ATK_CAP, dmg);
    storiumBurnPart = target.statuses.hburn || 0;
    dmg = Math.min(HIKARU_STORIUM_TOTAL_CAP, storiumAtkPart + storiumBurnPart);
    delete attacker.statuses.storium;
  }
  // ชำระค่าบริการ (สกิลติดตัวเจ้าแห่งเน็ตบ้าน): คู่สัญญาโจมตีใส่ตัวละครนี้ ความเสียหายลด 1
  const contractGuard = target.characterId === "broadband_man" && target.contractPartner === attacker.id && attacker.contractWith === target.id;
  if (contractGuard) dmg = Math.max(0, dmg - 1);
  // คุ้มครอง (Harmony / สถานะพื้นฐาน): ความเสียหายที่ได้รับลดลงตามจำนวนที่ระบุ (ไม่ระบุ = 1)
  const bardGuard = (target.statuses.guard || 0) > 0;
  const guardAmt = (bardGuard ? (statusAmtOf(target, "guard") || 1) : 0)
    + CHAR_HOOKS.the_supplicant.statusAmtBonus(target, "guard");
  if (guardAmt > 0) dmg = Math.max(0, dmg - guardAmt);
  // Discord (Bard): เป้าหมายติดขัดแย้ง — ความเสียหายที่ได้รับ +1
  const bardDiscord = (target.statuses.discord || 0) > 0;
  if (bardDiscord) dmg += 1;
  // เปราะบาง (สถานะพื้นฐาน patch 2.0.8): ความเสียหายที่ได้รับเพิ่มตามจำนวนที่ระบุ
  const fragileAmt = statusAmtOf(target, "fragile") + CHAR_HOOKS.the_supplicant.statusAmtBonus(target, "fragile");
  if (fragileAmt > 0) dmg += fragileAmt;
  // ยูนะ: Delete (+1 ดาเมจที่ได้รับ) / Smile for You (-1 ดาเมจที่ได้รับ) — ต้าน/ลบไม่ได้ ซ้อนกับเปราะบางได้
  const yunaDeleteAmt = statusAmtOf(target, "yunaDelete");
  if (yunaDeleteAmt > 0) dmg += yunaDeleteAmt;
  //  เอจิ (เอฟเฟกต์เฉพาะตัว): โจมตีปกติของเอจิไม่สนบัฟลดความเสียหาย Smile for You ของเป้าหมาย
  const yunaSmileAmt = CHAR_HOOKS.eiji.ignoresYunaSmile(attacker) ? 0 : statusAmtOf(target, "yunaSmile");
  if (yunaSmileAmt > 0) dmg = Math.max(0, dmg - yunaSmileAmt);
  // เต็มอิ่ม (Breakfast โอกูริ patch 2.0.8.1): ดาเมจที่ได้รับ -1 (หมดหลังจบเทิร์นที่กดใช้)
  const fullBelly = (target.statuses.fullbelly || 0) > 0;
  if (fullBelly) dmg = Math.max(0, dmg - 1);
  // MOON*CELL (คิชินามิ ฮาคุโนะ patch 2.2.1): ทุกคนยกเว้นเจ้าของท่า โจมตีด้วยพลังโจมตีพื้นฐาน 1 หน่วยเท่านั้น
  //  ไม่ว่าจะเสริมแกร่งอะไรมา (ทับค่าที่คำนวณไว้ทั้งหมดข้างบน — สกิลติดตัว/บัฟถาวรที่ไม่ใช่สถานะก็โดนด้วย)
  if (moonCellActive() && attacker.characterId !== "hakuno") dmg = 1;
  // หอกผู้พิชิต (สึงาชิ ทาคุโตะ patch 2.2.5): ทับดาเมจทั้งหมดด้วยค่าคงที่ 5 หน่วย (เหนือกว่าทุกโบนัส/ดีบัฟที่คำนวณมาข้างบน)
  const takutoLanceAtk = attacker.characterId === "takuto" && (attacker.statuses.lance || 0) > 0;
  if (takutoLanceAtk) dmg = TAKUTO_LANCE_DMG;
  if (CHAR_HOOKS.escanor.adjustOutgoingDamage) dmg = CHAR_HOOKS.escanor.adjustOutgoingDamage(engine, attacker, target, dmg);
  if (attacker.characterId === "satoru") dmg = 0; // ซาโตรุ: โจมตีธรรมดาดาเมจ 0 แล้วติด ObLa หลังโจมตี
  // เอจิ (characters/eiji.js): ดาบแห่งความทรงจำ — โอกาสคูณดาเมจ 2 เท่า (คิดท้ายสุดเพื่อให้คูณยอดสุทธิจริง)
  const eijiSwordFx = {};
  dmg = CHAR_HOOKS.eiji.applySwordDouble(engine, attacker, dmg, eijiSwordFx);
  // ฮารุกะ (characters/haruka.js): จงไปสู่สุขติ — จุดชนวน "เลือดไหล" ของเป้าหมายให้ระเบิดรวมกับหมัดนี้
  //  ต้องอ่านค่าเลือดไหล "ก่อน" ความเสียหายลง และก่อนที่โอเมก้าจะแปะเลือดไหลก้อนใหม่ (onAttackLanded ด้านล่าง)
  const harukaPunishFx = {};
  dmg = CHAR_HOOKS.haruka.applyPunish(engine, attacker, target, dmg, harukaPunishFx);
  // คู่แฝดฮิซากาว่า (characters/hisakawa_sister.js): หมัดที่ 2 ของ "ฝันของเหล่าฝาแฝด" — แฝดอีกคนออกมาตีเอง
  //  ดาเมจคงที่เสมอ ไม่รับโบนัสพลังโจมตี/บัฟใดๆ ของตัวที่กำลังคุมอยู่ (คิดท้ายสุดเพื่อทับทุกอย่าง)
  const hisakawaDreamAtk = CHAR_HOOKS.hisakawa_sister.isDreamAttack(attacker);
  if (hisakawaDreamAtk) dmg = CHAR_HOOKS.hisakawa_sister.DREAM_FOLLOWUP_DMG;

  // ---------- ริต้า เบอร์นัล (characters/phenex.js): ฝันไปเถอะ — ตั้งรับ สะท้อนความเสียหายทั้งหมดกลับผู้โจมตีแทนที่จะรับเอง ----------
  if (CHAR_HOOKS.phenex.tryReflectHit(engine, attacker, target, dmg)) return;

  // ---------- แบทแมน (characters/bat_ben.js): นายลืมของน่ะ — ดูดซับความเสียหายทั้งก้อนไว้ แล้วรอเลือกส่งต่อ ----------
  //  ต้องอยู่ก่อนการลงความเสียหายจริงเสมอ (ทั้งตัวแบทแมนและผู้โจมตีจะไม่เจ็บ — เข้ามาเลยจึงไม่สะท้อนด้วย)
  if (CHAR_HOOKS.bat_ben.tryKarmaAbsorb(engine, attacker, target, dmg)) return;

  // ลำแสงสโตเรียม (ฮิคารุ patch 2.1.3): เล่นวีดีโอก่อนสรุปผลความเสียหาย
  if (storiumAtk) {
    triggerCutscene(attacker, "hikaruStorium");
    lastLog.push(`🌟 ${attacker.name} ลำแสงสโตเรียม — โจมตีปกติ ${storiumAtkPart} + ลุกไหม้ที่เหลือของ ${target.name} ${storiumBurnPart} = ${dmg} หน่วย (สูงสุด ${HIKARU_STORIUM_TOTAL_CAP})`);
  }
  // Beam Magnum: หักกระสุน 1 นัดเมื่อได้โจมตีจริงเท่านั้น (ไม่นับถ้าเลือกแล้วไม่ได้ตี/แตกในเทิร์น)
  if (beam && (attacker.beamAmmo || 0) > 0) attacker.beamAmmo--;
  // บานาจ (patch 2.1.2): Beam Magnum (สกิลรอง 2 ระหว่างร่าง Paradise) — เล่นวีดีโอก่อนสรุปผล
  if (beam && attacker.characterId === "banagher") triggerCutscene(attacker, "banagherBeamAtk");
  // Beam Magnum Plus (ริดดี้): หักกระสุนเมื่อได้โจมตีจริง + เล่นวีดีโอ (ชนะแล้วโจมตีสำเร็จ)
  if (beamPlusAtk) {
    if ((attacker.beamAmmo || 0) > 0) attacker.beamAmmo--;
    triggerCutscene(attacker, "riddheBeam"); // ครั้งแรกเล่นวีดีโอเต็ม / ครั้งถัดไปแจ้งเตือนเล็กๆ
  }
  // แสงที่ไม่อยู่เพียงลำพัง (ท่าไม้ตาย 2 patch 2.1.2): หักกระสุน Beam Magnum ของทั้งคู่คนละ 1 นัด + เล่นวีดีโอ
  let unibeam2Ally = null;
  if (unibeam2Atk) {
    unibeam2Ally = riddheAllied(attacker);
    if ((attacker.beamAmmo || 0) > 0) attacker.beamAmmo--;
    if (unibeam2Ally && (unibeam2Ally.beamAmmo || 0) > 0) unibeam2Ally.beamAmmo--;
    triggerCutscene(attacker, "unibeam2");
  }

  const attackerBeat = beatActive(attacker); // Beat Mode: การโจมตีเป็นความเสียหายจริง ไม่สนเกราะ
  const hpBefore = target.hp;
  const armorBefore = target.armor;
  const shieldBefore = target.shield;
  const escanorFormBeforeHit = target.characterId === "escanor" ? CHAR_HOOKS.escanor.formOf(target) : null;
  // เชื่อมผล (patch 2.0.8): HP ที่เป้าหมายเสียจริงจะแชร์ให้คู่เชื่อมเท่ากันผ่าน loseHp — เก็บค่าก่อนตีไว้โชว์ผล
  const linkedBuddy = linkedBuddyOf(target);
  const buddyHpBefore = linkedBuddy ? linkedBuddy.hp : 0;
  // RS-Hopper (เอวา 13 patch 2.2.1 alpha): "การโจมตีปกติ" = การโจมตีจากการเลือกเป้าหมายในระบบเทิร์นปกติ (doAttack นี้เสมอ)
  //  ไม่ว่าจะมีบัฟเสริมพลังโจมตีติดตัวหรือไม่ — กันเต็มไม่ได้ กันได้แค่ไม่ให้ต่ำกว่า 4 หน่วย (RS-Hopper พิเศษ ดูใน loseHp)
  //  ส่วนความเสียหายจากสกิลประเภทโจมตี/เลือกเป้าหมายที่ไม่ผ่าน doAttack (เช่น ปลดปล่อยความเจ็บปวดของริต้า) กันเต็มได้ทันที
  // DoomGuy (patch 2.2 full): บางอาวุธ (Heavy Cannon / Plasma Rifle / Ballista) ดาเมจเจาะเกราะ — ทะลุเกราะเข้าเลือดจริงเสมอ
  const doomPierceAtk = attacker.characterId === "doomguy" && !((attacker.statuses.doomCrucible || 0) > 0) &&
    !!(DOOM_WEAPONS[attacker.doomWeapon] || DOOM_WEAPONS.shotgun).pierce;
  const ippoArmorBefore = target.armor; // อิปโป Uper Cut: ตัดสินจากเกราะ "ก่อน" โดนหมัดนี้
  if (attackerBeat || profitAtk > 0 || phenexPurgeAtk || doomPierceAtk) dealDirect(target, dmg, true); // ประกายเขี้ยวปฏิปักษ์ / กำไรเท่าตัวโว้ย / อย่าอยู่เลย แกน่ะ!: ทะลุเกราะเข้าเลือดจริง
  else dealMixed(target, dmg, true);               // กฎปกติ: ลดเกราะก่อน ถ้าไม่มีเกราะจึงเข้าเลือดจริง
  CHAR_HOOKS.escanor.onNormalAttackReceived(engine, attacker, target, escanorFormBeforeHit);
  // ผู้สังหารเมจ (characters/mageslayer.js): Fury — สูบพลังชีวิตและมอบ [ดูดซับเวท] ตามขั้น แล้วเคลียร์สต็อก
  //  (การขโมยพลังงานจากตราล่าเวททำที่ท่อดาเมจกลาง mageslayerMarkSteal ไปแล้ว)
  CHAR_HOOKS.mageslayer.onAttackPostDamage(engine, attacker, target, dmg);
  CHAR_HOOKS.ultraman_trigger.onAttackLanded(engine, attacker, target, {
    triggerCircleAtk, triggerMultiAtk, triggerZeperionAtk, triggerLightBonus,
  });
  // (รัก รักที่สุดเลย) (ฟุจิตะ โคโตเนะ, characters/kotone.js): ใช้แล้วหมดไปทันที และล้างกระปุกออมสินทั้งหมด
  CHAR_HOOKS.kotone.onAttackConsumeLove(engine, attacker);
  // เอจิ (characters/eiji.js): Smile for You ลงตัวเอง -> ฟื้นเลือด · Delete ลงเป้าหมาย -> มอบ "ผุพัง"
  CHAR_HOOKS.eiji.onAttackLanded(engine, attacker, target);
  // ฮารุกะ (characters/haruka.js): โอเมก้า — การโจมตีปกติแปะ "เลือดไหล" ให้เป้าหมาย 2 หน่วย
  const harukaBleedApplied = CHAR_HOOKS.haruka.onAttackLanded(engine, attacker, target);
  // มุยมิ: ดาบเก่าๆ/ดาบสะบั้นฟื้นฟูเมื่อโจมตีปกติ และใจที่ไม่ยอมแพ้ยืดเวลาท่าไม้ตาย
  const muimiAttackFx = CHAR_HOOKS.muimi.onAttackLanded(engine, attacker);
  // อาจารย์ ไบเลธ (characters/byleth.js): ดาบต้องสาปใช้ได้ครั้งเดียว -> สลายหลังหมัดนี้ · และถ้าเป้าหมายคือไบเลธที่แต้มน้อยสุด เตรียมโจมตีตอบ
  const bylethSwordUsed = CHAR_HOOKS.byleth.onAttackLanded(engine, attacker);
  CHAR_HOOKS.byleth.onAttacked(engine, attacker, target);
  // คอนเนอร์ RK800 (characters/conner.js): โจมตีปกติใส่คอนเนอร์ -> ผู้โจมตีเครียด +2
  //  และสกิลติดตัว 4 "การป้องกันตัว" โรล 15% ถ้าคนตีไม่ใช่คนเดิมกับครั้งก่อน (คิววีดีโอไว้ ดาเมจลงที่ postAttackFollowup)
  CHAR_HOOKS.conner.onConnerAttacked(engine, attacker, target);
  const connerCounterFired = CHAR_HOOKS.conner.onAttackedNormally(engine, attacker, target);
  // โมโรโบชิ ดัน (characters/dan.js): "ศิษย์" หันมาโจมตีปกติใส่ดัน -> เล่น dan_skill2.mp4 แล้วสวนคืน 3 หน่วย
  const danCounterFx = CHAR_HOOKS.dan.onAttackedNormally(engine, attacker, target);
  // ยุย (characters/yui.js): เยอรมันซูเพล็ก — สวนกลับผู้ที่โจมตีปกติใส่ (เล่นวีดีโอก่อนสรุปความเสียหาย)
  const yuiCounterFx = CHAR_HOOKS.yui.onAttackedNormally(engine, attacker, target);
  // แบทแมน (characters/bat_ben.js): ปืนติดรถ — ใช้แล้วหมดกระสุน (ดาเมจถูกบวกไปแล้วที่ computeAttackBase)
  const batGunFired = CHAR_HOOKS.bat_ben.consumeGun(engine, attacker);
  // อิปโป (characters/ippo.js): Uper Cut ลงผลตามว่าเป้าหมาย "มีเกราะก่อนโดนหมัดนี้" หรือไม่
  const ippoUpperFx = CHAR_HOOKS.ippo.resolveUpper(engine, attacker, target, ippoArmorBefore);
  // ผู้วิงวอน (characters/the_supplicant.js): ตราพิพากษาเดินหน้า — "ถูกโจมตี" และ "เป็นฝ่ายโจมตี" นับแยกกัน
  //  ยิงทีละฝั่งเพราะทั้งผู้โจมตีและผู้ถูกโจมตีอาจถือตราคนละใบพร้อมกันได้
  const supJudgeDefFx = CHAR_HOOKS.the_supplicant.onJudgeTrigger(engine, target, "ถูกโจมตี");
  const supJudgeAtkFx = CHAR_HOOKS.the_supplicant.onJudgeTrigger(engine, attacker, "เป็นฝ่ายโจมตี");
  // Dempsey Charge: เทหมดหน้าตัก -> จำนวนครั้งที่ต้องตีเพิ่ม (บัฟหายทั้งก้อนตรงนี้)
  if (CHAR_HOOKS.ippo.dempseyActive(attacker)) attacker.ippoExtraAtk = (attacker.ippoExtraAtk || 0) + CHAR_HOOKS.ippo.consumeCharge(engine, attacker);
  // Ginga Strium (ฮิคารุ, characters/hikaru.js): โจมตีโดนเป้าหมาย -> ติดลุกไหม้ให้เป้าหมาย / ถูกโจมตีขณะอยู่ในร่างนี้ -> ผู้โจมตีติดลุกไหม้สวนกลับ
  CHAR_HOOKS.hikaru.onAttackBurnApply(engine, attacker, target);
  const escanorAttackVideoQueued = CHAR_HOOKS.escanor.onAttackLanded(engine, attacker, target);
  CHAR_HOOKS.satoru.applyPassiveAttack(engine, attacker, target);
  const hisakawaAttackFx = CHAR_HOOKS.hisakawa_sister.onAttackLanded(engine, attacker, target);
  const ignisAttackFx = CHAR_HOOKS.ignis.onAttackLanded(engine, attacker, target);
  CHAR_HOOKS.hisakawa_sister.maybeDreamFollowup(engine, attacker, target);
  // ริต้า เบอร์นัล: อย่าอยู่เลย แกน่ะ! — เล่นวีดีโอก่อนสรุปผล + ลบ/แบนท่าไม้ตายเป้าหมาย (นับมิติมายาบรรเลงของคีตกวีด้วย)
  if (phenexPurgeAtk) {
    triggerCutscene(attacker, "phenexPurge");
    if (target.alive) {
      const purgeKey = SHIKI_CANCELABLE_ULTS.find((k) => (target.statuses[k] || 0) > 0);
      if (purgeKey) {
        const isBardDim = purgeKey === "bloodDim" || purgeKey === "soulDim";
        const ultName = shikiUltNameOf(target, purgeKey);
        delete target.statuses[purgeKey];
        if (purgeKey === "muimiTower") CHAR_HOOKS.muimi.onUltExpire(engine, target);
        if (target.statusAmt) delete target.statusAmt[purgeKey];
        if (purgeKey === "wither") clearWitherLines(target.id);
        if (purgeKey === "anata") { target.anataTargets = null; anataMusicSeq = 0; }
        if (purgeKey === "riddheguard") { const rb = riddheAllied(target); if (rb) delete rb.statuses.riddheward; }
        if (isBardDim) { target.bloodSection = 0; target.soulSection = 0; }
        lastLog.push(`🚫 ${attacker.name} อย่าอยู่เลย แกน่ะ! — ลบและปิดการใช้งาน ${ultName} ของ ${target.name} ทันที!`);
      } else if (resistActive(target)) {
        lastLog.push(`🛡️ ${target.name} ต้านสถานะผิดปกติ — อย่าอยู่เลย แกน่ะ! ไม่มีผล`);
      } else {
        target.statuses.phenexBanUlt = Math.max(target.statuses.phenexBanUlt || 0, PHENEX_BAN_ULT_TURNS);
        lastLog.push(`🚫 ${attacker.name} อย่าอยู่เลย แกน่ะ! — ${target.name} ไม่มีท่าไม้ตายทำงานอยู่ บังคับห้ามใช้ท่าไม้ตาย ${PHENEX_BAN_ULT_TURNS} เทิร์นแทน`);
      }
    }
  }
  // หนูจะทำให้พี่ตาสว่างเอง (อาริมะ มิยาโกะ): เล่นวีดีโอก่อนสรุปผล — เป้าหมายมีความสามารถสังหารทันทีติดตัวไหม
  //  มี -> ปิดใช้งานความสามารถนั้น 3 เทิร์น | ไม่มี -> "ย๊ากก!" พลังโจมตี +1 ลงหมัดนี้ทันที (ผ่าน miyakoAtkBonusOn ด้านบน)
  //  และตั้งสถานะ yaak ต่อไว้ให้ — ถ้ากำลังต่อคอมโบเพลงหมัดอาริมะอยู่ (miyakoCombo) yaak จะไม่ถูกล้างจนกว่าคอมโบจะจบ
  //  ทำให้ทุกหมัดที่เหลือในคอมโบเดียวกันได้โบนัสด้วย (นับทั้งคอมโบเป็นการโจมตีครั้งเดียวตามที่ตั้งใจไว้) — ไม่ใช่คอมโบก็เคลียร์ทิ้งหลังหมัดนี้ตามปกติ
  //  + เป้าหมายเกราะไม่ฟื้น 5 เทิร์น
  if (miyakoUltAtk) CHAR_HOOKS.miyako.resolveUltHit(engine, attacker, target);
  // โอเจอร์ชาร์จ (คุวากาตะ Ohger Finish, characters/kuwagata.js): โจมตีปกติ +1 แล้วมอบผุพังให้เป้าหมาย — ใช้แล้วหมดไป
  if (ohger) CHAR_HOOKS.kuwagata.onAttackConsumeOhger(engine, attacker, target);
  // ข้าขอบัญชา (คิชินามิ ฮาคุโนะ, characters/hakuno.js): โจมตีปกติติดผกผัน (ชาย) / เกราะไม่ฟื้น+ไร้ทางเยียวยา (หญิง) ให้เป้าหมาย
  if (hakunoInvertAtk) CHAR_HOOKS.hakuno.onAttackConsumeInvert(engine, attacker, target);
  if (hakunoNoRegenAtk) CHAR_HOOKS.hakuno.onAttackConsumeNoRegen(engine, attacker, target);
  CHAR_HOOKS.gambler.onAttackConsumeProfit(engine, attacker, profitAtk);
  // เสริมพลัง (Rejuvenation): ใช้แล้วหมดไปทันทีเมื่อได้โจมตี
  if (empowerAtk) {
    delete attacker.statuses.empower;
    lastLog.push(`💪 ${attacker.name} เสริมพลังจาก Rejuvenation — การโจมตีนี้ +1 (บัฟหมดลง)`);
  }
  // The Beat of Victory (โอกูริ Rework, characters/oguri.js): เป้าหมายที่ถูกโจมตีติด "เกินเยียวยา" + "ชะงัก"
  if (victoryAtk) {
    CHAR_HOOKS.oguri.applyVictoryEffect(engine, target);
  }
  // หอกลองกินัส (characters/eva13.js): โจมตีโดนเป้าหมาย -> โอกาสล็อกสกิลเป้าหมาย ใช้แล้วหมดไป
  if (spearAtk) CHAR_HOOKS.eva13.onAttackConsumeSpear(engine, attacker, target);
  // Beat Mode กันตาย (ครั้งเดียวต่อเกม): ทำงานทันทีเมื่อความเสียหายถึงตาย — ไม่ต้องอยู่ใน Beat Mode ก่อน
  //  หลังกันตายทำงาน -> เกราะจะไม่ฟื้นคืน + ภูมิดาเมจจากการแพ้ (แต่ครั้งต่อไปจะตายปกติ)
  const beatSaveFired = maybeBeatSave(target);
  maybeWakeKotone(target); // โคโตเนะหลับอยู่โดนโจมตี = สะดุ้งตื่น + ติด [โหมงานหนัก]
  // เชื่อมผล (Resonance patch 2.0.8): HP ที่เป้าหมายเสียจริงถูกแชร์ให้คู่เชื่อมเท่ากันแล้ว (ผ่าน loseHp)
  //  — ตรวจผลเพื่อแจ้งเตือน/กันตาย/ผลต่อเนื่องของคู่เชื่อม
  let linkedHit = null;
  if (linkedBuddy && linkedBuddy.hp < buddyHpBefore) {
    const shared = buddyHpBefore - linkedBuddy.hp;
    maybeBeatSave(linkedBuddy);
    maybeBeatMode(linkedBuddy);
    maybeEva3(linkedBuddy);
    maybeWakeKotone(linkedBuddy);
    linkedBuddy.wasAttacked = true;
    linkedHit = linkedBuddy;
    lastLog.push(`🔗 เชื่อมผล! ${linkedBuddy.name} รับความเสียหายตาม ${target.name} -${shared}`);
  }
  target.wasAttacked = true;
  target.phenexLastHitBy = attacker.id; // ริต้า เบอร์นัล: จำผู้โจมตีล่าสุด — ใช้เลือกเป้าปลดปล่อยความเจ็บปวดตอนตกรอบจริง
  // patch 2.1.3.5: ถูกโจมตีไม่ได้แต้มสกิลอีกต่อไป
  // Absorb shield (บานาจ) / Absorb Shield (ริดดี้): เกราะที่เสียไปจากการถูกโจมตี แปลงกลับเป็นพลังชีวิต
  const armorLost = armorBefore - target.armor;
  if (((target.statuses.absorb || 0) > 0 || (target.statuses.absorbplus || 0) > 0) && armorLost > 0) {
    const heal = healHp(target, armorLost);
    if (heal > 0) lastLog.push(`🛡️ ${target.name} Absorb shield แปลงเกราะที่เสีย ${armorLost} → พลังชีวิต +${heal}`);
  }
  // บานาจ (patch 2.1.2): Absorb shield — โล่ของเป้าหมายแตกระหว่างมีผล -> ฟื้นเลือดให้เจ้าของสกิล
  const bshieldLost = shieldBefore - target.shield;
  if ((target.statuses.bshield || 0) > 0 && target.bshieldOwnerId && bshieldLost > 0) {
    const owner = players[target.bshieldOwnerId];
    if (owner && owner.alive) {
      const heal = healHp(owner, bshieldLost);
      if (heal > 0) lastLog.push(`🛡️ Absorb shield — โล่ของ ${target.name} เสีย ${bshieldLost} → ฟื้นพลังชีวิตให้ ${owner.name} +${heal}`);
    }
  }
  // Beat Mode: ถ้าการโจมตีทำให้เลือดเหลือ < 3 -> เข้าประกายเขี้ยวปฏิปักษ์
  maybeBeatMode(target);
  // สกิลติดตัว 3 เอวา 13: ถ้าการโจมตีทำให้เลือดเหลือ <= 3
  maybeEva3(target);
  // มีดพก (ชิกิ, characters/shiki.js): การโจมตีปกติฟื้นเลือดให้ตัวเอง (คงอยู่ 2 เทิร์น)
  const knifeAtk = attacker.characterId === "shiki" && (attacker.statuses.knife || 0) > 0;
  const knifeHeal = knifeAtk ? CHAR_HOOKS.shiki.applyKnifeHeal(engine, attacker) : 0;
  // พี่จ๋าอยู่ไหน (อาริมะ มิยาโกะ): การโจมตีปกติฟื้นเลือดตัวเอง +1 ทุกครั้ง (คงอยู่จนกว่าจะได้ตี — รวมทุกครั้งของคอมโบ)
  const miyakoHealAtk = attacker.characterId === "miyako" && (attacker.statuses.miyakoHeal || 0) > 0;
  if (miyakoHealAtk) CHAR_HOOKS.miyako.applyHealOnHit(engine, attacker);
  // เทเปา (characters/tepeu.js): การโจมตีปกติมอบสถานะ "เส้นชีวิต" ให้เป้าหมาย +1 เสมอ (ไม่ต้องติดครุ่นคิดก็ได้)
  CHAR_HOOKS.tepeu.grantDeathlineOnAttack(engine, attacker, target);
  // เจ้าหญิงราก (characters/princess_shiki.js): สกิลติดตัว — ใครลงมือโจมตีเธอ คนนั้นติดเส้นชีวิต +1 ถาวร (สูงสุด 3)
  CHAR_HOOKS.princess_shiki.grantDeathlineOnAttacked(engine, attacker, target);
  // เจ้าหญิงราก: "ชักดาบ" ได้โจมตีจริงแล้ว -> ฟื้นพลังชีวิต +2
  const pshikiBladeHeal = CHAR_HOOKS.princess_shiki.applyBladeHeal(engine, attacker);
  // แบทแมน (characters/bat_ben.js): เข้ามาเลย — ความเสียหายที่ลงกับแบทแมน เกิดกับผู้โจมตีด้วยเท่ากัน
  const batReflectDmg = CHAR_HOOKS.bat_ben.applyTauntReflect(engine, attacker, target, dmg);
  // ฮารุกะ (characters/haruka.js): อมาซอน — ระหว่างโอเมก้า มีโอกาส 15% สวนกลับผู้โจมตี + สตั้นเทิร์นถัดไป
  const harukaCounterFx = CHAR_HOOKS.haruka.tryCounter(engine, attacker, target);
  // หอกแห่งแคสเซียส (เอวา 13 patch 2.2 alpha, characters/eva13.js): การโจมตีปกติฟื้นเลือดตามความเสียหายที่ทำได้ — ใช้แล้วหมดไป
  CHAR_HOOKS.eva13.onAttackConsumeCassius(engine, attacker, dmg);
  // ย๊ากก! (อาริมะ มิยาโกะ patch 2.2.1 alpha): พลังโจมตี +1 ต่อการโจมตี — ถ้าใช้ร่วมกับเพลงหมัดอาริมะ
  //  นับทั้งคอมโบเป็นการโจมตีครั้งเดียว จึงยังไม่ลบตรงนี้ (ให้บวก +1 ทุกหมัดในคอมโบ) — ลบจริงตอนคอมโบจบใน postAttackFollowup()
  // ---------- DoomGuy (characters/doomguy.js) ----------
  if (attacker.characterId === "doomguy") CHAR_HOOKS.doomguy.onAttackPostDamage(engine, attacker, target, dmg, doomLockonAtk);
  // ---------- สึงาชิ ทาคุโตะ (characters/takuto.js) ----------
  const takutoUlt2VideoQueued = attacker.characterId === "takuto" ? CHAR_HOOKS.takuto.onAttackPostDamage(engine, attacker, dmg) : false;
  // เนตรมารแห่งความมรณะ (ชิกิ, characters/shiki.js): โจมตีปกติระหว่างท่าไม้ตายทำงาน (แต่เส้นตายยังไม่ถึง 6) -> รีเซ็ตเส้นตายเป้าหมาย
  const deathlineReset = CHAR_HOOKS.shiki.resetDeathlineOnHit(engine, attacker, target);
  if (isRival) {
    attacker.ntdRivalId = null;
    if (!attacker.ntdTarget) delete attacker.seen.banagherPassive2;
    lastLog.push(`🥺⚡ ${attacker.name} ฉันไม่อยากให้เราต้องมาสู้กัน — แก้แค้น ${target.name} ด้วย NT-D +1 -${dmg} (ลดเกราะก่อน) — สงบลง`);
  }
  if (isRevenge) {
    attacker.ntdTarget = null;
    delete attacker.seen.ntd;
    lastLog.push(`⚡ ${attacker.name} แก้แค้น ${target.name} ด้วย NT-D +1 -${dmg} (ลดเกราะก่อน) — NT-D สงบลง`);
  } else if (!isRival) {
    lastLog.push(`${attacker.name} โจมตี ${target.name} -${dmg} (ลดเกราะก่อน)`);
  }

  // Ginga / ลำแสงสโตเรียม (ฮิคารุ, characters/hikaru.js): ตีหมู่ผู้เล่นอื่นที่ไม่ใช่เป้าหมาย
  CHAR_HOOKS.hikaru.onAttackGingaSplash(engine, attacker, target, ginga);
  CHAR_HOOKS.hikaru.onAttackStoriumSplash(engine, attacker, target, storiumAtk);
  // Beam Magnum Plus (ริดดี้): เปลี่ยนการโจมตีปกติเป็นตีหมู่ — คนที่ไม่ใช่เป้าหมายเสียเกราะ 1 หน่วย
  if (beamPlusAtk) {
    const splashHit = [];
    for (const o of alivePlayers()) {
      if (o.id === attacker.id || o.id === target.id) continue;
      dealArmorOnly(o, 1);
      o.wasAttacked = true;
      splashHit.push(o);
    }
    if (splashHit.length) lastLog.push(`🔫 Beam Magnum Plus! ${attacker.name} ตีหมู่ — ผู้เล่นอื่นเสียเกราะ -1`);
  }
  // แสงที่ไม่อยู่เพียงลำพัง (ท่าไม้ตาย 2 patch 2.1.2): ซ้ำเข้าไปอีก 3 หน่วย ตีหมู่ทุกคนที่เหลือ (ยกเว้นริดดี้พันธมิตร)
  if (unibeam2Atk) {
    const splashHit = [];
    for (const o of alivePlayers()) {
      if (o.id === attacker.id || o.id === target.id) continue;
      if (unibeam2Ally && o.id === unibeam2Ally.id) continue;
      dealMixed(o, BANAGHER_ULT2_SPLASH_DMG);
      maybeBeatSave(o);
      maybeBeatMode(o);
      maybeEva3(o);
      maybeWakeKotone(o);
      o.wasAttacked = true;
      splashHit.push(o);
    }
    if (splashHit.length) lastLog.push(`💫 แสงที่ไม่อยู่เพียงลำพัง! ${attacker.name} ตีหมู่ — ${splashHit.map((o) => o.name).join(", ")} รับความเสียหาย -${BANAGHER_ULT2_SPLASH_DMG}`);
  }

  // การหลับไหลอันไม่สิ้นสุด (โอเบรอน patch 1.7.6): ยามกลางวัน การโจมตีปกติติด "ยามฟ้าสาง" +1 แก่เป้าหมาย
  //  (สะสมสูงสุด 5 — คนที่กำลังหลับไหลไม่ติดเพิ่ม — เดิมค้างเพดานเก่า 3 จากตอนแก้จุดอื่นเป็น 5 แล้วไม่ครบ)
  let dawnApplied = false;
  if (oberonDayAtk && target.alive && !((target.statuses.sleep || 0) > 0) && !resistActive(target)) {
    target.statuses.dawn = Math.min(5, (target.statuses.dawn || 0) + 1);
    dawnApplied = true;
    lastLog.push(`🌅 การหลับไหลอันไม่สิ้นสุด: ${target.name} ติดยามฟ้าสาง +1`);
  }

  // Ginga no Uta (ฮิคารุ, characters/hikaru.js): กำจัดเป้าหมายได้ขณะอยู่ในร่าง Ginga Strium -> ต่ออายุ +1 เทิร์น
  CHAR_HOOKS.hikaru.onAttackExtendOnKill(engine, attacker, target, hpBefore, gingastriumAtk);

  // NT-D (บานาจเป็นเป้า): ตั้งบัฟแก้แค้น "คนล่าสุด" — แสดงฉากเมื่อเปลี่ยนเป้าเท่านั้น
  if (target.characterId === "banagher" && attacker.alive) {
    const changed = target.ntdTarget !== attacker.id;
    target.ntdTarget = attacker.id;
    target.seen.ntd = true;
    if (changed) triggerCutscene(target, "ntd");
    // ฉันไม่อยากให้เราต้องมาสู้กัน (สกิลติดตัว 2 patch 2.1.2): เปลี่ยนร่างเป็น NT-D + ริดดี้ไม่ใช่พันธมิตร -> ล็อกเป้าแก้แค้นใส่ริดดี้เพิ่มอีกทาง
    if (changed) {
      const rival = alivePlayers().find((o) => o.characterId === "riddhe" && !riddheAllied(o));
      if (rival && target.ntdRivalId !== rival.id) {
        target.ntdRivalId = rival.id;
        target.seen.banagherPassive2 = true;
        triggerCutscene(target, "banagherPassive2");
        lastLog.push(`🥺 ${target.name} ฉันไม่อยากให้เราต้องมาสู้กัน — ล็อกเป้าแก้แค้นใส่ ${rival.name} เพิ่มอีกทาง (แรง +1 หน่วยเหมือน NT-D System)`);
      }
    }
  }

  // ---------- ริดดี้ (characters/riddhe.js): สกิลติดตัว 1 บานาจโจมตีใส่เรา -> ท่าไม้ตาย 1 ฟรี / คู่พันธมิตรโจมตีกันเอง ----------
  CHAR_HOOKS.riddhe.onAttackedByBanagher(engine, target);
  CHAR_HOOKS.riddhe.checkAllyFriendlyFire(engine, attacker, target, hpBefore, armorBefore);

  // สกิลที่มีผลกับการโจมตีครั้งนี้ (โชว์ใต้อนิเมชัน แยกฝั่งชัดเจน: atk = ฝั่งโจมตี | def = ฝั่งป้องกัน)
  const fxSkills = [];
  const addFx = (x, side) => { if (x) fxSkills.push({ ...x, side }); };
  for (const fx of hisakawaAttackFx || []) addFx(fx, fx.side || "atk");
  for (const fx of ignisAttackFx || []) addFx(fx, fx.side || "atk");
  if (beam) addFx(skillByStatus(attacker, "beam"), "atk");
  if (ohger) addFx(skillByStatus(attacker, "ohger"), "atk");
  if (rachanAtk) addFx({ name: `คิงโอเจอร์ +${rachanAtk}`, img: OHGER_FORM, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (fourthAtk) addFx({ name: `Fourth Impact +${fourthAtk}`, img: TRANSFORMS.fourth.img, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (ginga) addFx(skillByStatus(attacker, "ginga"), "atk");
  if (gingastriumAtk) addFx({ name: `Ginga Strium${lastStanding ? " +1 (คู่ต่อสู้คนเดียว)" : ""}`, img: HIKARU_STRIUM_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (spearAtk) addFx(skillByStatus(attacker, "spear"), "atk");
  if (veilAtk) addFx({ name: "ม่านแห่งราตรี +1", img: "/characters/oberon/oberon_skill1.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // empower เป็นบัฟกลาง — คีตกวี (Rejuvenation) และผู้สังหารเมจ (Fury ขั้น 3) ใช้ร่วมกัน จึงเลือกภาพตามผู้ถือบัฟ
  if (empowerAtk) addFx({ name: "เสริมพลัง +1", img: attacker.characterId === "bard" ? BARD_CRIMSON_IMG : displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (oberonZero < 0 && !veilAtk) addFx({ name: "การหลับไหลอันไม่สิ้นสุด (พลังโจมตี 0)", img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (dawnApplied) addFx({ name: "การหลับไหลอันไม่สิ้นสุด (ยามฟ้าสาง +1)", img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (profitAtk > 0) addFx({ name: `กำไรเท่าตัวโว้ย +${profitAtk} (ทะลุเกราะ)`, img: "/characters/gambler/gambler_skill2.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (appleAtk > 0) addFx({ name: `เอาไปสิ +${appleAtk} (บัฟมอบของ)`, img: "/characters/appleguy/appleguy_skill2.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (tigerAtk) addFx({ name: "เสือนอนกิน +1", img: "/characters/broadband_man/broadband_man_skill1.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (kotoneLove) addFx({ name: `รัก รักที่สุดเลย +${kotoneLoveDmg} (กระปุกออมสิน)`, img: "/characters/kotone/rework/KotonePFP.png", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (partnerAtk) addFx({ name: "คู่สัญญา +1 (สนใจใช้บริการเราไหม)", img: "/characters/broadband_man/broadband_man_skill3.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (contractGuard) addFx({ name: "ชำระค่าบริการ (ความเสียหายลด 1)", img: "/characters/broadband_man/broadband_man.jpg", by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (paradiseAtk && !isRevenge) addFx(skillByStatus(attacker, "paradise"), "atk");
  if (isRevenge) addFx({ name: "NT-D System แก้แค้น +1", img: TRANSFORMS.ntd.img, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (isRival) addFx({ name: "ฉันไม่อยากให้เราต้องมาสู้กัน +1", img: TRANSFORMS.ntd.img, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (unibeam2Atk) addFx(skillByStatus(attacker, "unibeam2"), "atk");
  if (attackerBeat) addFx({ name: "ประกายเขี้ยวปฏิปักษ์ (ทะลุเกราะ)", img: OHGER_FORM, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (shieldBefore > target.shield) addFx({ name: "โล่ป้องกัน (กันความเสียหาย)", img: null, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if ((target.statuses.absorb || 0) > 0 && armorLost > 0) addFx(skillByStatus(target, "absorb"), "def");
  if (beatSaveFired) {
    // maybeBeatSave ใช้ร่วมกันทั้งคุวากาตะ (ประกายเขี้ยวปฏิปักษ์) และทาคุโตะ (ฉันยัง...มองเห็นอยู่!!!) — เลือกชื่อ/ภาพให้ตรงตัวละคร
    const takutoSaveFired = target.characterId === "takuto";
    addFx({ name: takutoSaveFired ? "ฉันยัง...มองเห็นอยู่!!! (กันตาย)" : "ประกายเขี้ยวปฏิปักษ์ (กันตาย)", img: takutoSaveFired ? displayImg(target) : OHGER_FORM, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  }
  if ((target.statuses.absorbplus || 0) > 0 && armorLost > 0) addFx(skillByStatus(target, "absorbplus"), "def");
  if (shradeAtk > 0) addFx({ name: `รวมร่างทำนองเพลง +${shradeAtk}`, img: SHRADE_SPADA_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (shradeDayOff) addFx({ name: "รวมร่างทำนองเพลง (ตอนเช้า — โบนัสโจมตีไม่ทำงาน)", img: SHRADE_SPADA_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // เรียวกิ ชิกิ
  if (knifeAtk) addFx({ name: `มีดพก (ฟื้นเลือด +${knifeHeal})`, img: "/characters/shiki/shiki_skill1.webp", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (deathlineReset) addFx({ name: "เนตรมารแห่งความมรณะ (เส้นชีวิตถูกรีเซ็ต)", img: SHIKI_DEATH_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // Bard: คุ้มครอง / ขัดแย้ง / เชื่อมผล
  if (guardAmt > 0) addFx({ name: `คุ้มครอง (ความเสียหายลด ${guardAmt})`, img: BARD_CRIMSON_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (bardDiscord) addFx({ name: "Discord — ขัดแย้ง (+1 ดาเมจ)", img: BARD_JADE_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "atk");
  if (linkedHit) addFx({ name: `เชื่อมผล (${linkedHit.name} -${buddyHpBefore - linkedHit.hp})`, img: BARD_JADE_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  // โอกูริ แคป (Rework)
  if (oguriGoldAtk > 0) addFx({ name: `ยุคทอง +${oguriGoldAtk}`, img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (victoryAtk) addFx({ name: `The Beat of Victory +${OGURI_ULT_ATK_BONUS} (เป้าหมายติดเกินเยียวยา+ชะงัก)`, img: TRANSFORMS.victorybeat.img, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (fullBelly) addFx({ name: "เต็มอิ่ม (ดาเมจ -1)", img: displayImg(target), by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  // การ์ดแดงครบ 3 ใบตอนเปิดไพ่ (ระบบกองการ์ดกลาง)
  if (cardAtkBonus > 0) addFx({ name: `การ์ดแดงครบ 3 ใบ +${cardAtkBonus}`, img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (heroSwordAtk > 0) addFx({ name: "ดาบผู้กล้า +2", img: YUUKI_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // สถานะพื้นฐาน patch 2.0.8
  if (mightAtk > 0) addFx({ name: `เสริมพลัง +${mightAtk}`, img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (weakAtk > 0) addFx({ name: `อ่อนแอ -${weakAtk}`, img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // ยูนะ
  if (yunaLongingAtk > 0) addFx({ name: `Longing (ยูนะ) +${yunaLongingAtk}`, img: YUNA_IMG, by: attacker.name, color: YUNA_COLOR }, "atk");
  if (yunaBeatBark) addFx({ name: "Break Beat Bark! (ยูนะ) +1", img: YUNA_IMG, by: attacker.name, color: YUNA_COLOR }, "atk");
  if (fragileAmt > 0) addFx({ name: `เปราะบาง (+${fragileAmt} ดาเมจ)`, img: displayImg(target), by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (yunaDeleteAmt > 0) addFx({ name: `Delete (ยูนะ) +${yunaDeleteAmt}`, img: YUNA_IMG, by: target.name, color: YUNA_COLOR }, "def");
  if (yunaSmileAmt > 0) addFx({ name: `Smile for You (ยูนะ) -${yunaSmileAmt}`, img: YUNA_IMG, by: target.name, color: YUNA_COLOR }, "def");
  if (shikiWither && witherLines > 0) addFx({ name: `ความตายที่โรยรา — เส้นชีวิตแปรเป็นดาเมจ (สูงสุดรวม ${SHIKI_WITHER_ATK_CAP})`, img: SHIKI_WITHER_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  // ริดดี้ มาร์เซนาส (patch 2.0.9)
  if (riddheUltBonus > 0) addFx({
    name: beamPlusAtk && riddheNtdOn ? "Beam Magnum Plus + NT-D (+1 ตีหมู่)" : beamPlusAtk ? "Beam Magnum Plus +1 (ตีหมู่)" : "NT-D System +1",
    img: beamPlusAtk ? "/characters/riddhe/skill2/banshee_skill2.jpg" : RIDDHE_NTD_IMG,
    by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888",
  }, "atk");
  if (riddheP1Atk) addFx({ name: "จะทำให้ฉันหน้าสมเพชอีกนานแค่ไหน +1", img: displayImg(attacker), by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (riddheAvAtk) addFx({ name: "อย่าทิ้งฉันไป +1 (ถาวร)", img: RIDDHE_NTD2_IMG, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (riddheTaunted) addFx({ name: "Absorb Shield (ล่อเป้ามาที่ตัวเอง)", img: "/characters/riddhe/skill1/banshee_skill1.webp", by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (triggerCircleAtk) addFx({ name: "Circle Arms — แสงสว่าง +2 / ฟื้นชีวิต +2", img: "/characters/ultraman_trigger/skill1/trigger_skill1.webp", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (triggerMultiAtk) {
    const multiText = triggerMultiLowHpPenalty ? "Multi Sword Finish: HP ต่ำกว่า 5 ดาเมจเหลือ 2" : triggerMultiHighestHp ? "Multi Sword Finish +1 / แสงสว่างเพิ่ม +2" : "Multi Sword Finish / แสงสว่างเพิ่ม +2";
    addFx({ name: multiText, img: "/characters/ultraman_trigger/skill2/trigger_skill2.png", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  }
  if (triggerZeperionAtk) addFx({ name: `ลำแสง Zeperion +${triggerLightBonus} จากแสงสว่าง`, img: "/characters/ultraman_trigger/skill3/trigger_skill3.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (triggerDarkAtk) addFx({ name: `ความมืดที่ย้อมอนาคต +${triggerDarkAtk}`, img: "/characters/ignis/trigger_dark.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (phenexTaunted) addFx({ name: "ไม่อยากให้ใครต้องเจ็บปวด (ล่อเป้ามาที่ตัวเอง)", img: PHENEX_NTD_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (batTaunted) addFx({ name: "เข้ามาเลย (ล่อเป้ามาที่ตัวเอง)", img: BAT_SKILL3_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (batReflectDmg > 0) addFx({ name: `เข้ามาเลย — ความเสียหายเกิดกับผู้โจมตีด้วย -${batReflectDmg}`, img: BAT_SKILL3_IMG, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  // ---------- มิซึซาว่า ฮารุกะ (characters/haruka.js) ----------
  if (harukaPunishFx.punishStacks > 0) addFx({ name: `จงไปสู่สุขติ — ระเบิดเลือดไหล +${harukaPunishFx.punishStacks}`, img: CHAR_HOOKS.haruka.IMG.skill2, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (ippoUpperFx) addFx({ name: ippoUpperFx.kind === "decay" ? "Uper Cut — ผุพัง 3 เทิร์น" : "Uper Cut — สตั้นเทิร์นหน้า", img: CHAR_HOOKS.ippo.IMG.skill2, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (supJudgeDefFx) addFx({ name: `${supJudgeDefFx.kind === "mercy" ? "ความเมตตา" : "คำพิพากษา"} ${supJudgeDefFx.n}/${CHAR_HOOKS.the_supplicant.JUDGE_NEED}`, img: CHAR_HOOKS.the_supplicant.IMG.skill3, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (supJudgeAtkFx) addFx({ name: `${supJudgeAtkFx.kind === "mercy" ? "ความเมตตา" : "คำพิพากษา"} ${supJudgeAtkFx.n}/${CHAR_HOOKS.the_supplicant.JUDGE_NEED}`, img: CHAR_HOOKS.the_supplicant.IMG.skill3, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (batGunFired) addFx({ name: `ปืนติดรถ +${CHAR_HOOKS.bat_ben.GUN_BONUS}`, img: CHAR_HOOKS.bat_ben.IMG_GUN, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (yuiCounterFx) addFx({ name: `เยอรมันซูเพล็ก — ทุ่มสวนกลับ -${yuiCounterFx.dmg}`, img: CHAR_HOOKS.yui.IMG.skill2, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (danCounterFx) addFx({ name: `นายทำให้ฉันผิดหวัง — สวนกลับศิษย์ -${danCounterFx.dmg}`, img: CHAR_HOOKS.dan.IMG.skill2, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (connerCounterFired) addFx({ name: "การป้องกันตัว — สวนกลับผู้โจมตีทั้งสองคน", img: CHAR_HOOKS.conner.IMG.base, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (bylethSwordUsed > 0) addFx({ name: `ดาบต้องสาป +${bylethSwordUsed}`, img: CHAR_HOOKS.byleth.IMG.skill2, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (harukaBleedApplied > 0) addFx({ name: `โอเมก้า — เลือดไหล +${harukaBleedApplied}`, img: CHAR_HOOKS.haruka.IMG.ult, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (muimiTowerAtk > 0) addFx({ name: `ดาบสะบั้น — พลังโจมตี +${muimiTowerAtk}`, img: CHAR_HOOKS.muimi.IMG.skill3, by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");
  if (muimiAttackFx) addFx({
    name: muimiAttackFx.mode === "tower"
      ? `ดาบสะบั้น — ฟื้นพลังชีวิต +${muimiAttackFx.hp}${muimiAttackFx.extended ? " · ยืดเวลา +1 เทิร์น" : ""}`
      : `ดาบเก่าๆ — ฟื้นพลังชีวิต +${muimiAttackFx.hp} · แต้มสกิล +${muimiAttackFx.sp}`,
    img: muimiAttackFx.mode === "tower" ? CHAR_HOOKS.muimi.IMG.skill3 : CHAR_HOOKS.muimi.IMG.skill2,
    by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888",
  }, "atk");
  if (harukaCounterFx) addFx({ name: `อมาซอน — สวนกลับ -${harukaCounterFx.dmg}${harukaCounterFx.bled > 0 ? ` + เลือดไหล ${harukaCounterFx.bled}` : ""}${harukaCounterFx.stunned ? " + สตั้นเทิร์นหน้า" : ""}`, img: CHAR_HOOKS.haruka.IMG.base, by: target.name, color: POSITION_COLORS[target.position] || "#888" }, "def");
  if (pshikiBladeHeal > 0) addFx({ name: `อืม ฉันเข้าใจแล้ว (ฟื้นเลือด +${pshikiBladeHeal})`, img: "/characters/princess_shiki/p_shiki_skill1.jpg", by: attacker.name, color: POSITION_COLORS[attacker.position] || "#888" }, "atk");

  // อนิเมชันบอกว่าใครตีใคร
  lastAttack = {
    id: ++attackSeq,
    byName: attacker.name, byImg: displayImg(attacker), byColor: POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined, // DoomGuy: อาวุธที่ใช้ยิงตอนนี้ (เสียงยิงฝั่ง client)
        byAttackSound: attackSoundOf(attacker), // เสียงโจมตีปกติเฉพาะตัว (ผู้สังหารเมจ / ฮารุกะระหว่างโอเมก้า)
    targetName: target.name, targetImg: displayImg(target), targetColor: POSITION_COLORS[target.position] || "#888",
    dmg, aoe: ginga || beamPlusAtk || unibeam2Atk || storiumAtk, revenge: isRevenge, skills: fxSkills,
    fxMs: (fxSkills.length ? ATTACKFX_TIME + 2 : ATTACKFX_TIME) * 1000,
  };
  const showAttackFx = () => {
    gameState = "ATTACKING";
    // มีข้อมูลสกิลให้อ่าน -> ยืดเวลาอนิเมชันให้อ่านทัน
    // หัวใจฆาตกร (นานายะ ชิกิ): เนตรมารพลาดสังหาร -> เปิดโอกาสโจมตีซ้ำแทนการจบเทิร์นตรงๆ
    startPhaseTimer(fxSkills.length ? ATTACKFX_TIME + 2 : ATTACKFX_TIME, () => runCutsceneQueue(() => postAttackFollowup(attacker)));
    broadcastState();
  };
  // Beam Magnum Plus (ริดดี้ patch 2.1.1) / Beam Magnum + แสงที่ไม่อยู่เพียงลำพัง (บานาจ patch 2.1.2) / ลำแสงสโตเรียม (ฮิคารุ patch 2.1.3)
  //  / อย่าอยู่เลย แกน่ะ! (ริต้า เบอร์นัล patch 2.1.6) / ฉันยัง...มองเห็นอยู่!!! กันตาย + อย่างนายน่ะ จะไปเข้าใจอะไร (สึงาชิ ทาคุโตะ patch 2.2.4):
  //  เล่นวีดีโอที่ค้างคิวก่อน แล้วค่อยขึ้นสรุปความเสียหาย
  //  (ปกติทุกท่าอื่นจะขึ้นสรุปความเสียหายก่อนแล้วค่อยเล่นวีดีโอค้างคิวตอนจบ — ท่าเหล่านี้กลับลำดับเฉพาะตัว)
  if ((yuukiAttackVideoQueued || isYuuki(target) || beamPlusAtk || (beam && attacker.characterId === "banagher") || unibeam2Atk || storiumAtk || phenexPurgeAtk || miyakoUltAtk || triggerMultiAtk || triggerZeperionAtk || escanorAttackVideoQueued || (beatSaveFired && target.characterId === "takuto") || takutoUlt2VideoQueued || eijiSwordFx.videoQueued || harukaPunishFx.videoQueued || (harukaCounterFx && harukaCounterFx.videoQueued) || (danCounterFx && danCounterFx.videoQueued) || (yuiCounterFx && yuiCounterFx.videoQueued) || batGunFired) && cutsceneQueue.length) runCutsceneQueue(showAttackFx);
  else showAttackFx();
}

// ---- ปิดรอบ ----
function finishYuukiVictory() {
  clearPhaseTimer();
  winningTeamId = null;
  attackerId = null;
  yuukiAttackTargets = [];
  gameState = "GAMEOVER";
  timeLeft = 0;
  broadcastState();
}

function endTurn() {
  // ถ้าเทิร์นกำลังจะจบโดยยังไม่ได้ใช้สิทธิ์โจมตีเพิ่มของไบเลธ ให้เปิดสิทธิ์ตรงนี้
  // ครอบคลุมผู้ชนะไม่ได้โจมตี, โจมตีพลาด/ถูกลบล้าง และ path ที่ไม่ผ่าน postAttackFollowup
  if (startBylethGraduationAttack()) return;
  clearPhaseTimer();
  attackerId = null;

  // สกิลติดตัว 1 เอวา 13 (ไม่สามารถแก้ไขอะไรได้อีกแล้ว): กำลังจะถูกกำจัดขณะ fourth impact ยังอยู่
  //  -> เช็คก่อนลดเทิร์นสถานะ (ดาเมจถึงตายเกิดตอน fourth ยังไม่หมดอายุ)
  const evaBlasts = Object.values(players).filter(
    (p) => p.alive && p.hp <= 0 && p.characterId === "eva13" && (p.statuses.fourth || 0) > 0
  );

  // แด่เพื่อนรักของฉัน (ชเรด เอลัน): ชาร์จจะครบกำหนดเมื่อจบเทิร์นนี้ (เหลือ 1 ก่อนลดสถานะ)
  //  — เก็บไว้ก่อนลูปลดเทิร์นสถานะ แล้วปลดปล่อยหลังเช็คคนตายรอบแรก (ตายก่อนปลดปล่อย = ไม่ระเบิด)
  const shradeBlasts = Object.values(players).filter(
    (p) => p.alive && p.characterId === "shrade_elan" && (p.statuses.shradecharge || 0) === 1
  );

  // กระชากสายแลน (เจ้าแห่งเน็ตบ้าน): คืนบัฟที่ถูกถอดไว้ชั่วคราว — เทิร์นถัดไปกลับมามีผลต่อ
  //  (คืนก่อนลูปลดเทิร์นสถานะ = บัฟถูกนับเวลาเทิร์นนี้ไปด้วยตามสเปค "นับเทิร์นนี้")
  CHAR_HOOKS.broadband_man.onEndTurnUnplugRestore(engine);

  // ---------- ริดดี้ (characters/riddhe.js): ฉันจะไม่ยอมสูญเสียใครไปอีก — เกราะ (เรา+บานาจ) เสียรวมถึง 3 ระหว่างท่าทำงาน -> ฟื้นเกราะให้ทั้งคู่ +2 ----------
  CHAR_HOOKS.riddhe.onEndTurnGuardArmorTick(engine);

  // หลบหลีก (สถานะ Universal): แต่ละสแตคหมดอายุเองตามเทิร์นของตัวเอง / โชคลาภ (Bard): ไม่ได้ใช้ 3 เทิร์นติดกัน = หมดฤทธิ์
  // คอนเนอร์ RK800: การไล่ล่าล่มกลางคัน (เช่นคอนเนอร์ตาย) -> ปลดธง "ถูกแช่" ของทุกคนเสมอ
  CHAR_HOOKS.conner.cleanupChase(engine);
  for (const p of Object.values(players)) {
    // คอนเนอร์ RK800 (สกิลติดตัว 1 สืบสวน): ความเครียดลดลง 1 ต่อเทิร์น (ไพ่แตกในเทิร์นนี้ลดเพิ่มอีก 1)
    //  ต้องอ่านค่า p.busted ก่อน dealRound() รีเซ็ต — จึงอยู่ท้ายเทิร์นตรงนี้
    CHAR_HOOKS.conner.onEndTurnDecay(engine, p);
    CHAR_HOOKS.escanor.onEndTurnSolar(engine, p);
    tickEvadeStacks(engine, p);
    CHAR_HOOKS.bard.onEndTurnIdleDecay(engine, p);
    // RS-Hopper (characters/eva13.js): ฟื้น 1 ชาร์จทุกๆ 3 เทิร์น (สูงสุด 3)
    if (p.characterId === "eva13") CHAR_HOOKS.eva13.onRoundStartRegen(engine, p);
    // DoomGuy (characters/doomguy.js): Weapon — จบเทิร์น บังคับสลับอาวุธใหม่ทันที — ไม่ทำงานระหว่างถือ Crucible
    CHAR_HOOKS.doomguy.onRoundStartWeaponCycle(engine, p);
  }

  let moonCellEndedBy = null; // MOON*CELL (คิชินามิ ฮาคุโนะ): หมดเวลาแล้ว — คืนบัฟ/ดีบัฟหลังลูปนี้จบ (กันคืนแล้วโดนลดเทิร์นซ้ำในลูปเดียวกัน)
  for (const p of Object.values(players)) {
    for (const k of Object.keys(p.statuses || {})) {
      if (k === "dawn") continue;   // ยามฟ้าสาง (โอเบรอน): สแตคถาวร จนกว่า Vortigern จะล้าง
      if (k === "chill") continue;  // ชิวๆครับน้องๆ (Apple guy): คงอยู่จนกว่าจะถูกโจมตี ไม่ลดเทิร์น
      // โหมงานหนัก (โคโตเนะ patch พิเศษ): คงอยู่ 3 เทิร์นแล้วหมดเอง (หรือลบก่อนด้วย Sleeping time ตอนกลางคืน)
      // ksleep (Sleeping time patch 2.1.3): นับถอยหลังตามปกติ 2 เทิร์นตายตัว — ตื่นเองแล้วรับ [เช้าที่สดใส] (ดูด้านล่าง)
      if (k === "hbleed") continue;  // เลือดไหล (patch 2.5): ลดลงเองในตอนต้นเทิร์นหลังสร้างผล (tickBleed) ไม่ลดซ้ำที่นี่
      if (k === "hburn") continue;   // ลุกไหม้ (ฮิคารุ patch 2.1.3): ลดลงเองในตอนต้นเทิร์นหลังสร้างผล (ดูด้านล่าง) ไม่ลดซ้ำที่นี่
      if (k === "melody") continue;  // ท่วงทำนอง (ชเรด เอลัน): สแตคถาวร สะสมจนครบ 5 เพื่อรวมร่าง
      if (k === "star") continue;    // ดวงดาว (สึงาชิ ทาคุโตะ): สแตคถาวร สะสมจนครบ 5 เพื่อฉันคว้ามันได้แล้ว
      if (k === "emeraude" || k === "saphir" || k === "lance") continue; // Star Sword / หอกผู้พิชิต (สึงาชิ ทาคุโตะ): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "takutoThirdAtk") continue; // พิชิตแสงดาว (สึงาชิ ทาคุโตะ): คงอยู่จนกว่าจะได้ลุ้นโจมตีครั้งที่ 3 (ไม่ลดเทิร์น)
      if (k === "doomCrucible") continue; // Crucible (ดูมกาย patch 2.2 new): คงอยู่จนกว่าจะได้โจมตี 1 ครั้ง (ไม่ลดเทิร์น)
      if (k === "doomDrain") continue; // [โดนดูด] (ดูมกาย, Plasma Rifle): tickDrain() นับถอยหลัง/ลบเองแล้ว ไม่ให้ลูปนี้ลดซ้ำ
      if (k === "doomExplode" || k === "doomLockon") continue; // [ระเบิด]/[ล็อคเป้า] (ดูมกาย, Combat Shotgun/Heavy Cannon): ค้างอยู่จนกว่าจะโดนโจมตีใช้จริง ไม่ลดเทิร์นเอง
      if (k === "fortune") continue; // โชคลาภ (Bard): คงอยู่จนกว่าจะจั่วไพ่ครั้งถัดไป (หมดอายุเองถ้าไม่ใช้ 3 เทิร์น — ดูด้านบน)
      if (k === "linked") { CHAR_HOOKS.bard.tickLinks(p); continue; } // Resonance: นับอายุแยกตาม Bard เจ้าของบทเพลง
      if (k === "rsHopper") continue; // RS-Hopper (เอวา 13): สแตคชาร์จ ไม่ใช่ตัวนับเทิร์น — ฟื้นเองทุก 3 เทิร์น (ดูด้านบน)
      if (k === "cassius") continue; // หอกแห่งแคสเซียส (เอวา 13): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "yaak") continue;    // ย๊ากก! (อาริมะ มิยาโกะ): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "spear") continue;   // หอกลองกินัส (เอวา 13 patch 2.2 alpha): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "ohger") continue;   // โอเจอร์ชาร์จ (คุวากาตะ patch 2.2 alpha): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "evade") continue;   // หลบหลีก (สถานะ Universal): p.statuses.evade เป็นแค่ mirror ของ p.evadeStacks.length — ตัวจริงหมดอายุผ่าน tickEvadeStacks (ดูด้านบน)
      if (k === "empower") continue; // เสริมพลัง (Rejuvenation): คงอยู่จนกว่าจะได้โจมตี (ไม่ซ้อนทับ)
      if (k === "miyakoHeal" || k === "miyakoCombo" || k === "miyakoUlt") continue; // อาริมะ มิยาโกะ: คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น) — miyakoUlt เดิมหลุดหายไปเองหลัง 1 เทิร์นถ้ายังไม่ได้โจมตี (บัค)
      if (k === "hakunoInvertReady" || k === "hakunoNoRegenReady") continue; // คิชินามิ ฮาคุโนะ: คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น)
      if (k === "kotoneLove") continue;  // โคโตเนะ (รัก รักที่สุดเลย): คงอยู่จนกว่าจะได้โจมตี (ไม่ลดเทิร์น — เหมือน empower)
      if (k === "kotoneReady") continue;  // โคโตเนะ [ความพร้อม]: สแตคถาวร สะสมจนครบ 4 เพื่อเข้าร่าง [พร้อมลุย]
      if (k === "kready") continue;       // โคโตเนะ ร่าง [พร้อมลุย]: อยู่จนกว่าจะปล่อยท่าไม้ตายในร่าง (ไม่ลดเทิร์น)
      if (k === "deathline") continue; // เส้นตาย (ชิกิ): สแตคถาวร จนกว่าจะถูกชิกิโจมตีปกติระหว่างท่าไม้ตาย
      if (k === "tepeuCook" || k === "tepeuPonder") continue; // เทเปา: ป้ายสถานะแสดงผลเฉยๆ — engine ลบเองตาม tepeuCookTurns/tepeuPonderTurns (ดูด้านล่าง)
      // ---------- ไค ชิซากิ (kai) ----------
      if (k === "kaiCreation" || k === "kaiPunishment") continue; // รังสรรค์/ลงทัณฑ์: มาร์กถาวร ไม่ลดเทิร์น — หายเฉพาะผ่าน Overhaul หรือถูกล้าง
      // ---------- ผู้สังหารเมจ (mageslayer) ----------
      if (k === "mageslayerMark") continue; // ตราล่าเวท: ถาวรจนกว่าจะย้าย/ถูกล้าง
      if (k === "mageslayerFury") continue; // Fury: สแตคพลังโกรธ ไม่ใช่ตัวนับเทิร์น — ใช้หมดพร้อมกันตอนโจมตี
      // ---------- Ultraman Trigger ----------
      if (k === "triggerForm") continue; // นับครบ 10 เทิร์นและคืน snapshot แยกที่ท้าย endTurn()
      if (k === "triggerMulti") continue; // จักรแห่งแสงคงอยู่จนกว่าจะโจมตีสำเร็จ 1 ครั้ง
      if (k === "triggerZeperion") continue; // ลำแสง Zeperion คงอยู่จนกว่าจะโจมตีสำเร็จ 1 ครั้ง
      if (k === "triggerLight") continue; // แสงสว่างคงอยู่จนเจ้าของ Trigger คืนร่างหรือโดน Zeperion ล้าง
      if (k === "hisakawaTempo") continue;
      if (k === "triggerDarkWail") continue; // อวดครวญ: สแตคถาวรจนกว่า Impact จะล้างทั้งสนาม
      if (k === "escanorMorning" || k === "escanorNight" || k === "escanorNoon" || k === "escanorLastStand" || k === "escanorSolar" || k === "escanorFlare" || k === "escanorFlareNoon" || k === "escanorPunch" || k === "escanorRhitta" || k === "escanorRhittaNoon" || k === "escanorSun") continue;
      // ---------- โอกูริ แคป (patch 2.0.8.1) ----------
      // อิปโป: Dempsey roll เป็น "ธงบัฟเปิดอยู่" ไม่ใช่ตัวนับเทิร์น — หายเมื่อโจมตีสำเร็จเท่านั้น
      if (k === "ippoDempsey") continue;
      // ผู้วิงวอน: "เกราะศรัทธา" เก็บ "จำนวนหน่วย" ไว้ที่ statusAmt ส่วน statuses เป็นแค่ธง — ไม่ใช่ตัวนับเทิร์น
      //  หายเมื่อถูกดาเมจกินจนหมดเท่านั้น (ดู faithAbsorb) ต้องตรงกับ NO_TICK_STATUS ใน _universal_status.js
      if (k === "supFaith") continue;
      if (k === "graybeast") continue;  // ร่าง Zone: ถาวรจนกว่าจะเข้าร่างหมดแรง
      // burnout (ร่างหมดแรง): เดิมถูกยกเว้นไม่ลดเทิร์นตรงนี้ แต่ไม่มีจุดไหนในโค้ดเคลียร์ทิ้งเองเลย (ไม่มี delete p.statuses.burnout ที่ไหนทั้งไฟล์)
      //  ผลคือติดแล้วค้างถาวรทั้งแมตช์ ทั้งที่ตั้งใจให้เป็นดีบัฟ 2 เทิร์นตายตัว (ดู OGURI_BURNOUT_TURNS, characters/oguri.js) — เอาข้อยกเว้นออก ให้ลดเทิร์นตามปกติ
      if (k === "grit") continue;       // เวลากัดฟันทน: สแตค หายเมื่อฝึกฝนสำเร็จ
      if (k === "healthfull") continue; // Healthfull: สแตค ใช้ลบ Overweight เมื่อครบ 2
      if (k === "overweight") continue; // Overweight: คงอยู่จนกว่าจะถูกลบด้วย Healthfull
      // หลับไหล: เทิร์นที่เพิ่งโดนกล่อม ยังไม่เริ่มนับ (เริ่มหลับจริงเทิร์นถัดไป ครบตามจำนวนยามฟ้าสาง)
      if (k === "sleep" && p.sleepFresh) { p.sleepFresh = false; continue; }
      p.statuses[k]--;
      if (p.statuses[k] <= 0) {
        delete p.statuses[k];
        if (p.statusAmt) delete p.statusAmt[k]; // ล้างจำนวน (amount) ของสถานะพื้นฐานที่หมดอายุ (patch 2.0.8)
        // มิติมายาบรรเลงสิ้นสุด (Bard, characters/bard.js): รีเซ็ตท่อนทำนองทั้งหมด — ฉากหลัง/เพลงกลับสู่ปกติ
        if ((k === "bloodDim" || k === "soulDim") && p.characterId === "bard") {
          CHAR_HOOKS.bard.onDimExpire(engine, p);
        }
        // เชื่อมผลจบลง (Resonance): ตัดลิงก์ทั้งสองฝั่ง
        // ไค ชิซากิ: เชื่อมต่อ/คู่ปรับ หมดอายุ -> ล้าง mirror ทั้งสองฝั่ง (โค้ดแยกจาก Resonance ของ Bard)
        // โมโรโบชิ ดัน: "จงหลบแต่อย่าหนี"/"ศิษย์" หมดเวลา -> ล้างธงฝั่งดันและฝั่งเป้าหมายให้ครบ
        if (k === "danChase" || k === "danDisciple") CHAR_HOOKS.dan.onStatusExpire(engine, p, k);
        // ผู้วิงวอน: "ตราพิพากษา" หมดเวลา 5 เทิร์นโดยยังไม่ครบ 3 ครั้ง -> ผลปลายทางฝั่ง "ไม่สัมฤทธิ์"
        if (k === "supJudge") CHAR_HOOKS.the_supplicant.onJudgeExpire(engine, p);
        if (k === "kaiLink") CHAR_HOOKS.kai.onExpireKaiLink(p);
        if (k === "kaiRival1" || k === "kaiRival2") CHAR_HOOKS.kai.onExpireKaiRival(p);
        // ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ หมดเวลาเองตามธรรมชาติ (ไม่มีใครไพ่แตกใน 5 เทิร์น) -> รีเซ็ต guard ให้ใช้ท่าไม้ตายรอบหน้าได้ปกติ
        if (k === "takumiBlackout") {
          p.takumiBlackoutFired = false;
          lastLog.push(`🌑 ${p.name} ถึงจะมองไม่เห็น แต่ฉันยังอยู่ หมดเวลาเอง — กลับมามองเห็นกันได้ตามปกติ`);
        }
        // ไม่อยากให้ใครต้องเจ็บปวด (ริต้า เบอร์นัล patch 2.1.7): หมดเวลาพอดีเทิร์นนี้ — ยังนับว่า "ตายขณะท่าไม้ตายทำงาน"
        //  ต่อไปอีก 1 จังหวะจบเทิร์น เผื่อตายจากผลติกท้ายเทิร์นเดียวกัน (ล้างค่านี้ทิ้งตอนเริ่มเทิร์นถัดไปใน dealRound)
        if (k === "phenexTaunt") p.phenexTauntGrace = true;
        // ความเร็วสูงหมดอายุ (เอจิ): คืนแต้มสกิลที่จ่ายค่าสกิลพื้นฐานไป
        if (k === "eijiSwift" && p.characterId === "eiji") CHAR_HOOKS.eiji.onSwiftExpire(engine, p);
        // เอจิ: "ไม่ว่ายังก็ตาม" หมดเวลา -> ติดคูลดาวน์ห้ามกดซ้ำ 3 เทิร์น (เก็บเป็นเลขรอบ ไม่ใช่สถานะ)
        if (k === "eijiUlt" && p.characterId === "eiji") CHAR_HOOKS.eiji.onUltExpire(engine, p);
        // มุยมิ: “ดาบสะบั้น” หมดเวลา -> เริ่มคูลดาวน์ท่าไม้ตาย 3 เทิร์น
        if (k === "muimiTower" && p.characterId === "muimi") CHAR_HOOKS.muimi.onUltExpire(engine, p);
        // Sleeping time หมดเวลาเอง (โคโตเนะ rework 2.3): ตื่นนอนอย่างสดชื่น (ไม่มีผลต่อเนื่องแล้ว)
        if (k === "ksleep" && p.characterId === "kotone") {
          lastLog.push(`🌅 ${p.name} ตื่นนอนอย่างสดชื่น — พร้อมลุยต่อแล้ว!`);
        }
        // เร้นเงาหมดเวลา (แบทแมน patch 2.2.7, characters/bat_ben.js): เล่นวีดีโอ -> ระเบิดใส่ทุกคน + ใบ้สกิลคนอื่น
        //  patch 2.2.7.1: ทำงานเสมอเมื่อครบ 3 เทิร์น — โดนโจมตีระหว่างทางไม่ทำให้สถานะหลุดอีกแล้ว
        // ความตายที่โรยราหมดเวลา (ชิกิ patch 2.0.6.1): ลบเส้นชีวิตส่วนที่ท่าไม้ตายแจกไปออกจากทุกคน
        if (k === "wither" && p.characterId === "shiki") {
          clearWitherLines(p.id);
          lastLog.push(`🥀 ${p.name} ความตายที่โรยราหมดเวลา — เส้นชีวิตที่สะสมช่วงท่าไม้ตายถูกลบออกให้ทุกคน`);
        }
        if (k === "moonCell" && p.characterId === "hakuno") moonCellEndedBy = p;
        if (k === "triggerDarkForm" && p.characterId === "ignis") CHAR_HOOKS.ignis.restoreFromTriggerDark(engine, p);
        // ฉันคว้ามันได้แล้ว หมดเวลา (สึงาชิ ทาคุโตะ patch 2.2.3): กลับเป็นทาคุโตะปกติ — ล้างดาบที่ค้างอยู่ ต้องเก็บดวงดาวใหม่ให้ครบ 5 อีกครั้ง
        if (k === "apprivoise" && p.characterId === "takuto") {
          delete p.statuses.emeraude;
          delete p.statuses.saphir;
          delete p.statuses.lance;
          delete p.statuses.takutoThirdAtk;
          p.takutoComboReady = false;
          p.takutoUlt2VideoPending = false;
          lastLog.push(`🌠 ${p.name} ฉันคว้ามันได้แล้วหมดเวลา — กลับเป็นทาคุโตะปกติ ต้องเก็บดวงดาวให้ครบ ${TAKUTO_STAR_NEED} อีกครั้งเพื่อแปลงร่าง`);
        }
      }
    }
    for (const k of Object.keys(p.seen || {})) {
      if (k === "ntd" || k === "beat" || k === "eva3") continue; // NT-D คงอยู่จนแก้แค้น / Beat Mode ถาวร / eva3 เปิดปิดตามเลือด
      if (k === "banagherPassive2") continue; // บานาจ (patch 2.1.2): เป้าแก้แค้นพิเศษใส่ริดดี้ คงอยู่จนแก้แค้นสำเร็จ (ไม่ผูกกับ p.statuses)
      if (!(p.statuses[k] > 0)) delete p.seen[k];
    }
    // เลือดชั่วคราว (แกมเบลอร์): หายเองเมื่อครบ 2 เทิร์น
    if ((p.tempHp || 0) > 0) {
      p.tempHpTurns--;
      if (p.tempHpTurns <= 0) { p.tempHp = 0; p.tempHpTurns = 0; }
    }
    p.armor = Math.min(p.armor, maxArmorOf(p)); // กันเกราะเกินเพดาน
    hisakawaSyncOut(p);
  }
  for (const p of Object.values(players)) CHAR_HOOKS.hisakawa_sister.onEndTurnTick(engine, p);
  // MOON*CELL หมดเวลา (คิชินามิ ฮาคุโนะ): คืนบัฟ/ดีบัฟที่ล้างไว้ทั้งหมดให้ทุกคน (ยกเว้นตัวเอง) + ติดไร้ทางเยียวยา 3 เทิร์น
  //  ทำหลังลูปลดเทิร์นสถานะทั้งหมดจบแล้ว กันไม่ให้สถานะที่เพิ่งคืนกลับมาโดนลดเทิร์นซ้ำในเทิร์นเดียวกัน
  if (moonCellEndedBy) {
    for (const o of Object.values(players)) {
      if (o.id === moonCellEndedBy.id) continue;
      if (o.moonCellBackup) {
        o.statuses = { ...o.moonCellBackup.statuses };
        o.statusAmt = { ...o.moonCellBackup.statusAmt };
        delete o.moonCellBackup;
      }
      if (o.alive && !resistActive(o)) o.statuses.nohealing = Math.max(o.statuses.nohealing || 0, HAKUNO_NORECOVER_TURNS);
    }
    lastLog.push(`🌙 ${moonCellEndedBy.name} คำสาปแห่งดวงจันทร์ MOON*CELL สิ้นสุดลง — คืนบัฟ/ดีบัฟที่ถูกล้างไว้ทั้งหมด และทุกคน (ยกเว้น ${moonCellEndedBy.name}) ติดสถานะ "ไร้ทางเยียวยา" ${HAKUNO_NORECOVER_TURNS} เทิร์น`);
  }

  // Ultraman Trigger: หลังคืนร่างตามเวลา HP เหลือ 1 แล้วฟื้นเอง +1/เทิร์นจนถึง HP ตอนก่อนแปลงร่าง; ถ้าโดนตีระหว่างนี้ การฟื้นอัตโนมัติหยุดทันที
  for (const p of alivePlayers()) {
    const targetHp = p.triggerRecoveryTargetHp || 0;
    if (targetHp <= 0) continue;
    if (p.wasAttacked) {
      delete p.triggerRecoveryTargetHp;
      lastLog.push(`✨ ${p.name} ถูกโจมตีระหว่างฟื้นตัวหลังคืนร่าง — การฟื้นอัตโนมัติจาก Hyper Key Trigger หยุดลง`);
      continue;
    }
    if (p.hp < targetHp) {
      const healed = healHp(p, 1);
      if (healed > 0) lastLog.push(`✨ ${p.name} ฟื้นตัวหลังคืนร่างจาก Hyper Key Trigger +${healed} (${p.hp}/${targetHp})`);
    }
    if (p.hp >= targetHp) delete p.triggerRecoveryTargetHp;
  }

  // จบเทิร์นรอบนั้น +1 — ช่วงกลางวันได้แต้มสกิลเพิ่มอีก +1 (ระบบกลางวัน/กลางคืน)
  const dayBonus = morningBonusActive(roundNumber); // patch 2.1.7: แจกเฉพาะเช้าที่ 2, 4, 6, ...
  for (const p of alivePlayers()) {
    if (isYuuki(p)) { p.skillPoints = 0; continue; }
    let gain = dayBonus ? 2 : 1;
    // ซาโตรุ อาเคฟุ (patch 2.0.8.2): สกิลติดตัว — รีเจนแต้มสกิลเพิ่ม +1 ทุกเทิร์น (ปิดได้ เช่น MOON*CELL)
    if (p.characterId === "satoru" && !passiveSealed(p)) gain += 1;
    // คิชินามิ ฮาคุโนะ (patch 2.2.1): ร่างหญิง — แต้มสกิลฟื้นเพิ่ม +1 ทุกเทิร์น
    if (p.characterId === "hakuno" && p.hakunoGender === "female") gain += 1;
    // Ultraman Trigger: สกิลติดตัวฟื้นแต้มสกิลเพิ่มอีก 1 หน่วยทุกเทิร์น
    if (p.characterId === "ultraman_trigger") gain += 1;
    // ฟุจิตะ โคโตเนะ (rework 2.3): สกิลติดตัว — โอกาส 30% ฟื้นแต้มสกิล +1 ต่อเทิร์น
    if (p.characterId === "kotone") gain += CHAR_HOOKS.kotone.extraSkillRegen(engine, p);
    if (p.characterId === "hisakawa_sister") gain += CHAR_HOOKS.hisakawa_sister.extraSkillRegen(p);
    if (p.characterId === "ignis") gain += CHAR_HOOKS.ignis.extraSkillRegen(engine, p);
    // ค่าปรับปฏิเสธข้อเสนอ (เจ้าแห่งเน็ตบ้าน): แต้มสกิลหลังจบเทิร์นลด 1
    if ((p.skillDrain || 0) > 0) {
      gain = Math.max(0, gain - 1);
      p.skillDrain--;
      lastLog.push(`📵 ${p.name} ค่าปรับปฏิเสธข้อเสนอ — แต้มสกิลจบเทิร์นลด 1${p.skillDrain > 0 ? ` (เหลืออีก ${p.skillDrain} เทิร์น)` : ""}`);
    }
    if (yuukiBoss() && !isNightRound(roundNumber)) {
      gain = 0;
      p.skillPoints = Math.max(0, (p.skillPoints || 0) - 1);
      lastLog.push(`⚡ เอฟเฟกต์สนามยูกิ — แต้มสกิลของ ${p.name} ไม่ฟื้นและลดลง 1 หน่วย`);
    }
    addSkill(p, gain);
  }
  if (dayBonus && !yuukiBoss()) lastLog.push("☀️ จบเทิร์นช่วงกลางวัน — ทุกคนได้แต้มสกิลเพิ่ม +1");
  // ระบบเหรียญ (patch 2.2 full): จบเทิร์น +1 เหรียญให้ทุกคน (เพดาน 30 — เต็มแล้วไม่ได้เพิ่มจน spending ลดลง)
  for (const p of alivePlayers()) {
    if (isYuuki(p)) { p.gold = 0; continue; }
    const goldGain = GOLD_PER_TURN + (p.characterId === "hisakawa_sister" ? CHAR_HOOKS.hisakawa_sister.extraGoldRegen(p) : 0) + (p.characterId === "ignis" ? CHAR_HOOKS.ignis.extraGoldRegen(engine, p) : 0);
    addGold(p, goldGain);
  }

  // ชิวๆครับน้องๆ (Apple guy): จบเทิร์นได้แต้มสกิลเพิ่ม +1 จนกว่าจะถูกโจมตี
  for (const p of alivePlayers()) {
    if ((p.statuses.chill || 0) > 0) {
      addSkill(p, 1, "passive");
      lastLog.push(`🏖️ ${p.name} ชิวๆครับน้องๆ — จบเทิร์นได้แต้มสกิลเพิ่ม +1`);
    }
  }

  // ตราล่าเวท (characters/mageslayer.js): ทุก 2 เทิร์นขโมยพลังงานเป้าหมายที่มาร์กไว้ 1 หน่วย
  CHAR_HOOKS.mageslayer.tickWitchMark(engine);

  // เทเปา (characters/tepeu.js): ครุ่นคิด (+แต้มสกิล) / ทำอาหาร (ส่ง "มื้อที่สุข" เข้าคลังเมื่อครบ) / ฉากหลังท่าไม้ตายนับถอยหลัง
  CHAR_HOOKS.tepeu.onTurnEndTick(engine);

  for (const p of Object.values(players)) {
    if (p.alive && p.hp <= 0) {
      // patch 2.1.6.3: เรียกผ่าน instantDeath() แทนการตั้ง alive=false ตรงๆ — กันบั๊กริต้าไม่เกิดใหม่
      //  (จุดนี้เคย bypass สกิลติดตัว 1 ริต้า เบอร์นัล เพราะไม่ได้เรียก instantDeath ที่มีตรรกะเกิดใหม่)
      instantDeath(p);
      if (!p.alive) lastLog.push(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
  }
  // ระเบิด fourth impact: เอวา 13 ตายขณะสถานะยังอยู่ -> ทุกคนในสนามรับ 5 หน่วย (เกราะก่อนแล้วเลือด)
  if (evaBlasts.length) {
    for (const e of evaBlasts) {
      lastLog.push(`💥 ${e.name} ไม่สามารถแก้ไขอะไรได้อีกแล้ว — ทุกสิ่งทุกอย่างไร้ความหมาย! ระเบิดใส่ทุกคน -${EVA_BLAST_DMG}`);
      for (const o of alivePlayers()) {
        if (o.id === e.id) continue;
        if (!evaBlastEvade(o, e)) dealMixed(o, EVA_BLAST_DMG);
        maybeBeatSave(o);
        maybeBeatMode(o);
        maybeEva3(o);
        o.wasAttacked = true;
      }
      triggerCutscene(e, "evaboom");
    }
    // เช็คคนตายจากแรงระเบิดอีกรอบ
    for (const p of Object.values(players)) {
      if (p.alive && p.hp <= 0) {
        instantDeath(p);
        if (!p.alive) lastLog.push(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
  }
  // แด่เพื่อนรักของฉัน (ชเรด เอลัน): ครบ 3 เทิร์น — เล่นวีดีโอสุดท้าย แล้วระเบิดใส่ทุกคนบนสนาม 8 หน่วย
  //  จากนั้นชเรดจบชีวิตลงตามไป — หากทุกคนตายเพราะท่านี้หมดก่อน ชเรดถือว่าเป็นผู้ชนะ (ไม่ตายตาม)
  for (const s of shradeBlasts) {
    if (!s.alive) continue; // ตายไปก่อนจะได้ปลดปล่อย = ท่าไม้ตายไม่ระเบิด
    lastLog.push(`🎻💥 ${s.name} แด่เพื่อนรักของฉัน — บทเพลงบรรเลงจบ! ระเบิดใส่ทุกคนบนสนาม -${SHRADE_BLAST_DMG}`);
    triggerCutscene(s, "shradeBlast");
    for (const o of alivePlayers()) {
      if (o.id === s.id) continue;
      dealMixed(o, SHRADE_BLAST_DMG);
      maybeBeatSave(o);
      maybeBeatMode(o);
      maybeEva3(o);
      maybeWakeKotone(o);
      o.wasAttacked = true;
    }
    // คนที่โดนบทเพลงจนเลือดหมด ตกรอบทันที
    for (const o of Object.values(players)) {
      if (o.alive && o.hp <= 0) {
        instantDeath(o);
        if (!o.alive) lastLog.push(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
    const othersLeft = alivePlayers().filter((o) => o.id !== s.id);
    if (othersLeft.length === 0) {
      lastLog.push(`👑 ${s.name} บทเพลงกวาดล้างทุกคนบนสนาม — ชเรดคือผู้ชนะ!`);
    } else if (s.alive) {
      instantDeath(s);
      if (!s.alive) lastLog.push(`🎻 ${s.name} จบชีวิตลงพร้อมบทเพลงสุดท้าย... ลาก่อนเพื่อนรัก`);
    }
  }
  // ---------- ริดดี้ (characters/riddhe.js): สกิลติดตัว 3 อย่าทิ้งฉันไป (บานาจพันธมิตรตาย) / พันธมิตร-ข้อเสนอที่หลุดเกม -> ล้างทิ้ง ----------
  CHAR_HOOKS.riddhe.onEndTurnAvengerSweep(engine);
  CHAR_HOOKS.riddhe.onEndTurnOrphanCleanup(engine);

  // ถ้าเป้าแก้แค้นตาย/หายไป -> NT-D สงบ
  for (const p of Object.values(players)) {
    if (p.ntdTarget && (!players[p.ntdTarget] || !players[p.ntdTarget].alive)) {
      p.ntdTarget = null;
      delete p.seen.ntd;
    }
  }
  // บานาจ (characters/banagher.js): เป้าแก้แค้นพิเศษ (สกิลติดตัว 2) ตาย/หายไป/กลายเป็นพันธมิตร -> สงบลง
  CHAR_HOOKS.banagher.onEndTurnRivalCleanup(engine);
  // ริดดี้ (characters/riddhe.js): ที่ได้ NT-D System ไปฟรีจาก NewType Paradise — หมดพร้อมกัน (เว้นแต่กดแยกเองแล้ว)
  CHAR_HOOKS.riddhe.onEndTurnNtdLinkExpiry(engine);
  // บานาจ (patch 2.1.2): Absorb shield หมดผล -> ตัดการผูกเจ้าของสกิล
  for (const p of Object.values(players)) {
    if (p.bshieldOwnerId && !((p.statuses.bshield || 0) > 0)) p.bshieldOwnerId = null;
  }
  // สัญญา (เจ้าแห่งเน็ตบ้าน): ฝ่ายใดฝ่ายหนึ่งตาย/หายไป -> สัญญาสิ้นสุด รอทำใหม่ได้
  for (const p of Object.values(players)) {
    if (p.contractPartner) {
      const t = players[p.contractPartner];
      if (!p.alive || !t || !t.alive || t.contractWith !== p.id) {
        if (t && t.contractWith === p.id) { t.contractWith = null; t.renewPending = false; }
        p.contractPartner = null;
        p.contractTurns = 0;
        if (p.alive || (t && t.alive)) lastLog.push(`📴 สัญญาของ ${p.name} สิ้นสุดลง`);
      }
    }
    if (p.contractOffer && (!p.alive || !players[p.contractOffer] || !players[p.contractOffer].alive)) p.contractOffer = null;
    if (p.contractWith && (!players[p.contractWith] || !players[p.contractWith].alive)) { p.contractWith = null; p.renewPending = false; }
    // Locacaca fruit (ซาโตรุ): ฝ่ายใดฝ่ายหนึ่งตาย -> ข้อเสนอตกไป
    if (p.locaOffer && (!p.alive || !players[p.locaOffer] || !players[p.locaOffer].alive)) p.locaOffer = null;
  }

  // ยูนะ (เพลง Longing): มีคนตายรอฟื้นอยู่ไหม — ฉากโจมตี(ถ้ามี)จบไปแล้วตอนนี้แน่นอน ค่อยฟื้นคืนชีพ+คิววีดีโอตอนนี้
  //  ให้ทันเข้าคิวก่อน runCutsceneQueue ด้านล่างจะดึงไปเล่น (วีดีโอเล่นจบ -> เพลงล็อกเริ่มพร้อมเทิร์นถัดไปทันที)
  if (yunaLongingPendingId) {
    const revived = players[yunaLongingPendingId];
    yunaLongingPendingId = null;
    if (revived) YunaMod.reviveWithLonging(engine, revived);
  }
  // Ultraman Trigger: นับเทิร์นหลังผลท้ายเทิร์นทั้งหมดจบแล้ว เพื่อให้ครบ 10 เทิร์นเต็ม
  // เมื่อหมดเวลา คืน snapshot ก่อนแปลงร่าง (ค่าที่เกิดในร่าง Trigger จึงไม่ติดกลับไป)
  for (const p of Object.values(players)) {
    if (p.characterId !== "ultraman_trigger" || !p.alive) continue;
    p.statuses.triggerForm = Math.max(0, (p.statuses.triggerForm || 0) - 1);
    if (p.statuses.triggerForm <= 0) CHAR_HOOKS.ultraman_trigger.restore(engine, p, false);
  }
  //  ระหว่างรอย้อนเวลาของชิโด ห้ามประกาศชัยชนะยูกิ — มนุษย์ที่ "ตายหมด" กำลังจะถูกย้อนกลับมาทั้งวง
  if (yuukiBoss() && aliveHumans().length === 0 && !yuukiWinShown && !CHAR_HOOKS.shido.rewindPending(engine)) {
    yuukiWinShown = true;
    queueYuukiCutscene(YUUKI_VIDEO.win, "นายมันอ่อนแอเกินไป", 6, "yuukiWin");
    lastLog.push("☠️ ยูกิเอาชนะผู้เล่นทุกคน — ผู้เล่นทั้งหมดพ่ายแพ้!");
    // จบเกมตรงหลังวิดีโอชนะ ไม่ผ่านเงื่อนไข FFA/ทีมทั่วไปซึ่งอาจทิ้งเกมไว้กลางเฟส
    runCutsceneQueue(finishYuukiVictory);
    return;
  }
  // อิสึกะ ชิโด (characters/shido.js): นับถอยหลังกับดัก "ฝากด้วยนะตัวฉัน" (ไม่ได้อยู่ใน p.statuses
  //  จึงไม่เข้าลูปลดเทิร์นด้านบน) แล้วคิว shido_skill3.mp4 เป็นรอยต่อก่อนขึ้นเทิร์นถัดไปถ้ากับดักเพิ่งทำงาน
  for (const p of Object.values(players)) CHAR_HOOKS.shido.onEndTurn(engine, p);
  CHAR_HOOKS.shido.flushDeathVideo(engine);
  // เล่นฉากระเบิด/ยูนะ/ชัยชนะยูกิ (ถ้ามี) ให้จบก่อน แล้วค่อยสรุปจบเกม/ขึ้นรอบถัดไป
  runCutsceneQueue(() => {
    // อิสึกะ ชิโด "ฝากด้วยนะตัวฉัน": ย้อนเวลากลับ 5 เทิร์น — จุดนี้คือหลังวีดีโอรอยต่อเล่นจบแล้ว
    //  ต้องอยู่ "ก่อน" alivePlayers()/เงื่อนไขจบเกมทั้งหมด ไม่งั้นรายชื่อที่คำนวณไว้จะเป็นของก่อนย้อน
    //  (ชิโดเพิ่งตาย เกมอาจนับว่าเหลือผู้ชนะคนสุดท้ายทั้งที่อีกครู่ทุกคนจะถูกย้อนกลับมา)
    let shidoRewound = false;
    for (const sp of Object.values(players)) {
      if (CHAR_HOOKS.shido.applyRewind(engine, sp)) shidoRewound = true;
    }

    const stillAlive = alivePlayers();
    const total = Object.keys(players).length;

    if (gameMode === "overload" && yuukiDefeated) {
      winningTeamId = null;
      lastLog.push("🏆 ยูกิ Overload ถูกโค่น — ผู้เล่นทุกคนชนะโหมด Over Load!");
      gameState = "GAMEOVER";
      timeLeft = 0;
      broadcastState();
      return;
    }

    // สกิลติดตัว 2 ริดดี้ (characters/riddhe.js): เหลือแค่คู่พันธมิตรบันชี × ยูนิคอร์นบนสนาม -> ถามจะคงพันธมิตรจนจบเกมไหม
    CHAR_HOOKS.riddhe.maybeAskFinalAlliance(engine, stillAlive);

    const teamWin = remainingTeamWinInfo(stillAlive, total);
    if (!shidoRewound && teamWin.over) {
      winningTeamId = teamWin.teamId;
      if (winningTeamId) {
        const winners = stillAlive.filter((p) => p.teamId === winningTeamId).map((p) => p.name).join(" & ");
        lastLog.push(`🏆 Team ${winningTeamId} (${winners}) ชนะ!`);
      } else {
        lastLog.push("ไม่มีทีมที่รอด — เสมอ");
      }
      gameState = "GAMEOVER";
      timeLeft = 0;
      broadcastState();
    } else if (!shidoRewound && !teamModeActive() && total >= 2 && stillAlive.length <= 1) {
      winningTeamId = null;
      if (stillAlive.length === 1) lastLog.push(`🏆 ${stillAlive[0].name} คือผู้ชนะคนสุดท้าย!`);
      else lastLog.push("ไม่มีผู้รอด — เสมอ");
      gameState = "GAMEOVER";
      timeLeft = 0;
      broadcastState();
    } else {
      gameState = "TRANSITION";
      startPhaseTimer(TRANSITION_TIME, dealRound);
      broadcastState();
    }
  });
}

function backToLobby() {
  delete players[YUUKI_ID];
  gameState = "LOBBY";
  resetTeamAssignments(true);
  clearPhaseTimer();
  timeLeft = 0;
  attackerId = null;
  roundWinnerId = null;
  roundNumber = 0;
  allyWinFlag = false;
  cycleShift = 0;
  nightResetPending = false;
  oberonDevour = 0;
  dayForceUntil = 0;
  yunaLongingUsed = false; yunaWindowEnd = 0; yunaEffect = null; yunaTargetId = null; yunaMusicSeq = 0; yunaLongingPendingId = null; yunaPity = 0;
  overloadForceActive = false;
  overloadForceCount = 0; yuukiSpawned = false; yuukiTurns = 0; yuukiAttackTargets = [];
  clearTurnSnapshot();
  yuukiLowShown = false; yuukiWinShown = false; yuukiDefeated = false; yuukiReactiveDrawCredits = 0;
  kaiOverhaulSlots = []; // ไค ชิซากิ: ล้าง tracker Overhaul เมื่อกลับล็อบบี้
  lastLog = [];
  cutsceneQueue = [];
  cutsceneInfo = null;
  for (const p of Object.values(players)) {
    p.cards = []; p.locked = false; p.busted = false; p.result = null;
    resetRoundDisplay(p);
    resetCombat(p);
    if (!p.connected) scheduleDisconnectedRemoval(p.id);
  }
  broadcastState();
}


// ============================================================
//  Socket.io
// ============================================================
function consumeEventQuota(socket, event, limit, windowMs = 1000) {
  const now = Date.now();
  const rates = socket.data.eventRates || (socket.data.eventRates = new Map());
  let bucket = rates.get(event);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { startedAt: now, count: 0 };
    rates.set(event, bucket);
  }
  bucket.count++;
  if (bucket.count <= limit) return true;
  if (bucket.count === limit + 1) socket.emit('rateLimited', { event });
  return false;
}

function playerIdFor(socket) {
  const id = socketPlayerIds.get(socket.id);
  const p = id && players[id];
  return p && p.socketId === socket.id ? id : null;
}

function bindPlayerSocket(socket, playerId) {
  const p = players[playerId];
  if (!p) return false;
  const timer = disconnectTimers.get(playerId);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(playerId);
  p.connected = true;
  p.socketId = socket.id;
  socketPlayerIds.set(socket.id, playerId);
  socket.join(playerId);
  return true;
}

function forgetPlayerSession(p) {
  if (p && p.sessionToken) sessions.delete(p.sessionToken);
}

function scheduleDisconnectedRemoval(playerId) {
  const oldTimer = disconnectTimers.get(playerId);
  if (oldTimer) clearTimeout(oldTimer);
  disconnectTimers.set(playerId, setTimeout(() => removeDisconnectedPlayer(playerId), RECONNECT_GRACE_MS));
}

function removeDisconnectedPlayer(playerId) {
  const p = players[playerId];
  if (!p || p.connected) return;
  const wasAttacker = attackerId === playerId;
  const wasPregame = pregameStateActive();
  forgetPlayerSession(p);
  delete players[playerId];
  disconnectTimers.delete(playerId);

  if (Object.keys(players).length === 0) {
    gameState = 'LOBBY';
    clearPhaseTimer();
    attackerId = null;
    broadcastPositions();
    return;
  }
  if (wasPregame) {
    resetPregameFlowToLobby();
    broadcastState();
    broadcastPositions();
    return;
  }
  if (gameState === 'ATTACK' && wasAttacker) endTurn();
  else if (gameState === 'PLAYING') { checkAllLocked(); broadcastState(); }
  else broadcastState();
  broadcastPositions();
}

// ห่อ handler ของ socket event ด้วย try/catch — payload ผิดรูปแบบ/บั๊กในโค้ดตัวละครจุดเดียว
//  ไม่ควรทำให้ process ทั้งตัว crash (ตัดผู้เล่นทุกคนออกจากเกมพร้อมกัน) แค่ event นั้นไม่ทำงานพอ
function safeOn(socket, event, handler) {
  socket.on(event, (...args) => {
    try {
      handler(...args);
    } catch (err) {
      console.error(`[socket:${event}] handler เกิดข้อผิดพลาด (ไม่กระทบผู้เล่นคนอื่น):`, err);
    }
  });
}

function onPlayerEvent(socket, event, handler, limit = 20) {
  safeOn(socket, event, (payload) => {
    if (!consumeEventQuota(socket, event, limit)) return;
    const playerId = playerIdFor(socket);
    if (!playerId) return;
    handler(playerId, payload);
  });
}

io.on('connection', (socket) => {
  socket.emit("roster", publicRoster());
  socket.emit("positions", positionsFor(socket.id));
  socket.emit("takenChars", takenUniqueChars());

  safeOn(socket, 'reconnectSession', ({ sessionToken } = {}) => {
    if (!consumeEventQuota(socket, 'reconnectSession', 3, 10_000)) return;
    if (typeof sessionToken !== 'string' || sessionToken.length > 128) return;
    const playerId = sessions.get(sessionToken);
    const p = playerId && players[playerId];
    if (!p || p.sessionToken !== sessionToken) { socket.emit('sessionExpired'); return; }
    if (p.connected && p.socketId !== socket.id && io.sockets.sockets.has(p.socketId)) {
      socket.emit('sessionInUse');
      return;
    }
    if (!bindPlayerSocket(socket, playerId)) { socket.emit('sessionExpired'); return; }
    socket.emit('reconnected', { sessionToken });
    broadcastState();
    broadcastPositions();
  });

  safeOn(socket, "reserve", ({ position } = {}) => {
    if (!consumeEventQuota(socket, 'reserve', 8, 10_000) || playerIdFor(socket)) return;
    const pos = Number(position);
    if (!pos) { releaseReservation(socket.id); broadcastPositions(); return; }
    if (pos < 1 || pos > MAX_PLAYERS || positionUsedByOther(pos, socket.id)) return;
    reservePosition(socket.id, pos);
    broadcastPositions();
  });

  safeOn(socket, "join", ({ name, position, characterId, shikiUlt } = {}) => {
    if (!consumeEventQuota(socket, 'join', 3, 10_000) || playerIdFor(socket)) return;
    if (Object.keys(players).length >= MAX_PLAYERS) { socket.emit("full"); return; }
    if (gameState !== "LOBBY") { socket.emit("inProgress"); return; }
    const pos = Number(position);
    if (!pos || pos < 1 || pos > MAX_PLAYERS || positionUsedByOther(pos, socket.id)) { socket.emit("positionTaken"); return; }
    releaseReservation(socket.id);
    let ch = CHAR_BY_ID[characterId];
    if (!ch || ch.locked) ch = CHARACTERS.find((c) => !c.locked) || CHARACTERS[0];
    // ตัวละคร unique (คอนเนอร์ RK800): เลือกได้แค่ 1 คนต่อเกม — ปฏิเสธการเข้าร่วมแทนการสลับตัวให้เงียบๆ
    //  (ฝั่ง client ปิดการ์ดไว้ตั้งแต่หน้าเลือกตัวละครผ่าน event "takenChars" — ด่านนี้กันเคสกดพร้อมกันเป๊ะ)
    if (ch.unique && Object.values(players).some((o) => o.characterId === ch.id)) {
      socket.emit("characterTaken", { characterId: ch.id, name: ch.name });
      return;
    }

    const playerId = crypto.randomUUID();
    const sessionToken = crypto.randomBytes(32).toString('base64url');
    players[playerId] = {
      id: playerId,
      sessionToken,
      socketId: socket.id,
      connected: true,
      ready: false, // ห้องรอ: ต้องกดพร้อมก่อนเกมถึงจะเริ่มได้ (ครบทุกคน = เริ่มอัตโนมัติ)
      teamId: null, teamConfirmed: false, modeVote: null,
      name: (name || "ผู้เล่น").toString().slice(0, 12),
      position: pos, characterId: ch.id, avatar: ch.avatar, img: ch.img,
      cards: [], locked: false, busted: false, result: null,
      hp: MAX_HP, armor: ch.id === "eva13" ? 0 : MAX_ARMOR, skillPoints: 0, alive: true, shield: 0,
      statuses: ch.id === "eva13" ? { rsHopper: EVA13_RSHOPPER_MAX } : {}, statusAmt: {},
      seen: {}, ntdTarget: null, transformAt: 0, cutsceneShown: {},
      armorLocked: false, beatSaved: false, skillUsedRound: false,
      beamAmmo: BEAM_AMMO, puddingCount: 0, rsHopperRegenTimer: 0,
      gold: 0, inventory: [], triggerDarkWail: 0, blackSparklenceReadyRound: 0,
      doomWeapon: ch.id === "doomguy" ? DOOM_STARTING_WEAPON : null, doomQuickSwapUsed: false, doomCharge: 0,
      doomChaingunShieldUsed: false,
      takumiGear: 1, takumiSkillUsesRound: 0, takumiBlackoutFired: false,
      takutoComboReady: false, takutoUlt2VideoPending: false, takutoAwakenAt: 0,
      tonkatsu: 0, songAtk: 0, noDrawNext: 0, anataTargets: null,
      gamblerUses: GAMBLER_USES, profit: 0, tempHp: 0, tempHpTurns: 0, noSkillNext: 0,
      sunriseDrop: 0, sleepFresh: false,
      appleItem: "drink", appleAtkBuffs: [], chillDodge: 100, appleGiveUses: CHAR_HOOKS.appleguy.GIVE_USES,
      muimiEmergencyUses: CHAR_HOOKS.muimi.EMERGENCY_USES, muimiEmergencyUsedRound: 0,
      muimiLoseStreak: 0, muimiHeartRound: 0, muimiForcedBustRound: 0, muimiUltCasts: 0, muimiUltCastRound: 0, muimiUltLock: 0,
      tepeuCookTurns: 0, tepeuPonderTurns: 0, tepeuEyeTurns: 0, tepeuLoseStreak: 0, tepeuKillTargetId: null,
      piggy: 0, senaNext: false, kotoneExtraAtk: false,
      contractPartner: null, contractWith: null, contractOffer: null,
      contractTurns: 0, renewPending: false, skillDrain: 0, skillDrainPending: 0,
      healNextTurn: 0, unplugHold: null,
      shradeForm: false,
      bardNotes: [], bardNotesUsed: 0, bardPending: null,
      bloodSection: 0, soulSection: 0, bardLinks: {},
      kaiLinkWith: null, kaiRivalId: null, kaiMarksBy: {},
      mageslayerMarkedId: null, mageslayerMarks: {}, mageslayerHasMarked: false, mageslayerWitchMarkReadyRound: 0, mageslayerBurdenReadyRound: 0, mageslayerMarkTick: 0,
      shikiUlt: shikiUlt === "wither" ? "wither" : "deatheye", witherAddedBy: {},
      oguriEnergy: OGURI_ENERGY_START, stamina: 0, oguriChargeCapBonus: 0, oguriZoneTurns: 0, staggerNext: 0,
      maxHpPenalty: 0, wouGuardCd: 0, calamityDraw: 0, locaOffer: null,
      allyPrompt: false, allyOffer: null, allyId: null, allyBreakAsk: null, allyFinalAsk: false,
      riddheGrudge: 0, riddhePassiveUsed: false, riddheAvenger: false,
      riddheGuardArmorLost: 0, riddheGuardHealed: false, riddheSaveLoggedRound: 0,
      dmgHp: 0, dmgArmor: 0, gainedSkill: 0,
      wasAttacked: false, isWinner: false, isLoser: false,
      phenexPain: 0, phenexReborn: false, phenexNtdPermanent: false, phenexLastHitBy: null,
      tohnoLevel: 1,
    };
    sessions.set(sessionToken, playerId);
    bindPlayerSocket(socket, playerId);
    socket.emit('joined', { sessionToken });
    broadcastState();
    broadcastPositions();
  });

  onPlayerEvent(socket, 'startGame', () => {
    // This button is for solo testing; multiplayer starts only after everyone is ready.
    if (gameState === 'LOBBY' && Object.keys(players).length === 1) startMatch();
  }, 2);
  onPlayerEvent(socket, 'selectGameMode', (id, { mode } = {}) => {
    if (gameState !== 'TEAM_MODE') return;
    voteGameMode(id, mode);
  }, 4);
  onPlayerEvent(socket, 'teamBackToMode', () => {
    if (gameState !== 'TEAM_SETUP') return;
    resetTeamAssignments(false);
    resetModeVotes();
    gameMode = 'pending';
    teamSize = 1;
    teamCount = 0;
    gameState = 'TEAM_MODE';
    broadcastState();
  }, 4);
  onPlayerEvent(socket, 'chooseTeam', (id, { teamId } = {}) => chooseTeam(id, teamId), 8);
  onPlayerEvent(socket, 'confirmTeam', (id, { confirmed } = {}) => confirmTeam(id, confirmed), 8);
  // ห้องรอ: กดพร้อม/ยกเลิกพร้อม — ครบทุกคน (อย่างน้อย 2 คน) เริ่มเกมอัตโนมัติ
  onPlayerEvent(socket, 'toggleReady', (playerId) => {
    if (!pregameStateActive()) return;
    const p = players[playerId];
    if (!p) return;
    p.ready = !p.ready;
    broadcastState();
    checkLobbyReady();
  });

  onPlayerEvent(socket, 'hit', (id) => hit(id), 8);
  onPlayerEvent(socket, 'lock', (id) => lock(id), 4);
  onPlayerEvent(socket, 'useSkill', (id, { tier, targets, item } = {}) => useSkill(id, tier, targets, item), 12);
  onPlayerEvent(socket, 'buyShopItem', (id, { itemId } = {}) => buyShopItem(id, itemId), 8);
  onPlayerEvent(socket, 'useInventoryItem', (id, { uid, cardIndex, color, targetId } = {}) => withEffectSource(players[id], () => useInventoryItem(id, uid, { cardIndex, color, targetId })), 8);
  onPlayerEvent(socket, 'hakunoCommandSpell', (id, { command } = {}) => withEffectSource(players[id], () => hakunoCommandSpell(id, command)), 6);
  onPlayerEvent(socket, 'locaAnswer', (id, { accept, fromId } = {}) => answerLoca(id, !!accept, fromId), 4);
  onPlayerEvent(socket, 'riddheAlly', (id, { targetId } = {}) => riddheChooseAlly(id, targetId), 4);
  // ริต้า เบอร์นัล: ขอแค่ได้พบกันอีก — เลือกเป้าหมายปลดปล่อยความเจ็บปวด (ใช้ได้แม้ตกรอบไปแล้ว)
  onPlayerEvent(socket, 'phenexRelease', (playerId, { targetId } = {}) => {
    const p = players[playerId];
    if (!p || !p.phenexReleaseAsk) return;
    const ask = p.phenexReleaseAsk;
    p.phenexReleaseAsk = null;
    const options = ask.options.map((id) => players[id]).filter((o) => o && o.alive);
    const target = options.find((o) => o.id === targetId) || null;
    withEffectSource(p, () => CHAR_HOOKS.phenex.resolveRelease(engine, p, target, ask.pain));
    // คำตอบนี้มาแบบ async นอกรอบ resolveRound ปกติ (ตอบช้ากว่ารอบที่ตายจริงก็ได้ — "ใช้ได้แม้ตกรอบไปแล้ว/ทุกเฟส")
    //  ต้องเล่นวีดีโอที่ค้างคิว (ถ้ามี) โดยไม่ทำลาย gameState/ตัวจับเวลาของเฟสที่กำลังทำงานอยู่ตอนนี้
    //  (บั๊กเดิม: เรียก runCutsceneQueue(() => broadcastState()) ตรงๆ ทำให้ gameState ค้างที่ "CUTSCENE"
    //   แบบไม่มีตัวจับเวลาใดๆ ทำงานต่อ — เกมค้างถาวรถ้าคำตอบมาถึงตอนไม่ใช่เฟส PLAYING พอดี)
    if (cutsceneQueue.length) {
      const resumeState = gameState;
      const resumeSeconds = Math.max(3, timeLeft);
      const resumeOnExpire = currentPhaseOnExpire;
      runCutsceneQueue(() => {
        gameState = resumeState;
        if (resumeOnExpire) startPhaseTimer(resumeSeconds, resumeOnExpire);
        broadcastState();
      });
    } else {
      broadcastState();
    }
  });
  // แบทแมน: นายลืมของน่ะ — เลือกเป้าหมายส่งต่อความเสียหายที่รับไว้ (ตอบได้ทุกเฟส เหมือน phenexRelease)
  onPlayerEvent(socket, 'batKarmaSend', (playerId, { targetId } = {}) => {
    const p = players[playerId];
    if (!p || !p.batKarmaAsk) return;
    const ask = p.batKarmaAsk;
    p.batKarmaAsk = null;
    const options = ask.options.map((id) => players[id]).filter((o) => o && o.alive);
    const target = options.find((o) => o.id === targetId) || null;
    withEffectSource(p, () => CHAR_HOOKS.bat_ben.resolveKarmaSend(engine, p, target, ask.dmg));
    // คำตอบมาแบบ async นอกรอบปกติ — ต้องเล่นวีดีโอที่ค้างคิวโดยไม่ทำลาย gameState/ตัวจับเวลาของเฟสปัจจุบัน
    //  (เหตุผลเดียวกับ phenexRelease ด้านบน — เรียก runCutsceneQueue ตรงๆ จะทำให้เกมค้างที่เฟส CUTSCENE)
    if (cutsceneQueue.length) {
      const resumeState = gameState;
      const resumeSeconds = Math.max(3, timeLeft);
      const resumeOnExpire = currentPhaseOnExpire;
      runCutsceneQueue(() => {
        gameState = resumeState;
        if (resumeOnExpire) startPhaseTimer(resumeSeconds, resumeOnExpire);
        broadcastState();
      });
    } else {
      broadcastState();
    }
  });
  onPlayerEvent(socket, 'allyAnswer', (id, { accept, fromId } = {}) => answerAllyOffer(id, !!accept, fromId), 4);
  onPlayerEvent(socket, 'allyBreakAnswer', (id, { cancel } = {}) => answerAllyBreak(id, !!cancel), 4);
  onPlayerEvent(socket, 'allyFinalAnswer', (id, { keep } = {}) => answerAllyFinal(id, !!keep), 4);
  onPlayerEvent(socket, 'bardTarget', (id, { targets } = {}) => withEffectSource(players[id], () => bardTarget(id, targets)), 8);
  onPlayerEvent(socket, 'kaiOverhaul', (id) => withEffectSource(players[id], () => kaiOverhaul(id)), 4);
  // คอนเนอร์ RK800: เป้าหมายระดับอาชญากรตอบคำขาด — submit = true คือ "ยอมจำนน", false คือ "ขัดขืน"
  onPlayerEvent(socket, 'connorArrestAnswer', (id, { submit } = {}) => {
    const t = players[id];
    if (!t || !t.alive || !t.connorArrestAsk) return;
    // วีดีโอสอบปากคำ (connor_skill2) อาจกำลังเล่นอยู่ตอนคำขาดโผล่ — ต้องตอบได้ทั้งสองเฟส
    if (gameState !== 'PLAYING' && gameState !== 'CUTSCENE') return;
    if (!CHAR_HOOKS.conner.answerArrest(engine, t, !!submit, true)) return;
    broadcastState();
    checkAllLocked();
  }, 4);
  onPlayerEvent(socket, 'contractAnswer', (id, { accept, fromId } = {}) => withEffectSource(players[fromId] || players[id], () => answerContract(id, !!accept, fromId)), 4);
  onPlayerEvent(socket, 'attack', (id, { targetId } = {}) => doAttack(id, targetId), 6);
  onPlayerEvent(socket, 'nanayaToggleEye', (id) => nanayaToggleEye(id), 4);
  onPlayerEvent(socket, 'eijiOrdinalScale', (id) => withEffectSource(players[id], () => eijiOrdinalScale(id)), 8);
  onPlayerEvent(socket, 'nanayaCancelReattack', (id) => nanayaCancelReattack(id), 4);
  // QTE (ยุย: ทำนองเพลงร็อก) — กดปุ่มทีละตัว · limit สูงกว่าปกติเผื่อกดรัวตอนตื่นเต้น
  onPlayerEvent(socket, 'qteKey', (id, { key } = {}) => qteKey(id, key), 40);
  onPlayerEvent(socket, 'qteTimeout', (id) => qteTimeout(id), 10);
  onPlayerEvent(socket, 'backToLobby', () => { if (gameState === 'GAMEOVER') backToLobby(); }, 2);

  safeOn(socket, "leave", () => {
    if (!consumeEventQuota(socket, 'leave', 2, 10_000)) return;
    if (!pregameStateActive()) return;
    const playerId = playerIdFor(socket);
    const p = playerId && players[playerId];
    if (!p) return;
    reservePosition(socket.id, p.position);
    forgetPlayerSession(p);
    delete players[playerId];
    socketPlayerIds.delete(socket.id);
    // มีคนออกก่อนเริ่มเกม -> ย้อนกลับห้องรอและรีเซ็ตความพร้อม/ทีมของคนที่เหลือ
    resetPregameFlowToLobby();
    broadcastState();
    broadcastPositions();
  });

  safeOn(socket, 'disconnect', () => {
    const playerId = socketPlayerIds.get(socket.id);
    socketPlayerIds.delete(socket.id);
    releaseReservation(socket.id);
    const p = playerId && players[playerId];
    if (p && p.socketId === socket.id) {
      p.connected = false;
      p.socketId = null;
      if (pregameStateActive()) resetPregameFlowToLobby();
      // During a match the player is parked indefinitely and may reclaim this
      // exact character/session whenever they return. Lobby slots still expire.
      if (pregameStateActive()) scheduleDisconnectedRemoval(playerId);
      broadcastState();
    }
    broadcastPositions();
  });
});


// ============================================================
//  engine — context object ที่ให้ characters/*.js เรียกกลับเข้ามาใช้ state/ฟังก์ชันร่วมของ server.js
//  (ตัวแปร gameState/lastAttack ฯลฯ เป็น let ในไฟล์นี้ — ต้องผ่าน getter/setter เพราะ
//   ส่งค่า primitive ตรงๆ ออกไปจะไม่ live-update เวลาไฟล์นี้ reassign ตัวแปรนั้นทีหลัง)
// ============================================================
const engine = {
  players,
  CHAR_BY_ID,
  CHAR_HOOKS,
  POSITION_COLORS,
  ATTACKFX_TIME,
  ATTACK_TIME,
  BARD_FORTUNE_MAX,
  BARD_SECTION_MAX,
  BARD_DIM_TURNS,
  BARD_DIM_RESIST_TURNS,
  BARD_DIM_FORTUNE,
  BARD_DIM_EVADE,
  BARD_BLOOD_FRAGILE,
  BARD_DIM_NOTES_PER_TURN,
  BARD_SOUL_TARGETS,
  BARD_SOUL_PERFORM_DMG,
  BARD_SONGS,
  TRANSFORMS,
  shikiCancelUltimate,
  SPELLBURDEN_MAX,
  CONTRACT_FEE,
  CONTRACT_CYCLE,
  FIBER_CAP,
  UNPLUG_BUFFS,
  TAKUTO_APPRIVOISE_TURNS,
  DOOM_WEAPONS,
  rollDoomWeapon,
  DOOM_LOCKON_CHANCE,
  DOOM_EXPLODE_DMG,
  DOOM_EXPLODE_TARGETS,
  DOOM_LOCKON_BONUS,
  DOOM_CRUCIBLE_ATK,
  DOOM_ROCKET_BONUS_DMG,
  DOOM_BALLISTA_TARGET_DMG,
  DOOM_DRAIN_DMG,
  DOOM_DRAIN_TURNS,
  DOOM_SHIELD_ON_ATK,
  DOOM_FORTUNE_CHANCE,
  DOOM_CRUCIBLE_CHARGE_NEED,
  DOOM_HEAL_ON_ATK,
  DOOM_CHARGE_CHANCE,
  DOOM_TIE_ATTACK_CHANCE,
  OVERLOAD_FORCE_CHANCE,
  DOOM_CRUCIBLE_BUST_DMG,
  DOOM_CRUCIBLE_BUST_DRAWS,
  DOOM_CRUCIBLE_BUST_BONUS,
  oguriGoldStacks,
  oguriChargeCapOf,
  oguriAshenReady,
  oguriAddEnergy,
  oguriAddCharge,
  OGURI_ENERGY_MAX,
  OGURI_GOLD_MAX,
  OGURI_ULT2_CHARGE_COST,
  MAX_HP,
  maxHpOf,
  maxArmorOf,
  maxSkillOf,
  addSkill,
  drawCardFor,
  onCardDrawn,
  drawToScore,
  get centralDeck() { return centralDeck; },
  setCentralDeck(v) { centralDeck = v; },
  get kaiOverhaulSlots() { return kaiOverhaulSlots; },
  setKaiOverhaulSlots(v) { kaiOverhaulSlots = v; },
  voidUltimateOnBust,
  maybeMoonBurst,
  sealActive,
  BEAM_AMMO,
  riddheAllied,
  riddheGrantFreeNtdToAlly(rAlly, byId) { return CHAR_HOOKS.riddhe.grantFreeNtdToAlly(engine, rAlly, byId); },
  hasQueuedCutscene() { return cutsceneQueue.length > 0; },
  startQte,           // ระบบ QTE กลาง (ดูหัวข้อ QTE ด้านบนของไฟล์)
  clearQte,
  qteKey,             // เปิดไว้ให้เทสต์กดปุ่มแทนผู้เล่นได้ (โค้ดจริงเรียกจาก socket handler)
  qtePending,
  // drawCardFor / voidUltimateOnBust มีอยู่แล้วด้านล่าง — ไม่ต้องประกาศซ้ำ
  // ---------- ระบบย้อนเวลา (ท่าไม้ตายของอิสึกะ ชิโด) ----------
  snapshotBefore,        // หยิบสแนปช็อตต้นเทิร์นของ N เทิร์นก่อนหน้า (ไม่ลึกพอ = ใบเก่าสุดที่มี)
  pushSnapshotHistory,   // เปิดไว้ให้เทสต์สร้างประวัติจำลองได้ (โค้ดจริงเรียกจาก dealRound เท่านั้น)
  applySnapshot,         // เขียนสภาพสนามทั้งหมดกลับไปเป็นของสแนปช็อตใบนั้น
  clearSnapshotHistory,  // ลบประวัติทิ้ง (อนาคตที่ถูกย้อนไปแล้วใช้ต่อไม่ได้)
  get roundSkills() { return roundSkills; }, // สกิลที่ถูกกดในเทิร์นนี้ (หลักสูตร "พิเศษ" ของไบเลธอ่านว่าใครกดระดับไหน)
  takumiBlackoutActive,
  doomWeaponMarkPending,
  get gameState() { return gameState; },
  setGameState(v) { gameState = v; },
  get cutsceneInfo() { return cutsceneInfo; },
  get gameMode() { return gameMode; },
  setGameMode(v) { gameMode = v; },
  setTeamCount(v) { teamCount = v; },
  setTeamSize(v) { teamSize = v; },
  resetModeVotes,
  voteGameMode,
  validGameMode,
  modeOptionsFor,
  remainingTeamWinInfo,
  get winningTeamId() { return winningTeamId; },
  teamModeActive,
  sameTeam,
  friendlyEffectBlocked,
  withEffectSource,
  // ต้นตอของเอฟเฟกต์ที่กำลังทำงานอยู่ (ตั้งโดย withEffectSource) — hook ที่ต้องรู้ว่า "ใครเป็นคนทำ"
  //  ในจังหวะที่ไม่มีพารามิเตอร์ผู้กระทำส่งมาให้ (เช่น adjustIncomingDamage) อ่านตรงนี้
  get effectSourceId() { return effectSourceId; },
  get roundNumber() { return roundNumber; },
  setRoundNumber(v) { roundNumber = v; },
  get attackerId() { return attackerId; },
  setAttackerId(v) { attackerId = v; },
  get lastAttack() { return lastAttack; },
  setLastAttack(v) { lastAttack = v; },
  attackableTargets,
  get oberonDevour() { return oberonDevour; },
  setOberonDevour(v) { oberonDevour = v; },
  setNightResetPending(v) { nightResetPending = v; },
  // โอเบรอน Lie Like Vortigern (rework 2): ให้เทิร์นปัจจุบันกลายเป็นจุดเริ่มคืนใหม่เต็มรอบ (CYCLE_TURNS เทิร์น นับจากนี้)
  //  หมายเหตุ: เคยลองใช้ cycleShift += n (บวกคงที่) มาก่อน แต่สูตรนั้นพังถ้ากดกลางดึกที่ไม่ใช่เทิร์นแรกของคืน — ทำให้เกิดวันแทรกกลางคืนสั้นๆ แบบสุ่ม
  //  ใช้สูตรเดียวกับ nightResetPending เดิม (คำนวณ cycleShift ใหม่ตรงๆ) ซึ่งพิสูจน์แล้วว่าไม่มีรอยต่อเพี้ยน
  extendNight() { cycleShift = roundNumber - (CYCLE_TURNS + 1); },
  // ยูนะ ไอดอลประจำสนาม
  get yunaEffect() { return yunaEffect; },
  yunaBeatBarkActive, // เกตจริงของ Break Beat Bark! (รวมกรณีที่ท่าไม้ตายเอจิบังคับเปิด) — เทสต์อ่านตรงนี้
  get yunaWindowEnd() { return yunaWindowEnd; },
  get yunaLongingUsed() { return yunaLongingUsed; },
  get yunaPity() { return yunaPity; },
  setYunaPity(v) { yunaPity = v; },
  setYunaTrigger({ effect, targetId, windowEnd }) { yunaEffect = effect; yunaTargetId = targetId; yunaWindowEnd = windowEnd; yunaMusicSeq++; },
  tryYunaLongingForTwin,
  pushCutsceneRaw(entry) { cutsceneQueue.push(entry); },
  log(msg) { lastLog.push(msg); },
  // การ์ดสกิลเด้งบนกระดาน (ไม่หยุดเกม) — payload.sound = คีย์ใน client/src/audio.js ให้เล่นพร้อมการ์ด
  skillFlash(payload) { io.emit("skillFlash", payload); },
  colorOf(p) { return POSITION_COLORS[p.position] || "#888"; },
  nextTransformCounter() { return ++transformCounter; },
  startMatch,
  yuukiBoss,
  finishYuukiVictory,
  endTurn,
  doAttack,
  useSkill,
  alivePlayers,
  isNightRound,
  nightCycleIndex,
  GOLD_MAX,
  goldCapOf,
  addGold,
  // ---------- ร้านค้ามายา (เปิดไว้ให้ tests/shop.test.js เรียกตรงๆ) ----------
  shopItemName,
  grantInventoryItem,
  GUTS_AMMO,
  GUTS_GUN_PRICE,
  GUTS_CHAA_TURNS,
  GUTS_NURSE_DMG,
  BLACK_SPARKLENCE_NURSE_COOLDOWN,
  rollShopItem,
  openShop,
  buyShopItem,
  useInventoryItem,
  gutsFireTargetOf,
  applyGutsBullet,
  hasGutsGun,
  hasBlackSparklence,
  hasGutsWeapon,
  hit,
  get shopItems() { return shopItems; },
  setShopItems(v) { shopItems = v; },
  NETRAMANA_KILL_CHANCE,
  netramanaActive,
  statusAmtOf,
  calculateScore,
  scoreCap,
  get overloadForceActive() { return overloadForceActive; },
  setOverloadForceActive(v) { overloadForceActive = !!v; },
  get overloadForceCount() { return overloadForceCount; },
  setOverloadForceCount(v) { overloadForceCount = Number(v) || 0; },
  triggerOverloadForce,
  applyOverloadOverdrawPenalty,
  applyBuff: rawApplyBuff,
  applyDebuff,
  MEND_MAX_TURNS,
  applyMend, // "เยียวยา" (สถานะ Universal): จุดเดียวที่ทุกตัวละครใช้ใส่สถานะนี้ (เคารพเพดานเทิร์น)
  tickMend,
  blindActive,
  // มหาเทพ อรชุน (Mahapralaya): พลังโจมตีปกติที่ attacker จะฟาดใส่ target ได้ — ใช้ท่อเดียวกับคอนเนอร์
  attackPowerAgainst: estimateAttackOn,
  // ผู้วิงวอน: เอฟเฟกต์ gif ทับไอคอนผู้เล่น (ระบบใหม่ patch 3.4) — kind = คีย์ใน CHAR_HOOKS.the_supplicant.FX
  iconFx,
  setTurnsNoRefresh,
  applySpellburden,
  cleanseDebuffs,
  coolReduction,
  BASIC_DEBUFF_CLEAR,
  SOFT_DEBUFF_STEP,
  noHealActive,
  invertActive,
  HBLEED_MAX,
  bleedActive,
  applyBleed, // "เลือดไหล" (สถานะ Universal): จุดเดียวที่ทุกตัวละครใช้ใส่สถานะนี้ (เคารพต้านสถานะ + เพดาน)
  EVADE_STACK_MAX,
  EVADE_STACK_TURNS,
  grantEvadeStack,
  consumeEvadeStack,
  healHp,
  healArmor,
  healOverflow,
  loseHp,
  loseArmor,
  dealDirect,
  dealMixed,
  dealArmorOnly,
  damageSoft,
  instantDeath,
  displayImg,
  passiveSealed,
  killSealed,
  resistActive,
  maybeWakeKotone,
  maybeBeatSave,
  maybeBeatMode,
  maybeEva3,
  resolveDamageAftermath,
  bustedOf,
  scoreOf,
  shikiGiveLifeline,
  clearWitherLines,
  hasKillCapability,
  miyakoKillChance,
  miyakoSurvivedKillAttempt,
  appleGuyDodgesKill,
  satoruOnTargeted,
  queueCutscene,
  triggerCutscene,
  notifyTransform,
  queueTransformAnnounce,
  runCutsceneQueue,
  pausePlayingForCutscene,
  startPhaseTimer,
  clearPhaseTimer,
  reduceCardTimer, // เอจิ สกิลติดตัว 1: บีบเวลาที่เหลือของเฟสจั่วการ์ด
  broadcastState,
  checkAllLocked,
};

// เผื่อ require() ไฟล์นี้จากเทสต์ (ดึง computeAttackBase ไปทดสอบตรงๆ ไม่ต้องบูตทั้งเซิร์ฟเวอร์)
//  — ฟังก์ชันอื่นที่เหลือยังเข้าถึงไม่ได้จากภายนอกโดยตั้งใจ ต้องเพิ่มเข้า export นี้เองถ้าจะทดสอบเพิ่ม
module.exports = {
  computeAttackBase,
  resolveRound, // เทสต์เรียกตรงๆ เพื่อพิสูจน์การตัดสินผู้ชนะ/ผู้แพ้จริง (ไม่จำลองเงื่อนไขเอง)
  attackSoundOf, // เสียงโจมตีปกติเฉพาะตัวละคร (เทสต์อ่านตรงนี้)
  engine,
  maxHpOf,
  maxArmorOf,
  yuukiStatsForPlayerCount,
  yuukiCanSafelyDraw,
  resetOverloadDrawCounter,
  autoPlayYuuki,
  captureTurnSnapshot,
  restoreTurnSnapshot,
  clearTurnSnapshot,
};

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log("🃏 ECHO — Blackjack Skill Battle ทำงานที่พอร์ต " + PORT));
}
