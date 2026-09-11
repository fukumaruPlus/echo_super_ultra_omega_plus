// ============================================================
//  ไค ชิซากิ (kai) — มือซ้ายแห่งการรังสรรค์ / มือขวาแห่งการลงทัณฑ์ / Overhaul (ท่าไม้ตาย 2 ช่องพิเศษ)
//  ดู characters/index.js สำหรับไฟล์มัดรวม, server.js's useSkill()/kaiOverhaul() สำหรับจุดเรียก
//  หมายเหตุ: "รังสรรค์"/"ลงทัณฑ์" เป็นมาร์กถาวร (ไม่ลดเทิร์น — exclude จาก decay loop ใน server.js เหมือน empower)
//  ติดพร้อมกันได้หลายคน มอบให้เป้าหมายที่มีอยู่แล้วไม่ได้ (บล็อกเป็น no-op) — สะสมบนกระดานผ่าน
//  module-level array `kaiOverhaulSlots` ใน server.js (engine.kaiOverhaulSlots) ครบ 2 ช่อง = ปลดล็อกปุ่ม Overhaul
//  "เชื่อมต่อ" (kaiLink) เป็นสถานะแยกเฉพาะของไคเอง ไม่แตะ/ไม่ใช้ร่วมกับ linked/linkedWith ของ Bard เลย
// ============================================================

const KAI_LINK_TURNS = 3;    // สวรรค์ประทานพร: เชื่อมต่อ 3 เทิร์น
const KAI_RIVAL_TURNS = 3;   // โทสะระงับด้วยโทสะ: คู่ปรับ 3 เทิร์น
const KAI_SCALE_DMG = 2;     // ตาชั่งแห่งความเท่าเทียม: ดาเมจใส่ฝั่งลงทัณฑ์ (nerf จาก 3)
const KAI_SCALE_SELF_DMG = 1; // ยกเว้น: ฝั่งลงทัณฑ์คือไคเอง — ดาเมจแค่ 1
const KAI_SCALE_HEAL = 3;    // ตาชั่งแห่งความเท่าเทียม: ฟื้น HP ให้ฝั่งรังสรรค์

