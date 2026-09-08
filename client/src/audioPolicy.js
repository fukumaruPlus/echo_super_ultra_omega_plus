// Shared music priorities for the regular board and Moon Cell.
export function musicForState(state, { lowQ = false, scene = null, cycleSeq = 0 } = {}) {
  const phase = state?.gameState;
  if (!phase || ["LOBBY", "TEAM_MODE", "TEAM_SETUP"].includes(phase)) return { name: "main_home" };
  const cs = phase === "CUTSCENE" ? state.cutscene : null;
  const mandatory = cs?.kind === "overloadForce" || cs?.kind?.startsWith("yuuki");
  if (cs && (!lowQ || mandatory || cs.announce)) return { name: null };
  const sc = state?.seraph;
  if (sc) {
    if (scene === "pairing" || scene === "duelIntro") return { name: null };
    if (sc.day === (sc.duelDay || sc.daysTotal)) {
      if (state.skillMusic) return { name: state.skillMusic, seq: state.skillMusicSeq };
      return { name: sc.night ? "sc_duel_night" : "sc_duel_day", seq: sc.cycleRound };
    }
    return { name: phase === "SERAPH_PLACE" ? "sc_rest" : "sc_day" };
  }
  if (state?.skillMusic) return { name: state.skillMusic, seq: state.skillMusicSeq };
  if (["PLAYING", "SUMMARY", "ATTACK", "ATTACKING", "TRANSITION", "CUTSCENE"].includes(phase)) {
    return { name: state.cycle === "night" ? "new_night" : "new_morning", seq: cycleSeq };
  }
  return { name: "main_home" };
}

// Cutscenes can sit between drawing and summary; attack IDs can change without a phase change.
export function createPhaseSoundTracker() {
  let drawing = false;
  let lastSummary = null;
  let lastAttack = null;
  return (state) => {
    const phase = state?.gameState;
    if (!phase || ["LOBBY", "TEAM_MODE", "TEAM_SETUP", "GAMEOVER"].includes(phase)) {
      drawing = false; lastSummary = null; lastAttack = null;
    }
    if (phase === "PLAYING") drawing = true;
    const roundEnded = phase === "SUMMARY" && drawing && lastSummary !== state.roundNumber;
    if (roundEnded) { lastSummary = state.roundNumber; drawing = false; }
    const attack = phase === "ATTACKING" && state.attack && state.attack.id !== lastAttack;
    if (attack) lastAttack = state.attack.id;
    return { roundEnded, attack: !!attack };
  };
}
