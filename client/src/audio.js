// ============================================================
//  ระบบเสียง ECHO + master volume
//  - master volume คุมทุกเสียง (เพลง / เอฟเฟกต์ / เสียงพากย์ / วีดีโอ) ด้วย curve ยกกำลังสอง
//    ให้หลอดปรับเสียงมีผลชัดเจน (linear เดิมฟังแทบไม่ต่าง)
//  - เพลงเล่นต่อจากจุดเดิมเฉพาะ "ในแมตช์เดียวกัน" — เริ่มเกมใหม่รีเซ็ตทั้งหมด (resetMusicPositions)
//  - เพลงสกิล/ท่าไม้ตาย: ส่ง seq มาด้วย ถ้า seq เปลี่ยน (เปิดท่าใหม่ / ถูกทับด้วยเพลงเดียวกัน
//    ของอีกคน) เพลงจะเริ่มใหม่จากต้น
// ============================================================

const FILES = {
  main_home: "/theme_song/main_home.mp3",
  card_prepare_turn: "/theme_song/card_prepare_turn.mp3",
  new_morning: "/theme_song/new_morning.mp3", // เพลงช่วงกลางวัน (patch พิเศษ)
  new_night: "/theme_song/new_night.mp3",     // เพลงช่วงกลางคืน (patch พิเศษ)
  overload_force: "/overload_force/overload_force_connect.m4a",
  muimi: "/overload_force/overload_force_theme.mp3",
  muimi_normal_hit: "/characters/muimi/mumi_normal_hit.mp3",
  muimi_ub_hit: "/characters/muimi/mumi_ub_hit.mp3",
  shrade: "/characters/shrade_elan/shrade_theme.mp3", // เพลงระหว่างชาร์จ แด่เพื่อนรักของฉัน (ชเรด เอลัน)
  shiki: "/characters/shiki/shiki_theme.mp3",         // เพลงระหว่างท่าไม้ตาย ฉันมองเห็นมันแล้ว (ชิกิ)
  shiki2: "/characters/shiki/shiki_theme2.mp3",       // เพลงระหว่างท่าไม้ตาย 2 ความตายที่โรยรา (ชิกิ patch 2.0.6)
  tohno: "/characters/tohno/tohno_theme.mp3",         // เพลงระหว่างสกิลติดตัวโทโนะเปิดใช้งาน (ระดับ 2 ขึ้นไป — patch 2.1.7)
  nanaya: "/characters/nanaya/nanaya_theme.mp3",      // เพลงระหว่างสกิลติดตัว 1 นานายะ ชิกิ เปิดใช้งาน (patch 2.1.9)
  hakuno: "/characters/hakuno/hakuno_theme.mp3",      // เพลงระหว่าง MOON*CELL คิชินามิ ฮาคุโนะ ทำงาน (patch 2.2.1)
  nanayaVoice1: "/characters/nanaya/voice/nanaya_voice1.m4a", // เสียงพากย์สุ่มตอนนานายะชนะการจั่ว
  nanayaVoice2: "/characters/nanaya/voice/nanaya_voice2.m4a",
  nanayaVoice3: "/characters/nanaya/voice/nanaya_voice3.m4a",
  nanayaVoice4: "/characters/nanaya/voice/nanaya_voice4.m4a",
  nanayaVoice5: "/characters/nanaya/voice/nanaya_voice5.m4a",
  bard_dim: "/characters/bard/bard_dim_theme.mp3",    // BGM ระหว่างมิติมายาบรรเลง (Bard — วนลูป 3 เทิร์น)
  bard_note1: "/characters/bard/bard_note1.mp3",      // เสียงเติมโน้ตช่องที่ 1 (Bard)
  bard_note2: "/characters/bard/bard_note2.mp3",      // เสียงเติมโน้ตช่องที่ 2
  bard_note3: "/characters/bard/bard_note3.mp3",      // เสียงเติมโน้ตช่องที่ 3
  bard_note4: "/characters/bard/bard_note4.mp3",      // เสียงเติมโน้ต (สำรอง)
  bard_melody1: "/characters/bard/bard_melody1.mp3",  // เสียงบรรเลงทำนอง สาย Crimson
  bard_melody2: "/characters/bard/bard_melody2.mp3",  // เสียงบรรเลงทำนอง สาย Jade
  bard_melody3: "/characters/bard/bard_melody3.mp3",  // เสียงบรรเลงทำนอง Encore ทำงานซ้ำ
  ginga: "/characters/hikaru/ginga_song.mp3",
  gingastrium: "/characters/hikaru/hikaru_update/ginga_theme2.mp3", // เพลงระหว่างร่าง Ginga Strium (ท่าไม้ตาย patch 2.1.3) — แทนที่เพลง ginga ที่เล่นค้างจากสกิลรอง
  unicorn: "/characters/banagher/unicorn_song.mp3",
  final_normal: "/characters/kuwagata/final_normal.mp3", // เพลงระหว่างสวมเกราะราชัน
  ex_guts: "/characters/kuwagata/ex_guts.mp3",           // เพลง Beat Mode (ทับทุกเพลงจนตาย)
  normal_k: "/characters/kuwagata/normal_k.mp3",         // เสียงพากย์หลังวีดีโอสวมเกราะราชัน
  ex_k: "/characters/kuwagata/ex_k.mp3",                 // เสียงพากย์หลังวีดีโอ Beat Mode
  temari_final_theme: "/characters/temari/temari_final_theme.mp3", // เพลง ANATA WAAAAAAAA (เล่นถึงตอนเปิดไพ่)
  gambler: "/characters/gambler/gambler_theme.mp3",  // เพลงระหว่างบัฟเวลาทอง 777 (แกมเบลอร์)
  eva13: "/characters/eva13/eva13_theme.mp3",        // เพลงระหว่าง Fourth Impact (เอวา 13)
  oberon: "/characters/oberon/orberon theme.mp3",    // เพลงประจำตัวโอเบรอน (ระหว่าง Lie Like Vortigern)
  // ยูนะ ไอดอลประจำสนาม (patch 2.2.6): เพลงล็อกทั้งสนามตลอด 5 เทิร์นที่เอฟเฟกต์ทำงาน
  yuna_longing: "/characters/yuna/Longing.mp3",
  yuna_delete: "/characters/yuna/Delete.mp3",
  yuna_smile: "/characters/yuna/Smile for You.mp3",
  yuna_beatbark: "/characters/yuna/Break Beat Bark!.mp3",
  oguri: "/characters/oguri/oguri_theme.mp3",          // เพลงประจำตัวโอกูริ แคป (เริ่มตอนเข้าร่าง Zone — เล่นค้างระหว่างอยู่ร่าง)
  wonderofu: "/characters/satoru/wonderofu_theme.mp3", // เพลง Wonder of U (ซาโตรุ — เล่นค้างตราบใดที่มีคนติด Calamity)
  doomguy: "/characters/doomguy/สกิลอัลติเมติ/Doom Eternal OST - The Only Thing They Fear Is You (Mick Gordon) [Doom Eternal Theme].mp3", // เพลงระหว่างท่าไม้ตาย Crucible (DoomGuy)
  takuto: "/characters/takuto/takuto_theme.mp3", // เพลงประจำตัวหลังฉันคว้ามันได้แล้ว (สึงาชิ ทาคุโตะ)
  takuto2: "/characters/takuto/upadate/takuto_theme2.m4a", // เพลงประจำตัวหลังสกิลติดตัว 1 กันตายทำงาน (สึงาชิ ทาคุโตะ patch 2.2.4)
  tepeu: "/characters/tepeu/tepeu_theme.mp3", // เพลงระหว่างฉากหลัง "นายเป็นคนทำตัวเองนะ" ทำงาน (เทเปา ชิกิ)
  tepeu_skill1_2: "/characters/tepeu/tepeu_skill1_2.m4a", // เสียงกดสกิลพื้นฐาน/สกิลรอง (เทเปา ชิกิ)
  // ไค ชิซากิ: เสียงพากย์สุ่มทุกครั้งที่ใช้สกิล (พื้นฐาน/รอง/Overhaul)
  kaiVoice1: "/characters/kai/voice/kai_voice1.m4a",
  kaiVoice2: "/characters/kai/voice/kai_voice2.m4a",
  kaiVoice3: "/characters/kai/voice/kai_voice3.m4a",
  kaiVoice4: "/characters/kai/voice/kai_voice4.m4a",
  kaiVoice5: "/characters/kai/voice/kai_voice5.m4a",
  // ผู้สังหารเมจ: เสียงโจมตีปกติเฉพาะตัว / เสียงหลัง Mana Rupture / เพลงระหว่างมี Mana Burden (spellburden) ติดตัวเอง
  mageslayer_attack: "/characters/mageslayer/BA.mp3",
  // มิซึซาว่า ฮารุกะ: เสียงโจมตีปกติระหว่างสถานะ "โอเมก้า" (ท่าไม้ตาย New Omega)
  haruka_attack: "/characters/haruka/hit_haruka.mp3",
  mageslayer_skill2: "/characters/mageslayer/SFX_Skill_2.mp3",
  mageslayer_ult: "/characters/mageslayer/BGM_Ult.mp3",
  // เสียงอาวุธ DoomGuy (patch 2.2 full): เสียงโจมตี/เสียงใช้สกิลรอง Weapon แยกตามอาวุธที่ถืออยู่
  doomguy_cs_shoot: "/characters/doomguy/sound/CS Shoot.mp3",
  doomguy_cs_skill: "/characters/doomguy/sound/CS Skill.mp3",
  doomguy_hc_shoot: "/characters/doomguy/sound/HC Shoot.mp3",
  doomguy_hc_skill: "/characters/doomguy/sound/HC SKill.mp3",
  doomguy_pg_shoot: "/characters/doomguy/sound/PG Shoot.mp3",
  doomguy_cg_shoot: "/characters/doomguy/sound/CG Shoot.mp3",
  doomguy_cg_skill: "/characters/doomguy/sound/CG SKill.mp3",
  doomguy_rk_shoot: "/characters/doomguy/sound/RK Shoot.mp3",
  doomguy_rk_skill: "/characters/doomguy/sound/RK Skill.mp3",
  doomguy_ss_shoot: "/characters/doomguy/sound/SS Shoot.mp3",
  doomguy_ss_skill: "/characters/doomguy/sound/SS Skill.mp3",
  doomguy_bt_shoot: "/characters/doomguy/sound/BT Shoot.mp3",
  doomguy_bt_skill: "/characters/doomguy/sound/BT Skill.mp3",
  doomguy_bfg_shoot: "/characters/doomguy/sound/BFG.mp3",
  // ทาคุมิ ฟุจิวาระ: เพลงประจำตัวตามเกียร์ (เกียร์ 3-5 / เกียร์ 6) + เพลงระหว่างท่าไม้ตาย "ถึงจะมองไม่เห็น แต่ฉันยังอยู่" ทำงาน
  all_around: "/characters/takumi/all_around.mp3",
  secret_love: "/characters/takumi/secret_love.mp3",
  forever: "/characters/takumi/forever.mp3",
  // แบทแมน (เบน แอฟเฟล็ก) patch 2.2.7: เพลงระหว่างท่าไม้ตาย "เข้ามาเลย" ทำงาน (ล่อเป้า 5 เทิร์น)
  bat_ben: "/characters/bat_ben/bat_ben_theme.mp3",
  // เจ้าหญิงราก (เรียวกิ ชิกิ) patch 2.2.7: เพลงระหว่างท่าไม้ตาย "ทุกอย่างจะต้องราบรื่น" ทำงาน
  p_shiki: "/characters/princess_shiki/p_shiki_theme.m4a",
  trigger: "/characters/ultraman_trigger/trigger_theme.mp3",
  hisakawa_sunday: "/characters/hisakawa_sister/skill3/O-Ku-Ri-Mo-No.mp3",
  // ฟุจิตะ โคโตเนะ (rework 2.3): เพลงประจำร่าง [พร้อมลุย] + เพลงประกอบท่าไม้ตาย 3/4/5 (เล่นทับวีดีโอผ่าน cs.voice)
  kotone_ult1: "/characters/kotone/rework/สกิลอัลติเมติ1/ULT1.mp3",
  kotone_ult3: "/characters/kotone/rework/สกิลอัลติเมต3/ULT3.mp3",
  kotone_ult4: "/characters/kotone/rework/สกิลอัลติเมต4/ULT4.mp3",
  kotone_ult5: "/characters/kotone/rework/สกิลอัลติเมต5/ULT5.mp3",
  hisakawa_nagi_1: "/characters/hisakawa_sister/voice/nagi/nagi_voice.m4a",
  hisakawa_nagi_2: "/characters/hisakawa_sister/voice/nagi/nagi_voice2.m4a",
  hisakawa_nagi_3: "/characters/hisakawa_sister/voice/nagi/nagi_voice3.m4a",
  hisakawa_hayate_1: "/characters/hisakawa_sister/voice/hayate_voice.m4a",
  hisakawa_hayate_2: "/characters/hisakawa_sister/voice/hayate_voice2.m4a",
  hisakawa_hayate_3: "/characters/hisakawa_sister/voice/hayate_voice3.m4a",
  // เอจิ (patch 2.4 new): ท่าไม้ตาย ไม่ว่ายังก็ตาม — ไฟล์แรกของลำดับเพลง (ดู MUSIC_SEQUENCES ด้านล่าง)
  eiji_ult: "/characters/eiji/skill3/eiji_skill3_connect.m4a",
  // อาจารย์ ไบเลธ (patch 2.6 new): เพลงประจำ 3 หลักสูตร แยกไฟล์กลางวัน/กลางคืน
  //  สลับช่วงเวลาแล้วเพลงอีกไฟล์ต้องเล่น "ต่อจากตำแหน่งเดิม" ไม่เริ่มใหม่ (ดู MUSIC_POSITION_GROUPS)
  byleth_normal_day: "/characters/byleth/normal/day_normal.mp3",
  byleth_normal_night: "/characters/byleth/normal/night_normal.mp3",
  byleth_ex_day: "/characters/byleth/ex/day_ex.mp3",
  byleth_ex_night: "/characters/byleth/ex/night_ex.mp3",
  byleth_end_day: "/characters/byleth/end/day_end.mp3",
  byleth_end_night: "/characters/byleth/end/night_end.mp3",
  // คอนเนอร์ RK800: เพลงไล่ล่า (สกิลติดตัว 2 จับกุมขั้นเด็ดขาด) — เล่นค้างตลอด 3 เทิร์นของการไล่ล่า
  conner_theme: "/characters/connor/conner_theme.m4a",
  // อิสึกะ ชิโด: เพลง Sandalphon — เล่นค้างตลอด 3 เทิร์นที่ดาบยังอยู่
  shido_theme: "/characters/shido/shido_theme.mp3",
  // ยุย โยชิโอกะ: เพลงประจำท่าไม้ตายแต่ละเพลง — เล่นค้างตลอด 5 เทิร์นที่เพลงทำงาน
  yui_song1: "/characters/yui/song/song_3.1.mp3",
  yui_song2: "/characters/yui/song/song_3.2.mp3",
  yui_song3: "/characters/yui/song/song_3.3.mp3",
  // มาคุโนะอุจิ อิปโป: เพลงประจำท่า Dempsey roll — เล่นค้างตลอดที่บัฟยังอยู่
  ippo_theme: "/characters/ippo/ippo_theme.mp3",
  // ผู้วิงวอน: เสียงประกอบ gif ที่เล่นทับไอคอนผู้เล่น (สั้นๆ ไม่ใช่เพลงประจำตัว)
  sup_heal: "/characters/the_supplicant/sup_heal.mp3",
  sup_shield: "/characters/the_supplicant/sup_shield.mp3",
  sup_strike: "/characters/the_supplicant/sup_strike.mp3",
  byleth_hit: "/characters/byleth/hit_sound.mp3", // เสียงโจมตีของ "ดาบต้องสาป"
  action_button: "/effect_sound/action_button.wav",
  trun_change: "/effect_sound/trun_change.wav",
  attack: "/effect_sound/attack.wav",
};

