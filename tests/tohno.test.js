// โทโนะ ชิกิ (rework) — ผ่าน engine จริง (server.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../server.js');
const Tohno = require('../characters/tohno.js');
const { publicRoster } = require('../characters.js');

const blank = (id, characterId, position) => ({
  id, name: id, position, characterId, alive: true, connected: true, cards: [], statuses: {}, statusAmt: {},
  seen: {}, cutsceneShown: {}, inventory: [], teamId: null, gold: 0,
});
function setup(bChar = 'temari') {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  engine.players.A = blank('A', 'tohno', 1);
  engine.players.B = blank('B', bChar, 2);
  engine.players.C = blank('C', 'temari', 3);
  engine.setGameMode('ffa');
  engine.startMatch();
  engine.clearPhaseTimer();
  engine.setGameState('PLAYING');
  engine.setRoundNumber(5);
  for (const p of Object.values(engine.players)) {
    p.locked = false; p.hp = 7; p.armor = 3; p.shield = 0; p.statuses = {}; p.statusAmt = {}; p.skillPoints = 8;
    p.skillUsedRound = false;
    Tohno.resetCombat(p);
  }
  cutscenes.length = 0;
  sounds.length = 0;
  return engine.players;
}
const skill = (tier, item) => engine.useSkill('A', tier, [], item);
function attack(by, target) {
  engine.setGameState('ATTACK');
  engine.setAttackerId(by);
  engine.doAttack(by, target);
  engine.clearPhaseTimer();
  engine.setGameState('PLAYING');
}
// เปิดหมัดถัดไปของชุด (สิ่งที่หัว endTurn ทำ) แล้วตีเป้าที่เลือก — คืน false ถ้าไม่มีหมัดต่อแล้ว
function next(target) {
  if (!Tohno.continueAttack(engine)) return false;
  engine.clearPhaseTimer();
  assert.equal(engine.gameState, 'ATTACK');
  assert.equal(engine.attackerId, 'A');
  engine.doAttack('A', target);
  engine.clearPhaseTimer();
  engine.setGameState('PLAYING');
  return true;
}
const withRandom = (v, fn) => { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } };
const life = (p) => p.hp + p.armor;

const cutscenes = [];
const sounds = [];
const saved = { triggerCutscene: engine.triggerCutscene, queueCutscene: engine.queueCutscene, skillFlash: engine.skillFlash, sfx: engine.sfx };
test.before(() => {
  engine.triggerCutscene = (p, k) => cutscenes.push('T:' + k);
  engine.queueCutscene = (p, k) => cutscenes.push('Q:' + k);
  engine.skillFlash = () => {};
  engine.sfx = (s) => { if (s) sounds.push(s); };
});
test.after(() => { Object.assign(engine, saved); for (const id of Object.keys(engine.players)) delete engine.players[id]; });
test.afterEach(() => engine.clearPhaseTimer());

test('เลือกได้คนเดียวต่อเกม · ระดับยาก', () => {
  const t = publicRoster().find((c) => c.id === 'tohno');
  assert.equal(t.unique, true);
  assert.equal(t.difficulty, 'hard');
});

test('สลับโหมดฟรี ไม่จำกัด ไม่กินโควตาสกิลของเทิร์น', () => {
  const { A } = setup();
  assert.equal(A.tohno.mode, 'calm', 'ค่าเริ่มต้นใจเย็น');
  skill('basic', 'rage');
  skill('basic', 'calm');
  skill('basic', 'rage');
  assert.equal(A.tohno.mode, 'rage');
  assert.equal(A.skillPoints, 8);
  assert.equal(A.skillUsedRound, false);
  skill('basic', 'banana');
  assert.equal(A.tohno.mode, 'rage', 'ค่าแปลกๆ ไม่ผ่าน');
  skill('secondary');
  assert.equal(A.tohno.finish, true, 'ยังกดสกิลรองได้หลังสลับโหมด');
});

test('ใจเย็น: ตีโดนฟื้นพลังชีวิต 1 ไม่สร้างรอยร้าว · เดือดดาล: รอยร้าว +1 สูงสุด 8 ไม่ฟื้นเลือด', () => withRandom(0.99, () => {
  const { A, B } = setup();
  A.hp = 5;
  attack('A', 'B');
  assert.equal(A.hp, 6);
  assert.equal(B.tohnoCrack, 0);
  assert.equal(life(B), 9);
  skill('basic', 'rage');
  for (let i = 0; i < 10; i++) { B.hp = 7; B.armor = 3; attack('A', 'B'); }
  assert.equal(B.tohnoCrack, 8, 'เพดาน 8');
  assert.equal(A.hp, 6, 'เดือดดาลไม่ฟื้นเลือด');
}));

