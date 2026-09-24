import { useCallback, useMemo, useRef, useState } from "react";
import { clickSound } from "../audio";
import { FALLBACK } from "../data/avatars";
import { POSITION_COLORS } from "../data/positions";
import { AvScene, Medallion, SealButton, AvButton, Crest, Crystals } from "../components/avalon";

const LEVEL = 3;

const DIFFICULTY_GROUPS = [
  { key: "easy", label: "ง่าย", color: "#2E9E4B", order: ["hikaru", "mageslayer", "ignis", "daichi"] },
  { key: "medium", label: "กลาง", color: "#E5B33B", order: ["temari", "miyako", "bat_ben", "escanor", "hisakawa_sister", "ippo", "cayenne", "shotaro"] },
  { key: "hard", label: "ยาก", color: "#C0392B", order: ["kotone", "bard", "shiki", "kai", "takumi", "the_supplicant"] },
  { key: "fun", label: "เอาฮา", color: "#9B4F96", order: ["appleguy", "dan", "usagi"] },
  { key: "extreme", label: "ยากสุดขีด", color: "#111827", order: ["satoru"] },
  { key: "impossible", label: "ทักษิณ จะโปรหาบิดาท่านหรือ?", color: "#450a0a", order: ["tohno", "nanaya", "princess_shiki"] },
  { key: "special", label: "พิเศษ", color: "#0e7490", order: ["ultraman_trigger", "yui", "shido", "brian", "producer_lumi"] },
  // หมวดตามสังกัด ไม่ใช่ระดับความยาก — ไรเดอร์ทุกคนที่มี Clock Up (แกนร่วม characters/_zect.js)
  { key: "zect", label: "องค์กรZectz", color: "#3B5BA5", order: ["daisuke", "yaguruma", "kagami", "tsurugi"] },
  // มหันตภัย: บอส (บอตเท่านั้น) — ดูข้อมูลได้แต่เลือกเล่นไม่ได้
  { key: "calamity", label: "มหันตภัย", color: "#7f1d1d", order: ["ort"] },
];

function charsInGroup(roster, g) {
  const idx = (c) => { const i = g.order.indexOf(c.id); return i < 0 ? 999 : i; };
  return roster.filter((c) => !c.hidden && (c.difficulty || "easy") === g.key).sort((a, b) => idx(a) - idx(b));
}

function CharArt({ c, className = "", emojiSize = "3rem", style }) {
  const [broken, setBroken] = useState(false);
  if (c.img && !broken) {
    return <img src={c.img} alt="" loading="lazy" decoding="async" className={className} style={style} onError={() => setBroken(true)} />;
  }
  return (
    <span className={`grid place-items-center ${className}`} style={{ fontSize: emojiSize, background: "linear-gradient(150deg, var(--av-purple), var(--av-royal))", ...style }}>
      {FALLBACK[c.avatar] || "🙂"}
    </span>
  );
}

function SkillCard({ label, skill, i }) {
  if (!skill) return null;
  const drift = (i % 3) * 20;
  return (
    <div className="av-skill-card av-slide-r av-seq" style={{ "--i": i, marginLeft: drift }}>
      <div className="flex items-center justify-between gap-3">
        <span className="av-label" style={{ fontSize: "0.72rem", color: "var(--av-lilac)", letterSpacing: "0.1em" }}>{label}</span>
        <span className={`av-chip shrink-0 ${skill.cost != null ? "av-chip-gold" : ""}`}>
          {skill.cost != null ? `${skill.cost} แต้ม` : "ไม่เสียแต้ม"}
        </span>
      </div>
      <div className="av-heading text-lg mt-1" style={{ color: "var(--av-gold-lit)" }}>{skill.name}</div>
      <div className="text-sm mt-1 leading-snug" style={{ color: "rgba(239,230,245,.78)" }}>{skill.desc}</div>
    </div>
  );
}

