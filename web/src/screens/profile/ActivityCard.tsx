"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Underway } from "../../ui";
import { feedUrl, fetchFeed, type FeedEvent } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useNow } from "../../lib/game";
import { useSession } from "../../lib/session";
import { describeEvent } from "../live/feedText";

const PER_PAGE = 10;
const BATCH = 50; // events read per request; payments have no line of their own, so read extra and skip those
const MAX_READS = 6; // per page, so a colony with long runs of unlisted events can't loop forever

/** One page of this colony's journal, newest first: up to PER_PAGE rows that have a line, plus whether older ones exist. */
async function loadPage(addr: string, before: number | undefined, me: string | null | undefined) {
  const rows: FeedEvent[] = [];
  let cursor = before;
  for (let i = 0; i < MAX_READS; i++) {
    const ev = await fetchFeed(feedUrl("mine", { wallet: addr, before: cursor, limit: BATCH }));
    for (const e of ev) {
      if (describeEvent(e, me) === null) continue;
      rows.push(e);
      if (rows.length > PER_PAGE) return { rows: rows.slice(0, PER_PAGE), more: true };
    }
    if (ev.length < BATCH) break; // reached the colony's first event
    cursor = ev[ev.length - 1].id;
  }
  // Out of reads with a full page: there may be more further down, so let the player keep going.
  return { rows, more: rows.length === PER_PAGE && cursor !== before };
}

export function ActivityCard({ addr, isMe }: { addr: string; isMe: boolean }) {
  // Everything this colony did, assignments included (the public Live feed leaves those out), 10 per page.
  const session = useSession();
  const now = useNow(60_000);
  // cursors[i] is the "before" id for page i; page 0 has none (newest).
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [rows, setRows] = useState<FeedEvent[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  const page = cursors.length - 1;
  const before = cursors[page];

  useEffect(() => setCursors([undefined]), [addr]); // another colony's profile starts on its newest page

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await loadPage(addr, before, session.address);
        if (!live) return;
        setRows(r.rows);
        setMore(r.more);
        setError(false);
      } catch {
        if (live) setError(true);
      }
    };
    setRows(null);
    void load();
    const t = page === 0 ? setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000) : undefined;
    return () => { live = false; if (t) clearInterval(t); };
  }, [addr, before, page, session.address]);

  return (
    <Card className="c0-pf__activity" aria-label={isMe ? "Journal" : "Activity"}>
      <h2 className="c0-pf__h2">{isMe ? "Journal" : "Activity"}</h2>
      {rows === null ? (
        error ? <p className="c0-pf__empty">The journal didn&apos;t load. It retries on its own.</p> : <Underway label="Reading the journal…" />
      ) : rows.length === 0 ? (
        <p className="c0-pf__empty">{isMe ? "Nothing written yet. Feed, build and raid, and the page fills up." : "Nothing in the journal yet."}</p>
      ) : (
        <ul className="c0-pf__list">
          {rows.map((ev) => {
            const line = describeEvent(ev, session.address);
            if (!line) return null;
            const report = isMe && ev.type === "settled" && line.raidId;
            return (
              <li key={ev.id} className="c0-jrow">
                <span className={line.tone === "raid" ? "c0-pf__raidtext" : undefined}>{line.sentence}</span>
                <span className="c0-jrow__time">
                  {timeAgo(ev.ts, now)}
                  {report ? <> · <Link className="c0-pf__link" href={`/report?raid=${line.raidId}`}>report ›</Link></> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {page > 0 || more ? (
        <div className="c0-pf__pager">
          <Button variant="paper" size="compact" disabledReason={page === 0 ? "This is the newest page" : undefined} onClick={() => setCursors((c) => c.slice(0, -1))}>‹ Previous</Button>
          <span className="c0-pf__page">Page {page + 1}</span>
          <Button variant="paper" size="compact" disabledReason={!more || rows === null ? (rows === null ? "Loading…" : "No older entries") : undefined} onClick={() => rows && rows.length && setCursors((c) => [...c, rows[rows.length - 1].id])}>Next ›</Button>
        </div>
      ) : null}
    </Card>
  );
}
