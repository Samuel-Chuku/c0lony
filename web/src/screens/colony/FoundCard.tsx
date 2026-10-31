"use client";
import { Button, Card, Hand } from "../../ui";
import { fmtWif } from "../../lib/format";
import { useSession } from "../../lib/session";
import { useAction } from "../../lib/tx";
import { usePlayerPrices } from "./data";

/** Signed out, or signed in with no colony this season. */
export function FoundCard({ addr, wif, onBuy }: { addr: string | null; wif: bigint | undefined; onBuy: () => void }) {
  const session = useSession();
  const prices = usePlayerPrices(addr);
  const found = useAction("Founding");
  const price = prices.found;
  const short = !!addr && price !== undefined && wif !== undefined && wif < price;
  let reason: React.ReactNode;
  if (!session.signedIn) reason = "Sign in to found a colony";
  else if (price === undefined) reason = <span className="c0-sr">Loading the price</span>;
  else if (short)
    reason = (
      <span className="c0-need">
        You need {fmtWif(price)} WIF ·{" "}
        <button type="button" className="c0-linkbtn" onClick={onBuy}>Buy WIF</button>
      </span>
    );
  return (
    <Card role="region" aria-label="Found a colony" className="c0-qcard c0-qcard--centre">
      <h2 className="c0-qcard__big">Found a colony to start</h2>
      <p className="c0-qcard__note">Your ants, your queen and your tunnels live here. Feed her every 3 days to keep them.</p>
      {!session.signedIn ? (
        session.configured ? (
          <Button variant="paper" fullWidth busy={!session.ready ? "Loading…" : undefined} onClick={() => session.login()}>
            Sign in with X
          </Button>
        ) : (
          <Hand size={16}>Sign-in opens soon.</Hand>
        )
      ) : null}
      <Button
        variant="wif"
        fullWidth
        busy={found.busy ? "Founding…" : undefined}
        disabledReason={reason}
        error={found.error}
        onClick={() => void found.run({ functionName: "foundColony", args: [prices.proof], wif: price })}
      >
        Found a colony · {price !== undefined ? fmtWif(price) : "…"} WIF
      </Button>
      {prices.passApplies && price !== undefined ? <Hand size={15}>Voter&apos;s Pass price: {fmtWif(price)} WIF</Hand> : null}
    </Card>
  );
}
