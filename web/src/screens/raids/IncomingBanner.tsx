"use client";
import { ResIcon } from "../../ui/ResIcon";
import { useEffect, useState } from "react";
import { Resource, useNow, type Raid } from "../../lib/game";
import { fmtDuration } from "../../lib/format";
import { guard } from "../../lib/raids";
import { guardResult } from "../../lib/outcomes";
import { useAction } from "../../lib/tx";
import { ShieldButton } from "./ShieldButton";
import { useColonyView, useWho } from "./shared";

/** A sealed raid against me, still inside its guard window: Guard leaves or sugar, or Shield. */
export function IncomingBanner({ raid, guardWindow }: { raid: Raid; guardWindow: number }) {
  const now = useNow();
  const raiderOwner = useColonyView(raid.raider).data?.data.owner.toLowerCase();
  const who = useWho(raiderOwner);
  const action = useAction("Guarding", { success: () => guardResult(which) });
  const [which, setWhich] = useState<number>(0);
  const left = Number(raid.launchedAt) + guardWindow - now;
  const guarded = raid.guard === Resource.Leaves ? "leaves" : raid.guard === Resource.Sugar ? "sugar" : null;

  // The banner can fold down to its title line. It starts open until you guard, then folds; the choice sticks per raid.
  const foldKey = `c0lony:bannerOpen:${raid.id}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(foldKey);
      if (v !== null) return v === "1";
    } catch { /* storage blocked */ }
    return !guarded;
  });
  const toggle = (next: boolean) => {
    setOpen(next);
    try { localStorage.setItem(foldKey, next ? "1" : "0"); } catch { /* ignore */ }
  };
  useEffect(() => {
    if (action.hash) toggle(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.hash]);

  const pick = (res: number) => {
    setWhich(res);
    void action.run(guard(raid.id, res));
  };

  return (
    <section className="c0-banner" aria-label={`${who.name} is marching on you`}>
      <button type="button" className="c0-banner__top c0-banner__fold" aria-expanded={open} onClick={() => toggle(!open)}>
        <span className="c0-banner__title">{who.name} is marching on you</span>
        <span className="c0-banner__time">{fmtDuration(left)}</span>
        <span className="c0-banner__chev" aria-hidden="true">›</span>
      </button>
      {!open ? (
        <div className="c0-banner__sum">
          {guarded ? <><ResIcon name={guarded === "leaves" ? "leaf" : "sugar"} size={16} /> Guarding {guarded}</> : "Not guarded yet"} · tap to {guarded ? "see options" : "choose"}
        </div>
      ) : null}
      {open ? (<>
      <div className="c0-opts" role="radiogroup" aria-label={guarded ? "You are guarding" : "Pick what to guard"}>
        {([Resource.Leaves, Resource.Sugar] as const).map((res) => {
          const name = res === Resource.Leaves ? "Leaves" : "Sugar";
          const chosen = raid.guard === res || (action.busy && which === res);
          return (
            <button
              key={res}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={`${chosen ? "Guarding " : "Guard "}${name.toLowerCase()}`}
              className="c0-opt"
              disabled={action.busy || !!guarded}
              onClick={() => pick(res)}
            >
              <ResIcon name={res === Resource.Leaves ? "leaf" : "sugar"} size={28} />
              <span>{name}</span>
              <span className="c0-opt__tag">{chosen ? (action.busy ? "Guarding…" : "✓ Guarding") : guarded ? "" : "Tap to guard"}</span>
            </button>
          );
        })}
      </div>
      {guarded ? (
        <p style={{ margin: 0, fontSize: 13 }}>
          <ResIcon name={guarded === "leaves" ? "leaf" : "sugar"} size={16} /> You&apos;re guarding {guarded}. If they aim there, the raid fails and a quarter of their ants fall.
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 13 }}>Guess what they will target. Right: the raid fails. Wrong: they take a bigger share. No guard: they take 30 to 60%.</p>
      )}
      {action.error ? <div className="c0-blocked" role="alert">{action.error}</div> : null}
      <ShieldButton full />
      </>) : null}
    </section>
  );
}
