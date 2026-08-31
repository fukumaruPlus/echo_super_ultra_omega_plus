# GAME_SYSTEM.md — คู่มือระบบเกม ECHO (เอกสารอ้างอิงภายในสำหรับ AI/ผู้พัฒนา)

> เอกสารนี้อธิบาย **การทำงานจริงของ engine** ไม่ใช่วิธีติดตั้ง/รัน (ดู [README.md](README.md))
> เลขบรรทัดอ้างอิงสภาพโค้ด ณ commit `e42c512` — ถ้าเลื่อนไปแล้วให้ค้นด้วยชื่อฟังก์ชันแทน

---

## 1. ภาพรวมสถาปัตยกรรม

```
server.js (6.3k บรรทัด)          เอนจินกลางทั้งหมด: state, เฟส, การ์ด, ดาเมจ, สกิล, socket handler
characters.js (1.7k)             DATA ล้วน — roster/ชื่อสกิล/desc/cost/img + POSITION_COLORS + publicRoster()
characters/index.js              มัดรวม CHAR_HOOKS = { [characterId]: module } — ตัวละครใหม่ต้อง require+push ที่นี่
characters/<id>.js               LOGIC ของตัวละครนั้น (40 ตัว) — export { id, ...methods(engine, ...) }
characters/_universal_status.js  บัฟ/ดีบัฟกลาง (pure function ไม่พึ่ง engine)
characters/_transforms.js        ตาราง metadata คัตซีน (TRANSFORMS) — data ล้วน
characters/yuna.js               "ไอดอลประจำสนาม" ไม่ใช่ตัวละครที่เล่นได้ (ไม่อยู่ใน CHAR_HOOKS, require ตรง)
client/src/                      React (Vite): App.jsx คุมฉาก, screens/Game.jsx (4k บรรทัด) คือ UI สนามทั้งหมด
tests/                           node --test (ไม่มี dep เพิ่ม) — มี integration test ที่ spawn server จริง
```

**หลักการแบ่งความรับผิดชอบ**
- `characters.js` = ตัวเลข/ข้อความที่ผู้เล่นเห็น (ไม่มี logic)
- `characters/<id>.js` = ผลของสกิลจริง — เรียก state ผ่าน `engine.*` เท่านั้น ห้าม require server.js (จะ circular)
- `server.js` = ผู้ถือ state จริง + เรียก hook ตามจังหวะ (dispatcher)
- ผลที่ "ตัวละครไหนก็ควรใช้ร่วมกันได้" → ใช้สถานะ universal ไม่สร้าง key เฉพาะตัวใหม่

**engine object** (`server.js:6112`) คือ context ที่ส่งให้ hook ทุกตัว — เพราะ `gameState`/`roundNumber`/`centralDeck` เป็น `let`
จึง expose ผ่าน getter/setter (`engine.gameState`, `engine.setGameState(v)`) ไม่ใช่ค่า primitive ตรงๆ

---

## 2. State machine (`gameState`)

```
LOBBY → TEAM_MODE → TEAM_SETUP → PLAYING ⇄ CUTSCENE → SUMMARY → ATTACK → TRANSITION → (วน PLAYING) → GAMEOVER → LOBBY
```

| state | ความหมาย | timer |
|---|---|---|
| `LOBBY` | ห้องรอ กด ready — ครบ 2+ คน & ready หมด → `enterModeSelect()` | – |
| `TEAM_MODE` | โหวตโหมด (ffa / duo / trio / overload) | – |
| `TEAM_SETUP` | เลือกทีม A/B/C + ยืนยัน | – |
| `PLAYING` | เฟสจั่วไพ่ + ใช้สกิล/ไอเทม | `cardPhaseSeconds()` = `CARD_TIME` 60s (เหลือ 40s ระหว่างท่าไม้ตายของเอจิ) — เอจิจั่ว 1 ใบ บีบเวลาที่เหลือลงอีกผ่าน `reduceCardTimer()` |
| `CUTSCENE` | เล่นวีดีโอในคิว (พัก state เดิมไว้) | ตาม `seconds` ของแต่ละคลิป |
| `SUMMARY` | เปิดแต้มทุกคน ประกาศผู้ชนะ | `SUMMARY_TIME` 5s |
| `ATTACK` | ผู้ชนะเลือกเป้า (หมดเวลา = สุ่มเป้าให้) | `ATTACK_TIME` 15s |
| `TRANSITION` | แบนเนอร์ "รอบที่ N" | `TRANSITION_TIME` 3s |
| `GAMEOVER` | ประกาศผู้ชนะสุดท้าย | – |

`startPhaseTimer(seconds, onExpire)` (`:847`) มีตัวเดียวทั้งเกม — ต้อง `clearPhaseTimer()` ทุกครั้งที่เปลี่ยนเฟส

---

## 3. วงจร 1 รอบ (call chain ที่ต้องจำ)

```
dealRound()            :2833  เริ่มรอบ: roundNumber++, สับเด็คใหม่, ล้าง cutsceneQueue/lastLog,
                              เปิดร้านทุก 5 เทิร์น, Yuna window, ฟื้นเกราะรอบคู่, แจกไพ่ใบแรก
   ↓ (ผู้เล่นกด)
hit(id)                :3105  จั่ว 1 ใบ (เช็ค nodraw/ครุ่นคิด/เพดานแต้ม/โชคลาภ/สภาพชา) → checkAllLocked()
useSkill(id,tier,...)  :3181  ใช้สกิล (ดูข้อ 6)
lock(id)               :3161  "เปิดไพ่" = พร้อม — ยิง applyLockColorTriggers() ก่อนล็อก
   ↓
checkAllLocked()       :4158  มนุษย์ทุกคน locked && ไม่มี pending answer → resolveRound()
resolveRound()         :4251  เคลียร์ข้อเสนอค้าง (สัญญา/Locacaca/พันธมิตร/บทเพลง) → ANATA → ยูกิจั่วปิดท้าย
                              → หาผู้ชนะ (best) / ผู้แพ้ (worst) → แจกดาเมจแพ้ → afterResolve()
   └ ถ้าแต้มสูงสุดเสมอ & rand<30% → triggerOverloadForce() → restoreTurnSnapshot() (ย้อนทั้งเทิร์น) → beginOverloadForceDraw() (แจกไพ่ใหม่ในเทิร์นเดิม)
afterResolve()         :4502  เอฟเฟกต์หลังเปิดไพ่ (tepeu kill / Ashen Trail / บัฟแตกไพ่) + คัตซีน afterReveal
                              → runCutsceneQueue(goSummary)
goSummary()            :4549  gameState = SUMMARY, timer 5s
afterSummary()         :4561  ผู้ชนะโจมตีไม่ได้ไหม (หลับ/สตั้น/เร้นเงา/เสมอแต้ม) → endTurn()
                              ไม่งั้น gameState = ATTACK รอ doAttack
doAttack(by,target)    :4723  ท่อดาเมจเต็ม (ดูข้อ 5) → postAttackFollowup()
postAttackFollowup()   :4638  โจมตีซ้ำ (nanaya/miyako/takuto/ยูกิ 2 เป้า) หรือ → endTurn()
endTurn()              :5363  ลดเทิร์นสถานะทั้งหมด, ระเบิดค้าง (eva/shrade), เก็บกวาดสัญญา/พันธมิตร,
                              แจกแต้มสกิล+เหรียญ, เช็คจบเกม → TRANSITION → dealRound()
```

**จุดพลาดที่เจอบ่อย**: `dealRound()` ล้าง `cutsceneQueue` ทิ้ง — โค้ดที่คิววีดีโอไว้ต้องอยู่ **หลัง** บรรทัดนั้นเสมอ

---

## 4. การ์ดและแต้ม

- **กองกลางร่วม 43 ใบ** สับใหม่ทุกรอบใน `dealRound()` (ทุกคนจั่วจากกองเดียวกัน — ไพ่หมดกอง = จั่วไม่ได้)
  - เลข 1–10 × 4 สี (red/blue/green/yellow) = 40 ใบ + `king` + `queen` + `joker`
- `drawFromCentralDeck(predicate)` `:1050` — สุ่มจาก index ที่ผ่าน predicate (ใช้ทำ "โชคลาภ" / "จั่วได้แค่ 2-3 แต้ม")
- `drawInitialCard()` ห้ามได้การ์ดพิเศษ
- **การ์ดพิเศษ**: King = เหรียญ +10 ทันที · Queen = `freecast` ใช้สกิลฟรี 1 ครั้ง (หายจบเทิร์น) · Joker = `+min(12, 21-base)` (โหมด Overload = +12 ตายตัว)
- **ทริกเกอร์สี ครบ 3 ใบ/ชุด**
  - 🔵 ฟ้า → ทำงาน **ทันทีตอนจั่ว** (`checkBlueTrigger`): ต้านสถานะผิดปกติ 1 เทิร์น
  - 🔴 แดง / 🟢 เขียว / 🟡 เหลือง → ประเมิน **ตอนกด lock** (`applyLockColorTriggers` `:1122`): แดง = ATK รอบนี้ +n · เขียว = ฟื้นเลือด +n · เหลือง = แต้มสกิล +2n
- **แต้ม**: `calculateScore()` `:1082` (raw) → `scoreOf(p)` `:1158` (+cardBonus, cap ตามบัฟ) → `bustedOf(p)` `:1164`
- **เพดาน** `scoreCap(p)` `:1151`: ปกติ 21 · `fiber` (เสือนอนกิน) 19 ไม่แตก · `upg` (ฮิคารุ) 20 ไม่แตก · Overload = `Infinity`
- **ไพ่แตกแล้วไม่ล็อกอัตโนมัติ** — ยังกดสกิล/ไอเทมได้จนกว่าจะกดเปิดไพ่เอง แต่ท่าไม้ตายที่กดไปเป็นโมฆะ (`voidUltimateOnBust` `:1918`)

---

## 5. ท่อความเสียหาย (สำคัญที่สุด)

**ค่าคงที่ฐาน**: `MAX_HP = 7` · `MAX_ARMOR = 3` · `MAX_SKILL = 8` (Bard = 9) · `MAX_PLAYERS = 7` (patch 2.8 — บอสยูกิย้ายไปนั่ง position 8)
(เพดานเฉพาะตัว: ฮาคุโนะ 6-5/2-3 · เอสคานอร์ Last Stand 7/0 · เอวา 13 เกราะ 0 · **เอจิ 4/4**)

