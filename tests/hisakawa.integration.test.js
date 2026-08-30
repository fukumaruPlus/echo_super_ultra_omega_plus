const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../server.js');

function mkHisakawa() {
  const p = {
    id: 'hisakawa', name: 'คู่แฝด', position: 1, characterId: 'hisakawa_sister',
    alive: true, connected: true, hp: 3, armor: 2, shield: 0, tempHp: 0,
    skillPoints: 8, skillUsedRound: false, gold: 0, inventory: [], cards: [], locked: false, busted: false,
    result: null, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 },
    dmgHp: 0, dmgArmor: 0,
  };
  engine.CHAR_HOOKS.hisakawa_sister.init(p);
  engine.players[p.id] = p;
  return p;
}

let foeSeq = 0;
function mkFoe(id) {
  const p = {
    id: id || `foe${++foeSeq}`, name: id || 'foe', position: 5, characterId: 'kai',
    alive: true, connected: true, hp: 5, maxHp: 5, armor: 2, maxArmor: 2, shield: 0, tempHp: 0,
    skillPoints: 8, maxSkill: 8, skillUsedRound: false, gold: 0, inventory: [], cards: [],
    locked: false, busted: false, result: null, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, dmgHp: 0, dmgArmor: 0,
  };
  engine.players[p.id] = p;
  return p;
}

test.beforeEach(() => {
  for (const key of Object.keys(engine.players)) delete engine.players[key];
  engine.clearPhaseTimer();
  engine.setRoundNumber(1);
});

test.afterEach(() => engine.clearPhaseTimer());

test('one large hit triggers Longing for the fallen twin without damaging the other twin', () => {
  const p = mkHisakawa();
  p.hp = 1;
  p.armor = 0;
  engine.CHAR_HOOKS.hisakawa_sister.syncOut(p);

  engine.dealMixed(p, 5, true);

  const state = engine.CHAR_HOOKS.hisakawa_sister.publicState(p);
  const nagi = state.twins.find((t) => t.key === 'nagi');
  const hayate = state.twins.find((t) => t.key === 'hayate');
  assert.equal(state.active, 'hayate');
  assert.equal(nagi.alive, true);
  assert.equal(nagi.hp, 3);
  assert.equal(nagi.armor, 0);
  assert.equal(nagi.statuses.yunaLonging, 5);
  assert.equal(hayate.alive, true);
  assert.equal(hayate.hp, 3);
  assert.equal(hayate.armor, 2);
  assert.equal(p.alive, true);
});

test('reviving a twin does not consume the regular once-per-turn skill action', () => {
  const p = mkHisakawa();
  p.hp = 0;
  engine.CHAR_HOOKS.hisakawa_sister.syncOut(p);
  assert.equal(engine.CHAR_HOOKS.hisakawa_sister.tryTwinDeath(engine, p), true);
  p.skillPoints = 8;
  engine.setGameState('PLAYING');

  engine.useSkill(p.id, 'basic');
  assert.equal(p.skillUsedRound, false);
  assert.equal(p.skillPoints, 2);
  assert.equal(engine.CHAR_HOOKS.hisakawa_sister.publicState(p).twins.every((t) => t.alive), true);

  // เทสต์ก่อนหน้าคิวฉาก Longing ไว้ใน engine เดียวกัน จึงคืนเฟสให้ตรงกับช่วงกดสกิลปกติ
  p.skillPoints = 4;
  engine.setGameState('PLAYING');
  engine.useSkill(p.id, 'secondary');
  assert.equal(p.skillPoints, 0);
  assert.equal(p.skillUsedRound, true); // โบนัสของเทิร์นนี้ถูกใช้ไปกับการชุบแล้ว
});

test('Hisakawa skill costs use the rebalanced values', () => {
  const ch = engine.CHAR_BY_ID.hisakawa_sister;
  assert.deepEqual(
    [ch.basic.cost, ch.basic2.cost, ch.ultimate.cost, ch.ultimate2.cost, ch.ultimate3.cost],
    [1, 6, 4, 6, 6],
  );
});

