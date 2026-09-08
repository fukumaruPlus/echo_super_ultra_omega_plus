// ทดสอบโหมด SE.RA.PH Moon Cell (seraph.js) โดย mock engine — ไม่ต้อง spawn server
// อ้างอิงกติกา: SERAPH_MOONCELL.md
const test = require("node:test");
const assert = require("node:assert");
const Seraph = require("../seraph");

function mkPlayer(id, name) {
  return { id, name, alive: true, cards: [], locked: false, busted: false, inventory: [], gold: 0, hp: 0, armor: 0, skillPoints: 0, characterId: "hakuno" };
}
function mkEngine(n = 4) {
  const players = {};
  for (let i = 1; i <= n; i++) players[`p${i}`] = mkPlayer(`p${i}`, `ผู้เล่น${i}`);
  const logs = [];
  return {
    players,
    logs,
    CHAR_BY_ID: { hakuno: { name: "คิชินามิ ฮาคุโนะ" } },
    log: (m) => logs.push(m),
    addGold: (p, n2) => { p.gold += n2; },
    broadcastState: () => {},
  };
}
function startWith(n = 4) {
  const e = mkEngine(n);
  Seraph.startMatch(e);
  return e;
}

test.afterEach(() => Seraph.reset());

test("startMatch: ทุกคนเริ่มเท่ากันหมด 3/2/แต้มสกิล 0/เงิน 10/ระดับ 1 (ค่าพลังเดิมของตัวละครถูกละทิ้ง)", () => {
  const e = startWith(4);
  for (const p of Object.values(e.players)) {
    assert.strictEqual(p.hp, 3);
    assert.strictEqual(p.armor, 2);
    assert.strictEqual(p.scCapSkill, 4);
    assert.strictEqual(p.skillPoints, 0);
    assert.strictEqual(p.gold, 10);
    assert.strictEqual(p.scSkillLevel, 1);
    assert.strictEqual(p.scMatrix, 0);
  }
  assert.strictEqual(Seraph.currentDay(), 1);
  assert.strictEqual(Seraph.currentCycle(), 1);
  assert.ok(Seraph.active());
});

test("กองไพ่เหลือ 40 ใบ — ไม่มี King/Queen/Joker", () => {
  const deck = Seraph.deckCards(["red", "blue", "green", "yellow"]);
  assert.strictEqual(deck.length, 40);
  assert.ok(deck.every((c) => !c.special));
  assert.strictEqual(deck.filter((c) => c.value === 10).length, 4);
});

test("วันที่ 1-4 คือช่วงไม่มีการต่อสู้ · วันที่ 5 คือวันดวล", () => {
  const e = startWith(4);
  for (let d = 1; d <= 4; d++) {
    assert.strictEqual(Seraph.noCombat(), true, `วันที่ ${d} ต้องไม่มีการต่อสู้`);
    assert.strictEqual(Seraph.isDuelDay(), false);
    const { next } = Seraph.advanceDay(e);
    if (d === 4) assert.strictEqual(next, "duelDay");
  }
  Seraph.beginDuelDay(e);
  assert.strictEqual(Seraph.currentDay(), 5);
  assert.strictEqual(Seraph.isDuelDay(), true);
  assert.strictEqual(Seraph.noCombat(), false);
});

test("ผู้ชนะวันธรรมดาได้ Matrix +1 · เพดาน 4 แล้วไม่เกิน", () => {
  const e = startWith(4);
  const w = e.players.p1;
  for (let i = 0; i < 6; i++) Seraph.onRoundWinner(e, w);
  assert.strictEqual(w.scMatrix, 4);
  assert.ok(e.logs.some((m) => m.includes("Matrix เต็มแล้ว")));
});

test("ผู้ชนะไม่ได้ Matrix ในวันที่ 5 (รางวัลมีเฉพาะวันธรรมดา)", () => {
  const e = startWith(4);
  for (let d = 1; d <= 4; d++) Seraph.advanceDay(e);
  Seraph.beginDuelDay(e);
  const w = e.players.p1;
  const before = w.scMatrix || 0;
  Seraph.onRoundWinner(e, w);
  assert.strictEqual(w.scMatrix, before);
});

test("โบสถ์: เพิ่มความจุได้ทีละ 1 อย่าง · ความจุแต้มสกิลตันที่ 8", () => {
  const e = startWith(2);
  const p = e.players.p1;
  Seraph.startPlacePhase(e, () => {});
  Seraph.choosePlace(e, "p1", "church", { option: "hp" });
  assert.strictEqual(p.scCapHp, 4);

  for (let i = 0; i < 10; i++) {
    Seraph.startPlacePhase(e, () => {});
    Seraph.choosePlace(e, "p1", "church", { option: "skill" });
  }
  assert.strictEqual(p.scCapSkill, 8, "ความจุแต้มสกิลต้องตันที่ 8");
});

