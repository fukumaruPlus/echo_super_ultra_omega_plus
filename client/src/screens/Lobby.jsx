import { useState } from "react";
import { socket } from "../socket";
import { clickSound } from "../audio";
import { POSITIONS } from "../data/positions";

const P_DISPLAY = "var(--font-p-display)";

// ตำแหน่งที่นั่งรอบโต๊ะ (วงรี 7 ที่นั่ง) — คีย์ตรงกับ POSITIONS 1-7
//  กระจายทุก ~51.4 องศารอบวงรี เริ่มที่หัวโต๊ะ (P1 บนสุด) แล้วไล่ตามเข็มนาฬิกา
//  ระยะห่างเท่ากันทุกคู่ ไม่มีที่นั่งไหนซ้อนกันแม้ที่นั่งกว้างสุด (w-32)
const SEAT_LAYOUT = {
  1: { left: "50%", top: "3%" },
  2: { left: "85%", top: "20%" },
  3: { left: "96%", top: "60%" },
  4: { left: "69%", top: "95%" },
  5: { left: "31%", top: "95%" },
  6: { left: "4%",  top: "60%" },
  7: { left: "15%", top: "20%" },
};

// หน้าที่ 5: ห้องรอ — โต๊ะกลม ขนาดใหญ่ อยู่ในจอเดียว ไม่มีสกอลล์
// ปุ่มควบคุมทั้งหมดย้ายออกจากใต้โต๊ะ: โหมดประหยัด (ซ้ายบน) / ย้อนกลับ (ซ้ายล่างลอย) / พร้อม+ทดสอบ (กลางวงในโต๊ะ)

function LobbyParticles() {
  return [15, 35, 55, 75, 90].map((l, i) => (
    <span
      key={l}
      className="p-particle"
      style={{ left: `${l}%`, animationDuration: `${10 + (i % 3) * 3}s`, animationDelay: `${i * 1.6}s` }}
    />
  ));
}

const TEAM_COLORS = { A: "#22d3ee", B: "#f97316", C: "#a3e635" };
const MODE_TITLES = { ffa: "FFA", overload: "Over Load", duo: "Duo", trio: "Trio" };
const MODE_SUBTITLES = { ffa: "ทุกคนสู้กันเอง", overload: "ร่วมมือกันโค่นยูกิ", duo: "ทีมละ 2 คน", trio: "ทีมละ 3 คน" };

function modeTitle(mode) {
  return MODE_TITLES[mode] || mode;
}

function teamColor(id) {
  return TEAM_COLORS[id] || "var(--color-p-accent-bright)";
}

function TeamShell({ children, onBack }) {
  return (
    <div className="p-bg relative h-screen w-screen overflow-hidden flex items-center justify-center p-2 sm:p-4">
      <LobbyParticles />
      {children}
      <button
        onClick={() => { clickSound(); onBack && onBack(); }}
        className="p-float-back fixed z-30 bottom-3 left-3 sm:bottom-5 sm:left-5 px-4 sm:px-5 py-2 text-sm sm:text-base font-bold transition rounded-full text-white/90"
      >
        ย้อนกลับ
      </button>
    </div>
  );
}

