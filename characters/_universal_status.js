// ============================================================
//  บัฟ & ดีบัฟพื้นฐาน (universal) — ระบบสถานะที่ตัวละครไหนก็ใช้ร่วมกันได้
//  ไฟล์นี้ไม่ใช่ "ตัวละคร" (จึงไม่มี id/ไม่ถูกลงทะเบียนใน CHAR_HOOKS) — เป็น pure function
//  ล้วนๆ รับ player object เป็นพารามิเตอร์ตรงๆ ไม่ผูกกับ server.js/engine เลย
//  server.js require() ไฟล์นี้โดยตรง และ expose ทุกตัวผ่าน engine ให้ characters/*.js เรียกใช้ได้
//
//  บัฟ:   spellflow (กระแสเวท: ใช้สกิลเสียพลังงานลดลง N) / might (เสริมพลัง: ดาเมจที่ทำได้ +N)
//         guard (คุ้มครอง: ดาเมจที่ได้รับ -N) / resist (ต้านสถานะผิดปกติ: ล้าง+ต้านดีบัฟพื้นฐาน)
//         fortune (โชคลาภ: จั่วได้ไพ่ที่ดีที่สุด — ซ้อน 3)
//  ดีบัฟ: spellburden (ภาระเวท: ใช้สกิลเสียพลังงานเพิ่ม N ไม่เกิน 2 — ซ้อนได้สูงสุด 2) / weak (อ่อนแอ: ดาเมจที่ทำได้ -N)
//         fragile (เปราะบาง: ดาเมจที่ได้รับ +N) / sleep (หลับใหล) / stun (สตั้น)
//         nodraw (ห้ามจั่ว) / noskill (ห้ามใช้สกิล) / nohealing (ไร้ทางเยียวยา: ฟื้นเลือดจริงไม่ได้)
//         invert (ผกผัน: กลับด้านบัฟ/การฟื้นฟูทั้งหมด) / hburn (ลุกไหม้: ดาเมจ 1/เทิร์น สะสมได้ — ดู tickBurn)
//         hbleed (เลือดไหล: ดาเมจ 1/เทิร์น สะสมได้ เหมือนลุกไหม้ + ทำให้การฟื้นพลังชีวิตเหลือครึ่ง — ดู tickBleed/bleedHealPenalty)
//         chaa (สภาพชา: กดจั่วการ์ด 1 ครั้ง ได้ไพ่ 2 ใบ — จุดทำงานจริงอยู่ใน hit() ของ server.js)
//         curse (คำสาป: กดสกิลเมื่อไหร่เสียพลังชีวิต 1 หน่วย — 1 ครั้ง/เทิร์น ไม่กดสกิลก็หมดอายุไปเอง — ดู applyCurse/tickCurseOnSkill)
//  บัฟ (ต่อ): netramana (เนตรมณะ: โจมตีปกติมีโอกาสสังหารทันที NETRAMANA_KILL_CHANCE — ดู netramanaActive)
//  จำนวน (amount) ของสถานะเก็บแยกใน p.statusAmt[key] — p.statuses[key] เก็บจำนวนเทิร์น/ครั้งตามเดิม
//
//  evade (หลบหลีก) เป็นกรณีพิเศษ ไม่ผ่าน applyBuff/statusAmtOf แบบตัวอื่น: แต่ละสแตคมีอายุของตัวเอง
//  EVADE_STACK_TURNS เทิร์น หมดอายุแยกจากกัน (ไม่ต่ออายุกันเองเมื่อได้สแตคใหม่) ซ้อนพร้อมกันได้สูงสุด
//  EVADE_STACK_MAX สแตค — เก็บจริงใน p.evadeStacks (array ของจำนวนเทิร์นที่เหลือต่อสแตค) ส่วน
//  p.statuses.evade เป็นแค่ mirror ของ p.evadeStacks.length ไว้ให้โค้ดอื่นอ่านจำนวนสแตคได้แบบเดิม
//  ใช้ grantEvadeStack/consumeEvadeStack/tickEvadeStacks จัดการ ห้ามแก้ p.statuses.evade ตรงๆ
// ============================================================

const SPELLBURDEN_MAX = 2; // ภาระเวท: ซ้อนทับได้สูงสุด 2 (เพิ่มค่าใช้พลังงานได้ไม่เกิน 2 หน่วย)

function statusAmtOf(p, key) {
  if (!p || ((p.statuses && p.statuses[key]) || 0) <= 0) return 0;
  return Math.max(0, (p.statusAmt && p.statusAmt[key]) || 0);
}

// ---------- ทะเบียนบัฟ (patch 4.5) ----------
//  เกมมีรายการ DEBUFF_KEYS มานานแล้ว แต่ไม่เคยมีฝั่งบัฟ — Rider Slash ของซึรุงิต้องการ
//  จึงทำขึ้นที่นี่ให้เป็นของกลาง ไม่ใช่ของตัวละครคนเดียว
//  เก็บเฉพาะ "บัฟกลาง" ที่ใครก็ได้รับ — ไม่นับร่างแปลง/ฟอร์มประจำตัว (escanor*/trigger*/kotone*)
//  เพราะพวกนั้นคือตัวตนของร่าง ไม่ใช่ของแถมที่ปาดทิ้งได้
const BUFF_KEYS = [
  "resist",    // ต้านสถานะผิดปกติ
  "guard",     // คุ้มครอง
  "fortune",   // โชคลาภ
  "mend",      // เยียวยา
  "might",     // เสริมพลัง (พลังโจมตี +N)
  "empower",   // เสริมพลัง
  "evade",     // หลบหลีก
  "spellflow", // กระแสเวท (ค่าสกิลถูกลง)
  "freecast",  // การ์ดราชินี
  "absorb",    // Absorb
  "awaken",    // ตื่นขึ้น
  "golden",    // 777 (เวลาทอง)
  "accurate",  // แม่นยำ (โทโนะ ชิกิ): เจาะการหลบหลีกทุกแบบ
  "promo", "chill", "fiber", "tiger", // ของส่งมอบของ Apple guy
];
const BUFF_LABEL = {
  resist: "ต้านสถานะผิดปกติ", guard: "คุ้มครอง", fortune: "โชคลาภ", mend: "เยียวยา",
  might: "เสริมพลัง", empower: "เสริมพลัง", evade: "หลบหลีก", spellflow: "กระแสเวท",
  freecast: "การ์ดราชินี", absorb: "Absorb",
  awaken: "ตื่นขึ้น", golden: "777", accurate: "แม่นยำ", promo: "เปิดแต้ม", chill: "ชิวๆ", fiber: "เน็ตแรง", tiger: "เสือนอนกิน",
};
// ตัวนับลำดับ — เดินหน้าอย่างเดียวทั้งเกม จึงเทียบข้ามผู้เล่นได้
let buffSeq = 0;

