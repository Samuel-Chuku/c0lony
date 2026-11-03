import { ResIcon } from "../../ui/ResIcon";
import { STEPS, type Step } from "./shared";

/**
 * Sealed, Marching, Roll, Home on one connected rail. The red fill and the marching ant move with real time:
 * `progress` (0 to 1) is how far the raid is through its current stage. Done = paper, current = dither, upcoming = soil.
 */
export function Tracker({ at, progress = 0 }: { at: Step; progress?: number }) {
  const idx = STEPS.findIndex((s) => s.key === at);
  const p = Math.min(1, Math.max(0, progress));
  const overall = at === "home" ? 1 : (idx + p) / (STEPS.length - 1);
  const pct = `${(overall * 100).toFixed(2)}%`;
  return (
    <div className="c0-track">
      <div className="c0-track__rail" aria-hidden="true">
        <div className="c0-track__fill" style={{ width: pct }} />
        {at !== "home" ? <span className="c0-track__ant" style={{ left: pct }}><ResIcon name="ant" size={16} /></span> : null}
      </div>
      <ol className="c0-track__steps" aria-label="Raid progress">
        {STEPS.map((s, i) => {
          const state = at === "home" || i < idx ? "done" : i === idx ? "now" : "next";
          return (
            <li key={s.key} className="c0-track__step" aria-current={state === "now" ? "step" : undefined}>
              <span className={`c0-track__box c0-track__box--${state}`} aria-hidden="true" />
              <span>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
