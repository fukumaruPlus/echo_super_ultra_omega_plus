import { useEffect, useRef, useState } from "react";
import { playSfx } from "../audio";
import { createOrtStage } from "./ortStage";
import "./raid-board.css";

// ฉากเปิดตัว ORT ตอนเข้าโหมด Type Mercury — "หายนะกำลังมาเยือน"
//  ใช้แทนฉากเปิดตัวผู้เล่น (GameIntro) ในโหมดนี้ · server พักเกมไว้ MERCURY_ARRIVAL_SECONDS (14 วิ) ให้ทุกคนดูพร้อมกัน
//
//  ลำดับฉาก (มิลลิวินาที)
//   0     ม่านเหล็กลายเตือนภัยกระแทกปิดจอจากบน-ล่าง (ม่านของโหมด)
//   500   ไซเรน + ข้อความเตือนพิมพ์ทีละบรรทัดบนม่าน
//   2900  ม่านฉีกเปิด -> ชื่อโหมด TYPE MERCURY ผ่านจอแบบกลิตช์
//   4500  ORT ปรากฏตัว (ท่า intro ของ ortStage: รอยแยกแสง -> เศษข้อมูลประกอบร่าง -> ระเบิดแสง -> ป้ายชื่อ)
//   9400  "หายนะกำลังมาเยือน" กระแทกทีละตัวอักษร + จอร้าว
//   12600 จางออก -> onDone
const T = { lines: 500, open: 2900, mode: 3000, ort: 4500, doom: 9400, fade: 12600, done: 13300 };
const WARN_LINES = [
  "คำเตือน · ระดับภัยพิบัติสูงสุด",
  "ตรวจพบสัญญาณมหันตภัยในเครือข่าย Echo",
  "ระบบป้องกันล้มเหลว — ข้อมูลกำลังถูกลบ",
];
const DOOM_TEXT = "หายนะกำลังมาเยือน";
// แยกเป็น "กลุ่มตัวอักษร" ไม่ใช่ทีละ code point — สระบน/ล่างและวรรณยุกต์ของไทยต้องติดไปกับพยัญชนะ
//  (แยกทีละ code point สระ ั ื จะหลุดไปเป็น span เดี่ยวลอยอยู่ผิดที่)
const DOOM_GLYPHS = typeof Intl !== "undefined" && Intl.Segmenter
  ? [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(DOOM_TEXT)].map((x) => x.segment)
  : DOOM_TEXT.match(/.[ัิ-ฺ็-๎]*/g);

export default function OrtArrival({ lowQ, onDone }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const [phase, setPhase] = useState("shut"); // shut | open | ort | doom | fade
  const [lines, setLines] = useState(0);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const st = createOrtStage(canvasRef.current, { lowQ, demo: false });
    stageRef.current = st;
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    playSfx("change_cutscene");
    WARN_LINES.forEach((_, i) => at(T.lines + i * 650, () => { setLines(i + 1); playSfx("sc_noti"); }));
    at(T.open, () => { setPhase("open"); playSfx("sc_glitch"); });
    at(T.ort, () => { setPhase("ort"); st.play("intro"); });
    at(T.doom, () => { setPhase("doom"); playSfx("attack"); });
    at(T.fade, () => setPhase("fade"));
    at(T.done, () => doneRef.current?.());
    return () => { timers.forEach(clearTimeout); st.destroy(); stageRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`ort-arrival ort-arrival-${phase} ${lowQ ? "ort-arrival-calm" : ""}`} aria-live="polite">
      <canvas ref={canvasRef} className="ort-arrival-canvas" aria-hidden="true" />

      {/* ชื่อโหมด — แวบผ่านตอนม่านเปิด */}
      <div className="ort-arrival-mode" aria-hidden={phase !== "open"}>
        <span className="ort-arrival-mode-label">เรดบอส</span>
        <span className="ort-arrival-mode-name" data-text="TYPE MERCURY">TYPE MERCURY</span>
      </div>

      {/* "หายนะกำลังมาเยือน" — กระแทกทีละตัวอักษร */}
      {(phase === "doom" || phase === "fade") && (
        <div className="ort-arrival-doom">
          <div className="ort-arrival-doom-text">
            {DOOM_GLYPHS.map((c, i) => (
              <span key={i} style={{ "--i": i }}>{c}</span>
            ))}
          </div>
          <div className="ort-arrival-doom-sub">ORT · มหันตภัย · ศัตรูของเหล่า Echo</div>
          <span className="ort-arrival-crack" />
        </div>
      )}

      {/* ม่านเหล็กลายเตือนภัย 2 บาน (บน/ล่าง) */}
      <div className="ort-shutter ort-shutter-top">
        <div className="ort-shutter-stripes" />
        <div className="ort-shutter-warn">
          {WARN_LINES.slice(0, lines).map((l, i) => (
            <div key={i} className={i === 0 ? "ort-warn-head" : "ort-warn-line"}>{l}</div>
          ))}
        </div>
      </div>
      <div className="ort-shutter ort-shutter-bottom">
        <div className="ort-shutter-stripes" />
        <div className="ort-siren" />
      </div>
      <div className="ort-arrival-vignette" />
    </div>
  );
}
