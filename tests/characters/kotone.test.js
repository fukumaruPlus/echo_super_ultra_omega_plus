const test = require('node:test');
const assert = require('node:assert/strict');
const kotone = require('../../characters/kotone.js');
const universal = require('../../characters/_universal_status.js');
const kotoneCharacter = require('../../characters.js').CHARACTERS.find((c) => c.id === 'kotone');

function mkPlayer(over = {}) {
  return Object.assign({
    id: 'p1', name: 'Kotone', characterId: 'kotone', alive: true,
    hp: 7, armor: 3, shield: 0, skillPoints: 8, gold: 0, piggy: 0,
    cards: [], cardBonus: 0, locked: false, busted: false,
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {}, evadeStacks: [],
    senaNext: false, kotoneExtraAtk: false,
  }, over);
}
function mkFoe(id, over = {}) {
  return Object.assign({
    id, name: id, characterId: 'tohno', alive: true, hp: 5, armor: 2, shield: 0,
    cards: [], cardBonus: 0, locked: false, busted: false,
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
  }, over);
}

function mkEngine(players, over = {}) {
  const logs = [];
  const engine = Object.assign({
    players,
    CHAR_BY_ID: { kotone: kotoneCharacter },
    roundNumber: 1,
    SPELLBURDEN_MAX: universal.SPELLBURDEN_MAX,
    // ภาระเวทต้องผ่าน helper กลางเสมอ — stub จึงต่อกับของจริง ไม่จำลองเอง
    applySpellburden: universal.applySpellburden,
    passiveSealed: () => false,
    setTurnsNoRefresh: universal.setTurnsNoRefresh,
    ATTACK_TIME: 15,
    GOLD_MAX: 30,
    overloadForceActive: false,
    logs,
    log: (m) => logs.push(m),
    alivePlayers: () => Object.values(players).filter((p) => p.alive),
    isNightRound: () => false,
    resistActive: () => false,
    friendlyEffectBlocked: () => false,
    nextTransformCounter: () => 1,
    withEffectSource: (_src, fn) => fn(),
    addGold(p, n) {
      const cap = p.characterId === 'kotone' ? kotone.GOLD_CAP : 30;
      const before = p.gold || 0;
      if (before >= cap) return 0;
      p.gold = Math.min(cap, before + n);
      const gained = p.gold - before;
      const saved = p.characterId === 'kotone' ? (kotone.onGoldGained(engine, p, gained) || 0) : 0;
      return gained - saved;
    },
    cleanseDebuffs(p) {
      let purged = 0;
      for (const k of ['stun', 'spellburden', 'weak', 'nohealing', 'sleep', 'nodraw']) {
        if ((p.statuses[k] || 0) > 0) { delete p.statuses[k]; delete p.statusAmt[k]; purged++; }
      }
      return purged;
    },
    addSkill(p, n) { p.skillPoints = Math.min(8, (p.skillPoints || 0) + n); },
    healHp(p, n) { const before = p.hp; p.hp = Math.min(7, p.hp + n); return p.hp - before; },
    loseHp(p) { p.hp -= 1; },
    dealDirect(t, n) { t.hp -= n; },
    instantDeath(t) { t.hp = 0; t.alive = false; },
    applyDebuff(p, key, _amt, turns) { p.statuses[key] = Math.max(p.statuses[key] || 0, turns); return true; },
    maybeBeatSave() {}, maybeBeatMode() {}, maybeEva3() {}, maybeMoonBurst() {},
    voidUltimateOnBust() {},
    drawCardFor: () => ({ value: 10, color: 'red' }),
    onCardDrawn() {},
    bustedOf: (p) => (p.cardBonus || 0) + p.cards.reduce((s, c) => s + c.value, 0) > 21,
    triggerCutscene(p, key) { (engine.cutscenes ||= []).push(key); },
    queueCutscene(p, key) { (engine.cutscenes ||= []).push(key); },
    notifyTransform() {},
    pausePlayingForCutscene() {},
    attackableTargets: (id) => Object.values(players).filter((p) => p.alive && p.id !== id),
    setAttackerId() {}, setGameState() {}, startPhaseTimer() {}, broadcastState() {}, doAttack() {}, endTurn() {},
  }, over);
  engine.cutscenes = [];
  return engine;
}

