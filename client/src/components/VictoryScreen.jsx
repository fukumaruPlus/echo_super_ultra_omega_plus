import { useMemo, useState } from "react";
import { clickSound } from "../audio";
import { AvButton, Crystals, FaeGrowth } from "./avalon";

function WinnerPortrait({ p, i }) {
  const [broken, setBroken] = useState(false);
  const img = p.character?.img || p.img;
  return (
    <div style={{ animation: "avStamp 0.8s cubic-bezier(.2,.9,.25,1) backwards", animationDelay: `${0.5 + i * 0.12}s` }}>
    <div className="relative" style={{ transform: `rotate(${(i % 2 ? 1 : -1) * 2.5}deg)` }}>
      <span
        className="av-portrait-plate"
        style={{ background: `linear-gradient(135deg, var(--av-gold-lit), ${p.color} 48%, var(--av-royal))` }}
      />
      <div className="relative w-44 h-56 overflow-hidden" style={{ background: `linear-gradient(150deg, ${p.color}, var(--av-void))` }}>
        {img && !broken ? (
          <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-6xl" style={{ fontFamily: "var(--font-av-display)", fontWeight: 900 }}>
            {(p.name || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <Crystals level={5} seed={p.position} />
    </div>
    </div>
  );
}

export default function VictoryScreen({ state, onBackToLobby }) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: (i * 137) % 100,
        dur: 4 + ((i * 7) % 5),
        delay: (i * 0.37) % 6,
        dx: ((i % 5) - 2) * 40,
      })),
    []
  );

  const { heading, winners } = useMemo(() => {
    // Type Mercury: ผลของ Raid — ชนะ = ผู้เล่นทุกคน · แพ้/ยอมแพ้ = ORT
    const raid = state.mercury?.result;
    if (raid === "win") {
      const ws = state.players.filter((p) => !p.isBoss);
      return { heading: "โค่น ORT สำเร็จ", winners: ws };
    }
    if (raid === "lose" || raid === "surrender") {
      const boss = state.players.filter((p) => p.isBoss);
      return { heading: raid === "surrender" ? "ยอมแพ้ต่อ ORT" : "ORT ลบข้อมูลทั้งหมด", winners: boss };
    }
    if (state.gameMode !== "ffa" && state.winningTeamId) {
      const ws = state.players.filter((p) => p.alive && p.teamId === state.winningTeamId);
      return { heading: `ทีม ${state.winningTeamId}`, winners: ws };
    }
    if (state.allyWin) {
      const ws = state.players.filter((p) => p.alive);
      return { heading: ws.map((w) => w.name).join(" และ "), winners: ws };
    }
    const c = state.players.find((p) => p.alive);
    return { heading: c ? c.name : "จบเกม", winners: c ? [c] : [] };
  }, [state.gameMode, state.winningTeamId, state.allyWin, state.players, state.mercury?.result]);

  const names = winners.map((w) => w.name).join(" และ ");

  return (
    <div className="av-over" style={{ "--rot": 1 }}>
      <div className="av-over-rays" />
      <FaeGrowth level={4} seed={13} />
      {confetti.map((c, i) => (
        <span
          key={i}
          className="av-confetti"
          style={{ left: `${c.left}%`, animationDuration: `${c.dur}s`, animationDelay: `-${c.delay}s`, "--dx": `${c.dx}px` }}
        />
      ))}

      <div className="relative z-10 text-center flex flex-col items-center gap-6 px-10">
        <span className="av-label av-stamp" style={{ fontSize: "1.1rem", letterSpacing: "0.5em" }}>ผู้ชนะ</span>

        <h1 className="av-title av-title-thai av-unfurl text-[5.5rem] leading-none max-w-6xl" style={{ animationDelay: "0.2s" }}>
          {heading}
        </h1>

        {winners.length > 1 && (
          <div className="av-heading text-xl" style={{ color: "rgba(232,196,239,.75)" }}>{names}</div>
        )}

        {winners.length > 0 && (
          <div className="flex justify-center gap-7 mt-3">
            {winners.map((p, i) => <WinnerPortrait key={p.id} p={p} i={i} />)}
          </div>
        )}

        <AvButton className="mt-6 text-lg px-10 py-3.5" onClick={() => { clickSound(); onBackToLobby(); }} silent>
          กลับห้องรอ
        </AvButton>
      </div>
    </div>
  );
}
