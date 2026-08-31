const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const yui = require('../../characters/yui.js');
const CHARACTERS = require('../../characters.js');

const saved = {
  triggerCutscene: engine.triggerCutscene,
  queueCutscene: engine.queueCutscene,
  runCutsceneQueue: engine.runCutsceneQueue,
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  endTurn: engine.endTurn,
};

let queued = [];

test.before(() => {
  engine.triggerCutscene = () => {};
  engine.queueCutscene = (p, key) => { queued.push(key); };
  engine.runCutsceneQueue = (onDone) => { if (onDone) onDone(); };
  engine.startPhaseTimer = () => {};
  engine.endTurn = () => {};
  engine.broadcastState = () => {};
});

test.after(() => {
  engine.clearPhaseTimer();
  Object.assign(engine, saved);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 7, armor: 0, shield: 0, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false, qte: null,
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, cardBonus: 0, // onCardDrawn อ่านสองฟิลด์นี้ (ผู้เล่นจริงได้จาก dealRound)
    yuiSongs: [], yuiPendingSong: null, yuiReviveTargetId: null, yuiReviveRound: 0,
    yuiDrawEcho: false, yuiWishDeath: false,
  };
}

// สนามสะอาด: ยุย + คู่ต่อสู้ 2 คน
function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = [];
  const y = mk('Y', 'yui', 1);
  const a = mk('A', 'temari', 2);
  const b = mk('B', 'kuwagata', 3);
  engine.players.Y = y;
  engine.players.A = a;
  engine.players.B = b;
  engine.setRoundNumber(3);
  engine.setGameMode('ffa');
  return { y, a, b };
}

// เล่น QTE ให้ผ่านครบทุกตัว (อ่านลำดับที่ server สุ่มไว้แล้วกดตาม)
function playQte(p, ok = true) {
  assert.ok(p.qte, 'ต้องมี QTE ค้างอยู่');
  if (!ok) { engine.qteKey(p.id, p.qte.keys[0] === 'w' ? 'a' : 'w'); return; }
  while (p.qte) engine.qteKey(p.id, p.qte.keys[p.qte.idx]);
}

function bust(p) { p.cards = [{ value: 10 }, { value: 10 }, { value: 10 }]; p.busted = true; }

// เติมกองกลางให้มีไพ่ให้จั่ว (drawCardFor ดึงจากกองนี้ — ในเทสต์ไม่ได้ผ่าน dealRound ที่สับกองให้)
function seedDeck(n = 20) {
  engine.setCentralDeck(Array.from({ length: n }, () => ({ value: 2, color: 'red' })));
}

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('ยุย: อยู่ใน roster กลุ่ม "พิเศษ" · unique · ค่าใช้ตรงสเปค', () => {
  const c = CHARACTERS.CHAR_BY_ID.yui;
  assert.ok(c);
  assert.equal(c.difficulty, 'special');
  assert.equal(c.unique, true, 'เลือกได้แค่ 1 คนต่อเกม');
  assert.equal(c.basic.cost, 2);
  assert.equal(c.secondary.cost, 4);
  assert.equal(c.ultimate.cost, 6);
});

// ---------------------------------------------------------------- ระบบ QTE กลาง
test('QTE: กดถูกครบทุกตัว = สำเร็จ · กดผิดตัวเดียว = พลาดทันที', () => {
  const { y } = setup();
  yui.beginSong(engine, y, 'girl_dont_cry');
  assert.equal(y.qte.keys.length, yui.SONGS.girl_dont_cry.notes, '7 ตัวโน้ตตามความยากเพลง');
  assert.ok(y.qte.keys.every((k) => ['w', 'a', 's', 'd'].includes(k)));
  playQte(y);
  assert.equal(y.qte, null);
  assert.ok(queued.includes('yuiSong'), 'สำเร็จ -> yui_skill3.mp4');

  const s2 = setup();
  yui.beginSong(engine, s2.y, 'girl_dont_cry');
  playQte(s2.y, false);
  assert.equal(s2.y.qte, null, 'กดผิดตัวเดียวจบทันที');
  assert.ok(queued.includes('yuiSongFail'), 'พลาด -> yui_skill3_false.mp4');
  assert.equal(s2.y.statuses.yuiRock, undefined, 'สกิลไม่ทำงาน (แต้มเสียฟรี)');
});

test('QTE: กดไม่ทันเส้นตาย = พลาด แม้จะกดถูกตัว', () => {
  const { y } = setup();
  yui.beginSong(engine, y, 'treasure');
  y.qte.deadline = Date.now() - 1; // จำลองว่าเลยเวลาไปแล้ว
  engine.qteKey(y.id, y.qte.keys[0]);
  assert.equal(y.qte, null);
  assert.ok(queued.includes('yuiSongFail'));
});

