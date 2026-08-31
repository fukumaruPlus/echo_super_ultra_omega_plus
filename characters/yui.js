// ============================================================
//  ยุย โยชิโอกะ (patch 3.0 new) — ปากแจ๋ว / เยอรมันซูเพล็ก / ทำนองเพลงร็อก
//  + สกิลติดตัว "ความปรารถนา"
//
//  ตัวละคร unique (เลือกได้คนเดียวต่อเกม) และเป็นตัวแรกที่ใช้ระบบ QTE กลางของ engine
//
//  ท่าไม้ตายไม่ได้ทำงานทันทีที่กด — เลือกเพลงก่อน แล้ว server สุ่มลำดับปุ่ม w/a/s/d ตามความยากเพลง
//  (7 / 10 / 5 ตัว · ตัวละ 2 วินาที) กดผิดหรือกดไม่ทัน = แต้มเสียฟรี สกิลไม่ทำงาน
//  แต้มถูกหักไปตั้งแต่ก่อน effect ใน useSkill() อยู่แล้ว การ "เสียฟรี" จึงแค่ไม่เรียก effect เฉยๆ
//
//  หัวใจของตัวละครคือสกิลติดตัว "ความปรารถนา": เล่นครบ 3 เพลงแบบไม่ซ้ำ = ยุยตายทันที
//  ไม่สนระบบกันตายใดๆ (instantDeath(p, true)) แล้วล้างเกราะทุกคน + แปะ "ผุพัง" 5 เทิร์นทั้งสนาม
//  -> ยุยเป็นตัวละครที่ "ยิ่งเล่นเก่ง ยิ่งเข้าใกล้จุดจบของตัวเอง"
//
//  สถานะที่ใช้ (นับเทิร์นปกติทั้งหมด ลดเทิร์นในลูปของ endTurn ได้เลย):
//    yuiTaunt   (ที่ยุย)     1 เทิร์น — ล่อเป้าทุกคน (เข้าคิว taunter เดียวกับริดดี้/ริต้า/แบทแมน)
//    yuiWrestle (ที่ยุย)     3 เทิร์น — ลดดาเมจ 1 + สวนกลับ (statusAmt = จำนวนครั้งที่สวนได้)
//    yuiRock    (ที่เป้าหมาย) 5 เทิร์น — girl don't cry: ATK +1 + เป็นวงที่รับการฟื้นแต้มสกิล
//    yuiBeats   (ที่เป้าหมาย) 5 เทิร์น — my soul your beats: จั่วพร้อมกันทั้งวง + ไพ่แตกเจ็บ
//    yuiWait    (ที่ยุย)     5 เทิร์น — สมบัติล้ำค่าฯ: ยืนเฉยๆ รอเป้าหมายฟื้น
//    yuiMelody  (ที่คนที่ฟื้น) 3 เทิร์น — "ทำนอง": ATK +2
// ============================================================

const ID = "yui";

// ---------- สกิลพื้นฐาน ปากแจ๋ว ----------
const TAUNT_TURNS = 1;
const TAUNT_HEAL = 3;

// ---------- สกิลรอง เยอรมันซูเพล็ก ----------
const WRESTLE_TURNS = 3;
const WRESTLE_REDUCE = 1;        // ความเสียหายที่ได้รับเบาลง
const WRESTLE_COUNTER = 3;       // สวนคืนเมื่อถูกโจมตีปกติ
const WRESTLE_USES = 1;          // สวนได้กี่ครั้ง (girl don't cry ทำให้เป็น 2)
const WRESTLE_USES_ROCK = 2;

// ---------- ท่าไม้ตาย ทำนองเพลงร็อก ----------
const SONG_TURNS = 5;            // ทุกเพลงคงอยู่ 5 เทิร์นเท่ากัน
const QTE_NOTE_MS = 2000;        // แต่ละตัวห่างกัน 2 วินาที
const ROCK_ATK = 1;              // girl don't cry: ATK +1 ทั้งวง
const ROCK_SKILL_REGEN = 1;      // girl don't cry: คนแต้มน้อยสุดในวงได้ +1 ต่อเทิร์น
const BEATS_BUST_DMG = 1;        // my soul your beats: ไพ่แตกรับความเสียหาย
const REVIVE_DELAY = SONG_TURNS; // สมบัติล้ำค่าฯ: ครบ 5 เทิร์นถึงฟื้น
const REVIVE_HP = 5;
const REVIVE_ARMOR = 0;
const REVIVE_RUSH_ALIVE = 1;     // ยุยตายแล้วเหลือคนอื่นไม่เกินเท่านี้ -> เป้าหมายฟื้นทันที ไม่รอครบ 5 เทิร์น
const MELODY_TURNS = 3;          // บัฟ "ทำนอง" ที่คนฟื้นได้รับ
const MELODY_ATK = 2;