**ลำดับการรับดาเมจ**: `shield` (กันครั้ง) → `armor` (เกราะ) → `hp` (เลือดจริง) — hp ถึง 0 = ตกรอบ

| ฟังก์ชัน | พฤติกรรม |
|---|---|
| `damageSoft(p)` `:1763` | 1 หน่วยมาตรฐาน: shield → armor → hp (ใช้กับดาเมจแพ้จั่ว) |
| `dealMixed(p,n,isNormal)` `:1822` | n หน่วย เกราะก่อนแล้วเลือด (ท่ามาตรฐานของสกิล/โจมตี) |
| `dealDirect(p,n,isNormal)` `:1800` | ทะลุเกราะ เข้าเลือดจริงตรงๆ (ยังกิน shield) |
| `dealArmorOnly(p,n)` `:1813` | กินเฉพาะเกราะ |
| `loseHp(p)` / `loseArmor(p)` | primitive ระดับ 1 หน่วย — ห้ามแก้ `p.hp` ตรงๆ นอกจากนี้ |
| `instantDeath(p)` `:1370` | สังหารทันที (ผ่านระบบกันตายก่อน) |

ทุก path ผ่าน `adjustIncomingDamage()` `:1784` → `CHAR_HOOKS[id].adjustIncomingDamage()` และเช็ค
`sealActive` (อมตะ ไม่รับดาเมจ) + `friendlyEffectBlocked` (ยิงพวกเดียวกันในโหมดทีม)

`isNormalAttack = true` **เฉพาะที่ `doAttack()` เรียกเท่านั้น** — ใช้แยกว่าเป็น "โจมตีปกติ" (มีผลกับสกิลกันดาเมจหลายตัว)

**พลังโจมตี**: `computeAttackBase(engine, attacker, target)` `:4690` — ฐาน 1 หน่วย บวกจาก
`hook.attackBaseOverride()` (แทนที่ฐาน) + `hook.damageBonus()` (บวกทับ) + บัฟ ungated ที่แจกข้ามตัวละครได้ (`veil`, `partner`, `cardAtkBonus` ฯลฯ)
→ มีเทสต์แยกที่ [tests/computeAttackBase.test.js](tests/computeAttackBase.test.js)

**ระบบกันตาย** (เรียกหลังทุกดาเมจก้อนใหญ่): `maybeBeatSave` (กันตาย 1 ครั้ง/เกม) → `maybeBeatMode` (เลือด<3 เข้าโหมด) → `maybeEva3` → `resolveDamageAftermath`

ท้าย `dealDirect`/`dealMixed`/`dealArmorOnly` ทั้งสามตัวเรียก `mageslayerMarkSteal(target, n)` — จุดเดียวที่ทำให้
"ตราล่าเวท" ของผู้สังหารเมจขโมยพลังงานจาก **ดาเมจทุกประเภท** (ปืน/สกิล/โจมตีปกติ) โดยดูต้นตอจาก `effectSourceId`
ดังนั้นเอฟเฟกต์ที่ยิงดาเมจต้องห่อ `withEffectSource` ไม่งั้นตราล่าเวทเงียบ

**ดาเมจแพ้รอบ** (`resolveRound` `:4400`): แต้มน้อยสุด → `damageSoft` 1 หน่วย + แต้มสกิล +1 — มีทางยกเว้นหลายชั้น (`sealActive`, `beatSaved`, `monster`, eva13 loss-immune, `fullbelly` ลด 1)

---

## 6. สกิล

| tier | cost | หมายเหตุ |
|---|---|---|
| `passive` (+ `passive2`/`passive3`) | ฟรี | ทำงานเองตาม trigger `roundStart`/`win`/`lose`/`attacked` หรือ engine เรียกตรง |
| `basic` | 2 | |
| `secondary` | 4 | |
| `ultimate` | 6 | หลอดจุ 8 |

**ใช้ได้ 1 สกิลต่อเทิร์น** (`p.skillUsedRound`) — ยกเว้นตัวที่มีโควตาของตัวเอง (Bard 2 โน้ต/เทิร์น, kai/takumi 5 ครั้ง)
· **คู่แฝดฮิซากาว่า** สกิลพื้นฐาน (สลับตัว/ชุบแฝด) เป็น **ทางหนี** ที่อะไรก็ปิดกั้นไม่ได้ — `useSkill()` ข้าม `p.locked`
  (สตั้น/หลับไหล), `noskill` และ `moonCellActive()` ให้เฉพาะ `tier === "basic"` ของตัวละครนี้ (ปุ่มฝั่ง client ปลดล็อกด้วย `isHisakawa`)
  · ไม่มีโควตาแยก แต่ "รีเซ็ต" `skillUsedRound` ได้ 2 ทาง — สลับตัว/ชุบแฝด (สกิลพื้นฐาน กดได้แม้ใช้สกิลไปแล้ว
  จำกัดสลับ 1 ครั้ง/เทิร์นด้วย `p.hisakawaSwitchedRound`) และสกิล**ทุกตัว**ที่เหลือซึ่งคืนสิทธิ์ให้อีก 1 ครั้ง
  (ชุบแฝด · สกิลรองทั้งสอง · Miracle Live · Miracle Dance · O-KU-RI-MO-NO-Sunday)
  (`p.hisakawaBonusRound` กันไม่ให้แจกซ้ำในเทิร์นเดียว — สลับตัวล้างค่านี้ แฝดที่ออกมาใหม่จึงได้โบนัสของตัวเองอีก 1 ครั้ง) — ทั้งหมดอยู่ใน `CHAR_HOOKS.hisakawa_sister.applySkill()`

**สูตรราคาจริง** (`useSkill` `:3316`–`:3360`)
```
cost = min(SKILL_COST_MAX /* 8 */,
         max(0, skill.cost - statusAmt(spellflow))   // กระแสเวท (ลดราคา)
       + (nightTaxTier === tier ? 1 : 0)             // กลางคืน: สุ่มแพงขึ้น 1 tier/คน/เทิร์น
       + min(SPELLBURDEN_MAX /* 2 */, statusAmt(spellburden)))  // ภาระเวท
// ตัวปรับ "ขาขึ้น" ทุกตัวรวมกันดันราคาได้ไม่เกิน 8 → สกิลที่ cost 8 อยู่แล้วจะไม่แพงขึ้นอีก
// publicState() คิดสูตรเดียวกันเป๊ะ (ราคาบนปุ่ม = ราคาที่หักจริง)
ถ้า cost > 0 และมี freecast (การ์ด Queen) → ฟรี 1 ครั้ง
```

**การได้แต้มสกิล** (จุดจริงในโค้ด — ตัวเลขใน README เก่ากว่านี้):
- จบเทิร์น **+1** (เช้าที่แจกโบนัส = **+2**) — `endTurn()` `:5546`
- แพ้เพราะแต้มน้อยสุด / ไพ่แตก **+1** — `resolveRound()` `:4437`
- ทริกเกอร์ไพ่เหลืองครบ 3 ใบ **+2 ต่อชุด**
- รีเจนพิเศษรายตัวละคร (satoru / hakuno หญิง / ultraman_trigger / hisakawa / ignis · eiji ระหว่างท่าไม้ตาย) +1 ต่อเทิร์น
- **ชนะการจั่วไม่ได้แต้มสกิลแล้ว** (patch 2.1.3.5) และ **การโดนโจมตีก็ไม่ได้แต้ม** — ไม่มี `addSkill` ให้เป้าหมายใน `doAttack()` เลย
- บล็อกการฟื้นแต้ม: `stagger` (ชะงัก) · `manaSeal` · ตัวละคร mageslayer · ยูกิ (`maxSkillOf` = 0) · `skillDrain` (ค่าปรับ −1/เทิร์น)
- `addSkill(p, n, src)` — `src` เป็น tag ของ "ช่องทางฟื้นฟู" (`"item"` / `"passive"` / `"card"`) ใส่เฉพาะจุดที่เป็น
  การฟื้นพลังงานจริงๆ (ไอเทม / พาสซีฟตัวละคร / ไพ่เหลืองครบชุด) **ไม่ใส่** ให้แต้มพื้นฐานจบเทิร์น ค่าชดเชยการแพ้
  หรือการโอนแต้มระหว่างผู้เล่น — ใช้ตัดสินว่าดีบัฟ `manaLeech` (ดูดซับเวท) จะโรล 35% หรือไม่

**โจมตีเพิ่มในเทิร์นเดียวกัน** (เปิดเฟส `ATTACK` ซ้ำจาก `postAttackFollowup()` — เลือกเป้าหมายใหม่ได้ทุกครั้ง):
yuuki · nanaya · miyako (คอมโบ) · takuto (คอมโบ + ครั้งที่ 3) · kotone · byleth (จบการศึกษา) ·
**hisakawa_sister** 2 ทาง — "จังหวะนี้แหละ" (แต้มต่ำสุดแบบไม่เสมอ ได้ตีหลังผู้ชนะ · บัฟคู่ ใครคุมอยู่ก็ได้ตี) และ
"ฝันของเหล่าฝาแฝด" (ทุกครั้งที่โจมตีโดน แฝดอีกคนออกมาตีเป็นครั้งที่ 2 เสมอ 100% ดาเมจคงที่ 2 ทับทุกโบนัส —
นับรวมหมัดที่ได้จาก "จังหวะนี้แหละ" ด้วย
ต้องมีแฝดครบทั้งคู่ · `p.hisakawaDreamPending` จอง → `startDreamFollowupAttack()` เปิดเฟส → `p.hisakawaDreamAtk`
ทำให้ `doAttack()` ทับดาเมจและ `displayImg()` โชว์ภาพแฝดอีกคน · หมัดที่ 2 ไม่ทอยต่อเป็นลูกโซ่)

**สกิลที่สลับตัวเองได้** (`useSkill` เลือก `skill` object ใหม่ก่อนคิดราคา): shrade_elan, shiki (เลือกตอน join), riddhe, banagher, phenex, hakuno (เพศ), hikaru, oguri, takuto, escanor, hisakawa_sister, ignis, oberon (ตามช่วงเวลา), kotone (ตามช่วงเวลา + ร่าง [พร้อมลุย] ทับทั้ง 3 ช่อง)