test('QTE: จำนวนตัวโน้ตต่างกันตามความยากเพลง', () => {
  assert.equal(yui.SONGS.girl_dont_cry.notes, 7);
  assert.equal(yui.SONGS.my_soul_your_beats.notes, 10);
  assert.equal(yui.SONGS.treasure.notes, 5);
});

// ---------------------------------------------------------------- สกิลพื้นฐาน ปากแจ๋ว
test('ปากแจ๋ว: ล่อเป้า 1 เทิร์น + ฟื้นเลือด 3', () => {
  const { y, a } = setup();
  y.hp = 3;
  yui.applyTaunt(engine, y);
  assert.equal(y.statuses.yuiTaunt, yui.TAUNT_TURNS);
  assert.equal(y.hp, 6);
  assert.deepEqual(yui.findTaunters(engine, a).map((o) => o.id), ['Y'], 'เข้าคิวล่อเป้า');
  delete y.statuses.yuiTaunt;
  assert.deepEqual(yui.findTaunters(engine, a), []);
});

// ---------------------------------------------------------------- สกิลรอง เยอรมันซูเพล็ก
test('เยอรมันซูเพล็ก: ลดดาเมจ 1 · สวนคืน 3 · สวนแล้วสถานะจบทันที', () => {
  const { y, a } = setup();
  yui.applyWrestle(engine, y);
  assert.equal(y.statuses.yuiWrestle, yui.WRESTLE_TURNS);
  assert.equal(y.statusAmt.yuiWrestle, yui.WRESTLE_USES);
  assert.equal(yui.canUseSkill(engine, y, 'secondary'), false, 'กดซ้ำไม่ได้');

  engine.withEffectSource(a, () => { engine.dealMixed(y, 3, true); });
  assert.equal(y.hp, 7 - (3 - yui.WRESTLE_REDUCE), 'ดาเมจเบาลง 1');

  const fx = yui.onAttackedNormally(engine, a, y);
  assert.ok(fx);
  assert.equal(a.hp, 7 - yui.WRESTLE_COUNTER);
  assert.ok(queued.includes('yuiSuplex'), 'เล่นวีดีโอก่อนลงดาเมจ');
  assert.equal(y.statuses.yuiWrestle, undefined, 'สวนครบโควตา -> สถานะจบก่อน 3 เทิร์น');
  assert.equal(yui.onAttackedNormally(engine, a, y), null, 'สวนซ้ำไม่ได้');
});

test('เยอรมันซูเพล็ก: ระหว่าง girl don\'t cry สวนได้ 2 ครั้ง', () => {
  const { y, a } = setup();
  y.statuses.yuiRock = 5;
  yui.applyWrestle(engine, y);
  assert.equal(y.statusAmt.yuiWrestle, yui.WRESTLE_USES_ROCK);

  yui.onAttackedNormally(engine, a, y);
  assert.equal(y.statuses.yuiWrestle, yui.WRESTLE_TURNS, 'ครั้งแรกยังไม่จบ');
  assert.equal(y.statusAmt.yuiWrestle, 1);
  yui.onAttackedNormally(engine, a, y);
  assert.equal(y.statuses.yuiWrestle, undefined, 'ครบ 2 ครั้งแล้วจบ');
});

// ---------------------------------------------------------------- เพลง girl don't cry
test("girl don't cry: ATK +1 ทั้งวง และคนแต้มสกิลน้อยสุดได้ +1 ต่อเทิร์น", () => {
  const { y, a, b } = setup();
  yui.beginSong(engine, y, 'girl_dont_cry');
  playQte(y);
  for (const o of [y, a, b]) assert.equal(o.statuses.yuiRock, yui.SONG_TURNS);
  assert.equal(computeAttackBase(engine, a, b).base, 1 + yui.ROCK_ATK);

  a.skillPoints = 2; b.skillPoints = 5; y.skillPoints = 8;
  yui.onRoundStartAfterLoop(engine);
  assert.equal(a.skillPoints, 3, 'คนแต้มน้อยสุดได้ +1');
  assert.equal(b.skillPoints, 5);

  b.skillPoints = 1; // ประเมินใหม่ทุกเทิร์น -> เปลี่ยนคนได้
  yui.onRoundStartAfterLoop(engine);
  assert.equal(b.skillPoints, 2);
  assert.equal(a.skillPoints, 3);
});

