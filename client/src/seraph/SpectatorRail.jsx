// ============================================================
//  แถบผู้ชม (วันที่ 5) — คนที่ไม่ได้ลงสนามในคู่นี้
//
//  โจทย์: "ยังเห็นอยู่ แต่ต้องรู้ทันทีว่าไม่ใช่ผู้เล่นในสนาม และเล็งไม่ได้"
//  วิธี: ย้ายออกจากที่นั่งปกติของกระดานมาไว้ที่ขอบจอ แล้วสื่อสารด้วย 4 ชั้นพร้อมกัน
//    1) ตำแหน่ง  — อยู่นอกสนาม (แถบขอบขวา) ไม่ใช่ที่นั่งผู้เล่น
//    2) รูปทรง   — การ์ดเล็ก ตัดมุม ขอบประ (การ์ดในสนามเป็นสี่เหลี่ยมเต็ม ขอบทึบ)
//    3) สี        — ขาวดำ + ลายทางเฉียง = พื้นที่นอกสนาม
//    4) สัญลักษณ์ — กากบาททแยงพาดทั้งใบ + ป้าย "เล็งไม่ได้"
//  ฝั่ง server กันซ้ำอีกชั้นที่ doAttack() (เล็งคนนอกคู่ดวลไม่ได้จริง ๆ ไม่ใช่แค่ UI)
// ============================================================

export default function SpectatorRail({ players, duelPair, youId }) {
  const specs = players.filter(
    (p) => !p.isBoss && p.id !== duelPair?.a && p.id !== duelPair?.b
  );
  if (!specs.length) return null;

  return (
    <div className="sc-spec-rail" aria-label="ผู้ชม">
      <div className="sc-spec-rail-title">
        ผู้ชม
        <br />
        {specs.filter((p) => !p.scEliminated).length}
      </div>

      {specs.map((p) => {
        const out = p.scEliminated;
        const isMe = p.id === youId;
        return (
          <div key={p.id} className="flex flex-col items-center gap-0.5">
            <div className="sc-spec-card" data-out={out || undefined} style={{ height: 64 }}>
              {p.img && !p.scHidden ? (
                <img src={p.img} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <span className="absolute inset-0 grid place-items-center text-lg opacity-40">👤</span>
              )}
              <span
                className="absolute inset-x-0 bottom-0 text-[8px] font-bold text-white text-center leading-tight px-0.5 truncate"
                style={{ background: "rgba(0,0,0,.8)", zIndex: 2 }}
              >
                {p.name}
              </span>
              {isMe && (
                <span
                  className="absolute top-0 left-0 text-[7px] font-black px-1 leading-tight"
                  style={{ background: "var(--color-p-accent)", color: "#fff", zIndex: 2 }}
                >
                  เจ้า
                </span>
              )}
            </div>
            <span
              className="sc-spec-badge"
              style={{ color: out ? "var(--color-sc-red)" : "rgba(255,255,255,.55)" }}
            >
              {out ? "ถูกลบ" : "เล็งไม่ได้"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
