// ============================================================
//  หน้าดูฉาก SE.RA.PH ทั้งหมด — เปิดด้วย  ?seraph  ต่อท้าย URL
//    dev:   http://localhost:5173/?seraph
//    build: <ที่อยู่เซิร์ฟเวอร์>/?seraph
//
//  เป็นหน้าทดสอบงานภาพล้วน ๆ ใช้ข้อมูลปลอมในไฟล์นี้ ไม่ต่อ socket ไม่แตะ state เกมจริง
//  -> ดูฉากได้ก่อนที่ฝั่ง server ของโหมดจะมีอยู่จริง
// ============================================================

import { useEffect, useState } from "react";
import { playMusic, stopMusic } from "../audio";
import { preloadWave1, preloadWave2, preloadWave3 } from "./assets";
import { SeraphBackground, DayRail, MatrixSlots, ShadowPortrait, WatchedFrame, ToastStack, useToasts, DataCube } from "./ui";
import { SeraphBoot, DayBanner, PairingScene, Day5Intro, CharacterReveal, DeletionScene } from "./scenes";
import PlaceSelect from "./PlaceSelect";
import MatrixRadar from "./MatrixRadar";

const PD = "var(--font-p-display)";

// ---------- ข้อมูลปลอมสำหรับดูฉาก ----------
const AVATAR = (n) => `/characters/hakuno/hakuno.png#${n}`; // ถ้าไม่มีไฟล์ -> <img> ล้มเหลว แสดงพื้นดำ (ยังดูฉากได้)
const P = (i, name, color) => ({ id: `p${i}`, name, color, img: AVATAR(i), character: { name: `ตัวละคร ${i}`, img: AVATAR(i) } });
const PLAYERS = [
  P(1, "ฮาคุโนะ", "#22d3ee"), P(2, "ชิกิ", "#f97316"), P(3, "โคโตเนะ", "#a3e635"),
  P(4, "ไบเลธ", "#e83e8c"), P(5, "คอนเนอร์", "#9b4f96"), P(6, "อิกนิส", "#e5b33b")
];
const PAIRS = [
  { a: "p1", b: "p2", aName: "ฮาคุโนะ", bName: "ชิกิ", aImg: AVATAR(1), bImg: AVATAR(2) },
  { a: "p3", b: "p4", aName: "โคโตเนะ", bName: "ไบเลธ", aImg: AVATAR(3), bImg: AVATAR(4) },
  { a: "p5", b: "p6", aName: "คอนเนอร์", bName: "อิกนิส", aImg: AVATAR(5), bImg: AVATAR(6) }
];
const ME = { matrixHeld: 3, gold: 14, skillLevel: 2, hp: 3, armor: 2, skillCap: 4, cheapestItem: 3 };
const RADAR_TARGETS = PLAYERS.slice(1).map((p, i) => ({
  id: p.id, name: p.name, img: p.img, charName: p.character.name,
  revealed: i === 0, isOpponent: i === 2
}));

const SCENES = [
  { key: "board", label: "S2 กระดานวัน 1-4", music: "sc_day" },
  { key: "boot", label: "S0 บูตระบบ", music: null },
  { key: "day1", label: "S1 เปิดวัน (วันแรก)", music: "sc_day" },
  { key: "day4", label: "S1 เปิดวัน (วันที่ 4)", music: "sc_day" },
  { key: "place", label: "S4 เลือกสถานที่", music: "sc_rest" },
  { key: "radar", label: "S5.3 สวนสาธารณะ (Matrix)", music: "sc_rest" },
  { key: "pairing", label: "S6 ประกาศคู่ดวล", music: null },
  { key: "day5", label: "S7 เข้าวันที่ 5", music: null },
  { key: "reveal", label: "S8c เปิดเผยตัวละคร", music: "sc_duel_day" },
  { key: "revealSeen", label: "S8c (เคยเห็นแล้ว)", music: "sc_duel_day" },
  { key: "deletion", label: "S10 ตกรอบ", music: "sc_duel_night" }
];

