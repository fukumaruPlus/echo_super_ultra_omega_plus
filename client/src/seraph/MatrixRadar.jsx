// ============================================================
//  S5.3 — สวนสาธารณะ: ลงแต้ม Matrix (ฉากเด่นของครึ่งแรก)
//  อารมณ์: นั่งอยู่หน้าจอเรดาร์ตอนตีสาม — เป้าหมายเป็นเงาดำเรียงเป็นวงกลมรอบตัวเรา
//
//  แต้มที่ 3 ต้องกดยืนยันเต็มจอก่อนเสมอ:
//  การแลกเปลี่ยน "เห็นแต้มเขา <-> เขารู้ว่าถูกจับตา" คือหัวใจของระบบ Matrix ทั้งระบบ
//  ถ้าผู้เล่นกดพลาดโดยไม่รู้ตัว กลไกทั้งอันจะพัง
// ============================================================

import { useMemo, useState } from "react";
import { playSfx } from "../audio";
import { SC_PLACE } from "./assets";
import { SeraphBackground, SystemLines, DataCube } from "./ui";

const PD = "var(--font-p-display)";
const R = 38; // รัศมีวงกลมที่วางเป้าหมาย (% ของกรอบเรดาร์)

const LEVEL_TEXT = {
  1: { icon: "🂠", label: "เห็นจำนวนไพ่" },
  2: { icon: "🛡", label: "รับดาเมจน้อยลง 1" },
  3: { icon: "👁", label: "เห็นแต้มตลอด — เป้าหมายรู้ตัว" }
};

