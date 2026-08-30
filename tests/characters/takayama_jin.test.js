// Direct unit tests for characters/takayama_jin.js (ทาคายามะ จิน) —
// ไข่ต้ม (50/50 + โควตา 2 ครั้ง/เทิร์น), กระชาก (เครื่องใน + บังคับดาเมจมาลงที่จิน),
// Alpha (แปลงร่าง 5 เทิร์น + พลังโจมตี +1 + แปะเลือดไหล), ความบ้าคลั่ง (ตีพลาด 50% / สุ่มเป้าหมาย /
// เลือดไหลฟื้นเลือด / เลือดสำรองตอนตาย), ฉันได้กลิ่นเลือด (สวนกลับ 3 แบบ + วีดีโอต้องมาก่อนผล)
// และ มนุษย์ธรรมดา (ไม่รับดาเมจไพ่เกินแต้มแตกในร่างปกติ)
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const { NO_TICK_STATUS, tickBleed } = require('../../characters/_universal_status.js');
const jin = require('../../characters/takayama_jin.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
});

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'jin', hp: 7, armor: 0, shield: 0, tempHp: 0,
    skillPoints: 4, maxSkill: 8, position: 1, dmgHp: 0, dmgArmor: 0,
    statuses: {}, statusAmt: {}, cutsceneShown: {}, seen: {}, evadeStacks: [],
  }, over);
  engine.players[id] = p;
  return p;
}
function mkFoe(over = {}) { return mkPlayer(Object.assign({ characterId: 'tohno' }, over)); }

// เรียก fn โดยบังคับให้ Math.random() คืนค่า v
function withRandom(v, fn) {
  const orig = Math.random;
  Math.random = () => v;
  try { return fn(); } finally { Math.random = orig; }
}
function alpha(p, turns = 5) { p.statuses.jinAlpha = turns; return p; }

// ---------- สกิลพื้นฐาน: ไข่ต้ม ----------

test('ไข่ต้ม: 50/50 ระหว่างฟื้นเลือด 2 กับฟื้นแต้มสกิล 3 และนับโควตา 2 ครั้ง/เทิร์น', () => {
  const p = mkPlayer({ hp: 3, skillPoints: 2 });
  withRandom(0.1, () => jin.applyBoiledEgg(engine, p));      // < 50 -> ฟื้นเลือด
  assert.equal(p.hp, 5, 'ฟื้นพลังชีวิต 2 หน่วย');
  assert.equal(p.skillPoints, 2, 'ไม่แตะแต้มสกิล');
  withRandom(0.9, () => jin.applyBoiledEgg(engine, p));      // >= 50 -> ฟื้นแต้มสกิล
  assert.equal(p.skillPoints, 5, 'ฟื้นแต้มสกิล 3 หน่วย');
  assert.equal(p.jinBasicUses, 2, 'นับโควตาครบ 2 ครั้ง');
  assert.equal(jin.canUseSkill(engine, p, 'basic'), false, 'กดครั้งที่ 3 ในเทิร์นเดียวไม่ได้');
  jin.onRoundStartTick(engine, p);
  assert.equal(jin.canUseSkill(engine, p, 'basic'), true, 'โควตาเต็มใหม่ต้นเทิร์นถัดไป');
});

// ---------- สกิลรอง: กระชาก ----------

test('กระชาก: กดได้เฉพาะในร่างอัลฟา และเลือกได้เฉพาะเป้าหมายที่มีเลือดไหลอยู่แล้ว', () => {
  const p = mkPlayer();
  assert.equal(jin.canUseSkill(engine, p, 'secondary'), false, 'ร่างปกติกดไม่ได้ (ปุ่มต้อง disable)');
  alpha(p);
  assert.equal(jin.canUseSkill(engine, p, 'secondary'), true);

  const clean = mkFoe();
  const bleeding = mkFoe({ statuses: { hbleed: 2 } });
  assert.equal(jin.prepareGrabTarget(engine, p, [clean.id]), null, 'เป้าหมายไม่มีเลือดไหล = เลือกไม่ได้');
  assert.equal(jin.prepareGrabTarget(engine, p, [p.id]), null, 'เลือกตัวเองไม่ได้');
  assert.equal(jin.prepareGrabTarget(engine, p, [bleeding.id]), bleeding);
});