test("ห้องสมุด: ระดับทักษะ +1 ปลดล็อกสกิลรองที่ 3 และท่าไม้ตายที่ 6 (ตันที่ 6)", () => {
  const e = startWith(2);
  const p = e.players.p1;
  assert.strictEqual(Seraph.tierUnlocked(p, "basic"), true);
  assert.strictEqual(Seraph.tierUnlocked(p, "secondary"), false);

  for (let i = 0; i < 8; i++) {
    Seraph.startPlacePhase(e, () => {});
    Seraph.choosePlace(e, "p1", "library", {});
  }
  assert.strictEqual(p.scSkillLevel, 6, "ระดับทักษะต้องตันที่ 6");
  assert.strictEqual(Seraph.tierUnlocked(p, "secondary"), true);
  assert.strictEqual(Seraph.tierUnlocked(p, "ultimate"), true);
  // ปลดท่าไม้ตายแล้วยังร่ายไม่ได้เพราะความจุแค่ 4 — ต้องมีคำเตือน (นี่คือความตั้งใจของดีไซน์)
  assert.ok(e.logs.some((m) => m.includes("ท่าไม้ตายต้องการ 6")));
});

test("ห้องสมุดกดไม่ได้เมื่อระดับเต็ม · สวนสาธารณะกดไม่ได้เมื่อไม่มี Matrix", () => {
  const e = startWith(2);
  const p = e.players.p1;
  assert.strictEqual(Seraph.placeAvailable(e, p, "park"), false, "ไม่มีแต้มก็เข้าสวนไม่ได้");
  p.scMatrix = 1;
  assert.strictEqual(Seraph.placeAvailable(e, p, "park"), true);
  p.scSkillLevel = 6;
  assert.strictEqual(Seraph.placeAvailable(e, p, "library"), false);
  assert.strictEqual(Seraph.placeAvailable(e, p, "room"), true, "ห้องพักเข้าได้เสมอ");
});

test("ราคาสกิลมาจากระดับทักษะ ไม่ใช่ค่าของตัวละคร — 2 / 4 / 6", () => {
  assert.strictEqual(Seraph.costOf("basic"), 2);
  assert.strictEqual(Seraph.costOf("secondary"), 4);
  assert.strictEqual(Seraph.costOf("ultimate"), 6);
});

test("สวนสาธารณะ: ลง Matrix ได้สูงสุด 3 ต่อเป้าหมาย และไม่เกินแต้มที่ถืออยู่", () => {
  const e = startWith(3);
  const p = e.players.p1;
  p.scMatrix = 4;
  Seraph.startPlacePhase(e, () => {});
  // พยายามลง 5 แต้มใส่ p2 คนเดียว -> ได้แค่ 3 (เพดานต่อเป้าหมาย)
  Seraph.choosePlace(e, "p1", "park", { targets: ["p2", "p2", "p2", "p2", "p2"] });
  assert.strictEqual(p.scPlaced.p2, 3);
  assert.strictEqual(p.scMatrix, 1, "ใช้ไป 3 จาก 4");
});

test("Matrix ระดับ 2 = รับดาเมจจากเป้าหมายนั้นน้อยลง 1 (ระดับ 1 ไม่ลด)", () => {
  const e = startWith(2);
  const victim = e.players.p1;
  victim.scPlaced = { p2: 1 };
  assert.strictEqual(Seraph.damageReduction(victim, "p2"), 0);
  victim.scPlaced = { p2: 2 };
  assert.strictEqual(Seraph.damageReduction(victim, "p2"), 1);
  assert.strictEqual(Seraph.damageReduction(victim, "p3"), 0, "ลดเฉพาะดาเมจจากคนที่จับตาไว้");
});

test("ตัวตนถูกซ่อนจนกว่าจะลงดวล แล้วคนที่เห็นแล้วเห็นตลอดไป", () => {
  const e = startWith(4);
  const [p1, p2] = [e.players.p1, e.players.p2];
  assert.strictEqual(Seraph.canSee(p1, p1), true, "เห็นตัวเองเสมอ");
  assert.strictEqual(Seraph.canSee(p1, p2), false, "ยังไม่เคยเห็น");

  Seraph.makePairs(e);
  Seraph.beginDuelDay(e);
  // คู่แรกลงสนาม -> ทุกคนที่ดูอยู่เห็นทั้งสองคน
  const pair = Seraph.stateFor(e, "p1").duelPair;
  for (const viewer of Object.values(e.players)) {
    assert.strictEqual(Seraph.canSee(viewer, e.players[pair.a]), true);
    assert.strictEqual(Seraph.canSee(viewer, e.players[pair.b]), true);
  }
  // คนที่ไม่ได้ลงสนามยังถูกซ่อนอยู่
  const other = Object.values(e.players).find((p) => p.id !== pair.a && p.id !== pair.b);
  if (other) assert.strictEqual(Seraph.canSee(e.players[pair.a], other), false);
});