**คอสที่ไม่ใช่แต้มสกิล**: ท่าไม้ตายในร่าง [พร้อมลุย] ของโคโตเนะจ่าย **6 แต้มสกิล + 6 เหรียญ** — ด่านเงินเช็คที่
`CHAR_HOOKS.kotone.canUseSkill()` (ก่อนหักแต้ม) และหักจริงที่ `payFormUltGold()` ในส่วน effect
· **อาจารย์ ไบเลธ (patch 2.6)** จ่ายด้วยทรัพยากรเฉพาะตัว "ความรู้" (`p.bylethKnowledge` เพดาน 20 — แก้ผ่าน
`CHAR_HOOKS.byleth.addKnowledge()` เท่านั้น): สกิลรอง 4 หน่วย · ท่าไม้ตายต้องมี ≥ 4 แล้วกิน 1 หน่วยต่อเทิร์นจนหมด/กดปิด

**ไบเลธ — ท่าไม้ตายที่เป็น "สวิตช์กติกาสนาม"** (`p.bylethCourse` = `normal` | `ex` | `end` | `null`) ไม่ใช่สถานะนับเทิร์น
จึงไม่อยู่ในลูปลดเทิร์นของ `endTurn()` — ปิดตัวเองที่ `onRoundStartTick()` เมื่อความรู้หมด จุดที่ engine เรียกใช้:
`resolveRound()` (มาตราฐาน: สตั้นผู้ชนะ/แต้มสกิลผู้แพ้/ยกเว้นดาเมจไพ่แตก · พิเศษ: ลงโทษคนกดสกิลจาก `engine.roundSkills`)
· `afterSummary()` (พิเศษ: คนกดสกิลรองโจมตีไม่ได้) · `onCardDrawn()` + `postAttackFollowup()`/`endTurn()` + `useSkill()`/`publicState()`
(จบการศึกษา: บีบเวลา 2 วิ/การ์ดทุกใบที่ผู้เล่นทุกคนจั่วระหว่างเฟส PLAYING · ไบเลธแต้มน้อยสุดแบบไม่แตกได้โจมตีเพิ่มแม้ผู้ชนะไม่ได้โจมตี · ลดค่าใช้สกิลรอง/ท่าไม้ตาย 1 แต้มที่ต้องคิดเหมือนกันทั้งสองที่)
สถานะ "เริ่มมีผลเทิร์นหน้า" (สตั้นผู้ชนะ / ห้ามสกิลพื้นฐาน) ใช้ธง `bylethStunPending` / `bylethNoBasicPending`
แล้วแปลงเป็นสถานะจริงที่ `dealRound()` ผ่าน `applyPendingFromCourses()` — ต้องอยู่ก่อนบล็อกเช็คสตั้นเสมอ
เทสต์: [tests/characters/byleth.test.js](tests/characters/byleth.test.js)

**คอนเนอร์ RK800 (patch 2.7)** — ตัวละคร **unique ตัวแรก** (`unique: true` ใน `characters.js`) เลือกได้ 1 คนต่อเกม
เซิร์ฟเวอร์กันซ้ำที่ handler `join` (ตอบ `characterTaken` แล้วไม่ให้เข้า) · ฝั่ง client ปิดการ์ดไว้ผ่าน event `takenChars`
ที่ `broadcastPositions()` ยิงคู่กับ `positions` ทุกครั้ง

- **"ความเครียด" (`p.connorStress` 0-10)** อยู่ที่ **ผู้เล่นคนอื่นทุกคน** ไม่ใช่ที่ตัวคอนเนอร์ — เป็นตัวเลข UI ล้วน
  ไม่ใช่ `p.statuses` จึงไม่อยู่ในลูปลดเทิร์นของ `endTurn()` และ **ต้าน/ล้างไม่ได้** (ไม่เช็ค `resist` โดยตั้งใจ)
  ทุกแหล่งต้องผ่าน `CHAR_HOOKS.conner.addStress()` เท่านั้น — จุดที่ engine เรียก: `useSkill()` (+1/ครั้ง) ·
  `useInventoryItem()` (+1/ครั้ง) · `hit()` (+1 ครั้งเดียวต่อเทิร์น กันซ้ำด้วย `p.connorStressDrewRound`) ·
  `resolveRound()` ผู้ชนะ (+1) · `doAttack()` ผู้ที่ตีคอนเนอร์ (+2) · `endTurn()` ลดลง 1 (ไพ่แตก -1 เพิ่ม)
  · **บอสยูกิอยู่นอกระบบนี้ทั้งหมด** (สตั้นจากการจับกุมจะทำให้ `autoPlayYuuki()` ค้าง)
- **`accused` ("ผู้ต้องหา")** เป็นสถานะนับเทิร์นปกติ (ไม่ต้อง `continue` ในลูป `endTurn`) อยู่ใน `BASIC_DEBUFF_CLEAR`
  — เป็นเครื่องหมายล้วน ผลอยู่ที่ `CHAR_HOOKS.conner.damageBonus()` (คอนเนอร์ตีแรงขึ้น +2)
- **โหมด "การไล่ล่า" (สกิลติดตัว 2)** = สวิตช์กติกาสนาม 3 เทิร์น เก็บที่ `p.connorChase` ของคอนเนอร์
  (`{ targetId, round, mine, theirs }` — เป็น plain object จึงย้อนคืนได้ครบผ่านสแนปช็อต Overload Force)
  - คนนอกวง: `p.connorFrozen` -> **`bustedOf()` คืน true ทันที** + `locked` + `actionBlocked()` ปิด `hit`
  - **`skillBlocked()` ปิด `useSkill`/`useInventoryItem` ของ *ทุกคน*** รวมคอนเนอร์กับเป้าหมายเอง — เหนือกว่า
    "ทางหนี" ของคู่แฝดฮิซากาว่าด้วย (การไล่ล่าเป็นการดวลแต้มล้วน ห้ามใครแทรก)
  - `resolveRound()` เรียก `CHAR_HOOKS.conner.chaseResolveRound()` **ก่อนหาผู้ชนะ** — คืน true = ระงับกติกาปกติทั้งก้อน
    แล้ว **ข้าม `afterResolve()` ไปที่ `runCutsceneQueue(goSummary)` ตรงๆ** เพราะเอฟเฟกต์หลังเปิดไพ่ที่กวาด
    "คนที่ไพ่แตก" (Ashen Trail ของโอกูริ ฯลฯ) จะไปลงคนที่ถูกแช่ ทั้งที่กติกาบอกว่าพวกเขาไม่รับความเสียหาย
  - `afterSummary()` ตัดเฟส `ATTACK` ทิ้งทุกเทิร์นระหว่างไล่ล่า
  - คำขาด "ยอมจำนน / ขัดขืน" ใช้กลไก pending answer แบบเดียวกับสัญญา (`p.connorArrestAsk` +
    เช็คใน `checkAllLocked()` + กวาดตอนหมดเวลาใน `resolveRound()`) — **ไม่ตอบ = ขัดขืน**
  - ตัดสิน: แต้มรวมสูงกว่าเท่านั้นถึงชนะ · **เสมอ = คอนเนอร์แพ้** · ถึง `CHASE_CLINCH` (2) แต้มเมื่อไหร่ตัดจบทันที ไม่นับให้ครบ 3
  - `cleanupChase()` ที่ `endTurn()` เป็นตาข่ายกันธง `connorFrozen` ค้างถาวรเมื่อคอนเนอร์ตายกลางการไล่ล่า
- **ฟื้นคืนชีพ (สกิลติดตัว 3)** ไม่ใช่การกันตาย — `instantDeath()` ให้ตกรอบจริงก่อนแล้วค่อยจอง `p.connorReviveRound`
  (`= roundNumber + 10`) · `dealRound()` เรียก `maybeRevive()` **ก่อน** บล็อกข้ามผู้เล่นที่ตายแล้ว
  ดังนั้น **ถ้าเกมจบก่อนครบ 10 เทิร์นก็ไม่ได้ฟื้น** (เงื่อนไขจบเกมไม่ถูกแก้)
- **ลำดับ "วีดีโอก่อน แล้วค่อยเกิดความเสียหาย"** มี 2 ที่: ท่าไม้ตายใช้ `pausePlayingForCutscene(() => applyCloseCase())`
  (มีตาข่ายสำรองลงดาเมจทันทีถ้าไม่ได้เข้าเส้นทางคัตซีน) · สกิลติดตัว 4 จองคู่กรณีไว้ที่
  `p.connorCounterPending` แล้วลงดาเมจที่ `postAttackFollowup()` ซึ่งทำงานหลัง `runCutsceneQueue` ของ `doAttack` เสมอ
- **คลิปชุดไล่ล่า/ป้องกันตัว/ปิดคดีเรียกผ่าน `queueCutscene` = เล่นทุกครั้ง** ส่วนเปิดตัว/สอบปากคำใช้ `triggerCutscene` = ครั้งเดียวต่อเกม
เทสต์: [tests/characters/conner.test.js](tests/characters/conner.test.js)

**โมโรโบชิ ดัน (patch 2.8)** — ครูฝึกที่ต่อยเองไม่ได้: `attackBaseOverride` คืน **0** (สกิลติดตัว 2 "อาการบาดเจ็บ")
แต่บัฟทุกตัวยังบวกทับได้ เพราะ `computeAttackBase` บวก veil/empower/partner/cardAtkBonus ต่อจากค่าฐานเสมอ
ดาเมจของเขามาจาก "ผลของการที่คนอื่นเล่นพลาด" ทั้งหมด และลงที่ `afterResolve()` เป็นหลัก
- สถานะทั้ง 3 ตัวเป็น**สถานะนับเทิร์นปกติ** (ลดเทิร์นในลูป `endTurn()` ได้เลย ไม่ต้อง `continue`) แต่มี mirror
  ที่ต้องล้างตอนหมดอายุ -> `CHAR_HOOKS.dan.onStatusExpire()` ถูกเรียกในลูปนั้น
  - `danCrutch` (ที่ตัวดัน) ฟื้นเลือด 1/เทิร์นที่ `onRoundStartTick` · ระหว่างติดอยู่ `canUseSkill` ปิดสกิลพื้นฐาน
  - `danDisciple` (ที่เป้าหมาย) เป็นบัฟ ATK **ungated** — อ่านที่ `computeAttackBase` เหมือน `veil`/`partner`
    ไม่ใช่ที่ `damageBonus` ของ hook (เพราะเป็นบัฟที่แจกให้ผู้เล่นคนอื่น ไม่ผูกกับตัวละครเจ้าของสกิล)
    · **สวนได้ครั้งเดียวแล้วสถานะหลุดทันที** (patch 2.8.1) ไม่งั้นเป้าหมายจะตีดันไม่ได้เลยตลอด 3 เทิร์น
  - `danChase` (ที่เป้าหมาย) มี mirror สองทาง: `target.danChaseBy` + `dan.danChaseTargetId` — ปลดผ่าน
    `stopChase()` จุดเดียวเสมอ (หมดอายุ / ตีดันครบ `CHASE_BREAK_HITS` 2 ครั้ง / เป้าหมายหรือดันตกรอบ / เปลี่ยนเป้าหมายใหม่)
    · **จบก่อนครบ 5 เทิร์น = คืนแต้มสกิลให้ดัน 3 หน่วย** (`stopChase(..., refund=true)`) ยกเว้นตอนดันเปลี่ยนเป้าเอง
      (นั่นคือย้ายเป้า ไม่ใช่ท่าถูกสลัดหลุด — ไม่งั้นกดวนรีดแต้มได้) และตอนดันตายไปเอง
    · `stopChase()` **ต้อง idempotent** — `instantDeath()` เรียก `onDeath()` ซึ่งปลดสถานะไปแล้ว
      จุดที่เรียกซ้ำตามหลังจะคืนแต้มรอบสองถ้าไม่กัน
