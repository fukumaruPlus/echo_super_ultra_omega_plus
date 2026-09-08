// ============================================================
//  SE.RA.PH — ทะเบียนไฟล์สื่อของโหมด + ตัวโหลดล่วงหน้า
//  ไฟล์จริงอยู่ใน client/public/mooncell/ (ไม่ track ใน git — ดู GAME_SYSTEM.md gotcha #9)
//
//  ข้อจำกัดของไฟล์ชุดปัจจุบันที่โค้ดฝั่งนี้ต้องรับมือ:
//   1) GIF ความละเอียดต่ำ (500x281 / 358x200) แต่ต้องขยายเต็มจอ 1920 => เบลอแน่นอน
//      แก้ด้วยการ "ยอมรับความเบลอแล้วทำให้เป็นสไตล์": ทับ scanline + ตาราง + วีเนต
//      ให้อ่านเป็นจอ CRT/ฟีดดิจิทัลเก่า (ดู .sc-bg-* ใน seraph.css) ไม่ใช่ภาพแตก
//   2) น้ำหนักรวม ~18.7 MB — ห้ามโหลดพร้อมกันทั้งหมด จึงแบ่งเป็น 3 ระลอกตามลำดับการใช้จริง
// ============================================================

const BASE = "/mooncell";
const U = (p) => encodeURI(`${BASE}/${p}`);

// ---------- ฉากหลังเคลื่อนไหว (GIF) ----------
export const SC_BG = {
  normal: U("update/background_normal.gif"), // วันที่ 1-6 (S1-S3)          5.2 MB
  rest: U("update/background_rest.gif"),     // เลือกสถานที่ + ในสถานที่     2.8 MB
  day5: U("update/background_day_5.gif"),    // วันที่ 7 รอบกลางวัน          7.1 MB
  night5: U("update/background_night_5.gif") // วันที่ 7 รอบกลางคืน          2.8 MB
};

// ---------- เอฟเฟกต์กลิตช์เต็มจอ ----------
export const SC_GLITCH = U("update/glitch_screen.gif"); // 0.77 MB

// ---------- ภาพสถานที่ 5 แห่ง (ชื่อไฟล์เป็นภาษาไทย -> ต้อง encodeURI) ----------
export const SC_PLACE = {
  room: { key: "room", name: "ห้องพัก", icon: "🛏️", img: U("ห้องพัก.jpg") },
  church: { key: "church", name: "โบสถ์", icon: "⛪", img: U("โบสถ์.jpg") },
  park: { key: "park", name: "สวนสาธารณะ", icon: "🌳", img: U("สวนสาธารณะ.jpg") },
  library: { key: "library", name: "ห้องสมุด", icon: "📚", img: U("ห้องสมุด.jpg") },
  store: { key: "store", name: "ร้านสะดวกซื้อ", icon: "🏪", img: U("ร้านสะดวกซื้อ.jpg") }
};
export const SC_PLACE_ORDER = ["room", "church", "park", "library", "store"];

// ---------- เพลง/เสียง (คีย์ตรงกับที่เพิ่มใน audio.js) ----------
export const SC_SFX = { glitch: "sc_glitch", noti: "sc_noti", noti2: "sc_noti2" };
export const SC_MUSIC = { day: "sc_day", rest: "sc_rest", duelDay: "sc_duel_day", duelNight: "sc_duel_night" };

// ============================================================
//  ตัวโหลดล่วงหน้า — 3 ระลอก
//   wave 1 (เข้าโหมด)      : ฉากหลังวันธรรมดา + กลิตช์            ~6.0 MB
//   wave 2 (จบวันแรก)      : ฉากหลังช่วงพัก + ภาพสถานที่ 5 แห่ง    ~2.8 MB +
//   wave 3 (เข้าวันที่ 4)  : ฉากหลังวันดวล **เฉพาะช่วงเวลาที่ใช้จริง** ประหยัดได้ 2.8-7.1 MB
//  GIF ที่โหลดแล้วอยู่ใน HTTP cache — การ mount <img> ทีหลังจึงไม่ดาวน์โหลดซ้ำ
// ============================================================

const loaded = new Set();

function preloadOne(url) {
  if (!url || loaded.has(url)) return Promise.resolve(url);
  loaded.add(url);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve(url);
    img.src = url;
  });
}

/** โหลดระลอกที่ 1 — เรียกทันทีที่รู้ว่ากำลังจะเข้าโหมด SE.RA.PH */
export function preloadWave1() {
  return Promise.all([SC_BG.normal, SC_GLITCH].map(preloadOne));
}

/** โหลดระลอกที่ 2 — เรียกตอนจบการจั่วไพ่วันแรก (ก่อนเห็นหน้าเลือกสถานที่ครั้งแรก) */
export function preloadWave2() {
  return Promise.all([SC_BG.rest, ...SC_PLACE_ORDER.map((k) => SC_PLACE[k].img)].map(preloadOne));
}

/**
 * โหลดระลอกที่ 3 — เรียกตอนเข้าวันที่ 4
 * โหลดแค่ไฟล์ของช่วงเวลาที่รอบนี้จะใช้จริง (ดู SERAPH_SCENES.md §6: 1 รอบ = 1 ช่วงเวลาพอดี)
 */
export function preloadWave3(night) {
  return preloadOne(night ? SC_BG.night5 : SC_BG.day5);
}

/** ฉากหลังที่ควรใช้ตามเฟส — จุดเดียวที่ตัดสินเรื่องนี้ทั้งโหมด */
export function backgroundFor(phase, night) {
  if (phase === "place" || phase === "placeResult") return SC_BG.rest;
  if (phase === "duel" || phase === "duelQueue") return night ? SC_BG.night5 : SC_BG.day5;
  return SC_BG.normal;
}
