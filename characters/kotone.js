// ============================================================
//  ฟุจิตะ โคโตเนะ (rework 2.3) — Part-time / Dance Lession / หนูพร้อมแล้วคะ โปรดิวเซอร์ (ร่าง [พร้อมลุย])
//  / Sekai ichi kawaii watashi / Campus Mode! / Self-affirmation Explosion! Love Love / Sleeping time
//  + สกิลติดตัว "กระปุกออมสินน้องหมูน้อย" (เพดานเหรียญ 45 + กระปุก 15 + ท่านประธานเซนะจัง)
//
//  โครงสร้างสกิล (ดู dynamicSkillFor) — ปุ่มบนกระดานมี 3 ช่องเท่านั้น จึงแมปดังนี้
//    ร่างปกติ กลางวัน : basic  = Part-time (1)      secondary  = Dance Lession (3)   ultimate      = หนูพร้อมแล้วคะ (4 + ความพร้อม 4)
//    ร่างปกติ กลางคืน : basicNight = Part-time (3)  secondaryNight = Dance (5)       ultimateNight = Sleeping time (4)
//    ร่าง [พร้อมลุย]  : basic3 = ULT3 Sekai ichi   secondary3 = ULT4 Campus Mode!   ultimate3     = ULT5 Love Love
//      -> ร่าง [พร้อมลุย] ทับทั้งกลางวันและกลางคืน เพื่อให้ "อยู่จนกว่าจะใช้สกิล" เป็นจริงเสมอ
//         (ไม่งั้นเข้าร่างท้ายวันแล้วตกคืนจะไม่มีปุ่มให้ปล่อยท่า)
//
//  หมายเหตุ: `maybeWakeKotone(t)` ใน server.js เป็น no-op ถาวรตาม comment เดิม — จงใจไม่ลบ เพราะเป็นส่วนหนึ่ง
//  ของ post-damage hook chain มาตรฐาน (maybeBeatSave/Mode/Eva3/WakeKotone) ที่ไฟล์ตัวละครอื่นเรียกอยู่ ~9 จุด
// ============================================================

// ---------- สกิลติดตัว: กระปุกออมสินน้องหมูน้อย ----------
const KOTONE_GOLD_CAP = 45;        // ขยายขีดจำกัดเหรียญของโคโตเนะ (คนอื่น GOLD_MAX = 30)
const KOTONE_PIGGY_MAX = 15;       // กระปุกออมสินเก็บได้สูงสุด
const KOTONE_PIGGY_CHANCE = 0.6;   // โอกาสสะสมเข้ากระปุกเมื่อได้รับเหรียญ
const KOTONE_PIGGY_MAX_SAVE = 3;   // หยอดได้ครั้งละไม่เกิน 3 เหรียญ — หักจากเหรียญที่เพิ่งได้รับจริง
                                   //  (ได้ 1 หยอด 1 · ได้ 2 หยอด 2 · ได้ตั้งแต่ 3 ขึ้นไป หยอด 3)
const KOTONE_SENA_CHANCE = 0.2;    // โอกาสโดนท่านประธานเซนะจังเจอตัว (เฉพาะสกิลพื้นฐาน/พื้นฐาน 2/สกิลรอง)
const KOTONE_SENA_STUN_TURNS = 1;  // โดนเจอตัว -> สตั้นตัวเอง 1 เทิร์น (เริ่มมีผลเทิร์นถัดไป)
const KOTONE_REGEN_CHANCE = 0.3;   // โอกาสฟื้นแต้มสกิลเพิ่ม 1 หน่วยตอนจบเทิร์น
const KOTONE_REGEN_AMOUNT = 1;

// ---------- Part-time ----------
const KOTONE_PART_DAY_MIN = 1, KOTONE_PART_DAY_MAX = 6;     // กลางวัน: เหรียญสุ่ม 1-6
const KOTONE_PART_NIGHT_MIN = 3, KOTONE_PART_NIGHT_MAX = 8; // กลางคืน: เหรียญสุ่ม 3-8
const KOTONE_PART_NIGHT_HP = 1;                             // กลางคืน: เสียพลังชีวิตตัวเอง 1