function TeamModeView({ state, onBack }) {
  const count = state.players.length;
  const me = state.players.find((p) => p.id === state.youId);
  const options = state.modeVotes?.length ? state.modeVotes : (state.modeOptions?.length ? state.modeOptions : [
    { mode: "ffa", label: "Free For All", enabled: count >= 2, voters: [], voteCount: 0 },
    { mode: "overload", label: "Over Load", enabled: count >= 2, voters: [], voteCount: 0 },
    { mode: "duo", label: "Duo", enabled: count >= 4 && count % 2 === 0, voters: [], voteCount: 0 },
    { mode: "trio", label: "Trio", enabled: count === 6, voters: [], voteCount: 0 },
  ]);
  const votedCount = state.players.filter((p) => p.modeVote).length;
  const voteById = Object.fromEntries(state.players.map((p) => [p.id, p.modeVote]));
  const hint = (mode) => mode === "duo" ? "ต้องมี 4 หรือ 6 คน" : mode === "trio" ? "ต้องมี 6 คน" : "ใช้ได้ตั้งแต่ 2 คน";

  return (
    <TeamShell onBack={onBack}>
      <div className="relative z-10 w-full max-w-6xl h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)] mx-auto grid grid-rows-[auto_1fr_auto] gap-2 sm:gap-4 min-h-0">
        <div className="text-center min-h-0">
          <span className="p-logo-wrap mx-auto">
            <span className="p-logo-glow" />
            <img src="/image/logo_current.webp" alt="ECHO" className="p-logo-img h-10 sm:h-14 w-auto" />
          </span>
          <div className="mt-1 text-white/70 font-bold text-xs sm:text-sm" style={{ fontFamily: P_DISPLAY }}>{votedCount}/{count} โหวตแล้ว · คะแนนมากสุดชนะ</div>
          <h1 className="text-2xl sm:text-4xl font-black text-white text-hard leading-tight" style={{ fontFamily: P_DISPLAY }}>โหวตโหมดการเล่น</h1>
        </div>

        <div className="min-h-0 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          {options.map((opt) => {
            const selected = me?.modeVote === opt.mode;
            const voters = state.players.filter((p) => (opt.voters || []).includes(p.id));
            return (
              <button
                key={opt.mode}
                disabled={!opt.enabled}
                onClick={() => { clickSound(); socket.emit("selectGameMode", { mode: opt.mode }); }}
                className={`p-panel relative min-w-0 h-full rounded-lg border-2 px-2 sm:px-4 py-3 sm:py-5 text-left transition active:scale-[.98] overflow-hidden ${opt.enabled ? "hover:p-ring" : "opacity-40 cursor-not-allowed"}`}
                style={{ borderColor: selected ? me.color : "rgba(255,255,255,.16)", boxShadow: selected ? `0 0 0 2px ${me.color}55` : undefined }}
              >
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: selected ? me.color : "rgba(255,255,255,.16)" }} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xl sm:text-3xl font-black text-white truncate" style={{ fontFamily: P_DISPLAY }}>{modeTitle(opt.mode)}</div>
                    <div className="mt-0.5 text-[11px] sm:text-sm text-white/62 truncate">{MODE_SUBTITLES[opt.mode]}</div>
                  </div>
                  <div className="shrink-0 rounded-full bg-black/35 border border-white/15 px-2 py-0.5 text-xs sm:text-sm font-black text-white">{opt.voteCount || 0}</div>
                </div>
                <div className="mt-4 sm:mt-6 grid gap-1.5">
                  {voters.length ? voters.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 min-w-0 rounded-md bg-black/28 px-1.5 sm:px-2 py-1 border border-white/8">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                      <span className="truncate text-[10px] sm:text-xs font-black" style={{ color: p.color }}>P{p.position}</span>
                    </div>
                  )) : <div className="text-[10px] sm:text-xs text-white/35 font-bold">ยังไม่มีโหวต</div>}
                </div>
                <div className="absolute inset-x-2 sm:inset-x-4 bottom-2 sm:bottom-4 text-[10px] sm:text-xs font-bold text-white/45 truncate">{opt.enabled ? (selected ? "คุณโหวตแล้ว" : "แตะเพื่อโหวต") : hint(opt.mode)}</div>
              </button>
            );
          })}
        </div>

        <div className="p-panel rounded-lg px-2 sm:px-3 py-2 flex flex-wrap justify-center gap-1.5 text-[10px] sm:text-xs text-white/75 max-h-[5.3rem] overflow-hidden">
          {state.players.map((p) => (
            <span key={p.id} className="min-w-0 max-w-[10rem] px-2 py-1 rounded-full bg-black/28 border flex items-center gap-1.5" style={{ borderColor: `${p.color}88` }}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="font-black truncate" style={{ color: p.color }}>P{p.position} {p.name}</span>
              <span className="text-white/45 shrink-0">{voteById[p.id] ? modeTitle(voteById[p.id]) : "รอ"}</span>
            </span>
          ))}
        </div>
      </div>
    </TeamShell>
  );
}

