"use client";
import { useRouter } from "next/navigation";
import { Button, Card } from "../../ui";
import { fmtInt, fmtWif } from "../../lib/format";
import { Status, estimateShare, inRange, useColonies, useNow, type Profile } from "../../lib/game";
import { useSession } from "../../lib/session";

type Rows = ReturnType<typeof useColonies>["data"];

const byScore = (a: { score: bigint; id: bigint }, b: { score: bigint; id: bigint }) =>
  b.score > a.score ? 1 : b.score < a.score ? -1 : Number(a.id - b.id);

export function RankCard({ addr, profile, rows, loading, pot, isMe }: {
  addr: string; profile: Profile; rows: Rows; loading: boolean; pot?: bigint; isMe: boolean;
}) {
  const router = useRouter();
  const session = useSession();
  const now = useNow(30_000);
  const all = [...(rows ?? [])].sort(byScore);
  const idx = all.findIndex((r) => r.owner === addr);
  const ranked = idx >= 0;
  const paid = all.filter((r) => r.feedCount >= 2).sort(byScore);
  const inPot = ranked && paid.slice(0, Math.ceil(paid.length / 4)).some((r) => r.owner === addr);

  let reason: string | undefined;
  if (!isMe) {
    const mine = all.find((r) => r.owner === session.address);
    const them = all[idx];
    if (!session.address) reason = "Sign in to raid";
    else if (!mine) reason = "Found a colony first";
    else if (!them || profile.status !== Status.Alive) reason = "Not alive";
    else if (them.shieldUntil > now) reason = "Shielded";
    else if (mine.workers < 10) reason = "Needs 10 ants";
    else if (!inRange(mine.workers, them.workers)) reason = "Out of range";
  }
  const share = isMe && ranked && pot !== undefined ? estimateShare(pot, all, all[idx].id) : null;

  return (
    <Card className="c0-pf__rank">
      <div className="c0-pf__rnum">{ranked ? `#${idx + 1}` : loading ? "#…" : "#–"}</div>
      <div className="c0-pf__rtext">
        {ranked
          ? `of ${fmtInt(all.length)} · score ${fmtInt(profile.score)} · ${inPot ? "in the pot" : "not in the pot yet"}`
          : `score ${fmtInt(profile.score)}`}
      </div>
      {isMe ? (
        <div className="c0-pf__share">
          <span className="c0-pf__chip">{share === null ? "…" : `~${fmtWif(share)} WIF`}</span>
          <span className="c0-pf__cap">estimate</span>
        </div>
      ) : (
        <Button variant="raid" size="compact" icon="raids" disabledReason={reason} onClick={() => router.push("/?tab=raids")}>Raid</Button>
      )}
    </Card>
  );
}
