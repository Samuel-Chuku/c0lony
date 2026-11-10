"use client";
// Pops the raid result window on whatever page the player is on when one of their raids (as raider or
// defender) is settled or closed while the app is open. Most raids are settled by the keeper, not the
// player, so without this the result would only show up in the feed. Away-time results go to WelcomeBack.
import { useEffect, useRef } from "react";
import { useFeed, type FeedEvent } from "../lib/api";
import { RaidStatus, Resource, readColony, useActiveRaids, useGameConfig, useProfile } from "../lib/game";
import { fmtDuration, fmtWif } from "../lib/format";
import { Wif } from "../ui";
import { Handle } from "../screens/live/feedText";
import { invalidate } from "../lib/store";
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

const giftKey = (ev: FeedEvent) => `c0lony:gift:${ev.tx}:${ev.logIndex}`;
function giftShown(ev: FeedEvent) {
  try { return localStorage.getItem(giftKey(ev)) === "1"; } catch { return true; }
}
function markGiftShown(ev: FeedEvent) {
  try { localStorage.setItem(giftKey(ev), "1"); } catch { /* storage blocked */ }
}

const shownKey = (id: bigint) => `c0lony:incoming:${id}`;
function incomingShown(id: bigint) {
  try { return localStorage.getItem(shownKey(id)) === "1"; } catch { return false; }
}
function markIncomingShown(id: bigint) {
  try { localStorage.setItem(shownKey(id), "1"); } catch { /* storage blocked */ }
}

export function RaidWatcher() {
  const session = useSession();
  const me = session.address?.toLowerCase() ?? null;
  const feed = useFeed("mine", me, 20, 8_000).data;
  const open = useResult();
  const since = useRef(Math.floor(Date.now() / 1000) - 5);

  // Fast refresh across devices: my open raids are read every 6 s (one cheap call). When they change, or
  // when a new row about me lands in the feed, every cached read refreshes at once instead of on its own timer.
  const colonyId = useProfile(me).data?.colonyId;
  const raids = useActiveRaids(colonyId || null).data;
  const raidSig = raids ? raids.map((r) => `${r.id}:${r.status}:${r.guard}`).join(",") : null;
  const feedTop = feed?.[0]?.id ?? null;
  const lastSig = useRef<string | null>(null);
  const lastTop = useRef<number | null>(null);
  useEffect(() => {
    const changed = (lastSig.current !== null && raidSig !== null && raidSig !== lastSig.current) || (lastTop.current !== null && feedTop !== null && feedTop !== lastTop.current);
    if (raidSig !== null) lastSig.current = raidSig;
    if (feedTop !== null) lastTop.current = feedTop;
    if (changed) void invalidate();
  }, [raidSig, feedTop]);

  // Coming back to the app (switching tabs or apps) refreshes everything, at most every 3 s.
  useEffect(() => {
    let last = 0;
    const onBack = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 3000) return;
      last = Date.now();
      void invalidate();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, []);

  // A raid launched on me while the app is open: pop it up within one poll (about 4 s), straight from the chain, so
  // it doesn't wait on the keeper or the feed. Each raid pops once per device; opening the app later during its
  // guard window pops it too.
  const guardWindow = Number(useGameConfig().data?.guardWindow ?? 0);
  useEffect(() => {
    if (!me || !colonyId || !raids || !guardWindow || open) return;
    const now = Math.floor(Date.now() / 1000);
    const r = raids.find(
      (x) => x.defender === colonyId && x.status === RaidStatus.Sealed && x.guard === Resource.None &&
        now < Number(x.launchedAt) + guardWindow && !incomingShown(x.id),
    );
    if (!r) return;
    markIncomingShown(r.id);
    const left = Number(r.launchedAt) + guardWindow - now;
    void readColony(r.raider)
      .then((c) => c.data.owner.toLowerCase())
      .catch(() => null)
      .then((owner) => {
        play("raid");
        showResult({
          title: "Raid incoming",
          tone: "raid",
          lines: [
            <>{owner ? <Handle addr={owner} /> : "A neighbour"} is marching on you with {Number(r.soldiers)} ants</>,
            `Guard leaves or sugar within ${fmtDuration(left)}. Guess right and the raid fails.`,
          ],
          link: { href: "/?tab=raids", label: "Guard now" },
        });
      });
  }, [me, colonyId, raids, guardWindow, open]);

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

  // WIF another player sent me while the app is open: the same window the sender saw, from my side.
  useEffect(() => {
    if (!me || !feed || open) return;
    const ev = [...feed].reverse().find((e) => e.type === "gift" && lc(e.data.to) === me && e.ts >= since.current && !giftShown(e));
    if (!ev) return;
    markGiftShown(ev);
    let amount = 0n;
    try { amount = BigInt(String(ev.data.amount ?? "0")); } catch { /* malformed row */ }
    play("coins");
    showResult({
      title: "WIF received",
      tone: "wif",
      art: "gift",
      lines: [<><Handle addr={lc(ev.data.from)} /> sent you <Wif>{fmtWif(amount)}</Wif></>, "It's already in your wallet."],
      hash: ev.tx as `0x${string}`,
      link: { href: `/colony?addr=${lc(ev.data.from)}`, label: "See their colony" },
    });
  }, [feed, me, open]);

  return null;
}
