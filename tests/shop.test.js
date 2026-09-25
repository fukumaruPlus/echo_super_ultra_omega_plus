// ระบบร้านค้า: ร้านค้ามายา (ร้านเดียว รวมปืนหน่วย GUTS Select ที่เดิมอยู่ร้านลุงเท่ง)
//  ทดสอบเงื่อนไขการซื้อ/การยิง (gutsFireTargetOf) แยกจากผลของกระสุน (applyGutsBullet) เพราะการยิงจริง
//  ผ่าน useInventoryItem จะตัดเข้าคัตซีน (ตั้ง timer) — ผลของกระสุนเกิดหลังวีดีโอจบเสมอ
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../server.js');

test.beforeEach(() => {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  engine.setShopItems([]);
  engine.setGameState('PLAYING');
  engine.setRoundNumber(1);
});
test.afterEach(() => engine.clearPhaseTimer()); // คัตซีนที่เกิดจากการยิงจริงจะตั้ง interval ค้างไว้

let uid = 0;
function mkPlayer(over = {}) {
  const id = `p${++uid}`;
  const p = Object.assign({
    id, name: id, alive: true, characterId: 'kai', hp: 5, armor: 2, skillPoints: 0,
    gold: 0, inventory: [], cards: [], locked: false, busted: false,
    statuses: {}, statusAmt: {}, cutsceneShown: {}, seen: {},
    colorTrigger: { blue: 0, red: 0, green: 0, yellow: 0 },
    dmgHp: 0, dmgArmor: 0, gutsShotTurn: 0, gutsGargorgonPending: false,
  }, over);
  engine.players[id] = p;
  return p;
}
function stockShop(...items) {
  engine.setShopItems(items.map((it, i) => ({ id: `shop_1_${i}`, sold: false, soldTo: null, ...it })));
  return engine.shopItems;
}
function giveGun(p) { p.inventory.push({ uid: `gun_${p.id}`, type: 'gutsGun' }); }
function giveAmmo(p, ammo) {
  const item = { uid: `ammo_${ammo}_${p.id}_${p.inventory.length}`, type: 'gutsAmmo', ammo };
  p.inventory.push(item);
  return item;
}

// ---------- การสุ่มสินค้า ----------
const SHOP_TYPES = ['cardColor', 'fortune', 'resist', 'cardRemove', 'skillPoint', 'armor', 'gutsGun', 'gutsAmmo', 'mark42'];  // เกราะ Mark 42 (characters/_mark42.js)
test('rollShopItem: ออกได้เฉพาะชนิดที่มีจริง และราคาปืน/กระสุนตรงกับตาราง', () => {
  for (let i = 0; i < 800; i++) {
    const it = engine.rollShopItem();
    assert.ok(SHOP_TYPES.includes(it.type), `สินค้าชนิดที่ไม่รู้จัก: ${it.type}`);
    if (it.type === 'gutsGun') assert.equal(it.price, engine.GUTS_GUN_PRICE);
    if (it.type === 'gutsAmmo') {
      assert.ok(engine.GUTS_AMMO[it.ammo], `กระสุนที่ไม่รู้จัก: ${it.ammo}`);
      assert.equal(it.price, engine.GUTS_AMMO[it.ammo].price);
      assert.notEqual(it.ammo, 'trigger_dark_key'); // Trigger Dark Key อยู่ช่องล็อกเท่านั้น ไม่สุ่มออก
    }
  }
});

test('rollShopItem: allowGun=false ไม่ออกปืนเลย / allowHyper=false ไม่ออก Hyper Key เลย', () => {
  for (let i = 0; i < 400; i++) assert.notEqual(engine.rollShopItem(true, true, false).type, 'mark42'); // เพดาน Mark 42 ต่อรอบ
  for (let i = 0; i < 400; i++) assert.notEqual(engine.rollShopItem(false).type, 'gutsGun');
  for (let i = 0; i < 400; i++) assert.notEqual(engine.rollShopItem(true, false).ammo, 'hyper_trigger');
});

test('openShop: ร้านเดียว 15 ชิ้น id ขึ้นต้น shop_ ทั้งหมด', () => {
  engine.openShop();
  assert.equal(engine.shopItems.length, 15);
  assert.ok(engine.shopItems.every((it) => it.id.startsWith('shop_')));
});