// ปาด "บัฟล่าสุด" ทิ้งหนึ่งตัว — คืน { key, label } หรือ null ถ้าไม่มีบัฟเลย
//  ลำดับตัดสิน: ตราเวลามากสุดก่อน -> เทิร์นเหลือมากสุด -> ชื่อคีย์ (กันผลสุ่มระหว่างเทสต์)
//  บัฟที่ตัวละครเขียน p.statuses ตรงๆ จะไม่มีตราเวลา ถือเป็น "เก่ากว่า" ตัวที่ผ่าน applyBuff เสมอ
function stripLatestBuff(p) {
  if (!p || !p.statuses) return null;
  let best = null;
  for (const k of BUFF_KEYS) {
    const turns = p.statuses[k] || 0;
    if (!(turns > 0)) continue;
    const at = (p.statusAt && p.statusAt[k]) || 0;
    if (!best || at > best.at
      || (at === best.at && (turns > best.turns || (turns === best.turns && k < best.key)))) {
      best = { key: k, at, turns };
    }
  }
  if (!best) return null;
  delete p.statuses[best.key];
  if (p.statusAmt) delete p.statusAmt[best.key];
  if (p.statusAt) delete p.statusAt[best.key];
  if (best.key === "evade") p.evadeStacks = []; // หลบหลีก: p.statuses.evade เป็นแค่เงาของ evadeStacks
  return { key: best.key, label: BUFF_LABEL[best.key] || best.key };
}

function applyBuff(p, key, amount, turns) {
  //  ประทับลำดับไว้เฉพาะบัฟ — Rider Slash ต้องรู้ว่าเป้าหมายเพิ่งได้บัฟไหนมาล่าสุด
  if (BUFF_KEYS.includes(key)) {
    p.statusAt = p.statusAt || {};
    p.statusAt[key] = ++buffSeq;
  }
  p.statuses[key] = Math.max(p.statuses[key] || 0, turns || 1);
  if (amount != null) {
    p.statusAmt = p.statusAmt || {};
    p.statusAmt[key] = Math.max(p.statusAmt[key] || 0, amount);
  }
}

// ต้านสถานะผิดปกติ: จาก Sanctuary Hymn หรือสถานะ resist อื่นๆ ที่ตัวละครใดก็ตั้งได้
function resistActive(p) {
  if (!p) return false;
  return ((p.statuses && p.statuses.resist) || 0) > 0;
}

// ดีบัฟพื้นฐาน: ติดไม่เข้าถ้าเป้าหมายมี "ต้านสถานะผิดปกติ" — คืน false = โดนต้าน
function applyDebuff(p, key, amount, turns) {
  if (resistActive(p)) return false;
  applyBuff(p, key, amount, turns);
  return true;
}

// ตั้งเวลาสถานะแบบ "ไม่ต่ออายุ" (no-refresh): ถ้าสถานะยังติดอยู่ เวลาที่เหลือเดินต่อจากเดิม
//  ไม่รีเซ็ตกลับไปเต็ม — ตั้งเวลาให้เฉพาะตอนที่สถานะยังไม่ติดเท่านั้น
//  (low-level: ไม่เช็ค resist ให้ ผู้เรียกต้องเช็คเอง หรือใช้ตัวห่อด้านล่าง)
function setTurnsNoRefresh(p, key, turns) {
  if (!((p.statuses[key] || 0) > 0)) p.statuses[key] = turns || 1;
  return p.statuses[key];
}

// ภาระเวท (spellburden) — จุดเดียวที่ทุกตัวละครต้องใช้ใส่สถานะนี้ ห้ามเขียน p.statuses.spellburden ตรงๆ
//  กฎกลาง: จำนวนสะสม +1 ต่อครั้ง เพดาน SPELLBURDEN_MAX · ใช้ซ้ำใส่คนเดิมขณะยังติดอยู่ = "ไม่ต่ออายุ"
//  turns = จำนวนเทิร์นของแหล่งที่มา (แต่ละสกิลกำหนดเอง) ใช้เฉพาะตอนที่ยังไม่ติดสถานะ
//  คืน false = โดน "ต้านสถานะผิดปกติ" กันไว้ (ไม่ติดอะไรเลย)
function applySpellburden(p, turns) {
  if (resistActive(p)) return false;
  setTurnsNoRefresh(p, "spellburden", turns);
  p.statusAmt = p.statusAmt || {};
  p.statusAmt.spellburden = Math.min(SPELLBURDEN_MAX, (p.statusAmt.spellburden || 0) + 1);
  return true;
}

