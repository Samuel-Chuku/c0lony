"use client";
import { Button } from "../../ui";
import { useBalances, useGameConfig, useNow, useProfile } from "../../lib/game";
import { fmtDuration, fmtWif } from "../../lib/format";
import { useSession } from "../../lib/session";
import { useAction } from "../../lib/tx";
import { useColonyView } from "./shared";

/** Shield · <price> WIF. Disabled with its reason while shielded, in cooldown, or short of WIF. */
export function ShieldButton({ size = "compact", icon = true, full }: { size?: "compact" | "default"; icon?: boolean; full?: boolean }) {
  const session = useSession();
  const cfg = useGameConfig().data;
  const profile = useProfile(session.address).data;
  const view = useColonyView(profile?.colonyId).data;
  const bal = useBalances(session.address).data;
  const now = useNow(5000);
  const action = useAction("Shield");

  if (!cfg) return null;
  const price = cfg.shieldPrice;
  const shieldUntil = Number(profile?.shieldUntil ?? 0n);
  const nextAt = view ? Number(view.data.lastShield) + Number(cfg.shieldCooldown) : 0;
  let reason: string | null = null;
  if (!session.signedIn || !profile?.colonyId) reason = "Found a colony first";
  else if (now < shieldUntil) reason = `Shielded for ${fmtDuration(shieldUntil - now)}`;
  else if (view && Number(view.data.lastShield) > 0 && now < nextAt) reason = `Shield cooldown · ${fmtDuration(nextAt - now)}`;
  else if (bal && bal.wif < price) reason = `You need ${fmtWif(price)} WIF`;

  return (
    <Button
      variant="wif"
      size={size}
      fullWidth={full}
      icon={icon ? "shield" : undefined}
      busy={action.busy ? "Shielding…" : undefined}
      disabledReason={reason ?? undefined}
      error={action.error}
      onClick={() => void action.run({ functionName: "shield", wif: price })}
    >
      Shield · {fmtWif(price)} WIF
    </Button>
  );
}