- **ดาเมจ "จากศิษย์" ลดลง 2** ใช้ `engine.effectSourceId` (getter ที่ patch นี้เปิดให้ hook อ่าน) ใน
  `adjustIncomingDamage` — ไม่มีพารามิเตอร์ผู้กระทำส่งมาให้ในท่อนั้น จึงต้องดูต้นตอจาก `withEffectSource`
- **ท่าไม้ตายสลับตัวเองแบบมีเงื่อนไข**: เป้าหมาย `danChase` แพ้แต้มติดกัน 2 ครั้ง (`danLoseStreak`, ไม่นับไพ่แตก)
  -> `dynamicSkillFor()` คืน `ultimate2` — ต้องคิดสูตรเดียวกันเป๊ะทั้งที่ `useSkill()` และ `publicState()`
  และ client ตัดสินจากธง `me.danWhip` ที่ server ส่งมา **ห้ามเดาจากชื่อ/ราคาสกิลบนปุ่ม**
  - **สิทธิ์ใช้ต้องจองเป็น "เลขรอบ" ไม่ใช่อ่านสถานะสดตอนกด** (`dan.danWhipRound` + `dan.danWhipTargetId`
    ตั้งตอนสตรีคครบใน `onAfterResolve`) — บั๊กเดิม: `whipReady()` อ่าน `chaseOn(target)` ตรงๆ พอสตรีคครบ
    ในเทิร์นที่ `danChase` เหลือ 1 พอดี `endTurn` จะลดเป็น 0 แล้ว `onStatusExpire` ล้าง `danLoseStreak` ทิ้ง
    ปุ่มจึงขึ้นแค่ตอนสรุปผลแล้วหายไปก่อนถึงเทิร์นที่กดได้จริง ทั้งที่ log ประกาศไปแล้วว่า "เทิร์นหน้าเปลี่ยนเป็น..."
  - หน้าต่างใช้งานคือ **เทิร์นถัดไป 1 เทิร์นเป๊ะ** (`roundNumber === danWhipRound`) และจะถูกจองใหม่ทุกครั้ง
    ที่สตรีคยังครบเงื่อนไข — เป้าหมายตกรอบเมื่อไหร่สิทธิ์นี้ใช้ไม่ได้ทันที
- **ลำดับ "วีดีโอก่อน แล้วค่อยเกิดความเสียหาย"** ของท่าไม้ตาย 2 ใช้ `pausePlayingForCutscene(() => applyWhip())`
  พร้อมตาข่ายสำรองลงดาเมจทันทีถ้าไม่ได้เข้าเส้นทางคัตซีน (แพทเทิร์นเดียวกับ "จัดการปิดคดี" ของคอนเนอร์)
- **คลิปทุกตัวเรียกผ่าน `queueCutscene` = เล่นทุกครั้ง** ไม่มีคลิปไหนเล่นครั้งเดียวต่อเกม · `danScold`
  (สกิลติดตัว 1) ตั้ง `noIntro: true` ใน `TRANSFORMS` -> client ข้ามการ์ดเปิดตัว 950ms เข้าวีดีโอเลย
  และคลิปนี้ขึ้น **ครั้งเดียวต่อเทิร์น** ถึงจะมีคนไพ่แตกพร้อมกันหลายคน
เทสต์: [tests/characters/dan.test.js](tests/characters/dan.test.js)

**แบทแมน ร่างรถแบทโมบิล (patch 3.1)** — ถอด "เร้นเงา" ออกจากเกม แล้วแทนที่ด้วยร่างที่ 2 ของตัวละคร
- กลไกทั้งหมดของร่างรถรวมศูนย์ที่ **หัวของ `loseHp()`** ผ่าน `CHAR_HOOKS.bat_ben.carAbsorb()` —
  จุดคอขวดเดียวที่พลังชีวิตลดได้ ทำให้ได้ทั้งสองอย่างพร้อมกัน: ดาเมจไม่มีทางแตะตัวแบทแมน
  และการโจมตี "ทะลุเกราะ" (`dealDirect`) กลายเป็นดาเมจที่เกราะเอง = สกิลติดตัว 2 "รถคู่ใจ"
- **ต้องเช็คที่ `loseArmor()` ด้วยอีกจุด** (`onArmorLost`) — ถ้าดาเมจพอดีกับเกราะที่เหลือ
  ท่าจะไม่เคยเรียก `loseHp` เลย รถก็จะไม่พังทั้งที่เกราะเป็น 0 แล้ว
- **`p.hp` ระหว่างอยู่บนรถถูกตั้งเป็น "เต็ม" ไม่ใช่ 0** ตามตัวอักษรของสเปค เพราะเอนจินมีจุดกวาด
  `if (o.alive && o.hp <= 0) instantDeath(o)` อยู่หลายที่ — hp 0 จะโดนกวาดตายทันทีทั้งที่รถยังไม่พัง
  ผลที่ผู้เล่นเห็นเหมือนกันทุกประการ และทำให้ "คืนร่างด้วยเลือดเต็ม" เป็นจริงโดยธรรมชาติ
- **เกราะของรถห้ามฟื้นเองตามจังหวะปกติของสนาม** (`blocksArmorRegen` เกตจุดฟื้นเกราะรอบเลขคู่ใน `dealRound`)
  ไม่งั้นรถซ่อมตัวเองฟรีทุก 2 เทิร์นและแทบไม่มีวันพัง ขัดกับสเปค "ขึ้นรถถาวรจนกว่ารถจะพัง"
- **`p.hp` ที่ส่งให้ client เป็น 0/0 ระหว่างอยู่บนรถ** (ไม่ใช่ `null` ซึ่งจะขึ้น "???" ของทาคุมิ) —
  `LifeBar` วาดหัวใจตามจำนวน `maxHp` จึงไม่มีหัวใจสักดวง เหลือแต่เกราะตามสเปค ส่วนค่าจริงยังเต็มอยู่ในเอนจิน
- `basic2`/`secondary2`/`ultimate2` สลับมาทับทั้งสามช่องผ่าน `dynamicSkillFor()` — ต้องคิดสูตรเดียวกัน
  ทั้งที่ `useSkill()` และ `publicState()` เหมือนทุกตัวละครที่สลับชุดสกิล

**QTE (Quick Time Event) — ระบบกลาง (patch 3.0)** `server.js` · ตัวแรกที่ใช้คือ "ทำนองเพลงร็อก" ของยุย
```
startQte(p, { count, perNoteMs, tag })   สุ่มลำดับ w/a/s/d เก็บที่ p.qte
qteKey(id, key) / qteTimeout(id)         socket handler — ตรวจทั้ง "ตัวถูก" และ "มาทัน" ที่ server
finishQte(p, ok) -> CHAR_HOOKS[tag].onQteDone(engine, p, ok, qte)
qtePending() / sweepQte()                กันสรุปรอบ + กวาดตอนหมดเฟส
```
- **ไม่มี timer ฝั่ง server เลยโดยตั้งใจ** — `startPhaseTimer` มีตัวเดียวทั้งเกมและถูกล้างทุกครั้งที่เปลี่ยนเฟส
  ส่วน `setTimeout` ต่อ QTE มีโอกาสค้างเมื่อผู้เล่นหลุด/จบเทิร์น/กลับล็อบบี้ → เก็บแค่ `deadline` (ms)
  แล้วตัดสินตอนคำตอบมาถึงแทน เวลาจึงยังเป็นของ server เต็มร้อย
- **ไม่แช่คนอื่น**: อยู่ใน `pendingAnswer` ของ `checkAllLocked()` เท่านั้น — คนอื่นจั่ว/เปิดไพ่ได้ตามปกติ
  แค่ยังไม่สรุปรอบให้ · หมดเฟสจั่วไพ่แล้วยังไม่จบ = `sweepQte()` ถือว่าพลาด
- **กันโกง**: ลำดับปุ่มถูกสุ่มและเทียบที่ server · `buildStateFor` ส่งให้เจ้าของ **แค่ปุ่มตัวถัดไปตัวเดียว**
  (ส่งทั้งชุด = เห็นล่วงหน้าทั้งเพลง หมดความหมาย) · `qteTimeout` จาก client ถูกตรวจเวลาซ้ำก่อนเชื่อ
- **"เสียแต้มฟรี" ได้มาฟรี**: `useSkill` หัก `p.skillPoints -= cost` ก่อนลง effect อยู่แล้ว — พลาดก็แค่ไม่เรียก effect

**ยุย โยชิโอกะ (patch 3.0)** — `unique` ตัวที่สอง · ตัวละครเดียวที่ "ยิ่งเล่นเก่ง ยิ่งเข้าใกล้จุดจบ"
- สกิลติดตัว "ความปรารถนา": เล่นครบ 3 เพลงไม่ซ้ำ -> `instantDeath(p, true)` — **พารามิเตอร์ `force` ตัวใหม่**
  ที่ข้ามระบบกันตาย/เกิดใหม่ทั้งหมด (escanor/hisakawa/phenex/byleth) ตามสเปคที่ระบุว่า "ไม่สนเงื่อนไขอื่นๆ"
- เพลงเก็บเป็นสถานะบน **ผู้ฟัง** ไม่ใช่บนยุย (`yuiRock`/`yuiBeats`) — การกรองโหมดทีมจึงทำครั้งเดียวตอนแจก
  (`songAudience()`: ally/enemy/self) แล้วที่เหลืออ่านสถานะตรงๆ ไม่ต้องเช็คทีมซ้ำทุกจุด
