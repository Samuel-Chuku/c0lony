"use client";
import { forwardRef } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Card } from "../../ui";
import { displayName, fmtInt } from "../../lib/format";
import type { ColonyRow } from "../../lib/game";
import { useXProfile } from "../../lib/useXProfile";

export const LeaderRow = forwardRef<HTMLDivElement, { row: ColonyRow; rank: number; mine?: boolean }>(function LeaderRow({ row, rank, mine }, ref) {
  const router = useRouter();
  const x = useXProfile(row.owner);
  const handle = displayName(row.owner, x?.xHandle);
  return (
    <div ref={ref}>
      <Card className={`c0-nrow c0-lrow${mine ? " c0-card--clay" : ""}`}>
        <span className="c0-lrow__rank">{rank}</span>
        <button type="button" className="c0-linkbtn c0-nrow__main" onClick={() => router.push(`/colony?addr=${row.owner}`)} aria-label={`Open profile of ${handle}`}>
          <Avatar src={x?.xAvatar ?? null} address={row.owner} alt={handle} size={40} />
          <span className="c0-nrow__col">
            <span className="c0-nrow__handle">{mine ? `${handle} · you` : handle}</span>
            <span className="c0-nrow__line">{fmtInt(row.workers)} ants</span>
          </span>
        </button>
        <span className="c0-lrow__score"><b>{fmtInt(row.score)}</b><span>score</span></span>
      </Card>
    </div>
  );
});
