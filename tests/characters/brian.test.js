const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const brian = require('../../characters/brian.js');
const CHARACTERS = require('../../characters.js');

const saved = {
  queueCutscene: engine.queueCutscene,
  runCutsceneQueue: engine.runCutsceneQueue,
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  skillFlash: engine.skillFlash,
};

let queued = [];

test.before(() => {
  engine.queueCutscene = (p, key) => { queued.push(key); };
  engine.runCutsceneQueue = (onDone) => { if (onDone) onDone(); };
  engine.startPhaseTimer = () => {};
  engine.broadcastState = () => {};
  engine.skillFlash = () => {};
});

test.after(() => {
  engine.clearPhaseTimer();
  Object.assign(engine, saved);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 7, maxHpPenalty: 0, armor: 0, shield: 0, tempHp: 0,
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, cardBonus: 0,
  };
}

function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = [];
  const b = mk('B', 'brian', 1);
  const a = mk('A', 'temari', 2);
  const c = mk('C', 'temari', 3);
  engine.players.B = b;
  engine.players.A = a;
  engine.players.C = c;
  for (const p of [b, a, c]) brian.resetCombat(p);
  engine.setRoundNumber(3);
  engine.setGameMode('ffa');
  engine.setGameState('PLAYING');
  return { b, a, c };
}

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('ข้อมูลตัวละครลงทะเบียนครบ (รวมช่องท่าไม้ตาย 2 N2O)', () => {
  const ch = CHARACTERS.CHAR_BY_ID.brian;
  assert.ok(ch);
  assert.equal(ch.difficulty, 'special');
  assert.equal(ch.unique, true);
  assert.equal(ch.basic.cost, 1);
  assert.equal(ch.secondary.cost, 4);
  assert.equal(ch.ultimate.cost, 8);
  assert.equal(ch.ultimate2.cost, 0, 'N2O ไม่เสียแต้มสกิล');
});

// ---------------------------------------------------------------- สกิลติดตัว น้ำมันรถ
test('น้ำมัน: เริ่มเต็มถัง · ฟื้นเทิร์นละ 1 · ไม่เกินเพดาน', () => {
  const { b } = setup();
  assert.equal(brian.fuelOf(b), brian.FUEL_MAX);
  brian.addFuel(engine, b, -5, 'ทดสอบ');
  assert.equal(brian.fuelOf(b), 7);
  brian.onRoundStartTick(engine, b);
  assert.equal(brian.fuelOf(b), 8, 'ไม่ได้อยู่ในรถ = ฟื้นเทิร์นละ 1');
  brian.addFuel(engine, b, 99, 'ทดสอบ');
  assert.equal(brian.fuelOf(b), brian.FUEL_MAX, 'ตันที่เพดาน');
});

test('น้ำมัน: ชนะการจั่วได้ +2 และได้แม้อยู่ในรถ', () => {
  const { b } = setup();
  brian.addFuel(engine, b, -6, 'ทดสอบ');
  brian.startCar(engine, b);
  brian.onRoundWin(engine, b);
  assert.equal(brian.fuelOf(b), 8, '6 + 2 (อยู่ในรถก็ยังได้)');
});

test('น้ำมัน: อยู่ในรถแล้วไม่ฟื้นรายเทิร์น — รถกินแทน และแปลงเป็นเลือดทุก 2 หน่วย', () => {
  const { b } = setup();
  b.hp = 3;
  brian.startCar(engine, b);
  brian.onRoundStartTick(engine, b); // กิน 1 (สะสม 1) — ยังไม่ครบ 2
  assert.equal(brian.fuelOf(b), 11);
  assert.equal(b.hp, 3, 'ยังไม่ครบ 2 หน่วย');
  brian.onRoundStartTick(engine, b); // กินอีก 1 (สะสม 2) -> เลือด +1
  assert.equal(brian.fuelOf(b), 10);
  assert.equal(b.hp, 4, 'ครบ 2 หน่วย -> พลังชีวิต +1');
});

