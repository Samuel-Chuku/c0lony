"use client";
import Link from "next/link";
import { Card, Underway } from "../../ui";
import { Screen } from "../../shell/Screen";
import { useFeedStats } from "../../lib/api";
import { fmtDuration, fmtInt, fmtWif } from "../../lib/format";
import { Status, estimateShare, seasonDays, useColonies, useNow, useSeason } from "../../lib/game";
import { useSession } from "../../lib/session";
import { LeaderRow } from "../leaderboard/LeaderRow";
import { ClaimButton } from "../profile/ClaimButton";
import "./season.css";

const byScore = (a: { score: bigint; id: bigint }, b: { score: bigint; id: bigint }) =>
  b.score > a.score ? 1 : b.score < a.score ? -1 : Number(a.id - b.id);

export function SeasonScreen() {
  const session = useSession();
  const now = useNow(30_000);
  const season = useSeason().data;
  const stats = useFeedStats().data;
  const colonies = useColonies();
  const all = [...(colonies.data ?? [])].sort(byScore);
  const myIdx = session.address ? all.findIndex((r) => r.owner === session.address) : -1;
  const mine = myIdx >= 0 ? all[myIdx] : null;
  const left = season ? season.end - now : 0;
  const days = season ? seasonDays(season.start, season.end, now) : null;
  const burned = stats ? Number(stats.burnedWif) : null;

  return (
    <Screen title="SEASON" tab="season">
      <div className="c0-split">
      <div className="c0-split__main">
      <Card className="c0-ss__pot">
        <div className="c0-ss__top">
          <h2 className="c0-pf__h2">Season {season ? String(season.season) : "…"}</h2>
          <span className="c0-pf__cap">{days ? `day ${days.day} of ${days.total}` : ""}</span>
        </div>
        <span className="c0-ss__big">{season ? `${fmtWif(season.pot)} WIF` : "…"}</span>
        <div className="c0-ss__meta">
          <div><b>{season ? (left > 0 ? fmtDuration(left) : "Over") : "…"}</b><span>{left > 0 ? "left" : "claim your share"}</span></div>
          <div><b>{burned === null ? "…" : `${fmtInt(burned)} WIF`}</b><span>burned so far</span></div>
        </div>
        <p className="c0-ss__how">
          Half the pot is shared by score among every colony still alive at the end that was fed at least twice. The other half is shared by score among the top quarter.
        </p>
      </Card>

      <h2 className="c0-ss__h">YOUR STANDING</h2>
      {mine ? (
        <Card>
          <div className="c0-ss__rows">
            <div className="c0-ss__row"><span>Rank</span><b>#{myIdx + 1} of {fmtInt(all.length)}</b></div>
            <div className="c0-ss__row"><span>Score</span><b>{fmtInt(mine.score)}</b></div>
            <div className="c0-ss__row"><span>Fed twice</span><b>{mine.feedCount >= 2 ? "Yes" : `Not yet · ${mine.feedCount} of 2`}</b></div>
            <div className="c0-ss__row"><span>Alive</span><b>{mine.status === Status.Alive ? "Yes" : "No"}</b></div>
            <div className="c0-ss__row">
              <span>Estimated share</span>
              <span className="c0-ss__chip">{season ? `~${fmtWif(estimateShare(season.pot, all, mine.id))} WIF` : "…"}</span>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="c0-pf__empty">
            {session.address
              ? "You have no colony this season. Found one on the Colony tab, feed it twice and stay alive to share the pot."
              : "Sign in and found a colony. Feed it at least twice and keep it alive to share the pot."}
          </p>
        </Card>
      )}
      {session.address ? <ClaimButton wallet={session.address} season={season ? Number(season.season) : undefined} /> : null}
      </div>

      <div className="c0-split__side">
      <h2 className="c0-ss__h">TOP 10</h2>
      {colonies.loading && all.length === 0 ? (
        <Underway label="Counting the colonies…" />
      ) : all.length === 0 ? (
        <Card><p className="c0-pf__empty">No colonies yet this season. Found one and you take rank 1.</p></Card>
      ) : (
        <ol className="c0-feedlist">
          {all.slice(0, 10).map((r, i) => (
            <li key={String(r.id)}><LeaderRow row={r} rank={i + 1} mine={i === myIdx} /></li>
          ))}
        </ol>
      )}
      <Link className="c0-ss__more" href="/leaderboard">Full leaderboard ›</Link>

      <div className="c0-ss__links">
        <Link className="c0-ss__link" href="/how-to-play"><span>How to play</span><span aria-hidden="true">›</span></Link>
        <Link className="c0-ss__link" href="/invite"><span>Invite friends</span><span aria-hidden="true">›</span></Link>
      </div>
      </div>
      </div>
    </Screen>
  );
}
