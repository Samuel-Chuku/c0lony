"use client";
import { useState } from "react";
import { Button, Card, Wif } from "../../ui";
import { publicClient } from "../../lib/chain";
import { fmtWif } from "../../lib/format";
import { colonyGameAbi, seasonPotAbi } from "../../lib/abi";
import { GAME, POT } from "../../lib/game";
import { useQuery } from "../../lib/store";
import { claimResult } from "../../lib/outcomes";
import { useAction } from "../../lib/tx";

/** Shows only when a finished season has WIF waiting for this wallet's colony from that season. */
export function ClaimButton({ wallet, season }: { wallet: string; season?: number }) {
  const [claimed, setClaimed] = useState<{ amount: bigint; season: number } | null>(null);
  const claim = useAction("Claiming", { success: () => (claimed ? claimResult(claimed.amount, claimed.season) : { title: "Pot share claimed" }) });
  // The current season may already be over; the one before it may still be open for claims. Each season has
  // its own colony id, so look it up per season.
  const seasons = season === undefined ? [] : [season, season - 1].filter((s) => s > 0);
  const q = useQuery(
    season === undefined ? null : `claimable:${wallet}:${season}`,
    async () => {
      for (const s of seasons) {
        const colonyId = await publicClient.readContract({ address: GAME, abi: colonyGameAbi, functionName: "colonyOf", args: [s, wallet as `0x${string}`] });
        if (colonyId === 0n) continue;
        const amount = await publicClient.readContract({ address: POT, abi: seasonPotAbi, functionName: "claimable", args: [s, colonyId] });
        if (amount > 0n) return { season: s, amount };
      }
      return null;
    },
    60_000,
  );
  const due = q.data;
  if (!due) return null;
  return (
    <Card className="c0-pf__claim">
      <div className="c0-pf__h2">Season {due.season} is over</div>
      <Button
        variant="wif"
        fullWidth
        busy={claim.busy ? "Claiming…" : undefined}
        error={claim.error}
        onClick={() => {
          setClaimed(due);
          return claim.run(async (client) => {
            const { request } = await publicClient.simulateContract({
              account: client.account.address, address: POT, abi: seasonPotAbi, functionName: "claim", args: [due.season],
            });
            return client.writeContract(request as never);
          });
        }}
      >
        Claim · <Wif>{fmtWif(due.amount)}</Wif>
      </Button>
    </Card>
  );
}