// ---------- สกิลติดตัว: กระปุกออมสินน้องหมูน้อย ----------
test('เพดานเหรียญของโคโตเนะคือ 45 และกระปุกออมสินเก็บได้ 15', () => {
  assert.equal(kotone.GOLD_CAP, 45);
  assert.equal(kotone.PIGGY_MAX, 15);
});

test('คอส/ชื่อสกิลตรงตามสเปก และท่าไม้ตาย 1 ทำงานก่อนเปิดการ์ด', () => {
  const c = kotoneCharacter;
  assert.equal(c.basic.cost, 1);
  assert.equal(c.ultimate.cost, 4);
  assert.equal(c.ultimate.instant, true, 'หนูพร้อมแล้วคะ ทำงานก่อนเปิดการ์ด');
  assert.equal(c.basicNight.name, 'Part-time Night');
  assert.equal(c.basicNight.cost, 1);
  assert.equal(c.secondaryNight.name, 'แอบซ้อม');
  assert.equal(c.secondaryNight.cost, 2);
  assert.equal(c.ultimateNight.cost, 4);
  for (const s of [c.basic3, c.secondary3, c.ultimate3]) {
    assert.equal(s.cost, 6);
    assert.equal(s.instant, undefined, 'ท่าไม้ตายในร่างทำงานหลังเปิดการ์ด');
  }
  assert.equal(kotone.FORM_ULT_GOLD, 6);
});

test('เพลงของท่าไม้ตาย 3/4/5 เป็น music (ขึ้นหลังปล่อยท่า) ไม่ใช่ voice ที่ทับวีดีโอ', () => {
  const TRANSFORMS = require('../../characters/_transforms.js')({});
  for (const [key, track] of [['kawaii', 'kotone_ult3'], ['kcampus', 'kotone_ult4'], ['kshuki', 'kotone_ult5']]) {
    assert.equal(TRANSFORMS[key].music, track, `${key} ต้องใช้ music`);
    assert.equal(TRANSFORMS[key].voice, undefined, `${key} ต้องไม่มี voice (เดิมเล่นทับวีดีโอ)`);
    assert.ok(TRANSFORMS[key].video, `${key} ต้องมีวีดีโอ`);
  }
  assert.equal(TRANSFORMS.kready.music, 'kotone_ult1');
  assert.equal(TRANSFORMS.kready.video, null, 'ท่าไม้ตาย 1 มีแค่ภาพ+เพลง ไม่มีวีดีโอ');
  assert.equal(TRANSFORMS.kready.afterReveal, false, 'ทำงานก่อนเปิดการ์ดแล้ว');
});

test('onGoldGained หยอดเท่าที่ได้รับ (สูงสุด 3) และหักออกจากเหรียญในกระเป๋า', () => {
  const rnd = Math.random;
  Math.random = () => 0; // 0 < 0.6 = โรลติดเสมอ
  try {
    // ได้ 1 หยอดได้แค่ 1
    const a = mkPlayer({ gold: 1 });
    assert.equal(kotone.onGoldGained(mkEngine({ p1: a }), a, 1), 1);
    assert.equal(a.piggy, 1);
    assert.equal(a.gold, 0, 'หักออกจากกระเป๋า');

    // ได้ 2 หยอด 2
    const b = mkPlayer({ gold: 2 });
    assert.equal(kotone.onGoldGained(mkEngine({ p1: b }), b, 2), 2);
    assert.equal(b.piggy, 2);
    assert.equal(b.gold, 0);

    // ได้ 6 หยอดได้สูงสุด 3
    const c = mkPlayer({ gold: 6 });
    assert.equal(kotone.onGoldGained(mkEngine({ p1: c }), c, 6), 3);
    assert.equal(c.piggy, 3);
    assert.equal(c.gold, 3);

    // กระปุกใกล้เต็ม -> หยอดได้เท่าที่เหลือ
    const d = mkPlayer({ gold: 6, piggy: 14 });
    assert.equal(kotone.onGoldGained(mkEngine({ p1: d }), d, 6), 1);
    assert.equal(d.piggy, 15);
    assert.equal(d.gold, 5);

    // กระปุกเต็มแล้ว -> ไม่หยอด ไม่หักเงิน
    const f = mkPlayer({ gold: 6, piggy: 15 });
    assert.equal(kotone.onGoldGained(mkEngine({ p1: f }), f, 6), 0);
    assert.equal(f.gold, 6);

    Math.random = () => 0.9; // 0.9 >= 0.6 = โรลไม่ติด
    const g = mkPlayer({ gold: 6 });
    assert.equal(kotone.onGoldGained(mkEngine({ p1: g }), g, 6), 0);
    assert.equal(g.piggy, 0);
    assert.equal(g.gold, 6, 'ไม่หักเงินเมื่อไม่ได้หยอด');
  } finally { Math.random = rnd; }
});