// เพลงสนามนี้มี intro หนึ่งครั้ง แล้วจึงเปลี่ยนเป็น theme ที่วนลูปจนจบเทิร์น
const MUSIC_SEQUENCES = {
  overload_force: [
    "/overload_force/overload_force_connect.m4a",
    "/overload_force/overload_force_theme.mp3",
  ],
  // เอจิ: วีดีโอท่าไม้ตายจบ -> ต่อด้วย eiji_skill3_connect.m4a
  //  ถ้าท่ายังไม่จบแต่ไฟล์นั้นจบก่อน -> วนลูป Break Beat Bark!.mp3 ต่อไปจนหมดผล
  eiji_ult: [
    "/characters/eiji/skill3/eiji_skill3_connect.m4a",
    "/characters/yuna/Break Beat Bark!.mp3",
  ],
};

// เพลงที่อยู่กลุ่มเดียวกัน = สลับไฟล์กันแล้ว "เล่นต่อจากตำแหน่งเดิม" ไม่เริ่มนับหนึ่งใหม่
//  ใช้กับหลักสูตรของไบเลธ: ไฟล์กลางวัน/กลางคืนของ "หลักสูตรเดียวกัน" คือเพลงเดียวกันคนละเวอร์ชัน
//  -> สลับช่วงเวลาแล้วเพลงอีกไฟล์เริ่มที่วินาทีเดียวกับที่เพลงเก่าเล่นค้างไว้ (ไหลลื่นไม่สะดุด)
//  แต่ละหลักสูตรเป็นกลุ่มของตัวเอง — "สลับหลักสูตร" จึงไม่ใช่การต่อเพลง แต่เป็นการเปิดเพลงใหม่
//  ซึ่ง server จะขยับ seq (transformAt) ให้ทุกครั้งที่กด -> เพลงของหลักสูตรใหม่เริ่มจากต้นเสมอ
const MUSIC_POSITION_GROUPS = {
  byleth_normal_day: "byleth_normal", byleth_normal_night: "byleth_normal",
  byleth_ex_day: "byleth_ex", byleth_ex_night: "byleth_ex",
  byleth_end_day: "byleth_end", byleth_end_night: "byleth_end",
};