- `girl don't cry` แจกแต้มสกิลให้ "คนน้อยสุดในวง" ที่ **`onRoundStartAfterLoop`** ไม่ใช่ในลูปต้นเทิร์น —
  ไม่งั้นการเทียบจะใช้ค่าคนละเทิร์นกันตามลำดับที่นั่ง (เหตุผลเดียวกับ `escanor.flushPendingBurn`)
- `my soul your beats` จั่วตามกันเป็นวง — **ต้องมีธงกันลูป** (`p.yuiDrawEcho`) ไม่งั้นไพ่ที่จั่วตาม
  จะไปกระตุ้นให้คนอื่นจั่วตามซ้อนกันเป็นทอดๆ ไม่รู้จบ
- **เพลงชุบชีวิต + สกิลติดตัวชนกัน (patch 3.1)**: ถ้าบรรเลงเพลงชุบชีวิตเป็นเพลงที่ 3 พอดี "ความปรารถนา"
  จะฆ่ายุยในจังหวะเดียวกัน -> เป้าหมายค้างตายถาวรและเกมจบแบบไม่มีใครได้อะไร
  `CHAR_HOOKS.yui.onDeath()` (เรียกจาก `instantDeath`) จึงชุบชีวิตให้ทันทีเมื่อ **ไม่เหลือผู้เล่นอื่นเกิน 1 คน**
  นอกเหนือจากนั้นยังยึดสเปคเดิม (ยุยตายก่อน = ผลหายไป)

**คูลดาวน์ท่าไม้ตายที่วัดเป็น "เลขรอบ" (ชิโด · เอจิ)** — คูลดาวน์ที่กินเวลาข้ามเทิร์นห้ามเก็บเป็นตัวนับใน
`p.statuses` ถ้าไม่อยากให้มันไปโผล่ในรายการสถานะให้ทุกคนเห็น จึงเก็บเป็น **เลขรอบที่ล็อกถึง**
(`p.shidoRewindLock` / `p.eijiUltLock`) แล้วเทียบกับ `engine.roundNumber` — ไม่ต้องมีใครลดเทิร์นให้
และรอดจากการย้อนเวลาของชิโดด้วย (ดู `keepPerPlayer` ของ `applySnapshot`)
- ตั้งค่าตอนสถานะหมดอายุใน**ลูปลดเทิร์นของ `endTurn()`** (`CHAR_HOOKS.eiji.onUltExpire`) ไม่ใช่ตอนกด
- ฟิลด์พวกนี้ไม่ใช่สถานะ จึง**ต้องล้างเองใน `resetCombat()`** ไม่งั้นค้างข้ามแมตช์
- ตัวเลขที่เหลือส่งให้ client ผ่าน `shidoCd` / `eijiUltCd` แล้วโชว์ด้วย prop `cooldown` ของ `SkillSlot`
  ซึ่งเรนเดอร์เฉพาะแผงของตัวเอง — ปุ่มต้องล็อกทั้งสองฝั่ง (`canUseSkill` + `disabled` ของปุ่ม)

**อิสึกะ ชิโด (patch 2.9)** — ตัวอย่างของ "สกิลที่ต้องไม่มีใครรู้ว่าถูกกด"
- **`p.shidoRecorded`** (สกิลติดตัว) บันทึกที่ **`adjustIncomingDamage`** เพราะเป็นจุดเดียวที่เห็น
  *ขนาดของก้อนดาเมจ* ก่อนถูกหั่นเข้าเกราะ/เลือด และทุกท่อ (`dealMixed`/`dealDirect`/`dealArmorOnly`)
  วิ่งผ่านที่นี่หมด · ฮุคนี้ **ไม่แก้ค่า n** แค่จดไว้ · `damageSoft` ไม่ผ่านจุดนี้ = ดาเมจแพ้จั่ว/ไพ่แตก
  ไม่มีสิทธิ์ดีดค่าที่บันทึกไว้ (ตั้งใจ — สเปคระบุว่านับเฉพาะ "ความเสียหายจากผู้เล่นอื่น")
  - กติกาค่า: พื้น 3 · โดน**แรงกว่า**ที่บันทึก = บันทึกทับ · โดน**เบากว่า** = ร่วงกลับ 3 · เท่ากันพอดี = คงเดิม
- **Sandalphon** ใช้ `attackBaseOverride` = **แทนที่** พลังโจมตีปกติ (ไม่ใช่ `damageBonus` ที่บวกทับ)
  · ค่าที่ใช้จริงอ่านจาก **`statusAmt.shidoSword`** ซึ่งล็อกไว้ตอนกด ไม่ใช่ `p.shidoRecorded` ที่ยังขยับได้
- **ท่าไม้ตาย "ฝากด้วยนะตัวฉัน" (กับดักเงียบ `GUARD_TURNS` 3 เทิร์น) ห้ามรั่วทุกช่องทาง** — ปิดไว้ 5 ชั้น:
  0. **คำอธิบายสกิลไม่บอกอะไรเลย** — `desc` ใน `characters.js` เขียนแค่ "พลังปริศนาที่ไม่สามารถเข้าใจได้"
     (ผลจริงอยู่ในคอมเมนต์ของ `characters/shido.js` เท่านั้น) เพราะ `publicRoster()` ส่ง `desc` ให้ทุกคน
     ตั้งแต่หน้าเลือกตัวละคร — เขียนผลจริงลงไปเมื่อไหร่ก็รั่วตั้งแต่ยังไม่เริ่มเกม
     · ชื่อบนฉากคัตซีนตอนย้อนเวลาก็ไม่ใช่ชื่อท่า แต่เป็น "ฉันคงต้องกลับไปแก้ไขสิ่งที่ผิดพลาด"
  1. **ไม่ใช้ `p.statuses`** เลย (สถานะทุกตัวถูกเปิดให้ทุกคนเห็นตอน SUMMARY/ATTACK ผ่าน `revealAll`)
     เก็บที่ `p.shidoGuardTurns` ซึ่ง `buildStateFor` ส่งให้ **เจ้าของคนเดียว** (`mine`)
     -> ไม่อยู่ในลูปลดเทิร์นของ `endTurn()` ต้องลดเองผ่าน `CHAR_HOOKS.shido.onEndTurn()`
     · ตัวนับนี้ (และ `shidoCd` = คูลดาวน์หลังย้อนเวลา) โผล่เป็น **ตัวเลขทับบนการ์ดท่าไม้ตาย** ผ่าน
       prop `cooldown` ของ `SkillSlot` ซึ่งเรนเดอร์เฉพาะแผงของตัวเองอยู่แล้ว จึงไม่มีทางรั่วให้คนอื่นเห็น
  2. **`silentSkill()`** ทำให้ `useSkill()` ข้าม `io.emit("skillFlash")`
  3. **ไม่เข้า `roundSkills`** — รายการนี้ถูกอ่านโดยหลักสูตร "พิเศษ" ของไบเลธที่ลงโทษ "คนที่กดสกิลเทิร์นนี้"
     ซึ่งจะกลายเป็นเบาะแสทันที
  4. **แต้มสกิลหลอก** — `buildStateFor` ส่ง `maxSkillOf(p)` ให้คนอื่นเห็นแทนค่าจริงตลอดที่กับดักเปิดอยู่
     (ไม่งั้นแต้มที่หายไป 8 หน่วยเป็นเบาะแสชัดๆ)
- **ผลของกับดักคือ "ย้อนเวลากลับ 5 เทิร์น" (patch 2.9.1)** — ย้อนทุกอย่าง: พลังชีวิต/เกราะ/สถานะ/แต้มสกิล/
  เหรียญ/ไอเทม/ของในร้าน/เลขรอบ/วงจรวัน-คืน และ **ปลุกผู้เล่นที่ตกรอบไปแล้วกลับมาทั้งหมด**
  - ใช้ **ระบบสแนปช็อตตัวเดียวกับ Overload Force** แต่เก็บเป็นวงแหวนย้อนหลัง `SNAPSHOT_HISTORY_MAX` (6) ใบ:
    `buildSnapshot()` / `pushSnapshotHistory()` (เรียกคู่กับ `captureTurnSnapshot()` ปลาย `dealRound`) /
    `snapshotBefore(n)` / `applySnapshot(snap, keepPerPlayer)` — เปิดให้ hook ผ่าน `engine.*`
  - **`engine.setRoundNumber(snap.round - 1)`** ไม่ใช่ `snap.round` เพราะ `dealRound()` จะ `++` กลับเป็น
    `snap.round` แล้วเล่นเทิร์นนั้นใหม่ — ตั้งเป็น `snap.round` ตรงๆ จะข้ามเทิร์นนั้นไปเลย
  - **กันย้อนวนไม่รู้จบ**: สแนปช็อตย้อนแต้มสกิล 8 หน่วยคืนให้ชิโดและลบร่องรอยว่าเคยกดท่านี้ไปด้วย
    จึงต้องกัน `p.shidoRewindLock` ไว้ **นอกการย้อน** ผ่าน `keepPerPlayer` ของ `applySnapshot`
    (ย้อนไปรอบ 7 -> ล็อกถึงรอบ 13 = ต้องเดินหน้าครบ `REWIND_LOCK_TURNS` (6) เทิร์นจริงๆ ก่อนอาร์มกับดักได้อีก)
  - **จังหวะที่ย้อน**: `p.shidoRewindPending` ถูกตั้งที่ `onDeath()` แต่การย้อนจริงทำที่ **หัวคอลแบ็กของ
    `runCutsceneQueue` ใน `endTurn()`** — ย้อนกลาง `instantDeath()` ไม่ได้ (โค้ดที่เรียกมันยังถือ reference
    ผู้เล่นชุดเก่าค้างทั้งสแตก) และต้องอยู่ **ก่อน `alivePlayers()`/เงื่อนไขจบเกมทุกสาย** ไม่งั้นเกมจะประกาศ
    ผู้ชนะคนสุดท้ายทั้งที่อีกครู่ทุกคนกำลังจะกลับมา (`rewindPending()` กันบล็อกชัยชนะยูกิที่อยู่ก่อนหน้าอีกชั้น)
  - `clearSnapshotHistory()` หลังย้อน — ประวัติหลังจุดนั้นเป็น "อนาคตที่ถูกลบทิ้ง" แล้ว
