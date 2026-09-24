import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";

export const SCREEN_ORDER = { splash: 0, setup: 1, character: 2, connecting: 2.5, lobby: 3, gameintro: 3.5, ortarrival: 3.5, game: 4 };

const TransitionCurtain = forwardRef(function TransitionCurtain({ screenKey }, ref) {
  const [state, setState] = useState({ visible: false, mode: "sweep", phase: null, direction: "forward", playId: 0 });
  const liveRef = useRef({ visible: false, mode: "sweep", phase: null });

  const prevKey = useRef(screenKey);
  const prevOrder = useRef(SCREEN_ORDER[screenKey] ?? 0);
  const firstRun = useRef(true);
  const timers = useRef([]);
  const holdStart = useRef(0);
  const MIN_HOLD_MS = 1150;

  const dust = useMemo(() => {
    let seed = 20240401;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const grains = Array.from({ length: 210 }, () => {
      const roll = rnd();
      const big = roll < 0.1;
      const mid = !big && roll < 0.34;
      const pale = rnd() < 0.34;
      return {
        top: rnd() * 104 - 2,
        size: big ? 6 + rnd() * 7 : mid ? 3 + rnd() * 3 : 1.4 + rnd() * 2,
        blur: big ? 26 + rnd() * 20 : mid ? 12 + rnd() * 10 : 6 + rnd() * 6,
        spread: big ? 5 : mid ? 2.5 : 1.2,
        color: pale ? "#f0dcff" : "#ffe9a8",
        dy: (rnd() - 0.5) * 26,
        dy2: (rnd() - 0.3) * 34,
        delay: rnd() * 0.5,
        dur: 1 + rnd() * 0.2,
      };
    });

    const streaks = Array.from({ length: 14 }, () => ({
      top: rnd() * 100,
      len: 70 + rnd() * 160,
      thick: 1 + rnd() * 2.5,
      color: rnd() < 0.4 ? "#f0dcff" : "#ffe9a8",
      dy: (rnd() - 0.5) * 16,
      dy2: (rnd() - 0.3) * 22,
      delay: rnd() * 0.45,
      dur: 0.82 + rnd() * 0.22,
    }));

    const glints = Array.from({ length: 16 }, () => ({
      top: 2 + rnd() * 94,
      size: 18 + rnd() * 30,
      dy: (rnd() - 0.5) * 20,
      dy2: (rnd() - 0.35) * 28,
      delay: rnd() * 0.42,
      dur: 1.02 + rnd() * 0.2,
    }));

    const winds = [
      { top: -12, w: 62, delay: 0, dur: 1.5, op: 1 },
      { top: -12, w: 44, delay: 0.16, dur: 1.28, op: 0.7 },
      { top: -12, w: 78, delay: 0.3, dur: 1.62, op: 0.5 },
    ];

    return { grains, streaks, glints, winds };
  }, []);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const hide = () => {
    liveRef.current = { ...liveRef.current, visible: false };
    setState((s) => ({ ...s, visible: false }));
  };

  const playSweep = (dir) => {
    clearTimers();
    liveRef.current = { visible: true, mode: "sweep", phase: null };
    setState((s) => ({ visible: true, mode: "sweep", phase: null, direction: dir, playId: s.playId + 1 }));
    timers.current.push(setTimeout(hide, 1800));
  };

  const startHold = (dir) => {
    clearTimers();
    holdStart.current = Date.now();
    liveRef.current = { visible: true, mode: "hold", phase: "in" };
    setState((s) => ({ visible: true, mode: "hold", phase: "in", direction: dir, playId: s.playId + 1 }));
    timers.current.push(setTimeout(() => {
      const cur = liveRef.current;
      if (cur.mode !== "hold" || cur.phase !== "in") return;
      liveRef.current = { ...cur, phase: "held" };
      setState((s) => ({ ...s, phase: "held" }));
    }, 420));
    timers.current.push(setTimeout(() => releaseHold(), 6000));
  };

  const releaseHold = () => {
    const cur = liveRef.current;
    if (cur.mode !== "hold" || cur.phase === "out" || !cur.visible) return;
    // ค้างจออย่างน้อย MIN_HOLD_MS เสมอ — ถ้า server ตอบเร็วมาก ม่านจะถูกเปิดตั้งแต่ละอองยังพัดไม่ทันเต็มจอ
    const waited = Date.now() - holdStart.current;
    if (waited < MIN_HOLD_MS) {
      clearTimers();
      if (cur.phase === "in") {
        timers.current.push(setTimeout(() => {
          const c = liveRef.current;
          if (c.mode !== "hold" || c.phase !== "in") return;
          liveRef.current = { ...c, phase: "held" };
          setState((st) => ({ ...st, phase: "held" }));
        }, Math.max(0, 440 - waited)));
      }
      timers.current.push(setTimeout(releaseHold, MIN_HOLD_MS - waited));
      return;
    }
    clearTimers();
    liveRef.current = { ...cur, phase: "out" };
    setState((s) => ({ ...s, phase: "out" }));
    timers.current.push(setTimeout(hide, 520));
  };

  useImperativeHandle(ref, () => ({
    preTrigger(targetKey) {
      const order = SCREEN_ORDER[targetKey] ?? 0;
      const dir = order >= prevOrder.current ? "forward" : "back";
      prevKey.current = targetKey;
      prevOrder.current = order;
      playSweep(dir);
    },
    holdCover(dir = "forward") {
      startHold(dir);
    },
    // ข้ามม่านไปเลยสำหรับรอยต่อที่มีอนิเมชันของตัวเองอยู่แล้ว (ฉากเปิดตัวผู้เล่น -> สนาม)
    skip(targetKey) {
      prevKey.current = targetKey;
      prevOrder.current = SCREEN_ORDER[targetKey] ?? 0;
    },
    release() {
      releaseHold();
    },
  }));

  useLayoutEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      prevKey.current = screenKey;
      prevOrder.current = SCREEN_ORDER[screenKey] ?? 0;
      return;
    }
    if (screenKey === prevKey.current) return;
    const order = SCREEN_ORDER[screenKey] ?? 0;
    const dir = order >= prevOrder.current ? "forward" : "back";
    prevKey.current = screenKey;
    prevOrder.current = order;

    const holding = liveRef.current.mode === "hold" && liveRef.current.visible;
    if (holding) {
      if (screenKey !== "connecting") releaseHold();
    } else {
      playSweep(dir);
    }
  }, [screenKey]);

  if (!state.visible) return null;

  return (
    <div
      key={state.playId}
      className="av-curtain"
      data-mode={state.mode}
      data-phase={state.phase || ""}
      data-dir={state.direction}
      aria-hidden="true"
    >
      <span className="av-dust-veil" />
      <div className="av-dust">
        {dust.winds.map((w, i) => (
          <span
            key={`w${i}`}
            className="av-wind"
            style={{
              width: `${w.w}vw`,
              "--wo": w.op,
              animationDelay: `${w.delay}s`,
              animationDuration: `${w.dur}s`,
            }}
          />
        ))}
        {dust.grains.map((g, i) => (
          <span
            key={`g${i}`}
            className="av-grain"
            style={{
              top: `${g.top}%`,
              width: g.size,
              height: g.size,
              "--gc": g.color,
              "--gb": `${g.blur}px`,
              "--gs": `${g.spread}px`,
              "--dy": `${g.dy}vh`,
              "--dy2": `${g.dy2}vh`,
              animationDelay: `${g.delay}s`,
              animationDuration: `${g.dur}s`,
            }}
          />
        ))}
        {dust.streaks.map((g, i) => (
          <span
            key={`t${i}`}
            className="av-streak"
            style={{
              top: `${g.top}%`,
              width: g.len,
              height: g.thick,
              "--gc": g.color,
              "--dy": `${g.dy}vh`,
              "--dy2": `${g.dy2}vh`,
              animationDelay: `${g.delay}s`,
              animationDuration: `${g.dur}s`,
            }}
          />
        ))}
        {dust.glints.map((g, i) => (
          <span
            key={`s${i}`}
            className="av-glint"
            style={{
              top: `${g.top}%`,
              width: g.size,
              height: g.size,
              "--dy": `${g.dy}vh`,
              "--dy2": `${g.dy2}vh`,
              animationDelay: `${g.delay}s`,
              animationDuration: `${g.dur}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
});

export default TransitionCurtain;
