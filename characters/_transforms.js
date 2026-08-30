// ============================================================
//  TRANSFORMS — ตาราง cutscene metadata ต่อสถานะ (data ล้วนๆ ไม่มี logic)
//  ย้ายออกมาจาก server.js เพื่อลดขนาดไฟล์หลัก — ยังคง require เป็น const เดียวใน server.js เหมือนเดิม
//  รับ path รูปภาพที่ server.js ใช้ร่วมกับที่อื่น (เช่น displayImg) ผ่าน factory function กันค่าซ้ำสองที่
//
//  afterReveal = เล่นหลังเปิดไพ่ (ท่าไม้ตาย) | ntd/beat เล่นตอน trigger (โดนโจมตี/เลือดต่ำ)
//  voice = เสียงพากย์เล่นต่อเมื่อวีดีโอจบ | music = เพลงสกิลที่ค้างหลัง cutscene
// ============================================================
const connorImg = require("./conner").IMG; // คอนเนอร์ RK800: ใช้ path รูปชุดเดียวกับไฟล์ตัวละครกันค่าซ้ำสองที่

module.exports = function buildTransforms(img) {
  return {
    // ---------- คอนเนอร์ RK800 (patch 2.7 new) ----------
    //  seconds วัดจาก mvhd จริงแล้วเผื่อเวลาตัดฉาก ~1 วินาที (เปิดตัว 6.94 · สอบปากคำ 10.89 · ปิดคดี 16.29
    //  · ไล่ล่า 1/2/3 = 7.06/8.86/13.40 · จับกุมสำเร็จ 6.00 · หนีรอด 9.45 · ป้องกันตัว 17.00)
    //  วีดีโอชุด "ไล่ล่า" · "การป้องกันตัว" · "จัดการปิดคดี" เรียกผ่าน queueCutscene ตรงๆ จึงเล่นทุกครั้งที่ทำงาน
    //  ส่วนเปิดตัว/สอบปากคำ เรียกผ่าน triggerCutscene = เล่นเต็มครั้งแรกครั้งเดียวต่อเกม
    //  เพลงไล่ล่า (conner_theme) ไม่ผูกกับคัตซีน — มาจาก CHAR_HOOKS.conner.activeMusic() ตลอดช่วงไล่ล่า
    //  connorIntro เผื่อเวลามากกว่าคลิปอื่น (6.94 -> 10) เพราะเป็นวีดีโอเดียวที่เล่นทันทีตอนแมตช์เริ่ม
    //  ผู้เล่นทุกคนจึงโหลดมันแบบเย็นสนิท (7.9MB จาก R2) — ฝั่ง client ดึงมาแคชไว้ตั้งแต่ห้องรอแล้วด้วย (ดู VideoPreloader)
    connorIntro:       { img: connorImg.base,   video: "/characters/connor/conner_openning.mp4",        title: "CONNOR RK800", label: "เริ่มปฏิบัติการ",   seconds: 10, music: null, afterReveal: false },
    connorInterrogate: { img: connorImg.skill2, video: "/characters/connor/skill2/connor_skill2.mp4",   title: "ข่มขวัญ/จับกุม", label: "ใช้สกิลรอง",       seconds: 12, music: null, afterReveal: false },
    connorCloseCase:   { img: connorImg.skill3, video: "/characters/connor/skill3/connor_skill3.mp4",   title: "จัดการปิดคดี",   label: "ปล่อยท่าไม้ตาย",   seconds: 17, music: null, afterReveal: false },
    connorArrest1:     { img: connorImg.skill2, video: "/characters/connor/arrest/connor_arrest_1.mp4", title: "เริ่มการไล่ล่า", label: "จับกุมขั้นเด็ดขาด", seconds: 8,  music: null, afterReveal: false },
    connorArrest2:     { img: connorImg.skill2, video: "/characters/connor/arrest/connor_arrest_2.mp4", title: "ไล่ล่า 1/3",     label: "จับกุมขั้นเด็ดขาด", seconds: 10, music: null, afterReveal: false },
    connorArrest3:     { img: connorImg.skill2, video: "/characters/connor/arrest/connor_arrest_3.mp4", title: "ไล่ล่า 2/3",     label: "จับกุมขั้นเด็ดขาด", seconds: 14, music: null, afterReveal: false },
    connorArrestTrue:  { img: connorImg.skill2, video: "/characters/connor/arrest/connor_arrest_true.mp4",  title: "จับกุมสำเร็จ", label: "ปิดคดี",        seconds: 7,  music: null, afterReveal: false },
    connorArrestFalse: { img: connorImg.skill2, video: "/characters/connor/arrest/connor_arrest_false.mp4", title: "เป้าหมายหนีรอด", label: "คดีล่ม",      seconds: 10, music: null, afterReveal: false },
    connorSelfDefense: { img: connorImg.base,   video: "/characters/connor/connor_passive4.mp4",        title: "การป้องกันตัว",  label: "สกิลติดตัวทำงาน",  seconds: 18, music: null, afterReveal: false },
    // Escanor: วิดีโอเต็มจอของแต่ละเหตุการณ์เล่นได้ครั้งเดียวต่อแมตช์/ต่อผู้เล่นผ่าน triggerCutscene
    // seconds วัดจาก mvhd จริงและเผื่อเวลาตัดฉาก ~1 วินาที เพื่อไม่ให้วิดีโอถูกตัดก่อนจบ
    escanorMorning: { img: "/characters/escanor/ร่าง เช้า Profile.png", video: "/characters/escanor/ร่าง เช้า Animation.mp4", title: "ESCANOR", label: "เข้าสู่ร่าง Morning", seconds: 19, music: null, afterReveal: false },
    escanorLastStand: { img: "/characters/escanor/Last Stand Profile.png", video: "/characters/escanor/Last Stand.mp4", title: "LAST STAND", label: "คืนชีพ", seconds: 6, music: null, afterReveal: false },
    escanorBasic1: { img: "/characters/escanor/สกิลพื้นฐาน/สกิลพื้นฐาน 1 บอลเพลิงสุริยะ.png.jpg", video: "/characters/escanor/สกิลพื้นฐาน/สกิลพื้นฐาน 1 บอลเพลิงสุริยะ.mp4", title: "บอลเพลิงสุริยะ", label: "ใช้สกิลพื้นฐาน", seconds: 12, music: null, afterReveal: false },
    escanorSecondary1: { img: "/characters/escanor/สกิลรอง/สกิลรอง 1 เพลิงปะทุ.jpg", video: "/characters/escanor/สกิลรอง/สกิลรอง 1 เพลิงปะทุ.mp4", title: "เพลิงปะทุ", label: "โจมตี", seconds: 7, music: null, afterReveal: false },
    escanorUltimate1: { img: "/characters/escanor/สกิลอัลติเมต/Rhitta.jpg", video: "/characters/escanor/สกิลอัลติเมต/สกิลอัลติเมต 1 Divin Axe Rhitta.mp4", title: "DIVIN AXE RHITTA", label: "โจมตี", seconds: 12, music: null, afterReveal: false },
    escanorSecondary3: { img: "/characters/escanor/สกิลรอง/สกิลรอง 3 หมัดเพลิงสุริยัน.png.jpg", video: "/characters/escanor/สกิลรอง/สกิลรอง 3 หมัดเพลิงสุริยัน.mp4", title: "หมัดเพลิงสุริยัน", label: "โจมตี", seconds: 19, music: null, afterReveal: false },
    escanorUltimate3: { img: "/characters/escanor/สกิลอัลติเมต/สกิลอัลติเมต 3 ดวงอาทิตย์จำลอง.png.jpg", video: "/characters/escanor/สกิลอัลติเมต/สกิลอัลติเมต 3 ดวงอาทิตย์จำลอง.mp4", title: "ดวงอาทิตย์จำลอง", label: "โจมตี", seconds: 12, music: null, afterReveal: false },
    // ginga (patch 2.1.3): ตอนนี้เป็นสกิลรอง 1 — ทำงานก่อนเปิดการ์ดแล้ว (ไม่ใช่ afterReveal อีกต่อไป)
    ginga:    { img: "/characters/hikaru/ginga.jpg",           video: "/characters/hikaru/ginga_final.mp4",     title: "ULTLIVE ULTRAMAN GINGA", label: "ใช้สกิลรอง",   seconds: 21, music: "ginga",   afterReveal: false },
    // gingastrium (patch 2.1.3): ท่าไม้ตายใหม่ — ทำงานก่อนเปิดการ์ด เพลง gingastrium (ginga_theme2) แทนเพลง ginga
    gingastrium: { img: img.HIKARU_STRIUM_IMG, video: "/characters/hikaru/hikaru_update/ginga_skill3.mp4", title: "GINGA STRIUM", label: "ปล่อยท่าไม้ตาย", seconds: 20, music: "gingastrium", afterReveal: false },
    // hikaruStorium (patch 2.1.3): สกิลรอง 2 ลำแสงสโตเรียม — เล่นก่อนสรุปผลตอนชนะแล้วได้โจมตี
    hikaruStorium: { img: "/characters/hikaru/hikaru_update/ginga_skill2.2.png", video: "/characters/hikaru/hikaru_update/ginga_skill2.2.mp4", title: "STORIUM RAY", label: "ใช้สกิล", seconds: 16, music: null, afterReveal: false },
    // patch 2.1.2 ลิงก์ Rework: NewType Paradise ทำงานก่อนเปิดการ์ดแล้ว (ไม่ใช่ afterReveal อีกต่อไป — เล่นวีดีโอทันทีตอนกด)
    paradise: { img: "/characters/banagher/unicorn_ntdfinal.jpg", video: "/characters/banagher/Unicorn_final.mp4", title: "NEWTYPE PARADISE",    label: "ปล่อยท่าไม้ตาย",   seconds: 10, music: "unicorn", afterReveal: false },
    ntd:      { img: "/characters/banagher/banagher_update/unicorn_new_ndt.png", video: "/characters/banagher/NTD_passive.mp4",   title: "NT-D SYSTEM",           label: "สกิลติดตัวทำงาน", seconds: 9,  music: null,     afterReveal: false },
    // banagherAssault: สกิลรอง 1 Full Assault — เล่นทันทีตอนกด (ก่อนเปิดการ์ด) วีดีโอ 5 วิ
    banagherAssault: { img: "/characters/banagher/banagher_update/skill2_new/unicorn_skill2_new.webp", video: "/characters/banagher/banagher_update/skill2_new/unicorn_skill2_new.mp4", title: "FULL ASSAULT", label: "ใช้สกิล", seconds: 6, music: null, afterReveal: false },
    // banagherBeamAtk: สกิลรอง 2 Beam Magnum (ระหว่างร่าง Paradise) — เล่นก่อนสรุปผลตอนได้โจมตี วีดีโอ 4 วิ
    banagherBeamAtk: { img: "/characters/banagher/unicorn_skill2.jpg", video: "/characters/banagher/banagher_update/skill2.2/unicorn_skill2.2.mp4", title: "BEAM MAGNUM", label: "ใช้สกิล", seconds: 5, music: null, afterReveal: false },
    // banagherAlly: ต่อจากวีดีโอ Paradise เมื่อมีริดดี้เป็นพันธมิตร — วีดีโอ 19 วิ
    banagherAlly: { img: "/characters/banagher/unicorn_ntdfinal.jpg", video: "/characters/banagher/banagher_update/bansheeandunicorn.mp4", title: "ไม่ได้อยู่ตัวคนเดียว", label: "ปล่อยท่าไม้ตาย", seconds: 20, music: null, afterReveal: false },
    // banagherPassive2: สกิลติดตัว 2 ฉันไม่อยากให้เราต้องมาสู้กัน — เล่นก่อนล็อกเป้าแก้แค้นใส่ริดดี้ วีดีโอ 14 วิ
    banagherPassive2: { img: "/characters/banagher/banagher_update/unicorn_new_ndt.png", video: "/characters/banagher/banagher_update/unicorn_passvie2.mp4", title: "ฉันไม่อยากให้เราต้องมาสู้กัน", label: "สกิลติดตัวทำงาน", seconds: 15, music: null, afterReveal: false },
    // unibeam2: ท่าไม้ตาย 2 แสงที่ไม่อยู่เพียงลำพัง — เล่นก่อนสรุปผลตอนได้โจมตี วีดีโอ 5 วิ
    unibeam2: { img: "/characters/banagher/banagher_update/unicorn_skill3.2.jpg", video: "/characters/banagher/banagher_update/unicorn_and_banshee_beam.mp4", title: "แสงที่ไม่อยู่เพียงลำพัง", label: "ปล่อยท่าไม้ตาย", seconds: 6, music: null, afterReveal: false },
    // tepeuUlt: นายเป็นคนทำตัวเองนะ (เทเปา ชิกิ) — ผลสังหาร/พลาดคำนวณและเล่นวีดีโอนี้หลังทุกคนเปิดไพ่แล้ว (afterResolve) วีดีโอ 13 วิ
    //  จบแล้วเพลง tepeu + ฉากหลังซ้อนแบบโทโนะ ชิกิ (shiki_fill.png) จนกว่าเทิร์นนั้นจะจบ — เรียก triggerCutscene เอง ไม่ผ่านลูป afterReveal อัตโนมัติ (afterReveal:true ไว้เพื่อบันทึกความหมายเท่านั้น)
    tepeuUlt: { img: "/characters/tepeu/skill3/tepeu_skill3.jpg", video: "/characters/tepeu/skill3/tepeu_skill3.mp4", title: "นายเป็นคนทำตัวเองนะ", label: "ปล่อยท่าไม้ตาย", seconds: 13, music: "tepeu", afterReveal: true },
    // seconds ≈ ความยาววิดีโอ (วีดีโอจบ = ตัดกลับจอปกติทันที ไม่ค้างเฟรม)
    //  เสียงพากย์ + เอฟเฟกต์ระเบิด + แจ้งเปลี่ยนร่าง จะเล่นบนจอปกติหลังวีดีโอจบ (ฝั่ง client)
    //  rachan: วีดีโอ 11.62 | beat: วีดีโอ 4.70
    rachan:   { img: img.OHGER_FORM, video: "/characters/kuwagata/kuwagata_final.mp4",   title: "สวมเกราะราชัน",       label: "ปล่อยท่าไม้ตาย",   seconds: 12, music: "final_normal", voice: "normal_k", afterReveal: false }, // patch 2.2.1 alpha: ทำงานทันทีก่อนเปิดไพ่ (ตั้ง p.seen ในจุดใช้สกิลแล้ว ไม่ต้องรอ afterResolve() sweep)
    beat:     { img: img.OHGER_FORM, video: "/characters/kuwagata/kuwagata_passive.mp4", title: "ประกายเขี้ยวปฏิปักษ์", label: "สกิลติดตัวทำงาน", seconds: 5,  music: "ex_guts",      voice: "ex_k",     afterReveal: false },
    // monster: เล่นทันทีตอนใช้สกิล (พักช่วงจั่วการ์ดไว้ก่อน) | anataFinal: สกิลติดตัวเทมาริ เล่นก่อนท่าไม้ตายอื่นเสมอ
    // monster (patch 2.1.3): ไม่ใช่การแปลงร่างถาวรอีกต่อไป (เป็นบัฟเกราะ/ฟื้นเลือด) แต่ยังเล่นวีดีโอตอนกดสกิลเหมือนเดิม
    monster:  { img: "/characters/hikaru/black_king.webp", video: "/characters/hikaru/ginga_skill3.mp4", title: "MONSTERLIVE", label: "แปลงร่างไคจู", seconds: 10, music: null, afterReveal: false },
    anataFinal: { img: "/characters/temari/temari.webp", video: "/characters/temari/temari_final.mp4", title: "หิวอะโปรดิวเซอร์", label: "สกิลติดตัวทำงาน", seconds: 10, music: null, afterReveal: false },
    // golden: ท่าไม้ตายแกมเบลอร์ ทอยสำเร็จ -> เล่นทันทีก่อนเปิดไพ่ (แบบ monster) + เพลงค้างระหว่างมีผล — วีดีโอ 10 วิ
    golden:   { img: "/characters/gambler/gamnler_final.jpg", video: "/characters/gambler/gambler_final.mp4", title: "เวลาทองของพี่มาแล้ว 777", label: "ปล่อยท่าไม้ตาย", seconds: 11, music: "gambler", afterReveal: false },
    // fourth: ท่าไม้ตายเอวา 13 (หลังเปิดไพ่) — วีดีโอ 10 วิ + เพลงค้างระหว่างมีผล
    fourth:   { img: "/characters/eva13/eva13_final.jpg", video: "/characters/eva13/eva13_final.mp4", title: "FOURTH IMPACT", label: "ปล่อยท่าไม้ตาย", seconds: 11, music: "eva13", afterReveal: false }, // patch 2.2.1 alpha: ทำงานทันทีก่อนเปิดไพ่ (ตั้ง p.seen ในจุดใช้สกิลแล้ว ไม่ต้องรอ afterResolve() sweep)
    doomCrucible: { img: "/characters/doomguy/สกิลอัลติเมติ/crucible.jpg", video: "/characters/doomguy/สกิลอัลติเมติ/doom.mp4", title: "Crucible", label: "ปล่อยท่าไม้ตาย", seconds: 10, music: "doomguy", afterReveal: false }, // patch 2.2 new: ทำงานทันทีก่อนเปิดไพ่
    // ---------- สึงาชิ ทาคุโตะ (patch 2.2 new / 2.2.3 / 2.2.4) ----------
    // seconds ปรับให้ตรงความยาวจริง (วัดจาก mvhd atom): takuto_passive 24.96 / takuto_2sword 5.20 / takuto_passive2 14.65 / takuto_skill3_new 17.32
    //  takuto_return 4.91 / takuto_skill3.2 17.16 / takuto_lance 1.27 / takuto_lance_hit 12.82 วิ
    apprivoise: { img: "/characters/takuto/tauburn.jpg", video: "/characters/takuto/passive/takuto_passive.mp4", title: "ฉันคว้ามันได้แล้ว", label: "สกิลติดตัวทำงาน", seconds: 25, music: "takuto", afterReveal: false }, // แปลงร่างเป็นทาวเบิร์นทันทีที่ดวงดาวครบ 5 — คงอยู่ 10 เทิร์น
    // patch 2.2.5: ครั้งแรกๆ (ยังไม่เคยกันตาย) เล่นวีดีโอนี้ — พอกันตายทำงานไปแล้วสักครั้ง แปลงร่างครั้งต่อไปจะเล่น takutoReturn แทน
    takutoReturn: { img: "/characters/takuto/upadate/tauburn_un.jpg", video: "/characters/takuto/upadate2/takuto_return.mp4", title: "ฉันคว้ามันได้แล้ว", label: "สกิลติดตัวทำงาน", seconds: 5, music: "takuto2", afterReveal: false },
    // patch 2.2.4: ตัดวีดีโอเดี่ยวของ Emeraude/Saphir ออก — เหลือแค่วีดีโอตอนดาบทั้ง 2 อันพร้อมกัน (takutoBothSwords) — ใช้ก่อนกันตายทำงานเท่านั้น (หลังกันตายทำงานใช้ takutoLance แทน)
    takutoBothSwords: { img: "/characters/takuto/tauburn.jpg", video: "/characters/takuto/takuto_2sword.mp4", title: "ถ้าพร้อมแล้วก็เข้ามาเลย", label: "เอฟเฟกต์พิเศษ", seconds: 6, music: null, afterReveal: false },
    // patch 2.2.4: สกิลติดตัว 1 กันตายทำงาน — เปลี่ยนภาพเป็น tauburn_un.jpg + เพลง takuto2 ถาวร
    takutoAwaken: { img: "/characters/takuto/upadate/tauburn_un.jpg", video: "/characters/takuto/upadate/takuto_passive2.mp4", title: "ฉันยัง...มองเห็นอยู่!!!", label: "สกิลติดตัวทำงาน", seconds: 15, music: "takuto2", afterReveal: false },
    // patch 2.2.4: ท่าไม้ตาย 1 "อย่างนายน่ะ จะไปเข้าใจอะไร" (แสดงสถานะเป็น "พิชิตแสงดาว") — แทน Tau Missile เดิม
    //  วีดีโอเล่นตอนโจมตีจริงครั้งถัดไป (ไม่ใช่ตอนกดสกิล — ดู doAttack ผ่าน p.takutoUlt2VideoPending)
    takutoUlt2: { img: "/characters/takuto/skill3/takuto_skill3.webp", video: "/characters/takuto/upadate/takuto_skill3_new.mp4", title: "อย่างนายน่ะ จะไปเข้าใจอะไร", label: "ปล่อยท่าไม้ตาย", seconds: 18, music: null, afterReveal: false },
    // patch 2.2.5: ท่าไม้ตาย 2 "ร่วมเดินทางไปกับฉันเถอะ" (ใหม่) — แทนท่าไม้ตาย 1 หลังกันตายเคยทำงานแล้ว
    takutoUlt3: { img: "/characters/takuto/upadate2/takuto_skill3.2.webp", video: "/characters/takuto/upadate2/takuto_skill3.2.mp4", title: "ร่วมเดินทางไปกับฉันเถอะ", label: "ปล่อยท่าไม้ตาย", seconds: 18, music: null, afterReveal: false },
    // patch 2.2.5: หอกผู้พิชิต — ดาบทั้ง 2 อันรวมเป็นหนึ่งหลังกันตายทำงานแล้ว
    takutoLance: { img: "/characters/takuto/upadate/tauburn_un.jpg", video: "/characters/takuto/upadate2/takuto_lance.mp4", title: "หอกผู้พิชิต", label: "เอฟเฟกต์พิเศษ", seconds: 2, music: null, afterReveal: false },
    takutoLanceHit: { img: "/characters/takuto/upadate/tauburn_un.jpg", video: "/characters/takuto/upadate2/takuto_lance_hit.mp4", title: "หอกผู้พิชิต", label: "ใช้สกิล", seconds: 13, music: null, afterReveal: false },
    // eva3: สกิลติดตัว 3 เอวา 13 (เลือด <= 3) — วีดีโอ 9 วิ | evaboom: สกิลติดตัว 1 ตายขณะ fourth impact — วีดีโอ 17 วิ
    eva3:     { img: "/characters/eva13/eva13_passive3.jpg", video: "/characters/eva13/eva13_passive3.mp4", title: "อย่าให้ฉันทำแแบบนี้เลย", label: "สกิลติดตัวทำงาน", seconds: 10, music: null, afterReveal: false },
    evaboom:  { img: "/characters/eva13/eva13.webp", video: "/characters/eva13/eva13_passive1.mp4", title: "ไม่สามารถแก้ไขอะไรได้อีกแล้ว", label: "สกิลติดตัวทำงาน", seconds: 18, music: null, afterReveal: false },
    eva13RsHopper:   { img: "/characters/eva13/eva13.webp", video: "/characters/eva13/eva13_rshopper.mp4", title: "RS-HOPPER", label: "สกิลติดตัวทำงาน", seconds: 6, music: null, afterReveal: false },
    eva13ExRsHopper: { img: "/characters/eva13/eva13.webp", video: "/characters/eva13/eva13_ex_rshopper.mp4", title: "RS-HOPPER", label: "สกิลติดตัวทำงาน", seconds: 6, music: null, afterReveal: false },
    // ---------- โอเบรอน (patch 1.7) ----------
    // lai: ท่าไม้ตายกลางวัน — วีดีโอ 13 วิ | vortigern (Rework 2): ทำงานทันทีก่อนเปิดการ์ดแล้ว (ดู CHAR_HOOKS.oberon.applyVortigernEffect) ไม่ใช่ afterReveal อีกต่อไป
    // (ฉากหลัง "ราตรีกลืนกิน" ไม่ผูกกับท่าไม้ตาย — ทำงานเองทุกครั้งที่เข้ากลางคืนขณะมีโอเบรอนอยู่ในเกม)
    lai:       { img: "/characters/oberon/oberon_skill3_morning.webp", video: "/characters/oberon/oberon_final_morning.mp4", title: "LAI RHYME GOODFELLOW", label: "ปล่อยท่าไม้ตาย", seconds: 14, music: null, afterReveal: true },
    vortigern: { img: "/characters/oberon/oberon_skill3_night.jpg", video: "/characters/oberon/oberon_final_night.mp4", title: "LIE LIKE VORTIGERN", label: "ปล่อยท่าไม้ตาย", seconds: 17, music: null, afterReveal: false },
    // oberonChange: ต่อจากวีดีโอ Vortigern — ราตรีกลืนกิน (16 วิ) แล้วฉากหลังกลางคืนกลายเป็น oberon_background.mp4
    oberonChange: { img: img.OBERON_NIGHT_IMG, video: "/characters/oberon/oberon_changefill.mp4", title: "ราตรีกลืนกิน", label: "ราตรีถูกครอบงำ", seconds: 17, music: null, afterReveal: false },
    // oberonNight: สลับร่างตอนเข้ากลางคืน (วีดีโอ 5 วิ) | oberonDay: กลับร่างกลางวัน = แจ้งเตือนปกติ ไม่มีวีดีโอ
    oberonNight: { img: img.OBERON_NIGHT_IMG, video: "/characters/oberon/morning_tonight.mp4", title: "ราชาแห่งการหลอกลวง", label: "สลับร่างยามราตรี", seconds: 6, music: null, afterReveal: false },
    oberonDay:   { img: img.OBERON_MORNING_IMG, video: null, title: "ราชาแห่งภูติ", label: "กลับคืนร่างกลางวัน", seconds: 0, music: null, afterReveal: false },
    // appleguyDodge: สกิลติดตัว Apple guy — หลบการถูกเลือกโจมตีสำเร็จระหว่างชิวๆครับน้องๆ
    //  (วีดีโอ 13 วิ เล่นซ้ำได้เรื่อยๆ แต่ขึ้นเฉพาะตอนอัตราหลบ 50%/25% — จบวีดีโอค่อยขึ้นสรุปผลการตี)
    appleguyDodge: { img: "/characters/appleguy/appleguy.jpg", video: "/characters/appleguy/appleguy_final.mp4", title: "ชิวๆครับน้องๆ", label: "หลบหลีกสบายใจ", seconds: 14, music: null, afterReveal: false },
    // broadbandBill: สกิลติดตัวเจ้าแห่งเน็ตบ้าน — ขึ้นต้นเทิร์นที่คู่สัญญาต้องจ่ายค่าต่อสัญญา (วีดีโอ 6 วิ — ครั้งแรกต่อเกม ครั้งถัดไปแจ้งเตือนเล็กๆ)
    broadbandBill: { img: "/characters/broadband_man/broadband_man.jpg", video: "/characters/broadband_man/broadband_man_final.mp4", title: "ชำระค่าบริการ", label: "สกิลติดตัวทำงาน", seconds: 7, music: null, afterReveal: false },
    // ---------- ฟุจิตะ โคโตเนะ (rework 2.3) ----------
    // kotoneSena: ข้อเสียสกิลติดตัว — โดนท่านประธานเซนะจังเจอตัว (วีดีโอเดิม 5 วิ ครั้งแรกต่อเกม ครั้งถัดไปแจ้งเตือนเล็กๆ)
    kotoneSena: { img: "/characters/kotone/kotone.jpg", video: "/characters/kotone/kotone_passive.mp4", title: "ท่านประธานเซนะจัง!?", label: "สกิลติดตัวทำงาน", seconds: 6, music: null, afterReveal: false },
    // kready: ท่าไม้ตาย 1 หนูพร้อมแล้วคะ โปรดิวเซอร์ (หลังเปิดไพ่) — ไม่มีวีดีโอ มีแต่ภาพ + เพลง ULT1 ที่ค้างตลอดร่าง [พร้อมลุย]
    //  (music ของ key นี้ถูกสแกนใน skillMusicFor() — ดังนั้นต้องมีสถานะ kready ค้างอยู่ถึงจะเล่น)
    kready: { img: "/characters/kotone/rework/สกิลอัลติเมติ1/Kotone.png", video: null, title: "หนูพร้อมแล้วคะ โปรดิวเซอร์", label: "เข้าสู่ร่าง [พร้อมลุย]", seconds: 5, music: "kotone_ult1", afterReveal: false },
    // ท่าไม้ตายในร่าง [พร้อมลุย] — ทำงานหลังเปิดไพ่ (resolveFormUlts() เรียก triggerCutscene เอง
    //  ไม่ผ่านลูป afterReveal อัตโนมัติ เพราะต้องบังคับแตกก่อนตัดสินผู้ชนะ)
    //  music = เพลงที่ขึ้น "หลัง" ปล่อยท่า (เริ่มตอนออกจากเฟส CUTSCENE ค้างจนสถานะหมดอายุท้ายเทิร์น)
    kawaii:  { img: "/characters/kotone/rework/สกิลอัลติเมต3/Kotone Sekaii.png", video: "/characters/kotone/rework/สกิลอัลติเมต3/ULT3.mp4", title: "SEKAI ICHI KAWAII WATASHI", label: "ปล่อยท่าไม้ตาย", seconds: 15, music: "kotone_ult3", afterReveal: false },
    kcampus: { img: "/characters/kotone/rework/สกิลอัลติเมต4/Kotone Campus.png", video: "/characters/kotone/rework/สกิลอัลติเมต4/ULT4.mp4", title: "CAMPUS MODE!", label: "ปล่อยท่าไม้ตาย", seconds: 12, music: "kotone_ult4", afterReveal: false },
    kshuki:  { img: "/characters/kotone/rework/สกิลอัลติเมต5/Kotone Shuki.png", video: "/characters/kotone/rework/สกิลอัลติเมต5/ULT5.mp4", title: "SELF-AFFIRMATION EXPLOSION! LOVE LOVE", label: "ปล่อยท่าไม้ตาย", seconds: 17, music: "kotone_ult5", afterReveal: false },
    // ---------- ชเรด เอลัน (patch พิเศษ) ----------
    // shradeMoon: สกิลรอง แสงจันทร์ส่องวิญญาณ (ก่อนเปิดไพ่ — เล่นทันทีตอนกดสกิล) วีดีโอ 4.1 วิ
    shradeMoon: { img: "/characters/shrade_elan/skill2/shrade_skill2.jpg", video: "/characters/shrade_elan/skill2/shrade_skill2.mp4", title: "แสงจันทร์ส่องวิญญาณ", label: "ใช้สกิล", seconds: 5, music: null, afterReveal: false },
    // shradeForm: ท่าไม้ตาย 1 รวมร่างทำนองเพลง (ก่อนเปิดไพ่ — แปลงร่างสปาด้าถาวร) วีดีโอ 20 วิ
    shradeForm: { img: img.SHRADE_SPADA_IMG, video: "/characters/shrade_elan/skill3/shrade_final.mp4", title: "รวมร่างทำนองเพลง", label: "ปล่อยท่าไม้ตาย", seconds: 20, music: null, afterReveal: false },
    // shradeCharge: ท่าไม้ตาย 2 แด่เพื่อนรักของฉัน — วีดีโอเริ่มชาร์จ 10 วิ (เพลง shrade_theme ค้างระหว่างชาร์จ)
    shradeCharge: { img: "/characters/shrade_elan/skill3/shrade_skill3.2.jpg", video: "/characters/shrade_elan/skill3/shrade_final2.1.mp4", title: "แด่เพื่อนรักของฉัน", label: "ปล่อยท่าไม้ตาย", seconds: 10, music: "shrade", afterReveal: false },
    // shradeBlast: แด่เพื่อนรักของฉัน ครบ 3 เทิร์น — วีดีโอสุดท้าย 15 วิ แล้วระเบิดใส่ทุกคน 8 หน่วย
    shradeBlast: { img: img.SHRADE_SPADA_IMG, video: "/characters/shrade_elan/skill3/shrade_final2.2.mp4", title: "แด่เพื่อนรักของฉัน", label: "บทเพลงบรรเลงจบ", seconds: 15, music: null, afterReveal: false },
    // shradePassive: สกิลติดตัว เสียงไพเราะที่กึกก้อง — เข้ากลางคืนพร้อมท่วงทำนองครบ 5 วีดีโอ 11 วิ
    shradePassive: { img: "/characters/shrade_elan/profile/shrade_elan.jpg", video: "/characters/shrade_elan/shrade_passive.mp4", title: "เสียงไพเราะที่กึกก้อง", label: "สกิลติดตัวทำงาน", seconds: 11, music: null, afterReveal: false },
    // ---------- Bard : คีตกวี (patch 2.2) ----------
    // bardDim: เปิดมิติมายาบรรเลง (ท่อนทำนองครบ 5) — วีดีโอ 7 วิ แล้วฉากหลัง/เพลงเปลี่ยนตามสายมิติ
    //  (เล่นวีดีโอเต็มทุกครั้งที่เปิดมิติ — ไม่ใช้ triggerCutscene แบบครั้งเดียวต่อเกม)
    bardDim: { img: img.BARD_PROFILE_IMG, video: "/characters/bard/bard_dim.mp4", title: "มิติมายาบรรเลง", label: "สกิลติดตัวทำงาน", seconds: 8, music: "bard_dim", afterReveal: false },
    // ---------- เรียวกิ ชิกิ (patch 2.0.5 / rework 2.0.6) ----------
    // shikiKill: เนตรมารแห่งความมรณะ — เป้าหมายเส้นชีวิตครบ 6 ถูกโจมตีปกติระหว่างท่าไม้ตาย 1 (เล่นก่อนสังหารทุกครั้ง)
    shikiKill: { img: img.SHIKI_DEATH_IMG, video: "/characters/shiki/shiki_skill3_hit.mp4", title: "ฉันมองเห็นมันแล้ว", label: "สังหารด้วยเนตรมาร", seconds: 18, music: null, afterReveal: false }, // วีดีโอ 17 วิ
    // shikiSeal: นายมีฝีมือแค่ไหนหรอ? — เล่นแทนที่ท่าไม้ตายที่ถูกชิกิยกเลิก (patch 2.0.6)
    shikiSeal: { img: img.SHIKI_PROFILE_IMG, video: "/characters/shiki/shiki_passive2.mp4", title: "นายมีฝีมือแค่ไหนหรอ?", label: "ท่าไม้ตายถูกยกเลิก", seconds: 19, music: null, afterReveal: false }, // วีดีโอ 18 วิ
    // shikiWitherKill: ความตายที่โรยรา — โจมตีปกติแล้วสุ่มสังหารสำเร็จ (เล่นก่อนสังหารทุกครั้ง)
    shikiWitherKill: { img: img.SHIKI_WITHER_IMG, video: "/characters/shiki/shiki_skill3.2_hit.mp4", title: "ความตายที่โรยรา", label: "ความตายมาเยือน", seconds: 9, music: null, afterReveal: false }, // วีดีโอ 8.7 วิ
    // ---------- โทโนะ ชิกิ (patch 2.1.7) ----------
    // tohnoSkill1: มีดพับประจำตระกูล — เข้าระดับ 2 ขึ้นไปครั้งแรก (ครั้งต่อไปแจ้งเตือนเฉยๆ) วีดีโอ 9.32 วิ
    tohnoSkill1: { img: "/characters/tohno/tohno_skill1.webp", video: "/characters/tohno/tohno_skill1.mp4", title: "มีดพับประจำตระกูล", label: "เปิดใช้งานสกิลติดตัว", seconds: 10, music: null, afterReveal: false },
    // tohnoKill: Mystic eye of death perception — สังหารสำเร็จ (เล่นก่อนสังหารทุกครั้ง) วีดีโอ 6.41 วิ
    tohnoKill: { img: img.TOHNO_DEATH_IMG, video: "/characters/tohno/tohno_passive_hit.mp4", title: "Mystic eye of death perception", label: "สังหารด้วยเนตรมาร", seconds: 7, music: null, afterReveal: false },
    // nanayaKill: Mystic eye of death perception (นานายะ ชิกิ) — สังหารสำเร็จ (เล่นก่อนสังหารทุกครั้ง) วีดีโอ ~7.98 วิ
    nanayaKill: { img: "/characters/nanaya/nanaya.png", video: "/characters/nanaya/nana_passvie_hit.mp4", title: "Mystic eye of death perception", label: "สังหารด้วยเนตรมาร", seconds: 8, music: null, afterReveal: false },
    // ---------- อาริมะ มิยาโกะ (patch 2.2.0) ----------
    // miyakoUlt: หนูจะทำให้พี่ตาสว่างเอง — เล่นก่อนสรุปผลทุกครั้งที่ได้โจมตี (วีดีโอจริง ~17.42 วิ)
    miyakoUlt: { img: "/characters/miyako/miyako.webp", video: "/characters/miyako/miyako_skill3.mp4", title: "หนูจะทำให้พี่ตาสว่างเอง", label: "ปล่อยท่าไม้ตาย", seconds: 18, music: null, afterReveal: false },
    // arimaShiki: เจอ โทโนะ ชิกิ / นานายะ ชิกิ ในเกมเดียวกัน -> เล่นก่อนเริ่มเทิร์นแรก (วีดีโอจริง ~8.34 วิ)
    arimaShiki: { img: "/characters/miyako/miyako.webp", video: "/characters/miyako/arima_shiki.mp4", title: "นั่นพี่จ๋าเองหรอกหรอ?!", label: "เปิดเกม", seconds: 9, music: null, afterReveal: false },
    // ---------- คิชินามิ ฮาคุโนะ (patch 2.2.1) ----------
    hakunoUltMale:   { img: "/characters/hakuno/profile/hakuno_male.png", video: "/characters/hakuno/skill3/hakuno_male_skill3.mp4", title: "คำสาปแห่งดวงจันทร์ MOON*CELL", label: "ปล่อยท่าไม้ตาย", seconds: 16, music: "hakuno", afterReveal: false },
    hakunoUltFemale: { img: "/characters/hakuno/profile/hakuno_female.webp", video: "/characters/hakuno/skill3/hakuno_female_skill3.mp4", title: "คำสาปแห่งดวงจันทร์ MOON*CELL", label: "ปล่อยท่าไม้ตาย", seconds: 15, music: "hakuno", afterReveal: false },
    // ---------- โอกูริ แคป (patch 2.0.8.1) ----------
    // graybeast: เข้าสู่ร่าง Zone (ยุคทองครบ 2 ตอนเริ่มเทิร์น) — วีดีโอ 24 วิ + เพลง oguri_theme ค้างระหว่างอยู่ร่าง Zone
    graybeast: { img: img.OGURI_ZONE_IMG, video: "/characters/oguri/zone_form.mp4", title: "เข้าสู่ร่าง Zone", label: "สกิลติดตัวทำงาน", seconds: 25, music: "oguri", afterReveal: false },
    // oguriTrain: สกิลรอง Training — เล่นทันทีตอนกดสกิล (ครั้งแรกเต็ม ครั้งถัดไปแจ้งเตือน) วีดีโอ 9.3 วิ
    oguriTrain: { img: "/characters/oguri/Profile Skill 2 Training.png", video: "/characters/oguri/Skill 2 Training.mp4", title: "Training", label: "ใช้สกิล", seconds: 10, music: null, afterReveal: false },
    // victorybeat: ท่าไม้ตาย The Beat of Victory (หลังเปิดไพ่) — วีดีโอ 8.4 วิ
    victorybeat: { img: "/characters/oguri/Profile Skill 3 The Beat of Victory.png", video: "/characters/oguri/Skill 3 The Beat of Victory.mp4", title: "THE BEAT OF VICTORY", label: "ปล่อยท่าไม้ตาย", seconds: 9, music: null, afterReveal: true },
    // oguriAshen: ท่าไม้ตาย 2 Ashen Trail — เล่นทันทีตอนกดสกิล (ก่อนเปิดไพ่) วีดีโอ 11.4 วิ
    oguriAshen: { img: "/characters/oguri/Profile Skill 3-2 Ashen Trail Cinderella Gray.png", video: "/characters/oguri/Skill 3-2 Ashen Trail Cinderella Gray.mp4", title: "ASHEN TRAIL: CINDERELLA GRAY", label: "ปล่อยท่าไม้ตาย", seconds: 12, music: null, afterReveal: false },
    // ---------- ซาโตรุ อาเคฟุ (patch 2.0.8.2) ----------
    // wonderofu: ท่าไม้ตายอัตโนมัติ Wonder of U — วีดีโอ Ultimate.mp4 11.5 วิ (patch 2.1.1) + เพลงเล่นค้างตราบใดที่มีคนติด [Calamity]
    wonderofu: { img: "/characters/satoru/wonderofu.png", video: "/characters/satoru/Ultimate.mp4", title: "WONDER OF U", label: "ปล่อยท่าไม้ตาย", seconds: 12, music: "wonderofu", afterReveal: false },
    // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9) ----------
    // riddheAlert: Event เริ่มเกม — ตรวจพบบานาจ (ยูนิคอร์น) บนสนาม (วีดีโอ 5 วิ) แล้วถามจับมือเป็นพันธมิตร
    riddheAlert: { img: img.RIDDHE_BANSHEE_IMG, video: "/characters/riddhe/banshee_alert.mp4", title: "ตรวจพบยูนิคอร์น", label: "บันชีตื่นขึ้น", seconds: 6, music: null, afterReveal: false },
    // riddheBeam: สกิลรอง Beam Magnum Plus — เล่นเมื่อชนะแล้วโจมตีสำเร็จ (วีดีโอ 4 วิ — ครั้งแรกเต็ม ครั้งถัดไปแจ้งเตือน)
    riddheBeam: { img: "/characters/riddhe/skill2/banshee_skill2.jpg", video: "/characters/riddhe/skill2/banshee_skill2.mp4", title: "BEAM MAGNUM PLUS", label: "ใช้สกิล", seconds: 5, music: null, afterReveal: false },
    // riddheNtd: ท่าไม้ตาย 1 แกไม่มีสิทธิ์มาสั่งสอนฉัน — กดก่อนเปิดไพ่ (วีดีโอ 9 วิ)
    riddheNtd: { img: img.RIDDHE_NTD_IMG, video: "/characters/riddhe/skill3/banshee_skill3.mp4", title: "แกไม่มีสิทธิ์มาสั่งสอนฉัน", label: "ปล่อยท่าไม้ตาย", seconds: 10, music: null, afterReveal: false },
    // riddhePassive: สกิลติดตัว 1 — บานาจตีเรา/ไม่ตีเราครบ 3 เทิร์น (วีดีโอ 15 วิ) แล้วท่าไม้ตาย 1 ทำงานฟรี
    riddhePassive: { img: img.RIDDHE_NTD_IMG, video: "/characters/riddhe/banshee_passive.mp4", title: "จะทำให้ฉันหน้าสมเพชอีกนานแค่ไหน", label: "สกิลติดตัวทำงาน", seconds: 16, music: null, afterReveal: false },
    // riddheGuard: ท่าไม้ตาย 2 ฉันจะไม่ยอมสูญเสียใครไปอีก — กดก่อนเปิดไพ่ (วีดีโอ 11 วิ)
    riddheGuard: { img: "/characters/riddhe/skill3/banshee_skill3.2.png", video: "/characters/riddhe/skill3/banshee_skill3.2.mp4", title: "ฉันจะไม่ยอมสูญเสียใครไปอีก", label: "ปล่อยท่าไม้ตาย", seconds: 12, music: null, afterReveal: false },
    // riddheLastShield: ระหว่างท่าไม้ตาย 2 เกราะเสียถึง 3 หน่วย (วีดีโอ 10 วิ — เล่นเต็มทุกครั้งที่ทริกเกอร์)
    riddheLastShield: { img: img.RIDDHE_NTD2_IMG, video: "/characters/riddhe/skill3/banshee_skill3.2_last.mp4", title: "ฉันจะไม่ยอมสูญเสียใครไปอีก", label: "เกราะปกป้องทั้งคู่", seconds: 11, music: null, afterReveal: false },
    // riddhePassive3: สกิลติดตัว 3 อย่าทิ้งฉันไป — บานาจพันธมิตรตาย (วีดีโอ 9 วิ) ร่างบันชีดำมืดถาวร
    riddhePassive3: { img: img.RIDDHE_NTD2_IMG, video: "/characters/riddhe/banshee_passive3.mp4", title: "อย่าทิ้งฉันไป", label: "สกิลติดตัวทำงาน", seconds: 10, music: null, afterReveal: false },
    // ---------- ริต้า เบอร์นัล / ฟีนิกซ์ (patch 2.1.6) ----------
    // seconds วัดจากความยาววีดีโอจริง (+buffer ~0.5-1 วิ กันตัดก่อนจบ)
    // phenexReflect: สกิลรอง 1 ฝันไปเถอะ — เล่นตอนสะท้อนความเสียหายกลับผู้โจมตี ก่อนสรุปผล (วีดีโอจริง 3.24 วิ)
    phenexReflect: { img: "/characters/rita/skill2/phenex_skill2.jpg", video: "/characters/rita/skill2/phenex_skill2.mp4", title: "ฝันไปเถอะ", label: "สะท้อนความเสียหาย", seconds: 4, music: null, afterReveal: false },
    // phenexPurge: สกิลรอง 2 อย่าอยู่เลย แกน่ะ! — เล่นก่อนสรุปผลตอนได้โจมตี (วีดีโอจริง 6.47 วิ)
    //  afterReveal ต้องเป็น false เสมอ — true จะโดนระบบ afterResolve() sweep ทั่วไป (ที่ไว้ auto-activate ท่าไม้ตายทันทีตอนเปิดไพ่)
    //  ดึงไปเล่นวีดีโอทันทีที่เปิดไพ่ ทั้งที่ยังไม่ได้โจมตี (บั๊กที่เจอจริง — ผลจริงของสกิลนี้ทำงานเฉพาะใน doAttack เท่านั้น)
    phenexPurge: { img: "/characters/rita/skill2/phenex_skill2.2.jpg", video: "/characters/rita/skill2/phenex_skill2.2.mp4", title: "อย่าอยู่เลย แกน่ะ!", label: "ใช้สกิล", seconds: 7, music: null, afterReveal: false },
    // phenexNtd: ท่าไม้ตาย 1 ฝืนใช้งาน NTD-Sytem — กดก่อนเปิดไพ่ (วีดีโอจริง 16.67 วิ)
    phenexNtd: { img: img.PHENEX_NTD_IMG, video: "/characters/rita/skill3/phenex_skill3.mp4", title: "ฝืนใช้งาน NTD-Sytem", label: "ปล่อยท่าไม้ตาย", seconds: 17, music: null, afterReveal: false },
    // phenexTaunt: ท่าไม้ตาย 2 ไม่อยากให้ใครต้องเจ็บปวด — กดก่อนเปิดไพ่ (วีดีโอจริง 16.48 วิ)
    phenexTaunt: { img: "/characters/rita/skill3/phenex_skill3.2.jpg", video: "/characters/rita/skill3/phenex_skill3.2.mp4", title: "ไม่อยากให้ใครต้องเจ็บปวด", label: "ปล่อยท่าไม้ตาย", seconds: 17, music: null, afterReveal: false },
    // phenexRebirth: สกิลติดตัว 1 ถ้าเลือกได้ อยากเกิดเป็นอะไรหรอ? — ตายครั้งแรกแล้วเกิดใหม่ (ครั้งเดียวต่อเกม) (วีดีโอจริง 10.40 วิ)
    phenexRebirth: { img: img.PHENEX_NTD_IMG, video: "/characters/rita/phenex_passive.mp4", title: "ถ้าเลือกได้ อยากเกิดเป็นอะไรหรอ?", label: "สกิลติดตัวทำงาน", seconds: 11, music: null, afterReveal: false },
    // phenexRelease: สกิลติดตัว 2 ขอแค่ได้พบกันอีก — ตกรอบจริง ปลดปล่อยความเจ็บปวดสะสมใส่เป้าหมาย (วีดีโอจริง 5.69 วิ)
    phenexRelease: { img: img.PHENEX_BASE_IMG, video: "/characters/rita/phenex_passive2.mp4", title: "ขอแค่ได้พบกันอีก", label: "ปลดปล่อยความเจ็บปวด", seconds: 6, music: null, afterReveal: false },
    // ---------- ผู้สังหารเมจ ----------
    // mageslayerWitchMark: สกิลพื้นฐาน Witch Mark — เล่นทันทีตอนกด (ก่อนเปิดการ์ด)
    mageslayerWitchMark: { img: "/characters/mageslayer/Pic_skill_1.jpg", video: "/characters/mageslayer/VDO_Skill_1.mp4", title: "WITCH MARK", label: "ใช้สกิล", seconds: 6, music: null, afterReveal: false },
    // ---------- ทาคุมิ ฟุจิวาระ ----------
    // ไฟล์มีเดียยังไม่มีจริง (ผู้ใช้จะเตรียมมาทีหลัง) — seconds เป็นค่าประมาณชั่วคราว ต้องวัดความยาววิดีโอจริงตอนได้ไฟล์มาแล้วแก้ทีหลัง
    // takumiBlackoutStart: ท่าไม้ตาย ถึงจะมองไม่เห็น แต่ฉันยังอยู่ — เล่นทันทีตอนกด (ก่อนเปิดการ์ด)
    takumiBlackoutStart: { img: "/characters/takumi/takumi_skill3.jpg", video: "/characters/takumi/takumi_skill3_first.mp4", title: "ถึงจะมองไม่เห็น แต่ฉันยังอยู่", label: "ปล่อยท่าไม้ตาย", seconds: 8, music: "forever", afterReveal: false }, // takumi_skill3_first.mp4 ~7.99s
    // takumiBlackoutBust: ทริกเกอร์ — คนแรกที่ไพ่แตกระหว่างบังตากระดาน (เล่นก่อนสรุปผล ผ่าน afterResolve()'s queueCutscene)
    takumiBlackoutBust: { img: "/characters/takumi/takumi_skill3.jpg", video: "/characters/takumi/takumi_skill3_second.mp4", title: "ถึงจะมองไม่เห็น แต่ฉันยังอยู่", label: "ไพ่แตก", seconds: 10, music: null, afterReveal: false }, // takumi_skill3_second.mp4 ~9.86s
    // ---------- แบทแมน (เบน แอฟเฟล็ก) (patch 2.2.7) ----------
    // seconds วัดจากความยาววีดีโอจริง (+buffer ~0.5-1 วิ กันตัดก่อนจบ)
    // batStealthBurst: สกิลพื้นฐาน เร้นเงา — เล่นตอนสถานะหมดเวลาเอง (ท้ายเทิร์น) ก่อนระเบิดใส่ทุกคน
    batStealthBurst: { img: "/characters/bat_ben/bat_ben_skill1.jpg", video: "/characters/bat_ben/bat_ben_skill1.mp4", title: "เร้นเงา", label: "ออกจากเงามืด", seconds: 10, music: null, afterReveal: false }, // bat_ben_skill1.mp4 ~9.48s
    // batKarmaSend: สกิลรอง นายลืมของน่ะ — เล่นตอนเลือกเป้าหมายส่งต่อความเสียหาย ก่อนความเสียหายเกิดขึ้น
    batKarmaSend: { img: "/characters/bat_ben/bat_ben_skill2.jpg", video: "/characters/bat_ben/bat_ben_skill2.mp4", title: "นายลืมของน่ะ", label: "ส่งคืนความเสียหาย", seconds: 7, music: null, afterReveal: false }, // bat_ben_skill2.mp4 ~6.28s
    // batTaunt: ท่าไม้ตาย เข้ามาเลย — เล่นทันทีตอนกด (ก่อนเปิดการ์ด) แล้วเพลง bat_ben_theme เล่นค้าง
    batTaunt: { img: "/characters/bat_ben/bat_ben_skill3.jpg", video: "/characters/bat_ben/bat_ben_skill3.mp4", title: "เข้ามาเลย", label: "ปล่อยท่าไม้ตาย", seconds: 10, music: "bat_ben", afterReveal: false }, // bat_ben_skill3.mp4 ~8.92s
    // ---------- เจ้าหญิงราก (เรียวกิ ชิกิ) (patch 2.2.7) ----------
    // pshikiKill: สกิลติดตัว Mystical Eye of Death Perception (Truth) — สังหารทันทีสำเร็จตอนได้โจมตีปกติ
    //  ยังไม่มีวีดีโอเฉพาะตัว (ผู้ใช้ยังไม่ได้ส่งมา) — ใช้วีดีโอสังหารของเรียวกิ ชิกิ ตัวเดียวกันไปก่อน
    pshikiKill: { img: "/characters/princess_shiki/p_shiki_skill3.jpg", video: "/characters/shiki/shiki_skill3.2_hit.mp4", title: "ทุกอย่างจะต้องราบรื่น", label: "สังหารด้วยเนตรมณะ", seconds: 9, music: null, afterReveal: false },
    // ---------- ปืนหน่วย GUTS Select (ร้านค้ามายา) ----------
    //  ไม่ใช่ของตัวละครไหน — เป็นไอเทมที่ใครซื้อก็ยิงได้ เล่นวีดีโอทุกครั้งที่ยิง (queueCutscene ตรงๆ ไม่ผ่าน triggerCutscene)
    //  seconds วัดจาก mvhd atom จริง (+buffer ~0.5-1 วิ กันตัดก่อนจบ)
    gutsShockwave: { img: "/item/guts_key/gomora_key.webp",    video: "/item/guts_key/shockwave_boost.mp4",    title: "SHOCKWAVE BULLET",   label: "ยิงปืนหน่วย GUTS Select", seconds: 11, music: null, afterReveal: false }, // shockwave_boost.mp4 ~9.51s
    gutsGargorgon: { img: "/item/guts_key/gargorgon_key.webp", video: "/item/guts_key/gargorgon_ray.mp4",      title: "GARGORGON RAY",      label: "ยิงปืนหน่วย GUTS Select", seconds: 9,  music: null, afterReveal: false }, // gargorgon_ray.mp4 ~7.67s
    gutsThunder:   { img: "/item/guts_key/eleking_key.webp",   video: "/item/guts_key/thunder_boost.mp4",      title: "THUNDER BULLET",     label: "ยิงปืนหน่วย GUTS Select", seconds: 7,  music: null, afterReveal: false }, // thunder_boost.mp4 ~5.38s
    gutsNurse:     { img: "/item/guts_key/nurse_key.webp",     video: "/item/guts_key/nursedessei_cannon.mp4", title: "NURSEDESSEI CANNON", label: "ยิงปืนหน่วย GUTS Select", seconds: 16, music: null, afterReveal: false }, // nursedessei_cannon.mp4 ~14.40s
    hisakawaSunday: { img: "/characters/hisakawa_sister/skill3/hisakawa_skill3.jpg", video: "/characters/hisakawa_sister/skill3/hisakawa_skill3.mp4", title: "O-KU-RI-MO-NO-Sunday", label: "ปล่อยท่าไม้ตาย", seconds: 16, music: "hisakawa_sunday", afterReveal: false },
    triggerDarkHenshin: { img: "/characters/ignis/trigger_dark.jpg", video: "/characters/ignis/trigger_dark.mp4", title: "TRIGGER DARK", label: "แปลงร่าง", seconds: 18, music: null, afterReveal: false },
    triggerDarkImpact: { img: "/characters/ignis/dark_skill3/trigger_dark_skill3.png", video: "/characters/ignis/dark_skill3/trgger_dark__skill3.mp4", title: "IMPACT", label: "ปล่อยท่าไม้ตาย", seconds: 18, music: null, afterReveal: false },
    // ---------- Ultraman Trigger ----------
    // ระยะวิดีโอจริง: henshin 21.563s / Multi Sword 11.823s / Zeperion 15.865s — บวก buffer กันตัดก่อนจบ
    triggerHenshin:    { img: "/characters/ultraman_trigger/trigger.webp", video: "/characters/ultraman_trigger/trigger_henshin.mp4", title: "ULTRAMAN TRIGGER", label: "แปลงร่าง", seconds: 23, music: "trigger", afterReveal: false },
    triggerMultiSword: { img: "/characters/ultraman_trigger/skill2/trigger_skill2.png", video: "/characters/ultraman_trigger/skill2/trigger_skill2.mp4", title: "MULTI SWORD FINISH", label: "โจมตี", seconds: 13, music: null, afterReveal: false },
    triggerZeperion:   { img: "/characters/ultraman_trigger/skill3/trigger_skill3.jpg", video: "/characters/ultraman_trigger/skill3/trigger_skill3.mp4", title: "ZEPERION RAY", label: "ปล่อยท่าไม้ตาย", seconds: 17, music: null, afterReveal: false },
    // ---------- เอจิ (patch 2.4 new) ----------
    //  seconds วัดจาก mvhd atom จริง (+buffer ~1 วิ กันตัดก่อนจบ):
    //  eiji_skill3 20.19 / eiji_passive1 6.26 / eiji_passive_extra 16.47 / eiji_skill2_hit 2.63 วิ
    //  eijiUlt: music "eiji_ult" = eiji_skill3_connect.m4a แล้วต่อด้วย Break Beat Bark!.mp3 วนลูป (ดู MUSIC_SEQUENCES ใน client/src/audio.js)
    eijiUlt:       { img: "/characters/eiji/eiji_change.jpg", video: "/characters/eiji/skill3/eiji_skill3.mp4", title: "ไม่ว่ายังก็ตาม", label: "ปล่อยท่าไม้ตาย", seconds: 21, music: "eiji_ult", afterReveal: false },
    eijiSwordHit:  { img: "/characters/eiji/skill2/eiji_skill2.jpg", video: "/characters/eiji/skill2/eiji_skill2_hit.mp4", title: "ดาบแห่งความทรงจำ", label: "ความเสียหาย 2 เท่า", seconds: 4, music: null, afterReveal: false },
    eijiInterrupt: { img: "/characters/eiji/eiji.webp", video: "/characters/eiji/passive/eiji_passive1.mp4", title: "ผู้เล่นอันดับ 2", label: "ขัดจังหวะ + สวนคืน", seconds: 7, music: null, afterReveal: false },
    eijiLonging:   { img: "/characters/eiji/eiji.webp", video: "/characters/eiji/passive/eiji_passive_extra.mp4", title: "Longing", label: "ตามไปจบเรื่อง", seconds: 17, music: null, afterReveal: false },
    // ---------- มิซึซาว่า ฮารุกะ (patch 2.5 new) ----------
    //  harukaOmega: ท่าไม้ตาย New Omega — เล่นทันทีตอนกด (ก่อนเปิดไพ่) แล้วสลับภาพประจำตัวเป็น new_omega.jpg 5 เทิร์น
    //  harukaPunish / harukaCounter: คลิปสั้นที่ "คิว" ไว้ให้เล่นก่อนป้ายสรุปความเสียหาย (ไม่ใช่ตอนกดสกิล)
    //  seconds ปรับให้ตรงความยาวจริง (วัดจาก mvhd atom) + เผื่อเวลาตัดฉาก ~1 วิ:
    //   haruka_skill3 19.82 / haruka_skill2 8.97 / haruka_passive 3.91 วิ
    harukaOmega:   { img: "/characters/haruka/new_omega.jpg", video: "/characters/haruka/skill3/haruka_skill3.mp4", title: "NEW OMEGA", label: "ปล่อยท่าไม้ตาย", seconds: 21, music: null, afterReveal: false },
    harukaPunish:  { img: "/characters/haruka/skill2/haruka_skill2.jpg", video: "/characters/haruka/skill2/haruka_skill2.mp4", title: "จงไปสู่สุขติ", label: "จุดชนวนเลือดไหล", seconds: 10, music: null, afterReveal: false },
    harukaCounter: { img: "/characters/haruka/haruka.webp", video: "/characters/haruka/haruka_passive.mp4", title: "อมาซอน", label: "สวนกลับ + สตั้น", seconds: 5, music: null, afterReveal: false },
  };
};