// ระดับเสียงพื้นฐานต่อชนิด (ก่อนคูณ master) — บาลานซ์ให้ดังใกล้เคียงกัน
//  เดิม MUSIC_BASE = 0.55 ทำให้เพลง "เบากว่าปกติ" ชัดเจน: ที่ master 0.8 (ค่าเริ่มต้น) vcurve = 0.64
//  -> เพลงได้จริง 0.55*0.64 = 0.35 ขณะที่เอฟเฟกต์ได้ 0.54 และวีดีโอได้ 0.51 (เพลงเบากว่า ~35%)
//  ยกขึ้นมาเท่าวีดีโอ ให้เพลง/วีดีโอ/เอฟเฟกต์อยู่ระดับใกล้เคียงกันจริงตามที่คอมเมนต์นี้ตั้งใจไว้
const MUSIC_BASE = 0.8;
const SFX_BASE = 0.85;
const CLICK_BASE = 0.55;
const VIDEO_BASE = 0.8;

// เพลงบางเพลงต้นฉบับดังกว่าเพลงอื่นมาก (เพลงคุวากาตะทั้ง 2 แบบ) — ลดเฉพาะตัวให้สมดุลกับเพลงอื่น
const MUSIC_TRACK_SCALE = {
  final_normal: 0.6, // สวมเกราะราชัน
  ex_guts: 0.6,       // Beat Mode
};
function trackVolume(name) {
  return MUSIC_BASE * (MUSIC_TRACK_SCALE[name] ?? 1) * vcurve();
}

