// Type Mercury (Raid Boss ORT) — เดินโหมดจริงผ่าน socket กับเซิร์ฟเวอร์ที่ spawn ขึ้นมา
//  ห้องรอ -> หน้าเลือกรูปแบบสนาม (2 หมวด) -> โหวต Type Mercury -> ฉากเปิดตัว ORT -> เล่นจริง -> โหวตยอมแพ้
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io } = require('../client/node_modules/socket.io-client');

const projectRoot = path.resolve(__dirname, '..');
const port = 33000 + (process.pid % 1000);
const url = `http://127.0.0.1:${port}`;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function waitForState(socket, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('state', on); reject(new Error('Timed out waiting for state')); }, timeoutMs);
    function on(s) { if (!predicate(s)) return; clearTimeout(timer); socket.off('state', on); resolve(s); }
    socket.on('state', on);
  });
}
async function waitForHttp() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('Server did not become ready');
}

test('Type Mercury: solo player enters the raid, ORT spawns, turns run, surrender ends the raid', { timeout: 30000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), MERCURY_ARRIVAL_SECONDS: '1' },
    stdio: 'ignore',
  });
  const socket = io(url, { autoConnect: false, forceNew: true, reconnection: false });
  try {
    await waitForHttp();
    const roster = new Promise((r) => socket.once('roster', r));
    socket.connect();
    const list = await roster;

    // ORT อยู่ในรายชื่อให้ดูได้ แต่เป็นบอต เลือกเล่นไม่ได้
    const ort = list.find((c) => c.id === 'ort');
    assert.ok(ort && ort.botOnly, 'ORT is listed as bot-only');

    const lobby = waitForState(socket, (s) => s.gameState === 'LOBBY');
    socket.emit('join', { name: 'Raider', position: 1, characterId: 'ort' });
    const joined = await lobby;
    assert.notEqual(joined.players[0].character?.id ?? joined.players[0].characterId, 'ort', 'join cannot pick ORT');

    // คนเดียวกดพร้อม -> เข้าหน้าเลือกรูปแบบสนามได้
    const modeState = waitForState(socket, (s) => s.gameState === 'TEAM_MODE');
    socket.emit('toggleReady');
    const tm = await modeState;
    const byMode = Object.fromEntries(tm.modeOptions.map((o) => [o.mode, o]));
    assert.equal(byMode.ffa.group, 'normal');
    assert.equal(byMode.mercury.group, 'special');
    assert.equal(byMode.seraph.suspended, true, 'SE.RA.PH shows as suspended');
    assert.equal(byMode.seraph.enabled, false);
    assert.equal(byMode.ffa.enabled, false, 'ffa needs 2 players');
    assert.equal(byMode.mercury.enabled, true, 'raid works solo');

    // โหวตโหมดที่พักใช้งานไม่ได้
    socket.emit('selectGameMode', { mode: 'seraph' });
    await delay(150);

    const arrival = waitForState(socket, (s) => s.gameState === 'CUTSCENE' && s.mercury);
    socket.emit('selectGameMode', { mode: 'mercury' });
    const a = await arrival;
    assert.equal(a.gameMode, 'mercury');
    assert.ok(a.mercury.arrivalSeq >= 1);
    const boss = a.players.find((p) => p.isBoss);
    assert.ok(boss, 'ORT joins the match');
    assert.equal(boss.ort.bars, 5, 'raid ORT starts with 5 bars');
    assert.equal(boss.maxHp, 7);
    assert.equal(boss.maxArmor, 3);

    // ฉากเปิดตัวจบ -> เข้าเทิร์นแรก
    const playing = await waitForState(socket, (s) => s.gameState === 'PLAYING' && s.roundNumber === 1, 6000);
    const me = playing.players.find((p) => p.id === playing.youId);
    assert.ok(me.alive);

    // จั่ว 1 ใบแล้วเปิดไพ่ -> ORT จั่วเอง ไม่ต้องรอบอส -> เข้าสรุปผล
    socket.emit('hit');
    await delay(150);
    const summary = waitForState(socket, (s) => ['SUMMARY', 'CUTSCENE', 'ATTACK', 'ATTACKING', 'TRANSITION'].includes(s.gameState), 6000);
    socket.emit('lock');
    const sm = await summary;
    const bossAfter = sm.players.find((p) => p.isBoss);
    assert.ok(bossAfter.cardCount >= 2, 'ORT drew cards by itself');

    // โหวตยอมแพ้คนเดียว = เสียงข้างมากทันที -> จบ Raid
    const over = waitForState(socket, (s) => s.gameState === 'GAMEOVER', 8000);
    socket.emit('mercurySurrender', { yes: true });
    const end = await over;
    assert.equal(end.mercury.result, 'surrender');
  } finally {
    socket.close();
    server.kill();
  }
});
