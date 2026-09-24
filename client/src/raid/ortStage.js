// ORT (บอสมหันตภัย) — เอนจินอนิเมชันบน canvas ล้วน ไม่ผูกกับ React / state ของเกม
//  ใช้ภาพวาดนิ่ง 2 ภาพ (ฉากหลัง + ตัว ORT) แล้วขยับด้วยโค้ด: ท่าทาง = keyframe (สเกล/ตำแหน่งเท้า/เอียง)
//  + เอฟเฟกต์ (สั่นจอ แฟลช กลิตช์ อนุภาค) — ภาพเดียวแยกแขนขาไม่ได้ "เดิน" จึงเป็นการโยกตัวกระแทกพื้น
//  ตอนนี้ใช้กับหน้าตัวอย่าง (RaidPreview) — ภายหลังจะผูก play(...) กับ event จาก server

export const ORT_IMG = {
  scene: "/characters/ort/ort_scene.jpg",
  body: "/characters/ort/ort_body.jpg",
};
export const ORT_ATK_MAX = 3;   // พลังโจมตีสูงสุดของ ORT (รวมที่ได้จากวิวัฒนาการแล้ว)
export const ORT_BAR_HP = 7;
export const ORT_BAR_ARMOR = 3;

const FONT_DISPLAY = '"Chakra Petch", "Kanit", sans-serif';

const K = (p, s = 0, y = 0, r = 0, x = 0) => ({ p, s, y, r, x });
// s = สเกลที่บวกเพิ่ม · y = เลื่อนเท้า (สัดส่วนของ H) · r = เอียง (เรเดียน) · x = เลื่อนข้าง (สัดส่วนของ W)
const ACTS = {
  intro:   { dur: 4.8, kf: [K(0), K(1)] },
  walk:    { dur: 3.2, kf: [K(0), K(1)] },
  attack:  { dur: 1.1, kf: [K(0), K(.32, -.03, -.025, -.02), K(.44, .3, .07, .01), K(.6, .26, .06), K(1)] },
  crit:    { dur: 1.35, kf: [K(0), K(.34, -.05, -.035, -.03), K(.46, .36, .08, .015), K(.64, .32, .075), K(1)] },
  hit:     { dur: .7, kf: [K(0), K(.1, -.05, -.012, .04, .02), K(1)] },
  counter: { dur: 1.35, kf: [K(0), K(.1, -.05, -.01, .04, .02), K(.3, -.03, -.02, -.02), K(.42, .3, .07, .01), K(.58, .26, .06), K(1)] },
  break:   { dur: 1.3, kf: [K(0), K(.1, -.07, .02, -.035), K(.35, .04, 0, .01), K(1)] },
  evolve:  { dur: 1.6, kf: [K(0), K(.3, -.04, .02), K(.55, .1, -.03), K(1)] },
  lost:    { dur: 1.5, kf: [K(0), K(1)] },
};
export const ORT_ACTIONS = Object.keys(ACTS);

const ease = (k) => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function sampleKF(kf, p) {
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i], b = kf[i + 1];
    if (p >= a.p && p <= b.p) {
      const k = ease((p - a.p) / Math.max(1e-6, b.p - a.p));
      return { s: a.s + (b.s - a.s) * k, y: a.y + (b.y - a.y) * k, r: a.r + (b.r - a.r) * k, x: a.x + (b.x - a.x) * k };
    }
  }
  return { s: 0, y: 0, r: 0, x: 0 };
}

const loadImg = (src) => new Promise((res) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => res(null);
  i.src = src;
});

function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