// ---------- สกิลติดตัว ความปรารถนา ----------
const WISH_SONGS = 3;            // เล่นครบกี่เพลงแบบไม่ซ้ำถึงจะตาย
const WISH_DECAY_TURNS = 5;      // "ผุพัง" ที่แปะให้ทุกคนตอนยุยตาย

const SONGS = {
  girl_dont_cry: {
    key: "girl_dont_cry",
    name: "girl don't cry",
    notes: 7,
    music: "yui_song1",
    // โหมดทีม: ส่งผลเฉพาะเพื่อนร่วมทีม (เพลงให้กำลังใจ)
    scope: "ally",
    desc: "ATK +1 ทั้งวง · คนแต้มสกิลน้อยสุดในวงได้ +1 ต่อเทิร์น · เยอรมันซูเพล็กสวนได้ 2 ครั้ง",
  },
  my_soul_your_beats: {
    key: "my_soul_your_beats",
    name: "my soul your beats",
    notes: 10,
    music: "yui_song2",
    // โหมดทีม: ส่งผลเฉพาะทีมฝ่ายตรงข้าม (เพลงก่อกวน)
    scope: "enemy",
    desc: "ใครจั่วการ์ด คนอื่นในวงจั่วตามด้วย · ไพ่แตกรับความเสียหาย 1 หน่วย",
  },
  treasure: {
    key: "treasure",
    name: "สมบัติล้ำค่าที่สุด.....",
    notes: 5,
    music: "yui_song3",
    scope: "self",
    desc: "ชุบชีวิตผู้เล่นที่ตกรอบ 1 คนเมื่อครบ 5 เทิร์น — ระหว่างนั้นยุยทำอะไรไม่ได้เลย",
  },
};

const IMG = {
  base: "/characters/yui/yui.webp",
  skill1: "/characters/yui/skill1/yui_skill1.webp",
  skill2: "/characters/yui/skill2/yui_skill2.jpg",
  skill3: "/characters/yui/skill3/yui_skill3.jpg",
};

function isYui(p) { return !!p && p.characterId === ID; }
function wrestleOn(p) { return ((p && p.statuses && p.statuses.yuiWrestle) || 0) > 0; }
function rockOn(p) { return ((p && p.statuses && p.statuses.yuiRock) || 0) > 0; }
function beatsOn(p) { return ((p && p.statuses && p.statuses.yuiBeats) || 0) > 0; }
function waitOn(p) { return ((p && p.statuses && p.statuses.yuiWait) || 0) > 0; }

function yuiOf(engine) {
  return Object.values(engine.players).find((p) => isYui(p) && p.alive) || null;
}

// ผู้เล่นที่เพลงนี้จะลงผล — โหมดทีมเท่านั้นที่แยกฝ่าย (ffa/overload = ทุกคนเสมอ)
//  ally  = ยุย + เพื่อนร่วมทีม | enemy = ทุกคนที่ไม่ใช่พวกเดียวกับยุย
function songAudience(engine, yui, scope) {
  const all = engine.alivePlayers();
  if (!engine.teamModeActive || !engine.teamModeActive()) return all;
  if (scope === "ally") return all.filter((o) => o.id === yui.id || engine.sameTeam(yui, o));
  if (scope === "enemy") return all.filter((o) => o.id !== yui.id && !engine.sameTeam(yui, o));
  return all;
}