test("จับคู่: จำนวนคี่ต้องมีคนผ่านฟรี 1 คน · จำนวนคู่ไม่มี", () => {
  const e5 = startWith(5);
  Seraph.makePairs(e5);
  let st = Seraph.stateFor(e5, "p1");
  assert.strictEqual(st.pairs.length, 2);
  assert.ok(st.bye, "เลขคี่ต้องมีคนผ่านฟรี");
  Seraph.reset();

  const e4 = startWith(4);
  Seraph.makePairs(e4);
  st = Seraph.stateFor(e4, "p1");
  assert.strictEqual(st.pairs.length, 2);
  assert.strictEqual(st.bye, null);
});

test("วันที่ 5: ลงสนามแค่คู่ที่กำลังดวล คนอื่นเป็นผู้ชม", () => {
  const e = startWith(4);
  Seraph.makePairs(e);
  Seraph.beginDuelDay(e);
  Seraph.onDealRound(e);
  const fighting = Seraph.combatants(e);
  assert.strictEqual(fighting.length, 2);
  const spectators = Object.values(e.players).filter((p) => p.scSpectator);
  assert.strictEqual(spectators.length, 2);
  assert.ok(spectators.every((p) => p.locked === true && p.cards.length === 0), "ผู้ชมต้องถูกล็อกและไม่มีไพ่");
});

test("ผู้แพ้ตกรอบ แล้วคิวเดินไปคู่ถัดไป จนหมดคิวจึงจบรอบ", () => {
  const e = startWith(4);
  Seraph.makePairs(e);
  Seraph.beginDuelDay(e);
  const st0 = Seraph.stateFor(e, "p1");
  const pair0 = st0.pairs[0];

  assert.strictEqual(Seraph.checkDuelProgress(e), "continue", "ยังไม่มีใครตาย = ดวลต่อ");
  e.players[pair0.a].alive = false;
  assert.strictEqual(Seraph.checkDuelProgress(e), "nextPair");
  assert.strictEqual(e.players[pair0.a].scEliminated, true);
  assert.strictEqual(e.players[pair0.b].scEliminated, false);

  const pair1 = Seraph.stateFor(e, "p1").pairs[1];
  e.players[pair1.b].alive = false;
  assert.strictEqual(Seraph.checkDuelProgress(e), "cycleEnd", "หมดคิวคู่ดวลแล้ว");
  assert.strictEqual(Seraph.survivors(e).length, 2);
});

test("จบรอบ: ฟื้นเต็ม · แต้มสกิล 0 · Matrix ที่ลงไปถูกล้าง (ที่ยังไม่ลงยังอยู่) · +5 เหรียญ", () => {
  const e = startWith(4);
  const p = e.players.p1;
  p.hp = 1; p.armor = 0; p.skillPoints = 5;
  p.scMatrix = 2;                 // ยังไม่ได้ลง — ต้องอยู่ต่อ
  p.scPlaced = { p2: 3 };         // ลงไปแล้ว — ต้องถูกล้าง
  const goldBefore = p.gold;

  Seraph.endCycle(e);

  assert.strictEqual(p.hp, 3, "ฟื้นพลังชีวิตเต็มตามความจุ");
  assert.strictEqual(p.armor, 2, "ฟื้นเกราะเต็มตามความจุ");
  assert.strictEqual(p.skillPoints, 0);
  assert.deepStrictEqual(p.scPlaced, {}, "แต้มที่ลงบนเป้าหมายถูกล้าง");
  assert.strictEqual(p.scMatrix, 2, "แต้มสะสมที่ยังไม่ได้ลงต้องอยู่ต่อ");
  assert.strictEqual(p.gold, goldBefore + 5);
  assert.strictEqual(Seraph.currentDay(), 1, "กลับไปวันที่ 1 ของรอบใหม่");
  assert.strictEqual(Seraph.currentCycle(), 2);
});

test("จบรอบแล้วความจุที่อัปไว้ยังอยู่ (ระดับทักษะ/ความจุ/เงิน/ไอเทมคงอยู่)", () => {
  const e = startWith(2);
  const p = e.players.p1;
  p.scCapHp = 5; p.scCapArmor = 4; p.scCapSkill = 7; p.scSkillLevel = 4;
  p.inventory.push({ uid: "x", name: "ของ" });
  Seraph.endCycle(e);
  assert.strictEqual(p.scCapHp, 5);
  assert.strictEqual(p.scSkillLevel, 4);
  assert.strictEqual(p.hp, 5, "ฟื้นเต็มตามความจุใหม่ ไม่ใช่ 3");
  assert.strictEqual(p.inventory.length, 1);
});

