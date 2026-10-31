"use client";
import { Avatar, Button, Card, Hand } from "../../ui";
import { useAvenge, useNow, type ColonyRow } from "../../lib/game";
import { fmtDuration, fmtInt, fmtRes, timeAgo } from "../../lib/format";
import { useWho } from "./shared";

export type NeighbourCtx = {
  me: string;
  /** Seconds until my raid cooldown ends (0 when ready). */
  cooldownLeft: number;
  /** I have a finished raid I haven't settled or collected yet. */
  collectFirst: boolean;
  /** Colony ids I currently have a raid out against. */
  marchingOn: Set<string>;
};

type Props = {
  row: ColonyRow;
  ctx: NeighbourCtx;
  onRaid: (row: ColonyRow, avenge: boolean) => void;
  onProfile: (wallet: string) => void;
};

/** One neighbour: avatar, handle, "24 ants · ~1,900 sugar", a Gaegu note, and Raid / Avenge / why not. */
export function NeighbourItem({ row, ctx, onRaid, onProfile }: Props) {
  const now = useNow(5000);
  const who = useWho(row.owner);
  const avenge = useAvenge(ctx.me, row.owner).data;
  const isRaider = !!avenge?.ok;
  const sealedOn = ctx.marchingOn.has(String(row.id));
  const shieldLeft = row.shieldUntil - now;

  let note = `queen fed ${timeAgo(row.fedUntil - 72 * 3600, now)}`;
  if (isRaider && avenge) note = `raided you · free avenge, ${Math.max(1, Math.floor((avenge.expiresAt - now) / 3600))}h`;
  else if (sealedOn) note = "your raid is marching";
  else if (row.feedCount === 0) note = "new colony";

  let right;
  if (isRaider) {
    right = <Button variant="raid" size="compact" icon="raids" onClick={() => onRaid(row, true)}>Avenge</Button>;
  } else if (shieldLeft > 0) {
    right = <div className="c0-nstate"><span>shielded</span><b>{fmtDuration(shieldLeft)}</b></div>;
  } else if (row.openIncoming >= 2) {
    right = <div className="c0-nstate"><span>busy</span><b>2 raids</b></div>;
  } else if (ctx.collectFirst) {
    right = <div className="c0-nstate"><span>busy</span><b>collect</b></div>;
  } else if (ctx.cooldownLeft > 0) {
    right = <div className="c0-nstate"><span>cooldown</span><b>{fmtDuration(ctx.cooldownLeft)}</b></div>;
  } else {
    right = <Button variant="raid" size="compact" icon="raids" onClick={() => onRaid(row, false)}>Raid</Button>;
  }

  return (
    <Card dense className={`c0-nrow${isRaider ? " c0-card--red" : ""}`}>
      <button type="button" className="c0-linkbtn c0-nrow__main" onClick={() => onProfile(row.owner)} aria-label={`Open profile of ${who.name}`}>
        <Avatar src={who.avatar} address={row.owner} alt={who.name} size={40} />
        <span className="c0-nrow__col">
          <span className="c0-nrow__handle">{who.name}</span>
          <span className="c0-nrow__line">{fmtInt(row.workers)} ants · ~{fmtRes(row.sugar)} sugar</span>
          <Hand size={15} className={isRaider ? "c0-nrow__note c0-nrow__note--raider" : "c0-nrow__note"}>{note}</Hand>
        </span>
      </button>
      {right}
    </Card>
  );
}