test('น้ำมัน: ร่างเพิ่มพลังกินเทิร์นละ 2 -> ฟื้นเลือดทุกเทิร์น และให้พลังโจมตี +1', () => {
  const { b, a } = setup();
  b.hp = 3;
  brian.startCar(engine, b);
  brian.boostCar(engine, b);
  assert.equal(computeAttackBase(engine, b, a).base, 1 + brian.BOOST_ATK);
  brian.onRoundStartTick(engine, b);
  assert.equal(brian.fuelOf(b), 10);
  assert.equal(b.hp, 4, 'กิน 2 หน่วยรวดเดียว = เลือด +1 ทุกเทิร์น');
});

test('น้ำมันหมดถัง -> รถดับเองในเทิร์นเดียวกัน', () => {
  const { b } = setup();
  brian.startCar(engine, b);
  brian.addFuel(engine, b, -11, 'ทดสอบ'); // เหลือ 1
  brian.onRoundStartTick(engine, b);
  assert.equal(brian.fuelOf(b), 0);
  assert.equal(brian.carOn(b), false, 'รถดับเมื่อน้ำมันหมด');
  assert.equal(brian.boostOn(b), false);
});

test('"ถังรั่ว" กันการฟื้นน้ำมันรายเทิร์น แต่ไม่กันน้ำมันจากการชนะการจั่ว', () => {
  const { b } = setup();
  brian.addFuel(engine, b, -8, 'ทดสอบ'); // เหลือ 4
  b.statuses.brianNoFuel = brian.NO_REFUEL_TURNS;
  brian.onRoundStartTick(engine, b);
  assert.equal(brian.fuelOf(b), 4, 'ฟื้นรายเทิร์นไม่ได้');
  brian.onRoundWin(engine, b);
  assert.equal(brian.fuelOf(b), 6, 'แต่ชนะการจั่วยังได้ +2');
});

// ---------------------------------------------------------------- กุญแจรถ
test('กุญแจรถ: วีดีโอขึ้นรถ/เพิ่มพลัง เล่นเฉพาะครั้งแรกครั้งเดียว', () => {
  const { b } = setup();
  brian.startCar(engine, b);
  assert.deepEqual(queued, ['brianKey']);
  brian.stopCar(engine, b, 'ทดสอบ');
  brian.startCar(engine, b);
  assert.deepEqual(queued, ['brianKey'], 'ขึ้นรถรอบสองไม่เล่นซ้ำ');
  brian.boostCar(engine, b);
  brian.stopCar(engine, b, 'ทดสอบ');
  brian.startCar(engine, b);
  brian.boostCar(engine, b);
  assert.deepEqual(queued, ['brianKey', 'brianBoost'], 'เพิ่มพลังก็เล่นครั้งแรกครั้งเดียว');
});

test('กุญแจรถ: กดครั้งที่ 2 ต้องเลือก off/boost เสมอ · เพิ่มพลังซ้ำไม่ได้', () => {
  const { b } = setup();
  assert.equal(brian.canUseSkill(engine, b, 'basic'), true, 'ยังไม่ขึ้นรถ = กดได้เลย');
  brian.startCar(engine, b);
  assert.equal(brian.canUseSkill(engine, b, 'basic'), false, 'อยู่ในรถแล้วต้องเลือกก่อน');
  assert.equal(brian.canUseSkill(engine, b, 'basic', 'off'), true);
  assert.equal(brian.canUseSkill(engine, b, 'basic', 'boost'), true);
  brian.boostCar(engine, b);
  assert.equal(brian.canUseSkill(engine, b, 'basic', 'boost'), false, 'เพิ่มพลังซ้ำไม่ได้');
  assert.equal(brian.canUseSkill(engine, b, 'basic', 'off'), true, 'แต่ยังดับเครื่องได้');
});

test('ลงจากรถ: ล้างทั้งร่างปกติและร่างเพิ่มพลัง + เศษน้ำมันสะสมไม่ยกยอด', () => {
  const { b } = setup();
  brian.startCar(engine, b);
  brian.boostCar(engine, b);
  b.brianFuelBurned = 1;
  brian.stopCar(engine, b, 'ทดสอบ');
  assert.equal(brian.carOn(b), false);
  assert.equal(brian.boostOn(b), false);
  assert.equal(b.brianFuelBurned, 0);
});

