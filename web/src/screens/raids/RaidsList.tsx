"use client";
// The Raids tab on the Raids screen: every raid in the game, or only the ones you were part of.
import { useState } from "react";
import { Chip, Hand, Underway } from "../../ui";
import { useFeed } from "../../lib/api";
import { LiveRow } from "../live/LiveRow";

const RAID_TYPES = new Set(["raid_launched", "guarded", "revealed", "settled", "collected", "avenge_granted"]);

export function RaidsList({ me, now }: { me: string | null; now: number }) {
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const all = useFeed("raids", null, 40);
  const mine = useFeed("mine", me, 60);
  const q = filter === "all" ? all : mine;
  const rows = (q.data ?? []).filter((e) => RAID_TYPES.has(e.type));
  return (
    <section className="c0-raidslist" aria-label="Raids">
      <div className="c0-chiprow c0-raidslist__filter" role="group" aria-label="Filter raids">
        <Chip selected={filter === "all"} onClick={() => setFilter("all")}>All raids</Chip>
        <Chip selected={filter === "mine"} onClick={() => setFilter("mine")}>Mine</Chip>
      </div>
      {filter === "mine" && !me ? (
        <Hand size={16}>Sign in to see your raids.</Hand>
      ) : q.error && !q.data ? (
        <div className="c0-blocked">{q.error instanceof Error ? q.error.message : "Couldn't load raids."}</div>
      ) : !q.data ? (
        <Underway label="Reading raids" />
      ) : rows.length === 0 ? (
        <Hand size={16}>{filter === "mine" ? "You haven't raided or been raided yet. Pick a neighbour with plenty of sugar." : "No raids yet this season."}</Hand>
      ) : (
        <ul className="c0-feedlist">
          {rows.map((ev) => <li key={ev.id}><LiveRow ev={ev} me={me} now={now} /></li>)}
        </ul>
      )}
    </section>
  );
}