test('switching twins does not consume the regular once-per-turn skill action', () => {
  const p = mkHisakawa();
  p.skillPoints = 5;
  engine.setGameState('PLAYING');

  engine.useSkill(p.id, 'basic');
  assert.equal(p.skillUsedRound, false);
  assert.equal(p.skillPoints, 6);
  assert.equal(engine.CHAR_HOOKS.hisakawa_sister.publicState(p).active, 'hayate');

  engine.useSkill(p.id, 'secondary');
  assert.equal(p.skillUsedRound, false); // สกิลรองคืนสิทธิ์ใช้สกิลอีก 1 ครั้ง
  assert.equal(p.skillPoints, 2);
  assert.equal(p.statuses.hisakawaTempo, 999);
});

test('สถานะที่ engine เขียนใส่ผู้เล่นตรงๆ ไม่ถูกซิงก์แฝดล้างทิ้ง', () => {
  const p = mkHisakawa();
  p.statuses.nodraw = 1;
  p.statuses.stagger = 1;
  p.statuses.freecast = 1;

  engine.CHAR_HOOKS.hisakawa_sister.onRoundStartTick(engine, p);
  assert.equal(p.statuses.nodraw, 1);
  assert.equal(p.statuses.stagger, 1);
  assert.equal(p.statuses.freecast, 1);

  engine.damageSoft(p); // ท่อดาเมจเรียก hisakawaSyncIn ทุกครั้ง — ต้องรีเฟรชแค่เลือด/เกราะ
  assert.equal(p.statuses.nodraw, 1);
  assert.equal(p.statuses.freecast, 1);
});

test('บัฟที่ให้ฝั่งแฝดถูกมิเรอร์ลงผู้เล่นทันที (write-through)', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  h.applyBuffToTwin(p, 'nagi', 'guard', 2, 3);
  assert.equal(p.statuses.guard, 3);
  assert.equal(p.statusAmt.guard, 2);
});

test('มาร์กถาวรของแฝดที่พักอยู่ไม่สลายไปเอง', () => {
  const p = mkHisakawa();
  const twins = p.hisakawa.twins;
  twins.hayate.statuses.mageslayerMark = 1;
  twins.hayate.statuses.deathline = 2;
  twins.hayate.statuses.weak = 2;

  engine.CHAR_HOOKS.hisakawa_sister.onEndTurnTick(engine, p);
  assert.equal(twins.hayate.statuses.mageslayerMark, 1);
  assert.equal(twins.hayate.statuses.deathline, 2);
  assert.equal(twins.hayate.statuses.weak, 1); // ดีบัฟธรรมดายังนับถอยหลังตามเดิม
});

test('จังหวะนี้แหละ: บัฟถูกใช้เฉพาะตอนได้ออกโจมตีจริง และธงไม่ค้างข้ามเทิร์น', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const dummy = { id: 'w', name: 'W', alive: true };
  engine.players[dummy.id] = dummy;
  p.hisakawa.active = 'hayate';
  h.syncIn(p);
  h.applySkill(engine, p, 'secondary', { effect: { status: 'hisakawaTempo' } });

  const val = (o) => (o.id === p.id ? 5 : 18);
  h.onAfterRoundScores(engine, [p, dummy], dummy.id, val);
  assert.equal(p.hisakawaHayateAssist, true);
  assert.equal(p.statuses.hisakawaTempo, 999); // ยังไม่ถูกตัดทิ้งตั้งแต่ตอนจอง

  // ผู้ชนะโจมตีไม่ได้ -> จบเทิร์นไปเลย: ธงต้องไม่ค้าง และบัฟต้องยังอยู่ให้ลุ้นเทิร์นหน้า
  h.onEndTurnTick(engine, p);
  assert.equal(p.hisakawaHayateAssist, false);
  assert.equal(p.hisakawa.twins.hayate.statuses.hisakawaTempo, 999);

  h.onAfterRoundScores(engine, [p, dummy], dummy.id, val);
  assert.equal(h.startHayateAssistAttack(engine, dummy), true);
  assert.equal(p.hisakawa.twins.hayate.statuses.hisakawaTempo, undefined);
  assert.equal(p.statuses.hisakawaTempo, undefined);
});

