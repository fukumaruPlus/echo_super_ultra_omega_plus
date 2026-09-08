// ============================================================
//  SE.RA.PH — ฉากปิดท้าย (S8d ประจันหน้า · S11 จบรอบ · S12 ผู้ชนะคนสุดท้าย)
//  แยกไฟล์จาก scenes.jsx เพื่อไม่ให้ไฟล์เดียวยาวเกินไป — ใช้ useTimeline ร่วมกัน
// ============================================================

import { useState } from "react";
import { playSfx } from "../audio";
import { SystemLines, SeraphBackground } from "./ui";
import { useTimeline } from "./scenes";

const PD = "var(--font-p-display)";
const PLACE_NAME = { room: "ห้องพัก", church: "โบสถ์", park: "สวนสาธารณะ", library: "ห้องสมุด", store: "ร้านสะดวกซื้อ" };

/* =========================================================================
   S8d — ประจันหน้าก่อนเริ่มดวล · 1.8s
   ต่อท้ายฉากเปิดเผยตัวละครทั้งสองคน แล้วตัดเข้าการดวลจริง
   ========================================================================= */
export function FaceOffScene({ a, b, onDone }) {
  useTimeline([
    [0, () => playSfx("sc_glitch")],
    [1800, () => onDone && onDone()]
  ], [a && a.id, b && b.id]);
  if (!a || !b) return null;

  const side = (p, dir) => (
    <div className={`relative flex flex-col items-center gap-2 ${dir === "l" ? "sc-clash-l" : "sc-clash-r"}`}>
      <div
        className="w-32 h-44 sm:w-44 sm:h-60 rounded-lg overflow-hidden"
        style={{ outline: `3px solid ${p.color || "var(--color-sc-cyan)"}`, outlineOffset: 2 }}
      >
        {(p.character && p.character.img) || p.img ? (
          <img src={(p.character && p.character.img) || p.img} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full grid place-items-center bg-black text-4xl opacity-40">👤</span>
        )}
      </div>
      <div className="p-name-tag px-3 py-1 text-base font-black text-white" style={{ fontFamily: PD, "--p-frame-color": p.color }}>
        {(p.character && p.character.name) || p.name}
      </div>
      <div className="text-xs text-white/70">{p.name}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[93] grid place-items-center overflow-hidden" style={{ background: "var(--color-sc-void)" }}>
      <SeraphBackground phase="duel" hot grid="full" />
      <span className="sc-impact-rays absolute inset-0" />
      <div className="relative flex items-center gap-4 sm:gap-12">
        {side(a, "l")}
        <div className="sc-vs text-6xl sm:text-8xl" style={{ fontFamily: PD }}>VS</div>
        {side(b, "r")}
      </div>
    </div>
  );
}

/* =========================================================================
   S11 — จบรอบ · 4.6s
   จุดที่ผู้เล่นสับสนง่ายที่สุดของทั้งสเปก: "อะไรหายและอะไรอยู่ต่อ"
   จึงแยกให้เห็นชัดเป็นสองคอลัมน์ ไม่ปล่อยให้เดาเอง
   ========================================================================= */
