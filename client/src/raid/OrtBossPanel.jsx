import { useEffect, useRef } from "react";
import { socket } from "../socket";
import { clickSound } from "../audio";
import { createOrtStage, ORT_BAR_HP, ORT_BAR_ARMOR } from "./ortStage";
import "./raid-board.css";

// บอส ORT บนกระดานจริง (โหมด Type Mercury)
//  ตัวเลขทั้งหมด (หลอด/เลือด/เกราะ/พลังโจมตี) มาจาก server · canvas เป็นแค่ภาพ (demo: false)
//  ท่าทางถูกสั่งจาก event "ortFx" ของ server (ตี/คริติคอล/โดนตี/สวนกลับ/หลอดแตก/วิวัฒนาการ/ข้อมูลสูญหาย)
//
//  layer — จอคอมแยก ORT เป็น 2 ชั้น เพราะกรอบกระดานเป็นชั้นโปร่งใสที่คลุมทั้งจอและกินคลิกทุกอย่างที่อยู่ข้างหลัง
//   "canvas" = ภาพ ORT เต็มจอ วางไว้ "ก่อน" กรอบกระดาน (เป็นฉากหลัง ไม่รับคลิก)
//   "ui"     = แถบข้อมูล + พื้นที่คลิกโจมตี วางไว้ "ใน" กรอบกระดาน (อยู่ชั้นเดียวกับที่นั่ง จึงกดได้)
//   "full"   = กรอบเดียวครบทุกอย่าง (หน้าจอมือถือ)
// statusNode: ป้ายสถานะของบอส (Game.jsx ส่ง <StatusChips> มาให้ — ชื่อสถานะภาษาไทยอยู่ที่นั่น)
export default function OrtBossPanel({ boss, phase, targetable, onAttack, onInspect, lowQ, compact = false, layer = "full", hostRef, statusNode }) {
  const withCanvas = layer !== "ui";
  const withUi = layer !== "canvas";
  const canvasRef = useRef(null);
  const stageRef = useRef(null);

  useEffect(() => {
    if (!withCanvas) return undefined;
    const st = createOrtStage(canvasRef.current, { lowQ, demo: false });
    stageRef.current = st;
    const onFx = ({ kind }) => stageRef.current?.play(kind);
    socket.on("ortFx", onFx);
    return () => { socket.off("ortFx", onFx); st.destroy(); stageRef.current = null; };
    // lowQ เปลี่ยนระหว่างเกม -> setLowQ ด้านล่าง ไม่สร้างเวทีใหม่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withCanvas]);
  useEffect(() => { stageRef.current?.setLowQ(lowQ); }, [lowQ]);

  if (!boss) return null;
  const info = boss.ort || { bars: 1, atk: 1, atkMax: 3 };
  const hp = boss.hp ?? 0;
  const armor = boss.armor ?? 0;
  const pips = Math.max(info.bars, 5);
  const revealed = phase === "SUMMARY" || phase === "ATTACK" || phase === "ATTACKING";

  const click = (e) => {
    e?.stopPropagation();
    clickSound();
    if (targetable) onAttack?.(boss.id);
    else onInspect?.(boss.id);
  };
  const keyClick = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); click(e); } };

  if (layer === "canvas") {
    return (
      <div className={`ort-backdrop ${targetable ? "ort-backdrop-target" : ""} ${boss.alive ? "" : "ort-dead"}`} aria-hidden="true">
        <canvas ref={canvasRef} className="ort-panel-canvas" />
      </div>
    );
  }

  const hud = (
    <div className="ort-panel-hud" onClick={layer === "ui" ? click : undefined} role={layer === "ui" ? "button" : undefined}
      tabIndex={layer === "ui" ? 0 : undefined} onKeyDown={layer === "ui" ? keyClick : undefined}
      title={targetable ? "โจมตี ORT" : "ดูสถานะ ORT"}>
      <div className="raid-hud-top">
        <span className="raid-boss">ORT</span>
        <span className="raid-tag">มหันตภัย</span>
        <span className="raid-atk">พลังโจมตี <b>{info.atk}</b>/{info.atkMax}</span>
      </div>
      <div className="raid-pips">
        {Array.from({ length: pips }, (_, i) => (
          <span key={i} className={"raid-pip" + (i < info.bars ? "" : " gone")} />
        ))}
        <small>× {info.bars} หลอด</small>
      </div>
      <div className="raid-cells">
        {Array.from({ length: ORT_BAR_HP }, (_, i) => <span key={"h" + i} className={"raid-cell" + (i < hp ? "" : " empty")} />)}
        {Array.from({ length: ORT_BAR_ARMOR }, (_, i) => <span key={"a" + i} className={"raid-cell armor" + (i < armor ? "" : " empty")} />)}
      </div>
      {statusNode && <div className="ort-panel-status">{statusNode}</div>}
    </div>
  );
  const foot = (
    <div className="ort-panel-foot">
      <span>ไพ่ {boss.cardCount ?? 0} ใบ</span>
      {revealed && boss.score !== null && boss.score !== undefined && (
        <b className={boss.busted ? "ort-bust" : ""}>{boss.busted ? "แตก!" : `${boss.score} แต้ม`}</b>
      )}
      {boss.isWinner && phase === "SUMMARY" && <b className="ort-win">ชนะรอบนี้</b>}
    </div>
  );

  if (layer === "ui") {
    // ชั้นนี้ไม่รับคลิกเอง (pointer-events: none) — รับเฉพาะแถบข้อมูล และพื้นที่ตัว ORT ตอนเป็นเป้าโจมตีได้
    //  พื้นที่คลิกครอบช่วงบนของตัว ORT (เหนือแถวเพื่อนร่วมทีม) ไม่ทับที่นั่งหรือแผงของเรา
    return (
      <div className={`ort-ui ${targetable ? "ort-ui-target" : ""}`}>
        {hud}
        {foot}
        {targetable && (
          <button type="button" ref={hostRef} className="ort-hitzone" onClick={click} aria-label="โจมตี ORT">
            <span className="ort-target-badge">🎯 โจมตี ORT</span>
          </button>
        )}
        {!targetable && <span ref={hostRef} className="ort-hitzone-anchor" aria-hidden="true" />}
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={`ort-panel ${compact ? "ort-panel-compact" : ""} ${targetable ? "ort-targetable" : ""} ${boss.alive ? "" : "ort-dead"}`}
      onClick={click}
      role="button"
      tabIndex={0}
      onKeyDown={keyClick}
      title={targetable ? "โจมตี ORT" : "แตะเพื่อดูสถานะ ORT"}
    >
      {withCanvas && <canvas ref={canvasRef} className="ort-panel-canvas" aria-hidden="true" />}
      {withUi && hud}
      {withUi && foot}
      {targetable && <span className="ort-target-badge">🎯 โจมตี ORT</span>}
    </div>
  );
}
