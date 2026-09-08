const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function audioHarness(saved = null) {
  const instances = [];
  class Audio {
    constructor(src) { this.src = src; this.paused = true; this.currentTime = 0; instances.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    addEventListener() {}
  }
  const context = vm.createContext({ Audio, localStorage: { getItem: () => saved, setItem() {} } });
  const source = fs.readFileSync(require.resolve('../client/src/audio.js'), 'utf8').replace(/^export /gm, '');
  vm.runInContext(source, context);
  return { api: context, instances };
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
