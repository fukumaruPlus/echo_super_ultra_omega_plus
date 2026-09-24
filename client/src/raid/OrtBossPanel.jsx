import { useEffect, useRef } from "react";
import { socket } from "../socket";
import { clickSound } from "../audio";
import { createOrtStage, ORT_BAR_HP, ORT_BAR_ARMOR } from "./ortStage";
import "./raid.css";
import "./raid-board.css";

// บอส ORT บนกระดานจริง (โหมด Type Mercury) — ตัวใหญ่ฝั่งตรงข้ามผู้เล่นทุกคน
//  ตัวเลขทั้งหมด (หลอด/เลือด/เกราะ/พลังโจมตี) มาจาก server · canvas เป็นแค่ภาพ (demo: false)
//  ท่าทางถูกสั่งจาก event "ortFx" ของ server (ตี/คริติคอล/โดนตี/สวนกลับ/หลอดแตก/วิวัฒนาการ/ข้อมูลสูญหาย)
// statusNode: ป้ายสถานะของบอส (Game.jsx ส่ง <StatusChips> มาให้ — ชื่อสถานะภาษาไทยอยู่ที่นั่น)
export default function OrtBossPanel({ boss, phase, targetable, onAttack, onInspect, lowQ, compact = false, hostRef, statusNode }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);

  useEffect(() => {
    const st = createOrtStage(canvasRef.current, { lowQ, demo: false });
    stageRef.current = st;
    const onFx = ({ kind }) => stageRef.current?.play(kind);
    socket.on("ortFx", onFx);
    return () => { socket.off("ortFx", onFx); st.destroy(); stageRef.current = null; };
    // lowQ เปลี่ยนระหว่างเกม -> setLowQ ด้านล่าง ไม่สร้างเวทีใหม่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { stageRef.current?.setLowQ(lowQ); }, [lowQ]);

  if (!boss) return null;
  const info = boss.ort || { bars: 1, atk: 1, atkMax: 3 };
  const hp = boss.hp ?? 0;
  const armor = boss.armor ?? 0;
  const pips = Math.max(info.bars, 5);
  const revealed = phase === "SUMMARY" || phase === "ATTACK" || phase === "ATTACKING";

  const click = () => {
    clickSound();
    if (targetable) onAttack?.(boss.id);
    else onInspect?.(boss.id);
  };

  return (
    <div
      ref={hostRef}
      className={`ort-panel ${compact ? "ort-panel-compact" : ""} ${targetable ? "ort-targetable" : ""} ${boss.alive ? "" : "ort-dead"}`}
      onClick={click}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") click(); }}
      title={targetable ? "โจมตี ORT" : "แตะเพื่อดูสถานะ ORT"}
    >
      <canvas ref={canvasRef} className="ort-panel-canvas" aria-hidden="true" />
      <div className="ort-panel-hud">
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
      <div className="ort-panel-foot">
        <span>ไพ่ {boss.cardCount ?? 0} ใบ</span>
        {revealed && boss.score !== null && boss.score !== undefined && (
          <b className={boss.busted ? "ort-bust" : ""}>{boss.busted ? "แตก!" : `${boss.score} แต้ม`}</b>
        )}
        {boss.isWinner && phase === "SUMMARY" && <b className="ort-win">ชนะรอบนี้</b>}
      </div>
      {targetable && <span className="ort-target-badge">🎯 โจมตี ORT</span>}
    </div>
  );
}
