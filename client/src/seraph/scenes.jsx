// ============================================================
//  SE.RA.PH — ฉากเล่าเรื่อง (S0 · S1 · S6 · S7 · S8c · S10)
//  ทุกฉากรับ onDone แล้วเรียกเมื่อครบเวลาของตัวเอง เพื่อให้ผู้เรียกคุมคิวได้
//  เวลาทุกตัวตรงกับตารางใน SERAPH_SCENES.md §4 — แก้ที่นี่ต้องแก้เอกสารด้วย
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { playSfx } from "../audio";
import { SC_GLITCH } from "./assets";
import { SystemLines, GlitchCut, SeraphBackground, ShadowPortrait, DataCube } from "./ui";

const PD = "var(--font-p-display)";

/** ตัวช่วย: ยิง callback ตามตารางเวลาของฉาก แล้วเก็บกวาด timer ให้เอง (ใช้ร่วมกับ finale.jsx) */
export function useTimeline(steps, deps = []) {
  useEffect(() => {
    const timers = steps.map(([at, fn]) => setTimeout(fn, at));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* =========================================================================
   S0 — บูตระบบ SE.RA.PH · 4.2s
   แทน GameIntro เดิมของเกม เพราะของเดิมเผยหน้า+ชื่อตัวละครทุกคนตั้งแต่วินาทีแรก
   ========================================================================= */
export function SeraphBoot({ players = [], day = 1, cycleRound = 1, onDone }) {
  const [stage, setStage] = useState(0); // 0 ข้อความระบบ · 1 คำต้อนรับ · 2 วงกลมเงาดำ
  const [glitch, setGlitch] = useState(0);

  useTimeline([
    [0, () => playSfx("sc_noti")],
    [1300, () => setGlitch((g) => g + 1)],
    [1400, () => setStage(1)],
    [2800, () => { setStage(2); playSfx("sc_noti2"); }],
    [4400, () => onDone && onDone()]
  ], [players.length]);

  const lines = useMemo(() => [
    "> CONNECTING ...",
    `> PARTICIPANTS : ${players.length}`,
    "> IDENTITY MASK : ENABLED",
    "> ELIMINATION CYCLE : 5 DAYS"
  ], [players.length]);

  return (
    <div className="fixed inset-0 z-[92] overflow-hidden" style={{ background: "var(--color-sc-void)" }}>
      <SeraphBackground phase="draw" grid="full" />

      {stage === 0 && (
        <div className="absolute top-[12%] left-[8%] text-xs sm:text-sm">
          <SystemLines lines={lines} speed={16} gap={90} />
        </div>
      )}

      {/* คำต้อนรับ — ชื่อโหมดคือ "Moon Cell" (ไม่ใช่ SE.RA.PH ซึ่งเป็นชื่อของโลกที่เกมตั้งอยู่) */}
      {stage === 1 && (
        <div className="absolute inset-0 grid place-items-center px-6">
          {/* เศษข้อมูลบินมารวมกันเป็นตัวหนังสือ */}
          {Array.from({ length: 22 }, (_, i) => {
            const a = (i / 22) * Math.PI * 2;
            return (
              <span
                key={i}
                className="sc-shard"
                style={{
                  width: 4 + (i % 4) * 3,
                  height: 4 + (i % 3) * 3,
                  "--sc-dx": `${Math.cos(a) * 260}px`,
                  "--sc-dy": `${Math.sin(a) * 200}px`,
                  "--sc-rot": `${(i % 2 ? 1 : -1) * 90}deg`,
                  "--sc-d": `${i * 16}ms`,
                  "--sc-dur": "820ms"
                }}
              />
            );
          })}
          <div className="relative flex flex-col items-center gap-2 text-center">
            <div
              className="text-lg sm:text-2xl font-bold text-white/90"
              style={{ fontFamily: PD, animation: "scBannerIn 500ms both" }}
            >
              ยินดีต้อนรับสู่
            </div>
            <div
              className="glitch-p text-5xl sm:text-7xl font-black italic tracking-[0.14em] leading-none"
              data-text="Moon Cell"
              style={{ fontFamily: PD }}
            >
              Moon Cell
            </div>
            <div
              className="mt-1 h-[3px] w-[min(60vw,420px)]"
              style={{
                background: "linear-gradient(90deg, transparent, var(--color-sc-cyan), transparent)",
                transform: "skewX(-24deg)",
                animation: "bannerUnderline 320ms 260ms ease-out both"
              }}
            />
            <div
              className="mt-2 flex items-baseline gap-4"
              style={{ fontFamily: PD, animation: "scBannerIn 460ms 420ms both" }}
            >
              <span className="text-2xl sm:text-4xl font-black text-white">วันที่ {day}</span>
              <span className="text-lg sm:text-2xl font-black" style={{ color: "var(--color-sc-cyan)" }}>
                รอบ {cycleRound}
              </span>
            </div>
          </div>
        </div>
      )}

      {stage === 2 && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="sc-sysline absolute top-[14%] text-xs sm:text-sm opacity-80">
            {"> IDENTITY MASK : ENABLED"}
          </div>
          {/* วงกลมเงาดำ — ประโยคเปิดของทั้งโหมด: มีคน n คน ไม่มีใครรู้ว่าใครเป็นใคร */}
          <div className="relative" style={{ width: "min(74vw, 380px)", height: "min(74vw, 380px)" }}>
            <span className="absolute inset-0 rounded-full border border-dashed" style={{ borderColor: "var(--color-sc-line)", animation: "scRadarSweep 26s linear infinite" }} />
            {players.map((p, i) => {
              const a = (i / Math.max(1, players.length)) * Math.PI * 2 - Math.PI / 2;
              return (
                <div
                  key={p.id ?? i}
                  className="absolute"
                  style={{
                    left: `${50 + Math.cos(a) * 38}%`,
                    top: `${50 + Math.sin(a) * 38}%`,
                    transform: "translate(-50%, -50%)",
                    animation: `pRise 420ms cubic-bezier(.2,.8,.2,1) ${i * 90}ms both`
                  }}
                >
                  <ShadowPortrait name={p.name} img={p.img} size="sm" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <GlitchCut playId={glitch} />
    </div>
  );
}

/* =========================================================================
   S1 — แบนเนอร์เปิดวัน · 2.4s (วันแรกของรอบ) / 1.4s (วันถัดไป)
   ========================================================================= */
export function DayBanner({ day = 1, duelDay = 7, short = false, onDone }) {
  // ยืดจากเดิม (1.4s / 2.4s) — ของเดิมหายเร็วจนอ่านไม่ทัน
  const dur = short ? 2600 : 3800;
  const last = day === duelDay - 1;
  useTimeline([
    [0, () => playSfx(last ? "sc_noti2" : "sc_noti")],
    [dur, () => onDone && onDone()]
  ], [day, short]);

  const sub = day === duelDay
    ? "วันคัดออก"
    : last
      ? "พรุ่งนี้คือวันคัดออก"
      : `วันสืบสวน · เหลืออีก ${duelDay - day} วันก่อนการคัดออก`;

  return (
    <div className={`fixed inset-0 z-[70] pointer-events-none overflow-hidden grid place-items-center ${last ? "sc-shake" : ""}`}>
      <div className="sc-day-slab absolute top-1/2 -translate-y-1/2 py-8 sm:py-12" style={{ animationDuration: `${dur}ms` }} />
      <div className="relative flex flex-col items-center">
        <div className="sc-day-num" style={{ animationDelay: "150ms" }}>DAY {day}</div>
        <div
          className="h-[3px] mt-1"
          style={{
            width: "min(70vw, 460px)",
            background: `linear-gradient(90deg, transparent, ${last ? "var(--color-sc-red)" : "var(--color-sc-cyan)"}, transparent)`,
            transform: "skewX(-24deg)",
            animation: "bannerUnderline 300ms 400ms ease-out both"
          }}
        />
        <div
          className={`mt-3 text-sm sm:text-lg font-bold ${last ? "sc-sysline-red" : ""}`}
          style={{ fontFamily: PD, animation: "scBannerIn 400ms 500ms both", color: last ? "var(--color-sc-red)" : "#fff" }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   S6 — ประกาศคู่ดวล (จบวันที่ 2) · 7.0s
   เปิดด้วยความเงียบ 400ms — ผู้เรียกต้อง stopMusic() ก่อน mount ฉากนี้
   ========================================================================= */
export function PairingScene({ pairs = [], byes = [], myId = null, onDone }) {
  const [stage, setStage] = useState(0); // 0 เงียบ+ข้อความ · 1 ตัดทีละคู่ · 2 แผนผังรวม · 3 นับถอยหลัง
  const [shown, setShown] = useState(-1);
  const [glitch, setGlitch] = useState(0);
  const perPair = 900;
  const clashEnd = 2000 + pairs.length * perPair;

  useTimeline([
    [2000, () => { setGlitch((g) => g + 1); setStage(1); }],
    ...pairs.map((_, i) => [2000 + i * perPair, () => {
      setShown(i);
      const mine = pairs[i].a === myId || pairs[i].b === myId;
      playSfx(mine ? "sc_glitch" : "sc_noti2");
    }]),
    [clashEnd, () => setStage(2)],
    [clashEnd + 800, () => { setStage(3); playSfx("sc_noti2"); }],
    [clashEnd + 1400, () => onDone && onDone()]
  ], [pairs.length, myId]);

  const cur = stage === 1 && shown >= 0 ? pairs[shown] : null;
  const curIsMine = cur && (cur.a === myId || cur.b === myId);

  return (
    <div className={`fixed inset-0 z-[92] overflow-hidden ${curIsMine ? "sc-shake-hard" : ""}`} style={{ background: "var(--color-sc-void)" }}>
      <SeraphBackground phase="draw" hot grid="full" />
      <span className="sc-impact-rays absolute inset-0 opacity-60" />

      {stage === 0 && (
        <div className="absolute inset-0 grid place-items-center px-6">
          <SystemLines
            lines={["> ELIMINATION PROTOCOL INITIALIZED", "> PAIRING COMPLETE"]}
            speed={22}
            gap={200}
            red
            className="text-sm sm:text-xl"
          />
        </div>
      )}

      {stage === 1 && cur && (
        <div key={shown} className="absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-4 sm:gap-10">
            <div className="sc-clash-l"><ShadowPortrait name={cur.aName} img={cur.aImg} size="lg" /></div>
            <div className="sc-vs text-5xl sm:text-8xl" style={{ fontFamily: PD }}>VS</div>
            <div className="sc-clash-r"><ShadowPortrait name={cur.bName} img={cur.bImg} size="lg" /></div>
          </div>
          {curIsMine && (
            <div className="absolute bottom-[14%] sc-sysline sc-sysline-red text-lg font-black" style={{ fontFamily: PD }}>
              คู่ของเจ้า
            </div>
          )}
        </div>
      )}

      {stage >= 2 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-4">
          <div className="sc-sysline text-xs sm:text-sm opacity-80">{"> ELIMINATION BRACKET"}</div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-4 max-w-4xl">
            {pairs.map((p, i) => {
              const mine = p.a === myId || p.b === myId;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2"
                  style={{
                    border: `2px solid ${mine ? "var(--color-sc-red)" : "var(--color-sc-line)"}`,
                    background: "rgba(4,7,12,.72)",
                    animation: `pRise 360ms ${i * 80}ms both`
                  }}
                >
                  <ShadowPortrait name={p.aName} img={p.aImg} size="sm" />
                  <span className="sc-vs text-xl" style={{ fontFamily: PD }}>VS</span>
                  <ShadowPortrait name={p.bName} img={p.bImg} size="sm" />
                </div>
              );
            })}
          </div>
          {/* วันที่ 7 ดวลแค่คู่เดียวต่อรอบ — ที่เหลือทั้งหมดผ่านเข้ารอบถัดไปโดยไม่ต้องดวล */}
          {byes.length > 0 && (
            <div
              className="flex flex-col items-center gap-2 px-4 py-3"
              style={{ border: "2px solid var(--color-echo-gold)", background: "rgba(4,7,12,.78)", animation: "pRise 360ms 400ms both" }}
            >
              <span className="text-xs font-black text-echo-gold">ผ่านเข้ารอบถัดไปโดยไม่ต้องดวล</span>
              <div className="flex flex-wrap justify-center gap-3">
                {byes.map((o) => <ShadowPortrait key={o.id} name={o.name} img={o.img} size="sm" />)}
              </div>
            </div>
          )}
          {stage === 3 && (
            <div className="sc-vs text-4xl sm:text-6xl mt-2" style={{ fontFamily: PD }}>อีก 3 วัน</div>
          )}
        </div>
      )}

      <GlitchCut playId={glitch} />
    </div>
  );
}

/* =========================================================================
   S7 — เข้าวันที่ 7 · 3.6s
   จุดหักของทั้งรอบ: จอแตก -> ตารางแดง -> หลอดเลือด/เกราะกลับมาทีละคน
   ========================================================================= */
export function DuelIntro({ day = 7, players = [], night = false, onDone }) {
  const [stage, setStage] = useState(0); // 0 เงียบ · 1 จอแตก+DAY {day} · 2 หลอดค่ากลับมา · 3 ปิดท้าย
  const [glitch, setGlitch] = useState(0);

  useTimeline([
    [250, () => { setGlitch((g) => g + 1); setStage(1); }],
    [1200, () => setStage(2)],
    [3200, () => { setStage(3); playSfx("sc_noti2"); }],
    [3600, () => onDone && onDone()]
  ], [players.length, night]);

  // เศษกระจก: มุมสุ่มแบบคงที่ (เลขคงที่ ไม่ใช่ Math.random) เพื่อให้ทุกเครื่องเห็นเหมือนกัน
  const shards = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 + 0.4;
    const x = 50 + Math.cos(a) * 22;
    const y = 50 + Math.sin(a) * 22;
    return {
      pts: `${x},${y} ${x + 9 + (i % 3) * 4},${y - 6} ${x + 4},${y + 11 + (i % 4) * 3}`,
      dx: `${Math.cos(a) * 70}vw`,
      dy: `${Math.sin(a) * 70}vh`,
      rot: `${(i % 2 ? 1 : -1) * (60 + i * 9)}deg`,
      d: i * 22
    };
  }), []);

  return (
    <div className="fixed inset-0 z-[92] overflow-hidden" style={{ background: "var(--color-sc-void)" }}>
      {stage >= 1 && <SeraphBackground phase="duel" night={night} hot grid="full" />}

      {stage === 1 && (
        <svg className="sc-shatter" viewBox="0 0 100 100" preserveAspectRatio="none">
          {shards.map((s, i) => (
            <polygon
              key={i}
              className="sc-shard-piece"
              points={s.pts}
              fill="rgba(255,255,255,.75)"
              stroke="var(--color-sc-cyan)"
              strokeWidth="0.3"
              style={{ "--sc-dx": s.dx, "--sc-dy": s.dy, "--sc-rot": s.rot, "--sc-d": `${s.d}ms` }}
            />
          ))}
        </svg>
      )}

      {stage >= 1 && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="relative flex flex-col items-center">
            <div className="sc-day-num" style={{ color: "#fff", textShadow: "0 6px 0 rgba(0,0,0,.85), 0 0 70px rgba(255,77,94,.7)" }}>
              DAY {day}
            </div>
            <div
              className="sc-vs text-3xl sm:text-5xl absolute top-1/2 -translate-y-1/2"
              style={{ fontFamily: PD, animationDelay: "420ms" }}
            >
              ELIMINATION
            </div>
          </div>
        </div>
      )}

      {stage >= 2 && (
        // หลอดเลือด/เกราะโผล่กลับมาไล่ทีละคน — ผลตอบแทนของการซ่อนมันมา 4 วัน
        <div className="absolute bottom-[10%] inset-x-0 flex flex-wrap justify-center gap-3 px-4">
          {players.map((p, i) => (
            <div key={p.id ?? i} className="flex flex-col gap-1 items-start" style={{ minWidth: 92 }}>
              <span className="text-[10px] font-bold text-white/80">{p.name}</span>
              <span className="sc-hpbar-restore h-2 w-full rounded-sm" style={{ background: "var(--color-echo-hp)", "--sc-d": `${i * 140}ms` }} />
              <span className="sc-hpbar-restore h-2 w-2/3 rounded-sm" style={{ background: "var(--color-echo-armor)", "--sc-d": `${i * 140 + 70}ms` }} />
            </div>
          ))}
        </div>
      )}

      {stage === 3 && (
        <div className="absolute top-[16%] inset-x-0 text-center">
          <SystemLines lines={["> COMBAT SYSTEMS RESTORED"]} speed={16} className="items-center text-sm sm:text-base" />
        </div>
      )}

      <GlitchCut playId={glitch} duration={260} />
    </div>
  );
}

/* =========================================================================
   S8c — เปิดเผยตัวละคร · 2.2s ต่อคน (ฉากแพงที่สุดของโหมด)
   seen=true (ผู้ชมเคยเห็นตัวละครนี้แล้ว) -> ข้ามการสแกน แต่ "ค้างจอครบ 2.2s เท่ากัน"
   ห้ามลดเวลา ไม่งั้นผู้เล่นออกจากฉากไม่พร้อมกัน = หลุดซิงก์ (กฎเดียวกับ lowQ)
   ========================================================================= */
export function CharacterReveal({ player, seen = false, onDone }) {
  const [stage, setStage] = useState(seen ? 2 : 0); // 0 เงา · 1 สแกน · 2 เผยแล้ว
  const [glitch, setGlitch] = useState(0);
  const accent = player?.color || "var(--color-sc-cyan)";

  useTimeline(seen
    ? [[2200, () => onDone && onDone()]]
    : [
      [300, () => setStage(1)],
      [1000, () => { setGlitch((g) => g + 1); setStage(2); }],
      [1600, () => playSfx("sc_noti2")],
      [2200, () => onDone && onDone()]
    ], [player?.id, seen]);

  if (!player) return null;
  const img = player.character?.img || player.img;

  return (
    <div className="fixed inset-0 z-[93] overflow-hidden grid place-items-center" style={{ background: "var(--color-sc-void)" }}>
      <SeraphBackground phase="duel" night={player.night} grid="full" />

      <div className="relative flex flex-col items-center gap-4">
        <div className="sc-reveal-wrap relative w-52 h-72 sm:w-64 sm:h-88 rounded-lg overflow-hidden">
          {/* ชั้นล่าง = เงาดำ · ชั้นบน = ภาพจริงที่ถูก clip เผยจากล่างขึ้นบน */}
          <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover sc-silhouette" />
          {stage >= 1 && (
            <img
              src={img}
              alt=""
              className={stage === 1 ? "sc-reveal-fill w-full h-full object-cover" : "absolute inset-0 w-full h-full object-cover"}
              style={stage >= 2 ? { animation: "popIn 420ms cubic-bezier(.2,.9,.25,1.1) both" } : undefined}
            />
          )}
          {stage === 1 && <span className="sc-reveal-line" />}
          <span className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 0 2px ${accent}` }} />
        </div>

        {stage >= 2 && (
          <>
            <span className="sc-reveal-burst absolute inset-0 m-auto w-24 h-24" style={{ "--sc-accent": accent }} />
            {/* เศษข้อมูลกระจายออกตอนเงาแตก */}
            {Array.from({ length: 14 }, (_, i) => {
              const a = (i / 14) * Math.PI * 2;
              return (
                <span
                  key={i}
                  className="sc-shard"
                  style={{
                    width: 5 + (i % 3) * 3, height: 5 + (i % 2) * 4,
                    left: "50%", top: "40%",
                    "--sc-dx": `${Math.cos(a) * -180}px`, "--sc-dy": `${Math.sin(a) * -150}px`,
                    "--sc-dur": "700ms", "--sc-d": `${i * 12}ms`,
                    animationDirection: "reverse"
                  }}
                />
              );
            })}
            <div className="flex flex-col items-center gap-1" style={{ animation: "scBannerIn 400ms both" }}>
              <div
                className="p-name-tag px-4 py-1.5 text-xl sm:text-2xl font-black text-white"
                style={{ fontFamily: PD, "--p-frame-color": accent }}
              >
                {player.character?.name || player.name}
              </div>
              <div className="text-xs sm:text-sm text-white/70" style={{ fontFamily: PD }}>{player.name}</div>
            </div>
          </>
        )}
      </div>

      <GlitchCut playId={glitch} />
    </div>
  );
}

/* =========================================================================
   S10 — ตกรอบ · 4.0s · ผู้แพ้ถูก "ลบ" ไม่ใช่ "ตาย"
   ภาพแตกเป็นบล็อกพิกเซลไล่จากล่างขึ้นบน 14 แถว
   (สเปกเดิมเสนอ clip-path แถบเดียว — ใช้ 14 ชั้น background-position แทน
    เพราะรองรับทุกเบราว์เซอร์และไม่ต้องพึ่ง mask-composite ที่ซัพพอร์ตยังไม่ทั่ว)
   ========================================================================= */
const DISSOLVE_ROWS = 14;

export function DeletionScene({ loser, winner, onDone }) {
  const [stage, setStage] = useState(0); // 0 สโลว์โม · 1 ขาวดำ · 2 สลาย · 3 ผู้ชนะ
  const [glitch, setGlitch] = useState(0);

  useTimeline([
    [400, () => setStage(1)],
    [700, () => { setStage(2); setGlitch((g) => g + 1); }],
    [3000, () => { setStage(3); playSfx("sc_noti2"); }],
    [4000, () => onDone && onDone()]
  ], [loser?.id]);

  const loserImg = loser?.character?.img || loser?.img;
  const winnerImg = winner?.character?.img || winner?.img;

  return (
    <div
      className="fixed inset-0 z-[93] overflow-hidden grid place-items-center"
      style={{ background: "var(--color-sc-void)", filter: stage >= 1 && stage < 3 ? "grayscale(1)" : "none", transition: "filter 300ms" }}
    >
      <SeraphBackground phase="duel" hot grid="full" />

      <div className="relative flex items-center gap-8 sm:gap-16">
        {/* ผู้แพ้ — แตกเป็น 14 แถบไล่จากล่างขึ้นบน */}
        <div className="sc-dissolve relative w-40 h-56 sm:w-52 sm:h-72">
          {stage < 2 ? (
            <img src={loserImg} alt="" className="absolute inset-0 w-full h-full object-cover rounded-lg" />
          ) : (
            Array.from({ length: DISSOLVE_ROWS }, (_, i) => (
              <span
                key={i}
                className="sc-dissolve-row"
                style={{
                  top: `${(i * 100) / DISSOLVE_ROWS}%`,
                  height: `${100 / DISSOLVE_ROWS}%`,
                  backgroundImage: `url(${loserImg})`,
                  backgroundPosition: `0 ${(i * 100) / (DISSOLVE_ROWS - 1)}%`,
                  "--sc-rows-h": `${DISSOLVE_ROWS * 100}%`,
                  "--sc-dx": `${(i % 2 ? 1 : -1) * (8 + i)}px`,
                  "--sc-dx2": `${(i % 2 ? 1 : -1) * (70 + i * 6)}px`,
                  // ไล่จากล่าง (แถวสุดท้าย) ขึ้นบน (แถวแรก)
                  "--sc-d": `${(DISSOLVE_ROWS - 1 - i) * 100}ms`
                }}
              />
            ))
          )}
        </div>

        {stage >= 3 && winner && (
          <div className="flex flex-col items-center gap-2" style={{ animation: "popIn 460ms both" }}>
            <div className="w-32 h-44 sm:w-40 sm:h-56 rounded-lg overflow-hidden" style={{ outline: `3px solid ${winner.color || "var(--color-sc-cyan)"}` }}>
              <img src={winnerImg} alt="" className="w-full h-full object-cover" />
            </div>
            <span className="p-chip px-3 py-1 text-xs text-black" style={{ background: "var(--color-sc-mint)" }}>
              <span>ผ่านเข้ารอบถัดไป</span>
            </span>
          </div>
        )}
      </div>

      {stage >= 2 && (
        <div className="absolute bottom-[16%] inset-x-0 px-6 text-center">
          <SystemLines
            lines={[`> PLAYER ${(loser?.name || "").toUpperCase()} — DELETED FROM SE.RA.PH`]}
            speed={26}
            red
            className="items-center text-xs sm:text-lg"
          />
        </div>
      )}

      <GlitchCut playId={glitch} duration={1400} />
    </div>
  );
}

/* =========================================================================
   S3 — ประกาศผู้ชนะประจำวัน (วันที่ 1-6) · 3.6s
   วันธรรมดาไม่มีเฟสโจมตี ฉากนี้จึงต้องรับน้ำหนักความสะใจของทั้งวันไว้เอง
   ภาษาไทยล้วน เพราะเป็นการแจ้งเตือนสำคัญที่ผู้เล่นต้องอ่านออกทันที
   ========================================================================= */
export function DayWinnerScene({ winner, scores = [], matrixHeld = 0, matrixMax = 4, mine, onDone }) {
  const [stage, setStage] = useState(0); // 0 ประกาศชื่อ · 1 จ่ายรางวัล
  useTimeline([
    [0, () => playSfx("sc_noti")],
    [1200, () => { setStage(1); playSfx("sc_noti2"); }],
    [3600, () => onDone && onDone()]
  ], [winner && winner.id]);

  if (!winner) return null;
  const isMe = mine === winner.id;

  return (
    <div className="fixed inset-0 z-[88] grid place-items-center pointer-events-none px-6">
      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 45%, rgba(229,179,59,.18), rgba(4,7,12,.86) 62%)" }} />

      <div className="relative flex flex-col items-center gap-3">
        {/* วงแหวนทองแผ่ออกจากตัวผู้ชนะ */}
        {[0, 160, 320].map((d) => (
          <span key={d} className="sc-win-ring" style={{ "--sc-d": `${d}ms` }} />
        ))}

        <div
          className="text-sm sm:text-lg font-bold tracking-[0.3em] text-echo-gold"
          style={{ fontFamily: PD, animation: "scBannerIn 420ms both" }}
        >
          ผู้ชนะประจำวัน
        </div>

        <div
          className="relative w-32 h-40 sm:w-40 sm:h-52 rounded-xl overflow-hidden"
          style={{ outline: "3px solid var(--color-echo-gold)", outlineOffset: 2, animation: "popIn 460ms cubic-bezier(.2,.9,.25,1.15) both" }}
        >
          {/* ตัวตนยังเป็นความลับ — ฉากนี้ฉลอง "ชื่อผู้เล่น" ไม่ใช่ "ตัวละคร" */}
          {winner.img && !winner.scHidden ? (
            <img src={winner.img} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full grid place-items-center bg-black text-4xl opacity-40">👤</span>
          )}
          <span className="absolute inset-x-0 bottom-0 py-1 text-center text-base font-black text-white" style={{ background: "rgba(0,0,0,.82)", fontFamily: PD }}>
            {winner.name}
          </span>
        </div>

        {stage >= 1 && (
          <div className="flex flex-col items-center gap-2" style={{ animation: "scBannerIn 380ms both" }}>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2 px-3 py-1.5 text-sm font-black" style={{ background: "rgba(53,230,212,.16)", border: "1px solid var(--color-sc-cyan)", color: "var(--color-sc-cyan)" }}>
                ◆ Matrix +1
              </span>
              <span className="flex items-center gap-2 px-3 py-1.5 text-sm font-black" style={{ background: "rgba(229,179,59,.16)", border: "1px solid var(--color-echo-gold)", color: "var(--color-echo-gold)" }}>
                🪙 เหรียญ +1
              </span>
            </div>
            {isMe && (
              <span className="text-xs text-white/75">
                Matrix ของเจ้าตอนนี้ {matrixHeld}/{matrixMax} — เอาไปลงที่สวนสาธารณะเพื่อจับตาคู่แข่ง
              </span>
            )}
          </div>
        )}

        {/* แต้มของทุกคนในวันนี้ */}
        {scores.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-1" style={{ animation: "scBannerIn 400ms 200ms both" }}>
            {scores.map((s) => (
              <span
                key={s.id}
                className="px-2.5 py-1 text-xs font-bold"
                style={{
                  background: "rgba(4,7,12,.85)",
                  border: `1px solid ${s.id === winner.id ? "var(--color-echo-gold)" : "rgba(255,255,255,.18)"}`,
                  color: s.busted ? "var(--color-sc-red)" : "#fff"
                }}
              >
                {s.name} · {s.busted ? "แตก" : s.score}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