// ---------- Dance Lession ----------
const KOTONE_DANCE_DAY_READY = 1;     // กลางวัน: [ความพร้อม] +1
const KOTONE_DANCE_NIGHT_READY = 2;   // กลางคืน: [ความพร้อม] +2
const KOTONE_DANCE_NIGHT_BURDEN = 2;  // กลางคืน: ภาระเวท 2 เทิร์น
const KOTONE_DANCE_NIGHT_HP = 2;      // กลางคืน: เสียพลังชีวิตตัวเอง 2

// ---------- ท่าไม้ตาย 1: หนูพร้อมแล้วคะ โปรดิวเซอร์ ----------
const KOTONE_READY_NEED = 3;          // ต้องมี [ความพร้อม] ครบ 3 หน่วย (หักทั้งหมดตอนใช้ · balance 3.4.5: เดิม 4)
const KOTONE_READY_MAX = 4;           // [ความพร้อม] สะสมได้สูงสุด 4 หน่วย (ซ้อมเกินไม่เก็บ)

// ---------- ท่าไม้ตายในร่าง [พร้อมลุย] (ทั้ง 3 ท่าใช้ 6 แต้มสกิล + 6 เหรียญ) ----------
const KOTONE_FORM_ULT_GOLD = 6;
const KOTONE_KAWAII_HEAL = 1;         // ULT3: ฮีลตัวเอง
const KOTONE_KAWAII_DMG = 1;          // ULT3: ตีหมู่เจาะเกราะ
const KOTONE_KAWAII_STUN_TURNS = 2;   // ULT3: สตั้นทุกคน (ยกเว้นตัวเอง)
const KOTONE_CAMPUS_HEAL = 3;         // ULT4: ฮีลตัวเอง
const KOTONE_CAMPUS_NOHEAL_TURNS = 2; // ULT4: ไร้ทางเยียวยาทุกคน (ยกเว้นตัวเอง)
const KOTONE_FORCE_BUST_DRAWS = 3;    // บังคับแตก: จั่วเพิ่มกี่ใบ
const KOTONE_FORCE_BUST_BONUS = 8;    // บังคับแตก: บวกแต้มการ์ดตรงๆ ให้เกินเพดานแน่นอน (แม้เปิดไพ่/ล็อกไปแล้ว)
                                      //  ตัวเลขเดียวกับ Crucible (ดูมกาย) / Ashen Trail (โอกูริ) — กลไกเดียวกัน

// ---------- (รัก รักที่สุดเลย) ----------
const KOTONE_LOVE_PER_COIN = 5;       // เงินในกระปุก 5 เหรียญ = +1 ดาเมจ
const KOTONE_LOVE_MAX = 3;            // สูงสุด +3 (ที่ 15 เหรียญ)

// ---------- Sleeping time ----------
const KOTONE_SLEEP_TURNS = 3;         // หลับ 3 เทิร์น
const KOTONE_SLEEP_HEAL = 2;          // ระหว่างหลับ ฮีล 2 หน่วย/เทิร์น
const KOTONE_SLEEP_SKILL = 1;         // ระหว่างหลับ ฟื้นแต้มสกิล 1 หน่วย/เทิร์น
const KOTONE_SLEEP_SEAL_TURNS = 1;    // ศัตรูเลือกโจมตีไม่ได้ 1 เทิร์น

const KOTONE_FORM_IMG = "/characters/kotone/rework/สกิลอัลติเมติ1/Kotone.png";

// สถานะของท่าไม้ตายทั้ง 3 ท่าในร่าง [พร้อมลุย] — ทำงานหลังเปิดไพ่ผ่าน resolveFormUlts()
const KOTONE_FORM_ULT_KEYS = ["kawaii", "kcampus", "kshuki"];

