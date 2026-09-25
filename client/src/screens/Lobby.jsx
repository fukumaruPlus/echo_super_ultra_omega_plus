import { useState } from "react";
import { socket } from "../socket";
import { clickSound } from "../audio";
import { POSITIONS } from "../data/positions";
import { AvScene, AvButton, SealButton, Crest, AvRule } from "../components/avalon";

const LEVEL = 4;

const TEAM_COLORS = { A: "#b95fc4", B: "#e8bf5a", C: "#5fc4a0" };
const MODE_TITLES = { ffa: "อิสระ", duo: "คู่หู", trio: "สหายทั้ง 3 เอ๋ย", seraph: "Moon Cell", mercury: "Type Mercury" };
const MODE_SUBTITLES = { ffa: "ทุกคนสู้กันเอง", duo: "ทีมละ 2 คน", trio: "ทีมละ 3 คน", seraph: "SE.RA.PH", mercury: "เรดบอส ORT · ทุกคนร่วมทีม" };
// หน้าเลือกรูปแบบสนามแบ่ง 2 ชั้น: เลือกหมวดก่อน แล้วค่อยโหวตโหมดในหมวดนั้น
const MODE_GROUPS = [
  { key: "normal", title: "สงครามทั่วไป", sub: "อิสระ · คู่หู · สหายทั้ง 3 เอ๋ย" },
  { key: "special", title: "สงครามพิเศษ", sub: "Moon Cell · Type Mercury" },
];

const modeTitle = (mode) => MODE_TITLES[mode] || mode;
const teamColor = (id) => TEAM_COLORS[id] || "var(--av-orchid)";

function ScreenTitle({ label, title }) {
  return (
    <div className="av-slide-l">
      <div className="av-label">{label}</div>
      <h1 className="av-title av-title-thai text-4xl av-ink">{title}</h1>
      <span className="av-crack block" style={{ position: "relative", width: "16vw", height: 2 }} />
    </div>
  );
}