// ขอบภาพจางเป็นวงรี ให้ตัวละครกลืนไปกับฉาก (ภาพต้นฉบับเป็นสี่เหลี่ยมมีพื้นหลังติดมา)
function feather(g, w, h) {
  g.globalCompositeOperation = "destination-in";
  g.save();
  g.translate(w / 2, h * .5);
  g.scale(1, (h / w) * 1.08);
  const r = w * .5;
  const gr = g.createRadialGradient(0, 0, r * .62, 0, 0, r);
  gr.addColorStop(0, "rgba(0,0,0,1)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(-r, -r * 1.3, r * 2, r * 2.6);
  g.restore();
  g.globalCompositeOperation = "source-over";
}

function prepSprites(img) {
  const w = img.width, h = img.height;
  const sprite = makeCanvas(w, h);
  const sg = sprite.getContext("2d");
  sg.drawImage(img, 0, 0);
  feather(sg, w, h);

  // ชั้นเรืองแสง: ดึงเฉพาะพิกเซลโทนฟ้าไซยานสว่าง แล้วเอาไปเบลอ+บวกแสงทับ
  const glow = makeCanvas(w, h);
  const gg = glow.getContext("2d");
  gg.drawImage(img, 0, 0);
  try {
    const d = gg.getImageData(0, 0, w, h), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const a = (b > 150 && g > 110 && b - r > 50) ? Math.min(255, (b - 150) * 2.4 + (g - 110)) : 0;
      px[i] = 110; px[i + 1] = 235; px[i + 2] = 255; px[i + 3] = a;
    }
    gg.putImageData(d, 0, 0);
  } catch { gg.clearRect(0, 0, w, h); }
  gg.globalCompositeOperation = "destination-in";
  gg.drawImage(sprite, 0, 0);

  const white = makeCanvas(w, h);
  const wg = white.getContext("2d");
  wg.drawImage(sprite, 0, 0);
  wg.globalCompositeOperation = "source-in";
  wg.fillStyle = "#f2fdff";
  wg.fillRect(0, 0, w, h);
  return { sprite, glow, white };
}

/**
 * createOrtStage(canvas, { lowQ, onHud, demo })
 *  - demo = true  (หน้าตัวอย่าง): ท่าทางแก้หลอดเลือด/พลังโจมตีจำลองเอง + โชว์ตัวเลขดาเมจ
 *  - demo = false (บนกระดานจริง): เลือด/หลอดมาจาก server — ท่าทางเป็นแค่ภาพ ไม่แตะตัวเลข
 *  - play(name)  เล่นท่า (ดู ORT_ACTIONS)
 *  - setLowQ(v)  โหมดประหยัด: ตัดอนุภาคส่วนใหญ่ + ไม่สั่นจอ
 *  - destroy()
 * onHud(S) ถูกเรียกทุกครั้งที่หลอดเลือด/เกราะ/พลังโจมตีเปลี่ยน (ใช้วาด HUD ฝั่ง React)
 */
