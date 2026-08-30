import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "../components/Card";
import Button from "../components/Button";
import { socket } from "../socket";
import { clickSound, playSfx, videoVolume, onVolumeChange, DOOM_WEAPON_SOUNDS } from "../audio";

const P_DISPLAY = "var(--font-p-display)";
const TEAM_COLORS = { A: "#22d3ee", B: "#f97316", C: "#a3e635" };
function teamAccent(teamId) {
  return TEAM_COLORS[teamId] || "var(--color-p-accent-bright)";
}
function TeamBadge({ teamId, className = "" }) {
  if (!teamId) return null;
  const accent = teamAccent(teamId);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] sm:text-xs font-black text-black shadow-lg whitespace-nowrap ${className}`}
      style={{ background: accent, borderColor: "rgba(255,255,255,.55)", boxShadow: `0 0 14px ${accent}66` }}
    >
      Team {teamId}
    </span>
  );
}
// ขนาดจอ (อัปเดตเมื่อหมุน/ย่อขยาย) — ใช้ย่อทั้งกระดานให้พอดีจอ รองรับมือถือแนวตั้ง
function useViewport() {
  const [vp, setVp] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 720,
  }));
  useEffect(() => {
    const onResize = () => {
      const vv = window.visualViewport;
      setVp({ w: vv ? vv.width : window.innerWidth, h: vv ? vv.height : window.innerHeight });
    };
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", onResize);
    };
  }, []);
  return vp;
}

// เช็คว่าการ์ดคู่ต่อสู้คนนี้กดโจมตี/เลือกเป็นเป้าหมายได้ไหม — ใช้ร่วมกันทั้ง layout มือถือและจอใหญ่
function isTargetable(p, iAmAttacker, c) {
  const friendly = c.teamModeActive && c.myTeamId && p.teamId === c.myTeamId;
  const self = p.id === c.myId;
  const normalAttackTarget = iAmAttacker && !friendly && !p.statuses?.seal && (!c.kaiRivalId || p.id === c.kaiRivalId);
  const gunTarget = !!c.gunSel && !self && !friendly;
  const escanorSkillTarget = c.escanorSel && !self && !friendly;
  // ดาบต้องสาป (ไบเลธ แบบฟาดทันที): เลือกตัวเอง/เพื่อนร่วมทีมไม่ได้ — เดิมกดเพื่อนได้ ดาเมจถูกเกตทีมกันทิ้ง
  //  แต่ความรู้ 4 หน่วยถูกหักไปฟรี (ฝั่ง server กันซ้ำที่ prepareStrikeTarget แล้ว)
  const bylethStrikeTarget = c.bylethStrikeSel && !self && !friendly;
  // คอนเนอร์ RK800: สกิลรองเลือกใครก็ได้ที่ไม่ใช่ตัวเอง/เพื่อนร่วมทีม — ท่าไม้ตายเลือกได้เฉพาะระดับ "อาชญากร"
  //  (ฝั่ง server กันซ้ำที่ CHAR_HOOKS.conner.prepareTarget อีกชั้น ตรงนี้แค่กันกดพลาด)
  const connorTarget = !!c.connorSel && !self && !friendly && (c.connorSel !== "ultimate" || p.connorLevel === "criminal");
  const danTarget = !!c.danSel && !self && !friendly; // โมโรโบชิ ดัน: เล็งใครก็ได้ที่ไม่ใช่ตัวเอง/เพื่อนร่วมทีม
  return (normalAttackTarget || !!c.anataSel || c.dawnSel || c.appleSel || c.bbSel || c.shSel || c.skSel || c.doomSel || c.saObSel || escanorSkillTarget || c.ignisSel || c.ignisImpactSel || c.bgSel || !!c.bardPending || c.nanayaSel || c.tpSel || c.kaiCreateSel || c.kaiPunishSel || c.msMarkSel || c.msRuptureSel || c.psSealSel || bylethStrikeTarget || connorTarget || danTarget || gunTarget) && p.alive;
}
// แตะ/คลิกการ์ดคู่ต่อสู้แล้วต้องทำอะไร — ไล่ตามโหมดเลือกเป้าหมายที่เปิดอยู่ ไม่มีเลยก็โจมตีปกติ
function resolveAttackPick(id, c) {
  if (c.anataSel) return c.pickAnata(id);
  if (c.dawnSel) return c.pickDawn(id);
  if (c.appleSel) return c.pickGive(id);
  if (c.bbSel) return c.pickBb(id);
  if (c.shSel) return c.pickSh(id);
  if (c.skSel) return c.pickSk(id);
  if (c.doomSel) return c.pickDoom(id);
  if (c.saObSel) return c.pickSaOb(id);
  if (c.escanorSel) return c.pickEscanor(id);
  if (c.ignisSel) return c.pickIgnis(id);
  if (c.ignisImpactSel) return c.pickIgnisImpact(id);
  if (c.bgSel) return c.pickBg(id);
  if (c.bardPending) return c.pickBard(id);
  if (c.nanayaSel) return c.pickNanaya(id);
  if (c.tpSel) return c.pickTp(id);
  if (c.kaiCreateSel) return c.pickKaiCreate(id);
  if (c.kaiPunishSel) return c.pickKaiPunish(id);
  if (c.bylethStrikeSel) return c.pickBylethStrike(id);
  if (c.connorSel) return c.pickConnor(id);
  if (c.danSel) return c.pickDan(id);
  if (c.msMarkSel) return c.pickMsMark(id);
  if (c.msRuptureSel) return c.pickMsRupture(id);
  if (c.psSealSel) return c.pickPsSeal(id);
  if (c.gunSel) return c.pickGunTarget(id);
  return socket.emit("attack", { targetId: id });
}

// ---------- cutscene แปลงร่าง (วีดีโอเต็มจอ ครั้งแรกต่อเกมเท่านั้น) ----------
//  ~950ms แรก: การ์ดเปิดตัวเท่ๆ บอกว่าใครใช้ (ชื่อ+รูปโปรไฟล์ใหญ่ ไม่มี title ท่า)
//  วีดีโอเล่นอยู่ตลอด (ไม่หน่วง ไม่กินเวลาที่ server กำหนด) — หลังจากนั้นเหลือแค่ title ท่ามุมบน ไม่มีรูปทับอีก
function Cutscene({ cs }) {
  const ref = useRef(null);
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.volume = videoVolume(); // ผ่าน master volume curve เดียวกับเสียงอื่น
    v.currentTime = 0;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); // กัน autoplay block
    // เลื่อนหลอดเสียงระหว่างวีดีโอ -> อัปเดตทันที
    return onVolumeChange(() => { if (ref.current) ref.current.volume = videoVolume(); });
  }, [cs.id]); // remount ต่อ cutscene -> เล่นวีดีโอใหม่เสมอ (กันจอดำตอนท่าเดียวกันต่อกัน)
  useEffect(() => {
    // noIntro (โมโรโบชิ ดัน "ครูฝึกสุดเหี้ยม"): คลิปสั้นมาก — ข้ามการ์ดเปิดตัวไปเข้าวีดีโอเลย
    if (cs.noIntro) { setIntroDone(true); return; }
    setIntroDone(false);
    const t = setTimeout(() => setIntroDone(true), 950);
    return () => clearTimeout(t);
  }, [cs.id, cs.noIntro]);

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      <video ref={ref} src={cs.video} poster={cs.img || undefined} preload="auto" autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-white cut-flash pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle, transparent 45%, rgba(0,0,0,0.75) 100%)" }} />
      {!introDone && (
        <div className="absolute inset-0 z-10 bg-black/70 flex flex-col items-center justify-center gap-3 transition-opacity duration-200">
          <div className="flex items-center gap-3">
            <div className="cut-portrait cut-glow rounded-2xl overflow-hidden w-32 h-32 sm:w-44 sm:h-44 border-4" style={{ borderColor: cs.color, "--cut-color": cs.color }}>
              <img src={cs.img} alt="" className="w-full h-full object-cover" />
            </div>
            {cs.img2 && (
              <div className="cut-portrait cut-glow rounded-2xl overflow-hidden w-32 h-32 sm:w-44 sm:h-44 border-4" style={{ borderColor: cs.color, "--cut-color": cs.color }}>
                <img src={cs.img2} alt="" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
          <div className="cut-title text-3xl sm:text-4xl font-black drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            <span style={{ color: cs.color }}>{cs.name}</span>
          </div>
          {cs.label && <div className="text-lg sm:text-xl font-bold opacity-90 -mt-2">{cs.label}!</div>}
        </div>
      )}
      {introDone && (
        <div className="absolute top-[8%] inset-x-0 text-center px-4 transition-opacity duration-200">
          <div className="cut-title glitch text-4xl sm:text-6xl font-black" data-text={cs.title}>{cs.title}</div>
        </div>
      )}
    </div>
  );
}

// ---------- ยูนะ ไอดอลประจำสนาม: ฉากเปิดตัวสไตล์ Persona (การ์ดตัวละครพุ่งเข้าจอ+กลิตช์) แล้วค่อยตัดเข้าวีดีโอ ----------
//  ต่างจาก Cutscene ทั่วไปตรงที่ไม่มีการ์ดพอร์เทรตซ้อนทับวีดีโออีก (สเตจ build-up ทำหน้าที่แนะนำตัวไปแล้ว)
//  วีดีโอมีเสียงของตัวเอง — เพลงของเพลงที่เลือก (Longing/Delete/...) เริ่มเล่นเป็น BGM ล็อกเองอัตโนมัติทันทีที่ server ออกจากเฟส CUTSCENE (ดู state.skillMusic)
function YunaCutscene({ cs }) {
  const ref = useRef(null);
  const [stage, setStage] = useState(0); // 0 = Persona build-up, 1 = วีดีโอ
  useEffect(() => {
    setStage(0);
    const t = setTimeout(() => setStage(1), 1200);
    return () => clearTimeout(t);
  }, [cs.id]);
  useEffect(() => {
    if (stage !== 1) return;
    const v = ref.current;
    if (!v) return;
    v.volume = videoVolume();
    v.currentTime = 0;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    return onVolumeChange(() => { if (ref.current) ref.current.volume = videoVolume(); });
  }, [cs.id, stage]);

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* mode="wait" ออก — เดิมรอให้สเตจ 0 เฟดออกจบก่อน (250ms) ค่อยmountวีดีโอ กินเวลาจากงบรวมเพิ่มโดยไม่จำเป็น
          ตอนนี้วีดีโอ mount+เริ่มโหลด/เล่นทันทีตอนสเตจเปลี่ยน ซ้อนทับช่วงเฟดออกของสเตจ 0 แทน */}
      <AnimatePresence>
        {stage === 0 ? (
          <motion.div key="buildup" className="absolute inset-0 grid place-items-center overflow-hidden" exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="p-curtain">
              <div className="p-curtain-bar p-curtain-bar-a" />
              <div className="p-curtain-bar p-curtain-bar-b" />
              <div className="p-curtain-bar p-curtain-bar-c" />
            </div>
            <motion.img
              src={cs.img} alt=""
              className="relative z-10 h-[65vh] max-h-[520px] w-auto drop-shadow-[0_0_60px_rgba(201,167,255,0.7)]"
              initial={{ x: -400, opacity: 0, rotate: -6 }}
              animate={{ x: 0, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
            />
            <motion.div
              className="glitch-p absolute bottom-[14%] text-4xl sm:text-6xl font-black text-white z-10 text-hard"
              data-text={cs.name}
              initial={{ opacity: 0, letterSpacing: "0.6em" }}
              animate={{ opacity: 1, letterSpacing: "0.08em" }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {cs.name}
            </motion.div>
            <motion.div
              className="absolute bottom-[7%] text-lg sm:text-2xl font-bold z-10 text-hard"
              style={{ color: cs.color }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.55 }}
            >
              ♪ {cs.title}
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key="video" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <video ref={ref} src={cs.video} preload="auto" autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-lg sm:text-2xl font-bold z-10 text-hard" style={{ color: cs.color }}>
              ♪ {cs.title}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Overload Force: วิดีโอเต็มจอโดยไม่มีโปรไฟล์หรือการ์ดตัวละครซ้อน
function OverloadForceCutscene({ cs }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.volume = videoVolume();
    v.currentTime = 0;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    return onVolumeChange(() => { if (ref.current) ref.current.volume = videoVolume(); });
  }, [cs.id]);
  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      <video ref={ref} src={cs.video} preload="auto" autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
    </div>
  );
}

// ---------- อนิเมชันบอกว่าใครตีใคร + สกิลที่มีผลกับการโจมตีครั้งนี้ ----------
//  แถวสกิลข้างใต้บอกว่า "ทำไมความเสียหายถึงเป็นเท่านี้ / ทำไมป้องกันได้"
//  choreography ใหม่: พุ่งเข้าปะทะ -> แฟลชกระทบ -> ตัวเลข/ผล -> สกิลไล่เข้าทีละใบ — ทั้งหมดต้องจบภายใน a.fxMs (server เป็นคนคุมเวลาตัดฉาก)
// การ์ดเหตุผลดาเมจ 1 ใบ (แถวใครตี/ป้องกันด้วยอะไร) — ต้องอยู่นอก AttackFx เป็น component คงที่
//  ถ้าประกาศซ้อนอยู่ข้างในจะได้ function reference ใหม่ทุก re-render (ทุกครั้งที่ state broadcast เข้ามาระหว่างฉากโจมตี)
//  ทำให้ React มองว่าเป็นคนละ component แล้ว unmount/remount เล่นอนิเมชันบินเข้าใหม่ซ้ำๆ ทั้งที่ข้อมูลเดิม
function AttackSkillCard({ s, i }) {
  return (
    <motion.div
      className="flex items-center gap-2 bg-black/70 rounded-xl px-2.5 py-1.5 border border-white/15 w-full max-w-[15rem]"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: i * 0.08 }}
    >
      {s.img ? (
        <img src={s.img} alt="" className="w-14 h-10 object-cover rounded-lg shrink-0" />
      ) : (
        <span className="w-10 h-10 grid place-items-center text-xl shrink-0">✦</span>
      )}
      <div className="text-left leading-tight min-w-0">
        <div className="text-sm sm:text-base font-bold text-echo-gold">{s.name}</div>
        <div className="text-xs sm:text-sm font-bold truncate" style={{ color: s.color }}>{s.by}</div>
      </div>
    </motion.div>
  );
}

function AttackFx({ a }) {
  const total = a.fxMs || 3000;
  const [stage, setStage] = useState(0); // 0=พุ่งเข้า/แฟลช 1=ผลลัพธ์ 2=สกิลไล่เข้า
  useEffect(() => {
    setStage(0);
    const t1 = setTimeout(() => setStage(1), Math.min(420, total * 0.3));
    const t2 = setTimeout(() => setStage(2), Math.min(650, total * 0.42));
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [a.id, total]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/55 overflow-hidden">
      {/* แฟลชกระทบ — วาบครั้งเดียวตอนเข้าสเตจผล */}
      <AnimatePresence>
        {stage >= 1 && (
          <motion.div
            key="flash"
            className="absolute inset-0 bg-white pointer-events-none"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
      <div className="flex flex-col items-center gap-3 text-hard px-3">
        <div className="flex items-center gap-4 sm:gap-8">
          <motion.div
            className="flex flex-col items-center gap-1"
            initial={{ x: -160, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="rounded-2xl overflow-hidden w-24 h-24 sm:w-28 sm:h-28 border-4 -rotate-3" style={{ borderColor: a.byColor }}>
              <img src={a.byImg} alt="" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-base sm:text-lg" style={{ color: a.byColor }}>{a.byName}</span>
          </motion.div>
          <AnimatePresence mode="wait">
            {stage >= 1 && (
              <motion.div
                key="result"
                className="text-center"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: "backOut" }}
              >
                <div className="text-4xl sm:text-5xl">{a.dodge ? "💨" : a.kill ? "💀" : "⚔️"}</div>
                {a.dodge ? (
                  <div className="text-3xl sm:text-4xl font-black text-echo-cyan drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">หลบพ้น!</div>
                ) : a.kill ? (
                  <div className="text-3xl sm:text-4xl font-black text-echo-hp drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">สังหาร!</div>
                ) : (
                  <div className="text-4xl sm:text-5xl font-black text-echo-hp drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">-{a.dmg}</div>
                )}
                {a.revenge && <div className="text-xs text-echo-gold font-bold">NT-D แก้แค้น!</div>}
                {a.aoe && <div className="text-xs">ตีหมู่!</div>}
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div
            className="flex flex-col items-center gap-1"
            initial={{ scale: 1 }}
            animate={stage >= 1 ? { x: [0, 10, -6, 0], scale: [1, 0.94, 1] } : {}}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {/* สั่นแค่ตอนกระทบ (stage 1) — พอขึ้นกล่องเหตุผลดาเมจ (stage 2) หยุดสั่น กันบังตากับกล่องข้อมูล */}
            <div className={`${stage === 1 ? "shake" : ""} rounded-2xl overflow-hidden w-24 h-24 sm:w-28 sm:h-28 border-4 rotate-3`} style={{ borderColor: a.targetColor }}>
              <img src={a.targetImg} alt="" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-base sm:text-lg" style={{ color: a.targetColor }}>{a.targetName}</span>
          </motion.div>
        </div>
        {stage >= 2 && a.skills && a.skills.length > 0 && (() => {
          // แยกฝั่งชัดเจน: ซ้าย = สกิลฝั่งโจมตี | ขวา = สกิลฝั่งป้องกัน (ไม่ปนกันตรงกลาง)
          const atk = a.skills.filter((s) => (s.side ? s.side === "atk" : s.by === a.byName));
          const def = a.skills.filter((s) => (s.side ? s.side === "def" : s.by !== a.byName));
          const both = atk.length > 0 && def.length > 0;
          return (
            <div className="grid grid-cols-2 gap-x-4 w-full max-w-2xl items-start">
              <div className={`flex flex-col items-center gap-1.5 ${both ? "border-r-2 border-white/25 pr-4" : ""}`}>
                {atk.length > 0 && (
                  <div className="text-sm sm:text-base font-black bg-black/60 rounded-full px-4 py-0.5 border" style={{ color: a.byColor, borderColor: a.byColor }}>
                    ⚔️ ฝั่งโจมตี
                  </div>
                )}
                {atk.map((s, i) => <AttackSkillCard key={i} s={s} i={i} />)}
              </div>
              <div className="flex flex-col items-center gap-1.5 pl-1">
                {def.length > 0 && (
                  <div className="text-sm sm:text-base font-black bg-black/60 rounded-full px-4 py-0.5 border" style={{ color: a.targetColor, borderColor: a.targetColor }}>
                    🛡️ ฝั่งป้องกัน
                  </div>
                )}
                {def.map((s, i) => <AttackSkillCard key={i} s={s} i={i} />)}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ---------- ประกาศเปลี่ยนร่าง (บนกระดานเกม หลังวีดีโอจบ) ----------
//  วีดีโอจบ -> กลับมากระดาน -> เอฟเฟกต์ระเบิด + เสียงพากย์เล่นให้จบ (ไม่มีเพลงแทรก) แล้วค่อยไปต่อ
//  แดง = สวมเกราะราชัน | เขียว = Beat Mode
function TransformAnnounce({ cs }) {
  useEffect(() => {
    if (cs.voice) playSfx(cs.voice); // เสียงแปลงร่าง เล่นต่อจากวีดีโอบนกระดาน
  }, [cs.id]);
  const red = cs.kind === "rachan";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center pointer-events-none overflow-hidden">
      <div className={`absolute inset-0 ${red ? "xfx-flash-red" : "xfx-flash-green"}`} />
      <div className={`xfx-burst ${red ? "xfx-burst-red" : "xfx-burst-green"}`} />
      <div className="relative flex flex-col items-center gap-3 pop-in text-hard px-4 text-center">
        <div className={`rounded-2xl overflow-hidden w-28 h-28 sm:w-36 sm:h-36 border-4 ${red ? "aura-rachan" : "aura-beat"}`} style={{ borderColor: cs.color }}>
          <img src={cs.img} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="text-3xl sm:text-5xl font-black" style={{ color: red ? "#ff5747" : "#4ade80" }}>
          <span style={{ color: cs.color }}>{cs.name}</span> {cs.label || "เปลี่ยนร่าง!"}
        </div>
        <div className="text-xl sm:text-2xl font-bold bg-black/55 rounded-full px-5 py-1">{cs.title}</div>
      </div>
    </div>
  );
}

// ---------- สกิลช่วงจั่วการ์ด: เด้งขึ้นทันทีบนกระดาน (ไม่ตัดเข้าจอดำ) ----------
function SkillFlash({ f }) {
  return (
    <div className="absolute top-[58%] left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="pop-in flex items-center gap-3 bg-black/75 rounded-2xl px-4 py-2 border-2 text-hard" style={{ borderColor: f.color }}>
        {f.img ? (
          <img src={f.img} alt="" className="w-16 h-11 object-cover rounded-lg" />
        ) : (
          <span className="text-2xl">✦</span>
        )}
        <div className="text-left leading-tight">
          <div className="text-lg font-black text-echo-gold">{f.name}</div>
          <div className="text-sm font-bold" style={{ color: f.color }}>{f.by} ใช้สกิล</div>
        </div>
      </div>
    </div>
  );
}

// ---------- โหมดประหยัด (patch 2.0.6): ข้ามวีดีโอคัตซีน — แจ้งเตือนแทน แต่ยังรอเวลาเท่าวีดีโอจริง ----------
//  ผู้เล่นที่เปิดโหมดนี้จะเห็นแค่ว่าใครเปิดท่าไม้ตาย/สกิลอะไร พร้อมนับถอยหลังรอคนอื่นดูวีดีโอจบ
function CutsceneSkipNotice({ cs, timeLeft }) {
  return (
    <div className="fixed top-[32%] left-1/2 -translate-x-1/2 z-40 pointer-events-none px-3 max-w-full">
      <div className="pop-in flex items-center gap-3 bg-black/85 rounded-2xl px-4 py-2.5 border-2 text-hard" style={{ borderColor: cs.color }}>
        {cs.img ? (
          <img src={cs.img} alt="" className="w-16 h-16 object-cover rounded-xl border-2 shrink-0" style={{ borderColor: cs.color }} />
        ) : (
          <span className="text-2xl">✦</span>
        )}
        <div className="text-left leading-tight">
          <div className="text-lg font-black" style={{ color: cs.color }}>{cs.name} {cs.label || "ปล่อยท่าไม้ตาย"}!</div>
          <div className="text-sm font-bold text-echo-gold">{cs.title}</div>
          <div className="text-xs opacity-80 mt-0.5">🎬 โหมดประหยัด — รอผู้เล่นอื่นดูวีดีโอให้จบ ({timeLeft} วิ)</div>
        </div>
      </div>
    </div>
  );
}

// ---------- แจ้งเตือนแปลงร่างซ้ำ (ครั้งที่ 2 เป็นต้นไป): การ์ดเล็กๆ ไม่หยุดเกม ----------
function TransformNotice({ n }) {
  return (
    <div className="fixed top-[58%] left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="pop-in flex items-center gap-3 bg-black/75 rounded-2xl px-4 py-2 border-2 text-hard" style={{ borderColor: n.color }}>
        {n.img ? (
          <img src={n.img} alt="" className="w-16 h-16 object-cover rounded-xl border-2 shrink-0" style={{ borderColor: n.color }} />
        ) : (
          <span className="text-2xl">✦</span>
        )}
        <div className="text-left leading-tight">
          <div className="text-lg font-black" style={{ color: n.color }}>{n.name}</div>
          <div className="text-sm font-bold text-echo-gold">{n.title} {n.label}!</div>
        </div>
      </div>
    </div>
  );
}

// ป้ายหลักสูตรของไบเลธ — วางตำแหน่งเดียวกับป้าย Overload Force (เลื่อนลงถ้าโชว์พร้อมกัน)
//  ทุกคนกดอ่านได้ว่าหลักสูตรที่เปิดอยู่ตอนนี้มีผลอะไรบ้าง (ไม่ใช่ปุ่มของเจ้าของท่าคนเดียว)
function BylethCourseBadge({ course, shifted, onOpen }) {
  const c = BYLETH_COURSE_BY_KEY[course];
  if (!c) return null;
  return (
    <div className={`fixed ${shifted ? "top-[calc(58%+8rem)]" : "top-[calc(58%+5.5rem)]"} left-1/2 -translate-x-1/2 z-40`}>
      <button
        onClick={() => { clickSound(); onOpen(); }}
        className="pop-in whitespace-nowrap text-sm font-black bg-black/75 px-4 py-1 rounded-full border text-hard hover:scale-105 transition"
        style={{ color: c.color, borderColor: `${c.color}99` }}
        title="แตะเพื่อดูว่าหลักสูตรนี้มีผลอะไรบ้าง"
      >
        {c.icon} {c.name} <span className="opacity-70">(แตะดูรายละเอียด)</span>
      </button>
    </div>
  );
}

// หน้าต่างอธิบายผลของหลักสูตรที่เปิดอยู่ — เปิดได้จากป้ายกลางจอ ทุกคนอ่านได้
function BylethCourseInfoModal({ course, onClose }) {
  const c = BYLETH_COURSE_BY_KEY[course];
  if (!c) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2" style={{ borderColor: c.color }} onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-black" style={{ color: c.color }}>{c.icon} {c.name}</div>
        <div className="text-xs opacity-70 mb-2">หลักสูตรการสอนของอาจารย์ ไบเลธ — มีผลกับทั้งสนามจนกว่าแต้มความรู้จะหมดหรือไบเลธกดปิดเอง</div>
        <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm leading-relaxed">{c.desc}</div>
        <Button className="mt-3 w-full" onClick={() => { clickSound(); onClose(); }}>ปิด</Button>
      </div>
    </div>
  );
}

function OverloadForceBadge() {
  return (
    <div className="fixed top-[calc(58%+5.5rem)] left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="pop-in whitespace-nowrap text-sm font-black text-cyan-200 bg-black/75 px-4 py-1 rounded-full border border-cyan-300/60 text-hard">
        ⚡ Overload Force
      </div>
    </div>
  );
}

// ---------- ฉากหลังกลางวัน/กลางคืน (patch 1.7) ----------
//  กลางวัน = background_morning.jpg | กลางคืน = background_night.jpg
//  เปลี่ยนช่วงเวลาแบบ crossfade ช้าๆ (ไม่ตัดปุ๊บปั๊บ) — ซ้อนทั้ง 2 ภาพแล้วเฟดสลับกัน
//  ระหว่าง Lie Like Vortigern (โอเบรอน) ฉากหลังกลางคืนกลายเป็นวีดีโอ oberon_background.mp4 (เฟดเข้า)
function GameBackground({ cycle, oberonBg, shradeBg, bardBg, shikiBg, hakunoBg, hisakawaBg, overloadForce, lowQ }) {
  const night = cycle === "night";
  return (
    <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
      <img
        src="/image/background_morning.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[3000ms] ease-in-out"
        style={{ opacity: night ? 0 : 1 }}
      />
      <img
        src="/image/background_night.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[3000ms] ease-in-out"
        style={{ opacity: night ? 1 : 0 }}
      />
      {/* ราตรีของชเรด เอลัน (ร่างสปาด้า): ทุกค่ำคืน ฉากหลังกลายเป็น change_fill.jpg */}
      {shradeBg && (
        <img
          src="/characters/shrade_elan/change_fill.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover bg-fade-in"
        />
      )}
      {/* มิติมายาบรรเลง (Bard): โลหิต = ตอนเช้า / วิญญาณ = ตอนกลางคืน (ทับฉากหลังอื่นทั้งหมด) */}
      {bardBg && (
        <img
          src={bardBg === "blood" ? "/characters/bard/bard_bg_blood.png" : "/characters/bard/bard_bg_soul.png"}
          alt=""
          className="absolute inset-0 w-full h-full object-cover bg-fade-in"
        />
      )}
      {!lowQ && night && oberonBg && (
        <video
          src="/characters/oberon/oberon_background.mp4"
          preload="metadata" autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover bg-fade-in"
        />
      )}
      {/* ฉันมองเห็นมันแล้ว (ชิกิ): ซ้อน shiki_fill.png ทับฉากหลังปัจจุบันระหว่างท่าไม้ตายทำงาน */}
      {shikiBg === "eye" && (
        <img
          src="/characters/shiki/shiki_fill.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover bg-fade-in"
        />
      )}
      {/* ความตายที่โรยรา (ชิกิ patch 2.0.6): ฉากหลังกลายเป็นวีดีโอ shiki_fill2.mp4 ระหว่างท่าไม้ตาย 2 ทำงาน */}
      {shikiBg === "wither" && !lowQ && (
        <video
          src="/characters/shiki/shiki_fill2.mp4"
          preload="metadata" autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover bg-fade-in"
        />
      )}
      {shikiBg === "wither" && lowQ && (
        <img
          src="/characters/shiki/shiki2.jpg"
          alt=""
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover bg-fade-in"
        />
      )}
      {/* MOON*CELL (คิชินามิ ฮาคุโนะ patch 2.2.1): ซ้อน hakuno_fill.jpg ทับฉากหลังปัจจุบันระหว่างท่าไม้ตายทำงาน */}
      {hakunoBg && (
        <img
          src="/characters/hakuno/hakuno_fill.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover bg-fade-in"
        />
      )}
      {hisakawaBg && (
        <img
          src="/characters/hisakawa_sister/skill3/hisakawa_skill3_background.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-cover bg-fade-in"
        />
      )}
      {overloadForce && (
        <img
          src="/overload_force/back_cyber.gif"
          alt=""
          className="absolute inset-0 w-full h-full object-cover bg-fade-in"
        />
      )}
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute inset-0 p-board-overlay" />
    </div>
  );
}

// ---------- แบนเนอร์สลับช่วงเวลา (กลางวัน <-> กลางคืน ทุก 3 เทิร์น) ----------
//  c.oberon = "ราตรีกลืนกิน": โอเบรอนใช้ท่าไม้ตาย 2 — ฉากหลังวีดีโอ + เพลงประจำตัว จนกว่าจะหมดกลางคืน
// ---------- ฉากสลับกลางวัน/กลางคืน: วอชสีเต็มจอ + แถบแสงกวาดแนวทแยง + ไอคอนลอยขึ้นเรืองแสง + ข้อความคลี่ตัว ----------
function CycleBanner({ c }) {
  const night = c.cycle === "night";
  const accent = night ? "#818cf8" : "#f6ad3c";
  const title = night ? (c.oberon ? "ราตรีกลืนกิน" : "ราตรีมาเยือน") : "รุ่งอรุณมาถึง";
  const sub = night ? (c.oberon ? "ราชาแห่งการหลอกลวงครอบงำราตรี — จนกว่าฟ้าจะสาง" : "สุ่มสกิลพื้นฐาน/สกิลรองแพงขึ้น +1 ทุกเทิร์น") : "จบเทิร์นได้แต้มสกิลเพิ่ม +1";
  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden">
      {/* วอชสีเต็มจอ วาบแล้วจางหาย */}
      <motion.div
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 32%, ${accent}4d, transparent 62%)` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 2.2, times: [0, 0.3, 1], ease: "easeInOut" }}
      />
      {/* แถบแสงกวาดแนวทแยงผ่านจอครั้งเดียว */}
      <motion.div
        className="absolute inset-y-0"
        style={{ width: "38vw", background: `linear-gradient(100deg, transparent, ${accent}66, transparent)`, transform: "skewX(-12deg)" }}
        initial={{ left: "-40vw" }}
        animate={{ left: "108vw" }}
        transition={{ duration: 1, ease: [0.6, 0, 0.3, 1] }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-hard">
        <motion.div
          className="text-7xl sm:text-8xl"
          style={{ filter: `drop-shadow(0 0 28px ${accent})` }}
          initial={{ y: 70, opacity: 0, scale: 0.5 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.65, ease: [0.2, 0.8, 0.2, 1.2] }}
        >
          {night ? (c.oberon ? "🌑" : "🌙") : "☀️"}
        </motion.div>
        <motion.div
          className="text-3xl sm:text-4xl font-black"
          style={{ color: accent }}
          initial={{ opacity: 0, letterSpacing: "0.6em" }}
          animate={{ opacity: 1, letterSpacing: "0.04em" }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
        >
          {title}
        </motion.div>
        <motion.div
          className="text-sm sm:text-base font-bold bg-black/55 rounded-full px-4 py-1"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {sub}
        </motion.div>
      </div>
    </div>
  );
}

// ---------- ฉากสรุปผล: ลีดเดอร์บอร์ดแนวนอน — แถวผู้ชนะ (ทองเรืองแสง เข้าจากซ้าย) บนสุด
//  ตามด้วยแถวผู้แพ้ (เข้าจากขวา มีเลขอันดับ) ด้านล่าง — คนละภาษาการออกแบบกับพอร์เทรตคู่แบบเดิมโดยสิ้นเชิง ----------
function SummaryTiers({ winners, losers, compact }) {
  if (!winners.length && !losers.length) return null;
  const winAvatar = compact ? "w-12 h-12" : "w-14 h-14 sm:w-16 sm:h-16";
  const loseAvatar = compact ? "w-9 h-9" : "w-10 h-10 sm:w-11 sm:h-11";
  return (
    <div className="flex flex-col gap-2 w-full">
      {winners.map((p, i) => (
        <motion.div
          key={p.id}
          className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 overflow-hidden"
          style={{
            background: "linear-gradient(100deg, rgba(229,179,59,.4), rgba(229,179,59,.08) 70%)",
            border: "2px solid #e5b33b",
            boxShadow: "0 0 22px -4px rgba(229,179,59,.7)",
          }}
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.45, delay: i * 0.12, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <span className="text-2xl sm:text-3xl shrink-0">🏆</span>
          <img src={p.img} alt="" className={`${winAvatar} rounded-full object-cover border-2 shrink-0`} style={{ borderColor: p.color }} />
          <div className="min-w-0 flex-1">
            <div className="font-black truncate text-sm sm:text-base" style={{ color: p.color }}>{p.name}</div>
            <div className="text-[10px] sm:text-xs font-bold text-echo-gold opacity-90">ผู้ชนะ</div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-echo-gold shrink-0">{p.busted ? "แตก!" : p.score}</div>
        </motion.div>
      ))}
      {losers.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1 border-t border-white/10 pt-2">
          {losers.map((p, i) => (
            <motion.div
              key={p.id}
              className="flex items-center gap-2 sm:gap-2.5 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 bg-white/5 border border-white/10"
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 0.85 }}
              transition={{ duration: 0.35, delay: 0.15 + i * 0.07, ease: "easeOut" }}
            >
              <span className="text-[10px] sm:text-xs font-black opacity-50 w-4 text-center shrink-0">{i + 2}</span>
              <img src={p.img} alt="" className={`${loseAvatar} rounded-full object-cover grayscale border shrink-0`} style={{ borderColor: p.color }} />
              <div className="min-w-0 flex-1 text-xs sm:text-sm font-bold truncate" style={{ color: p.color }}>{p.name}</div>
              <div className="text-xs sm:text-sm font-bold text-echo-hp shrink-0">{p.busted ? "แตก!" : p.score}</div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// overlay ที่ใช้ร่วมกันทั้ง layout มือถือและจอใหญ่ (อนิเมชันตีกัน/ประกาศเปลี่ยนร่าง/แจ้งเตือนคัตซีน/สกิลแฟลช/แบนเนอร์กลางวันคืน)
function OverlayLayer({ phase, attack, csAnnounce, csSkipped, timeLeft, flash, notice, cycleFx, overloadForce, bylethCourse, onOpenBylethCourse }) {
  return (
    <>
      {phase === "ATTACKING" && attack && <AttackFx key={attack.id} a={attack} />}
      {csAnnounce && <TransformAnnounce key={csAnnounce.id} cs={csAnnounce} />}
      {csSkipped && <CutsceneSkipNotice key={csSkipped.id} cs={csSkipped} timeLeft={timeLeft} />}
      {flash && <SkillFlash key={flash.id} f={flash} />}
      {notice && <TransformNotice key={notice.id} n={notice} />}
      {overloadForce && <OverloadForceBadge />}
      {bylethCourse && <BylethCourseBadge course={bylethCourse} shifted={!!overloadForce} onOpen={onOpenBylethCourse} />}
      {cycleFx && <CycleBanner key={cycleFx.id} c={cycleFx} />}
    </>
  );
}

// modal ต่างๆ ที่ต้อง mount ร่วมกันทั้ง layout มือถือและจอใหญ่ (ลำดับเดียวกันทั้งสองที่ กัน stacking เพี้ยน)
function ModalMounts({
  showChar, ch, me, onCloseChar,
  hakunoCmdOpen, onUseHakunoCmd, onCloseHakunoCmd,
  appleOpen, onPickAppleItem, onCloseApple,
  tohnoOpen, onPickTohnoLevel, onCloseTohno,
  connorArrestAsk, onAnswerConnorArrest,
  contractOffer, onAnswerContract,
  locaOffer, onAnswerLoca,
  renewAsk, onAnswerRenew,
  allyChoices, onPickAlly, onDeclineAlly,
  phenexReleaseAsk, onPickPhenexRelease,
  batKarmaAsk, onPickBatKarma,
  allyOfferAsk, onAnswerAllyOffer,
  allyBreakAsk, onAnswerAllyBreak,
  allyFinalAsk, onAnswerAllyFinal,
  statusView, statusViewIsSelf, onCloseStatus,
  shopOpen, shop, onCloseShop,
  bagOpen, onCloseBag, players, gameState, roundNumber, onPickGunAmmo,
  skillConfirm, onConfirmSkill, onCancelSkill,
}) {
  return (
    <>
      {showChar && ch && <CharModal ch={ch} me={me} onClose={onCloseChar} />}
      {hakunoCmdOpen && me && <HakunoCommandModal me={me} onUse={onUseHakunoCmd} onClose={onCloseHakunoCmd} />}
      {appleOpen && me && <AppleItemModal me={me} onPick={onPickAppleItem} onClose={onCloseApple} />}
      {tohnoOpen && me && <TohnoLevelModal me={me} onPick={onPickTohnoLevel} onClose={onCloseTohno} />}
      {connorArrestAsk && me?.alive && <ConnorArrestModal ask={connorArrestAsk} onAnswer={onAnswerConnorArrest} />}
      {contractOffer && me?.alive && <ContractOfferModal offer={contractOffer} onAnswer={onAnswerContract} />}
      {locaOffer && me?.alive && <LocaOfferModal offer={locaOffer} onAnswer={onAnswerLoca} />}
      {renewAsk && me?.alive && <ContractRenewModal ask={renewAsk} points={me.skillPoints} onAnswer={onAnswerRenew} />}
      {allyChoices && me?.alive && <AllyChoiceModal choices={allyChoices} onPick={onPickAlly} onDecline={onDeclineAlly} />}
      {phenexReleaseAsk && <PhenexReleaseModal ask={phenexReleaseAsk} onPick={onPickPhenexRelease} />}
      {batKarmaAsk && <BatKarmaModal ask={batKarmaAsk} onPick={onPickBatKarma} />}
      {allyOfferAsk && me?.alive && <AllyOfferModal offer={allyOfferAsk} onAnswer={onAnswerAllyOffer} />}
      {allyBreakAsk && me?.alive && <AllyBreakModal ask={allyBreakAsk} onAnswer={onAnswerAllyBreak} />}
      {allyFinalAsk && me?.alive && <AllyFinalModal ask={allyFinalAsk} onAnswer={onAnswerAllyFinal} />}
      {statusView && <StatusModal p={statusView} statusOnly={statusViewIsSelf} onClose={onCloseStatus} />}
      {shopOpen && <ShopModal shop={shop} me={me} onClose={onCloseShop} />}
      {bagOpen && <InventoryModal me={me} players={players} gameState={gameState} roundNumber={roundNumber} onPickGunAmmo={onPickGunAmmo} onClose={onCloseBag} />}
      {skillConfirm && <SkillConfirmModal confirm={skillConfirm} onConfirm={onConfirmSkill} onCancel={onCancelSkill} />}
      <GutsVideoPreloader me={me} players={players} />
    </>
  );
}

// ชื่อเฟส (โชว์อนิเมชันตอนเปลี่ยนเฟส)
const PHASE_NAMES = { PLAYING: "🎴 สุ่มการ์ด", ATTACK: "⚔️ โจมตี" };

// สถานะที่ผูกกับท่าไม้ตายของแต่ละตัวละคร — ใช้เช็คว่ากำลังมีผลอยู่ไหม (กดซ้ำไม่ได้จนกว่าจะหมดเวลา)
//  หมายเหตุ: โคโตเนะไม่อยู่ในตารางนี้ — สถานะ kready คือ "ร่าง [พร้อมลุย]" ที่ต้องยังอยู่ตอนกดท่าไม้ตายในร่าง
//  (Self-affirmation Explosion! Love Love) ถ้าผูกไว้ที่นี่ ปุ่มท่าไม้ตายจะถูกปิดตลอดเวลาที่อยู่ในร่าง = กด ULT5 ไม่ได้เลย
//  เงื่อนไขกดซ้ำของโคโตเนะคุมด้วย ktUltLocked ด้านล่าง (+ CHAR_HOOKS.kotone.canUseSkill ฝั่ง server) อยู่แล้ว
const ULTIMATE_STATUS = { hikaru: "gingastrium", kuwagata: "rachan", banagher: "paradise", temari: "anata", gambler: "golden", eva13: "fourth", appleguy: "chill", shiki: "deatheye", miyako: "miyakoUlt", hakuno: "moonCell", takumi: "takumiBlackout", bat_ben: "batTaunt", princess_shiki: "pshikiUlt", haruka: "harukaOmega" };

// ---------- Apple guy: ของส่งมอบ 3 ชิ้น (สกิลพื้นฐาน เอาแบบนี้ได้ไหม เลือก -> สกิลรอง เอาไปสิ ส่งให้เป้าหมาย) ----------
const APPLE_ITEMS = [
  { key: "drink", name: "เครื่องดื่มชูกำลัง", img: "/characters/appleguy/appleguy_skill1.1.jpg", desc: "ผู้รับได้แต้มสกิล +1 แต่เสียพลัง 1 หน่วยต่อเทิร์น (ความเสียหายธรรมดา โดนเกราะก่อน) คงอยู่ 2 เทิร์น (ค่าเริ่มต้น)" },
  { key: "iphone", name: "ไอโฟนเครื่องใหม่", img: "/characters/appleguy/appleguy_skill1.2.png", desc: "ผู้รับฟื้นเกราะ 2 หน่วย แต่เสียพลังชีวิต 1 หน่วยแบบไม่สนเกราะ" },
  { key: "promo", name: "ใบโปรโมทสินค้า", img: "/characters/appleguy/appleguy_skill1.3.jpg", desc: "แต้มการ์ดของผู้รับถูกเปิดเผยให้ทุกคนเห็น คงอยู่ 1 เทิร์น" },
];
const APPLE_ITEM_NAME = Object.fromEntries(APPLE_ITEMS.map((it) => [it.key, it.name]));

// ฉากสรุปผล: จัดผู้เล่นเป็นชั้นตามแต้ม (ไพ่แตก = -1) — ชั้นบนสุด (แต้มดีที่สุด) คือ "ผู้ชนะ" (เสมอกันได้หลายคน)
//  ชั้นที่เหลือทั้งหมดถือเป็น "ผู้แพ้" กลุ่มเดียวกัน ไม่แยกอันดับย่อย — ไม่พึ่ง isWinner/isLoser/winnerId เพราะแคบเกินไป (สุ่มมาแค่ 1 คน)
function rankTiers(players) {
  const combatants = players.filter((p) => p.score != null);
  if (!combatants.length) return [];
  const val = (p) => (p.busted ? -1 : p.score);
  const scores = [...new Set(combatants.map(val))].sort((a, b) => b - a);
  return scores.map((v) => ({ score: v, players: combatants.filter((p) => val(p) === v) }));
}

// ตำแหน่งผู้เล่นคนอื่น (นอกจากตัวเรา) รอบโต๊ะ — [top%, left%] จัดตามจำนวน ไม่เรียงแถว
// [top%, left%] ของการ์ดผู้เล่นคนอื่นบนกระดานจอคอม (index = จำนวนคนอื่นในสนาม)
//  ข้อกำหนดสำคัญ: ห้ามมีช่องไหนทับ "กองการ์ดกลาง" ซึ่งอยู่ที่ top 40% / left 45-55%
//  (การ์ดกว้าง w-28 = กว้าง +-6.2% ที่ความกว้างออกแบบต่ำสุด 900px)
const SLOTS = {
  0: [],
  1: [[8, 50]],
  2: [[9, 22], [9, 78]],
  3: [[9, 17], [6, 50], [9, 83]],
  4: [[9, 18], [9, 82], [44, 11], [44, 89]],
  5: [[9, 17], [6, 50], [9, 83], [50, 11], [50, 89]],
  // patch 2.8 (ช่องผู้เล่นที่ 7): 6 คนอื่น — แถวบน 4 ใบ + ข้างละ 1 ใบ
  //  แถวบนคู่กลางวางที่ 38/62% (ขอบในสุด 44.2/55.8%) จึงเว้นช่องกองการ์ดกลางไว้ทั้งแนวนอน
  //  และ top 4% ทำให้ปลายล่างของการ์ดยังอยู่เหนือกองการ์ดที่เริ่มต้นที่ 40% อีกชั้นหนึ่ง
  6: [[7, 15], [4, 38], [4, 62], [7, 85], [50, 9], [50, 91]],
};

// เอฟเฟครอบการ์ด: Beat Mode = สายฟ้าเขียว (ถาวร) / สวมเกราะราชัน = โกลว์แดง
function auraClass(p) {
  if (p.beat) return "aura-beat";
  if (p.rachan) return "aura-rachan";
  // ยูนะ: ออร่าเป้าหมายเฉพาะ (Longing สีทอง / Delete สีม่วง / Smile for You สีเขียว-ฟ้า)
  if (p.fieldAura === "longing") return "aura-yuna-gold";
  if (p.fieldAura === "delete") return "aura-yuna-purple";
  if (p.fieldAura === "smile") return "aura-yuna-smile";
  return "";
}

// ไอคอนป้ายบอกเอฟเฟกต์ยูนะแบบชัดๆ ไม่ต้องเดาจากสีอย่างเดียว
const YUNA_AURA_BADGE = { longing: "✨", delete: "💜", smile: "💚" };

// อนุภาคฝุ่นไซเบอร์ระเบิดฟุ้งออกรอบทิศทางจากพอร์เทรต (ยูนะ) — สุ่มมุม/ระยะ/จังหวะครั้งเดียวใน effect (กันสุ่มใหม่ทุก re-render จน "กระตุก")
function AuraDust({ fieldAura }) {
  const [particles, setParticles] = useState([]);
  useEffect(() => {
    if (!fieldAura) { setParticles([]); return; }
    setParticles(Array.from({ length: 16 }, (_, i) => ({
      angle: (i / 16) * 360 + (Math.random() * 16 - 8),
      dist: 16 + Math.random() * 18,
      size: 4 + Math.random() * 4,
      delay: Math.random() * 1.4,
      duration: 1.3 + Math.random() * 0.9,
    })));
  }, [fieldAura]);
  if (!fieldAura) return null;
  return (
    <>
      {particles.map((d, i) => (
        <span
          key={i}
          className="aura-dust"
          style={{
            width: d.size, height: d.size,
            "--dust-angle": `${d.angle}deg`,
            "--dust-dist": `${d.dist}px`,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
          }}
        />
      ))}
    </>
  );
}

// รูปตัวละคร (เต็มกรอบ + fallback) — แยกชั้น "รูป" (overflow-hidden ตัดขอบ) ออกจากชั้น "ออร่า" (ต้องฟุ้งเลยขอบพอร์เทรตได้)
function Portrait({ p, className, rounded = "rounded-2xl" }) {
  const [broken, setBroken] = useState(false);
  const aura = auraClass(p);
  const badge = YUNA_AURA_BADGE[p.fieldAura];
  const isYuna = aura.startsWith("aura-yuna");
  return (
    <div className={`relative ${aura} ${className}`}>
      {isYuna && <span className="aura-rays" aria-hidden="true" />}
      {isYuna && <span className="aura-ring aura-ring-outer" aria-hidden="true" />}
      {isYuna && <span className="aura-ring aura-ring-inner" aria-hidden="true" />}
      <div className={`absolute inset-0 overflow-hidden ${rounded}`} style={{ background: "linear-gradient(135deg,#9b4f96,#7d3a78)" }}>
        {p.img && !broken ? (
          <img src={p.img} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-3xl">🙂</span>
        )}
      </div>
      <AuraDust fieldAura={p.fieldAura} />
      {badge && <span className="aura-badge">{badge}</span>}
    </div>
  );
}

function TwinPortraitCards({ p, size = "md", className = "" }) {
  const twins = p.hisakawa?.twins || [];
  if (!twins.length) return <Portrait p={p} className={className} />;

  const cfg = {
    mini: { wrap: "gap-1", card: "w-10 h-14", name: "text-[8px]" },
    sm: { wrap: "gap-1.5", card: "w-14 h-16", name: "text-[9px]" },
    table: { wrap: "gap-2", card: "w-20 h-28 sm:w-24 sm:h-32", name: "text-[10px] sm:text-xs" },
    md: { wrap: "gap-2", card: "w-16 h-[5.5rem] sm:w-20 sm:h-28", name: "text-[10px]" },
  }[size] || {
    wrap: "gap-2",
    card: "w-[4.8rem] h-28 sm:w-[5.6rem] sm:h-36",
    name: "text-[10px]",
  };

  return (
    <div className={`inline-flex items-center justify-center ${cfg.wrap} ${className}`} style={{ "--p-frame-color": p.color }}>
      {twins.map((t) => {
        return (
          <div
            key={t.key}
            className={`relative overflow-hidden rounded-xl border-2 bg-black/60 shadow-lg ${cfg.card} ${t.active ? "shadow-white/20" : ""} ${!t.alive ? "grayscale opacity-60" : ""}`}
            style={{ borderColor: t.active ? p.color : "rgba(255,255,255,.28)" }}
            title={t.name}
          >
            {t.img ? <img src={t.img} alt="" className="absolute inset-0 w-full h-full object-cover" /> : null}
            <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: t.active ? `inset 0 0 0 2px ${p.color}` : "none" }} />
            {t.active && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-white/80" style={{ background: p.color }} />}
            <div className="absolute inset-x-0 bottom-0 px-1 py-1 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
              <div className={`font-black text-white leading-tight truncate ${cfg.name}`} style={{ fontFamily: P_DISPLAY }}>
                {t.key === "nagi" ? "นากิ" : "ฮายาเตะ"}
              </div>
            </div>
            {!t.alive && <span className="absolute inset-0 grid place-items-center text-xs font-black bg-black/45 text-white">KO</span>}
          </div>
        );
      })}
    </div>
  );
}
function Shield({ on, size = 16 }) {
  return (
    <svg width={size} height={Math.round(size * 1.125)} viewBox="0 0 24 24" className="shrink-0">
      <path d="M12 2 L21 6 V12 C21 17 12 22 12 22 C12 22 3 17 3 12 V6 Z"
        fill={on ? "#3b82c4" : "transparent"} stroke="#3b82c4" strokeWidth="2" />
    </svg>
  );
}

// ---------- ตัวล็อกเป้าหมาย: กรอบมุมเรืองแสง + วงแหวนหมุน — ครอบทับการ์ดผู้เล่นที่ตีได้ ----------
function TargetLock() {
  return (
    <>
      <span className="p-target-ring" aria-hidden="true" />
      <span className="p-target-corner tl" aria-hidden="true" />
      <span className="p-target-corner tr" aria-hidden="true" />
      <span className="p-target-corner bl" aria-hidden="true" />
      <span className="p-target-corner br" aria-hidden="true" />
    </>
  );
}

// ---------- แถวเลือด + เกราะ (ใช้ร่วมกันทุกจุด) ----------
//  บังคับอยู่บรรทัดเดียวแนวนอนเสมอ ไม่หักขึ้นบรรทัดใหม่ตามความยาว — sm = ขนาดเล็ก (การ์ดคู่ต่อสู้มือถือ)
//  ตามคำขอ: กลับไปใช้หัวใจ/โล่แบบเดิม (เคยลองเปลี่ยนเป็นเกจแท่ง/เพชรเอียงแล้วไม่ถูกใจ)
function LifeBar({ p, sm, className = "" }) {
  // ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ ทำงานอยู่ — HP/เกราะ/โล่ถูกซ่อนของทุกคน (รวมตัวเอง) เป็น null
  if (p.maxHp == null) {
    return (
      <span className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${sm ? "text-xs" : "text-sm"} font-black opacity-80 ${className}`} title="ถูกซ่อน (ถึงจะมองไม่เห็น แต่ฉันยังอยู่)">
        🌑 ???
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${className}`}>
      <span className={`${sm ? "text-sm" : "text-lg"} leading-none whitespace-nowrap`}>
        {Array.from({ length: p.maxHp }, (_, i) => (i < p.hp ? "❤️" : "🖤")).join("")}
      </span>
      {p.tempHp > 0 && <span className={`${sm ? "text-xs" : "text-sm"} text-echo-gold font-bold`}>💛{p.tempHp}</span>}
      <span className="inline-flex gap-0.5 shrink-0">
        {Array.from({ length: p.maxArmor }, (_, i) => <Shield key={i} on={i < p.armor} size={sm ? 12 : 16} />)}
      </span>
      {p.shield > 0 && <span className={`${sm ? "text-xs" : "text-sm"} text-echo-cyan font-bold`}>+🛡️{p.shield}</span>}
    </span>
  );
}

// แถวพลังชีวิต + หลอดสกิล
// ---------- คอนเนอร์ RK800: มิเตอร์ "ความเครียด" 0-10 (โผล่เฉพาะตอนมีคอนเนอร์อยู่ในแมตช์) ----------
//  เป็น UI ล้วน ไม่ใช่สถานะ — ล้าง/ต้านไม่ได้ สีเปลี่ยนตามระดับ ผู้ต้องสงสัย -> ผู้กระทำความผิด -> อาชญากร
const CONNOR_LEVEL_UI = {
  suspect:  { name: "ผู้ต้องสงสัย", icon: "🔎", bar: "#9AA5B1" },
  offender: { name: "ผู้กระทำความผิด", icon: "⚠️", bar: "#E5B33B" },
  criminal: { name: "อาชญากร", icon: "🚨", bar: "#C0392B" },
};
function ConnorStressBar({ p }) {
  if (p.connorStress == null) return null;
  const lv = CONNOR_LEVEL_UI[p.connorLevel] || CONNOR_LEVEL_UI.suspect;
  const max = p.connorStressMax || 10;
  const pct = Math.round((p.connorStress / max) * 100);
  return (
    <div className="mt-1 w-full max-w-[120px]" title={`ความเครียด ${p.connorStress}/${max} — ${lv.name}`}>
      <div className="flex items-center justify-between text-[9px] font-black leading-none mb-0.5">
        <span style={{ color: lv.bar }}>{lv.icon} {lv.name}</span>
        <span className="opacity-80">{p.connorStress}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/12 overflow-hidden border border-black/30">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: lv.bar, boxShadow: `0 0 6px ${lv.bar}` }} />
      </div>
      {p.connorEstDmg != null && (
        <div className="text-[9px] font-black text-echo-cyan mt-0.5">🧠 ประเมินดาเมจ ~{p.connorEstDmg}</div>
      )}
    </div>
  );
}

// ป้ายความเครียดแบบบรรทัดเดียวสำหรับ "แผงตัวเอง" (การ์ดผู้เล่นอื่นใช้ ConnorStressBar แทน)
function ConnorStressBadge({ me }) {
  if (!me || me.connorStress == null) return null;
  const lv = CONNOR_LEVEL_UI[me.connorLevel] || CONNOR_LEVEL_UI.suspect;
  return (
    <span
      className="text-[11px] font-black px-1.5 py-0.5 rounded-md border border-black/25 shadow whitespace-nowrap"
      style={{ background: lv.bar, color: "#111" }}
      title={`ความเครียด ${me.connorStress}/${me.connorStressMax || 10} — ${lv.name} (คอนเนอร์ RK800: เป็น UI ล้วน ล้าง/ต้านไม่ได้)`}
    >
      {lv.icon} {me.connorStress}/{me.connorStressMax || 10} {lv.name}
    </span>
  );
}

function Stats({ p, center, hideLife = false }) {
  return (
    <div className={center ? "flex flex-col items-center gap-1" : ""}>
      {!hideLife && !p.hisakawa && <LifeBar p={p} />}
      {p.skillPoints < 0 ? (
        // ซาโตรุ (patch 2.0.8.2): แต้มสกิลถูกซ่อนจากผู้เล่นอื่น / ทาคุมิ: บังตาแต้มสกิลของทุกคนยกเว้นตัวเอง
        <div className="mt-1 text-xs font-black text-echo-gold opacity-90" title="แต้มสกิลถูกซ่อน">🌩️ ???</div>
      ) : (
        <div className="flex gap-1 mt-1">
          {Array.from({ length: p.maxSkill }, (_, i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rotate-45"
              style={
                i < p.skillPoints
                  ? { background: "linear-gradient(180deg,#f6d371,var(--color-echo-gold))", boxShadow: "0 0 5px rgba(229,179,59,.85)" }
                  : { background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)" }
              }
            />
          ))}
        </div>
      )}
      <ConnorStressBar p={p} />
    </div>
  );
}

// ---------- สถานะผิดปกติ (patch 1.7.1): ตารางกลาง ไอคอน + ชื่อ + สี + คำอธิบาย ----------
//  ใช้ทั้งป้ายเล็กบนการ์ดผู้เล่น และหน้าต่างรายละเอียด — ทุกคนเห็นสถานะของกันและกันได้
//  (แตะ/คลิกการ์ดผู้เล่นตอนที่ไม่ได้เลือกเป้าโจมตี เพื่อเปิดดูคำอธิบายเต็ม)
const STATUS_INFO = {
  upg:       { icon: "🎴", label: "UPG", cls: "bg-echo-cyan text-gray-900", desc: "เทิร์นนี้ไพ่ไม่มีทางแตก แต่แต้มไม่เกินเพดานของสกิล" },
  monster:   { icon: "🛡️", label: "MonsterLive", cls: "bg-echo-armor", desc: "MonsterLive: เพดานเกราะ +2 — เกราะลดลงเท่าไหร่ฟื้นเลือดเท่านั้น และความเสียหายที่ได้รับจากการโจมตีลดลง 1 หน่วย (ใช้สกิลรอง Ultlive Ultraman Ginga ไม่ได้)" },
  ginga:     { icon: "✨", label: "Ginga", cls: "bg-echo-gold text-gray-900", desc: "ร่าง Ultraman Ginga: โจมตี +1 และตีหมู่ทุกคน (เหลือคู่ต่อสู้คนเดียว +1 เพิ่ม) — ระหว่างนี้สกิลพื้นฐานเปลี่ยนเป็น UPG!" },
  gingastrium: { icon: "🔥", label: "Ginga Strium", cls: "bg-echo-hp", desc: "ร่าง Ginga Strium: โจมตี +1 (เหลือคู่ต่อสู้คนเดียว +1 เพิ่ม) ติดลุกไหม้ให้เป้าหมายที่โดนโจมตี — ระหว่างนี้สกิลรองเปลี่ยนเป็นลำแสงสโตเรียม" },
  accused:   { icon: "⛓️", label: "ผู้ต้องหา", cls: "bg-echo-hp", desc: "ผู้ต้องหา (คอนเนอร์ RK800): เป็นเครื่องหมายล้วนๆ ไม่มีผลอื่นในตัวเอง — แต่คอนเนอร์โจมตีปกติใส่คนที่ติดสถานะนี้แรงขึ้น +2 หน่วย · ต้านสถานะผิดปกติล้างได้" },
  hbleed:    { icon: "🩸", label: "เลือดไหล", cls: "bg-echo-hp", desc: "เลือดไหล: เสียพลังชีวิต 1 หน่วยทุกเทิร์น (ลดเกราะก่อน ลดลงทีละหน่วยหลังสร้างความเสียหาย) สะสมได้ไม่เกิน 6 หน่วย และระหว่างที่ยังติดอยู่ การฟื้นพลังชีวิตจะเหลือครึ่งเดียว (ฟื้นทีละ 1 หน่วยไม่ถูกลด) — ต้านได้ด้วยต้านสถานะผิดปกติ" },
  hburn:     { icon: "🔥", label: "ลุกไหม้", cls: "bg-echo-hp", desc: "ลุกไหม้: เสียพลังชีวิต 1 หน่วยทุกเทิร์น (ลดเกราะก่อน ลดลงทีละหน่วยหลังสร้างความเสียหาย) สะสมได้ไม่เกิน 6 หน่วย" },
  storium:   { icon: "🌟", label: "สโตเรียม", cls: "bg-echo-magenta", desc: "ลำแสงสโตเรียม: การโจมตีครั้งถัดไปกลายเป็นตีหมู่ — เป้าหมายที่เลือกรับดาเมจปกติ(สูงสุด 4)+ลุกไหม้ที่เหลือ ผู้เล่นอื่นรับดาเมจเท่าลุกไหม้ของตัวเอง" },
  absorb:    { icon: "🛡️", label: "Absorb", cls: "bg-echo-armor", desc: "เกราะที่เสียในเทิร์นนี้แปลงกลับเป็นพลังชีวิต" },
  beam:      { icon: "🔫", label: "Beam", cls: "bg-echo-magenta", desc: "Beam Magnum: การโจมตีเทิร์นนี้ +2 หน่วย" },
  paradise:  { icon: "🦄", label: "Paradise", cls: "bg-echo-gold text-gray-900", desc: "NewType Paradise: โจมตีด้วยพลัง NT-D (+1) ได้ทุกเป้าหมาย" },
  ntd:       { icon: "⚡", label: "NT-D", cls: "bg-echo-hp", desc: "NT-D System: การโจมตีสวนกลับคนที่ตีเราล่าสุด +1 หน่วย" },
  ohger:     { icon: "👑", label: "โอเจอร์ชาร์จ", cls: "bg-echo-gold text-gray-900", desc: "โอเจอร์ชาร์จ: การโจมตีปกติครั้งถัดไป +1 หน่วย แล้วมอบผุพัง 3 เทิร์นให้เป้าหมาย — คงอยู่จนกว่าจะได้โจมตี" },
  rachan:    { icon: "🛡️", label: "คิงโอเจอร์", cls: "bg-echo-armor", desc: "สวมเกราะราชัน: พลังโจมตีปกติ +1 คงอยู่ 5 เทิร์น (ได้รับโชคลาภ +2 ตอนใช้)" },
  song:      { icon: "🎵", label: "Song", cls: "bg-echo-magenta", desc: "Song for you: พลังขิงตามชามที่ใช้ (1 ชาม = +1) — มีผลเฉพาะสกิลติดตัวโดนขิง (ขิงแบบไม่สนเกราะ)" },
  anata:     { icon: "🎤", label: "ANATA", cls: "bg-echo-gold text-gray-900", desc: "ANATA WAAAAAAAA: เป้าหมายลับจะถูกบังคับจั่ว 2 ใบหลังเปิดไพ่" },
  seal:      { icon: "📜", label: "อมตะ", cls: "bg-echo-hp", desc: "เรจูอาคมบัญชา: เทิร์นนี้ไม่ถูกเลือกโจมตี และไม่รับความเสียหายใดๆ" },
  nodraw:    { icon: "🚫", label: "ห้ามจั่ว", cls: "bg-echo-hp", desc: "จั่วการ์ดเพิ่มไม่ได้ในเทิร์นนี้" },
  noskill:   { icon: "🚫", label: "ห้ามสกิล", cls: "bg-echo-hp", desc: "โดนหอกลองกินัสปัก: ใช้สกิลไม่ได้ในเทิร์นนี้" },
  golden:    { icon: "🎰", label: "777", cls: "bg-echo-gold text-gray-900", desc: "เวลาทอง: โชคด้านบวก +10% คอสสกิลพื้นฐาน/รองลดครึ่ง กดสกิลพื้นฐานซ้ำได้" },
  spear:     { icon: "🗡️", label: "หอกลองกินัส", cls: "bg-echo-magenta", desc: "หอกลองกินัส: โจมตี +1 และมีโอกาส 50/50 (100% ถ้าเปิด Fourth Impact หรือเลือด <=4) ทำให้เป้าหมายใช้สกิลไม่ได้ 2 เทิร์น — คงอยู่จนกว่าจะได้โจมตี" },
  cassius:   { icon: "🗡️", label: "หอกแห่งแคสเซียส", cls: "bg-echo-gold text-gray-900", desc: "หอกแห่งแคสเซียส: การโจมตีปกติครั้งถัดไปฟื้นเลือดตามความเสียหายที่ทำได้ — คงอยู่จนกว่าจะได้โจมตี" },
  rsHopper:  { icon: "🦘", label: "RS-HOPPER", cls: "bg-echo-armor", desc: "RS-HOPPER: กันดาเมจจากสกิลได้เต็ม 100% เสมอ — ปุ่มโจมตีปกติกันเต็มไม่ได้ แต่ถ้าคำนวณแล้วเลือดจะเหลือ ≤4 จะตรึงไว้ที่ 4 พอดี ใช้ชาร์จร่วมกัน ฟื้น 1 ชาร์จทุก 3 เทิร์น สูงสุด 3" },
  fourth:    { icon: "☄️", label: "Impact", cls: "bg-echo-hp", desc: "Fourth Impact: พลังโจมตีปกติ +2 กันดาเมจแพ้/แตก 5 เทิร์น — ถูกกำจัดระหว่างนี้จะระเบิดทุกคน 8 หน่วย" },
  lai:       { icon: "🌞", label: "Goodfellow", cls: "bg-echo-gold text-gray-900", desc: "Lai Rhyme Goodfellow กำลังทำงาน" },
  vortigern: { icon: "🌑", label: "Vortigern", cls: "bg-echo-hp", desc: "Lie Like Vortigern: ราตรีกลืนกินครอบงำสนามจนกว่าฟ้าจะสาง" },
  veil:      { icon: "🌙", label: "ม่านราตรี", cls: "bg-echo-magenta", desc: "ม่านแห่งราตรี: พลังโจมตี +1 หน่วย" },
  dawn:      { icon: "🌅", label: "ฟ้าสาง", cls: "bg-echo-gold text-gray-900", desc: "ยามฟ้าสาง: สะสมถาวร (สูงสุด 5) — Lie Like Vortigern จะกล่อมหลับตามจำนวนสแตค" },
  awaken:    { icon: "⏰", label: "ตื่นขึ้น", cls: "bg-echo-cyan text-gray-900", desc: "การตื่นขึ้น: ฟื้นพลังชีวิตเทิร์นละ 1" },
  sleep:     { icon: "💤", label: "หลับไหล", cls: "bg-echo-hp", desc: "หลับไหล: ออกการกระทำใดๆ ไม่ได้ และเสียเลือด 1/เทิร์นไม่สนเกราะ (ไม่ถึงตาย — ค้างที่ 1) — หายไปทันทีเมื่อเข้าเช้า" },
  oberonSickle: { icon: "🌘", label: "เคียวยมทูต", cls: "bg-echo-magenta", desc: "เคียวยมทูต: การโจมตีปกติใส่เป้าหมายที่กำลังหลับไหลจะแรงขึ้น +2 หน่วย — กดซ้ำไม่ได้ระหว่างมีผล" },
  vortarmor: { icon: "🛡️", label: "เกราะราตรี", cls: "bg-echo-armor", desc: "Lie Like Vortigern: เพดานเกราะ +1 ชั่วคราว" },
  // ---------- Apple guy (patch 1.8) ----------
  energy:    { icon: "🥤", label: "ชูกำลัง", cls: "bg-echo-cyan text-gray-900", desc: "เครื่องดื่มชูกำลัง: ได้แต้มสกิล +1 แต่เสียพลัง 1 หน่วยต่อเทิร์นแบบความเสียหายธรรมดา (โดนเกราะก่อน ไม่ถึงตาย — ค้างที่ 1)" },
  promo:     { icon: "📢", label: "เปิดแต้ม", cls: "bg-echo-gold text-gray-900", desc: "แต้มการ์ดถูกเปิดเผยให้ทุกคนเห็นตลอดเทิร์นนี้ (ใบโปรโมทสินค้า / แสงจันทร์ส่องวิญญาณ)" },
  chill:     { icon: "🏖️", label: "ชิวๆ", cls: "bg-echo-cyan text-gray-900", desc: "ชิวๆครับน้องๆ: จบเทิร์นได้แต้มสกิล +1 และมีโอกาสหลบการถูกเลือกโจมตี — คงอยู่จนกว่าจะถูกโจมตี" },
  // ---------- เจ้าแห่งเน็ตบ้าน (patch 1.9) ----------
  fiber:     { icon: "📡", label: "เน็ตแรง", cls: "bg-echo-cyan text-gray-900", desc: "เสือนอนกิน: เทิร์นนี้จั่วการ์ดไม่มีทางแตก แต่แต้มจะไม่เกิน 19" },
  tiger:     { icon: "🐯", label: "เสือนอนกิน", cls: "bg-echo-gold text-gray-900", desc: "เสือนอนกิน: พลังโจมตี +1 (และฟื้นพลังชีวิต 1 หน่วยในเทิร์นถัดไป)" },
  unplug:    { icon: "🔌", label: "สายหลุด", cls: "bg-echo-hp", desc: "กระชากสายแลน: บัฟหายไปชั่วคราวตลอดเทิร์นนี้ (กลับคืนในเทิร์นถัดไป)" },
  nohealing: { icon: "☠️", label: "ไร้ทางเยียวยา", cls: "bg-echo-hp", desc: "ไร้ทางเยียวยา: ฟื้นพลังชีวิตไม่ได้ ตามจำนวนเทิร์นที่เหลือ" },
  // ---------- ฟุจิตะ โคโตเนะ (rework 2.3) ----------
  ksleep:      { icon: "😴", label: "หลับพักผ่อน", cls: "bg-echo-cyan text-gray-900", desc: "Sleeping time: ล้างสถานะเสียทั้งหมดตอนใช้ แล้วหลับ 3 เทิร์น (ทำอะไรไม่ได้) — ระหว่างหลับฟื้นพลังชีวิต +2 และแต้มสกิล +1 ทุกเทิร์น (เทิร์นแรกศัตรูเลือกโจมตีไม่ได้)" },
  kotoneReady: { icon: "🎀", label: "ความพร้อม", cls: "bg-echo-cyan text-gray-900", desc: "ความพร้อม: สะสมจาก Dance Lession (+1) และ แอบซ้อม กลางคืน (+2) — สะสมได้สูงสุด 4 หน่วย ครบ 4 แล้วใช้ท่าไม้ตาย หนูพร้อมแล้วคะ โปรดิวเซอร์ ได้" },
  kready:      { icon: "✨", label: "พร้อมลุย", cls: "bg-echo-magenta", desc: "ร่าง [พร้อมลุย]: ปุ่มสกิลทั้ง 3 ช่องเปลี่ยนเป็นท่าไม้ตาย Sekai ichi kawaii watashi / Campus Mode! / Self-affirmation Explosion! Love Love (คอส 6 แต้มสกิล + 6 เหรียญ) — อยู่ในร่างนี้จนกว่าจะปล่อยท่าใดท่าหนึ่ง" },
  kotoneLove:  { icon: "💗", label: "รัก รักที่สุดเลย", cls: "bg-echo-magenta", desc: "รัก รักที่สุดเลย: การโจมตีครั้งถัดไปทำดาเมจเพิ่มตามเงินในกระปุกออมสิน (5/10/15 เหรียญ = +1/+2/+3) — ทำดาเมจแล้วกระปุกถูกล้างทั้งหมด" },
  kawaii:      { icon: "💖", label: "Kawaii", cls: "bg-echo-magenta", desc: "Sekai ichi kawaii watashi: ทำงานหลังเปิดไพ่ — ตีหมู่เจาะเกราะ 1 หน่วย สตั้น 2 เทิร์น และบังคับทุกคนไพ่แตก" },
  kcampus:     { icon: "🏫", label: "Campus Mode", cls: "bg-echo-magenta", desc: "Campus Mode!: ทำงานหลังเปิดไพ่ — ได้บัฟ รัก รักที่สุดเลย ฮีล 3 หน่วย ทุกคนติดไร้ทางเยียวยา 2 เทิร์น และบังคับทุกคนไพ่แตก" },
  kshuki:      { icon: "💞", label: "Love Love", cls: "bg-echo-magenta", desc: "Self-affirmation Explosion! Love Love: ทำงานหลังเปิดไพ่ — ได้บัฟ รัก รักที่สุดเลย บังคับทุกคนไพ่แตก และโจมตีเพิ่มได้อีก 1 ครั้ง" },
  // ---------- ชเรด เอลัน (patch พิเศษ) ----------
  melody:    { icon: "🎵", label: "ท่วงทำนอง", cls: "bg-echo-cyan text-gray-900", desc: "ท่วงทำนอง: สะสมจากสกิล เชิญรับฟัง (สูงสุด 5) — ครบ 5 ตอนกลางคืนจะใช้ท่าไม้ตาย รวมร่างทำนองเพลง ได้" },
  shradecharge: { icon: "🎻", label: "บทเพลงสุดท้าย", cls: "bg-echo-hp", desc: "แด่เพื่อนรักของฉัน: กำลังบรรเลงบทเพลงสุดท้าย — จั่ว/ใช้สกิลไม่ได้ ครบกำหนดจะระเบิดใส่ทุกคน 8 หน่วย แล้วชเรดจบชีวิตลง" },
  moonmark:  { icon: "🌕", label: "จันทร์ส่อง", cls: "bg-echo-magenta", desc: "แสงจันทร์ส่องวิญญาณ (สปาด้า): หากไพ่แตกในเทิร์นนี้ จะรับความเสียหาย 1 หน่วยทันที" },
  // ---------- สถานะพื้นฐาน universal (patch 2.0.8) ----------
  freecast:  { icon: "👸", label: "การ์ดราชินี", cls: "bg-echo-gold text-gray-900", desc: "การ์ดราชินี: ใช้สกิลครั้งถัดไปไม่เสียแต้มสกิล (หายเมื่อจบเทิร์นถ้าไม่ได้ใช้)" },
  stun:      { icon: "😵", label: "สตั้น", cls: "bg-echo-hp", desc: "สตั้น: ไม่สามารถทำอะไรได้จนจบเทิร์นหรือจนกว่าดีบัฟจะหมดเวลา" },
  chaa:     { icon: "🌀", label: "สภาพชา", cls: "bg-echo-hp", desc: "สภาพชา: กดจั่วการ์ด 1 ครั้งจะได้ไพ่ 2 ใบ (ใบที่ 2 สุ่มปกติ โชคลาภไม่ช่วย)" },
  weak:      { icon: "🥀", label: "อ่อนแอ", cls: "bg-echo-hp", desc: "อ่อนแอ: ดาเมจที่ทำได้ลดลงตามจำนวนที่ระบุ ตามจำนวนเทิร์นที่เหลือ" },
  fragile:   { icon: "💔", label: "เปราะบาง", cls: "bg-echo-hp", desc: "เปราะบาง: ดาเมจที่ได้รับเพิ่มขึ้นตามจำนวนที่ระบุ ตามจำนวนเทิร์นที่เหลือ" },
  might:     { icon: "💪", label: "เสริมพลัง", cls: "bg-echo-gold text-gray-900", desc: "เสริมพลัง: ดาเมจที่ทำได้เพิ่มขึ้นตามจำนวนที่ระบุ ตามจำนวนเทิร์นที่เหลือ" },
  spellflow: { icon: "🌀", label: "กระแสเวท", cls: "bg-echo-cyan text-gray-900", desc: "กระแสเวท: การใช้สกิลทุกชนิดใช้พลังงานลดลงตามจำนวนที่ระบุ ตามจำนวนเทิร์นที่เหลือ" },
  spellburden: { icon: "⛓️", label: "ภาระเวท", cls: "bg-echo-hp", desc: "ภาระเวท: การใช้สกิลทุกชนิดใช้พลังงานเพิ่มขึ้นตามจำนวนที่ระบุ (ซ้อนได้สูงสุด 2 หน่วย) ตามจำนวนเทิร์นที่เหลือ — ดันราคาสกิลได้ไม่เกิน 8 แต้ม สกิลที่ 8 อยู่แล้วจะไม่แพงขึ้น" },
  manaSeal:  { icon: "⛔", label: "ผนึกพลังงาน", cls: "bg-echo-hp", desc: "ผนึกพลังงาน: ฟื้นฟูแต้มสกิลจากช่องทางใดๆ ไม่ได้เลย (เช้า/พรจั่วการ์ด/ไอเทม) ตามจำนวนเทิร์นที่เหลือ" },
  // ---------- ไค ชิซากิ ----------
  kaiCreation: { icon: "🎨", label: "รังสรรค์", cls: "bg-echo-gold text-gray-900", desc: "รังสรรค์: มาร์กถาวรจากไค ชิซากิ — ครบ 2 มาร์กบนกระดานจะปลดล็อก Overhaul" },
  kaiPunishment: { icon: "⚔️", label: "ลงทัณฑ์", cls: "bg-echo-hp", desc: "ลงทัณฑ์: มาร์กถาวรจากไค ชิซากิ — ครบ 2 มาร์กบนกระดานจะปลดล็อก Overhaul" },
  kaiLink: { icon: "🕊️", label: "เชื่อมต่อ", cls: "bg-echo-magenta", desc: "เชื่อมต่อ (สวรรค์ประทานพร): HP/เกราะที่เสียหรือฟื้นฟูจริงถูกแชร์ให้คู่เชื่อมเท่ากัน 1:1 ตามจำนวนเทิร์นที่เหลือ" },
  kaiRival1: { icon: "😡", label: "คู่ปรับ", cls: "bg-echo-hp", desc: "โทสะระงับด้วยโทสะ: ถูกบังคับโจมตีเฉพาะคู่ปรับที่ถูกกำหนดไว้เท่านั้น ตามจำนวนเทิร์นที่เหลือ" },
  kaiRival2: { icon: "😡", label: "คู่ปรับ", cls: "bg-echo-hp", desc: "โทสะระงับด้วยโทสะ: ถูกบังคับโจมตีเฉพาะคู่ปรับที่ถูกกำหนดไว้เท่านั้น ตามจำนวนเทิร์นที่เหลือ" },
  // ---------- ผู้สังหารเมจ ----------
  mageslayerMark: { icon: "🎯", label: "ตราล่าเวท", cls: "bg-echo-magenta", desc: "ตราล่าเวท (Witch Mark): ความเสียหายทุกประเภทของผู้สังหารเมจต่อเป้าหมายนี้จะขโมยพลังงานเท่าความเสียหาย (ต่ำสุด 1 สูงสุด 5) — ขโมยเกินพลังงานที่เหลือ เป้าหมายติด [อ่อนแอ] -1 2 เทิร์น — ทุก 2 เทิร์นถูกขโมยเพิ่มอีก 1 หน่วย — ขณะติดตรานี้ โอกาสถูก [ดูดซับเวท] ขโมยพลังงานเพิ่มเป็น 60% (เคลื่อนย้ายได้ ถาวรจนกว่าจะย้าย/ถูกล้างด้วยต้านทานสถานะผิดปกติ)" },
  manaLeech: { icon: "🩸", label: "ดูดซับเวท", cls: "bg-echo-magenta", desc: "ดูดซับเวท: ทุกครั้งที่กดสกิล / ใช้ไอเทมฟื้นพลังงาน / ฟื้นพลังงานจากพาสซีฟ / การ์ดรังสรร มีโอกาส 35% ถูกผู้สังหารเมจขโมยพลังงาน 1 หน่วย — ถ้าติด [ตราล่าเวท] อยู่ด้วย โอกาสเพิ่มเป็น 60%" },
  mageslayerFury: { icon: "😤", label: "Fury", cls: "bg-echo-gold text-gray-900", desc: "Fury: สะสมพลังโกรธ (สูงสุด 3 ขั้น) — ใช้หมดพร้อมกันในการโจมตีปกติครั้งถัดไป (ไม่เพิ่มดาเมจครั้งนั้น): ขั้น 1 สูบพลังชีวิต +2 + [ดูดซับเวท] 2 เทิร์น / ขั้น 2 สูบพลังชีวิต +3 + [ดูดซับเวท] 4 เทิร์น / ขั้น 3 สูบพลังชีวิต +3 + [เสริมพลัง] +1 (หมดเมื่อได้โจมตี) + [ดูดซับเวท] 5 เทิร์น" },
  manaRupture: { icon: "💥", label: "ระเบิดมานา", cls: "bg-echo-hp", desc: "ระเบิดมานา: ติดสถานะ 2 เทิร์น เมื่อหมดเวลาจะระเบิดตามพลังงานในเทิร์นที่ติดสถานะ (7-8 = ดาเมจ 1 / 2-6 = ดาเมจ 3 + ผนึกพลังเวทย์ 2 เทิร์น / 0-1 = ดาเมจ 5 + ผนึกพลังเวทย์ 3 เทิร์น)" },
  // ---------- Ultraman Trigger ----------
  triggerDarkForm: { icon: "🌑", label: "Trigger Dark", cls: "bg-echo-magenta", desc: "ร่าง Trigger Dark คงอยู่ 5 เทิร์น หากตายในร่างนี้จะตายจริง และเมื่อคืนร่างต้องซื้อ Trigger Dark Key ใหม่" },
  triggerDarkWail: { icon: "🌘", label: "อวดครวญ", cls: "bg-echo-gold text-gray-900", desc: "สะสมได้สูงสุด 5 หน่วยและยังคงอยู่แม้ Trigger Dark คืนร่าง — Impact สร้างความเสียหายตามจำนวนนี้ แล้วล้างทั้งสนาม" },
  triggerForm: { icon: "🔴", label: "Ultraman Trigger", cls: "bg-echo-magenta", desc: "ร่าง Ultraman Trigger คงอยู่ 10 เทิร์น หากตายในร่างนี้จะตายจริง เมื่อครบเวลาจะคืนร่างเดิมด้วย HP 1 เกราะเต็ม และคีย์ติดคูลดาวน์ 5 เทิร์น" },
  escanorMorning: { icon: "☀️", label: "Morning", cls: "bg-echo-gold text-gray-900", desc: "เอสคานอร์ร่างเช้า: ชาร์จประกายแสงสุริยัน +1/เทิร์น โจมตี +1 เกราะ +1 และการโจมตีมอบลุกไหม้ให้ผู้ถูกโจมตี +1 หน่วย (มีผลเทิร์นถัดไป)" },
  escanorNight: { icon: "🌙", label: "Night", cls: "bg-echo-cyan text-gray-900", desc: "เอสคานอร์ร่างกลางคืน: หลบหลีก 50%, ได้แต้มสกิล +1 ทุกเทิร์น และพลังโจมตีพื้นฐานเป็น 0" },
  escanorNoon: { icon: "☀️", label: "Noon", cls: "bg-echo-hp", desc: "เอสคานอร์ร่าง Noon: ชาร์จลดลงทุกเทิร์นหรือเมื่อรับความเสียหายจากสกิล, โจมตี +1 เกราะ +1, ตีมอบลุกไหม้ +1 และถูกตีมอบลุกไหม้ผู้โจมตี +1 (มีผลเทิร์นถัดไป) และเมื่อตายจะเข้าสู่ Last Stand" },
  escanorLastStand: { icon: "🔥", label: "Last Stand", cls: "bg-echo-hp", desc: "Last Stand: MaxHP 7 เกราะ 0, HP ลด 1/เทิร์น, มอบลุกไหม้ให้ศัตรูทุกคน +2/เทิร์น, ไม่รับดาเมจจากดีบัฟลุกไหม้, ไม่รับความเสียหายจากการที่ไพ่แตก, ดาเมจจากโจมตี/สกิลที่ได้รับเหลือ 1, ตีมอบลุกไหม้ +2 และถูกตีมอบลุกไหม้ผู้โจมตี +1 (มีผลเทิร์นถัดไป) และโจมตีสำเร็จจะล้างลุกไหม้ตัวเองพร้อมฮีล 1" },
  escanorSolar: { icon: "☀️", label: "Solar", cls: "bg-echo-gold text-gray-900", desc: "Solar: สะสมได้สูงสุด 4 หน่วย ได้เมื่อเปิดไพ่แพ้หรือไม่ได้โจมตี หากไม่ได้รับเพิ่มครบ 3 เทิร์นจะลดลงครั้งละ 1 หน่วย ระหว่างสุริยาไม่สิ้นแสงจะใช้ 1 หน่วยต่อเทิร์นเพื่อคงร่าง Morning" },
  escanorCool: { icon: "💪", label: "เย็นชื่นใจ", cls: "bg-echo-cyan text-gray-900", desc: "เย็นชื่นใจ: ลดความเสียหายจากสกิลตามจำนวนสแตค และหมดเมื่อครบ 2 เทิร์น" },
  drunk: { icon: "🍷", label: "มึนเมา", cls: "bg-echo-magenta", desc: "มึนเมา: ลดลงทีละ 1 ทุกเทิร์น และเมื่อกดสกิลหรือจั่วไพ่มีโอกาสสุ่มติดห้ามจั่ว ห้ามสกิล หรือสตัน" },
  escanorFlare: { icon: "🔥", label: "เพลิงปะทุ", cls: "bg-echo-hp", desc: "การโจมตีครั้งถัดไปจะมอบลุกไหม้ให้ผู้ถูกโจมตีเพิ่ม +1 (มีผลเทิร์นถัดไป)" },
  escanorFlareNoon: { icon: "🔥", label: "เพลิงปะทุ Noon", cls: "bg-echo-hp", desc: "การโจมตีครั้งถัดไปจะมอบลุกไหม้เพิ่ม +2 และมอบไร้ทางเยียวยา 2 เทิร์น" },
  escanorPunch: { icon: "👊", label: "หมัดสุริยัน", cls: "bg-echo-hp", desc: "การโจมตีครั้งถัดไปพลังโจมตี +1 และมอบลุกไหม้ให้ผู้ถูกโจมตีเพิ่ม +2 (มีผลเทิร์นถัดไป)" },
  escanorRhitta: { icon: "🪓", label: "Rhitta", cls: "bg-echo-gold text-gray-900", desc: "การโจมตีครั้งถัดไปจะบังคับลุกไหม้ 2 หน่วยที่ติดอยู่บนเป้าหมายให้ทำงานทันทีในเทิร์นนั้น" },
  escanorRhittaNoon: { icon: "🪓", label: "Rhitta Noon", cls: "bg-echo-gold text-gray-900", desc: "เมื่อโจมตีโดน จะสร้างความเสียหายใส่ผู้เล่นคนอื่นคนละ 1 หน่วย" },
  escanorSun: { icon: "☀️", label: "ดวงอาทิตย์จำลอง", cls: "bg-echo-hp", desc: "การโจมตีครั้งถัดไปเป็นโจมตีหมู่ และพลังโจมตีพื้นฐานถูกตั้งเป็น 0" },
  triggerCircle: { icon: "⚔️", label: "ดาบวงจักร", cls: "bg-echo-cyan text-gray-900", desc: "Circle Arms: การโจมตีมอบแสงสว่าง 2 และฟื้นพลังชีวิต 2 หน่วย" },
  triggerMulti: { icon: "⭕", label: "จักรแห่งแสง", cls: "bg-echo-gold text-gray-900", desc: "Multi Sword Finish: โจมตีใครก็ได้ ถ้าเป้าหมาย HP สูงสุดดาเมจ +1 แต่ถ้าเป้าหมาย HP ต่ำกว่า 5 ดาเมจเหลือ 2 และมอบแสงสว่างเพิ่มอีก 2 หน่วย ใช้แล้วหาย" },
  triggerZeperion: { icon: "🌟", label: "ลำแสง Zeperion", cls: "bg-echo-magenta", desc: "การโจมตีครั้งถัดไปได้ดาเมจเพิ่ม +1 ต่อแสงสว่างทุก 2 หน่วยบนเป้าหมาย คงอยู่จนกว่าจะโจมตีสำเร็จ และล้างแสงสว่างของเป้าหมายทั้งหมด" },
  triggerLight: { icon: "✨", label: "แสงสว่าง", cls: "bg-echo-gold text-gray-900", desc: "แสงสว่าง: สะสมได้สูงสุด 6 หน่วย เป็นพลังเสริมให้ลำแสง Zeperion" },
  // ---------- ดูมกาย ----------
  doomDrain: { icon: "🌀", label: "โดนดูด", cls: "bg-echo-magenta", desc: "[โดนดูด] (Plasma Rifle): ดาเมจ 1 หน่วยทุกต้นเทิร์น (เจาะเกราะก่อน) ตามจำนวนเทิร์นที่เหลือ" },
  // ---------- ทาคุมิ ฟุจิวาระ ----------
  takumiBlackout: { icon: "🌑", label: "มองไม่เห็น", cls: "bg-echo-hp", desc: "ถึงจะมองไม่เห็น แต่ฉันยังอยู่: บังตากระดานทั้งหมด (HP/เกราะ/โล่/แต้มการ์ด/แต้มสกิลผู้อื่น) — คนแรกที่ไพ่แตกจะโดนดาเมจ 3 หน่วย + ผุพัง 3 เทิร์น แล้วสถานะนี้จบทันที" },
  // ---------- ยูนะ ไอดอลประจำสนาม (patch 2.2.6) — ต้าน/ลบไม่ได้ ไม่อยู่ในสถานะพื้นฐานทั่วไป ----------
  yunaDelete: { icon: "💜", label: "Delete", cls: "bg-echo-magenta", desc: "Delete (ยูนะ): ดาเมจที่ได้รับเพิ่มขึ้น +1 ตามจำนวนเทิร์นที่เหลือ — ต้าน/ลบไม่ได้ ซ้อนกับเปราะบางได้" },
  yunaSmile: { icon: "💚", label: "Smile for You", cls: "bg-echo-cyan text-gray-900", desc: "Smile for You (ยูนะ): ดาเมจที่ได้รับลดลง -1 ตามจำนวนเทิร์นที่เหลือ — ต้าน/ลบไม่ได้" },
  yunaLonging: { icon: "✨", label: "Longing", cls: "bg-echo-gold text-gray-900", desc: "Longing (ยูนะ): พลังโจมตี +1 ตามจำนวนเทิร์นที่เหลือ (ได้รับตอนฟื้นคืนชีพ)" },
  heroSword: { icon: "⚔️", label: "ดาบผู้กล้า", cls: "bg-echo-gold text-gray-900", desc: "ดาบผู้กล้า: พลังโจมตีปกติ +2 ตามจำนวนเทิร์นที่เหลือ" },
  // ---------- Bard : คีตกวี (patch 2.2) ----------
  resist:    { icon: "🛡️", label: "ต้านผิดปกติ", cls: "bg-echo-gold text-gray-900", desc: "ต้านสถานะผิดปกติ: ล้างและต้านทานดีบัฟพื้นฐาน (ขัดแย้ง/หลับไหล/สตั้น/ห้ามจั่ว/ห้ามใช้สกิล/พิษ/อ่อนแอ/เปราะบาง/ภาระเวท) ตามจำนวนเทิร์นที่เหลือ — ดีบัฟที่ยังไม่เกิดผลทันที (ยามฟ้าสาง/เส้นชีวิต) ถูกล้างจะลดลงทีละ 1 หน่วย" },
  guard:     { icon: "💗", label: "คุ้มครอง", cls: "bg-echo-armor", desc: "คุ้มครอง: ความเสียหายจากการถูกโจมตีลดลงตามจำนวนที่ระบุ (ไม่ระบุ = 1) ตามจำนวนเทิร์นที่เหลือ" },
  fortune:   { icon: "🍀", label: "โชคลาภ", cls: "bg-echo-gold text-gray-900", desc: "โชคลาภ: จั่วครั้งถัดไปจะปรับไพ่ที่จั่วให้แต้มรวมตกอยู่ 19-21 ทันที (ถ้าไม่มีไพ่ที่ทำให้ถึงเป้าได้พอดี จั่วแบบสุ่มตามปกติ) แล้วหน่วยนั้นหายไป (ซ้อนทับได้สูงสุด 3 — ไม่ได้ใช้ 3 เทิร์นติดกันจะหมดฤทธิ์เอง)" },
  empower:   { icon: "💪", label: "เสริมพลัง", cls: "bg-echo-gold text-gray-900", desc: "เสริมพลัง: การโจมตีครั้งถัดไป +1 ดาเมจ (ไม่ซ้อนทับ — หมดเมื่อได้โจมตี) — จาก Rejuvenation ของคีตกวี หรือ Fury ขั้น 3 ของผู้สังหารเมจ" },
  linked:    { icon: "🔗", label: "เชื่อมผล", cls: "bg-echo-magenta", desc: "เชื่อมผล: HP โดนดาเมจ, เกราะโดนดาเมจ, ฟื้นฟู HP และฟื้นฟูเกราะ ถูกแชร์ให้คู่เชื่อมเท่ากัน 1:1 (ฝ่ายหนึ่งเสีย/ได้ อีกฝ่ายเสีย/ได้ตาม) ตามจำนวนเทิร์นที่เหลือ" },
  discord:   { icon: "⚡", label: "ขัดแย้ง", cls: "bg-echo-hp", desc: "Discord: ความเสียหายที่ได้รับจากการถูกโจมตี +1 หน่วย ตามจำนวนเทิร์นที่เหลือ" },
  evade:     { icon: "💨", label: "หลบหลีก", cls: "bg-echo-cyan text-gray-900", desc: "หลบหลีก: หลบการโดนโจมตีตาม % ที่ระบุ (ไม่ระบุ = 100%) — ซ้อนทับได้สูงสุด 3 หมดไปทีละ 1 เมื่อถูกเลือกโจมตี — ไม่ได้ใช้ 3 เทิร์นติดกันจะหมดฤทธิ์เอง" },
  bloodDim:  { icon: "❤️", label: "มิติโลหิต", cls: "bg-echo-hp", desc: "มิติมายาบรรเลงโลหิต (นับเป็นตอนเช้า): กดโน้ตได้สูงสุด 6 ครั้งต่อเทิร์น — ตอนเปิดมิติ คีตกวีได้ต้านสถานะผิดปกติ 3 เทิร์น หลบหลีก 1 โชคลาภ 1 และผู้เล่นทุกคน (ยกเว้นคีตกวี) ติดเปราะบาง +1 ดาเมจที่ได้รับ 3 เทิร์น" },
  soulDim:   { icon: "💚", label: "มิติวิญญาณ", cls: "bg-echo-magenta", desc: "มิติมายาบรรเลงวิญญาณ (นับเป็นตอนกลางคืน): กดโน้ตได้สูงสุด 6 ครั้งต่อเทิร์น — ตอนเปิดมิติ คีตกวีได้ต้านสถานะผิดปกติ 3 เทิร์น หลบหลีก 1 โชคลาภ 1 และทุกการบรรเลงทำนอง ทำความเสียหาย 1 หน่วยแบบสุ่มกับผู้เล่น 2 คน จนกว่ามิติจะสิ้นสุด (เป้าหมายไม่สามารถถูกฆ่าได้จากเอฟเฟกต์นี้)" },
  // ---------- เรียวกิ ชิกิ (patch 2.0.6) ----------
  knife:     { icon: "🔪", label: "มีดพก", cls: "bg-echo-cyan text-gray-900", desc: "มีดพก: การโจมตีปกติฟื้นพลังชีวิตให้ตัวเอง 3 หน่วย ตามจำนวนเทิร์นที่เหลือ" },
  deathline: { icon: "🩸", label: "เส้นชีวิต", cls: "bg-echo-hp", desc: "เส้นชีวิต (เนตรมารแห่งความมรณะ / เทเปา): สะสมจากการเปิดไพ่แต้มเท่ากับชิกิ / สกิลรอง / ท่าไม้ตาย 2 / การโจมตีปกติและสกิลติดตัวของเทเปา — โหมดท่า 1: ครบ 6 แล้วถูกชิกิโจมตีปกติระหว่างท่าไม้ตาย = ถูกสังหารทันที (ถูกโจมตีก่อนครบ = รีเซ็ตทั้งหมด) / โหมดท่า 2 (patch 2.0.8): สะสมได้สูงสุด 5 — ระหว่างความตายที่โรยรา เส้นชีวิตแปรเป็นดาเมจเสริมการโจมตีปกติของชิกิ +1 ต่อเส้น (พลังโจมตีรวมสูงสุด 5) และมีโอกาสถูกสังหารทันที 1% คงที่ / เทเปา: ท่าไม้ตาย นายเป็นคนทำตัวเองนะ คิดโอกาสสังหารจากเส้นชีวิตนี้ (1 หน่วย = 10%)" },
  deatheye:  { icon: "👁️", label: "เนตรมาร", cls: "bg-echo-hp", desc: "ฉันมองเห็นมันแล้ว: โจมตีปกติใส่ผู้เล่นที่มีเส้นชีวิตครบ 6 = สังหารทันที (บังคับตาย) — จัดการได้ 1 คน ท่าไม้ตายปิดลงทันที" },
  wither:    { icon: "🥀", label: "โรยรา", cls: "bg-echo-hp", desc: "ความตายที่โรยรา (rework patch 2.0.8): ทุกเทิร์นมอบเส้นชีวิต +1 ให้ผู้เล่นทุกคน (ยกเว้นชิกิ) — ท่าไม้ตายแจกได้สูงสุด 3 หน่วยต่อคน (รวมแหล่งปกติสูงสุด 5) — โจมตีปกติ: เส้นชีวิตแปรเป็นดาเมจเสริม +1 ต่อเส้น (พลังโจมตีรวมสูงสุด 5 ต่อครั้ง) และมีโอกาสสังหารทันที 1% คงที่ เพิ่มไม่ได้ — เมื่อท่าจบลง (สังหารสำเร็จ/หมดเวลา) เส้นชีวิตส่วนที่ท่าแจกไปถูกลบออกจากทุกคน" },
  godslay:   { icon: "👁️", label: "ยกเลิกอัลติ", cls: "bg-echo-gold text-gray-900", desc: "นายมีฝีมือแค่ไหนหรอ?: ชิกิพร้อมยกเลิกท่าไม้ตายของผู้เล่นอื่น 1 คน 1 ครั้ง (2 เทิร์น — ผลยังอยู่กดสกิลซ้ำไม่ได้) — ผู้เล่นอื่นคนแรกที่กดท่าไม้ตายระหว่างนี้จะถูกยกเลิกทันที (แต้มสกิลเสียฟรี) และหากเจ้าของท่าไม้ตายที่มีผลอยู่ก่อนแล้วมาโจมตีชิกิ จะถูกยกเลิกท่าแบบย้อนหลังทันที" },
  // ---------- แบทแมน (เบน แอฟเฟล็ก) (patch 2.2.7) ----------
  batStealth: { icon: "🌑", label: "เร้นเงา", cls: "bg-echo-cyan text-gray-900", desc: "เร้นเงา: ซ่อนตัวในความมืด — ฟื้นพลังชีวิต +1 ทุกเทิร์น (ถูกโจมตีก็ไม่หลุด ไม่มีข้อเสียใดๆ) แต่โจมตีปกติไม่ได้ระหว่างนี้ — เมื่อครบเวลา จะเล่นวีดีโอแล้วระเบิดใส่ผู้เล่นทุกคน 1 หน่วย (รวมแบทแมนเอง) และมอบ [ห้ามใช้สกิล] 3 เทิร์นให้ทุกคนยกเว้นแบทแมน" },
  batKarma:   { icon: "🎁", label: "กรรมถึงตัว", cls: "bg-echo-gold text-gray-900", desc: "นายลืมของน่ะ: ถูกโจมตีครั้งถัดไปแล้วจะไม่ได้รับความเสียหายเลย — รับก้อนนั้นไว้แล้วเลือกส่งต่อให้ผู้เล่น 1 คนแทน (เลือกผู้โจมตีเองก็ได้ · ไม่สนการหลบหลีก) — ทำงานได้ 1 ครั้งแล้วหายไป · ระหว่างท่าไม้ตายทำงาน จำนวนที่ส่งต่อ +1" },
  batTaunt:   { icon: "🦇", label: "เข้ามาเลย", cls: "bg-echo-magenta", desc: "เข้ามาเลย: ล่อเป้าการโจมตีของผู้เล่นทุกคนมาที่แบทแมน — ความเสียหายที่ผู้โจมตีทำใส่แบทแมนจะเกิดขึ้นกับผู้โจมตีเองด้วยเท่ากัน และแบทแมนฟื้นพลังชีวิต +1 ทุกเทิร์น (ใช้คู่กับ [กรรมถึงตัว] ไม่มีใครเจ็บทั้งคู่ แต่ส่งต่อ +1)" },
  // ---------- เจ้าหญิงราก (เรียวกิ ชิกิ) (patch 2.2.7) ----------
  pshikiBlade: { icon: "🗡️", label: "ชักดาบ", cls: "bg-echo-gold text-gray-900", desc: "อืม ฉันเข้าใจแล้ว: เจ้าหญิงรากชักดาบออกมาแล้ว — เทิร์นนี้โจมตีปกติได้ (ปกติสกิลติดตัวห้ามไว้) และหากได้โจมตีจริงจะฟื้นพลังชีวิต 2 หน่วย" },
  pshikiUlt:   { icon: "👁️", label: "ราบรื่น", cls: "bg-echo-magenta", desc: "ทุกอย่างจะต้องราบรื่น: ท่าไม้ตายของเจ้าหญิงรากกำลังทำงาน — ผู้เล่นทุกคนบนสนามได้รับบัฟ [เนตรมณะ] 5 เทิร์น" },
  netramana:   { icon: "✨", label: "เนตรมณะ", cls: "bg-echo-gold text-gray-900", desc: "เนตรมณะ (สถานะ Universal): การโจมตีปกติของผู้ที่ติดบัฟนี้ มีโอกาสสังหารเป้าหมายทันที 20% ตามจำนวนเทิร์นที่เหลือ — เป็นบัฟ ไม่ใช่ดีบัฟ (ยาต้านสถานะผิดปกติล้างไม่ได้) และซ้อนกับโอกาสสังหารจากสกิลติดตัวของตัวละครเองได้ — วีดีโอสังหารจะเล่นเฉพาะตอนเจ้าหญิงรากเป็นผู้ลงมือเองเท่านั้น ตัวละครอื่นที่ได้บัฟไปจะสังหารแบบเงียบๆ" },
  // ---------- เทเปา (ชิกิ) (patch 2.2 new) ----------
  tepeuCook:   { icon: "🍳", label: "กำลังทำอาหาร", cls: "bg-echo-gold text-gray-900", desc: "วันนี้อากาศดีจัง: กำลังทำอาหารอยู่ — ครบ 2 เทิร์นจะได้ 'มื้อที่สุข' เข้าคลัง (ฟื้นเลือด 3 เมื่อใช้) ระหว่างนี้กดสกิลนี้ซ้ำไม่ได้" },
  tepeuPonder: { icon: "🤔", label: "ครุ่นคิด", cls: "bg-echo-cyan text-gray-900", desc: "เป็นแบบนี้นี่เอง: ครุ่นคิดอยู่ — จั่วไพ่ไม่ได้ (ยังโจมตีได้ถ้าชนะ) จบเทิร์นได้แต้มสกิลเพิ่ม +1 (เทิร์นสุดท้ายได้ +2) — ผู้เล่นอื่นที่ชนะการจั่วไพ่ระหว่างนี้จะติดเส้นชีวิต +1" },
  // ---------- โอกูริ แคป (Rework) ----------
  graybeast: { icon: "🐴", label: "GrayBeast", cls: "bg-echo-gold text-gray-900", desc: "ร่าง Zone: ได้รับ Energy +1 ทุกเทิร์น และแต้มสกิล +1 ทุก 2 เทิร์น — หายไปเมื่อไม่มียุคทองเหลืออยู่" },
  burnout: { icon: "💦", label: "หมดแรง", cls: "bg-echo-hp", desc: "Burnout: Energy หมดและไม่มียุคทอง — Breakfast ได้ Energy ลดลง -2 และติดผุพัง (เกราะไม่ฟื้น) — หายไปเมื่อครบ 2 เทิร์น" },
  goldenera: { icon: "🏇", label: "ยุคทอง", cls: "bg-echo-gold text-gray-900", desc: "ยุคทอง: พลังโจมตีพื้นฐาน +1 ทุกแต้มที่ติดอยู่บนตัว (บวกได้ไม่เกิน 2) และครบ 2 แต้มขึ้นไปเพดานเกราะ +1 — สะสมสูงสุด 3 แต้ม อยู่ 6 เทิร์น (รีเฟรชเมื่อได้แต้มใหม่) · ครบ 3 แต้มตอนเริ่มเทิร์นจะเข้าสู่ร่าง Zone (ยุคทองหมด = ออกจากร่าง Zone)" },
  flow: { icon: "💨", label: "Flow", cls: "bg-echo-cyan text-gray-900", desc: "Flow: โอกาสหลบการโจมตี 50% — ใช้แล้วหมดไปไม่ว่าจะหลบสำเร็จหรือไม่ (หรือหมดเองเมื่อครบ 3 เทิร์น)" },
  trainBonus: { icon: "🍀", label: "Bonus", cls: "bg-echo-gold text-gray-900", desc: "Bonus: โอกาสฝึกฝนสำเร็จ (Training) เพิ่มเป็น 80% ตามจำนวนเทิร์นที่เหลือ" },
  sunny: { icon: "☀️", label: "Sunny Day", cls: "bg-echo-gold text-gray-900", desc: "Sunny Day: ได้รับโชคลาภ +1 ทุกเทิร์นที่มีบัฟนี้ ตามจำนวนเทิร์นที่เหลือ" },
  fullbelly: { icon: "🥖", label: "เต็มอิ่ม", cls: "bg-echo-armor", desc: "เต็มอิ่ม (Breakfast): ดาเมจที่ได้รับ -1 หน่วย — หายไปหลังจบเทิร์นที่กดใช้ (สะสมได้ 1 แต้ม)" },
  victorybeat: { icon: "🏆", label: "Beat of Victory", cls: "bg-echo-gold text-gray-900", desc: "The Beat of Victory: หากชนะเทิร์นนี้ พลังโจมตี +2 (ซ้อนทับยุคทองได้) และเป้าหมายติดเกินเยียวยา+ชะงัก 2 เทิร์น" },
  ashen: { icon: "🐴", label: "Ashen Trail", cls: "bg-echo-hp", desc: "Ashen Trail: Cinderella Gray — หลังเปิดไพ่จะโจมตีใส่ทุกคนที่ไพ่แตก คนละ 2 หน่วย" },
  stagger: { icon: "🫨", label: "ชะงัก", cls: "bg-echo-hp", desc: "ชะงัก (The Beat of Victory): ฟื้นฟูแต้มสกิลไม่ได้ทุกช่องทาง ตามจำนวนเทิร์นที่เหลือ" },
  // ---------- สึงาชิ ทาคุโตะ (patch 2.2 new / 2.2.3) ----------
  star:       { icon: "⭐", label: "ดวงดาว", cls: "bg-echo-gold text-gray-900", desc: "ดวงดาว: สะสมจากสกิลพื้นฐานฉันได้ยินเสียงของโลก — ครบ 5 หน่วย แปลงร่างเป็นทาวเบิร์นทันที (ฉันคว้ามันได้แล้ว)" },
  apprivoise: { icon: "🔥", label: "ฉันคว้ามันได้แล้ว", cls: "bg-echo-hp", desc: "ร่างทาวเบิร์น: ปลดล็อกสกิลพื้นฐาน 2/สกิลรอง/ท่าไม้ตาย พลังโจมตีถาวร +1 — คงอยู่ 10 เทิร์น หมดแล้วกลับเป็นทาคุโตะปกติ ต้องเก็บดวงดาวให้ครบ 5 อีกครั้งเพื่อแปลงร่างใหม่ (กันตายสกิลติดตัว 1 ทำงานเมื่อไหร่ เวลาจะถูกนับใหม่เต็ม 10 เทิร์น)" },
  emeraude:   { icon: "💚", label: "ดาบแห่งแสงเอเมอโรด", cls: "bg-echo-armor", desc: "Star Sword Emeraude: การโจมตีปกติครั้งถัดไปฟื้นพลังชีวิตตามความเสียหายที่ทำได้ — มีร่วมกับดาบแห่งแสงแซฟไฟร์ (Saphir) = การันตีโจมตีเพิ่มอีกครั้งทันที" },
  saphir:     { icon: "💙", label: "ดาบแห่งแสงแซฟไฟร์", cls: "bg-echo-cyan text-gray-900", desc: "Star Sword Saphir: ลำพังไม่มีผลอะไรเพิ่มเติม — ต้องมีดาบแห่งแสงเอเมอโรด (Emeraude) ติดตัวด้วยเท่านั้น การโจมตีปกติครั้งถัดไปจึงจะได้โจมตีเพิ่มอีกครั้งทันที (การันตี)" },
  lance:      { icon: "🔱", label: "หอกผู้พิชิต", cls: "bg-echo-gold text-gray-900", desc: "ทั้งสองสิ่งรวมเป็นหนึ่ง: ดาบเอเมอโรดและแซฟไฟร์หลอมรวมเป็นหอกเดียว — การโจมตีปกติครั้งถัดไปดาเมจคงที่ 5 หน่วย และฟื้นพลังชีวิต +3 ใช้แล้วหอกจะถูกล้างออก ต้องรวมดาบทั้งคู่ใหม่อีกครั้ง" },
  takutoThirdAtk: { icon: "✨", label: "พิชิตแสงดาว", cls: "bg-echo-hp", desc: "อย่างนายน่ะ จะไปเข้าใจอะไร: การโจมตีคอมโบครั้งนี้มีโอกาส 50% ได้โจมตีเพิ่มเป็นครั้งที่ 3" },
  // ---------- เอจิ (patch 2.4 new) ----------
  eijiSwift: { icon: "💨", label: "ความเร็วสูง", cls: "bg-echo-cyan text-gray-900", desc: "ว่องไว: อัตราหลบหลีก +20% (หลบสำเร็จได้ 1 ครั้งต่อเทิร์น · ซ้อนทับกับท่าไม้ตาย +20% และ Ordinal Scale +20%/ครั้ง ได้) · ฟื้นพลังชีวิต +1 ต่อเทิร์นระหว่างมีผล · หมดอายุแล้วคืนแต้มสกิล +2" },
  eijiSword: { icon: "⚔️", label: "ดาบแห่งความทรงจำ", cls: "bg-echo-hp", desc: "ความแค้น: ยกระดับโอกาสดาเมจ 2 เท่าจากฐานติดตัว 20% เป็นค่าที่คิดจากเกราะ + พลังชีวิตของเอจิรวมกัน (1 หน่วย = 10% · ใช้ค่าที่สูงกว่า) — ติดเมื่อไหร่ฟื้นพลังชีวิต +1" },
  eijiUlt: { icon: "🔥", label: "ไม่ว่ายังก็ตาม", cls: "bg-echo-gold text-gray-900", desc: "ไม่ว่ายังก็ตาม: บังคับเปิดสนาม Break Beat Bark! — ทุกคนได้พลังโจมตีปกติ +1 · เวลาเฟสจั่วการ์ดเหลือ 40 วินาที · เอจิหลบหลีก +20% และได้แต้มสกิล +1 ต่อเทิร์น" },
  // ---------- มิซึซาว่า ฮารุกะ (patch 2.5 new) ----------
  harukaOmega:  { icon: "🦾", label: "โอเมก้า", cls: "bg-echo-gold text-gray-900", desc: "New Omega: การโจมตีปกติมอบสถานะ \"เลือดไหล\" ให้เป้าหมาย 3 หน่วยทุกครั้ง · มีโอกาส 15% สวนกลับผู้ที่โจมตีปกติใส่ฮารุกะเป็นความเสียหาย 1 หน่วย พร้อมแปะเลือดไหลให้ผู้โจมตี 2 หน่วย และมอบสตั้น 1 เทิร์นในเทิร์นถัดไป · กดท่าไม้ตายซ้ำได้เพื่อระเบิดแต้มการ์ดอีกครั้ง (ต่ออายุเป็น 10 เทิร์นใหม่)" },
  harukaPunish: { icon: "⚖️", label: "จงไปสู่สุขติ", cls: "bg-echo-magenta", desc: "amazon punish: ตลอด 3 เทิร์นที่สถานะนี้ติดอยู่ ทุกการโจมตีปกติที่ใส่เป้าหมายซึ่งมี \"เลือดไหล\" ตั้งแต่ 3 หน่วยขึ้นไป จะจุดชนวนให้ระเบิดเป็นความเสียหายเพิ่มตามจำนวนหน่วยที่ติดอยู่ แล้วล้างเลือดไหลทั้งหมด — ระเบิดซ้ำได้หลายครั้งตลอด 3 เทิร์น (เป้าหมายต้องสะสมเลือดไหลใหม่ให้ครบก่อน)" },
  // ---------- อิสึกะ ชิโด (patch 2.9 new) ----------
  shidoSpirit: { icon: "🕊️", label: "ภูติ", cls: "bg-echo-armor", desc: "ภูติ: ฟื้นพลังชีวิต 1 หน่วยตอนเริ่มเทิร์น และการโจมตีปกติดูดพลังชีวิตกลับมา 1 หน่วย ตามจำนวนเทิร์นที่เหลือ" },
  shidoSword: { icon: "⚔️", label: "Sandalphon", cls: "bg-echo-gold text-gray-900", desc: "Sandalphon: ฟื้นแต้มสกิล +1 ต่อเทิร์นระหว่างมีผล · พลังโจมตีปกติถูกแทนที่ด้วยพลังดาบที่ล็อกไว้ตอนกด (เท่ากับความเสียหายที่ \"ขอพลังให้ฉันด้วย\" บันทึกไว้ล่าสุด) — โดนโจมตีใหม่ระหว่างนี้ค่าดาบจะไม่เปลี่ยน ต้องกดสกิลรองใหม่ถึงจะอัปเดต" },
  // ---------- โมโรโบชิ ดัน (patch 2.8 new) ----------
  danCrutch:   { icon: "🦯", label: "ไม้ค้ำ", cls: "bg-echo-armor", desc: "ไม้ค้ำ: ฟื้นพลังชีวิต 1 หน่วยตอนเริ่มเทิร์น ตามจำนวนเทิร์นที่เหลือ — ระหว่างที่ยังมีผลอยู่ ดันกดสกิลพื้นฐานซ้ำไม่ได้" },
  danDisciple: { icon: "🎓", label: "ศิษย์", cls: "bg-echo-gold text-gray-900", desc: "ศิษย์ (โมโรโบชิ ดัน): พลังโจมตี +1 หน่วย — แต่ถ้าโจมตีปกติใส่ดัน จะโดนสวนคืนทันที 3 หน่วย แล้วสถานะนี้จะหลุดออกไปเลย (สั่งสอนได้ครั้งเดียวต่อการมอบ 1 ครั้ง) · ระหว่างที่ยังติดอยู่ ความเสียหายที่ดันได้รับจากศิษย์คนนี้จะลดลง 2 หน่วย" },
  danChase:    { icon: "🚗", label: "จงหลบแต่อย่าหนี", cls: "bg-echo-hp", desc: "จงหลบแต่อย่าหนี (โมโรโบชิ ดัน): ทุกครั้งที่แต้มแพ้จะโดนรถชน 1 หน่วย และถ้าการ์ดแตกจะโดน 2 หน่วย — สลัดหลุดได้ด้วยการหันไปโจมตีดันครบ 2 ครั้งเท่านั้น (ตีคนอื่นไม่นับ) · แพ้แต้มติดกัน 2 ครั้ง (ไม่นับการ์ดแตก) ดันจะเปลี่ยนท่าไม้ตายเป็น \"อย่าให้ฉันต้องเฆี่ยนตี\"" },
  // ---------- ซาโตรุ อาเคฟุ (patch 2.0.8.2) ----------
  oblada:   { icon: "🎵", label: "สิ่งแปลกปลอม", cls: "bg-echo-hp", desc: "ObLa Di, ObLa Da: รับความเสียหาย 1 หน่วยทุกๆ 2 เทิร์น เป็นเวลา 4 เทิร์น" },
  // ---------- ริดดี้ มาร์เซนาส (patch 2.0.9) ----------
  absorbplus: { icon: "🧲", label: "Absorb Shield", cls: "bg-echo-armor", desc: "Absorb Shield: เพดานเกราะ +2 พร้อมเกราะชั่วคราว (1 เทิร์น) — หลังเปิดไพ่ ล่อเป้าการโจมตีของทุกคนมาที่ตัวเอง และเกราะที่เสียจากการถูกตี/แพ้ แปลงกลับเป็นพลังชีวิต" },
  beamplus:  { icon: "🔫", label: "Beam Plus", cls: "bg-echo-magenta", desc: "Beam Magnum Plus: การโจมตีปกติเทิร์นนี้กลายเป็นตีหมู่ +1 หน่วย (ผู้เล่นอื่นนอกเป้าหมายเสียเกราะ 1) — ซ้อนกับ NT-D ได้ รวมสูงสุด +1" },
  riddhentd: { icon: "⚡", label: "NT-D", cls: "bg-echo-gold text-gray-900", desc: "แกไม่มีสิทธิ์มาสั่งสอนฉัน: NT-D System — พลังโจมตีพื้นฐาน +1 หน่วย ตามจำนวนเทิร์นที่เหลือ" },
  riddheguard: { icon: "🛡️", label: "ไม่ยอมสูญเสีย", cls: "bg-echo-hp", desc: "ฉันจะไม่ยอมสูญเสียใครไปอีก: เพดานเกราะ +2 และต้านสถานะผิดปกติให้ทั้งคู่ — ระหว่างนี้ริดดี้จั่วการ์ด/ใช้สกิล/โจมตีไม่ได้ ริดดี้เองตายไม่ได้ (HP ต่ำสุด 1) และถ้าเกราะรวมเสียถึง 3 หน่วย ฟื้นเกราะให้ทั้งคู่ +2 พร้อมวีดีโอพิเศษ" },
  riddheward: { icon: "🛡️", label: "บันชีปกป้อง", cls: "bg-echo-armor", desc: "ได้รับการปกป้องจากบันชี: เพดานเกราะ +2 และต้านสถานะผิดปกติ ตามจำนวนเทิร์นที่เหลือ" },
  calamity: { icon: "🌩️", label: "Calamity", cls: "bg-echo-hp", desc: "Wonder of U: หายนะไล่ล่า — ต้าน/ล้างไม่ได้ ถูกบังคับจั่วไพ่เพิ่มตามระดับตอนเริ่มเทิร์นถัดจากที่โดน และรับความเสียหายตามระดับทุกๆ 2 เทิร์น" },
  // ---------- 14 ปีกแห่งสุริยัน อควาเรียน (patch 2.0) ----------
  // ---------- นานายะ ชิกิ (patch 2.1.9) ----------
  nanayaSeal: { icon: "👁️", label: "สกิลติดตัวถูกปิด", cls: "bg-echo-hp", desc: "อันนี้ของนายรึเปล่า: ใช้สกิล/จั่วไพ่ไม่ได้ และสกิลติดตัวไม่ทำงาน ตามจำนวนเทิร์นที่เหลือ" },
  // ---------- อาริมะ มิยาโกะ (patch 2.2.0) ----------
  miyakoHeal:  { icon: "💗", label: "พี่จ๋าอยู่ไหน", cls: "bg-echo-gold text-gray-900", desc: "พี่จ๋าอยู่ไหน: การโจมตีปกติครั้งถัดไปฟื้นเลือด +1 — คงอยู่จนกว่าจะได้โจมตี" },
  miyakoCombo: { icon: "🥊", label: "เพลงหมัด อาริมะ", cls: "bg-echo-cyan text-gray-900", desc: "เพลงหมัด อาริมะ: การโจมตีปกติครั้งถัดไปต่อคอมโบได้สูงสุด 4 ครั้ง (ครั้งที่ 1 ตีแน่นอน / 2:100% / 3:50% / 4:25%) — คงอยู่จนกว่าจะได้โจมตี" },
  miyakoUlt:   { icon: "🎯", label: "หนูจะเอาจริงแล้วนะ", cls: "bg-echo-gold text-gray-900", desc: "หนูจะทำให้พี่ตาสว่างเอง: แต้มการจั่วกลายเป็น 20 — เมื่อได้โจมตีจะปิดความสามารถสังหารทันทีของเป้าหมาย หรือเสริมพลังโจมตีถาวร +1 พร้อมมอบผุพัง" },
  miyakoSeal:  { icon: "🥊", label: "ไม่ยอมให้ฆ่าใครอีกแล้ว", cls: "bg-echo-hp", desc: "ไม่ยอมให้ฆ่าใครอีกแล้ว: ความสามารถสังหารทันทีถูกปิดใช้งาน ตามจำนวนเทิร์นที่เหลือ" },
  yaak:        { icon: "🥊", label: "ย๊ากก!", cls: "bg-echo-gold text-gray-900", desc: "ย๊ากก!: การโจมตีปกติ +1 หน่วย คงอยู่จนกว่าจะได้โจมตี — ถ้ามีเพลงหมัด อาริมะด้วย จะติดอยู่ทุกหมัดในคอมโบ (นับทั้งคอมโบเป็นการโจมตีครั้งเดียว)" },
  // ---------- สถานะ Universal (patch 2.2.1) ----------
  invert:     { icon: "🔄", label: "ผกผัน", cls: "bg-echo-hp", desc: "ผกผัน: ฟื้นเลือด/เกราะ กลายเป็นเสียแทน — เพิ่มพลังโจมตี กลายเป็นลดแทน ตามจำนวนเทิร์นที่เหลือ" },
  decay:      { icon: "🥀", label: "ผุพัง", cls: "bg-echo-hp", desc: "ผุพัง: เกราะฟื้นไม่ได้ ตามจำนวนเทิร์นที่เหลือ" },
  // ---------- คิชินามิ ฮาคุโนะ (patch 2.2.1) ----------
  hakunoInvertReady:   { icon: "🌓", label: "ข้าขอบัญชา", cls: "bg-echo-cyan text-gray-900", desc: "ข้าขอบัญชา: การโจมตีปกติครั้งถัดไปทำให้เป้าหมายติดผกผัน 3 เทิร์น — คงอยู่จนกว่าจะได้โจมตี" },
  hakunoNoRegenReady:  { icon: "🌕", label: "ข้าขอบัญชา", cls: "bg-echo-magenta", desc: "ข้าขอบัญชา: การโจมตีปกติครั้งถัดไปทำให้เป้าหมายเกราะไม่ฟื้น + ไร้ทางเยียวยา — คงอยู่จนกว่าจะได้โจมตี" },
  moonCell:   { icon: "🌙", label: "MOON*CELL", cls: "bg-echo-magenta", desc: "คำสาปแห่งดวงจันทร์ MOON*CELL: ล้าง/ปิดใช้งานบัฟ ดีบัฟ สกิล และสกิลติดตัวของทุกคน (ยกเว้นเจ้าของท่า) ตามจำนวนเทิร์นที่เหลือ" },
  // ---------- อาจารย์ ไบเลธ (patch 2.6 new) ----------
  bylethSword:   { icon: "\u{1F5E1}\uFE0F", label: "ดาบต้องสาป", cls: "bg-echo-hp", desc: "ดาบต้องสาป: พลังโจมตีปกติ +2 หน่วย ใช้ได้ 1 ครั้งภายใน 3 เทิร์น (มีเสียงโจมตีเฉพาะของดาบ) — สลายไปทันทีหลังโจมตี" },
  bylethNoBasic: { icon: "\u{1F4D5}", label: "ห้ามสกิลพื้นฐาน", cls: "bg-echo-hp", desc: "หลักสูตร พิเศษ (ไบเลธ): กดสกิลพื้นฐานเมื่อเทิร์นก่อน — เทิร์นนี้กดสกิลพื้นฐานไม่ได้" },
  hisakawaLimit: { icon: "🛡️", label: "เท่าที่ไหว", cls: "bg-echo-armor", desc: "ดาเมจที่ได้รับลดลง 1 และเมื่อนากิโจมตีโดนจะมอบผกผัน 3 เทิร์น" },
  hisakawaTempo: { icon: "💨", label: "จังหวะนี้แหละ", cls: "bg-echo-cyan text-gray-900", desc: "แฝดที่กำลังคุมอยู่จะได้โจมตีหลังผู้ชนะ หากแต้มตัวเองต่ำที่สุดแบบไม่เสมอและไม่ไพ่แตก (มีผลกับทั้งสองคน คงอยู่จนกว่าจะใช้)" },
  hisakawaStage: { icon: "🎤", label: "เวทีของพวกเรา", cls: "bg-echo-magenta", desc: "แต้มสกิลฟื้นเพิ่ม +1 ทุกเทิร์น" },
  hisakawaTalent: { icon: "✨", label: "พรสวรรค์ของพวกเรา", cls: "bg-echo-gold text-gray-900", desc: "พลังโจมตี +2" },
  hisakawaDream: { icon: "🎁", label: "ฝันของเหล่าฝาแฝด", cls: "bg-echo-gold text-gray-900", desc: "แต้มสกิล +1, โจมตี +2, โชคลาภ +1 ทุกเทิร์น และทุกครั้งที่ได้โจมตีแฝดอีกคนจะออกมาโจมตีเป็นครั้งที่ 2 (100%) ดาเมจ 2 (ต้องมีแฝดครบทั้งคู่)" },
};
// รวมสถานะทั้งหมดของผู้เล่นเป็นรายการเดียว — full = รวมของที่โชว์แยกที่อื่นด้วย (โล่/เลือดชั่วคราว)
function statusEntries(p, full) {
  const out = [];
  for (const [k, v] of Object.entries(p.statuses || {})) {
    if (!(v > 0)) continue;
    // รูปโปรไฟล์แสดงร่าง Morning/Night และ Solar มีตัวนับเฉพาะด้านล่างอยู่แล้ว จึงไม่ต้องแสดงป้ายซ้ำ
    if (k === "escanorMorning" || k === "escanorNight" || k === "escanorSolar") continue;
    if (k === "mageslayerBurdenBgm") continue; // ผู้สังหารเมจ: ตัวจับเวลาเพลงพื้นหลัง Mana Burden ไม่ใช่สถานะที่ผู้เล่นต้องเห็น
    const info = STATUS_INFO[k] || { icon: "✦", label: k, cls: "bg-white/20", desc: "" };
    const amt = (p.statusAmt || {})[k] || 0; // จำนวน (amount) ของบัฟ/ดีบัฟพื้นฐาน (patch 2.0.8)
    out.push({ key: k, v, amt, ...info });
  }
  if ((p.sunriseDrop || 0) > 0) out.push({ key: "sunriseDrop", v: p.sunriseDrop, icon: "🌄", label: "แสงรุ่งอรุณ", cls: "bg-echo-hp", desc: "ผลรุ่งอรุณแห่งวันใหม่: เสียพลังชีวิต 1/เทิร์นแบบไม่สนเกราะ ตามจำนวนเทิร์นที่เหลือ" });
  if ((p.tonkatsu || 0) > 0) out.push({ key: "tonkatsu", v: p.tonkatsu, icon: "🍜", label: "ทงคัสสึ", cls: "bg-echo-cyan text-gray-900", desc: "ชามทงคัสสึสะสม (สูงสุด 4) — ใช้กับ Song for you: 1 ชาม = +1 พลังขิง และล้างสถานะผิดปกติทั้งหมด" });
  if ((p.profit || 0) > 0) out.push({ key: "profit", v: p.profit, icon: "💰", label: "กำไร", cls: "bg-echo-gold text-gray-900", desc: "กำไรเท่าตัวโว้ย: การโจมตีครั้งถัดไป +N และทะลุเกราะ (คงอยู่จนได้ตี)" });
  if ((p.appleAtk || 0) > 0) out.push({ key: "appleAtk", v: p.appleAtk, icon: "🍎", label: "มอบของ", cls: "bg-echo-gold text-gray-900", desc: "เอาไปสิ: พลังโจมตีเพิ่มจากการมอบของ +1 ต่อครั้ง ซ้อนทับได้สูงสุด 2 หน่วย — แต่ละหน่วยคงอยู่ 3 เทิร์นแยกกัน" });
  if (p.character?.id === "kotone") out.push({ key: "piggy", v: p.piggy || 0, icon: "🐷", label: `กระปุกออมสิน ${p.piggy || 0}/${p.piggyMax || 15}`, cls: "bg-echo-gold text-gray-900", desc: "กระปุกออมสินน้องหมูน้อย: โอกาส 60% ทุกครั้งที่ได้รับเหรียญ จะแบ่งเงินที่เพิ่งได้ไปหยอด (หักจากเหรียญจริง — ครั้งละไม่เกิน 3 เต็มที่ 15) — แปลงเป็นดาเมจผ่านบัฟ (รัก รักที่สุดเลย): 5/10/15 เหรียญ = +1/+2/+3" });
  // เหรียญ (gold) ไม่โชว์ในรายการสถานะอีกต่อไป — ปุ่มร้านค้าที่แผงตัวเองมีบอกอยู่แล้ว และไม่ควรให้ผู้เล่นอื่นเห็นเหรียญของเรา
  // โอกูริ แคป: Energy + Stamina ชาร์จ (โชว์เสมอ — ทรัพยากรหลักของตัวละคร แยกกัน 2 อย่าง)
  if (p.character?.id === "escanor") {
    out.push({ key: "escanorChargeInfo", v: 1, icon: "\u{1F305}", label: `Sun Charge ${p.escanorCharge || 0}/${p.escanorChargeMax || 12}`, cls: "bg-echo-gold text-gray-900", desc: "เมื่อ Sun Charge เต็มจะเข้าสู่ร่าง Noon และจะลดลงระหว่างอยู่ในร่าง Noon" });
    out.push({ key: "escanorSolarInfo", v: 1, icon: "\u2600\uFE0F", label: `Solar ${(p.statuses?.escanorSolar || 0)}/4`, cls: "bg-echo-gold text-gray-900", desc: "Solar จะเพิ่มเมื่อเอสคานอร์เปิดไพ่แพ้หรือไม่ได้โจมตี หากไม่ได้รับเพิ่มครบ 3 เทิร์นจะลดลงครั้งละ 1 หน่วย ระหว่างสุริยาไม่สิ้นแสงจะใช้ 1 หน่วยต่อเทิร์นเพื่อคงร่าง Morning และเมื่อหมดจะกลับ Night หากยังเป็นกลางคืน" });
  }
  if (p.character?.id === "oguri") {
    out.push({ key: "oguriEnergy", v: 1, icon: "⚡", label: `Energy ${p.oguriEnergy || 0}/16`, cls: "bg-echo-gold text-gray-900", desc: "Energy: ทรัพยากรของ Breakfast (+4/-2 ระหว่าง Burnout) และ Training (หัก 4) — สะสมสูงสุด 16 — Energy หมด + ไม่มียุคทอง = เข้าร่างหมดแรง (Burnout)" });
    out.push({ key: "stamina", v: 1, icon: "🏇", label: `Stamina ชาร์จ ${p.stamina || 0}/${p.oguriChargeCap || 52}`, cls: "bg-echo-cyan text-gray-900", desc: "Stamina ชาร์จ: ทรัพยากรของท่าไม้ตาย — ได้รับอัตโนมัติทุกเทิร์น 8-16 หน่วย (สุ่ม) ความจุพื้นฐาน 52 (Training เพิ่มความจุได้สูงสุด +48 รวม 100) — The Beat of Victory หัก 35 / Ashen Trail หัก 75" });
  }
  // คิชินามิ ฮาคุโนะ (patch 2.2.1): แต้มคำสาปแห่งดวงจันทร์ — สะสมครบ 3 เพื่อเปิด MOON*CELL
  // อาจารย์ ไบเลธ: แต้มความรู้ + ผลทบทวนบทเรียนที่รอไพ่ใบถัดไป (ชื่อหลักสูตรไปอยู่ที่ป้ายกลางจอแทน ไม่ซ้ำที่นี่)
  if (p.character?.id === "byleth") {
    out.push({ key: "bylethKnowledge", v: 1, icon: "\u{1F4DA}", label: `ความรู้ ${p.bylethKnowledge || 0}/${p.bylethKnowledgeMax || 20}`, cls: "bg-echo-gold text-gray-900", desc: "แต้มความรู้: ได้จากสกิลพื้นฐาน (ทบทวนบทเรียน) ครั้งละ 1 หน่วย สูงสุด 20 — จ่ายให้สกิลรอง (ดาบต้องสาป) ครั้งละ 4 หน่วย และหล่อเลี้ยงท่าไม้ตาย (หลักสูตรการสอน) เทิร์นละ 1 หน่วย" });
    if (p.bylethNextDraw === "study") out.push({ key: "bylethStudy", v: 1, icon: "\u{1F4D6}", label: "ศึกษาเพิ่ม", cls: "bg-echo-cyan text-gray-900", desc: "ทบทวนบทเรียน (ศึกษาเพิ่ม): การ์ดใบถัดไปที่จั่วได้จะนำแต้มมาบวกกับแต้มปัจจุบันตามปกติ และฟื้นพลังชีวิต 1 หน่วย — คงอยู่จนกว่าจะจั่วการ์ดใบถัดไป" });
    if (p.bylethNextDraw === "rest") out.push({ key: "bylethRest", v: 1, icon: "\u{1F4A4}", label: "พักผ่อน", cls: "bg-echo-magenta", desc: "ทบทวนบทเรียน (พักผ่อน): การ์ดใบถัดไปที่จั่วได้จะถูกนำแต้มมาลบออกจากแต้มปัจจุบันแทนที่จะบวก (แต้มต่ำสุดที่ 0) — คงอยู่จนกว่าจะจั่วการ์ดใบถัดไป" });
  }
  // อิสึกะ ชิโด (patch 2.9): ทั้งสองค่านี้ server ส่งให้เจ้าของคนเดียว (undefined สำหรับคนอื่น)
  //  ป้ายจึงโผล่เฉพาะบนแผงตัวเอง — โดยเฉพาะตัวนับกับดักที่ห้ามให้ใครเห็นเด็ดขาด
  if (p.shidoRecorded != null) {
    out.push({ key: "shidoRecorded", v: 1, icon: "🩸", label: `พลังที่บันทึกไว้ ${p.shidoRecorded}`, cls: "bg-echo-hp", desc: "ขอพลังให้ฉันด้วย: ความเสียหายที่บันทึกไว้ (เริ่มที่ 3 และไม่ต่ำกว่านั้น) — โดนแรงกว่าเดิมจะบันทึกทับ แต่ถ้าโดนเบากว่าที่บันทึกไว้ ค่าจะร่วงกลับเป็น 3 ทันที · Sandalphon แปลงตัวเลขนี้เป็นพลังโจมตีของดาบ" });
  }
  if ((p.shidoGuard || 0) > 0) {
    out.push({ key: "shidoGuardCd", v: p.shidoGuard, icon: "🕰️", label: `ฝากด้วยนะตัวฉัน ${p.shidoGuard} เทิร์น`, cls: "bg-echo-cyan text-gray-900", desc: "ฝากด้วยนะตัวฉัน: กับดักเปิดอยู่ — คุณเห็นตัวนับนี้อยู่คนเดียว ผู้เล่นคนอื่นไม่รู้เลยว่าคุณกดท่าไม้ตายไปแล้ว (พวกเขายังเห็นแต้มสกิลของคุณเต็มหลอด) · ถ้าตกรอบระหว่างนี้จะกลับมาเกิดใหม่" });
  }
  if (p.character?.id === "hakuno") out.push({ key: "hakunoMoon", v: 1, icon: "🌙", label: `คำสาปแห่งดวงจันทร์ ${p.hakunoMoonPoints || 0}/3`, cls: "bg-echo-magenta", desc: "แต้มคำสาปแห่งดวงจันทร์: สะสมจากข้าขอบัญชา (ทั้งสองร่าง) ครั้งละ +1 — ครบ 3 หน่วยเปิดใช้ท่าไม้ตาย MOON*CELL ได้ (ใช้หมดตอนกด)" });
  if ((p.phenexPain || 0) > 0) out.push({ key: "phenexPain", v: p.phenexPain, icon: "💔", label: "ความเจ็บปวด", cls: "bg-echo-hp", desc: "ความเจ็บปวดสะสม (ไม่อยากให้ใครต้องเจ็บปวด) — ปลดปล่อยเป็นความเสียหายใส่เป้าหมายที่เลือกตอนตกรอบจริง (ไม่สนการหลบหลีก)" });
  // Bard: ท่อนทำนองสะสม + โน้ตในช่องประพันธ์เพลง (ทุกคนเห็นได้)
  if ((p.bloodSection || 0) > 0) out.push({ key: "bloodSection", v: p.bloodSection, icon: "❤️", label: "ท่อนโลหิต", cls: "bg-echo-hp", desc: "ท่อนทำนองแห่งโลหิต: สะสมจากการบรรเลงเพลงสาย Crimson — ครบ 5 ชั้น เปิดมิติมายาบรรเลงโลหิต 3 เทิร์น" });
  if ((p.soulSection || 0) > 0) out.push({ key: "soulSection", v: p.soulSection, icon: "💚", label: "ท่อนวิญญาณ", cls: "bg-echo-magenta", desc: "ท่อนทำนองแห่งวิญญาณ: สะสมจากการบรรเลงเพลงสาย Jade — ครบ 5 ชั้น เปิดมิติมายาบรรเลงวิญญาณ 3 เทิร์น" });
  if ((p.bardNotes || []).length > 0) out.push({ key: "bardNotes", v: 1, icon: "🎼", label: p.bardNotes.map((n) => (n === "R" ? "❤️" : "💚")).join(""), cls: "bg-echo-cyan text-gray-900", desc: "ช่องประพันธ์เพลง: โน้ตที่เติมไว้ — ครบ 3 โน้ตจะบรรเลงทำนองตามลำดับโน้ตทันที" });
  if (p.contractWithId) out.push({ key: "contract", v: 1, icon: "📶", label: "คู่สัญญา", cls: "bg-echo-cyan text-gray-900", desc: "สนใจใช้บริการเราไหม: เพดานเกราะ +1 และพลังโจมตี +1 ตลอดสัญญา — ทุก 3 เทิร์นต้องเลือกต่อสัญญา (4 แต้ม) หรือยกเลิก" });
  // ริดดี้ (patch 2.0.9): คู่พันธมิตรบันชี × ยูนิคอร์น
  if (p.allyId) out.push({ key: "ally", v: 1, icon: "🤝", label: "พันธมิตร", cls: "bg-echo-cyan text-gray-900", desc: "พันธมิตรบันชี × ยูนิคอร์น: เห็นแต้มการ์ดของกันและกันได้ตลอด — ถ้าคู่พันธมิตรตีกันเอง ฝ่ายถูกตีเลือกยกเลิกพันธมิตรได้ (ฟื้นสิ่งที่เสียคืน) และถ้าเหลือแค่คู่พันธมิตรบนสนามแล้วเลือกคงพันธมิตร = ชนะทั้งคู่" });
  if (p.contractPartnerId) out.push({ key: "boss", v: 1, icon: "📶", label: "มีคู่สัญญา", cls: "bg-echo-gold text-gray-900", desc: "เจ้าแห่งเน็ตบ้าน: มีคู่สัญญาอยู่ 1 คน — คู่สัญญาโจมตีใส่ตัวละครนี้ ความเสียหายลด 1 หน่วย" });
  if ((p.skillDrain || 0) > 0) out.push({ key: "skillDrain", v: p.skillDrain, icon: "📵", label: "ค่าปรับ", cls: "bg-echo-hp", desc: "ปฏิเสธข้อเสนอสัญญา: แต้มสกิลหลังจบเทิร์นลด 1 หน่วย ตามจำนวนเทิร์นที่เหลือ" });
  if ((p.statuses?.chill || 0) > 0) out.push({ key: "chillDodge", v: 1, icon: "💨", label: `หลบ ${p.chillDodge != null ? p.chillDodge : 100}%`, cls: "bg-echo-cyan text-gray-900", desc: "โอกาสหลบการถูกเลือกโจมตีขณะชิวๆครับน้องๆ — เริ่ม 100% หลบได้เหลือ 50% หลบได้อีกเหลือ 25% และคงที่จนกว่าผลจะหมด" });
  if (full && (p.shield || 0) > 0) out.push({ key: "shield", v: p.shield, icon: "🛡️", label: "โล่", cls: "bg-echo-armor", desc: "กันความเสียหายครั้งถัดไปตามจำนวนโล่" });
  if (full && (p.tempHp || 0) > 0) out.push({ key: "tempHp", v: p.tempHp, icon: "💛", label: "เลือดชั่วคราว", cls: "bg-echo-gold text-gray-900", desc: "หายเองใน 2 เทิร์น หรือหมดไปเมื่อรับความเสียหาย" });
  return out;
}
// compact = ไอคอนล้วน ไม่มีข้อความชื่อ + จำกัดจำนวนแถวด้วย max แล้วยุบที่เหลือเป็นป้าย "+N"
//  ใช้กับการ์ดผู้เล่นอื่น/เป้าหมาย (บัฟ/ดีบัฟเยอะแล้วแถวยาวจนอ่านไม่รู้เรื่อง) — แตะที่การ์ดเพื่อดูรายละเอียดเต็มแทน (onInspect เดิม)
//  ปกติ (ไม่ compact) ยังมีชื่อเต็มเหมือนเดิม ใช้กับแผงตัวเราเองที่มีพื้นที่กว้างกว่า
function StatusChips({ p, left, compact, max = 5 }) {
  const items = statusEntries(p);
  if (!items.length) return null;
  const shown = compact ? items.slice(0, max) : items;
  const overflow = compact ? items.length - shown.length : 0;
  return (
    <div className={`flex flex-wrap gap-1 ${left ? "justify-start" : "justify-center"} mt-1`}>
      {shown.map((it) => {
        // เลขจำนวนสถานะทับซ้อน — โชว์ทั้งโหมด compact (การ์ดผู้เล่นอื่น) ด้วย ไม่ใช่แค่แผงตัวเอง
        //  เดิม compact = ไอคอนล้วน ผู้เล่นอื่นมองไม่เห็นว่าสถานะทับซ้อนกี่ชั้น ต้องแตะดูรายละเอียดถึงจะรู้
        const num = it.amt > 0 ? it.amt : (showStatusValue(it) ? it.v : null);
        return (
          <span
            key={it.key}
            title={`${it.label}${it.amt > 0 ? ` +${it.amt}` : ""}${showStatusValue(it) ? ` x${it.v}` : ""} — ${it.desc}`}
            className={
              compact
                ? `relative w-5 h-5 grid place-items-center text-[11px] rounded-[4px] font-bold border border-black/25 shadow shrink-0 ${it.cls}`
                : `inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-bold border border-black/25 shadow ${it.cls}`
            }
          >
            {compact ? (
              <>
                {it.icon}
                {num != null && (
                  <span className="absolute -bottom-1 -right-1 text-[8px] font-black bg-black text-white rounded-full min-w-[12px] h-[12px] px-0.5 grid place-items-center leading-none border border-white/40">
                    {num}
                  </span>
                )}
              </>
            ) : (
              <><span>{it.icon}</span><span>{it.label}{it.amt > 0 ? ` +${it.amt}` : ""}{showStatusValue(it) ? ` ${it.v}` : ""}</span></>
            )}
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          className="w-5 h-5 grid place-items-center text-[10px] font-black rounded-[4px] bg-black/65 border border-white/25 text-white shrink-0"
          title={`อีก ${overflow} สถานะ — แตะที่การ์ดเพื่อดูทั้งหมด`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

// สถานะที่เป็นสแตคถาวร/ตัวนับเรื่อยๆ ไม่ใช่ตัวนับถอยหลังเทิร์น (ต้องตรงกับรายการยกเว้นในลูปลดเทิร์นสถานะทั่วไปที่ server.js
//  ไม่งั้น StatusModal จะโชว์ "เหลือ N เทิร์น" หลอกๆ ทั้งที่ค่า v ที่แท้จริงคือจำนวนสแตคสะสม ไม่ใช่เทิร์นที่เหลือ)
const PERMANENT_STATUS_KEYS = new Set([
  "dawn", "chill", "hburn", "hbleed", "melody", "star", "emeraude", "saphir", "lance", "takutoThirdAtk",
  "doomCrucible", "fortune", "rsHopper", "cassius", "yaak", "spear", "ohger", "evade", "empower",
  "miyakoHeal", "miyakoCombo", "miyakoUlt", "hakunoInvertReady", "hakunoNoRegenReady", "kotoneLove", "kotoneReady", "kready",
  "deathline", "tepeuCook", "tepeuPonder", "hisakawaTempo", "graybeast", "grit", "healthfull", "overweight",
]);

const isPermanentTurnValue = (it) => (it.v || 0) >= 999;
const isPermanentStatus = (it) => PERMANENT_STATUS_KEYS.has(it.key) || isPermanentTurnValue(it);
const showStatusValue = (it) => it.v > 1 && !isPermanentTurnValue(it);

function TwinVitals({ p, compact = false }) {
  const twins = p.hisakawa?.twins || [];
  if (!twins.length) return null;
  const max = compact ? 3 : 4;
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${compact ? "w-full" : "mt-1.5 max-w-[22rem]"}`}>
      {twins.map((t) => {
        const twinP = {
          ...p,
          hp: t.hp,
          maxHp: t.maxHp,
          armor: t.armor,
          maxArmor: t.maxArmor,
          tempHp: 0,
          shield: 0,
          statuses: t.statuses || {},
          statusAmt: t.statusAmt || {},
          hisakawa: null,
        };
        return (
          <div
            key={t.key}
            className={`min-w-0 rounded-lg border bg-black/35 px-2 py-1.5 ${!t.alive ? "opacity-55 grayscale" : ""}`}
            style={{ borderColor: t.active ? p.color : "rgba(255,255,255,.18)" }}
          >
            <LifeBar p={twinP} sm />
            <div className="max-h-[24px] overflow-hidden">
              <StatusChips p={twinP} left compact max={max} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- หน้าต่างดูสถานะ + รายละเอียดสกิลของผู้เล่น (แตะการ์ดผู้เล่นคนไหนก็ได้ตอนไม่ได้เลือกเป้า) ----------
//  patch 1.9.1: เพิ่มรายละเอียดสกิลตัวละครของฝั่งตรงข้ามให้กดดูได้จากหน้ากระดาน
function StatusModal({ p, onClose, statusOnly }) {
  const items = statusEntries(p, true);
  const ch = p.character;
  const skillRows = !statusOnly && ch
    ? [["สกิลติดตัว", ch.passive], ["สกิลพื้นฐาน", ch.basic], ["สกิลรอง", ch.secondary], ["ท่าไม้ตาย", ch.ultimate]]
    : [];
  return (
    <div className="fixed inset-0 z-40 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {statusOnly ? (
          <div className="font-black text-lg mb-3" style={{ color: p.color }}>🩹 สถานะของ{p.name}</div>
        ) : (
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-xl overflow-hidden w-14 h-14 border-2 shrink-0 bg-black/40" style={{ borderColor: p.color }}>
              {p.img && <img src={p.img} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-black truncate" style={{ color: p.color }}>
                {p.name}{!p.connected && <span className="ml-2 text-xs text-echo-hp">• reconnecting</span>}
              </div>
              <div className="text-sm opacity-80 truncate">{p.character?.name} — สถานะ / รายละเอียดสกิล</div>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div className="text-sm opacity-70 py-2 text-center">ไม่มีสถานะผิดปกติ</div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((it) => (
              <div key={it.key} className="flex items-start gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-bold shrink-0 ${it.cls}`}><span>{it.icon}</span><span>{it.label}{it.amt > 0 ? ` +${it.amt}` : ""}</span></span>
                <div className="min-w-0">
                  <span className="text-sm opacity-90 leading-snug">{it.desc}</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {/* จำนวนซ้อนทับ (amount) — โชว์แยกชัดเจนเสมอเมื่อมีค่า ไม่ใช่แค่เลขเล็กๆ ในป้ายไอคอนด้านบนที่สังเกตยาก */}
                    {it.amt > 0 && <span className="text-xs font-bold text-echo-hp">📊 จำนวนซ้อนทับ +{it.amt}</span>}
                    {it.v > 1 && (
                      isPermanentTurnValue(it)
                        ? <span className="text-xs font-bold text-echo-cyan">📌 คงอยู่ถาวร</span>
                        : isPermanentStatus(it)
                          ? <span className="text-xs font-bold text-echo-cyan">📌 สแตคสะสม {it.v}</span>
                          : <span className="text-xs font-bold text-echo-gold">⏳ เหลือ {it.v} เทิร์น</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* รายละเอียดสกิลตัวละคร (ดูของฝั่งตรงข้ามได้) */}
        {skillRows.length > 0 && (
          <div className="mt-3 border-t border-white/10 pt-2">
            <div className="font-bold mb-1.5">สกิลของ {ch.name}</div>
            {skillRows.map(([label, s], i) =>
              s ? (
                <div key={i} className="flex items-start gap-2 py-1.5 border-t border-white/5 first:border-t-0">
                  {s.img ? (
                    <img src={s.img} alt="" className="w-16 h-11 object-cover rounded-lg shrink-0 mt-0.5" />
                  ) : (
                    <span className="w-16 h-11 grid place-items-center text-xl shrink-0 bg-white/5 rounded-lg mt-0.5">✦</span>
                  )}
                  <div className="min-w-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold text-sm">{label} · <span className="text-echo-gold">{s.name}</span></span>
                      <span className="text-xs opacity-70 shrink-0">{s.cost != null ? `ใช้ ${s.cost}` : "ฟรี"}</span>
                    </div>
                    <div className="text-xs opacity-80 leading-snug">{s.desc}</div>
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
        <Button className="mt-3 w-full" onClick={() => { clickSound(); onClose(); }}>ปิด</Button>
      </div>
    </div>
  );
}

// ---------- ป๊อปอัปยืนยันก่อนใช้สกิล (patch UX): กดช่องสกิลใดก็ตาม -> ถามยืนยันก่อนเสมอ ----------
//  โชว์ ภาพสกิล / ลำดับสกิล (พื้นฐาน-รอง-ท่าไม้ตาย) / ชื่อสกิล / แต้มที่ใช้จริง / รายละเอียด — ยกเลิกได้ ไม่มีผลใดๆ
function SkillConfirmModal({ confirm, onConfirm, onCancel }) {
  const { skillData, label, useCost } = confirm;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onClick={onCancel}>
      <div className="bg-echo-navy rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          {skillData?.img ? (
            <img src={skillData.img} alt="" className="w-20 h-14 object-cover rounded-lg shrink-0 border border-white/10" />
          ) : (
            <span className="w-20 h-14 grid place-items-center text-2xl shrink-0 bg-white/5 rounded-lg border border-white/10">✦</span>
          )}
          <div className="min-w-0">
            <div className="text-xs font-bold text-echo-gold uppercase tracking-wide">{label}</div>
            <div className="text-lg font-black truncate">{skillData?.name || "สกิล"}</div>
            <div className="text-xs font-bold opacity-80 mt-0.5">{useCost != null ? `ใช้แต้มสกิล ${useCost}` : "ฟรี"}</div>
          </div>
        </div>
        {skillData?.desc && <div className="text-sm opacity-90 leading-snug mt-3">{skillData.desc}</div>}
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>ยกเลิก</Button>
          <Button className="flex-1" onClick={() => { clickSound(); onConfirm(); }}>ใช้งาน</Button>
        </div>
      </div>
    </div>
  );
}

// ---------- ร้านค้ามายา + คลังผู้เล่น (patch 2.2 full) ----------
const CARD_COLOR_OPTIONS = [
  { key: "red", label: "แดง", swatch: "bg-red-600" },
  { key: "blue", label: "ฟ้า", swatch: "bg-sky-500" },
  { key: "green", label: "เขียว", swatch: "bg-emerald-500" },
  { key: "yellow", label: "เหลือง", swatch: "bg-amber-400" },
];
const SHOP_ITEM_INFO = {
  cardColor: { icon: "🎨", label: () => "ยาเปลี่ยนสีการ์ด", desc: "เลือกการ์ด 1 ใบในมือ แล้วเปลี่ยนเป็นสีที่ต้องการ (ใช้ได้เฉพาะช่วงกำลังจั่วไพ่และยังไม่ล็อก)" },
  fortune: { icon: "🍀", label: () => "ยาโชคลาภ", desc: "ได้รับโชคลาภ +2 หน่วย — จั่วครั้งถัดไปจะปรับไพ่ที่จั่วให้แต้มรวมตกช่วง 19-21 ทันที แล้วหน่วยนั้นหายไป" },
  resist: { icon: "🛡️", label: () => "ยาต้านสถานะ", desc: "ต้านสถานะผิดปกติทุกประเภท 1 เทิร์น (ป้องกันล่วงหน้าเท่านั้น ไม่ใช่ยารักษา)" },
  cardRemove: { icon: "✂️", label: () => "ยาลดไพ่", desc: "ลดไพ่ใบล่าสุดของตัวเองออก 1 ใบทันที — ใช้กันไพ่แตกได้ (ใช้ได้เฉพาะช่วงกำลังจั่วไพ่และยังไม่ล็อก)" },
  skillPoint: { icon: "⚡", label: (it) => `ยาฟื้นแต้มสกิล +${it.value}`, desc: "ฟื้นแต้มสกิลทันที (เกินเพดานจะหายทิ้งส่วนที่เกิน)" },
  armor: { icon: "🔧", label: (it) => `ยาฟื้นเกราะ +${it.value}`, desc: "ฟื้นเกราะทันที" },
  heroSword: { icon: "⚔️", img: "/characters/yuuki/yuuki.jpg", label: () => "ดาบผู้กล้า", desc: "ไอเทมเฉพาะจากการโค่นยูกิ — ใช้แล้วพลังโจมตีปกติ +2 เป็นเวลา 2 เทิร์น (หาซื้อไม่ได้)" },
  tepeuMeal: { icon: "🍲", label: (it) => `มื้อที่สุข (ฟื้นเลือด +${it.value})`, desc: "ฟื้นพลังชีวิตทันที — ผลิตได้จากเทเปาเท่านั้น (วันนี้อากาศดีจัง)" },
  wineBarrel: { icon: "🍷", img: "/characters/escanor/สกิลพื้นฐาน/Barrel.png", label: (it) => `WineBarrel Lv.${it.level || 1}`, desc: "ใช้แล้วฟื้น HP ตามระดับ; ระดับ IV ฟื้น HP 3 หน่วย และมอบมึนเมา 2 หน่วยกับเย็นชื่นใจ 2 หน่วย; อยู่ในกระเป๋าครบ 4 เทิร์นจะอัปเกรด 1 ระดับ สูงสุด IV" },
  // ---------- ปืนหน่วย GUTS Select + กระสุน (ขายในร้านค้ามายา — ใช้รูปจริงแทน emoji) ----------
  gutsGun: { icon: "🔫", img: "/item/guts_select_gun/guts_gun.webp", label: () => "ปืนหน่วย GUTS Select", desc: "ไอเทมถาวร มีได้กระบอกเดียว — กดที่ปืนเพื่อเลือกกระสุนแล้วเลือกเป้าหมาย ยิงได้ 1 นัด/เทิร์น (เฉพาะช่วงจั่วไพ่)" },
  blackSparklence: { icon: "BS", img: "/characters/ignis/Black Sparklence.webp", label: () => "Black Sparklence", desc: "ปืนถาวรของอิกนิส ใช้กระสุนจากร้านค้ามายาได้ ยิงได้ 1 นัดต่อเทิร์นในช่วงจั่วไพ่ — หลังยิง Nursedessei Cannon จะใช้ปืนไม่ได้ 3 เทิร์น" },
  gutsAmmo: {
    icon: "🔑",
    imgOf: (it) => GUTS_AMMO_INFO[it.ammo]?.img,
    label: (it) => GUTS_AMMO_INFO[it.ammo]?.name || "กระสุน",
    descOf: (it) => GUTS_AMMO_INFO[it.ammo]?.desc || "",
  },
};
// ข้อมูลกระสุนฝั่ง client (ชื่อ/รูปคีย์/คำอธิบาย) — ต้องตรงกับ GUTS_AMMO ใน server.js
const GUTS_AMMO_INFO = {
  shockwave: { name: "Shockwave Bullet",   img: "/item/guts_key/gomora_key.webp",    video: "/item/guts_key/shockwave_boost.mp4",    desc: "ทำลายเกราะของเป้าหมายทั้งหมด แต่ไม่สร้างความเสียหายให้พลังชีวิตจริง" },
  gargorgon: { name: "Gargorgon Ray",      img: "/item/guts_key/gargorgon_key.webp", video: "/item/guts_key/gargorgon_ray.mp4",      desc: "เทิร์นถัดไปเป้าหมายติดสถานะสตั้น 1 เทิร์น (จั่วการ์ด/กดสกิลไม่ได้) — ต้านทานได้" },
  thunder:   { name: "Thunder Bullet",     img: "/item/guts_key/eleking_key.webp",   video: "/item/guts_key/thunder_boost.mp4",      desc: "เป้าหมายติดสถานะ [สภาพชา] 2 เทิร์น — กดจั่ว 1 ครั้งได้ไพ่ 2 ใบ — ต้านทานได้" },
  nurse:     { name: "Nursedessei Cannon", img: "/item/guts_key/nurse_key.webp",     video: "/item/guts_key/nursedessei_cannon.mp4", desc: "ความเสียหาย 4 หน่วย (ลดเกราะก่อน) — ปืน GUTS Select จะพัง; หากใช้ Black Sparklence จะใช้ปืนไม่ได้ 3 เทิร์น" },
  trigger_dark_key: { name: "Trigger Dark Key", img: "/item/guts_hyper_key/hyper_key_trigger_dark.jpg", video: "/characters/ignis/trigger_dark.mp4", desc: "ใช้กับ Black Sparklence ของอิกนิสเพื่อแปลงร่างเป็น Trigger Dark 5 เทิร์น ใช้แล้วคีย์หาย ต้องซื้อใหม่" },
  hyper_trigger: { name: "Hyper Key Trigger", img: "/item/guts_hyper_key/hyper_key_trigger.jpg", video: "/characters/ultraman_trigger/trigger_henshin.mp4", desc: "ซื้อขาด ใช้ร่วมกับปืน GUTS Select เพื่อแปลงร่างเป็น Ultraman Trigger 10 เทิร์น — หลังคืนร่างต้องรอ 5 เทิร์นก่อนใช้ซ้ำ" },
};
// รูปไอคอนไอเทมทั้งหมด: ดึงมาแคชไว้ตั้งแต่เข้าเกม (ไฟล์เล็ก) กันไอคอนโหลดช้าตอนเปิดร้าน/กระเป๋าครั้งแรก
const ITEM_PRELOAD_IMGS = ["/item/guts_select_gun/guts_gun.webp", "/characters/ignis/Black Sparklence.webp", ...Object.values(GUTS_AMMO_INFO).map((a) => a.img)];
// วีดีโอกระสุนที่ผู้เล่นถืออยู่: โหลดล่วงหน้าไว้ในเบื้องหลัง (ไฟล์ 5-16MB) — ไม่งั้นตอนยิงจริงวีดีโอจะขึ้นช้า
//  แล้วโดนเวลาคัตซีนฝั่ง server ตัดจบก่อนวีดีโอเล่นจบ
function GutsVideoPreloader({ me, players }) {
  const ammoTypes = [...new Set((me?.inventory || []).filter((it) => it.type === "gutsAmmo").map((it) => it.ammo))];
  const preloadImpact = me?.characterId === "ignis";
  // คอนเนอร์ RK800: วีดีโอเปิดตัวถูกคิวทันทีที่ startMatch() — ทุกคนต้องโหลดมันแบบเย็นสนิท
  //  ถ้าไม่ดึงมาแคชไว้ตั้งแต่ห้องรอ วีดีโอจะเริ่มเล่นช้ากว่านาฬิกาคัตซีนของ server แล้วโดนตัดจบก่อนดูจบ
  //  (เช็คจาก p.character.id ไม่ใช่ p.characterId — payload ของ buildStateFor ไม่มีฟิลด์ characterId)
  const preloadConnorIntro = (players || []).some((p) => p.character?.id === "conner");
  if (!ammoTypes.length && !preloadImpact && !preloadConnorIntro) return null;
  return (
    <div aria-hidden className="hidden">
      {ammoTypes.map((a) => GUTS_AMMO_INFO[a] && (
        <video key={a} src={GUTS_AMMO_INFO[a].video} preload="auto" muted playsInline />
      ))}
      {preloadImpact && <video src="/characters/ignis/dark_skill3/trgger_dark__skill3.mp4" preload="auto" muted playsInline />}
      {preloadConnorIntro && <video src="/characters/connor/conner_openning.mp4" preload="auto" muted playsInline />}
    </div>
  );
}
function shopInfoOf(it) {
  const base = SHOP_ITEM_INFO[it.type] || { icon: "✦", label: () => "สินค้า", desc: "" };
  // imgOf/descOf: ไอเทมที่หน้าตา/คำอธิบายขึ้นกับข้อมูลในตัวไอเทมเอง (กระสุนแต่ละแบบ)
  return { ...base, img: base.imgOf ? base.imgOf(it) : base.img, desc: base.descOf ? base.descOf(it) : base.desc };
}
// ไอคอนไอเทม: มีรูปจริงใช้รูป ไม่มีก็ใช้ emoji เดิม
function ItemIcon({ info, className = "" }) {
  if (info.img) return <img src={info.img} alt="" className={`object-contain shrink-0 ${className}`} onError={(e) => { e.currentTarget.style.display = "none"; }} />;
  return <span className={`shrink-0 ${className}`}>{info.icon}</span>;
}

// ร้านค้ามายา (patch 2.3): ร้านเดียว 15 ช่อง — รีสต็อกทุกๆ 5 เทิร์น
//  กริดขยายออกด้านข้าง (สูงสุด 5 คอลัมน์ = 3 แถว) ไม่ให้โมดัลยืดลงจนต้อง scroll แนวตั้ง
function ShopModal({ shop, me, onClose }) {
  const list = shop;
  const hasGun = (me?.inventory || []).some((i) => i.type === "gutsGun");
  const isIgnis = me?.characterId === "ignis";
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-echo-navy rounded-2xl p-4 sm:p-5 w-full max-w-md sm:max-w-3xl lg:max-w-5xl shadow-2xl max-h-[90vh] overflow-y-auto border-2 border-echo-gold" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xl font-black text-echo-gold">🏪 ร้านค้ามายา</div>
          <div className="text-sm font-bold bg-black/40 rounded-lg px-2 py-1">🪙 {me?.gold ?? 0} เหรียญ</div>
        </div>
        {(!list || list.length === 0) ? (
          <div className="text-sm opacity-70 py-6 text-center">ร้านค้ายังไม่เปิด — จะเปิดทุกๆ 5 เทิร์น</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            {list.map((it) => {
              const info = shopInfoOf(it);
              const sold = !!it.sold;
              const afford = (me?.gold ?? 0) >= it.price;
              const owned = (it.type === "gutsGun" && (hasGun || isIgnis)) || (it.type === "gutsAmmo" && it.ammo === "hyper_trigger" && (isIgnis || (me?.inventory || []).some((ownedItem) => ownedItem.type === "gutsAmmo" && ownedItem.ammo === "hyper_trigger"))) || (it.type === "gutsAmmo" && it.ammo === "trigger_dark_key" && (me?.inventory || []).some((ownedItem) => ownedItem.type === "gutsAmmo" && ownedItem.ammo === "trigger_dark_key")); // ปืนมีได้กระบอกเดียว / Hyper Key ซื้อขาด
              return (
                <div key={it.id} className={`rounded-xl border p-2 flex flex-col items-center text-center gap-1 ${sold ? "border-white/10 bg-white/5 opacity-50" : "border-echo-gold/50 bg-black/30"}`}>
                  <ItemIcon info={info} className="text-2xl h-10 w-10" />
                  <div className="text-xs font-bold leading-tight">{info.label(it)}</div>
                  <div className="text-[11px] opacity-70 leading-snug line-clamp-3">{info.desc}</div>
                  <div className="mt-auto w-full flex flex-col items-center gap-1 pt-1">
                    <div className="text-xs font-bold text-echo-gold">🪙 {it.price}</div>
                    <Button
                      className="w-full py-1.5 text-xs"
                      disabled={sold || owned || !afford}
                      onClick={() => { clickSound(); socket.emit("buyShopItem", { itemId: it.id }); }}
                    >
                      {sold ? "ขายแล้ว" : owned ? "มีแล้ว" : afford ? "ซื้อ" : "เหรียญไม่พอ"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Button className="mt-3 w-full" onClick={() => { clickSound(); onClose(); }}>ปิด</Button>
      </div>
    </div>
  );
}

function InventoryModal({ me, players, gameState, roundNumber, onPickGunAmmo, onClose }) {
  const items = me?.inventory || [];
  // ยาเปลี่ยนสีการ์ด: ต้องเลือกการ์ด 1 ใบในมือก่อน ค่อยเลือกสีเป้าหมาย — เก็บ uid ของไอเทมที่กำลังเลือกอยู่ + index การ์ดที่เลือกแล้ว
  const [colorPickUid, setColorPickUid] = useState(null);
  const [colorPickCardIdx, setColorPickCardIdx] = useState(null);
  // ปืนหน่วย GUTS Select: กดที่ปืน -> เลือกกระสุนในกระเป๋า -> ปิดกระเป๋าแล้วไปเลือกเป้าหมายบนกระดานต่อ
  const [gunOpen, setGunOpen] = useState(false);
  const myCards = me?.cards || [];

  const ammoItems = items.filter((it) => it.type === "gutsAmmo");
  const targets = (players || []).filter((p) => p.alive && p.id !== me?.id && !(me?.teamId && p.teamId === me.teamId));
  const hyperCooldown = Math.max(0, me?.hyperTriggerCooldown || 0);
  const blackSparklenceCooldown = Math.max(0, me?.blackSparklenceCooldown || 0);
  const hasBlackSparklence = (items || []).some((it) => it.type === "blackSparklence");
  const isIgnisUser = me?.characterId === "ignis" || hasBlackSparklence;
  const hasTargetedAmmo = ammoItems.some((it) => it.ammo !== "hyper_trigger" && it.ammo !== "trigger_dark_key");
  const hasReadyHyper = ammoItems.some((it) => it.ammo === "hyper_trigger") && hyperCooldown <= 0 && me?.characterId !== "ultraman_trigger" && !isIgnisUser;
  const hasReadyDarkKey = ammoItems.some((it) => it.ammo === "trigger_dark_key") && isIgnisUser && blackSparklenceCooldown <= 0 && !(me?.statuses?.triggerDarkForm > 0);
  // เหตุผลที่ยิงไม่ได้ (โชว์ให้เห็นเลย ไม่ปล่อยให้กดแล้วเงียบ)
  const fireBlock =
    gameState !== "PLAYING" ? "ยิงได้เฉพาะช่วงจั่วไพ่"
    : me?.locked ? "เปิดไพ่ไปแล้ว — ยิงไม่ได้"
    : (me?.gutsShotTurn || 0) === roundNumber ? "ยิงไปแล้วในเทิร์นนี้ (1 นัด/เทิร์น)"
    : hasBlackSparklence && blackSparklenceCooldown > 0 ? "Black Sparklence ใช้งานไม่ได้อีก " + blackSparklenceCooldown + " เทิร์น"
    : ammoItems.length === 0 ? "ไม่มีกระสุน — ซื้อได้ที่ร้านค้ามายา"
    : targets.length === 0 && hasTargetedAmmo && !hasReadyHyper && !hasReadyDarkKey ? "ไม่มีเป้าหมายให้ยิง"
    : null;

  function applyItem(uid) { clickSound(); socket.emit("useInventoryItem", { uid }); }
  function startColorPick(uid) { clickSound(); setColorPickUid(uid); setColorPickCardIdx(null); }
  function cancelColorPick() { clickSound(); setColorPickUid(null); setColorPickCardIdx(null); }
  function pickColor(color) {
    clickSound();
    socket.emit("useInventoryItem", { uid: colorPickUid, cardIndex: colorPickCardIdx, color });
    setColorPickUid(null); setColorPickCardIdx(null);
  }
  function toggleGun() { clickSound(); setGunOpen((v) => !v); }
  // เลือกกระสุนแล้วเด้งไปโหมดเลือกเป้าหมายบนกระดานทันที (กดที่การ์ดผู้เล่นจริง ไม่ใช่กดชื่อในกระเป๋า)
  function pickAmmo(a) {
    clickSound();
    if (hasBlackSparklence && blackSparklenceCooldown > 0) return;
    if (a?.ammo === "hyper_trigger" && (hyperCooldown > 0 || me?.characterId === "ultraman_trigger" || isIgnisUser)) return;
    if (a?.ammo === "trigger_dark_key" && (!isIgnisUser || me?.statuses?.triggerDarkForm > 0)) return;
    setGunOpen(false);
    onPickGunAmmo(a);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="text-xl font-black mb-3">🎒 กระเป๋าของ {me?.name}</div>
        {items.length === 0 ? (
          <div className="text-sm opacity-70 py-6 text-center">ยังไม่มีของในคลัง — ซื้อได้จากร้านค้ามายา</div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((it) => {
              const info = shopInfoOf(it);
              const isColorItem = it.type === "cardColor";
              const isGun = it.type === "gutsGun" || it.type === "blackSparklence";
              const isAmmo = it.type === "gutsAmmo";
              const picking = isColorItem && colorPickUid === it.uid;
              return (
                <div key={it.uid} className={`flex flex-col gap-2 rounded-xl border px-3 py-2 ${isGun ? "bg-echo-gold/10 border-echo-gold/50" : "bg-white/5 border-white/10"}`}>
                  <div className="flex items-center gap-2">
                    <ItemIcon info={info} className="text-2xl h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm">{info.label(it)}</div>
                      <div className="text-xs opacity-70 leading-snug">{info.desc}</div>
                    </div>
                    {isGun ? (
                      <Button className="px-3 py-1.5 text-xs shrink-0" disabled={!gunOpen && !!fireBlock} title={fireBlock || ""} onClick={toggleGun}>
                        {gunOpen ? "ยกเลิก" : "ยิง"}
                      </Button>
                    ) : isAmmo ? (
                      <span className="text-[10px] opacity-60 shrink-0 text-right leading-tight">ใช้ผ่าน<br />ปืน</span>
                    ) : isColorItem ? (
                      <Button className="px-3 py-1.5 text-xs shrink-0" onClick={() => (picking ? cancelColorPick() : startColorPick(it.uid))}>
                        {picking ? "ยกเลิก" : "ใช้"}
                      </Button>
                    ) : (
                      <Button className="px-3 py-1.5 text-xs shrink-0" onClick={() => applyItem(it.uid)}>ใช้</Button>
                    )}
                  </div>
                  {isGun && !gunOpen && fireBlock && <div className="text-[11px] text-echo-hp/90">⚠️ {fireBlock}</div>}
                  {isGun && gunOpen && (
                    <div className="rounded-lg bg-black/40 p-2">
                      <div className="text-xs opacity-80 mb-1">เลือกกระสุน / คีย์ (กระสุนทั่วไปเลือกแล้วไปจิ้มเป้าหมายบนกระดาน):</div>
                      <div className="flex flex-wrap gap-2">
                        {ammoItems.map((a) => {
                          const ai = shopInfoOf(a);
                          const ammoBlock = hasBlackSparklence && blackSparklenceCooldown > 0
                            ? "ปืนใช้ไม่ได้อีก " + blackSparklenceCooldown + " เทิร์น"
                            : a.ammo === "hyper_trigger"
                            ? me?.characterId === "ultraman_trigger" ? "กำลังอยู่ในร่าง Ultraman Trigger"
                              : hyperCooldown > 0 ? "ต้องรออีก " + hyperCooldown + " เทิร์น"
                              : null
                            : a.ammo === "trigger_dark_key"
                              ? !isIgnisUser ? "ต้องมี Black Sparklence"
                                : me?.statuses?.triggerDarkForm > 0 ? "กำลังอยู่ในร่าง Trigger Dark"
                                : null
                              : null;
                          return (
                            <button key={a.uid} disabled={!!ammoBlock} title={ammoBlock || ""} className={"flex flex-col items-center gap-1 w-20 rounded-lg border border-white/15 bg-black/30 p-1.5 hover:border-echo-gold transition-colors " + (ammoBlock ? "opacity-45 cursor-not-allowed" : "")} onClick={() => pickAmmo(a)}>
                              <ItemIcon info={ai} className="h-9 w-9" />
                              <span className="text-[10px] leading-tight text-center">{ai.label(a)}</span>
                              {ammoBlock && <span className="text-[9px] leading-tight text-echo-hp text-center">{ammoBlock}</span>}
                            </button>
                          );
                          })}
                      </div>
                    </div>
                  )}
                  {picking && (
                    <div className="rounded-lg bg-black/30 p-2">
                      {colorPickCardIdx === null ? (
                        <>
                          <div className="text-xs opacity-80 mb-1">เลือกการ์ดที่จะเปลี่ยนสี:</div>
                          <div className="flex flex-wrap gap-1">
                            {myCards.map((c, i) => c.special ? null : (
                              <button key={i} className="hover:-translate-y-1 transition-transform" onClick={() => { clickSound(); setColorPickCardIdx(i); }}>
                                <Card value={c.value} color={c.color} size="sm" />
                              </button>
                            ))}
                          </div>
                          {myCards.every((c) => c.special) && <div className="text-xs opacity-60 py-1">ไม่มีการ์ดเลขในมือให้เปลี่ยนสี</div>}
                        </>
                      ) : (
                        <>
                          <div className="text-xs opacity-80 mb-1">เลือกสีเป้าหมาย:</div>
                          <div className="flex gap-2">
                            {CARD_COLOR_OPTIONS.map((c) => (
                              <button key={c.key} className="flex flex-col items-center gap-1" onClick={() => pickColor(c.key)}>
                                <span className={`w-7 h-7 rounded-full border-2 border-white/40 ${c.swatch}`} />
                                <span className="text-[10px]">{c.label}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Button className="mt-3 w-full" onClick={() => { clickSound(); onClose(); }}>ปิด</Button>
      </div>
    </div>
  );
}

// ผู้เล่นคนอื่นรอบโต๊ะ — picked = ถูกเลือกเป้าหมาย ANATA WAAAAAAAA แล้ว
//  คลิกตอนไม่ได้เลือกเป้า = เปิดหน้าต่างดูสถานะของคนนั้น (onInspect)
// การ์ดผู้เล่นแบบใหม่: รูป+ชื่อรวมเป็นชิ้นเดียว (ป้ายชื่อซ้อนไล่เฉดทับขอบล่างรูป แบบโปสเตอร์นักแสดง)
// แทนที่รูปกับป้ายชื่อแยกลอยกันคนละชิ้นแบบเดิม
function OtherPlayer({ p, phase, slot, targetable, onAttack, picked, onInspect, hostRef }) {
  const summary = phase === "SUMMARY";
  return (
    <div
      ref={hostRef}
      className={`absolute -translate-x-1/2 flex flex-col items-center gap-1.5 ${p.hisakawa ? "w-52 sm:w-60" : "w-28"}`}
      style={{ top: `${slot[0]}%`, left: `${slot[1]}%` }}
    >
      <div
        onClick={targetable ? () => { clickSound(); onAttack(p.id); } : () => { clickSound(); onInspect(p.id); }}
        className={`p-target-wrap relative ${p.hisakawa ? "w-44 h-28 sm:w-52 sm:h-32" : "p-player-frame w-24 h-28 sm:w-28 sm:h-32"} -rotate-2 ${p.alive && !p.hisakawa ? "p-player-frame-live" : ""} ${!p.alive ? "opacity-40 grayscale" : ""} ${targetable ? "cursor-crosshair" : "cursor-pointer"}`}
        title={targetable ? undefined : "แตะเพื่อดูสถานะ"}
        style={{ "--p-frame-color": p.color }}
      >
        <div className="absolute inset-0">
          {p.hisakawa ? <TwinPortraitCards p={p} size="table" className="w-full h-full" /> : <Portrait p={p} className="w-full h-full" rounded="" />}
        </div>
        <TeamBadge teamId={p.teamId} className="absolute -top-3 -right-3 z-20" />
        {targetable && <TargetLock />}
        {targetable && (
          <span className="p-target-badge absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full text-white whitespace-nowrap z-10">
            🎯 เป้าหมาย
          </span>
        )}
        {picked && <span className="absolute -top-2 -left-2 text-2xl z-10">🎤</span>}
        {!p.alive && <span className="absolute inset-0 grid place-items-center text-3xl z-10">💀</span>}
        {p.isWinner && summary && <span className="absolute -top-2 -right-2 text-xl z-10">👑</span>}
        {phase === "PLAYING" && p.locked && p.alive && (
          <span className="absolute top-1 right-1 bg-emerald-600 rounded-full w-5 h-5 grid place-items-center text-xs z-10">✓</span>
        )}
        {/* ป้ายชื่อ: ไล่เฉดทับขอบล่างรูป ให้เป็นชิ้นเดียวกับตัวการ์ด */}
        {!p.hisakawa && (
        <div className="absolute inset-x-0 bottom-0 pt-6 pb-1 px-1.5" style={{ background: "linear-gradient(180deg,transparent,rgba(0,0,0,.92) 55%)" }}>
          <div className="text-xs sm:text-sm font-black text-white text-center truncate" style={{ fontFamily: P_DISPLAY }}>
            {p.name}{!p.connected && <span className="ml-1 text-[10px] text-echo-hp">•offline</span>}
          </div>
        </div>
        )}
      </div>
      <div className="rounded-xl px-2.5 py-1.5 flex flex-col items-center gap-1 w-full">
        {p.hisakawa ? <TwinVitals p={p} compact /> : <Stats p={p} center />}
        {p.hisakawa && <Stats p={p} center hideLife />}
      </div>
      {/* ใบโปรโมทสินค้า (Apple guy): แต้มการ์ดถูกเปิดเผยให้ทุกคนเห็นแม้ยังไม่เปิดไพ่ */}
      {/* connorScanned: คอนเนอร์กด "วิเคราะห์สถานการณ์" -> เห็นแต้มของคนนี้ตั้งแต่ยังไม่เปิดไพ่ (เห็นคนเดียว) */}
      {(summary || (p.statuses?.promo || 0) > 0 || p.connorScanned) && p.score !== null && (
        <div className={`score-pop text-2xl font-black ${p.isWinner ? "text-echo-gold" : p.busted ? "text-echo-hp" : p.connorScanned && !summary ? "text-echo-cyan" : "text-white"}`}>
          {p.busted ? "แตก!" : `${p.score} แต้ม`}{p.connorScanned && !summary ? " 🧠" : ""}
        </div>
      )}
      {!p.hisakawa && <StatusChips p={p} compact max={6} />}
    </div>
  );
}

// ---------- การ์ดคู่ต่อสู้แบบมือถือ (เรียงกริดด้านบน แตะเพื่อโจมตี/เลือกเป้า ANATA) ----------
//  แตะตอนไม่ได้เลือกเป้า = เปิดหน้าต่างดูสถานะของคนนั้น (onInspect)
// บอสยูกิเป็นการ์ดกลางจอแทนกองกลางตลอดเวลาที่ยังอยู่ในสนาม
function YuukiBossCard({ p, phase, targetable, onPick, onInspect, hostRef, compact = false }) {
  if (!p?.alive) return null;
  const summary = phase === "SUMMARY";
  return (
    <div
      ref={hostRef}
      onClick={targetable ? () => { clickSound(); onPick(p.id); } : () => { clickSound(); onInspect(p.id); }}
      className={`pointer-events-auto p-target-wrap relative rounded-2xl border-2 border-violet-400 bg-black/75 shadow-2xl cursor-pointer ${compact ? "w-28 p-2" : "w-36 p-3"}`}
      style={{ boxShadow: "0 0 28px rgba(124,58,237,.65)" }}
    >
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-700 border border-violet-300 px-3 py-0.5 text-[10px] font-black whitespace-nowrap z-20">ยูกิ Overload</div>
      <Portrait p={p} className={`${compact ? "h-20" : "h-24"} w-full rounded-xl`} rounded="rounded-xl" />
      <div className="mt-1 text-center text-sm font-black text-violet-200 truncate">ยูกิ Overload</div>
      <Stats p={p} center />
      {summary && p.score !== null && <div className="text-center text-xl font-black text-echo-gold">{p.busted ? "แตก!" : `${p.score} แต้ม`}</div>}
      <StatusChips p={p} compact max={4} />
      {targetable && <><TargetLock /><span className="p-target-badge absolute -top-3 -right-5 text-[10px] px-2 py-0.5 rounded-full text-white">🎯 เป้า</span></>}
      {phase === "PLAYING" && p.locked && <span className="absolute top-1 right-1 bg-emerald-600 rounded-full w-5 h-5 grid place-items-center text-xs">✓</span>}
    </div>
  );
}

function MobileOpponent({ p, phase, targetable, onAttack, picked, onInspect, hostRef }) {
  const summary = phase === "SUMMARY";
  return (
    <div
      ref={hostRef}
      onClick={targetable ? () => { clickSound(); onAttack(p.id); } : () => { clickSound(); onInspect(p.id); }}
      className={`p-target-wrap p-panel relative flex items-center gap-2 rounded-2xl px-2 py-1.5 min-h-[68px] border-l-4 ${!p.alive ? "opacity-40 grayscale" : ""} ${targetable ? "cursor-crosshair" : "cursor-pointer"}`}
      style={{ "--p-frame-color": p.color, borderLeftColor: p.color }}
    >
      <div className="relative shrink-0">
        {p.hisakawa ? <TwinPortraitCards p={p} size="sm" /> : <Portrait p={p} className="w-14 h-14 p-player-frame" rounded="rounded-xl" />}
        <TeamBadge teamId={p.teamId} className="absolute -top-3 -right-3 z-20" />
        {targetable && <TargetLock />}
        {!p.alive && <span className="absolute inset-0 grid place-items-center text-2xl">💀</span>}
        {p.isWinner && summary && <span className="absolute -top-2 -right-1 text-lg">👑</span>}
        {phase === "PLAYING" && p.locked && p.alive && (
          <span className="absolute -bottom-1 -right-1 bg-emerald-600 rounded-full w-5 h-5 grid place-items-center text-xs">✓</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-black" style={{ color: p.color, fontFamily: "var(--font-p-display)" }}>
          {p.name}{!p.connected && <span className="ml-1 text-xs text-echo-hp">• offline</span>}
        </div>
        <TeamBadge teamId={p.teamId} />
        {/* เลือด + เกราะ อยู่บรรทัดเดียวแนวนอนเสมอ */}
        {p.hisakawa ? <TwinVitals p={p} compact /> : <LifeBar p={p} sm className="mt-0.5" />}
        {!p.hisakawa && <StatusChips p={p} left compact max={4} />}
      </div>
      {targetable && (
        <span className="p-target-badge shrink-0 text-[10px] px-2 py-0.5 rounded-full text-white whitespace-nowrap">
          🎯 เป้า
        </span>
      )}
      {/* ใบโปรโมทสินค้า (Apple guy): แต้มการ์ดถูกเปิดเผยให้ทุกคนเห็นแม้ยังไม่เปิดไพ่ */}
      {(summary || (p.statuses?.promo || 0) > 0 || p.connorScanned) && p.score !== null && (
        <div className={`score-pop shrink-0 text-xl font-black ${p.isWinner ? "text-echo-gold" : p.busted ? "text-echo-hp" : p.connorScanned && !summary ? "text-echo-cyan" : "text-white"}`}>
          {p.busted ? "แตก!" : p.score}{p.connorScanned && !summary ? " 🧠" : ""}
        </div>
      )}
      {picked && <span className="absolute -top-2 -left-2 text-xl z-10">🎤</span>}
    </div>
  );
}

// ---------- modal รายละเอียดตัวละคร (ใช้ร่วมกันทั้งจอคอม/มือถือ) ----------
//  me = ผู้เล่นของเรา -> โชว์สถานะผิดปกติที่ติดอยู่ตอนนี้ พร้อมคำอธิบายเต็ม
function CharModal({ ch, me, onClose }) {
  const myStatuses = me ? statusEntries(me, true) : [];
  return (
    <div className="fixed inset-0 z-40 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="text-xl font-bold mb-2">{ch.name}</div>
        {[["สกิลติดตัว", ch.passive], ["สกิลพื้นฐาน", ch.basic], ["สกิลรอง", ch.secondary], ["ท่าไม้ตาย", ch.ultimate]].map(([label, s], i) =>
          s ? (
            <div key={i} className="py-1.5 border-t border-white/10">
              <div className="flex justify-between"><span className="font-bold">{label} · {s.name}</span><span className="text-xs opacity-70">{s.cost != null ? `ใช้ ${s.cost}` : "ฟรี"}</span></div>
              <div className="text-sm opacity-80">{s.desc}</div>
            </div>
          ) : null
        )}
        {myStatuses.length > 0 && (
          <div className="py-1.5 border-t border-white/10">
            <div className="font-bold mb-1.5">สถานะที่ติดอยู่ตอนนี้</div>
            <div className="flex flex-col gap-1.5">
              {myStatuses.map((it) => (
                <div key={it.key} className="flex items-start gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5">
                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-bold shrink-0 ${it.cls}`}><span>{it.icon}</span><span>{it.label}{it.amt > 0 ? ` +${it.amt}` : ""}{showStatusValue(it) ? ` ${it.v}` : ""}</span></span>
                  <span className="text-sm opacity-90 leading-snug">{it.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <Button className="mt-3 w-full" onClick={() => { clickSound(); onClose(); }}>ปิด</Button>
      </div>
    </div>
  );
}

// DoomGuy (patch 2.2 full): แจ้งเตือนชาร์จ Crucible สะสมได้เท่าไหร่แล้ว (ครบ 5 ปลดล็อกท่าไม้ตาย)
function DoomChargeBadge({ me, ch }) {
  if (!ch || ch.id !== "doomguy") return null;
  const charge = Math.min(5, me.doomCharge || 0);
  const full = charge >= 5;
  return (
    <span
      className={`text-xs font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${full ? "bg-echo-gold text-gray-900 animate-pulse" : "bg-black/55"}`}
      title="Crucible (ท่าไม้ตาย) — โจมตีสำเร็จมีโอกาส 35% ได้ชาร์จ +1 สะสมครบ 5 ปลดล็อก (ใช้ได้ 1 ครั้งในการโจมตีแล้วหายไป)"
    >
      🔥 Crucible {charge}/5{full ? " พร้อมใช้!" : ""}
    </span>
  );
}
// ทาคุมิ ฟุจิวาระ: แจ้งเตือนเกียร์ปัจจุบัน (1-6) — เกียร์ 3 ขึ้นไปพลังโจมตี +1, เกียร์ 6 รวม +2
function TakumiGearBadge({ me, ch }) {
  if (!ch || ch.id !== "takumi") return null;
  const gear = Math.max(1, Math.min(6, me.takumiGear || 1));
  const bonus = gear >= 6 ? 2 : gear >= 3 ? 1 : 0;
  return (
    <span
      className={`text-xs font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${gear >= 6 ? "bg-echo-gold text-gray-900" : bonus > 0 ? "bg-black/55 text-echo-gold" : "bg-black/55"}`}
      title="เกียร์ธรรมดา — เกียร์ 3 ขึ้นไป พลังโจมตี +1 / เกียร์ 6 รวม +2 — ลงเกียร์กลับมาที่ 1 พอดี ฟื้นพลังชีวิตตามระยะที่ลดมา (สูงสุด 4)"
    >
      ⚙️ เกียร์ {gear}/6{bonus > 0 ? ` (+${bonus})` : ""}
    </span>
  );
}
// สึงาชิ ทาคุโตะ (patch 2.2 new): แจ้งเตือนดวงดาวสะสมได้เท่าไหร่แล้ว (ครบ 5 = Apprivoise! ทันที)
function TakutoStarBadge({ me, ch }) {
  if (!ch || ch.id !== "takuto" || me.statuses?.apprivoise) return null;
  const star = Math.min(5, me.statuses?.star || 0);
  return (
    <span className="text-xs font-bold rounded-full px-2 py-0.5 whitespace-nowrap bg-black/55" title="Apprivoise! — สะสมดวงดาวจากสกิลพื้นฐานครบ 5 หน่วย แปลงร่างเป็นทาวเบิร์นถาวรทันที">
      ⭐ ดวงดาว {star}/5
    </span>
  );
}
// เอจิ (patch 2.4 new): ป้ายอัตราหลบหลีกปัจจุบัน — โชว์เป็น % สดๆ ไม่ใช่สถานะสะสม (คล้ายป้ายเกียร์ของทาคุมิ)
function EijiDodgeBadge({ me, ch }) {
  if (!ch || ch.id !== "eiji" || me.eijiDodge == null) return null;
  const pct = me.eijiDodge || 0;
  const used = !!me.eijiDodgeUsed;
  return (
    <span
      className={`text-xs font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${used ? "bg-black/55 opacity-60" : pct >= 50 ? "bg-echo-cyan text-gray-900" : pct > 0 ? "bg-black/55 text-echo-cyan" : "bg-black/55"}`}
      title="อัตราหลบหลีกรวมของเทิร์นนี้ (ว่องไว +20% · ไม่ว่ายังก็ตาม +20% · กลโกง Ordinal Scale +20% ต่อครั้ง) — หลบสำเร็จได้ 1 ครั้งต่อเทิร์น กันได้ทั้งการโจมตีปกติและความเสียหายจากสกิล (โรลไม่ติดไม่เสียสิทธิ์)"
    >
      💨 หลบหลีก {pct}%{used ? " (ใช้แล้ว)" : ""}
    </span>
  );
}

// เอจิ สกิลติดตัว 3: ปุ่ม กลโกง Ordinal Scale — ไม่นับเป็นการใช้สกิล กดสะสมได้สูงสุด 5 ครั้งต่อเทิร์น
function EijiOrdinalButton({ me, usable, onPress, className = "" }) {
  const used = me.eijiOrdinal || 0;
  const max = me.eijiOrdinalMax || 5;
  return (
    <button
      onClick={() => { if (usable) { clickSound(); onPress(); } }}
      disabled={!usable}
      title="กลโกง Ordinal Scale — สละแต้มสกิล 1 แต้มแลกอัตราหลบหลีก +20% (สูงสุด 5 ครั้งต่อเทิร์น · มีผลเฉพาะเทิร์นนี้ · ไม่นับเป็นการใช้สกิล)"
      className={`relative rounded-xl overflow-hidden border-2 border-echo-cyan shadow-lg transition ${
        usable ? "hover:scale-105 ring-2 ring-echo-cyan/60" : "opacity-60 grayscale cursor-not-allowed"
      } ${className}`}
    >
      <img src="/characters/eiji/passive/eiji_passive3.webp" alt="" className="absolute inset-0 w-full h-full object-cover" />
      <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[10px] font-bold text-echo-cyan leading-tight py-0.5">
        ⏱️ เร่ง {used}/{max}
      </span>
    </button>
  );
}

// ---------- อาคมบัญชาระดับ EX+ (สกิลติดตัวคิชินามิ ฮาคุโนะ patch 2.2.1): UI พิเศษแยกจากช่องสกิล ----------
//  ไม่นับเป็นการใช้สกิล -> ใช้พร้อมสกิลอื่นได้ | 3 ครั้งต่อเกม กดได้กี่ครั้งก็ได้ใน 1 เทิร์น | รูปเปลี่ยนตามจำนวนที่เหลือ
const HAKUNO_COMMANDS = [
  { cmd: 1, icon: "✨", name: "เติมแต้มสกิลเต็ม", desc: "เติมแต้มสกิลให้เต็ม 8 แต้มทันที" },
  { cmd: 2, icon: "💗", name: "ฟื้นพลังชีวิตเต็ม", desc: "ฟื้นพลังชีวิตให้เต็ม (ไม่ฟื้นเกราะ)" },
  { cmd: 3, icon: "🎯", name: "บังคับแต้มการ์ดเป็น 21", desc: "แต้มการจั่วกลายเป็น 21 ทันที" },
];
const hakunoCommandImg = (n) => `/characters/hakuno/passive/${(n ?? 0) <= 0 ? "lost" : n === 1 ? "1left" : n === 2 ? "2left" : "full"}.png`;

function HakunoCommandButton({ me, usable, onOpen, className = "" }) {
  return (
    <button
      onClick={() => { if (usable) { clickSound(); onOpen(); } }}
      disabled={!usable}
      title="อาคมบัญชาระดับ EX+ — ใช้ก่อนเปิดการ์ด (ไม่นับเป็นการใช้สกิล)"
      className={`relative rounded-xl overflow-hidden border-2 border-echo-gold shadow-lg transition ${
        usable ? "hover:scale-105 ring-2 ring-echo-gold/60" : "opacity-60 grayscale cursor-not-allowed"
      } ${className}`}
    >
      <img src={hakunoCommandImg(me.hakunoCommandUses)} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[10px] font-bold text-echo-gold leading-tight py-0.5">
        📜 อาคม {me.hakunoCommandUses ?? 0}/3
      </span>
    </button>
  );
}

function HakunoCommandModal({ me, onUse, onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="rounded-xl overflow-hidden w-16 h-16 border-2 border-echo-gold shrink-0">
            <img src={hakunoCommandImg(me.hakunoCommandUses)} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="text-lg font-black text-echo-gold">อาคมบัญชาระดับ EX+</div>
            <div className="text-sm opacity-80">เหลือ {me.hakunoCommandUses ?? 0}/3 — เลือกคำสั่ง</div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {HAKUNO_COMMANDS.map((c) => (
            <button
              key={c.cmd}
              onClick={() => { clickSound(); onUse(c.cmd); }}
              className="text-left rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-2 transition"
            >
              <div className="font-bold text-echo-gold">{c.icon} คำสั่งที่ {c.cmd} · {c.name}</div>
              <div className="text-sm opacity-80">{c.desc}</div>
            </button>
          ))}
        </div>
        <Button className="mt-3 w-full" onClick={() => { clickSound(); onClose(); }}>ปิด</Button>
      </div>
    </div>
  );
}

// ---------- เอาแบบนี้ได้ไหม (Apple guy สกิลพื้นฐาน): เมนูเลือกของส่งมอบ ----------
//  ใช้ 2 แต้ม เปลี่ยนของที่จะมอบผ่านสกิลรอง "เอาไปสิ" — ใช้แล้วยังใช้สกิลอื่นได้อีก 1 ครั้ง
//  ภาพปกสกิลพื้นฐานเปลี่ยนตามของที่เลือกอยู่
function AppleItemModal({ me, onPick, onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-black text-echo-gold">🍎 เอาแบบนี้ได้ไหม — เลือกของส่งมอบ</div>
        <div className="text-sm opacity-80 mb-3">ของที่เลือกจะถูกมอบให้เป้าหมายผ่านสกิลรอง "เอาไปสิ" (ใช้ 2 แต้ม — ใช้แล้วยังใช้สกิลอื่นได้อีก 1 ครั้ง)</div>
        <div className="flex flex-col gap-2">
          {APPLE_ITEMS.map((it) => (
            <button
              key={it.key}
              onClick={() => { clickSound(); onPick(it.key); }}
              className={`text-left flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
                me.appleItem === it.key ? "bg-echo-gold/20 border-echo-gold" : "bg-white/5 hover:bg-white/15 border-white/15"
              }`}
            >
              <img src={it.img} alt="" className="w-16 h-12 object-cover rounded-lg shrink-0" />
              <div>
                <div className="font-bold text-echo-gold">{it.name}{me.appleItem === it.key ? " · เลือกอยู่" : ""}</div>
                <div className="text-sm opacity-80">{it.desc}</div>
              </div>
            </button>
          ))}
        </div>
        <Button className="mt-3 w-full" onClick={() => { clickSound(); onClose(); }}>ปิด</Button>
      </div>
    </div>
  );
}

// ---------- อาจารย์ ไบเลธ (patch 2.6 new) ----------
//  หลักสูตรทั้ง 3 — สีประจำหลักสูตรใช้ทั้งกับป้าย UI และออร่าขอบจอ (field-fx-byleth-*)
const BYLETH_COURSES = [
  { key: "normal", icon: "📗", name: "หลักสูตร มาตราฐาน", color: "#2E9E4B",
    desc: "ผู้ชนะของเทิร์นติดสตั้น 1 เทิร์นในเทิร์นหน้า (ยกเว้นไบเลธ) · ผู้แพ้ได้แต้มสกิลฟื้นเพิ่ม 1 หน่วย · คนที่ไพ่แตกไม่รับความเสียหายจากแต้มเกิน 21" },
  { key: "ex", icon: "📕", name: "หลักสูตร พิเศษ", color: "#C0392B",
    desc: "มีผลกับทุกคนยกเว้นไบเลธ — กดสกิลรองเทิร์นนี้ = โจมตีไม่ได้ · กดท่าไม้ตายเทิร์นนี้ = รับความเสียหาย 1 หน่วย · กดสกิลพื้นฐานเทิร์นนี้ = เทิร์นหน้ากดสกิลพื้นฐานไม่ได้" },
  { key: "end", icon: "📘", name: "หลักสูตร จบการศึกษา", color: "#3B82C4",
    desc: "การจั่วของทุกคนบีบเวลาเฟสจั่วลงครั้งละ 2 วิ · สกิลรอง/ท่าไม้ตายของทุกคนถูกลง 1 แต้ม · ไบเลธแต้มน้อยสุดแบบไพ่ไม่แตกแล้วถูกผู้ชนะตี = ได้ตีตอบทันที · ไบเลธรับความเสียหายน้อยลง 1" },
];
const BYLETH_COURSE_BY_KEY = Object.fromEntries(BYLETH_COURSES.map((c) => [c.key, c]));

// ดาบต้องสาป (สกิลรอง): ต้องเลือกแบบก่อนเสมอ — ลดความรู้ 4 หน่วยเท่ากันทั้งสองแบบ
function BylethSwordModal({ me, onPick, onClose }) {
  const strikeUsed = !!me.bylethStrikeUsed;
  const swordOn = (me.statuses?.bylethSword || 0) > 0;
  return (
    <div className="fixed inset-0 z-40 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-black text-echo-gold">🗡️ ดาบต้องสาป — เลือกรูปแบบ</div>
        <div className="text-sm opacity-80 mb-3">ใช้แต้ม "ความรู้" 4 หน่วย (มีอยู่ {me.bylethKnowledge || 0}/{me.bylethKnowledgeMax || 20}) — ไม่ใช้แต้มสกิล</div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => { if (!strikeUsed) { clickSound(); onPick("strike"); } }}
            disabled={strikeUsed}
            className={`text-left rounded-xl border px-3 py-2 transition ${strikeUsed ? "opacity-50 cursor-not-allowed border-white/10 bg-white/5" : "bg-white/5 hover:bg-white/15 border-white/15"}`}
          >
            <div className="font-bold text-echo-gold">แบบที่ 1 · ฟาดทันที{strikeUsed ? " (ใช้ครบโควตาเทิร์นนี้แล้ว)" : ""}</div>
            <div className="text-sm opacity-80">เลือกผู้เล่นอื่น 1 คน สร้างความเสียหาย 2 หน่วยทันที — ใช้ได้ 1 ครั้งต่อเทิร์น</div>
          </button>
          <button
            onClick={() => { if (!swordOn) { clickSound(); onPick("buff"); } }}
            disabled={swordOn}
            className={`text-left rounded-xl border px-3 py-2 transition ${swordOn ? "opacity-50 cursor-not-allowed border-white/10 bg-white/5" : "bg-white/5 hover:bg-white/15 border-white/15"}`}
          >
            <div className="font-bold text-echo-gold">แบบที่ 2 · เสริมพลังดาบ{swordOn ? " (ดาบยังอยู่ กดซ้ำไม่ได้)" : ""}</div>
            <div className="text-sm opacity-80">พลังโจมตีปกติ +2 หน่วย ใช้โจมตีได้ 1 ครั้งภายใน 3 เทิร์น (มีเสียงโจมตีเฉพาะของดาบ)</div>
          </button>
        </div>
        <Button className="mt-3 w-full" onClick={() => { clickSound(); onClose(); }}>ปิด</Button>
      </div>
    </div>
  );
}

// หลักสูตรการสอน (ท่าไม้ตาย): เลือก 1 หลักสูตรทุกครั้งที่กด — เปิดอยู่แล้วกดปิด/สลับหลักสูตรได้
function BylethCourseModal({ me, onPick, onClose }) {
  const cur = me.bylethCourse || null;
  const know = me.bylethKnowledge || 0;
  return (
    <div className="fixed inset-0 z-40 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-echo-navy rounded-2xl p-5 max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-black text-echo-gold">🎓 หลักสูตรการสอน — เลือกหลักสูตร</div>
        <div className="text-sm opacity-80 mb-3">
          ความรู้ {know}/{me.bylethKnowledgeMax || 20} — เปิดค้างไว้จะลดลงเทิร์นละ 1 หน่วย จนกว่าจะหมดหรือกดปิดเอง (ระหว่างเปิดอยู่กดสกิลพื้นฐานไม่ได้)
        </div>
        <div className="flex flex-col gap-2">
          {BYLETH_COURSES.map((c) => {
            const active = cur === c.key;
            const locked = !cur && know < 4;
            return (
              <button
                key={c.key}
                onClick={() => { if (!active && !locked) { clickSound(); onPick(c.key); } }}
                disabled={active || locked}
                className={`text-left rounded-xl border px-3 py-2 transition ${active ? "bg-echo-gold/20 border-echo-gold" : locked ? "opacity-50 cursor-not-allowed border-white/10 bg-white/5" : "bg-white/5 hover:bg-white/15 border-white/15"}`}
                style={active ? undefined : { borderColor: `${c.color}66` }}
              >
                <div className="font-bold" style={{ color: c.color }}>{c.icon} {c.name}{active ? " · ใช้อยู่" : ""}{locked ? " (ต้องมีความรู้ 4 แต้ม)" : ""}</div>
                <div className="text-sm opacity-80">{c.desc}</div>
              </button>
            );
          })}
        </div>
        {cur && (
          <Button variant="gold" className="mt-3 w-full py-3" onClick={() => { clickSound(); onPick("off"); }}>⏹️ ปิดใช้งานหลักสูตร</Button>
        )}
        <Button className="mt-2 w-full" onClick={() => { clickSound(); onClose(); }}>ปิด</Button>
      </div>
    </div>
  );
}

// UI พิเศษของไบเลธ: แต้มความรู้ (ทรัพยากรหลัก) + ผลทบทวนบทเรียนที่รอไพ่ใบถัดไป + หลักสูตรที่เปิดอยู่
function BylethKnowledgeBadge({ me, ch }) {
  if (!ch || ch.id !== "byleth" || me.bylethKnowledge == null) return null;
  const max = me.bylethKnowledgeMax || 20;
  const know = me.bylethKnowledge || 0;
  return (
    <span
      className={`text-xs font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${know > 0 ? "bg-echo-gold text-gray-900" : "bg-black/55"}`}
      title={`แต้มความรู้ — ได้จากทบทวนบทเรียนครั้งละ 1 (สูงสุด ${max}) · ดาบต้องสาปใช้ 4 หน่วย · หลักสูตรการสอนต้องมี 4 หน่วยขึ้นไปแล้วกินเทิร์นละ 1 (เทิร์นนี้กดสกิลไปแล้ว ${me.bylethSkillUses || 0}/${me.bylethSkillMax || 5} ครั้ง)`}
    >
      {"\u{1F4DA}"} ความรู้ {know}/{max}
    </span>
  );
}

// ---------- โทโนะ ชิกิ (สกิลพื้นฐาน): เมนูเลือกระดับมีดพับประจำตระกูล ----------
const TOHNO_LEVELS = [
  { level: 1, name: "1. ปิดใช้งานสกิลติดตัว (ค่าเริ่มต้น)", desc: "ทุกครั้งที่ได้โจมตี ฟื้นพลังชีวิต +2" },
  { level: 2, name: "2. เปิดใช้งานสกิลติดตัว", desc: "โจมตีปกติมีโอกาสสังหารทันที 5% — พลาดเสียพลังชีวิต 1 หน่วย (ไม่สนเกราะ)" },
  { level: 3, name: "3. เพิ่มโอกาสสังหาร", desc: "โอกาสสังหารทันที 10% — พลาดเสียพลังชีวิต 2 หน่วย (ไม่สนเกราะ)" },
  { level: 4, name: "4. เพิ่มโอกาสสังหาร", desc: "โอกาสสังหารทันที 20% — พลาดเสียพลังชีวิต 4 หน่วย (ไม่สนเกราะ)" },
  { level: 5, name: "5. เพิ่มโอกาสสังหาร", desc: "โอกาสสังหารทันที 50% — พลาดเสียพลังชีวิต 6 หน่วย (ไม่สนเกราะ)" },
];
function TohnoLevelModal({ me, onPick, onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-black text-echo-gold">🔪 มีดพับประจำตระกูล — เลือกระดับ</div>
        <div className="text-sm opacity-80 mb-3">กดเปลี่ยนระดับได้กี่ครั้งก็ได้ — สังหารสำเร็จจะไม่เสียพลังชีวิตไม่ว่าระดับใด</div>
        <div className="flex flex-col gap-2">
          {TOHNO_LEVELS.map((it) => (
            <button
              key={it.level}
              onClick={() => { clickSound(); onPick(it.level); }}
              className={`text-left flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
                (me.tohnoLevel || 1) === it.level ? "bg-echo-gold/20 border-echo-gold" : "bg-white/5 hover:bg-white/15 border-white/15"
              }`}
            >
              <div>
                <div className="font-bold text-echo-gold">{it.name}{(me.tohnoLevel || 1) === it.level ? " · เลือกอยู่" : ""}</div>
                <div className="text-sm opacity-80">{it.desc}</div>
              </div>
            </button>
          ))}
        </div>
        <Button className="mt-3 w-full" onClick={() => { clickSound(); onClose(); }}>ปิด</Button>
      </div>
    </div>
  );
}
// ---------- สนใจใช้บริการเราไหม (เจ้าแห่งเน็ตบ้าน): ข้อเสนอสัญญา — เป้าหมายเลือกตอบรับ/ปฏิเสธ ----------
//  ไม่ตอบก่อนเปิดไพ่ = ถือว่าปฏิเสธ (โดนค่าปรับตามปกติ)
// ---------- คอนเนอร์ RK800: HUD สกอร์ดวลระหว่างการไล่ล่า (ทุกคนเห็นเหมือนกัน) ----------
function ConnorChaseHud({ chase }) {
  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 pointer-events-none text-hard">
      <div className="bg-black/70 border-2 border-echo-hp rounded-2xl px-4 py-1.5 text-center shadow-2xl">
        <div className="text-[11px] font-bold opacity-80 tracking-wider">🚨 จับกุมขั้นเด็ดขาด — ไล่ล่า {chase.round}/{chase.rounds}</div>
        <div className="text-lg font-black">
          <span className="text-echo-cyan">{chase.by}</span>
          <span className="mx-2 text-echo-gold">{chase.mine} : {chase.theirs}</span>
          <span className="text-echo-hp">{chase.target}</span>
        </div>
      </div>
    </div>
  );
}

// ---------- คอนเนอร์ RK800: คำขาดจับกุม — เป้าหมายระดับอาชญากรเลือกยอมจำนนหรือขัดขืน ----------
//  ไม่ตอบก่อนเปิดไพ่ = ถือว่า "ขัดขืน" (ฝั่ง server ตัดสินให้ที่ resolveRound)
function ConnorArrestModal({ ask, onAnswer }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4">
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2" style={{ borderColor: ask.color }}>
        <div className="flex items-center gap-3 mb-3">
          <img src={ask.img} alt="" className="w-20 h-14 object-cover rounded-xl shrink-0" />
          <div>
            <div className="text-lg font-black text-echo-hp">🚨 จับกุมขั้นเด็ดขาด</div>
            <div className="text-sm opacity-80"><span className="font-bold" style={{ color: ask.color }}>{ask.from}</span> ประกาศจับกุมคุณในฐานะ "อาชญากร"</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">🙇 <b>ยอมจำนน</b> — ความเครียดรีเซ็ตเป็น 0 แต่ติดสตั้น 3 เทิร์น และสถานะ "ผู้ต้องหา" 5 เทิร์น</div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">🏃 <b>ขัดขืน</b> — เริ่มการไล่ล่า 3 เทิร์น (ไม่มีเฟสโจมตี ผู้เล่นคนอื่นถูกแช่ และทุกคนรวมทั้งคุณกับคอนเนอร์ใช้สกิล/ไอเทมไม่ได้เลย) วัดกันว่าใครแต้มสูงกว่า (ใครถึง 2 แต้มก่อนจบทันที) — ชนะ (แต้มรวมมากกว่าคอนเนอร์ หรือเสมอ) = หนีรอด ความเครียดเป็น 0 และคอนเนอร์ติดสตั้น 3 เทิร์น · แพ้ = ความเครียดเป็น 0 สตั้น 3 เทิร์น เสียเลือด 3 หน่วย และติด "ผู้ต้องหา" 5 เทิร์น</div>
          <div className="text-xs opacity-70">ไม่ตอบก่อนเปิดไพ่ = ถือว่าขัดขืน</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant="ghost" className="py-3" onClick={() => { clickSound(); onAnswer(true); }}>🙇 ยอมจำนน</Button>
          <Button variant="gold" className="py-3" onClick={() => { clickSound(); onAnswer(false); }}>🏃 ขัดขืน</Button>
        </div>
      </div>
    </div>
  );
}

function ContractOfferModal({ offer, onAnswer }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4">
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2" style={{ borderColor: offer.color }}>
        <div className="flex items-center gap-3 mb-3">
          <img src={offer.img} alt="" className="w-20 h-14 object-cover rounded-xl shrink-0" />
          <div>
            <div className="text-lg font-black text-echo-gold">📶 สนใจใช้บริการเราไหม</div>
            <div className="text-sm opacity-80"><span className="font-bold" style={{ color: offer.color }}>{offer.from}</span> ยื่นข้อเสนอสัญญาให้คุณ</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">✅ <b>ตอบรับ</b> — เพดานเกราะ +1 พร้อมฟื้นเกราะ 1 หน่วย และพลังโจมตี +1 คงอยู่ตลอดสัญญา (ทุก 3 เทิร์นจะถูกเรียกเก็บค่าต่อสัญญา 4 แต้ม)</div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">❌ <b>ปฏิเสธ</b> — เสียพลังชีวิต 1 หน่วยไม่สนเกราะ และแต้มสกิลจบเทิร์นลด 1 เป็นเวลา 3 เทิร์น — ไม่ตอบก่อนเปิดไพ่ = ปฏิเสธ</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant="gold" className="py-3" onClick={() => { clickSound(); onAnswer(true); }}>✅ ตอบรับ</Button>
          <Button variant="ghost" className="py-3" onClick={() => { clickSound(); onAnswer(false); }}>❌ ปฏิเสธ</Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Locacaca fruit (ซาโตรุ patch 2.0.8.2): ข้อเสนอผลไม้ — เป้าหมายเลือกรับ/ปฏิเสธ ----------
//  ไม่ตอบก่อนเปิดไพ่ = ถือว่าปฏิเสธ (ไม่มีอะไรเกิดขึ้น)
function LocaOfferModal({ offer, onAnswer }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4">
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2" style={{ borderColor: offer.color }}>
        <div className="flex items-center gap-3 mb-3">
          <img src={offer.img} alt="" className="w-20 h-14 object-cover rounded-xl shrink-0" />
          <div>
            <div className="text-lg font-black text-echo-gold">🍑 Locacaca fruit</div>
            <div className="text-sm opacity-80"><span className="font-bold" style={{ color: offer.color }}>{offer.from}</span> ยื่นผลโลกากากาให้คุณ</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">✅ <b>รับ</b> — ฟื้นเลือดจนเต็มทันที แต่ Max HP ลดถาวร 1 หน่วย และจ่ายแต้มสกิล {offer.steal} หน่วยให้ {offer.from}</div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">❌ <b>ปฏิเสธ</b> — ไม่มีอะไรเกิดขึ้น — ไม่ตอบก่อนเปิดไพ่ = ปฏิเสธ</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant="gold" className="py-3" onClick={() => { clickSound(); onAnswer(true); }}>✅ รับผลไม้</Button>
          <Button variant="ghost" className="py-3" onClick={() => { clickSound(); onAnswer(false); }}>❌ ปฏิเสธ</Button>
        </div>
      </div>
    </div>
  );
}

// ---------- พันธมิตรบันชี × ยูนิคอร์น (ริดดี้ มาร์เซนาส patch 2.0.9) ----------
// Event เริ่มเกม: ริดดี้เห็นบานาจบนสนาม -> เลือกยื่นข้อเสนอพันธมิตร (เลือกบานาจ 1 คน) หรือเดินเส้นทางเดี่ยว
function AllyChoiceModal({ choices, onPick, onDecline }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4">
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2 border-echo-gold/60">
        <div className="text-lg font-black text-echo-gold">🤝 ตรวจพบยูนิคอร์นบนสนาม</div>
        <div className="text-sm opacity-80 mb-3">ต้องการยื่นข้อเสนอเป็นพันธมิตรกับบานาจไหม? (เป็นพันธมิตรแล้ว ท่าไม้ตายจะเปลี่ยนเป็น "ฉันจะไม่ยอมสูญเสียใครไปอีก" และเห็นแต้มการ์ดของกันและกัน — ไม่ตอบก่อนเปิดไพ่ = เดินเส้นทางเดี่ยว)</div>
        <div className="flex flex-col gap-2">
          {choices.map((c) => (
            <button
              key={c.id}
              onClick={() => { clickSound(); onPick(c.id); }}
              className="text-left flex items-center gap-3 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-2 transition"
            >
              <img src={c.img} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />
              <div className="font-bold" style={{ color: c.color }}>{c.name} <span className="text-white/70 text-sm">(บานาจ ลิงก์)</span></div>
            </button>
          ))}
        </div>
        <Button variant="ghost" className="mt-3 w-full py-3" onClick={() => { clickSound(); onDecline(); }}>🤖 ไม่เป็นพันธมิตร — เดินเส้นทางเดี่ยว</Button>
      </div>
    </div>
  );
}
// ริต้า เบอร์นัล: ขอแค่ได้พบกันอีก — เลือกเป้าหมายปลดปล่อยความเจ็บปวด (แสดงแม้ตกรอบไปแล้ว)
function PhenexReleaseModal({ ask, onPick }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4">
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2 border-echo-hp/60">
        <div className="text-lg font-black text-echo-hp">💔 ขอแค่ได้พบกันอีก</div>
        <div className="text-sm opacity-80 mb-3">เลือกเป้าหมายที่จะปลดปล่อยความเจ็บปวดสะสม {ask.pain} หน่วยใส่ (ไม่สนการหลบหลีก)</div>
        <div className="flex flex-col gap-2">
          {ask.options.map((c) => (
            <button
              key={c.id}
              onClick={() => { clickSound(); onPick(c.id); }}
              className="text-left flex items-center gap-3 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-2 transition"
            >
              <img src={c.img} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />
              <div className="font-bold" style={{ color: c.color }}>{c.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
// แบทแมน: นายลืมของน่ะ — เลือกเป้าหมายส่งต่อความเสียหายที่รับไว้ (ไม่ตอบก่อนเปิดไพ่รอบถัดไป = สุ่มให้)
function BatKarmaModal({ ask, onPick }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4">
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2 border-echo-gold/60">
        <div className="text-lg font-black text-echo-gold">🎁 นายลืมของน่ะ</div>
        <div className="text-sm opacity-80 mb-3">เลือกคนที่จะส่งความเสียหาย {ask.dmg} หน่วยที่รับไว้ให้แทน (ไม่สนการหลบหลีก · ไม่เลือกก่อนรอบถัดไป ระบบจะสุ่มให้)</div>
        <div className="flex flex-col gap-2">
          {ask.options.map((c) => (
            <button
              key={c.id}
              onClick={() => { clickSound(); onPick(c.id); }}
              className="text-left flex items-center gap-3 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-2 transition"
            >
              <img src={c.img} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />
              <div className="font-bold" style={{ color: c.color }}>{c.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
// บานาจ: ข้อเสนอพันธมิตรจากริดดี้ — ตอบรับ/ปฏิเสธ (ไม่ตอบก่อนเปิดไพ่ = ปฏิเสธ)
function AllyOfferModal({ offer, onAnswer }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4">
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2" style={{ borderColor: offer.color }}>
        <div className="flex items-center gap-3 mb-3">
          <img src={offer.img} alt="" className="w-16 h-16 object-cover rounded-xl shrink-0" />
          <div>
            <div className="text-lg font-black text-echo-gold">🤝 ข้อเสนอพันธมิตรบันชี</div>
            <div className="text-sm opacity-80"><span className="font-bold" style={{ color: offer.color }}>{offer.from}</span> ยื่นข้อเสนอเป็นพันธมิตรให้คุณ</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">✅ <b>ตอบรับ</b> — เห็นแต้มการ์ดของกันและกันตลอด / ท่าไม้ตาย 2 ของริดดี้จะมอบเกราะ+ต้านสถานะ และกันตายให้คุณ (HP ต่ำสุด 1) / เหลือแค่คู่พันธมิตรบนสนามแล้วคงพันธมิตร = ชนะทั้งคู่</div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">❌ <b>ปฏิเสธ</b> — ริดดี้เดินเส้นทางเดี่ยว: โจมตีใส่คุณแรงขึ้น +1 และถ้าคุณโจมตีเขา (หรือไม่โจมตีครบ 3 เทิร์น) NT-D จะทำงานฟรี — ไม่ตอบก่อนเปิดไพ่ = ปฏิเสธ</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant="gold" className="py-3" onClick={() => { clickSound(); onAnswer(true); }}>✅ ตอบรับ</Button>
          <Button variant="ghost" className="py-3" onClick={() => { clickSound(); onAnswer(false); }}>❌ ปฏิเสธ</Button>
        </div>
      </div>
    </div>
  );
}
// ถูกคู่พันธมิตรโจมตี: เลือกยกเลิกพันธมิตร (ฟื้นสิ่งที่เสียคืน) หรือให้อภัย (คงพันธมิตร)
function AllyBreakModal({ ask, onAnswer }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4">
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2" style={{ borderColor: ask.color }}>
        <div className="flex items-center gap-3 mb-3">
          <img src={ask.img} alt="" className="w-16 h-16 object-cover rounded-xl shrink-0" />
          <div>
            <div className="text-lg font-black text-echo-hp">💥 ถูกคู่พันธมิตรโจมตี!</div>
            <div className="text-sm opacity-80"><span className="font-bold" style={{ color: ask.color }}>{ask.from}</span> โจมตีใส่คุณ (เสียเลือด {ask.hp} เกราะ {ask.armor}) — ยกเลิกพันธมิตรไหม?</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">💔 <b>ยกเลิกพันธมิตร</b> — ฟื้นพลังชีวิต/เกราะที่เสียไปจากการโดนคู่ตีคืน และริดดี้กลับสู่เส้นทางเดี่ยว</div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">🤝 <b>ให้อภัย</b> — คงพันธมิตรต่อไป (ไม่ตอบก่อนเปิดไพ่ = คงพันธมิตร)</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant="ghost" className="py-3" onClick={() => { clickSound(); onAnswer(true); }}>💔 ยกเลิกพันธมิตร</Button>
          <Button variant="gold" className="py-3" onClick={() => { clickSound(); onAnswer(false); }}>🤝 ให้อภัย</Button>
        </div>
      </div>
    </div>
  );
}
// เหลือแค่คู่พันธมิตรบนสนาม: ริดดี้เลือกคงพันธมิตร (จบเกม ชนะทั้งคู่) หรือยกเลิก (สู้กันต่อ)
function AllyFinalModal({ ask, onAnswer }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4">
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2 border-echo-gold/60">
        <div className="flex items-center gap-3 mb-3">
          <img src={ask.img} alt="" className="w-16 h-16 object-cover rounded-xl shrink-0" />
          <div>
            <div className="text-lg font-black text-echo-gold">🤝 นายยังมีอนาคตอีกยาวไกล</div>
            <div className="text-sm opacity-80">สนามเหลือเพียงคุณกับ <span className="font-bold" style={{ color: ask.color }}>{ask.partner}</span> — จะยกเลิกพันธมิตรไหม?</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">👑 <b>คงพันธมิตร</b> — จบเกมทันที ชนะทั้งคู่!</div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">⚔️ <b>ยกเลิกพันธมิตร</b> — การต่อสู้ครั้งสุดท้ายระหว่างบันชีกับยูนิคอร์นเริ่มขึ้น</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant="gold" className="py-3" onClick={() => { clickSound(); onAnswer(true); }}>👑 คงพันธมิตร (ชนะทั้งคู่)</Button>
          <Button variant="ghost" className="py-3" onClick={() => { clickSound(); onAnswer(false); }}>⚔️ ยกเลิก — สู้ต่อ</Button>
        </div>
      </div>
    </div>
  );
}

// ---------- ชำระค่าบริการ (เจ้าแห่งเน็ตบ้าน): คู่สัญญาใช้งานครบทุก 3 เทิร์น -> ถามต่อสัญญา ----------
function ContractRenewModal({ ask, points, onAnswer }) {
  const shortfall = Math.max(0, (ask.fee || 4) - (points || 0));
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4">
      <div className="bg-echo-navy rounded-2xl p-5 max-w-md w-full shadow-2xl border-2" style={{ borderColor: ask.color }}>
        <div className="flex items-center gap-3 mb-3">
          <img src={ask.img} alt="" className="w-16 h-16 object-cover rounded-xl shrink-0" />
          <div>
            <div className="text-lg font-black text-echo-gold">📶 ชำระค่าบริการ — ต่อสัญญาไหม?</div>
            <div className="text-sm opacity-80"><span className="font-bold" style={{ color: ask.color }}>{ask.from}</span> เรียกเก็บค่าบริการ {ask.fee} แต้มสกิล</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">✅ <b>ต่อสัญญา</b> — จ่ายแต้มสกิล {ask.fee} แต้มส่งกลับให้ {ask.from}{shortfall > 0 ? ` (ตอนนี้มี ${points} แต้ม — ขาดอีก ${shortfall} จะรับเป็นความเสียหายแทน)` : ""}</div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">❌ <b>ปฏิเสธ</b> — เสียพลังชีวิต 2 หน่วยไม่สนเกราะ ติดสถานะ "ไม่ใช้งานต่อ" (ฟื้นเลือดตัวเองไม่ได้ 1 เทิร์น) และสัญญาสิ้นสุด — ไม่ตอบก่อนเปิดไพ่ = ปฏิเสธ</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant="gold" className="py-3" onClick={() => { clickSound(); onAnswer(true); }}>✅ ต่อสัญญา</Button>
          <Button variant="ghost" className="py-3" onClick={() => { clickSound(); onAnswer(false); }}>❌ ปฏิเสธ</Button>
        </div>
      </div>
    </div>
  );
}

// ช่องสกิลเป็นรูป (คลิกใช้ระหว่างเฟสไพ่) — cost = แต้มที่ใช้จริง (เวลาทองแกมเบลอร์ลดครึ่ง)
//  เฟรมตัดมุมเฉียง + แถบสีบอกระดับสกิล (พื้นฐาน/รอง/ท่าไม้ตาย) แทนกรอบมนธรรมดา
const SKILL_TIER_ACCENT = { basic: "var(--color-echo-cyan)", secondary: "var(--color-p-accent-bright)", ultimate: "var(--color-echo-gold)" };
function SkillSlot({ label, tier, skill, points, disabled, onUse, ammo, cost, size, cooldown }) {
  const [broken, setBroken] = useState(false);
  const hasAmmo = skill && skill.ammo != null;
  const ammoLeft = hasAmmo ? (ammo ?? skill.ammo) : null;
  const outOfAmmo = hasAmmo && ammoLeft <= 0;
  const useCost = skill ? (cost ?? skill.cost) : 0;
  const afford = skill && points >= useCost;
  const usable = skill && !disabled && afford && !outOfAmmo;
  const accent = SKILL_TIER_ACCENT[tier] || "var(--color-echo-gold)";
  const heightCls = size === "lg" ? "h-24 sm:h-28" : "h-20 sm:h-24";
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        disabled={!usable}
        onClick={() => usable && onUse(tier, skill, label, useCost)}
        title={skill ? `${skill.name} — ${skill.desc}` : ""}
        className={`relative w-full ${heightCls} overflow-hidden bg-gray-300 shadow-lg transition ${
          usable ? "hover:scale-105" : "opacity-70 cursor-not-allowed grayscale"
        }`}
        style={{
          clipPath: "polygon(10% 0,100% 0,100% 90%,90% 100%,0 100%,0 10%)",
          boxShadow: usable ? `0 0 0 2px ${accent}, 0 8px 18px -4px rgba(0,0,0,.6)` : "0 0 0 2px rgba(255,255,255,.15)",
        }}
      >
        <span className="absolute top-0 inset-x-0 h-1.5 z-10" style={{ background: accent }} />
        {skill && skill.img && !broken ? (
          <img src={skill.img} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-gray-500 text-3xl">✦</div>
        )}
        {skill && (
          <span className={`absolute top-1 right-1 text-xs font-bold rounded px-1.5 ${useCost < skill.cost ? "bg-echo-gold text-gray-900" : "bg-black/60 text-white"}`}>
            {useCost}
          </span>
        )}
        {/* คูลดาวน์: ตัวเลขนับถอยหลังกลางการ์ด (การ์ดถูก disable อยู่แล้วจึงแสดงเป็นขาวดำ) */}
        {(cooldown || 0) > 0 && (
          <span className="absolute inset-0 z-20 grid place-items-center bg-black/60">
            <span className="text-3xl sm:text-4xl font-black text-white leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,.9)]" style={{ fontFamily: P_DISPLAY }}>
              {cooldown}
            </span>
          </span>
        )}
        {hasAmmo && (
          <span className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-0.5 bg-black/55 rounded px-1 py-0.5">
            {Array.from({ length: skill.ammo }, (_, i) => (
              <span key={i} className={`w-2 h-2.5 rounded-[2px] ${i < ammoLeft ? "bg-echo-cyan shadow-[0_0_4px] shadow-echo-cyan" : "bg-white/25"}`} />
            ))}
          </span>
        )}
      </button>
      <div className="text-sm sm:text-base font-bold text-center leading-tight" style={{ fontFamily: P_DISPLAY }}>
        {label}{hasAmmo && <span className="text-echo-cyan"> · {ammoLeft}/{skill.ammo}</span>}
      </div>
    </div>
  );
}

// ---------- Bard : คีตกวี — ช่องประพันธ์เพลง (แทนที่ช่องท่าไม้ตาย) ----------
//  แสดงโน้ต ❤️/💚 ที่เติมไว้ 3 ช่อง — ครบ 3 บรรเลงทำนองเองแล้วล้างช่องเพื่อเริ่มบทเพลงใหม่
//  patch 2.1.2: จำกัด 2 โน้ตต่อเทิร์น — ระหว่างมิติมายาบรรเลง (โลหิต/วิญญาณ) กดได้สูงสุด 6 ครั้งต่อเทิร์น
function BardComposeSlot({ me }) {
  const notes = me.bardNotes || [];
  const dimOn = (me.statuses?.soulDim || 0) > 0 || (me.statuses?.bloodDim || 0) > 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-full h-20 sm:h-24 rounded-2xl overflow-hidden bg-black/40 border-2 border-echo-gold/70 shadow-lg grid grid-cols-3 gap-1.5 p-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`rounded-xl grid place-items-center text-2xl sm:text-3xl border ${
              notes[i] ? "bg-white/15 border-echo-gold/70 pop-in" : "bg-white/5 border-white/15"
            }`}
          >
            {notes[i] === "R" ? "❤️" : notes[i] === "J" ? "💚" : <span className="opacity-25">♪</span>}
          </div>
        ))}
      </div>
      <div className="text-sm sm:text-base font-bold text-center leading-tight">
        {dimOn ? `ประพันธ์เพลง · มิติมายาบรรเลง โน้ต ${me.bardNotesUsed || 0}/6` : `ประพันธ์เพลง · โน้ต ${me.bardNotesUsed || 0}/2 เทิร์นนี้`}
      </div>
    </div>
  );
}

// ---------- ไค ชิซากิ: ช่อง Overhaul 2 ช่อง (แทนที่ปุ่มท่าไม้ตาย) ----------
//  ระหว่างสะสม: แต่ละช่องโชว์รูปโปรไฟล์เป้าหมายที่ถือมาร์กอยู่ + ไอคอนสถานะ (รังสรรค์🎨/ลงทัณฑ์⚔️) ซ้อนมุม
//  ครบ 2 ช่อง: เปลี่ยนเป็นรูปเดียวเต็มปุ่มตามคอมโบที่จะออกผล (kai_passive1/2/3.jpg) กดได้ทันที ไม่เสียแต้มสกิล
const KAI_COMBO_IMG = {
  cc: "/characters/kai/kai_passive1.jpg", // รังสรรค์+รังสรรค์ = สวรรค์ประทานพร
  cp: "/characters/kai/kai_passive2.jpg", // รังสรรค์+ลงทัณฑ์ = ตาชั่งแห่งความเท่าเทียม
  pp: "/characters/kai/kai_passive3.jpg", // ลงทัณฑ์+ลงทัณฑ์ = โทสะระงับด้วยโทสะ
};
function KaiOverhaulSlot({ me }) {
  const slots = me.kaiOverhaulSlots || [];
  const ready = slots.length >= 2;
  // คำนวณคอมโบฝั่ง client ล้วนๆ จากเนื้อหา kaiOverhaulSlots เอง (ไม่ต้องมี field เพิ่มจาก server)
  const comboKey = ready ? (slots[0].status === "kaiCreation" ? (slots[1].status === "kaiCreation" ? "cc" : "cp") : (slots[1].status === "kaiPunishment" ? "pp" : "cp")) : null;
  const comboLabel = { cc: "สวรรค์ประทานพร", cp: "ตาชั่งแห่งความเท่าเทียม", pp: "โทสะระงับด้วยโทสะ" }[comboKey] || "";
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={() => { if (ready) { clickSound(); socket.emit("kaiOverhaul"); } }}
        disabled={!ready}
        className={`relative w-full h-20 sm:h-24 rounded-2xl overflow-hidden bg-black/40 border-2 shadow-lg transition ${
          ready ? "border-echo-gold/70 active:scale-95 cursor-pointer" : "border-white/15 cursor-not-allowed grid grid-cols-2 gap-1.5 p-2"
        }`}
      >
        {ready ? (
          <img src={KAI_COMBO_IMG[comboKey]} alt={comboLabel} className="absolute inset-0 w-full h-full object-cover pop-in" />
        ) : (
          [0, 1].map((i) => {
            const slot = slots[i];
            return (
              <div
                key={i}
                className={`relative rounded-xl overflow-hidden flex items-center justify-center border ${
                  slot ? "border-echo-gold/70 pop-in" : "bg-white/5 border-white/15"
                }`}
              >
                {slot ? (
                  <>
                    {slot.img && <img src={slot.img} alt={slot.name} className="absolute inset-0 w-full h-full object-cover" />}
                    <span className="absolute bottom-0.5 right-0.5 text-base sm:text-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {slot.status === "kaiCreation" ? "🎨" : "⚔️"}
                    </span>
                  </>
                ) : (
                  <span className="opacity-25 text-xl">♦</span>
                )}
              </div>
            );
          })
        )}
      </button>
      <div className="text-sm sm:text-base font-bold text-center leading-tight">
        {ready ? `Overhaul พร้อม! (${comboLabel})` : `Overhaul · ${slots.length}/2`}
      </div>
    </div>
  );
}

// ---------- กองการ์ดกลางจอ: การ์ดคว่ำซ้อนกันเล็กน้อย ไม่ต้องมีอาร์ตใหม่ ----------
//  onClick (ถ้ามี) เปิดสมุดการ์ด (DeckLedgerModal) — ต้องเปิด pointer-events เฉพาะจุดนี้เอง เพราะ wrapper รอบนอก (โลโก้/กึ่งกลางจอ) เป็น pointer-events-none ทั้งแถบ
function DeckPile({ hostRef, size = "md", onClick }) {
  const dims = { sm: { w: 36, h: 48 }, md: { w: 48, h: 64 }, lg: { w: 80, h: 112 } };
  const dim = dims[size] || dims.md;
  return (
    <div
      ref={hostRef}
      className={`relative ${onClick ? "pointer-events-auto cursor-pointer active:scale-95 transition" : "pointer-events-none"}`}
      style={{ width: dim.w + 10, height: dim.h + 10 }}
      onClick={onClick}
      title={onClick ? "ดูสมุดการ์ดกองกลาง" : undefined}
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="absolute" style={{ left: 5 - i * 2, top: 5 - i * 2, transform: `rotate(${(i - 1.5) * -3}deg)` }}>
          <Card back size={size} />
        </div>
      ))}
    </div>
  );
}

// ---------- สมุดการ์ดกองกลาง: กดที่กองการ์ดกลางเพื่อดูการ์ดทั้ง 43 ใบ ใบไหนถูกจั่วไปแล้ว (รอบนี้) จะเป็นสีเทา ----------
function DeckLedgerModal({ ledger, onClose }) {
  const drawnCount = ledger.filter((c) => c.drawn).length;
  return (
    <div className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-echo-navy/95 border border-white/15 rounded-2xl p-4 sm:p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto text-hard"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <div className="text-lg sm:text-xl font-black">สมุดการ์ดกองกลาง</div>
            <div className="text-xs sm:text-sm text-white/60">จั่วไปแล้ว {drawnCount}/{ledger.length} ใบ (รอบปัจจุบัน — สับใหม่ทุกรอบ)</div>
          </div>
          <button onClick={onClose} className="shrink-0 text-sm font-bold bg-black/40 hover:bg-black/60 rounded-full px-3 py-1 border border-white/25">ปิด</button>
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-8 gap-1 place-items-center">
          {ledger.map((c, i) => (
            <div key={i} className={c.drawn ? "grayscale opacity-30" : ""}>
              <Card value={c.value} color={c.color} special={c.special} size="sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- ตรวจจับการจั่วการ์ด (ตัวเอง+คนอื่น รองรับจั่วพร้อมกันหลายคน) แล้วสร้างแอนิเมชันบินจากกองกลางไปหามือ ----------
//  เป็นแค่ overlay ตกแต่ง ไม่มีผลต่อ state จริงเลย — มือ/คะแนนจริงอัปเดตตาม state ทันทีเสมอไม่ต้องรอแอนิเมชันบินจบ
function useCardFlights(state) {
  const [flights, setFlights] = useState([]);
  const prevCounts = useRef({});
  const seeded = useRef(false);
  const flightSeq = useRef(0);
  const deckRef = useRef(null);
  const selfHandRef = useRef(null);
  const otherRefs = useRef({});
  const registerOther = useCallback((id, el) => {
    if (el) otherRefs.current[id] = el;
    else delete otherRefs.current[id];
  }, []);

  useEffect(() => {
    if (!state?.players) return;
    const counts = {};
    for (const p of state.players) {
      counts[p.id] = p.id === state.youId ? (p.cards ? p.cards.length : 0) : (p.cardCount || 0);
    }
    // ครั้งแรกที่ได้ state (mount/reconnect กลางรอบ) — แค่จำ baseline ไว้ ไม่ยิงแอนิเมชัน กันเข้าใจผิดว่าทั้งมือ "เพิ่งจั่ว"
    if (!seeded.current) {
      seeded.current = true;
      prevCounts.current = counts;
      return;
    }
    const deckRect = deckRef.current?.getBoundingClientRect();
    if (!deckRect) { prevCounts.current = counts; return; }
    const fromX = deckRect.left + deckRect.width / 2;
    const fromY = deckRect.top + deckRect.height / 2;

    const newFlights = [];
    for (const p of state.players) {
      const prev = prevCounts.current[p.id] || 0;
      const cur = counts[p.id] || 0;
      // แจกรอบใหม่: มือถูกรีเซ็ตแล้วแจกใหม่ในสเตตเดียวกัน (cur < prev) — ถือว่าทุกใบที่มีตอนนี้ "เพิ่งจั่ว" ทั้งหมด
      const delta = cur > prev ? cur - prev : cur < prev ? cur : 0;
      if (delta <= 0) continue;
      const isSelf = p.id === state.youId;
      const targetEl = isSelf ? selfHandRef.current : otherRefs.current[p.id];
      const targetRect = targetEl?.getBoundingClientRect();
      if (!targetRect) continue;
      const toX = targetRect.left + targetRect.width / 2;
      const toY = targetRect.top + targetRect.height / 2;
      const newCards = isSelf && p.cards ? p.cards.slice(-delta) : [];
      for (let i = 0; i < delta; i++) {
        newFlights.push({
          id: ++flightSeq.current,
          delayMs: i * 90,
          fromX, fromY, toX, toY,
          card: newCards[i] || null,
        });
      }
    }
    if (newFlights.length) setFlights((f) => [...f, ...newFlights]);
    prevCounts.current = counts;
  }, [state]);

  const removeFlight = (id) => setFlights((f) => f.filter((x) => x.id !== id));
  return { flights, removeFlight, deckRef, selfHandRef, registerOther };
}

// ---------- ชั้นเรนเดอร์การ์ดที่กำลังบิน (fixed เต็มจอ ทับทุกอย่าง ไม่กันคลิก) ----------
function FlyingCardsLayer({ flights, onDone }) {
  if (!flights.length) return null;
  return (
    <div className="fixed inset-0 z-[45] pointer-events-none overflow-hidden">
      <AnimatePresence>
        {flights.map((f) => (
          <motion.div
            key={f.id}
            className="absolute"
            style={{ left: f.fromX - 18, top: f.fromY - 24 }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.85, rotate: 0 }}
            animate={{
              x: f.toX - f.fromX, y: f.toY - f.fromY,
              opacity: [0, 1, 1, 0], scale: [0.85, 1.05, 0.9, 0.7], rotate: [0, 8, -4, 0],
            }}
            transition={{ duration: 0.5, delay: f.delayMs / 1000, ease: [0.2, 0.7, 0.3, 1] }}
            onAnimationComplete={() => onDone(f.id)}
          >
            {f.card ? <Card value={f.card.value} color={f.card.color} special={f.card.special} size="sm" /> : <Card back size="sm" />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function Game({ state, lowQ, skillConfirmOn = true }) {
  const [skillOpen, setSkillOpen] = useState(false);
  const [showChar, setShowChar] = useState(false);
  const [flash, setFlash] = useState(null); // สกิลช่วงจั่วการ์ด เด้งทันทีบนกระดาน
  const [notice, setNotice] = useState(null); // แปลงร่างซ้ำ (ครั้งที่ 2 เป็นต้นไป) เด้งแจ้งเตือนทันที ไม่หยุดเกม
  const [anataSel, setAnataSel] = useState(null); // เทมาริ: โหมดเลือกเป้าหมาย ANATA WAAAAAAAA (null = ไม่ได้เลือกอยู่)
  const [dawnSel, setDawnSel] = useState(false); // โอเบรอน: โหมดเลือกเป้าหมายรุ่งอรุณแห่งวันใหม่ (เลือกตัวเองได้)
  const [bgSel, setBgSel] = useState(false); // บานาจ: โหมดเลือกเป้าหมาย Absorb shield (เลือกตัวเองได้)
  const [appleOpen, setAppleOpen] = useState(false); // Apple guy: เมนูเลือกของส่งมอบ (สกิลพื้นฐาน)
  const [tohnoOpen, setTohnoOpen] = useState(false); // โทโนะ ชิกิ: เมนูเลือกระดับมีดพับประจำตระกูล (สกิลพื้นฐาน)
  const [appleSel, setAppleSel] = useState(false);   // Apple guy: โหมดเลือกเป้าหมายเอาไปสิ (เลือกตัวเองไม่ได้)
  const [bbSel, setBbSel] = useState(false);         // เจ้าแห่งเน็ตบ้าน: โหมดเลือกเป้าหมายยื่นข้อเสนอสัญญา
  const [shSel, setShSel] = useState(false);         // ชเรด เอลัน: โหมดเลือกเป้าหมายแสงจันทร์ส่องวิญญาณ (เลือกตัวเองไม่ได้)
  const [skSel, setSkSel] = useState(false);         // ชิกิ: โหมดเลือกเป้าหมาย นายมีฝีมือแค่ไหนหรอ? (เลือกตัวเองไม่ได้)
  const [psSealSel, setPsSealSel] = useState(false); // เจ้าหญิงราก: โหมดเลือกเป้าหมาย อย่าทำอะไรไม่เข้าท่าเลย (เลือกตัวเองไม่ได้)
  const [doomSel, setDoomSel] = useState(false); // DoomGuy: โหมดเลือกเป้าหมาย Weapon (เฉพาะอาวุธที่ต้องเลือกเป้าหมาย)
  const DOOM_TARGET_WEAPONS = ["shotgun", "heavy", "supershotgun", "rocket", "ballista", "plasma"];
  const [saObSel, setSaObSel] = useState(false);
  const [escanorSel, setEscanorSel] = useState(false);
  const [ignisSel, setIgnisSel] = useState(false);     // อิกนิส: โหมดเลือกเป้าหมาย ฉันขอละนะ! (เลือกตัวเองไม่ได้)
  const [ignisImpactSel, setIgnisImpactSel] = useState(false); // Trigger Dark: โหมดเลือกเป้าหมาย Impact
  const [bardSel, setBardSel] = useState([]);        // Bard: เป้าหมายบทเพลงที่เลือกไว้ (บทเพลงต้องการ 1-2 คน)
  const [nanayaSel, setNanayaSel] = useState(false);  // นานายะ ชิกิ: โหมดเลือกเป้าหมาย อันนี้ของนายรึเปล่า (เลือกตัวเองไม่ได้)
  const [tpSel, setTpSel] = useState(false);          // เทเปา: โหมดเลือกเป้าหมาย นายเป็นคนทำตัวเองนะ (เลือกตัวเองไม่ได้)
  const [kaiCreateSel, setKaiCreateSel] = useState(false);   // ไค: โหมดเลือกเป้าหมายมือซ้ายแห่งการรังสรรค์ (เลือกตัวเองได้)
  const [kaiPunishSel, setKaiPunishSel] = useState(false);   // ไค: โหมดเลือกเป้าหมายมือขวาแห่งการลงทัณฑ์ (เลือกตัวเองได้)
  const [bylethInfoOpen, setBylethInfoOpen] = useState(false);     // ไบเลธ: หน้าต่างอ่านผลของหลักสูตรที่เปิดอยู่ (ทุกคนเปิดได้)
  const [bylethSwordOpen, setBylethSwordOpen] = useState(false);   // ไบเลธ: หน้าต่างเลือกแบบของ "ดาบต้องสาป"
  const [bylethCourseOpen, setBylethCourseOpen] = useState(false);  // ไบเลธ: หน้าต่างเลือกหลักสูตรของท่าไม้ตาย
  const [connorSel, setConnorSel] = useState(null);                 // คอนเนอร์: โหมดเลือกเป้าหมาย ("secondary" | "ultimate" | null)
  const [danSel, setDanSel] = useState(null);                       // โมโรโบชิ ดัน: โหมดเลือกเป้าหมาย ("secondary" | "ultimate" | null)
  const [bylethStrikeSel, setBylethStrikeSel] = useState(false);    // ไบเลธ: โหมดเลือกเป้าหมายฟาดดาบ (เลือกตัวเองไม่ได้)
  const [msMarkSel, setMsMarkSel] = useState(false);         // ผู้สังหารเมจ: โหมดเลือกเป้าหมาย Witch Mark (เลือกตัวเองไม่ได้)
  const [msRuptureSel, setMsRuptureSel] = useState(false);   // ผู้สังหารเมจ: โหมดเลือกเป้าหมาย Mana Rupture (เลือกตัวเองไม่ได้)
  const [gunSel, setGunSel] = useState(null);                // ปืนหน่วย GUTS Select: กระสุนที่เลือกไว้ รอจิ้มเป้าหมายบนกระดาน (เลือกตัวเองไม่ได้)
  const [cycleFx, setCycleFx] = useState(null); // แบนเนอร์สลับกลางวัน/กลางคืน
  const prevCycle = useRef(null);
  const [hakunoCmdOpen, setHakunoCmdOpen] = useState(false); // คิชินามิ ฮาคุโนะ: เมนูเลือกคำสั่งอาคมบัญชาระดับ EX+
  const [statusViewId, setStatusViewId] = useState(null); // ดูสถานะผู้เล่นคนอื่น (แตะการ์ดตอนไม่ได้เลือกเป้า)
  const [bagOpen, setBagOpen] = useState(false);     // ร้านค้ามายา (patch 2.2 full): เปิดดูคลังของตัวเอง
  const [shopOpen, setShopOpen] = useState(false);   // ร้านค้ามายา: เปิดหน้าร้านค้า
  const [deckOpen, setDeckOpen] = useState(false);   // สมุดการ์ดกองกลาง: กดที่กองการ์ดกลางเพื่อดู
  const shopAutoShown = useRef(-1);                  // จำรอบร้านค้าที่เด้งอัตโนมัติไปแล้ว (กันเด้งซ้ำ)
  const vp = useViewport();
  const { flights: cardFlights, removeFlight: removeCardFlight, deckRef, selfHandRef, registerOther } = useCardFlights(state);
  const phase = state.gameState;
  const me = state.players.find((p) => p.id === state.youId);
  const boss = state.players.find((p) => p.isBoss && p.alive) || null;
  const others = state.players.filter((p) => p.id !== state.youId && !p.isBoss);
  const slots = SLOTS[Math.min(others.length, 6)] || [];
  const iAmAttacker = phase === "ATTACK" && state.attackerId === state.youId;
  const attacker = state.players.find((p) => p.id === state.attackerId);
  const rankedTiers = rankTiers(state.players);
  const summaryWinners = rankedTiers[0]?.players || [];
  const summaryLosers = rankedTiers.slice(1).flatMap((t) => t.players);
  const done = me && (me.locked || !me.alive);
  const ch = me?.character;
  const meStatuses = me ? statusEntries(me) : []; // รายการสถานะของตัวเอง — ใช้ในกล่อง "สถานะ" ของแผง HUD (เรียงลงล่างเรื่อยๆ ตามลำดับที่ติด)
  // นานายะ ชิกิ (patch 2.1.9): ชนะการจั่ว -> สุ่มเล่นเสียงพากย์ 1 เสียง (ครั้งเดียวต่อรอบ)
  const nanayaVoiceRound = useRef(null);
  const actualWinner = state.players.find((p) => p.id === state.winnerId);
  useEffect(() => {
    if (phase === "SUMMARY" && actualWinner?.character?.id === "nanaya" && nanayaVoiceRound.current !== state.roundNumber) {
      nanayaVoiceRound.current = state.roundNumber;
      playSfx(`nanayaVoice${1 + Math.floor(Math.random() * 5)}`);
    }
  }, [phase, actualWinner, state.roundNumber]);
  // ร้านค้ามายา (patch 2.2 full): เด้งหน้าร้านค้าอัตโนมัติครั้งเดียวทุกครั้งที่มีสินค้าชุดใหม่ (รอบร้านค้าเปลี่ยน)
  useEffect(() => {
    const seq = state.shop?.[0]?.id?.split("_")[1];
    if (seq && shopAutoShown.current !== seq) {
      shopAutoShown.current = seq;
      setShopOpen(true);
    }
  }, [state.shop]);
  // ผู้เล่นที่กำลังเปิดดูสถานะ (ข้อมูลสดจาก state ทุกครั้งที่ re-render)
  const statusView = statusViewId ? state.players.find((x) => x.id === statusViewId) : null;
  // Beat Mode (คุวากาตะ เลือด < 3): ท่าไม้ตายใช้ไม่ได้เสมอ
  const beatMe = !!(me && ch?.id === "kuwagata" && me.alive && me.hp != null && me.hp < 3);
  // สกิลพื้นฐาน (patch 2.2 alpha): ใช้ไม่ได้เฉพาะหลังกันตายทำงานแล้ว (ไม่ใช่แค่เข้า Beat Mode)
  const beatBasicLocked = beatMe && !!me?.beatSaved;
  // กลางวัน/กลางคืน (patch 1.7): สลับทุก 3 เทิร์น — โอเบรอนสลับร่าง/ท่าไม้ตายตามช่วงเวลา
  const nightNow = state.cycle === "night";
  // ท่าไม้ตายกำลังมีผลอยู่: กดซ้ำไม่ได้จนกว่าจะหมดเวลา (สวมเกราะราชันถาวร = กดซ้ำไม่ได้อีกเลย)
  //  โอเบรอน: กลางวันเช็ค lai / กลางคืนเช็ค vortigern
  // ริดดี้ (patch 2.0.9): ระหว่างเป็นพันธมิตร ท่าไม้ตายเป็นท่า 2 (riddheguard) — เส้นทางเดี่ยวเป็นท่า 1 (riddhentd)
  const riddheAlliedMe = ch?.id === "riddhe" && !!me?.allyId &&
    state.players.some((x) => x.id === me.allyId && x.alive && x.allyId === me.id);
  // บานาจ ลิงก์ (patch 2.1.2): มีริดดี้เป็นพันธมิตร
  const banagherAlliedMe = ch?.id === "banagher" && !!me?.allyId &&
    state.players.some((x) => x.id === me.allyId && x.alive && x.allyId === me.id);
  const ultStatusKey = ch?.id === "oberon" ? (nightNow ? "vortigern" : "lai")
    : ch?.id === "shiki" ? (me?.shikiUlt === "wither" ? "wither" : "deatheye")
    : ch?.id === "riddhe" ? (riddheAlliedMe ? "riddheguard" : "riddhentd")
    // บานาจ: ระหว่างร่าง Paradise ที่มีริดดี้เป็นพันธมิตร ปุ่มท่าไม้ตายกลายเป็นแสงที่ไม่อยู่เพียงลำพัง — กดซ้ำได้เรื่อยๆ (ไม่ล็อก)
    : ch?.id === "banagher" ? ((banagherAlliedMe && (me?.statuses?.paradise || 0) > 0) ? null : "paradise")
    // มิซึซาว่า ฮารุกะ (patch 2.8.1): กดท่าไม้ตายซ้ำได้แม้ "โอเมก้า" ทำงานอยู่
    //  เพราะการระเบิดแต้มการ์ดผูกกับ "การกด 1 ครั้ง" ไม่ใช่ระหว่างที่สถานะติดอยู่
    : ch?.id === "haruka" ? null
    : ULTIMATE_STATUS[ch?.id];
  const ultimateActive = !!(me && me.statuses && me.statuses[ultStatusKey]);
  // MonsterLive (ฮิคารุ patch 2.1.3): ระหว่างมีผล ใช้สกิลรอง Ultlive Ultraman Ginga ไม่ได้
  const monsterMe = !!(me && ch?.id === "hikaru" && me.statuses?.monster);
  // Ginga Strium (ฮิคารุ patch 2.1.3): ต้องอยู่ในร่าง Ginga (สกิลรอง 1) และเป็นตอนกลางวันเท่านั้นถึงใช้ได้
  const hikaruUltLocked = ch?.id === "hikaru" && !((me?.statuses?.ginga || 0) > 0 && !nightNow);
  // Ohger Finish (คุวากาตะ patch 2.2 alpha): ใช้ได้โดยไม่มีเงื่อนไขแล้ว — กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  const ohgerLocked = !!(me && ch?.id === "kuwagata" && (me.statuses?.ohger || 0) > 0);
  // Full Assault (บานาจ ลิงก์ patch 2.1.2): กดซ้ำไม่ได้จนกว่าผลจะหมด — ไม่มีผลตอนสกิลรองกลายเป็น Beam Magnum (ร่าง Paradise)
  const banagherAssaultLocked = !!(me && ch?.id === "banagher" && !((me.statuses?.paradise || 0) > 0) && (me.statuses?.fullassault || 0) > 0);
  // ห้ามจั่วการ์ดเพิ่มเทิร์นนี้ (ทงคัสสึ / กำไรเท่าตัวโว้ย)
  const noDraw = !!(me && me.statuses?.nodraw);
  // ห้ามใช้สกิลเทิร์นนี้ (โดนหอกลองกินัสปัก) — เรจูอาคมบัญชาไม่นับเป็นสกิล ใช้ได้ปกติ
  const noSkill = !!(me && me.statuses?.noskill);
  // MOON*CELL (คิชินามิ ฮาคุโนะ patch 2.2.1): สกิลทุกคนใช้ไม่ได้เลย (รวมของฮาคุโนะเจ้าของท่าเอง) — เหลือแค่สกิลติดตัว
  const moonCellOn = !!state.hakunoBg;
  // อาริมะ มิยาโกะ: กดซ้ำไม่ได้จนกว่าจะได้โจมตี (พี่จ๋าอยู่ไหน / เพลงหมัด อาริมะ)
  const miyakoHealPending = !!(me && me.statuses?.miyakoHeal);
  const miyakoComboPending = !!(me && me.statuses?.miyakoCombo);
  // คิชินามิ ฮาคุโนะ: กดซ้ำไม่ได้จนกว่าจะได้โจมตี (ข้าขอบัญชา ทั้งสองร่าง)
  const hakunoSecondaryPending = !!(me && (me.statuses?.hakunoInvertReady || me.statuses?.hakunoNoRegenReady));
  // ---------- แกมเบลอร์ ----------
  const isGambler = ch?.id === "gambler";
  const goldenOn = !!(me && me.statuses?.golden); // บัฟเวลาทอง 777 กำลังมีผล
  // เวลาทอง: กดสกิลพื้นฐานซ้ำได้ในเทิร์นเดียว จนกว่าจำนวนใช้/แต้มจะหมด + คอสพื้นฐาน/รองลดครึ่ง
  const gambleRepeat = isGambler && goldenOn && (me?.gamblerUses || 0) > 0;
  const halfCost = (s) => (s ? Math.ceil(s.cost / 2) : 0);
  // ---------- เอวา 13 ----------
  const isEva = ch?.id === "eva13";
  // หอกแห่งแคสเซียส (patch 2.2 alpha): กดซ้ำไม่ได้จนกว่าจะได้โจมตี
  const cassiusLocked = isEva && (me?.statuses?.cassius || 0) > 0;
  // Fourth Impact: ใช้ได้เมื่อสกิลติดตัว 3 ทำงาน (เลือด <= 4) เท่านั้น
  const fourthLocked = isEva && me?.hp != null && me.hp > 4;
  // ---------- DoomGuy (patch 2.2 full) ----------
  const isDoomguy = ch?.id === "doomguy";
  const doomUltLocked = isDoomguy && (me?.doomCharge || 0) < 5; // Crucible: ต้องมีชาร์จครบ 5
  // สกิลติดตัว: ไม่ติดคูลดาวน์การใช้สกิล — Quick Swap (สกิลพื้นฐาน) และ Weapon (สกิลรอง) ไม่นับเป็นการใช้สกิลของเทิร์น กดได้ทั้งคู่ในเทิร์นเดียวกัน
  const doomBasicLocked = isDoomguy && (!!me?.doomQuickSwapUsed || !!me?.doomWeaponMarkPending); // Quick Swap เอง ยังจำกัด 1 ครั้ง/เทิร์นตามปกติ + ล็อกถ้ามี [ระเบิด]/[ล็อคเป้า] ค้างอยู่
  const doomNoEffectLocked = isDoomguy && me?.doomWeaponHasEffect === false; // ปืนกระบอกนี้ไม่มีความสามารถพิเศษให้กด (BFG 9000)
  // ---------- สึงาชิ ทาคุโตะ (patch 2.2 new / 2.2.4 / 2.2.5) ----------
  const isTakuto = ch?.id === "takuto";
  const takutoApprivoiseOn = isTakuto && !!(me?.statuses?.apprivoise);
  const takutoNotApprivoiseLocked = isTakuto && !takutoApprivoiseOn; // สกิลรอง: ต้องฉันคว้ามันได้แล้วก่อน
  const takutoLanceOn = isTakuto && (me?.statuses?.lance || 0) > 0; // หอกผู้พิชิต: ถือว่าดาบทั้ง 2 อันทำงานอยู่ กดซ้ำไม่ได้
  const takutoBasicPending = isTakuto && (!!(me?.statuses?.emeraude) || takutoLanceOn); // Emeraude ยังไม่ถูกใช้ — กดสกิลพื้นฐานซ้ำไม่ได้
  const takutoSecPending = isTakuto && (!!(me?.statuses?.saphir) || takutoLanceOn); // Saphir ยังไม่ถูกใช้ — กดสกิลรองซ้ำไม่ได้
  // ท่าไม้ตาย 1 "อย่างนายน่ะ จะไปเข้าใจอะไร" (พิชิตแสงดาว): ใช้ได้ก่อนกันตายทำงานเท่านั้น ต้องมีดาบทั้ง 2 อันพร้อมกัน + ไม่มีโอกาสโจมตีครั้งที่ 3 ค้างอยู่
  const takutoUlt2Locked = isTakuto && (!!me?.beatSaved || !((me?.statuses?.emeraude || 0) > 0 && (me?.statuses?.saphir || 0) > 0 && !(me?.statuses?.takutoThirdAtk || 0)));
  // ท่าไม้ตาย 2 "ร่วมเดินทางไปกับฉันเถอะ": แทนท่าไม้ตาย 1 ถาวรหลังกันตายทำงานแล้ว ต้องอยู่ในร่างฉันคว้ามันได้แล้วเท่านั้น (ไม่ต้องมีดาบ)
  const takutoUlt3Locked = isTakuto && !!me?.beatSaved && !takutoApprivoiseOn;
  // ปุ่มท่าไม้ตายที่แสดงอยู่ตอนนี้คือแบบไหน — สลับล็อกให้ตรงกับสกิลที่ ch?.ultimate ส่งมาจาก server
  const takutoUltLockedNow = isTakuto ? (me?.beatSaved ? takutoUlt3Locked : takutoUlt2Locked) : false;
  // isHakuno ประกาศด้านล่าง (แถวเดียวกับ isTohno ฯลฯ) — คำนวณ hakunoCmdUsable/useHakunoCmd หลังจากนั้น
  // ---------- โอเบรอน ----------
  const isOberon = ch?.id === "oberon";
  // ม่านแห่งราตรี: กดซ้ำไม่ได้จนกว่าผลเพิ่มพลังโจมตีจะหมด
  const veilLocked = isOberon && !!me?.statuses?.veil;
  // ---------- Apple guy ----------
  const isApple = ch?.id === "appleguy"; // สกิลพื้นฐานไม่นับเป็นการใช้สกิลของเทิร์น (ใช้แล้วยังใช้สกิลอื่นได้)
  const isTohno = ch?.id === "tohno"; // มีดพับประจำตระกูล (สกิลพื้นฐาน) ไม่นับเป็นการใช้สกิลของเทิร์นเช่นกัน (กดเปลี่ยนระดับได้เรื่อยๆ)
  const isHakuno = ch?.id === "hakuno"; // เธอ/นาย คือฉันหรอ? (สกิลพื้นฐาน) ไม่นับเป็นการใช้สกิลของเทิร์นเช่นกัน (กดสลับได้ 1 ครั้ง/เทิร์น)
  const hakunoCmdUsable = !!(isHakuno && phase === "PLAYING" && me?.alive && !done && (me?.hakunoCommandUses || 0) > 0);
  const useHakunoCmd = (cmd) => { socket.emit("hakunoCommandSpell", { command: cmd }); setHakunoCmdOpen(false); };
  // ---------- เอจิ (patch 2.4 new) ----------
  //  กลโกง Ordinal Scale: ปุ่มเฉพาะตัว ไม่นับเป็นการใช้สกิลของเทิร์น -> กดพร้อมสกิลอื่นได้ และกดซ้ำได้จนครบ 5 ครั้ง
  const isEiji = ch?.id === "eiji";
  const eijiOrdinalUsable = !!(isEiji && phase === "PLAYING" && me?.alive && !done && !me?.locked &&
    (me?.eijiOrdinal || 0) < (me?.eijiOrdinalMax || 5) && (me?.skillPoints || 0) >= 1);
  const useEijiOrdinal = () => { socket.emit("eijiOrdinalScale"); };
  // ---------- มิซึซาว่า ฮารุกะ (patch 2.5 new) ----------
  const isHaruka = ch?.id === "haruka";
  //  ไข่ต้ม และอาหารเสริม: ไม่นับเป็นการใช้สกิลของเทิร์น — กดได้ 2 ครั้ง/เทิร์น แล้วยังใช้สกิลอื่นได้อีก 1 ครั้ง
  const harukaBasicLocked = isHaruka && (me?.harukaBasicUses || 0) >= (me?.harukaBasicMax || 2);
  //  amazon punish: ต้องมี "โอเมก้า" อยู่ และ "จงไปสู่สุขติ" ต้องไม่ค้างอยู่
  const harukaSecLocked = isHaruka && (!(me?.statuses?.harukaOmega > 0) || (me?.statuses?.harukaPunish || 0) > 0);
  // ---------- อาจารย์ ไบเลธ (patch 2.6 new) ----------
  const isByleth = ch?.id === "byleth";
  const bylethKnow = me?.bylethKnowledge || 0;
  const bylethCourse = me?.bylethCourse || null;
  //  ภูมิปัญญา: ทุกช่องไม่นับเป็นการใช้สกิลของเทิร์น แต่รวมกันได้ 5 ครั้ง/เทิร์น
  const bylethBudgetLocked = isByleth && (me?.bylethSkillUses || 0) >= (me?.bylethSkillMax || 5);
  //  ทบทวนบทเรียน: กดไม่ได้ระหว่างหลักสูตรเปิดอยู่ หรือโดนหลักสูตร "พิเศษ" สั่งห้ามไว้
  const bylethBasicLocked = isByleth && (!!bylethCourse || (me?.statuses?.bylethNoBasic || 0) > 0);
  //  ดาบต้องสาป: ต้องมีความรู้ 4 หน่วย และต้องยังมีแบบที่กดได้อย่างน้อย 1 แบบ
  const bylethSecLocked = isByleth && (bylethKnow < 4 || (!!me?.bylethStrikeUsed && (me?.statuses?.bylethSword || 0) > 0));
  //  หลักสูตรการสอน: เปิดอยู่แล้วกดได้เสมอ (สลับ/ปิด) · ยังไม่เปิดต้องมีความรู้ 4 หน่วย
  const bylethUltLocked = isByleth && !bylethCourse && bylethKnow < 4;
  // ---------- เจ้าแห่งเน็ตบ้าน ----------
  const isBroadband = ch?.id === "broadband_man";
  const lanLocked = isBroadband && !me?.contractPartnerId;    // กระชากสายแลน: ใช้ได้ก็ต่อเมื่อมีคู่สัญญาแล้ว
  const offerLocked = isBroadband && !!me?.contractPartnerId; // สนใจใช้บริการเราไหม: ใช้ไม่ได้ระหว่างมีคู่สัญญา
  // ---------- ฟุจิตะ โคโตเนะ (rework 2.3) ----------
  const isKotone = ch?.id === "kotone";
  const ktForm = isKotone && !!me?.kotoneForm;              // อยู่ร่าง [พร้อมลุย] — ปุ่มทั้ง 3 ช่องเป็นท่าไม้ตาย (6 แต้ม + 6 เหรียญ)
  const ktNoGold = ktForm && (me?.gold || 0) < 6;           // เหรียญไม่พอจ่ายค่าท่าไม้ตายในร่าง
  const ktBasicLocked = isKotone && ktNoGold;
  const ktSecLocked = isKotone && (ktNoGold || (!ktForm && nightNow && !!me?.statuses?.ksleep));
  // ท่าไม้ตาย: ในร่างต้องมีเหรียญพอ · กลางวันต้องมี [ความพร้อม] ครบ 4 · กลางคืน (Sleeping time) ห้ามหลับซ้ำ
  const ktUltLocked = isKotone && (ktForm
    ? ktNoGold
    : (nightNow ? !!me?.statuses?.ksleep : (me?.kotoneReady || 0) < (me?.kotoneReadyNeed || 4)));
  // ---------- Bard : คีตกวี ----------
  const isBard = ch?.id === "bard";
  const bardPending = isBard && phase === "PLAYING" ? me?.bardPending : null; // บทเพลงรอเลือกเป้าหมาย
  const bardNeed = bardPending?.need || 0;
  // เติมโน้ตไม่ได้เมื่อ: มีบทเพลงรอเลือกเป้าหมาย / เติมโน้ตครบลิมิตของเทิร์นนี้แล้ว
  //  (patch 2.0.8 — ระหว่างมิติมายาบรรเลงทั้งสองแบบ ไม่ติดลิมิต 2 แต่กดได้สูงสุด 6 ครั้งต่อเทิร์น)
  const bardDimOn = isBard && ((me?.statuses?.soulDim || 0) > 0 || (me?.statuses?.bloodDim || 0) > 0);
  const bardNoteLocked = isBard && (!!me?.bardPending || (me?.bardNotesUsed || 0) >= (bardDimOn ? 6 : 2));
  // ---------- ไค ชิซากิ ----------
  const isKai = ch?.id === "kai";
  const kaiOverhaulReady = isKai && (me?.kaiOverhaulSlots?.length || 0) >= 2;
  const kaiRivalId = isKai && ((me?.statuses?.kaiRival1 || 0) > 0 || (me?.statuses?.kaiRival2 || 0) > 0) ? me?.kaiRivalId : null;
  // ---------- ทาคุมิ ฟุจิวาระ ----------
  const isTakumi = ch?.id === "takumi";
  // คู่แฝดฮิซากาว่า: สกิลพื้นฐาน 1 คือ "ทางหนี" — สตั้น/หลับ/ห้ามใช้สกิล/MOON*CELL และโควตาสกิลของเทิร์น
  //  ปิดปุ่มนี้ไม่ได้ (ฝั่งเซิร์ฟเวอร์เปิดทางไว้ตรงกันใน useSkill)
  const isHisakawa = ch?.id === "hisakawa_sister";
  // สลับตัวได้เทิร์นละ 1 ครั้ง — กดไปแล้วปุ่มต้องเป็น disable ให้เห็นชัดว่าเปลี่ยนกลับไม่ได้
  //  (ตอนมีแฝดล้ม ช่องนี้กลายเป็นสกิลชุบซึ่งไม่ติดลิมิตนี้ จึงเช็คว่าแฝดยังครบทั้งคู่ด้วย)
  const hisakawaSwitchLocked = !!(isHisakawa && me?.hisakawa?.switchedThisRound &&
    (me.hisakawa.twins || []).every((t) => t.alive));
  const isTrigger = ch?.id === "ultraman_trigger";
  const triggerCircleLocked = isTrigger && !(me?.statuses?.triggerCircle > 0);
  const triggerMultiLocked = isTrigger && (me?.statuses?.triggerMulti > 0);
  const triggerZeperionLocked = isTrigger && (me?.statuses?.triggerZeperion > 0);
  const witchMarkCd = ch?.id === "mageslayer" ? (me?.mageslayerWitchMarkCooldown || 0) : 0;
  const witchMarkCooldown = witchMarkCd > 0;
  // Mana Burden (ผู้สังหารเมจ): คูลดาวน์ 7 เทิร์น
  const burdenCd = ch?.id === "mageslayer" ? (me?.mageslayerBurdenCooldown || 0) : 0;
  const burdenCooldown = burdenCd > 0;
  const takumiBudgetLocked = isTakumi && (me?.takumiSkillUsesRound || 0) >= 5; // งบสกิลรวม 5 ครั้ง/เทิร์น (พื้นฐาน/รอง/ท่าไม้ตาย ผสมกันได้อิสระ)
  // ---------- ชเรด เอลัน ----------
  const isShrade = ch?.id === "shrade_elan";
  // แด่เพื่อนรักของฉัน: ระหว่างชาร์จจั่วการ์ด/ใช้สกิลอื่นไม่ได้ (แต่ชนะจั่วยังโจมตีได้)
  const shCharging = !!(me && me.statuses?.shradecharge);
  // ---------- ริดดี้ มาร์เซนาส ----------
  // ฉันจะไม่ยอมสูญเสียใครไปอีก: ระหว่างทำงาน จั่วการ์ด/ใช้สกิลไม่ได้ (แม้ชนะจั่วก็โจมตีไม่ได้)
  const rgCharging = !!(me && me.statuses?.riddheguard);
  // ---------- ริต้า เบอร์นัล ----------
  // ไม่อยากให้ใครต้องเจ็บปวด: ระหว่างล่อเป้า จั่วการ์ด/ใช้สกิลไม่ได้ (แต่ชนะจั่วยังโจมตีได้)
  const phenexTaunting = !!(me && me.statuses?.phenexTaunt);
  // รวมร่างทำนองเพลง: ใช้ได้เฉพาะกลางคืน + ท่วงทำนองครบ 5 (หลังรวมร่างปุ่มเปลี่ยนเป็น แด่เพื่อนรักของฉัน)
  const shUltLocked = isShrade && !me?.shradeForm && (!nightNow || (me?.statuses?.melody || 0) < 5);
  // ---------- เรียวกิ ชิกิ ----------
  // นายมีฝีมือแค่ไหนหรอ?: ผลยกเลิกท่าไม้ตายยังอยู่ — กดสกิลรองซ้ำไม่ได้ (patch 2.0.6.1)
  const skSecLocked = ch?.id === "shiki" && !!me?.statuses?.godslay;
  // ---------- แบทแมน (patch 2.2.7) ----------
  // เร้นเงา: ยังซ่อนอยู่ กดซ้ำ (ต่ออายุหนีกับดัก) ไม่ได้ / นายลืมของน่ะ: ยังตั้งรับอยู่ หรือยังไม่ได้เลือกส่งต่อ
  const batStealthLocked = ch?.id === "bat_ben" && (me?.statuses?.batStealth || 0) > 0;
  const batKarmaLocked = ch?.id === "bat_ben" && ((me?.statuses?.batKarma || 0) > 0 || !!state.batKarmaAsk);
  // ---------- เจ้าหญิงราก (patch 2.2.7) ----------
  // อืม ฉันเข้าใจแล้ว (พื้นฐาน): ชักดาบยังค้างอยู่ กดซ้ำไม่ได้ / อย่าทำอะไรไม่เข้าท่าเลย (รอง): ผลยกเลิกท่าไม้ตายยังอยู่ กดซ้ำไม่ได้
  const psSealLocked = ch?.id === "princess_shiki" && !!me?.statuses?.godslay;
  const psBladeLocked = ch?.id === "princess_shiki" && (me?.statuses?.pshikiBlade || 0) > 0;
  // ---------- เทเปา (ชิกิ) ----------
  // วันนี้อากาศดีจัง: ระหว่างทำอาหารอยู่ กดซ้ำไม่ได้ / เป็นแบบนี้นี่เอง: ครุ่นคิดยังไม่หมด กดซ้ำไม่ได้
  const tepeuCookLocked = ch?.id === "tepeu" && (me?.tepeuCookTurns || 0) > 0;
  const tepeuPonderLocked = ch?.id === "tepeu" && (me?.tepeuPonderTurns || 0) > 0;
  // ANATA WAAAAAAAA: เลือกเป้าหมายได้เพียง 1 คน
  const aliveOthers = others.filter((p) => p.alive);
  const anataNeed = Math.min(1, aliveOthers.length);

  // สกิลช่วงจั่วการ์ด: server แจ้งมา -> เด้งทันที (ไม่ตัดเข้าจอดำ) แล้วหายเอง
  //  บั๊กเดิม: ป้ายนี้มีช่องเดียวใช้ร่วมกันทั้งเกม ถ้ามีสกิลใหม่ (ของใครก็ได้ เช่น Bard กดโน้ตรัวๆ) เด้งเข้ามาถี่กว่า 1.8 วิ
  //  ตัวจับเวลาจะรีเซ็ตใหม่ทุกครั้งไม่มีที่สิ้นสุด ทำให้ป้ายค้างอยู่นานผิดปกติทั้งที่สกิลแต่ละอันจบไปนานแล้ว
  //  แก้โดยจับเวลาเริ่มของ "ชุดป้ายที่ต่อเนื่องกัน" (flashStartRef) ไว้ครั้งเดียวตอนป้ายว่างแล้วเพิ่งมีอันใหม่ขึ้น
  //  แล้วบังคับหายภายใน FLASH_MAX_MS จากจุดนั้นเสมอ ไม่ว่าจะมีสกิลใหม่มาต่อคิวรีเฟรชเนื้อหากี่รอบก็ตาม
  const FLASH_MAX_MS = 1800;
  const flashRef = useRef(null);
  const flashStartRef = useRef(0);
  useEffect(() => { flashRef.current = flash; }, [flash]);
  const noticeRef = useRef(null);
  const noticeStartRef = useRef(0);
  useEffect(() => { noticeRef.current = notice; }, [notice]);
  // ไค ชิซากิ: สุ่มเสียงพูดทุกครั้งที่ใช้สกิล (พื้นฐาน/รอง/Overhaul ล้วนเด้ง skillFlash) — ตามแพทเทิร์นเสียงสุ่มของนานายะ
  const playersRef = useRef(state.players);
  useEffect(() => { playersRef.current = state.players; }, [state.players]);
  useEffect(() => {
    const onFlash = (f) => {
      if (!flashRef.current) flashStartRef.current = Date.now();
      setFlash({ ...f, id: Date.now() });
      // DoomGuy: เสียงใช้สกิล Weapon แยกตามอาวุธที่ถืออยู่ตอนกด
      if (f.doomWeapon) {
        const skillSound = DOOM_WEAPON_SOUNDS[f.doomWeapon]?.skill;
        if (skillSound) playSfx(skillSound);
      } else if (f.sound) {
        playSfx(f.sound);
      }
      const caster = (playersRef.current || []).find((pl) => pl.name === f.by);
      if (caster?.character?.id === "kai") playSfx(`kaiVoice${1 + Math.floor(Math.random() * 5)}`);
    };
    socket.on("skillFlash", onFlash);
    return () => socket.off("skillFlash", onFlash);
  }, []);
  useEffect(() => {
    if (!flash) return;
    const remain = Math.max(150, FLASH_MAX_MS - (Date.now() - flashStartRef.current));
    const t = setTimeout(() => setFlash(null), remain);
    return () => clearTimeout(t);
  }, [flash]);
  useEffect(() => {
    const onNotice = (n) => {
      if (!noticeRef.current) noticeStartRef.current = Date.now();
      setNotice({ ...n, id: Date.now() });
    };
    socket.on("transformNotice", onNotice);
    return () => socket.off("transformNotice", onNotice);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const remain = Math.max(150, FLASH_MAX_MS - (Date.now() - noticeStartRef.current));
    const t = setTimeout(() => setNotice(null), remain);
    return () => clearTimeout(t);
  }, [notice]);

  const skill = (tier) => {
    clickSound();
    // ท่าไม้ตายเทมาริ: เข้าโหมดเลือกเป้าหมาย 2 คนก่อน (ยังไม่ส่งไป server)
    if (tier === "ultimate" && ch?.id === "temari") { setAnataSel([]); setSkillOpen(false); return; }
    // สกิลรองโอเบรอนกลางวัน (รุ่งอรุณแห่งวันใหม่): เข้าโหมดเลือกเป้าหมาย 1 คนก่อนส่งไป server (เลือกตัวเองได้)
    //  กลางคืน (ฝันร้ายยามค่ำคืน) เป็น self-buff ไม่ต้องเลือกเป้าหมายแล้ว — ตกไปที่ path ปกติด้านล่าง
    if (tier === "secondary" && ch?.id === "oberon" && !nightNow) {
      setDawnSel(true);
      setSkillOpen(false);
      return;
    }
    // Apple guy: สกิลพื้นฐานเปิดเมนูเลือกของส่งมอบ / สกิลรองเข้าโหมดเลือกเป้าหมายมอบของ
    if (tier === "basic" && ch?.id === "appleguy") { setAppleOpen(true); setSkillOpen(false); return; }
    if (tier === "secondary" && ch?.id === "appleguy") { setAppleSel(true); setSkillOpen(false); return; }
    // โทโนะ ชิกิ: สกิลพื้นฐานเปิดเมนูเลือกระดับมีดพับประจำตระกูล (1-5)
    if (tier === "basic" && ch?.id === "tohno") { setTohnoOpen(true); setSkillOpen(false); return; }
    // นานายะ ชิกิ: สกิลพื้นฐาน (อันนี้ของนายรึเปล่า) เข้าโหมดเลือกเป้าหมายก่อนส่งไป server
    if (tier === "basic" && ch?.id === "nanaya") { setNanayaSel(true); setSkillOpen(false); return; }
    // อาจารย์ ไบเลธ: สกิลรองเปิดหน้าต่างเลือกแบบ (ฟาดทันที/เสริมดาบ) · ท่าไม้ตายเปิดหน้าต่างเลือกหลักสูตร
    // คอนเนอร์ RK800: สกิลรอง/ท่าไม้ตายเข้าโหมดเลือกเป้าหมายก่อนส่งไป server
    if ((tier === "secondary" || tier === "ultimate") && ch?.id === "conner") { setConnorSel(tier); setSkillOpen(false); return; }
    // โมโรโบชิ ดัน: สกิลรอง (นายทำให้ฉันผิดหวัง) และท่าไม้ตาย 1 (ฉันบอกว่าอย่าหนี) ต้องเลือกเป้าหมายก่อน
    //  ท่าไม้ตาย 2 (อย่าให้ฉันต้องเฆี่ยนตี) เล็งเป้าเดิมอัตโนมัติ — ส่งไป server ตรงๆ ไม่ต้องจิ้มใคร
    //  (ดูจากธง me.danWhip ที่ server คิดมาให้ ไม่ใช่เดาจากชื่อ/ราคาสกิลบนปุ่ม)
    if ((tier === "secondary" || tier === "ultimate") && ch?.id === "dan") {
      if (tier === "ultimate" && me?.danWhip) { socket.emit("useSkill", { tier }); setSkillOpen(false); return; }
      setDanSel(tier); setSkillOpen(false); return;
    }
    if (tier === "secondary" && ch?.id === "byleth") { setBylethSwordOpen(true); setSkillOpen(false); return; }
    if (tier === "ultimate" && ch?.id === "byleth") { setBylethCourseOpen(true); setSkillOpen(false); return; }
    // เจ้าแห่งเน็ตบ้าน: ท่าไม้ตายเข้าโหมดเลือกเป้าหมายยื่นข้อเสนอสัญญา
    if (tier === "ultimate" && ch?.id === "broadband_man") { setBbSel(true); setSkillOpen(false); return; }
    // ชเรด เอลัน: สกิลรอง (แสงจันทร์ส่องวิญญาณ) เข้าโหมดเลือกเป้าหมายก่อนส่งไป server
    //  (Dance Lession โคโตเนะ ใช้ใส่ตัวเองเท่านั้นแล้ว — ไม่ต้องเลือกเป้าหมาย)
    if (tier === "secondary" && ch?.id === "shrade_elan") { setShSel(true); setSkillOpen(false); return; }
    // เรียวกิ ชิกิ: สกิลรอง (นายมีฝีมือแค่ไหนหรอ?) เข้าโหมดเลือกเป้าหมายก่อนส่งไป server
    if (tier === "secondary" && ch?.id === "shiki") { setSkSel(true); setSkillOpen(false); return; }
    // เจ้าหญิงราก: สกิลรอง (อย่าทำอะไรไม่เข้าท่าเลย) เข้าโหมดเลือกเป้าหมายก่อนส่งไป server
    if (tier === "secondary" && ch?.id === "princess_shiki") { setPsSealSel(true); setSkillOpen(false); return; }
    // DoomGuy: สกิลรอง Weapon — บางอาวุธต้องเลือกเป้าหมายก่อนส่งไป server (Combat Shotgun / Heavy Cannon / Super Shotgun / Rocket Launcher)
    if (tier === "secondary" && ch?.id === "doomguy") {
      if (DOOM_TARGET_WEAPONS.includes(me?.doomWeapon)) { setDoomSel(true); setSkillOpen(false); return; }
      socket.emit("useSkill", { tier }); setSkillOpen(false); return;
    }
    // บานาจ ลิงก์ (patch 2.1.2): สกิลพื้นฐาน Absorb shield เข้าโหมดเลือกเป้าหมาย (เลือกตัวเองได้)
    if (tier === "basic" && ch?.id === "banagher") { setBgSel(true); setSkillOpen(false); return; }
    // ซาโตรุ อาเคฟุ: สกิลพื้นฐาน/สกิลรอง เข้าโหมดเลือกเป้าหมาย — ท่าไม้ตายทำงานอัตโนมัติ กดเองไม่ได้
    if (tier === "basic" && ch?.id === "satoru") { setSaObSel(true); setSkillOpen(false); return; }
    if (tier === "basic" && ch?.id === "escanor" && !(me?.statuses?.escanorNight > 0) && !(me?.statuses?.escanorLastStand > 0)) { setEscanorSel(true); setSkillOpen(false); return; }
    if (tier === "basic" && ch?.id === "ignis") { setIgnisSel(true); setSkillOpen(false); return; }
    if (tier === "ultimate" && ch?.id === "ignis") { setIgnisImpactSel(true); setSkillOpen(false); return; }
    if (tier === "secondary" && ch?.id === "satoru") { socket.emit("useSkill", { tier: "secondary", targets: [me.id] }); setSkillOpen(false); return; }
    if (tier === "ultimate" && ch?.id === "satoru") { setSkillOpen(false); return; }
    // เทเปา: ท่าไม้ตาย นายเป็นคนทำตัวเองนะ เข้าโหมดเลือกเป้าหมายก่อนส่งไป server
    if (tier === "ultimate" && ch?.id === "tepeu") { setTpSel(true); setSkillOpen(false); return; }
    // ไค ชิซากิ: สกิลพื้นฐาน/รอง เข้าโหมดเลือกเป้าหมายก่อนส่งไป server (เลือกตัวเองได้ทั้งคู่)
    if (tier === "basic" && ch?.id === "kai") { setKaiCreateSel(true); setSkillOpen(false); return; }
    if (tier === "secondary" && ch?.id === "kai") { setKaiPunishSel(true); setSkillOpen(false); return; }
    // ผู้สังหารเมจ: สกิลพื้นฐาน/รอง เข้าโหมดเลือกเป้าหมายก่อนส่งไป server (เลือกตัวเองไม่ได้)
    if (tier === "basic" && ch?.id === "mageslayer") { setMsMarkSel(true); setSkillOpen(false); return; }
    if (tier === "ultimate" && ch?.id === "mageslayer") { setMsRuptureSel(true); setSkillOpen(false); return; }
    socket.emit("useSkill", { tier });
    setSkillOpen(false);
  };
  // ป๊อปอัปยืนยันก่อนใช้สกิล (patch UX): กดช่องสกิล -> ถามยืนยันก่อนเสมอ ค่อยเรียก skill(tier) จริงตอนกด "ใช้งาน"
  //  เก็บข้อมูลสกิล/ลำดับ/แต้มที่ใช้จริง (หลังหักส่วนลด) ไว้โชว์ในป๊อปอัป — ยกเลิกแล้วไม่มีอะไรเกิดขึ้น
  const [skillConfirm, setSkillConfirm] = useState(null); // { tier, skillData, label, useCost }
  //  ถ้าผู้เล่นปิด "ยืนยันสกิล" จากหน้าโต๊ะรวมผู้เล่น -> ข้ามป๊อปอัป ใช้สกิลทันทีที่กดช่อง
  const requestSkillUse = (tier, skillData, label, useCost) => {
    if (!skillConfirmOn) { skill(tier); return; }
    setSkillConfirm({ tier, skillData, label, useCost });
  };
  const cancelSkillConfirm = () => { clickSound(); setSkillConfirm(null); };
  const confirmSkillUse = () => {
    if (!skillConfirm) return;
    const t = skillConfirm.tier;
    setSkillConfirm(null);
    skill(t);
  };
  // เลือกเป้าหมาย Do Do Do, De Da Da Da (ซาโตรุ) -> ส่งไป server ทันที
  const pickSaOb = (id) => {
    socket.emit("useSkill", { tier: "basic", targets: [id] });
    setSaObSel(false);
  };
  const pickEscanor = (id) => {
    socket.emit("useSkill", { tier: "basic", targets: [id] });
    setEscanorSel(false);
  };
  const pickIgnis = (id) => {
    socket.emit("useSkill", { tier: "basic", targets: [id] });
    setIgnisSel(false);
  };
  const pickIgnisImpact = (id) => {
    socket.emit("useSkill", { tier: "ultimate", targets: [id] });
    setIgnisImpactSel(false);
  };
  // เลือกเป้าหมายแสงจันทร์ส่องวิญญาณ (ชเรด เอลัน) -> ส่งไป server ทันที
  const pickSh = (id) => {
    socket.emit("useSkill", { tier: "secondary", targets: [id] });
    setShSel(false);
  };
  // เลือกเป้าหมาย นายมีฝีมือแค่ไหนหรอ? (ชิกิ) -> ส่งไป server ทันที
  const pickSk = (id) => {
    socket.emit("useSkill", { tier: "secondary", targets: [id] });
    setSkSel(false);
  };
  // เลือกเป้าหมาย อย่าทำอะไรไม่เข้าท่าเลย (เจ้าหญิงราก) -> ส่งไป server ทันที
  const pickPsSeal = (id) => {
    socket.emit("useSkill", { tier: "secondary", targets: [id] });
    setPsSealSel(false);
  };
  // เลือกเป้าหมาย นายเป็นคนทำตัวเองนะ (เทเปา) -> ส่งไป server ทันที
  const pickTp = (id) => {
    socket.emit("useSkill", { tier: "ultimate", targets: [id] });
    setTpSel(false);
  };
  // ปืนหน่วย GUTS Select: เลือกกระสุนจากกระเป๋าแล้วปิดกระเป๋า เข้าโหมดจิ้มเป้าหมายบนกระดาน -> จิ้มแล้วยิงทันที
  const startGunPick = (ammoItem) => {
    setBagOpen(false);
    if (ammoItem?.ammo === "hyper_trigger" || ammoItem?.ammo === "trigger_dark_key") {
      socket.emit("useInventoryItem", { uid: ammoItem.uid });
      return;
    }
    setGunSel(ammoItem);
  };
  const pickGunTarget = (id) => {
    socket.emit("useInventoryItem", { uid: gunSel.uid, targetId: id });
    setGunSel(null);
  };
  // เลือกเป้าหมายมือซ้ายแห่งการรังสรรค์/มือขวาแห่งการลงทัณฑ์ (ไค ชิซากิ) -> ส่งไป server ทันที
  const pickKaiCreate = (id) => {
    socket.emit("useSkill", { tier: "basic", targets: [id] });
    setKaiCreateSel(false);
  };
  const pickKaiPunish = (id) => {
    socket.emit("useSkill", { tier: "secondary", targets: [id] });
    setKaiPunishSel(false);
  };
  // อาจารย์ ไบเลธ: เลือกแบบของดาบต้องสาป / เลือกหลักสูตร / เลือกเป้าหมายฟาดดาบ -> ส่งไป server
  const pickBylethSword = (mode) => {
    setBylethSwordOpen(false);
    if (mode === "strike") { setBylethStrikeSel(true); return; } // แบบที่ 1 ต้องเลือกเป้าหมายก่อน
    socket.emit("useSkill", { tier: "secondary", item: "buff" });
  };
  // เลือกเป้าหมาย ข่มขวัญ/จับกุม หรือ จัดการปิดคดี (คอนเนอร์) -> ส่งไป server ทันที
  const pickConnor = (id) => {
    socket.emit("useSkill", { tier: connorSel, targets: [id] });
    setConnorSel(null);
  };
  // เลือกเป้าหมาย นายทำให้ฉันผิดหวัง / ฉันบอกว่าอย่าหนี (โมโรโบชิ ดัน) -> ส่งไป server ทันที
  const pickDan = (id) => {
    socket.emit("useSkill", { tier: danSel, targets: [id] });
    setDanSel(null);
  };
  const pickBylethStrike = (id) => {
    socket.emit("useSkill", { tier: "secondary", item: "strike", targets: [id] });
    setBylethStrikeSel(false);
  };
  const pickBylethCourse = (course) => {
    socket.emit("useSkill", { tier: "ultimate", item: course });
    setBylethCourseOpen(false);
  };
  // เลือกเป้าหมาย Witch Mark / Mana Rupture (ผู้สังหารเมจ) -> ส่งไป server ทันที
  const pickMsMark = (id) => {
    socket.emit("useSkill", { tier: "basic", targets: [id] });
    setMsMarkSel(false);
  };
  const pickMsRupture = (id) => {
    socket.emit("useSkill", { tier: "ultimate", targets: [id] });
    // เสียง SFX_Skill_2.mp3 ไม่ได้ดังตอนกด — server ส่ง skillFlash พร้อม sound ตอนสถานะหมดเวลาแล้วระเบิดจริง
    setMsRuptureSel(false);
  };
  // เลือกเป้าหมาย Weapon ของ DoomGuy -> ส่งไป server ทันที
  const pickDoom = (id) => {
    socket.emit("useSkill", { tier: "secondary", targets: [id] });
    setDoomSel(false);
  };
  // เลือกเป้าหมายบทเพลง (Bard) — ครบจำนวนที่บทเพลงต้องการแล้วส่งไป server ทันที
  const pickBard = (id) => {
    if (!bardPending) return;
    const next = bardSel.includes(id) ? bardSel.filter((x) => x !== id) : [...bardSel, id];
    if (next.length >= bardNeed) {
      socket.emit("bardTarget", { targets: next });
      setBardSel([]);
    } else setBardSel(next);
  };
  // บทเพลงถูกยืนยัน/หมดเวลาแล้ว -> ล้างเป้าหมายที่เลือกค้าง
  useEffect(() => {
    if (!bardPending) setBardSel([]);
  }, [bardPending]);
  // เสียงประกอบ Bard: เติมโน้ตตามช่องที่ 1-3 / บรรเลงทำนอง (Crimson=1, Jade=2, Encore=3)
  useEffect(() => {
    const onBardSfx = (e) => {
      if (!e) return;
      if (e.kind === "note") playSfx(`bard_note${Math.min(3, Math.max(1, e.idx || 1))}`);
      else if (e.kind === "perform") playSfx(`bard_melody${Math.min(3, Math.max(1, e.sound || 1))}`);
    };
    socket.on("bardSfx", onBardSfx);
    return () => socket.off("bardSfx", onBardSfx);
  }, []);
  // เลือกเป้าหมายยื่นข้อเสนอสัญญา (สนใจใช้บริการเราไหม) -> ส่งไป server ทันที
  const pickBb = (id) => {
    socket.emit("useSkill", { tier: "ultimate", targets: [id] });
    setBbSel(false);
  };
  // เลือกของส่งมอบ (เอาแบบนี้ได้ไหม) -> ส่งไป server ทันที
  const pickAppleItem = (key) => {
    socket.emit("useSkill", { tier: "basic", item: key });
    setAppleOpen(false);
  };
  // เลือกระดับมีดพับประจำตระกูล (โทโนะ ชิกิ) -> ส่งไป server ทันที (ไม่ปิดเมนู — กดเปลี่ยนต่อได้เรื่อยๆ)
  const pickTohnoLevel = (level) => {
    socket.emit("useSkill", { tier: "basic", item: level });
  };
  // เลือกเป้าหมายมอบของ (เอาไปสิ) -> ส่งไป server ทันที
  const pickGive = (id) => {
    socket.emit("useSkill", { tier: "secondary", targets: [id] });
    setAppleSel(false);
  };
  // เลือกเป้าหมายรุ่งอรุณแห่งวันใหม่ -> ส่งไป server ทันที
  const pickDawn = (id) => {
    socket.emit("useSkill", { tier: "secondary", targets: [id] });
    setDawnSel(false);
  };
  // เลือกเป้าหมาย Absorb shield (บานาจ ลิงก์) -> ส่งไป server ทันที
  const pickBg = (id) => {
    socket.emit("useSkill", { tier: "basic", targets: [id] });
    setBgSel(false);
  };
  // เลือกเป้าหมาย อันนี้ของนายรึเปล่า (นานายะ ชิกิ) -> ส่งไป server ทันที
  const pickNanaya = (id) => {
    socket.emit("useSkill", { tier: "basic", targets: [id] });
    setNanayaSel(false);
  };
  // นานายะ ชิกิ: เปิด/ปิด Mystic eye of death perception (ปุ่มแยกต่างหาก ไม่ใช่ช่องสกิล)
  const nanayaToggleEye = () => { clickSound(); socket.emit("nanayaToggleEye"); };
  // นานายะ ชิกิ: ยกเลิกโจมตีซ้ำของหัวใจฆาตกร
  const nanayaCancelReattack = () => { clickSound(); socket.emit("nanayaCancelReattack"); };
  // เลือก/ยกเลิกเป้าหมาย ANATA — ครบจำนวนแล้วส่งไป server ทันที
  const pickAnata = (id) => {
    if (!anataSel) return;
    const next = anataSel.includes(id) ? anataSel.filter((x) => x !== id) : [...anataSel, id];
    if (next.length >= anataNeed) {
      socket.emit("useSkill", { tier: "ultimate", targets: next });
      setAnataSel(null);
    } else setAnataSel(next);
  };
  // ออกจากโหมดเลือกเป้าเมื่อพ้นช่วงจั่วการ์ด / ใช้สกิลไปแล้ว (server ยืนยัน)
  useEffect(() => {
    if (anataSel && (phase !== "PLAYING" || me?.skillUsed || done)) setAnataSel(null);
  }, [anataSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (dawnSel && (phase !== "PLAYING" || me?.skillUsed || done)) setDawnSel(false);
  }, [dawnSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (bgSel && (phase !== "PLAYING" || me?.skillUsed || done)) setBgSel(false);
  }, [bgSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (appleSel && (phase !== "PLAYING" || me?.skillUsed || done)) setAppleSel(false);
  }, [appleSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (bbSel && (phase !== "PLAYING" || me?.skillUsed || done)) setBbSel(false);
  }, [bbSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (shSel && (phase !== "PLAYING" || me?.skillUsed || done)) setShSel(false);
  }, [shSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (skSel && (phase !== "PLAYING" || me?.skillUsed || done)) setSkSel(false);
  }, [skSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (psSealSel && (phase !== "PLAYING" || me?.skillUsed || done)) setPsSealSel(false);
  }, [psSealSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (doomSel && (phase !== "PLAYING" || me?.skillUsed || done)) setDoomSel(false);
  }, [doomSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (saObSel && (phase !== "PLAYING" || me?.skillUsed || done)) setSaObSel(false);
  }, [saObSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (ignisSel && (phase !== "PLAYING" || me?.skillUsed || done)) setIgnisSel(false);
  }, [ignisSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (ignisImpactSel && (phase !== "PLAYING" || me?.skillUsed || done)) setIgnisImpactSel(false);
  }, [ignisImpactSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (escanorSel && (phase !== "PLAYING" || me?.skillUsed || done)) setEscanorSel(false);
  }, [escanorSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (nanayaSel && (phase !== "PLAYING" || me?.skillUsed || done)) setNanayaSel(false);
  }, [nanayaSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (tpSel && (phase !== "PLAYING" || me?.skillUsed || done)) setTpSel(false);
  }, [tpSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (kaiCreateSel && (phase !== "PLAYING" || me?.skillUsed || done)) setKaiCreateSel(false);
  }, [kaiCreateSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (kaiPunishSel && (phase !== "PLAYING" || me?.skillUsed || done)) setKaiPunishSel(false);
  }, [kaiPunishSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (msMarkSel && (phase !== "PLAYING" || me?.skillUsed || done)) setMsMarkSel(false);
  }, [msMarkSel, phase, me?.skillUsed, done]);
  // ไบเลธ: ปิดหน้าต่าง/โหมดเลือกเป้าหมายเองเมื่อออกจากเฟสจั่วการ์ด (สกิลของไบเลธไม่ผูกกับ me.skillUsed)
  useEffect(() => {
    if (phase === "PLAYING" && !done) return;
    setBylethSwordOpen(false); setBylethCourseOpen(false); setBylethStrikeSel(false);
  }, [phase, done]);
  // หลักสูตรถูกปิด/หมดอายุระหว่างเปิดหน้าต่างอ่านอยู่ -> ปิดหน้าต่างให้เอง
  useEffect(() => {
    if (!state.bylethFieldFx) setBylethInfoOpen(false);
  }, [state.bylethFieldFx]);
  // ไอคอนไอเทม: ดึงมาแคชไว้ตั้งแต่เข้าเกม กันโหลดช้าตอนเปิดร้าน/กระเป๋าครั้งแรก
  useEffect(() => { for (const src of ITEM_PRELOAD_IMGS) { const im = new Image(); im.src = src; } }, []);
  // ปืน GUTS Select: หลุดโหมดเลือกเป้าหมายเมื่อออกจากช่วงจั่วไพ่/เปิดไพ่แล้ว หรือกระสุนนัดนั้นถูกใช้ไปแล้ว
  useEffect(() => {
    if (gunSel && (phase !== "PLAYING" || done || !(me?.inventory || []).some((it) => it.uid === gunSel.uid))) setGunSel(null);
  }, [gunSel, phase, done, me?.inventory]);
  useEffect(() => {
    if (msRuptureSel && (phase !== "PLAYING" || me?.skillUsed || done)) setMsRuptureSel(false);
  }, [msRuptureSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (connorSel && (phase !== "PLAYING" || done)) setConnorSel(null);
  }, [connorSel, phase, done]);
  useEffect(() => {
    if (danSel && (phase !== "PLAYING" || me?.skillUsed || done)) setDanSel(null);
  }, [danSel, phase, me?.skillUsed, done]);
  useEffect(() => {
    if (appleOpen && (phase !== "PLAYING" || done)) setAppleOpen(false);
  }, [appleOpen, phase, done]);
  useEffect(() => {
    if (tohnoOpen && (phase !== "PLAYING" || done)) setTohnoOpen(false);
  }, [tohnoOpen, phase, done]);
  // แบนเนอร์สลับกลางวัน/กลางคืน: เด้งเมื่อ cycle เปลี่ยนระหว่างแมตช์ แล้วหายเอง
  useEffect(() => {
    if (prevCycle.current && state.cycle && prevCycle.current !== state.cycle) {
      setCycleFx({ cycle: state.cycle, id: Date.now() });
    }
    prevCycle.current = state.cycle;
  }, [state.cycle]);
  // ราตรีกลืนกิน: เด้งแบนเนอร์เมื่อโอเบรอนใช้ท่าไม้ตาย 2 (ฉากหลังเปลี่ยน) แล้วหายเอง
  const prevDevour = useRef(false);
  useEffect(() => {
    if (!prevDevour.current && state.oberonBg) setCycleFx({ cycle: "night", oberon: true, id: Date.now() });
    prevDevour.current = !!state.oberonBg;
  }, [state.oberonBg]);
  useEffect(() => {
    if (!cycleFx) return;
    // ระหว่าง CUTSCENE แบนเนอร์ยังไม่ถูกแสดง (จอวีดีโอเต็มจอ) — รอวีดีโอจบก่อนค่อยเริ่มนับถอยหลัง
    if (phase === "CUTSCENE") return;
    const t = setTimeout(() => setCycleFx(null), 3500);
    return () => clearTimeout(t);
  }, [cycleFx, phase]);
  useEffect(() => {
    if (hakunoCmdOpen && !hakunoCmdUsable) setHakunoCmdOpen(false);
  }, [hakunoCmdOpen, hakunoCmdUsable]);

  // เฟส CUTSCENE: วีดีโอ/แบนเนอร์แปลงร่าง (key=id -> remount กันจอดำ)
  //  ยกเว้นฉากประกาศเปลี่ยนร่าง (announce) -> แสดงกระดานเกมตามปกติ + เอฟเฟกต์ทับ (ไม่ตัดจอดำ)
  //  โหมดประหยัด (patch 2.0.6): ข้ามวีดีโอ — แสดงกระดาน + แจ้งเตือนว่าใครเปิดท่าไม้ตาย รอเวลาเท่าวีดีโอจริง
  const csYuna = phase === "CUTSCENE" && state.cutscene && state.cutscene.kind === "yuna" ? state.cutscene : null;
  const csOverload = phase === "CUTSCENE" && state.cutscene && state.cutscene.kind === "overloadForce" ? state.cutscene : null;
  const csYuuki = phase === "CUTSCENE" && state.cutscene?.kind?.startsWith("yuuki") ? state.cutscene : null;
  const csAnnounce = phase === "CUTSCENE" && state.cutscene && state.cutscene.announce ? state.cutscene : null;
  const csSkipped = lowQ && phase === "CUTSCENE" && state.cutscene && !csAnnounce && !csYuna && !csOverload && !csYuuki ? state.cutscene : null;
  if (csOverload) return <OverloadForceCutscene key={state.cutscene.id} cs={state.cutscene} />;
  if (csYuuki) return <Cutscene key={state.cutscene.id} cs={state.cutscene} />;
  if (phase === "CUTSCENE" && state.cutscene && csYuna && !lowQ) return <YunaCutscene key={state.cutscene.id} cs={state.cutscene} />;
  if (phase === "CUTSCENE" && state.cutscene && !csAnnounce && !csYuna && !lowQ) return <Cutscene key={state.cutscene.id} cs={state.cutscene} />;

  // สถานะ+handler ของทุกโหมดเลือกเป้าหมาย มัดรวมไว้ที่เดียว ใช้ร่วมกันทั้ง layout มือถือและจอใหญ่ (ดู isTargetable/resolveAttackPick)
  const targetChain = {
    anataSel, dawnSel, appleSel, bbSel, shSel, skSel, doomSel, saObSel, escanorSel, ignisSel, ignisImpactSel, bgSel, bardPending, nanayaSel, tpSel,
    kaiCreateSel, kaiPunishSel, msMarkSel, msRuptureSel, psSealSel, pickPsSeal, gunSel, pickGunTarget,
    bylethStrikeSel, pickBylethStrike,
    connorSel, pickConnor,
    danSel, pickDan,
    pickAnata, pickDawn, pickGive, pickBb, pickSh, pickSk, pickDoom, pickSaOb, pickEscanor, pickIgnis, pickIgnisImpact, pickBg, pickBard, pickNanaya, pickTp,
    pickKaiCreate, pickKaiPunish, pickMsMark, pickMsRupture,
    kaiRivalId,
    myId: me?.id,
    myTeamId: me?.teamId,
    teamModeActive: state.gameMode === "duo" || state.gameMode === "trio",
  };

  // ============================================================
  //  โหมดมือถือแนวตั้ง (< 768px): layout เฉพาะโทรศัพท์ ไม่ย่อจากจอคอม
  //  บน = การ์ดคู่ต่อสู้ (แตะเพื่อโจมตี) | ล่าง = แผงเรา + ปุ่มใหญ่เต็มนิ้ว
  // ============================================================
  if (vp.w < 768) {
    const revealed = phase === "SUMMARY" || phase === "ATTACK" || phase === "ATTACKING";
    return (
      <div className="fixed inset-0 overflow-hidden flex flex-col">
        <GameBackground cycle={state.cycle} oberonBg={state.oberonBg} shradeBg={state.shradeBg} bardBg={state.bardBg} shikiBg={state.shikiBg} hakunoBg={state.hakunoBg} hisakawaBg={state.hisakawaBg} overloadForce={state.overloadForce} lowQ={lowQ} />
        {/* แถบบน: รอบ + เวลา (เว้นขวาให้ปุ่มเสียง) */}
        <div className="shrink-0 flex flex-col items-center gap-1 pt-2 px-14 min-h-[40px]">
          {(phase === "PLAYING" || phase === "ATTACK") && (
            <div className="p-chip text-base font-bold text-white bg-black/55 px-5 py-1 border-b-2" style={{ borderColor: "var(--color-p-accent-bright)" }}>
              <span>{state.oberonBg ? "🌑" : nightNow ? "🌙" : "☀️"} รอบที่ {state.roundNumber} · ⏱️ {state.timeLeft} วิ</span>
            </div>
          )}
          {state.oberonBg && (
            <div className="text-sm font-black text-indigo-300 bg-black/60 px-4 py-0.5 rounded-full border border-indigo-400/40 text-hard">🌑 ราตรีกลืนกิน</div>
          )}
        </div>

        {/* คู่ต่อสู้: การ์ดกริด (แตะการ์ดเพื่อโจมตีตอนเป็นผู้ชนะ) */}
        <div className={`shrink-0 max-h-[36vh] overflow-y-auto grid gap-2 px-2 pt-2 ${others.length <= 1 ? "grid-cols-1 max-w-sm w-full mx-auto" : "grid-cols-2"}`}>
          {others.map((p) => (
            <MobileOpponent
              key={p.id}
              p={p}
              phase={phase}
              targetable={isTargetable(p, iAmAttacker, targetChain)}
              picked={!!anataSel && anataSel.includes(p.id)}
              onAttack={(id) => resolveAttackPick(id, targetChain)}
              onInspect={setStatusViewId}
              hostRef={(el) => registerOther(p.id, el)}
            />
          ))}
        </div>
        {iAmAttacker && (
          <div className="shrink-0 text-center mt-1.5 text-lg font-black text-echo-gold animate-pulse text-hard">
            ⚔️ แตะการ์ดคู่ต่อสู้เพื่อโจมตี!
          </div>
        )}
        {anataSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-gold animate-pulse">🎤 แตะเลือกเป้าหมาย ANATA ({anataSel.length}/{anataNeed})</span>
            <button onClick={() => { clickSound(); setAnataSel(null); }} className="ml-3 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {dawnSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-gold animate-pulse">🌄 แตะเลือกเป้าหมายรุ่งอรุณแห่งวันใหม่</span>
            <button onClick={() => { clickSound(); pickDawn(me.id); }} className="ml-3 text-sm font-bold bg-echo-gold text-gray-900 rounded-full px-3 py-1">เลือกตัวเอง</button>
            <button onClick={() => { clickSound(); setDawnSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {bgSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-gold animate-pulse">🛡️ แตะเลือกเป้าหมาย Absorb shield</span>
            <button onClick={() => { clickSound(); pickBg(me.id); }} className="ml-3 text-sm font-bold bg-echo-gold text-gray-900 rounded-full px-3 py-1">เลือกตัวเอง</button>
            <button onClick={() => { clickSound(); setBgSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {appleSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-gold animate-pulse">🎁 แตะเลือกเป้าหมายเอาไปสิ — มอบ{APPLE_ITEM_NAME[me?.appleItem] || "ของ"}</span>
            <button onClick={() => { clickSound(); setAppleSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {bbSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-cyan animate-pulse">📶 แตะเลือกเป้าหมายยื่นข้อเสนอสัญญา</span>
            <button onClick={() => { clickSound(); setBbSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {shSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-cyan animate-pulse">🌕 แตะเลือกเป้าหมายแสงจันทร์ส่องวิญญาณ</span>
            <button onClick={() => { clickSound(); setShSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {skSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">🔪 แตะเลือกเป้าหมาย นายมีฝีมือแค่ไหนหรอ?</span>
            <button onClick={() => { clickSound(); setSkSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {psSealSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">🗡️ แตะเลือกเป้าหมาย อย่าทำอะไรไม่เข้าท่าเลย</span>
            <button onClick={() => { clickSound(); setPsSealSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {gunSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">🔫 แตะเลือกเป้าหมาย {shopInfoOf(gunSel).label(gunSel)}</span>
            <button onClick={() => { clickSound(); setGunSel(null); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {tpSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">💀 แตะเลือกเป้าหมาย นายเป็นคนทำตัวเองนะ</span>
            <button onClick={() => { clickSound(); setTpSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {doomSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-cyan animate-pulse">🔫 แตะเลือกเป้าหมาย: {ch?.secondary?.name || "Weapon"}</span>
            <button onClick={() => { clickSound(); setDoomSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {saObSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">🎵 แตะเลือกเป้าหมาย Do Do Do, De Da Da Da</span>
            <button onClick={() => { clickSound(); setSaObSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {bardPending && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-gold animate-pulse">🎼 แตะเลือกเป้าหมาย {bardPending.name} ({bardSel.length}/{bardNeed})</span>
            {bardPending.allowSelf && (
              <button onClick={() => { clickSound(); pickBard(me.id); }} className="ml-3 text-sm font-bold bg-echo-gold text-gray-900 rounded-full px-3 py-1">เลือกตัวเอง</button>
            )}
          </div>
        )}
        {nanayaSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">👁️ แตะเลือกเป้าหมาย อันนี้ของนายรึเปล่า</span>
            <button onClick={() => { clickSound(); setNanayaSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {kaiCreateSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-gold animate-pulse">🎨 แตะเลือกเป้าหมายมือซ้ายแห่งการรังสรรค์</span>
            <button onClick={() => { clickSound(); pickKaiCreate(me.id); }} className="ml-3 text-sm font-bold bg-echo-gold text-gray-900 rounded-full px-3 py-1">เลือกตัวเอง</button>
            <button onClick={() => { clickSound(); setKaiCreateSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {kaiPunishSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">⚔️ แตะเลือกเป้าหมายมือขวาแห่งการลงทัณฑ์</span>
            <button onClick={() => { clickSound(); pickKaiPunish(me.id); }} className="ml-3 text-sm font-bold bg-echo-gold text-gray-900 rounded-full px-3 py-1">เลือกตัวเอง</button>
            <button onClick={() => { clickSound(); setKaiPunishSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {bylethStrikeSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">🗡️ แตะเลือกเป้าหมายของ "ดาบต้องสาป"</span>
            <button onClick={() => { clickSound(); setBylethStrikeSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {bylethStrikeSel && (
        <div className="shrink-0 text-center mt-1.5 text-hard">
          <span className="text-lg font-black text-echo-hp animate-pulse">🗡️ แตะเลือกเป้าหมายของ "ดาบต้องสาป"</span>
          <button onClick={() => { clickSound(); setBylethStrikeSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}
      {connorSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">{connorSel === "ultimate" ? "⚖️ เลือกเป้าหมาย “จัดการปิดคดี” (เฉพาะระดับอาชญากร)" : "🚔 เลือกเป้าหมาย “ข่มขวัญ/จับกุม”"}</span>
            <button onClick={() => { clickSound(); setConnorSel(null); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
      {danSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-gold animate-pulse">{danSel === "ultimate" ? "🚗 เลือกเป้าหมาย \u201cฉันบอกว่าอย่าหนี\u201d" : "🎓 เลือกผู้เล่นที่จะรับเป็น \u201cศิษย์\u201d"}</span>
            <button onClick={() => { clickSound(); setDanSel(null); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
      {msMarkSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">🩸 แตะเลือกเป้าหมาย Witch Mark</span>
            <button onClick={() => { clickSound(); setMsMarkSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}
        {msRuptureSel && (
          <div className="shrink-0 text-center mt-1.5 text-hard">
            <span className="text-lg font-black text-echo-hp animate-pulse">💥 แตะเลือกเป้าหมาย Mana Rupture</span>
            <button onClick={() => { clickSound(); setMsRuptureSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
          </div>
        )}

        {/* กลางจอ: กองการ์ดกลาง ทับตำแหน่งโลโก้เดิม (โลโก้เป็นแค่วอเตอร์มาร์กจางๆ ด้านหลัง) */}
        <div className="flex-1 min-h-0 grid place-items-center pointer-events-none">
          <div className="relative grid place-items-center">
            <img src="/image/logo_current.webp" alt="" className="h-14 w-auto opacity-25" />
            <div className="absolute inset-0 grid place-items-center">
              {boss ? (
                <YuukiBossCard p={boss} phase={phase} compact hostRef={(el) => registerOther(boss.id, el)} targetable={isTargetable(boss, iAmAttacker, targetChain)} onPick={(id) => resolveAttackPick(id, targetChain)} onInspect={setStatusViewId} />
              ) : <DeckPile hostRef={deckRef} size="md" onClick={() => setDeckOpen(true)} />}
            </div>
          </div>
        </div>
        {deckOpen && !boss && <DeckLedgerModal ledger={state.deckLedger || []} onClose={() => setDeckOpen(false)} />}

        {/* ---------- แผงตัวเรา (ล่างสุด กดง่ายด้วยนิ้วโป้ง) ----------
            ออกแบบใหม่: รูป/แต้มรวม ลอยเป็นป้ายเฉียงเจาะทับขอบบนแผง (ไม่ใช่แถวในกล่องเหมือนเดิม)
            ช่องสกิล 3 อันจัดทรงพัด (ช่องกลางยกสูงกว่า) และปุ่มจั่ว/เปิดไพ่รวมเป็นปุ่มเดียวแบ่งเฉียงกลาง
            กระเป๋า/ร้านค้าย้ายไปเป็นไอคอนกลมลอยนอกแผงแทนปุ่มยาวเต็มแถว */}
        {me && (
          <div className="shrink-0 px-2 pb-2">
            <div className="p-self-panel relative rounded-3xl p-3 pt-8 shadow-2xl">
              {/* ป้ายลอย: รูปเรา (ซ้าย) */}
              <button
                onClick={() => { clickSound(); setShowChar(true); }}
                className="absolute -top-7 left-3 z-20"
                title="รายละเอียดตัวละคร"
                style={{ "--p-frame-color": me.color }}
              >
                {me.hisakawa ? <TwinPortraitCards p={me} size="sm" /> : <Portrait p={me} className="w-14 h-16 p-player-frame" rounded="rounded-xl" />}
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] font-bold bg-black/75 rounded-full px-1.5 leading-tight whitespace-nowrap">ℹ️</span>
              </button>
              {isEiji && (
                <div className="absolute -top-7 left-[4.6rem] z-20">
                  <EijiOrdinalButton me={me} usable={eijiOrdinalUsable} onPress={useEijiOrdinal} className="w-14 h-16" />
                </div>
              )}
              {isHakuno && (
                <div className="absolute -top-7 left-[4.6rem] z-20">
                  <HakunoCommandButton me={me} usable={hakunoCmdUsable} onOpen={() => setHakunoCmdOpen(true)} className="w-14 h-16" />
                </div>
              )}
              {/* ป้ายลอย: แต้มรวม (ขวา) */}
              <TeamBadge teamId={me.teamId} className="absolute -top-5 left-1/2 -translate-x-1/2 z-20" />
              <div
                className="absolute -top-6 right-3 z-20 px-4 py-1 text-center font-black text-gray-900"
                style={{ background: "linear-gradient(120deg,#f6d371,var(--color-echo-gold))", clipPath: "polygon(12% 0,100% 0,88% 100%,0 100%)" }}
              >
                <div className="text-[10px] leading-none" style={{ fontFamily: P_DISPLAY }}>แต้มรวม</div>
                <div className="text-2xl leading-tight" style={{ fontFamily: P_DISPLAY }}>{me.score != null ? me.score : "???"}</div>
              </div>

              {/* การ์ด/แต้ม: เต็มความกว้าง จัดกลาง (ไม่ต้องแบ่งที่ให้รูป/คะแนนอีกต่อไป) */}
              <div ref={selfHandRef} className="flex items-center justify-center overflow-x-auto min-h-[52px]">
                {me.cards === null ? (
                  // ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ ทำงานอยู่ — การ์ด/แต้มของตัวเองก็ถูกซ่อน
                  <div className="text-3xl font-black opacity-80">🌑 ???</div>
                ) : revealed ? (
                  <div className="text-3xl font-black">
                    {me.busted ? <span className="text-echo-hp">แตก!</span> : <>แต้ม <span className="text-echo-gold">{me.score}</span></>}
                  </div>
                ) : (
                  me.cards && me.cards.map((c, i) => <Card key={i} value={c.value} color={c.color} special={c.special} size="sm" />)
                )}
              </div>
              <div className="h-1.5 rounded-full bg-black/30 overflow-hidden mt-1.5">
                <div className="h-full transition-all" style={{ width: `${Math.min(100, ((me.score || 0) / 21) * 100)}%`, background: me.busted ? "#c0392b" : "#fff" }} />
              </div>

              {/* พลังชีวิต + เกราะ (บรรทัดเดียวเสมอ) + สถานะ + หลอดสกิล
                  min-w-0: ป้ายสถานะเป็น whitespace-nowrap ทั้งแถว — ถ้าไม่ปลดล็อก min-width:auto
                  ป้ายที่โผล่ตอนกดสกิล (ไบเลธ) จะดันหลอดสกิลที่ ml-auto ล้นออกนอกกล่อง */}
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-2 min-w-0">
                {me.hisakawa ? <TwinVitals p={me} compact /> : <LifeBar p={me} />}
                {!me.hisakawa && <StatusChips p={me} left />}
                <DoomChargeBadge me={me} ch={ch} />
                <TakutoStarBadge me={me} ch={ch} />
                <TakumiGearBadge me={me} ch={ch} />
                <EijiDodgeBadge me={me} ch={ch} />
                <BylethKnowledgeBadge me={me} ch={ch} />
                <ConnorStressBadge me={me} />
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="flex gap-1 p-1 rounded-lg bg-black/25">
                    {Array.from({ length: me.maxSkill }, (_, i) => (
                      <span
                        key={i}
                        className="w-4 h-4 rotate-45"
                        style={
                          i < me.skillPoints
                            ? { background: "linear-gradient(180deg,#f6d371,var(--color-echo-gold))", boxShadow: "0 0 6px rgba(229,179,59,.8)" }
                            : { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)" }
                        }
                      />
                    ))}
                  </span>
                  <span className="text-sm font-black whitespace-nowrap">{me.skillPoints}/{me.maxSkill}</span>
                </span>
              </div>

              {/* ช่องสกิล 3 อัน — ทรงพัด: ช่องกลาง (สกิลรอง) ยกสูงกว่าอีก 2 ช่อง */}
              <div className="grid grid-cols-3 gap-2 mt-3 items-end">
                <div className="translate-y-1.5">
                  <SkillSlot label="สกิลพื้นฐาน" tier="basic" skill={ch?.basic} points={me.skillPoints} disabled={!me.alive || phase !== "PLAYING" || (!isHisakawa && (done || noSkill || moonCellOn)) || hisakawaSwitchLocked || miyakoHealPending || hakunoSecondaryPending || beatBasicLocked || shCharging || rgCharging || phenexTaunting || bardNoteLocked || witchMarkCooldown || (me.skillUsed && !gambleRepeat && !isByleth && !isHaruka && !isApple && !isBard && !isTohno && !isHakuno && !isDoomguy && !isKai && !isTakumi && !isHisakawa) || harukaBasicLocked || bylethBasicLocked || bylethBudgetLocked || (isKai && (me.kaiSkillUsesRound || 0) >= 2) || takumiBudgetLocked || cassiusLocked || veilLocked || ktBasicLocked || (isHakuno && me.hakunoGenderSwitched) || doomBasicLocked || takutoBasicPending || tepeuCookLocked || tepeuPonderLocked || batStealthLocked || psBladeLocked} onUse={requestSkillUse} cooldown={witchMarkCd} ammo={isGambler ? me.gamblerUses : undefined} cost={isGambler && goldenOn ? halfCost(ch?.basic) : undefined} />
                </div>
                <div className="-translate-y-2">
                  <SkillSlot label="สกิลรอง" tier="secondary" skill={ch?.secondary} points={me.skillPoints} disabled={done || phase !== "PLAYING" || noSkill || moonCellOn || miyakoComboPending || hakunoSecondaryPending || triggerCircleLocked || triggerMultiLocked || triggerZeperionLocked || (me.skillUsed && !isByleth && !isBard && !isDoomguy && !isKai && !isTakumi) || bylethSecLocked || bylethBudgetLocked || (isKai && (me.kaiSkillUsesRound || 0) >= 2) || takumiBudgetLocked || shCharging || rgCharging || phenexTaunting || bardNoteLocked || ohgerLocked || lanLocked || ktSecLocked || skSecLocked || banagherAssaultLocked || doomNoEffectLocked || takutoSecPending || takutoNotApprivoiseLocked || monsterMe || tepeuPonderLocked || tepeuCookLocked || batKarmaLocked || psSealLocked || harukaSecLocked || burdenCooldown} onUse={requestSkillUse} cooldown={burdenCd} ammo={isApple ? me.appleGiveUses : me.beamAmmo} cost={isGambler && goldenOn ? halfCost(ch?.secondary) : undefined} />
                </div>
                <div className="translate-y-1.5">
                  {isBard ? <BardComposeSlot me={me} /> : isKai ? <KaiOverhaulSlot me={me} /> : <SkillSlot label="ท่าไม้ตาย" tier="ultimate" skill={ch?.ultimate} points={me.skillPoints} disabled={(done || phase !== "PLAYING" || noSkill || moonCellOn || beatMe || (me.skillUsed && !isByleth) || bylethUltLocked || bylethBudgetLocked || ultimateActive || triggerCircleLocked || triggerMultiLocked || triggerZeperionLocked || takumiBudgetLocked || fourthLocked || doomUltLocked || takutoUltLockedNow || tepeuCookLocked || tepeuPonderLocked || offerLocked || ktUltLocked || shUltLocked || shCharging || rgCharging || phenexTaunting || hikaruUltLocked)} onUse={requestSkillUse} cost={undefined} />}
                </div>
              </div>
              {noSkill && phase === "PLAYING" && !done && (
                <div className="text-center text-sm font-bold text-echo-hp mt-1">🗡️ โดนหอกลองกินัสปัก — เทิร์นนี้ใช้สกิลไม่ได้</div>
              )}
              {moonCellOn && phase === "PLAYING" && !done && (
                <div className="text-center text-sm font-bold text-echo-hp mt-1">🌙 คำสาปแห่งดวงจันทร์ MOON*CELL — สกิลของทุกคนใช้ไม่ได้ระหว่างนี้</div>
              )}
              {(miyakoHealPending || miyakoComboPending || hakunoSecondaryPending) && phase === "PLAYING" && !done && (
                <div className="text-center text-sm font-bold text-echo-gold mt-1">✋ กดซ้ำไม่ได้จนกว่าจะได้โจมตี</div>
              )}
              {rgCharging && phase === "PLAYING" && !done && (
                <div className="text-center text-sm font-bold text-echo-hp mt-1">🛡️ ฉันจะไม่ยอมสูญเสียใครไปอีก — จั่ว/ใช้สกิล/โจมตีไม่ได้ระหว่างท่าทำงาน</div>
              )}
              {phenexTaunting && phase === "PLAYING" && !done && (
                <div className="text-center text-sm font-bold text-echo-hp mt-1">🥺 ไม่อยากให้ใครต้องเจ็บปวด — จั่ว/ใช้สกิลไม่ได้ระหว่างล่อเป้า (ชนะจั่วยังโจมตีได้)</div>
              )}
              {tepeuPonderLocked && phase === "PLAYING" && !done && (
                <div className="text-center text-sm font-bold text-echo-hp mt-1">🤔 เป็นแบบนี้นี่เอง — ครุ่นคิดอยู่ จั่วไพ่/ใช้สกิลอื่นไม่ได้ (ชนะจั่วยังโจมตีได้)</div>
              )}
              {tepeuCookLocked && phase === "PLAYING" && !done && (
                <div className="text-center text-sm font-bold text-echo-gold mt-1">🍳 วันนี้อากาศดีจัง — กำลังทำอาหารอยู่ (เหลือ {me.tepeuCookTurns} เทิร์น)</div>
              )}
              {me.skillUsed && !gambleRepeat && phase === "PLAYING" && !done && (
                <div className="text-center text-sm font-bold text-echo-gold mt-1">ใช้สกิลได้ 1 อันต่อเทิร์น — เทิร์นนี้ใช้ไปแล้ว</div>
              )}
              {me.skillUsed && gambleRepeat && phase === "PLAYING" && !done && (
                <div className="text-center text-sm font-bold text-echo-gold mt-1">🎰 เวลาทอง! กดสกิลพื้นฐานต่อได้ (เหลือ {me.gamblerUses} ครั้ง)</div>
              )}

              {/* นานายะ ชิกิ: ปุ่มเปิด/ปิด Mystic eye of death perception (แยกจากช่องสกิล — เปิด/ปิดได้แค่ 1 ครั้งต่อเทิร์น) */}
              {ch?.id === "nanaya" && phase === "PLAYING" && me.alive && !done && (
                <div className="mt-2">
                  <Button
                    variant={me.nanayaEyeOn ? "danger" : "ghost"}
                    className="w-full py-3 text-base"
                    disabled={me.nanayaToggleUsed}
                    onClick={nanayaToggleEye}
                  >
                    👁️ Mystic eye of death perception — {me.nanayaEyeOn ? "เปิดอยู่ (กดเพื่อปิด)" : "ปิดอยู่ (กดเพื่อเปิด)"}
                  </Button>
                  {me.nanayaToggleUsed && <div className="text-center text-xs font-bold text-echo-gold mt-1">เปิด/ปิดได้ 1 ครั้งต่อเทิร์น — เทิร์นนี้ใช้ไปแล้ว</div>}
                </div>
              )}

              {/* แถวแอคชันหลัก: ไอคอนกระเป๋า/ร้านค้ากลม ขนาบข้างปุ่มจั่ว-เปิดไพ่ที่รวมเป็นชิ้นเดียว (แบ่งเฉียงกลาง)
                  แทนปุ่มยาวเต็มแถว 2 แถวซ้อนกันแบบเดิม — ลดความ "กล่องสี่เหลี่ยมเรียงกัน" ลง */}
              <div className="mt-3 flex items-stretch gap-2">
                <button
                  onClick={() => { clickSound(); setBagOpen(true); }}
                  className="relative shrink-0 w-12 rounded-2xl grid place-items-center text-2xl shadow-lg border-2 border-black/40"
                  style={{ background: "linear-gradient(160deg,#f6d371,var(--color-echo-gold))" }}
                  title="กระเป๋า"
                >
                  🎒
                  {me.inventory?.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 text-[10px] font-black bg-black text-white rounded-full w-4 h-4 grid place-items-center">{me.inventory.length}</span>
                  )}
                </button>

                <div className="flex-1">
                  {phase === "PLAYING" && me.alive && !done ? (
                    <>
                      <div className="relative flex h-14">
                        <button
                          disabled={state.deckEmpty || me.atCap || noDraw || shCharging || rgCharging || phenexTaunting || tepeuPonderLocked}
                          onClick={() => { clickSound(); socket.emit("hit"); }}
                          className="flex-1 font-black text-lg text-gray-900 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: "var(--color-echo-cyan)", clipPath: "polygon(0 0,94% 0,100% 100%,0 100%)" }}
                        >
                          🎴 จั่วการ์ด
                        </button>
                        <button
                          onClick={() => { clickSound(); socket.emit("lock"); }}
                          className="flex-1 font-black text-lg text-gray-900 transition active:scale-95 -ml-3"
                          style={{ background: "var(--color-echo-gold)", clipPath: "polygon(6% 0,100% 0,100% 100%,0% 100%)" }}
                        >
                          ✅ เปิดไพ่
                        </button>
                      </div>
                      {noDraw && <div className="text-center text-sm font-bold text-echo-hp mt-1">🚫 เทิร์นนี้จั่วไม่ได้</div>}
                      {shCharging && <div className="text-center text-sm font-bold text-echo-hp mt-1">🎻 กำลังบรรเลงบทเพลงสุดท้าย — จั่ว/ใช้สกิลไม่ได้ (ชนะจั่วยังโจมตีได้)</div>}
                      {me.atCap && <div className="text-center text-sm font-bold text-echo-gold mt-1">{me.busted ? "ไพ่แตก! 😢 ยังกดสกิล/ใช้ไอเทมได้ จนกว่าจะเปิดไพ่" : "แต้มเต็มแล้ว! ใช้สกิล หรือเปิดไพ่ได้เลย"}</div>}
                      {state.deckEmpty && <div className="text-center text-sm font-bold text-echo-hp mt-1">🂠 การ์ดหมดกอง — ทุกคนจั่วเพิ่มไม่ได้</div>}
                    </>
                  ) : phase === "PLAYING" && me.alive && done ? (
                  <div className="text-center text-lg font-bold py-2">{me.busted ? "แตก! 😢" : me.statuses?.sleep || me.statuses?.ksleep ? "หลับไหลอยู่ 💤" : me.statuses?.sena ? "หนีเซนะอยู่ 🏃‍♀️" : me.statuses?.stun ? "สตั้นอยู่ 😵" : "พร้อมแล้ว ✅"} รอเพื่อน...</div>
                ) : phase === "ATTACK" ? (
                  <div className="text-center text-lg font-bold py-2">
                    {iAmAttacker ? "⚔️ แตะการ์ดคู่ต่อสู้ด้านบน!" : `รอ ${attacker ? attacker.name : "ผู้ชนะ"} เลือกเป้าหมาย...`}
                    {iAmAttacker && state.nanayaReattack && (
                      <div className="mt-1">
                        <span className="text-sm font-bold text-echo-hp">🗡️ หัวใจฆาตกร — พลาดสังหาร โจมตีซ้ำได้ทันที!</span>
                        <button onClick={nanayaCancelReattack} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
                      </div>
                    )}
                  </div>
                ) : !me.alive ? (
                  <div className="text-center text-lg opacity-80 py-2">💀 ตกรอบแล้ว</div>
                ) : <div className="py-1" />}
                </div>

                <button
                  onClick={() => { clickSound(); setShopOpen(true); }}
                  className="relative shrink-0 w-12 rounded-2xl grid place-items-center text-2xl shadow-lg border-2 border-black/40"
                  style={{ background: "linear-gradient(160deg,#f6d371,var(--color-echo-gold))" }}
                  title="ร้านค้า"
                >
                  🏪
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-black bg-black text-white rounded-full px-1 leading-4 whitespace-nowrap">🪙{me.gold ?? 0}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------- เฟสสรุปผล: ลีดเดอร์บอร์ด (เต็มจอ เลื่อนดูได้) ---------- */}
        {phase === "SUMMARY" && (
          <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-0 p-3 bg-black/50 pointer-events-none">
            <div className="pop-in relative w-full max-w-sm rounded-t-2xl px-5 py-2 text-center overflow-hidden" style={{ background: "linear-gradient(120deg,var(--color-p-accent),var(--color-p-accent-deep))" }}>
              <span className="relative text-lg font-black text-white text-hard tracking-wide">ผลการจั่วไพ่รอบนี้</span>
            </div>
            <div className="pop-in flex flex-col gap-3 rounded-b-2xl px-4 py-4 w-full max-w-sm max-h-[65vh] overflow-y-auto bg-gradient-to-b from-slate-900/97 to-black/97 border-x border-b border-white/10 shadow-2xl pointer-events-auto">
              <SummaryTiers winners={summaryWinners} losers={summaryLosers} compact />
            </div>
          </div>
        )}

        {/* ---------- อนิเมชันเปลี่ยนเฟส ---------- */}
        {PHASE_NAMES[phase] && (
          <div key={`${phase}-${state.roundNumber}`} className="phase-intro fixed top-[38%] left-1/2 z-40 pointer-events-none">
            <div className="text-3xl font-black bg-black/70 rounded-full px-6 py-2.5 whitespace-nowrap text-white text-hard border-2 border-white/20">{PHASE_NAMES[phase]}</div>
          </div>
        )}

        {/* ---------- overlay ที่ใช้ร่วมกับจอคอม ---------- */}
        <OverlayLayer phase={phase} attack={state.attack} csAnnounce={csAnnounce} csSkipped={csSkipped} timeLeft={state.timeLeft} flash={flash} notice={notice} cycleFx={cycleFx} overloadForce={state.overloadForce} bylethCourse={state.bylethFieldFx} onOpenBylethCourse={() => setBylethInfoOpen(true)} />
        <FlyingCardsLayer flights={cardFlights} onDone={removeCardFlight} />
        {state.yunaFieldFx === "beatbark" && <div className="field-fx-beatbark" />}
        {state.bylethFieldFx && <div className={`field-fx-byleth-${state.bylethFieldFx}`} />}
        {/* คอนเนอร์ RK800: ออร่าขอบจอแดงดุดัน + สกอร์ดวลระหว่างการไล่ล่า (เกตเดียวกับผลจริงของโหมดไล่ล่า) */}
        {state.connorFieldFx === "chase" && <div className="field-fx-connor-chase" />}
        {state.connorChase && <ConnorChaseHud chase={state.connorChase} />}
        {bylethSwordOpen && me && <BylethSwordModal me={me} onPick={pickBylethSword} onClose={() => setBylethSwordOpen(false)} />}
        {bylethCourseOpen && me && <BylethCourseModal me={me} onPick={pickBylethCourse} onClose={() => setBylethCourseOpen(false)} />}
        {bylethInfoOpen && <BylethCourseInfoModal course={state.bylethFieldFx} onClose={() => setBylethInfoOpen(false)} />}

        {/* ---------- แบนเนอร์รอบถัดไป ---------- */}
        {phase === "TRANSITION" && (
          <div className="fixed inset-0 grid place-items-center bg-black/40 z-30">
            <div className="round-banner text-6xl font-black text-white text-hard">รอบที่ {state.roundNumber + 1}</div>
          </div>
        )}

        {/* ---------- จบเกม ---------- */}
        {phase === "GAMEOVER" && (
          <div className="fixed inset-0 grid place-items-center bg-black/60 z-30 p-4">
            <div className="text-center">
              <div className="text-4xl font-black mb-4">
                {(() => {
                  if (state.yuukiVictory) return <>☠️ ผู้เล่นทั้งหมดพ่ายแพ้ต่อ ยูกิ Overload</>;
                  if (state.overloadVictory) return <>🏆 ผู้เล่นทุกคนเอาชนะ ยูกิ Overload!</>;
                  if (state.gameMode !== "ffa" && state.winningTeamId) { const ws = state.players.filter((p) => p.alive && p.teamId === state.winningTeamId); const names = ws.map((w) => w.name).join(" & "); return <>🏆 Team {state.winningTeamId}{names ? ` (${names})` : ""} ชนะ!</>; }
                  if (state.allyWin) { const ws = state.players.filter((p) => p.alive); return <>🤝 {ws.map((w) => w.name).join(" & ")} ชนะทั้งคู่!</>; }
                  const c = state.players.find((p) => p.alive); return c ? <>🏆 {c.name} ชนะ!</> : "จบเกม";
                })()}
              </div>
              <Button className="py-4 px-8 text-xl" onClick={() => { clickSound(); socket.emit("backToLobby"); }}>🏠 กลับห้องรอ</Button>
            </div>
          </div>
        )}

        <ModalMounts
          showChar={showChar} ch={ch} me={me} onCloseChar={() => setShowChar(false)}
          hakunoCmdOpen={hakunoCmdOpen} onUseHakunoCmd={useHakunoCmd} onCloseHakunoCmd={() => setHakunoCmdOpen(false)}
          appleOpen={appleOpen} onPickAppleItem={pickAppleItem} onCloseApple={() => setAppleOpen(false)}
          tohnoOpen={tohnoOpen} onPickTohnoLevel={pickTohnoLevel} onCloseTohno={() => setTohnoOpen(false)}
          connorArrestAsk={state.connorArrestAsk} onAnswerConnorArrest={(submit) => socket.emit("connorArrestAnswer", { submit })}
          contractOffer={state.contractOffer} onAnswerContract={(a) => socket.emit("contractAnswer", { accept: a, fromId: state.contractOffer?.fromId })}
          locaOffer={state.locaOffer} onAnswerLoca={(a) => socket.emit("locaAnswer", { accept: a, fromId: state.locaOffer?.fromId })}
          renewAsk={state.renewAsk} onAnswerRenew={(a) => socket.emit("contractAnswer", { accept: a })}
          allyChoices={state.allyChoices} onPickAlly={(id) => socket.emit("riddheAlly", { targetId: id })} onDeclineAlly={() => socket.emit("riddheAlly", {})}
          phenexReleaseAsk={state.phenexReleaseAsk} onPickPhenexRelease={(id) => socket.emit("phenexRelease", { targetId: id })}
          batKarmaAsk={state.batKarmaAsk} onPickBatKarma={(id) => socket.emit("batKarmaSend", { targetId: id })}
          allyOfferAsk={state.allyOfferAsk} onAnswerAllyOffer={(a) => socket.emit("allyAnswer", { accept: a, fromId: state.allyOfferAsk?.fromId })}
          allyBreakAsk={state.allyBreakAsk} onAnswerAllyBreak={(c) => socket.emit("allyBreakAnswer", { cancel: c })}
          allyFinalAsk={state.allyFinalAsk} onAnswerAllyFinal={(k) => socket.emit("allyFinalAnswer", { keep: k })}
          statusView={statusView} statusViewIsSelf={statusViewId === state.youId} onCloseStatus={() => setStatusViewId(null)}
          shopOpen={shopOpen} shop={state.shop} onCloseShop={() => setShopOpen(false)}
          bagOpen={bagOpen} onCloseBag={() => setBagOpen(false)} players={state.players} gameState={state.gameState} roundNumber={state.roundNumber} onPickGunAmmo={startGunPick}
          skillConfirm={skillConfirm} onConfirmSkill={confirmSkillUse} onCancelSkill={cancelSkillConfirm}
        />
      </div>
    );
  }

  // ---- จอคอม/แท็บเล็ต: กระดานเดิม (ออกแบบที่ 900px, auto-fit) ----
  const DESIGN_W = Math.max(900, vp.w);
  const scale = vp.w / DESIGN_W;
  const designH = vp.h / scale;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <GameBackground cycle={state.cycle} oberonBg={state.oberonBg} shradeBg={state.shradeBg} bardBg={state.bardBg} shikiBg={state.shikiBg} hakunoBg={state.hakunoBg} hisakawaBg={state.hisakawaBg} overloadForce={state.overloadForce} lowQ={lowQ} />
      <div
        className="relative overflow-hidden"
        style={{ width: DESIGN_W, height: designH, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
      {/* กองการ์ดกลาง ทับตำแหน่งโลโก้กลางโต๊ะเดิม (โลโก้เป็นแค่วอเตอร์มาร์กจางๆ ด้านหลัง) — ใหญ่ขึ้นชัดเจน */}
      <div className="absolute inset-x-0 top-[40%] flex justify-center pointer-events-none">
        <div className="relative grid place-items-center">
          <img src="/image/logo_current.webp" alt="" className="h-16 sm:h-20 w-auto opacity-25" />
          <div className="absolute inset-0 grid place-items-center">
            {boss ? (
              <YuukiBossCard p={boss} phase={phase} hostRef={(el) => registerOther(boss.id, el)} targetable={isTargetable(boss, iAmAttacker, targetChain)} onPick={(id) => resolveAttackPick(id, targetChain)} onInspect={setStatusViewId} />
            ) : <DeckPile hostRef={deckRef} size="lg" onClick={() => setDeckOpen(true)} />}
          </div>
        </div>
      </div>
      {deckOpen && !boss && <DeckLedgerModal ledger={state.deckLedger || []} onClose={() => setDeckOpen(false)} />}

      {/* ตัวจับเวลา + รอบ */}
      {(phase === "PLAYING" || phase === "ATTACK") && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 p-chip text-xl font-bold text-white bg-black/50 px-5 py-1.5 border-b-2" style={{ borderColor: "var(--color-p-accent-bright)" }}>
          <span>{state.oberonBg ? "🌑" : nightNow ? "🌙" : "☀️"} รอบที่ {state.roundNumber} · ⏱️ {state.timeLeft} วิ</span>
        </div>
      )}
      {/* ราตรีกลืนกิน: ป้ายค้างระหว่างฉากหลังโอเบรอนมีผล (จนกว่าจะหมดกลางคืน) */}
      {state.oberonBg && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 text-sm font-black text-indigo-300 bg-black/60 px-4 py-0.5 rounded-full border border-indigo-400/40 text-hard">
          🌑 ราตรีกลืนกิน
        </div>
      )}

      {/* ผู้เล่นคนอื่น */}
      {others.map((p, i) => (
        <OtherPlayer
          key={p.id}
          p={p}
          phase={phase}
          slot={slots[i] || [50, 50]}
          targetable={isTargetable(p, iAmAttacker, targetChain)}
          picked={!!anataSel && anataSel.includes(p.id)}
          onAttack={(id) => resolveAttackPick(id, targetChain)}
          onInspect={setStatusViewId}
          hostRef={(el) => registerOther(p.id, el)}
        />
      ))}

      {/* โหมดเลือกเป้าหมาย ANATA WAAAAAAAA (เทมาริ) */}
      {anataSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard">
          <span className="text-xl font-black text-echo-gold animate-pulse bg-black/60 rounded-full px-5 py-1.5">🎤 คลิกเลือกเป้าหมาย ANATA ({anataSel.length}/{anataNeed})</span>
          <button onClick={() => { clickSound(); setAnataSel(null); }} className="ml-3 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมายรุ่งอรุณแห่งวันใหม่ (โอเบรอน) — เลือกตัวเองได้ */}
      {dawnSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-gold animate-pulse bg-black/60 rounded-full px-5 py-1.5">🌄 คลิกเลือกเป้าหมายรุ่งอรุณแห่งวันใหม่</span>
          <button onClick={() => { clickSound(); pickDawn(me.id); }} className="ml-3 text-sm font-bold bg-echo-gold text-gray-900 rounded-full px-3 py-1">เลือกตัวเอง</button>
          <button onClick={() => { clickSound(); setDawnSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมาย Absorb shield (บานาจ ลิงก์ patch 2.1.2) — เลือกตัวเองได้ */}
      {bgSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-gold animate-pulse bg-black/60 rounded-full px-5 py-1.5">🛡️ คลิกเลือกเป้าหมาย Absorb shield</span>
          <button onClick={() => { clickSound(); pickBg(me.id); }} className="ml-3 text-sm font-bold bg-echo-gold text-gray-900 rounded-full px-3 py-1">เลือกตัวเอง</button>
          <button onClick={() => { clickSound(); setBgSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}


      {/* โหมดเลือกเป้าหมายเอาไปสิ (Apple guy) — มอบของที่เลือกไว้ให้คนอื่น */}
      {appleSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-gold animate-pulse bg-black/60 rounded-full px-5 py-1.5">🎁 คลิกเลือกเป้าหมายเอาไปสิ — มอบ{APPLE_ITEM_NAME[me?.appleItem] || "ของ"}</span>
          <button onClick={() => { clickSound(); setAppleSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมายยื่นข้อเสนอสัญญา (เจ้าแห่งเน็ตบ้าน) — เลือกได้เฉพาะคนอื่น */}
      {bbSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-cyan animate-pulse bg-black/60 rounded-full px-5 py-1.5">📶 คลิกเลือกเป้าหมายยื่นข้อเสนอสัญญา</span>
          <button onClick={() => { clickSound(); setBbSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมายแสงจันทร์ส่องวิญญาณ (ชเรด เอลัน) — เลือกได้เฉพาะคนอื่น */}
      {shSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-cyan animate-pulse bg-black/60 rounded-full px-5 py-1.5">🌕 คลิกเลือกเป้าหมายแสงจันทร์ส่องวิญญาณ</span>
          <button onClick={() => { clickSound(); setShSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมาย นายมีฝีมือแค่ไหนหรอ? (ชิกิ) — เลือกได้เฉพาะคนอื่น */}
      {skSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-hp animate-pulse bg-black/60 rounded-full px-5 py-1.5">🔪 คลิกเลือกเป้าหมาย นายมีฝีมือแค่ไหนหรอ?</span>
          <button onClick={() => { clickSound(); setSkSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมาย อย่าทำอะไรไม่เข้าท่าเลย (เจ้าหญิงราก) — เลือกได้เฉพาะคนอื่น */}
      {psSealSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-hp animate-pulse bg-black/60 rounded-full px-5 py-1.5">🗡️ คลิกเลือกเป้าหมาย อย่าทำอะไรไม่เข้าท่าเลย</span>
          <button onClick={() => { clickSound(); setPsSealSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมายกระสุนปืนหน่วย GUTS Select — เลือกได้เฉพาะคนอื่น */}
      {gunSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-hp animate-pulse bg-black/60 rounded-full px-5 py-1.5">🔫 คลิกเลือกเป้าหมาย {shopInfoOf(gunSel).label(gunSel)}</span>
          <button onClick={() => { clickSound(); setGunSel(null); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมาย นายเป็นคนทำตัวเองนะ (เทเปา) — เลือกได้เฉพาะคนอื่น */}
      {tpSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-hp animate-pulse bg-black/60 rounded-full px-5 py-1.5">💀 คลิกเลือกเป้าหมาย นายเป็นคนทำตัวเองนะ</span>
          <button onClick={() => { clickSound(); setTpSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมาย Do Do Do, De Da Da Da (ซาโตรุ) — เลือกได้เฉพาะคนอื่น */}
      {saObSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-hp animate-pulse bg-black/60 rounded-full px-5 py-1.5">🎵 คลิกเลือกเป้าหมาย Do Do Do, De Da Da Da</span>
          <button onClick={() => { clickSound(); setSaObSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมายบทเพลง (Bard) — บทเพลงประพันธ์เสร็จแล้ว รอเป้าหมาย (ไม่เลือก = สุ่มตอนเปิดไพ่) */}
      {bardPending && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-gold animate-pulse bg-black/60 rounded-full px-5 py-1.5">🎼 คลิกเลือกเป้าหมาย {bardPending.name} ({bardSel.length}/{bardNeed})</span>
          {bardPending.allowSelf && (
            <button onClick={() => { clickSound(); pickBard(me.id); }} className="ml-3 text-sm font-bold bg-echo-gold text-gray-900 rounded-full px-3 py-1">เลือกตัวเอง</button>
          )}
        </div>
      )}

      {/* โหมดเลือกเป้าหมาย อันนี้ของนายรึเปล่า (นานายะ ชิกิ) — เลือกได้เฉพาะคนอื่น */}
      {nanayaSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-hp animate-pulse bg-black/60 rounded-full px-5 py-1.5">👁️ คลิกเลือกเป้าหมาย อันนี้ของนายรึเปล่า</span>
          <button onClick={() => { clickSound(); setNanayaSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมายมือซ้ายแห่งการรังสรรค์/มือขวาแห่งการลงทัณฑ์ (ไค ชิซากิ) — เลือกตัวเองได้ */}
      {kaiCreateSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-gold animate-pulse bg-black/60 rounded-full px-5 py-1.5">🎨 คลิกเลือกเป้าหมายมือซ้ายแห่งการรังสรรค์</span>
          <button onClick={() => { clickSound(); pickKaiCreate(me.id); }} className="ml-3 text-sm font-bold bg-echo-gold text-gray-900 rounded-full px-3 py-1">เลือกตัวเอง</button>
          <button onClick={() => { clickSound(); setKaiCreateSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}
      {kaiPunishSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-hp animate-pulse bg-black/60 rounded-full px-5 py-1.5">⚔️ คลิกเลือกเป้าหมายมือขวาแห่งการลงทัณฑ์</span>
          <button onClick={() => { clickSound(); pickKaiPunish(me.id); }} className="ml-3 text-sm font-bold bg-echo-gold text-gray-900 rounded-full px-3 py-1">เลือกตัวเอง</button>
          <button onClick={() => { clickSound(); setKaiPunishSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* โหมดเลือกเป้าหมาย Witch Mark / Mana Rupture (ผู้สังหารเมจ) — เลือกได้เฉพาะคนอื่น */}
      {connorSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-hp animate-pulse bg-black/60 rounded-full px-5 py-1.5">{connorSel === "ultimate" ? "⚖️ เลือกเป้าหมาย “จัดการปิดคดี” (เฉพาะระดับอาชญากร)" : "🚔 เลือกเป้าหมาย “ข่มขวัญ/จับกุม”"}</span>
          <button onClick={() => { clickSound(); setConnorSel(null); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}
      {msMarkSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-hp animate-pulse bg-black/60 rounded-full px-5 py-1.5">🩸 คลิกเลือกเป้าหมาย Witch Mark</span>
          <button onClick={() => { clickSound(); setMsMarkSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}
      {danSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard">
          <span className="text-xl font-black text-echo-gold animate-pulse bg-black/60 rounded-full px-5 py-1.5">{danSel === "ultimate" ? "🚗 เลือกเป้าหมาย \u201cฉันบอกว่าอย่าหนี\u201d" : "🎓 เลือกผู้เล่นที่จะรับเป็น \u201cศิษย์\u201d"}</span>
          <button onClick={() => { clickSound(); setDanSel(null); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}
      {msRuptureSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-hp animate-pulse bg-black/60 rounded-full px-5 py-1.5">💥 คลิกเลือกเป้าหมาย Mana Rupture</span>
          <button onClick={() => { clickSound(); setMsRuptureSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* DoomGuy (patch 2.2 full): โหมดเลือกเป้าหมาย Weapon (เฉพาะอาวุธที่ต้องเลือกเป้าหมาย) */}
      {doomSel && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-40 text-center text-hard whitespace-nowrap">
          <span className="text-xl font-black text-echo-cyan animate-pulse bg-black/60 rounded-full px-5 py-1.5">🔫 คลิกเลือกเป้าหมาย: {ch?.secondary?.name || "Weapon"}</span>
          <button onClick={() => { clickSound(); setDoomSel(false); }} className="ml-2 text-sm font-bold bg-black/60 rounded-full px-3 py-1 border border-white/30">ยกเลิก</button>
        </div>
      )}

      {/* ---------- แผงตัวเรา ฉบับที่ 5 "LOW UI DOCK" (ล่างสุด ลดพื้นหลังลงมาก) ----------
          ไม่มีแถบทึบเต็มความกว้างจอแบบรอบก่อนแล้ว — แยกเป็น 3 กลุ่มลอยอิสระตามขอบล่างจอ แต่ละกลุ่ม
          มีพื้นหลังเท่าที่จำเป็นเท่านั้น (ชื่อ/เลือด/เกราะ/แต้ม ใช้ text-hard แทนกล่องพื้นหลังทึบ)
          กลุ่มการ์ด+จั่ว/เปิดไพ่ ลอยสูงกว่ากลุ่มอื่น ไม่เรียงแถวเดียวกันแบบเดิม
          กฎตายตัวที่คงไว้: (1) สถานะเห็นไอคอนได้เลย (2) การ์ดแยกกล่องชัดเจนอยู่บนสุด
          (3) SP แนวนอนเท่านั้น + (4) กล่องการ์ดขนาดคงที่ scroll เมื่อการ์ดล้น */}
      {me && (
        <div className="absolute inset-x-0 bottom-0 pb-3 sm:pb-5 px-3 sm:px-6 flex flex-col items-center gap-2">
          {/* หมายเหตุ: ตามคำขอผู้ใช้ — เอาแถบข้อความแจ้งเตือน/สถานะเทิร์นออกทั้งหมดแล้ว ห้ามมีข้อความ
              โผล่ตรงจุดนี้อีก (เดิมเคยมี noDraw/atCap/done/ATTACK/skill-lock ฯลฯ) */}

          {/* บั๊กเดิม: lg:flex-nowrap บังคับแถวเดียวตั้งแต่จอกว้าง 1024px ขึ้นไป แต่เนื้อหาจริงต้องการพื้นที่ ~1500px+ ถึงจะพอไม่ล้น
              ทำให้จอ 1024-1480px (ความละเอียดโน้ตบุ๊คที่พบบ่อยมาก เช่น 1366x768) กลุ่มขวา (กระเป๋า/ร้านค้า) ถูกดันล้นออกนอกจอขวาไปเลย มองไม่เห็น
              เอา lg:flex-nowrap ออก — ปล่อยให้ wrap ตามธรรมชาติ (ตัด/ล้นเฉพาะตอนพื้นที่ไม่พอจริงๆ ไม่ใช่บังคับตายตัวตามความกว้างจอ) */}
          <div className="w-full max-w-[1580px] mx-auto flex items-end justify-between gap-2 sm:gap-3 flex-wrap">
            {/* ซ้าย: ตัวละคร + เลือด/เกราะ + สถานะ — ไม่มีกล่องพื้นหลังทึบ ใช้ text-hard คุมความคมชัด
                บั๊กเดิม (ไบเลธ): กลุ่มนี้เป็น shrink-0 + คอลัมน์ข้างในไม่มี min-w-0 ป้ายสถานะเป็น
                whitespace-nowrap ทั้งหมด -> พอกดสกิลแล้วมีป้ายโผล่เพิ่ม (bylethNextDraw/หลักสูตร)
                กลุ่มนี้กว้างขึ้นแต่ย่อไม่ได้ ดันกลุ่มขวาทะลุออกนอกกรอบ DESIGN_W ที่ overflow-hidden
                = แถวล่างหักพัง ต้องปล่อยให้ย่อได้ (ไม่มี shrink-0) + min-w-0 ให้ flex-wrap ทำงานจริง */}
            <div className="flex items-start gap-2 min-w-0">
              <button
                onClick={() => { clickSound(); setShowChar(true); }}
                className="shrink-0"
                style={{ "--p-frame-color": me.color }}
                title="รายละเอียดตัวละคร"
              >
                {me.hisakawa ? <TwinPortraitCards p={me} size="md" /> : <Portrait p={me} className="w-24 h-24 sm:w-28 sm:h-28 rounded-full p-player-frame" rounded="rounded-full" />}
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0 max-w-[26rem]">
                  <div className="font-black text-lg sm:text-xl text-hard truncate max-w-[9rem] sm:max-w-[12rem]" style={{ fontFamily: P_DISPLAY }}>{me.character.name}</div>
                  <TeamBadge teamId={me.teamId} />
                  <DoomChargeBadge me={me} ch={ch} />
                  <TakutoStarBadge me={me} ch={ch} />
                  <TakumiGearBadge me={me} ch={ch} />
                  <EijiDodgeBadge me={me} ch={ch} />
                  <BylethKnowledgeBadge me={me} ch={ch} />
                <ConnorStressBadge me={me} />
                </div>
                {isHakuno && <HakunoCommandButton me={me} usable={hakunoCmdUsable} onOpen={() => setHakunoCmdOpen(true)} className="w-14 h-11 shrink-0 mt-1" />}
                {isEiji && <EijiOrdinalButton me={me} usable={eijiOrdinalUsable} onPress={useEijiOrdinal} className="w-14 h-11 shrink-0 mt-1" />}
                {me.hisakawa ? (
                  <TwinVitals p={me} />
                ) : me.maxHp == null ? (
                  // ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ ทำงานอยู่ — HP/เกราะ/โล่ถูกซ่อนแม้ของตัวเอง
                  <div className="text-lg sm:text-xl font-black text-hard opacity-80 mt-1.5" title="ถูกซ่อน (ถึงจะมองไม่เห็น แต่ฉันยังอยู่)">🌑 ???</div>
                ) : (
                  <>
                    <div className="flex items-center gap-1 text-xl sm:text-2xl leading-none text-hard mt-1.5">
                      {Array.from({ length: me.maxHp }, (_, i) => (i < me.hp ? "❤️" : "🖤")).join("")}
                      {me.tempHp > 0 && <span className="text-xs text-echo-gold font-bold ml-1">💛{me.tempHp}</span>}
                    </div>
                    <div className="flex items-center gap-1 mt-1.5">
                      {Array.from({ length: me.maxArmor }, (_, i) => <Shield key={i} on={i < me.armor} size={22} />)}
                      {me.shield > 0 && <span className="text-xs text-echo-cyan font-bold ml-1">+🛡️{me.shield}</span>}
                    </div>
                  </>
                )}
                {/* สถานะ — ไอคอนเห็นได้เลยไม่ต้องกดดู (กฎข้อ 1) กดเพื่อดูรายละเอียด+เวลาคงเหลือเต็ม
                    จำกัดไม่เกิน 2 แถวเสมอ (max-h + clip) ห้ามขยายสูงขึ้นไปดันของอย่างอื่น — เยอะกว่านั้นให้กดดูเพิ่มเอา */}
                <button
                  type="button"
                  onClick={() => { clickSound(); setStatusViewId(me.id); }}
                  className="p-status-click flex items-start mt-2 -ml-1 px-1 py-0.5 max-w-[11rem] sm:max-w-[15rem] max-h-[54px] overflow-hidden"
                  title="แตะเพื่อดูรายละเอียดสถานะ+เวลาคงเหลือ"
                >
                  {me.hisakawa ? <span className="text-xs opacity-60 text-hard whitespace-nowrap">แตะดูสถานะรวม</span>
                    : meStatuses.length > 0 ? <StatusChips p={me} left /> : <span className="text-xs opacity-60 text-hard whitespace-nowrap">ไม่มีสถานะ</span>}
                </button>
              </div>
            </div>

            {/* กลาง: แต้มรวมย้ายมาไว้บนสุด (เปิดที่ให้สกิลฝั่งขวากว้างขึ้น) การ์ดไม่มีพื้นหลังกล่อง/ไม่มี scroll
                เด็ดขาด (บีบระยะซ้อนอัตโนมัติให้พอดีพื้นที่เสมอ) เมาส์ชี้การ์ดใบไหนจะยกขึ้นให้ดูแต้มชัดแบบ UNO
                แตกแล้วการ์ดจะเป็นสีเทาเหมือน disable + ขึ้นคำว่า "แต้มเกิน" แทนสัญลักษณ์ระเบิด
                ลอยสูงกว่ากลุ่มอื่น (mb เยอะกว่า) — กฎข้อ 2 การ์ดต้องอยู่บนสุดเสมอ */}
            <div className="flex flex-col items-center mb-3 sm:mb-6 order-first lg:order-none w-full lg:w-auto">
              <div className="text-3xl sm:text-4xl font-black leading-none text-hard mb-1.5" style={{ fontFamily: P_DISPLAY, color: me.busted ? "var(--color-echo-hp)" : "var(--color-echo-gold)" }}>
                {me.busted ? "แต้มเกิน" : (me.score != null ? me.score : "???")}
              </div>
              <div ref={selfHandRef} className="flex items-center justify-center w-[240px] sm:w-[290px] h-[120px] sm:h-[140px]">
                {me.cards === null ? (
                  // ทาคุมิ ฟุจิวาระ: ถึงจะมองไม่เห็น แต่ฉันยังอยู่ ทำงานอยู่ — การ์ด/แต้มของตัวเองก็ถูกซ่อน
                  <span className="text-3xl font-black text-hard opacity-80">🌑 ???</span>
                ) : phase === "SUMMARY" || phase === "ATTACK" || phase === "ATTACKING" ? (
                  <div className="text-lg font-black text-hard opacity-80">{me.busted ? <span className="text-echo-hp opacity-100">แต้มเกิน</span> : "เปิดไพ่แล้ว"}</div>
                ) : me.cards && me.cards.length ? (
                  // ถือการ์ดแบบพัดสไตล์ UNO — บีบระยะซ้อนอัตโนมัติตามจำนวนใบให้พอดีพื้นที่เสมอ (ห้ามเกิด scroll เด็ดขาด)
                  // เมาส์ชี้ใบไหนจะยกขึ้น+ขยาย ให้เห็นแต้มชัดเจนแบบเกม UNO
                  <div className="flex items-center pl-1 pr-4">
                    {(() => {
                      const CARD_W = 80; // ความกว้างการ์ด size="lg"
                      const FAN_AREA_W = 230; // พื้นที่กางพัดตายตัว ไม่ล้นออกกรอบแน่นอน
                      const n = me.cards.length;
                      const step = n > 1 ? Math.max(16, Math.min(CARD_W, (FAN_AREA_W - CARD_W) / (n - 1))) : 0;
                      const mid = (n - 1) / 2;
                      return me.cards.map((c, i) => {
                        const off = i - mid;
                        return (
                          <div
                            key={i}
                            className="relative shrink-0 group hover:z-30"
                            style={{
                              marginLeft: i === 0 ? 0 : -(CARD_W - step),
                              transform: `rotate(${off * 6}deg) translateY(${Math.abs(off) * 4}px)`,
                            }}
                          >
                            <div className={`transition-transform duration-150 group-hover:-translate-y-6 group-hover:scale-110 ${me.busted ? "grayscale opacity-60" : ""}`}>
                              <Card value={c.value} color={c.color} special={c.special} size="lg" />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <span className="text-sm opacity-40 text-hard">ยังไม่จั่วไพ่</span>
                )}
              </div>

              {/* ปุ่มจั่ว/เปิดไพ่ — ย้ายมาไว้ใต้การ์ดแล้ว */}
              <div className="flex gap-2 mt-2">
                <button
                  disabled={state.deckEmpty || !(phase === "PLAYING" && me.alive && !done) || me.atCap || noDraw || shCharging || rgCharging || phenexTaunting || tepeuPonderLocked}
                  onClick={() => { clickSound(); socket.emit("hit"); }}
                  className="p-hs-action p-hs-action-draw w-28 sm:w-32 h-14 sm:h-16 flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed"
                  title="จั่วการ์ด"
                >
                  <span className="text-xl">🂠</span>
                  <span className="text-xs font-black text-echo-cyan" style={{ fontFamily: P_DISPLAY }}>จั่ว</span>
                </button>
                <button
                  disabled={!(phase === "PLAYING" && me.alive && !done)}
                  onClick={() => { clickSound(); socket.emit("lock"); }}
                  className="p-hs-action p-hs-action-reveal w-28 sm:w-32 h-14 sm:h-16 flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed"
                  title="เปิดไพ่"
                >
                  <span className="text-xl">🃏</span>
                  <span className="text-xs font-black text-echo-gold" style={{ fontFamily: P_DISPLAY }}>เปิดไพ่</span>
                </button>
              </div>
            </div>

            {/* ขวา: สกิล 3 ช่อง + หลอด SP แนวนอนขยายใหญ่ (กฎข้อ 3) แล้วกระเป๋า/ร้านค้าขยายใหญ่ขึ้น
                ร้านค้าโชว์จำนวนเหรียญปัจจุบันเด่นชัดในตัวปุ่มเลย */}
            <div className="flex items-end gap-1.5 sm:gap-2 shrink-0">
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-end gap-2 sm:gap-3">
                  <div className="w-40 sm:w-48">
                    <SkillSlot size="lg" label="พื้นฐาน" tier="basic" skill={ch?.basic} points={me.skillPoints} disabled={!me.alive || phase !== "PLAYING" || (!isHisakawa && (done || noSkill || moonCellOn)) || hisakawaSwitchLocked || miyakoHealPending || hakunoSecondaryPending || beatBasicLocked || shCharging || rgCharging || phenexTaunting || bardNoteLocked || witchMarkCooldown || (me.skillUsed && !gambleRepeat && !isByleth && !isHaruka && !isApple && !isBard && !isTohno && !isHakuno && !isDoomguy && !isKai && !isTakumi && !isHisakawa) || harukaBasicLocked || bylethBasicLocked || bylethBudgetLocked || (isKai && (me.kaiSkillUsesRound || 0) >= 2) || takumiBudgetLocked || cassiusLocked || veilLocked || ktBasicLocked || (isHakuno && me.hakunoGenderSwitched) || doomBasicLocked || takutoBasicPending || tepeuCookLocked || tepeuPonderLocked || batStealthLocked || psBladeLocked} onUse={requestSkillUse} cooldown={witchMarkCd} ammo={isGambler ? me.gamblerUses : undefined} cost={isGambler && goldenOn ? halfCost(ch?.basic) : undefined} />
                  </div>
                  <div className="w-40 sm:w-48">
                    <SkillSlot size="lg" label="รอง" tier="secondary" skill={ch?.secondary} points={me.skillPoints} disabled={done || phase !== "PLAYING" || noSkill || moonCellOn || miyakoComboPending || hakunoSecondaryPending || triggerCircleLocked || triggerMultiLocked || triggerZeperionLocked || (me.skillUsed && !isByleth && !isBard && !isDoomguy && !isKai && !isTakumi) || bylethSecLocked || bylethBudgetLocked || (isKai && (me.kaiSkillUsesRound || 0) >= 2) || takumiBudgetLocked || shCharging || rgCharging || phenexTaunting || bardNoteLocked || ohgerLocked || lanLocked || ktSecLocked || skSecLocked || banagherAssaultLocked || doomNoEffectLocked || takutoSecPending || takutoNotApprivoiseLocked || monsterMe || tepeuPonderLocked || tepeuCookLocked || batKarmaLocked || psSealLocked || harukaSecLocked || burdenCooldown} onUse={requestSkillUse} cooldown={burdenCd} ammo={isApple ? me.appleGiveUses : me.beamAmmo} cost={isGambler && goldenOn ? halfCost(ch?.secondary) : undefined} />
                  </div>
                  <div className="w-40 sm:w-48">
                    {isBard ? <BardComposeSlot me={me} /> : isKai ? <KaiOverhaulSlot me={me} /> : <SkillSlot size="lg" label="ท่าไม้ตาย" tier="ultimate" skill={ch?.ultimate} points={me.skillPoints} disabled={(done || phase !== "PLAYING" || noSkill || moonCellOn || beatMe || (me.skillUsed && !isByleth) || bylethUltLocked || bylethBudgetLocked || ultimateActive || triggerCircleLocked || triggerMultiLocked || triggerZeperionLocked || takumiBudgetLocked || monsterMe || fourthLocked || doomUltLocked || takutoUltLockedNow || tepeuCookLocked || tepeuPonderLocked || offerLocked || ktUltLocked || shUltLocked || shCharging || rgCharging || phenexTaunting)} onUse={requestSkillUse} cost={undefined} />}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-echo-gold text-hard tracking-wider" style={{ fontFamily: P_DISPLAY }}>SP</span>
                  <div className="flex gap-1">
                    {Array.from({ length: me.maxSkill }, (_, i) => (
                      <span
                        key={i}
                        className="p-sp-cell w-6 sm:w-7 h-4 sm:h-5"
                        style={
                          i < me.skillPoints
                            ? { background: "linear-gradient(180deg,#f6d371,var(--color-echo-gold))", boxShadow: "0 0 7px rgba(229,179,59,.85)" }
                            : { background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)" }
                        }
                      />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-hard whitespace-nowrap">{me.skillPoints}/{me.maxSkill}</span>
                </div>
                {ch?.id === "nanaya" && phase === "PLAYING" && me.alive && !done && (
                  <button
                    onClick={nanayaToggleEye}
                    disabled={me.nanayaToggleUsed}
                    className={`text-[10px] font-bold rounded-lg px-2 py-1 border ${me.nanayaEyeOn ? "bg-echo-hp/30 border-echo-hp" : "bg-white/5 border-white/20"} disabled:opacity-40`}
                    title="Mystic eye of death perception"
                  >
                    👁️ Mystic eye — {me.nanayaEyeOn ? "เปิดอยู่" : "ปิดอยู่"}
                  </button>
                )}
              </div>

              <div className="p-hs-tab-group">
                <button
                  onClick={() => { clickSound(); setBagOpen(true); }}
                  className="p-hs-tab p-hs-tab-bag w-28 sm:w-36 h-11 sm:h-12 px-2 sm:px-3"
                  title="กระเป๋า"
                >
                  <span className="text-xl sm:text-2xl">🎒</span>
                  <span className="text-xs sm:text-sm font-black text-echo-cyan" style={{ fontFamily: P_DISPLAY }}>กระเป๋า</span>
                  {me.inventory?.length > 0 && (
                    <span className="ml-auto text-[10px] font-black bg-black text-white rounded-full w-5 h-5 grid place-items-center shrink-0">{me.inventory.length}</span>
                  )}
                </button>
                <button
                  onClick={() => { clickSound(); setShopOpen(true); }}
                  className="p-hs-tab p-hs-tab-shop w-28 sm:w-36 h-11 sm:h-12 px-2 sm:px-3"
                  title="ร้านค้า"
                >
                  <span className="text-xl sm:text-2xl">🏪</span>
                  <span className="text-xs sm:text-sm font-black text-echo-hp" style={{ fontFamily: P_DISPLAY }}>ร้านค้า</span>
                  <span className="ml-auto text-xs sm:text-sm font-black text-echo-gold whitespace-nowrap shrink-0">🪙{me.gold ?? 0}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- เฟสสรุปผล: ลีดเดอร์บอร์ด (กลางจอ) ---------- */}
      {phase === "SUMMARY" && (
        <div className="absolute top-[14%] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-0 pointer-events-none">
          <div className="pop-in relative w-full min-w-[24rem] rounded-t-2xl px-6 py-2.5 text-center overflow-hidden" style={{ background: "linear-gradient(120deg,var(--color-p-accent),var(--color-p-accent-deep))" }}>
            <span className="relative text-xl sm:text-2xl font-black text-white text-hard tracking-wide">ผลการจั่วไพ่รอบนี้</span>
          </div>
          <div className="pop-in flex flex-col gap-3 rounded-b-2xl px-6 sm:px-8 py-5 min-w-[24rem] max-h-[65vh] overflow-y-auto bg-gradient-to-b from-slate-900/97 to-black/97 border-x border-b border-white/10 shadow-2xl backdrop-blur-md pointer-events-auto">
            <SummaryTiers winners={summaryWinners} losers={summaryLosers} />
          </div>
        </div>
      )}

      {/* ---------- อนิเมชันเปลี่ยนเฟส (กลางจอ) ---------- */}
      {PHASE_NAMES[phase] && (
        <div key={`${phase}-${state.roundNumber}`} className="phase-intro absolute top-[38%] left-1/2 z-40 pointer-events-none">
          <div className="text-4xl sm:text-5xl font-black bg-black/70 rounded-full px-8 py-3 whitespace-nowrap text-white text-hard border-2 border-white/20">{PHASE_NAMES[phase]}</div>
        </div>
      )}

      {/* ---------- overlay ที่ใช้ร่วมกับมือถือ ---------- */}
      <OverlayLayer phase={phase} attack={state.attack} csAnnounce={csAnnounce} csSkipped={csSkipped} timeLeft={state.timeLeft} flash={flash} notice={notice} cycleFx={cycleFx} overloadForce={state.overloadForce} bylethCourse={state.bylethFieldFx} onOpenBylethCourse={() => setBylethInfoOpen(true)} />
      <FlyingCardsLayer flights={cardFlights} onDone={removeCardFlight} />
      {state.yunaFieldFx === "beatbark" && <div className="field-fx-beatbark" />}
      {state.bylethFieldFx && <div className={`field-fx-byleth-${state.bylethFieldFx}`} />}
        {/* คอนเนอร์ RK800: ออร่าขอบจอแดงดุดัน + สกอร์ดวลระหว่างการไล่ล่า (เกตเดียวกับผลจริงของโหมดไล่ล่า) */}
        {state.connorFieldFx === "chase" && <div className="field-fx-connor-chase" />}
        {state.connorChase && <ConnorChaseHud chase={state.connorChase} />}
      {bylethSwordOpen && me && <BylethSwordModal me={me} onPick={pickBylethSword} onClose={() => setBylethSwordOpen(false)} />}
      {bylethCourseOpen && me && <BylethCourseModal me={me} onPick={pickBylethCourse} onClose={() => setBylethCourseOpen(false)} />}
      {bylethInfoOpen && <BylethCourseInfoModal course={state.bylethFieldFx} onClose={() => setBylethInfoOpen(false)} />}

      {/* ---------- แบนเนอร์รอบถัดไป ---------- */}
      {phase === "TRANSITION" && (
        <div className="absolute inset-0 grid place-items-center bg-black/40 z-30">
          <div className="round-banner text-6xl sm:text-8xl font-black text-white text-hard">
            รอบที่ {state.roundNumber + 1}
          </div>
        </div>
      )}

      {/* ---------- จบเกม ---------- */}
      {phase === "GAMEOVER" && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 z-30">
          <div className="text-center">
            <div className="text-4xl sm:text-5xl font-black mb-4">
              {(() => {
                if (state.yuukiVictory) return <>☠️ ผู้เล่นทั้งหมดพ่ายแพ้ต่อ ยูกิ Overload</>;
                if (state.overloadVictory) return <>🏆 ผู้เล่นทุกคนเอาชนะ ยูกิ Overload!</>;
                if (state.gameMode !== "ffa" && state.winningTeamId) { const ws = state.players.filter((p) => p.alive && p.teamId === state.winningTeamId); const names = ws.map((w) => w.name).join(" & "); return <>🏆 Team {state.winningTeamId}{names ? ` (${names})` : ""} ชนะ!</>; }
                  if (state.allyWin) { const ws = state.players.filter((p) => p.alive); return <>🤝 {ws.map((w) => w.name).join(" & ")} ชนะทั้งคู่!</>; }
                  const c = state.players.find((p) => p.alive); return c ? <>🏆 {c.name} ชนะ!</> : "จบเกม";
              })()}
            </div>
            <Button onClick={() => { clickSound(); socket.emit("backToLobby"); }}>🏠 กลับห้องรอ</Button>
          </div>
        </div>
      )}

      {/* ---------- modal รายละเอียดตัวละคร / ดูสถานะผู้เล่น ---------- */}
      <ModalMounts
        showChar={showChar} ch={ch} me={me} onCloseChar={() => setShowChar(false)}
        hakunoCmdOpen={hakunoCmdOpen} onUseHakunoCmd={useHakunoCmd} onCloseHakunoCmd={() => setHakunoCmdOpen(false)}
        appleOpen={appleOpen} onPickAppleItem={pickAppleItem} onCloseApple={() => setAppleOpen(false)}
        tohnoOpen={tohnoOpen} onPickTohnoLevel={pickTohnoLevel} onCloseTohno={() => setTohnoOpen(false)}
        connorArrestAsk={state.connorArrestAsk} onAnswerConnorArrest={(submit) => socket.emit("connorArrestAnswer", { submit })}
          contractOffer={state.contractOffer} onAnswerContract={(a) => socket.emit("contractAnswer", { accept: a, fromId: state.contractOffer?.fromId })}
        locaOffer={state.locaOffer} onAnswerLoca={(a) => socket.emit("locaAnswer", { accept: a, fromId: state.locaOffer?.fromId })}
        renewAsk={state.renewAsk} onAnswerRenew={(a) => socket.emit("contractAnswer", { accept: a })}
        allyChoices={state.allyChoices} onPickAlly={(id) => socket.emit("riddheAlly", { targetId: id })} onDeclineAlly={() => socket.emit("riddheAlly", {})}
        phenexReleaseAsk={state.phenexReleaseAsk} onPickPhenexRelease={(id) => socket.emit("phenexRelease", { targetId: id })}
        batKarmaAsk={state.batKarmaAsk} onPickBatKarma={(id) => socket.emit("batKarmaSend", { targetId: id })}
        allyOfferAsk={state.allyOfferAsk} onAnswerAllyOffer={(a) => socket.emit("allyAnswer", { accept: a, fromId: state.allyOfferAsk?.fromId })}
        allyBreakAsk={state.allyBreakAsk} onAnswerAllyBreak={(c) => socket.emit("allyBreakAnswer", { cancel: c })}
        allyFinalAsk={state.allyFinalAsk} onAnswerAllyFinal={(k) => socket.emit("allyFinalAnswer", { keep: k })}
        statusView={statusView} statusViewIsSelf={statusViewId === state.youId} onCloseStatus={() => setStatusViewId(null)}
        shopOpen={shopOpen} shop={state.shop} onCloseShop={() => setShopOpen(false)}
        bagOpen={bagOpen} onCloseBag={() => setBagOpen(false)} players={state.players} gameState={state.gameState} roundNumber={state.roundNumber} onPickGunAmmo={startGunPick}
        skillConfirm={skillConfirm} onConfirmSkill={confirmSkillUse} onCancelSkill={cancelSkillConfirm}
      />
      </div>
    </div>
  );
}