// ---------------------------------------------------------------- กดดันคันหน้า
test('กดดันคันหน้า: ต้องอยู่ในรถและมีน้ำมันพอ · กดซ้ำระหว่างผลยังอยู่ไม่ได้', () => {
  const { b } = setup();
  assert.equal(brian.canUseSkill(engine, b, 'secondary'), false, 'ไม่ได้อยู่ในรถ');
  brian.startCar(engine, b);
  assert.equal(brian.canUseSkill(engine, b, 'secondary'), true);
  brian.applyPush(engine, b);
  assert.equal(brian.fuelOf(b), brian.FUEL_MAX - brian.PUSH_FUEL);
  assert.equal(b.statuses.brianPush, brian.PUSH_TURNS);
  assert.equal(brian.canUseSkill(engine, b, 'secondary'), false, 'ผลยังอยู่ = กดซ้ำไม่ได้');
  brian.addFuel(engine, b, -99, 'ทดสอบ');
  delete b.statuses.brianPush;
  assert.equal(brian.canUseSkill(engine, b, 'secondary'), false, 'น้ำมันไม่พอ');
});

test('หลีกทางไป: เลือกคนแต้มสูงสุดในบรรดาคนที่แต้มมากกว่าเรา (ไม่ใช่แค่คนแรกที่เจอ)', () => {
  const { b, a, c } = setup();
  brian.startCar(engine, b);
  brian.applyPush(engine, b);
  b.cards = [{ value: 10, color: 'red' }];   // เรา 10
  a.cards = [{ value: 12, color: 'red' }];   // มากกว่าเรา
  c.cards = [{ value: 15, color: 'red' }];   // มากกว่าและสูงสุด
  assert.equal(brian.pushTargetOf(engine, b).id, 'C');
  c.cards = [{ value: 9, color: 'red' }];    // เหลือ A คนเดียวที่มากกว่า
  assert.equal(brian.pushTargetOf(engine, b).id, 'A');
  a.cards = [{ value: 3, color: 'red' }];    // ไม่มีใครแต้มมากกว่าเราแล้ว
  assert.equal(brian.pushTargetOf(engine, b), null);
});

test('หลีกทางไป: คนที่ไพ่แตกไม่นับว่าแต้มมากกว่าเรา', () => {
  const { b, a } = setup();
  brian.startCar(engine, b);
  brian.applyPush(engine, b);
  b.cards = [{ value: 5, color: 'red' }];
  a.cards = [{ value: 12, color: 'red' }, { value: 12, color: 'red' }]; // 24 = แตก
  assert.equal(brian.pushTargetOf(engine, b), null, 'ไพ่แตกถือเป็น -1');
});

test('หลีกทางไป: ร่างเพิ่มพลังชนแรงขึ้นเป็น 2 หน่วย', () => {
  const { b, a } = setup();
  brian.startCar(engine, b);
  brian.applyPush(engine, b);
  const hp0 = a.hp;
  brian.applyPushHit(engine, b, a);
  assert.equal(hp0 - a.hp, brian.PUSH_DMG);
  brian.boostCar(engine, b);
  const hp1 = a.hp;
  brian.applyPushHit(engine, b, a);
  assert.equal(hp1 - a.hp, brian.PUSH_DMG_BOOST);
});

// ---------------------------------------------------------------- การแข่งที่มีเดิมพัน
test('การแข่ง: กดไม่ได้ถ้าไม่อยู่ในรถ / น้ำมันไม่พอ / "หลีกทางไป" ยังทำงานอยู่', () => {
  const { b } = setup();
  assert.equal(brian.canUseSkill(engine, b, 'ultimate'), false, 'ไม่ได้อยู่ในรถ');
  brian.startCar(engine, b);
  assert.equal(brian.canUseSkill(engine, b, 'ultimate'), true);
  b.statuses.brianPush = 3;
  assert.equal(brian.canUseSkill(engine, b, 'ultimate'), false, 'หลีกทางไปยังทำงานอยู่');
  delete b.statuses.brianPush;
  brian.addFuel(engine, b, -99, 'ทดสอบ');
  assert.equal(brian.canUseSkill(engine, b, 'ultimate'), false, 'น้ำมันไม่พอ');
});