// ---------- Part-time / Dance Lession ----------
test('Part-time กลางวันได้เหรียญ 1-6 · กลางคืนได้ 3-8 และเสียเลือด 1', () => {
  const rnd = Math.random;
  Math.random = () => 0.99; // roll สูงสุดเสมอ (และกันกระปุกไม่ให้หยอด)
  try {
    const day = mkPlayer();
    kotone.applyPartTime(mkEngine({ p1: day }), day, false);
    assert.equal(day.gold, 6);
    assert.equal(day.hp, 7, 'กลางวันไม่เสียเลือด');

    const night = mkPlayer();
    kotone.applyPartTime(mkEngine({ p1: night }), night, true);
    assert.equal(night.gold, 8);
    assert.equal(night.hp, 6, 'กลางคืนเสียเลือด 1');
  } finally { Math.random = rnd; }
});

test('Dance Lession สะสม [ความพร้อม] · กลางคืน +2 พร้อมภาระเวทและเสียเลือด 2', () => {
  const day = mkPlayer();
  kotone.applyDance(mkEngine({ p1: day }), day, false);
  assert.equal(kotone.readyStacks(day), 1);
  assert.equal(day.statuses.spellburden, undefined);

  const night = mkPlayer();
  kotone.applyDance(mkEngine({ p1: night }), night, true);
  assert.equal(kotone.readyStacks(night), 2);
  assert.equal(night.statuses.spellburden, 2);
  assert.equal(night.statusAmt.spellburden, 1);
  assert.equal(night.hp, 5, 'เสียเลือด 2');
});

test('[ความพร้อม] สะสมได้สูงสุด 4 หน่วย — ซ้อมเกินไม่เก็บ', () => {
  assert.equal(kotone.READY_MAX, 4);

  const p = mkPlayer({ statuses: { kotoneReady: 4 } });
  kotone.applyDance(mkEngine({ p1: p }), p, false);
  assert.equal(kotone.readyStacks(p), 4, 'เต็มแล้วกดอีกก็ไม่เกิน 4');

  // กลางคืน +2 จาก 3 -> ตัดที่ 4 (ผลข้างเคียงกลางคืนยังทำงานตามปกติ)
  const q = mkPlayer({ statuses: { kotoneReady: 3 } });
  kotone.applyDance(mkEngine({ p1: q }), q, true);
  assert.equal(kotone.readyStacks(q), 4);
  assert.equal(q.statuses.spellburden, 2, 'ยังติดภาระเวทแม้ได้ความพร้อมไม่เต็มจำนวน');
  assert.equal(q.hp, 5, 'ยังเสียเลือด 2');
});

test('สกิลติดตัว: โอกาส 30% ฟื้นแต้มสกิล +1 ต่อเทิร์น (ปิดได้ด้วย passiveSealed)', () => {
  const rnd = Math.random;
  try {
    const p = mkPlayer();
    Math.random = () => 0.1; // 0.1 < 0.3 = ติด
    assert.equal(kotone.extraSkillRegen(mkEngine({ p1: p }), p), 1);

    Math.random = () => 0.5; // 0.5 >= 0.3 = ไม่ติด
    assert.equal(kotone.extraSkillRegen(mkEngine({ p1: p }), p), 0);

    Math.random = () => 0.1;
    const sealed = mkEngine({ p1: p }, { passiveSealed: () => true });
    assert.equal(kotone.extraSkillRegen(sealed, p), 0, 'สกิลติดตัวถูกปิด = ไม่ฟื้น');
  } finally { Math.random = rnd; }
});

