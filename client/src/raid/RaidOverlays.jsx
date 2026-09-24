import { useEffect, useState } from "react";
import { socket } from "../socket";
import { clickSound } from "../audio";
import CharacterSelect from "../screens/CharacterSelect";
import "./raid-board.css";

// ============================================================
//  Type Mercury — ส่วนประกอบบนกระดานที่ไม่ใช่ตัวบอส
// ============================================================

// เลือกตัวละครใหม่หลังตาย — ใช้หน้าเลือกตัวละครเดิมทั้งหน้า
//  ตัวที่ตายไปแล้วขึ้น "ข้อมูลสูญหาย" · ORT ดูได้แต่เลือกไม่ได้ · ไม่มีเวลาจำกัด
//  ซ่อนหน้าเพื่อดูสนามได้ (กดกลับมาเลือกต่อจากแถบด้านบน)
export function RaidRespawn({ state, me, roster }) {
  const m = state.mercury;
  const [hidden, setHidden] = useState(false);
  // ลงสนามแล้ว -> ครั้งหน้าที่ตายต้องเห็นหน้าเลือกตัวเต็มจออีก (ไม่ค้างโหมด "ดูสนาม" จากการตายครั้งก่อน)
  const alive = !!me?.alive;
  useEffect(() => { if (alive) setHidden(false); }, [alive]);
  if (!m || m.result || !me || me.alive || !roster?.length) return null;

  const lost = m.lost || [];
  const pickable = new Set(m.pickable || []);
  const banner = m.myPick
    ? `เลือก ${roster.find((c) => c.id === m.myPick)?.name || m.myPick} แล้ว — จะลงสนามต้นเทิร์นถัดไป`
    : m.hold
      ? "ทีมตายหมดแล้ว — เกมหยุดรอจนกว่าจะมีคนเลือกตัวลงสนาม"
      : "ตัวละครของคุณถูกสังหาร — เลือกตัวใหม่เพื่อกลับเข้าสนาม";

  if (hidden || m.myPick) {
    return (
      <div className="raid-respawn-banner" role="status">
        <span>{banner}</span>
        <button type="button" onClick={() => { clickSound(); setHidden(false); if (m.myPick) socket.emit("mercuryPick", { characterId: "" }); }}>
          {m.myPick ? "เปลี่ยนตัว" : "เลือกตัวละคร"}
        </button>
      </div>
    );
  }
  return (
    <div className="raid-respawn">
      <CharacterSelect
        roster={roster}
        position={me.position}
        color={me.color}
        name={me.name}
        lostChars={lost}
        blockedChars={roster.filter((c) => !pickable.has(c.id) && !lost.includes(c.id) && !c.botOnly).map((c) => c.id)}
        confirmLabel="ลงสนาม"
        backLabel="ดูสนาม"
        title={banner}
        onConfirm={(characterId, extra) => { clickSound(); socket.emit("mercuryPick", { characterId, ...(extra || {}) }); }}
        onBack={() => { clickSound(); setHidden(true); }}
      />
    </div>
  );
}

// โหวตยอมแพ้ — เสียงข้างมาก + นับถอยหลัง (คนที่ไม่กดไม่ถูกนับ)
export function RaidSurrender({ state, me }) {
  const v = state.mercury?.surrender;
  // server ส่ง "เหลือกี่มิลลิวินาที" — นับถอยหลังจากนาฬิกาเครื่องเราเอง (นาฬิกา server กับเครื่องผู้เล่นไม่ตรงกัน)
  const leftMs = v ? v.leftMs : null;
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (leftMs == null) return undefined;
    const end = Date.now() + leftMs;
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 250);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [leftMs]);
  if (!state.mercury || state.mercury.result || !me || state.gameState === "GAMEOVER") return null;
  const vote = (yes) => { clickSound(); socket.emit("mercurySurrender", { yes }); };
  if (!v) {
    return (
      <div className="raid-surrender">
        <button type="button" className="raid-surrender-btn" onClick={() => vote(true)}>🏳️ โหวตยอมแพ้</button>
      </div>
    );
  }
  return (
    <div className="raid-surrender">
      <div className="raid-surrender-vote" role="status">
        <div>โหวตยอมแพ้ · เหลือ <b>{left}</b> วิ</div>
        <div>ยอมแพ้ <b>{v.yes}</b> · สู้ต่อ <b>{v.no}</b> · จาก {v.total} คน</div>
        <div className="raid-surrender-row">
          <button type="button" data-on={v.mine === true ? "true" : "false"} onClick={() => vote(true)}>ยอมแพ้</button>
          <button type="button" data-on={v.mine === false ? "true" : "false"} onClick={() => vote(false)}>สู้ต่อ</button>
        </div>
      </div>
    </div>
  );
}

// กองการ์ดกลางแบบลิ้นชักทางขวา (โหมด Raid เว้นกลางจอไว้ให้ ORT) — กดแถบเพื่อเปิด/ปิด
// anchorRef: จุดที่การ์ดบิน "ออกจากกองกลาง" — ผูกไว้ที่แถบลิ้นชักซึ่งเห็นอยู่ตลอด
//  (ตัวกองการ์ดข้างในถูกเลื่อนออกนอกจอตอนลิ้นชักปิด การ์ดจะบินมาจากนอกจอ)
export function RaidDeckDrawer({ children, anchorRef }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="raid-deck-drawer" data-open={open ? "true" : "false"}>
      <button type="button" ref={anchorRef} className="raid-deck-tab" aria-expanded={open} onClick={() => { clickSound(); setOpen((o) => !o); }}>
        {open ? "ปิดกองกลาง ▶" : "◀ กองกลาง"}
      </button>
      <div className="raid-deck-body">
        {children}
        <small>แตะกองการ์ดเพื่อดูสมุดการ์ด</small>
      </div>
    </div>
  );
}