test('ถูกหลบ = รอยร้าวไม่ขึ้น', () => withRandom(0, () => {
  const { B } = setup();
  skill('basic', 'rage');
  B.statuses.evade = 1; B.statusAmt.evade = 100; B.evadeStacks = [2];
  attack('A', 'B');
  assert.equal(B.tohnoCrack, 0);
  assert.equal(life(B), 10);
}));

test('เชือดเฉือน: พลังโจมตี -1 ตี 4 ครั้ง (ตี 0 ก็นับว่าโดน = รอยร้าวขึ้น) · กดไม้ตายซ้อนไม่ได้', () => withRandom(0.99, () => {
  const { A, B, C } = setup();
  skill('basic', 'rage');
  skill('secondary');
  assert.equal(A.skillPoints, 4);
  skill('ultimate');
  assert.equal(A.tohno.rest, false, 'ถือจบสิ้นซะอยู่ กดไม้ตายไม่ได้');
  attack('A', 'B');
  assert.equal(A.tohno.seq.hit, 1);
  assert.equal(life(B), 10, 'พลังโจมตี 1 - 1 = 0');
  assert.ok(next('C'));
  assert.ok(next('B'));
  assert.ok(next('B'));
  assert.equal(next('B'), false, 'ครบ 4 ครั้งแล้ว');
  assert.equal(B.tohnoCrack, 3);
  assert.equal(C.tohnoCrack, 1);
  assert.equal(A.tohno.seq, null);
  assert.equal(A.tohno.finish, false);
}));

test('เชือดเฉือน: หมัดกลางชุดถูกหลบ ก็ยังตีต่อจนครบ', () => {
  const { B } = setup();
  skill('secondary');
  withRandom(0.99, () => attack('A', 'B'));
  B.statuses.evade = 1; B.statusAmt.evade = 100; B.evadeStacks = [2];
  withRandom(0, () => assert.ok(next('B'))); // ถูกหลบ
  withRandom(0.99, () => { assert.ok(next('B')); assert.ok(next('B')); assert.equal(next('B'), false); });
});

test('มองเห็นแล้ว!!: แม่นยำ 1 เทิร์น + ร่าง tohno_death · ดาเมจ 2 + รอยร้าว แล้วรอยร้าวหมด · กดสกิลรองซ้อนไม่ได้', () => withRandom(0.99, () => {
  const { A, B } = setup();
  B.tohnoCrack = 4; B.tohnoCrackAt = 5;
  skill('ultimate');
  assert.equal(A.skillPoints, 2);
  assert.equal(A.tohno.rest, true);
  assert.equal(A.statuses.accurate, 1);
  assert.deepEqual(cutscenes, ['T:tohnoSkill1']);
  assert.equal(engine.displayImg(A), Tohno.IMG.death);
  A.skillUsedRound = false;
  A.skillPoints = 8;
  skill('secondary');
  assert.equal(A.tohno.finish, false, 'ถือหลับให้สบายอยู่ กดสกิลรองไม่ได้');
  attack('A', 'B');
  assert.equal(life(B), 10 - 6, '2 + รอยร้าว 4');
  assert.equal(B.tohnoCrack, 0);
  assert.ok(cutscenes.includes('Q:tohnoBurst'), 'วีดีโอระเบิดรอยร้าว');
  assert.equal(A.tohno.rest, false);
  assert.notEqual(engine.displayImg(A), Tohno.IMG.death);
  attack('A', 'B');
  assert.equal(life(B), 4 - 1, 'หมัดถัดไปกลับเป็นปกติ');
}));

test('เดือดดาล + ระเบิด: ระเบิดก่อน แล้วเป้าได้รอยร้าวใหม่ 1 ขั้น', () => withRandom(0.99, () => {
  const { B } = setup();
  skill('basic', 'rage');
  B.tohnoCrack = 3;
  skill('ultimate');
  attack('A', 'B');
  assert.equal(life(B), 10 - 5);
  assert.equal(B.tohnoCrack, 1);
}));

