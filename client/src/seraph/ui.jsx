// ============================================================
//  SE.RA.PH — ชิ้นส่วน UI ที่ใช้ซ้ำทุกฉาก
//  ทุกตัวเป็น presentational ล้วน (รับ props อย่างเดียว ไม่แตะ socket/state ของเกม)
//  -> ต่อเข้า server ทีหลังได้โดยไม่ต้องแก้ไฟล์นี้ (ดู SERAPH_SCENES.md §8)
// ============================================================

import { useEffect, useRef, useState } from "react";
import { playSfx } from "../audio";
import { SC_GLITCH, backgroundFor } from "./assets";

/* ---------- ข้อความระบบ: พิมพ์ทีละตัวอักษร 18ms/ตัว (เสียงของ Moon Cell) ---------- */
export function SystemLine({ text, delay = 0, speed = 18, red, className = "", onDone }) {
  const [shown, setShown] = useState(0);
  const [started, setStarted] = useState(delay === 0);

  useEffect(() => {
    setShown(0);
    setStarted(delay === 0);
    if (delay === 0) return undefined;
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [text, delay]);

  useEffect(() => {
    if (!started) return undefined;
    if (shown >= text.length) {
      onDone && onDone();
      return undefined;
    }
    const t = setTimeout(() => setShown((n) => n + 1), speed);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, shown, text, speed]);

  const typing = started && shown < text.length;
  return (
    <div className={`sc-sysline ${red ? "sc-sysline-red" : ""} ${typing ? "sc-caret" : ""} ${className}`}>
      {started ? text.slice(0, shown) : ""}
      {/* จองความกว้างไว้ล่วงหน้าด้วยข้อความโปร่งใส — บรรทัดจะได้ไม่กระตุกตอนพิมพ์ */}
      <span aria-hidden className="opacity-0">{started ? text.slice(shown) : text}</span>
    </div>
  );
}

/** หลายบรรทัดต่อกัน: บรรทัดถัดไปเริ่มพิมพ์เมื่อบรรทัดก่อนหน้าจบ */
export function SystemLines({ lines, speed = 18, gap = 160, red, className = "" }) {
  const [done, setDone] = useState(0);
  // ผูกกับ "เนื้อความ" ไม่ใช่ identity ของ array: ผู้เรียกส่ง array literal มาได้โดยไม่ทำให้
  // ตัวพิมพ์รีเซ็ตทุกเรนเดอร์ (ซึ่งจะค้างอยู่บรรทัดแรกตลอดกาล)
  const sig = lines.join(" ¦ ");
  useEffect(() => setDone(0), [sig]);
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {lines.map((l, i) => (
        i <= done ? (
          <SystemLine
            key={`${i}-${l}`}
            text={l}
            speed={speed}
            red={red}
            onDone={() => {
              if (i === done) setTimeout(() => setDone((d) => (d === i ? d + 1 : d)), gap);
            }}
          />
        ) : null
      ))}
    </div>
  );
}

/* ---------- กลิตช์ตัด: ใช้คู่กับ cut_glit.mp3 เสมอ (SERAPH_SCENES.md §2 กฎข้อ 2) ----------
   GIF วนลูปเองไม่มีวันจบ จึงคุมด้วยการ mount/unmount แทน — คีย์ playId ทำให้เริ่มเฟรมใหม่ทุกครั้ง */
export function GlitchCut({ playId, duration = 180, silent = false, onDone }) {
  const [on, setOn] = useState(false);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current && !playId) { firstRun.current = false; return undefined; }
    firstRun.current = false;
    setOn(true);
    if (!silent) playSfx("sc_glitch");
    const t = setTimeout(() => { setOn(false); onDone && onDone(); }, duration);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playId]);

  if (!on) return null;
  return (
    <div className="sc-glitch-layer" aria-hidden>
      <img src={SC_GLITCH} alt="" className="sc-glitch-gif" />
      <span className="sc-glitch-flash" />
      {[18, 42, 63, 81].map((top, i) => (
        <span key={top} className="sc-glitch-slice" style={{ top: `${top}%`, height: `${4 + i * 2}%`, animationDelay: `${i * 30}ms` }} />
      ))}
    </div>
  );
}

/* ---------- พื้นหลังของโหมด: GIF + ชั้นเคลือบที่ทำให้ความเบลอกลายเป็นสไตล์ ----------
   ลำดับชั้นสำคัญ (ล่าง -> บน): GIF -> เคลือบสีช่วงเวลา -> ตาราง -> scanline -> noise -> วีเนต */
export function SeraphBackground({ phase = "draw", night = false, hot = false, grid = "faint", children }) {
  const src = backgroundFor(phase, night);
  const gridCls = hot ? "sc-grid-hot" : grid === "full" ? "sc-grid" : grid === "none" ? null : "sc-grid-faint";
  const tint = hot ? "sc-bg-tint-hot" : night ? "sc-bg-tint-night" : "sc-bg-tint-day";
  return (
    <div className="sc-bg">
      {/* key = src: เปลี่ยนฉากหลังแล้วให้ <img> สร้างใหม่ GIF จะได้เริ่มเฟรมแรก */}
      <img key={src} src={src} alt="" className="sc-bg-img" />
      <span className="sc-bg-dim" />
      <span className={`sc-bg-tint ${tint}`} />
      {gridCls && <span className={gridCls} />}
      <span className="sc-scanlines" />
      <span className="sc-noise" />
      <span className="sc-vignette" />
      {children}
    </div>
  );
}