function TeamModeView({ state, onBack }) {
  const count = state.players.length;
  const me = state.players.find((p) => p.id === state.youId);
  const allOptions = state.modeVotes?.length ? state.modeVotes : (state.modeOptions?.length ? state.modeOptions : [
    { mode: "ffa", label: "Free For All", group: "normal", enabled: count >= 2, voters: [], voteCount: 0 },
    { mode: "duo", label: "Duo", group: "normal", enabled: count >= 4 && count % 2 === 0, voters: [], voteCount: 0 },
    { mode: "trio", label: "Trio", group: "normal", enabled: count === 6, voters: [], voteCount: 0 },
  ]);
  // หมวดที่เปิดดูอยู่ (เป็นแค่ฝั่งหน้าจอของเรา — ไม่ใช่การโหวต) · เริ่มจากหมวดที่เราโหวตไว้ถ้ามี
  const myGroup = allOptions.find((o) => o.mode === me?.modeVote)?.group || null;
  const [group, setGroup] = useState(myGroup);
  const options = group ? allOptions.filter((o) => (o.group || "normal") === group) : [];
  const votedCount = state.players.filter((p) => p.modeVote).length;
  const hint = (opt) => opt.suspended ? "พักใช้งาน"
    : opt.mode === "duo" ? "ต้องมี 4 หรือ 6 คน" : opt.mode === "trio" ? "ต้องมี 6 คน"
    : opt.mode === "mercury" ? "เล่นได้ 1-7 คน" : "ใช้ได้ตั้งแต่ 2 คน";
  const groupVotes = (key) => allOptions.filter((o) => (o.group || "normal") === key).reduce((n, o) => n + (o.voteCount || 0), 0);

  return (
    <AvScene level={LEVEL} seed={53} className="h-screen w-screen overflow-hidden">
      <div className="av-content absolute top-10 left-12 z-30">
        <ScreenTitle label={`โหวตแล้ว ${votedCount} จาก ${count} คน`} title={group ? MODE_GROUPS.find((g) => g.key === group)?.title : "เลือกรูปแบบสนาม"} />
      </div>

      <div className="av-content absolute z-10" style={{ left: "8vw", right: "8vw", top: "32vh", bottom: "17vh" }}>
        {!group ? (
          <div className="h-full flex gap-6">
            {MODE_GROUPS.map((g, i) => (
              <div key={g.key} className="av-rise av-seq flex-1 flex min-w-0" style={{ "--i": i + 1 }}>
                <button
                  onClick={() => { clickSound(); setGroup(g.key); }}
                  data-on={myGroup === g.key ? "true" : "false"}
                  className="av-wedge flex-1 min-w-0"
                  style={{ transform: "skewX(-7deg)" }}
                >
                  <span className="av-wedge-fill" />
                  <div className="relative h-full flex flex-col justify-between text-left px-[2.4vw] py-7 min-w-0" style={{ transform: "skewX(7deg)" }}>
                    <div className="min-w-0">
                      <div className={`${myGroup === g.key ? "av-title" : "av-title-purple"} av-title-thai text-5xl whitespace-nowrap`}>{g.title}</div>
                      <div className="av-heading text-sm mt-2 truncate" style={{ color: "rgba(239,230,245,.55)" }}>{g.sub}</div>
                    </div>
                    <div className="min-w-0">
                      <span className="av-numeral block" style={{ fontSize: "3.6rem", WebkitTextStroke: "2px rgba(185,95,196,.35)" }}>{groupVotes(g.key)}</span>
                      <div className="av-label mt-1 truncate" style={{ fontSize: "0.74rem" }}>แตะเพื่อดูโหมดในหมวดนี้</div>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        ) : (
        <div className="h-full flex gap-4">
          {options.map((opt, i) => {
            const selected = me?.modeVote === opt.mode;
            const voters = state.players.filter((p) => (opt.voters || []).includes(p.id));
            return (
              <div key={opt.mode} className="av-rise av-seq flex-1 flex min-w-0" style={{ "--i": i + 1 }}>
                <button
                  disabled={!opt.enabled}
                  onClick={() => { clickSound(); socket.emit("selectGameMode", { mode: opt.mode }); }}
                  data-on={selected ? "true" : "false"}
                  className="av-wedge flex-1 min-w-0"
                  style={{ transform: "skewX(-7deg)" }}
                >
                  <span className="av-wedge-fill" />
                  <div
                    className="relative h-full flex flex-col justify-between text-left px-[2.4vw] py-7 min-w-0"
                    style={{ transform: "skewX(7deg)" }}
                  >
                    <div className="min-w-0">
                      <div
                        className={`${selected ? "av-title" : "av-title-purple"} av-title-thai text-4xl whitespace-nowrap`}
                      >
                        {modeTitle(opt.mode)}
                      </div>
                      <div className="av-heading text-sm mt-1 truncate" style={{ color: "rgba(239,230,245,.55)" }}>
                        {MODE_SUBTITLES[opt.mode]}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 min-w-0">
                      {voters.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color, boxShadow: `0 0 10px 2px ${p.color}` }} />
                          <span className="av-heading text-sm truncate" style={{ color: p.color }}>{p.name}</span>
                        </div>
                      ))}
                    </div>

                    <div className="min-w-0">
                      <span
                        className="av-numeral block"
                        style={{ fontSize: "3.6rem", WebkitTextStroke: selected ? "2px var(--av-gold-mid)" : "2px rgba(185,95,196,.35)" }}
                      >
                        {opt.voteCount || 0}
                      </span>
                      <div className="av-label mt-1 truncate" style={{ fontSize: "0.74rem" }}>
                        {opt.enabled ? (selected ? "คุณโหวตแล้ว" : "แตะเพื่อโหวต") : hint(opt)}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
        )}
      </div>

      <div className="av-content absolute inset-x-12 bottom-6 flex flex-wrap justify-center gap-3 z-20">
        {state.players.map((p) => (
          <span key={p.id} className="av-chip" style={{ borderColor: `${p.color}88` }}>
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
        ))}
      </div>

      <AvButton variant="ghost" className="fixed z-30 bottom-6 left-8 py-2 px-6 text-sm" onClick={group ? () => { clickSound(); setGroup(null); } : onBack}>
        {group ? "← เลือกหมวดใหม่" : "← ย้อนกลับ"}
      </AvButton>
    </AvScene>
  );
}

function TeamSetupView({ state, onBack }) {
  const me = state.players.find((p) => p.id === state.youId);
  const teams = state.teamOptions || [];
  const teamSize = state.teamSize || 2;
  const readyCount = state.players.filter((p) => p.teamConfirmed).length;

  return (
    <AvScene level={LEVEL} seed={59} className="h-screen w-screen overflow-hidden">
      <div className="av-content absolute top-10 left-12 z-30">
        <ScreenTitle label={`${state.gameMode === "trio" ? "สามคน" : "คู่หู"} · ทีมละ ${teamSize} คน`} title="จัดทีม" />
      </div>

      <div className="av-content absolute top-12 right-12 flex items-center gap-3 z-30 pr-16">
        <AvButton variant="ghost" className="py-2 px-5 text-sm" onClick={() => socket.emit("teamBackToMode")}>
          เปลี่ยนโหมด
        </AvButton>
        <AvButton
          variant={me?.teamConfirmed ? "ghost" : "gold"}
          className="py-2 px-6 text-sm"
          disabled={!me?.teamId}
          onClick={() => socket.emit("confirmTeam", { confirmed: !me?.teamConfirmed })}
        >
          {me?.teamConfirmed ? "ยกเลิก" : "ยืนยัน"}
        </AvButton>
      </div>

      <div className="av-content absolute inset-x-[6vw] flex gap-[2vw] z-10" style={{ top: "30vh", bottom: "13vh" }}>
        {teams.map((team, ti) => {
          const members = state.players.filter((p) => p.teamId === team.id).sort((a, b) => a.position - b.position);
          const canJoin = !!me && !me.teamConfirmed && (members.length < teamSize || me.teamId === team.id);
          const accent = teamColor(team.id);
          const mine = me?.teamId === team.id;
          return (
            <div key={team.id} className="av-rise av-seq flex-1 min-w-0 flex" style={{ "--i": ti + 1 }}>
              <div
                className="flex-1 min-w-0 flex flex-col"
                style={{ transform: `rotate(${(ti - (teams.length - 1) / 2) * 1.4}deg)` }}
              >
                <div
                  className="relative flex items-end justify-between gap-3 pb-2 shrink-0"
                  style={{ borderBottom: `2px solid ${mine ? "var(--av-gold-lit)" : accent + "77"}` }}
                >
                  <div className={mine ? "av-title text-3xl" : "av-title-purple text-3xl"}>{team.id}</div>
                  <span className={`av-chip ${mine ? "av-chip-gold" : ""}`}>{members.length}/{teamSize} คน</span>
                </div>

                <div className="flex-1 min-h-0 flex flex-col gap-2 pt-3">
                  {Array.from({ length: teamSize }).map((_, i) => {
                    const p = members[i];
                    return p ? (
                      <div
                        key={p.id}
                        className="av-roster-slab flex-1 min-h-0"
                        data-ready={p.teamConfirmed ? "true" : "false"}
                      >
                        <span className="av-slab-fill" />
                        <span className="av-slab-mark" />
                        <Crest color={p.color} className="relative w-10 h-10 text-xs shrink-0">P{p.position}</Crest>
                        <div className="relative min-w-0 flex-1">
                          <div className="av-heading text-sm truncate" style={{ color: p.color }}>
                            {p.name}{p.id === state.youId ? " (คุณ)" : ""}
                          </div>
                          <div className="text-xs truncate" style={{ color: "rgba(239,230,245,.32)" }}>ตัวละครถูกซ่อนไว้</div>
                        </div>
                        <span className="relative av-heading text-xs shrink-0" style={{ color: p.teamConfirmed ? "var(--av-gold-lit)" : "rgba(239,230,245,.35)" }}>
                          {p.teamConfirmed ? "พร้อม" : "รอ"}
                        </span>
                      </div>
                    ) : (
                      <div key={i} className="av-roster-slab av-roster-slab-empty flex-1 min-h-0 justify-center">
                        <span className="av-heading text-xs" style={{ color: "rgba(239,230,245,.26)" }}>ว่าง</span>
                      </div>
                    );
                  })}
                </div>

                <AvButton
                  variant={mine ? "gold" : "ghost"}
                  className="mt-3 w-full py-2 text-sm shrink-0"
                  disabled={!canJoin}
                  onClick={() => socket.emit("chooseTeam", { teamId: team.id })}
                >
                  {mine ? "อยู่ทีมนี้" : "เข้าทีมนี้"}
                </AvButton>
              </div>
            </div>
          );
        })}
      </div>

      <div className="av-content absolute inset-x-[22vw] bottom-6 z-20">
        <AvRule>ยืนยันแล้ว {readyCount} จาก {state.players.length} คน</AvRule>
      </div>

      <AvButton variant="ghost" className="fixed z-30 bottom-6 left-8 py-2 px-6 text-sm" onClick={onBack}>
        ← ย้อนกลับ
      </AvButton>
    </AvScene>
  );
}

function Toggle({ icon, on, label, tip, onToggle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 justify-end">
      <AvButton variant="ghost" className="py-1.5 px-4 text-xs" data-on={on ? "true" : "false"} onClick={onToggle}>
        {icon} <span>{label}</span>
      </AvButton>
      <div className="group relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-6 h-6 grid place-items-center rounded-full text-xs cursor-help"
          style={{ background: "rgba(6,4,9,.7)", border: "1px solid rgba(185,95,196,.45)", color: "var(--av-lilac)" }}
          aria-label={label}
        >
          i
        </button>
        <div
          className={`av-veil absolute right-0 top-full mt-2 w-64 p-3 text-xs leading-snug z-40 transition-opacity ${
            open ? "opacity-100" : "opacity-0 pointer-events-none"
          } group-hover:opacity-100 group-hover:pointer-events-auto`}
        >
          {tip}
        </div>
      </div>
    </div>
  );
}

export default function Lobby({ state, onBack, lowQ, onToggleLowQ, skillConfirmOn = true, onToggleSkillConfirm, pairRole = null }) {
  const count = state.players.length;
  const me = state.players.find((p) => p.id === state.youId);
  // ตัวละครคู่ (สไตรเกอร์ ยูเรก้า): ปุ่มพร้อมเป็นของแต่ละคน — ระเบียนจะนับว่าพร้อมเมื่อครบคู่และพร้อมทั้งคู่
  const mySideReady = me?.pair && pairRole ? !!me.pair[pairRole]?.ready : !!me?.ready;
  const readyCount = state.players.filter((p) => p.ready).length;
  const allReady = count >= 1 && state.players.every((p) => p.ready); // เล่นคนเดียวได้ (Type Mercury)
  const byPos = Object.fromEntries(state.players.map((p) => [p.position, p]));
  const mid = (POSITIONS.length - 1) / 2;

  if (state.gameState === "TEAM_MODE") return <TeamModeView state={state} onBack={onBack} />;
  if (state.gameState === "TEAM_SETUP") return <TeamSetupView state={state} onBack={onBack} />;

  return (
    <AvScene level={LEVEL} seed={67} className="h-screen w-screen overflow-hidden">
      <div className="av-content absolute top-10 left-12 z-30">
        <ScreenTitle label={`${count} จาก ${state.maxPlayers} ที่นั่ง`} title="ห้องรอ" />
      </div>

      <div className="av-content absolute top-11 right-24 flex flex-col gap-2.5 z-30 pr-12">
        <Toggle
          icon="🎬"
          on={lowQ}
          label={lowQ ? "ประหยัด: เปิด" : "ประหยัด: ปิด"}
          onToggle={onToggleLowQ}
          tip="ข้ามวีดีโอท่าไม้ตาย/ฉากคัตซีน — จะเห็นแค่การแจ้งเตือนว่าใครเปิดท่าไม้ตายแทน (แต่ยังต้องรอผู้เล่นคนอื่นดูวีดีโอให้จบอยู่ดี)"
        />
        <Toggle
          icon="⚡"
          on={!skillConfirmOn}
          label={skillConfirmOn ? "ยืนยันสกิล: เปิด" : "ยืนยันสกิล: ปิด"}
          onToggle={onToggleSkillConfirm}
          tip="ปิดแล้ว = กดช่องสกิลปุ๊บใช้ทันที ไม่มีป๊อปอัปถามยืนยัน (เร็วขึ้นแต่กดพลาดแล้วย้อนไม่ได้) มีผลเฉพาะกับตัวเราเท่านั้น"
        />
      </div>

      <span
        className="av-numeral absolute left-1/2 -translate-x-1/2 select-none z-0"
        style={{
          top: "14vh",
          fontSize: "48vh",
          WebkitTextStroke: allReady ? "3px rgba(232,191,90,.45)" : "3px rgba(185,95,196,.28)",
        }}
      >
        {readyCount}
      </span>

      <div className="av-content av-fan" style={{ left: 0, right: 0, top: "23vh", height: "42vh" }}>
        {POSITIONS.map((n, i) => {
          const p = byPos[n];
          const ready = !!p?.ready;
          const rot = (i - mid) * 4.6;
          const lift = Math.pow(i - mid, 2) * 7 - (ready ? 26 : 0);
          return (
            <div
              key={n}
              className="av-rise av-seq relative h-full flex"
              style={{ "--i": i, margin: "0 -0.9vw", zIndex: ready ? 9 : Math.round(4 - Math.abs(i - mid)) }}
            >
              <div
                className="av-fan-card"
                data-ready={ready ? "true" : "false"}
                data-empty={p ? "false" : "true"}
                style={{ transform: `rotate(${rot}deg) translateY(${lift}px)` }}
              >
                <span className="av-fan-fill" />
                <span className="av-fan-glow" />
                <div className="relative h-full flex flex-col items-center justify-between py-6 px-3 text-center">
                  {p ? (
                    <>
                      <Crest color={p.color} className="text-base shrink-0" style={{ width: "3rem", height: "3rem" }}>
                        P{n}
                      </Crest>
                      <div className="min-w-0 w-full">
                        <div className="av-heading text-lg text-white leading-tight break-words">{p.name}</div>
                        {p.id === state.youId && (
                          <div className="av-label mt-1" style={{ fontSize: "0.7rem" }}>คุณ</div>
                        )}
                        {!p.connected && (
                          <div className="av-heading text-xs mt-1" style={{ color: "var(--av-blood)" }}>เชื่อมต่อใหม่…</div>
                        )}
                        {p.pair && (
                          <div className="text-[11px] mt-1 leading-snug" style={{ color: "rgba(239,230,245,.75)" }}>
                            {["pilot", "gunner"].map((k) => (
                              <div key={k}>
                                {k === "pilot" ? "🃏 นักบิน" : "🎯 พลปืน"}: {p.pair[k] ? `${p.pair[k].name}${p.pair[k].ready ? " ✓" : ""}` : "รอคู่หู…"}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div
                        className="av-heading text-sm shrink-0"
                        style={{ color: ready ? "var(--av-gold-lit)" : "rgba(239,230,245,.35)", letterSpacing: "0.06em" }}
                      >
                        {ready ? "พร้อม" : "ยังไม่พร้อม"}
                      </div>
                    </>
                  ) : (
                    <>
                      <span
                        className="grid place-items-center rounded-full shrink-0"
                        style={{
                          width: "3rem",
                          height: "3rem",
                          border: "1px dashed rgba(185,95,196,.3)",
                          color: "rgba(239,230,245,.3)",
                          fontFamily: "var(--font-av-display)",
                          fontWeight: 900,
                        }}
                      >
                        P{n}
                      </span>
                      <div className="av-heading text-sm" style={{ color: "rgba(239,230,245,.26)" }}>ที่นั่งว่าง</div>
                      <span />
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="av-content absolute inset-x-0 flex flex-col items-center gap-3 z-20" style={{ top: "69vh" }}>
        {(count >= 2 || !!me?.pair) && (
          <SealButton
            label={mySideReady ? "ยกเลิก" : "พร้อม"}
            className={mySideReady ? "" : "av-breathe"}
            onClick={() => socket.emit("toggleReady")}
          />
        )}

        {count === 1 && !me?.pair && (
          <AvButton variant="ghost" className="py-2 px-5 text-xs" onClick={() => socket.emit("startGame")}>
            เล่นคนเดียว (ทดสอบ)
          </AvButton>
        )}

        <AvRule className="w-[26rem]">พร้อมแล้ว {readyCount} จาก {count} คน</AvRule>

        <div className="av-heading text-sm text-center max-w-[32rem] leading-snug" style={{ color: "rgba(239,230,245,.45)" }}>
          {count < 2
            ? "รอผู้เล่นคนอื่นเข้าห้องก่อนถึงจะกดพร้อมได้"
            : !allReady
            ? "รอทุกคนกดพร้อม — เกมจะเริ่มเองทันทีที่ครบ"
            : "ทุกคนพร้อมแล้ว กำลังเริ่มเกม…"}
        </div>
      </div>

      <AvButton variant="ghost" className="fixed z-30 bottom-6 left-8 py-2 px-6 text-sm" onClick={onBack}>
        ← ย้อนกลับ
      </AvButton>
    </AvScene>
  );
}
