import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { playMusic, playSfx, stopMusic, resetMusicPositions, DOOM_WEAPON_SOUNDS } from "./audio";
import Splash from "./screens/Splash";
import Setup from "./screens/Setup";
import CharacterSelect from "./screens/CharacterSelect";
import Lobby from "./screens/Lobby";
import Game from "./screens/Game";
import VolumeControl from "./components/VolumeControl";
import TransitionCurtain from "./components/TransitionCurtain";
import GameIntro from "./components/GameIntro";

const SESSION_KEY = 'echo_session';

function savedSessionToken() {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

function saveSessionToken(token) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export default function App() {
  const [stage, setStage] = useState("splash"); // splash | setup | character | connected
  const [state, setState] = useState(null);
  const curtainRef = useRef(null); // ม่านเปลี่ยนฉาก — ควบคุมจังหวะปิด/เปิดจอตอนสลับหน้า
  // กันดับเบิ้ลคลิก/กดรัวบนปุ่มนำทาง (ถัดไป/ยืนยัน/ย้อนกลับ) ไม่ให้ยิงคำสั่งเปลี่ยนฉากซ้อนกัน
  const navLockRef = useRef(false);
  // ฉากเปิดตัวผู้เล่นตอนแมตช์เริ่ม (LOBBY -> เกม) — เล่นก่อนเข้าฉากสนามจริงเสมอ
  const [showIntro, setShowIntro] = useState(false);
  const [introPlayers, setIntroPlayers] = useState([]);
  const prevGameStateRef = useRef(null);
  const [roster, setRoster] = useState([]);
  const [takenChars, setTakenChars] = useState([]); // ตัวละคร unique ที่มีคนเลือกไปแล้ว (คอนเนอร์ RK800)
  const [taken, setTaken] = useState([]);
  const [name, setName] = useState("");
  const [position, setPosition] = useState(null);
  // โหมดประหยัด (patch 2.0.6): ข้ามวีดีโอท่าไม้ตาย/คัตซีน — เห็นแค่แจ้งเตือน แต่ยังต้องรอผู้เล่นอื่นดูจบ
  const [lowQ, setLowQ] = useState(() => {
    try {
      const saved = localStorage.getItem('echo_lowq');
      if (saved != null) return saved === '1';
      return navigator.connection?.saveData === true;
    } catch { return false; }
  });
  const toggleLowQ = () => {
    setLowQ((v) => {
      const next = !v;
      try { localStorage.setItem("echo_lowq", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  // ยืนยันก่อนใช้สกิล: ค่าเริ่มต้น "เปิด" — ปิดได้จากหน้าโต๊ะรวมผู้เล่นเพื่อให้กดสกิลไวขึ้น
  // เป็นค่าฝั่งเครื่องผู้เล่นคนนั้นล้วนๆ (localStorage) ไม่ส่งไป server จึงไม่กระทบผู้เล่นคนอื่น
  const [skillConfirmOn, setSkillConfirmOn] = useState(() => {
    try {
      const saved = localStorage.getItem('echo_skillconfirm');
      return saved == null ? true : saved === '1';
    } catch { return true; }
  });
  const toggleSkillConfirm = () => {
    setSkillConfirmOn((v) => {
      const next = !v;
      try { localStorage.setItem("echo_skillconfirm", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  useEffect(() => {
    // เกมเพิ่งเริ่ม (ออกจาก LOBBY เป็นครั้งแรกของแมตช์นี้) -> เล่นฉากเปิดตัวผู้เล่นก่อนเข้าสนามจริงเสมอ
    // ใช้ preTrigger (โหมดกวาดจบในตัว) ไม่ใช่ holdCover — เพราะรู้ปลายทาง (gameintro) ทันทีอยู่แล้วในจังหวะเดียวกัน
    // (ต่างจากตอนกดยืนยันตัวละครที่ต้องรอ server ตอบแบบไม่รู้เวลาแน่นอน) ถ้าใช้ holdCover ที่นี่จะเจอบั๊กใหม่:
    // ม่านจะปล่อยเปิดทันทีตั้งแต่เฟรมแรก (เพราะ screenKey เปลี่ยนพร้อมกันในเรนเดอร์เดียวกันอยู่แล้ว)
    const onState = (s) => {
      const matchStates = new Set(["PLAYING", "CUTSCENE", "SUMMARY", "ATTACK", "ATTACKING", "TRANSITION", "GAMEOVER"]);
      const wasInMatch = matchStates.has(prevGameStateRef.current);
      const nowInMatch = matchStates.has(s.gameState);
      if (!wasInMatch && nowInMatch) {
        curtainRef.current?.preTrigger("gameintro");
        setIntroPlayers(s.players);
        setShowIntro(true);
      }
      prevGameStateRef.current = s.gameState;
      setState(s);
    };
    // ตัวเลขนับถอยหลังรายวินาที: server ส่งมาแค่ตัวเลข (ไม่ใช่ state ตัวเต็ม) เพื่อประหยัด bandwidth
    //  -> แปะทับลงใน state ก้อนเดิม จอที่อ่าน state.timeLeft อยู่แล้วทำงานเหมือนเดิมทุกจุด
    const onTick = (t) => setState((s) => (s && s.timeLeft !== t ? { ...s, timeLeft: t } : s));
    const onRoster = (r) => setRoster(r);
    const onPositions = (t) => setTaken(t);
    const onTakenChars = (list) => setTakenChars(Array.isArray(list) ? list : []);
    // ตัวละครที่เลือกได้คนเดียวต่อเกมถูกคนอื่นชิงไปก่อน (กดพร้อมกันเป๊ะ) -> กลับไปเลือกใหม่
    const onCharTaken = ({ name } = {}) => {
      alert(`${name || "ตัวละครนี้"} ถูกผู้เล่นอื่นเลือกไปแล้ว (เลือกได้ 1 คนต่อเกม) — เลือกตัวใหม่นะ`);
      setStage("character");
    };
    const onJoined = ({ sessionToken } = {}) => {
      saveSessionToken(sessionToken);
      navLockRef.current = false;
      setStage('connected');
    };
    const onReconnected = ({ sessionToken } = {}) => {
      if (sessionToken) saveSessionToken(sessionToken);
      navLockRef.current = false;
      setStage('connected');
    };
    const onConnect = () => {
      const sessionToken = savedSessionToken();
      if (sessionToken) socket.emit('reconnectSession', { sessionToken });
    };
    const onSessionExpired = () => {
      saveSessionToken(null);
      setState(null);
      setStage((current) => current === 'connected' ? 'setup' : current);
    };
    const onSessionInUse = () => console.warn('This game session is already connected in another tab.');
    const onRateLimited = ({ event } = {}) => console.warn(`Rate limited: ${event || 'socket event'}`);
    // join ล้มเหลว (ห้องเต็ม/เกมกำลังเล่นอยู่) -> ไม่มีการเปลี่ยนหน้าจริง ต้องปล่อยม่านเปิดเอง
    // ไม่งั้นจอจะค้างมืดสนิทตลอดไป (holdCover ที่ confirmCharacter สั่งไว้ไม่มีจังหวะปล่อยเองในกรณีนี้)
    const onFull = () => {
      curtainRef.current?.release();
      navLockRef.current = false;
      alert("ขออภัย ห้องเต็มแล้ว (สูงสุด 7 คน)");
    };
    const onInProgress = () => {
      curtainRef.current?.release();
      navLockRef.current = false;
      alert("เกมกำลังเล่นอยู่ รอรอบใหม่ก่อนนะ");
    };
    const onPosTaken = () => {
      alert("ตำแหน่งนี้ถูกจองแล้ว เลือกใหม่นะ");
      setStage("setup");
    };

    socket.on("state", onState);
    socket.on("tick", onTick);
    socket.on("roster", onRoster);
    socket.on("positions", onPositions);
    socket.on("takenChars", onTakenChars);
    socket.on("characterTaken", onCharTaken);
    socket.on("joined", onJoined);
    socket.on('connect', onConnect);
    socket.on('reconnected', onReconnected);
    socket.on('sessionExpired', onSessionExpired);
    socket.on('sessionInUse', onSessionInUse);
    socket.on('rateLimited', onRateLimited);
    socket.on("full", onFull);
    socket.on("inProgress", onInProgress);
    socket.on("positionTaken", onPosTaken);
    if (socket.connected) onConnect();
    return () => {
      socket.off("state", onState);
      socket.off("tick", onTick);
      socket.off("roster", onRoster);
      socket.off("positions", onPositions);
      socket.off("takenChars", onTakenChars);
      socket.off("characterTaken", onCharTaken);
      socket.off("joined", onJoined);
      socket.off('connect', onConnect);
      socket.off('reconnected', onReconnected);
      socket.off('sessionExpired', onSessionExpired);
      socket.off('sessionInUse', onSessionInUse);
      socket.off('rateLimited', onRateLimited);
      socket.off("full", onFull);
      socket.off("inProgress", onInProgress);
      socket.off("positionTaken", onPosTaken);
    };
  }, []);

  // ---------- เพลงพื้นหลัง + เสียงเปลี่ยนเทิร์น ----------
  const prevPhase = useRef(null);
  const prevInMatch = useRef(false);
  const prevCycle = useRef(null); // ช่วงเวลาเดิม (day/night) — เปลี่ยนเมื่อไหร่ เพลงประจำช่วงต้องเริ่มใหม่จากต้น
  const cycleSeq = useRef(0);     // seq เพลงกลางวัน/กลางคืน: +1 ทุกครั้งที่สลับช่วงเวลา -> เริ่มเพลงใหม่
  const phase = stage === "connected" && state ? state.gameState : null;
  const cycle = stage === "connected" && state ? state.cycle : null;
  const skillMusic = stage === "connected" && state ? state.skillMusic : null;
  const skillMusicSeq = stage === "connected" && state ? state.skillMusicSeq : 0;
  const mandatoryCutscene = phase === "CUTSCENE" && (state?.cutscene?.kind === "overloadForce" || state?.cutscene?.kind?.startsWith("yuuki"));
  useEffect(() => {
    // CUTSCENE: หยุดเพลงพื้นหลัง ปล่อยให้เสียงในวีดีโอเล่น (เพลงสกิลมาหลังวีดีโอ)
    // ร่างแปลง (Ginga/Unicorn): เพลงสกิลทับ | ช่วงต่อสู้: เพลงกลางวัน/กลางคืน | อื่นๆ: main_home
    const battle = phase === "PLAYING" || phase === "SUMMARY" || phase === "ATTACK" || phase === "ATTACKING" || phase === "TRANSITION";
    const inMatch = battle || phase === "CUTSCENE";

    // ขอบเขตแมตช์: เริ่มเกมใหม่ / จบเกม -> รีเซ็ตตำแหน่งเพลงทั้งหมด เริ่มเพลงใหม่จากต้น
    // (การเล่นต่อจากจุดเดิมนับเฉพาะภายในแมตช์เดียวกันเท่านั้น)
    if (inMatch !== prevInMatch.current) resetMusicPositions();
    prevInMatch.current = inMatch;

    // เพลงกลางวัน/กลางคืน (patch พิเศษ): กลางวัน = new_morning | กลางคืน = new_night
    //  สลับช่วงเวลาเมื่อไหร่ seq ขยับ -> กลับมาช่วงเดิมอีกครั้งเพลงจะเริ่มใหม่จากต้น (ไม่เล่นต่อจากจุดเดิม)
    if (inMatch && cycle && prevCycle.current !== cycle) {
      if (prevCycle.current) cycleSeq.current++;
      prevCycle.current = cycle;
    }
    if (!inMatch) prevCycle.current = null;

    // โหมดประหยัด (patch 2.0.6): ข้ามวีดีโอคัตซีน — ระหว่างรอคนอื่นดูวีดีโอ เพลงเล่นต่อตามปกติ
    if (phase === "CUTSCENE" && (!lowQ || mandatoryCutscene)) stopMusic();
    else if (skillMusic) playMusic(skillMusic, skillMusicSeq); // seq เปลี่ยน = การเปิดร่างใหม่ -> เริ่มเพลงใหม่
    else if (battle || phase === "CUTSCENE") playMusic(cycle === "night" ? "new_night" : "new_morning", cycleSeq.current);
    else playMusic("main_home");

    // เปลี่ยนจาก "เลือกการ์ด" ไปสรุปผล -> เสียง trun_change (ยกเว้นเข้า cutscene)
    if (prevPhase.current === "PLAYING" && phase && phase !== "PLAYING" && phase !== "CUTSCENE") {
      playSfx("trun_change");
    }
    // เข้าเฟสโจมตี -> เสียง attack (DoomGuy: เสียงยิงตามอาวุธที่ถืออยู่ตอนโจมตี แทนเสียงทั่วไป)
    if (prevPhase.current !== "ATTACKING" && phase === "ATTACKING") {
      const doomWeapon = state?.attack?.byDoomWeapon;
      const doomShoot = doomWeapon && DOOM_WEAPON_SOUNDS[doomWeapon]?.shoot;
      const attackSound = state?.attack?.byAttackSound;
      playSfx(doomShoot || attackSound || "attack");
    }
    prevPhase.current = phase;
  }, [stage, phase, cycle, skillMusic, skillMusicSeq, lowQ, mandatoryCutscene]);

  const goCharacter = (n, pos) => {
    setName(n);
    setPosition(pos);
    setStage("character");
  };
  // extra: ตัวเลือกเพิ่มเติมตอนเลือกตัว (เช่น ชิกิ: shikiUlt = "deatheye" | "wither")
  // ต้องรอ server ตอบ (join ห้อง) เวลาไม่แน่นอน — ใช้โหมด "ค้างปิดจอ" แทนโหมดกวาดจบในตัว
  // แล้วค่อยปล่อยม่านเปิดตอนหน้าห้องรอ/เกมพร้อมแสดงจริง (ดู TransitionCurtain + useLayoutEffect ของมัน)
  const confirmCharacter = (characterId, extra) => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    curtainRef.current?.holdCover("forward");
    socket.emit("join", { name, position, characterId, ...(extra || {}) });
  };
  const leaveLobby = () => {
    saveSessionToken(null);
    socket.emit('leave');
    setState(null);
    setStage('character');
  };

  // นำทางแบบ "ปิดจอก่อน แล้วค่อยสลับเนื้อหาจริง" — ใช้กับการกดปุ่มในหน้าจอ (local, ไม่ต้องรอ server)
  // เพื่อไม่ให้เห็นหน้าใหม่โผล่มาก่อนม่านเปลี่ยนฉากจะกวาดปิดสนิท (ดู .p-curtain ใน index.css)
  // กันดับเบิ้ลคลิก/กดรัว: ระหว่างที่ม่านกำลังเล่นอยู่ (~800ms) ไม่รับคำสั่งนำทางซ้ำ กันไม่ให้ฉากเปลี่ยน 2 รอบซ้อน
  const navigate = (targetScreenKey, applyFn) => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    curtainRef.current?.preTrigger(targetScreenKey);
    setTimeout(applyFn, 340); // ~จังหวะที่แถบกวาดปิดจอสนิทพอดี (ดู keyframes pCurtainSweep)
    setTimeout(() => { navLockRef.current = false; }, 820); // ~ยาวกว่าอนิเมชันม่านทั้งหมดเล็กน้อย
  };
  // ฉากเปิดตัวผู้เล่นจบแล้ว -> ปิดจอ (local, ควบคุมได้แน่นอน) แล้วค่อยสลับเป็นสนามเกมจริง
  const finishIntro = () => navigate("game", () => setShowIntro(false));

  let screen;
  let screenKey;
  if (stage === "splash") {
    screen = <Splash onEnter={() => navigate("setup", () => setStage("setup"))} />;
    screenKey = "splash";
  } else if (stage === "setup") {
    screen = (
      <Setup
        taken={taken}
        initialName={name}
        initialPos={position}
        onNext={(n, pos) => navigate("character", () => goCharacter(n, pos))}
      />
    );
    screenKey = "setup";
  } else if (stage === "character") {
    screen = (
      <CharacterSelect
        roster={roster}
        takenChars={takenChars}
        position={position}
        name={name}
        onConfirm={confirmCharacter}
        onBack={() => navigate("setup", () => setStage("setup"))}
      />
    );
    screenKey = "character";
  } else if (!state) {
    screen = <div className="min-h-screen grid place-items-center text-lg opacity-70">กำลังเชื่อมต่อ...</div>;
    screenKey = "connecting";
  } else if (["LOBBY", "TEAM_MODE", "TEAM_SETUP"].includes(state.gameState)) {
    screen = (
      <Lobby
        state={state}
        lowQ={lowQ}
        onToggleLowQ={toggleLowQ}
        skillConfirmOn={skillConfirmOn}
        onToggleSkillConfirm={toggleSkillConfirm}
        onBack={() => navigate("character", () => leaveLobby())}
      />
    );
    screenKey = "lobby";
  } else if (showIntro) {
    // แมตช์เพิ่งเริ่ม -> เผยผู้เล่นทีละคนก่อนเสมอ (ควบคุมด้วย navigate เอง ไม่ผูกกับ state ของเกมที่เดินต่อไปเรื่อยๆ)
    screen = <GameIntro players={introPlayers} onDone={finishIntro} />;
    screenKey = "gameintro";
  } else {
    screen = <Game state={state} lowQ={lowQ} skillConfirmOn={skillConfirmOn} />;
    screenKey = "game";
  }

  return (
    <>
      <VolumeControl />
      <TransitionCurtain ref={curtainRef} screenKey={screenKey} />
      {screen}
    </>
  );
}
