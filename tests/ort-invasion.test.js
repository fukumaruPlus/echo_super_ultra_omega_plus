// ORT บุกเทิร์น 60 ของโหมดปกติ — ระบบกำจัดผู้เล่น ไม่ใช่ผู้ชิงชัย
process.env.MERCURY_ARRIVAL_SECONDS = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../server.js');

const ORT_ID = '__ort__';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitState(pred, ms = 4000) {
  for (let i = 0; i < ms / 50; i++) { if (pred()) return true; await delay(50); }
  return false;
}
function setup(chars = ['hikaru', 'kai', 'dan']) {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  chars.forEach((ch, i) => {
    engine.players['p' + i] = {
      id: 'p' + i, name: 'P' + i, position: i + 1, characterId: ch, alive: true, connected: true,
      cards: [], statuses: {}, statusAmt: {}, seen: {}, inventory: [], teamId: null,
    };
  });
  engine.setGameMode('ffa');
  engine.startMatch();
  engine.clearPhaseTimer();
}

test.after(() => { engine.clearPhaseTimer(); for (const id of Object.keys(engine.players)) delete engine.players[id]; });

test('ORT invades before turn 60 in normal modes, then the last human standing wins', async () => {
  setup();
  // จบเทิร์น 59 -> ORT บุกเข้าสนาม + พักเกมรอฉากเปิดตัว
  engine.setRoundNumber(59);
  engine.setGameState('SUMMARY');
  engine.endTurn();
  assert.ok(await waitState(() => engine.players[ORT_ID]), 'ORT joined the match');
  const ort = engine.players[ORT_ID];
  assert.equal(ort.ortBars, 3, 'normal-mode ORT has 3 bars');
  assert.equal(engine.buildStateFor('p0').ortArrival.active, true, 'arrival hold is announced to clients');
  assert.ok(await waitState(() => engine.gameState === 'PLAYING' && engine.roundNumber === 60), 'turn 60 starts after the arrival');
  assert.equal(engine.buildStateFor('p0').ortArrival.active, false);

  // ORT ยังมีชีวิต + ผู้เล่นจริงเหลือ 1 คนกลางเฟสจั่ว -> จบทันที คนสุดท้ายชนะ (ORT ไม่นับ)
  engine.instantDeath(engine.players.p1);
  engine.instantDeath(engine.players.p2);
  engine.hit('p0');
  assert.equal(engine.gameState, 'GAMEOVER', 'game ends right away in the draw phase');
  assert.ok(engine.players[ORT_ID].alive, 'ORT is still alive — it never needs to die for the game to end');
  const log = engine.buildStateFor('p0').log.join('\n');
  assert.match(log, /P0 คือผู้ชนะคนสุดท้าย/);
});

test('ORT never wins: everyone dead is a draw', async () => {
  setup(['hikaru', 'kai']);
  engine.setRoundNumber(59);
  engine.setGameState('SUMMARY');
  engine.endTurn();
  assert.ok(await waitState(() => engine.gameState === 'PLAYING' && engine.roundNumber === 60));
  engine.instantDeath(engine.players.p0);
  engine.instantDeath(engine.players.p1);
  engine.setGameState('SUMMARY');
  engine.endTurn();
  assert.ok(await waitState(() => engine.gameState === 'GAMEOVER'));
  assert.match(engine.buildStateFor('p0').log.join('\n'), /ไม่มีผู้รอด — เสมอ/);
});

test('raid and SE.RA.PH never get a turn-60 invasion', async () => {
  setup(['hikaru', 'kai']);
  engine.setGameMode('duo'); // โหมดทีมยังโดนบุกตามปกติ — ตรวจแค่ว่าไม่พัง
  engine.setGameMode('mercury');
  engine.setRoundNumber(59);
  engine.setGameState('SUMMARY');
  const before = engine.players[ORT_ID];
  engine.endTurn();
  await delay(300);
  assert.equal(engine.players[ORT_ID], before, 'raid keeps its own ORT (no second invasion)');
  engine.clearPhaseTimer();
});