test('การแข่ง: แช่คนนอก (บังคับไพ่แตก) และสุ่มการ์ดใหม่ให้คู่แข่งทั้งสอง', () => {
  const { b, a, c } = setup();
  engine.setCentralDeck([{ value: 7, color: 'red' }, { value: 4, color: 'blue' }, { value: 9, color: 'green' }]);
  brian.startCar(engine, b);
  c.cards = [{ value: 5, color: 'red' }];
  brian.startDuel(engine, b, a);
  assert.equal(c.brianFrozen, true);
  assert.equal(c.busted, true);
  assert.equal(c.locked, true);
  assert.equal(b.brianFrozen, false, 'คู่แข่งไม่ถูกแช่');
  assert.equal(a.brianFrozen, false);
  assert.equal(b.cards.length, 1, 'สุ่มการ์ดใหม่ใบเดียว');
  assert.equal(a.cards.length, 1);
  assert.ok(queued.includes('brianDuel'));
  assert.equal(engine.bustedOf(c), true, 'คนนอกถูกนับว่าไพ่แตก');
});

test('การแข่ง: ระหว่างแข่ง ทุกคนกดสกิลไม่ได้ ยกเว้น N2O ของไบรอัน', () => {
  const { b, a, c } = setup();
  brian.startCar(engine, b);
  brian.startDuel(engine, b, a);
  assert.equal(brian.skillBlocked(engine, c, 'basic'), true, 'คนนอกกดไม่ได้');
  assert.equal(brian.skillBlocked(engine, a, 'ultimate'), true, 'คู่แข่งก็กดไม่ได้');
  assert.equal(brian.skillBlocked(engine, b, 'secondary'), true, 'ไบรอันเองก็กดช่องอื่นไม่ได้');
  assert.equal(brian.skillBlocked(engine, b, 'ultimate'), false, 'ยกเว้น N2O');
  assert.equal(brian.itemBlocked(engine), true);
});

test('การแข่ง: ชนะ -> เป้าหมายเสียหาย 3 และไบรอันฟื้นน้ำมัน 2', () => {
  const { b, a } = setup();
  brian.startCar(engine, b);
  brian.startDuel(engine, b, a);
  brian.addFuel(engine, b, -99, 'ทดสอบ'); // ให้เห็นการฟื้นชัดๆ
  b.cards = [{ value: 20, color: 'red' }];
  a.cards = [{ value: 10, color: 'red' }];
  const hp0 = a.hp;
  assert.equal(brian.duelResolveRound(engine), true);
  assert.equal(hp0 - a.hp, brian.DUEL_WIN_DMG);
  assert.equal(brian.fuelOf(b), brian.DUEL_WIN_FUEL);
  assert.ok(queued.includes('brianDuelWin'));
  assert.equal(brian.duelActive(engine), false, 'จบใน 1 เทิร์น');
});

test('การแข่ง: ชนะด้วย N2O -> เสียหาย 5 แต่ไม่ฟื้นน้ำมัน + ใช้คลิปคนละตัว', () => {
  const { b, a } = setup();
  brian.startCar(engine, b);
  brian.startDuel(engine, b, a);
  b.brianDuel.n2o = true;
  brian.addFuel(engine, b, -99, 'ทดสอบ');
  b.cards = [{ value: 20, color: 'red' }];
  a.cards = [{ value: 10, color: 'red' }];
  const hp0 = a.hp;
  brian.duelResolveRound(engine);
  assert.equal(hp0 - a.hp, brian.DUEL_N2O_DMG);
  assert.equal(brian.fuelOf(b), 0, 'ชนะด้วย N2O ไม่ฟื้นน้ำมัน');
  assert.ok(queued.includes('brianN2OHit'));
  assert.ok(!queued.includes('brianDuelWin'));
});