// "เย็นชื่นใจ" (escanorCool — WineBarrel ของเอสคานอร์): ลดความเสียหายที่ไม่ใช่การโจมตีปกติตามจำนวนสแตค
//  เป็นสถานะ Universal เพราะ WineBarrel ถูกขโมยไปใช้ได้ ตัวละครไหนดื่มก็ต้องได้ผลเหมือนกัน
//  ไม่กินดาเมจจากสถานะ/ดีบัฟ (p._statusDamage เช่น ลุกไหม้) — ลดเฉพาะดาเมจจากสกิล
function coolReduction(p, isNormalAttack) {
  if (!p || isNormalAttack || p._statusDamage) return 0;
  if (!(((p.statuses && p.statuses.escanorCool) || 0) > 0)) return 0;
  return statusAmtOf(p, "escanorCool") || 1;
}

// ดีบัฟพื้นฐานที่ "ต้านสถานะผิดปกติ" ล้างออกได้ทั้งหมด
//  — และเป็นรายการเดียวกับที่ Prayer (ผู้วิงวอน) ไล่ล้างทีละขั้นผ่าน cleanseOneStep()
//  ดีบัฟที่จงใจ "ล้างไม่ได้" จึงต้องไม่อยู่ในนี้: Calamity (ซาโตรุ) · Delete (ยูนะ) ·
//  ลงทัณฑ์/ลูกแกะน้อยรู้แจ้ง (ผู้วิงวอนเอง) · มาร์กถาวรของไค ชิซากิ
const BASIC_DEBUFF_CLEAR = ["discord", "sleep", "stun", "nodraw", "noskill", "weak", "fragile", "spellburden", "oblada", "hburn", "hbleed", "phenexBanUlt", "nanayaSeal", "miyakoSeal", "invert", "nohealing", "manaSeal", "chaa", "blind",
  // ผู้สังหารเมจ: ตราล่าเวท/ดูดซับเวท ถูกลบล้างได้ด้วย "ต้านทานสถานะผิดปกติ"
  //  (mageslayerMarkedId ฝั่งผู้ร่ายถูก reconcile ให้เองที่ tickWitchMark ท้ายเทิร์น — ดู characters/mageslayer.js)
  "mageslayerMark", "manaLeech",
  "poison",       // พิษร้าย (โซ ยากุรุมะ): ดีบัฟเต็มตัว ล้าง/ต้านได้ตามปกติ
  // คอนเนอร์ RK800: "ผู้ต้องหา" เป็นเครื่องหมายล้วนๆ (ทำให้คอนเนอร์ตีแรงขึ้น +2) ต้านสถานะผิดปกติล้างได้
  "accused",
  // patch 3.4.6: ดีบัฟที่ตกหล่นจากรายการเดิม — เดิมล้าง/ต้านไม่ได้ทั้งที่เป็นดีบัฟเต็มตัว
  "decay",        // ผุพัง: เกราะฟื้นไม่ได้
  "stagger",      // ชะงัก: ฟื้นแต้มสกิลไม่ได้ทุกช่องทาง
  "doomDrain",    // [โดนดูด] (Plasma Rifle): ดาเมจ 1/เทิร์น เจาะเกราะ
  "manaRupture",  // ระเบิดมานา: หมดเวลาแล้วระเบิดตามพลังงานที่บันทึกไว้
  "drunk",        // มึนเมา: สุ่มติดห้ามจั่ว/ห้ามสกิล/สตั้นเมื่อกดสกิลหรือจั่วไพ่
  "promo",        // เปิดแต้ม: แต้มการ์ดถูกเปิดให้ทุกคนเห็น
  "energy",       // เครื่องดื่มชูกำลัง: เสียพลัง 1 หน่วยต่อเทิร์น
  "harukaPunish", // จงไปสู่สุขติ (ฮารุกะ): เป้าหมายที่เลือดไหล >= 3 โดนระเบิดเลือดไหลใส่
  "numb"];        // เหน็บชา (Bamboo-Hatted Kim): กดสกิลมีโอกาส 30% ไม่ทำงาน
// ดีบัฟที่ยังไม่เกิดผลทันที (ยามฟ้าสาง / เส้นชีวิต): โดนล้าง = ลดลงทีละ 1 หน่วย ไม่หายทั้งหมด
const SOFT_DEBUFF_STEP = ["deathline", "curse", "shock"];

function cleanseDebuffs(p) {
  let purged = 0;
  for (const k of BASIC_DEBUFF_CLEAR) {
    if ((p.statuses[k] || 0) > 0) {
      delete p.statuses[k];
      if (p.statusAmt) delete p.statusAmt[k];
      if (k === "mageslayerMark") delete p.mageslayerMarks; // ผู้สังหารเมจ: ล้าง map ผู้ร่ายที่ผูกกับตราด้วย
      purged++;
    }
  }
  for (const k of SOFT_DEBUFF_STEP) {
    if ((p.statuses[k] || 0) > 0) {
      p.statuses[k]--;
      if (p.statuses[k] <= 0) delete p.statuses[k];
      purged++;
    }
  }
  return purged;
}

// ---------- "พิษร้าย" (poison, สถานะ Universal patch 4.3) ----------
//  ดีบัฟสองทางพร้อมกัน: ต้นเทิร์นเสียพลังชีวิต 1 (ลดเกราะก่อน) และตลอดเวลาที่ติดอยู่
//  พลังโจมตีที่ทำได้ -1 (อ่านที่ computeAttackBase คู่กับ "อ่อนแอ")
//  ต่างจากลุกไหม้/เลือดไหลตรงที่เก็บเป็น "จำนวนเทิร์น" ไม่ใช่สแตค จึงลดเทิร์นเองตามลูปกลางของ endTurn
function applyPoison(p, turns) {
  if (resistActive(p)) return false;  // ต้านสถานะผิดปกติกันได้
  applyBuff(p, "poison", null, turns);
  return true;
}

// พลังโจมตีที่หายไปจากพิษ (อ่านที่ computeAttackBase คู่กับ "อ่อนแอ")
function poisonAtkPenalty(p) {
  return (((p && p.statuses && p.statuses.poison) || 0) > 0) ? 1 : 0;
}