module.exports = {
  id: "kotone",
  GOLD_CAP: KOTONE_GOLD_CAP,
  PIGGY_MAX: KOTONE_PIGGY_MAX,
  READY_NEED: KOTONE_READY_NEED,
  READY_MAX: KOTONE_READY_MAX,
  FORM_ULT_GOLD: KOTONE_FORM_ULT_GOLD,
  FORM_ULT_KEYS: KOTONE_FORM_ULT_KEYS,

  // ---------- helper ----------
  // ร่าง [พร้อมลุย] ทำงานอยู่ไหม
  formActive(p) {
    return !!p && ((p.statuses && p.statuses.kready) || 0) > 0;
  },
  // จำนวน [ความพร้อม] ที่สะสมอยู่
  readyStacks(p) {
    return (p && p.statuses && p.statuses.kotoneReady) || 0;
  },
  // ดาเมจเสริมของ (รัก รักที่สุดเลย) ตามเงินในกระปุก — 5/10/15 เหรียญ = +1/+2/+3
  loveDamage(p) {
    return Math.min(KOTONE_LOVE_MAX, Math.floor(((p && p.piggy) || 0) / KOTONE_LOVE_PER_COIN));
  },
  // ภาพประจำตัวตามร่างปัจจุบัน (null = ใช้ภาพปกติ) — เรียกจาก displayImg() ใน server.js
  displayImg(p) {
    return this.formActive(p) ? KOTONE_FORM_IMG : null;
  },

  // ---------- ตัวเลือกสกิลตามร่าง/ช่วงเวลา — เรียกทั้งจาก useSkill() และ buildStateFor() ----------
  //  night = ผลของ isNightRound() ที่ผู้เรียกคำนวณมาแล้ว (hook ไม่เดาเอง)
  dynamicSkillFor(p, ch, tier, night) {
    if (this.formActive(p)) {
      if (tier === "basic") return ch.basic3;
      if (tier === "secondary") return ch.secondary3;
      return ch.ultimate3;
    }
    if (night) {
      if (tier === "basic") return ch.basicNight;
      if (tier === "secondary") return ch.secondaryNight;
      return ch.ultimateNight;
    }
    return ch[tier];
  },

  // ---------- เงื่อนไขการกด — เรียกจาก useSkill() ก่อนหักแต้ม ----------
  canUseSkill(engine, p, tier, skill, night) {
    if (!skill) return false;
    const st = skill.effect && skill.effect.status;
    // ท่าไม้ตายในร่าง [พร้อมลุย]: ต้องอยู่ในร่าง และมีเหรียญพอจ่าย 6 เหรียญ
    if (KOTONE_FORM_ULT_KEYS.includes(st)) {
      return this.formActive(p) && (p.gold || 0) >= KOTONE_FORM_ULT_GOLD;
    }
    // หนูพร้อมแล้วคะ โปรดิวเซอร์: ต้องมี [ความพร้อม] ครบ 4 และยังไม่อยู่ในร่าง
    if (st === "kready") {
      return !this.formActive(p) && this.readyStacks(p) >= KOTONE_READY_NEED;
    }
    // Sleeping time (ท่าไม้ตายกลางคืน): หลับอยู่แล้ว กดซ้ำไม่ได้
    if (tier === "ultimate" && night) return !((p.statuses.ksleep || 0) > 0);
    return true;
  },

  // ---------- หักเหรียญของท่าไม้ตายในร่าง [พร้อมลุย] — เรียกจาก useSkill() พร้อมกับหักแต้มสกิล ----------
  payFormUltGold(engine, p, skill) {
    const st = skill && skill.effect && skill.effect.status;
    if (!KOTONE_FORM_ULT_KEYS.includes(st)) return "";
    p.gold = Math.max(0, (p.gold || 0) - KOTONE_FORM_ULT_GOLD);
    engine.log(`🪙 ${p.name} จ่าย ${KOTONE_FORM_ULT_GOLD} เหรียญเพื่อปล่อย ${skill.name} (เหลือ ${p.gold} เหรียญ)`);
    return ` — จ่าย ${KOTONE_FORM_ULT_GOLD} เหรียญ`;
  },

  // ---------- ผลของสกิลที่ทำงานทันที (instant) — เรียกจาก useSkill() ในส่วน effect ----------
  //  คืน flashSuffix ต่อท้ายชื่อสกิลบนป้ายเด้ง
  applyInstantSkill(engine, p, tier, night) {
    if (this.formActive(p)) return ""; // ในร่าง [พร้อมลุย] ทั้ง 3 ปุ่มเป็นท่าไม้ตาย (ทำงานหลังเปิดไพ่)
    if (tier === "basic") return this.applyPartTime(engine, p, night);
    if (tier === "secondary") return this.applyDance(engine, p, night);
    if (tier === "ultimate") return night ? this.applySleep(engine, p) : this.activateReady(engine, p);
    return "";
  },

  // Part-time — กลางวัน: เหรียญ 1-6 / กลางคืน: เหรียญ 3-8 + เสียเลือด 1
  applyPartTime(engine, p, night) {
    const min = night ? KOTONE_PART_NIGHT_MIN : KOTONE_PART_DAY_MIN;
    const max = night ? KOTONE_PART_NIGHT_MAX : KOTONE_PART_DAY_MAX;
    const roll = min + Math.floor(Math.random() * (max - min + 1));
    const kept = engine.addGold(p, roll); // ยอดสุทธิหลังกระปุกออมสินแบ่งไปเก็บ (ถ้าโรลติด)
    let hpMsg = "";
    if (night) {
      for (let i = 0; i < KOTONE_PART_NIGHT_HP; i++) engine.loseHp(p);
      hpMsg = ` · เสียพลังชีวิต -${KOTONE_PART_NIGHT_HP}`;
      engine.maybeBeatSave(p); engine.maybeBeatMode(p); engine.maybeEva3(p);
    }
    engine.log(`🐷 ${p.name} Part-time${night ? " (กะดึก)" : ""} — สุ่มได้ ${roll} เหรียญ (เข้ากระเป๋าสุทธิ +${kept} · มี ${p.gold})${hpMsg}`);
    return ` — เหรียญ +${kept}`;
  },

  // Dance Lession — [ความพร้อม] +1 (กลางคืน +2 พร้อมภาระเวท 2 เทิร์น + เสียเลือด 2)
  applyDance(engine, p, night) {
    const want = night ? KOTONE_DANCE_NIGHT_READY : KOTONE_DANCE_DAY_READY;
    const add = Math.min(want, KOTONE_READY_MAX - this.readyStacks(p)); // ซ้อมเกินเพดานไม่เก็บสะสม
    if (add > 0) p.statuses.kotoneReady = this.readyStacks(p) + add;
    let extra = add < want ? ` (เต็มเพดาน ${KOTONE_READY_MAX} — ได้แค่ +${add})` : "";
    if (night) {
      if (!engine.resistActive(p)) {
        engine.applySpellburden(p, KOTONE_DANCE_NIGHT_BURDEN); // helper กลาง: สะสม +1 · ใช้ซ้ำไม่ต่ออายุ
        extra += ` · ติดภาระเวท ${KOTONE_DANCE_NIGHT_BURDEN} เทิร์น`;
      } else {
        extra += " · ต้านสถานะผิดปกติของตัวเอง ไม่ติดภาระเวท";
      }
      for (let i = 0; i < KOTONE_DANCE_NIGHT_HP; i++) engine.loseHp(p);
      extra += ` · เสียพลังชีวิต -${KOTONE_DANCE_NIGHT_HP}`;
      engine.maybeBeatSave(p); engine.maybeBeatMode(p); engine.maybeEva3(p);
    }
    engine.log(`💃 ${p.name} ${night ? "แอบซ้อม" : "Dance Lession"} — [ความพร้อม] +${add} (มี ${this.readyStacks(p)}/${KOTONE_READY_MAX})${extra}`);
    return ` — ความพร้อม ${this.readyStacks(p)}/${KOTONE_READY_MAX}`;
  },

  // Sleeping time — ล้าง "สถานะเสีย" ทั้งหมด + กันถูกเลือกโจมตี 1 เทิร์น + หลับ 3 เทิร์น
  //  ล้างเฉพาะดีบัฟ (BASIC_DEBUFF_CLEAR/SOFT_DEBUFF_STEP ผ่าน cleanseDebuffs) — บัฟและสถานะของตัวเอง
  //  ([ความพร้อม] / ร่าง [พร้อมลุย] ฯลฯ) ยังอยู่ครบ
  //  (ฮีล 2 / แต้มสกิล +1 ต่อเทิร์นระหว่างหลับ อยู่ที่ onRoundStartTick)
  applySleep(engine, p) {
    const purged = engine.cleanseDebuffs(p);
    p.statuses.ksleep = KOTONE_SLEEP_TURNS;
    p.statuses.seal = Math.max(p.statuses.seal || 0, KOTONE_SLEEP_SEAL_TURNS); // ศัตรูไม่สามารถเลือกโจมตีได้ 1 เทิร์น
    engine.log(`😴 ${p.name} Sleeping time — ล้างสถานะเสียที่ติดตัวอยู่ ${purged} อย่าง · ศัตรูเลือกโจมตีไม่ได้ ${KOTONE_SLEEP_SEAL_TURNS} เทิร์น · หลับ ${KOTONE_SLEEP_TURNS} เทิร์น (ระหว่างหลับ ฟื้นพลังชีวิต +${KOTONE_SLEEP_HEAL} และแต้มสกิล +${KOTONE_SLEEP_SKILL} ต่อเทิร์น)`);
    return " — หลับพักผ่อน";
  },

  // ---------- ท่าไม้ตาย 1: เข้าร่าง [พร้อมลุย] — ทำงานทันทีก่อนเปิดการ์ด ----------
  //  เรียกจาก applyInstantSkill() (useSkill) — สถานะ kready ถูกตั้งโดย applyEffect() ของ engine อีกทีหลังจากนี้
  //  ตั้ง seen/transformAt เองแบบเดียวกับ rachan (คุวากาตะ) เพราะไม่ผ่านลูป afterReveal ของ afterResolve()
  activateReady(engine, p) {
    const left = Math.max(0, this.readyStacks(p) - KOTONE_READY_NEED);
    if (left > 0) p.statuses.kotoneReady = left;
    else delete p.statuses.kotoneReady;
    p.seen.kready = true;                          // ปลดล็อกเพลงประจำร่าง (skillMusicFor สแกน seen + statuses)
    p.transformAt = engine.nextTransformCounter(); // ลำดับเพลงเวลาสวนท่าไม้ตายกัน
    engine.notifyTransform(p, "kready");           // ไม่มีวีดีโอ — แจ้งเตือนบนกระดานอย่างเดียว ไม่หยุดเกม
    engine.log(`✨ ${p.name} หนูพร้อมแล้วคะ โปรดิวเซอร์! — ใช้ [ความพร้อม] ${KOTONE_READY_NEED} หน่วยเข้าสู่ร่าง [พร้อมลุย] (อยู่จนกว่าจะปล่อยท่าไม้ตายในร่าง)`);
    return " — เข้าสู่ร่าง [พร้อมลุย]";
  },

  // ---------- ท่าไม้ตายในร่าง [พร้อมลุย] (หลังเปิดไพ่) ----------
  //  ต้องทำงาน "ก่อน" ตัดสินผู้ชนะ เพราะมีผลบังคับแตก -> เรียกจาก resolveRound() หลังบล็อก ANATA
  resolveFormUlts(engine) {
    for (const p of engine.alivePlayers()) {
      if (p.characterId !== "kotone") continue;
      for (const key of KOTONE_FORM_ULT_KEYS) {
        if (!((p.statuses[key] || 0) > 0) || p.seen[key]) continue;
        if (engine.bustedOf(p)) continue; // ผู้ใช้แตกเอง = ท่าเป็นโมฆะ (voidUltimateOnBust ลบสถานะให้แล้ว)
        p.seen[key] = true;
        p.transformAt = engine.nextTransformCounter();
        engine.withEffectSource(p, () => this.fireFormUlt(engine, p, key));
        engine.triggerCutscene(p, key); // คิววีดีโอไว้ — afterResolve() จะเล่นให้ก่อนขึ้นสรุปผล
      }
    }
  },

  fireFormUlt(engine, p, key) {
    // โหมดทีม: เอฟเฟกต์ลบทั้งหมด (ดาเมจ/ดีบัฟ/บังคับแตก) ไม่ลงพวกเดียวกัน
    const others = engine.alivePlayers().filter((o) => o.id !== p.id && !engine.friendlyEffectBlocked(o));
    if (key === "kawaii") {
      const heal = engine.healHp(p, KOTONE_KAWAII_HEAL);
      engine.log(`💖 Sekai ichi kawaii watashi! ${p.name} ขึ้นไลฟ์สุดน่ารักใส่ทุกคน — ฟื้นพลังชีวิต +${heal}`);
      for (const t of others) {
        engine.dealDirect(t, KOTONE_KAWAII_DMG); // เจาะเกราะ
        engine.maybeBeatSave(t); engine.maybeBeatMode(t); engine.maybeEva3(t);
        t.wasAttacked = true;
        let stunMsg = "";
        if (t.alive) {
          if (engine.applyDebuff(t, "stun", null, KOTONE_KAWAII_STUN_TURNS)) stunMsg = ` และสตั้น ${KOTONE_KAWAII_STUN_TURNS} เทิร์น`;
          else stunMsg = " (ต้านสถานะผิดปกติ — ไม่ติดสตั้น)";
        }
        engine.log(`💖 ${t.name} โดนไลฟ์เจาะเกราะ -${KOTONE_KAWAII_DMG}${stunMsg}`);
        if (t.alive && t.hp <= 0) { engine.instantDeath(t); if (!t.alive) engine.log(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`); }
      }
    } else if (key === "kcampus") {
      this.grantLove(engine, p);
      const heal = engine.healHp(p, KOTONE_CAMPUS_HEAL);
      engine.log(`🏫 Campus Mode! ${p.name} เปิดโหมดสาวมหาลัย — ฟื้นพลังชีวิต +${heal}`);
      for (const t of others) {
        if (engine.applyDebuff(t, "nohealing", null, KOTONE_CAMPUS_NOHEAL_TURNS)) {
          engine.log(`🚫 ${t.name} ติดสถานะไร้ทางเยียวยา ${KOTONE_CAMPUS_NOHEAL_TURNS} เทิร์น`);
        } else {
          engine.log(`🛡️ ${t.name} ต้านสถานะผิดปกติ — ไม่ติดไร้ทางเยียวยา`);
        }
      }
    } else {
      this.grantLove(engine, p);
      p.kotoneExtraAtk = true; // โจมตีเพิ่มเติม 1 ครั้ง (อ่านที่ postAttackFollowup)
      engine.log(`💞 Self-affirmation Explosion! Love Love! ${p.name} ระเบิดความมั่นใจ — การโจมตีเทิร์นนี้ทำได้เพิ่มอีก 1 ครั้ง`);
    }
    this.forceBustOthers(engine, p, others);
    // "เมื่อใช้สกิล จะกลับร่างปกติทันที"
    delete p.statuses.kready;
    delete p.seen.kready;
  },

  // (รัก รักที่สุดเลย): บัฟการโจมตีครั้งถัดไป — ไม่ลดเทิร์น หมดไปเมื่อได้โจมตี
  grantLove(engine, p) {
    p.statuses.kotoneLove = 1;
    engine.log(`💗 ${p.name} ได้รับบัฟ (รัก รักที่สุดเลย) — การโจมตีครั้งถัดไป +${this.loveDamage(p)} ดาเมจ (กระปุก ${p.piggy || 0}/${KOTONE_PIGGY_MAX} เหรียญ · ทำดาเมจแล้วกระปุกถูกล้างทั้งหมด)`);
  },

  // บังคับแตก: จั่วเพิ่ม + บวกแต้มการ์ดตรงๆ ให้เกินเพดานแน่นอน (แม้เปิดไพ่/ล็อกไปแล้ว)
  //  รูปแบบเดียวกับ Crucible ของ DoomGuy / Ashen Trail ของโอกูริ
  forceBustOthers(engine, p, others) {
    // สนาม Overload Force: เพดาน 21 ถูกปลด ไม่มีการแตก -> การบวกแต้มการ์ดจะกลายเป็นการ "แจกแต้ม" ให้คู่แข่งแทน
    if (engine.overloadForceActive) {
      engine.log(`🎤 ${p.name} พยายามบังคับให้ทุกคนไพ่แตก — แต่สนาม Overload Force ปลดเพดาน 21 อยู่ ไม่มีใครแตกได้`);
      return;
    }
    let hit = 0;
    for (const o of others) {
      for (let i = 0; i < KOTONE_FORCE_BUST_DRAWS; i++) {
        const c = engine.drawCardFor(o);
        if (c) { o.cards.push(c); engine.onCardDrawn(o, c); }
      }
      o.cardBonus = (o.cardBonus || 0) + KOTONE_FORCE_BUST_BONUS;
      o.busted = engine.bustedOf(o);
      o.locked = true;
      engine.voidUltimateOnBust(o);
      engine.maybeMoonBurst(o);
      hit++;
    }
    if (hit > 0) engine.log(`🎤 ${p.name} บังคับให้ทุกคน (ยกเว้นตัวเอง) ไพ่แตกทันที — ${hit} คน`);
  },

  // ---------- สกิลติดตัว: กระปุกออมสิน + ท่านประธานเซนะจัง ----------
  // เรียกจาก addGold() ทุกครั้งที่โคโตเนะได้รับเหรียญจริง
  //  หยอด = "แบ่งเงินที่เพิ่งได้รับ" ไปเก็บ จึงหักออกจากเหรียญในกระเป๋าด้วย (ได้ 1 หยอดได้แค่ 1)
  //  คืนจำนวนที่หยอด เพื่อให้ addGold หักออกจากยอดที่ได้รับจริงได้
  onGoldGained(engine, p, gained) {
    if (!(gained > 0)) return 0;
    if ((p.piggy || 0) >= KOTONE_PIGGY_MAX) return 0;
    if (Math.random() >= KOTONE_PIGGY_CHANCE) return 0;
    const saved = Math.min(gained, KOTONE_PIGGY_MAX_SAVE, KOTONE_PIGGY_MAX - (p.piggy || 0));
    if (!(saved > 0)) return 0;
    p.piggy = (p.piggy || 0) + saved;
    p.gold = Math.max(0, (p.gold || 0) - saved);
    engine.log(`🐷 ${p.name} แบ่งเงินหยอดกระปุกออมสินน้องหมูน้อย ${saved} เหรียญ (กระปุก ${p.piggy}/${KOTONE_PIGGY_MAX} · เหลือในกระเป๋า ${p.gold})`);
    return saved;
  },

  // เรียกจาก endTurn()'s skill-regen loop — สกิลติดตัว: โอกาส 30% ฟื้นแต้มสกิลเพิ่ม 1 หน่วยต่อเทิร์น
  //  คืนจำนวนที่ฟื้นเพิ่ม (0 หรือ 1) ให้ผู้เรียกบวกเข้า gain เอง
  extraSkillRegen(engine, p) {
    if (engine.passiveSealed(p)) return 0; // สกิลติดตัวถูกปิดอยู่ (MOON*CELL / อันนี้ของนายรึเปล่า ฯลฯ)
    if (Math.random() >= KOTONE_REGEN_CHANCE) return 0;
    engine.log(`🎀 ${p.name} กระปุกออมสินน้องหมูน้อย — ซ้อมเก็บแรงได้ แต้มสกิล +${KOTONE_REGEN_AMOUNT} (โอกาส ${Math.round(KOTONE_REGEN_CHANCE * 100)}%)`);
    return KOTONE_REGEN_AMOUNT;
  },

  // เรียกจาก useSkill() หลังใช้สกิลพื้นฐาน/พื้นฐาน 2/สกิลรอง — 20% โดนท่านประธานเซนะจังเจอตัว
  maybeTriggerSena(engine, p, tier, wasForm) {
    if (tier !== "basic" && tier !== "secondary") return;
    if (wasForm) return; // ปุ่มพื้นฐาน/รองในร่าง [พร้อมลุย] คือท่าไม้ตาย ไม่ใช่การไปทำงาน
    if (Math.random() >= KOTONE_SENA_CHANCE) return;
    p.senaNext = true;
    engine.log(`😱 ${p.name} โดนท่านประธานเซนะจังเจอตัว!! — เทิร์นถัดไปสตั้น ${KOTONE_SENA_STUN_TURNS} เทิร์น`);
    if (!p.cutsceneShown.kotoneSena) {
      p.cutsceneShown.kotoneSena = true;
      engine.queueCutscene(p, "kotoneSena");
      engine.pausePlayingForCutscene(); // เล่นวีดีโอทันทีช่วงจั่วการ์ด (แบบ MonsterLive)
    } else {
      engine.notifyTransform(p, "kotoneSena");
    }
  },

  // ---------- ต้นเทิร์น: หลับ (ฮีล/แต้มสกิล) + สตั้นจากท่านประธานเซนะจัง — เรียกจาก dealRound() ----------
  onRoundStartTick(engine, p) {
    if ((p.statuses.ksleep || 0) > 0) {
      p.locked = true;
      const heal = engine.healHp(p, KOTONE_SLEEP_HEAL);
      engine.addSkill(p, KOTONE_SLEEP_SKILL, "passive");
      engine.log(`😴 ${p.name} หลับพักผ่อนอยู่ (เหลืออีก ${p.statuses.ksleep} เทิร์น) — ฟื้นพลังชีวิต +${heal} · แต้มสกิล +${KOTONE_SLEEP_SKILL}`);
    }
    if (p.senaNext) {
      p.senaNext = false;
      if (engine.applyDebuff(p, "stun", null, KOTONE_SENA_STUN_TURNS)) {
        p.locked = true;
        engine.log(`🏃‍♀️ ${p.name} มัวแต่หลบหนีท่านประธานเซนะจัง — สตั้น ${KOTONE_SENA_STUN_TURNS} เทิร์น!`);
      } else {
        engine.log(`🛡️ ${p.name} ต้านสถานะผิดปกติของตัวเอง — ไม่ติดสตั้นจากท่านประธานเซนะจัง`);
      }
    }
  },

  // ---------- การโจมตี ----------
  // ดาเมจ contribution ของ (รัก รักที่สุดเลย) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const loveOn = (attacker.statuses.kotoneLove || 0) > 0;
    const loveDmg = loveOn ? this.loveDamage(attacker) : 0;
    ctx.kotoneLove = loveOn;
    ctx.kotoneLoveDmg = loveDmg;
    return loveDmg;
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ — ใช้บัฟแล้วหมดไป และล้างกระปุกทั้งหมดทันที
  onAttackConsumeLove(engine, attacker) {
    if (!((attacker.statuses.kotoneLove || 0) > 0)) return;
    delete attacker.statuses.kotoneLove;
    const spent = attacker.piggy || 0;
    const dmg = this.loveDamage(attacker);
    attacker.piggy = 0;
    engine.log(`💗 ${attacker.name} รัก รักที่สุดเลย — ทุบกระปุกออมสิน ${spent} เหรียญเป็นดาเมจ +${dmg} (กระปุกถูกล้างทั้งหมด)`);
  },

  // เรียกจาก postAttackFollowup() — Self-affirmation Explosion: โจมตีเพิ่มอีก 1 ครั้ง
  //  คืน true ถ้าเริ่มโจมตีต่อสำเร็จ (ผู้เรียกต้อง return ทันที)
  startExtraAttack(engine, attacker) {
    if (!attacker || !attacker.alive || attacker.characterId !== "kotone") return false;
    if (!attacker.kotoneExtraAtk) return false;
    attacker.kotoneExtraAtk = false;
    const targets = engine.attackableTargets(attacker.id);
    if (targets.length === 0) return false;
    engine.log(`💞 ${attacker.name} Self-affirmation Explosion! Love Love — โจมตีเพิ่มอีกครั้งทันที!`);
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
};
