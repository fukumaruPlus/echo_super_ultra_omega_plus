import { useMemo, useState } from "react";
import { clickSound } from "../audio";
import { FALLBACK } from "../data/avatars";
import { POSITION_COLORS } from "../data/positions";

const PURPLE = "linear-gradient(135deg,#9b4f96,#7d3a78)";
const P_DISPLAY = "var(--font-p-display)";

// ---------- กลุ่มความยากในการเล่น (แบ่งหน้าเลือกตัวละคร) ----------
//  order = ลำดับการแสดงในกลุ่ม — ตัวที่ไม่อยู่ในลิสต์จะต่อท้ายตามลำดับ roster
const DIFFICULTY_GROUPS = [
  { key: "easy", label: "ง่าย", color: "#2E9E4B", order: ["banagher", "hikaru", "kuwagata", "mageslayer", "ignis"] },
  { key: "medium", label: "กลาง", color: "#E5B33B", order: ["eva13", "temari", "shrade_elan", "riddhe", "miyako", "bat_ben", "escanor", "hisakawa_sister", "ippo", "arjuna"] },
  { key: "hard", label: "ยาก", color: "#C0392B", order: ["oberon", "kotone", "bard", "shiki", "hakuno", "kai", "takumi", "the_supplicant"] },
  { key: "fun", label: "เอาฮา", color: "#9B4F96", order: ["gambler", "appleguy", "broadband_man", "dan"] },
  { key: "extreme", label: "ยากสุดขีด", color: "#111827", order: ["satoru"] },
  { key: "impossible", label: "ทักษิณ จะโปรหาบิดาท่านหรือ?", color: "#450a0a", order: ["tohno", "nanaya", "princess_shiki"] },
  { key: "special", label: "พิเศษ", color: "#0e7490", order: ["ultraman_trigger", "yuuki", "yui", "shido"] },
];
// ตัวละครในกลุ่มความยากนั้น เรียงตาม order ที่กำหนด
function charsInGroup(roster, g) {
  const idx = (c) => { const i = g.order.indexOf(c.id); return i < 0 ? 999 : i; };
  return roster.filter((c) => !c.hidden && (c.difficulty || "easy") === g.key).sort((a, b) => idx(a) - idx(b));
}

// รูปตัวละคร (เต็มกรอบ) — ใช้ img ถ้ามี ไม่งั้นอีโมจิสำรอง
function CharImage({ c, className, emojiSize = "3.5rem", rounded = "" }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`relative overflow-hidden ${rounded} ${className}`} style={{ background: PURPLE }}>
      {c.img && !broken ? (
        <img
          src={c.img}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center" style={{ fontSize: emojiSize }}>
          {FALLBACK[c.avatar] || "🙂"}
        </span>
      )}
    </div>
  );
}

// ช่องสกิล 1 อัน — แสดงข้อมูลเต็ม (ชื่อ + คำอธิบาย + แต้มที่ใช้)
// คำอธิบายยาวเกินเพดาน (max-h) จะเลื่อนขึ้นลงดูในช่องตัวเองได้ ไม่ดันช่องอื่นจนอัดกัน
function SkillTile({ label, skill }) {
  return (
    <div className="p-panel rounded-lg px-4 py-3 shadow-lg text-white text-left flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <span className="text-base sm:text-lg font-bold uppercase tracking-wide" style={{ fontFamily: P_DISPLAY }}>
          {label}
        </span>
        <span
          className="text-xs shrink-0 px-2 py-0.5 font-bold rounded-full"
          style={{ background: "var(--color-p-accent)" }}
        >
          {skill && skill.cost != null ? `ใช้ ${skill.cost} แต้ม` : "ไม่เสีย"}
        </span>
      </div>
      {skill ? (
        <>
          <div
            className="font-bold mt-1.5 shrink-0"
            style={{ color: "var(--color-p-accent-bright)", fontFamily: P_DISPLAY }}
          >
            {skill.name}
          </div>
          <div className="p-scroll text-sm text-white/85 mt-0.5 leading-snug flex-1 min-h-0 max-h-36 overflow-y-auto pr-1">{skill.desc}</div>
        </>
      ) : (
        <div className="text-sm text-white/50 mt-1">—</div>
      )}
    </div>
  );
}