// ---------- ท่าไม้ตาย 1 + ร่าง [พร้อมลุย] ----------
test('ท่าไม้ตาย 1 กดได้ต่อเมื่อ [ความพร้อม] ครบตาม READY_NEED และหักครบตอนเข้าร่าง', () => {
  const p = mkPlayer({ statuses: { kotoneReady: kotone.READY_NEED - 1 } });
  const e = mkEngine({ p1: p });
  assert.equal(kotone.canUseSkill(e, p, 'ultimate', kotoneCharacter.ultimate, false), false);

  p.statuses.kotoneReady = kotone.READY_NEED + 1;
  assert.equal(kotone.canUseSkill(e, p, 'ultimate', kotoneCharacter.ultimate, false), true);

  // ทำงานทันทีก่อนเปิดการ์ด: applyInstantSkill เรียก activateReady แล้ว applyEffect ของ engine ตั้ง kready ตามมา
  kotone.applyInstantSkill(e, p, 'ultimate', false);
  assert.equal(kotone.readyStacks(p), 1, 'เหลือ 1 หลังหักครบตาม READY_NEED');
  assert.equal(p.seen.kready, true, 'ตั้ง seen เองเพราะไม่ผ่านลูป afterReveal');
  p.statuses.kready = 999; // applyEffect ของ engine
  assert.equal(kotone.formActive(p), true);
});

test('ร่าง [พร้อมลุย] ทับปุ่มทั้ง 3 ช่องทั้งกลางวันและกลางคืน', () => {
  const normal = mkPlayer();
  assert.equal(kotone.dynamicSkillFor(normal, kotoneCharacter, 'basic', false), kotoneCharacter.basic);
  assert.equal(kotone.dynamicSkillFor(normal, kotoneCharacter, 'basic', true), kotoneCharacter.basicNight);
  assert.equal(kotone.dynamicSkillFor(normal, kotoneCharacter, 'ultimate', true), kotoneCharacter.ultimateNight);

  const form = mkPlayer({ statuses: { kready: 999 } });
  assert.equal(kotone.dynamicSkillFor(form, kotoneCharacter, 'basic', false), kotoneCharacter.basic3);
  assert.equal(kotone.dynamicSkillFor(form, kotoneCharacter, 'secondary', true), kotoneCharacter.secondary3);
  assert.equal(kotone.dynamicSkillFor(form, kotoneCharacter, 'ultimate', true), kotoneCharacter.ultimate3);
});

test('ท่าไม้ตายในร่างต้องมี 6 เหรียญ และหักเหรียญตอนกด', () => {
  const p = mkPlayer({ statuses: { kready: 999 }, gold: 5 });
  const e = mkEngine({ p1: p });
  assert.equal(kotone.canUseSkill(e, p, 'basic', kotoneCharacter.basic3, false), false, 'เหรียญไม่พอ');
  p.gold = 9;
  assert.equal(kotone.canUseSkill(e, p, 'basic', kotoneCharacter.basic3, false), true);
  kotone.payFormUltGold(e, p, kotoneCharacter.basic3);
  assert.equal(p.gold, 3);
});

// ---------- ท่าไม้ตาย 3 / 4 / 5 ----------
test('ULT3 Sekai ichi: ฮีล 1 · ตีหมู่เจาะเกราะ 1 · สตั้น 2 เทิร์น · บังคับแตก · กลับร่างปกติ', () => {
  const p = mkPlayer({ hp: 5, statuses: { kready: 999, kawaii: 1 }, seen: { kready: true } });
  const a = mkFoe('a'); const b = mkFoe('b');
  const e = mkEngine({ p1: p, a, b });
  kotone.resolveFormUlts(e);

  assert.equal(p.hp, 6, 'ฮีล 1');
  for (const t of [a, b]) {
    assert.equal(t.hp, 4, 'เจาะเกราะ -1 (เกราะ 2 ไม่ช่วย)');
    assert.equal(t.statuses.stun, 2);
    assert.equal(t.busted, true, 'บังคับแตก');
    assert.equal(t.locked, true);
  }
  assert.equal(kotone.formActive(p), false, 'กลับร่างปกติทันที');
  assert.deepEqual(e.cutscenes, ['kawaii']);
});

