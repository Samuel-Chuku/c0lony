"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { Card, Underway } from "../../ui";
import { Screen } from "../../shell/Screen";
import { useColonies } from "../../lib/game";
import { useSession } from "../../lib/session";
import { LeaderRow } from "./LeaderRow";

export function LeaderboardScreen() {
  const session = useSession();
  const colonies = useColonies();
  const myRef = useRef<HTMLDivElement>(null);
  const [mineVisible, setMineVisible] = useState(true);

  const sorted = [...(colonies.data ?? [])].sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : Number(a.id - b.id)));
  const fedTwice = sorted.filter((r) => r.feedCount >= 2);
  const lastPaid = fedTwice[Math.ceil(fedTwice.length / 4) - 1];
  const myIdx = sorted.findIndex((r) => r.owner === session.address);
  const showList = sorted.slice(0, 100);
  const mineInList = myIdx >= 0 && myIdx < showList.length;

  useEffect(() => {
    const el = myRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setMineVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [mineInList, sorted.length]);

  return (
    <Screen back>
      <h2 className="c0-lb__title">LEADERBOARD</h2>
      {colonies.loading ? (
        <Underway label="Counting the colonies…" />
      ) : sorted.length === 0 ? (
        <Card><p className="c0-pf__empty">No colonies yet this season. Found one and you take rank 1.</p></Card>
      ) : (
        <>
          <ol className="c0-feedlist">
            {showList.map((r, i) => (
              <Fragment key={String(r.id)}>
                <li><LeaderRow ref={i === myIdx ? myRef : undefined} row={r} rank={i + 1} mine={i === myIdx} /></li>
                {lastPaid && r.id === lastPaid.id ? (
                  <li className="c0-lb__line" aria-label="Pot line: colonies above this line share the pot"><span>pot line</span></li>
                ) : null}
              </Fragment>
            ))}
          </ol>
          {myIdx >= 0 && !mineVisible ? (
            <div className="c0-lb__pin"><LeaderRow row={sorted[myIdx]} rank={myIdx + 1} mine /></div>
          ) : null}
        </>
      )}
    </Screen>
  );
}