- **วีดีโอคิวที่ `endTurn()` ไม่ใช่ตอนตาย** (`flushDeathVideo`) — ถ้าคิวตอนตาย `runCutsceneQueue` ของ
  `doAttack` จะกินคลิปไปเล่นกลางฉากโจมตี ผิดจากสเปคที่ต้องการให้เป็น "รอยต่อหลังหน้าจอโจมตี"
  · ลำดับจริงคือ **วีดีโอเล่นจบก่อน แล้วค่อยย้อนเวลา** (การย้อนอยู่ในคอลแบ็ก `onDone` ของคิวนั้น)
เทสต์: [tests/characters/shido.test.js](tests/characters/shido.test.js)

---

## 7. สถานะ (statuses)

- `p.statuses[key]` = **จำนวนเทิร์นที่เหลือ** (หรือจำนวนสแตค แล้วแต่ key)
- `p.statusAmt[key]` = **ขนาดของผล** (เช่น guard 2 = ลดดาเมจ 2) — อ่านด้วย `statusAmtOf(p,key)` เสมอ
- ลดเทิร์นทั้งหมดที่ลูปใน `endTurn()` `:5397` — **key ที่ไม่ควรลดเทิร์นต้อง `continue;` ในลูปนั้นเอง** (มี ~40 ข้อยกเว้น พร้อมคอมเมนต์เหตุผลรายบรรทัด)

**บัฟกลาง** (`_universal_status.js`): `spellflow` (สกิลถูกลง) · `might`/`empower` (เสริมพลัง) · `guard` (คุ้มครอง) · `resist` (ต้านสถานะ) · `fortune` (โชคลาภ) · `evade` (หลบหลีก) · `netramana` (โอกาสสังหาร 20%)

**ดีบัฟกลาง**: `spellburden` (ภาระเวท — ดูกล่องด้านล่าง) · `weak` · `fragile` · `sleep` · `stun` · `nodraw` · `noskill` · `nohealing` · `invert` (ผกผัน) · `hburn` (ลุกไหม้) · `hbleed` (เลือดไหล — ดูกล่องด้านล่าง) · `chaa` (จั่ว 1 ครั้งได้ 2 ใบ) · `decay` (ผุพัง เกราะไม่ฟื้น)

> ⚠️ **กติกาการมอบ `hburn`/`hbleed` ตอนต้นเทิร์น** — `tickBurn()`/`tickBleed()` ถูกเรียก **ในลูป
> `for (const p of Object.values(players))` ของ `startRound()`** (ถัดจาก `CHAR_HOOKS.*.onRoundStartTick`
> ไม่กี่บรรทัด) ดังนั้นฮุค `onRoundStartTick` ที่แจกลุกไหม้/เลือดไหล **ให้ผู้เล่นคนอื่น** ห้ามแปะตรงๆ:
> คนที่ลูปยังวนไม่ถึงจะถูกติกกินหน่วยที่เพิ่งได้ทิ้งในเทิร์นเดียวกัน ส่วนคนที่วนผ่านไปแล้วถึงจะรอเทิร์นถัดไป
> จริง = **ผลไม่เท่ากันตามลำดับที่นั่ง** ให้พักไว้ในคิวของตัวเองแล้ว flush หลังลูปจบ (ต้นแบบ:
> `escanor.queueBurn()` + `escanor.flushPendingBurn(engine)` ที่ถูกเรียกหลังลูปใน `startRound()`)
> — flush อยู่ก่อน `gameState = "PLAYING"` ดีบัฟจึงติดให้เห็นตลอดเทิร์น แค่ยังไม่ติกจนกว่าจะขึ้นเทิร์นใหม่
> · ถ้าฮุคใช้ `withEffectSource` อยู่ ต้องเก็บผู้มอบไว้แล้วคืน source ตอน flush ด้วย ไม่งั้น
> `friendlyEffectBlocked` ในโหมดทีมจะไม่ทำงาน

**ดีบัฟเฉพาะผู้สังหารเมจ** (อยู่ใน `BASIC_DEBUFF_CLEAR` — ต้านสถานะผิดปกติล้างได้ทั้งคู่)
- `mageslayerMark` (ตราล่าเวท) — ไม่ลดเทิร์น (`continue` ใน `endTurn`) ถาวรจนย้ายมาร์ก/ถูกล้าง · ฝั่งผู้ร่ายเก็บที่
  `ms.mageslayerMarkedId` + `target.mageslayerMarks[msId]` และ reconcile ให้เองที่ `tickWitchMark()` ท้ายเทิร์น
- `manaLeech` (ดูดซับเวท) — ลดเทิร์นตามปกติ · ทริกที่ `useSkill()` และที่ `addSkill()` ที่มี `src`
  · `applyManaBurden()` ตั้งเวลาผ่าน `setTurnsNoRefresh()` (ไม่ต่ออายุเหมือนภาระเวท)
  · โอกาสขโมยคิดที่ `leechChanceFor()` — 35% ปกติ / **60% ถ้าเป้าหมายติด `mageslayerMark` อยู่ด้วย**

**เลือดไหล (`hbleed`) — สถานะ Universal (patch 2.5)**
กลไกเหมือน `hburn` ทุกอย่าง: ดาเมจ 1 หน่วยต่อเทิร์น (เกราะก่อน) แล้วลดสแตคลง 1 ที่ `tickBleed()` ต้นเทิร์น (เรียกคู่กับ `tickBurn` ใน `dealRound`)
- ใส่สถานะผ่าน **`engine.applyBleed(p, n)`** เท่านั้น (เคารพ `resist` + เพดาน `HBLEED_MAX = 6`) — ห้ามเขียน `p.statuses.hbleed` ตรงๆ
- อยู่ใน `BASIC_DEBUFF_CLEAR` (ต้านสถานะล้างได้) และ `NO_TICK_STATUS` (ลูป `endTurn` ต้องไม่ลดซ้ำ)
- **ผลข้างเคียงที่ต่างจากลุกไหม้**: ระหว่างติดอยู่ การฟื้นพลังชีวิตเหลือครึ่ง (`bleedHealPenalty` ใน `healHp()`) — ฟื้น 1 หน่วยไม่ถูกลด
- ฮุครายตัวละคร (ไม่ต้องแก้ `_universal_status.js`): `hbleedImmune(p)` / `hbleedHeals(p)` / `hbleedLabel(p)` / `hbleedHarmless(p)`
  (`hbleedHarmless` คุมเฉพาะการลดครึ่งของ `healHp` — ฮารุกะคืน `true` ทั้ง `hbleedHeals`/`hbleedHarmless` จึงไม่มีผลเสียกับเธอเลย)
- เทสต์: [tests/characters/haruka.test.js](tests/characters/haruka.test.js)

**มิซึซาว่า ฮารุกะ — New Omega "ระเบิดแต้มการ์ด" (patch 2.8.1)**
ท่าไม้ตายอยู่ 10 เทิร์น (เดิม 5) และ **กดซ้ำได้แม้โอเมก้ายังทำงานอยู่** — เพราะการระเบิดผูกกับ "การกด 1 ครั้ง"
ไม่ใช่ "ระหว่างที่สถานะติดอยู่" (ถ้ายังล็อกปุ่มไว้เหมือนเดิม จะระเบิดซ้ำไม่ได้เลยตลอด 10 เทิร์น)
- ธง `p.harukaBurst` แปะให้ผู้เล่นทุกคน **ยกเว้นฮารุกะ** -> `bustedOf()` คืน true ทันที ต่อให้ `locked` ไปแล้ว
  (เช็คอยู่ **ก่อน** `overloadForceActive` เพราะเป็นการ "สั่งให้แตก" ไม่ใช่ผลการคิดแต้มที่สนามปลดเพดานได้)
- `resolveRound()` ยกเว้น**เฉพาะ**ความเสียหายจากการไพ่แตกผ่าน `CHAR_HOOKS.haruka.bustDamageImmune()`
  (ยังได้แต้มสกิลปกติ) — เอฟเฟกต์ตัวละครอื่นที่เกาะกับ "คนไพ่แตก" (Ashen Trail, ครูฝึกสุดเหี้ยมของดัน,
  ทาคุมิ) **ยังทำงานตามปกติ** โดยตั้งใจ
- ธงถูกล้างที่ `clearBurst(p)` ในลูปต้นเทิร์นของ `startRound()` ซึ่งต้องอยู่ **ก่อนแจกไพ่ใบแรก**
  ไม่งั้น `onCardDrawn`/`bustedOf` ระหว่างแจกจะอ่านธงของเทิร์นที่แล้ว
- สกิลรอง "จงไปสู่สุขติ" **ไม่ถูกใช้หมดหลังระเบิดครั้งแรกแล้ว** — อยู่ครบ 3 เทิร์น จุดชนวนได้ทุกหมัดที่เข้าเกณฑ์
  (เลือดไหลของเป้าหมายยังถูกล้างทุกครั้ง จึงต้องสะสมใหม่ให้ครบ 3 หน่วยก่อนถึงระเบิดได้อีก)

**ภาระเวท (`spellburden`) — กฎกลาง ห้าม bypass**
ทุกแหล่งต้องเรียก **`engine.applySpellburden(p, turns)`** เท่านั้น (`_universal_status.js` → wrapper ใน `server.js`)
ห้ามเขียน `p.statuses.spellburden` / `applyDebuff(p, "spellburden", ...)` ตรงๆ
- จำนวนสะสม **+1 ต่อครั้ง เพดาน `SPELLBURDEN_MAX = 2`** (เพิ่มราคาสกิลของเป้าหมายได้มากสุด 2 แต้ม)
- **ใช้ซ้ำใส่คนเดิมขณะสถานะยังติดอยู่ = ไม่ต่ออายุ** — `turns` ใช้เฉพาะตอนที่สถานะยังไม่ติด (ผ่าน `setTurnsNoRefresh()`)
- `turns` เป็นของแต่ละแหล่ง: ผู้สังหารเมจ `MS_BURDEN_TURNS` 5 · ซาโตรุ `SPELLBURDEN_TURNS` 4 · โคโตเนะ `KOTONE_DANCE_NIGHT_BURDEN` 2
- `resist` กันได้ทั้งก้อน (คืน `false`) · หมดอายุที่ `endTurn()` แล้วล้าง `statusAmt` ให้เอง (จำนวนไม่ค้าง)
- wrapper ใน `server.js` กันเฉพาะ "เพื่อนร่วมทีม**คนอื่น**" ไม่กันการใส่ตัวเอง — สกิลที่แลกภาระเวทของตัวเองเป็นพลัง
  (Dance Lession กลางคืน) ต้องทำงานได้ในโหมดทีมด้วย
