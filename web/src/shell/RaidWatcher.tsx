"use client";
// Pops the raid result window on whatever page the player is on when one of their raids (as raider or
// defender) is settled or closed while the app is open. Most raids are settled by the keeper, not the
// player, so without this the result would only show up in the feed. Away-time results go to WelcomeBack.
import { useEffect, useRef } from "react";
import { useFeed, type FeedEvent } from "../lib/api";
import { collectedResult, raidResult, raidShown } from "../lib/outcomes";
import { showResult, useResult } from "../lib/result";
import { useSession } from "../lib/session";
import { play } from "../lib/sound";

const lc = (v: unknown) => String(v ?? "").toLowerCase();

function resultOf(ev: FeedEvent, me: string) {
  const d = ev.data;
  const id = String(d.raidId ?? "");
  if (ev.type === "settled") {
    const out = String(d.outcome);
    const o = raidResult({
      raidId: id,
      outcome: out === "raider_won" ? "won" : out === "guarded" ? "guarded" : "held",
      raider: lc(d.raider),
      defender: lc(d.defender),
      lootKind: d.lootResource === "leaves" ? "leaf" : "sugar",
      loot: BigInt(String(d.lootAmount ?? "0")),
      pct: Number(d.roll ?? 0),
      lost: Number(d.soldiersLost ?? 0),
    }, me);
    const iWon = (out === "raider_won") === (lc(d.raider) === me);
    return { content: { ...o, hash: ev.tx as `0x${string}` }, cue: iWon ? ("win" as const) : ("lose" as const) };
  }
  const asRaider = lc(ev.actors[0]) === me;
  return { content: { ...collectedResult(id, Number(d.soldiersLost ?? 0), asRaider), hash: ev.tx as `0x${string}` }, cue: "reveal" as const };
}

export function RaidWatcher() {
  const session = useSession();
  const me = session.address?.toLowerCase() ?? null;
  const feed = useFeed("mine", me, 20).data;
  const open = useResult();
  const since = useRef(Math.floor(Date.now() / 1000) - 5);

  useEffect(() => {
    if (!me || !feed || open) return;
    const ev = [...feed]
      .reverse()
      .find((e) => (e.type === "settled" || e.type === "collected") && e.ts >= since.current && e.data.raidId != null && !raidShown(String(e.data.raidId)) && e.actors.some((a) => lc(a) === me));
    if (!ev) return;
    const { content, cue } = resultOf(ev, me);
    play(cue);
    showResult(content);
  }, [feed, me, open]);

  return null;
}
