// ============================================================
//  ไบรอัน (GT-R34) — Brian (patch 3.5 new)
//  กุญแจรถ / กดดันคันหน้า / การแข่งที่มีเดิมพัน · N2O + สกิลติดตัว "น้ำมันรถ"
//
//  ทั้งตัวละครหมุนรอบทรัพยากรเดียว: **น้ำมัน** (0-12) ซึ่งเป็นทั้งเชื้อเพลิงของร่างรถ
//  ค่าใช้จ่ายของทุกสกิล และตัวจับเวลาของร่างรถไปในตัว — น้ำมันหมดเมื่อไหร่รถดับเอง
//    · ฟื้นเทิร์นละ 1 (หยุดฟื้นระหว่างอยู่ในรถ) · ชนะการจั่ว +2 (ได้แม้อยู่ในรถ)
//    · ร่างรถกินเทิร์นละ 1 · ร่างเพิ่มพลังกินเทิร์นละ 2 แลกกับพลังโจมตี +1
//    · ทุกๆ 2 หน่วยที่ "รถกินเอง" แปลงเป็นพลังชีวิต +1 (ค่าสกิลไม่นับ — ดู burnFuel)
//
//  ⚠️ สองระบบที่ยืมแพทเทิร์นจากตัวละครอื่นมาทั้งดุ้น เพราะเป็นกลไกเดียวกัน:
//   1) ร่างรถ = สถานะ + สลับรูปพอร์เทรต + เพลงประจำร่าง (แพทเทิร์นเดียวกับร่างของฮิคารุ/โคโตเนะ)
//      ต่างจากร่างรถของแบทแมนตรงที่ไบรอัน **ยังมีพลังชีวิตปกติ** ไม่ได้เอาเกราะมาแทนเลือด
//   2) "การแข่งที่มีเดิมพัน" = โหมดกติกาพิเศษที่ระงับการสรุปรอบปกติทั้งหมด แช่คนนอก และ
//      ตัดสินด้วยการดวลแต้มตัวต่อตัว — โครงเดียวกับ "จับกุมขั้นเด็ดขาด" ของคอนเนอร์
//      (ดู duelResolveRound / freezeOutsiders / skillBlocked) ต่างกันที่จบใน 1 เทิร์น
// ============================================================

const ID = "brian";

// ---------- สกิลติดตัว น้ำมันรถ ----------
const FUEL_MAX = 12;
const FUEL_START = FUEL_MAX;      // ออกตัวด้วยถังเต็ม — ไม่งั้นเทิร์นแรกๆ ตัวละครทำอะไรไม่ได้เลย
const FUEL_REGEN_TURN = 1;        // ฟื้นเทิร์นละ 1 (หยุดฟื้นระหว่างอยู่ในรถ)
const FUEL_REGEN_WIN = 2;         // ชนะการจั่ว +2 (ได้แม้อยู่ในรถ)
const FUEL_PER_HP = 2;            // รถกินน้ำมันครบทุก 2 หน่วย -> พลังชีวิต +1
const NO_REFUEL_TURNS = 3;        // แพ้/เสมอการดวล -> ฟื้นน้ำมันจากการจบเทิร์นไม่ได้ 3 เทิร์น

// ---------- สกิลพื้นฐาน กุญแจรถ ----------
const KEY_COST = 1;
const CAR_FUEL_PER_TURN = 1;      // ร่างรถคู่ใจ
const BOOST_FUEL_PER_TURN = 2;    // ร่างรถคู่ใจที่ขาดไม่ได้
const BOOST_ATK = 1;              // ร่างเพิ่มพลัง: พลังโจมตีพื้นฐาน +1
const CAR_MUSIC = "brian_theme";

// ---------- สกิลรอง กดดันคันหน้า ----------
const PUSH_FUEL = 2;
const PUSH_TURNS = 3;
const PUSH_DMG = 1;               // ร่างปกติ
const PUSH_DMG_BOOST = 2;         // ร่างเพิ่มพลัง