module.exports = {
  id: "kai",

  // เรียกจาก useSkill() ในส่วน effect — มือซ้ายแห่งการรังสรรค์ / มือขวาแห่งการลงทัณฑ์
  //  statusKey: "kaiCreation" | "kaiPunishment" — ห้ามมอบซ้ำให้เป้าหมายที่ยังมีอยู่จริง / ต้านได้ (ไม่นับเข้า tracker)
  applyMark(engine, p, target, statusKey, label) {
    target.kaiMarksBy = target.kaiMarksBy || {};
    if (!((target.statuses[statusKey] || 0) > 0)) {
      for (const marks of Object.values(target.kaiMarksBy)) delete marks[statusKey];
    }
    target.kaiMarksBy[p.id] = target.kaiMarksBy[p.id] || {};
    if (target.kaiMarksBy[p.id][statusKey]) {
      engine.log(`✋ ${target.name} มี${label}อยู่แล้ว — ${p.name} มอบซ้ำไม่ได้`);
      return ` — ${target.name} มี${label}อยู่แล้ว`;
    }
    if (!engine.applyDebuff(target, statusKey, 1, 999)) {
      engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ไม่ติด${label}`);
      return ` — ${target.name} ต้านสถานะผิดปกติ`;
    }
    target.kaiMarksBy[p.id][statusKey] = true;
    target.statuses[statusKey] = 999;
    engine.kaiOverhaulSlots.push({ ownerId: p.id, playerId: target.id, status: statusKey });
    const ownSlots = engine.kaiOverhaulSlots.filter((slot) => slot.ownerId === p.id).length;
    engine.log(`✋ ${p.name} มอบ${label}ให้ ${target.name} (ถาวรจนกว่าจะใช้ผ่าน Overhaul หรือถูกต้าน) — Overhaul ${ownSlots}/2`);
    return ` — ${target.name} ติด${label}`;
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย 1 คน (เลือกตัวเองได้) สำหรับสกิลพื้นฐาน/สกิลรอง
  prepareMarkTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive) return null;
    return t;
  },

  // สถานะที่เกี่ยวข้องกับ Overhaul หายไปนอกช่องทาง Overhaul (ตาย/ถูกล้าง) -> ลบออกจาก tracker ด้วย
  pruneOverhaulSlots(engine) {
    for (const holder of Object.values(engine.players)) {
      if (!holder.kaiMarksBy) continue;
      for (const statusKey of ["kaiCreation", "kaiPunishment"]) {
        if (!((holder.statuses[statusKey] || 0) > 0)) {
          for (const marks of Object.values(holder.kaiMarksBy)) delete marks[statusKey];
        }
      }
      for (const [ownerId, marks] of Object.entries(holder.kaiMarksBy)) {
        if (!Object.keys(marks).length) delete holder.kaiMarksBy[ownerId];
      }
    }
    engine.setKaiOverhaulSlots(engine.kaiOverhaulSlots.filter((slot) => {
      const holder = engine.players[slot.playerId];
      if (!(holder && holder.alive && (holder.statuses[slot.status] || 0) > 0)) return false;
      if (!slot.ownerId) return true; // รองรับข้อมูลแมตช์/เทสต์รูปแบบเก่า
      return !!(holder.kaiMarksBy && holder.kaiMarksBy[slot.ownerId] && holder.kaiMarksBy[slot.ownerId][slot.status]);
    }));
  },

  // เรียกจาก server.js's kaiOverhaul() socket handler — ตัดสินผลคอมโบ 1 ใน 3 แบบ
  resolveOverhaul(engine, a, aStatus, b, bStatus, kai) {
    const creationCreation = aStatus === "kaiCreation" && bStatus === "kaiCreation";
    const punishPunish = aStatus === "kaiPunishment" && bStatus === "kaiPunishment";
    if (creationCreation) {
      // สวรรค์ประทานพร — เชื่อมต่อทั้งคู่ 3 เทิร์น (เชื่อมจริงเฉพาะถ้าทั้งคู่ต้านไม่สำเร็จ)
      const aOk = engine.applyDebuff(a, "kaiLink", null, KAI_LINK_TURNS);
      const bOk = engine.applyDebuff(b, "kaiLink", null, KAI_LINK_TURNS);
      if (aOk && bOk) {
        a.kaiLinkWith = b.id;
        b.kaiLinkWith = a.id;
        engine.log(`✨🕊️ ${kai.name} Overhaul — สวรรค์ประทานพร! ${a.name} และ ${b.name} ถูกเชื่อมต่อ ${KAI_LINK_TURNS} เทิร์น (HP/เกราะแชร์กัน)`);
      } else {
        if (!aOk) engine.log(`🛡️ ${a.name} ต้านสถานะผิดปกติ — ไม่ติดเชื่อมต่อ`);
        if (!bOk) engine.log(`🛡️ ${b.name} ต้านสถานะผิดปกติ — ไม่ติดเชื่อมต่อ`);
        engine.log(`✨🕊️ ${kai.name} Overhaul — สวรรค์ประทานพร ล้มเหลวบางส่วน (ต้านสถานะผิดปกติ) — ไม่มีการเชื่อมต่อเกิดขึ้น`);
      }
    } else if (punishPunish) {
      // โทสะระงับด้วยโทสะ — คู่ปรับ resist-gated แยกอิสระต่อกันแต่ละฝ่าย
      const aOk = engine.applyDebuff(a, "kaiRival1", null, KAI_RIVAL_TURNS);
      const bOk = engine.applyDebuff(b, "kaiRival2", null, KAI_RIVAL_TURNS);
      if (aOk) a.kaiRivalId = b.id;
      if (bOk) b.kaiRivalId = a.id;
      engine.log(`✨😡 ${kai.name} Overhaul — โทสะระงับด้วยโทสะ! ${a.name}${aOk ? ` ถูกบังคับโจมตี ${b.name} เท่านั้น` : " ต้านสถานะผิดปกติ"} / ${b.name}${bOk ? ` ถูกบังคับโจมตี ${a.name} เท่านั้น` : " ต้านสถานะผิดปกติ"} (${KAI_RIVAL_TURNS} เทิร์น)`);
    } else {
      // ตาชั่งแห่งความเท่าเทียม — a/b คนละสถานะเสมอ (creation กับ punishment) — หาฝั่งลงทัณฑ์/รังสรรค์
      const punishSide = aStatus === "kaiPunishment" ? a : b;
      const creationSide = aStatus === "kaiCreation" ? a : b;
      const dmg = punishSide.id === kai.id ? KAI_SCALE_SELF_DMG : KAI_SCALE_DMG;
      engine.dealMixed(punishSide, dmg, true);
      engine.maybeBeatSave(punishSide); engine.maybeBeatMode(punishSide); engine.maybeWakeKotone(punishSide);
      punishSide.wasAttacked = true;
      if (punishSide.alive && punishSide.hp <= 0) {
        engine.instantDeath(punishSide);
        if (!punishSide.alive) engine.log(`💀 ${punishSide.name} เลือดจริงหมด ตกรอบ!`);
      }
      const heal = engine.healHp(creationSide, KAI_SCALE_HEAL);
      engine.log(`✨⚖️ ${kai.name} Overhaul — ตาชั่งแห่งความเท่าเทียม! ${punishSide.name} รับความเสียหาย -${dmg}${punishSide.id === kai.id ? " (ลงทัณฑ์ตัวเอง — ลดเหลือ 1)" : ""} (ลดเกราะก่อน) และ ${creationSide.name} ฟื้นพลังชีวิต +${heal}`);
    }
  },

  // คู่เชื่อม "เชื่อมต่อ" ของไค (แยกจาก Bard's linkedBuddyOf โดยสิ้นเชิง) — เรียกจาก server.js's loseHp/healHp/loseArmor/healArmor
  kaiLinkedBuddyOf(engine, p) {
    if (!p || ((p.statuses && p.statuses.kaiLink) || 0) <= 0 || !p.kaiLinkWith) return null;
    const b = engine.players[p.kaiLinkWith];
    return (b && b.alive && b.id !== p.id && (b.statuses.kaiLink || 0) > 0) ? b : null;
  },

  // เรียกจาก decay loop เมื่อ kaiLink/kaiRival1/kaiRival2 หมดอายุ — ล้าง mirror ทั้งสองฝั่ง
  onExpireKaiLink(p) {
    p.kaiLinkWith = null;
  },
  onExpireKaiRival(p) {
    p.kaiRivalId = null;
  },
};
