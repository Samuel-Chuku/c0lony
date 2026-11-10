"use client";
// Settings row for "pay gas in WIF": shows whether the Courier may move this wallet's WIF, and revokes it.
import { useState } from "react";
import { Button } from "../../ui";
import { approveCourier, COURIER, useCourierAllowance } from "../../lib/courier";
import { fmtWif } from "../../lib/format";
import { useSession } from "../../lib/session";
import { invalidate } from "../../lib/store";
import { reasonOf } from "../../lib/tx";

export function WifGasRow() {
  const session = useSession();
  const allowance = useCourierAllowance(session.address);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!COURIER || !session.wallet) return null;
  const on = (allowance.data ?? 0n) > 0n;
  return (
    <div className="c0-srow c0-srow--stack">
      <div className="c0-srow__text">
        <span>Gas paid in WIF</span>
        <span className="c0-srow__hint">
          {on
            ? `on · sends can use up to ${fmtWif(allowance.data ?? 0n)} WIF more, and only with your signature each time`
            : "off · turn it on from Send WIF to send without ETH"}
        </span>
      </div>
      {on ? (
        <Button
          variant="paper"
          size="compact"
          busy={busy ? "Revoking…" : undefined}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await approveCourier(session.wallet!, 0n);
              void invalidate();
            } catch (e) {
              setError(`Not revoked · ${reasonOf(e)}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          Revoke
        </Button>
      ) : null}
      {error ? <div className="c0-blocked" role="alert">{error}</div> : null}
    </div>
  );
}