// โล่ของเกมนี้กัน 1 หน่วยต่อ 1 โล่ (ท่อดาเมจกลาง) — โล่กันได้ตามปกติ และรอยร้าวถูกใช้ไปแล้วเสมอ
test('โล่กันหมัดระเบิดได้ตามปกติ แต่รอยร้าวถูกใช้ไปแล้ว', () => withRandom(0.99, () => {
  const { B } = setup();
  B.tohnoCrack = 5;
  B.shield = 7;
  skill('ultimate');
  attack('A', 'B');
  assert.equal(life(B), 10, 'โล่ 7 กันดาเมจ 7 ได้หมด');
  assert.equal(B.shield, 0);
  assert.equal(B.tohnoCrack, 0);
}));

test('แม่นยำเจาะหลบหลีก (สถานะหลบหลีก 100% ก็หลบไม่พ้น)', () => withRandom(0, () => {
  const { B } = setup();
  B.statuses.evade = 1; B.statusAmt.evade = 100; B.evadeStacks = [2];
  B.tohnoCrack = 2;
  skill('ultimate');
  attack('A', 'B');
  assert.equal(life(B), 10 - 4);
}));

test('แม่นยำเจาะการหลบดาเมจจากสกิลด้วย (อิปโป)', () => withRandom(0, () => {
  const { A, B } = setup('ippo');
  B.hp = 7; B.armor = 3;
  engine.withEffectSource(A, () => engine.dealMixed(B, 2));
  assert.equal(life(B), 10, 'ไม่มีแม่นยำ = อิปโปหลบได้');
  A.statuses.accurate = 1;
  engine.withEffectSource(A, () => engine.dealMixed(B, 2));
  assert.equal(life(B), 8);
}));

test('หลบหลีกของโทโนะ: ใจเย็น 5% · เดือดดาล 15% · แม่นยำเจาะได้', () => {
  const { A, B } = setup();
  assert.equal(Tohno.dodgeChance(A), 5);
  withRandom(0.049, () => attack('B', 'A'));
  assert.equal(life(A), 10, 'หลบได้ที่ 4.9%');
  withRandom(0.06, () => attack('B', 'A'));
  assert.equal(life(A), 9, '6% หลบไม่พ้นในโหมดใจเย็น');
  skill('basic', 'rage');
  assert.equal(Tohno.dodgeChance(A), 15);
  withRandom(0.14, () => attack('B', 'A'));
  assert.equal(life(A), 9);
  B.statuses.accurate = 1;
  withRandom(0.14, () => attack('B', 'A'));
  assert.equal(life(A), 8);
});

test('ตระกูลโทโนะ: ใจเย็นตีโดน 10% ได้ตีอีกครั้ง ต่อเป็นลูกโซ่ได้ (มีเพดาน) · เดือดดาลไม่ทำงาน', () => {
  const { A } = setup();
  withRandom(0.05, () => {
    attack('A', 'B');
    let extra = 0;
    while (next('C')) extra++;
    assert.equal(extra, Tohno.CHAIN_CAP);
  });
  setup();
  skill('basic', 'rage');
  withRandom(0.05, () => { attack('A', 'B'); assert.equal(next('B'), false); });
  assert.equal(A.tohno.extraPending, false);
});

test('ตระกูลโทโนะระหว่างเชือดเฉือน ทอยเฉพาะครั้งที่ 4 · ตีเพิ่มหลังชุดกลับเป็นพลังโจมตีปกติ', () => {
  const { A, B } = setup();
  skill('secondary');
  withRandom(0.05, () => {
    attack('A', 'B');
    assert.equal(A.tohno.extraPending, false, 'ครั้งที่ 1 ไม่ทอย');
    next('B'); next('B');
    assert.equal(A.tohno.extraPending, false);
    next('B');
    assert.equal(A.tohno.extraPending, true, 'ครั้งที่ 4 ทอยได้');
  });
  const before = life(B);
  withRandom(0.99, () => assert.ok(next('B')));
  assert.equal(life(B), before - 1, 'หมัดตีเพิ่มไม่ติด -1 ของเชือดเฉือน');
});

test('ไม้ตายได้ตีเพิ่มจากตระกูลโทโนะ = ครั้งที่ 2 เป็นหมัดธรรมดา ไม่ระเบิดซ้ำ', () => {
  const { B, C } = setup();
  B.tohnoCrack = 2; C.tohnoCrack = 3;
  skill('ultimate');
  withRandom(0.05, () => attack('A', 'B'));
  assert.equal(life(B), 10 - 4);
  withRandom(0.99, () => assert.ok(next('C')));
  assert.equal(life(C), 10 - 1);
  assert.equal(C.tohnoCrack, 3, 'รอยร้าวของ C ไม่ถูกระเบิด');
});