- เทสต์: [tests/spellburden.test.js](tests/spellburden.test.js)

- `applyDebuff()` คืน `false` ถ้าโดน `resist` กัน — `BASIC_DEBUFF_CLEAR` คือรายการที่ต้านสถานะล้างได้ทั้งหมด, `SOFT_DEBUFF_STEP` (`dawn`, `deathline`) ล้างได้ทีละ 1 สแตค
- **`evade` เป็นกรณีพิเศษ**: ตัวจริงอยู่ใน `p.evadeStacks` (array อายุต่อสแตค, สูงสุด 3 สแตค × 2 เทิร์น) — `p.statuses.evade` เป็นแค่ mirror ใช้ `grantEvadeStack`/`consumeEvadeStack`/`tickEvadeStacks` เท่านั้น ห้ามแตะตรงๆ

---

## 8. คัตซีน / แปลงร่าง

- `TRANSFORMS` (`characters/_transforms.js`) = metadata ต่อ status key: `{ img, video, title, label, seconds, music, voice, afterReveal }`
- `queueCutscene(p,key,onlyFor)` เข้าคิว · `triggerCutscene(p,key)` เล่นทันที (ครั้งแรกวีดีโอเต็ม ครั้งถัดไปแค่การ์ดแจ้งเตือน — ดู `p.cutsceneShown`)
- `runCutsceneQueue(onDone)` `:2542` — ตั้ง `gameState = "CUTSCENE"` เล่นเรียงทีละคลิป แล้วเรียก `onDone`
- **`onlyFor` (patch 2.8.1)** = array ของ `playerId` ที่เห็นคลิปนี้ · `buildStateFor(viewerId)` ส่ง `cutscene: null`
  ให้คนนอกลิสต์ (client วาดกระดานตามปกติแทน) แต่ **ทุกคนยังหยุดรอครบเวลาเดียวกัน** เกมจึงไม่หลุดซิงก์
  ใช้กับคลิปที่เป็นเรื่องส่วนตัวของบางคน เช่น "ครูฝึกสุดเหี้ยม" ของดันที่ด่าเฉพาะคนไพ่แตก
- **`noIntro`** ใน `TRANSFORMS` = ข้ามการ์ดเปิดตัว 950ms ของ client ไปเข้าวีดีโอเลย (คลิปที่สั้นกว่าการ์ดเปิดตัว)
  · `seconds` ของคลิปสั้นต้องตั้งให้พอดีความยาวจริง ไม่งั้นค้างเฟรมสุดท้ายนานกว่าตัวคลิปเอง
- `afterReveal: true` = ลูปใน `afterResolve()` กวาดเล่นให้เอง (ท่าไม้ตายที่ทำงานหลังเปิดไพ่)
- `p.transformAt = ++transformCounter` ใช้ตัดสินว่าเพลงของใครทับใคร เมื่อสวนท่าไม้ตายกัน
- โหมดประหยัด (client `lowQ`) ข้ามวีดีโอแต่ยัง **รอเวลาเท่าเดิม** เพื่อให้ทุกคนซิงก์กัน

---

## 9. เศรษฐกิจ + ร้านค้า

- **เหรียญ**: จบเทิร์น +1 ทุกคน · ชนะจั่ว +1 · การ์ด King +10 · เพดาน `goldCapOf(p)` = 30 (โคโตเนะ 45 จากสกิลติดตัว)
  - **ทุกการได้รับเหรียญต้องผ่าน `addGold(p, n)`** (`server.js`, เปิดให้ hook ผ่าน `engine.addGold`) — เป็นจุดเดียวที่
    บังคับเพดานรายบุคคลและยิง `CHAR_HOOKS.kotone.onGoldGained()` (กระปุกออมสิน 60% แบ่งเหรียญที่เพิ่งได้ไปหยอด
    ไม่เกินครั้งละ 3 เต็ม 15 — **หักจากยอดที่ได้รับ**) เขียน `p.gold` ตรงๆ = กระปุกออมสินเงียบ
  - `addGold()` คืน **ยอดสุทธิที่เหลืออยู่ในกระเป๋า** (หลังกระปุกแบ่งไปแล้ว) ไม่ใช่ยอดก่อนแบ่ง
- **ร้านเปิดทุก 5 เทิร์น** (`roundNumber % SHOP_INTERVAL_TURNS === 0` ใน `dealRound`) — **ร้านเดียว: ร้านค้ามายา 15 ช่อง** (patch 2.3 ยุบร้านลุงเท่งเข้ามา — ไม่มี `uncleShopItems`/แท็บสลับร้านอีกแล้ว)
  - **ช่องล็อกช่องเดียว = Trigger Dark Key** โผล่แน่นอน 1 ชิ้นทุกรอบ (อิกนิสต้องมีของซื้อเสมอ) และไม่ถูกสุ่มซ้ำในช่องอื่น
  - **14 ช่องที่เหลือสุ่มล้วนตาม `SHOP_WEIGHTS`** (`rollShopItem(allowGun, allowHyper)`): เปลี่ยนสีการ์ด 15% / โชคลาภ 5% / ต้านสถานะ 15% / ยาลดไพ่ 12% / แต้มสกิล 14% / เกราะ 14% / ปืน GUTS Select 8% / กระสุน 14% / Hyper Key Trigger 3%
    - แต้มสกิลแตกย่อยตาม `SHOP_SKILL_SIZES[].weight` — เล็ก 50 / กลาง 35 / ใหญ่ 15 (= 7% / 4.9% / 2.1% ของทั้งช่อง)
    - กระสุนแตกย่อยตาม `SHOP_AMMO_WEIGHTS` — Shockwave/Gargorgon/Thunder อย่างละ 4 / Nurse 2 (= 4% / 4% / 4% / 2%)
    - โควตาต่อรอบ: ปืน ≤ `SHOP_MAX_GUNS` (2) · Hyper Key ≤ `SHOP_MAX_HYPER` (1) — เต็มโควตาแล้วน้ำหนักตกไปรวมกับกระสุนธรรมดา
- ซื้อแล้วเข้า `p.inventory` (หายทุกแมตช์ใหม่) → ใช้ผ่าน `useInventoryItem()` `:2693`
- ปืนยิงได้ 1 นัด/เทิร์น เฉพาะช่วงจั่วไพ่ และต้องมีปืนถึงจะยิงกระสุนได้ (`hasGutsGun`)

---

## 10. กลางวัน/กลางคืน

- สลับทุก **5 เทิร์น** (`CYCLE_TURNS`) เริ่มเกมเป็นกลางวัน — โหมด Overload กลับด้าน (5 เทิร์นแรกเป็นกลางคืน)
- **กลางวัน**: จบเทิร์นได้แต้มสกิล +1 แต่ **เฉพาะเช้าที่ 2, 4, 6, …** (`morningBonusActive`)
- **กลางคืน**: สุ่ม 1 tier ของแต่ละคนแพงขึ้น +1 (`p.nightTaxTier`)
- **เกราะฟื้น +1 ทุกเทิร์นเลขคู่** เหมือนกันทั้งวัน/คืน (บล็อกโดย `armorLocked` / `decay` / MOON*CELL)
- `cycleShift` = ตัวเลื่อนวงจรทั้งเกม (Lie Like Vortigern / ชเรด รีเซ็ตกลางคืน) — **ต้องคำนวณใหม่ตรงๆ ห้ามบวกสะสม** (มีคอมเมนต์เตือนบั๊กเดิมที่ `engine.extendNight`)
- มิติมายาบรรเลงของ Bard **override วงจรทั้งหมด** (โลหิต = กลางวัน, วิญญาณ = กลางคืน)
- **หลักสูตรของไบเลธมีเพลงแยกกลางวัน/กลางคืนต่อหลักสูตร** — `CHAR_HOOKS.byleth.activeMusic(engine, night)` เลือกไฟล์ให้
  `activeSkillMusic()` และฝั่ง client มี `MUSIC_POSITION_GROUPS` (`client/src/audio.js`) โดย **1 หลักสูตร = 1 กลุ่ม**
  - สลับ **กลางวัน↔กลางคืนของหลักสูตรเดิม** = อยู่กลุ่มเดียวกัน -> ไฟล์ใหม่ **เล่นต่อจากวินาทีเดิม** (ไม่สะดุด)
  - **สลับไปหลักสูตรอื่น** = คนละกลุ่ม + `transformAt` (seq) ขยับทุกครั้งที่กดท่าไม้ตาย -> เพลง **เริ่มจากต้นเสมอ**

---

## 11. Overload Force + บอสยูกิ

- แต้มสูงสุด **เสมอกัน** → โรล 30% (`OVERLOAD_FORCE_CHANCE`) → `triggerOverloadForce()`
  - แจกไพ่ใหม่ **ในเทิร์นเดิม**, ปลดเพดาน 21 (ไม่มีการแตก), Joker = +12 ตายตัว
  - โทษ: ทุกใบที่ 5 ที่จั่วหลังแต้มเกิน 21 → เสีย HP จริง 1 (`applyOverloadOverdrawPenalty` `:1729`) — ยูกิได้รับการยกเว้น
- **ย้อนทั้งเทิร์นก่อนแจกไพ่ใหม่**: `captureTurnSnapshot()` ถ่ายสภาพผู้เล่นทั้งหมด (+ `roundSkills`/ร้านค้า/ตัวแปรวงจรวัน-คืน/ยูนะ) ไว้ตอนปลาย `dealRound()` ก่อนเข้าเฟสจั่วไพ่ · `restoreTurnSnapshot()` เรียกเป็นอย่างแรกใน `triggerOverloadForce()`
  - คืนให้ครบ: แต้มสกิล, โควตา `skillUsedRound`/`kaiSkillUsesRound`/`bardNotesUsed`, ไอเทม+เหรียญ, ดาเมจ/ดีบัฟที่ก่อในเทิร์นนั้น, แม้แต่คนที่ตายไปแล้วก็ฟื้น (บั๊กเดิม: สกิลที่ทำงาน "หลังเปิดไพ่" ถูกล้างทิ้งพร้อมมือไพ่ = เสียแต้มกับสกิลฟรี)
  - **ไม่ย้อน** ข้อมูลการเชื่อมต่อ (`socketId`/`connected`/`sessionToken`/`ready`) และไม่ปลุกผู้เล่นที่ออกจากเกมกลางเทิร์น · สแนปช็อตใช้ได้ครั้งเดียว (ล้างทิ้งหลัง restore / ตอน `startMatch()` / กลับล็อบบี้)
