// ============================================================
//  S4 — หน้าเลือกสถานที่ · เมนูปลายทางแบบ Persona
//  ใช้ภาพจริง 5 ใบใน client/public/mooncell/ (ชื่อไฟล์ภาษาไทย)
//
//  ความลับที่ต้องรักษา: ไม่บอกว่าใครเลือกที่ไหน — บอกแค่ "เลือกแล้วกี่คน"
//  (สถานที่ที่คู่แข่งไป คือข้อมูลสืบสวนที่มีค่าที่สุดในโหมดนี้)
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { playSfx } from "../audio";
import { SC_PLACE, SC_PLACE_ORDER } from "./assets";
import { SeraphBackground, DayRail, MatrixSlots } from "./ui";

const PD = "var(--font-p-display)";

/** ผลของแต่ละสถานที่ + เงื่อนไขว่ากดได้ไหม — จุดเดียวที่ตัดสินเรื่องนี้ */
function placeState(key, me) {
  const { matrixHeld = 0, gold = 0, skillLevel = 1, hp = 3, armor = 2, skillCap = 4, cheapestItem = 3 } = me || {};
  switch (key) {
    case "room":
      return { status: "สุ่มของฟรี 1 ชิ้น", detail: "ได้ของราคาเกิน 3 เหรียญมา 1 ชิ้น — คนละคลังกับร้านค้า ไม่ทับซ้อนกัน" };
    case "church":
      return {
        status: `❤️${hp}  🛡️${armor}  ⚡${skillCap}/8`,
        detail: "เลือกเพิ่มความจุได้ 1 อย่าง: พลังชีวิต / เกราะ / แต้มสกิล — ครั้งละ 1 หน่วย",
        warn: skillCap < 6 ? `⚡ ความจุแต้มสกิลของเจ้าคือ ${skillCap} — ท่าไม้ตายต้องการ 6 ถึงจะร่ายได้` : null
      };
    case "park":
      return {
        status: `◆ Matrix ที่ถืออยู่ ${matrixHeld}`,
        detail: "ลงแต้ม Matrix ใส่เป้าหมาย — 1 เห็นจำนวนไพ่ · 2 รับดาเมจน้อยลง 1 · 3 เห็นแต้มตลอด (แต่เป้าหมายจะรู้ตัว)",
        disabled: matrixHeld <= 0,
        disabledText: "ไม่มีแต้มให้ลง"
      };
    case "library":
      return {
        status: skillLevel >= 6 ? "ระดับทักษะ 6 — สูงสุดแล้ว" : `ระดับทักษะ ${skillLevel} → ${skillLevel + 1}`,
        detail: skillLevel + 1 === 3 ? "ถึงระดับ 3 จะปลดล็อกสกิลรอง" : skillLevel + 1 === 6 ? "ถึงระดับ 6 จะปลดล็อกท่าไม้ตาย" : "เพิ่มระดับทักษะ 1 ระดับ (สูงสุด 6)",
        disabled: skillLevel >= 6,
        disabledText: "สูงสุดแล้ว"
      };
    case "store":
      return {
        status: `🪙 ${gold}`,
        detail: "ซื้อของจากร้านค้ามายาด้วยเหรียญที่มี",
        disabled: gold < cheapestItem,
        disabledText: "เหรียญไม่พอ"
      };
    default:
      return { status: "", detail: "" };
  }
}

