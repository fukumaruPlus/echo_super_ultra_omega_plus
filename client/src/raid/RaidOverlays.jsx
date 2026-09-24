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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!v) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [v]);
  if (!state.mercury || state.mercury.result || !me || state.gameState === "GAMEOVER") return null;
  const vote = (yes) => { clickSound(); socket.emit("mercurySurrender", { yes }); };
  if (!v) {
    return (
      <div className="raid-surrender">
        <button type="button" className="raid-surrender-btn" onClick={() => vote(true)}>🏳️ โหวตยอมแพ้</button>
      </div>
    );
  }
  const left = Math.max(0, Math.ceil((v.endsAt - now) / 1000));
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
export function RaidDeckDrawer({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="raid-deck-drawer" data-open={open ? "true" : "false"}>
      <button type="button" className="raid-deck-tab" aria-expanded={open} onClick={() => { clickSound(); setOpen((o) => !o); }}>
        {open ? "ปิดกองกลาง ▶" : "◀ กองกลาง"}
      </button>
      <div className="raid-deck-body">
        {children}
        <small>แตะกองการ์ดเพื่อดูสมุดการ์ด</small>
      </div>
    </div>
  );
}
