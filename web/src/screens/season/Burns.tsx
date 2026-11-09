"use client";
// Every WIF payment burns 20% in the same transaction. This page lists every burn, 10 per page, with a link to
// each transaction on the explorer, so anyone can check the WIF really left circulation.
import { useEffect, useState } from "react";
import { Button, Card, Fire, Underway, Wif } from "../../ui";
import { Screen } from "../../shell/Screen";
import { feedUrl, fetchFeed, useFeedStats, type FeedEvent } from "../../lib/api";
import { txUrl } from "../../lib/chain";
import { fmtDuration, fmtInt, fmtWif } from "../../lib/format";
import { useNow } from "../../lib/game";
import { Handle } from "../live/feedText";
import { useSession } from "../../lib/session";
import "./season.css";

const PER_PAGE = 10;
const ACTION: Record<string, string> = {
  found: "founding", feed: "feeding", speedUp: "a speed-up", shield: "a shield", revive: "a revive",
};

export function BurnsScreen() {
  const session = useSession();
  const now = useNow(30_000);
  const stats = useFeedStats().data;
  // cursors[i] is the "before" id for page i; page 0 has none (newest).
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [rows, setRows] = useState<FeedEvent[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  const page = cursors.length - 1;
  const before = cursors[page];

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const ev = await fetchFeed(feedUrl("burns", { before, limit: PER_PAGE + 1 }));
        if (!live) return;
        setRows(ev.slice(0, PER_PAGE));
        setMore(ev.length > PER_PAGE);
        setError(false);
      } catch {
        if (live) setError(true);
      }
    };
    setRows(null);
    void load();
    const t = page === 0 ? setInterval(load, 30_000) : undefined; // the newest page keeps itself fresh
    return () => { live = false; if (t) clearInterval(t); };
  }, [before, page]);

  return (
    <Screen back>
      <h2 className="c0-lb__title">BURNS</h2>
      <Card className="c0-ss__pot">
        <span className="c0-ss__burnbox c0-ss__burnbox--big">
          <Fire size={36} />
          {stats ? <Wif size={30}>{fmtInt(Math.floor(Number(stats.burnedWif)))}</Wif> : "…"}
        </span>
        <p className="c0-ss__how">burned so far. 20% of every WIF payment is burned in the same transaction it is paid in. Each tx link opens it on the explorer.</p>
      </Card>
      <Card>
        {rows === null ? (
          error ? <p className="c0-pf__empty">The burns didn&apos;t load. They retry on their own.</p> : <Underway label="Reading the burns…" />
        ) : rows.length === 0 ? (
          <p className="c0-pf__empty">No burns yet. Every WIF payment burns 20% of it, and it shows up here.</p>
        ) : (
          <ul className="c0-burns__list">
            {rows.map((e) => (
              <li key={e.id} className="c0-burns__row">
                <span className="c0-burns__who">
                  <Handle addr={e.actors[0]} me={session.address} cap /> paid for {ACTION[String(e.data.action)] ?? String(e.data.action)}
                </span>
                <b className="c0-burns__amt"><Wif>{fmtWif(BigInt(String(e.data.burned ?? "0")))}</Wif> burned</b>
                <span className="c0-burns__when">{fmtDuration(Math.max(0, now - e.ts))} ago</span>
                <a className="c0-burns__tx" href={txUrl(e.tx)} target="_blank" rel="noopener noreferrer">tx ›</a>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {page > 0 || more ? (
        <div className="c0-burns__pager">
          <Button variant="paper" size="compact" disabledReason={page === 0 ? "This is the newest page" : undefined} onClick={() => setCursors((c) => c.slice(0, -1))}>‹ Newer</Button>
          <span className="c0-burns__page">Page {page + 1}</span>
          <Button variant="paper" size="compact" disabledReason={!more ? "No older burns" : undefined} onClick={() => rows && rows.length && setCursors((c) => [...c, rows[rows.length - 1].id])}>Older ›</Button>
        </div>
      ) : null}
    </Screen>
  );
}
