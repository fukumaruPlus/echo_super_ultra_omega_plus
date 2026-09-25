// สไตรเกอร์ ยูเรก้า: ระบบคู่หูผ่าน socket จริง — เข้าร่วม 2 คนเป็นตัวละครเดียว / บทบาท / พร้อม / รีคอนเนกต์ / host ออก
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io } = require('../client/node_modules/socket.io-client');

const projectRoot = path.resolve(__dirname, '..');
const port = 33000 + (process.pid % 1000);
const url = `http://127.0.0.1:${port}`;

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timed out waiting for ${event}`)); }, timeoutMs);
    function listener(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    }
    socket.on(event, listener);
  });
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForHttp() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await delay(100);
  }
  throw new Error('Server did not become ready');
}
async function connectClient() {
  const socket = io(url, { autoConnect: false, forceNew: true, reconnection: false });
  const connected = waitForEvent(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

test('ตัวละครคู่: 2 คนเข้าเป็นระเบียนเดียว แบ่งบทบาท พร้อมทั้งคู่ถึงนับ และคู่หูรีคอนเนกต์ได้', { timeout: 20000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), RECONNECT_GRACE_MS: '3000' },
    stdio: 'ignore',
  });
  const sockets = [];
  try {
    await waitForHttp();
    const host = await connectClient();
    const co = await connectClient();
    sockets.push(host, co);

    // คนแรกเลือกเป็นพลปืน
    const hostRole = waitForEvent(host, 'pairRole');
    const hostJoined = waitForEvent(host, 'joined');
    const slots = waitForEvent(co, 'pairSlots', (list) => list.length === 1);
    host.emit('join', { name: 'Host', position: 1, characterId: 'striker', pairRole: 'gunner' });
    await hostJoined;
    assert.equal((await hostRole).role, 'gunner');
    const [slot] = await slots;
    assert.deepEqual(slot, { characterId: 'striker', hostName: 'Host', role: 'pilot' }, 'คนที่สองเห็นช่องนักบินว่าง');

    // คนที่สองเข้าร่วมเป็นคู่หู -> ได้บทบาทที่เหลือ และเห็น state ของระเบียนเดียวกัน
    const coRole = waitForEvent(co, 'pairRole');
    const coJoined = waitForEvent(co, 'joined');
    const coState = waitForEvent(co, 'state', (s) => s.players.length === 1 && s.players[0].pair && s.players[0].pair.pilot);
    co.emit('joinCopilot', { name: 'Co', characterId: 'striker' });
    const { sessionToken: coToken } = await coJoined;
    assert.equal((await coRole).role, 'pilot');
    let st = await coState;
    assert.equal(st.players.length, 1, 'ในเกมมีระเบียนเดียว');
    assert.equal(st.youId, st.players[0].id, 'คู่หูเห็นตัวละครเป็นของตัวเอง');
    assert.equal(st.players[0].name, 'Host & Co');
    assert.deepEqual(st.players[0].pair.pilot, { name: 'Co', connected: true, ready: false });

    // พร้อมทีละคน — ต้องพร้อมทั้งคู่ถึงนับว่าระเบียนพร้อม
    const hostReady = waitForEvent(host, 'state', (s) => s.players[0].pair.gunner.ready);
    host.emit('toggleReady');
    st = await hostReady;
    assert.equal(st.players[0].ready, false, 'คู่หูยังไม่พร้อม');

    // คู่หูหลุดแล้วกลับมาด้วย session เดิม
    co.disconnect();
    await delay(200);
    const co2 = await connectClient();
    sockets.push(co2);
    const reRole = waitForEvent(co2, 'pairRole');
    const reconnected = waitForEvent(co2, 'reconnected');
    co2.emit('reconnectSession', { sessionToken: coToken });
    await reconnected;
    assert.equal((await reRole).role, 'pilot');

    // host ออก -> คู่หูถูกส่งกลับไปหน้าเลือกตัวละคร
    const expired = waitForEvent(co2, 'sessionExpired');
    host.emit('leave');
    await expired;
  } finally {
    for (const s of sockets) s.disconnect();
    server.kill();
  }
});
