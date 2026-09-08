// ============================================================
//  สนาม SE.RA.PH — "วงแหวนข้อมูล" (วันที่ 1-4)
//
//  ตั้งใจไม่ทำเป็นการ์ดเรียงแถว: ผู้เล่นลอยอยู่บน "วงรี" รอบแกนกลางในมุมเปอร์สเปกทีฟ
//   - คนที่อยู่ลึกเข้าไปด้านหลังวง เล็กลง+จางลง (ระยะชัดลึกจริง ไม่ใช่ทุกคนขนาดเท่ากัน)
//   - แผ่นข้อมูลเป็นทรงขนานเฉียง เอียงหันเข้าแกนกลาง ไม่ใช่สี่เหลี่ยมตรง
//   - ทุกแผ่นมีลำแสงเชื่อมเข้าแกนกลาง = ทุกคนต่ออยู่กับ Moon Cell
//   - เส้น Matrix ที่เราลงไว้บนใคร วิ่งข้ามวงไปหาคนนั้นให้เห็นกับตา
//   - ไพ่กางออกจากแผ่นเข้าหาแกนกลาง แทนที่จะกองอยู่ใต้ชื่อ
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { SeraphBackground, DayRail, MatrixSlots, WatchedFrame } from "./ui";

const PD = "var(--font-p-display)";
const CARD_COLOR = { red: "#e2564a", blue: "#4a8fe2", green: "#4ae27a", yellow: "#e2c74a" };

// ---------- ผังสนาม (ตัวเลขทั้งหมดรวมไว้ที่เดียว แก้ที่นี่จุดเดียว) ----------
//  เผื่อที่ให้แถบหัวจอ (~11%) และแผง HUD ล่าง (~16%) เสมอ วงรีจึงอยู่ในช่วง 29%-67%
//  ry = 22 มาจากการวัดจริง: ถ้ามีผู้เล่น 2 คน การ์ดฝั่งหลังจะอยู่ "เหนือกองไพ่พอดี" (มุม 270 องศา)
//  ค่าต่ำกว่านี้การ์ดจะทับกองไพ่ ค่าสูงกว่านี้การ์ดจะชนแถบหัวจอ
const RING = { cx: 50, cy: 48, rx: 33, ry: 22 };  // ศูนย์กลางวงรี + รัศมี (หน่วย % ของจอ)
const CORE = { x: 50, y: 42 };                    // กองไพ่กลาง — เยื้องลงจากศูนย์วงรีให้พ้นการ์ดฝั่งหลัง
//  ขนาดการ์ด: โหมดปกติใช้ w-28 h-32 (112x128px) — ของโหมดนี้ต้อง "ใหญ่กว่า" ไม่ใช่เล็กกว่า
const PLATE_W = 124;        // ผู้เล่นอื่น
const PLATE_W_SELF = 176;   // ตัวเรา
const PLATE_RATIO = 1.24;   // สูง = กว้าง x ค่านี้

/** ตำแหน่งบนวงรี: มุม a -> พิกัด % + ความลึก (0 = หลังสุด, 1 = หน้าสุด) */
function ringPos(i, n, selfIndex) {
  // หมุนให้ "ตัวเรา" มาอยู่หน้าสุดเสมอ (มุม 90° = ด้านล่างจอ)
  const offset = selfIndex >= 0 ? selfIndex : 0;
  const a = ((i - offset) / n) * Math.PI * 2 + Math.PI / 2;
  const depth = (Math.sin(a) + 1) / 2;           // 0 หลังสุด -> 1 หน้าสุด
  return {
    x: RING.cx + Math.cos(a) * RING.rx,           // วงรี: กว้างกว่าสูง = มุมมองเฉียง
    y: RING.cy + Math.sin(a) * RING.ry,
    depth,
    // ย่อตามระยะลึกแค่พอให้รู้สึกมีมิติ — เดิมย่อถึง 0.62 ทำให้การ์ดหลังเหลือ ~57px (เล็กกว่าโหมดปกติครึ่งหนึ่ง)
    scale: 0.86 + depth * 0.2,
    z: Math.round(depth * 100)
  };
}