// lostChars / blockedChars / confirmLabel / backLabel / title: ใช้ตอนเลือกตัวใหม่กลางโหมด Type Mercury
//  lostChars = ตัวที่ตายไปแล้วใน Raid ("ข้อมูลสูญหาย") · blockedChars = ตัวที่ใช้ไม่ได้ด้วยเหตุผลอื่น (เช่น unique ที่เพื่อนใช้อยู่)
export default function CharacterSelect({ roster, position, color: myColor, name, takenChars = [], lostChars = [], blockedChars = [], confirmLabel = "เรียกขาน", backLabel = "← กลับ", title, onConfirm, onBack }) {
  const [picked, setPicked] = useState(null);
  const [tab, setTab] = useState("all");
  const [shikiUlt, setShikiUlt] = useState("deatheye");
  const [dockOpen, setDockOpen] = useState(true);
  const ribbonRef = useRef(null);
  const closeTimer = useRef(null);

  const color = myColor || POSITION_COLORS[position] || "#9B4F96";
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

  const isTaken = (c) => !!c && !!c.unique && takenChars.includes(c.id);
  // เหตุผลที่เลือกตัวนี้ไม่ได้ (null = เลือกได้) — ตัวที่เลือกไม่ได้ยังกดดูข้อมูลได้ ยกเว้นตัว unique ที่ถูกจองไปแล้ว
  const blockReason = (c) => {
    if (!c) return null;
    if (c.botOnly) return "บอสเท่านั้น";
    if (lostChars.includes(c.id)) return "ข้อมูลสูญหาย";
    if (isTaken(c)) return "ถูกเลือกไปแล้ว";
    if (blockedChars.includes(c.id)) return "ใช้ไม่ได้";
    return null;
  };

  const pickChar = (id) => {
    setPicked(id);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setDockOpen(false), 520);
  };

  const toggleDock = () => {
    clickSound();
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDockOpen((v) => !v);
  };

  const onRibbonWheel = useCallback((e) => {
    const el = ribbonRef.current;
    if (!el) return;
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (!delta) return;
    el.scrollLeft += delta;
  }, []);

  const confirm = () => { if (picked && !sel?.locked && !blockReason(sel)) onConfirm(picked, picked === "shiki" ? { shikiUlt } : undefined); };

  const skills = [];
  if (sel) {
    const push = (label, s) => s && skills.push({ label, skill: s });
    push("สกิลติดตัว", sel.passive);
    if (sel.id === "hisakawa_sister") push("สกิลติดตัว 2", sel.passive2);
    if (sel.id === "nanaya") { push("สกิลติดตัว 2", sel.passive2); push("สกิลติดตัว 3", sel.passive3); }
    if (sel.id === "conner") { push("สกิลติดตัว 2", sel.passive2); push("สกิลติดตัว 3", sel.passive3); push("สกิลติดตัว 4", sel.passive4); }
    if (sel.id === "cayenne") push("สกิลติดตัว 2", sel.passive2);
    if (sel.id === "ort") { push("สกิลติดตัว 2", sel.passive2); push("สกิลติดตัว 3", sel.passive3); }
    push(sel.basicNight ? "สกิลพื้นฐาน (กลางวัน)" : "สกิลพื้นฐาน", sel.basic);
    if (sel.basicNight) push("สกิลพื้นฐาน (กลางคืน)", sel.basicNight);
    if (sel.id === "hisakawa_sister") push("สกิลพื้นฐาน 2 (เมื่อแฝดล้ม)", sel.basic2);
    push(sel.secondaryNight ? "สกิลรอง (กลางวัน)" : "สกิลรอง", sel.secondary);
    if (sel.secondaryNight) push("สกิลรอง (กลางคืน)", sel.secondaryNight);
    if (sel.id === "hisakawa_sister") push("สกิลรอง (ฮายาเตะ)", sel.secondary2);
    if (!sel.ultimateSolar) push(sel.ultimateNight ? "ท่าไม้ตาย (กลางวัน)" : sel.id === "shiki" ? "ท่าไม้ตาย 1" : "ท่าไม้ตาย", sel.ultimate);
    if (sel.id === "hisakawa_sister") { push("ท่าไม้ตาย 2 (ฮายาเตะ)", sel.ultimate2); push("ท่าไม้ตาย 3 (รวมพลัง)", sel.ultimate3); }
    if (sel.id === "shiki") push("ท่าไม้ตาย 2", sel.ultimate2);
    if (sel.ultimateNight) push("ท่าไม้ตาย (กลางคืน)", sel.ultimateNight);
    if (sel.secondaryRevert) push("สกิลรอง (คืนร่าง)", sel.secondaryRevert);
    if (sel.ultimateSolar) push("ท่าไม้ตาย (โซล่า)", sel.ultimateSolar);
    if (sel.ultimateMars) push("ท่าไม้ตาย (มาร์)", sel.ultimateMars);
    if (sel.ultimateLuna) push("ท่าไม้ตาย (ลูน่า)", sel.ultimateLuna);
    if (sel.ultimateGodwing) push("ท่าไม้ตาย (ปีกแห่งสุริยัน)", sel.ultimateGodwing);
  }

  const bottomGap = dockOpen ? "15rem" : "5.5rem";

  return (
    <AvScene level={LEVEL} seed={37} className="h-screen w-screen overflow-hidden">
      {sel && (
        <div key={sel.id} className="av-showcase-portrait av-slide-l">
          <CharArt c={sel} className="w-full h-full object-cover" emojiSize="12rem" style={{ objectPosition: "50% 16%" }} />
        </div>
      )}

      <div className="av-content absolute top-6 left-9 flex items-center gap-4 z-30">
        <span className="av-logo-seal">
          <img src="/image/logo_current.webp" alt="ECHO" className="h-7 w-auto" />
        </span>
        <div className="av-label">{title || "เลือกตัวละคร"}</div>
        <AvButton variant="ghost" className="py-1.5 px-5 text-sm ml-2" onClick={onBack}>
          {backLabel}
        </AvButton>
      </div>

      <div className="av-content absolute top-6 right-12 flex items-center gap-4 z-30 pr-16">
        <span className="av-heading text-lg text-white av-ink max-w-[12rem] truncate">{name || "ผู้เล่น"}</span>
        <Crest color={color} className="w-12 h-12 text-base">P{position}</Crest>
      </div>

      <div className="av-content absolute right-5 top-1/2 -translate-y-1/2 z-30 flex flex-col items-end gap-1">
        <button className="av-rail" data-active={tab === "all"} onClick={() => { clickSound(); setTab("all"); }}>
          ทั้งหมด
        </button>
        {grouped.map((g) => (
          <button
            key={g.key}
            className="av-rail"
            data-active={tab === g.key}
            onClick={() => { clickSound(); setTab(g.key); }}
            style={{ "--av-tab": g.color, maxWidth: "13rem", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {sel && (
        <div key={`n${sel.id}`} className="av-showcase-name" style={{ bottom: `calc(${bottomGap} + 1rem)` }}>
          <div className="av-slide-l">
            <div className="flex items-center gap-3 mb-2">
              {selGroup && (
                <span className="av-chip" style={{ background: selGroup.color, borderColor: "rgba(255,255,255,.35)", color: "#fff" }}>
                  {selGroup.label}
                </span>
              )}
              {blockReason(sel) && <span className="av-chip av-chip-gold">{blockReason(sel)}</span>}
            </div>
            <div className="av-title av-title-thai text-[4rem] av-ink">{sel.name}</div>
            <span className="av-crack block mt-1" style={{ position: "relative", width: "24vw", height: 2 }} />
          </div>
        </div>
      )}

      {sel && (
        <div
          key={`s${sel.id}`}
          className="av-content av-scroll absolute overflow-y-auto overscroll-contain pr-3 z-10"
          style={{ right: "17vw", top: "12vh", bottom: bottomGap, width: "30vw", transition: "bottom .55s cubic-bezier(.16,1,.3,1)" }}
        >
          <div className="flex flex-col gap-3">
            {skills.map((s, i) => <SkillCard key={i} label={s.label} skill={s.skill} i={i} />)}

            {sel.id === "shiki" && sel.ultimate2 && (
              <div className="av-skill-card av-slide-r">
                <div className="av-label mb-3">เลือกท่าไม้ตายที่จะใช้ในเกมนี้</div>
                <div className="flex flex-col gap-2">
                  {[
                    { k: "deatheye", t: "ท่า 1 · ฉันมองเห็นมันแล้ว" },
                    { k: "wither", t: "ท่า 2 · ความตายที่โรยรา" },
                  ].map((o) => (
                    <AvButton
                      key={o.k}
                      variant="ghost"
                      className="text-sm py-2 justify-start"
                      data-on={shikiUlt === o.k ? "true" : "false"}
                      onClick={() => setShikiUlt(o.k)}
                    >
                      {o.t}{shikiUlt === o.k ? " ✓" : ""}
                    </AvButton>
                  ))}
                </div>
                <div className="text-xs mt-3 leading-snug" style={{ color: "rgba(239,230,245,.6)" }}>
                  เลือกท่า 2: สกิลติดตัวจะมอบเส้นชีวิตน้อยลงเหลือ 1 หน่วยต่อครั้ง (จาก 2) และให้ได้สูงสุด 3 หน่วย
                  — ท่าไม้ตาย 2 จะแจกเส้นชีวิตเพิ่มได้อีกสูงสุด 3 หน่วยต่อคน (รวมสูงสุด 6 = โอกาสสังหาร 60%)
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!sel && (
        <div className="av-content absolute inset-x-0 flex justify-center" style={{ top: "36vh" }}>
          <div className="av-heading text-2xl av-breathe" style={{ color: "rgba(232,196,239,.45)" }}>
            เลือกตัวละครจากแถบด้านล่าง
          </div>
        </div>
      )}

      <div className="av-dock" data-open={dockOpen ? "true" : "false"}>
        <button className="av-dock-handle" onClick={toggleDock}>
          {dockOpen ? "ซ่อนแถบตัวละคร ▼" : "เปลี่ยนตัวละคร ▲"}
        </button>
        <div ref={ribbonRef} className="av-ribbon av-scroll av-scroll-none" onWheel={onRibbonWheel}>
          {visibleRoster.map((c, i) => {
            const g = DIFFICULTY_GROUPS.find((gr) => gr.key === (c.difficulty || "easy"));
            const active = c.id === picked;
            const taken = isTaken(c);
            const reason = blockReason(c);
            return (
              <div key={c.id} className="shrink-0 flex flex-col items-center gap-2 av-rise av-seq" style={{ "--i": Math.min(i, 18) }}>
                <Medallion
                  on={active}
                  disabled={taken}
                  size={active ? 102 : 86}
                  onClick={() => pickChar(c.id)}
                  title={c.locked ? "ยังไม่ปลดล็อก" : reason ? `${c.name} — ${reason}` : c.name}
                >
                  <span className="absolute inset-[3px] rounded-full overflow-hidden">
                    <CharArt c={c} className="w-full h-full object-cover" emojiSize="2rem" />
                  </span>
                  <span
                    className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
                    style={{ background: g?.color || "var(--av-purple)", boxShadow: `0 0 10px 2px ${g?.color || "#6d2f83"}` }}
                  />
                  {active && <Crystals level={5} seed={i + 1} />}
                  {reason && reason !== "ถูกเลือกไปแล้ว" && (
                    <span className="absolute inset-0 rounded-full grid place-items-center text-[10px] font-bold text-center leading-tight"
                      style={{ background: "rgba(10,4,12,.62)", color: reason === "ข้อมูลสูญหาย" ? "#ff8fab" : "#f5e6b8" }}>
                      {reason === "ข้อมูลสูญหาย" ? <>DATA LOST<br />ข้อมูลสูญหาย</> : reason}
                    </span>
                  )}
                </Medallion>
                <span
                  className="av-heading text-xs max-w-[6.5rem] truncate text-center"
                  style={{ color: active ? "var(--av-gold-lit)" : "rgba(239,230,245,.6)" }}
                >
                  {c.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {!sel?.locked && (
        <div
          className="fixed right-10 z-30"
          style={{
            bottom: "2.5rem",
            opacity: dockOpen ? 0 : 1,
            pointerEvents: dockOpen ? "none" : "auto",
            transition: "opacity .4s ease",
          }}
        >
          <SealButton ready={!!sel && !sel.locked && !blockReason(sel)} label={confirmLabel} onClick={confirm} />
        </div>
      )}
    </AvScene>
  );
}
