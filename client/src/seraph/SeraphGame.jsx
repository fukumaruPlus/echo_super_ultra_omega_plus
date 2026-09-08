// ============================================================
//  SE.RA.PH — ตัวคุมฉากของโหมด (เชื่อม state จาก server เข้ากับฉากที่เขียนไว้)
//
//  หลักการแบ่ง (SERAPH_SCENES.md หลักการข้อ 5 — วันที่ 1-4 กับวันที่ 5 ต้องเหมือนคนละเกม):
//    วันที่ 1-4  -> สนามของโหมดนี้เอง (Arena วงแหวน / PlaceSelect / MatrixRadar)
//                  เพราะ HUD ต่างกันสิ้นเชิง: ไม่มีหลอดเลือด ไม่มีแถบสกิล ไม่มีไอเทม
//    วันที่ 5    -> ส่งต่อให้กระดานเดิม <Game> ทั้งดุ้น (สกิล/ไอเทม/ทริกเกอร์สี/เฟสโจมตีกลับมาครบ)
//                  แล้วซ้อนฉากของโหมด (เปิดเผยตัวละคร / ตกรอบ) ทับด้านบน
// ============================================================

import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { playMusic, playSfx, stopMusic } from "../audio";
import Game from "../screens/Game";
import Arena from "./Arena";
import PlaceSelect from "./PlaceSelect";
import MatrixRadar from "./MatrixRadar";
import SpectatorRail from "./SpectatorRail";
import { preloadWave1, preloadWave2, preloadWave3 } from "./assets";
import { SystemLines, SeraphBackground } from "./ui";
import { SeraphBoot, DayBanner, PairingScene, Day5Intro, CharacterReveal, DeletionScene } from "./scenes";

