"use client";
import { Hand, Panel } from "../../ui";
import type { FeedEvent } from "../../lib/api";

const ORDERS = [
  { label: "feed the queen", types: ["fed"] },
  { label: "tend your trails and farms", types: ["tended"] },
  { label: "raid a neighbour or guard a raid", types: ["raid_launched", "guarded"] },
];

/** Three stamps for today (local midnight), read from the player's own feed rows. */
export function OrdersPanel({ rows, now }: { rows: FeedEvent[] | undefined; now: number }) {
  const midnight = new Date(now * 1000);
  midnight.setHours(0, 0, 0, 0);
  const since = Math.floor(midnight.getTime() / 1000);
  const today = (rows ?? []).filter((r) => r.ts >= since);
  const done = ORDERS.map((o) => today.some((r) => o.types.includes(r.type)));
  const count = done.filter(Boolean).length;
  const next = ORDERS.find((_, i) => !done[i]);
  return (
    <Panel role="region" aria-label="Daily orders" className="c0-orders">
      <div className="c0-orders__text">
        <div className="c0-orders__title">Today&apos;s orders {count}/3</div>
        <Hand size={16} className="c0-orders__next">{next ? `next: ${next.label}` : "all done · back tomorrow"}</Hand>
      </div>
      <div className="c0-stamps" role="img" aria-label={`${count} of 3 orders done`}>
        {done.map((d, i) => (
          <span key={i} className={d ? "c0-stamp c0-stamp--done" : "c0-stamp"} />
        ))}
      </div>
    </Panel>
  );
}