// ---------- master volume (จำค่าไว้ใน localStorage) ----------
let masterVolume = 0.8;
try {
  const saved = parseFloat(localStorage.getItem("echo_vol"));
  if (!Number.isNaN(saved)) masterVolume = Math.max(0, Math.min(1, saved));
} catch {}
const volListeners = new Set();

// curve ยกกำลังสอง: หูคนรับรู้ความดังแบบ log — ทำให้เลื่อนหลอดแล้วรู้สึกเปลี่ยนจริง
const vcurve = () => masterVolume * masterVolume;

export function getMasterVolume() { return masterVolume; }
export function videoVolume() { return VIDEO_BASE * vcurve(); } // ให้ <video> ใช้ (ผ่าน curve เดียวกัน)
export function onVolumeChange(fn) { volListeners.add(fn); return () => volListeners.delete(fn); }
export function setMasterVolume(v) {
  masterVolume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem("echo_vol", String(masterVolume)); } catch {}
  if (currentMusic) getMusic(currentMusic).volume = trackVolume(currentMusic);
  volListeners.forEach((fn) => fn(masterVolume));
}

let currentMusic = null;
// seq ล่าสุด "ต่อเพลง" (ไม่ใช่ต่อการสลับเพลง): จำไว้แม้เพลงถูกพัก/สลับออก
// -> กลับมาเล่นเพลงเดิมด้วย seq เดิม (เช่น หลังจบ cutscene ของคนอื่น) = เล่นต่อจากจุดเดิม ไม่เริ่มใหม่
// -> seq ใหม่ (เปิดท่าครั้งใหม่ / คนอื่นเปิดท่าเพลงเดียวกันทับ) = เริ่มจากต้น
const musicSeq = {};
const musicCache = {};
function getMusic(name) {
  if (!musicCache[name]) {
    const sequence = MUSIC_SEQUENCES[name];
    const a = new Audio(sequence ? sequence[0] : FILES[name]);
    a.loop = !sequence;
    a._echoSequenceStage = 0;
    if (sequence) {
      a.addEventListener("ended", () => {
        if (currentMusic !== name) return;
        a._echoSequenceStage = 1;
        a.src = sequence[1];
        a.loop = true;
        a.currentTime = 0;
        a.play().catch(() => {});
      });
    }
    musicCache[name] = a;
  }
  musicCache[name].volume = trackVolume(name);
  return musicCache[name];
}

