const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../client/src/audioPolicy.js'), 'utf8').replace(/^export /gm, ''), policy);
const moon = { gameState: 'PLAYING', seraph: { day: 7, daysTotal: 7, cycleRound: 2, night: true } };

test('Moon Cell music follows cutscene -> skill -> duel priority, with silent pairing/intro', () => {
  const skill = { ...moon, skillMusic: 'hakuno', skillMusicSeq: 5 };
  assert.equal(policy.musicForState(moon).name, 'sc_duel_night');
  assert.equal(policy.musicForState(skill).name, 'hakuno');
  assert.equal(policy.musicForState(skill).seq, 5);
  const cutscene = { ...skill, gameState: 'CUTSCENE', cutscene: { id: 1, video: 'skill.mp4' } };
  assert.equal(policy.musicForState(cutscene).name, null);
  assert.equal(policy.musicForState(cutscene, { lowQ: true }).name, 'hakuno');
  for (const scene of ['pairing', 'duelIntro']) assert.equal(policy.musicForState(skill, { scene }).name, null);
});

test('voice announcements and mandatory clips stay silent in low quality; private clips do not silence outsiders', () => {
  for (const cs of [{ announce: true, voice: 'ex_k' }, { kind: 'overloadForce' }, { kind: 'yuukiIntro' }]) {
    assert.equal(policy.musicForState({ ...moon, gameState: 'CUTSCENE', cutscene: cs }, { lowQ: true }).name, null);
  }
  assert.equal(policy.musicForState({ ...moon, gameState: 'CUTSCENE', cutscene: null }).name, 'sc_duel_night');
});

test('investigation and rest music ignore combat skills; regular game retains normal music', () => {
  const day = { ...moon, skillMusic: 'shiki', seraph: { ...moon.seraph, day: 6 } };
  assert.equal(policy.musicForState(day).name, 'sc_day');
  assert.equal(policy.musicForState({ ...day, gameState: 'SERAPH_PLACE' }).name, 'sc_rest');
  assert.equal(policy.musicForState({ gameState: 'PLAYING', cycle: 'day' }).name, 'new_morning');
  assert.equal(policy.musicForState(null).name, 'main_home');
  assert.equal(policy.musicForState({ ...moon, gameState: 'LOBBY', skillMusic: 'shiki' }).name, 'main_home');
});

test('round sound survives intermediate cutscenes and broadcasts; attack sound follows every attack ID', () => {
  const track = policy.createPhaseSoundTracker();
  const state = { roundNumber: 1 };
  track({ ...state, gameState: 'PLAYING' });
  assert.equal(track({ ...state, gameState: 'CUTSCENE' }).roundEnded, false);
  assert.equal(track({ ...state, gameState: 'SUMMARY' }).roundEnded, true);
  assert.equal(track({ ...state, gameState: 'SUMMARY' }).roundEnded, false);
  assert.equal(track({ ...state, gameState: 'ATTACKING', attack: { id: 1 } }).attack, true);
  assert.equal(track({ ...state, gameState: 'ATTACKING', attack: { id: 1 } }).attack, false);
  assert.equal(track({ ...state, gameState: 'ATTACKING', attack: { id: 2 } }).attack, true);
  track({ gameState: 'LOBBY' });
  track({ ...state, gameState: 'PLAYING' });
  assert.equal(track({ ...state, gameState: 'SUMMARY' }).roundEnded, true);
});
