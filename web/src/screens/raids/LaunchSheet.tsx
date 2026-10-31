"use client";
import { useEffect, useState } from "react";
import { BottomSheet, Button, Chip, ChipRow, PixelIcon, Stepper } from "../../ui";
import { Resource, maxSoldiers, MIN_RAID_WORKERS, useGameConfig, type ColonyRow, type Profile } from "../../lib/game";
import { avenge, launchRaid } from "../../lib/raids";
import { useSession } from "../../lib/session";
import { useAction } from "../../lib/tx";
import { useWho } from "./shared";

export type LaunchTarget = { wallet: string; colonyId: bigint | null; row?: ColonyRow };

type Props = { open: boolean; mode: "raid" | "avenge"; target: LaunchTarget | null; me: Profile; cooldownLeft: number; onClose: () => void };

/** Seal a raid: pick leaves or sugar, pick soldiers, and the target stays hidden until the roll. */
export function LaunchSheet({ open, mode, target, me, cooldownLeft, onClose }: Props) {
  const session = useSession();
  const cfg = useGameConfig().data;
  const who = useWho(target?.wallet);
  const action = useAction("Raid");
  const [res, setRes] = useState<number>(Resource.Sugar);
  const [soldiers, setSoldiers] = useState(1);
  const max = maxSoldiers(me.freeAnts);

  useEffect(() => {
    if (open) {
      setSoldiers((s) => Math.min(Math.max(1, s), Math.max(1, max)));
      action.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isAvenge = mode === "avenge";
  let reason: string | null = null;
  if (me.ants < MIN_RAID_WORKERS) reason = `You need ${MIN_RAID_WORKERS} ants to raid. You have ${me.ants}.`;
  else if (max < 1) reason = "Not enough free ants. Up to 30% of your free ants can march.";
  else if (!isAvenge && cooldownLeft > 0) reason = "Your raid cooldown is still running.";
  else if (!isAvenge && !target?.colonyId) reason = "That colony isn't in range.";

  const go = async () => {
    if (!target) return;
    const run = isAvenge ? avenge(me.colonyId, target.wallet, soldiers, res) : launchRaid(me.colonyId, target.colonyId!, soldiers, res);
    if (await action.run(run)) onClose();
  };

  const unguarded = cfg?.winOddsUnguarded;
  const other = cfg?.winOddsGuardedOther;

  return (
    <BottomSheet open={open} onClose={onClose} title={`${isAvenge ? "Avenge" : "Raid"} ${who.name}`}>
      <div className="c0-sheetbody">
        <div>
          <div className="c0-label">TARGET</div>
          <ChipRow>
            <Chip selected={res === Resource.Leaves} onClick={() => setRes(Resource.Leaves)}><PixelIcon name="leaf" /> Leaves</Chip>
            <Chip selected={res === Resource.Sugar} onClick={() => setRes(Resource.Sugar)}><PixelIcon name="sugar" /> Sugar</Chip>
          </ChipRow>
          <p className="c0-sub" style={{ marginTop: 8 }}>Sealed. They won&apos;t see your target until the roll.</p>
        </div>
        <div className="c0-sheetrow">
          <div>
            <div className="c0-label">SOLDIERS</div>
            <p className="c0-sub">{max > 0 ? `up to ${max} of your ${me.freeAnts} free ants` : "none free to send"}</p>
          </div>
          <Stepper value={soldiers} min={1} max={Math.max(1, max)} onChange={setSoldiers} label="Soldiers" decLabel="Fewer soldiers" incLabel="More soldiers" />
        </div>
        {cfg ? (
          <p>
            {unguarded}% to win if they leave it unguarded. {other}% if they guard the other resource. If they guard your target, you lose half your soldiers.
          </p>
        ) : null}
        {isAvenge ? <p className="c0-sub">Free raid back: it skips your cooldown.</p> : null}
        {session.embedded ? (
          <p className="c0-sub">Sealing asks your wallet to sign once. In your embedded wallet that happens silently.</p>
        ) : (
          <p className="c0-sub">Sealing asks your wallet to sign once, so you can reveal from any device.</p>
        )}
        <Button
          variant="raid"
          size="hero"
          fullWidth
          icon="raids"
          disabledReason={reason ?? undefined}
          busy={action.busy ? "Sealing…" : undefined}
          error={action.error}
          onClick={() => void go()}
        >
          {isAvenge ? "Avenge · free raid back" : "Raid · seal it"}
        </Button>
      </div>
    </BottomSheet>
  );
}
