"use client";
// Every WIF payment burns 20% in the same transaction. This lists the latest burns with a link to each
// transaction on the explorer, so anyone can check the WIF really left circulation.
import { useEffect } from "react";
import { Card, Wif } from "../../ui";
import { useFeed } from "../../lib/api";
import { txUrl } from "../../lib/chain";
import { fmtDuration, fmtWif } from "../../lib/format";
import { useNow } from "../../lib/game";
import { Handle } from "../live/feedText";
import { useSession } from "../../lib/session";

const ACTION: Record<string, string> = {
  found: "founding", feed: "feeding", speedUp: "a speed-up", shield: "a shield", revive: "a revive",
};

export function Burns() {
  const session = useSession();
  const now = useNow(30_000);
  const feed = useFeed("burns", null, 10, 30_000);
  const rows = (feed.data ?? []).filter((e) => e.data.burned && e.data.burned !== "0");
  // Arriving from "BURNED ›" on Live (/?tab=season#burns): scroll here once the tab has drawn.
  useEffect(() => {
    if (location.hash !== "#burns") return;
    const t = setTimeout(() => document.getElementById("burns")?.scrollIntoView({ block: "start" }), 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <section id="burns" className="c0-burns" aria-label="Recent burns">
      <h2 className="c0-ss__h">BURNS</h2>
      <Card>
        {rows.length === 0 ? (
          <p className="c0-pf__empty">{feed.loading ? "Reading the burns…" : "No burns yet. Every WIF payment burns 20% of it, right here."}</p>
        ) : (
          <ul className="c0-burns__list">
            {rows.map((e) => (
              <li key={e.id} className="c0-burns__row">
                <span className="c0-burns__who">
                  <Handle addr={e.actors[0]} me={session.address} cap /> paid for {ACTION[String(e.data.action)] ?? String(e.data.action)}
                </span>
                <b className="c0-burns__amt"><Wif>{fmtWif(BigInt(String(e.data.burned)))}</Wif> burned</b>
                <span className="c0-burns__when">{fmtDuration(Math.max(0, now - e.ts))} ago</span>
                <a className="c0-burns__tx" href={txUrl(e.tx)} target="_blank" rel="noopener noreferrer">tx ›</a>
              </li>
            ))}
          </ul>
        )}
        <p className="c0-ss__how">20% of every payment is burned in the same transaction it is paid in. Each link opens it on the explorer.</p>
      </Card>
    </section>
  );
}