test('openShop: ปืนขึ้นได้สูงสุด 2 กระบอก และ Hyper Key ได้สูงสุด 1 ชิ้นต่อรอบที่รี', () => {
  for (let i = 0; i < 200; i++) {
    engine.openShop();
    const guns = engine.shopItems.filter((it) => it.type === 'gutsGun').length;
    const hypers = engine.shopItems.filter((it) => it.ammo === 'hyper_trigger').length;
    assert.ok(guns <= 2, `รอบนี้มีปืน ${guns} กระบอก`);
    assert.ok(hypers <= 1, `รอบนี้มี Hyper Key ${hypers} ชิ้น`);
  }
});

// ---------- การซื้อ ----------
test('buyShopItem: ซื้อปืน/กระสุนจากร้านค้ามายาได้ หักเหรียญ และของเข้ากระเป๋าพร้อมชนิดกระสุน', () => {
  const p = mkPlayer({ gold: 20 });
  const [gun, ammo] = stockShop({ type: 'gutsGun', price: 15 }, { type: 'gutsAmmo', ammo: 'thunder', price: 5 });
  engine.buyShopItem(p.id, gun.id);
  engine.buyShopItem(p.id, ammo.id);
  assert.equal(p.gold, 0);
  assert.equal(p.inventory.length, 2);
  assert.equal(p.inventory[0].type, 'gutsGun');
  assert.equal(p.inventory[1].ammo, 'thunder');
  assert.ok(gun.sold && ammo.sold);
});

test('buyShopItem: มีปืนแล้วซื้อปืนอีกกระบอกไม่ได้ (ไม่เสียเหรียญ ของไม่ถูกทำเครื่องหมายว่าขายแล้ว)', () => {
  const p = mkPlayer({ gold: 40 });
  const [g1, g2] = stockShop({ type: 'gutsGun', price: 15 }, { type: 'gutsGun', price: 15 });
  engine.buyShopItem(p.id, g1.id);
  engine.buyShopItem(p.id, g2.id);
  assert.equal(p.gold, 25);
  assert.equal(p.inventory.filter((it) => it.type === 'gutsGun').length, 1);
  assert.equal(g2.sold, false);
});

test('buyShopItem: เหรียญไม่พอ / ของขายไปแล้ว = ซื้อไม่ได้', () => {
  const poor = mkPlayer({ gold: 14 });
  const rich = mkPlayer({ gold: 30 });
  const [gun] = stockShop({ type: 'gutsGun', price: 15 });
  engine.buyShopItem(poor.id, gun.id);
  assert.equal(poor.inventory.length, 0);
  engine.buyShopItem(rich.id, gun.id);
  engine.buyShopItem(poor.id, gun.id); // ขายไปแล้ว
  assert.equal(poor.inventory.length, 0);
  assert.equal(rich.inventory.length, 1);
});

// ---------- เงื่อนไขการยิง ----------
test('gutsFireTargetOf: ไม่มีปืนยิงไม่ได้ / มีปืนแล้วยิงคนอื่นได้', () => {
  const p = mkPlayer();
  const t = mkPlayer();
  const ammo = giveAmmo(p, 'thunder');
  assert.equal(engine.gutsFireTargetOf(p, ammo, t.id), null);
  giveGun(p);
  assert.equal(engine.gutsFireTargetOf(p, ammo, t.id), t);
});

test('gutsFireTargetOf: ยิงตัวเอง / ยิงคนที่ตกรอบแล้ว / เป้าหมายไม่มีอยู่ = ยิงไม่ได้', () => {
  const p = mkPlayer();
  const dead = mkPlayer({ alive: false });
  giveGun(p);
  const ammo = giveAmmo(p, 'shockwave');
  assert.equal(engine.gutsFireTargetOf(p, ammo, p.id), null);
  assert.equal(engine.gutsFireTargetOf(p, ammo, dead.id), null);
  assert.equal(engine.gutsFireTargetOf(p, ammo, 'ไม่มีคนนี้'), null);
});