export default function SeraphGame({ state, lowQ, skillConfirmOn }) {
  const sc = state.seraph;
  const me = state.players.find((p) => p.id === state.youId);

  const [scene, setScene] = useState(null);            // ฉากที่ซ้อนทับอยู่ตอนนี้
  const [pendingPlace, setPendingPlace] = useState(null); // เลือกสถานที่ไว้แต่ยังไม่ยืนยันกับ server

  const prevDay = useRef(null);
  const prevDuelIndex = useRef(null);
  const seenPairing = useRef(false);
  const bootShown = useRef(false);
  const prevOut = useRef(null);

  // ---------- โหลดสื่อเป็นระลอกตามที่กำลังจะใช้จริง (assets.js) ----------
  useEffect(() => { preloadWave1(); }, []);
  useEffect(() => { preloadWave2(); }, []);
  useEffect(() => { if (sc && sc.day >= 4) preloadWave3(sc.night); }, [sc && sc.day, sc && sc.night]);

  // ---------- เพลง (SERAPH_SCENES.md §6) ----------
  useEffect(() => {
    if (!sc) return;
    // S6/S7 เปิดด้วยความเงียบ — ความเงียบเป็นส่วนหนึ่งของฉาก ห้ามมีเพลงคลอ
    if (scene && (scene.kind === "pairing" || scene.kind === "day5")) { stopMusic(); return; }
    if (sc.day === 5) playMusic(sc.night ? "sc_duel_night" : "sc_duel_day", sc.cycleRound);
    else if (state.gameState === "SERAPH_PLACE") playMusic("sc_rest");
    else playMusic("sc_day");
  }, [sc && sc.day, sc && sc.night, sc && sc.cycleRound, state.gameState, scene && scene.kind]);

  // ---------- ล้างตัวเลือกค้างเมื่อเข้าเฟสเลือกสถานที่รอบใหม่ ----------
  useEffect(() => {
    if (state.gameState === "SERAPH_PLACE") setPendingPlace(null);
  }, [state.gameState, sc && sc.day]);

  // ---------- คิวฉาก: อะไรเปลี่ยน -> เล่นฉากที่ตรงกับเหตุการณ์นั้น ----------
  useEffect(() => {
    if (!sc) return;

    // S0 บูตระบบ — ครั้งเดียวตอนเข้าโหมด
    if (!bootShown.current) {
      bootShown.current = true;
      prevDay.current = sc.day;
      prevDuelIndex.current = sc.duelIndex;
      setScene({ kind: "boot" });
      return;
    }
    // S7 เข้าวันที่ 5
    if (prevDay.current !== 5 && sc.day === 5) {
      prevDay.current = sc.day;
      setScene({ kind: "day5" });
      return;
    }
    // S6 ประกาศคู่ดวล — คู่ถูกประกาศแล้วและยังไม่เคยโชว์ในรอบนี้
    if (sc.pairs.length && !seenPairing.current && sc.day > 2 && sc.day < 5) {
      seenPairing.current = true;
      prevDay.current = sc.day;
      setScene({ kind: "pairing" });
      return;
    }
    // S1 เปิดวันใหม่ (วันที่ 1-4) — วันแรกของรอบเล่นเต็ม วันถัดไปย่อ
    if (prevDay.current !== sc.day && sc.day < 5) {
      const first = sc.day === 1;
      prevDay.current = sc.day;
      if (first) seenPairing.current = false; // รอบใหม่ -> ประกาศคู่ได้อีกครั้ง
      setScene({ kind: "day", day: sc.day, short: !first });
      return;
    }
    prevDay.current = sc.day;

    // S8c เปิดเผยตัวละคร — ขึ้นคู่ใหม่ในวันที่ 5
    if (sc.day === 5 && sc.duelPair && prevDuelIndex.current !== sc.duelIndex) {
      prevDuelIndex.current = sc.duelIndex;
      const a = state.players.find((p) => p.id === sc.duelPair.a);
      const b = state.players.find((p) => p.id === sc.duelPair.b);
      if (a && b) { setScene({ kind: "reveal", queue: [a, b] }); return; }
    }
    prevDuelIndex.current = sc.duelIndex;
  }, [sc && sc.day, sc && sc.cycleRound, sc && sc.duelIndex, sc && sc.pairs.length]);

  // ---------- S10 ตกรอบ: มีคนถูกลบเพิ่ม ----------
  const outKey = state.players.filter((p) => p.scEliminated).map((p) => p.id).sort().join(",");
  useEffect(() => {
    if (!sc || sc.day !== 5) return;
    if (prevOut.current === null) { prevOut.current = outKey; return; }
    if (outKey !== prevOut.current) {
      const before = prevOut.current.split(",").filter(Boolean);
      const added = state.players.find((p) => p.scEliminated && !before.includes(p.id));
      prevOut.current = outKey;
      if (added) {
        const pr = sc.pairs.find((x) => x.a === added.id || x.b === added.id);
        const winnerId = pr ? (pr.a === added.id ? pr.b : pr.a) : null;
        setScene({ kind: "deletion", loser: added, winner: state.players.find((p) => p.id === winnerId) });
      }
    }
  }, [outKey]);

  const closeScene = () => setScene(null);
  const emitPlace = (payload) => { playSfx("sc_glitch"); socket.emit("seraphPlace", payload); setPendingPlace("sent"); };

  // ---------- ฉากซ้อนทับ ----------
  let overlay = null;
  if (scene) {
    if (scene.kind === "boot") overlay = <SeraphBoot players={state.players} onDone={closeScene} />;
    else if (scene.kind === "day") overlay = <DayBanner day={scene.day} short={scene.short} onDone={closeScene} />;
    else if (scene.kind === "day5") overlay = <Day5Intro players={state.players} night={sc.night} onDone={closeScene} />;
    else if (scene.kind === "pairing") {
      overlay = (
        <PairingScene
          pairs={sc.pairs.map((pr) => ({
            ...pr,
            aImg: (state.players.find((p) => p.id === pr.a) || {}).img,
            bImg: (state.players.find((p) => p.id === pr.b) || {}).img
          }))}
          bye={sc.bye ? { name: sc.byeName, img: (state.players.find((p) => p.id === sc.bye) || {}).img } : null}
          myId={state.youId}
          onDone={closeScene}
        />
      );
    } else if (scene.kind === "reveal") {
      const cur = scene.queue[0];
      overlay = (
        <CharacterReveal
          key={cur.id}
          player={{ ...cur, night: sc.night }}
          onDone={() => {
            const rest = scene.queue.slice(1);
            if (rest.length) setScene({ ...scene, queue: rest });
            else closeScene();
          }}
        />
      );
    } else if (scene.kind === "deletion") {
      overlay = <DeletionScene loser={scene.loser} winner={scene.winner} onDone={closeScene} />;
    }
  }

  // ---------- ฉากหลัก ----------
  let main;
  if (sc.day === 5) {
    // วันที่ 5: ใช้กระดานเดิมทั้งดุ้น แต่ **เอาผู้ชมออกจากที่นั่งในสนามก่อน**
    //  กระดานเดิมวางผู้เล่นทุกคนที่อยู่ใน state.players ลง SLOTS ตามลำดับ ถ้าปล่อยไว้
    //  คนที่ไม่ได้ลงสนามจะนั่งปนอยู่ในวงเหมือนเป็นเป้าโจมตีได้ ซึ่งไม่ใช่
    //  -> กรองเหลือแค่คู่ที่ดวลจริง (+ ตัวเราเอง ถ้าเราเป็นผู้ชม กระดานต้องมี "เรา" ถึงจะวาด HUD ได้)
    //  แล้วย้ายคนที่เหลือไปแถบผู้ชมที่ขอบจอแทน (SpectatorRail)
    const inDuel = (p) => p.id === sc.duelPair?.a || p.id === sc.duelPair?.b;
    const boardState = {
      ...state,
      players: state.players.filter((p) => inDuel(p) || p.id === state.youId)
    };
    main = (
      <>
        <SeraphBackground phase="duel" night={sc.night} hot grid="full" />
        <div className="relative z-10">
          <Game state={boardState} lowQ={lowQ} skillConfirmOn={skillConfirmOn} />
        </div>

        <SpectatorRail players={state.players} duelPair={sc.duelPair} youId={state.youId} />

        {sc.spectating && (
          <>
            {/* ตัวเราเป็นผู้ชม: คาดขอบจอไว้ให้รู้ว่านี่คือมุมมองผู้ชม กดอะไรในสนามไม่ได้ */}
            <span className="sc-spec-mode" aria-hidden />
            {sc.duelPair && (
              <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[45] pointer-events-none">
                <div className="sc-toast px-3 py-1.5 text-xs flex items-center gap-2">
                  <span>👁</span>
                  <span className="sc-sysline text-[11px]">
                    โหมดผู้ชม — {(state.players.find((p) => p.id === sc.duelPair.a) || {}).name}
                    {" ปะทะ "}
                    {(state.players.find((p) => p.id === sc.duelPair.b) || {}).name}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </>
    );
  } else if (state.gameState === "SERAPH_PLACE") {
    if (pendingPlace === "park") {
      // สวนสาธารณะ: ลงแต้มบนเรดาร์ให้เสร็จก่อน แล้วส่งผลรวดเดียว
      main = (
        <MatrixRadar
          targets={state.players
            .filter((p) => p.id !== state.youId && p.alive && !p.scEliminated)
            .map((p) => ({
              id: p.id, name: p.name, img: p.img,
              charName: p.character ? p.character.name : "???",
              revealed: !p.scHidden,
              isOpponent: sc.myOpponent === p.id
            }))}
          held={sc.matrixHeld}
          placed={sc.matrixPlaced}
          onDone={(placedMap) => {
            // แปลง "แผนที่ระดับ" กลับเป็นลิสต์เป้าหมายทีละแต้ม (server นับทีละแต้ม)
            const targets = [];
            for (const [tid, lv] of Object.entries(placedMap)) {
              const before = sc.matrixPlaced[tid] || 0;
              for (let i = before; i < lv; i++) targets.push(tid);
            }
            emitPlace({ key: "park", targets });
          }}
        />
      );
    } else {
      main = (
        <PlaceSelect
          me={{
            matrixHeld: sc.matrixHeld,
            gold: me ? me.gold : 0,
            skillLevel: sc.skillLevel,
            hp: sc.caps ? sc.caps.hp : 3,
            armor: sc.caps ? sc.caps.armor : 2,
            skillCap: sc.caps ? sc.caps.skill : 4,
            cheapestItem: 1
          }}
          day={sc.day}
          night={sc.night}
          seconds={sc.placeSeconds}
          placedCount={sc.placedCount}
          totalPlayers={sc.totalPlayers}
          onPick={(key) => {
            // 2 สถานที่ที่ต้องถามต่อก่อนส่ง — ที่เหลือส่งได้เลย
            if (key === "church" || key === "park") { setPendingPlace(key); return; }
            emitPlace({ key });
          }}
        />
      );
    }
  } else {
    main = (
      <Arena
        state={state}
        onHit={() => { playSfx("action_button"); socket.emit("hit"); }}
        onLock={() => { playSfx("action_button"); socket.emit("lock"); }}
      />
    );
  }

  return (
    <>
      {main}

      {/* โบสถ์: เลือกแท่นเพิ่มความจุ
          คำเตือนเรื่องท่าไม้ตายต้องขึ้นทุกครั้งที่ความจุยังไม่ถึง 6 —
          SERAPH_MOONCELL.md §3 ระบุตรง ๆ ว่า "นี่คือความตั้งใจของดีไซน์ แต่ UI ต้องสื่อสารให้ชัด" */}
      {pendingPlace === "church" && sc.caps && (
        <div className="fixed inset-0 z-[86] grid place-items-center px-5" style={{ background: "rgba(4,7,12,.9)" }}>
          <div className="p-panel w-full max-w-lg p-5 flex flex-col gap-4" style={{ animation: "popIn 300ms both" }}>
            <SystemLines lines={["> SANCTUARY — CAPACITY UPGRADE"]} speed={18} className="text-sm" />
            <div className="grid grid-cols-3 gap-3">
              {[
                { k: "hp", icon: "❤️", label: "พลังชีวิต", cur: sc.caps.hp, max: null },
                { k: "armor", icon: "🛡️", label: "เกราะ", cur: sc.caps.armor, max: null },
                { k: "skill", icon: "⚡", label: "ความจุแต้มสกิล", cur: sc.caps.skill, max: 8 }
              ].map((o) => (
                <button
                  key={o.k}
                  type="button"
                  disabled={o.max != null && o.cur >= o.max}
                  onClick={() => emitPlace({ key: "church", option: o.k })}
                  className="p-btn-cut flex flex-col items-center gap-1 py-4 disabled:opacity-35"
                  style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--color-sc-line)" }}
                >
                  <span className="text-2xl">{o.icon}</span>
                  <span className="text-[11px] font-bold text-white/85">{o.label}</span>
                  <span className="sc-sysline text-sm font-black">
                    {o.cur} → {o.max != null ? Math.min(o.max, o.cur + 1) : o.cur + 1}
                  </span>
                  {o.max != null && <span className="text-[9px] opacity-60">สูงสุด {o.max}</span>}
                </button>
              ))}
            </div>
            {sc.caps.skill < 6 && (
              <p
                className="text-[11px] leading-relaxed px-3 py-2"
                style={{ background: "rgba(229,179,59,.14)", borderLeft: "3px solid var(--color-echo-gold)", color: "#ffd977" }}
              >
                ⚡ ความจุแต้มสกิลของเจ้าคือ {sc.caps.skill} — <b>ท่าไม้ตายต้องการ 6</b> ถึงจะร่ายได้
                (ปลดล็อกที่ห้องสมุดแล้วก็ยังร่ายไม่ได้จนกว่าความจุจะถึง)
              </p>
            )}
            <button
              type="button"
              onClick={() => setPendingPlace(null)}
              className="p-btn-cut self-end px-4 py-1.5 text-xs font-bold text-white/70 border border-white/20"
            >
              เลือกสถานที่อื่น
            </button>
          </div>
        </div>
      )}

      {overlay}

      {/* ถูกลบออกจากเกมแล้ว — เหลือสิทธิ์แค่เฝ้าดู */}
      {sc.eliminated && (
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-[55] pointer-events-none">
          <div className="sc-toast px-3 py-1.5" style={{ borderLeftColor: "var(--color-sc-red)" }}>
            <SystemLines lines={["> YOU HAVE BEEN DELETED — SPECTATING"]} speed={22} red className="text-[10px]" />
          </div>
        </div>
      )}
    </>
  );
}
