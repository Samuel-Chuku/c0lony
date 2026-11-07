"use client";
import Link from "next/link";
import { Hand, Panel } from "../../ui";
import type { FeedEvent } from "../../lib/api";

// Each order links to where it is done: the queen, the pantry, the Raids tab.
const ORDERS = [
  { label: "feed the queen", types: ["fed"], href: "/?do=feed" },
  { label: "tend your trails and farms", types: ["tended"], href: "/?do=pantry" },
  { label: "raid a neighbour or guard a raid", types: ["raid_launched", "guarded"], href: "/?tab=raids" },
];

/** Three stamps for today (local midnight), read from the player's own feed rows. Each one is a link to its order. */
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
        {next ? (
          <Link href={next.href} className="c0-orders__nextlink">
            <Hand size={16} className="c0-orders__next">next: {next.label} ›</Hand>
          </Link>
        ) : (
          <Hand size={16} className="c0-orders__next">all done · back tomorrow</Hand>
        )}
      </div>
      <ul className="c0-stamps" aria-label={`${count} of 3 orders done`}>
        {ORDERS.map((o, i) => (
          <li key={o.label}>
            <Link href={o.href} className="c0-stamp-link" aria-label={`${done[i] ? "Done" : "To do"}: ${o.label}`} data-tip={o.label}>
              <span className={done[i] ? "c0-stamp c0-stamp--done" : "c0-stamp"} />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