test('ฮายาเตะล้มระหว่างรอคิว -> นากิที่ออกมาคุมแทนได้ออกโจมตีเสริมต่อ (บัฟคู่)', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const dummy = { id: 'w', name: 'W', alive: true };
  engine.players[dummy.id] = dummy;
  p.hisakawa.active = 'hayate';
  h.syncIn(p);
  h.applySkill(engine, p, 'secondary', { effect: { status: 'hisakawaTempo' } });
  h.onAfterRoundScores(engine, [p, dummy], dummy.id, (o) => (o.id === p.id ? 5 : 18));

  p.hp = 0;
  h.syncOut(p);
  assert.equal(h.tryTwinDeath(engine, p), true);
  assert.equal(p.hisakawa.active, 'nagi');
  assert.equal(h.startHayateAssistAttack(engine, dummy), true);
  // ใช้แล้วหมดไปทั้งคู่ ไม่ค้างไว้ที่คนที่ล้ม
  assert.equal(p.hisakawa.twins.nagi.statuses.hisakawaTempo, undefined);
  assert.equal(p.hisakawa.twins.hayate.statuses.hisakawaTempo, undefined);
});

test('ดาเมจแพ้จั่วทำให้แฝดอีกคนออกมาคุมทันที ไม่รอจบเทิร์น', () => {
  const p = mkHisakawa();
  p.hp = 1;
  p.armor = 0;
  engine.CHAR_HOOKS.hisakawa_sister.syncOut(p);

  engine.damageSoft(p);
  assert.equal(p.alive, true);
  assert.equal(p.hisakawa.active, 'hayate');
  assert.equal(p.hisakawa.twins.nagi.alive, false);
  assert.equal(p.hp, 3);
});

// ---------- สเปกใหม่ของคู่แฝดฮิซากาว่า ----------

test('ปกสกิลสลับตัวโชว์ภาพแฝดอีกคน และสลับตามตัวที่คุมอยู่', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const ch = engine.CHAR_BY_ID.hisakawa_sister;
  assert.equal(h.dynamicSkillFor(p, ch, 'basic').img, h.PATHS.switchToHayate);
  p.hisakawa.active = 'hayate';
  assert.equal(h.dynamicSkillFor(p, ch, 'basic').img, h.PATHS.switchToNagi);
});

test('Miracle Live คืนสิทธิ์ใช้สกิลอีก 1 ครั้งเหมือนสกิลอื่นของแฝด', () => {
  const p = mkHisakawa();
  engine.setGameState('PLAYING');
  p.skillPoints = 8;

  engine.useSkill(p.id, 'ultimate'); // Miracle Live (นากิ) 4 แต้ม
  assert.equal(p.statuses.hisakawaStage, 5);
  assert.equal(p.skillPoints, 4);
  assert.equal(p.skillUsedRound, false); // ทุกสกิลของแฝดคืนสิทธิ์ให้อีก 1 ครั้ง

  engine.useSkill(p.id, 'secondary'); // กดต่อได้ด้วยสิทธิ์ที่ได้คืนมา
  assert.equal(p.statuses.hisakawaLimit, 3);
  assert.equal(p.skillPoints, 0);
  assert.equal(p.skillUsedRound, true); // โบนัสมีได้ครั้งเดียวต่อเทิร์น
});

test('สกิลรองทั้งสอง: กดแล้วยังใช้สกิลได้อีก 1 ครั้ง', () => {
  const p = mkHisakawa();
  engine.setGameState('PLAYING');
  p.skillPoints = 8;

  engine.useSkill(p.id, 'secondary'); // อย่าทำอะไรเกินตัวสิ (นากิ) 4 แต้ม
  assert.equal(p.statuses.hisakawaLimit, 3);
  assert.equal(p.skillUsedRound, false);

  engine.useSkill(p.id, 'ultimate');  // Miracle Live 4 แต้ม — ใช้สิทธิ์ที่เหลือ
  assert.equal(p.statuses.hisakawaStage, 5);
  assert.equal(p.skillPoints, 0);
  assert.equal(p.skillUsedRound, true);
});

