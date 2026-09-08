const SHOP_ITEM_INFO = {
  cardColor: { icon: "🎨", label: () => "ยาเปลี่ยนสีการ์ด", desc: "เลือกการ์ด 1 ใบในมือ แล้วเปลี่ยนเป็นสีที่ต้องการ (ใช้ได้เฉพาะช่วงกำลังจั่วไพ่และยังไม่ล็อก)" },
  fortune: { icon: "🍀", label: () => "ยาโชคลาภ", desc: "ได้รับโชคลาภ +2 หน่วย — จั่วครั้งถัดไปจะปรับไพ่ที่จั่วให้แต้มรวมตกช่วง 19-21 ทันที แล้วหน่วยนั้นหายไป" },
  resist: { icon: "🛡️", label: () => "ยาต้านสถานะ", desc: "ต้านสถานะผิดปกติทุกประเภท 1 เทิร์น (ป้องกันล่วงหน้าเท่านั้น ไม่ใช่ยารักษา)" },
  cardRemove: { icon: "✂️", label: () => "ยาลดไพ่", desc: "ลดไพ่ใบล่าสุดของตัวเองออก 1 ใบทันที — ใช้กันไพ่แตกได้ (ใช้ได้เฉพาะช่วงกำลังจั่วไพ่และยังไม่ล็อก)" },
  skillPoint: { icon: "⚡", label: (it) => `ยาฟื้นแต้มสกิล +${it.value}`, desc: "ฟื้นแต้มสกิลทันที (เกินเพดานจะหายทิ้งส่วนที่เกิน)" },
  armor: { icon: "🔧", label: (it) => `ยาฟื้นเกราะ +${it.value}`, desc: "ฟื้นเกราะทันที" },
  heroSword: { icon: "⚔️", img: "/characters/yuuki/yuuki.jpg", label: () => "ดาบผู้กล้า", desc: "ไอเทมเฉพาะจากการโค่นยูกิ — ใช้แล้วพลังโจมตีปกติ +2 เป็นเวลา 2 เทิร์น (หาซื้อไม่ได้)" },
  tepeuMeal: { icon: "🍲", label: (it) => `มื้อที่สุข (ฟื้นเลือด +${it.value})`, desc: "ฟื้นพลังชีวิตทันที — ผลิตได้จากเทเปาเท่านั้น (วันนี้อากาศดีจัง)" },
  wineBarrel: { icon: "🍷", img: "/characters/escanor/สกิลพื้นฐาน/Barrel.png", label: (it) => `WineBarrel Lv.${it.level || 1}`, desc: "ใช้แล้วฟื้น HP ตามระดับ; ระดับ IV ฟื้น HP 3 หน่วย และมอบมึนเมา 2 หน่วยกับเย็นชื่นใจ 2 หน่วย; อยู่ในกระเป๋าครบ 4 เทิร์นจะอัปเกรด 1 ระดับ สูงสุด IV" },
  // ---------- ปืนหน่วย GUTS Select + กระสุน (ขายในร้านค้ามายา — ใช้รูปจริงแทน emoji) ----------
  gutsGun: { icon: "🔫", img: "/item/guts_select_gun/guts_gun.webp", label: () => "ปืนหน่วย GUTS Select", desc: "ไอเทมถาวร มีได้กระบอกเดียว — กดที่ปืนเพื่อเลือกกระสุนแล้วเลือกเป้าหมาย ยิงได้ 1 นัด/เทิร์น (เฉพาะช่วงจั่วไพ่)" },
  blackSparklence: { icon: "BS", img: "/characters/ignis/Black Sparklence.webp", label: () => "Black Sparklence", desc: "ปืนถาวรของอิกนิส ใช้กระสุนจากร้านค้ามายาได้ ยิงได้ 1 นัดต่อเทิร์นในช่วงจั่วไพ่ — หลังยิง Nursedessei Cannon จะใช้ปืนไม่ได้ 3 เทิร์น" },
  gutsAmmo: {
    icon: "🔑",
    imgOf: (it) => GUTS_AMMO_INFO[it.ammo]?.img,
    label: (it) => GUTS_AMMO_INFO[it.ammo]?.name || "กระสุน",
    descOf: (it) => GUTS_AMMO_INFO[it.ammo]?.desc || "",
  },
};
// ข้อมูลกระสุนฝั่ง client (ชื่อ/รูปคีย์/คำอธิบาย) — ต้องตรงกับ GUTS_AMMO ใน server.js
export const GUTS_AMMO_INFO = {
  shockwave: { name: "Shockwave Bullet",   img: "/item/guts_key/gomora_key.webp",    video: "/item/guts_key/shockwave_boost.mp4",    desc: "ทำลายเกราะของเป้าหมายทั้งหมด แต่ไม่สร้างความเสียหายให้พลังชีวิตจริง" },
  gargorgon: { name: "Gargorgon Ray",      img: "/item/guts_key/gargorgon_key.webp", video: "/item/guts_key/gargorgon_ray.mp4",      desc: "เทิร์นถัดไปเป้าหมายติดสถานะสตั้น 1 เทิร์น (จั่วการ์ด/กดสกิลไม่ได้) — ต้านทานได้" },
  thunder:   { name: "Thunder Bullet",     img: "/item/guts_key/eleking_key.webp",   video: "/item/guts_key/thunder_boost.mp4",      desc: "เป้าหมายติดสถานะ [สภาพชา] 2 เทิร์น — กดจั่ว 1 ครั้งได้ไพ่ 2 ใบ — ต้านทานได้" },
  nurse:     { name: "Nursedessei Cannon", img: "/item/guts_key/nurse_key.webp",     video: "/item/guts_key/nursedessei_cannon.mp4", desc: "ความเสียหาย 4 หน่วย (ลดเกราะก่อน) — ปืน GUTS Select จะพัง; หากใช้ Black Sparklence จะใช้ปืนไม่ได้ 3 เทิร์น" },
  trigger_dark_key: { name: "Trigger Dark Key", img: "/item/guts_hyper_key/hyper_key_trigger_dark.jpg", video: "/characters/ignis/trigger_dark.mp4", desc: "ใช้กับ Black Sparklence ของอิกนิสเพื่อแปลงร่างเป็น Trigger Dark 5 เทิร์น ใช้แล้วคีย์หาย ต้องซื้อใหม่" },
  hyper_trigger: { name: "Hyper Key Trigger", img: "/item/guts_hyper_key/hyper_key_trigger.jpg", video: "/characters/ultraman_trigger/trigger_henshin.mp4", desc: "ซื้อขาด ใช้ร่วมกับปืน GUTS Select เพื่อแปลงร่างเป็น Ultraman Trigger 10 เทิร์น — หลังคืนร่างต้องรอ 5 เทิร์นก่อนใช้ซ้ำ" },
};

export function shopInfoOf(it) {
  const base = SHOP_ITEM_INFO[it.type] || { icon: "✦", label: () => "สินค้า", desc: "" };
  // imgOf/descOf: ไอเทมที่หน้าตา/คำอธิบายขึ้นกับข้อมูลในตัวไอเทมเอง (กระสุนแต่ละแบบ)
  return { ...base, img: base.imgOf ? base.imgOf(it) : base.img, desc: base.descOf ? base.descOf(it) : base.desc };
}