export default function SeraphPreview() {
  const [scene, setScene] = useState("board");
  const [runId, setRunId] = useState(0);
  const [night, setNight] = useState(false);
  const [watched, setWatched] = useState(false);
  const [toasts, pushToast] = useToasts();

  useEffect(() => { preloadWave1().then(preloadWave2).then(() => preloadWave3(night)); }, [night]);

  useEffect(() => {
    const m = SCENES.find((s) => s.key === scene)?.music;
    const key = m === "sc_duel_day" && night ? "sc_duel_night" : m;
    if (key) playMusic(key, runId); else stopMusic();
    return () => {};
  }, [scene, runId, night]);

  const replay = () => setRunId((n) => n + 1);
  const go = (k) => { setScene(k); setRunId((n) => n + 1); };
  const done = () => go("board");

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "var(--color-sc-void)" }}>
      {/* ---------- ฉากที่กำลังดู ---------- */}
      {scene === "board" && (
        <>
          <SeraphBackground phase="draw" night={night} />
          <div className="relative z-10 min-h-screen flex flex-col items-center justify-center gap-6 px-4">
            <div className="text-center">
              <div className="sc-sysline text-xs mb-1">{"> IDENTITY MASK : ENABLED"}</div>
              <div className="text-white/60 text-sm">กระดานวันที่ 1–4 — ทุกคนเป็นเงาดำ ไม่มีหลอดเลือด/เกราะ/สกิล</div>
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              {PLAYERS.map((p, i) => <ShadowPortrait key={p.id} name={p.name} img={p.img} revealed={i === 0} color={p.color} />)}
            </div>
            {/* HUD ที่มาแทนหลอดเลือด/แถบสกิล */}
            <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-2" style={{ background: "rgba(4,7,12,.7)", border: "1px solid var(--color-sc-line)" }}>
              <span className="flex items-center gap-2 text-xs text-white/80">◆ <MatrixSlots held={2} /></span>
              <span className="text-xs text-white/80">🪙 14</span>
              <span className="text-xs text-white/80">📘 ระดับ 2</span>
              <span className="text-xs text-white/80">⚡ ความจุ 4/8</span>
            </div>
          </div>
        </>
      )}

      {scene === "boot" && <SeraphBoot key={runId} players={PLAYERS} onDone={done} />}
      {scene === "day1" && <><SeraphBackground phase="draw" night={night} /><DayBanner key={runId} day={1} onDone={done} /></>}
      {scene === "day4" && <><SeraphBackground phase="draw" night={night} /><DayBanner key={runId} day={4} onDone={done} /></>}
      {scene === "place" && (
        <PlaceSelect
          key={runId} me={ME} day={3} night={night} seconds={20} placedCount={4} totalPlayers={6}
          onPick={(k) => { pushToast(`เลือก ${k}`, "📍"); setTimeout(done, 900); }}
        />
      )}
      {scene === "radar" && (
        <MatrixRadar
          key={runId} targets={RADAR_TARGETS} held={ME.matrixHeld} placed={{ p2: 1 }}
          onPlace={() => pushToast("ลงแต้ม Matrix", "◆")} onDone={done}
        />
      )}
      {scene === "pairing" && <PairingScene key={runId} pairs={PAIRS} myId="p1" bye={{ name: "ยูนะ", img: AVATAR(7) }} onDone={done} />}
      {scene === "day5" && <Day5Intro key={runId} players={PLAYERS} night={night} onDone={done} />}
      {scene === "reveal" && <CharacterReveal key={runId} player={{ ...PLAYERS[0], night }} onDone={done} />}
      {scene === "revealSeen" && <CharacterReveal key={runId} player={{ ...PLAYERS[1], night }} seen onDone={done} />}
      {scene === "deletion" && <DeletionScene key={runId} loser={PLAYERS[1]} winner={PLAYERS[0]} onDone={done} />}

      <WatchedFrame on={watched} />
      <ToastStack toasts={toasts} />

      {/* ---------- แผงควบคุมของหน้าทดสอบ ---------- */}
      <div className="fixed left-2 bottom-2 z-[99] p-panel p-scroll p-2.5 max-w-[248px] max-h-[62vh] overflow-auto flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="sc-sysline text-[10px]">SE.RA.PH SCENE PREVIEW</span>
          <DayRail day={3} compact />
        </div>
        {SCENES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => go(s.key)}
            className="p-btn-cut text-left px-2.5 py-1.5 text-[11px] font-bold"
            style={{
              background: scene === s.key ? "var(--color-p-accent)" : "rgba(255,255,255,.06)",
              color: "#fff"
            }}
          >
            {s.label}
          </button>
        ))}
        <div className="h-px my-1" style={{ background: "var(--color-sc-line)" }} />
        <button type="button" onClick={replay} className="p-btn-cut px-2.5 py-1.5 text-[11px] font-bold text-black" style={{ background: "var(--color-sc-cyan)" }}>
          ▶ เล่นฉากนี้ซ้ำ
        </button>
        <label className="flex items-center gap-2 text-[11px] text-white/80 px-1">
          <input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} />
          รอบกลางคืน (สลับฉากหลัง+เพลง)
        </label>
        <label className="flex items-center gap-2 text-[11px] text-white/80 px-1">
          <input type="checkbox" checked={watched} onChange={(e) => setWatched(e.target.checked)} />
          S9 · โดน Matrix ระดับ 3 จ้องอยู่
        </label>
        <button type="button" onClick={() => pushToast("Matrix +1 · เหรียญ +1", "◆")} className="p-btn-cut px-2.5 py-1.5 text-[11px] font-bold text-white" style={{ background: "rgba(255,255,255,.1)" }}>
          ทดสอบ T0 Toast
        </button>
        <div className="flex items-center justify-center gap-2 pt-1">
          <DataCube size={22} />
          <span className="sc-sysline text-[9px] opacity-60">อ้างอิง SERAPH_SCENES.md</span>
        </div>
      </div>
    </div>
  );
}