test('สลับตัวรีเซ็ตจำนวนครั้งใช้สกิล — กดได้แม้ใช้สกิลไปแล้ว', () => {
  const p = mkHisakawa();
  engine.setGameState('PLAYING');
  p.skillPoints = 8;

  engine.useSkill(p.id, 'ultimate');  // Miracle Live 4 แต้ม (คืนสิทธิ์ให้ 1 ครั้ง = โบนัสของเทิร์นนี้)
  engine.useSkill(p.id, 'secondary'); // ใช้สิทธิ์ที่ได้คืนมาจนหมดโควตาของเทิร์น
  assert.equal(p.skillUsedRound, true);

  p.skillPoints = 8;
  engine.useSkill(p.id, 'basic');     // สลับตัว 1 แต้ม
  assert.equal(p.hisakawa.active, 'hayate');
  assert.equal(p.skillUsedRound, false); // ฮายาเตะได้สิทธิ์ใช้สกิลของตัวเอง

  engine.useSkill(p.id, 'secondary'); // จังหวะนี้แหละ (ฮายาเตะ) 4 แต้ม
  assert.equal(p.statuses.hisakawaTempo, 999);
  assert.equal(p.skillUsedRound, false); // สกิลรองคืนสิทธิ์ให้อีก 1 ครั้ง
});

test('จังหวะนี้แหละเป็นบัฟคู่ — นากิคุมอยู่ก็ได้ออกโจมตี', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const dummy = mkFoe('w');
  p.hisakawa.active = 'hayate';
  h.syncIn(p);
  h.applySkill(engine, p, 'secondary', { effect: { status: 'hisakawaTempo' } });
  assert.equal(p.hisakawa.twins.nagi.statuses.hisakawaTempo, 999); // ลงให้นากิด้วย

  p.hisakawa.active = 'nagi'; // สลับกลับมาเป็นนากิ
  h.syncIn(p);
  h.onAfterRoundScores(engine, [p, dummy], dummy.id, (o) => (o.id === p.id ? 5 : 18));
  assert.equal(p.hisakawaHayateAssist, true);
  assert.equal(h.startHayateAssistAttack(engine, dummy), true);
  assert.equal(p.hisakawa.twins.nagi.statuses.hisakawaTempo, undefined);
  assert.equal(p.hisakawa.twins.hayate.statuses.hisakawaTempo, undefined);
});

test('ฝันของเหล่าฝาแฝด: หมัดที่ 2 เป็นเฟสโจมตีจริงของแฝดอีกคน ดาเมจคงที่ 2', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const foe = mkFoe('foe');
  h.applyBuffToTwin(p, 'nagi', 'hisakawaDream', null, 5);
  h.applyBuffToTwin(p, 'hayate', 'hisakawaDream', null, 5);
  engine.setGameState('ATTACK');
  engine.setAttackerId(p.id);

  const rnd = Math.random;
  Math.random = () => 0.1; // หมัดที่ 2 การันตี 100% อยู่แล้ว
  try {
    const hpBefore = foe.hp + foe.armor;
    engine.doAttack(p.id, foe.id);
    // หมัดแรกของนากิ: พลังโจมตีพื้นฐาน 1 + ฝันของเหล่าฝาแฝด 2 = 3
    assert.equal(hpBefore - (foe.hp + foe.armor), 3);
    assert.equal(p.hisakawaDreamPending, true);

    // เปิดเฟสโจมตีรอบ 2 — ผู้โจมตีคือแฝดอีกคน (ฮายาเตะ)
    assert.equal(h.startDreamFollowupAttack(engine, p), true);
    assert.equal(engine.gameState, 'ATTACK');
    assert.equal(engine.attackerId, p.id);
    assert.equal(h.isDreamAttack(p), true);
    assert.equal(h.displayImg(p), h.PATHS.hayate);

    const midTotal = foe.hp + foe.armor;
    engine.doAttack(p.id, foe.id);
    assert.equal(midTotal - (foe.hp + foe.armor), 2); // คงที่ 2 ไม่รับโบนัสใดๆ

    // หมัดที่ 2 ไม่ทอยต่อเป็นลูกโซ่
    assert.equal(h.startDreamFollowupAttack(engine, p), false);
    assert.equal(h.isDreamAttack(p), false);
    assert.equal(h.displayImg(p), h.PATHS.nagi);
  } finally {
    Math.random = rnd;
  }
});

