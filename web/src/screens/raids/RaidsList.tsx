"use client";
// The Raids tab on the Raids screen: every raid in the game, or only the ones you were part of.
import { useEffect, useRef, useState } from "react";
import { Hand, PixelIcon, Underway } from "../../ui";
import { useFeed } from "../../lib/api";
import { LiveRow } from "../live/LiveRow";

const RAID_TYPES = new Set(["raid_launched", "guarded", "revealed", "settled", "collected", "avenge_granted"]);

export function RaidsList({ me, now }: { me: string | null; now: number }) {
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const all = useFeed("raids", null, 40);
  const mine = useFeed("mine", me, 60);
  const q = filter === "all" ? all : mine;
  const rows = (q.data ?? []).filter((e) => RAID_TYPES.has(e.type));
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // The filter menu closes on a tap outside it or Esc.
  useEffect(() => {
    if (!menu) return;
    const out = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", out); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const choose = (f: "all" | "mine") => { setFilter(f); setMenu(false); };
  return (
    <section className="c0-raidslist" aria-label="Raids">
      <div className="c0-sect c0-raidslist__head">
        <h2>{filter === "all" ? "All raids" : "Your raids"}</h2>
        <div className="c0-filter" ref={box}>
          <button type="button" className="c0-filter__btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <PixelIcon name="funnel" size={20} />
            <span>{filter === "all" ? "All" : "Mine"}</span>
          </button>
          {menu ? (
            <div className="c0-filter__menu" role="menu" aria-label="Filter raids">
              {([["all", "All raids"], ["mine", "Only mine"]] as const).map(([f, label]) => (
                <button key={f} type="button" role="menuitemradio" aria-checked={filter === f} className="c0-filter__item" onClick={() => choose(f)}>
                  <span className="c0-filter__tick" aria-hidden="true">{filter === f ? "✓" : ""}</span>{label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