// ติกต้นเทิร์น — ท่อตายชุดเดียวกับลุกไหม้/เลือดไหล
function tickPoison(engine, p) {
  if (!p || !p.alive || !(((p.statuses && p.statuses.poison) || 0) > 0)) return 0;
  p._statusDamage = true;   // ดาเมจจากสถานะ ไม่ใช่จากสกิล/การโจมตี
  engine.dealMixed(p, 1);   // ลดเกราะก่อน หมดเกราะจึงเข้าเลือดจริง
  p._statusDamage = false;
  engine.log(`🧪 ${p.name} พิษร้ายออกฤทธิ์ — เสียหาย -1 (ลดเกราะก่อน) และพลังโจมตี -1 (เหลืออีก ${p.statuses.poison} เทิร์น)`);
  engine.maybeBeatSave(p);
  engine.maybeBeatMode(p);
  engine.maybeWakeKotone(p);
  if (p.alive && p.hp <= 0) {
    engine.instantDeath(p);
    if (!p.alive) engine.log(`💀 ${p.name} พิษร้ายกัดกินจนเลือดหมด ตกรอบ!`);
  }
  return 1;
}

// ---------- "ช็อต" (shock, สถานะ Universal patch 4.4) ----------
//  ดีบัฟแบบพิเศษ: ตัวมันเองไม่ทำอะไร แต่ทุกต้นเทิร์นที่มันยังติดอยู่ จะโรลใหม่ว่าปีนี้ไฟจะกำเริบหรือไม่
//  จุดที่ต่างจากดีบัฟทั่วไป: ผลของมันเกิด "ทีหลัง" ได้ ดังนั้นเป้าหมายที่เพิ่งได้
//  "ต้านสถานะผิดปกติ" หลังติดช็อตไปแล้ว ยังกันสตั้นได้กลางทาง — การเช็ค resist จึงอยู่ที่จังหวะโรล ไม่ใช่ตอนแปะ
//  อยู่ใน SOFT_DEBUFF_STEP: โดนล้างสถานะ = ลดทีละ 1 เทิร์น ไม่หายทั้งก้อน
const SHOCK_STUN_CHANCE = 15; // % ต่อเทิร์น
const SHOCK_STUN_TURNS = 1;   // โรลติดแล้วสตั้นกี่เทิร์น

function applyShock(p, turns) {
  if (resistActive(p)) return false;
  applyBuff(p, "shock", null, turns);
  return true;
}

// ต้นเทิร์น — ต้องเรียก "ก่อน" บล็อกเช็คสตั้นของ startRound() ไม่งั้นสตั้นจะเลื่อนไปมีผลเทิร์นถัดไป
//  (แพทเทิร์นเดียวกับ ippo.applyPendingStun)
function tickShock(engine, p) {
  if (!p || !p.alive || !(((p.statuses && p.statuses.shock) || 0) > 0)) return false;
  if (Math.random() * 100 >= SHOCK_STUN_CHANCE) return false;
  if (!applyDebuff(p, "stun", null, SHOCK_STUN_TURNS)) {
    engine.log(`⚡ ${p.name} กระแสไฟกำเริบ แต่ "ต้านสถานะผิดปกติ" กันสตั้นไว้ทัน`);
    return false;
  }
  engine.log(`⚡ ${p.name} ไฟฟ้าช็อตกำเริบ (${SHOCK_STUN_CHANCE}%) — ติดสตั้น ${SHOCK_STUN_TURNS} เทิร์น! (ช็อตเหลืออีก ${p.statuses.shock} เทิร์น)`);
  return true;
}

// ---------- "คำสาป" (curse, สถานะ Universal patch 4.2) ----------
//  ดีบัฟที่เอาคืนไม่ได้ด้วยการอยู่เฉยๆ: กดสกิลเมื่อไหร่เสียพลังชีวิต 1 หน่วย (ลดเกราะก่อน ถึงตายได้)
//  แต่ถ้าอดใจไม่กดสกิลเลย มันก็หมดอายุไปเองตามจำนวนเทิร์น — เป็นการบีบให้เลือก ไม่ใช่ดาเมจตายตัว
//  p.statuses.curse = จำนวนเทิร์นที่เหลือ (ลดเองทุกจบเทิร์นตามลูปกลาง)
//  อยู่ใน SOFT_DEBUFF_STEP: โดนล้างสถานะ = ลดทีละ 1 เทิร์น ไม่หายทั้งก้อน (เหมือนเส้นชีวิต)
function applyCurse(p, turns) {
  if (resistActive(p)) return false;  // ต้านสถานะผิดปกติกันได้
  applyBuff(p, "curse", null, turns);
  return true;
}

// เรียกจาก useSkill() ของ server.js — หลังหักแต้มสกิลสำเร็จแล้ว
//  1 ครั้ง/เทิร์น: ตัวละครที่กดสกิลได้หลายช่องต่อเทิร์น (ไบเลธ/ไค/ผู้วิงวอน) จะเสียเลือดแค่หน่วยเดียว
function tickCurseOnSkill(engine, p) {
  if (!p || !p.alive || !(((p.statuses && p.statuses.curse) || 0) > 0)) return false;
  if (p.curseHitRound === engine.roundNumber) return false; // เทิร์นนี้กินไปแล้ว
  p.curseHitRound = engine.roundNumber;
  p._statusDamage = true;  // ดาเมจจากสถานะ ไม่ใช่จากสกิล/การโจมตี (แพทเทิร์นเดียวกับ tickBurn)
  engine.dealMixed(p, 1); // ไม่ทะลุเกราะ — ลดเกราะก่อน หมดเกราะจึงเข้าเลือดจริง
  engine.log(`🕸️ ${p.name} ต้องคำสาป — การใช้สกิลดึงเอาพลังชีวิตไป -1 (เหลืออีก ${p.statuses.curse} เทิร์น)`);
  p._statusDamage = false;
  // คำสาปฆ่าได้ — ท่อตายชุดเดียวกับลุกไหม้/เลือดไหล
  engine.maybeBeatSave(p);
  engine.maybeBeatMode(p);
  engine.maybeWakeKotone(p);
  if (p.alive && p.hp <= 0) {
    engine.instantDeath(p);
    if (!p.alive) engine.log(`💀 ${p.name} ต้องคำสาปจนเลือดหมด ตกรอบ!`);
  }
  return true;
}