module.exports = {
  id: ID,
  IMG,
  SONGS,
  TAUNT_TURNS,
  TAUNT_HEAL,
  WRESTLE_TURNS,
  WRESTLE_REDUCE,
  WRESTLE_COUNTER,
  WRESTLE_USES,
  WRESTLE_USES_ROCK,
  SONG_TURNS,
  QTE_NOTE_MS,
  ROCK_ATK,
  ROCK_SKILL_REGEN,
  BEATS_BUST_DMG,
  REVIVE_DELAY,
  REVIVE_HP,
  REVIVE_ARMOR,
  REVIVE_RUSH_ALIVE,
  MELODY_TURNS,
  MELODY_ATK,
  WISH_SONGS,
  WISH_DECAY_TURNS,

  // ---------- ฟิลด์เฉพาะตัวละคร: ต้องล้างทุกแมตช์ใหม่ (เรียกจาก resetCombat ของ server.js) ----------
  resetCombat(p) {
    p.yuiSongs = [];             // คีย์เพลงที่เล่นสำเร็จไปแล้ว (ไม่ซ้ำกัน — ครบ 3 = ตาย)
    p.yuiPendingSong = null;     // เพลงที่เลือกไว้ ระหว่างรอเล่น QTE ให้จบ
    p.yuiReviveTargetId = null;  // สมบัติล้ำค่าฯ: คนที่รอฟื้น
    p.yuiReviveRound = 0;        // รอบที่เป้าหมายจะฟื้น (0 = ไม่มีคิว)
    p.yuiDrawEcho = false;       // กันลูป: กำลังจั่วตามคนอื่นอยู่ ห้ามยิงจั่วตามซ้อน
    p.yuiWishDeath = false;      // ตายด้วยสกิลติดตัว (ใช้เลือกวีดีโอไว้อาลัย)
  },

  // ---------- สกิลรอง: ความเสียหายที่ยุยได้รับเบาลง 1 หน่วย ----------
  adjustIncomingDamage(engine, p, n) {
    if (!isYui(p) || n <= 0 || !wrestleOn(p)) return n;
    return Math.max(0, n - WRESTLE_REDUCE);
  },

  // ---------- ต้นเทิร์น ----------
  onRoundStartTick(engine, p) {
    if (!isYui(p) || !p.alive) return;
    // สมบัติล้ำค่าฯ: ยืนเฉยๆ รอเป้าหมายฟื้น — ล็อกมือเหมือนสตั้น (จั่ว/สกิล/ไอเทมไม่ได้)
    if (waitOn(p)) {
      p.locked = true;
      engine.log(`🎵 ${p.name} กำลังบรรเลงเพลงชุบชีวิต — ทำอะไรไม่ได้เลย (เหลืออีก ${p.statuses.yuiWait} เทิร์น)`);
    }
  },

  // girl don't cry: คนแต้มสกิลน้อยสุดในวงได้ +1 ต่อเทิร์น — ประเมินใหม่ทุกเทิร์น
  //  ต้องเรียก "หลังลูปต้นเทิร์นจบทั้งวง" ไม่งั้นผลจะไม่เท่ากันตามลำดับที่นั่ง (คนที่ลูปยังวนไม่ถึง
  //  จะถูกนับด้วยแต้มของเทิร์นที่แล้ว) — เหตุผลเดียวกับ escanor.flushPendingBurn
  onRoundStartAfterLoop(engine) {
    const band = engine.alivePlayers().filter((o) => rockOn(o));
    if (!band.length) return;
    let low = null;
    for (const o of band) if (!low || o.skillPoints < low.skillPoints) low = o;
    if (!low) return;
    const before = low.skillPoints;
    engine.addSkill(low, ROCK_SKILL_REGEN, "passive");
    const got = low.skillPoints - before;
    if (got > 0) engine.log(`🎶 girl don't cry — ${low.name} มีแต้มสกิลน้อยที่สุดในวง ได้รับ +${got}`);
  },

  // ---------- useSkill: ด่านเงื่อนไขก่อนหักแต้ม ----------
  canUseSkill(engine, p, tier) {
    if (!isYui(p)) return true;
    if (p.qte) return false;                       // กำลังเล่น QTE ค้างอยู่
    if (waitOn(p)) return false;                   // ระหว่างบรรเลงเพลงชุบชีวิต ทำอะไรไม่ได้
    if (tier === "secondary") return !wrestleOn(p); // "นักมวยปล้ำ" ยังอยู่ = กดซ้ำไม่ได้
    return true;
  },

  // ---------- useSkill: ลงผลของสกิล ----------
  applyInstantSkill(engine, p, tier, songKey) {
    if (!isYui(p)) return "";
    if (tier === "basic") return this.applyTaunt(engine, p);
    if (tier === "secondary") return this.applyWrestle(engine, p);
    if (tier === "ultimate") return this.beginSong(engine, p, songKey);
    return "";
  },

  // ---------- สกิลพื้นฐาน ปากแจ๋ว ----------
  applyTaunt(engine, p) {
    p.statuses.yuiTaunt = TAUNT_TURNS;
    const healed = engine.healHp(p, TAUNT_HEAL);
    engine.log(`📣 ${p.name} ปากแจ๋ว — ด่าจนทุกคนหันมามองตัวเอง ${TAUNT_TURNS} เทิร์น และฟื้นพลังชีวิต +${healed}`);
    return ` — ล่อเป้า ${TAUNT_TURNS} เทิร์น · พลังชีวิต +${healed}`;
  },
  // ล่อเป้า — เข้าคิว taunter เดียวกับริดดี้/ริต้า/แบทแมน (doAttack กระจายผู้โจมตีตามตำแหน่ง)
  findTaunters(engine, attacker) {
    return engine.alivePlayers().filter(
      (r) => r.id !== attacker.id && isYui(r) && (r.statuses.yuiTaunt || 0) > 0 && !engine.sealActive(r)
    );
  },

  // ---------- สกิลรอง เยอรมันซูเพล็ก ----------
  applyWrestle(engine, p) {
    const uses = rockOn(p) ? WRESTLE_USES_ROCK : WRESTLE_USES;
    p.statuses.yuiWrestle = WRESTLE_TURNS;
    p.statusAmt.yuiWrestle = uses;
    engine.log(`🤼 ${p.name} เยอรมันซูเพล็ก — ได้สถานะ "นักมวยปล้ำ" ${WRESTLE_TURNS} เทิร์น: รับความเสียหายเบาลง ${WRESTLE_REDUCE} หน่วย และสวนคืนผู้ที่โจมตีปกติใส่ ${WRESTLE_COUNTER} หน่วย (${uses} ครั้ง)`);
    return ` — นักมวยปล้ำ (สวนได้ ${uses} ครั้ง)`;
  },

  // ถูกโจมตีปกติ -> สวนกลับ (เรียกจาก doAttack หลังลงดาเมจ · คืน { dmg } เมื่อสวนสำเร็จ)
  //  วีดีโอเข้าคิวไว้ให้ doAttack เล่นก่อนขึ้นสรุปความเสียหาย
  onAttackedNormally(engine, attacker, target) {
    if (!isYui(target) || !target.alive || !attacker || !attacker.alive) return null;
    if (attacker.id === target.id || !wrestleOn(target)) return null;
    if (engine.sameTeam(target, attacker)) return null;

    const left = (target.statusAmt.yuiWrestle || WRESTLE_USES) - 1;
    engine.queueCutscene(target, "yuiSuplex"); // yui_skill2.mp4 เล่นก่อนเกิดความเสียหาย
    engine.withEffectSource(target, () => {
      engine.dealMixed(attacker, WRESTLE_COUNTER);
      attacker.wasAttacked = true;
      engine.maybeBeatSave(attacker); engine.maybeBeatMode(attacker); engine.maybeEva3(attacker); engine.maybeWakeKotone(attacker);
    });
    engine.log(`🤼 ${target.name} เยอรมันซูเพล็ก — จับ ${attacker.name} ทุ่มสวนกลับ -${WRESTLE_COUNTER}`);
    if (attacker.alive && attacker.hp <= 0) {
      engine.instantDeath(attacker);
      if (!attacker.alive) engine.log(`💀 ${attacker.name} เลือดจริงหมด ตกรอบ!`);
    }
    // สวนครบโควตาแล้ว = สถานะจบก่อนกำหนด (สเปคระบุชัด)
    if (left <= 0) {
      delete target.statuses.yuiWrestle;
      delete target.statusAmt.yuiWrestle;
      engine.log(`🤼 ${target.name} ใช้ท่าทุ่มครบโควตาแล้ว — "นักมวยปล้ำ" สิ้นสุดลง`);
    } else {
      target.statusAmt.yuiWrestle = left;
      engine.log(`🤼 ${target.name} ยังทุ่มได้อีก ${left} ครั้ง`);
    }
    return { dmg: WRESTLE_COUNTER, videoQueued: true };
  },

  // ---------- ท่าไม้ตาย: เลือกเพลงแล้วเริ่ม QTE ----------
  //  ยังไม่ลงผลอะไรทั้งสิ้นตรงนี้ — รอผล QTE ที่ onQteDone
  beginSong(engine, p, songKey) {
    const song = SONGS[songKey];
    if (!song) return "";
    p.yuiPendingSong = song.key;
    engine.startQte(p, { count: song.notes, perNoteMs: QTE_NOTE_MS, tag: ID });
    engine.log(`🎸 ${p.name} ทำนองเพลงร็อก — เริ่มบรรเลง "${song.name}" (${song.notes} ตัวโน้ต ตัวละ ${QTE_NOTE_MS / 1000} วินาที)`);
    return ` — ${song.name}`;
  },

  // เพลงที่เลือกได้ตอนนี้ (client เอาไปทำเมนู) — เล่นซ้ำเพลงเดิมได้ แต่ไม่นับเพิ่มในสกิลติดตัว
  songChoices(p) {
    return Object.values(SONGS).map((s) => ({
      key: s.key, name: s.name, notes: s.notes, desc: s.desc,
      played: (p.yuiSongs || []).includes(s.key),
    }));
  },

  // ---------- ผล QTE (เรียกจากระบบกลางของ engine) ----------
  onQteDone(engine, p, ok, qte) {
    const songKey = p.yuiPendingSong;
    p.yuiPendingSong = null;
    const song = SONGS[songKey];
    if (!song) return;
    if (!ok) {
      engine.queueCutscene(p, "yuiSongFail"); // yui_skill3_false.mp4
      engine.log(`🎸💔 ${p.name} บรรเลง "${song.name}" ไม่สำเร็จ (${qte.idx}/${qte.keys.length} ตัวโน้ต) — แต้มสกิลเสียฟรี สกิลไม่ทำงาน`);
      return;
    }
    engine.queueCutscene(p, "yuiSong"); // yui_skill3.mp4
    p.transformAt = engine.nextTransformCounter(); // ลำดับเพลงประจำสกิล
    this.applySong(engine, p, song);

    // ---------- สกิลติดตัว ความปรารถนา ----------
    p.yuiSongs = p.yuiSongs || [];
    if (!p.yuiSongs.includes(song.key)) p.yuiSongs.push(song.key);
    if (p.yuiSongs.length >= WISH_SONGS) this.fulfillWish(engine, p);
  },

  applySong(engine, p, song) {
    const audience = songAudience(engine, p, song.scope);
    if (song.key === "girl_dont_cry") {
      for (const o of audience) o.statuses.yuiRock = SONG_TURNS;
      engine.log(`🎶 girl don't cry — ${audience.length} คนได้พลังโจมตี +${ROCK_ATK} เป็นเวลา ${SONG_TURNS} เทิร์น และคนที่แต้มสกิลน้อยสุดในวงจะได้ +${ROCK_SKILL_REGEN} ทุกเทิร์น`);
      return;
    }
    if (song.key === "my_soul_your_beats") {
      for (const o of audience) o.statuses.yuiBeats = SONG_TURNS;
      engine.log(`🎶 my soul your beats — ${audience.length} คนถูกดึงเข้าจังหวะเดียวกัน ${SONG_TURNS} เทิร์น: ใครจั่วการ์ด คนอื่นในวงจั่วตามด้วย และไพ่แตกรับความเสียหาย ${BEATS_BUST_DMG} หน่วย`);
      return;
    }
    // สมบัติล้ำค่าที่สุด..... : เป้าหมายถูกเลือกไว้ตั้งแต่ตอนกด (prepareTarget) แล้ว
    const t = p.yuiReviveTargetId && engine.players[p.yuiReviveTargetId];
    if (!t) {
      engine.log(`🎶 สมบัติล้ำค่าที่สุด..... — ไม่มีใครให้ชุบชีวิตแล้ว เพลงจึงบรรเลงไปเปล่าๆ`);
      return;
    }
    p.statuses.yuiWait = SONG_TURNS;
    p.locked = true;
    p.yuiReviveRound = engine.roundNumber + REVIVE_DELAY;
    engine.log(`🎶 ${p.name} สมบัติล้ำค่าที่สุด..... — บรรเลงเรียก ${t.name} กลับมา อีก ${REVIVE_DELAY} เทิร์น · ระหว่างนี้ยุยทำอะไรไม่ได้เลย`);
  },

  // เป้าหมายชุบชีวิตที่เลือกไว้ (ต้องเป็นคนที่ตกรอบไปแล้ว)
  prepareReviveTarget(engine, p, targets) {
    const id = Array.isArray(targets) ? targets[0] : targets;
    const t = id && engine.players[id];
    if (!t || t.alive || t.id === p.id) return null;
    return t;
  },
  deadTargets(engine, p) {
    return Object.values(engine.players).filter((o) => !o.alive && o.id !== p.id && !o.isBoss);
  },

  // ---------- ครบกำหนดชุบชีวิต — เรียกจาก dealRound() ----------
  maybeRevive(engine, yui) {
    if (!isYui(yui) || !yui.yuiReviveRound) return false;
    if (!yui.alive) { // ยุยตายก่อน = ผลหายไป (สเปคระบุชัด) — ยกเว้นกรณีเหลือแค่เรากับเป้าหมาย (ดู onYuiDeath)
      yui.yuiReviveRound = 0;
      yui.yuiReviveTargetId = null;
      return false;
    }
    if (engine.roundNumber < yui.yuiReviveRound) return false;
    const t = yui.yuiReviveTargetId && engine.players[yui.yuiReviveTargetId];
    yui.yuiReviveRound = 0;
    yui.yuiReviveTargetId = null;
    delete yui.statuses.yuiWait;
    if (!t || t.alive) return false;
    this.reviveTarget(engine, t, "สมบัติล้ำค่าที่สุด..... —");
    return true;
  },

  // ชุบชีวิตจริง — ใช้ร่วมกันทั้งทางปกติ (ครบ 5 เทิร์น) และทางลัดตอนยุยตายแบบไม่เหลือใคร
  reviveTarget(engine, t, prefix) {
    t.alive = true;
    t.hp = Math.min(engine.maxHpOf(t), REVIVE_HP);
    t.armor = REVIVE_ARMOR;
    t.shield = 0;
    t.result = null;
    t.locked = false;
    t.statuses = {};
    t.statusAmt = {};
    t.statuses.yuiMelody = MELODY_TURNS;
    engine.log(`🎵✨ ${prefix} ${t.name} กลับมามีชีวิตอีกครั้ง! (พลังชีวิต ${t.hp} เกราะ ${t.armor}) พร้อมบัฟ "ทำนอง" พลังโจมตี +${MELODY_ATK} เป็นเวลา ${MELODY_TURNS} เทิร์น`);
  },

  // ---------- ยุยตกรอบขณะยังมีคิวชุบชีวิตค้างอยู่ ----------
  //  ปกติ "ยุยตายก่อน = ผลหายไป" ตามสเปค — แต่ถ้าตายแล้วไม่เหลือใครอีกเลย (หรือเหลือคนเดียว)
  //  การปล่อยให้ผลหายไปจะทำให้เป้าหมายค้างตายถาวรและเกมจบแบบไม่มีใครได้อะไร
  //  เคสที่เจอจริง: บรรเลงเพลงชุบชีวิตเป็นเพลงที่ 3 พอดี -> "ความปรารถนา" ฆ่ายุยทันทีในจังหวะเดียวกัน
  //  -> กรณีนี้ให้เป้าหมายฟื้นทันที ไม่ต้องรอครบ 5 เทิร์น
  //  เรียกจาก instantDeath() หลังตั้ง p.alive = false แล้ว
  onDeath(engine, p) {
    if (!isYui(p) || !p.yuiReviveRound) return;
    const othersAlive = engine.alivePlayers().filter((o) => o.id !== p.id).length;
    if (othersAlive > REVIVE_RUSH_ALIVE) return; // ยังมีคนเล่นต่อได้ — ผลหายไปตามสเปคเดิม
    const t = p.yuiReviveTargetId && engine.players[p.yuiReviveTargetId];
    p.yuiReviveRound = 0;
    p.yuiReviveTargetId = null;
    delete p.statuses.yuiWait;
    if (!t || t.alive) return;
    this.reviveTarget(engine, t, `${p.name} จากไปพร้อมเสียงเพลงสุดท้าย —`);
  },

  // ---------- สกิลติดตัว ความปรารถนา: เล่นครบ 3 เพลง = ตายทันที ----------
  fulfillWish(engine, yui) {
    yui.yuiWishDeath = true;
    engine.log(`🌠 ${yui.name} ความปรารถนา — บรรเลงครบทั้ง 3 เพลงแล้ว คำอธิษฐานเป็นจริง และเธอต้องจากไป`);
    engine.queueCutscene(yui, "yuiDead"); // yui_dead.mp4 — ไว้อาลัย
    // ตายแบบไม่สนระบบกันตายใดๆ ตามสเปค ("ไม่สนเงื่อนไขอื่นๆ")
    engine.instantDeath(yui, true);
    // ล้างเกราะทุกคน + แปะ "ผุพัง" 5 เทิร์นทั้งสนาม (รวมคนที่รอดจากการกันตายด้วย)
    for (const o of engine.alivePlayers()) {
      if (o.armor > 0) {
        engine.log(`🥀 ${o.name} เกราะสลายหมดจากคำอธิษฐานของ ${yui.name} (-${o.armor})`);
        o.armor = 0;
      }
      if (engine.applyDebuff(o, "decay", null, WISH_DECAY_TURNS)) engine.log(`🥀 ${o.name} ติดสถานะ "ผุพัง" ${WISH_DECAY_TURNS} เทิร์น`);
      else engine.log(`🛡️ ${o.name} ต้านสถานะผิดปกติ — ไม่ติด "ผุพัง"`);
    }
  },

  // ---------- my soul your beats: ใครจั่ว คนอื่นในวงจั่วตาม ----------
  //  เรียกจาก hit() หลังผู้เล่นจั่วได้ไพ่จริงแล้ว
  //  กันลูปด้วย p.yuiDrawEcho — ไพ่ที่จั่วตามต้องไม่ไปกระตุ้นให้คนอื่นจั่วตามซ้อนอีกชั้น
  onCardDraw(engine, drawer) {
    if (!beatsOn(drawer) || isYui(drawer)) return;   // ยุยจั่วไม่นับ (สเปค)
    if (drawer.yuiDrawEcho) return;                  // นี่คือไพ่ที่จั่วตามอยู่แล้ว
    for (const o of engine.alivePlayers()) {
      if (o.id === drawer.id || isYui(o) || !beatsOn(o)) continue;
      if (o.locked) continue;                        // เปิดไพ่ไปแล้ว = แต้มหยุดอยู่แค่นั้น
      o.yuiDrawEcho = true;
      try {
        const c = engine.drawCardFor(o);
        if (c) {
          o.cards.push(c);
          engine.onCardDrawn(o, c);
          o.busted = engine.bustedOf(o);
          if (o.busted) engine.voidUltimateOnBust(o);
          engine.log(`🎶 my soul your beats — ${o.name} ถูกดึงให้จั่วตาม ${drawer.name}`);
        }
      } finally { o.yuiDrawEcho = false; }
    }
  },

  // ---------- my soul your beats: ไพ่แตกรับความเสียหาย ----------
  //  เรียกจาก afterResolve() (รู้ผลไพ่แตกครบแล้ว) — เกิดกับหลายคนพร้อมกันได้
  onAfterResolve(engine) {
    const yui = yuiOf(engine);
    if (!yui) return;
    for (const o of engine.alivePlayers()) {
      if (isYui(o) || !beatsOn(o) || !engine.bustedOf(o)) continue;
      engine.withEffectSource(yui, () => {
        engine.dealMixed(o, BEATS_BUST_DMG);
        o.wasAttacked = true;
        engine.maybeBeatSave(o); engine.maybeBeatMode(o); engine.maybeEva3(o); engine.maybeWakeKotone(o);
      });
      engine.log(`🎶💥 my soul your beats — ${o.name} ไพ่แตกกลางจังหวะเพลง รับความเสียหาย -${BEATS_BUST_DMG}`);
      if (o.alive && o.hp <= 0) {
        engine.instantDeath(o);
        if (!o.alive) engine.log(`💀 ${o.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
  },

  // เพลงประจำตัว — เล่นค้างตลอดที่เพลงยังทำงาน (เรียกจาก activeSkillMusic)
  activeMusic(engine) {
    let best = null;
    for (const p of engine.alivePlayers()) {
      if (!isYui(p)) continue;
      const key = waitOn(p) ? "yui_song3"
        : rockOn(p) ? "yui_song1"
        : beatsOn(p) ? "yui_song2"
        : null;
      // โหมดทีมอาจทำให้ยุยไม่ได้ติดสถานะของเพลงตัวเอง (my soul ลงเฉพาะฝ่ายตรงข้าม) -> ดูจากวงแทน
      const fallback = !key && engine.alivePlayers().some((o) => beatsOn(o)) ? "yui_song2" : key;
      const music = key || fallback;
      if (!music) continue;
      if (!best || (p.transformAt || 0) > best.at) best = { music, at: p.transformAt || 0 };
    }
    return best;
  },
};
