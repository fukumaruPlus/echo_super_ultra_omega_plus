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
  }
  const window = new Events();
  const context = vm.createContext({ Audio, window, localStorage: { getItem: () => saved, setItem() {} } });
  const source = fs.readFileSync(require.resolve('../client/src/audio.js'), 'utf8').replace(/^export /gm, '');
  vm.runInContext(source, context);
  return { api: context, instances, window, Audio };
}

test('music starts at 80%, follows saved volume, and mute persists across track changes', () => {
  const { api, instances } = audioHarness();
  api.playMusic('sc_day');
  assert.equal(instances[0].volume, 0.8);
  api.setMasterVolume(0);
  api.playMusic('sc_rest');
  assert.equal(instances.at(-1).volume, 0);
  api.setMasterVolume(1);
  assert.equal(instances.at(-1).volume, 1);
  const saved = audioHarness('0.35');
  saved.api.playMusic('sc_duel_day');
  assert.equal(saved.instances[0].volume, 0.35);
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
  assert.equal(effect.volume, 0.85 * 0.8);
  api.setMasterVolume(0);
  assert.equal(effect.volume, 0);
  api.setMasterVolume(1);
  assert.equal(effect.volume, 0.85);
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
  assert.equal(video.volume, api.videoVolume());
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
  assert.equal(instances[0].volume, 0.2);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(instances[0].volume, 0.8);
  assert.equal(instances[1].paused, true);
});

test('temporary sound loops duck music and restore its full level when closed', () => {
  const { api, instances } = audioHarness();
  api.playMusic('sc_duel_night');
  const music = instances[0];
  api.startLoopSfx('sc_rest');
  assert.equal(music.volume, 0.2);
  api.setMasterVolume(0.6);
  assert.equal(music.volume, 0.15);
  api.stopLoopSfx();
  assert.equal(music.volume, 0.6);
  api.resetMusicPositions();
  api.playMusic('sc_day');
  assert.equal(instances.at(-1).volume, 0.6);
});