// ---------------------------------------------------------------- เพลง my soul your beats
test('my soul your beats: ใครจั่ว คนอื่นในวงจั่วตาม (ยุยไม่เกี่ยว · คนเปิดไพ่แล้วไม่โดน)', () => {
  const { y, a, b } = setup();
  seedDeck();
  const c = mk('C', 'tohno', 4);
  engine.players.C = c;
  for (const o of [a, b, c]) o.statuses.yuiBeats = 5;
  y.statuses.yuiBeats = 5; // ต่อให้ยุยติดเอง ก็ต้องไม่ถูกนับ
  c.locked = true;         // เปิดไพ่ไปแล้ว

  yui.onCardDraw(engine, a);
  assert.equal(b.cards.length, 1, 'คนในวงจั่วตาม');
  assert.equal(y.cards.length, 0, 'ยุยไม่จั่วตาม');
  assert.equal(c.cards.length, 0, 'คนที่เปิดไพ่แล้วแต้มหยุดอยู่แค่นั้น');
});

test('my soul your beats: การจั่วตามต้องไม่วนเป็นลูก (echo ไม่กระตุ้นซ้ำ)', () => {
  const { y, a, b } = setup();
  seedDeck();
  for (const o of [a, b]) o.statuses.yuiBeats = 5;
  yui.onCardDraw(engine, a);
  assert.equal(b.cards.length, 1, 'จั่วตามใบเดียว ไม่วนกลับมาซ้ำ');
  assert.equal(a.cards.length, 0, 'คนที่จั่วเองไม่ถูกจั่วซ้ำ');
  assert.equal(y.cards.length, 0);
});

test('my soul your beats: ไพ่แตกรับความเสียหาย 1 หน่วย ได้หลายคนพร้อมกัน (ยกเว้นยุย)', () => {
  const { y, a, b } = setup();
  for (const o of [y, a, b]) o.statuses.yuiBeats = 5;
  bust(y); bust(a); bust(b);
  yui.onAfterResolve(engine);
  assert.equal(a.hp, 7 - yui.BEATS_BUST_DMG);
  assert.equal(b.hp, 7 - yui.BEATS_BUST_DMG);
  assert.equal(y.hp, 7, 'ยุยไม่โดนของตัวเอง');
});

// ---------------------------------------------------------------- เพลงสมบัติล้ำค่าที่สุด
test('สมบัติล้ำค่าฯ: ยุยยืนเฉยๆ 5 เทิร์น แล้วเป้าหมายฟื้นพร้อมบัฟ "ทำนอง"', () => {
  const { y, a, b } = setup();
  a.alive = false; a.hp = 0;
  assert.equal(yui.prepareReviveTarget(engine, y, [b.id]), null, 'คนเป็นอยู่เลือกไม่ได้');
  assert.equal(yui.prepareReviveTarget(engine, y, [a.id]), a);

  y.yuiReviveTargetId = a.id;
  yui.beginSong(engine, y, 'treasure');
  playQte(y);
  assert.equal(y.statuses.yuiWait, yui.SONG_TURNS);
  assert.equal(y.yuiReviveRound, engine.roundNumber + yui.REVIVE_DELAY);
  assert.equal(yui.canUseSkill(engine, y, 'basic'), false, 'ระหว่างรอทำอะไรไม่ได้');

  engine.setRoundNumber(y.yuiReviveRound - 1);
  assert.equal(yui.maybeRevive(engine, y), false, 'ยังไม่ครบกำหนด');
  assert.equal(a.alive, false);

  engine.setRoundNumber(y.yuiReviveRound);
  assert.equal(yui.maybeRevive(engine, y), true);
  assert.equal(a.alive, true);
  assert.equal(a.hp, yui.REVIVE_HP);
  assert.equal(a.armor, yui.REVIVE_ARMOR);
  assert.equal(a.statuses.yuiMelody, yui.MELODY_TURNS);
  assert.equal(computeAttackBase(engine, a, b).base, 1 + yui.MELODY_ATK, 'บัฟทำนอง +2');
  assert.equal(y.statuses.yuiWait, undefined, 'ยุยขยับได้แล้ว');
});

// บั๊กที่เจอจริง: บรรเลงเพลงชุบชีวิตเป็นเพลงที่ 3 พอดี -> "ความปรารถนา" ฆ่ายุยในจังหวะเดียวกัน
//  เป้าหมายเลยค้างตายถาวรและเกมจบแบบไม่มีใครได้อะไร
test('สมบัติล้ำค่าฯ: ยุยตายแล้วไม่เหลือใครอีก -> เป้าหมายฟื้นทันที ไม่รอครบ 5 เทิร์น', () => {
  const { y, a, b } = setup();
  a.alive = false; a.hp = 0;
  b.alive = false; b.hp = 0;   // เหลือแค่ยุยกับเป้าหมาย
  y.yuiSongs = ['girl_dont_cry', 'my_soul_your_beats'];
  y.yuiReviveTargetId = a.id;

  yui.beginSong(engine, y, 'treasure');
  playQte(y);

  assert.equal(y.yuiSongs.length, 3);
  assert.equal(y.alive, false, 'ความปรารถนาฆ่ายุยทันที');
  assert.equal(a.alive, true, 'เป้าหมายฟื้นทันที ไม่ต้องรอ 5 เทิร์น');
  assert.equal(a.hp, yui.REVIVE_HP);
  assert.equal(a.statuses.yuiMelody, yui.MELODY_TURNS);
  assert.equal(y.yuiReviveRound, 0, 'คิวถูกล้างแล้ว');
});