test('การแข่ง: แพ้/เสมอ -> ไบรอันเสียหาย 2 + ถังรั่ว 3 เทิร์น', () => {
  for (const [mineVal, theirsVal, label] of [[5, 10, 'แพ้'], [10, 10, 'เสมอ']]) {
    const { b, a } = setup();
    brian.startCar(engine, b);
    brian.startDuel(engine, b, a);
    b.cards = [{ value: mineVal, color: 'red' }];
    a.cards = [{ value: theirsVal, color: 'red' }];
    const hp0 = b.hp;
    brian.duelResolveRound(engine);
    assert.equal(hp0 - b.hp, brian.DUEL_LOSE_DMG, label);
    assert.equal(b.statuses.brianNoFuel, brian.NO_REFUEL_TURNS, label);
    assert.ok(queued.includes('brianDuelLost'), label);
  }
});

test('การแข่ง: คู่แข่งตกรอบกลางคัน -> ยกเลิกการแข่งและปลดธงแช่ทุกคน', () => {
  const { b, a, c } = setup();
  brian.startCar(engine, b);
  brian.startDuel(engine, b, a);
  assert.equal(c.brianFrozen, true);
  a.alive = false;
  brian.onDeath(engine, a);
  assert.equal(brian.duelActive(engine), false);
  assert.equal(c.brianFrozen, false);
});

test('ไบรอันตกรอบ: ลงจากรถ + ยกเลิกการแข่ง', () => {
  const { b, a } = setup();
  brian.startCar(engine, b);
  brian.startDuel(engine, b, a);
  b.alive = false;
  brian.onDeath(engine, b);
  assert.equal(brian.carOn(b), false);
  assert.equal(brian.duelActive(engine), false);
});

// ---------------------------------------------------------------- regression: บั๊กที่ทำเซิร์ฟเวอร์พัง
test('[regression] เพลงประจำร่างรถไม่ทำให้ broadcastState พัง (เคยอ้าง best ก่อนประกาศ)', () => {
  const { b, a } = setup();
  const realBroadcast = saved.broadcastState;
  brian.startCar(engine, b);
  // เรียก broadcastState ตัวจริง -> buildStateFor -> activeSkillMusic (จุดที่เคยโยน ReferenceError)
  assert.doesNotThrow(() => realBroadcast());
  brian.boostCar(engine, b);
  assert.doesNotThrow(() => realBroadcast());
  brian.startDuel(engine, b, a); // ระหว่างการแข่งใช้เพลงคนละเพลง — ต้องไม่พังเหมือนกัน
  assert.doesNotThrow(() => realBroadcast());
});

test('[regression] "หลีกทางไป" ชนได้ครั้งเดียวต่อเทิร์น (กัน afterSummary วนไม่รู้จบ)', () => {
  const { b, a } = setup();
  brian.startCar(engine, b);
  brian.applyPush(engine, b);
  b.cards = [{ value: 5, color: 'red' }];
  a.cards = [{ value: 15, color: 'red' }];
  assert.ok(brian.pushTargetOf(engine, b), 'ยังไม่ชน = มีเป้าหมาย');
  brian.markPushFired(engine, b);
  assert.equal(brian.pushTargetOf(engine, b), null, 'ชนไปแล้วเทิร์นนี้ = ไม่มีเป้าหมายอีก');
  engine.setRoundNumber(engine.roundNumber + 1);
  assert.ok(brian.pushTargetOf(engine, b), 'เทิร์นใหม่กลับมาชนได้');
});

test('[regression] N2O กดได้ในเทิร์นเดียวกับที่กดท่าไม้ตาย 1 (ไม่ติดโควตาสกิลของเทิร์น)', () => {
  const { b, a } = setup();
  engine.setCentralDeck(Array.from({ length: 40 }, (_, i) => ({ value: (i % 11) + 1, color: 'red' })));
  b.skillPoints = 8;
  brian.startCar(engine, b);
  engine.setGameState('PLAYING'); // คัตซีนดันเกมเข้าเฟส CUTSCENE — ในเกมจริงมันจบแล้วกลับมาเอง
  engine.useSkill('B', 'ultimate', ['A']);
  assert.equal(brian.duelActive(engine), true, 'การแข่งเริ่มแล้ว');
  assert.equal(b.skillUsedRound, true, 'ท่าไม้ตาย 1 กินโควตาสกิลของเทิร์นไปแล้ว');

  engine.setGameState('PLAYING');
  engine.useSkill('B', 'ultimate'); // N2O — ถ้าไม่ยกเว้นโควตา บรรทัดนี้จะเงียบไปเฉยๆ
  assert.equal(engine.calculateScore(b.cards), 21, 'N2O ต้องดันแต้มขึ้น 21 ได้จริง');
  assert.equal(b.brianDuel.n2o, true);
  assert.equal(brian.fuelOf(b), 0, 'เทน้ำมันทั้งถัง');
});