// ---------- ท่าไม้ตาย 1 การแข่งที่มีเดิมพัน ----------
const DUEL_FUEL = 2;
const DUEL_WIN_DMG = 3;
const DUEL_WIN_FUEL = 2;
const DUEL_N2O_DMG = 5;           // ชนะด้วย N2O: แรงกว่า แต่ไม่ฟื้นน้ำมัน
const DUEL_LOSE_DMG = 2;
const DUEL_MUSIC = "brian_duel_theme";

// ---------- ท่าไม้ตาย 2 N2O ----------
const N2O_FUEL_MIN = 4;           // น้ำมันต่ำกว่านี้กดไม่ได้เลย (กดแล้วเทน้ำมันทั้งถัง)
const N2O_TARGET_SCORE = 21;

const IMG = {
  base: "/characters/brian_r34/brian.jpg",
  car: "/characters/brian_r34/brian_car.webp",
  skill1: "/characters/brian_r34/brian_skill1.webp",
  skill2: "/characters/brian_r34/brian_skill2.jpg",
  skill3: "/characters/brian_r34/brian_skill3.png",
  skill32: "/characters/brian_r34/brian_skill3.2.jpg",
};

function isBrian(p) { return !!p && p.characterId === ID; }
function carOn(p) { return !!p && ((p.statuses && p.statuses.brianCar) || 0) > 0; }
function boostOn(p) { return !!p && ((p.statuses && p.statuses.brianBoost) || 0) > 0; }
function fuelOf(p) { return Math.max(0, Math.min(FUEL_MAX, (p && p.brianFuel) || 0)); }
function duelOf(engine) {
  return Object.values(engine.players).find(
    (p) => isBrian(p) && p.alive && p.brianDuel && engine.players[p.brianDuel.targetId]
  ) || null;
}

