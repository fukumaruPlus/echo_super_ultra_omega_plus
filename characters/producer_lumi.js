// ============================================================
//  โปรดิวเซอร์ (luminous) — Producer (patch 3.6 new)
//  ฉันเชื่อมั่นในตัวเธอนะ / ลุกขึ้นมาฯ / ฝึกซ้อม / ท่าไม้ตาย 5 แบบ + luminous
//  + สกิลติดตัว "ความฝันของฉันคือเธอ"
//
//  ตัวละครนี้เป็น **2 ตัวตนในช่องผู้เล่นเดียว**: โปรดิวเซอร์ (เลือด 3) ยืนหลัง
//  และไอดอล (เลือด 5 เกราะ 3) ยืนหน้ารับดาเมจและสถานะทั้งหมดแทน
//
//  ⚠️ กติกาที่ทำให้โค้ดนี้สั้นกว่าคู่แฝดฮิซาคาว่ามาก:
//   `p.hp` / `p.armor` / `p.statuses` = **ของไอดอล** เสมอ ตราบใดที่ไอดอลยังยืนอยู่
//   ไอดอล 5 คนใช้หลอดเดียวกัน (สลับตัวไม่เปลี่ยนเลือด) จึงไม่ต้องมีระบบ sync ต่อตัวแบบฮิซาคาว่า
//   — ดาเมจทุกช่องทางลงที่ไอดอลเองโดยอัตโนมัติ ไม่ต้องเขียน routing เลยสักบรรทัด
//   มีจังหวะเดียวที่ต้องดัก คือตอนไอดอลเลือดหมด แล้ว "สลับเจ้าของหลอด" ไปเป็นโปรดิวเซอร์ (ดู tryIdolDown)
//
//  แต้ม "ไอดอล" (p.lumiPoints 0-6) คือกุญแจของท่าไม้ตาย 2: กดท่าไม้ตาย 1 หรือฝึกซ้อม = +1
//  ครบ 6 เมื่อไหร่ ช่องท่าไม้ตายจะกลายเป็น luminous ที่รวมทุกความสามารถเข้าด้วยกัน
// ============================================================

const ID = "producer_lumi";
const BASE = "/characters/producer_lumi";

// ---------- ค่าสถานะพื้นฐาน ----------
const PRODUCER_HP = 3;   // เลือดโปรดิวเซอร์ (ยืนหลัง — หมดเมื่อไหร่คือตกรอบจริง)
const IDOL_HP = 5;
const IDOL_ARMOR = 3;
const REVIVE_HP = 3;     // ชุบไอดอลกลับมาด้วยเลือด 3 เกราะ 2
const REVIVE_ARMOR = 2;
const REVIVE_MAX = 3;    // ชุบไอดอลได้ 3 ครั้งต่อเกม (nerf) — ครบแล้วช่องนี้กดไม่ได้อีก
const SWITCH_HEAL = 1;   // สลับไอดอล 1 ครั้ง = โปรดิวเซอร์ฟื้นเลือด 1

// ---------- สกิลรอง ฝึกซ้อม ----------
const TRAIN_TURNS = 3;
const TRAIN_SKILL = 1;   // แต้มสกิล +1/เทิร์น
const TRAIN_HEAL = 1;    // เลือด +1/เทิร์น

// ---------- ท่าไม้ตาย ----------
const ULT_TURNS = 5;
const ULT_ATK = 1;              // +1 พลังโจมตีพื้นฐาน (luminous ไม่ซ้อนทับ)
const POINTS_NEED = 6;          // แต้ม "ไอดอล" ที่ต้องมีเพื่อปลดล็อก luminous
const KAHO_DODGE = 40;          // Tsubasa 283: หลบหลีก 40%
const KAHO_SKILL_ON_HIT = 1;    // Tsubasa 283: โจมตีปกติฟื้นแต้มสกิล 1
const ANZU_HEAL_NO_ITEM = 1;    // Mishiro 346: ขโมยไม่ได้ -> ฟื้นเลือด 1
const BURST_HP = 2;             // luminous: ทุกคนตีครบ -> ฟื้นเลือด 2
const BURST_ARMOR = 1;          //            และเกราะ 1
const MIRAI_HEAL_EVERY = 2;     // มิไร (ผลติดตัว): เลือด +1 ทุก 2 เทิร์น