test('กระชาก: ให้ "เครื่องใน" ตัวเอง 1 เทิร์น และปักธงบังคับเป้าหมายให้ดาเมจมาลงที่จิน', () => {
  const p = alpha(mkPlayer());
  const foe = mkFoe({ statuses: { hbleed: 3 } });
  jin.applyGrab(engine, p, foe);
  assert.equal(p.statuses.jinOrgans, 1, 'เครื่องใน 1 เทิร์น');
  assert.equal(foe.statuses.jinForced, 1, 'เป้าหมายติดสถานะถูกบังคับ 1 เทิร์น');
  assert.equal(foe.jinForcedById, p.id, 'จำไว้ว่าถูกบังคับให้ตีใคร');
});

test('กระชาก: ดาเมจจากสกิลของเป้าหมายที่ถูกบังคับ ถูกเบนมาลงที่จินแทนคนอื่น', () => {
  const p = alpha(mkPlayer({ hp: 7 }));
  const foe = mkFoe({ statuses: { hbleed: 3 } });
  const bystander = mkFoe({ hp: 7 });
  jin.applyGrab(engine, p, foe);
  // foe ร่ายสกิลใส่ bystander — ท่อดาเมจกลางต้องเบนมาที่จิน
  engine.withEffectSource(foe, () => engine.dealMixed(bystander, 3));
  assert.equal(bystander.hp, 7, 'คนที่ถูกเล็งไว้เดิมไม่โดนเลย');
  assert.ok(p.hp < 7, 'ดาเมจไหลมาลงที่จินแทน');
});

test('กระชาก: ดาเมจของคนอื่นที่ไม่ได้ถูกบังคับ ยังลงตามปกติ และดาเมจใส่ตัวเองไม่ถูกเบน', () => {
  const p = alpha(mkPlayer());
  const foe = mkFoe({ statuses: { hbleed: 3 } });
  const other = mkFoe({ hp: 7 });
  jin.applyGrab(engine, p, foe);
  engine.withEffectSource(other, () => engine.dealMixed(foe, 2));
  assert.equal(foe.hp, 5, 'ผู้เล่นที่ไม่ได้ติดสถานะยิงใครก็ลงตามเดิม');
  const hpBefore = foe.hp;
  engine.withEffectSource(foe, () => engine.dealMixed(foe, 1)); // ค่าใช้จ่ายสกิลของตัวเอง
  assert.equal(foe.hp, hpBefore - 1, 'ดาเมจที่ลงตัวเองไม่ถูกเบนไปหาจิน');
});

// ---------- ท่าไม้ตาย: Alpha ----------

test('Alpha: เข้าร่าง 5 เทิร์น, พลังโจมตีพื้นฐาน +1, และกดซ้ำระหว่างอยู่ในร่างไม่ได้', () => {
  const p = mkPlayer();
  assert.equal(jin.damageBonus(engine, p), 0, 'ร่างปกติไม่มีโบนัส');
  jin.applyAlpha(engine, p);
  assert.equal(p.statuses.jinAlpha, 5);
  assert.equal(jin.damageBonus(engine, p), 1, 'อัลฟา: พลังโจมตีพื้นฐาน +1');
  assert.equal(jin.canUseSkill(engine, p, 'ultimate'), false, 'กดซ้ำระหว่างอยู่ในร่างไม่ได้');
});

test('Alpha: การโจมตีปกติแปะเลือดไหล 3 หน่วยให้เป้าหมาย (เฉพาะตอนอยู่ในร่าง)', () => {
  const p = mkPlayer();
  const foe = mkFoe();
  assert.equal(jin.onAttackLanded(engine, p, foe), 0, 'ร่างปกติไม่แปะเลือดไหล');
  alpha(p);
  assert.equal(jin.onAttackLanded(engine, p, foe), 3);
  assert.equal(foe.statuses.hbleed, 3);
});

// ---------- สกิลติดตัว: ความบ้าคลั่ง ----------

test('ความบ้าคลั่ง: ตีพลาด 50% เฉพาะในร่างอัลฟา', () => {
  const p = mkPlayer();
  withRandom(0.1, () => assert.equal(jin.tryMiss(engine, p), false, 'ร่างปกติไม่มีทางตีพลาด'));
  alpha(p);
  withRandom(0.1, () => assert.equal(jin.tryMiss(engine, p), true, 'โรลต่ำกว่า 0.5 = พลาด'));
  withRandom(0.9, () => assert.equal(jin.tryMiss(engine, p), false, 'โรลตั้งแต่ 0.5 ขึ้นไป = เข้าเป้า'));
});