test('[regression] ระหว่างการแข่ง คนอื่นกดสกิลไม่ได้จริงผ่านท่อ useSkill', () => {
  const { b, a, c } = setup();
  b.skillPoints = 8;
  brian.startCar(engine, b);
  engine.setGameState('PLAYING');
  engine.useSkill('B', 'ultimate', ['A']);
  engine.setGameState('PLAYING');
  const before = c.skillPoints;
  engine.useSkill('C', 'basic');
  assert.equal(c.skillPoints, before, 'คนนอกวงกดสกิลไม่ได้ และไม่เสียแต้ม');
});

// ---------------------------------------------------------------- N2O
test('N2O: ช่องท่าไม้ตายเปลี่ยนเป็น N2O เฉพาะระหว่างการแข่ง และต้องมีน้ำมัน >= 4', () => {
  const { b, a } = setup();
  assert.equal(brian.n2oSlot(engine, b), false, 'นอกการแข่งไม่ใช่ N2O');
  brian.startCar(engine, b);
  brian.startDuel(engine, b, a);
  assert.equal(brian.n2oSlot(engine, b), true);
  assert.equal(brian.n2oReady(engine, b), true);
  brian.addFuel(engine, b, -(brian.fuelOf(b) - 3), 'ทดสอบ'); // เหลือ 3
  assert.equal(brian.n2oReady(engine, b), false, 'ต่ำกว่า 4 กดไม่ได้');
  assert.equal(brian.canUseSkill(engine, b, 'ultimate'), false);
});

test('N2O: เติมการ์ดจากกองกลางจนแต้มเป็น 21 พอดี และเทน้ำมันทั้งถัง', () => {
  const { b, a } = setup();
  brian.startCar(engine, b);
  brian.startDuel(engine, b, a);
  // seed หลัง startDuel เพราะการสุ่มการ์ดใหม่กินไพ่จากกองไป 2 ใบ
  //  กองนี้จงใจให้ greedy "หยิบใบใหญ่สุดก่อน" ตัน (12 แล้วเหลือ 4 ซึ่งไม่มีใบเติม) แต่ 9+5+2 = 16 พอดี
  engine.setCentralDeck([
    { value: 12, color: 'red' }, { value: 9, color: 'red' }, { value: 5, color: 'blue' }, { value: 2, color: 'green' },
  ]);
  b.cards = [{ value: 5, color: 'red' }]; // เริ่มที่ 5 -> ต้องเติมอีก 16
  brian.applyN2O(engine, b);
  assert.equal(engine.calculateScore(b.cards), 21, 'เติมจนครบ 21 พอดี');
  assert.equal(brian.fuelOf(b), 0, 'เทน้ำมันทั้งถัง');
  assert.equal(b.brianDuel.n2o, true, 'ทำเครื่องหมายว่าชนะด้วย N2O');
  assert.ok(queued.includes('brianN2O'));
});

test('N2O: น้ำมันที่เทไปไม่แปลงเป็นพลังชีวิต (ค่าสกิลไม่นับ)', () => {
  const { b, a } = setup();
  brian.startCar(engine, b);
  brian.startDuel(engine, b, a);
  engine.setCentralDeck([{ value: 8, color: 'red' }, { value: 13, color: 'blue' }]);
  b.hp = 3;
  b.brianFuelBurned = 0;
  brian.applyN2O(engine, b);
  assert.equal(b.hp, 3, 'เทน้ำมัน 10 หน่วยแต่ไม่ได้เลือดสักหน่วย');
});