export default function CharacterSelect({ roster, position, name, takenChars = [], onConfirm, onBack }) {
  const [picked, setPicked] = useState(null);
  const [tab, setTab] = useState("all"); // แท็บกรองความยาก: "all" | difficulty key
  // ชิกิ (patch 2.0.6): เลือกท่าไม้ตายที่จะใช้ได้ — "deatheye" (ฉันมองเห็นมันแล้ว) | "wither" (ความตายที่โรยรา)
  const [shikiUlt, setShikiUlt] = useState("deatheye");
  const color = POSITION_COLORS[position] || "#9B4F96";
  const sel = roster.find((c) => c.id === picked);

  const grouped = useMemo(
    () => DIFFICULTY_GROUPS.map((g) => ({ ...g, chars: charsInGroup(roster, g) })).filter((g) => g.chars.length > 0),
    [roster]
  );
  const orderedRoster = useMemo(
    () => [
      ...grouped.flatMap((g) => g.chars),
      ...roster.filter((c) => !DIFFICULTY_GROUPS.some((g) => (c.difficulty || "easy") === g.key)),
    ],
    [grouped, roster]
  );
  const visibleRoster = tab === "all" ? orderedRoster : orderedRoster.filter((c) => (c.difficulty || "easy") === tab);
  const selGroup = sel ? DIFFICULTY_GROUPS.find((g) => g.key === (sel.difficulty || "easy")) : null;

  // ตัวละคร unique (คอนเนอร์ RK800): เลือกได้แค่ 1 คนต่อเกม — มีคนจองแล้วก็กดไม่ได้
  const isTaken = (c) => !!c && !!c.unique && takenChars.includes(c.id);
  const pick = (id) => { clickSound(); setPicked(id); };
  const confirm = () => { clickSound(); if (picked && !sel?.locked && !isTaken(sel)) onConfirm(picked, picked === "shiki" ? { shikiUlt } : undefined); };
  const back = () => { clickSound(); onBack(); };

  return (
    <div className="p-bg relative h-screen flex flex-col overflow-hidden">
      {/* ---------- header สแลชม่วง (auto-height เพื่อไม่ให้เนื้อหาล้นกล่อง) ---------- */}
      <div className="p-header-bar relative z-20 shrink-0">
        <div className="relative flex items-center flex-wrap px-5 py-3 gap-3 sm:gap-4">
          <span className="p-logo-wrap shrink-0">
            <span className="p-logo-glow" />
            <img src="/image/logo_current.webp" alt="ECHO" className="p-logo-img h-11 sm:h-14 w-auto" />
          </span>
          <h2
            className="flex-1 text-center text-base sm:text-xl font-bold text-white uppercase tracking-wide min-w-[8rem]"
            style={{ fontFamily: P_DISPLAY }}
          >
            เลือกตัวละคร
          </h2>
          <div className="flex items-center gap-3 shrink-0 pr-14 sm:pr-16">
            <span className="text-white font-bold text-sm sm:text-lg max-w-[9rem] truncate" style={{ fontFamily: P_DISPLAY }}>
              {name || "ชื่อผู้เล่น"}
            </span>
            <span
              className="w-10 h-10 sm:w-12 sm:h-12 grid place-items-center text-white text-lg sm:text-xl font-black shadow-lg border-2 border-white/70 rounded-md shrink-0"
              style={{ background: color, fontFamily: P_DISPLAY }}
            >
              P{position}
            </span>
          </div>
        </div>
      </div>

      {/* ---------- แท็บกรองความยาก ---------- */}
      {roster.length > 0 && (
        <div className="relative z-10 flex gap-5 sm:gap-7 px-5 sm:px-8 py-3 overflow-x-auto shrink-0 border-b border-white/10 bg-black/25">
          <button
            className="p-tab shrink-0 text-sm sm:text-base text-white/80"
            data-active={tab === "all"}
            onClick={() => { clickSound(); setTab("all"); }}
          >
            ทั้งหมด
          </button>
          {grouped.map((g) => (
            <button
              key={g.key}
              className="p-tab shrink-0 text-sm sm:text-base text-white/80 whitespace-nowrap"
              data-active={tab === g.key}
              onClick={() => { clickSound(); setTab(g.key); }}
              style={{ "--tab-accent": g.color }}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {roster.length === 0 ? (
        <div className="relative z-10 flex-1 grid place-items-center opacity-70">กำลังโหลดตัวละคร...</div>
      ) : (
        /* ================= มุมมองแบบแยกจอถาวร: ซ้าย = รายชื่อ / ขวา = รายละเอียด ================= */
        <div className="relative z-10 flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* ---------- ซ้าย: กริดตัวละคร (เลื่อนได้อิสระ) ---------- */}
          <div className="p-scroll w-full lg:w-[46%] xl:w-[40%] max-h-[38vh] lg:max-h-none lg:shrink-0 overflow-y-auto overscroll-contain p-4 sm:p-5 lg:border-r border-white/10">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-3 sm:gap-4">
              {visibleRoster.map((c, i) => {
                const g = DIFFICULTY_GROUPS.find((gr) => gr.key === (c.difficulty || "easy"));
                const active = c.id === picked;
                const taken = isTaken(c);
                return (
                  <button
                    key={c.id}
                    onClick={() => { if (!taken) pick(c.id); }}
                    disabled={taken}
                    className={`p-rise p-scan-hover relative transition ${taken ? "opacity-40 cursor-not-allowed" : "hover:-translate-y-1"}`}
                    style={{ animationDelay: `${Math.min(i, 14) * 0.03}s` }}
                    title={c.locked ? "ยังไม่ปลดล็อก" : taken ? `${c.name} — มีผู้เล่นอื่นเลือกไปแล้ว (เลือกได้ 1 คนต่อเกม)` : c.name}
                  >
                    <div
                      className="relative aspect-square border-2 rounded-md overflow-hidden"
                      style={{ borderColor: active ? "var(--color-p-accent-bright)" : "rgba(255,255,255,.12)", boxShadow: active ? "0 0 0 2px rgba(199,116,194,.35), 0 10px 24px -8px rgba(199,116,194,.6)" : undefined }}
                    >
                      <CharImage c={c} className="w-full h-full" rounded="" emojiSize="2.6rem" />
                      <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: g?.color || "#9B4F96" }} />
                      {taken && (
                        <div className="absolute inset-0 grid place-items-center bg-black/60 text-[10px] font-black text-center leading-tight px-1">
                          ถูกเลือกแล้ว
                        </div>
                      )}
                    </div>
                    <div className="mt-1 font-bold text-xs sm:text-sm truncate">{c.name}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------- ขวา: แผงรายละเอียด (คงที่ ไม่ต้องสลับหน้า) ---------- */}
          <div className="p-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 pb-32">
            {!sel ? (
              <div className="p-rise h-full min-h-[40vh] flex flex-col items-center justify-center text-center opacity-60 gap-3">
                <div className="text-5xl">🎴</div>
                <div style={{ fontFamily: P_DISPLAY }}>เลือกตัวละครจากรายชื่อด้านซ้ายเพื่อดูรายละเอียด</div>
              </div>
            ) : (
              <div key={sel.id} className="p-rise flex flex-col md:flex-row gap-4 sm:gap-5">
                {/* รูปตัวใหญ่ */}
                <div className="relative shrink-0 mx-auto md:mx-0">
                  <div
                    className="absolute -inset-1.5 -z-10"
                    style={{ background: "linear-gradient(140deg,var(--color-p-accent),var(--color-p-accent-deep))", clipPath: "polygon(6% 0,100% 4%,94% 100%,0 96%)" }}
                  />
                  <CharImage
                    c={sel}
                    className="w-40 h-52 sm:w-48 sm:h-64 -rotate-2 shadow-2xl border-2 border-black/60"
                    rounded=""
                    emojiSize="4.5rem"
                  />
                </div>

                {/* แผงสกิล */}
                <div className="p-panel flex-1 min-w-0 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
                  <div
                    className="relative bg-black/50 border-l-4 px-4 py-2.5 flex items-center flex-wrap gap-3"
                    style={{ borderColor: "var(--color-p-accent)" }}
                  >
                    <span className="text-xl sm:text-2xl font-black text-white" style={{ fontFamily: P_DISPLAY }}>{sel.name}</span>
                    {selGroup && (
                      <span
                        className="p-chip text-xs sm:text-sm px-3 py-1 text-white whitespace-nowrap border border-black/40 rounded-full"
                        style={{ background: selGroup.color }}
                      >
                        <span>ความยาก · {selGroup.label}</span>
                      </span>
                    )}
                  </div>
                  {/* auto-rows-fr = ทุกช่องสูงเท่ากัน ช่องที่คำอธิบายยาวจะเลื่อนดูในตัวเอง */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3">
                    <SkillTile label="สกิลติดตัว" skill={sel.passive} />
                    {/* บานาจ ลิงก์ (patch 2.1.2): สกิลติดตัว 2 ฉันไม่อยากให้เราต้องมาสู้กัน */}
                    {sel.id === "banagher" && sel.passive2 && <SkillTile label="สกิลติดตัว 2" skill={sel.passive2} />}
                    {sel.id === "hisakawa_sister" && sel.passive2 && <SkillTile label="สกิลติดตัว 2" skill={sel.passive2} />}
                    {/* นานายะ ชิกิ (patch 2.1.9): สกิลติดตัว 2 หัวใจฆาตกร / สกิลติดตัว 3 พักผ่อนสักครู่ */}
                    {sel.id === "nanaya" && sel.passive2 && <SkillTile label="สกิลติดตัว 2" skill={sel.passive2} />}
                    {sel.id === "nanaya" && sel.passive3 && <SkillTile label="สกิลติดตัว 3" skill={sel.passive3} />}
                    {/* คอนเนอร์ RK800 (patch 2.7): สกิลติดตัว 2-4 จับกุมขั้นเด็ดขาด / ปัญญาประดิษฐ์ / การป้องกันตัว */}
                    {sel.id === "conner" && sel.passive2 && <SkillTile label="สกิลติดตัว 2" skill={sel.passive2} />}
                    {sel.id === "conner" && sel.passive3 && <SkillTile label="สกิลติดตัว 3" skill={sel.passive3} />}
                    {sel.id === "conner" && sel.passive4 && <SkillTile label="สกิลติดตัว 4" skill={sel.passive4} />}
                    <SkillTile label={sel.basicNight ? "สกิลพื้นฐาน (กลางวัน)" : "สกิลพื้นฐาน"} skill={sel.basic} />
                    {sel.basicNight && <SkillTile label="สกิลพื้นฐาน (กลางคืน)" skill={sel.basicNight} />}
                    {sel.id === "hisakawa_sister" && sel.basic2 && <SkillTile label="สกิลพื้นฐาน 2 (เมื่อแฝดล้ม)" skill={sel.basic2} />}
                    {/* โอเบรอน/โคโตเนะ: สกิลสลับตามช่วงเวลากลางวัน/กลางคืน — โชว์ครบทุกท่า */}
                    <SkillTile label={sel.secondaryNight ? "สกิลรอง (กลางวัน)" : sel.id === "hakuno" ? "สกิลรอง (ร่างชาย)" : "สกิลรอง"} skill={sel.secondary} />
                    {sel.secondaryNight && <SkillTile label="สกิลรอง (กลางคืน)" skill={sel.secondaryNight} />}
                    {/* บานาจ ลิงก์ (patch 2.1.2): สกิลรอง 2 Beam Magnum — แทนที่สกิลรอง 1 ระหว่างร่าง NewType Paradise */}
                    {sel.id === "banagher" && sel.secondary2 && <SkillTile label="สกิลรอง 2 (ระหว่างร่าง Paradise)" skill={sel.secondary2} />}
                    {sel.id === "hakuno" && sel.secondary2 && <SkillTile label="สกิลรอง (ร่างหญิง)" skill={sel.secondary2} />}
                    {sel.id === "hisakawa_sister" && sel.secondary2 && <SkillTile label="สกิลรอง (ฮายาเตะ)" skill={sel.secondary2} />}
                    {/* อควาเรียน: ไม่มีท่าไม้ตายกลาง — ใช้ 4 ท่าตามร่างด้านล่างแทน */}
                    {!sel.ultimateSolar && (
                      <SkillTile
                        label={sel.ultimateNight ? "ท่าไม้ตาย (กลางวัน)" : sel.id === "shiki" ? "ท่าไม้ตาย 1" : sel.id === "riddhe" ? "ท่าไม้ตาย 1 (เส้นทางเดี่ยว)" : "ท่าไม้ตาย"}
                        skill={sel.ultimate}
                      />
                    )}
                    {/* ริดดี้ (patch 2.0.9): ท่าไม้ตาย 2 — ใช้แทนท่า 1 ระหว่างเป็นพันธมิตรกับบานาจ */}
                    {sel.id === "riddhe" && sel.ultimate2 && <SkillTile label="ท่าไม้ตาย 2 (เส้นทางพันธมิตร)" skill={sel.ultimate2} />}
                    {/* บานาจ ลิงก์ (patch 2.1.2): ท่าไม้ตาย 2 — ใช้แทนท่า 1 ระหว่างร่าง Paradise ที่มีริดดี้เป็นพันธมิตร */}
                    {sel.id === "banagher" && sel.ultimate2 && <SkillTile label="ท่าไม้ตาย 2 (ระหว่างร่าง Paradise + พันธมิตรริดดี้)" skill={sel.ultimate2} />}
                    {sel.id === "hisakawa_sister" && sel.ultimate2 && <SkillTile label="ท่าไม้ตาย 2 (ฮายาเตะ)" skill={sel.ultimate2} />}
                    {sel.id === "hisakawa_sister" && sel.ultimate3 && <SkillTile label="ท่าไม้ตาย 3 (รวมพลัง)" skill={sel.ultimate3} />}
                    {/* ชิกิ (patch 2.0.6): ท่าไม้ตาย 2 ความตายที่โรยรา — เลือกใช้ได้ 1 ท่าต่อเกม */}
                    {sel.id === "shiki" && sel.ultimate2 && <SkillTile label="ท่าไม้ตาย 2" skill={sel.ultimate2} />}
                    {sel.id === "shiki" && sel.ultimate2 && (
                      <div className="col-span-1 sm:col-span-2 bg-black/40 border border-white/15 px-4 py-3 rounded-lg">
                        <div className="font-bold mb-2" style={{ color: "var(--color-p-accent-bright)" }}>👁️ เลือกท่าไม้ตายที่จะใช้ในเกมนี้ (เลือกได้ 1 ท่า)</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            onClick={() => { clickSound(); setShikiUlt("deatheye"); }}
                            className={`border-2 px-3 py-2 font-bold transition rounded-md ${
                              shikiUlt === "deatheye" ? "bg-[var(--color-p-accent)]/20" : "border-white/20 bg-white/5 hover:bg-white/10"
                            }`}
                            style={shikiUlt === "deatheye" ? { borderColor: "var(--color-p-accent)", color: "var(--color-p-accent-bright)" } : undefined}
                          >
                            ท่า 1 · ฉันมองเห็นมันแล้ว{shikiUlt === "deatheye" ? " ✓" : ""}
                          </button>
                          <button
                            onClick={() => { clickSound(); setShikiUlt("wither"); }}
                            className={`border-2 px-3 py-2 font-bold transition rounded-md ${
                              shikiUlt === "wither" ? "bg-[var(--color-p-accent)]/20" : "border-white/20 bg-white/5 hover:bg-white/10"
                            }`}
                            style={shikiUlt === "wither" ? { borderColor: "var(--color-p-accent)", color: "var(--color-p-accent-bright)" } : undefined}
                          >
                            ท่า 2 · ความตายที่โรยรา{shikiUlt === "wither" ? " ✓" : ""}
                          </button>
                        </div>
                        <div className="text-xs opacity-75 mt-2 leading-snug">
                          เลือกท่า 2: สกิลติดตัวจะมอบ "เส้นชีวิต" น้อยลงเหลือ 1 หน่วยต่อครั้ง (จาก 2) และให้ได้สูงสุด 3 หน่วย
                          — ท่าไม้ตาย 2 จะแจกเส้นชีวิตเพิ่มได้อีกสูงสุด 3 หน่วยต่อคน (รวมสูงสุด 6 = โอกาสสังหาร 60%)
                        </div>
                      </div>
                    )}
                    {sel.ultimateNight && <SkillTile label="ท่าไม้ตาย (กลางคืน)" skill={sel.ultimateNight} />}
                    {/* อควาเรียน: สกิลรอง "คืนร่าง" + ท่าไม้ตาย 4 แบบ (โซล่า/มาร์/ลูน่า/ปีกแห่งสุริยัน) */}
                    {sel.secondaryRevert && <SkillTile label="สกิลรอง (คืนร่าง)" skill={sel.secondaryRevert} />}
                    {sel.ultimateSolar && <SkillTile label="ท่าไม้ตาย (โซล่า)" skill={sel.ultimateSolar} />}
                    {sel.ultimateMars && <SkillTile label="ท่าไม้ตาย (มาร์)" skill={sel.ultimateMars} />}
                    {sel.ultimateLuna && <SkillTile label="ท่าไม้ตาย (ลูน่า)" skill={sel.ultimateLuna} />}
                    {sel.ultimateGodwing && <SkillTile label="ท่าไม้ตาย (ปีกแห่งสุริยัน)" skill={sel.ultimateGodwing} />}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- ปุ่มย้อนกลับ ลอย โปร่งแสง มุมซ้ายล่าง ---------- */}
      <button
        onClick={back}
        className="p-float-back fixed z-30 bottom-5 left-5 px-5 py-2.5 font-bold transition rounded-full text-white/90"
      >
        ← กลับ
      </button>

      {/* ตัวละครระบบ/บอสเปิดดูข้อมูลได้ แต่ไม่มีปุ่มยืนยันให้เลือกเล่น */}
      {!sel?.locked && <button
        onClick={confirm}
        disabled={!sel || sel.locked}
        className={`fixed bottom-0 right-0 w-56 h-24 sm:h-28 group z-20 transition-all duration-300 ${
          sel ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="p-slash-btn absolute inset-0 transition group-hover:brightness-110" />
        <span
          className="absolute bottom-5 sm:bottom-6 right-6 sm:right-7 text-xl sm:text-2xl font-black text-white uppercase italic"
          style={{ fontFamily: P_DISPLAY }}
        >
          ยืนยัน →
        </span>
      </button>}
    </div>
  );
}
