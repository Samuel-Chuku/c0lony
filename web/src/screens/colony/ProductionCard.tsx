"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Card, PixelIcon, ResIcon } from "../../ui";
import { RES, fmtDuration, fmtRes, fmtWif } from "../../lib/format";
import type { ColonyView, GameConfig } from "../../lib/game";
import { FORAGE_FREE_CAP, Resource } from "../../lib/game";
import { speedUpResult, tendResult, type TendSnapshot } from "../../lib/outcomes";
import { useAction } from "../../lib/tx";
import { PANTRY_TRIPS, forageTrip, waitingNow } from "./data";
import { PantrySheet } from "./PantrySheet";

type Props = { view: ColonyView; cfg: GameConfig; now: number; wif: bigint | undefined; onBuy: () => void };

/** Trails, farms and hand foraging: one Tend collects everything that is home. */
export function ProductionCard({ view, cfg, now, wif, onBuy }: Props) {
  const [open, setOpen] = useState(false);
  const [forage, setForage] = useState<number>(Resource.Leaves);
  const tendSnap = useRef<TendSnapshot | null>(null);
  const tend = useAction("Tending", { success: (r) => tendResult(r, tendSnap.current) });
  const speed = useAction("Speeding up", { success: (r) => speedUpResult(forage)(r) });
  const [pantry, setPantry] = useState(false);
  const w = waitingNow(view, cfg, now);
  const inPantry = w.leafTrips + w.sugarTrips;
  const pantryFull = w.leafTrips >= PANTRY_TRIPS && w.sugarTrips >= PANTRY_TRIPS;
  const doTend = () => {
    tendSnap.current = w;
    void tend.run({ functionName: "tend" });
  };
  // The pantry window closes once the claim lands; the result window takes over.
  useEffect(() => {
    if (tend.hash) setPantry(false);
  }, [tend.hash]);
  const trip = forageTrip(view.idle);
  const d = view.data;
  const leafIcon = <ResIcon name="leaf" size={16} label="leaves" />;
  const sugarIcon = <ResIcon name="sugar" size={16} label="sugar" />;

  // Speed-up: one per forage (leaves, sugar) per speedUpCooldown. Each has its own state.
  const cd = Number(cfg.speedUpCooldown);
  const options = [
    { res: Resource.Leaves, name: "Leaves", kind: "leaf" as const, home: w.leafReady, last: d.lastLeafSpeedUp },
    { res: Resource.Sugar, name: "Sugar", kind: "sugar" as const, home: w.sugarReady, last: d.lastSugarSpeedUp },
  ].map((o) => {
    const again = o.last === 0n ? 0 : Number(o.last) + cd - now;
    const state = o.home ? "home" : again > 0 ? "used" : "ok";
    return { ...o, again, state } as const;
  });
  const anyUseful = options.some((o) => o.state === "ok");
  const price = cfg.speedUpPrice;
  const short = wif !== undefined && wif < price;

  return (
    <Card role="region" aria-label="Production" className="c0-prod">
      <div className="c0-prod__row">
        <div className="c0-prod__text">
          <div className="c0-prod__title">{w.nothing ? `Foragers home in ${fmtDuration(w.nextIn ?? 0)}` : "Trails and farms ready"}</div>
          <div className="c0-prod__line">
            {w.nothing ? "Trails and farms keep adding up while you wait." : (
              <>
                {w.leaves >= RES ? <span className="c0-prod__amt">+{fmtRes(w.leaves)} {leafIcon}</span> : null}
                {w.sugar >= RES ? <span className="c0-prod__amt">+{fmtRes(w.sugar)} {sugarIcon}</span> : null}
                {w.nextIn !== null ? <span>· foragers home in {fmtDuration(w.nextIn)}</span> : null}
              </>
            )}
          </div>
          <div className="c0-prod__line">
            Each trip: <span className="c0-prod__amt">{trip.leaves} {leafIcon}</span> every {fmtDuration(Number(cfg.leafForageCooldown))} ·{" "}
            <span className="c0-prod__amt">{trip.sugar} {sugarIcon}</span> every {fmtDuration(Number(cfg.sugarForageCooldown))}
          </div>
          <div className="c0-prod__line">{view.idle > FORAGE_FREE_CAP ? `Your first ${FORAGE_FREE_CAP} free ants help` : `${view.idle} free ${view.idle === 1 ? "ant" : "ants"} helping`}</div>
        </div>
        <div className="c0-tendsplit">
          <Button
            variant="paper"
            size="compact"
            busy={tend.busy ? "Tending…" : undefined}
            disabledReason={w.nothing ? <span className="c0-sr">Nothing to collect yet</span> : undefined}
            onClick={doTend}
            shortcut="t"
          >
            Tend
          </Button>
          <button
            type="button"
            className="c0-pantrybtn"
            onClick={() => setPantry(true)}
            aria-label={pantryFull ? "Pantry: full" : `Pantry: ${inPantry} ${inPantry === 1 ? "trip" : "trips"} waiting`}
          >
            <PixelIcon name="pantry" size={20} />
            {inPantry > 0 ? <b className={pantryFull ? "c0-badge c0-badge--full" : "c0-badge"} aria-hidden="true">{inPantry}</b> : null}
          </button>
        </div>
      </div>
      {tend.error && !pantry ? <div className="c0-blocked" role="alert">{tend.error}</div> : null}
      <PantrySheet open={pantry} onClose={() => setPantry(false)} w={w} tend={tend} onClaim={doTend} />
      <button type="button" className="c0-drop" aria-expanded={open} aria-controls="c0-speedups" onClick={() => setOpen((o) => !o)}>
        <span className="c0-drop__label">Speed up foragers</span>
        <span className="c0-drop__meta">{fmtWif(price)} WIF · 2 options</span>
        <span className="c0-drop__chev" aria-hidden="true">›</span>
      </button>
      {open ? (
        <div className="c0-fold" id="c0-speedups">
          <div className="c0-prod__line">Brings one more trip home now, on top of what is waiting. Once a day for each.</div>
          {options.map((o) => {
            const reason =
              o.state === "home" ? "already home"
              : o.state === "used" ? `used · again in ${fmtDuration(o.again)}`
              : short ? <>You need {fmtWif(price)} WIF · <button type="button" className="c0-linkbtn" onClick={onBuy}>Buy WIF</button></>
              : undefined;
            return (
              <div key={o.res} className="c0-speed">
                <Button
                  variant="wif"
                  size="compact"
                  fullWidth
                  busy={speed.busy && forage === o.res ? "Speeding up…" : undefined}
                  disabled={speed.busy}
                  disabledReason={reason}
                  onClick={() => { setForage(o.res); void speed.run({ functionName: "speedUp", args: [o.res], wif: price }); }}
                >
                  <ResIcon name={o.kind} size={20} /> {o.name} foragers · {fmtWif(price)} WIF
                </Button>
              </div>
            );
          })}
          {!anyUseful ? <div className="c0-prod__line">Nothing to speed up right now.</div> : null}
          {speed.error ? <div className="c0-blocked" role="alert">{speed.error}</div> : null}
        </div>
      ) : null}
    </Card>
  );
}