test('ฝันของเหล่าฝาแฝด: แฝดล้มไปคนหนึ่ง = ไม่มีหมัดที่ 2', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const foe = mkFoe('foe2');
  h.applyBuffToTwin(p, 'nagi', 'hisakawaDream', null, 5);
  h.applyBuffToTwin(p, 'hayate', 'hisakawaDream', null, 5);
  p.hp = 0;
  h.syncOut(p);
  assert.equal(h.tryTwinDeath(engine, p), true);
  engine.setGameState('ATTACK');
  engine.setAttackerId(p.id);

  const rnd = Math.random;
  Math.random = () => 0.1;
  try {
    engine.doAttack(p.id, foe.id);
    assert.equal(!!p.hisakawaDreamPending, false);
    assert.equal(h.startDreamFollowupAttack(engine, p), false);
  } finally {
    Math.random = rnd;
  }
});

test('สกิลพื้นฐาน 1 เป็นทางหนี — สตั้น/หลับ/ห้ามใช้สกิล ปิดกั้นไม่ได้', () => {
  const p = mkHisakawa();
  engine.setGameState('PLAYING');
  p.skillPoints = 8;
  p.statuses.stun = 1;
  p.statuses.noskill = 1;
  p.locked = true;

  engine.useSkill(p.id, 'secondary');            // สกิลอื่นยังโดนปิดกั้นตามปกติ
  assert.equal(p.statuses.hisakawaLimit, undefined);
  assert.equal(p.skillPoints, 8);

  engine.useSkill(p.id, 'basic');                // ทางหนีต้องยังกดได้
  assert.equal(p.hisakawa.active, 'hayate');
  assert.equal(p.hisakawaSwitchedRound, engine.roundNumber);
});

test('สลับตัวแล้วได้ยินเสียงของแฝดที่เพิ่งออกมา (ตรงกับภาพบนปกสกิล)', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const ch = engine.CHAR_BY_ID.hisakawa_sister;
  const skill = h.dynamicSkillFor(p, ch, 'basic');
  assert.equal(skill.img, h.PATHS.switchToHayate);

  h.applySkill(engine, p, 'basic', skill);       // นากิ -> ฮายาเตะ
  assert.equal(p.hisakawa.active, 'hayate');
  assert.equal(h.skillVoice(p, 'basic', skill), 'hisakawa_hayate_1');

  const back = h.dynamicSkillFor(p, ch, 'basic');
  assert.equal(back.img, h.PATHS.switchToNagi);
  h.applySkill(engine, p, 'basic', back);        // ฮายาเตะ -> นากิ
  assert.equal(h.skillVoice(p, 'basic', back), 'hisakawa_nagi_1');
});

test('แฝดที่พักอยู่ฟื้นเกราะเองได้เมื่อเกราะไม่เต็ม', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const resting = p.hisakawa.twins.hayate;
  resting.armor = 0;

  h.regenRestingArmor(engine, p);
  assert.equal(resting.armor, 1);
  h.regenRestingArmor(engine, p);
  assert.equal(resting.armor, 2);
  h.regenRestingArmor(engine, p);
  assert.equal(resting.armor, 2);                 // ไม่เกินเพดาน

  // ผุพัง: เกราะไม่ฟื้น + คนที่คุมอยู่ไม่ถูกแตะจากฟังก์ชันนี้
  resting.armor = 0;
  resting.statuses.decay = 2;
  p.hisakawa.twins.nagi.armor = 0;
  h.regenRestingArmor(engine, p);
  assert.equal(resting.armor, 0);
  assert.equal(p.hisakawa.twins.nagi.armor, 0);
});

