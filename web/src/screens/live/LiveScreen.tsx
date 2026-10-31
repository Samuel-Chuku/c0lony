"use client";
import { useEffect, useState } from "react";
import { Button, Chip, ChipRow, Panel, Underway } from "../../ui";
import { Screen } from "../../shell/Screen";
import { fetchFeed, feedUrl, useFeed, useFeedStats, type FeedEvent, type FeedFilter } from "../../lib/api";
import { fmtInt, fmtWif } from "../../lib/format";
import { useNow, useSeason } from "../../lib/game";
import { useSession } from "../../lib/session";
import { QUIET_TYPES } from "./feedText";
import { LiveRow } from "./LiveRow";

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "raids", label: "Raids" }, { id: "mine", label: "Mine" }, { id: "pot", label: "Pot" },
];

export function LiveScreen() {
  const session = useSession();
  const [filter, setFilter] = useState<FeedFilter>("all");
  const stats = useFeedStats();
  const season = useSeason();
  const raids = stats.data?.raidsToday;

  const title = (
    <>
      LIVE
      <span className="c0-live__count">
        <span className="c0-live__dot" aria-hidden="true" />
        {raids === undefined ? "" : `${fmtInt(raids)} ${raids === 1 ? "raid" : "raids"} today`}
      </span>
    </>
  );

  return (
    <Screen title={title} tab="live">
      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>
        ))}
      </ChipRow>
      <Panel className="c0-potstrip" aria-label="Season pot">
        <div>
          <div className="c0-potstrip__cap">SEASON {season.data ? season.data.season : ""} POT</div>
          <div className="c0-potstrip__num c0-potstrip__num--gold">{season.data ? `${fmtWif(season.data.pot)} WIF` : "…"}</div>
        </div>
        <div className="c0-potstrip__right">
          <div className="c0-potstrip__cap">BURNED</div>
          <div className="c0-potstrip__num">{stats.data ? `${fmtInt(Math.floor(Number(stats.data.burnedWif)))} WIF` : "·"}</div>
        </div>
      </Panel>
      <FeedList key={filter} filter={filter} me={session.address} configured={session.configured} login={session.login} />
    </Screen>
  );
}

function FeedList({ filter, me, configured, login }: { filter: FeedFilter; me: string | null; configured: boolean; login: () => void }) {
  const first = useFeed(filter, me);
  const now = useNow(30_000);
  const [older, setOlder] = useState<FeedEvent[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  // A refreshed first page may overlap the older pages: show each id once, newest first.
  const seen = new Set<number>();
  const rows = [...(first.data ?? []), ...older]
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => b.id - a.id);
  const shown = rows.filter((e) => filter !== "all" || !QUIET_TYPES.has(e.type));
  useEffect(() => { if (first.data && first.data.length < 20) setExhausted(true); }, [first.data]);

  if (filter === "mine" && !me) {
    return (
      <Panel className="c0-livenote">
        <p>Your own raids, feedings and results show up here once you sign in.</p>
        {configured ? <Button variant="paper" size="compact" onClick={login}>Sign in</Button> : <p>Sign-in opens soon.</p>}
      </Panel>
    );
  }
  if (first.loading) return <Underway label="Reading the tunnels…" />;
  if (first.error && !first.data) {
    return <Panel className="c0-livenote"><p>Quiet in the tunnels. The first raid of the day will show up here.</p></Panel>;
  }
  if (shown.length === 0) {
    return <Panel className="c0-livenote"><p>Quiet in the tunnels. The first raid of the day will show up here.</p></Panel>;
  }

  async function loadOlder() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchFeed(feedUrl(filter, { wallet: me ?? undefined, before: last.id }));
      setOlder((o) => [...o, ...page]);
      if (page.length < 20) setExhausted(true);
    } catch {
      setMoreError("Couldn't load older rows · the network didn't answer. Try again");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <ul className="c0-feedlist">
        {shown.map((ev) => (
          <li key={ev.id}><LiveRow ev={ev} me={me} now={now} /></li>
        ))}
      </ul>
      {!exhausted && (
        <Button variant="paper" fullWidth busy={loadingMore ? "Loading…" : undefined} error={moreError} onClick={loadOlder}>Load older</Button>
      )}
    </>
  );
}
