// ============================================================
//  อุซากิ (เอาฮา · เลือกได้คนเดียวต่อเกม)
//
//  สกิลพื้นฐาน อี!!!!ย๊าาาา!ฮ๊า~~~ (1 แต้ม · กดได้ 2 ครั้ง/เทิร์น · ไม่กินโควตาสกิลของเทิร์น)
//    กินไอเทมในกระเป๋าของตัวเอง 1 ชิ้น (เลือกเอง) — ราคา 5 ขึ้นไป: ฟื้นพลังชีวิต 3 + ต้านสถานะผิดปกติ 2 เทิร์น
//                                                  ราคาต่ำกว่า 5: ฟื้นพลังชีวิต 1 + ต้านสถานะผิดปกติ 1 เทิร์น
//  สกิลรอง ปรุ้ต..... (4 แต้ม) — เลือกผู้เล่น 1 คน -> เห็นแต้มการ์ดของเขา (เห็นคนเดียว) แล้วเลือก "เอา" หรือ "ไม่เอา"
//    เอา = วีดีโอ usagi_skill2 แล้วสลับไพ่ทั้งมือกัน (ไพ่แตกก็ติดไปด้วย · ทั้งคู่จั่วต่อได้ตามปกติ)
//    ไม่เอา / ไม่ตอบก่อนเปิดไพ่ = ไม่สลับ (แต้มที่จ่ายไปไม่คืน)
//  ท่าไม้ตาย ฮัยย๊ะ ฮ๊ะ ปรุๆ อิอิ อิยะ ฮ๊ะ (6 แต้ม) — วีดีโอ usagi_skill3 + เพลง usagi_theme 3 เทิร์น
//    ต้นเทิร์นทั้ง 3 เทิร์นถัดไป ฝ่ายตรงข้ามทุกคน (ไม่รวมเพื่อนร่วมทีม/ORT) ต้องทำโจทย์คณิต 3 ข้อ ข้อละ 5 วินาที
//    ตอบผิด/ไม่ทัน = ความเสียหาย 1 ต่อข้อ (ลดเกราะก่อน) · ระหว่างคัตซีน นาฬิกาโจทย์หยุด
//    ระบบเดียวกับ QTE: เก็บเส้นตาย (ms) ไว้ที่ server แล้วตัดสินตอนคำตอบมาถึง — ไม่มี setTimeout ฝั่ง server
//  สกิลติดตัว อุ อุ นาๆ อุนาา — "ปรุๆ" 0-8 (p.usagiPuru)
//    ออกหมัดโจมตีปกติ +2 · 1 หน่วย = คริติคอล 7% (ดาเมจ ×2) · ตั้งแต่ 5 หน่วย พลังโจมตี +1
//    ไม่ได้เพิ่มครบ 3 เทิร์น = ลด 1 (ได้เพิ่มเมื่อไหร่ เริ่มนับ 3 ใหม่)
// ============================================================

const ID = "usagi";
const BASIC_USES = 2;
const RICH_PRICE = 5;
const PURU_MAX = 8;
const PURU_PER_ATTACK = 2;
const PURU_CRIT = 0.07;
const PURU_ATK_AT = 5;
const PURU_DECAY_TURNS = 3;
const QUIZ_TURNS = 3;
const QUIZ_COUNT = 3;
const QUIZ_MS = 5000;
const IMG = {
  base: "/characters/usagi/Usagi.webp",
  skill1: "/characters/usagi/usagi_skill1.jpg",
  skill2: "/characters/usagi/usagi_skill2.jpg",
  skill3: "/characters/usagi/usagi_skill3.jpeg",
};
const VIDEO = { swap: "/characters/usagi/usagi_skill2.mp4", ult: "/characters/usagi/usagi_skill3.mp4" };

const isUsagi = (p) => !!p && p.characterId === ID;
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// โจทย์ 1 ข้อ — ตอบเป็นจำนวนเต็มเสมอ (ข้อหารสร้างจากผลคูณ จึงหารลงตัว) ติดลบได้
function makeQuestion() {
  const op = ["+", "-", "×", "÷"][rnd(0, 3)];
  if (op === "+") { const a = rnd(1, 20), b = rnd(1, 20); return { q: `${a} + ${b}`, a: a + b }; }
  if (op === "-") { const a = rnd(1, 20), b = rnd(1, 20); return { q: `${a} - ${b}`, a: a - b }; }
  if (op === "×") { const a = rnd(2, 12), b = rnd(2, 9); return { q: `${a} × ${b}`, a: a * b }; }
  const b = rnd(2, 9), ans = rnd(2, 12);
  return { q: `${b * ans} ÷ ${b}`, a: ans };
}