export default function PlaceSelect({
  me = {},
  day = 1,
  night = false,
  seconds = 20,
  placedCount = 0,
  totalPlayers = 1,
  onPick
}) {
  const [hover, setHover] = useState("room");
  const [picked, setPicked] = useState(null);
  const [left, setLeft] = useState(seconds);

  const choose = (key, auto = false) => {
    const st = placeState(key, me);
    if (st.disabled || picked) return;
    setPicked(key);
    playSfx("sc_glitch");
    onPick && onPick(key, auto);
  };

  // นับถอยหลัง — หมดเวลาแล้วสุ่มให้ (ธรรมเนียมเดียวกับเฟส ATTACK ของเอนจินเดิม)
  useEffect(() => {
    if (picked) return undefined;
    if (left <= 0) {
      const auto = SC_PLACE_ORDER.filter((k) => !placeState(k, me).disabled);
      choose(auto[Math.floor(Math.random() * auto.length)] || "room", true);
      return undefined;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, picked]);

  const info = useMemo(() => placeState(hover, me), [hover, me]);
  const hoverPlace = SC_PLACE[hover];

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden">
      <SeraphBackground phase="place" night={night} grid="full" />

      {/* หัวจอ */}
      <div className="absolute top-0 inset-x-0 p-3 sm:p-4 flex items-start justify-between gap-3">
        <div>
          <div className="sc-sysline text-[11px] sm:text-xs opacity-80">{"> SELECT DESTINATION"}</div>
          <div className="text-2xl sm:text-4xl font-black italic text-white" style={{ fontFamily: PD }}>
            เลือกสถานที่
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <DayRail day={day} />
          {/* ไม่มีเวลาจำกัด — เฟสนี้ไปต่อเมื่อทุกคนเลือกครบเท่านั้น
              จึงบอกว่า "เหลืออีกกี่คน" แทนที่จะกดดันด้วยนาฬิกา */}
          <div className="text-right">
            <div className="sc-sysline text-[10px] opacity-70">รอผู้เล่น</div>
            <div className="text-2xl sm:text-3xl font-black leading-none" style={{ fontFamily: PD, color: "var(--color-sc-cyan)" }}>
              {Math.max(0, totalPlayers - placedCount)}
            </div>
          </div>
        </div>
      </div>

      {/* การ์ด 5 ใบเรียงทแยงเหลื่อมกัน + แผงคำอธิบายด้านขวา */}
      <div className="absolute inset-x-0 top-[20%] bottom-[16%] flex items-center justify-center gap-4 px-3 sm:px-8">
        <div className="flex items-center gap-1.5 sm:gap-3">
          {SC_PLACE_ORDER.map((key, i) => {
            const p = SC_PLACE[key];
            const st = placeState(key, me);
            const isPicked = picked === key;
            return (
              <button
                key={key}
                type="button"
                className="sc-place-card w-[17vw] max-w-[142px] min-w-[62px]"
                data-active={hover === key || isPicked}
                data-disabled={st.disabled || undefined}
                style={{
                  height: `${240 + (i % 2 ? 0 : 26)}px`,
                  animation: `pRise 420ms cubic-bezier(.2,.8,.2,1) ${i * 90}ms both`,
                  ...(isPicked ? { transform: "skewX(-8deg) scale(1.14)", zIndex: 5 } : null)
                }}
                onMouseEnter={() => { if (!st.disabled) { setHover(key); playSfx("sc_noti"); } }}
                onFocus={() => !st.disabled && setHover(key)}
                onClick={() => choose(key)}
              >
                <img src={p.img} alt="" className="sc-place-bg" />
                <span className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,7,12,.95) 8%, transparent 62%)", transform: "skewX(8deg)" }} />
                <span className="absolute bottom-0 inset-x-0 p-2 flex flex-col items-start gap-1" style={{ transform: "skewX(8deg)" }}>
                  <span className="text-lg leading-none">{p.icon}</span>
                  <span className="text-[11px] sm:text-sm font-black text-white leading-tight">{p.name}</span>
                  <span className="sc-sysline text-[9px] sm:text-[10px] leading-tight">
                    {st.disabled ? st.disabledText : st.status}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <aside className="hidden md:flex flex-col gap-3 w-64 shrink-0 p-panel p-4" style={{ animation: "pRise 420ms 500ms both" }}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{hoverPlace.icon}</span>
            <span className="text-xl font-black text-white" style={{ fontFamily: PD }}>{hoverPlace.name}</span>
          </div>
          <div className="h-px" style={{ background: "var(--color-sc-line)" }} />
          <p className="text-xs leading-relaxed text-white/80">{info.detail}</p>
          {info.warn && (
            <p className="text-[11px] leading-relaxed px-2 py-1.5" style={{ background: "rgba(229,179,59,.14)", borderLeft: "3px solid var(--color-echo-gold)", color: "#ffd977" }}>
              {info.warn}
            </p>
          )}
          <div className="mt-auto flex flex-col gap-1.5 text-[11px] text-white/70">
            <span className="flex items-center gap-2">◆ Matrix <MatrixSlots held={me.matrixHeld || 0} /></span>
            <span>🪙 {me.gold ?? 0} เหรียญ · 📘 ระดับ {me.skillLevel ?? 1} · ⚡ ความจุ {me.skillCap ?? 4}/8</span>
          </div>
        </aside>
      </div>

      {/* ล่างจอ: ใครเลือกแล้วบ้าง — เป็นจุด ไม่บอกว่าเลือกที่ไหน */}
      <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-2">
        {picked && (
          <div className="sc-sysline text-xs" style={{ animation: "scBannerIn 300ms both" }}>
            {`> DESTINATION LOCKED : ${SC_PLACE[picked].name} — รอผู้เล่นคนอื่น`}
          </div>
        )}
        <div className="flex items-center gap-2">
          {Array.from({ length: totalPlayers }, (_, i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rounded-full border"
              style={{
                borderColor: "var(--color-sc-cyan)",
                background: i < placedCount ? "var(--color-sc-cyan)" : "transparent",
                animation: i < placedCount ? "none" : "scUnknownFlicker 1.6s steps(1) infinite"
              }}
            />
          ))}
          <span className="sc-sysline text-[10px] ml-1 opacity-70">{placedCount}/{totalPlayers}</span>
        </div>
      </div>
    </div>
  );
}
