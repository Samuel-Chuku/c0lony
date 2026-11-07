"use client";
// "While you were away": shown once per app load when something happened since the player was last here.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BlockedStrip, Button, Modal, ResIcon, Wif } from "../ui";
import { fetchSummary, type Summary } from "../lib/api";
import { fmtDuration, fmtRes } from "../lib/format";
import { Status, useNow, useProfile } from "../lib/game";
import { useSession } from "../lib/session";
import { fedResult, tendResult, type TendSnapshot } from "../lib/outcomes";
import { useAction } from "../lib/tx";
import { fmtWif } from "../lib/format";
import { Handle } from "../screens/live/feedText";
import { useColonyView, usePlayerPrices, waitingNow } from "../screens/colony/data";
import { useGameConfig } from "../lib/game";
import "../screens/colony/colony.css";

const key = (wallet: string) => `c0lony:lastSeen:${wallet}`;
const handled = new Set<string>(); // wallets already checked in this app load

type Row = { key: string; tag: string; raid: boolean; text: ReactNode; value: string; loss?: boolean };

const lootOf = (d: Record<string, unknown>) => {
  let amount = 0n;
  try { amount = BigInt(String(d.lootAmount ?? "0")); } catch { /* keep 0 */ }
  const kind = d.lootResource === "leaves" || d.lootResource === 1 ? "leaf" : "sugar";
  return { amount, kind: kind as "leaf" | "sugar" };
};