test('gutsFireTargetOf: ยิงได้เฉพาะช่วงจั่วไพ่ที่ยังไม่เปิดไพ่ และ 1 นัดต่อเทิร์น', () => {
  const p = mkPlayer();
  const t = mkPlayer();
  giveGun(p);
  const ammo = giveAmmo(p, 'shockwave');

  engine.setGameState('ATTACK');
  assert.equal(engine.gutsFireTargetOf(p, ammo, t.id), null);
  engine.setGameState('PLAYING');

  p.locked = true;
  assert.equal(engine.gutsFireTargetOf(p, ammo, t.id), null);
  p.locked = false;

  p.gutsShotTurn = engine.roundNumber; // ยิงไปแล้วในเทิร์นนี้
  assert.equal(engine.gutsFireTargetOf(p, ammo, t.id), null);
  engine.setRoundNumber(engine.roundNumber + 1); // เทิร์นใหม่ = ยิงได้อีก
  assert.equal(engine.gutsFireTargetOf(p, ammo, t.id), t);
});

test('useInventoryItem: ยิงไม่ผ่านเงื่อนไข = ไม่เสียกระสุน / ปืนกดใช้ตรงๆ ไม่หาย', () => {
  const p = mkPlayer();
  const t = mkPlayer();
  giveGun(p);
  const ammo = giveAmmo(p, 'thunder');

  engine.useInventoryItem(p.id, ammo.uid, { targetId: p.id }); // ยิงตัวเองไม่ได้
  assert.equal(p.inventory.length, 2);

  engine.useInventoryItem(p.id, `gun_${p.id}`, {}); // กดที่ปืนตรงๆ = ไม่มีอะไรเกิดขึ้น
  assert.equal(engine.hasGutsGun(p), true);
  assert.equal(p.inventory.length, 2);

  engine.useInventoryItem(p.id, ammo.uid, { targetId: t.id }); // ยิงสำเร็จ = กระสุนหาย
  assert.equal(p.inventory.length, 1);
  assert.equal(p.gutsShotTurn, engine.roundNumber);
});

test('วีดีโอกระสุนนับแยกรายคน — คนที่ 2 ที่ยิงกระสุนแบบเดียวกันยังได้ดูวีดีโอของตัวเอง', () => {
  const a = mkPlayer();
  const b = mkPlayer();
  const t = mkPlayer({ armor: 3 });
  giveGun(a); giveGun(b);
  const ammoA = giveAmmo(a, 'thunder');
  const ammoB = giveAmmo(b, 'thunder');

  engine.useInventoryItem(a.id, ammoA.uid, { targetId: t.id });
  assert.equal(engine.gameState, 'CUTSCENE');
  engine.clearPhaseTimer();
  engine.setGameState('PLAYING');

  engine.useInventoryItem(b.id, ammoB.uid, { targetId: t.id }); // คนละคน = ยังได้วีดีโอ
  assert.equal(engine.gameState, 'CUTSCENE');
  engine.clearPhaseTimer();
});

test('วีดีโอกระสุนแบบเดิมเล่นครั้งเดียวต่อเกมต่อคน — นัดที่ 2 ของคนเดิมไม่ตัดเข้าคัตซีน และผลเกิดทันที', () => {
  const p = mkPlayer();
  const t = mkPlayer({ armor: 3 });
  giveGun(p);
  const a1 = giveAmmo(p, 'shockwave');
  const a2 = giveAmmo(p, 'shockwave');

  engine.useInventoryItem(p.id, a1.uid, { targetId: t.id }); // นัดแรก = เล่นวีดีโอ (เข้าเฟส CUTSCENE)
  assert.equal(engine.gameState, 'CUTSCENE');
  assert.equal(t.armor, 3); // ผลยังไม่เกิด — รอวีดีโอจบก่อน
  engine.clearPhaseTimer();

  engine.setGameState('PLAYING');
  engine.setRoundNumber(engine.roundNumber + 1);
  engine.useInventoryItem(p.id, a2.uid, { targetId: t.id }); // นัดที่ 2 ของแบบเดิม = ไม่มีวีดีโอ
  assert.equal(engine.gameState, 'PLAYING');
  assert.equal(t.armor, 0); // ผลเกิดทันที
});

// ---------- ผลของกระสุน ----------
test('Shockwave Bullet: ทำลายเกราะทั้งหมด แต่ไม่แตะพลังชีวิตจริง', () => {
  const p = mkPlayer();
  const t = mkPlayer({ armor: 3, hp: 5 });
  engine.applyGutsBullet(p, { ammo: 'shockwave' }, t);
  assert.equal(t.armor, 0);
  assert.equal(t.hp, 5);
});