test('ความบ้าคลั่ง: มีเป้าหมายหลายคน -> สุ่มทับเสมอ · เหลือคนเดียว -> ไม่สุ่ม', () => {
  const p = alpha(mkPlayer());
  const a = mkFoe();
  assert.equal(jin.maybeRandomTarget(engine, p, a), null, 'มีเป้าหมายเดียว = ไม่ต้องสุ่ม');
  const b = mkFoe();
  const picked = withRandom(0.99, () => jin.maybeRandomTarget(engine, p, a));
  assert.equal(picked, b, 'สุ่มได้คนสุดท้ายในกอง แม้ผู้เล่นจะเล็ง a ไว้');
});

test('ความบ้าคลั่ง: ไม่สุ่มทับเป้าหมายที่ถูกกติกาอื่นล็อกไว้แล้ว (คู่ปรับของไค ชิซากิ)', () => {
  const p = alpha(mkPlayer());
  const rival = mkFoe();
  mkFoe();
  p.kaiRivalId = rival.id;
  p.statuses.kaiRival1 = 2;
  assert.equal(jin.maybeRandomTarget(engine, p, rival), null, 'การล็อกเป้าของไคต้องชนะการสุ่ม');
});

test('ความบ้าคลั่ง: ไม่มีเกราะแล้วโดนดาเมจ = เลือดไหลตัวเอง (เกิดได้หลายครั้งต่อเทิร์น)', () => {
  const p = alpha(mkPlayer({ armor: 2 }));
  assert.equal(jin.onDamaged(engine, p), false, 'ยังมีเกราะอยู่ = ไม่ติดเลือดไหล');
  p.armor = 0;
  assert.equal(jin.onDamaged(engine, p), true);
  assert.equal(jin.onDamaged(engine, p), true, 'ครั้งที่ 2 ในเทิร์นเดียวกันก็ยังติดได้ (ไม่มีโควตา)');
  assert.equal(p.statuses.hbleed, 2);
  const normal = mkPlayer({ armor: 0 });
  assert.equal(jin.onDamaged(engine, normal), false, 'ร่างปกติไม่ทำงาน');
});

test('ความบ้าคลั่ง: เลือดไหลฟื้นพลังชีวิตแทนสร้างความเสียหาย — เฉพาะในร่างอัลฟา', () => {
  const p = mkPlayer({ hp: 3, statuses: { hbleed: 2 } });
  assert.equal(jin.hbleedHeals(p), false, 'ร่างปกติ: เลือดไหลทำร้ายตามปกติ');
  alpha(p);
  assert.equal(jin.hbleedHeals(p), true);
  tickBleed(engine, p);
  assert.equal(p.hp, 4, 'ติกเลือดไหลกลายเป็นการฟื้นพลังชีวิต +1');
  assert.equal(p.statuses.hbleed, 1, 'และยังลดจำนวนลง 1 ตามปกติ');
});

// ---------- ความบ้าคลั่ง: เลือดสำรองตอนตาย ----------

test('เลือดสำรอง: ตัวอย่างตามสเปค — เลือด 2 โดน 5 -> ยังไม่ตาย ต้องฟื้นอีก 4 หน่วย', () => {
  const p = alpha(mkPlayer({ hp: 2, armor: 0 }));
  engine.dealMixed(p, 5);
  assert.equal(p.alive, true, 'ยังไม่ตาย');
  assert.equal(jin.debtActive(p), true);
  assert.equal(p.jinShadowHp, -3, 'เลือดจริงติดลบ 3');
  assert.equal(1 - p.jinShadowHp, 4, 'ต้องฟื้นเลือดอีก 4 หน่วยตามสเปค');
});

test('เลือดสำรอง: ฟื้นเลือดทุกแหล่งไปลดหนี้ก่อน และไม่ขึ้น hp จริงจนกว่าหนี้จะหมด', () => {
  const p = alpha(mkPlayer({ hp: 2, armor: 0 }));
  engine.dealMixed(p, 5);           // shadow = -3, ต้องฟื้น 4
  engine.healHp(p, 2);
  assert.equal(p.jinShadowHp, -1, 'ฮีลไปลดหนี้');
  assert.equal(p.hp, 1, 'พลังชีวิตจริงยังถูกตรึงไว้ที่ 1');
  engine.healHp(p, 2);
  assert.equal(p.jinShadowHp, 1, 'จ่ายหนี้ครบแล้ว');
  jin.onRoundStartTick(engine, p);
  assert.equal(p.alive, true, 'รอดพ้นความตาย');
  assert.equal(jin.debtActive(p), false, 'หนี้ถูกล้าง');
  assert.equal(p.hp, 1, 'กลับมาเป็นพลังชีวิตจริง');
});