test('ULT4 Campus Mode!: บัฟรัก + ฮีล 3 + ไร้ทางเยียวยา 2 เทิร์น + บังคับแตก', () => {
  const p = mkPlayer({ hp: 3, piggy: 10, statuses: { kready: 999, kcampus: 1 } });
  const a = mkFoe('a');
  const e = mkEngine({ p1: p, a });
  kotone.resolveFormUlts(e);

  assert.equal(p.hp, 6, 'ฮีล 3');
  assert.equal(p.statuses.kotoneLove, 1);
  assert.equal(a.statuses.nohealing, 2);
  assert.equal(a.busted, true);
  assert.equal(kotone.formActive(p), false);
});

test('ULT5 Love Love: บัฟรัก + บังคับแตก + โจมตีเพิ่มอีก 1 ครั้ง', () => {
  const p = mkPlayer({ piggy: 15, statuses: { kready: 999, kshuki: 1 } });
  const a = mkFoe('a');
  const e = mkEngine({ p1: p, a });
  kotone.resolveFormUlts(e);

  assert.equal(p.statuses.kotoneLove, 1);
  assert.equal(p.kotoneExtraAtk, true);
  assert.equal(a.busted, true);
  assert.equal(kotone.startExtraAttack(e, p), true, 'เริ่มโจมตีรอบพิเศษ');
  assert.equal(p.kotoneExtraAtk, false, 'ใช้ได้ครั้งเดียว');
  assert.equal(kotone.startExtraAttack(e, p), false);
});

test('ไพ่แตกเอง = ท่าไม้ตายในร่างไม่ทำงาน', () => {
  const p = mkPlayer({ cardBonus: 30, statuses: { kready: 999, kawaii: 1 } });
  const a = mkFoe('a');
  const e = mkEngine({ p1: p, a });
  kotone.resolveFormUlts(e);
  assert.equal(a.busted, false);
  assert.equal(kotone.formActive(p), true, 'ยังไม่ถูกถอดร่างจากท่าที่เป็นโมฆะ');
});

test('สนาม Overload Force ปลดเพดาน 21 -> บังคับแตกไม่ทำงาน (ไม่แจกแต้มให้คู่แข่ง)', () => {
  const p = mkPlayer({ statuses: { kready: 999, kshuki: 1 } });
  const a = mkFoe('a');
  const e = mkEngine({ p1: p, a }, { overloadForceActive: true });
  kotone.resolveFormUlts(e);
  assert.equal(a.cardBonus, 0, 'ไม่บวกแต้มการ์ดให้คู่แข่ง');
  assert.equal(a.busted, false);
});

test('โหมดทีม: เอฟเฟกต์ลบไม่ลงพวกเดียวกัน', () => {
  const p = mkPlayer({ statuses: { kready: 999, kawaii: 1 } });
  const mate = mkFoe('mate');
  const e = mkEngine({ p1: p, mate }, { friendlyEffectBlocked: (o) => o.id === 'mate' });
  kotone.resolveFormUlts(e);
  assert.equal(mate.hp, 5, 'เพื่อนร่วมทีมไม่โดนดาเมจ');
  assert.equal(mate.statuses.stun, undefined);
  assert.equal(mate.busted, false);
});

