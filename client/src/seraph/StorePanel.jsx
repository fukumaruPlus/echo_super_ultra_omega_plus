// ============================================================
//  S5.5 ร้านสะดวกซื้อ — แผงซื้อของประจำวันสืบสวน
//
//  ซื้อของได้ก่อน/หลังไปสถานที่ ออกจากร้านแล้วยังต้องกดพร้อมเพื่อจบวัน
//  ร้านเปิดครั้งเดียวต่อรอบ ของที่ขายไปแล้วจะหายไปจนกว่าจะขึ้นรอบใหม่
// ============================================================

import { playSfx } from "../audio";
import { SC_PLACE } from "./assets";
import { SystemLines } from "./ui";
import { shopInfoOf } from "../data/shop";

const PD = "var(--font-p-display)";

export default function StorePanel({ shop = [], gold = 0, inventoryCount = 0, inventory = [], characterId, onBuy, onDone }) {
  const items = shop.filter((it) => !it.sold);

  return (
    <div className="fixed inset-0 z-[84] overflow-hidden">
      {/* ภาพร้านเป็นฉากหลัง (มืดลงเพื่อให้อ่านราคาออก) */}
      <div className="sc-bg">
        <img src={SC_PLACE.store.img} alt="" className="sc-bg-img sc-kenburns" />
        <span className="sc-bg-dim" />
        <span className="sc-bg-tint sc-bg-tint-night" />
        <span className="sc-scanlines" />
        <span className="sc-vignette" />
      </div>

      <div className="absolute inset-0 flex flex-col">
        <div className="pl-5 pr-16 pt-3 flex items-start justify-between gap-3">
          <div>
            <SystemLines lines={["> CONVENIENCE STORE"]} speed={16} className="text-[11px]" />
            <div className="text-2xl sm:text-4xl font-black italic text-white leading-tight" style={{ fontFamily: PD }}>
              ร้านสะดวกซื้อ
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="sc-sysline text-[10px] opacity-70">เหรียญของเจ้า</div>
            <div className="text-3xl font-black leading-none text-echo-gold" style={{ fontFamily: PD }}>🪙 {gold}</div>
            <div className="text-[10px] text-white/60 mt-1">ในกระเป๋า {inventoryCount} ชิ้น</div>
          </div>
        </div>

        {/* ชั้นวางของ — เลื่อนได้ ไม่ล้นจอ */}
        <div className="flex-1 min-h-0 overflow-y-auto p-scroll px-5 py-4">
          {items.length === 0 ? (
            <div className="h-full grid place-items-center">
              <span className="sc-sysline text-sm opacity-70">ของบนชั้นหมดแล้ว — รอรอบใหม่</span>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {items.map((it, i) => {
                const info = shopInfoOf(it);
                const afford = gold >= it.price;
                const hasBlack = inventory.some((owned) => owned.type === "blackSparklence");
                const restricted = (it.type === "gutsGun" && (characterId === "ignis" || hasBlack || inventory.some((owned) => owned.type === "gutsGun")))
                  || (it.type === "gutsAmmo" && it.ammo === "hyper_trigger" && (characterId === "ignis" || hasBlack))
                  || (it.type === "gutsAmmo" && ["hyper_trigger", "trigger_dark_key"].includes(it.ammo) && inventory.some((owned) => owned.type === "gutsAmmo" && owned.ammo === it.ammo));
                return (
                  <button
                    key={it.id}
                    type="button"
                    disabled={!afford || restricted}
                    onClick={() => { playSfx("sc_noti2"); onBuy(it.id); }}
                    className="relative text-left p-2.5 flex flex-col gap-1.5 transition"
                    style={{
                      background: "rgba(4,7,12,.9)",
                      border: `1px solid ${afford ? "var(--color-sc-line)" : "rgba(255,77,94,.4)"}`,
                      clipPath: "polygon(0 0, 100% 0, 100% 88%, 92% 100%, 0 100%)",
                      opacity: afford && !restricted ? 1 : 0.5,
                      cursor: afford && !restricted ? "pointer" : "not-allowed",
                      animation: `pRise 320ms ${i * 40}ms both`
                    }}
                  >
                    {info.img ? (
                      <img src={info.img} alt="" className="w-full h-16 object-contain rounded" />
                    ) : (
                      <span className="w-full h-16 grid place-items-center text-2xl rounded" style={{ background: "rgba(53,230,212,.08)" }}>{info.icon}</span>
                    )}
                    <span className="text-xs font-bold text-white leading-tight">{info.label(it)}</span>
                    {info.desc && <span className="text-[10px] text-white/60 leading-tight">{info.desc}</span>}
                    <span
                      className="mt-auto text-sm font-black"
                      style={{ color: afford ? "var(--color-echo-gold)" : "var(--color-sc-red)", fontFamily: PD }}
                    >
                      🪙 {it.price}{restricted ? " · มีแล้ว / ซื้อไม่ได้" : !afford && " · เหรียญไม่พอ"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 pb-4 flex items-center justify-center gap-3">
          <span className="text-[11px] text-white/60">ซื้อเสร็จแล้วกลับไปเลือกสถานที่หรือกดพร้อม</span>
          <button
            type="button"
            className="p-btn-cut p-slash-btn px-8 py-2.5 text-base font-black text-white"
            style={{ fontFamily: PD }}
            onClick={onDone}
          >
            ออกจากร้าน
          </button>
        </div>
      </div>
    </div>
  );
}