module.exports = {
  id: ID,
  IMG, VIDEO,
  BASIC_USES, RICH_PRICE, PURU_MAX, QUIZ_TURNS, QUIZ_COUNT, QUIZ_MS,
  makeQuestion,

  resetCombat(p) {
    p.usagiBasicUses = 0;
    p.usagiPuru = 0;
    p.usagiPuruIdle = 0;
    p.usagiSwapOffer = null; // { targetId } — รอเลือก "เอา/ไม่เอา" (ที่ตัวอุซากิ)
    p.usagiQuiz = null;      // { items, idx, wrong, leftMs, deadline, paused, fromId } — ที่ตัวผู้ถูกทำโจทย์
  },

  // ---------- ต้นเทิร์น ----------
  onRoundStartTick(engine, p) {
    if (!isUsagi(p)) return;
    p.usagiBasicUses = 0;
    // ปรุๆ ลดเอง: ไม่ได้เพิ่มครบ 3 เทิร์น -> ลด 1 แล้วนับใหม่
    if ((p.usagiPuru || 0) > 0) {
      p.usagiPuruIdle = (p.usagiPuruIdle || 0) + 1;
      if (p.usagiPuruIdle >= PURU_DECAY_TURNS) {
        p.usagiPuru--;
        p.usagiPuruIdle = 0;
        engine.log(`🐰 ${p.name} ปรุๆ ลดลงเหลือ ${p.usagiPuru}`);
      }
    } else p.usagiPuruIdle = 0;
  },
  // หลังลูปต้นเทิร์น (ทุกคนได้ไพ่ใบแรกแล้ว): ท่าไม้ตายยังทำงาน -> แจกโจทย์ให้ฝ่ายตรงข้าม
  onRoundStartAfterLoop(engine) {
    for (const u of Object.values(engine.players)) {
      if (!isUsagi(u) || !u.alive || !((u.statuses.usagiMath || 0) > 0)) continue;
      u.statuses.usagiMath--;
      const left = u.statuses.usagiMath;
      if (left <= 0) delete u.statuses.usagiMath;
      let n = 0;
      for (const t of Object.values(engine.players)) {
        if (t === u || !t.alive || t.isBoss || engine.sameTeam(u, t) || t.usagiQuiz) continue;
        const items = Array.from({ length: QUIZ_COUNT }, makeQuestion);
        t.usagiQuiz = { items, idx: 0, wrong: 0, fromId: u.id, leftMs: QUIZ_MS, deadline: Date.now() + QUIZ_MS, paused: false };
        n++;
      }
      if (n) engine.log(`🧮 ${u.name} ฮัยย๊ะ ฮ๊ะ ปรุๆ — ${n} คนต้องทำโจทย์คณิต ${QUIZ_COUNT} ข้อ${left > 0 ? ` (เหลืออีก ${left} เทิร์น)` : " (เทิร์นสุดท้าย)"}`);
    }
  },

  // ---------- ด่านก่อนหักแต้ม ----------
  canUseSkill(engine, p, tier, targets, item) {
    if (tier === "basic") {
      if ((p.usagiBasicUses || 0) >= BASIC_USES) return false;
      return (p.inventory || []).some((it) => it.uid === item);
    }
    if (tier === "secondary") {
      if (p.usagiSwapOffer) return false;
      const t = engine.players[Array.isArray(targets) ? targets[0] : null];
      return !!(t && t.alive && t.id !== p.id);
    }
    if (tier === "ultimate") return !((p.statuses.usagiMath || 0) > 0);
    return true;
  },
  // สกิลพื้นฐานไม่กินโควตาสกิลของเทิร์น (มีโควตา 2 ครั้งของตัวเอง)
  skipsTurnQuota(p, tier) { return isUsagi(p) && tier === "basic"; },

  // ---------- ลงผล ----------
  applyInstantSkill(engine, p, tier, targets, item) {
    if (tier === "basic") {
      const idx = (p.inventory || []).findIndex((it) => it.uid === item);
      if (idx < 0) return "";
      const eaten = p.inventory.splice(idx, 1)[0];
      p.usagiBasicUses = (p.usagiBasicUses || 0) + 1;
      const rich = (eaten.price || 0) >= RICH_PRICE;
      const healed = engine.healHp(p, rich ? 3 : 1);
      engine.applyBuff(p, "resist", 1, rich ? 2 : 1);
      const name = engine.shopItemName ? engine.shopItemName(eaten) : "ไอเทม";
      engine.log(`🐰 ${p.name} กิน ${name} (${eaten.price || 0} เหรียญ) — ฟื้นพลังชีวิต +${healed} · ต้านสถานะผิดปกติ ${rich ? 2 : 1} เทิร์น`);
      return ` — กิน ${name}`;
    }
    if (tier === "secondary") {
      const t = engine.players[targets[0]];
      p.usagiSwapOffer = { targetId: t.id };
      return ` → ${t.name}`;
    }
    if (tier === "ultimate") {
      p.statuses.usagiMath = QUIZ_TURNS;
      p.transformAt = engine.nextTransformCounter(); // เพลง usagi_theme เริ่มใหม่ทุกครั้งที่กด
      engine.queueCutscene(p, "usagiUlt"); // วีดีโอทุกครั้งที่กด
      return "";
    }
    return "";
  },

  // ---------- สกิลรอง: ตอบ "เอา/ไม่เอา" ----------
  // คืน true ถ้าต้องสลับ (ผู้เรียกเล่นวีดีโอก่อน แล้วค่อยเรียก applySwap)
  answerSwap(engine, p, accept) {
    const offer = p.usagiSwapOffer;
    if (!offer) return false;
    p.usagiSwapOffer = null;
    const t = engine.players[offer.targetId];
    if (!accept || !t || !t.alive || !p.alive) {
      engine.log(`🐰 ${p.name} ปรุ้ต..... — ไม่เอาไพ่ของ ${t ? t.name : "เป้าหมาย"}`);
      return false;
    }
    engine.queueCutscene(p, "usagiSwap");
    p.usagiSwapPending = t.id;
    return true;
  },
  applySwap(engine, p) {
    const t = engine.players[p.usagiSwapPending];
    p.usagiSwapPending = null;
    if (!t || !t.alive || !p.alive) return;
    const mine = p.cards;
    p.cards = t.cards;
    t.cards = mine;
    p.busted = engine.bustedOf(p);
    t.busted = engine.bustedOf(t);
    if (p.busted) engine.voidUltimateOnBust(p);
    if (t.busted) engine.voidUltimateOnBust(t);
    engine.log(`🐰 ${p.name} ปรุ้ต..... — สลับไพ่ทั้งมือกับ ${t.name}!${p.busted ? ` (${p.name} ไพ่แตก)` : ""}${t.busted ? ` (${t.name} ไพ่แตก)` : ""}`);
  },

  // ---------- โจทย์คณิต ----------
  quizPending(engine) {
    return Object.values(engine.players).some((p) => p.alive && p.usagiQuiz);
  },
  // ระหว่างที่เกมไม่อยู่ในเฟสจั่วไพ่ (คัตซีนท่าไม้ตายคั่น ฯลฯ) นาฬิกาโจทย์หยุด — เรียกทุกครั้งก่อนส่ง state
  syncPause(engine) {
    const running = engine.gameState === "PLAYING";
    for (const p of Object.values(engine.players)) {
      const qz = p.usagiQuiz;
      if (!qz) continue;
      if (!running && !qz.paused) { qz.paused = true; qz.leftMs = Math.max(0, qz.deadline - Date.now()); }
      else if (running && qz.paused) { qz.paused = false; qz.deadline = Date.now() + qz.leftMs; }
    }
  },
  // ตอบ 1 ข้อ (value = null คือหมดเวลา) — คืน true ถ้าจบชุดแล้ว
  answerQuiz(engine, p, value, timedOut) {
    const qz = p.usagiQuiz;
    if (!qz || qz.paused) return false;
    const late = Date.now() > qz.deadline + 400; // เผื่อหน่วงเน็ตเล็กน้อย
    if (timedOut && !late && Date.now() <= qz.deadline) return false; // client บอกหมดเวลาก่อนจริง — ไม่เชื่อ
    const n = Number(value);
    const right = !timedOut && !late && Number.isInteger(n) && n === qz.items[qz.idx].a;
    if (!right) qz.wrong++;
    qz.idx++;
    if (qz.idx < qz.items.length) {
      qz.deadline = Date.now() + QUIZ_MS;
      qz.leftMs = QUIZ_MS;
      return false;
    }
    this.finishQuiz(engine, p);
    return true;
  },
  // ข้อที่เหลือนับเป็นผิดทั้งหมด (หมดเฟสจั่วไพ่ / ผู้ตอบหลุด)
  finishQuiz(engine, p) {
    const qz = p.usagiQuiz;
    if (!qz) return;
    p.usagiQuiz = null;
    if (!p.alive) return; // ตายไปแล้วระหว่างทำโจทย์ — ไม่มีอะไรให้ลงแล้ว
    const wrong = qz.wrong + Math.max(0, qz.items.length - qz.idx);
    const src = engine.players[qz.fromId];
    if (wrong <= 0) { engine.log(`🧮 ${p.name} ตอบถูกครบ ${qz.items.length} ข้อ — ไม่เสียอะไรเลย`); return; }
    engine.withEffectSource(src || p, () => {
      engine.dealMixed(p, wrong);
      engine.resolveDamageAftermath(p);
    });
    engine.log(`🧮 ${p.name} ตอบผิด ${wrong} ข้อ — รับความเสียหาย -${wrong}${p.alive ? "" : " ตกรอบ!"}`);
  },
  sweepQuizzes(engine) {
    for (const p of Object.values(engine.players)) if (p.usagiQuiz) this.finishQuiz(engine, p);
  },

  // ---------- สกิลติดตัว ปรุๆ ----------
  // ออกหมัดโจมตีปกติ (นับตอนออกหมัด แม้โดนหลบ)
  onAttack(engine, attacker) {
    if (!isUsagi(attacker)) return;
    const before = attacker.usagiPuru || 0;
    attacker.usagiPuru = Math.min(PURU_MAX, before + PURU_PER_ATTACK);
    attacker.usagiPuruIdle = 0;
    if (attacker.usagiPuru !== before) engine.log(`🐰 ${attacker.name} ปรุๆ +${attacker.usagiPuru - before} (รวม ${attacker.usagiPuru})`);
  },
  damageBonus(engine, attacker) {
    return isUsagi(attacker) && (attacker.usagiPuru || 0) >= PURU_ATK_AT ? 1 : 0;
  },
  // คริติคอล 7% ต่อปรุๆ 1 หน่วย — คูณยอดสุทธิท้ายสุด (แพทเทิร์นเดียวกับดาบของเอจิ / ORT)
  applyCrit(engine, attacker, dmg, fx) {
    if (!isUsagi(attacker) || dmg <= 0) return dmg;
    const chance = (attacker.usagiPuru || 0) * PURU_CRIT;
    if (!(Math.random() < chance)) return dmg;
    fx.crit = true;
    fx.chance = Math.round(chance * 100);
    return dmg * 2;
  },

  // ---------- ข้อมูลให้ client ----------
  publicState(p) {
    return { puru: p.usagiPuru || 0, puruMax: PURU_MAX, idle: p.usagiPuruIdle || 0, basicLeft: BASIC_USES - (p.usagiBasicUses || 0) };
  },
  // เจ้าของคนเดียว: ข้อเสนอสลับไพ่ (เห็นแต้มเป้าหมาย) · ผู้ทำโจทย์คนเดียว: โจทย์ข้อปัจจุบัน (ไม่ส่งเฉลย)
  privateState(engine, p) {
    const out = {};
    if (p.usagiSwapOffer) {
      const t = engine.players[p.usagiSwapOffer.targetId];
      if (t) out.usagiSwapOffer = { targetId: t.id, targetName: t.name, score: engine.scoreOf(t), busted: engine.bustedOf(t), cardCount: (t.cards || []).length };
    }
    if (p.usagiQuiz) {
      const qz = p.usagiQuiz;
      out.usagiQuiz = {
        q: qz.items[qz.idx].q, idx: qz.idx, total: qz.items.length, paused: qz.paused,
        leftMs: qz.paused ? qz.leftMs : Math.max(0, qz.deadline - Date.now()), perMs: QUIZ_MS,
      };
    }
    return out;
  },
};