test('ตีปกติแล้วแฝดอีกคนออกมาตีเองผ่านคิวจริงของเทิร์น (postAttackFollowup)', (t) => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const foe = mkFoe('foe3');
  h.applyBuffToTwin(p, 'nagi', 'hisakawaDream', null, 5);
  h.applyBuffToTwin(p, 'hayate', 'hisakawaDream', null, 5);
  engine.setGameState('ATTACK');
  engine.setAttackerId(p.id);

  const rnd = Math.random;
  Math.random = () => 0.1;
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    engine.doAttack(p.id, foe.id);               // หมัดปกติของตัวที่คุมอยู่
    assert.equal(engine.gameState, 'ATTACKING');
    t.mock.timers.tick((engine.ATTACKFX_TIME + 5) * 1000); // ปล่อยให้คิวจบเทิร์นทำงานจริง
    // ต้องเปิดเฟสโจมตีรอบ 2 ให้เอง ไม่ใช่จบเทิร์น
    assert.equal(engine.gameState, 'ATTACK');
    assert.equal(engine.attackerId, p.id);
    assert.equal(h.isDreamAttack(p), true);
  } finally {
    Math.random = rnd;
    t.mock.timers.reset();
  }
});

test('การ์ดแฝดที่คุมอยู่โชว์สถานะสด (แหล่งความจริงคือ p.statuses ระหว่างเทิร์น)', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  p.statuses.noskill = 1;                         // engine เขียนใส่ผู้เล่นตรงๆ ยังไม่ syncOut
  h.applyBuffToTwin(p, 'hayate', 'weak', null, 2); // ของแฝดที่พักอยู่

  const st = h.publicState(p);
  const nagi = st.twins.find((t) => t.key === 'nagi');
  const hayate = st.twins.find((t) => t.key === 'hayate');
  assert.equal(nagi.active, true);
  assert.equal(nagi.statuses.noskill, 1);         // การ์ดคนที่คุมอยู่เห็นทันที
  assert.equal(hayate.statuses.noskill, undefined);
  assert.equal(hayate.statuses.weak, 2);          // การ์ดคนที่พักโชว์ของตัวเอง
});

test('O-KU-RI-MO-NO-Sunday คืนสิทธิ์ใช้สกิลอีก 1 ครั้ง — โบนัสได้ครั้งเดียวต่อเทิร์น', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;

  p.skillUsedRound = true;
  h.applySkill(engine, p, 'ultimate', { effect: { status: 'hisakawaDream' } });
  assert.equal(p.skillUsedRound, false);
  assert.equal(p.hisakawaBonusRound, engine.roundNumber);

  // เทิร์นเดียวกันกดสกิลรองต่อ ไม่ได้โบนัสซ้ำอีก
  p.skillUsedRound = true;
  h.applySkill(engine, p, 'secondary', { effect: { status: 'hisakawaLimit' } });
  assert.equal(p.skillUsedRound, true);
});

test('publicState บอก client ว่าสลับตัวไปแล้วในเทิร์นนี้ (ปุ่มต้อง disable)', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const ch = engine.CHAR_BY_ID.hisakawa_sister;
  assert.equal(h.publicState(p, engine.roundNumber).switchedThisRound, false);

  h.applySkill(engine, p, 'basic', h.dynamicSkillFor(p, ch, 'basic'));
  assert.equal(h.publicState(p, engine.roundNumber).switchedThisRound, true);
  assert.equal(h.publicState(p, engine.roundNumber + 1).switchedThisRound, false); // เทิร์นหน้ากดได้อีก
});