test('Shockwave Bullet: เป้าหมายไม่มีเกราะอยู่แล้ว = ไม่มีอะไรเกิดขึ้น (เลือดไม่ลด)', () => {
  const p = mkPlayer();
  const t = mkPlayer({ armor: 0, hp: 4 });
  engine.applyGutsBullet(p, { ammo: 'shockwave' }, t);
  assert.equal(t.armor, 0);
  assert.equal(t.hp, 4);
});

test('Gargorgon Ray: ตั้ง pending ไว้ ยังไม่สตั้นทันที', () => {
  const p = mkPlayer();
  const t = mkPlayer();
  engine.applyGutsBullet(p, { ammo: 'gargorgon' }, t);
  assert.equal(t.gutsGargorgonPending, true);
  assert.equal(t.statuses.stun || 0, 0);
});

test('Thunder Bullet: ติดสภาพชา 2 เทิร์น — แต่โดนต้านสถานะผิดปกติกันไว้ได้', () => {
  const p = mkPlayer();
  const t = mkPlayer();
  engine.applyGutsBullet(p, { ammo: 'thunder' }, t);
  assert.equal(t.statuses.chaa, engine.GUTS_CHAA_TURNS);

  const resisted = mkPlayer({ statuses: { resist: 1 } });
  engine.applyGutsBullet(p, { ammo: 'thunder' }, resisted);
  assert.equal(resisted.statuses.chaa || 0, 0);
});

test('Nursedessei Cannon: ดาเมจ 4 (ลดเกราะก่อน) และปืนของผู้ยิงพังหายไป', () => {
  const p = mkPlayer();
  giveGun(p);
  const t = mkPlayer({ armor: 2, hp: 5 });
  engine.applyGutsBullet(p, { ammo: 'nurse' }, t);
  assert.equal(t.armor, 0);
  assert.equal(t.hp, 3); // เกราะ 2 + เลือด 2 = 4 หน่วย
  assert.equal(engine.hasGutsGun(p), false);
});

test('Nursedessei Cannon: ปืนพังแม้เป้าหมายจะตกรอบไปก่อนวีดีโอจบ', () => {
  const p = mkPlayer();
  giveGun(p);
  const t = mkPlayer({ alive: false });
  engine.applyGutsBullet(p, { ammo: 'nurse' }, t);
  assert.equal(engine.hasGutsGun(p), false);
  assert.equal(t.hp, 5); // ไม่โดนดาเมจ (ตกรอบไปแล้ว)
});

// ---------- อิปโป: ห้ามหลบปืนที่เป็นไอเทม ----------
//  อัตราหลบเต็มเพดานของเขาคือ 50% (ฐาน 30 + ผู้ยืนหยัด 20) — Dempsey Charge ไม่ให้อัตราหลบแล้ว
//  จึงล็อก Math.random ไว้ที่ 0 = โรลติดทุกครั้ง — ถ้ายังโดนแปลว่าด่านกันหลบทำงานจริง
function mkIppoMaxDodge() {
  const t = mkPlayer({ characterId: 'ippo', hp: 6, armor: 0 });
  t.ippoStandDodge = 20;
  t.ippoCharge = 3;
  t.statuses.ippoDempsey = 1;
  return t;
}

test('อิปโป: Nursedessei Cannon หลบไม่ได้ แม้อัตราหลบจะเต็มเพดาน', () => {
  const p = mkPlayer();
  giveGun(p);
  const t = mkIppoMaxDodge();
  assert.equal(engine.CHAR_HOOKS.ippo.dodgeChance(t), 50);
  const rnd = Math.random;
  Math.random = () => 0; // โรลต่ำสุด = หลบติดทุกครั้งถ้าหลบได้
  try { engine.applyGutsBullet(p, { ammo: 'nurse' }, t); }
  finally { Math.random = rnd; }
  assert.equal(t.hp, 2, 'กระสุนไอเทมต้องเข้าเต็ม 4 หน่วย');
  assert.equal(t.ippoStandDodge, 0, 'โดนเต็มๆ = อัตราหลบสะสมของผู้ยืนหยัดหาย');
  assert.equal(t._itemDamage, false, 'ธงต้องถูกล้างหลังกระสุนลง ไม่งั้นจะค้างข้ามก้อนถัดไป');
});