// ---------- (รัก รักที่สุดเลย) ----------
test('รัก รักที่สุดเลย: 5/10/15 เหรียญ = +1/+2/+3 และล้างกระปุกหลังตี 1 ครั้ง', () => {
  assert.equal(kotone.loveDamage({ piggy: 4 }), 0);
  assert.equal(kotone.loveDamage({ piggy: 5 }), 1);
  assert.equal(kotone.loveDamage({ piggy: 10 }), 2);
  assert.equal(kotone.loveDamage({ piggy: 15 }), 3);
  assert.equal(kotone.loveDamage({ piggy: 99 }), 3, 'เพดาน +3');

  const p = mkPlayer({ piggy: 12, statuses: { kotoneLove: 1 } });
  const e = mkEngine({ p1: p });
  const ctx = {};
  assert.equal(kotone.damageBonus(e, p, mkFoe('a'), ctx), 2);
  assert.equal(ctx.kotoneLove, true);
  kotone.onAttackConsumeLove(e, p);
  assert.equal(p.piggy, 0, 'กระปุกถูกล้างทั้งหมด');
  assert.equal(p.statuses.kotoneLove, undefined);
  assert.equal(kotone.damageBonus(e, p, mkFoe('a'), {}), 0);
});

// ---------- Sleeping time ----------
test('Sleeping time: ล้างเฉพาะสถานะเสีย · seal 1 เทิร์น · หลับ 3 เทิร์น แล้วฮีล/แต้มสกิลต่อเทิร์น', () => {
  const p = mkPlayer({
    hp: 2, skillPoints: 0,
    statuses: { stun: 3, spellburden: 2, kotoneReady: 2, kready: 999 },
    statusAmt: { spellburden: 1 },
  });
  const e = mkEngine({ p1: p });
  kotone.applySleep(e, p);
  assert.equal(p.statuses.stun, undefined, 'ล้างดีบัฟ');
  assert.equal(p.statuses.spellburden, undefined);
  assert.equal(p.statuses.kotoneReady, 2, '[ความพร้อม] เป็นสถานะของตัวเอง ไม่ถูกล้าง');
  assert.equal(p.statuses.kready, 999, 'ร่าง [พร้อมลุย] ไม่ถูกล้าง');
  assert.equal(p.statuses.ksleep, 3);
  assert.equal(p.statuses.seal, 1);

  kotone.onRoundStartTick(e, p);
  assert.equal(p.hp, 4, 'ฮีล 2 ต่อเทิร์น');
  assert.equal(p.skillPoints, 1, 'แต้มสกิล +1 ต่อเทิร์น');
  assert.equal(p.locked, true);
});

test('Sleeping time กดซ้ำระหว่างหลับไม่ได้', () => {
  const p = mkPlayer({ statuses: { ksleep: 2 } });
  const e = mkEngine({ p1: p });
  assert.equal(kotone.canUseSkill(e, p, 'ultimate', kotoneCharacter.ultimateNight, true), false);
});

// ---------- ท่านประธานเซนะจัง ----------
test('ท่านประธานเซนะจัง: 20% เฉพาะสกิลพื้นฐาน/รอง และไม่ทำงานในร่าง [พร้อมลุย]', () => {
  const rnd = Math.random;
  try {
    Math.random = () => 0.1; // ติด
    const p = mkPlayer();
    const e = mkEngine({ p1: p });
    kotone.maybeTriggerSena(e, p, 'basic', false);
    assert.equal(p.senaNext, true);

    const q = mkPlayer();
    kotone.maybeTriggerSena(mkEngine({ p1: q }), q, 'ultimate', false);
    assert.equal(q.senaNext, false, 'ท่าไม้ตายไม่โรล');

    const r = mkPlayer({ statuses: { kready: 999 } });
    kotone.maybeTriggerSena(mkEngine({ p1: r }), r, 'basic', true);
    assert.equal(r.senaNext, false, 'ปุ่มพื้นฐานในร่างคือท่าไม้ตาย ไม่โรล');

    Math.random = () => 0.5; // ไม่ติด (0.5 >= 0.2)
    const s = mkPlayer();
    kotone.maybeTriggerSena(mkEngine({ p1: s }), s, 'secondary', false);
    assert.equal(s.senaNext, false);
  } finally { Math.random = rnd; }
});

test('senaNext -> สตั้นตัวเอง 1 เทิร์นตอนเริ่มเทิร์นถัดไป', () => {
  const p = mkPlayer({ senaNext: true });
  const e = mkEngine({ p1: p });
  kotone.onRoundStartTick(e, p);
  assert.equal(p.senaNext, false);
  assert.equal(p.statuses.stun, 1);
  assert.equal(p.locked, true);
});