function TeamSetupView({ state, onBack }) {
  const me = state.players.find((p) => p.id === state.youId);
  const teams = state.teamOptions || [];
  const teamSize = state.teamSize || 2;
  const readyCount = state.players.filter((p) => p.teamConfirmed).length;

  return (
    <TeamShell onBack={onBack}>
      <div className="relative z-10 w-full max-w-6xl h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)] mx-auto grid grid-rows-[auto_1fr_auto] gap-2 sm:gap-3 min-h-0">
        <div className="flex items-center justify-between gap-2 min-h-0">
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-white/55" style={{ fontFamily: P_DISPLAY }}>{state.gameMode === "trio" ? "Trio" : "Duo"} · ทีมละ {teamSize}</div>
            <h1 className="text-2xl sm:text-4xl font-black text-white text-hard leading-tight truncate" style={{ fontFamily: P_DISPLAY }}>จัดทีม</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button onClick={() => { clickSound(); socket.emit("teamBackToMode"); }} className="p-float-back px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-bold">เปลี่ยนโหมด</button>
            <button
              disabled={!me?.teamId}
              onClick={() => { clickSound(); socket.emit("confirmTeam", { confirmed: !me?.teamConfirmed }); }}
              className={`px-3 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-black transition active:scale-95 ${me?.teamId ? "text-white" : "text-white/35 cursor-not-allowed"}`}
              style={me?.teamId ? { background: me.teamConfirmed ? "rgba(255,255,255,.14)" : `linear-gradient(120deg,${me.color},var(--color-p-accent-deep))` } : { background: "rgba(255,255,255,.08)" }}
            >
              {me?.teamConfirmed ? "ยกเลิก" : "ยืนยัน"}
            </button>
          </div>
        </div>

        <div className="min-h-0 grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, teams.length)}, minmax(0, 1fr))` }}>
          {teams.map((team) => {
            const members = state.players.filter((p) => p.teamId === team.id).sort((a, b) => a.position - b.position);
            const canJoin = !!me && !me.teamConfirmed && (members.length < teamSize || me.teamId === team.id);
            const accent = teamColor(team.id);
            return (
              <div key={team.id} className="p-panel min-w-0 h-full rounded-lg border-2 overflow-hidden flex flex-col" style={{ borderColor: `${accent}88`, boxShadow: `inset 0 1px 0 ${accent}30` }}>
                <div className="px-2.5 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 border-b border-white/10" style={{ background: `linear-gradient(90deg,${accent}22,transparent)` }}>
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: accent, boxShadow: `0 0 14px ${accent}` }} />
                    <div className="text-lg sm:text-2xl font-black text-white truncate" style={{ fontFamily: P_DISPLAY }}>Team {team.id}</div>
                  </div>
                  <div className="text-xs sm:text-sm font-black text-white/70 shrink-0">{members.length}/{teamSize}</div>
                </div>

                <div className="flex-1 min-h-0 p-2 sm:p-3 grid gap-1.5 content-start">
                  {Array.from({ length: teamSize }).map((_, i) => {
                    const p = members[i];
                    return p ? (
                      <div key={p.id} className="min-w-0 rounded-lg bg-black/25 border px-2 sm:px-3 py-2 flex items-center justify-between gap-2" style={{ borderColor: `${p.color}99` }}>
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="w-7 h-7 sm:w-9 sm:h-9 rounded-full shrink-0 grid place-items-center text-[10px] sm:text-xs font-black text-black" style={{ background: p.color, fontFamily: P_DISPLAY }}>P{p.position}</span>
                          <div className="min-w-0">
                            <div className="font-black text-xs sm:text-sm truncate" style={{ color: p.color }}>{p.name}{p.id === state.youId ? " (คุณ)" : ""}</div>
                            <div className="text-[10px] sm:text-xs text-white/40 truncate">ตัวละครถูกซ่อนไว้</div>
                          </div>
                        </div>
                        <div className={`text-[10px] sm:text-xs font-black whitespace-nowrap ${p.teamConfirmed ? "text-emerald-300" : "text-white/45"}`}>{p.teamConfirmed ? "พร้อม" : "รอ"}</div>
                      </div>
                    ) : (
                      <div key={i} className="rounded-lg border border-dashed border-white/14 px-2 sm:px-3 py-2 text-[10px] sm:text-xs text-white/32 min-h-[44px] sm:min-h-[54px] grid place-items-center">ว่าง</div>
                    );
                  })}
                </div>

                <button
                  disabled={!canJoin}
                  onClick={() => { clickSound(); socket.emit("chooseTeam", { teamId: team.id }); }}
                  className={`w-full px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-black transition ${canJoin ? "text-white" : "text-white/35 cursor-not-allowed"}`}
                  style={{ background: canJoin ? `linear-gradient(90deg,${accent}33,rgba(255,255,255,.08))` : "rgba(255,255,255,.05)" }}
                >
                  {me?.teamId === team.id ? "อยู่ทีมนี้" : "เข้าทีมนี้"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="text-center text-xs sm:text-sm text-white/55 font-bold truncate">ยืนยันแล้ว {readyCount}/{state.players.length} คน · เริ่มเมื่อทุกทีมเต็มและทุกคนยืนยัน</div>
      </div>
    </TeamShell>
  );
}
export default function Lobby({ state, onBack, lowQ, onToggleLowQ, skillConfirmOn = true, onToggleSkillConfirm }) {
  const [showInfo, setShowInfo] = useState(false);
  const [showSkillInfo, setShowSkillInfo] = useState(false);
  const count = state.players.length;
  const me = state.players.find((p) => p.id === state.youId);
  const allReady = count >= 2 && state.players.every((p) => p.ready);
  const byPos = Object.fromEntries(state.players.map((p) => [p.position, p]));

  if (state.gameState === "TEAM_MODE") return <TeamModeView state={state} onBack={onBack} />;
  if (state.gameState === "TEAM_SETUP") return <TeamSetupView state={state} onBack={onBack} />;

  return (
    <div className="p-bg relative h-screen w-screen overflow-hidden flex items-center justify-center p-4">
      {[15, 35, 55, 75, 90].map((l, i) => (
        <span
          key={l}
          className="p-particle"
          style={{ left: `${l}%`, animationDuration: `${10 + (i % 3) * 3}s`, animationDelay: `${i * 1.6}s` }}
        />
      ))}

      {/* ---------- โหมดประหยัด: มุมซ้ายบน แบบย่อ + ไอคอน i อธิบายตอนชี้เมาส์ ---------- */}
      <div className="fixed z-30 top-4 left-4 flex items-center gap-2">
        <button
          onClick={() => { clickSound(); onToggleLowQ && onToggleLowQ(); }}
          className="p-float-back flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full text-xs sm:text-sm font-bold transition"
          style={lowQ ? { borderColor: "var(--color-p-accent-bright)", background: "rgba(155,79,150,.28)" } : undefined}
        >
          🎬 <span>{lowQ ? "ประหยัด: เปิด" : "ประหยัด: ปิด"}</span>
        </button>
        <div className="group relative">
          <button
            onClick={() => setShowInfo((v) => !v)}
            className="w-6 h-6 grid place-items-center rounded-full border border-white/30 bg-black/40 text-[11px] font-black cursor-help hover:border-white/60"
            aria-label="อธิบายโหมดประหยัด"
          >
            i
          </button>
          <div
            className={`absolute left-0 top-full mt-2 w-60 bg-black/95 border border-white/15 rounded-lg p-3 text-xs leading-snug shadow-2xl transition-opacity z-30 ${
              showInfo ? "opacity-100" : "opacity-0 pointer-events-none"
            } sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto`}
          >
            ข้ามวีดีโอท่าไม้ตาย/ฉากคัตซีน — จะเห็นแค่การแจ้งเตือนว่าใครเปิดท่าไม้ตายแทน
            (แต่ยังต้องรอผู้เล่นคนอื่นดูวีดีโอให้จบอยู่ดี)
          </div>
        </div>
      </div>

      {/* ---------- ยืนยันก่อนใช้สกิล: เปิดไว้เป็นค่าเริ่มต้น ปิดได้ถ้าอยากกดสกิลไว (มีผลเฉพาะเครื่องเรา) ---------- */}
      <div className="fixed z-30 top-16 left-4 flex items-center gap-2">
        <button
          onClick={() => { clickSound(); onToggleSkillConfirm && onToggleSkillConfirm(); }}
          className="p-float-back flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full text-xs sm:text-sm font-bold transition"
          style={!skillConfirmOn ? { borderColor: "var(--color-p-accent-bright)", background: "rgba(155,79,150,.28)" } : undefined}
        >
          ⚡ <span>{skillConfirmOn ? "ยืนยันสกิล: เปิด" : "ยืนยันสกิล: ปิด"}</span>
        </button>
        <div className="group relative">
          <button
            onClick={() => setShowSkillInfo((v) => !v)}
            className="w-6 h-6 grid place-items-center rounded-full border border-white/30 bg-black/40 text-[11px] font-black cursor-help hover:border-white/60"
            aria-label="อธิบายการยืนยันก่อนใช้สกิล"
          >
            i
          </button>
          <div
            className={`absolute left-0 top-full mt-2 w-60 bg-black/95 border border-white/15 rounded-lg p-3 text-xs leading-snug shadow-2xl transition-opacity z-30 ${
              showSkillInfo ? "opacity-100" : "opacity-0 pointer-events-none"
            } sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto`}
          >
            ปิดแล้ว = กดช่องสกิลปุ๊บใช้ทันที ไม่มีป๊อปอัปถามยืนยัน (เร็วขึ้นแต่กดพลาดแล้วย้อนไม่ได้)
            มีผลเฉพาะกับตัวเราเท่านั้น ผู้เล่นคนอื่นไม่เปลี่ยน
          </div>
        </div>
      </div>

      {/* ---------- โต๊ะกลม: ขยายใหญ่ ยึดตามพื้นที่จอที่เหลือ ไม่ทำให้เกิดสกอลล์ ---------- */}
      <div
        className="relative z-10 aspect-square shrink-0"
        style={{ width: "min(88vw, 82vh, 860px)" }}
      >
        {/* วงแหวนโต๊ะ */}
        <div
          className="absolute inset-[13%] rounded-full border-2 transition-colors"
          style={{
            borderColor: allReady ? "var(--color-p-accent-bright)" : "rgba(255,255,255,.12)",
            background: "radial-gradient(circle, rgba(155,79,150,0.14), transparent 70%)",
            boxShadow: allReady ? "0 0 60px 6px rgba(155,79,150,.35)" : undefined,
          }}
        />

        {/* ศูนย์กลาง: โลโก้ + จำนวนผู้เล่น + ปุ่มพร้อม/ทดสอบ */}
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center pointer-events-none">
            <span className="p-logo-wrap mx-auto">
              <span className="p-logo-glow" />
              <img src="/image/logo_current.webp" alt="ECHO" className="p-logo-img h-12 sm:h-14 lg:h-16 w-auto" />
            </span>
            <p className="mt-1 text-sm sm:text-base text-white/70" style={{ fontFamily: P_DISPLAY }}>
              {count}/{state.maxPlayers} ที่นั่ง
            </p>

            {count >= 2 && (
              <button
                onClick={() => { clickSound(); socket.emit("toggleReady"); }}
                className={`pointer-events-auto mt-4 px-7 py-2.5 rounded-full font-black text-sm sm:text-base transition-all active:scale-95 ${
                  me?.ready
                    ? "bg-white/10 text-white/85 border border-white/25 hover:bg-white/20"
                    : "text-white animate-pulse hover:brightness-110"
                }`}
                style={
                  !me?.ready
                    ? { background: "linear-gradient(120deg,var(--color-p-accent),var(--color-p-accent-deep))", boxShadow: "0 10px 26px -6px rgba(155,79,150,.75)" }
                    : undefined
                }
              >
                {me?.ready ? "❌ ยกเลิกพร้อม" : "✅ พร้อมแล้ว"}
              </button>
            )}

            {count === 1 && (
              <button
                onClick={() => socket.emit("startGame")}
                className="pointer-events-auto mt-4 block mx-auto text-xs sm:text-sm text-white/50 hover:text-white/85 underline underline-offset-4 transition"
              >
                เล่นคนเดียว (ทดสอบ)
              </button>
            )}

            <p className="mt-3 text-[11px] sm:text-xs text-white/45 max-w-[14rem] mx-auto leading-snug">
              {count < 2
                ? "รอผู้เล่นคนอื่นเข้าห้องก่อนถึงจะกดพร้อมได้..."
                : !allReady
                ? "รอทุกคนกดพร้อม — เกมจะเริ่มเองทันทีที่ครบ"
                : "ทุกคนพร้อมแล้ว กำลังเริ่มเกม…"}
            </p>
          </div>
        </div>

        {/* ที่นั่งรอบวง */}
        {POSITIONS.map((n, i) => {
          const p = byPos[n];
          const pos = SEAT_LAYOUT[n];
          return (
            <div
              key={n}
              className="p-rise absolute -translate-x-1/2 -translate-y-1/2 w-24 sm:w-28 lg:w-32"
              style={{ left: pos.left, top: pos.top, animationDelay: `${i * 0.06}s` }}
            >
              {p ? (
                <div
                  className={`p-panel rounded-lg px-3 py-3 text-center ${p.ready ? "p-ring" : ""}`}
                  style={{ borderColor: p.color, borderWidth: 2 }}
                >
                  <div
                    className="mx-auto flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-full font-black text-base sm:text-lg text-white border-2 border-white/70"
                    style={{ background: p.color, fontFamily: P_DISPLAY }}
                  >
                    P{n}
                  </div>
                  <div className="font-bold mt-2 text-xs sm:text-sm truncate" style={{ fontFamily: P_DISPLAY }}>
                    {p.name}
                    {p.id === state.youId && (
                      <span style={{ color: "var(--color-p-accent-bright)" }}> (คุณ)</span>
                    )}
                  </div>
                  <div
                    className="text-[10px] sm:text-xs font-bold mt-1"
                    style={p.ready ? { color: "var(--color-p-accent-bright)" } : { opacity: 0.55 }}
                  >
                    {p.ready ? "✅ พร้อม" : "⏳ รอ"}
                  </div>
                  {!p.connected && (
                    <div className="text-[10px] font-bold mt-1 text-echo-hp">เชื่อมต่อใหม่…</div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-white/12 px-3 py-3 text-center opacity-40">
                  <div className="mx-auto w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-full border-2 border-white/20 grid place-items-center text-xs font-bold">
                    P{n}
                  </div>
                  <div className="mt-2 text-[10px] sm:text-xs font-bold">ว่าง</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---------- ปุ่มย้อนกลับ ลอย โปร่งแสง มุมซ้ายล่าง ---------- */}
      <button
        onClick={() => { clickSound(); onBack && onBack(); }}
        className="p-float-back fixed z-30 bottom-5 left-5 px-5 py-2.5 font-bold transition rounded-full text-white/90"
      >
        ← ย้อนกลับ
      </button>
    </div>
  );
}
