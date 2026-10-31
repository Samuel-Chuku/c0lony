"use client";
import { Button, Card } from "../../ui";
import { fmtDuration, fmtRes, fmtWif } from "../../lib/format";
import type { ColonyView, GameConfig } from "../../lib/game";
import { Resource } from "../../lib/game";
import { useAction } from "../../lib/tx";
import { waitingNow } from "./data";

type Props = { view: ColonyView; cfg: GameConfig; now: number; wif: bigint | undefined; onBuy: () => void };

/** Trails, farms and hand foraging: one Tend collects everything that is home. */
export function ProductionCard({ view, cfg, now, wif, onBuy }: Props) {
  const tend = useAction("Tending");
  const speed = useAction("Speeding up");
  const w = waitingNow(view, cfg, now);
  const d = view.data;
  const parts: string[] = [];
  if (w.leaves >= 1_000_000_000n) parts.push(`+${fmtRes(w.leaves)} leaves`);
  if (w.sugar >= 1_000_000_000n) parts.push(`+${fmtRes(w.sugar)} sugar`);
  if (!w.nothing && w.nextIn !== null) parts.push(`foragers home in ${fmtDuration(w.nextIn)}`);

  // Speed-up: only for a forage that is still out and whose 24 h speed-up cooldown has passed.
  const cd = Number(cfg.speedUpCooldown);
  const leafOk = !w.leafReady && (d.lastLeafSpeedUp === 0n || now >= Number(d.lastLeafSpeedUp) + cd);
  const sugarOk = !w.sugarReady && (d.lastSugarSpeedUp === 0n || now >= Number(d.lastSugarSpeedUp) + cd);
  const forage = leafOk ? Resource.Leaves : sugarOk ? Resource.Sugar : null;
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
      {forage !== null ? (
        <>
          <Button
            variant="wif"
            size="compact"
            fullWidth
            busy={speed.busy ? "Speeding up…" : undefined}
            disabledReason={short ? <>You need {fmtWif(price)} WIF · <button type="button" className="c0-linkbtn" onClick={onBuy}>Buy WIF</button></> : undefined}
            onClick={() => void speed.run({ functionName: "speedUp", args: [forage], wif: price })}
          >
            Speed up · {fmtWif(price)} WIF
          </Button>
          <div className="c0-prod__line">Brings the {forage === Resource.Leaves ? "leaf" : "sugar"} foragers home now. Once a day.</div>
          {speed.error ? <div className="c0-blocked" role="alert">{speed.error}</div> : null}
        </>
      ) : null}
    </Card>
  );
}
