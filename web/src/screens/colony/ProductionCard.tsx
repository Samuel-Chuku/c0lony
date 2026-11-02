"use client";
import { useState } from "react";
import { Button, Card, ResIcon } from "../../ui";
import { fmtDuration, fmtRes, fmtWif } from "../../lib/format";
import type { ColonyView, GameConfig } from "../../lib/game";
import { Resource } from "../../lib/game";
import { speedUpResult, tendResult } from "../../lib/outcomes";
import { useAction } from "../../lib/tx";
import { waitingNow } from "./data";

type Props = { view: ColonyView; cfg: GameConfig; now: number; wif: bigint | undefined; onBuy: () => void };

/** Trails, farms and hand foraging: one Tend collects everything that is home. */
export function ProductionCard({ view, cfg, now, wif, onBuy }: Props) {
  const [open, setOpen] = useState(false);
  const [forage, setForage] = useState<number>(Resource.Leaves);
  const tend = useAction("Tending", { success: tendResult });
  const speed = useAction("Speeding up", { success: (r) => speedUpResult(forage)(r) });
  const w = waitingNow(view, cfg, now);
  const d = view.data;
  const parts: string[] = [];
  if (w.leaves >= 1_000_000_000n) parts.push(`+${fmtRes(w.leaves)} leaves`);
  if (w.sugar >= 1_000_000_000n) parts.push(`+${fmtRes(w.sugar)} sugar`);
  if (!w.nothing && w.nextIn !== null) parts.push(`foragers home in ${fmtDuration(w.nextIn)}`);

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
          <div className="c0-prod__line">{w.nothing ? "Trails and farms keep adding up while you wait." : parts.join(" · ")}</div>
        </div>
        <Button
          variant="paper"
          size="compact"
          busy={tend.busy ? "Tending…" : undefined}
          disabledReason={w.nothing ? <span className="c0-sr">Nothing to collect yet</span> : undefined}
          onClick={() => void tend.run({ functionName: "tend" })}
        >
          Tend
        </Button>
      </div>
      {tend.error ? <div className="c0-blocked" role="alert">{tend.error}</div> : null}
      {!open ? (
        <button type="button" className="c0-fold__link" aria-expanded={false} onClick={() => setOpen(true)}>Want the foragers home now?</button>
      ) : (
        <div className="c0-fold">
          <div className="c0-prod__line">Brings one forage home now and collects it. One speed-up per forage, once a day.</div>
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
          <button type="button" className="c0-fold__link" onClick={() => setOpen(false)}>Not now</button>
        </div>
      )}
    </Card>
  );
}
