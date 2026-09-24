import { useEffect, useRef, useState } from "react";
import { clickSound } from "../audio";
import { createOrtStage, ORT_BAR_HP, ORT_BAR_ARMOR } from "./ortStage";
import "./raid.css";

// หน้าตัวอย่างอนิเมชันบอส ORT ของโหมด Type Mercury — เข้าจากปุ่มลัดหน้าแรก ไม่ต่อ server
//  ยังไม่ใช่ระบบเล่นจริง: HUD และปุ่มท่าทางทั้งหมดเป็นของสาธิตฝั่ง client ล้วน
const MOVES = [
  { act: "intro", label: "เปิดตัว" },
  { act: "walk", label: "เดินเข้า" },
  { act: "attack", label: "โจมตี" },
  { act: "crit", label: "โจมตีคริติคอล ×2", hot: true },
  { act: "counter", label: "สวนกลับ" },
  { act: "hit", label: "โดนโจมตี" },
  { act: "break", label: "หลอดแตก" },
  { act: "lost", label: "ข้อมูลสูญหาย" },
  { act: "evolve", label: "วิวัฒนาการ" },
];
const AUTO_SEQ = ["walk", "attack", "hit", "counter", "lost", "crit", "hit", "break", "evolve"];

export default function RaidPreview({ lowQ, onBack }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const [hud, setHud] = useState({ bars: 5, hp: ORT_BAR_HP, armor: ORT_BAR_ARMOR, atk: 1 });
  const [auto, setAuto] = useState(true);
  const autoRef = useRef(true); // สำเนาของ auto ให้ตัวจับเวลาใน effect อ่านค่าล่าสุดได้
  const setAutoBoth = (v) => { autoRef.current = v; setAuto(v); };

  useEffect(() => {
    let i = 0, timer = 0;
    const queueNext = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const st = stageRef.current;
        if (!st || !autoRef.current || st.busy()) return;
        st.play(AUTO_SEQ[i++ % AUTO_SEQ.length]);
      }, 1400);
    };
    const st = createOrtStage(canvasRef.current, { lowQ, onHud: setHud, onActionEnd: queueNext });
    stageRef.current = st;
    st.play("intro");
    return () => { clearTimeout(timer); st.destroy(); stageRef.current = null; };
    // lowQ เปลี่ยนระหว่างเปิดหน้า -> ส่งผ่าน setLowQ ด้านล่าง ไม่สร้างเวทีใหม่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { stageRef.current?.setLowQ(lowQ); }, [lowQ]);

  const press = (act) => {
    clickSound();
    setAutoBoth(false);
    stageRef.current?.play(act);
  };
  const toggleAuto = () => {
    clickSound();
    const next = !auto;
    setAutoBoth(next);
    const st = stageRef.current;
    if (next && st && !st.busy()) st.play(AUTO_SEQ[0]);
  };

  const pips = Math.max(hud.bars, 5);
  return (
    <div className="raid-preview">
      <header className="raid-head">
        <button type="button" className="raid-back" onClick={() => { clickSound(); onBack(); }}>← กลับ</button>
        <div className="raid-title">
          <span className="raid-mode">Type Mercury</span>
          <span className="raid-sub">ตัวอย่างอนิเมชัน · ยังไม่ใช่ระบบเล่นจริง</span>
        </div>
      </header>

      <div className="raid-stage">
        <canvas ref={canvasRef} className="raid-canvas" aria-label="อนิเมชันบอส ORT" />
        <div className="raid-hud">
          <div className="raid-hud-top">
            <span className="raid-boss">ORT</span>
            <span className="raid-tag">มหันตภัย</span>
            <span className="raid-atk">พลังโจมตี <b>{hud.atk}</b></span>
          </div>
          <div className="raid-pips">
            {Array.from({ length: pips }, (_, i) => (
              <span key={i} className={"raid-pip" + (i < hud.bars ? "" : " gone")} />
            ))}
            <small>× {hud.bars} หลอด</small>
          </div>
          <div className="raid-cells">
            {Array.from({ length: ORT_BAR_HP }, (_, i) => <span key={"h" + i} className={"raid-cell" + (i < hud.hp ? "" : " empty")} />)}
            {Array.from({ length: ORT_BAR_ARMOR }, (_, i) => <span key={"a" + i} className={"raid-cell armor" + (i < hud.armor ? "" : " empty")} />)}
          </div>
        </div>
      </div>

      <div className="raid-controls">
        <button type="button" aria-pressed={auto} onClick={toggleAuto}>เล่นอัตโนมัติ</button>
        {MOVES.map((m) => (
          <button key={m.act} type="button" className={m.hot ? "hot" : ""} onClick={() => press(m.act)}>{m.label}</button>
        ))}
      </div>
    </div>
  );
}