test('เลือดสำรอง: ฟื้นไม่ทัน -> ตายจริงต้นเทิร์นถัดไป', () => {
  const p = alpha(mkPlayer({ hp: 2, armor: 0 }));
  engine.dealMixed(p, 5);
  engine.healHp(p, 1);              // ยังขาดอีก 3
  jin.onRoundStartTick(engine, p);
  assert.equal(p.alive, false, 'ฟื้นเลือดไม่ทัน = ตายตามปกติ');
});

test('เลือดสำรอง: โดนดาเมจซ้ำระหว่างติดหนี้ = หนี้เพิ่มขึ้น ไม่ตายทันที', () => {
  const p = alpha(mkPlayer({ hp: 2, armor: 0 }));
  engine.dealMixed(p, 3);           // shadow = -1
  assert.equal(p.jinShadowHp, -1);
  engine.dealMixed(p, 2);           // hp 1 -> -1 : shadow += -2
  assert.equal(p.alive, true, 'ยังไม่ตายทันที');
  assert.equal(p.jinShadowHp, -3, 'หนี้สะสมเพิ่มขึ้น');
});

test('เลือดสำรอง: ความเสียหายทะลุเพดานสำรอง 7 หน่วย = ตายจริงทันที', () => {
  const p = alpha(mkPlayer({ hp: 2, armor: 0 }));
  engine.dealMixed(p, 12);          // เลือดจริง 2 -> ทะลุไป -10 เกินสำรอง 7
  assert.equal(p.alive, false, 'สำรองไม่พอรับไหว ตายจริง');
});

test('เลือดสำรอง: ทำงานเฉพาะในร่างอัลฟา — ร่างปกติตายตามกติกาเดิม', () => {
  const p = mkPlayer({ hp: 2, armor: 0 });
  engine.dealMixed(p, 5);
  assert.equal(p.alive, false, 'ร่างปกติไม่มีเลือดสำรอง');
});

// ---------- สกิลติดตัว 2: ฉันได้กลิ่นเลือด ----------

test('ฉันได้กลิ่นเลือด: ถูกโจมตีปกติ -> เลือดไหล 2 ให้ผู้โจมตี + ฟื้นแต้มสกิลจิน 1', () => {
  const p = alpha(mkPlayer({ skillPoints: 3 }));
  const foe = mkFoe();
  withRandom(0.99, () => jin.queueSmellBlood(engine, p, foe, true)); // โรลสูง = ไม่มีสวนกลับ
  assert.equal(foe.statuses.hbleed, 2);
  assert.equal(p.skillPoints, 4);
  assert.deepEqual(p.jinCounterPending || [], [], 'ไม่มีการสวนกลับจองไว้');
});

test('ฉันได้กลิ่นเลือด: ทำงานเฉพาะในร่างอัลฟา และไม่ทำงานกับตัวเอง/เพื่อนร่วมทีม', () => {
  const normal = mkPlayer({ skillPoints: 3 });
  const foe = mkFoe();
  withRandom(0.01, () => jin.queueSmellBlood(engine, normal, foe, true));
  assert.equal(foe.statuses.hbleed, undefined, 'ร่างปกติไม่ทำงานเลย');
  const p = alpha(mkPlayer());
  assert.equal(jin.queueSmellBlood(engine, p, p, true), false, 'ตัวเองโจมตีตัวเองไม่นับ');
});

test('"จับตัวได้แล้ว": โรล 15% ติด -> คิววีดีโอไว้ก่อน ผลยังไม่ลงจนกว่าจะ resolve', () => {
  const p = alpha(mkPlayer({ hp: 4 }));
  const foe = mkFoe({ hp: 5, armor: 0 });
  const qBefore = engine.cutsceneQueueLength();
  const queued = withRandom(0.01, () => jin.queueSmellBlood(engine, p, foe, true));
  assert.equal(queued, true, 'มีวีดีโอเข้าคิว');
  assert.ok(engine.cutsceneQueueLength() > qBefore, 'วีดีโอถูกคิวไว้ก่อนเสมอ');
  assert.equal(foe.hp, 5, 'ดาเมจสวนกลับยังไม่ลงก่อนวีดีโอเล่น');

  jin.resolvePendingCounters(engine);
  assert.equal(foe.hp, 4, 'สวนกลับ 1 หน่วยหลังวีดีโอจบ');
  assert.equal(foe.jinNoDrawPending, 1, 'เทิร์นถัดไปจั่วการ์ดไม่ได้');
  assert.equal(p.hp, 6, 'จินฟื้นพลังชีวิต 2 หน่วย');
});

