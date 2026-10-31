"use client";
// "While you were away": shown once per app load when something happened since the player was last here.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BlockedStrip, Button, Modal } from "../ui";
import { fetchSummary, type Summary } from "../lib/api";
import { fmtDuration, fmtRes } from "../lib/format";
import { Status, useNow, useProfile } from "../lib/game";
import { useSession } from "../lib/session";
import { useAction } from "../lib/tx";
import { fmtWif } from "../lib/format";
import { useColonyView, usePlayerPrices, waitingNow } from "../screens/colony/data";
import { useGameConfig } from "../lib/game";
import "../screens/colony/colony.css";

const key = (wallet: string) => `c0lony:lastSeen:${wallet}`;
const handled = new Set<string>(); // wallets already checked in this app load

const sum = (a: string, b: string) => BigInt(a) + BigInt(b);

type Row = { tag: string; raid: boolean; text: string; value: string; loss?: boolean };

function rowsOf(s: Summary, wallet: string): Row[] {
  const rows: Row[] = [];
  const lost = sum(s.lostLeaves, s.lostSugar);
  if (s.raided > 0) {
    const what = [BigInt(s.lostLeaves) > 0n && `${fmtRes(BigInt(s.lostLeaves))} leaves`, BigInt(s.lostSugar) > 0n && `${fmtRes(BigInt(s.lostSugar))} sugar`].filter(Boolean).join(" and ");
    rows.push({ tag: "Raided", raid: true, text: `${s.raided === 1 ? "A raider" : `${s.raided} raiders`} took ${what || "from your stores"}`, value: lost > 0n ? `−${fmtRes(lost)}` : "", loss: true });
  }
  if (s.defended > 0) {
    const guarded = s.rows.filter((r) => r.type === "settled" && r.data.outcome === "guarded" && r.data.defender === wallet).length;
    rows.push({
      tag: "Defended",
      raid: false,
      text: guarded > 0 ? `Your guard stopped ${guarded === 1 ? "a raid" : `${guarded} raids`}` : `You held off ${s.defended === 1 ? "a raid" : `${s.defended} raids`}`,
      value: guarded > 0 ? `+${guarded * 10} pts` : "",
    });
  }
  if (s.raidsWon > 0) {
    const won = sum(s.wonLeaves, s.wonSugar);
    const what = [BigInt(s.wonLeaves) > 0n && `${fmtRes(BigInt(s.wonLeaves))} leaves`, BigInt(s.wonSugar) > 0n && `${fmtRes(BigInt(s.wonSugar))} sugar`].filter(Boolean).join(" and ");
    rows.push({ tag: "Raid won", raid: true, text: `You took ${what || "loot"}${s.raidsWon > 1 ? ` in ${s.raidsWon} raids` : ""}`, value: won > 0n ? `+${fmtRes(won)}` : "" });
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
  const feed = useAction("Feeding");
  const tend = useAction("Tending");
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

  const rows = rowsOf(summary, wallet);
  const alive = p?.status === Status.Alive;
  const left = p ? Number(p.fedUntil) - now : Infinity;
  const hungry = alive && left < 12 * 3600;
  const avenge = summary.avenge && summary.avenge.expiresAt > now ? summary.avenge : null;
  const waiting = alive && view.data && cfg.data ? !waitingNow(view.data, cfg.data, now).nothing : false;
  const latest = summary.rows.find((r) => r.type === "settled");
  const feedPrice = prices.feed;

  return (
    <Modal open onClose={close} title="While you were away" kicker={`you were gone ${fmtDuration(now - lastSeen)}`}>
      <div className="c0-wb">
        {rows.length > 0 ? (
          <ul className="c0-wb__rows">
            {rows.map((r) => (
              <li key={r.tag} className="c0-wb__row">
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
              Feed her · {feedPrice !== undefined ? fmtWif(feedPrice) : "…"} WIF
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
                  onClick={() => void tend.run({ functionName: "tend" })}
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