/* ---------- แถบวัน 5 จุด: HUD ถาวรมุมขวาบน (S1) ---------- */
export function DayRail({ day = 1, compact = false }) {
  return (
    <div className={`sc-day-rail ${compact ? "" : "px-3 py-1.5"} items-center`}>
      {!compact && (
        <span className="sc-sysline text-[10px] mr-1 opacity-70">DAY</span>
      )}
      {[1, 2, 3, 4].map((d) => (
        <span key={d} className="sc-day-dot" data-done={d < day} data-now={d === day} />
      ))}
      <span className="sc-day-dot sc-day-dot-duel grid place-items-center" data-now={day === 5}>
        <span className="text-[9px] leading-none" style={{ transform: "translateY(-0.5px)" }}>⚔</span>
      </span>
    </div>
  );
}

/* ---------- การ์ดเงาดำ + ??? : รูปร่างของความลับ (S2, S0, S6) ---------- */
export function ShadowPortrait({ name, img, revealed = false, color = "#35e6d4", size = "md", className = "" }) {
  const dim = size === "lg" ? "w-40 h-52" : size === "sm" ? "w-14 h-18" : "w-24 h-32";
  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <div
        className={`${dim} relative overflow-hidden rounded-lg ${revealed ? "" : "sc-silhouette-frame"}`}
        style={revealed ? { outline: `2px solid ${color}`, outlineOffset: 2 } : undefined}
      >
        {img ? (
          <img src={img} alt="" className={`absolute inset-0 w-full h-full object-cover ${revealed ? "" : "sc-silhouette"}`} />
        ) : (
          <span className="absolute inset-0 bg-black" />
        )}
        {!revealed && <span className="absolute inset-0 bg-black/45" />}
      </div>
      {name && <span className="text-[11px] font-bold text-white/85 leading-none">{name}</span>}
      <span className={`text-[10px] leading-none ${revealed ? "" : "sc-unknown"}`} style={revealed ? { color } : undefined}>
        {revealed ? "เปิดเผยแล้ว" : "???"}
      </span>
    </div>
  );
}

/* ---------- ช่อง Matrix 4 ช่อง (HUD วันที่ 1-4) ---------- */
export function MatrixSlots({ held = 0, max = 4, justGained = false }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className="sc-matrix-slot"
          data-filled={i < held}
          data-just={justGained && i === held - 1}
        />
      ))}
    </span>
  );
}

/* ---------- ลูกบาศก์ข้อมูล 3 มิติ (รางวัล Matrix / คลังที่สวนสาธารณะ) ---------- */
export function DataCube({ size = 34, className = "" }) {
  const h = size / 2;
  const faces = [
    { transform: `translateZ(${h}px)` },
    { transform: `rotateY(180deg) translateZ(${h}px)` },
    { transform: `rotateY(90deg) translateZ(${h}px)` },
    { transform: `rotateY(-90deg) translateZ(${h}px)` },
    { transform: `rotateX(90deg) translateZ(${h}px)` },
    { transform: `rotateX(-90deg) translateZ(${h}px)` }
  ];
  return (
    <span className={`inline-block ${className}`} style={{ width: size, height: size, perspective: size * 4 }}>
      <span className="sc-cube block w-full h-full">
        {faces.map((f, i) => <span key={i} className="sc-cube-face" style={f} />)}
      </span>
    </span>
  );
}

/* ---------- T0 Toast: มุมขวาบน ซ้อนได้สูงสุด 3 ใบ (SERAPH_SCENES.md §5) ---------- */
export function ToastStack({ toasts = [] }) {
  return (
    <div className="fixed top-3 right-3 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.slice(0, 3).map((t) => (
        <div key={t.id} className="sc-toast px-3 py-2 text-xs text-white flex items-center gap-2 min-w-[168px]">
          <span className="text-base leading-none">{t.icon || "◆"}</span>
          <span className="leading-tight">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** คิว toast แบบง่าย — หมดอายุเองใน 2 วินาทีตามสเปก T0 */
export function useToasts(ttl = 2000) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const push = (text, icon) => {
    const id = ++seq.current;
    setToasts((list) => [...list, { id, text, icon }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), ttl);
  };
  return [toasts, push];
}

/* ---------- กรอบแดง "มีคนกำลังจับตาเจ้าอยู่" (S9 Matrix ระดับ 3 ฝั่งเป้าหมาย) ---------- */
export function WatchedFrame({ on }) {
  if (!on) return null;
  return (
    <>
      <span className="sc-watched-frame" aria-hidden />
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[61] pointer-events-none">
        <div className="sc-toast px-3 py-1.5 text-xs flex items-center gap-2" style={{ borderLeftColor: "var(--color-sc-red)" }}>
          <span className="text-base leading-none sc-day-dot-duel" style={{ border: "none" }}>👁</span>
          <span className="sc-sysline sc-sysline-red text-[11px]">มีคนกำลังจับตาแต้มของเจ้าอยู่</span>
        </div>
      </div>
    </>
  );
}
