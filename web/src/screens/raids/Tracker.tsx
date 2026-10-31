import { STEPS, type Step } from "./shared";

/** Sealed, Marching, Roll, Home: done = paper, current = dither, upcoming = soil. */
export function Tracker({ at }: { at: Step }) {
  const idx = STEPS.findIndex((s) => s.key === at);
  return (
    <ol className="c0-track" aria-label="Raid progress">
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
  );
}
