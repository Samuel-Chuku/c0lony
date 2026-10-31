"use client";
import type { ReactNode } from "react";
import { BlockedStrip, Button, Card, Hand, Meter } from "../../ui";
import { fmtDuration, fmtWif, RES } from "../../lib/format";
import { seasonDays, Status, type ColonyView, type GameConfig, type Profile } from "../../lib/game";
import { useAction } from "../../lib/tx";
import { usePlayerPrices } from "./data";

type Props = {
  addr: string;
  profile: Profile;
  view: ColonyView | undefined;
  cfg: GameConfig | undefined;
  season: { start: number; end: number } | undefined;
  wif: bigint | undefined;
  now: number;
  onBuy: () => void;
};

const need = (amount: bigint, onBuy: () => void): ReactNode => (
  <span className="c0-need">
    You need {fmtWif(amount)} WIF ·{" "}
    <button type="button" className="c0-linkbtn" onClick={onBuy}>Buy WIF</button>
  </span>
);

/** The queen: her timer, the Feed button, and the starved / collapsed variants. */
export function QueenCard({ addr, profile, view, cfg, season, wif, now, onBuy }: Props) {
  const prices = usePlayerPrices(addr);
  const feed = useAction("Feeding");
  const revive = useAction("Reviving");
  const found = useAction("Founding");
  const fedUntil = Number(profile.fedUntil);
  const left = fedUntil - now;

  if (profile.status === Status.Starving || profile.status === Status.Collapsed) {
    const day = season ? seasonDays(season.start, season.end, fedUntil).day : null;
    const cost = cfg ? cfg.reviveBasePrice + BigInt(profile.ants) * cfg.revivePerWorkerPrice : undefined;
    const foundPrice = prices.found;
    return (
      <Card role="region" aria-label="Queen" className="c0-qcard">
        <div className="c0-qcard__top"><h2 className="c0-qcard__title">THE QUEEN</h2></div>
        <BlockedStrip>{day ? `Your queen starved on day ${day}` : "Your queen starved"}</BlockedStrip>
        {profile.status === Status.Starving ? (
          <Button
            variant="wif"
            size="hero"
            fullWidth
            busy={revive.busy ? "Reviving…" : undefined}
            disabledReason={cost !== undefined && wif !== undefined && wif < cost ? need(cost, onBuy) : cost === undefined ? <span className="c0-sr">Loading the price</span> : undefined}
            error={revive.error}
            onClick={() => void revive.run({ functionName: "revive", wif: cost })}
          >
            Revive · {cost !== undefined ? fmtWif(cost) : "…"} WIF
          </Button>
        ) : (
          <>
            <Button
              variant="paper"
              fullWidth
              busy={found.busy ? "Founding…" : undefined}
              disabledReason={foundPrice !== undefined && wif !== undefined && wif < foundPrice ? need(foundPrice, onBuy) : foundPrice === undefined ? <span className="c0-sr">Loading the price</span> : undefined}
              error={found.error}
              onClick={() => void found.run({ functionName: "foundColony", args: [prices.proof], wif: foundPrice })}
            >
              Start a new colony
            </Button>
            {foundPrice !== undefined ? <p className="c0-qcard__note">A new colony costs {fmtWif(foundPrice)} WIF.</p> : null}
          </>
        )}
      </Card>
    );
  }

  // Alive
  const price = prices.feed;
  const lastFeedAt = view ? Number(view.data.lastFeedAt) : fedUntil - 72 * 3600;
  const nextFeed = cfg && lastFeedAt > 0 ? lastFeedAt + Number(cfg.feedMinInterval) : 0;
  let reason: ReactNode;
  if (price === undefined || !cfg) reason = <span className="c0-sr">Loading the price</span>;
  else if (now < nextFeed) reason = `She can be fed again in ${fmtDuration(nextFeed - now)}`;
  else if (profile.leaves < 3n * RES) reason = "Feeding takes 3 leaves. Tend your trails first";
  else if (wif !== undefined && wif < price) reason = need(price, onBuy);

  return (
    <Card role="region" aria-label="Queen" className="c0-qcard">
      <div className="c0-qcard__top">
        <h2 className="c0-qcard__title">THE QUEEN</h2>
        <div className="c0-qcard__time">hungry in <b>{fmtDuration(left)}</b></div>
      </div>
      <Meter kind="queen" value={Math.max(0, left) / 3600} max={72} label="Queen fed, hours left out of 72" />
      {left < 12 * 3600 ? <BlockedStrip>Queen is hungry in {fmtDuration(left)}</BlockedStrip> : null}
      <Button
        variant="wif"
        size="hero"
        fullWidth
        busy={feed.busy ? "Feeding…" : undefined}
        disabledReason={reason}
        error={feed.error}
        onClick={() => void feed.run({ functionName: "feedQueen", args: [prices.proof], wif: price })}
      >
        Feed her · {price !== undefined ? fmtWif(price) : "…"} WIF
      </Button>
      {prices.passApplies && price !== undefined ? <Hand size={15}>Voter&apos;s Pass price: {fmtWif(price)} WIF</Hand> : null}
    </Card>
  );
}