export default function MatrixRadar({
  targets = [],       // [{ id, name, img, revealed, isOpponent }]
  held = 0,           // แต้ม Matrix ที่ถืออยู่
  placed = {},        // { [id]: จำนวนแต้มที่ลงไปแล้ว }
  onPlace,            // (targetId) => void
  onDone
}) {
  const [local, setLocal] = useState(placed);
  const [remain, setRemain] = useState(held);
  const [confirm, setConfirm] = useState(null); // id ที่กำลังจะลงเป็นแต้มที่ 3
  const [beam, setBeam] = useState(null);       // id ที่เส้นข้อมูลกำลังวิ่งไปหา

  // คู่ดวลของเราถูกดันขึ้นมาเป็นเป้าแรกของวง (SERAPH_SCENES.md S6 — ผลถาวรหลังประกาศคู่)
  const ordered = useMemo(() => {
    const list = [...targets];
    const i = list.findIndex((t) => t.isOpponent);
    if (i > 0) list.unshift(list.splice(i, 1)[0]);
    return list;
  }, [targets]);

  const commit = (id) => {
    const next = (local[id] || 0) + 1;
    setLocal((m) => ({ ...m, [id]: next }));
    setRemain((n) => n - 1);
    setBeam(id);
    setTimeout(() => setBeam(null), 320);
    playSfx(next >= 3 ? "sc_glitch" : "sc_noti2");
    onPlace && onPlace(id);
  };

  const tryPlace = (id) => {
    if (remain <= 0) return;
    const cur = local[id] || 0;
    if (cur >= 3) return;
    if (cur + 1 === 3) { setConfirm(id); playSfx("sc_noti"); return; }
    commit(id);
  };

  const pos = (i) => {
    const a = (i / Math.max(1, ordered.length)) * Math.PI * 2 - Math.PI / 2;
    return { left: `${50 + Math.cos(a) * R}%`, top: `${50 + Math.sin(a) * R}%` };
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden">
      {/* ภาพสวนจางลงเป็นพื้นดำ แล้วเรดาร์ขึ้นมาแทน */}
      <div className="sc-bg">
        <img src={SC_PLACE.park.img} alt="" className="sc-bg-img sc-kenburns" style={{ filter: "brightness(0.28) saturate(0.7)" }} />
        <span className="sc-bg-tint sc-bg-tint-night" />
        <span className="sc-grid-faint" />
        <span className="sc-scanlines" />
        <span className="sc-noise" />
        <span className="sc-vignette" />
      </div>

      <div className="absolute top-3 left-4 right-4 flex items-start justify-between gap-3">
        <div>
          <SystemLines lines={["> DEEP SCAN INTERFACE"]} speed={16} className="text-[11px] sm:text-xs" />
          <div className="text-2xl sm:text-3xl font-black italic text-white" style={{ fontFamily: PD }}>สวนสาธารณะ</div>
        </div>
        <div className="text-right">
          <div className="sc-sysline text-[10px] opacity-70">MATRIX BUFFER</div>
          <div className="text-2xl font-black" style={{ fontFamily: PD, color: "var(--color-sc-cyan)" }}>{remain}</div>
        </div>
      </div>

      {/* วงเรดาร์ */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative" style={{ width: "min(86vw, 460px)", height: "min(86vw, 460px)" }}>
          <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
            {[0, 1, 2].map((i) => (
              <circle key={i} className="sc-radar-ring" cx="100" cy="100" r="92" style={{ "--sc-d": `${i * 1000}ms` }} />
            ))}
            <circle cx="100" cy="100" r="92" fill="none" stroke="var(--color-sc-line)" strokeDasharray="3 6" />
            <circle cx="100" cy="100" r="58" fill="none" stroke="var(--color-sc-line)" strokeDasharray="2 8" opacity="0.6" />
            <g className="sc-radar-sweep">
              <line x1="100" y1="100" x2="100" y2="8" stroke="var(--color-sc-cyan)" strokeWidth="1.4" opacity="0.8" />
            </g>
            {/* เส้นข้อมูลวิ่งจากเราไปหาเป้าตอนลงแต้ม */}
            {beam !== null && ordered.map((t, i) => {
              if (t.id !== beam) return null;
              const a = (i / Math.max(1, ordered.length)) * Math.PI * 2 - Math.PI / 2;
              return (
                <line
                  key={t.id}
                  className="sc-link-beam"
                  x1="100" y1="100"
                  x2={100 + Math.cos(a) * 76} y2={100 + Math.sin(a) * 76}
                />
              );
            })}
          </svg>

          {/* ตัวเรา (คลัง Matrix) อยู่กลางวง */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
            <DataCube size={38} />
            <span className="sc-sysline text-[10px]">เจ้า</span>
          </div>

          {/* เป้าหมาย: เงาดำ + วงแหวนล็อกซ้อนชั้นตามจำนวนแต้มที่ลง */}
          {ordered.map((t, i) => {
            const lv = local[t.id] || 0;
            const canPlace = remain > 0 && lv < 3;
            return (
              <button
                key={t.id}
                type="button"
                disabled={!canPlace}
                onClick={() => tryPlace(t.id)}
                className="absolute -translate-x-1/2 -translate-y-1/2 p-target-wrap flex flex-col items-center gap-1"
                style={{ ...pos(i), cursor: canPlace ? "pointer" : "default" }}
              >
                {/* 1 แต้ม = 1 วงแหวน (ครบ 3 เป็นสีแดง) */}
                {Array.from({ length: lv }, (_, k) => (
                  <span
                    key={k}
                    className="p-target-ring"
                    style={{
                      inset: `${-16 - k * 9}%`,
                      borderColor: lv >= 3 ? "rgba(255,77,94,.85)" : "rgba(53,230,212,.7)",
                      animationDuration: `${3.2 + k}s`,
                      animationDirection: k % 2 ? "reverse" : "normal"
                    }}
                  />
                ))}
                <div
                  className="w-14 h-18 sm:w-16 sm:h-20 relative overflow-hidden rounded"
                  style={{ outline: `2px ${t.isOpponent ? "solid rgba(255,77,94,.9)" : "dashed var(--color-sc-line)"}`, outlineOffset: 2 }}
                >
                  {t.img
                    ? <img src={t.img} alt="" className={`w-full h-full object-cover ${t.revealed ? "" : "sc-silhouette"}`} />
                    : <span className="block w-full h-full bg-black" />}
                  {lv >= 2 && (
                    <span className="absolute inset-x-0 bottom-0 h-1/2 rounded-b" style={{ background: "linear-gradient(to top, rgba(53,230,212,.45), transparent)" }} />
                  )}
                </div>
                <span className="text-[10px] font-bold text-white/85 leading-none">{t.name}</span>
                <span className={`text-[9px] leading-none ${t.revealed ? "text-white/60" : "sc-unknown"}`}>
                  {t.revealed ? t.charName : "???"}
                </span>
                {lv > 0 && (
                  <span className="text-[9px] leading-none flex items-center gap-0.5" style={{ color: lv >= 3 ? "var(--color-sc-red)" : "var(--color-sc-cyan)" }}>
                    {LEVEL_TEXT[lv].icon} {lv}/3
                  </span>
                )}
                {t.isOpponent && (
                  <span className="text-[8px] font-black px-1.5 py-px" style={{ background: "var(--color-sc-red)", color: "#fff" }}>คู่ดวล</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-2 px-4">
        <div className="flex gap-3 text-[10px] sm:text-xs text-white/70">
          {[1, 2, 3].map((lv) => (
            <span key={lv} className="flex items-center gap-1">
              <span style={{ color: lv >= 3 ? "var(--color-sc-red)" : "var(--color-sc-cyan)" }}>{LEVEL_TEXT[lv].icon}</span>
              {lv} · {LEVEL_TEXT[lv].label}
            </span>
          ))}
        </div>
        <button type="button" className="p-btn-cut p-slash-btn px-6 py-2 text-sm font-black text-white" onClick={() => onDone && onDone(local)}>
          เสร็จสิ้น
        </button>
      </div>

      {/* แผงยืนยันแต้มที่ 3 — ห้ามข้าม */}
      {confirm !== null && (
        <div className="fixed inset-0 z-[85] grid place-items-center px-6" style={{ background: "rgba(4,7,12,.88)" }}>
          <div className="p-panel max-w-md w-full p-5 flex flex-col gap-3" style={{ animation: "popIn 300ms both", borderColor: "var(--color-sc-red)" }}>
            <SystemLines lines={["> DEEP SCAN — LEVEL 3"]} speed={20} red className="text-sm" />
            <p className="text-sm leading-relaxed text-white/90">
              เจ้าจะเห็น<b className="text-white">แต้มของเป้าหมายตลอดการดวล</b><br />
              แต่เป้าหมาย<b style={{ color: "var(--color-sc-red)" }}>จะรู้ว่ามีคนกำลังจับตาเขาอยู่</b>
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" className="p-btn-cut px-4 py-2 text-sm font-bold text-white/80 border border-white/20" onClick={() => setConfirm(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="p-btn-cut px-5 py-2 text-sm font-black text-white"
                style={{ background: "var(--color-sc-red)" }}
                onClick={() => { const id = confirm; setConfirm(null); commit(id); }}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