// ---------- "เยียวยา" (mend, สถานะ Universal patch 3.4) ----------
//  บัฟฟื้นฟูต่อเนื่อง: ต้นเทิร์นฟื้นพลังชีวิตเท่ากับจำนวนหน่วยที่ระบุ (1 หน่วย = 1 พลังชีวิต)
//  "ซ้อนทับจำนวนเทิร์นได้ สูงสุด 5 เทิร์น" — ใส่ซ้ำคือ "บวกเทิร์นเข้าไป" (ไม่ใช่รีเฟรช) เพดาน MEND_MAX_TURNS
//  ส่วนจำนวนหน่วยไม่สะสม ใช้ค่ามากสุดที่เคยได้รับ (แพทเทิร์นเดียวกับ applyBuff ของสถานะ amount อื่น)
//  ตัวละครไหนก็ให้/ติดได้ — ผู้วิงวอน (Prayer) และอรชุน (ตะเกียงไฟที่ดับมอด) เป็นสองเจ้าแรกที่ใช้
const MEND_MAX_TURNS = 5;

function applyMend(p, amount, turns) {
  if (!p) return 0;
  const before = p.statuses.mend || 0;
  p.statuses.mend = Math.min(MEND_MAX_TURNS, before + Math.max(1, turns || 1));
  p.statusAmt = p.statusAmt || {};
  p.statusAmt.mend = Math.max(p.statusAmt.mend || 0, Math.max(1, amount || 1));
  return p.statuses.mend - before;
}

// ติกต้นเทิร์นของ "เยียวยา" — ฟื้นพลังชีวิตตามจำนวนหน่วย (การลดเทิร์นทำที่ลูปกลางของ endTurn ตามปกติ)
//  ใช้ engine.healHp จึงเคารพ "ไร้ทางเยียวยา"/"ผกผัน"/เลือดไหล ครบเหมือนการฟื้นเลือดช่องทางอื่น
function tickMend(engine, p) {
  if (!p || !p.alive || !(((p.statuses && p.statuses.mend) || 0) > 0)) return 0;
  const amt = statusAmtOf(p, "mend") || 1;
  const got = engine.healHp(p, amt);
  if (got > 0) engine.log(`💚 ${p.name} เยียวยา — ฟื้นพลังชีวิต +${got} (เหลืออีก ${p.statuses.mend} เทิร์น)`);
  return got;
}

// "ตาบอด" (blind, สถานะ Universal patch 3.4): มองไม่เห็นอะไรเลยทั้งเทิร์น — ไพ่ แต้ม พลังงาน พลังชีวิต ของทุกคนรวมทั้งของตัวเอง
//  ตัวสถานะเป็นดีบัฟพื้นฐานธรรมดา (ต้าน/ล้างได้) — จุดทำงานจริงอยู่ที่ buildStateFor() ของ server.js
function blindActive(p) {
  return !!p && ((p.statuses && p.statuses.blind) || 0) > 0;
}

// ล้างดีบัฟ "ทีละ 1 ขั้น" (patch 3.4.5) — ลดตัวนับของดีบัฟตัวแรกที่เจอลง 1 ไม่ใช่ลบทั้งสถานะทิ้ง
//  ตัวอย่างตามสเปค: "เลือดไหล 6" -> "เลือดไหล 5" · "ภาระเวท 5 เทิร์น" -> "ภาระเวท 4 เทิร์น"
//  ตัวนับใน p.statuses คือ "เทิร์นที่เหลือ" หรือ "จำนวนสแตค" แล้วแต่สถานะ — ลด 1 หมายถึงลดหน่วยนั้น
//  สถานะที่เหลือ 1 อยู่แล้วจะหายไปเลย (1 - 1 = 0) ซึ่งเป็นพฤติกรรมที่ถูกต้องทั้งสองความหมาย
//  คู่กับ cleanseDebuffs() ที่ล้างทีเดียวทั้งหมด · คืนจำนวนขั้นที่ล้างได้จริง (0 หรือ 1)
function cleanseOneStep(p) {
  if (!p || !p.statuses) return 0;
  for (const k of BASIC_DEBUFF_CLEAR.concat(SOFT_DEBUFF_STEP)) {
    if (!((p.statuses[k] || 0) > 0)) continue;
    p.statuses[k]--;
    if (p.statuses[k] <= 0) {
      delete p.statuses[k];
      if (p.statusAmt) delete p.statusAmt[k];
      if (k === "mageslayerMark") delete p.mageslayerMarks; // ผู้สังหารเมจ: ล้าง map ผู้ร่ายที่ผูกกับตราด้วย
    }
    return 1;
  }
  return 0;
}

// "ไร้ทางเยียวยา" (สถานะ Universal): ฟื้นเลือดจริงไม่ได้
function noHealActive(p) {
  return !!p && ((p.statuses && p.statuses.nohealing) || 0) > 0;
}

// "ผกผัน" (สถานะ Universal patch 2.2.1): กลับด้านบัฟ/การฟื้นฟูทั้งหมด (ฟื้นเลือด/เกราะ -> เสียแทน, เพิ่มพลังโจมตี -> ลดแทน)
function invertActive(p) {
  return !!p && ((p.statuses && p.statuses.invert) || 0) > 0;
}