/** ไพ่ที่กางออกจากแผ่นเข้าหาแกนกลาง */
function CardFan({ cards, count, mine, spread = 15, big = false }) {
  const n = mine ? (cards ? cards.length : 0) : count || 0;
  if (!n) return null;
  const list = Array.from({ length: n }, (_, i) => i);
  return (
    <div className="absolute left-1/2 -top-1 -translate-x-1/2" style={{ height: 0 }}>
      {list.map((i) => {
        const rot = (i - (n - 1) / 2) * spread;
        const c = mine && cards ? cards[i] : null;
        return (
          <span
            key={i}
            className="sc-fan-card"
            style={{
              width: big ? 28 : 22,
              height: big ? 39 : 31,
              left: big ? -14 : -11,
              transform: `rotate(${rot}deg) translateY(${big ? -38 : -30}px)`,
              animationDelay: `${i * 45}ms`,
              background: c
                ? `linear-gradient(150deg, ${CARD_COLOR[c.color] || "#888"}, #0b1016)`
                : "linear-gradient(150deg, #14202b, #05080d)",
              borderColor: c ? CARD_COLOR[c.color] || "#888" : "rgba(53,230,212,.45)"
            }}
          >
            {c && (
              <span className={`absolute inset-0 grid place-items-center font-black text-white ${big ? "text-sm" : "text-[11px]"}`}>
                {c.special ? "★" : c.value}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** แผ่นข้อมูลผู้เล่น 1 คน */
function PlayerPlate({ p, pos, mine, matrixLv, isFoe, phase }) {
  const w = mine ? PLATE_W_SELF : PLATE_W;
  const h = Math.round(w * PLATE_RATIO);
  const hidden = p.scHidden;
  const live = !p.locked && p.alive && phase === "draw";
  return (
    <div
      className={`sc-plate ${mine ? "sc-plate-self" : ""}`}
      data-live={live}
      data-locked={p.locked}
      data-foe={isFoe}
      data-out={p.scEliminated}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        zIndex: pos.z,
        width: w,
        transform: `translate(-50%, -50%) scale(${pos.scale})`,
        opacity: 0.55 + pos.depth * 0.45,
        animationDelay: `${pos.z * 3}ms`
      }}
    >
      <CardFan cards={p.cards} count={p.cardCount} mine={mine} big={mine} />

      <div className="sc-plate-body" style={{ height: h }}>
        {/* ภาพตัวละคร — เงาดำล้วนถ้ายังไม่เคยเห็นตัวตน */}
        {p.img && !hidden ? (
          <img src={p.img} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />
        ) : (
          <span className="absolute inset-0 grid place-items-center">
            <span className="text-3xl opacity-30">👤</span>
          </span>
        )}
        <span className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,7,12,.96) 14%, rgba(4,7,12,.25) 65%)" }} />

        {/* หมายเลขที่นั่งตัวใหญ่จาง ๆ เป็นพื้น */}
        <span
          className="absolute -bottom-2 -right-1 font-black italic leading-none pointer-events-none"
          style={{ fontFamily: PD, fontSize: mine ? 58 : 44, color: `${p.color}22`, WebkitTextStroke: `1px ${p.color}33` }}
        >
          {p.position}
        </span>

        <div className="absolute inset-x-0 bottom-0 p-1.5 flex flex-col gap-0.5">
          <span className={`font-black text-white leading-tight truncate ${mine ? "text-sm" : "text-xs"}`} style={{ fontFamily: PD }}>
            {p.name}
          </span>
          <span className={`leading-none truncate ${mine ? "text-[11px]" : "text-[10px]"} ${hidden ? "sc-unknown" : ""}`} style={hidden ? undefined : { color: p.color }}>
            {hidden ? "???" : (p.character && p.character.name) || ""}
          </span>
        </div>

        {/* แถบบนสุด: จำนวนไพ่ + สถานะเปิดไพ่ */}
        <div className="absolute top-1 inset-x-1 flex items-center justify-between">
          <span className="sc-sysline text-[11px] leading-none px-1" style={{ background: "rgba(0,0,0,.65)" }}>
            {/* Matrix ระดับ 1 = เห็นจำนวนไพ่แบบเรียลไทม์ (คนอื่นไม่รู้ตัว) */}
            {mine || matrixLv >= 1 ? `🂠${p.cardCount}` : "🂠?"}
          </span>
          {p.locked && <span className="text-sm text-echo-gold leading-none">✔</span>}
        </div>

        {/* Matrix ระดับ 3 = เห็นแต้มของเขาตลอดเวลา */}
        {!mine && matrixLv >= 3 && p.score != null && (
          <span
            className="absolute top-6 right-1 sc-sysline text-[11px] font-black px-1"
            style={{ background: "rgba(0,0,0,.75)", color: "var(--color-sc-red)" }}
          >
            {p.score}
          </span>
        )}
      </div>

      {/* ป้ายระดับการจับตา */}
      {!mine && matrixLv > 0 && (
        <span
          className="sc-watch-tag absolute -top-2 left-0"
          style={{ color: matrixLv >= 3 ? "var(--color-sc-red)" : "var(--color-sc-cyan)", background: "rgba(4,7,12,.9)" }}
        >
          ◆{matrixLv}
        </span>
      )}
      {isFoe && (
        <span
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-black px-1.5 py-px whitespace-nowrap"
          style={{ background: "var(--color-sc-red)", color: "#fff", fontFamily: PD }}
        >
          คู่ดวลของเจ้า
        </span>
      )}
    </div>
  );
}

export default function Arena({ state, onHit, onLock }) {
  const sc = state.seraph;
  const me = state.players.find((p) => p.id === state.youId);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  const boxRef = useRef(null);

  useEffect(() => {
    const measure = () => {
      const el = boxRef.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const players = useMemo(
    () => [...state.players].filter((p) => !p.isBoss).sort((a, b) => a.position - b.position),
    [state.players]
  );
  const selfIndex = players.findIndex((p) => p.id === state.youId);
  const layout = players.map((p, i) => ({ p, pos: ringPos(i, players.length, selfIndex) }));

  const canAct = me && me.alive && !me.locked && state.gameState === "PLAYING";

  return (
    <div className="fixed inset-0 overflow-hidden select-none">
      <SeraphBackground phase="draw" night={sc.night} />
      <WatchedFrame on={sc.watchedBy > 0} />

      {/* ---------- แถบบน: วัน + นับถอยหลัง ---------- */}
      <div className="absolute top-0 inset-x-0 z-30 px-3 pt-2 pb-1 flex items-start justify-between gap-3 pointer-events-none">
        <div className="min-w-0">
          <div className="sc-sysline text-[10px] sm:text-xs opacity-80 truncate">
            {`> รอบ ${sc.cycleRound} · วันที่ ${sc.day}/${sc.daysTotal}`}
          </div>
          {/* leading-tight ไม่ใช่ leading-none: ฟอนต์ไทยมีสระบน/ล่าง ถ้าบีบบรรทัดสนิทหัวอักษรจะโดนตัด */}
          <div className="text-2xl sm:text-4xl font-black italic text-white leading-tight truncate" style={{ fontFamily: PD }}>
            {sc.day === 5 ? "วันคัดออก" : "วันสืบสวน"}
          </div>
          {sc.myOpponent && (
            <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5" style={{ background: "rgba(255,77,94,.16)", borderLeft: "3px solid var(--color-sc-red)" }}>
              <span className="text-[10px] font-black" style={{ color: "var(--color-sc-red)" }}>
                ⚔ คู่ของเจ้า: {(state.players.find((p) => p.id === sc.myOpponent) || {}).name}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <DayRail day={sc.day} />
          <div className="text-2xl sm:text-4xl font-black leading-none" style={{ fontFamily: PD, color: state.timeLeft <= 10 ? "var(--color-sc-red)" : "#fff" }}>
            {state.timeLeft}
          </div>
        </div>
      </div>

      {/* ---------- สนามวงแหวน ---------- */}
      <div ref={boxRef} className="absolute inset-0">
        {/* พื้นวงแหวนหมุน (เอียง 74° = มองจากมุมสูง) */}
        <div className="sc-arena">
          <div className="sc-arena-floor">
            <span className="sc-arena-ring" />
            <span className="sc-arena-ring" />
            <span className="sc-arena-ring" />
          </div>
        </div>

        {/* ลำแสงเชื่อมทุกแผ่นเข้าแกนกลาง + เส้น Matrix ข้ามวง */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }} viewBox="0 0 100 100" preserveAspectRatio="none">
          {layout.map(({ p, pos }) => (
            <line
              key={`b${p.id}`}
              className="sc-beam"
              data-live={!p.locked && p.alive}
              x1={CORE.x} y1={CORE.y} x2={pos.x} y2={pos.y}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* เส้นจากตัวเราไปยังคนที่เราลง Matrix ไว้ — เห็นเครือข่ายสอดแนมของตัวเองกับตา */}
          {layout.map(({ p, pos }) => {
            const lv = sc.matrixPlaced[p.id] || 0;
            if (!lv || selfIndex < 0) return null;
            const self = layout[selfIndex].pos;
            return (
              <line
                key={`m${p.id}`}
                className="sc-beam-matrix"
                data-lv={lv}
                x1={self.x} y1={self.y} x2={pos.x} y2={pos.y}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* แกนกลาง: กองไพ่ของ Moon Cell */}
        <div className="sc-core" style={{ left: `${CORE.x}%`, top: `${CORE.y}%`, zIndex: 6 }}>
          <span className="sc-core-glow" />
          <div className="sc-core-orb">
            <div
              className="w-11 h-14 rounded grid place-items-center"
              style={{ background: "linear-gradient(150deg,#0d2b33,#04070c)", border: "1px solid var(--color-sc-cyan)", boxShadow: "0 0 18px rgba(53,230,212,.5)" }}
            >
              <span className="sc-sysline text-[13px] font-black">
                {state.deckLedger ? state.deckLedger.filter((c) => !c.drawn).length : 40}
              </span>
            </div>
          </div>
          <div className="sc-sysline text-[10px] text-center mt-1 opacity-75">DECK</div>
        </div>

        {/* แผ่นผู้เล่นทุกคน */}
        {layout.map(({ p, pos }) => (
          <PlayerPlate
            key={p.id}
            p={p}
            pos={pos}
            mine={p.id === state.youId}
            matrixLv={sc.matrixPlaced[p.id] || 0}
            isFoe={sc.myOpponent === p.id}
            phase={sc.phase}
          />
        ))}
      </div>

      {/* ---------- HUD ล่าง: ค่าของโหมดนี้ (ไม่มีหลอดเลือด/สกิลในวันที่ 1-4) ---------- */}
      <div className="absolute bottom-0 inset-x-0 z-30 p-2 sm:p-3 flex flex-col items-center gap-2">
        <div
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-1.5"
          style={{ background: "rgba(4,7,12,.82)", border: "1px solid var(--color-sc-line)", clipPath: "polygon(2% 0,98% 0,100% 100%,0 100%)" }}
        >
          <span className="flex items-center gap-1.5 text-[11px] text-white/85">
            ◆ <MatrixSlots held={sc.matrixHeld} max={sc.matrixMax} />
          </span>
          <span className="text-[11px] text-white/85">🪙 {me ? me.gold : 0}</span>
          <span className="text-[11px] text-white/85">📘 ระดับ {sc.skillLevel}/{sc.skillLevelMax}</span>
          <span className="text-[11px] text-white/85">⚡ ความจุ {sc.caps ? sc.caps.skill : 4}/8</span>
          {sc.watchedBy > 0 && (
            <span className="text-[11px] font-black" style={{ color: "var(--color-sc-red)" }}>
              👁 ถูกจับตา {sc.watchedBy}
            </span>
          )}
        </div>

        {/* ปุ่มจั่ว / เปิดไพ่ */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!canAct || state.deckEmpty || (me && me.atCap)}
            onClick={onHit}
            className="p-hs-action p-hs-action-draw px-7 py-2.5 text-base font-black text-white disabled:opacity-35"
            style={{ fontFamily: PD }}
          >
            จั่ว
          </button>
          <div className="text-center px-2">
            <div className="sc-sysline text-[9px] opacity-70">SCORE</div>
            <div className="text-3xl font-black leading-none" style={{ fontFamily: PD, color: me && me.busted ? "var(--color-sc-red)" : "#fff" }}>
              {me && me.score != null ? me.score : "—"}
            </div>
          </div>
          <button
            type="button"
            disabled={!canAct}
            onClick={onLock}
            className="p-hs-action p-hs-action-reveal px-7 py-2.5 text-base font-black text-white disabled:opacity-35"
            style={{ fontFamily: PD }}
          >
            เปิดไพ่
          </button>
        </div>
      </div>
    </div>
  );
}
