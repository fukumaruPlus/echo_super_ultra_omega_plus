import { clickSound } from "../audio";
import { AvScene, Sigil } from "../components/avalon";
import { PATCH_NAME, PATCH_VERSION, AUTHOR } from "../data/patch";

export default function Splash({ onEnter }) {
  const start = () => {
    clickSound();
    onEnter();
  };

  return (
    <AvScene level={1} seed={11} className="av-splash">
      <div className="av-splash-rays" />

      <button onClick={start} className="av-splash-stage" aria-label="แตะเพื่อเริ่ม">
        <span className="relative inline-flex items-center justify-center">
          <Sigil
            level={1}
            className="av-breathe"
            style={{
              top: "50%",
              left: "50%",
              width: "min(56vh, 56vw)",
              height: "min(56vh, 56vw)",
              transform: "translate(-50%, -50%)",
              opacity: 0.5,
            }}
          />
          <span className="av-logo-seal av-rise" style={{ animationDelay: "0.1s" }}>
            <img src="/image/logo_current.webp" alt="ECHO" className="h-16 w-auto" />
          </span>
        </span>

        <div className="relative">
          <h1 className="av-title av-unfurl text-[5.5rem] leading-none whitespace-nowrap" style={{ animationDelay: "0.45s" }}>
            {PATCH_NAME}
          </h1>
          <span className="av-crack av-fissure" style={{ left: "-6%", right: "-6%", top: "58%", height: 2, opacity: 0.9 }} />
        </div>

        <div className="av-press av-label">กดเพื่อเริ่มต้น</div>
      </button>

      <div className="av-splash-meta">
        <div className="av-label av-label-en">{AUTHOR}</div>
        <div className="av-heading text-sm mt-1" style={{ color: "rgba(232,196,239,.5)", letterSpacing: "0.1em" }}>
          เวอร์ชัน {PATCH_VERSION}
        </div>
      </div>
    </AvScene>
  );
}
