"use client";
import { useEffect, useState } from "react";
import { BottomSheet, Button, ResIcon } from "../../ui";
import { LOOT, MIN_RAID_WORKERS, Resource, useNow, type ColonyRow, type Profile } from "../../lib/game";
import { fmtDuration, fmtInt } from "../../lib/format";
import { avenge, launchRaid } from "../../lib/raids";
import { useSession } from "../../lib/session";
import { sealedResult } from "../../lib/outcomes";
import { useAction } from "../../lib/tx";
import { useWho } from "./shared";

export type LaunchTarget = { wallet: string; colonyId: bigint | null; row?: ColonyRow };

type Props = { open: boolean; mode: "raid" | "avenge"; target: LaunchTarget | null; me: Profile; cooldownLeft: number; onClose: () => void };

/** Seal a raid: pick leaves or sugar; every free ant marches, and the target stays hidden until the roll. */
export function LaunchSheet({ open, mode, target, me, cooldownLeft, onClose }: Props) {
  const session = useSession();
  const now = useNow(5000);
  const who = useWho(target?.wallet);
  const [sealed, setSealed] = useState<{ soldiers: number; avenged: boolean }>({ soldiers: 1, avenged: false });
  const action = useAction("Raid", { success: () => sealedResult(who.name, sealed.soldiers, sealed.avenged)() });
  const [res, setRes] = useState<number>(Resource.Sugar);
  const soldiers = me.freeAnts;

  useEffect(() => {
    if (open) action.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isAvenge = mode === "avenge";
  let reason: string | null = null;
  const protectedLeft = (target?.row?.raidableAt ?? 0) - now;
  if (me.ants < MIN_RAID_WORKERS) reason = `You need ${MIN_RAID_WORKERS} ants to raid. You have ${me.ants}.`;
  else if (me.lockedLeaves > 0n || me.lockedSugar > 0n) reason = "A raid is marching on you. Deal with it first.";
  else if (soldiers < 1) reason = "No free ants. Take some off trails or farms to march.";
  else if (!isAvenge && cooldownLeft > 0) reason = `Your raid cooldown ends in ${fmtDuration(cooldownLeft)}.`;
  else if (!isAvenge && !target?.colonyId) reason = "That colony isn't in range.";
  else if (!isAvenge && target?.row && target.row.openIncoming > 0) reason = "Another raid is already marching on them.";
  else if (!isAvenge && protectedLeft > 0) reason = `They can be raided again in ${fmtDuration(protectedLeft)}.`;

  const go = async () => {
    if (!target) return;
    setSealed({ soldiers, avenged: isAvenge });
    const run = isAvenge ? avenge(me.colonyId, target.wallet, res) : launchRaid(me.colonyId, target.colonyId!, res);
    if (await action.run(run)) onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={`${isAvenge ? "Avenge" : "Raid"} ${who.name}`}>
      <div className="c0-sheetbody">
        <div>
          <div className="c0-label">TARGET</div>
          <div className="c0-opts" role="radiogroup" aria-label="Raid target">
            {([Resource.Leaves, Resource.Sugar] as const).map((r) => {
              const on = res === r;
              return (
                <button key={r} type="button" role="radio" aria-checked={on} className="c0-opt" onClick={() => setRes(r)}>
                  <ResIcon name={r === Resource.Leaves ? "leaf" : "sugar"} size={28} />
                  <span>{r === Resource.Leaves ? "Leaves" : "Sugar"}</span>
                  <span className="c0-opt__tag">{on ? "✓ Your target" : ""}</span>
                </button>
              );
            })}
          </div>
          <p className="c0-optsum" style={{ marginTop: 8 }}><b>Target: {res === Resource.Leaves ? "Leaves" : "Sugar"}</b> · hidden from them until the roll</p>
        </div>
        <div>
          <div className="c0-label">MARCHING</div>
          <p style={{ margin: 0 }}>
            <ResIcon name="ant" size={16} label="ants" /> All {fmtInt(soldiers)} free {soldiers === 1 ? "ant marches" : "ants march"}. Ants on trails and farms stay home.
          </p>
          <p className="c0-sub" style={{ margin: "4px 0 0" }}>They can carry up to {fmtInt(soldiers * LOOT.perAnt)} ({LOOT.perAnt} each).</p>
        </div>
        <ul className="c0-sub" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Unguarded: you take {LOOT.minPct} to {LOOT.maxPct}% of your target.</li>
          <li>They guard the other one: you take {LOOT.wrongGuardMinPct} to {LOOT.maxPct}%.</li>
          <li>They guard your target: the raid fails and {LOOT.guardedLossPct}% of your marching ants fall.</li>
        </ul>
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
          busy={action.busy ? "Marching out…" : undefined}
          error={action.error}
          onClick={() => void go()}
        >
          {isAvenge ? "Avenge · free raid back" : "Raid · seal it"}
        </Button>
      </div>
    </BottomSheet>
  );
}