- **บอสยูกิเกิดได้เฉพาะโหมด `overload`** — `triggerOverloadForce()` เช็ค `gameMode === "overload"` ก่อนเรียก `createYuukiBoss()` ดังนั้น ffa/duo/trio ไม่มีทางเจอยูกิ (Overload Force ยังเกิดได้ตามปกติ ครั้งที่ 3+ ก็เป็นแค่ Overload Force ธรรมดา)
- **โหมด `overload`**: เรียกบอสตั้งแต่ `startMatch()` — โค่นบอส = ผู้เล่นทุกคนชนะร่วมกัน (`yuukiDefeated`)
- ยูกิเป็น player ปลอม id `__yuuki_boss__` — HP/เกราะสเกลตามจำนวนผู้เล่น (`YUUKI_SCALE` 1–6 คน = 7/3 … 30/5), เล่นเองผ่าน `autoPlayYuuki()` `:1235`
  - จั่วตอบโต้ ≤1 ใบต่อไพ่ที่มนุษย์จั่ว (`yuukiReactiveDrawCredits`) + จั่วแก้มือช่วงสรุปอีก ≤2 ใบ
  - ชนะ = โจมตี 2 เป้าไม่ซ้ำ (`yuukiAttackTargets`) · Star of Fall ทุก 5 เทิร์น · ยูกิไม่มีแต้มสกิล (`maxSkillOf` = 0)

---

## 12. โหมดทีม

`gameMode`: `ffa` | `duo` (2 คน/ทีม) | `trio` | `overload` | `pending`
- โหวตเลือกโหมด → `TEAM_SETUP` เลือกทีม A/B/C + ยืนยันครบ → `startMatch()`
- `sameTeam(a,b)` กันเลือกเป็นเป้าโจมตี · `friendlyEffectBlocked(target)` กันเอฟเฟกต์ลบใส่พวกเดียวกัน
- `withEffectSource(source, fn)` ตั้ง `effectSourceId` ให้ระบบรู้ว่าใครเป็นต้นตอ — **handler ที่ก่อเอฟเฟกต์ต้องห่อด้วยตัวนี้** ไม่งั้น friendly-fire check พัง (ดู [tests/team-friendly-fire.test.js](tests/team-friendly-fire.test.js))
- ชนะเมื่อเหลือทีมเดียว (`remainingTeamWinInfo`)

---

## 13. Socket protocol

**Client → Server** (ทุกตัวผ่าน `onPlayerEvent()` ที่มี rate-limit ต่อ event)
```
reconnectSession {sessionToken}   reserve {position}   join {name,position,characterId,shikiUlt}
startGame   selectGameMode {mode}   teamBackToMode   chooseTeam {teamId}   confirmTeam {confirmed}   toggleReady
hit   lock   useSkill {tier,targets,item}   attack {targetId}
buyShopItem {itemId}   useInventoryItem {uid,cardIndex,color,targetId}
contractAnswer / locaAnswer / allyAnswer / allyBreakAnswer / allyFinalAnswer / bardTarget /
kaiOverhaul / hakunoCommandSpell / phenexRelease / batKarmaSend / nanayaToggleEye / nanayaCancelReattack
backToLobby   leave   disconnect
```

**Server → Client**

| event | เนื้อหา |
|---|---|
| `state` | **snapshot ทั้งเกม ต่อผู้ชมแต่ละคน** — `buildStateFor(viewerId)` `:2127` ซ่อนไพ่/แต้ม/สกิลคนอื่นตอน PLAYING |
| `roster` / `positions` / `positionTaken` / `full` / `inProgress` / `joined` | หน้า setup/lobby |
| `skillFlash` | การ์ดสกิลเด้งบนกระดาน (ไม่หยุดเกม) |
| `transformNotice` | แจ้งแปลงร่างซ้ำ (ครั้งที่ 2+) |
| `bardSfx` | เสียงโน้ต/บรรเลงของ Bard |

- ไม่มีระบบห้อง — **เกมเดียวทั้งเซิร์ฟเวอร์**, สูงสุด 7 คน (patch 2.8)
  - `POSITION_COLORS` มี 8 คีย์: 1-7 คือที่นั่งผู้เล่น · **8 สงวนให้บอสยูกิ Overload** (ฝั่ง client `POSITIONS`
    ไม่มีเลข 8 โดยตั้งใจ — ผู้เล่นเลือกไม่ได้) · `SLOTS[6]` ใน `client/src/screens/Game.jsx` คือผังการ์ด
    ผู้เล่นคนอื่น 6 ใบ ที่ต้อง **ไม่ทับกองการ์ดกลาง** (top 40% / left 45-55%)
  - `duo` ยังต้องการจำนวนคู่ (4 หรือ 6) และ `trio` ต้องการ 6 คนเป๊ะ — มี 7 คนในห้องจึงเหลือแค่ ffa/overload
- `playerId` แยกจาก `socket.id` → รีคอนเนกต์กลับมาเป็นคนเดิมได้ภายใน `RECONNECT_GRACE_MS` (60s)
- `buildStateFor` เป็นจุดเดียวที่ตัดสินว่าอะไรถูกซ่อน — เพิ่มฟิลด์ลับต้องระวังที่นี่

---

## 14. Contract ของ character hook

```js
// characters/<id>.js
module.exports = {
  id: "<characterId>",                     // ต้องตรงกับ id ใน characters.js

  // ตัวเลือก — engine เรียกอัตโนมัติถ้ามี
  damageBonus(engine, attacker, target, ctx) { return 0; },         // บวกดาเมจ (computeAttackBase)
  attackBaseOverride(engine, attacker, target, ctx) { return 1; },  // แทนที่ดาเมจฐาน
  adjustIncomingDamage(engine, p, n, isNormalAttack) { return n; }, // ปรับดาเมจขาเข้า

  // ที่เหลือคือ method ที่ server.js เรียกเองแบบเจาะจง: CHAR_HOOKS.<id>.<method>(engine, ...)
  activateSomething(engine, p) { engine.log("..."); },
};
```

**กฎเหล็ก**
1. เข้าถึง state ผ่าน `engine.*` เท่านั้น (`engine.log`, `engine.healHp`, `engine.dealMixed`, `engine.players`, …)
2. อ่านค่า `let` ของ server ผ่าน getter (`engine.roundNumber`) — เขียนผ่าน setter (`engine.setRoundNumber`)
3. ค่าคงที่เฉพาะตัวละครเก็บในไฟล์ตัวเอง — ที่ยังค้างใน server.js คือตัวที่ shared loop ยังใช้อยู่ (มีคอมเมนต์กำกับทุกตัว)
4. ตัวละครใหม่ = เพิ่ม data ใน `characters.js` + ไฟล์ใน `characters/` + `require`+push ใน `characters/index.js`

---

## 15. Gotchas ที่ควรจำก่อนแก้โค้ด

1. **`dealRound()` ล้าง `cutsceneQueue`** — คิววีดีโอไว้ก่อนบรรทัดนั้น = หาย
2. **ลูปลดเทิร์นสถานะใน `endTurn()`** — status key ใหม่ที่ไม่ควรลดเทิร์นต้องเพิ่ม `continue;` เอง ไม่งั้นหายเงียบ; ตรงข้าม key ที่ `continue` แล้วไม่มีใครลบทิ้ง = ค้างถาวรทั้งแมตช์ (บั๊กเดิมของ `burnout`)
3. **โรลโอกาสต้องอยู่ที่จุดตัดสินจริง** — Rip and Tear ของ DoomGuy เคยโรลใน `afterSummary()` หลังสุ่มผู้ชนะไปแล้ว ทำให้โอกาสจริงถูกหารด้วยจำนวนคนที่เสมอ (ย้ายมาที่ `resolveRound()` แล้ว)
4. **`withEffectSource`** ต้องห่อทุก handler ที่ก่อเอฟเฟกต์ ไม่งั้น friendly-fire / แหล่งที่มาดาเมจพัง
5. **ห้ามแก้ `p.hp` / `p.armor` / `p.statuses.evade` ตรงๆ** — ใช้ primitive ที่ให้ไว้ (มี link/mirror/กันตายผูกอยู่)
6. **`isNormalAttack`** ให้ `true` เฉพาะจาก `doAttack()` เท่านั้น
7. **`p.seen[key]` vs `p.cutsceneShown[key]`** — อันแรกกันเอฟเฟกต์ทำงานซ้ำ อันหลังกันวีดีโอเล่นซ้ำ คนละเรื่องกัน
8. `process.on("uncaughtException")` ที่หัวไฟล์เป็น **ตาข่ายสำรอง** ไม่ใช่ที่จัดการ error — handler ต้อง try/catch เอง (`safeOn`/`onPlayerEvent` ทำให้แล้ว)
9. ไฟล์สื่อ (รูป/วีดีโอ/เพลง) ไม่ track ใน git — ไม่มีไฟล์ในเครื่อง client จะ fallback เป็นอีโมจิ (`client/src/data/avatars.js`)
10. **ตัวละคร `unique`** (คอนเนอร์ RK800) กันซ้ำ **2 ชั้น**: handler `join` ตอบ `characterTaken` และหน้าเลือกตัวละคร
    ปิดการ์ดจาก event `takenChars` — เพิ่มตัว unique ใหม่ต้องแค่ใส่ `unique: true` ใน `characters.js` เท่านั้น
11. `resetCombat(p)` `:1939` คือรายการฟิลด์ผู้เล่นทั้งหมด — **ฟิลด์ใหม่ของตัวละครต้องรีเซ็ตที่นี่** ไม่งั้นค้างข้ามแมตช์

---

## 16. เทสต์

```bash
npm test    # node --test "tests/**/*.test.js"
```
- `server.integration.test.js` — spawn server จริงแล้วต่อด้วย socket.io-client (port 32000 + pid%1000)
- `computeAttackBase.test.js` — `require("../server.js").computeAttackBase` ตรงๆ (server ไม่ listen เมื่อไม่ใช่ main module)
- `tests/characters/*.test.js` — ทดสอบ hook รายตัวละครโดย mock `engine`
- อยากเทสต์ฟังก์ชันใหม่ใน server.js ต้องเพิ่มเข้า `module.exports` ท้ายไฟล์ก่อน
