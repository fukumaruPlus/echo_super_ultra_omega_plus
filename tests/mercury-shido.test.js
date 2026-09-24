// ชิโด "ฝากด้วยนะตัวฉัน" ในโหมด Type Mercury — ตายขณะกับดักเปิด = ย้อนเวลา 5 เทิร์น ต้องใช้ได้ปกติใน Raid
process.env.MERCURY_ARRIVAL_SECONDS = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../server.js');

const ORT_ID = '__ort__';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms = 8000) {
  for (let i = 0; i < ms / 50; i++) { if (pred()) return true; await delay(50); }
  return false;
}
async function nextTurn() {
  const r = engine.roundNumber;
  engine.clearPhaseTimer();
  engine.setGameState('SUMMARY');
  engine.endTurn();
  assert.ok(await waitFor(() => engine.gameState === 'PLAYING' && engine.roundNumber !== r), `turn after ${r} starts`);
}

test.after(() => { engine.clearPhaseTimer(); for (const id of Object.keys(engine.players)) delete engine.players[id]; });

test('Shido rewind works in the raid: time goes back, Shido returns, nothing stays locked, raid continues', { timeout: 60000 }, async () => {
  for (const id of Object.keys(engine.players)) delete engine.players[id];
  [['s', 'shido'], ['h', 'hikaru']].forEach(([id, ch], i) => {
    engine.players[id] = { id, name: id.toUpperCase(), position: i + 1, characterId: ch, alive: true, connected: true,
      cards: [], statuses: {}, statusAmt: {}, seen: {}, inventory: [], teamId: null };
  });
  engine.setGameMode('mercury');
  engine.startMatch();
  assert.ok(await waitFor(() => engine.gameState === 'PLAYING' && engine.roundNumber === 1));
  for (let i = 0; i < 6; i++) await nextTurn(); // สะสมประวัติย้อนหลังให้ครบ
  const roundBefore = engine.roundNumber;

  const shido = engine.players.s;
  shido.skillPoints = 8; shido.locked = false; shido.skillUsedRound = false;
  engine.useSkill('s', 'ultimate', []);
  assert.equal(shido.skillPoints, 0, 'trap armed (8 points spent)');
  assert.equal(shido.ortPendingLost || null, null, 'the silent trap is not recorded by ORT (no public log leak)');

  // ORT ตีจนชิโดตาย
  engine.withEffectSource(engine.players[ORT_ID], () => { engine.dealDirect(shido, 99); engine.resolveDamageAftermath(shido); });
  assert.equal(shido.alive, false);
  assert.ok(engine.buildStateFor('h').mercury.lost.includes('shido'), 'Shido is locked right after dying');

  engine.clearPhaseTimer();
  engine.setGameState('SUMMARY');
  engine.endTurn();
  const seen = [];
  const ok = await waitFor(() => { const k = engine.gameState + ':' + engine.roundNumber + ':' + (engine.cutsceneInfo ? (engine.cutsceneInfo.kind || engine.cutsceneInfo.title) : '-'); if (seen[seen.length - 1] !== k) seen.push(k); return engine.gameState === 'PLAYING'; }, 40000);
  // วีดีโอย้อนเวลาของชิโดยาว — รอจนเทิร์นถัดไปเริ่มจริง (ลำดับเฟสโชว์เฉพาะตอนล้ม)
  assert.ok(ok, 'next turn starts after the rewind: ' + seen.join(' > '));
  const s2 = engine.players.s;
  assert.ok(s2.alive, 'Shido is back');
  assert.equal(s2.characterId, 'shido');
  assert.ok(engine.roundNumber < roundBefore, `time went back (${roundBefore} -> ${engine.roundNumber})`);
  assert.equal(engine.buildStateFor('h').mercury.lost.includes('shido'), false, 'Shido is no longer "data lost"');
  assert.notEqual(engine.gameState, 'GAMEOVER', 'the raid keeps going');
  assert.ok(engine.players[ORT_ID] && engine.players[ORT_ID].alive, 'ORT is still there');
});