// "ลุกไหม้" (hburn, สถานะ Universal): ทำดาเมจ 1 หน่วยทุกต้นเทิร์น (ลดเกราะก่อน) แล้วลดจำนวนลง 1 — ตัวละครไหนก็ติด/ให้ติดได้
//  ⚠️ ฟังก์ชันนี้ต่างจากตัวอื่นในไฟล์นี้ตรงที่ต้องใช้ engine (ไม่ pure) เพราะต้องเรียก dealMixed/healHp/log ฯลฯ
//  ถ้าตัวละครเจ้าของสถานะ implement hburnHeals(p)/hburnLabel(p) ในไฟล์ตัวเอง (ดู characters/hikaru.js,
//  characters/phenex.js) จะฮีลแทนรับดาเมจได้ตามเงื่อนไขของตัวเอง — ค่าเริ่มต้นถ้าไม่ implement คือรับดาเมจตรงๆ
//  ตัวละครใหม่ในอนาคตที่อยากให้ลุกไหม้ทำงานพิเศษ แค่เพิ่ม 2 เมธอดนี้ในไฟล์ตัวเอง ไม่ต้องแก้ไฟล์นี้เลย
function tickBurn(engine, p) {
  if (!p || !p.alive || !(((p.statuses && p.statuses.hburn) || 0) > 0)) return;
  const hooks = engine.CHAR_HOOKS && engine.CHAR_HOOKS[p.characterId];
  const immune = !!(hooks && hooks.hburnImmune && hooks.hburnImmune(p));
  const heals = !!(hooks && hooks.hburnHeals && hooks.hburnHeals(p));
  const label = (hooks && hooks.hburnLabel && hooks.hburnLabel(p)) || "ลุกไหม้";
  if (immune) {
    engine.log(`🔥 ${p.name} ${label} — ไม่รับความเสียหาย (เหลืออีก ${p.statuses.hburn - 1} หน่วย)`);
  } else if (heals) {
    const heal = engine.healHp(p, 1);
    engine.log(`❤️‍🔥 ${p.name} ${label} — ลุกไหม้กลายเป็นการรักษา ฟื้นพลังชีวิต +${heal} (เหลืออีก ${p.statuses.hburn - 1} หน่วย)`);
  } else {
    // _statusDamage: บอกฮุคของตัวละครว่าก้อนนี้เป็น "ดาเมจจากสถานะ/ดีบัฟ" ไม่ใช่ดาเมจจากสกิลหรือการโจมตี
    //  (เอสคานอร์ใช้แยกว่าจะหัก Sun Charge ของร่าง Noon ไหม — ดู characters/escanor.js)
    p._statusDamage = true;
    engine.dealMixed(p, 1); // ลุกไหม้: ลดเกราะก่อน ถ้าไม่มีเกราะจึงเข้าเลือดจริง
    p._statusDamage = false;
    engine.log(`🔥 ${p.name} ลุกไหม้ — เสียหาย -1 (ลดเกราะก่อน) (เหลืออีก ${p.statuses.hburn - 1} หน่วย)`);
    engine.maybeBeatSave(p);
    engine.maybeBeatMode(p);
   
    engine.maybeWakeKotone(p);
    if (p.alive && p.hp <= 0) {
      engine.instantDeath(p);
      if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
  }
  p.statuses.hburn = Math.max(0, p.statuses.hburn - 1);
  if (p.statuses.hburn <= 0) delete p.statuses.hburn;
}

// ---------- "เลือดไหล" (hbleed, สถานะ Universal patch 2.5) ----------
//  กลไกหลักเหมือน "ลุกไหม้" ทุกอย่าง: ทำดาเมจ 1 หน่วยทุกต้นเทิร์น (ลดเกราะก่อน) แล้วลดจำนวนลง 1
//  สะสมได้สูงสุด HBLEED_MAX · ต้านได้ด้วย "ต้านสถานะผิดปกติ" (อยู่ใน BASIC_DEBUFF_CLEAR) · ตัวละครไหนก็ติด/ให้ติดได้
//  ต่างจากลุกไหม้ตรงผลข้างเคียง: ระหว่างที่ยังเลือดไหลอยู่ "การฟื้นพลังชีวิตเหลือครึ่งเดียว"
//  (ยกเว้นการฟื้นทีละ 1 หน่วย ซึ่งไม่ถูกลด — ไม่งั้นการฟื้นรายเทิร์นของหลายตัวละครจะกลายเป็น 0 ไปเลย)
//  ฮุคเฉพาะตัวละครแบบเดียวกับลุกไหม้: hbleedImmune(p) / hbleedHeals(p) / hbleedLabel(p) / hbleedHarmless(p)
//   — hbleedHarmless คุมเฉพาะ "ผลข้างเคียงลดการฟื้นเลือด" (ฮารุกะไม่โดน) แยกจาก hbleedHeals ที่คุมจังหวะติก
const HBLEED_MAX = 6;

function bleedActive(p) {
  return !!p && ((p.statuses && p.statuses.hbleed) || 0) > 0;
}

// ใส่ "เลือดไหล" n หน่วย (เพดาน HBLEED_MAX) — คืนจำนวนที่ติดเพิ่มจริง, 0 = โดนต้านสถานะกันไว้/เต็มเพดานแล้ว
function applyBleed(p, n) {
  if (!p || !(n > 0)) return 0;
  if (resistActive(p)) return 0;
  const before = (p.statuses.hbleed || 0);
  p.statuses.hbleed = Math.min(HBLEED_MAX, before + n);
  return p.statuses.hbleed - before;
}

// จำนวนที่ฟื้นพลังชีวิตได้จริงหลังโดน "เลือดไหล" หักครึ่ง — ผู้เรียกคือ healHp() ใน server.js
//  amount <= 1 ไม่ลด · ปัดลง แต่ไม่ต่ำกว่า 1 (ฟื้น 2-3 -> 1)
function bleedHealPenalty(engine, p, amount) {
  if (!bleedActive(p) || amount <= 1) return amount;
  const hooks = engine && engine.CHAR_HOOKS && engine.CHAR_HOOKS[p.characterId];
  if (hooks && hooks.hbleedHarmless && hooks.hbleedHarmless(p)) return amount;
  return Math.max(1, Math.floor(amount / 2));
}

// ติกต้นเทิร์นของ "เลือดไหล" — โครงเดียวกับ tickBurn ทุกประการ (ดูคอมเมนต์ด้านบนของ tickBurn)
function tickBleed(engine, p) {
  if (!p || !p.alive || !bleedActive(p)) return;
  const hooks = engine.CHAR_HOOKS && engine.CHAR_HOOKS[p.characterId];
  const immune = !!(hooks && hooks.hbleedImmune && hooks.hbleedImmune(p));
  const heals = !!(hooks && hooks.hbleedHeals && hooks.hbleedHeals(p));
  const label = (hooks && hooks.hbleedLabel && hooks.hbleedLabel(p)) || "เลือดไหล";
  if (immune) {
    engine.log(`🩸 ${p.name} ${label} — ไม่รับความเสียหาย (เหลืออีก ${p.statuses.hbleed - 1} หน่วย)`);
  } else if (heals) {
    // ฮารุกะ (สกิลติดตัว อมาซอน): เลือดไหลไม่ทำร้ายเธอ กลับกลายเป็นการฟื้นพลังชีวิตแทน
    const heal = engine.healHp(p, 1);
    engine.log(`❤️‍🩹 ${p.name} ${label} — เลือดไหลกลายเป็นการฟื้นฟู ฟื้นพลังชีวิต +${heal} (เหลืออีก ${p.statuses.hbleed - 1} หน่วย)`);
  } else {
    p._statusDamage = true;   // ดาเมจจากสถานะ ไม่ใช่จากสกิล/การโจมตี (ดูคอมเมนต์ใน tickBurn)
    engine.dealMixed(p, 1);   // เลือดไหล: ลดเกราะก่อน ถ้าไม่มีเกราะจึงเข้าเลือดจริง
    p._statusDamage = false;
    engine.log(`🩸 ${p.name} เลือดไหล — เสียหาย -1 (ลดเกราะก่อน) (เหลืออีก ${p.statuses.hbleed - 1} หน่วย)`);
    engine.maybeBeatSave(p);
    engine.maybeBeatMode(p);
   
    engine.maybeWakeKotone(p);
    if (p.alive && p.hp <= 0) {
      engine.instantDeath(p);
      if (!p.alive) engine.log(`💀 ${p.name} เลือดจริงหมด ตกรอบ!`);
    }
  }
  p.statuses.hbleed = Math.max(0, p.statuses.hbleed - 1);
  if (p.statuses.hbleed <= 0) delete p.statuses.hbleed;
}

// "แม่นยำ" (accurate, บัฟ Universal — โทโนะ ชิกิ มองเห็นแล้ว!!): การโจมตี/ดาเมจของผู้ติดบัฟนี้เจาะการหลบหลีกทุกแบบ
//  (สถานะหลบหลีก · อิปโป · เอจิ · Zect · luminous · Mark 5 · ชิวๆ ฯลฯ) — โล่กันครั้งไม่ใช่การหลบ จึงยังกันได้
function accurateActive(p) {
  return !!p && ((p.statuses && p.statuses.accurate) || 0) > 0;
}

// "เหน็บชา" (numb, สถานะ Universal — Bamboo-Hatted Kim): กดสกิลแล้วมีโอกาส NUMB_FAIL_CHANCE ที่สกิลไม่ทำงาน
//  แต้มสกิลยังถูกหักตามเดิม — จุดโรลจริงอยู่ใน useSkillCore() ของ server.js ถัดจากจุดหักแต้ม
//  ดีบัฟพื้นฐานธรรมดา: ลดเทิร์นตามลูปกลาง · ต้าน/ล้างได้ (อยู่ใน BASIC_DEBUFF_CLEAR)
const NUMB_FAIL_CHANCE = 0.30;
function numbFizzles(p) {
  return !!p && ((p.statuses && p.statuses.numb) || 0) > 0 && Math.random() < NUMB_FAIL_CHANCE;
}

// "เนตรมณะ" (netramana, สถานะ Universal patch 2.2.7 — เจ้าหญิงราก "ทุกอย่างจะต้องราบรื่น"):
//  ผู้ที่ติดบัฟนี้ โจมตีปกติแล้วมีโอกาสสังหารเป้าหมายทันที 20% — ตัวละครไหนก็ติด/ให้ติดได้
//  จุดโรลจริงอยู่ใน doAttack() ของ server.js (ต้องใช้ cutscene/lastAttack/เฟสโจมตี จึงเป็น pure predicate ที่นี่)
const NETRAMANA_KILL_CHANCE = 0.20;
function netramanaActive(p) {
  return !!p && ((p.statuses && p.statuses.netramana) || 0) > 0;
}

const EVADE_STACK_MAX = 3;   // หลบหลีก: สะสมสแตคพร้อมกันได้สูงสุด 3
const EVADE_STACK_TURNS = 2; // หลบหลีก: แต่ละสแตคมีอายุของตัวเอง 2 เทิร์น แล้วหมดไปเอง (ไม่เกี่ยวกับสแตคอื่น ไม่ต่ออายุกันเอง)

// ให้สแตคหลบหลีกใหม่ 1 สแตค (อายุ EVADE_STACK_TURNS เทิร์นของตัวเอง) — ไม่เกิน EVADE_STACK_MAX สแตคพร้อมกัน
// คืน true ถ้าให้สำเร็จ, false ถ้าเต็มเพดานอยู่แล้ว (ไม่ต่ออายุสแตคเดิมที่มีอยู่)
function grantEvadeStack(p) {
  p.evadeStacks = p.evadeStacks || [];
  if (p.evadeStacks.length >= EVADE_STACK_MAX) return false;
  p.evadeStacks.push(EVADE_STACK_TURNS);
  p.statuses.evade = p.evadeStacks.length;
  return true;
}

// ใช้สแตคหลบหลีก 1 สแตค (เอาอันที่ใกล้หมดอายุที่สุดออกก่อน) — เรียกตอนถูกเลือกเป็นเป้าโจมตี ไม่ว่าหลบพ้นหรือไม่
function consumeEvadeStack(p) {
  if (!Array.isArray(p.evadeStacks) || !p.evadeStacks.length) return;
  let minIdx = 0;
  for (let i = 1; i < p.evadeStacks.length; i++) {
    if (p.evadeStacks[i] < p.evadeStacks[minIdx]) minIdx = i;
  }
  p.evadeStacks.splice(minIdx, 1);
  p.statuses.evade = p.evadeStacks.length;
  if (!p.evadeStacks.length) {
    delete p.statuses.evade;
    if (p.statusAmt) delete p.statusAmt.evade;
  }
}

// เรียกทุกจบเทิร์นต่อผู้เล่น — แต่ละสแตคนับถอยหลังอายุของตัวเอง หมดอายุอันไหนก็หายไปเฉพาะอันนั้น
function tickEvadeStacks(engine, p) {
  if (!Array.isArray(p.evadeStacks) || !p.evadeStacks.length) return;
  const before = p.evadeStacks.length;
  p.evadeStacks = p.evadeStacks.map((t) => t - 1).filter((t) => t > 0);
  p.statuses.evade = p.evadeStacks.length;
  if (!p.evadeStacks.length) delete p.statuses.evade;
  if (p.evadeStacks.length < before) {
    engine.log(`💨 ${p.name} หลบหลีกบางส่วนหมดอายุ (ครบ ${EVADE_STACK_TURNS} เทิร์น) — เหลือ ${p.evadeStacks.length}/${EVADE_STACK_MAX} ครั้ง`);
  }
}

// สถานะที่ "ไม่ลดเทิร์นเอง" — ต้องตรงกับรายการ `continue;` ในลูปลดเทิร์นของ endTurn() (server.js)
//  มาร์กถาวร (ตราล่าเวท/รังสรรค์/ลงทัณฑ์/เส้นตาย) · บัฟที่คงอยู่จนกว่าจะได้โจมตี (empower/miyako*/kotoneLove)
//  · ร่างแปลง/สแตคที่มีตัวนับของตัวเอง · สถานะที่ engine ลบเองตามเงื่อนไข
//  ใช้ร่วมกับแฝดที่ "พักอยู่" ของฮิซาคาว่า (characters/hisakawa_sister.js) เพื่อให้กติกาการนับเวลา
//  ของแฝดสองคนตรงกัน — เดิมฝั่งที่พักลดเทิร์นทุก key ทำให้มาร์กถาวรสลายไปเองระหว่างพัก
const NO_TICK_STATUS = new Set([
  "usagiMath", // อุซากิ: เทิร์นที่เหลือของโจทย์คณิต — ลดเองตอนแจกโจทย์ต้นเทิร์น (characters/usagi.js)
  "chill", "hburn", "hbleed", "melody", "star", "emeraude", "saphir", "lance", "takutoThirdAtk",
  "doomCrucible", "doomDrain", "doomExplode", "doomLockon", "fortune", "linked", "rsHopper",
  "cassius", "yaak", "spear", "ohger", "evade", "empower", "miyakoHeal", "miyakoCombo", "miyakoUlt",
  "kotoneLove", "kotoneReady", "kready", "deathline", "tepeuCook", "tepeuPonder",
  "kaiCreation", "kaiPunishment", "mageslayerMark", "mageslayerFury", "triggerForm", "triggerMulti",
  "triggerZeperion", "triggerLight", "hisakawaTempo", "triggerDarkWail", "escanorMorning",
  "escanorNight", "escanorNoon", "escanorLastStand", "escanorSolar", "escanorFlare",
  "escanorFlareNoon", "escanorPunch", "escanorRhitta", "escanorRhittaNoon", "escanorSun",
  "graybeast", "grit", "healthfull", "overweight",
  // ผู้วิงวอน (patch 3.4): "เกราะศรัทธา" เป็นจำนวนหน่วย ไม่ใช่ตัวนับเทิร์น — หายเมื่อถูกทำลายจนหมดเท่านั้น
  "supFaith",
  // ไบรอัน (patch 3.5): ร่างรถเป็นธง ไม่ใช่ตัวนับเทิร์น — หายเมื่อน้ำมันหมดถังหรือกดดับเครื่องเอง
  "brianCar", "brianBoost",
]);

module.exports = {
  SPELLBURDEN_MAX,
  NO_TICK_STATUS,
  statusAmtOf,
  applyBuff,
  BUFF_KEYS,
  accurateActive,
  stripLatestBuff,
  applyDebuff,
  setTurnsNoRefresh,
  applySpellburden,
  resistActive,
  BASIC_DEBUFF_CLEAR,
  SOFT_DEBUFF_STEP,
  cleanseDebuffs,
  cleanseOneStep,
  coolReduction,
  applyPoison,
  poisonAtkPenalty,
  tickPoison,
  SHOCK_STUN_CHANCE,
  SHOCK_STUN_TURNS,
  applyShock,
  tickShock,
  applyCurse,
  tickCurseOnSkill,
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
  NETRAMANA_KILL_CHANCE,
  netramanaActive,
  NUMB_FAIL_CHANCE,
  numbFizzles,
  EVADE_STACK_MAX,
  EVADE_STACK_TURNS,
  grantEvadeStack,
  consumeEvadeStack,
  tickEvadeStacks,
};