export function createOrtStage(canvas, { lowQ = false, onHud = () => {}, onActionEnd = () => {}, demo = true } = {}) {
  const ctx = canvas.getContext("2d");
  const prefersReduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let calm = lowQ || prefersReduce;
  let W = 0, H = 0, dpr = 1, raf = 0, dead = false;
  let scene = null, spr = null, bg = null;

  const S = { bars: 5, hp: ORT_BAR_HP, armor: ORT_BAR_ARMOR, atk: 1 };
  const emitHud = () => onHud({ ...S });

  let motes = [], dust = [], shards = [], rings = [], texts = [], slashes = [], bursts = [], inbound = [];
  const fx = { shake: 0, flash: 0, flashColor: "62,230,255", bossFlash: 0, glitch: 0, glowBoost: 0, hitstop: 0, lostText: 0 };
  let act = null, advance = 0, holdAdvance = 0, lastStep = -1;
  let bossAlpha = 1, rift = 0, titleT = 0;

  function seedMotes() {
    const n = calm ? 18 : 70;
    motes = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vy: 8 + Math.random() * 26, s: .8 + Math.random() * 1.8, ph: Math.random() * 6.28 }));
  }
  function prepBg() {
    if (!scene || !W) { bg = null; return; }
    bg = makeCanvas(Math.round(W * 1.15), Math.round(H * 1.15));
    const g = bg.getContext("2d");
    const s = Math.max(bg.width / scene.width, bg.height / scene.height);
    const sw = scene.width * s, sh = scene.height * s;
    g.filter = "blur(4px) saturate(1.15)";
    g.drawImage(scene, (bg.width - sw) / 2, (bg.height - sh) / 2, sw, sh);
    g.filter = "none";
    const v = g.createLinearGradient(0, 0, 0, bg.height);
    v.addColorStop(0, "rgba(3,6,22,.72)"); v.addColorStop(.55, "rgba(5,8,28,.5)"); v.addColorStop(1, "rgba(2,4,14,.9)");
    g.fillStyle = v;
    g.fillRect(0, 0, bg.width, bg.height);
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    prepBg();
    seedMotes();
  }
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);

  // ---------- เอฟเฟกต์ ----------
  const shake = (n) => { if (!calm) fx.shake = Math.max(fx.shake, n); };
  function addText(text, color, size, x, y) { texts.push({ text, color, size, x: x ?? W / 2, y: y ?? H * .42, vy: -40, life: 1.3, max: 1.3 }); }
  function stomp(x) {
    shake(9);
    rings.push({ x, y: H * .965, r: 10, life: .7, max: .7 });
    const n = calm ? 5 : 18;
    for (let i = 0; i < n; i++) dust.push({ x, y: H * .96, vx: (Math.random() - .5) * 260, vy: -Math.random() * 60, life: .9, max: .9, s: 2 + Math.random() * 4 });
  }
  function shatter() {
    const n = calm ? 12 : 46;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 120 + Math.random() * 380;
      shards.push({ x: W / 2 + (Math.random() - .5) * W * .2, y: H * .5 + (Math.random() - .5) * H * .3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
        rot: Math.random() * 6.28, vr: (Math.random() - .5) * 12, s: 6 + Math.random() * 16, life: 1.4, max: 1.4 });
    }
  }
  function burst() {
    const n = calm ? 14 : 60;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 60 + Math.random() * 240;
      bursts.push({ x: W / 2, y: H * .55, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .6 - 80, life: 1.2, max: 1.2, s: 1.5 + Math.random() * 2.5 });
    }
  }
  // เปิดตัว: เศษข้อมูลพุ่งจากขอบจอเข้าหาตัว ORT (ประกอบร่าง)
  function gatherShards() {
    const n = calm ? 16 : 60;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, d = Math.max(W, H) * (.6 + Math.random() * .5);
      const tx = W / 2 + (Math.random() - .5) * W * .25, ty = H * .55 + (Math.random() - .5) * H * .5;
      inbound.push({ sx: tx + Math.cos(a) * d, sy: ty + Math.sin(a) * d, tx, ty, t: -Math.random() * .6, dur: .9 + Math.random() * .5, s: 4 + Math.random() * 10, rot: Math.random() * 6.28 });
    }
  }
  function impact(crit) {
    const dmg = crit ? S.atk * 2 : S.atk;
    fx.flash = crit ? .9 : .55;
    fx.flashColor = crit ? "255,61,110" : "62,230,255";
    shake(crit ? 22 : 13);
    if (crit) { fx.hitstop = .16; fx.glitch = Math.max(fx.glitch, .18); }
    slashes.push({ crit, life: .45, max: .45, seed: Math.random() });
    if (demo) addText(crit ? `−${dmg}  คริติคอล` : `−${dmg}`, crit ? "#ff3d6e" : "#d4f7ff", crit ? 50 : 40, W / 2, H * .62);
    else if (crit) addText("คริติคอล ×2", "#ff3d6e", 46, W / 2, H * .62);
  }
  function takeHit() {
    fx.bossFlash = 1;
    shake(7);
    if (!demo) return;
    if (S.armor > 0) S.armor--; else S.hp--;
    addText("−1", "#ffe0e7", 28, W / 2 + W * .08, H * .38);
    emitHud();
    if (S.hp <= 0) setTimeout(() => { if (!dead) play("break"); }, 350);
  }
  function breakBar() {
    fx.flash = 1; fx.flashColor = "212,247,255";
    shake(20);
    fx.glitch = Math.max(fx.glitch, .45);
    shatter();
    if (!demo) { addText("หลอดแตก!", "#d4f7ff", 36, W / 2, H * .36); return; }
    if (S.bars > 1) {
      S.bars--; S.hp = ORT_BAR_HP; S.armor = ORT_BAR_ARMOR;
      addText(`หลอดแตก · เหลือ ${S.bars} หลอด`, "#d4f7ff", 32, W / 2, H * .36);
    } else {
      S.bars = 5; S.hp = ORT_BAR_HP; S.armor = ORT_BAR_ARMOR; S.atk = 1;
      addText("ORT ถูกโค่น · เริ่มสาธิตใหม่", "#d4f7ff", 30, W / 2, H * .36);
    }
    emitHud();
  }
  function evolve() {
    if (!demo) {
      fx.glowBoost = 1.6; fx.flash = .4; fx.flashColor = "122,92,255";
      burst();
      addText("วิวัฒนาการ!", "#bfb0ff", 32, W / 2, H * .34);
      return;
    }
    S.bars++;
    const atkUp = S.atk < ORT_ATK_MAX;
    if (atkUp) S.atk++;
    fx.glowBoost = 1.6; fx.flash = .4; fx.flashColor = "122,92,255";
    burst();
    addText(atkUp ? "วิวัฒนาการ · +1 หลอด · พลังโจมตี +1" : "วิวัฒนาการ · +1 หลอด (พลังโจมตีเต็มแล้ว)", "#bfb0ff", 26, W / 2, H * .34);
    emitHud();
  }

  const EVENTS = {
    intro: [[0, () => { bossAlpha = 0; rift = 0; titleT = 0; fx.glitch = 0; }], [.16, () => gatherShards()],
      [.46, () => { fx.flash = 1; fx.flashColor = "212,247,255"; shake(26); rings.push({ x: W / 2, y: H * .965, r: 10, life: 1, max: 1 }); fx.glowBoost = 2; burst(); }]],
    attack: [[.43, () => impact(false)]],
    crit: [[.45, () => impact(true)]],
    hit: [[0, () => takeHit()]],
    counter: [[0, () => takeHit()], [.18, () => addText("สวนกลับ!", "#3ee6ff", 34, W / 2, H * .3)], [.41, () => impact(demo && Math.random() < .75)]],
    break: [[0, () => breakBar()]],
    evolve: [[.5, () => evolve()]],
    lost: [[0, () => { fx.glitch = 1.4; fx.lostText = 1.5; }]],
    walk: [],
  };

  function play(name) {
    const a = ACTS[name];
    if (!a || dead) return;
    act = { name, t: 0, dur: a.dur, kf: a.kf, ev: (EVENTS[name] || []).map(([p, fn]) => ({ p, fn, done: false })) };
    if (name === "walk") lastStep = -1;
    if (name !== "intro") { bossAlpha = 1; rift = 0; titleT = 0; }
  }

  // ---------- วาด ----------
  function drawBoss(tt, pose) {
    if (!spr || bossAlpha <= 0) return;
    const { sprite, glow, white } = spr;
    const breath = Math.sin(tt * 1.3);
    const s = 1 + advance * .14 + pose.s;
    const h = H * .9 * s;
    const w = h * sprite.width / sprite.height;
    const cx = W / 2 + pose.x * W;
    const footY = H + pose.y * H + advance * H * .03 + Math.sin(tt * .9) * H * .006;

    ctx.save();
    ctx.globalAlpha = bossAlpha;
    ctx.globalCompositeOperation = "lighter";
    const gg = ctx.createRadialGradient(cx, H * .97, 4, cx, H * .97, w * .55);
    gg.addColorStop(0, `rgba(62,230,255,${.28 + fx.glowBoost * .12})`);
    gg.addColorStop(1, "rgba(62,230,255,0)");
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.ellipse(cx, H * .97, w * .55, H * .07, 0, 0, 6.29); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, footY);
    ctx.rotate(pose.r + Math.sin(tt * .55) * .008);
    ctx.scale(1 - breath * .006, 1 + breath * .012);
    const X = -w / 2, Y = -h;
    ctx.globalAlpha = bossAlpha;
    if (fx.glitch > 0) {
      const slices = 14, g = Math.min(1, fx.glitch * 2);
      for (let i = 0; i < slices; i++) {
        const sh = sprite.height / slices, dh = h / slices;
        const off = Math.random() < .5 ? 0 : (Math.random() - .5) * w * .18 * g;
        ctx.drawImage(sprite, 0, i * sh, sprite.width, sh, X + off, Y + i * dh, w, dh);
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = .35 * g * bossAlpha;
      ctx.drawImage(glow, X + 8, Y, w, h);
      ctx.drawImage(glow, X - 8, Y, w, h);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.drawImage(sprite, X, Y, w, h);
    }
    const pulse = .55 + .35 * Math.sin(tt * 2.1) + fx.glowBoost * .5;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, pulse * .6) * bossAlpha;
    if (!calm) ctx.filter = "blur(7px)";
    ctx.drawImage(glow, X, Y, w, h);
    ctx.filter = "none";
    ctx.globalAlpha = Math.min(1, pulse * .45) * bossAlpha;
    ctx.drawImage(glow, X, Y, w, h);
    if (fx.bossFlash > 0) { ctx.globalAlpha = fx.bossFlash * .85; ctx.drawImage(white, X, Y, w, h); }
    ctx.restore();
  }

  function drawRift() {
    if (rift <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const hw = 2 + rift * W * .03, a = Math.min(1, rift * 1.4);
    const g = ctx.createLinearGradient(W / 2 - hw * 4, 0, W / 2 + hw * 4, 0);
    g.addColorStop(0, "rgba(62,230,255,0)");
    g.addColorStop(.5, `rgba(200,250,255,${a})`);
    g.addColorStop(1, "rgba(62,230,255,0)");
    ctx.fillStyle = g;
    const top = H * (.5 - .5 * Math.min(1, rift * 1.6));
    ctx.fillRect(W / 2 - hw * 4, top, hw * 8, H - top * 2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(W / 2 - 1, top, 2, H - top * 2);
    ctx.restore();
  }

  function drawFx(dt) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const now = performance.now();
    for (const m of motes) {
      m.y -= m.vy * dt; m.x += Math.sin(m.ph + m.y * .02) * 6 * dt;
      if (m.y < -5) { m.y = H + 5; m.x = Math.random() * W; }
      ctx.fillStyle = `rgba(150,240,255,${.35 + .35 * Math.sin(m.ph + now * .002)})`;
      ctx.fillRect(m.x, m.y, m.s, m.s);
    }
    for (const q of inbound) {
      q.t += dt;
      if (q.t < 0) continue;
      const k = ease(clamp01(q.t / q.dur));
      const x = q.sx + (q.tx - q.sx) * k, y = q.sy + (q.ty - q.sy) * k;
      ctx.save(); ctx.translate(x, y); ctx.rotate(q.rot + k * 4);
      ctx.fillStyle = `rgba(120,235,255,${.9 * (1 - k * .6)})`;
      ctx.fillRect(-q.s / 2, -q.s / 5, q.s, q.s / 2.5);
      ctx.restore();
    }
    inbound = inbound.filter((q) => q.t < q.dur);
    for (const b of bursts) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 40 * dt; b.life -= dt;
      ctx.fillStyle = `rgba(190,170,255,${Math.max(0, b.life / b.max)})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.s, 0, 6.29); ctx.fill();
    }
    for (const r of rings) {
      r.r += 520 * dt; r.life -= dt;
      ctx.strokeStyle = `rgba(62,230,255,${Math.max(0, r.life / r.max) * .8})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * .16, 0, 0, 6.29); ctx.stroke();
    }
    for (const s of slashes) {
      s.life -= dt;
      const k = 1 - s.life / s.max, a = Math.max(0, s.life / s.max);
      const col = s.crit ? "255,61,110" : "62,230,255";
      for (let i = 0; i < (s.crit ? 3 : 2); i++) {
        const oy = (i - .5) * H * .09 + s.seed * 20;
        ctx.beginPath();
        ctx.moveTo(W * (.1 + k * .2), H * (.2 + i * .06) + oy);
        ctx.quadraticCurveTo(W * .5, H * .75 + oy, W * (.9 - k * .2), H * (.35 + i * .05) + oy);
        ctx.strokeStyle = `rgba(${col},${a})`; ctx.lineWidth = (s.crit ? 10 : 7) * a + 1; ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${a * .8})`; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    for (const d of dust) {
      d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 90 * dt; d.vx *= .96; d.life -= dt;
      ctx.fillStyle = `rgba(120,140,190,${Math.max(0, d.life / d.max) * .55})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, 6.29); ctx.fill();
    }
    for (const s of shards) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 420 * dt; s.rot += s.vr * dt; s.life -= dt;
      const a = Math.max(0, s.life / s.max);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
      ctx.beginPath(); ctx.moveTo(0, -s.s); ctx.lineTo(s.s * .45, s.s * .6); ctx.lineTo(-s.s * .5, s.s * .3); ctx.closePath();
      ctx.fillStyle = `rgba(62,230,255,${a * .85})`; ctx.fill();
      ctx.strokeStyle = `rgba(230,252,255,${a})`; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    ctx.textAlign = "center";
    for (const t of texts) {
      t.y += t.vy * dt; t.vy *= .96; t.life -= dt;
      const a = clamp01(t.life / t.max * 1.6);
      ctx.font = `700 ${Math.round(t.size * Math.min(1, W / 700) + 6)}px ${FONT_DISPLAY}`;
      ctx.lineWidth = 5; ctx.strokeStyle = `rgba(3,6,20,${a * .9})`; ctx.strokeText(t.text, t.x, t.y);
      ctx.globalAlpha = a; ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); ctx.globalAlpha = 1;
    }
    ctx.restore();
    const alive = (x) => x.life > 0;
    bursts = bursts.filter(alive); rings = rings.filter(alive); slashes = slashes.filter(alive);
    dust = dust.filter(alive); shards = shards.filter(alive); texts = texts.filter(alive);
  }

  const GLYPHS = "▓▒░█#@%&$ØΞ";
  function scramble(str, amt) {
    let s = "";
    for (const c of str) s += Math.random() < amt ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : c;
    return s;
  }
  function splitText(text, x, y) {
    ctx.fillStyle = "rgba(255,61,110,.8)"; ctx.fillText(text, x + 3, y);
    ctx.fillStyle = "rgba(62,230,255,.8)"; ctx.fillText(text, x - 3, y);
    ctx.fillStyle = "#eafcff"; ctx.fillText(text, x, y);
  }
  function drawLostOverlay() {
    if (fx.lostText <= 0) return;
    const a = Math.min(1, fx.lostText * 1.5);
    const fs = Math.round(Math.min(64, W / 11));
    ctx.save();
    ctx.textAlign = "center";
    ctx.globalAlpha = a;
    ctx.font = `700 ${Math.round(fs * .55)}px ${FONT_DISPLAY}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(fs * .12)}px`;
    splitText(scramble("DATA LOST", .3 * a), W / 2, H * .56 - fs * .95);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.font = `700 ${fs}px ${FONT_DISPLAY}`;
    splitText(scramble("ข้อมูลสูญหาย", .25 * a), W / 2, H * .56);
    ctx.font = `500 ${Math.round(fs * .3)}px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#8a9bc9";
    ctx.fillText("สกิลนี้ใช้ไม่ได้ในเทิร์นถัดไป", W / 2, H * .56 + fs * .6);
    ctx.globalAlpha = a * .25; ctx.fillStyle = "#000";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.restore();
  }
  function drawTitle() {
    if (titleT <= 0) return;
    const a = clamp01(titleT);
    const fs = Math.round(Math.min(150, W / 6));
    ctx.save();
    ctx.textAlign = "center";
    ctx.globalAlpha = a;
    const band = ctx.createLinearGradient(0, H * .3, 0, H * .7);
    band.addColorStop(0, "rgba(3,6,20,0)"); band.addColorStop(.5, "rgba(3,6,20,.6)"); band.addColorStop(1, "rgba(3,6,20,0)");
    ctx.fillStyle = band; ctx.fillRect(0, H * .3, W, H * .4);
    ctx.font = `700 ${fs}px ${FONT_DISPLAY}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(fs * .18)}px`;
    splitText(scramble("ORT", titleT > .9 ? 0 : .3), W / 2, H * .53);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.font = `600 ${Math.round(fs * .2)}px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ff8fab";
    ctx.fillText("มหันตภัย", W / 2, H * .53 + fs * .42);
    ctx.font = `500 ${Math.round(fs * .14)}px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#a9b8e0";
    ctx.fillText("ศัตรูของเหล่า Echo", W / 2, H * .53 + fs * .64);
    ctx.restore();
  }

  // ---------- ลูป ----------
  let last = 0, gt = 0;
  function frame(now) {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (!W) { resize(); last = now; return; }
    const rdt = Math.min(.05, (now - (last || now)) / 1000);
    last = now;
    const dt = fx.hitstop > 0 ? rdt * .08 : rdt;
    fx.hitstop = Math.max(0, fx.hitstop - rdt);
    gt += dt;

    let pose = { s: 0, y: 0, r: 0, x: 0 };
    if (act) {
      act.t += dt;
      const p = Math.min(1, act.t / act.dur);
      pose = sampleKF(act.kf, p);
      for (const e of act.ev) if (!e.done && p >= e.p) { e.done = true; e.fn(); }
      if (act.name === "intro") {
        rift = p < .16 ? p / .16 : p < .5 ? 1 - (p - .16) / .34 : 0;
        bossAlpha = p < .22 ? 0 : clamp01((p - .22) / .24);
        if (p > .2 && p < .46) fx.glitch = Math.max(fx.glitch, (.46 - p) * 3);
        pose.s += p < .46 ? -.15 * (1 - (p - .2) / .26) : 0;
        titleT = p < .52 ? 0 : p < .62 ? (p - .52) / .1 : p < .88 ? 1 : 1 - (p - .88) / .12;
      }
      if (act.name === "walk") {
        const steps = 4, sp = (p * steps) % 1, idx = Math.min(steps - 1, Math.floor(p * steps));
        const lift = Math.sin(Math.PI * sp), dir = idx % 2 ? 1 : -1;
        pose.y -= lift * .022; pose.r += dir * lift * .028; pose.x += dir * lift * .008;
        advance = Math.min(1, advance + dt / act.dur * 1.05);
        if (idx !== lastStep && lastStep !== -1) stomp(W / 2 + (lastStep % 2 ? 1 : -1) * W * .07);
        lastStep = idx;
      }
      if (p >= 1) {
        const done = act.name;
        if (done === "walk") { stomp(W / 2 + W * .07); holdAdvance = 1.2; }
        if (done === "intro") { bossAlpha = 1; rift = 0; titleT = 0; }
        act = null;
        onActionEnd(done);
      }
    }
    if (!act || act.name !== "walk") {
      if (holdAdvance > 0) holdAdvance -= dt; else advance = Math.max(0, advance - dt * .35);
    }
    fx.flash = Math.max(0, fx.flash - rdt * 2.4);
    fx.bossFlash = Math.max(0, fx.bossFlash - rdt * 3.5);
    fx.glitch = Math.max(0, fx.glitch - rdt);
    fx.glowBoost = Math.max(0, fx.glowBoost - rdt * .8);
    fx.lostText = Math.max(0, fx.lostText - rdt);
    fx.shake = Math.max(0, fx.shake - rdt * 60);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#02040c";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (fx.shake > 0) ctx.translate((Math.random() - .5) * fx.shake, (Math.random() - .5) * fx.shake);
    if (bg) {
      const z = 1 + advance * .05;
      const bw = bg.width * z / 1.15, bh = bg.height * z / 1.15;
      const introDim = act && act.name === "intro" ? clamp01(act.t / act.dur / .46) : 1;
      ctx.globalAlpha = .25 + .75 * introDim;
      ctx.drawImage(bg, (W - bw) / 2 + Math.sin(gt * .15) * W * .015, (H - bh) / 2 - advance * H * .02, bw, bh);
      ctx.globalAlpha = 1;
    }
    drawRift();
    drawBoss(gt, pose);
    const fog = ctx.createLinearGradient(0, H * .8, 0, H);
    fog.addColorStop(0, "rgba(5,8,23,0)"); fog.addColorStop(1, "rgba(5,8,23,.85)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, H * .8, W, H * .2);
    drawFx(dt);
    ctx.restore();
    drawLostOverlay();
    drawTitle();
    if (fx.flash > 0) { ctx.fillStyle = `rgba(${fx.flashColor},${fx.flash * .45})`; ctx.fillRect(0, 0, W, H); }
    const vg = ctx.createRadialGradient(W / 2, H * .55, H * .3, W / 2, H * .55, W * .75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.6)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  Promise.all([loadImg(ORT_IMG.scene), loadImg(ORT_IMG.body)]).then(([sc, body]) => {
    if (dead) return;
    scene = sc;
    if (body) spr = prepSprites(body);
    resize();
  });
  if (demo) emitHud();
  raf = requestAnimationFrame(frame);

  return {
    play,
    busy: () => !!act,
    setLowQ(v) { calm = !!v || prefersReduce; seedMotes(); },
    destroy() { dead = true; cancelAnimationFrame(raf); ro?.disconnect(); },
  };
}