/** One row per thing that happened to this player: raids marching on them, and raids that landed. */
function rowsOf(s: Summary, wallet: string, now: number): Row[] {
  const rows: Row[] = [];
  const me = wallet.toLowerCase();
  const settledIds = new Set(s.rows.filter((r) => r.type === "settled").map((r) => String(r.data.raidId)));
  const guardedIds = new Set(s.rows.filter((r) => r.type === "guarded" && String(r.data.defender ?? r.actors[0]).toLowerCase() === me).map((r) => String(r.data.raidId)));
  for (const r of s.rows) {
    const d = r.data;
    const raidId = String(d.raidId);
    const raider = String(d.raider ?? r.actors[0] ?? "").toLowerCase();
    const defender = String(d.defender ?? r.actors[1] ?? "").toLowerCase();
    if (r.type === "raid_launched" && defender === me && !settledIds.has(raidId)) {
      const deadline = Number(d.guardDeadline ?? 0);
      if (deadline <= now && guardedIds.has(raidId)) continue;
      rows.push({
        key: `m${raidId}`, tag: "Marching", raid: true,
        text: <><Handle addr={raider} me={me} /> is marching on you{deadline > now ? ` · guard by ${new Date(deadline * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</>,
        value: deadline > now ? fmtDuration(deadline - now) : "",
      });
    } else if (r.type === "settled") {
      const out = String(d.outcome ?? "");
      const { amount, kind } = lootOf(d);
      const loot = amount > 0n ? <>{fmtRes(amount)} <ResIcon name={kind} size={16} label={kind === "leaf" ? "leaves" : "sugar"} /></> : null;
      if (raider === me) {
        const won = out === "raider_won";
        rows.push({
          key: `s${raidId}`, tag: won ? "Raid won" : "Raid lost", raid: true,
          text: won ? <>You raided <Handle addr={defender} me={me} />{loot ? <> and took {loot}</> : ""}</> : <>Your raid on <Handle addr={defender} me={me} /> {out === "guarded" ? "met a guard" : "was held off"}</>,
          value: won && amount > 0n ? `+${fmtRes(amount)}` : "",
        });
      } else if (defender === me) {
        const hit = out === "raider_won";
        rows.push({
          key: `s${raidId}`, tag: hit ? "Raided" : "Defended", raid: hit,
          text: hit ? <><Handle addr={raider} me={me} /> raided you{loot ? <> and took {loot}</> : ""}</> : <>{out === "guarded" ? "Your guard stopped " : "You held off "}<Handle addr={raider} me={me} /></>,
          value: hit && amount > 0n ? `−${fmtRes(amount)}` : !hit && out === "guarded" ? "+10 pts" : "",
          loss: hit,
        });
      }
    }
  }
  return rows;
}

export function WelcomeBack() {
  const session = useSession();
  const router = useRouter();
  const now = useNow(30_000);
  const wallet = session.address;
  const profile = useProfile(wallet);
  const cfg = useGameConfig();
  const view = useColonyView(profile.data && profile.data.colonyId ? profile.data.colonyId : null);
  const prices = usePlayerPrices(wallet);
  const feed = useAction("Feeding", { success: fedResult });
  const tendSnap = useRef<TendSnapshot | null>(null);
  const tend = useAction("Tending", { success: (r) => tendResult(r, tendSnap.current) });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastSeen, setLastSeen] = useState(0);

  const p = profile.data;
  const hasColony = !!p && p.colonyId !== 0n && p.status >= Status.Alive && p.status <= Status.Collapsed;

  useEffect(() => {
    if (!wallet || !hasColony || handled.has(wallet)) return;
    handled.add(wallet);
    const nowSec = Math.floor(Date.now() / 1000);
    let seen = 0;
    try { seen = Number(localStorage.getItem(key(wallet))) || 0; } catch { /* storage blocked */ }
    if (!seen) {
      // First visit on this device: nothing to compare against yet.
      try { localStorage.setItem(key(wallet), String(nowSec)); } catch { /* ignore */ }
      return;
    }
    fetchSummary(wallet, seen)
      .then((s) => {
        const happened = s.rows.length > 0 || s.raided + s.defended + s.raidsWon + s.raidsLost > 0 || (s.avenge && s.avenge.expiresAt > nowSec);
        if (happened) {
          setLastSeen(seen);
          setSummary(s);
        } else {
          try { localStorage.setItem(key(wallet), String(nowSec)); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* feed not switched on: stay quiet and keep lastSeen */ });
  }, [wallet, hasColony]);

  if (!summary || !wallet) return null;

  const close = () => {
    try { localStorage.setItem(key(wallet), String(Math.floor(Date.now() / 1000))); } catch { /* ignore */ }
    setSummary(null);
  };

  const rows = rowsOf(summary, wallet, now);
  const marching = rows.some((r) => r.key.startsWith("m"));
  const alive = p?.status === Status.Alive;
  const left = p ? Number(p.fedUntil) - now : Infinity;
  const hungry = alive && left < 12 * 3600;
  const avenge = summary.avenge && summary.avenge.expiresAt > now ? summary.avenge : null;
  const waiting = alive && view.data && cfg.data ? !waitingNow(view.data, cfg.data, now).nothing : false;
  const latest = summary.rows.find((r) => r.type === "settled");
  const feedPrice = prices.feed;
  if (rows.length === 0 && !hungry && !avenge && !waiting) return null;

  return (
    <Modal open onClose={close} title="While you were away" kicker={`you were gone ${fmtDuration(now - lastSeen)}`}>
      <div className="c0-wb">
        {rows.length > 0 ? (
          <ul className="c0-wb__rows">
            {rows.map((r) => (
              <li key={r.key} className="c0-wb__row">
                <span className={r.raid ? "c0-wb__tag c0-wb__tag--raid" : "c0-wb__tag"}>{r.tag}</span>
                <span className="c0-wb__text">{r.text}</span>
                {r.value ? <span className={r.loss ? "c0-wb__val c0-wb__val--loss" : "c0-wb__val"}>{r.value}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {hungry ? <BlockedStrip>Queen is hungry in {fmtDuration(left)}</BlockedStrip> : null}
        <div className="c0-wb__actions">
          {hungry ? (
            <Button
              variant="wif"
              size="hero"
              fullWidth
              busy={feed.busy ? "Feeding…" : undefined}
              disabledReason={feedPrice === undefined ? <span className="c0-sr">Loading the price</span> : undefined}
              error={feed.error}
              onClick={() => void feed.run({ functionName: "feedQueen", args: [prices.proof], wif: feedPrice }).then((h) => { if (h) close(); })}
            >
              Feed the colony · <Wif>{feedPrice !== undefined ? fmtWif(feedPrice) : "…"}</Wif>
            </Button>
          ) : null}
          {marching ? (
            <Button variant="paper" fullWidth icon="raids" onClick={() => { close(); router.push("/?tab=raids"); }}>
              Guard now
            </Button>
          ) : null}
          {avenge || waiting ? (
            <div className="c0-wb__pair">
              {avenge ? (
                <Button variant="raid" icon="raids" onClick={() => { close(); router.push(`/?tab=raids&avenge=${avenge.raider}`); }}>
                  Avenge · free
                </Button>
              ) : null}
              {waiting ? (
                <Button
                  variant="paper"
                  busy={tend.busy ? "Tending…" : undefined}
                  error={tend.error}
                  onClick={() => {
                    tendSnap.current = view.data && cfg.data ? waitingNow(view.data, cfg.data, Math.floor(Date.now() / 1000)) : null;
                    void tend.run({ functionName: "tend" });
                  }}
                >
                  Tend · collect all
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {latest ? (
          <Link className="c0-hand c0-hand--17 c0-wb__report" href={`/report?raid=${String(latest.data.raidId)}`} onClick={close}>
            read the full raid report ›
          </Link>
        ) : null}
      </div>
    </Modal>
  );
}