// ---------- ไอดอล 5 คน ----------
//  key ต้องตรงกับชื่อโฟลเดอร์จริงใน client/public/characters/producer_lumi/
//  (สังเกต: โฟลเดอร์สะกด "kohaku" ส่วนชื่อที่โชว์ในเกมใช้ "โคฮารุ" ตามสเปค)
const IDOLS = {
  haruka: {
    key: "haruka", name: "ฮารุกะ", ult: "All star 765", quote: "เอาให้สุดไปเลย",
    img: `${BASE}/haruka/haruka.png`, ultImg: `${BASE}/haruka/haruka_skill3.png`,
    passive: "แต้มสกิล +1 ต่อเทิร์น",
    ultDesc: "พลังโจมตีพื้นฐาน +1 · ชนะการจั่วแล้วได้โจมตีปกติ 2 ครั้ง",
  },
  anzu: {
    key: "anzu", name: "อันซุ", ult: "Mishiro 346", quote: "ขี้เกียจแล้ว",
    img: `${BASE}/anzu/anzu.png`, ultImg: `${BASE}/anzu/anzu_skill3.png`,
    passive: "เหรียญ +1 ต่อเทิร์น",
    ultDesc: "พลังโจมตีพื้นฐาน +1 · โจมตีปกติสุ่มขโมยของเป้าหมาย 1 ชิ้น (ไม่มีของ = ฟื้นเลือด 1) · ขโมยคนเดิมซ้ำในรอบท่าเดียวกันไม่ได้",
  },
  mirai: {
    key: "mirai", name: "มิไร", ult: "Million star 765", quote: "ฉันน่ะ อดทนเก่งนะ",
    img: `${BASE}/mirai/mirai.png`, ultImg: `${BASE}/mirai/mirai_skill3.png`,
    passive: "พลังชีวิต +1 ทุก 2 เทิร์น",
    ultDesc: "พลังโจมตีพื้นฐาน +1 · ความเสียหายที่ได้รับหน่วงไป 1 เทิร์น — ถ้าคนที่ทำความเสียหายตายก่อน ความเสียหายนั้นหายไปเลย",
  },
  kaho: {
    key: "kaho", name: "คาโฮะ", ult: "Tsubasa 283", quote: "ได้เวลาสนุกแล้ว",
    img: `${BASE}/kaho/kaho.png`, ultImg: `${BASE}/kaho/kaho_skill3.jpg`,
    passive: "พลังโจมตีพื้นฐาน +1",
    ultDesc: `หลบหลีก ${KAHO_DODGE}% · โจมตีปกติฟื้นแต้มสกิล ${KAHO_SKILL_ON_HIT} (ท่านี้ไม่เพิ่มพลังโจมตี)`,
  },
  kohaku: {
    key: "kohaku", name: "โคฮารุ", ult: "kuroi 961", quote: "จะพยายามค่ะ",
    img: `${BASE}/kohaku/kohaku.png`, ultImg: `${BASE}/kohaku/kohaku_skill3.jpg`,
    passive: "การ์ดใบแรกที่จั่วในเทิร์นจะถูก \"ลบ\" ออกจากแต้มแทนที่จะบวก (1 ครั้งต่อเทิร์น)",
    ultDesc: "พลังโจมตีพื้นฐาน +1 · ถ้าแต้มน้อยที่สุดแต่ไพ่ไม่แตก จะได้โจมตีปกติต่อจากผู้ชนะในเทิร์นเดียวกัน",
  },
};
const IDOL_KEYS = Object.keys(IDOLS);
const DEFAULT_IDOL = "kohaku";

const IMG = {
  base: `${BASE}/producer.png`,
  revive: `${BASE}/skill1.2/p_skill1.2.png`,
  train: `${BASE}/skill2/p_skill2.jpg`,
  luminous: `${BASE}/p_skill3.jpg`,
};

function isLumi(p) { return !!p && p.characterId === ID; }
function idolKeyOf(p) { return (p && IDOLS[p.lumiIdol]) ? p.lumiIdol : DEFAULT_IDOL; }
function idolOf(p) { return IDOLS[idolKeyOf(p)]; }
function idolDown(p) { return !!(p && p.lumiIdolDown); }
function ultOn(p) { return !!p && ((p.statuses && p.statuses.lumiUlt) || 0) > 0; }
function luminousOn(p) { return !!p && ((p.statuses && p.statuses.lumiLuminous) || 0) > 0; }
function anyUltOn(p) { return ultOn(p) || luminousOn(p); }
function trainOn(p) { return !!p && ((p.statuses && p.statuses.lumiTrain) || 0) > 0; }

// ผลติดตัวของไอดอลคนนี้ทำงานอยู่ไหม — luminous รวมผลติดตัวของทั้ง 5 คนเข้าด้วยกัน
function hasPassive(p, key) {
  if (!isLumi(p) || idolDown(p)) return false;
  if (luminousOn(p)) return true;
  return idolKeyOf(p) === key;
}
// ความสามารถของท่าไม้ตายไอดอลคนนี้ทำงานอยู่ไหม — luminous รวมทั้ง 5 แบบเข้าด้วยกัน
function hasUlt(p, key) {
  if (!isLumi(p) || idolDown(p)) return false;
  if (luminousOn(p)) return true;
  return ultOn(p) && p.lumiUltIdol === key;
}

