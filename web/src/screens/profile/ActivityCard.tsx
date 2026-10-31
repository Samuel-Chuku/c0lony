"use client";
import Link from "next/link";
import { Card, Underway } from "../../ui";
import { useFeed } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useNow } from "../../lib/game";
import { useSession } from "../../lib/session";
import { QUIET_TYPES, describeEvent } from "../live/feedText";

export function ActivityCard({ addr, isMe }: { addr: string; isMe: boolean }) {
  const feed = useFeed("all", addr, 10);
  const session = useSession();
  const now = useNow(60_000);
  const rows = (feed.data ?? []).filter((e) => !QUIET_TYPES.has(e.type));

  return (
    <Card className="c0-pf__activity" aria-label={isMe ? "Journal" : "Activity"}>
      <h2 className="c0-pf__h2">{isMe ? "Journal" : "Activity"}</h2>
      {feed.loading ? (
        <Underway label="Reading the journal…" />
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
    </Card>
  );
}