test('สมบัติล้ำค่าฯ: ยุยตายก่อนแต่ยังมีคนเล่นต่อได้ -> ผลหายไป ไม่มีการชุบชีวิต', () => {
  const { y, a, b } = setup();
  a.alive = false; a.hp = 0;
  assert.ok(b.alive, 'ยังมีคนอื่นเหลืออยู่ = ไม่เข้าเงื่อนไขฟื้นทันที');
  y.yuiReviveTargetId = a.id;
  yui.beginSong(engine, y, 'treasure');
  playQte(y);

  y.alive = false;
  engine.setRoundNumber(y.yuiReviveRound);
  assert.equal(yui.maybeRevive(engine, y), false);
  assert.equal(a.alive, false, 'ไม่ถูกชุบ');
  assert.equal(y.yuiReviveRound, 0, 'คิวถูกล้างทิ้ง');
});

// ---------------------------------------------------------------- สกิลติดตัว ความปรารถนา
test('ความปรารถนา: ครบ 3 เพลงไม่ซ้ำ -> ยุยตายทันที + ล้างเกราะทุกคน + ผุพัง 5 เทิร์น', () => {
  const { y, a, b } = setup();
  a.armor = 3; b.armor = 2;

  for (const key of ['girl_dont_cry', 'my_soul_your_beats']) {
    yui.beginSong(engine, y, key);
    playQte(y);
    assert.equal(y.alive, true, 'ยังไม่ครบ 3 เพลง');
  }
  assert.deepEqual(y.yuiSongs, ['girl_dont_cry', 'my_soul_your_beats']);

  a.alive = false; a.hp = 0; // ให้เพลงที่ 3 มีเป้าหมายให้ชุบ
  y.yuiReviveTargetId = a.id;
  yui.beginSong(engine, y, 'treasure');
  playQte(y);

  assert.equal(y.yuiSongs.length, 3);
  assert.equal(y.alive, false, 'ตายทันทีเมื่อครบ 3 เพลง');
  assert.equal(y.yuiWishDeath, true);
  assert.ok(queued.includes('yuiDead'), 'เล่นวีดีโอไว้อาลัย');
  assert.equal(b.armor, 0, 'เกราะทุกคนสลาย');
  assert.equal(b.statuses.decay, yui.WISH_DECAY_TURNS, 'ทุกคนติดผุพัง');
});

test('ความปรารถนา: เล่นเพลงซ้ำเพลงเดิมไม่นับเพิ่ม', () => {
  const { y } = setup();
  for (let i = 0; i < 3; i++) {
    yui.beginSong(engine, y, 'girl_dont_cry');
    playQte(y);
  }
  assert.deepEqual(y.yuiSongs, ['girl_dont_cry']);
  assert.equal(y.alive, true, 'ยังไม่ตาย เพราะยังไม่ครบ 3 เพลงที่ต่างกัน');
});

test('ความปรารถนา: บรรเลงพลาดไม่นับเป็นเพลงที่เล่นแล้ว', () => {
  const { y } = setup();
  yui.beginSong(engine, y, 'girl_dont_cry');
  playQte(y, false);
  assert.deepEqual(y.yuiSongs, []);
});

// ---------------------------------------------------------------- โหมดทีม
test('โหมดทีม: girl don\'t cry ลงเฉพาะพวกเดียวกัน · my soul your beats ลงเฉพาะฝ่ายตรงข้าม', () => {
  const { y, a, b } = setup();
  engine.setGameMode('duo');
  y.teamId = 'A'; a.teamId = 'A'; b.teamId = 'B';

  yui.beginSong(engine, y, 'girl_dont_cry');
  playQte(y);
  assert.equal(y.statuses.yuiRock, yui.SONG_TURNS);
  assert.equal(a.statuses.yuiRock, yui.SONG_TURNS, 'เพื่อนร่วมทีมได้');
  assert.equal(b.statuses.yuiRock, undefined, 'ฝ่ายตรงข้ามไม่ได้');

  yui.beginSong(engine, y, 'my_soul_your_beats');
  playQte(y);
  assert.equal(b.statuses.yuiBeats, yui.SONG_TURNS, 'ฝ่ายตรงข้ามโดน');
  assert.equal(a.statuses.yuiBeats, undefined, 'เพื่อนร่วมทีมไม่โดน');
  assert.equal(y.statuses.yuiBeats, undefined, 'ยุยไม่โดน');
  engine.setGameMode('ffa');
});