test('อิปโป: ดาเมจจากสกิล (ไม่ใช่ไอเทม) ยังหลบได้ตามเดิม', () => {
  const t = mkIppoMaxDodge();
  const rnd = Math.random;
  Math.random = () => 0;
  try { engine.dealMixed(t, 4); }
  finally { Math.random = rnd; }
  assert.equal(t.hp, 6, 'ดาเมจสกิลต้องถูกหลบพ้น');
});

test('Ignis: ยิง Nursedessei ด้วย Black Sparklence แล้วปืนไม่หาย แต่ใช้ไม่ได้ 3 เทิร์น', () => {
  const p = mkPlayer({ characterId: 'ignis' });
  const t = mkPlayer();
  engine.CHAR_HOOKS.ignis.ensureBlackSparklence(p);
  const ammo = { ammo: 'nurse' };

  engine.applyGutsBullet(p, ammo, t);

  assert.equal(engine.hasBlackSparklence(p), true);
  assert.equal(p.blackSparklenceReadyRound, 1 + engine.BLACK_SPARKLENCE_NURSE_COOLDOWN + 1);
  for (const round of [2, 3, 4]) {
    engine.setRoundNumber(round);
    assert.equal(engine.gutsFireTargetOf(p, ammo, t.id), null, `ยังไม่ควรใช้ปืนได้ในเทิร์น ${round}`);
  }
  const darkKey = giveAmmo(p, 'trigger_dark_key');
  engine.setRoundNumber(2);
  engine.useInventoryItem(p.id, darkKey.uid);
  assert.equal(p.statuses.triggerDarkForm || 0, 0, 'คูลดาวน์ต้องบล็อก Trigger Dark Key ด้วย');
  assert.equal(p.inventory.some((item) => item.uid === darkKey.uid), true, 'ยิงไม่ได้ต้องไม่เสียคีย์');
  engine.setRoundNumber(5);
  assert.equal(engine.gutsFireTargetOf(p, ammo, t.id), t);
});

// ---------- สภาพชา (ดีบัฟ Universal) ----------
test('สภาพชา: กดจั่ว 1 ครั้ง ได้ไพ่ 2 ใบ — ไม่ติดสถานะจั่วได้ใบเดียวตามปกติ', () => {
  const normal = mkPlayer();
  const chaa = mkPlayer({ statuses: { chaa: 2 } });
  engine.setCentralDeck(Array.from({ length: 20 }, () => ({ value: 1, color: 'red' })));

  engine.hit(normal.id);
  assert.equal(normal.cards.length, 1);

  engine.hit(chaa.id);
  assert.equal(chaa.cards.length, 2);
});

test('openShop: Trigger Dark Key is the only locked shop item and always appears exactly once', () => {
  for (let i = 0; i < 50; i++) {
    engine.openShop();
    assert.equal(engine.shopItems[0].ammo, 'trigger_dark_key');
    assert.equal(engine.shopItems.filter((it) => it.ammo === 'trigger_dark_key').length, 1);
  }
});

test('Ignis: Black Sparklence uses ammo without a GUTS gun and Trigger Dark Key is consumed on transform', () => {
  const p = mkPlayer({ characterId: 'ignis', hp: 2, maxHp: 5, gold: 40 });
  const t = mkPlayer();
  engine.CHAR_HOOKS.ignis.ensureBlackSparklence(p);
  const [gun, hyper, dark, ammo] = stockShop(
    { type: 'gutsGun', price: 15 },
    { type: 'gutsAmmo', ammo: 'hyper_trigger', price: 20 },
    { type: 'gutsAmmo', ammo: 'trigger_dark_key', price: 10 },
    { type: 'gutsAmmo', ammo: 'shockwave', price: 5 },
  );

  engine.buyShopItem(p.id, gun.id);
  engine.buyShopItem(p.id, hyper.id);
  assert.equal(gun.sold, false);
  assert.equal(hyper.sold, false);
  assert.equal(p.inventory.some((it) => it.type === 'gutsGun'), false);

  engine.buyShopItem(p.id, ammo.id);
  const shot = p.inventory.find((it) => it.ammo === 'shockwave');
  assert.equal(engine.gutsFireTargetOf(p, shot, t.id), t);

  engine.buyShopItem(p.id, dark.id);
  const darkKey = p.inventory.find((it) => it.ammo === 'trigger_dark_key');
  assert.ok(darkKey);
  engine.useInventoryItem(p.id, darkKey.uid);

  assert.equal(p.statuses.triggerDarkForm, 5);
  assert.equal(p.hp, 4);
  assert.equal(p.inventory.some((it) => it.ammo === 'trigger_dark_key'), false);
  assert.equal(engine.gameState, 'CUTSCENE');
  engine.clearPhaseTimer();
});