test('"แขนข้างนี่ใช่ไหม": ดาเมจจากสกิลเท่านั้น (10%) -> ห้ามสกิลเทิร์นหน้า + ฟื้น HP 1', () => {
  const p = alpha(mkPlayer({ hp: 4 }));
  const foe = mkFoe({ hp: 5, armor: 0 });
  withRandom(0.05, () => jin.queueSmellBlood(engine, p, foe, false));
  jin.resolvePendingCounters(engine);
  assert.equal(foe.hp, 4, 'สวนกลับ 1 หน่วย');
  assert.equal(foe.jinNoSkillPending, 1, 'เทิร์นถัดไปใช้สกิลไม่ได้');
  assert.equal(p.hp, 5, 'จินฟื้นพลังชีวิต 1 หน่วย');
});

test('"แขนข้างนี่ใช่ไหม": โอกาส 10% ปกติ -> 20% เมื่อมี "เครื่องใน"', () => {
  const foe1 = mkFoe();
  const p1 = alpha(mkPlayer());
  withRandom(0.15, () => jin.queueSmellBlood(engine, p1, foe1, false));
  assert.deepEqual(p1.jinCounterPending || [], [], 'โรล 0.15 ไม่ติดที่อัตรา 10%');

  const foe2 = mkFoe();
  const p2 = alpha(mkPlayer({ statuses: { jinAlpha: 5, jinOrgans: 1 } }));
  withRandom(0.15, () => jin.queueSmellBlood(engine, p2, foe2, false));
  assert.equal((p2.jinCounterPending || []).length, 1, 'เครื่องในดันอัตราเป็น 20% -> โรลเดิมติด');
});

test('"จับตัวได้แล้ว": โอกาส 15% ปกติ -> 20% เมื่อมี "เครื่องใน"', () => {
  const p1 = alpha(mkPlayer());
  withRandom(0.17, () => jin.queueSmellBlood(engine, p1, mkFoe(), true));
  assert.deepEqual(p1.jinCounterPending || [], [], 'โรล 0.17 ไม่ติดที่อัตรา 15%');
  const p2 = alpha(mkPlayer({ statuses: { jinAlpha: 5, jinOrgans: 1 } }));
  withRandom(0.17, () => jin.queueSmellBlood(engine, p2, mkFoe(), true));
  assert.equal((p2.jinCounterPending || []).length, 1, 'เครื่องในดันอัตราเป็น 20%');
});

test('"นี่แหละตัวฉัน": ต้องมีเลือดไหล >= 5 · สวนกลับเท่าเลือดไหลที่มี แล้วล้างทิ้ง', () => {
  const p = alpha(mkPlayer());
  const weak = mkFoe({ statuses: { hbleed: 4 } });
  withRandom(0.99, () => jin.queueSmellBlood(engine, p, weak, false));
  assert.deepEqual(p.jinCounterPending || [], [], 'เลือดไหลไม่ถึง 5 = ไม่ทำงาน');

  const p2 = alpha(mkPlayer());
  const foe = mkFoe({ hp: 7, armor: 0, statuses: { hbleed: 5 } });
  withRandom(0.05, () => jin.queueSmellBlood(engine, p2, foe, false));
  jin.resolvePendingCounters(engine);
  assert.equal(foe.statuses.hbleed, undefined, 'ล้างสถานะเลือดไหลออกทั้งหมด');
  assert.ok(foe.hp <= 2, `สร้างความเสียหายตามเลือดไหล 5 หน่วย (เหลือ ${foe.hp})`);
});