module.exports = {
  id: ID,
  IMG,
  FUEL_MAX,
  FUEL_START,
  FUEL_REGEN_TURN,
  FUEL_REGEN_WIN,
  FUEL_PER_HP,
  NO_REFUEL_TURNS,
  CAR_FUEL_PER_TURN,
  BOOST_FUEL_PER_TURN,
  BOOST_ATK,
  PUSH_FUEL,
  PUSH_TURNS,
  PUSH_DMG,
  PUSH_DMG_BOOST,
  DUEL_FUEL,
  DUEL_WIN_DMG,
  DUEL_WIN_FUEL,
  DUEL_N2O_DMG,
  DUEL_LOSE_DMG,
  N2O_FUEL_MIN,
  N2O_TARGET_SCORE,
  carOn,
  boostOn,
  fuelOf,
  isBrian,

  resetCombat(p) {
    p.brianFuel = isBrian(p) ? FUEL_START : 0; // น้ำมันคงเหลือ (0-12)
    p.brianFuelBurned = 0;   // ตัวสะสม "น้ำมันที่รถกินไปแล้ว" — ครบ 2 แปลงเป็นเลือด 1 แล้วหักออก
    p.brianCarShown = false; // เล่นวีดีโอขึ้นรถไปแล้วหรือยัง (ครั้งแรกเท่านั้น)
    p.brianBoostShown = false;
    p.brianDuel = null;      // { targetId, n2o } — สถานะการดวลของไบรอัน
    p.brianFrozen = false;   // ถูกแช่เพราะอยู่นอกวงดวล (บังคับไพ่แตก)
  },

  // ---------- น้ำมัน: จุดเดียวที่แก้ค่านี้ได้ ----------
  addFuel(engine, p, n, why) {
    if (!isBrian(p) || !n) return 0;
    const before = fuelOf(p);
    p.brianFuel = Math.max(0, Math.min(FUEL_MAX, before + n));
    const diff = p.brianFuel - before;
    if (diff !== 0 && why) engine.log(`⛽ ${p.name} ${why} — น้ำมัน ${diff > 0 ? "+" : ""}${diff} (${p.brianFuel}/${FUEL_MAX})`);
    return diff;
  },

  // "รถกินน้ำมันเอง" — ต่างจาก addFuel ติดลบตรงที่ก้อนนี้เท่านั้นที่แปลงเป็นพลังชีวิต
  //  (สเปคระบุว่านับเฉพาะน้ำมันที่รถกิน ไม่รวมค่าสกิล ไม่งั้น N2O ที่เททั้งถังจะฟื้นเลือดทีเดียว 6)
  burnFuel(engine, p, n) {
    const used = -this.addFuel(engine, p, -n, "รถกินน้ำมัน");
    if (used <= 0) return 0;
    p.brianFuelBurned = (p.brianFuelBurned || 0) + used;
    let healed = 0;
    while (p.brianFuelBurned >= FUEL_PER_HP) {
      p.brianFuelBurned -= FUEL_PER_HP;
      healed += engine.healHp(p, 1);
    }
    if (healed > 0) engine.log(`💚 ${p.name} เครื่องยนต์เดินได้ที่ — พลังชีวิต +${healed} (ทุกๆ ${FUEL_PER_HP} หน่วยน้ำมันที่รถกิน)`);
    return used;
  },

  // ---------- สกิลติดตัว: ต้นเทิร์น ----------
  onRoundStartTick(engine, p) {
    if (!isBrian(p) || !p.alive) return;
    if (carOn(p)) {
      // รถกินน้ำมันก่อน — กินจนหมดถังเมื่อไหร่ รถดับทันทีในเทิร์นเดียวกัน
      this.burnFuel(engine, p, boostOn(p) ? BOOST_FUEL_PER_TURN : CAR_FUEL_PER_TURN);
      if (fuelOf(p) <= 0) this.stopCar(engine, p, "น้ำมันหมดถัง");
      return; // อยู่ในรถ = ไม่ฟื้นน้ำมันรายเทิร์น
    }
    if ((p.statuses.brianNoFuel || 0) > 0) {
      engine.log(`⛽🚫 ${p.name} ถังรั่วจากการแข่งที่แพ้มา — เทิร์นนี้ยังฟื้นน้ำมันไม่ได้ (เหลืออีก ${p.statuses.brianNoFuel} เทิร์น)`);
      return;
    }
    this.addFuel(engine, p, FUEL_REGEN_TURN, "เติมน้ำมันประจำเทิร์น");
  },

  // ชนะการจั่ว -> น้ำมัน +2 (ได้แม้อยู่ในรถ และไม่โดน "ถังรั่ว" กั้น เพราะไม่ใช่การฟื้นจากการจบเทิร์น)
  onRoundWin(engine, p) {
    if (!isBrian(p)) return;
    this.addFuel(engine, p, FUEL_REGEN_WIN, "ชนะการจั่ว");
  },

  // ---------- ร่างรถ ----------
  startCar(engine, p) {
    p.statuses.brianCar = 1; // ธง ไม่นับเทิร์น (อยู่ใน NO_TICK_STATUS) — หายเมื่อน้ำมันหมดหรือกดปิดเอง
    p.transformAt = engine.nextTransformCounter();
    if (!p.brianCarShown) { p.brianCarShown = true; engine.queueCutscene(p, "brianKey"); }
    engine.log(`🔑 ${p.name} กุญแจรถ — ขึ้น "รถคู่ใจ" แล้ว! กินน้ำมันเทิร์นละ ${CAR_FUEL_PER_TURN} หน่วย และทุกๆ ${FUEL_PER_HP} หน่วยที่กินจะฟื้นพลังชีวิต +1 (อยู่จนกว่าน้ำมันจะหมด)`);
    return " — ขึ้นรถคู่ใจ";
  },
  boostCar(engine, p) {
    p.statuses.brianBoost = 1;
    p.transformAt = engine.nextTransformCounter();
    if (!p.brianBoostShown) { p.brianBoostShown = true; engine.queueCutscene(p, "brianBoost"); }
    engine.log(`🔥 ${p.name} เหยียบมิด — "รถคู่ใจที่ขาดไม่ได้"! กินน้ำมันเทิร์นละ ${BOOST_FUEL_PER_TURN} หน่วย แลกกับพลังโจมตีพื้นฐาน +${BOOST_ATK}`);
    return " — เพิ่มพลัง";
  },
  stopCar(engine, p, why) {
    if (!carOn(p)) return false;
    delete p.statuses.brianCar;
    delete p.statuses.brianBoost;
    if (p.statusAmt) { delete p.statusAmt.brianCar; delete p.statusAmt.brianBoost; }
    p.brianFuelBurned = 0; // เศษน้ำมันที่ยังไม่ครบ 2 หน่วยไม่ยกยอดข้ามการขึ้นรถครั้งถัดไป
    engine.log(`🅿️ ${p.name} ลงจากรถแล้ว${why ? ` (${why})` : ""} — "หลีกทางไป"/ท่าไม้ตายใช้ไม่ได้จนกว่าจะขึ้นรถใหม่`);
    return true;
  },

  // เพลง + รูปพอร์เทรตของร่างรถ
  activeMusic(engine) {
    let best = null;
    for (const p of engine.alivePlayers()) {
      if (!carOn(p)) continue;
      if (!best || (p.transformAt || 0) > best.at) best = { music: CAR_MUSIC, at: p.transformAt || 0 };
    }
    // ระหว่างการดวลใช้เพลงของการแข่งแทน (ทับเพลงร่างรถ)
    const duelOwner = duelOf(engine);
    if (duelOwner) return { music: DUEL_MUSIC, at: (duelOwner.transformAt || 0) + 1 };
    return best;
  },
  displayImg(p) { return carOn(p) ? IMG.car : null; },

  // ---------- พลังโจมตี ----------
  damageBonus(engine, attacker, target, ctx) {
    if (!isBrian(attacker) || !boostOn(attacker)) return 0;
    ctx.brianBoostAtk = true;
    return BOOST_ATK;
  },

  // ---------- useSkill: เงื่อนไข ----------
  //  item = "off" | "boost" สำหรับสกิลพื้นฐานตอนกดครั้งที่ 2 (หน้าต่างให้เลือก)
  canUseSkill(engine, p, tier, item) {
    if (!isBrian(p)) return true;
    // ระหว่างการดวล ทุกอย่างถูกล็อกหมด ยกเว้น N2O (ซึ่งมาทางช่องท่าไม้ตายเหมือนกัน)
    if (this.duelActive(engine)) return tier === "ultimate" && this.n2oReady(engine, p);
    if (tier === "basic") {
      if (!carOn(p)) return true;                    // ยังไม่ขึ้นรถ = กดเพื่อขึ้นรถ
      if (item === "boost") return !boostOn(p);      // เพิ่มพลังซ้ำไม่ได้
      return item === "off";                          // ต้องเลือกอย่างใดอย่างหนึ่งเสมอ
    }
    if (tier === "secondary") {
      if (!carOn(p) || fuelOf(p) < PUSH_FUEL) return false;
      return !((p.statuses.brianPush || 0) > 0);      // กดซ้ำระหว่างผลยังอยู่ไม่ได้
    }
    if (tier === "ultimate") {
      if (!carOn(p) || fuelOf(p) < DUEL_FUEL) return false;
      if ((p.statuses.brianPush || 0) > 0) return false; // "กดดันคันหน้า" ยังทำงานอยู่ = กดไม่ได้
      return true;
    }
    return true;
  },
  // ช่องท่าไม้ตายตอนนี้เป็น N2O อยู่ไหม (ระหว่างการดวลเท่านั้น)
  n2oSlot(engine, p) { return isBrian(p) && !!p.brianDuel; },
  n2oReady(engine, p) { return this.n2oSlot(engine, p) && fuelOf(p) >= N2O_FUEL_MIN && !p.brianDuel.n2o; },

  prepareTarget(engine, p, targets) {
    const id = Array.isArray(targets) ? targets[0] : targets;
    const t = engine.players[id];
    if (!t || !t.alive || t.id === p.id) return null;
    if (engine.sameTeam(p, t) || engine.sealActive(t)) return null;
    return t;
  },

  // ---------- ลงผลของสกิล ----------
  applyInstantSkill(engine, p, tier, target, item) {
    if (!isBrian(p)) return "";
    if (tier === "basic") {
      if (!carOn(p)) return this.startCar(engine, p);
      if (item === "boost") return this.boostCar(engine, p);
      this.stopCar(engine, p, "ดับเครื่อง");
      return " — ลงจากรถ";
    }
    if (tier === "secondary") return this.applyPush(engine, p);
    if (tier === "ultimate") {
      if (this.n2oSlot(engine, p)) return this.applyN2O(engine, p);
      return this.startDuel(engine, p, target);
    }
    return "";
  },

  // ---------- สกิลรอง กดดันคันหน้า ----------
  applyPush(engine, p) {
    this.addFuel(engine, p, -PUSH_FUEL, "กดดันคันหน้า");
    p.statuses.brianPush = PUSH_TURNS;
    engine.log(`🏎️ ${p.name} กดดันคันหน้า — ได้รับ "หลีกทางไป" ${PUSH_TURNS} เทิร์น: ทุกเทิร์นจะพุ่งชนคนที่แต้มสูงสุดที่มากกว่าเรา ${boostOn(p) ? PUSH_DMG_BOOST : PUSH_DMG} หน่วย`);
    return " — หลีกทางไป";
  },

  // เรียกตอนสรุปแต้มของรอบ (หลังรู้แต้มทุกคนแล้ว) — คืนเป้าหมายที่จะโดนชน หรือ null
  //  "คนที่แต้มมากกว่าเรา" นับจากแต้มจริงหลังเปิดไพ่ · ไพ่แตกไม่นับว่ามากกว่า (แต้มถือเป็น -1)
  pushTargetOf(engine, p) {
    if (!isBrian(p) || !p.alive || !((p.statuses.brianPush || 0) > 0)) return null;
    const mine = engine.bustedOf(p) ? -1 : engine.scoreOf(p);
    let best = null;
    for (const o of engine.alivePlayers()) {
      if (o.id === p.id || engine.sameTeam(p, o) || engine.sealActive(o)) continue;
      const sc = engine.bustedOf(o) ? -1 : engine.scoreOf(o);
      if (sc <= mine) continue;
      if (!best || sc > best.score) best = { player: o, score: sc };
    }
    return best ? best.player : null;
  },
  // ลงความเสียหายจริง — เรียกหลังวีดีโอ brian_skill2.mp4 เล่นจบ (สเปค: วีดีโอก่อนความเสียหายทุกครั้ง)
  applyPushHit(engine, p, target) {
    if (!p || !p.alive || !target || !target.alive) return;
    const dmg = boostOn(p) ? PUSH_DMG_BOOST : PUSH_DMG;
    engine.withEffectSource(p, () => {
      engine.dealMixed(target, dmg);
      target.wasAttacked = true;
      engine.log(`💥 ${p.name} หลีกทางไป — พุ่งชน ${target.name} ${dmg} หน่วย (เหลืออีก ${p.statuses.brianPush || 0} เทิร์น)`);
      engine.resolveDamageAftermath(target);
      if (!target.alive) engine.log(`💀 ${target.name} ถูกชนจนตกรอบ!`);
    });
  },

  // ============================================================
  //  ท่าไม้ตาย 1 การแข่งที่มีเดิมพัน
  // ============================================================
  //  โหมดกติกาพิเศษ 1 เทิร์น — โครงเดียวกับ "จับกุมขั้นเด็ดขาด" ของคอนเนอร์ (ดูหัวไฟล์)
  startDuel(engine, p, target) {
    if (!target) return "";
    this.addFuel(engine, p, -DUEL_FUEL, "การแข่งที่มีเดิมพัน");
    p.brianDuel = { targetId: target.id, n2o: false };
    p.transformAt = engine.nextTransformCounter();
    engine.queueCutscene(p, "brianDuel");
    engine.log(`🏁 ${p.name} ท้า ${target.name} ลงแข่งเดิมพัน! — เทิร์นนี้ทุกคนถูกแช่ ไม่มีใครจั่ว/กดสกิล/ใช้ไอเทมได้ และไม่รับความเสียหายจากไพ่แตก`);
    engine.log(`🏁 การ์ดของ ${p.name} และ ${target.name} ถูกสุ่มใหม่ — ใครแต้มสูงกว่าตอนสรุปรอบคือผู้ชนะ`);
    this.freezeOutsiders(engine, p);
    this.redealDuelHands(engine, p, target);
    return ` — ท้าแข่ง ${target.name}!`;
  },

  duelOwner(engine) { return duelOf(engine); },
  duelActive(engine) { return !!duelOf(engine); },
  // คนนอกวงดวล: ถูกแช่ บังคับไพ่แตก กดอะไรไม่ได้ (แต่ไม่รับความเสียหาย)
  actionBlocked(engine, p) {
    const owner = duelOf(engine);
    if (!owner || !p) return false;
    return p.id !== owner.id && p.id !== owner.brianDuel.targetId;
  },
  // ระหว่างการแข่ง ทุกคนกดสกิล/ใช้ไอเทมไม่ได้ รวมไบรอันกับเป้าหมาย — ยกเว้น N2O ของไบรอันเอง
  //  (สเปค: "เป้าหมายและเรา จะกดสกิลหรือใช้ไอเทมไม่ได้ระหว่างนี้" + "N2O กดได้ ไม่สนใจกฎของท่าไม้ตาย 1")
  skillBlocked(engine, p, tier) {
    if (!this.duelActive(engine)) return false;
    if (isBrian(p) && tier === "ultimate" && this.n2oReady(engine, p)) return false;
    return true;
  },
  itemBlocked(engine) { return this.duelActive(engine); },

  freezeOutsiders(engine, owner) {
    const duel = owner && owner.brianDuel;
    if (!duel) return;
    for (const o of engine.alivePlayers()) {
      if (o.id === owner.id || o.id === duel.targetId) continue;
      o.brianFrozen = true; // ทำให้ bustedOf() คืน true — ดาเมจไพ่แตก/แพ้ถูกระงับทั้งหมดในเทิร์นดวลอยู่แล้ว
      o.busted = true;
      o.locked = true;
    }
  },
  // สุ่มการ์ดใหม่ให้คู่แข่งทั้งสองฝั่ง (ใบเดียวเหมือนตอนเริ่มเทิร์น) แล้วปลดล็อกให้เล่นต่อได้
  redealDuelHands(engine, owner, target) {
    for (const o of [owner, target]) {
      if (!o || !o.alive) continue;
      o.cards = [];
      o.busted = false;
      o.locked = false;
      o.brianFrozen = false;
      const c = engine.drawCardFor(o);
      if (c) { o.cards.push(c); engine.onCardDrawn(o, c); }
    }
    engine.log(`🃏 สุ่มการ์ดใหม่ให้ ${owner.name} และ ${target.name} แล้ว — เริ่มแข่ง!`);
  },

  // ---------- สรุปรอบระหว่างการแข่ง ----------
  //  คืน true = จัดการรอบนี้เองแล้ว resolveRound() ต้องไม่ทำกติกาปกติต่อ
  duelResolveRound(engine) {
    const owner = duelOf(engine);
    if (!owner) return false;
    const duel = owner.brianDuel;
    const target = engine.players[duel.targetId];
    if (!target || !target.alive || !owner.alive) {
      engine.log("🏁 การแข่งถูกยกเลิก — คู่แข่งไม่อยู่ในสนามแล้ว");
      this.endDuel(engine, owner);
      return true;
    }
    const mine = engine.bustedOf(owner) ? -1 : engine.scoreOf(owner);
    const theirs = engine.bustedOf(target) ? -1 : engine.scoreOf(target);
    const won = mine > theirs;
    engine.log(`🏁 ผลการแข่ง — ${owner.name} ${mine < 0 ? "ไพ่แตก" : `${mine} แต้ม`} vs ${target.name} ${theirs < 0 ? "ไพ่แตก" : `${theirs} แต้ม`}`);
    for (const o of engine.alivePlayers()) o.result = "safe"; // ไม่มีผู้ชนะ/ผู้แพ้ของรอบระหว่างการแข่ง

    if (won) {
      const usedN2O = !!duel.n2o;
      engine.queueCutscene(owner, usedN2O ? "brianN2OHit" : "brianDuelWin");
      const dmg = usedN2O ? DUEL_N2O_DMG : DUEL_WIN_DMG;
      engine.withEffectSource(owner, () => {
        engine.dealMixed(target, dmg); // "คิดเกราะด้วย" = ลดเกราะก่อนตามท่อปกติ
        target.wasAttacked = true;
        engine.resolveDamageAftermath(target);
      });
      engine.log(`🏆 ${owner.name} ชนะการแข่ง! — ${target.name} รับความเสียหาย ${dmg} หน่วย${usedN2O ? " (ชนะด้วย N2O จึงไม่ฟื้นน้ำมัน)" : ""}`);
      if (!usedN2O) this.addFuel(engine, owner, DUEL_WIN_FUEL, "รางวัลผู้ชนะการแข่ง");
      if (!target.alive) engine.log(`💀 ${target.name} ตกรอบจากการแข่ง!`);
    } else {
      engine.queueCutscene(owner, "brianDuelLost");
      engine.withEffectSource(owner, () => {
        engine.dealMixed(owner, DUEL_LOSE_DMG);
        engine.resolveDamageAftermath(owner);
      });
      owner.statuses.brianNoFuel = NO_REFUEL_TURNS;
      engine.log(`🏳️ ${owner.name} ${mine === theirs ? "เสมอ" : "แพ้"}การแข่ง — รับความเสียหาย ${DUEL_LOSE_DMG} หน่วย และฟื้นน้ำมันจากการจบเทิร์นไม่ได้ ${NO_REFUEL_TURNS} เทิร์น`);
      if (!owner.alive) engine.log(`💀 ${owner.name} ตกรอบจากการแข่งที่ตัวเองท้า!`);
    }
    this.endDuel(engine, owner);
    return true;
  },
  endDuel(engine, owner) {
    if (owner) owner.brianDuel = null;
    for (const o of Object.values(engine.players)) o.brianFrozen = false;
  },
  // เก็บกวาดท้ายเทิร์น: การแข่งล่มไปแล้ว (เช่นไบรอันตายกลางคัน) -> ต้องปลดธง "ถูกแช่" ของทุกคนเสมอ
  cleanupDuel(engine) {
    if (this.duelActive(engine)) return;
    for (const o of Object.values(engine.players)) {
      if (o.brianFrozen) o.brianFrozen = false;
      if (isBrian(o) && o.brianDuel) o.brianDuel = null;
    }
  },
  fieldFx(engine) { return this.duelActive(engine) ? "duel" : null; },

  // ============================================================
  //  ท่าไม้ตาย 2 N2O — ดันแต้มขึ้นไปที่ 21 พอดีด้วยการ์ดจากกองกลาง
  // ============================================================
  applyN2O(engine, p) {
    const spent = fuelOf(p);
    this.addFuel(engine, p, -spent, "N2O เทน้ำมันทั้งถัง"); // ไม่ผ่าน burnFuel: ค่าสกิลไม่แปลงเป็นเลือด
    p.brianDuel.n2o = true;
    engine.queueCutscene(p, "brianN2O");
    // แต้มเกิน 21 อยู่แล้ว (ไพ่แตก) — ล้างมือทิ้งก่อน ไม่งั้น "เติมให้ครบ 21" ทำไม่ได้เลย
    if (engine.calculateScore(p.cards) > N2O_TARGET_SCORE) {
      p.cards = [];
      engine.log(`💨 ${p.name} N2O — แต้มเกินอยู่ก่อนแล้ว ระบบจึงรีเซ็ตมือแล้วจัดใหม่`);
    }
    const need = N2O_TARGET_SCORE - engine.calculateScore(p.cards);
    const added = [];
    for (const v of this.planN2OFill(engine, need)) {
      const card = engine.drawFromCentralDeck((c) => !c.special && c.value === v);
      if (!card) break; // ไม่ควรเกิด (แผนคิดจากกองจริง) แต่กันไว้ไม่ให้ลูปค้าง
      p.cards.push(card);
      engine.onCardDrawn(p, card);
      added.push(card.value);
    }
    const score = engine.calculateScore(p.cards);
    engine.log(added.length
      ? `💨 ${p.name} N2O — เทน้ำมัน ${spent} หน่วย ดึงการ์ดจากกองกลาง (${added.join(", ")}) ดันแต้มขึ้นเป็น ${score}`
      : `💨 ${p.name} N2O — เทน้ำมัน ${spent} หน่วย แต่กองกลางไม่มีใบที่เติมได้ แต้มคงที่ ${score}`);
    return ` — N2O ${score} แต้ม!`;
  },

  // วางแผนว่าจะดึงการ์ดค่าอะไรบ้างจากกองกลางให้ได้ผลรวม = need พอดี
  //  ⚠️ ใช้ subset-sum (DP) ไม่ใช่ greedy "หยิบใบใหญ่สุดก่อน" — greedy ตันได้ง่ายมาก
  //  เช่นต้องการ 16 จากกอง {12, 9, 5, 2}: greedy หยิบ 12 แล้วเหลือ 4 ซึ่งไม่มีใบไหนเติมได้อีก
  //  ทั้งที่ 12+... ไม่ได้ แต่ 9+5+2 = 16 พอดี · ถ้าไม่มีชุดไหนได้พอดีจะเลือกชุดที่ใกล้ 21 ที่สุดแทน
  //  คืน array ของ "ค่าการ์ด" ที่ต้องดึง (อาจว่างถ้ากองกลางเติมอะไรไม่ได้เลย)
  planN2OFill(engine, need) {
    if (!(need > 0)) return [];
    const pool = (engine.centralDeck || []).filter((c) => !c.special && c.value > 0).map((c) => c.value);
    if (!pool.length) return [];
    // best[sum] = รายการค่าการ์ดที่ทำผลรวมนั้นได้ (ใบละครั้ง) — null = ยังทำไม่ได้
    const best = new Array(need + 1).fill(null);
    best[0] = [];
    for (const v of pool) {
      for (let sum = need; sum >= v; sum--) {
        if (best[sum] || !best[sum - v]) continue;
        best[sum] = best[sum - v].concat(v);
      }
    }
    if (best[need]) return best[need];
    for (let sum = need - 1; sum >= 1; sum--) if (best[sum]) return best[sum]; // ใกล้ที่สุดเท่าที่ทำได้
    return [];
  },

  // ---------- ตกรอบ ----------
  onDeath(engine, p) {
    if (isBrian(p)) {
      this.stopCar(engine, p, "คนขับหมดสภาพ");
      if (p.brianDuel) { engine.log("🏁 การแข่งจบลงกลางคัน — ไบรอันตกรอบ"); this.endDuel(engine, p); }
      return;
    }
    // เป้าหมายของการแข่งตกรอบกลางคัน -> ยกเลิกการแข่ง
    const owner = duelOf(engine);
    if (owner && owner.brianDuel.targetId === p.id) {
      engine.log(`🏁 การแข่งจบลงกลางคัน — ${p.name} ตกรอบ`);
      this.endDuel(engine, owner);
    }
  },
};