test('Ignis: useInventoryItem fires shop ammo through Black Sparklence', () => {
  const p = mkPlayer({ characterId: 'ignis', inventory: [{ uid: 'black_sparklence_p', type: 'blackSparklence' }], cutsceneShown: { gutsThunder: true } });
  const t = mkPlayer();
  const ammo = giveAmmo(p, 'thunder');

  engine.useInventoryItem(p.id, ammo.uid, { targetId: t.id });

  assert.equal(p.gutsShotTurn, 1);
  assert.equal(p.inventory.some((it) => it.uid === ammo.uid), false);
  assert.equal(t.statuses.chaa, engine.GUTS_CHAA_TURNS);
  assert.equal(engine.gameState, 'PLAYING');
});

// ---------- ตราล่าเวท (ผู้สังหารเมจ) × ปืนหน่วย GUTS Select ----------
// สเปกระบุว่า "ความเสียหายทุกประเภท (ไอเทม (ปืน) / ความเสียหายสกิล / การโจมตีปกติ)" ต่อเป้าหมายที่ติดตรา
//  ต้องขโมยพลังงาน — ผลของกระสุนวิ่งผ่านท่อ deal* กลาง จึงต้องมี effectSourceId ถูกต้องตอน applyGutsBullet
test('ตราล่าเวท: Nursedessei Cannon ของผู้สังหารเมจดูดพลังงานเป้าหมายที่ติดตรา', () => {
  const ms = mkPlayer({ characterId: 'mageslayer', skillPoints: 0, mageslayerMarkedId: null, mageslayerHasMarked: false, mageslayerMarkTick: 0 });
  const target = mkPlayer({ hp: 9, armor: 0, skillPoints: 8 });
  engine.CHAR_HOOKS.mageslayer.applyWitchMark(engine, ms, target);
  engine.withEffectSource(ms, () => engine.applyGutsBullet(ms, { ammo: 'nurse' }, target));
  assert.equal(target.hp, 9 - engine.GUTS_NURSE_DMG, 'กระสุนสร้างความเสียหายตามปกติ');
  assert.equal(ms.skillPoints, engine.GUTS_NURSE_DMG, 'ขโมยพลังงานเท่าดาเมจที่ปืนสร้าง');
  assert.equal(target.skillPoints, 8 - engine.GUTS_NURSE_DMG);
});

test('ตราล่าเวท: Shockwave Bullet ทำลายเกราะแล้วยังดูดพลังงานเท่าเกราะที่พังไป', () => {
  const ms = mkPlayer({ characterId: 'mageslayer', skillPoints: 0, mageslayerMarkedId: null, mageslayerHasMarked: false, mageslayerMarkTick: 0 });
  const target = mkPlayer({ armor: 3, skillPoints: 8 });
  engine.CHAR_HOOKS.mageslayer.applyWitchMark(engine, ms, target);
  engine.withEffectSource(ms, () => engine.applyGutsBullet(ms, { ammo: 'shockwave' }, target));
  assert.equal(target.armor, 0);
  assert.equal(ms.skillPoints, 3, 'ขโมยพลังงานเท่าเกราะที่ถูกทำลาย');
});

test('ตราล่าเวท: ปืนของคนอื่นยิงเป้าหมายเดียวกัน ไม่มีใครได้พลังงาน', () => {
  const ms = mkPlayer({ characterId: 'mageslayer', skillPoints: 0, mageslayerMarkedId: null, mageslayerHasMarked: false, mageslayerMarkTick: 0 });
  const shooter = mkPlayer();
  const target = mkPlayer({ hp: 9, armor: 0, skillPoints: 8 });
  engine.CHAR_HOOKS.mageslayer.applyWitchMark(engine, ms, target);
  engine.withEffectSource(shooter, () => engine.applyGutsBullet(shooter, { ammo: 'nurse' }, target));
  assert.equal(ms.skillPoints, 0, 'ตราล่าเวทให้พลังงานเฉพาะตอนผู้สังหารเมจเป็นคนสร้างความเสียหายเอง');
  assert.equal(target.skillPoints, 8);
});