test('"นี่แหละตัวฉัน": โอกาส 30% ปกติ -> 50% เมื่อมี "เครื่องใน"', () => {
  const p1 = alpha(mkPlayer());
  withRandom(0.4, () => jin.queueSmellBlood(engine, p1, mkFoe({ statuses: { hbleed: 5 } }), false));
  assert.deepEqual(p1.jinCounterPending || [], [], 'โรล 0.4 ไม่ติดที่อัตรา 30%');
  const p2 = alpha(mkPlayer({ statuses: { jinAlpha: 5, jinOrgans: 1 } }));
  withRandom(0.4, () => jin.queueSmellBlood(engine, p2, mkFoe({ statuses: { hbleed: 5 } }), false));
  assert.equal((p2.jinCounterPending || []).length, 1, 'เครื่องในดันอัตราเป็น 50%');
});

test('สวนกลับ: วีดีโอเข้าคิวก่อนเสมอ และ resolve ซ้ำไม่ทำผลซ้ำ', () => {
  const p = alpha(mkPlayer({ hp: 4 }));
  const foe = mkFoe({ hp: 5, armor: 0 });
  withRandom(0.01, () => jin.queueSmellBlood(engine, p, foe, true));
  assert.equal(jin.hasPendingCounter(engine), true);
  jin.resolvePendingCounters(engine);
  const hpAfter = foe.hp;
  jin.resolvePendingCounters(engine);
  assert.equal(foe.hp, hpAfter, 'เรียกซ้ำแล้วผลไม่ลงซ้ำ (ตาข่ายสำรองปลอดภัย)');
  assert.equal(jin.hasPendingCounter(engine), false);
});

test('สวนกลับ: ผู้โจมตีตกรอบไปก่อน resolve -> ข้ามไปเฉยๆ ไม่ crash', () => {
  const p = alpha(mkPlayer());
  const foe = mkFoe({ hp: 1, armor: 0 });
  withRandom(0.01, () => jin.queueSmellBlood(engine, p, foe, true));
  foe.alive = false;
  jin.resolvePendingCounters(engine);
  assert.equal(jin.hasPendingCounter(engine), false);
});

// ---------- สกิลติดตัว 3: มนุษย์ธรรมดา / โครงสร้าง ----------

test('สถานะร่าง/เครื่องใน ไม่ถูกลดเทิร์นเองโดยลูปกลาง (มีตัวนับของตัวเอง)', () => {
  // jinAlpha/jinOrgans ตั้งใจให้ลดเทิร์นตามลูปปกติของ endTurn — ยืนยันว่าไม่ได้ถูกใส่ NO_TICK_STATUS โดยพลาด
  assert.equal(NO_TICK_STATUS.has('jinAlpha'), false, 'อัลฟานับถอยหลัง 5 เทิร์นตามปกติ');
  assert.equal(NO_TICK_STATUS.has('jinOrgans'), false, 'เครื่องในนับถอยหลัง 1 เทิร์นตามปกติ');
});

test('resetCombat ล้างฟิลด์ประจำตัวครบ (กันค่าค้างข้ามแมตช์)', () => {
  const p = mkPlayer({
    jinBasicUses: 2, jinShadowHp: -4, jinForcedById: 'x',
    jinNoDrawPending: 1, jinNoSkillPending: 1, jinCounterPending: [{ kind: 'captured', byId: 'x' }],
  });
  jin.resetCombat(p);
  assert.equal(p.jinBasicUses, 0);
  assert.equal(p.jinShadowHp, null);
  assert.equal(p.jinForcedById, null);
  assert.equal(p.jinNoDrawPending, 0);
  assert.equal(p.jinNoSkillPending, 0);
  assert.equal(p.jinCounterPending, null);
});

test('ต้นเทิร์น: nodraw/noskill ที่โดนสวนกลับตั้งไว้ เริ่มมีผลในเทิร์นถัดไป', () => {
  const foe = mkFoe({ jinNoDrawPending: 1, jinNoSkillPending: 1 });
  jin.onRoundStartTick(engine, foe);
  assert.equal(foe.statuses.nodraw, 1, 'จั่วการ์ดไม่ได้ 1 เทิร์น');
  assert.equal(foe.statuses.noskill, 1, 'ใช้สกิลไม่ได้ 1 เทิร์น');
  assert.equal(foe.jinNoDrawPending, 0, 'ธงถูกล้าง ไม่ติดซ้ำเทิร์นถัดไป');
});

test('ภาพประจำตัวสลับตามร่าง', () => {
  const p = mkPlayer();
  assert.equal(jin.displayImg(p), null, 'ร่างปกติใช้ภาพเริ่มต้น');
  alpha(p);
  assert.equal(jin.displayImg(p), jin.IMG.alpha);
});