// seq: identity ของการเปิดเพลงสกิล — เปิดท่าใหม่/คนใหม่ทับเพลงเดิม = seq ใหม่ -> เริ่มจากต้น
// เพลงทั่วไป (main_home / card_prepare_turn) ไม่ส่ง seq -> เล่นต่อจากจุดเดิม (เฉพาะในแมตช์)
export function playMusic(name, seq) {
  if (!FILES[name]) return;
  const a = getMusic(name);
  // สลับเพลงภายในกลุ่มเดียวกัน (กลางวัน <-> กลางคืนของหลักสูตรไบเลธ): จำตำแหน่งเพลงเดิมไว้เล่นต่อ
  const group = MUSIC_POSITION_GROUPS[name];
  let carryPos = null;
  if (group && currentMusic && currentMusic !== name && MUSIC_POSITION_GROUPS[currentMusic] === group) {
    const prev = getMusic(currentMusic);
    carryPos = prev.currentTime || 0;
  }
  // seq เดิมของเพลงนี้ (จำข้ามการพัก/สลับเพลง) — เปลี่ยนเมื่อไหร่ค่อยเริ่มเพลงใหม่จากต้น
  const isNewSeq = seq != null && seq !== musicSeq[name];
  if (isNewSeq) {
    musicSeq[name] = seq;
    const sequence = MUSIC_SEQUENCES[name];
    if (sequence && a._echoSequenceStage !== 0) {
      a.src = sequence[0];
      a.loop = false;
      a._echoSequenceStage = 0;
    }
    a.currentTime = 0; // การเปิดร่างครั้งใหม่ (กดใหม่/โดนคนอื่นทับ) -> เริ่มจากต้น
  }
  if (carryPos != null) {
    // เพลงใหม่อาจสั้นกว่าเพลงเดิม -> วนตำแหน่งด้วย modulo (ยังไม่รู้ความยาว = ใส่ตรงๆ แล้วปล่อยให้เบราว์เซอร์ clamp)
    const dur = a.duration;
    try { a.currentTime = dur && isFinite(dur) && dur > 0 ? carryPos % dur : carryPos; } catch { /* metadata ยังไม่มา */ }
  }
  if (currentMusic === name) {
    if (isNewSeq || a.paused) a.play().catch(() => {}); // ไม่ใช่ seq ใหม่ = เล่นต่อจากตำแหน่งเดิม
    return;
  }
  if (currentMusic) getMusic(currentMusic).pause(); // พักเพลงเดิม เก็บตำแหน่งไว้ (ในแมตช์)
  currentMusic = name;
  a.play().catch(() => {}); // seq เดิม (เช่น กลับมาหลัง cutscene) -> เล่นต่อจากจุดเดิม ไม่เริ่มใหม่
}
export function stopMusic() {
  if (!currentMusic) return;
  getMusic(currentMusic).pause(); // พักไว้ ไม่รีเซ็ต -> กลับมาเล่นต่อจากจุดเดิม (ในแมตช์)
  currentMusic = null;
}
// เริ่มเกมใหม่ / จบแมตช์: รีเซ็ตตำแหน่งเพลงทุกเพลง -> ครั้งถัดไปเริ่มจากต้นทั้งหมด
export function resetMusicPositions() {
  for (const [name, a] of Object.entries(musicCache)) {
    a.pause();
    const sequence = MUSIC_SEQUENCES[name];
    if (sequence) {
      a.src = sequence[0];
      a.loop = false;
      a._echoSequenceStage = 0;
    }
    a.currentTime = 0;
  }
  for (const k of Object.keys(musicSeq)) delete musicSeq[k];
  currentMusic = null;
}
// คืน element ที่เล่นอยู่ ให้ผู้เรียกหยุดเองได้ (เช่น เพลงประกอบคัตซีนที่ต้องหยุดตอนฉากจบ)
export function playSfx(name) {
  if (!FILES[name]) return null;
  const a = new Audio(FILES[name]);
  a.volume = (name === "action_button" ? CLICK_BASE : SFX_BASE) * vcurve();
  a.play().catch(() => {});
  return a;
}
export function clickSound() { playSfx("action_button"); }

// DoomGuy (patch 2.2 full): อาวุธ id (ตาม server) -> ชื่อไฟล์เสียงยิง/เสียงสกิลใน FILES ด้านบน
export const DOOM_WEAPON_SOUNDS = {
  shotgun: { shoot: "doomguy_cs_shoot", skill: "doomguy_cs_skill" },
  heavy: { shoot: "doomguy_hc_shoot", skill: "doomguy_hc_skill" },
  plasma: { shoot: "doomguy_pg_shoot", skill: null },
  chaingun: { shoot: "doomguy_cg_shoot", skill: "doomguy_cg_skill" },
  rocket: { shoot: "doomguy_rk_shoot", skill: "doomguy_rk_skill" },
  supershotgun: { shoot: "doomguy_ss_shoot", skill: "doomguy_ss_skill" },
  ballista: { shoot: "doomguy_bt_shoot", skill: "doomguy_bt_skill" },
  bfg: { shoot: "doomguy_bfg_shoot", skill: null },
};

function resumeCurrent() {
  if (currentMusic) {
    const a = getMusic(currentMusic);
    if (a.paused) a.play().catch(() => {});
  }
}
if (typeof window !== "undefined") window.addEventListener("pointerdown", resumeCurrent);
