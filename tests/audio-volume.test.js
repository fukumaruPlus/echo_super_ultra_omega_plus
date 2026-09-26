const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function audioHarness(saved = null) {
  const instances = [];
  class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(name, fn) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name).add(fn);
    }
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
    emit(name) { for (const fn of this.listeners.get(name) || []) fn(); }
  }
  class Audio extends Events {
    constructor(src) { super(); this.src = src; this.paused = true; this.currentTime = 0; instances.push(this); }
    play() { this.paused = false; this.emit('playing'); return Promise.resolve(); }
    pause() { this.paused = true; this.emit('pause'); }
    getAttribute(name) { return name === 'src' ? this.src : null; }
  }
  const window = new Events();
  const context = vm.createContext({ Audio, window, localStorage: { getItem: () => saved, setItem() {} } });
  const source = fs.readFileSync(require.resolve('../client/src/audio.js'), 'utf8').replace(/^export /gm, '');
  vm.runInContext(source, context);
  return { api: context, instances, window, Audio };
}
// ระดับที่คาดหวัง (ไม่รวมหลอดเสียง): เพลง 0.5 × ค่าปรับรายไฟล์ · เอฟเฟกต์ 1 × ค่าปรับรายไฟล์
const MUSIC = (api, name) => 0.5 * api.soundGain(name);
const SFX = (api, name) => 1 * api.soundGain(name);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} != ${b}`);

test('music starts at 80%, follows saved volume, and mute persists across track changes', () => {
  const { api, instances } = audioHarness();
  api.playMusic('sc_day');
  near(instances[0].volume, MUSIC(api, 'sc_day') * api.masterGain());
  api.setMasterVolume(0);
  api.playMusic('sc_rest');
  assert.equal(instances.at(-1).volume, 0);
  api.setMasterVolume(1);
  near(instances.at(-1).volume, MUSIC(api, 'sc_rest'));
  const saved = audioHarness('0.35');
  saved.api.playMusic('sc_duel_day');
  near(saved.instances[0].volume, MUSIC(saved.api, 'sc_duel_day') * saved.api.masterGain());
});

test('switching music leaves one track; foreground audio blocks retries until released', async () => {
  const { api, instances, window } = audioHarness();
  api.playMusic('sc_day');
  api.playMusic('sc_rest');
  assert.equal(instances.filter((a) => !a.paused).length, 1);
  const firstRelease = api.suspendMusic();
  const secondRelease = api.suspendMusic();
  api.playMusic('shiki', 1);
  window.emit('pointerdown');
  assert.ok(instances.every((a) => a.paused));
  // Simulate a late browser playback event from an old background track.
  instances[0].paused = false;
  instances[0].emit('playing');
  assert.equal(instances[0].paused, true);
  firstRelease();
  assert.ok(instances.every((a) => a.paused));
  secondRelease();
  await Promise.resolve();
  assert.equal(instances.filter((a) => !a.paused).length, 1);
  assert.ok(instances.find((a) => !a.paused).src.includes('shiki_theme'));
  api.stopMusic();
  window.emit('keydown');
  assert.ok(instances.every((a) => a.paused));
});

test('effects follow live volume and stopped voice cannot resume after a late play promise', async () => {
  const { api } = audioHarness();
  const effect = api.playSfx('attack');
  near(effect.volume, SFX(api, 'attack') * api.masterGain());
  api.setMasterVolume(0);
  assert.equal(effect.volume, 0);
  api.setMasterVolume(1);
  near(effect.volume, SFX(api, 'attack'));
  api.stopSfx(effect);
  await Promise.resolve();
  assert.equal(effect.paused, true);
});

test('blocked cutscene autoplay restores audible playback on a gesture without rewinding', async () => {
  const { api, Audio, instances, window } = audioHarness();
  api.playMusic('sc_duel_day');
  const video = new Audio('cutscene.mp4');
  let attempts = 0;
  video.play = () => {
    if (++attempts === 1) return Promise.reject({ name: 'NotAllowedError' });
    video.paused = false;
    return Promise.resolve();
  };
  const dispose = api.playCutsceneVideo(video);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(video.muted, true);
  assert.equal(instances[0].paused, true);
  video.currentTime = 3;
  window.emit('keydown');
  assert.equal(video.muted, false);
  assert.equal(video.currentTime, 3);
  api.setMasterVolume(0.5);
  assert.equal(video.volume, api.videoVolume('cutscene.mp4'));
  dispose();
  assert.equal(video.paused, true);
  assert.equal(instances[0].paused, false);
  const before = attempts;
  window.emit('pointerdown');
  assert.equal(attempts, before, 'disposed videos must not react to input');
});

test('unmounted videos ignore delayed autoplay rejections and do not mute/restart', async () => {
  const { api, Audio } = audioHarness();
  const video = new Audio('old.mp4');
  let reject;
  let attempts = 0;
  video.play = () => { attempts++; return new Promise((_, fail) => { reject = fail; }); };
  const dispose = api.playCutsceneVideo(video);
  dispose();
  reject({ name: 'NotAllowedError' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(attempts, 1);
  assert.equal(video.muted, false);
  assert.equal(video.paused, true);
});

test('a blocked sound loop restores music volume instead of leaving it ducked', async () => {
  const { api, Audio, instances } = audioHarness();
  api.playMusic('sc_day');
  Audio.prototype.play = () => Promise.reject({ name: 'NotAllowedError' });
  api.startLoopSfx('conner_think');
  near(instances[0].volume, MUSIC(api, 'sc_day') * api.masterGain() * 0.25);
  await Promise.resolve(); await Promise.resolve();
  near(instances[0].volume, MUSIC(api, 'sc_day') * api.masterGain());
  assert.equal(instances[1].paused, true);
});

test('temporary sound loops duck music and restore its full level when closed', () => {
  const { api, instances } = audioHarness();
  api.playMusic('sc_duel_night');
  const music = instances[0];
  api.startLoopSfx('sc_rest');
  near(music.volume, MUSIC(api, 'sc_duel_night') * api.masterGain() * 0.25);
  api.setMasterVolume(0.6);
  near(music.volume, MUSIC(api, 'sc_duel_night') * api.masterGain() * 0.25);
  api.stopLoopSfx();
  near(music.volume, MUSIC(api, 'sc_duel_night') * api.masterGain());
  api.resetMusicPositions();
  api.playMusic('sc_day');
  near(instances.at(-1).volume, MUSIC(api, 'sc_day') * api.masterGain());
});

// ผู้เล่นรายงานว่า "เสียงดังไม่เท่ากัน": เพลงกับเอฟเฟกต์เคยคูณหลอดตรงๆ ส่วนวีดีโอกับลูปคูณหลอดยกกำลังสอง
// สัดส่วนจึงถ่างออกทุกครั้งที่เลื่อนหลอด ทุกแหล่งเสียงต้องอิง masterGain() ตัวเดียวกันเท่านั้น
test('every sound source scales by the same master curve', () => {
  const { api, Audio, instances } = audioHarness();
  const video = new Audio('cutscene.mp4');
  api.playCutsceneVideo(video);
  api.playMusic('sc_day');
  const music = instances.at(-1);
  const effect = api.playSfx('attack');
  api.startLoopSfx('conner_think');
  const loop = instances.at(-1);

  for (const level of [1, 0.75, 0.5, 0.25, 0]) {
    api.setMasterVolume(level);
    const gain = api.masterGain();
    assert.equal(gain, Math.pow(level, 1.6), `หลอด ${level}`);
    near(music.volume, MUSIC(api, 'sc_day') * gain * 0.25, `เพลงที่หลอด ${level}`); // ถูกหรี่อยู่เพราะลูปเสียงยังเล่น
    near(effect.volume, SFX(api, 'attack') * gain, `เอฟเฟกต์ที่หลอด ${level}`);
    near(loop.volume, MUSIC(api, 'conner_think') * gain, `ลูปเสียงที่หลอด ${level}`);
    near(video.volume, gain, `วีดีโอที่หลอด ${level}`);
  }
});

// หลอดเสียงต้องกดโดนจริง — เคยสูงแค่ 4px จนผู้เล่นลากไม่ติด
test('the volume slider has a usable hit area', () => {
  const css = fs.readFileSync(require.resolve('../client/src/avalon-screens.css'), 'utf8');
  const h = /\.av-slider\s*\{[^}]*height:\s*(\d+)px/.exec(css);
  assert.ok(h, 'หา .av-slider ใน avalon-screens.css ไม่เจอ');
  assert.ok(Number(h[1]) >= 20, `หลอดเสียงสูงแค่ ${h && h[1]}px — ลากยาก`);
});

// เสียงคลิกดังแทบทุกการกด — ถ้าสร้าง <audio> ใหม่ทุกครั้งจะต้องถอดรหัสเสียงใหม่ทุกครั้ง (กระตุกสะสม)
test('finished effects are reused instead of allocating a new element each time', () => {
  const { api, instances } = audioHarness();
  const first = api.playSfx('action_button');
  const madeAfterFirst = instances.length;
  first.emit('ended');
  const second = api.playSfx('action_button');
  assert.equal(second, first, 'ต้องหยิบ element เดิมที่เล่นจบแล้วมาใช้ซ้ำ');
  assert.equal(instances.length, madeAfterFirst, 'ต้องไม่สร้าง element ใหม่');
  assert.equal(second.currentTime, 0, 'ต้องกรอกลับไปต้นเสียงก่อนเล่นซ้ำ');

  // เสียงที่ยังเล่นค้างอยู่ห้ามถูกหยิบไปใช้ซ้อนตัวเอง
  const overlap = api.playSfx('action_button');
  assert.notEqual(overlap, second);
});

// ผู้เรียกที่เก็บ element ไว้ (เสียงพากย์คัตซีน) อาจสั่งหยุดตอนที่ element ถูกรีไซเคิลไปใช้กับเสียงอื่นแล้ว
test('a stale handle cannot cut off the sound that recycled its element', () => {
  const { api } = audioHarness();
  const voice = api.playSfx('attack');
  const voiceId = api.sfxPlayId(voice);
  voice.emit('ended');
  const reused = api.playSfx('attack');
  assert.equal(reused, voice);
  api.stopSfx(voice, voiceId);
  assert.equal(reused.paused, false, 'เสียงใหม่ที่ใช้ element เดิมต้องเล่นต่อไป');
  api.stopSfx(reused, api.sfxPlayId(reused));
  assert.equal(reused.paused, true);
});

// โหลดเสียงที่ใช้บ่อยไว้ล่วงหน้า: ครั้งแรกที่เล่นคือครั้งที่กระตุกที่สุด
test('prewarmed effects play from the pool without a fresh allocation', () => {
  const { api, instances } = audioHarness();
  api.prewarmSfx(['action_button']);
  const warmed = instances.length;
  assert.equal(warmed, 1);
  api.playSfx('action_button');
  assert.equal(instances.length, warmed, 'เสียงที่อุ่นไว้แล้วต้องไม่สร้าง element ใหม่ตอนเล่น');
});

// ผู้เล่นรายงานว่า "เอฟเฟกต์สำคัญเบากว่าเพลง" และ "บางไฟล์ดังบางไฟล์เบา"
//  -> เอฟเฟกต์ต้องไม่เบากว่าเพลงประกอบ · ไฟล์ที่ดังเกินต้องถูกลด (รายไฟล์) · ไฟล์เบาไม่ถูกลดเพิ่ม
test('effects sit above background music and loud files are evened out per file', () => {
  const { api, Audio, instances } = audioHarness('1');
  api.playMusic('sc_day');
  const music = instances.at(-1).volume;
  const hit = api.playSfx('attack').volume;
  assert.ok(hit >= music * 1.5, `เอฟเฟกต์ ${hit} ต้องดังกว่าเพลง ${music} ชัดเจน`);
  assert.ok(api.soundGain('kaiVoice3') < 0.6, 'เสียงพากย์ไคดังเกินต้นฉบับ ต้องถูกลด');
  assert.equal(api.soundGain('recruit_reload'), 1, 'ไฟล์ที่เบาอยู่แล้วห้ามลดเพิ่ม');
  assert.equal(api.soundGain('action_button'), 1, 'เสียงคลิกใช้ระดับของตัวเอง');
  const loudVideo = new Audio('/characters/escanor/Last Stand.mp4');
  api.playCutsceneVideo(loudVideo);
  assert.ok(loudVideo.volume < 1, 'วีดีโอที่ดังเกินต้องถูกลด');
});