test('รอยร้าวจางลง 1 ขั้นทุก 10 เทิร์นที่ไม่เพิ่ม (เพิ่มแล้วเริ่มนับใหม่)', () => {
  const { B } = setup();
  B.tohnoCrack = 3; B.tohnoCrackAt = 5;
  engine.setRoundNumber(14);
  Tohno.onRoundStartTick(engine, B);
  assert.equal(B.tohnoCrack, 3);
  engine.setRoundNumber(15);
  Tohno.onRoundStartTick(engine, B);
  assert.equal(B.tohnoCrack, 2);
  engine.setRoundNumber(24);
  Tohno.onRoundStartTick(engine, B);
  assert.equal(B.tohnoCrack, 2, 'เริ่มนับใหม่จากเทิร์น 15');
  engine.setRoundNumber(25);
  Tohno.onRoundStartTick(engine, B);
  assert.equal(B.tohnoCrack, 1);
});

test('เสียงพากย์ทุกหมัด (ตีธรรมดา / เชือดเฉือนทั้ง 4 ครั้ง / หมัดระเบิด) · เสียงฟันเฉพาะตีธรรมดา', () => withRandom(0.99, () => {
  setup();
  attack('A', 'B');
  assert.equal(engine.lastAttack.byAttackSound, 'tohno_hit');
  assert.ok(Tohno.SFX.hitVoice.includes(engine.lastAttack.byVoice));
  skill('secondary');
  attack('A', 'B');
  assert.ok(Tohno.SFX.hitVoice.includes(engine.lastAttack.byVoice), 'เชือดเฉือนครั้งที่ 1');
  assert.equal(engine.lastAttack.byAttackSound, undefined);
  for (let i = 2; i <= 4; i++) {
    assert.ok(next('B'));
    assert.ok(Tohno.SFX.hitVoice.includes(engine.lastAttack.byVoice), `เชือดเฉือนครั้งที่ ${i}`);
  }
  engine.players.A.skillUsedRound = false;
  skill('ultimate');
  attack('A', 'B');
  assert.ok(Tohno.SFX.hitVoice.includes(engine.lastAttack.byVoice), 'หมัดระเบิดรอยร้าว');
}));

test('เสียงพากย์ตอนกดไม้ตาย: ครั้งแรก (วีดีโอเต็ม) ไม่เล่นทับคลิป · ครั้งต่อไปเล่นปกติ · สกิลรองเล่นเสมอ', () => {
  const { A } = setup();
  skill('ultimate');
  assert.equal(A.tohno.ultVideo, true);
  assert.equal(Tohno.skillSound(A, 'ultimate'), null);
  A.cutsceneShown.tohnoSkill1 = true;
  A.tohno.rest = false; A.skillUsedRound = false; A.skillPoints = 8;
  skill('ultimate');
  assert.equal(A.tohno.ultVideo, false);
  assert.ok(Tohno.SFX.skill.includes(Tohno.skillSound(A, 'ultimate')));
  assert.ok(Tohno.SFX.skill.includes(Tohno.skillSound(A, 'secondary')));
});

test('เสียงร้องตอนโดนตี: ระหว่างเฟสโจมตีขึ้นพร้อมการ์ดสรุป (ไม่ทับคลิป) · นอกเฟสโจมตีร้องทันที เว้นช่วงกันซ้ำ · ทำตัวเองไม่ร้อง', () => withRandom(0.99, () => {
  const { A } = setup();
  attack('B', 'A');
  assert.ok(Tohno.SFX.hurt.includes(engine.lastAttack.targetVoice));
  assert.equal(sounds.length, 0, 'ไม่ยิงเสียงแยกระหว่างเฟสโจมตี');
  attack('B', 'C');
  assert.equal(engine.lastAttack.targetVoice, undefined, 'การ์ดถัดไปไม่มีเสียงค้าง');
  engine.withEffectSource(engine.players.C, () => { engine.dealMixed(A, 1); engine.dealMixed(A, 1); });
  assert.equal(sounds.length, 1, 'สกิลเดียวลงหลายก้อน ร้องครั้งเดียว');
  assert.ok(Tohno.SFX.hurt.includes(sounds[0]));
  engine.withEffectSource(A, () => engine.dealMixed(A, 1));
  assert.equal(sounds.length, 1, 'ทำตัวเองไม่ร้อง');
}));