export function CycleEndScene({ cycleRound = 1, players = [], goldGain = 5, matrixHeld = 0, matrixMax = 4, onDone }) {
  const [stage, setStage] = useState(0); // 0 ผังผู้รอด · 1 รางวัล · 2 สิ่งที่รีเซ็ต

  useTimeline([
    [0, () => playSfx("sc_noti")],
    [1100, () => { setStage(1); playSfx("sc_noti2"); }],
    [2500, () => setStage(2)],
    [4600, () => onDone && onDone()]
  ], [cycleRound]);

  const survivors = players.filter((p) => !p.scEliminated);

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center px-6 overflow-hidden">
      <SeraphBackground phase="draw" grid="full" />
      <span className="absolute inset-0" style={{ background: "rgba(4,7,12,.82)" }} />

      <div className="relative flex flex-col items-center gap-4 text-center">
        <div style={{ animation: "scBannerIn 420ms both" }}>
          <div className="text-sm sm:text-lg font-bold tracking-[0.28em]" style={{ fontFamily: PD, color: "var(--color-sc-cyan)" }}>
            จบรอบที่ {cycleRound}
          </div>
          <div className="text-2xl sm:text-4xl font-black italic text-white leading-tight" style={{ fontFamily: PD }}>
            เหลือผู้รอดชีวิต {survivors.length} คน
          </div>
        </div>

        {/* ผังผู้รอด — คนที่ถูกลบเป็นเงาจางมีกากบาททแยงพาด */}
        <div className="flex flex-wrap justify-center gap-2 max-w-3xl">
          {players.map((p, i) => (
            <div key={p.id} className="flex flex-col items-center gap-1" style={{ animation: `pRise 340ms ${i * 70}ms both` }}>
              <div
                className="w-14 h-[72px] sm:w-16 sm:h-20 rounded overflow-hidden relative"
                style={{
                  outline: `2px solid ${p.scEliminated ? "rgba(255,77,94,.6)" : "var(--color-sc-mint)"}`,
                  filter: p.scEliminated ? "grayscale(1) brightness(.4)" : "none"
                }}
              >
                {p.img && !p.scHidden ? (
                  <img src={p.img} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full grid place-items-center bg-black text-xl opacity-40">👤</span>
                )}
                {p.scEliminated && (
                  <span
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to bottom right, transparent 46%, rgba(255,77,94,.9) 50%, transparent 54%)" }}
                  />
                )}
              </div>
              <span className="text-[10px] font-bold text-white/85 leading-none">{p.name}</span>
            </div>
          ))}
        </div>

        {stage >= 1 && (
          <div className="flex flex-wrap items-center justify-center gap-3" style={{ animation: "scBannerIn 380ms both" }}>
            <span className="px-4 py-2 text-base font-black" style={{ background: "rgba(229,179,59,.16)", border: "1px solid var(--color-echo-gold)", color: "var(--color-echo-gold)" }}>
              🪙 ทุกคนได้ +{goldGain} เหรียญ
            </span>
            <span className="px-4 py-2 text-base font-black" style={{ background: "rgba(124,245,155,.14)", border: "1px solid var(--color-sc-mint)", color: "var(--color-sc-mint)" }}>
              ❤️🛡️ พลังชีวิตและเกราะฟื้นเต็ม
            </span>
          </div>
        )}

        {/* สิ่งที่หาย vs สิ่งที่อยู่ต่อ — ต้องอ่านออกภายใน 2 วินาที */}
        {stage >= 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full" style={{ animation: "scBannerIn 400ms both" }}>
            <div className="p-3 text-left" style={{ background: "rgba(255,77,94,.1)", border: "1px solid rgba(255,77,94,.5)" }}>
              <div className="text-xs font-black mb-1" style={{ color: "var(--color-sc-red)" }}>ถูกล้างทิ้ง</div>
              <div className="text-[11px] text-white/85 leading-relaxed">
                • แต้มสกิล กลับเป็น 0<br />
                • Matrix ที่ลงบนเป้าหมายไปแล้ว ล้างหมด
              </div>
            </div>
            <div className="p-3 text-left" style={{ background: "rgba(53,230,212,.1)", border: "1px solid var(--color-sc-line)" }}>
              <div className="text-xs font-black mb-1" style={{ color: "var(--color-sc-cyan)" }}>ยังอยู่กับเจ้า</div>
              <div className="text-[11px] text-white/85 leading-relaxed">
                • ระดับทักษะ · ความจุ · เหรียญ · ไอเทม<br />
                • Matrix ที่ยังไม่ได้ลง ({matrixHeld}/{matrixMax})
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   S12 — ผู้ชนะคนสุดท้าย · 8.0s
   Moon Cell มอบ "คำขอ" ให้ผู้รอดคนเดียว
   ========================================================================= */
export function FinalWinnerScene({ winner, board = [], cycleRound = 1, onDone }) {
  const [stage, setStage] = useState(0); // 0 ข้อความระบบ · 1 ลำแสง+ชื่อ · 2 สถิติ

  useTimeline([
    [0, () => playSfx("sc_noti")],
    [1500, () => { setStage(1); playSfx("sc_noti2"); }],
    [4200, () => setStage(2)],
    [8000, () => onDone && onDone()]
  ], [winner && winner.id]);

  if (!winner) return null;
  const row = board.find((b) => b.id === winner.id) || {};
  const st = row.stat || {};
  const fav = Object.entries(st.places || {}).sort((x, y) => y[1] - x[1])[0];

  const stats = [
    ["รอบที่ผ่านมาได้", cycleRound],
    ["ชนะประจำวัน", `${st.dayWins || 0} ครั้ง`],
    ["ชนะการดวล", `${st.duelWins || 0} คู่`],
    ["Matrix ที่ลงไป", `${st.matrixSpent || 0} แต้ม`],
    ["ระดับทักษะ", `${row.skillLevel || 1}/6`],
    ["เหรียญคงเหลือ", `${row.gold || 0}`],
    ...(fav ? [["ไปบ่อยที่สุด", `${PLACE_NAME[fav[0]] || fav[0]} · ${fav[1]} ครั้ง`]] : [])
  ];

  return (
    <div className="fixed inset-0 z-[94] grid place-items-center overflow-hidden px-6">
      <SeraphBackground phase="draw" grid="full" />
      <span className="absolute inset-0" style={{ background: "rgba(4,7,12,.86)" }} />

      {/* ลำแสงจากด้านบนส่องลงบนผู้ชนะ */}
      {stage >= 1 && (
        <span
          className="absolute left-1/2 -translate-x-1/2 top-0 pointer-events-none"
          style={{
            width: "min(46vw, 380px)",
            height: "72%",
            background: "linear-gradient(to bottom, rgba(255,255,255,.3), rgba(53,230,212,.1) 55%, transparent)",
            clipPath: "polygon(38% 0, 62% 0, 100% 100%, 0 100%)",
            animation: "scBannerIn 900ms both"
          }}
        />
      )}

      <div className="relative flex flex-col items-center gap-3 text-center">
        <SystemLines
          lines={["> MOON CELL — คำตัดสิน", "> เหลือผู้รอดเพียงหนึ่งเดียว"]}
          speed={24}
          gap={240}
          className="items-center text-xs sm:text-sm"
        />

        {stage >= 1 && (
          <>
            <div
              className="w-36 h-48 sm:w-48 sm:h-64 rounded-xl overflow-hidden"
              style={{
                outline: `3px solid ${winner.color || "var(--color-echo-gold)"}`,
                outlineOffset: 3,
                animation: "popIn 620ms cubic-bezier(.2,.9,.25,1.15) both"
              }}
            >
              {(winner.character && winner.character.img) || winner.img ? (
                <img src={(winner.character && winner.character.img) || winner.img} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full grid place-items-center bg-black text-5xl opacity-40">👤</span>
              )}
            </div>
            <div style={{ animation: "scBannerIn 460ms 200ms both" }}>
              <div className="text-3xl sm:text-5xl font-black italic text-white leading-tight" style={{ fontFamily: PD }}>
                {winner.name}
              </div>
              <div className="text-base sm:text-xl" style={{ fontFamily: PD, color: winner.color || "var(--color-sc-cyan)" }}>
                {(winner.character && winner.character.name) || row.charName || ""}
              </div>
              <div className="mt-2 text-lg sm:text-2xl font-black" style={{ fontFamily: PD, color: "var(--color-echo-gold)" }}>
                คำขอถูกมอบให้แล้ว
              </div>
            </div>
          </>
        )}

        {stage >= 2 && (
          <div className="flex flex-wrap justify-center gap-2 mt-2 max-w-2xl">
            {stats.map(([k, v], i) => (
              <div
                key={k}
                className="px-3 py-2 text-left"
                style={{ background: "rgba(4,7,12,.9)", border: "1px solid var(--color-sc-line)", animation: `pRise 300ms ${i * 70}ms both` }}
              >
                <div className="sc-sysline text-[9px] opacity-70">{k}</div>
                <div className="text-sm font-black text-white" style={{ fontFamily: PD }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