test("รอบเลขคี่ = กลางวัน · รอบเลขคู่ = กลางคืน (1 รอบ = 1 ช่วงเวลา)", () => {
  const e = startWith(2);
  assert.strictEqual(Seraph.isNight(), false, "รอบที่ 1 กลางวัน");
  Seraph.endCycle(e);
  assert.strictEqual(Seraph.isNight(), true, "รอบที่ 2 กลางคืน");
  Seraph.endCycle(e);
  assert.strictEqual(Seraph.isNight(), false, "รอบที่ 3 กลับเป็นกลางวัน");
});

test("stateFor ไม่รั่วข้อมูลสืบสวนของคนอื่น: matrixPlaced เป็นของผู้ชมคนเดียว · watchedBy บอกแค่จำนวน", () => {
  const e = startWith(3);
  e.players.p2.scPlaced = { p1: 3 };  // p2 จับตา p1 ระดับ 3
  e.players.p3.scPlaced = { p1: 3 };  // p3 ก็ด้วย
  e.players.p1.scPlaced = { p2: 1 };

  const asP1 = Seraph.stateFor(e, "p1");
  assert.deepStrictEqual(asP1.matrixPlaced, { p2: 1 }, "เห็นเฉพาะแต้มที่ตัวเองลง");
  assert.strictEqual(asP1.watchedBy, 2, "รู้ว่าถูกจับตา 2 คน");
  assert.ok(!JSON.stringify(asP1).includes('"p2":3'), "ห้ามมีแต้มที่คนอื่นลงหลุดออกมา");

  const asP2 = Seraph.stateFor(e, "p2");
  assert.deepStrictEqual(asP2.matrixPlaced, { p1: 3 });
  assert.strictEqual(asP2.watchedBy, 0);
});

test("เฟสเลือกสถานที่: ครบทุกคนแล้วยิง callback · คนที่ไม่เลือกถูกสุ่มให้", () => {
  const e = startWith(2);
  let fired = 0;
  Seraph.startPlacePhase(e, () => { fired++; });
  assert.strictEqual(Seraph.placePending(e).length, 2);

  Seraph.choosePlace(e, "p1", "room", {});
  assert.strictEqual(fired, 0, "ยังไม่ครบทุกคน");
  Seraph.choosePlace(e, "p2", "room", {});
  assert.strictEqual(fired, 1, "ครบแล้วต้องปิดเฟสทันที");

  // หมดเวลาโดยไม่มีใครเลือก -> สุ่มให้ทุกคน
  Seraph.startPlacePhase(e, () => {});
  Seraph.finishPlacePhase(e);
  assert.strictEqual(Seraph.placePending(e).length, 0);
  assert.ok(Object.values(e.players).every((p) => p.scPlace));
});

test("เลือกสถานที่ซ้ำในวันเดียวกันไม่ได้ · คนตกรอบเลือกไม่ได้", () => {
  const e = startWith(2);
  const p = e.players.p1;
  Seraph.startPlacePhase(e, () => {});
  Seraph.choosePlace(e, "p1", "church", { option: "hp" });
  assert.strictEqual(p.scCapHp, 4);
  Seraph.choosePlace(e, "p1", "church", { option: "hp" }); // ครั้งที่ 2 ต้องไม่มีผล
  assert.strictEqual(p.scCapHp, 4, "เลือกได้วันละครั้งเดียว");

  e.players.p2.scEliminated = true;
  Seraph.startPlacePhase(e, () => {});
  Seraph.choosePlace(e, "p2", "library", {});
  assert.strictEqual(e.players.p2.scSkillLevel, 1, "คนตกรอบเลือกไม่ได้");
});

test("ห้องพัก: ได้ของฟรีเข้ากระเป๋าเสมอ 1 ชิ้น", () => {
  const e = startWith(2);
  const p = e.players.p1;
  Seraph.startPlacePhase(e, () => {});
  Seraph.choosePlace(e, "p1", "room", {});
  assert.strictEqual(p.inventory.length, 1);
  assert.strictEqual(p.inventory[0].free, true, "ของจากห้องพักต้องมีธง free (คนละคลังกับร้านค้า)");
});

test("resetFields ล้างค่าของโหมดครบ (กันค้างข้ามแมตช์)", () => {
  const e = startWith(2);
  const p = e.players.p1;
  p.scMatrix = 3; p.scPlaced = { p2: 2 }; p.scSeen = ["p2"]; p.scEliminated = true;
  Seraph.resetFields(p);
  assert.strictEqual(p.scMatrix, 0);
  assert.deepStrictEqual(p.scPlaced, {});
  assert.deepStrictEqual(p.scSeen, []);
  assert.strictEqual(p.scEliminated, false);
});