module.exports = {
  id: ID,
  IMG,
  IDOLS,
  IDOL_KEYS,
  DEFAULT_IDOL,
  PRODUCER_HP,
  IDOL_HP,
  IDOL_ARMOR,
  REVIVE_HP,
  REVIVE_ARMOR,
  REVIVE_MAX,
  SWITCH_HEAL,
  TRAIN_TURNS,
  ULT_TURNS,
  ULT_ATK,
  POINTS_NEED,
  KAHO_DODGE,
  BURST_HP,
  BURST_ARMOR,
  MIRAI_HEAL_EVERY,
  isLumi,
  idolKeyOf,
  idolOf,
  idolDown,
  ultOn,
  luminousOn,
  anyUltOn,
  trainOn,
  hasPassive,
  hasUlt,

  // ---------- ค่าสถานะ: หลอดเลือดสลับเจ้าของตามว่าไอดอลยังยืนอยู่ไหม ----------
  maxHp(p) { return idolDown(p) ? PRODUCER_HP : IDOL_HP; },
  maxArmor(p) { return idolDown(p) ? 0 : IDOL_ARMOR; },

  resetCombat(p) {
    if (!isLumi(p)) return;
    p.lumiIdol = DEFAULT_IDOL;   // ไอดอลที่ยืนแนวหน้า (ค่าเริ่มต้น: โคฮารุ)
    p.lumiIdolDown = false;      // ไอดอลล้มแล้วหรือยัง (ล้ม = หลอดเลือดเป็นของโปรดิวเซอร์)
    p.lumiRevives = 0;           // ชุบไอดอลไปแล้วกี่ครั้งในเกมนี้ (เพดาน REVIVE_MAX)
    p.lumiProducerHp = PRODUCER_HP; // เลือดโปรดิวเซอร์ที่พักไว้ระหว่างไอดอลยังยืนอยู่
    p.lumiPoints = 0;            // แต้ม "ไอดอล" 0-6 (ครบ 6 = ปลดล็อก luminous)
    p.lumiUltIdol = null;        // ท่าไม้ตาย 1 ที่เปิดอยู่เป็นของไอดอลคนไหน
    p.lumiMiraiTurns = 0;        // ตัวนับของผลติดตัวมิไร (ฟื้นเลือดทุก 2 เทิร์น)
    p.lumiKoharuUsed = false;    // โคฮารุ: ใช้สิทธิ์ "ไพ่ใบแรกหักลบ" ของเทิร์นนี้ไปแล้วหรือยัง
    p.lumiStolen = [];           // Mishiro 346: id ของคนที่ขโมยไปแล้วในรอบท่าไม้ตายนี้
    p.lumiPending = [];          // Million star 765: ดาเมจที่หน่วงไว้ [{ fromId, n }]
    p.lumiHitCount = 0;          // luminous: จำนวนครั้งที่ถูกตีในรอบท่านี้ (ไม่ใช่จำนวนคน)
    p.lumiBurstDone = false;     // luminous: จ่ายรางวัล "ทุกคนตีครบ" ไปแล้วหรือยัง
    p.lumiBurstPending = false;  // รางวัล burst ที่รอคลิปเล่นจบ
    p.lumiExtraAtk = 0;          // All star 765: จำนวนครั้งโจมตีเพิ่มที่ค้างอยู่
    p.lumiFollowRound = 0;       // kuroi 961: เทิร์นล่าสุดที่ใช้สิทธิ์ตีต่อจากผู้ชนะไปแล้ว
  },

  // รายชื่อไอดอลสำหรับโมดัลเลือกตัวฝั่ง client (ส่งให้เจ้าของคนเดียว)
  publicIdols(p) {
    const cur = idolKeyOf(p);
    return IDOL_KEYS.map((k) => ({
      key: k, name: IDOLS[k].name, img: IDOLS[k].img, passive: IDOLS[k].passive, current: k === cur,
    }));
  },

  // ---------- ภาพ / เพลง ----------
  displayImg(p) {
    if (!isLumi(p)) return null;
    return idolDown(p) ? IMG.base : idolOf(p).img;
  },
  activeMusic(engine) {
    let best = null;
    for (const p of engine.alivePlayers()) {
      if (!isLumi(p)) continue;
      const music = luminousOn(p) ? "lumi_luminous" : (ultOn(p) ? `lumi_song_${p.lumiUltIdol}` : null);
      if (!music) continue;
      if (!best || (p.transformAt || 0) > best.at) best = { music, at: p.transformAt || 0 };
    }
    return best;
  },

  // ---------- ไอดอลล้ม / ตกรอบจริง ----------
  //  เรียกจาก instantDeath() ก่อนบันทึกความตาย (แพทเทิร์นเดียวกับ arjuna.tryRevive / byleth.tryRevive)
  //  คืน true = ยังไม่ตกรอบ (แค่ไอดอลล้ม แล้วสลับหลอดเลือดไปเป็นของโปรดิวเซอร์)
  tryIdolDown(engine, p) {
    if (!isLumi(p) || idolDown(p)) return false;
    p.lumiIdolDown = true;
    p.hp = Math.max(1, p.lumiProducerHp || PRODUCER_HP); // สลับเจ้าของหลอด: ต่อจากนี้คือเลือดโปรดิวเซอร์
    p.armor = 0;
    p.shield = 0;
    p.tempHp = 0;
    p.statuses = {};   // สถานะทั้งหมดเป็นของไอดอลที่ล้มไปแล้ว
    p.statusAmt = {};
    p.evadeStacks = [];
    // ⚠️ ดาเมจที่ Million star 765 หน่วงไว้ต้องตายไปพร้อมไอดอลด้วย
    //  ก้อนพวกนี้คือดาเมจที่ "ไอดอลรับไว้แล้ว" แค่ยังไม่ลงผล — ถ้าปล่อยค้างไว้ มันจะไหลไปลงที่โปรดิวเซอร์
    //  ซึ่งขัดกฎแกนของตัวละคร ("ไอดอลเป็นคนรับความเสียหายแทน · โปรดิวเซอร์ไม่ได้รับความเสียหาย")
    //  และหนักกว่านั้นคือหลอดโปรดิวเซอร์มีแค่ 3 ไม่มีเกราะ — ดาเมจที่เล็งไอดอลเต็มหลอดจะฆ่าทั้งตัวละครทันที
    const dropped = (p.lumiPending || []).reduce((sum, it) => sum + it.n, 0);
    p.lumiPending = [];
    if (dropped > 0) engine.log(`⏳💨 ${p.name} มิไร — ความเสียหายที่หน่วงไว้ ${dropped} หน่วยสลายไปพร้อมไอดอล (ไม่ตกถึงโปรดิวเซอร์)`);
    p.lumiUltIdol = null;
    p.alive = true;
    p.result = null;
    p.locked = false;
    engine.skillFlash({ name: "ไอดอลล้มลง — โปรดิวเซอร์ออกมารับเอง", img: IMG.base, by: p.name, color: engine.colorOf(p) });
    engine.log(`💔 ${p.name} ไอดอล ${idolOf(p).name} ล้มลง! — ต่อจากนี้ความเสียหายลงที่โปรดิวเซอร์ (เลือด ${p.hp}/${PRODUCER_HP}) · ใช้ "ลุกขึ้นมา ไอดอลที่ฉันภาคภูมิใจ" เพื่อชุบกลับ`);
    return true;
  },

  // ---------- สกิลติดตัว: ไม่รับดาเมจแพ้จั่ว/ไพ่แตก ขณะท่าไม้ตายทำงาน ----------
  isLossImmune(engine, p) {
    return isLumi(p) && anyUltOn(p) && !engine.passiveSealed(p);
  },

  // ---------- ผลติดตัวรายไอดอล + ติกรายเทิร์น ----------
  onRoundStartTick(engine, p) {
    if (!isLumi(p) || !p.alive) return;
    p.lumiKoharuUsed = false; // โคฮารุ: สิทธิ์ "ไพ่ใบแรกหักลบ" เต็มใหม่ทุกเทิร์น

    // Million star 765: ดาเมจที่หน่วงไว้เมื่อเทิร์นก่อน ลงผลตอนนี้ — เว้นก้อนที่คนทำตายไปแล้ว
    this.resolvePendingDamage(engine, p);

    if (idolDown(p)) return; // ไอดอลล้มอยู่ = ไม่มีผลติดตัวของไอดอลคนไหนทำงาน

    if (hasPassive(p, "haruka")) {
      const got = engine.addSkill(p, 1, "passive");
      if (got > 0) engine.log(`🌟 ${p.name} ฮารุกะ — แต้มสกิล +${got}`);
    }
    if (hasPassive(p, "anzu")) {
      const got = engine.addGold(p, 1);
      if (got > 0) engine.log(`💰 ${p.name} อันซุ — เหรียญ +${got}`);
    }
    if (hasPassive(p, "mirai")) {
      p.lumiMiraiTurns = (p.lumiMiraiTurns || 0) + 1;
      if (p.lumiMiraiTurns >= MIRAI_HEAL_EVERY) {
        p.lumiMiraiTurns = 0;
        const heal = engine.healHp(p, 1);
        if (heal > 0) engine.log(`💚 ${p.name} มิไร — พลังชีวิต +${heal} (ทุก ${MIRAI_HEAL_EVERY} เทิร์น)`);
      }
    }
    // ฝึกซ้อม: แต้มสกิล + เลือด ต่อเทิร์น
    if (trainOn(p)) {
      const got = engine.addSkill(p, TRAIN_SKILL, "passive");
      const heal = engine.healHp(p, TRAIN_HEAL);
      engine.log(`🎤 ${p.name} เตรียมซ้อม — แต้มสกิล +${got} · พลังชีวิต +${heal} (เหลืออีก ${p.statuses.lumiTrain} เทิร์น)`);
    }
  },

  // โคฮารุ (ผลติดตัว): ไพ่ใบแรกของเทิร์นถูก "ลบ" ออกจากแต้ม — พลิกเครื่องหมายของการ์ดใบนั้นเลย
  //  ทำแบบนี้เพราะ calculateScore() บวก c.value ตรงๆ การพลิกเครื่องหมายจึงได้ผลลบโดยไม่ต้องแก้สูตรกลาง
  //  และผู้เล่นยังเห็นบนหน้าไพ่ว่าใบนั้นติดลบจริงๆ
  onCardDraw(engine, p, card) {
    if (!isLumi(p) || !card || card.special) return;
    if (!hasPassive(p, "kohaku") || p.lumiKoharuUsed) return;
    if (!(card.value > 0)) return;
    p.lumiKoharuUsed = true;
    card.value = -card.value;
    engine.log(`🃏 ${p.name} โคฮารุ — ไพ่ใบแรกของเทิร์นถูกหักลบออกจากแต้ม (${card.value})`);
  },

  // ---------- Million star 765: ดาเมจหน่วง 1 เทิร์น ----------
  //  เรียกจาก adjustIncomingDamage() — คืน 0 = ดาเมจถูกเลื่อนออกไป ไม่ลงในเทิร์นนี้
  //  ⚠️ ต้องมี "ต้นตอที่ระบุตัวได้" เท่านั้นถึงจะหน่วง — ดาเมจจากสถานะ (ลุกไหม้/เลือดไหล) ไม่มีเจ้าของ
  //  ถ้าหน่วงด้วยจะกลายเป็นภูมิคุ้มกันถาวรเพราะไม่มีวันมี "คนทำ" ให้ตรวจว่ายังไม่ตาย
  delayIncoming(engine, p, n) {
    if (!hasUlt(p, "mirai") || !(n > 0)) return n;
    if (p._statusDamage) return n;
    const fromId = engine.effectSourceId;
    if (!fromId || fromId === p.id) return n;
    p.lumiPending = p.lumiPending || [];
    p.lumiPending.push({ fromId, n });
    const from = engine.players[fromId];
    engine.log(`⏳ ${p.name} มิไร — ความเสียหาย ${n} หน่วยจาก ${from ? from.name : "ที่ไหนสักแห่ง"} ถูกหน่วงไว้ 1 เทิร์น (ถ้าคนทำตายก่อน จะไม่เกิดขึ้นเลย)`);
    return 0;
  },
  resolvePendingDamage(engine, p) {
    const queue = Array.isArray(p.lumiPending) ? p.lumiPending : [];
    if (!queue.length) return;
    p.lumiPending = [];
    for (const { fromId, n } of queue) {
      const from = engine.players[fromId];
      if (!from || !from.alive) {
        engine.log(`⏳✨ ${p.name} มิไร — คนที่ทำความเสียหาย ${n} หน่วยตกรอบไปก่อน ความเสียหายจึงไม่เกิดขึ้น`);
        continue;
      }
      engine.log(`⏳💥 ${p.name} มิไร — ความเสียหายที่หน่วงไว้ ${n} หน่วยจาก ${from.name} ลงผลตอนนี้`);
      engine.withEffectSource(from, () => {
        p._lumiNoDelay = true; // กันหน่วงซ้ำวนไม่จบ
        engine.dealMixed(p, n);
        p._lumiNoDelay = false;
        engine.resolveDamageAftermath(p);
      });
      if (!p.alive) return;
    }
  },

  // ---------- Tsubasa 283: หลบหลีก 40% ----------
  dodgeChance(p) { return hasUlt(p, "kaho") ? KAHO_DODGE : 0; },
  tryDodge(engine, p, what) {
    const pct = this.dodgeChance(p);
    if (pct <= 0 || !p.alive) return false;
    if (Math.random() * 100 >= pct) return false;
    engine.log(`💨 หลบหลีก! ${p.name} (${idolOf(p).name}) หลบ${what ? ` ${what}` : "การโจมตี"}ได้ (${pct}%)`);
    return true;
  },

  // เรียกจาก adjustIncomingDamage() ของ server — รวมทั้งการหลบและการหน่วงดาเมจไว้ที่เดียว
  adjustIncomingDamage(engine, p, n, isNormalAttack) {
    if (!isLumi(p) || n <= 0 || p._lumiNoDelay) return n;
    if (!isNormalAttack && !p._statusDamage && this.tryDodge(engine, p, "ความเสียหายจากสกิล")) return 0;
    return this.delayIncoming(engine, p, n);
  },

  // เรียกจาก doAttack() ก่อนคิดดาเมจ — คืน true ถ้าหลบพ้น (ผู้เรียกต้อง return ทันที)
  tryAttackDodge(engine, attacker, target) {
    if (!isLumi(target) || this.dodgeChance(target) <= 0) return false;
    if (!this.tryDodge(engine, target, `การโจมตีของ ${attacker.name}`)) return false;
    target.wasAttacked = true;
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.colorOf(attacker),
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.colorOf(target),
      dmg: 0, dodge: true,
      skills: [{ name: `หลบหลีก (${KAHO_DODGE}%)`, img: IDOLS.kaho.ultImg, by: target.name, color: engine.colorOf(target), side: "def" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // ---------- พลังโจมตี ----------
  //  คาโฮะ (ผลติดตัว) +1 · ท่าไม้ตาย +1 (luminous ไม่ซ้อนทับ และ Tsubasa 283 ไม่ให้โบนัสนี้)
  damageBonus(engine, attacker, target, ctx) {
    if (!isLumi(attacker) || idolDown(attacker)) return 0;
    let bonus = 0;
    if (hasPassive(attacker, "kaho")) { bonus += 1; ctx.lumiKahoAtk = true; }
    // ท่าไม้ตายที่ให้ +1: ฮารุกะ / อันซุ / มิไร / โคฮารุ (คาโฮะไม่ให้) — luminous ให้ก้อนเดียวไม่ซ้อน
    const ultAtk = luminousOn(attacker)
      || (ultOn(attacker) && ["haruka", "anzu", "mirai", "kohaku"].includes(attacker.lumiUltIdol));
    if (ultAtk) { bonus += ULT_ATK; ctx.lumiUltAtk = true; }
    return bonus;
  },

  // ---------- ฝึกซ้อม: โจมตีปกติไม่ได้ ----------
  cannotAttack(p) { return isLumi(p) && trainOn(p); },

  // ============================================================
  //  useSkill
  // ============================================================
  //  ช่องแรกสลับระหว่าง "สลับไอดอล" (ปกติ) กับ "ชุบไอดอล" (ตอนไอดอลล้ม)
  //  ช่องท่าไม้ตายสลับตามไอดอลที่ยืนอยู่ และกลายเป็น luminous เมื่อแต้มไอดอลครบ
  dynamicSkillFor(p, ch, tier) {
    if (!isLumi(p)) return ch[tier];
    if (tier === "basic") {
      if (idolDown(p)) return ch.basic2;
      // ปกสกิลสลับตัวโชว์ภาพ "ไอดอลปัจจุบัน" ตามที่ผู้ใช้กำหนด
      return { ...ch.basic, img: idolOf(p).img };
    }
    if (tier === "ultimate") {
      if (this.luminousReady(p)) return ch.ultimate2;
      return ch[`ultimate_${idolKeyOf(p)}`] || ch.ultimate;
    }
    return ch[tier];
  },
  luminousReady(p) { return isLumi(p) && !idolDown(p) && (p.lumiPoints || 0) >= POINTS_NEED; },

  canUseSkill(engine, p, tier, item) {
    if (!isLumi(p)) return true;
    if (tier === "basic") {
      if (idolDown(p)) return (p.lumiRevives || 0) < REVIVE_MAX; // ชุบไอดอล — จำกัด 3 ครั้งต่อเกม
      if (anyUltOn(p)) return false;             // ระหว่างท่าไม้ตายทำงาน สลับไอดอลไม่ได้
      return IDOL_KEYS.includes(item) && item !== idolKeyOf(p); // ต้องเลือกไอดอล "คนอื่น"
    }
    if (idolDown(p)) return false;               // ไอดอลล้ม = เหลือแต่ช่องชุบ
    if (tier === "secondary") return !trainOn(p);
    if (tier === "ultimate") return !anyUltOn(p); // กดซ้ำไม่ได้จนกว่าผลเดิมจะหมด
    return true;
  },

  applyInstantSkill(engine, p, tier, item) {
    if (!isLumi(p)) return "";
    if (tier === "basic") return idolDown(p) ? this.applyRevive(engine, p) : this.applySwitch(engine, p, item);
    if (tier === "secondary") return this.applyTrain(engine, p);
    if (tier === "ultimate") return this.luminousReady(p) ? this.applyLuminous(engine, p) : this.applyUlt(engine, p);
    return "";
  },

  // ---------- สกิลพื้นฐาน 1 ฉันเชื่อมั่นในตัวเธอนะ ----------
  applySwitch(engine, p, item) {
    const next = IDOLS[item];
    if (!next) return "";
    p.lumiIdol = next.key;
    p.lumiMiraiTurns = 0;
    // เสียงพูดประจำตัวไอดอล — เล่นทุกครั้งที่สลับ (ไม่ใช่ครั้งแรกครั้งเดียว)
    engine.skillFlash({
      name: `${next.name} — ${next.passive}`, img: next.img,
      by: p.name, color: engine.colorOf(p), sound: `lumi_voice_${next.key}`,
    });
    const heal = engine.healHp(p, SWITCH_HEAL);
    engine.log(`🎙️ ${p.name} ฉันเชื่อมั่นในตัวเธอนะ — ${next.name} ออกมายืนแนวหน้า (${next.passive})${heal > 0 ? ` · โปรดิวเซอร์ฟื้นพลังชีวิต +${heal}` : ""}`);
    return ` — ${next.name}`;
  },

  // ---------- สกิลพื้นฐาน 2 ลุกขึ้นมา ไอดอลที่ฉันภาคภูมิใจ ----------
  applyRevive(engine, p) {
    p.lumiRevives = (p.lumiRevives || 0) + 1;
    p.lumiProducerHp = Math.max(1, p.hp); // เก็บเลือดโปรดิวเซอร์ที่เหลือไว้ก่อนคืนหลอดให้ไอดอล
    p.lumiIdolDown = false;
    p.hp = REVIVE_HP;
    p.armor = REVIVE_ARMOR;
    p.lumiMiraiTurns = 0;
    engine.skillFlash({ name: "ลุกขึ้นมา ไอดอลที่ฉันภาคภูมิใจ", img: IMG.revive, by: p.name, color: engine.colorOf(p) });
    const left = Math.max(0, REVIVE_MAX - p.lumiRevives);
    engine.log(`✨ ${p.name} ลุกขึ้นมา ไอดอลที่ฉันภาคภูมิใจ — ${idolOf(p).name} กลับมายืนแนวหน้าด้วยพลังชีวิต ${REVIVE_HP} เกราะ ${REVIVE_ARMOR} (เลือดโปรดิวเซอร์ที่เหลือ ${p.lumiProducerHp} ถูกเก็บไว้) · ชุบได้อีก ${left}/${REVIVE_MAX} ครั้ง`);
    return " — ชุบไอดอล";
  },

  // ---------- สกิลรอง ฝึกซ้อม ----------
  applyTrain(engine, p) {
    p.statuses.lumiTrain = TRAIN_TURNS;
    this.addPoint(engine, p, "ฝึกซ้อม");
    engine.log(`🎤 ${p.name} ฝึกซ้อม — ได้ "เตรียมซ้อม" ${TRAIN_TURNS} เทิร์น: โจมตีปกติไม่ได้ แต่แต้มสกิลและพลังชีวิตฟื้น +1 ต่อเทิร์น`);
    return " — เตรียมซ้อม";
  },

  // ---------- แต้ม "ไอดอล" ----------
  addPoint(engine, p, why) {
    const before = p.lumiPoints || 0;
    p.lumiPoints = Math.min(POINTS_NEED, before + 1);
    if (p.lumiPoints === before) return;
    engine.log(`⭐ ${p.name} สถานะ "ไอดอล" +1 จาก${why} (${p.lumiPoints}/${POINTS_NEED})${p.lumiPoints >= POINTS_NEED ? " — ปลดล็อก luminous แล้ว!" : ""}`);
  },

  // ---------- ท่าไม้ตาย 1 (5 แบบ) ----------
  applyUlt(engine, p) {
    const idol = idolOf(p);
    p.statuses.lumiUlt = ULT_TURNS;
    p.lumiUltIdol = idol.key;
    p.lumiStolen = [];
    p.transformAt = engine.nextTransformCounter();
    engine.queueCutscene(p, `lumiUlt_${idol.key}`);
    this.addPoint(engine, p, `ท่าไม้ตาย ${idol.ult}`);
    engine.log(`🎬 ${p.name} ${idol.ult} — "${idol.quote}" (${ULT_TURNS} เทิร์น) · ${idol.ultDesc}`);
    return ` — ${idol.ult}`;
  },

  // ---------- ท่าไม้ตาย 2 luminous ----------
  applyLuminous(engine, p) {
    p.statuses.lumiLuminous = ULT_TURNS;
    p.lumiPoints = 0;            // ใช้แล้วต้องเก็บใหม่
    p.lumiStolen = [];
    p.lumiHitCount = 0;
    p.lumiBurstDone = false;
    p.transformAt = engine.nextTransformCounter();
    engine.queueCutscene(p, "lumiLuminous");
    engine.log(`🌈 ${p.name} luminous — รวมพลังไอดอลทั้ง 5 คนเข้าด้วยกัน ${ULT_TURNS} เทิร์น! (แต้ม "ไอดอล" ถูกใช้หมด)`);
    return " — luminous!";
  },

  // ---------- ตอนถูกโจมตีปกติ (luminous: นับ "จำนวนครั้งที่ถูกตี") ----------
  //  ⚠️ ต้องเรียก "ก่อน" ด่านหลบหลีกทั้งหมดใน doAttack — ไม่งั้นหมัดที่ถูกหลบจะไม่ถูกนับเลย
  //  ซึ่งเป็นปัญหาใหญ่มากเพราะ luminous มีการหลบ 40% ของคาโฮะติดมาด้วย = ~40% ของหมัดหายไปเงียบๆ
  //  (นับ "การถูกเล็ง" ไม่ใช่ "การโดนดาเมจ" — โดนหลบหรือโดนหน่วงดาเมจก็ยังนับว่าถูกตี)
  //  เกณฑ์: ถูกตีครบเท่าจำนวนคู่ต่อสู้ที่ยังอยู่ · ไม่นับกรณีเหลือ 1vs1 (ต้องมีคู่ต่อสู้ตั้งแต่ 2 คนขึ้นไป)
  //  คืน true = ครบแล้วและคิวคลิป burst ไว้ (รางวัลลงที่ flushBurst หลังคลิปจบ)
  onAttackedNormally(engine, attacker, target) {
    if (!luminousOn(target) || !attacker || target.lumiBurstDone) return false;
    if (attacker.id === target.id || engine.sameTeam(target, attacker)) return false;
    const foes = engine.alivePlayers().filter((o) => o.id !== target.id && !engine.sameTeam(target, o));
    if (foes.length < 2) return false; // "ไม่นับกรณีเหลือ 1vs1"
    target.lumiHitCount = (target.lumiHitCount || 0) + 1;
    if (target.lumiHitCount < foes.length) {
      engine.log(`🌈 ${target.name} luminous — ถูกโจมตีแล้ว ${target.lumiHitCount}/${foes.length} ครั้ง`);
      return false;
    }
    target.lumiBurstDone = true;
    target.lumiBurstPending = true; // รางวัลลงหลังคลิปเล่นจบ (ดู flushBurst)
    engine.queueCutscene(target, "lumiBurst");
    return true;
  },
  // จ่ายรางวัลของ burst — เรียกจาก postAttackFollowup() ซึ่งทำงานหลังคิววีดีโอเล่นจบแล้ว
  //  (สเปคของตัวละครอื่นในเกมนี้ยึดกติกาเดียวกัน: วีดีโอก่อน ผลตามทีหลัง)
  flushBurst(engine) {
    for (const p of Object.values(engine.players)) {
      if (!p.lumiBurstPending) continue;
      p.lumiBurstPending = false;
      if (!isLumi(p) || !p.alive) continue;
      const heal = engine.healHp(p, BURST_HP);
      const armor = engine.healArmor(p, BURST_ARMOR);
      engine.log(`🌈✨ ${p.name} luminous — คู่ต่อสู้ทุกคนตีครบแล้ว! ฟื้นพลังชีวิต +${heal} และเกราะ +${armor}`);
    }
  },

  // ---------- ตอนเราโจมตีปกติสำเร็จ ----------
  onAttackLanded(engine, attacker, target) {
    if (!isLumi(attacker) || idolDown(attacker)) return null;
    const fx = [];
    // Mishiro 346: สุ่มขโมยของ 1 ชิ้น — ห้ามขโมยคนเดิมซ้ำในรอบท่าเดียวกัน
    if (hasUlt(attacker, "anzu") && target) {
      attacker.lumiStolen = attacker.lumiStolen || [];
      if (attacker.lumiStolen.includes(target.id)) {
        engine.log(`🛍️ ${attacker.name} อันซุ — ขโมยจาก ${target.name} ไปแล้วในรอบท่านี้ ขโมยซ้ำไม่ได้`);
      } else {
        attacker.lumiStolen.push(target.id);
        const stolen = this.stealOne(engine, attacker, target);
        fx.push(stolen ? `Mishiro 346 — ขโมย ${stolen}` : "Mishiro 346 — กระเป๋าว่าง ฟื้นเลือด");
      }
    }
    // Tsubasa 283: โจมตีปกติฟื้นแต้มสกิล
    if (hasUlt(attacker, "kaho")) {
      const got = engine.addSkill(attacker, KAHO_SKILL_ON_HIT, "passive");
      if (got > 0) {
        engine.log(`🎺 ${attacker.name} คาโฮะ — โจมตีปกติฟื้นแต้มสกิล +${got}`);
        fx.push(`Tsubasa 283 — แต้มสกิล +${got}`);
      }
    }
    // All star 765: ชนะแล้วตีได้ 2 ครั้ง — จองครั้งที่ 2 ไว้ให้ postAttackFollowup
    if (hasUlt(attacker, "haruka") && !(attacker.lumiExtraAtk > 0) && !attacker._lumiSecondHit) {
      attacker.lumiExtraAtk = 1;
      attacker._lumiSecondHit = true;
      engine.log(`🌟 ${attacker.name} All star 765 — ยังไม่จบ! ได้โจมตีปกติอีก 1 ครั้ง`);
    }
    return fx.length ? fx : null;
  },

  stealOne(engine, p, target) {
    p.inventory = p.inventory || [];
    target.inventory = target.inventory || [];
    const pool = target.inventory
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => it.type !== "blackSparklence"); // ของประจำตัวขโมยไม่ได้ (กติกาเดียวกับอิกนิส)
    if (!pool.length) {
      const heal = engine.healHp(p, ANZU_HEAL_NO_ITEM);
      engine.log(`🛍️ ${p.name} อันซุ — ${target.name} ไม่มีของให้ขโมย จึงฟื้นพลังชีวิต +${heal} แทน`);
      return null;
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    const stolen = target.inventory.splice(picked.idx, 1)[0];
    p.inventory.push({ ...stolen, uid: `lumi_${p.id}_${Date.now()}_${Math.floor(Math.random() * 100000)}` });
    const label = engine.shopItemName ? engine.shopItemName(stolen) : "ไอเทม";
    engine.log(`🛍️ ${p.name} อันซุ — ขโมย ${label} จาก ${target.name} มาได้!`);
    return label;
  },

  // ---------- โจมตีเพิ่ม (All star 765 / kuroi 961) ----------
  //  เรียกจาก postAttackFollowup() — คืน true = เปิดเฟส ATTACK ใหม่ (ผู้เรียกต้อง return ทันที)
  startExtraAttack(engine, attacker) {
    if (!isLumi(attacker) || !attacker.alive) return false;
    if (!(attacker.lumiExtraAtk > 0)) return false;
    const targets = engine.attackableTargets(attacker.id);
    if (!targets.length) { attacker.lumiExtraAtk = 0; return false; }
    attacker.lumiExtraAtk--;
    engine.log(`🌟 ${attacker.name} All star 765 — โจมตีครั้งที่ 2!`);
    engine.setAttackerId(attacker.id);
    engine.setGameState("ATTACK");
    engine.startPhaseTimer(engine.ATTACK_TIME, () => {
      const t = engine.attackableTargets(engine.attackerId);
      if (t.length) engine.doAttack(engine.attackerId, t[Math.floor(Math.random() * t.length)].id);
      else engine.endTurn();
    });
    engine.broadcastState();
    return true;
  },

  // kuroi 961: แต้มน้อยสุดแต่ไม่แตก -> ได้ตีต่อจากผู้ชนะในเทิร์นเดียวกัน
  //  เรียกจาก postAttackFollowup() หลังผู้ชนะตีเสร็จ — คืน true = เปิดเฟส ATTACK ให้เรา
  startLoserAttack(engine) {
    for (const p of engine.alivePlayers()) {
      if (!hasUlt(p, "kohaku") || this.cannotAttack(p)) continue;
      if (p.lumiFollowRound === engine.roundNumber) continue; // ใช้สิทธิ์ของเทิร์นนี้ไปแล้ว
      if (engine.bustedOf(p)) continue;                        // ไพ่แตกไม่เข้าเงื่อนไข
      if (p.id === engine.attackerId) continue;                // เป็นผู้ชนะเองอยู่แล้ว
      const foes = engine.alivePlayers().filter((o) => o.id !== p.id);
      if (!foes.length) continue;
      const mine = engine.scoreOf(p);
      // "แต้มน้อยที่สุด" — คนที่ไพ่แตกถือว่าต่ำกว่าเสมอ จึงไม่นับเข้ามาเทียบ
      const lower = foes.some((o) => !engine.bustedOf(o) && engine.scoreOf(o) < mine);
      if (lower) continue;
      const targets = engine.attackableTargets(p.id);
      if (!targets.length) continue;
      p.lumiFollowRound = engine.roundNumber;
      engine.log(`🖤 ${p.name} kuroi 961 — แต้มน้อยที่สุดแต่ไพ่ไม่แตก จึงได้โจมตีต่อจากผู้ชนะ!`);
      engine.setAttackerId(p.id);
      engine.setGameState("ATTACK");
      engine.startPhaseTimer(engine.ATTACK_TIME, () => {
        const t = engine.attackableTargets(engine.attackerId);
        if (t.length) engine.doAttack(engine.attackerId, t[Math.floor(Math.random() * t.length)].id);
        else engine.endTurn();
      });
      engine.broadcastState();
      return true;
    }
    return false;
  },

  // ---------- ท่าไม้ตายหมดเวลา ----------
  onUltExpire(engine, p, key) {
    if (!isLumi(p)) return;
    if (key === "lumiUlt") {
      engine.log(`🎬 ${p.name} ${IDOLS[p.lumiUltIdol] ? IDOLS[p.lumiUltIdol].ult : "ท่าไม้ตาย"} หมดเวลาแล้ว — สลับไอดอลได้อีกครั้ง`);
      p.lumiUltIdol = null;
    } else if (key === "lumiLuminous") {
      engine.log(`🌈 ${p.name} luminous หมดเวลาแล้ว — ต้องสะสมแต้ม "ไอดอล" ใหม่อีก ${POINTS_NEED} แต้ม`);
    }
    p.lumiStolen = [];
    p.lumiHitCount = 0;
    p.lumiBurstDone = false;
    p.lumiExtraAtk = 0;
  },

  // ---------- ต้นเทิร์น (หลังลูปหลัก) ----------
  onRoundStartAfterLoop(engine) {
    for (const p of engine.alivePlayers()) {
      if (isLumi(p)) p._lumiSecondHit = false; // All star 765: โควตาหมัดที่ 2 เต็มใหม่ทุกเทิร์น
    }
  },
};
