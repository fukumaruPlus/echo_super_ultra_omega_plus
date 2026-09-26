import { useEffect, useRef, useState } from "react";
import { publishTick } from "./tickStore";
import { socket } from "./socket";
import { playMusic, playSfx, stopMusic, resetMusicPositions, prewarmSfx, DOOM_WEAPON_SOUNDS } from "./audio";
import { musicForState, createPhaseSoundTracker } from "./audioPolicy";
import Splash from "./screens/Splash";
import Setup from "./screens/Setup";
import CharacterSelect from "./screens/CharacterSelect";
import Lobby from "./screens/Lobby";
import Game from "./screens/Game";
import SeraphGame from "./seraph/SeraphGame";
import VolumeControl from "./components/VolumeControl";
import TransitionCurtain from "./components/TransitionCurtain";
import GameIntro from "./components/GameIntro";
import OrtArrival from "./raid/OrtArrival";

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

  // เสียงที่ดังบ่อยที่สุดในเกม: โหลดไว้ตั้งแต่เปิดหน้า ไม่ให้ไปสะดุดกลางแมตช์
  useEffect(() => { prewarmSfx(["action_button", "change_cutscene", "trun_change", "buy_something", "sc_noti", "sc_noti2", "sc_glitch"]); }, []);
  const curtainRef = useRef(null); // ม่านเปลี่ยนฉาก — ควบคุมจังหวะปิด/เปิดจอตอนสลับหน้า
  // กันดับเบิ้ลคลิก/กดรัวบนปุ่มนำทาง (ถัดไป/ยืนยัน/ย้อนกลับ) ไม่ให้ยิงคำสั่งเปลี่ยนฉากซ้อนกัน
  const navLockRef = useRef(false);
  // ฉากเปิดตัวผู้เล่นตอนแมตช์เริ่ม (LOBBY -> เกม) — เล่นก่อนเข้าฉากสนามจริงเสมอ
  const [showIntro, setShowIntro] = useState(false);
  const [introPlayers, setIntroPlayers] = useState([]);
  // Type Mercury: ฉากเปิดตัว ORT แทนฉากเปิดตัวผู้เล่น
  const [showArrival, setShowArrival] = useState(false);
  const arrivalSeqRef = useRef(null); // ฉากเปิดตัว ORT ครั้งที่เล่นไปแล้ว (กันเล่นซ้ำในการพักเกมรอบเดียวกัน)
  const prevGameStateRef = useRef(null);
  const [roster, setRoster] = useState([]);
  const [takenChars, setTakenChars] = useState([]); // ตัวละคร unique ที่มีคนเลือกไปแล้ว (คอนเนอร์ RK800)
  // สไตรเกอร์ ยูเรก้า (ตัวละครคู่): ช่องคู่หูที่ยังว่าง (หน้าเลือกตัวละคร) + บทบาทของเครื่องนี้ ("pilot" | "gunner" | null)
  const [pairSlots, setPairSlots] = useState([]);
  const [pairRole, setPairRole] = useState(null);
  const [taken, setTaken] = useState([]);
  const [name, setName] = useState("");
  const [position, setPosition] = useState(null);
  const [color, setColor] = useState(null);   // สีประจำตัวที่ผู้เล่นปรับเองในหน้าตั้งค่า
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
      // SERAPH_PLACE ต้องนับเป็น "อยู่ในแมตช์" ด้วย ไม่งั้นทุกครั้งที่เข้าเฟสเลือกสถานที่
      // ระบบจะคิดว่าออกจากแมตช์แล้วกลับเข้ามาใหม่ (เด้งฉากเปิดตัว + รีเซ็ตเพลงทั้งหมด)
      const matchStates = new Set(["PLAYING", "SERAPH_PLACE", "CUTSCENE", "SUMMARY", "ATTACK", "ATTACKING", "TRANSITION", "GAMEOVER"]);
      const wasInMatch = matchStates.has(prevGameStateRef.current);
      const nowInMatch = matchStates.has(s.gameState);
      // SE.RA.PH: **ห้ามเล่นฉากเปิดตัวผู้เล่นเด็ดขาด** — GameIntro เผยหน้า+ชื่อตัวละครของทุกคน
      //  ซึ่งทำลายแก่นของโหมด (ตัวตนต้องถูกซ่อนจนกว่าจะลงดวล) โหมดนี้มีฉากเปิดของตัวเอง
      //  คือ "บูตระบบ SE.RA.PH" ที่โชว์ทุกคนเป็นเงาดำ ??? แทน (seraph/scenes.jsx)
      //  Type Mercury: ไม่มีฉากเปิดตัวผู้เล่น — เล่นฉากเปิดตัว ORT (ม่านเตือนภัย + "หายนะกำลังมาเยือน") แทน
      //  ฉากเปิดตัว ORT: เล่นเมื่อ server กำลังพักเกมรอฉากนี้จริง (ortArrival.active) — ทั้งตอนเริ่ม Raid และตอน ORT
      //  บุกเทิร์น 60 ของโหมดปกติ (ซึ่งเกิดกลางแมตช์) · รีคอนเนกต์หลังช่วงพักจะไม่เล่นซ้ำ เพราะ active เป็น false แล้ว
      if (["LOBBY", "TEAM_MODE", "TEAM_SETUP"].includes(s.gameState)) setShowArrival(false);
      const arrival = s.ortArrival;
      if (arrival?.active && arrival.seq !== arrivalSeqRef.current) {
        arrivalSeqRef.current = arrival.seq;
        curtainRef.current?.skip("ortarrival");
        setShowArrival(true);
      } else if (!wasInMatch && nowInMatch && s.mercury) {
        // เข้ากลาง Raid (รีคอนเนกต์) — ไม่มีฉากเปิดตัวผู้เล่นด้วย
        curtainRef.current?.skip("game");
      } else if (!wasInMatch && nowInMatch && !s.seraph) {
        curtainRef.current?.skip("gameintro");
        setIntroPlayers(s.players);
        setShowIntro(true);
      }
      prevGameStateRef.current = s.gameState;
      publishTick(s.timeLeft);
      // timeLeft ไม่เก็บใน state: ดู tickStore.js
      const { timeLeft: _tick, ...rest } = s;
      setState(rest);
    };
    // ตัวเลขนับถอยหลังรายวินาที: server ส่งมาแค่ตัวเลข (ไม่ใช่ state ตัวเต็ม) เพื่อประหยัด bandwidth
    //  -> ส่งเข้า store แยก ไม่แตะ state ก้อนกระดาน จอจึงไม่ต้อง reconcile ใหม่ทุกวินาที
    const onTick = (t) => publishTick(t);
    const onRoster = (r) => setRoster(r);
    const onPositions = (t) => setTaken(t);
    const onTakenChars = (list) => setTakenChars(Array.isArray(list) ? list : []);
    const onPairSlots = (list) => setPairSlots(Array.isArray(list) ? list : []);
    const onPairRole = ({ role } = {}) => setPairRole(role || null);
    // ช่องคู่หูถูกคนอื่นรับไปก่อน (กดพร้อมกัน) -> กลับไปเลือกใหม่
    const onPairTaken = () => {
      curtainRef.current?.release();
      navLockRef.current = false;
      alert("ช่องคู่หูถูกผู้เล่นอื่นรับไปแล้ว — เลือกตัวใหม่นะ");
      setStage("character");
    };
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
      setPairRole(null);
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
    socket.on("pairSlots", onPairSlots);
    socket.on("pairRole", onPairRole);
    socket.on("pairTaken", onPairTaken);
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
      socket.off("pairSlots", onPairSlots);
      socket.off("pairRole", onPairRole);
      socket.off("pairTaken", onPairTaken);
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
  const soundTracker = useRef(createPhaseSoundTracker());
  const prevInMatch = useRef(false);
  const prevCycle = useRef(null); // ช่วงเวลาเดิม (day/night) — เปลี่ยนเมื่อไหร่ เพลงประจำช่วงต้องเริ่มใหม่จากต้น
  const cycleSeq = useRef(0);     // seq เพลงกลางวัน/กลางคืน: +1 ทุกครั้งที่สลับช่วงเวลา -> เริ่มเพลงใหม่
  const attackSeq = useRef(0);    // seq เพลงช่วงโจมตี: +1 ทุกครั้งที่เข้าช่วงโจมตี -> เริ่มเพลงใหม่เสมอ
  const prevAttackPhase = useRef(false);
  const phase = stage === "connected" && state ? state.gameState : null;
  const cycle = stage === "connected" && state ? state.cycle : null;
  const skillMusic = stage === "connected" && state ? state.skillMusic : null;
  const skillMusicSeq = stage === "connected" && state ? state.skillMusicSeq : 0;
  const mandatoryCutscene = phase === "CUTSCENE" && state?.cutscene?.kind === "overloadForce";
  useEffect(() => {
    // CUTSCENE: หยุดเพลงพื้นหลัง ปล่อยให้เสียงในวีดีโอเล่น (เพลงสกิลมาหลังวีดีโอ)
    // ร่างแปลง (Ginga/Unicorn): เพลงสกิลทับ | ช่วงต่อสู้: เพลงกลางวัน/กลางคืน | อื่นๆ: main_home
    const seraphMode = stage === "connected" && !!state?.seraph && !["LOBBY", "TEAM_MODE", "TEAM_SETUP"].includes(phase);
    const battle = phase === "PLAYING" || phase === "SUMMARY" || phase === "ATTACK" || phase === "ATTACKING" || phase === "TRANSITION";
    const inMatch = battle || phase === "CUTSCENE";

    // ขอบเขตแมตช์: เริ่มเกมใหม่ / จบเกม -> รีเซ็ตตำแหน่งเพลงทั้งหมด เริ่มเพลงใหม่จากต้น
    // (การเล่นต่อจากจุดเดิมนับเฉพาะภายในแมตช์เดียวกันเท่านั้น)
    // ⚠️ resetMusicPositions() สั่ง pause() ทุกแทร็ก และ effect ของลูกทำงาน "ก่อน" ของพ่อ
    //  ถ้าปล่อยให้ทำงานในโหมด SE.RA.PH เพลงที่ SeraphGame เพิ่งสั่งเล่นจะถูกหยุดทันที
    if (!seraphMode && inMatch !== prevInMatch.current) resetMusicPositions();
    prevInMatch.current = inMatch;

    // เพลงกลางวัน/กลางคืน (patch พิเศษ): กลางวัน = new_morning | กลางคืน = new_night
    //  สลับช่วงเวลาเมื่อไหร่ seq ขยับ -> กลับมาช่วงเดิมอีกครั้งเพลงจะเริ่มใหม่จากต้น (ไม่เล่นต่อจากจุดเดิม)
    if (inMatch && cycle && prevCycle.current !== cycle) {
      if (prevCycle.current) cycleSeq.current++;
      prevCycle.current = cycle;
    }
    if (!inMatch) prevCycle.current = null;

    // เข้าช่วงโจมตีรอบใหม่ -> ขยับ seq ให้เพลงช่วงโจมตีเริ่มจากต้นทุกครั้ง
    const inAttackPhase = phase === "ATTACK" || phase === "ATTACKING";
    if (inAttackPhase && !prevAttackPhase.current) attackSeq.current++;
    prevAttackPhase.current = inAttackPhase;

    // เพลงพื้นหลัง: โหมด SE.RA.PH คุมของตัวเองใน SeraphGame — ตรงนี้ต้องไม่ยุ่งด้วย
    //  แต่ "เสียงเอฟเฟกต์" ด้านล่างต้องทำงานทุกโหมด (เดิม early-return ตรงนี้ทำให้เสียงหายไปทั้งโหมด)
    if (!seraphMode) {
      // โหมดประหยัด (patch 2.0.6): ข้ามวีดีโอคัตซีน — ระหว่างรอคนอื่นดูวีดีโอ เพลงเล่นต่อตามปกติ
      // หน้าไตเติล: ยังไม่เล่นเพลง — เพลงหน้าหลักเริ่มหลังกดเข้าเกมเท่านั้น
      const track = stage === "splash"
        ? { name: null }
        : musicForState(stage === "connected" ? state : null, { lowQ, cycleSeq: cycleSeq.current, attackSeq: attackSeq.current });
      if (track.name) playMusic(track.name, track.seq);
      else stopMusic();
    }

    // เปลี่ยนจาก "เลือกการ์ด" ไปสรุปผล -> เสียง trun_change (ยกเว้นเข้า cutscene)
    const sounds = soundTracker.current(stage === "connected" ? state : null);
    if (sounds.roundEnded) {
      playSfx("trun_change");
    }
    // เข้าเฟสโจมตี -> เสียง attack (DoomGuy: เสียงยิงตามอาวุธที่ถืออยู่ตอนโจมตี แทนเสียงทั่วไป)
    if (sounds.attack) {
      const doomWeapon = state?.attack?.byDoomWeapon;
      const doomShoot = doomWeapon && DOOM_WEAPON_SOUNDS[doomWeapon]?.shoot;
      const attackSound = state?.attack?.byAttackSound;
      playSfx(doomShoot || attackSound || "attack");
      if (state?.attack?.byVoice) playSfx(state.attack.byVoice); // เสียงพากย์ตอนตี (โทโนะ ชิกิ)
    }
  }, [stage, phase, cycle, skillMusic, skillMusicSeq, lowQ, mandatoryCutscene, state?.cutscene?.id, state?.attack?.id, state?.roundNumber, !!(state && state.seraph)]);

  const goCharacter = (n, pos, col) => {
    setName(n);
    setPosition(pos);
    setColor(col || null);
    setStage("character");
  };
  // extra: ตัวเลือกเพิ่มเติมตอนเลือกตัว (เช่น ชิกิ: shikiUlt = "deatheye" | "wither")
  // ต้องรอ server ตอบ (join ห้อง) เวลาไม่แน่นอน — ใช้โหมด "ค้างปิดจอ" แทนโหมดกวาดจบในตัว
  // แล้วค่อยปล่อยม่านเปิดตอนหน้าห้องรอ/เกมพร้อมแสดงจริง (ดู TransitionCurtain + useLayoutEffect ของมัน)
  const confirmCharacter = (characterId, extra) => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    curtainRef.current?.holdCover("forward");
    // สไตรเกอร์ ยูเรก้า: เข้าร่วมเป็นคู่หูของตัวละครคู่ที่รออยู่ (ไม่ใช้ที่นั่งของตัวเอง)
    if (extra && extra.copilot) { socket.emit("joinCopilot", { name, characterId }); return; }
    socket.emit("join", { name, position, color, characterId, ...(extra || {}) });
  };
  const leaveLobby = () => {
    saveSessionToken(null);
    setPairRole(null);
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
    setTimeout(applyFn, 660); // ~กลางช่วงที่ละอองบังจอทึบสนิท (ดู avVeilGust)
    setTimeout(() => { navLockRef.current = false; }, 1860); // ~ยาวกว่าอนิเมชันม่านทั้งหมดเล็กน้อย
  };
  // ฉากเปิดตัวผู้เล่นจบแล้ว -> ปิดจอ (local, ควบคุมได้แน่นอน) แล้วค่อยสลับเป็นสนามเกมจริง
  // ฉากเปิดตัวมีอนิเมชันปิดฉากของตัวเอง (เผยสนามที่วางรออยู่ข้างหลัง) จึงไม่ใช้ม่านละอองคั่น
  const finishArrival = () => {
    curtainRef.current?.skip("game");
    setShowArrival(false);
  };
  const finishIntro = () => {
    curtainRef.current?.skip("game");
    setShowIntro(false);
  };

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
        initialColor={color}
        onNext={(n, pos, col) => navigate("character", () => goCharacter(n, pos, col))}
      />
    );
    screenKey = "setup";
  } else if (stage === "character") {
    screen = (
      <CharacterSelect
        roster={roster}
        takenChars={takenChars}
        pairSlots={pairSlots}
        position={position}
        color={color}
        name={name}
        onConfirm={confirmCharacter}
        onBack={() => navigate("setup", () => setStage("setup"))}
      />
    );
    screenKey = "character";
  } else if (!state) {
    screen = (
      <div className="av min-h-screen grid place-items-center" data-corrupt="3">
        <div className="av-content av-breathe av-heading text-2xl" style={{ color: "rgba(232,196,239,.6)" }}>
          กำลังเชื่อมต่อ…
        </div>
      </div>
    );
    screenKey = "connecting";
  } else if (["LOBBY", "TEAM_MODE", "TEAM_SETUP"].includes(state.gameState)) {
    screen = (
      <Lobby
        state={state}
        lowQ={lowQ}
        onToggleLowQ={toggleLowQ}
        skillConfirmOn={skillConfirmOn}
        onToggleSkillConfirm={toggleSkillConfirm}
        pairRole={pairRole}
        onBack={() => navigate("character", () => leaveLobby())}
      />
    );
    screenKey = "lobby";
  } else if (showArrival) {
    screen = (
      <>
        <Game state={state} lowQ={lowQ} skillConfirmOn={skillConfirmOn} roster={roster} muteScenes />
        <OrtArrival lowQ={lowQ} onDone={finishArrival} />
      </>
    );
    screenKey = "ortarrival";
  } else if (showIntro) {
    // แมตช์เพิ่งเริ่ม -> เผยผู้เล่นทีละคนก่อนเสมอ (ควบคุมด้วย navigate เอง ไม่ผูกกับ state ของเกมที่เดินต่อไปเรื่อยๆ)
    screen = (
      <>
        <Game state={state} lowQ={lowQ} skillConfirmOn={skillConfirmOn} roster={roster} muteScenes />
        <GameIntro players={introPlayers} onDone={finishIntro} />
      </>
    );
    screenKey = "gameintro";
  } else if (state.seraph) {
    // SE.RA.PH Moon Cell: มีฉาก/HUD ของตัวเอง (วันที่ 5 ส่งต่อให้ <Game> ข้างในอีกที)
    screen = <SeraphGame state={state} lowQ={lowQ} skillConfirmOn={skillConfirmOn} />;
    screenKey = "game";
  } else {
    screen = <Game state={state} lowQ={lowQ} skillConfirmOn={skillConfirmOn} roster={roster} pairRole={pairRole} />;
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
