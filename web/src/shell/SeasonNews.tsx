"use client";
// After a season ends: a strip on every tab for a week and a one-time pop-up, both opening the results page.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Hand, Modal, Wif } from "../ui";
import { useNow, useSeason } from "../lib/game";
import { useSession } from "../lib/session";
import { fmtW, useSeasonIndex, useSeasonResult } from "../lib/seasons";
import "../screens/history/history.css";

const WEEK = 7 * 86400;
const seenKey = (n: number) => `c0lony:season-news:${n}`;

function useLatestFinished() {
  const now = useNow(60_000);
  const latest = useSeasonIndex().data?.seasons[0] ?? null;
  return latest && now - latest.end < WEEK ? latest : null;
}

export function SeasonBanner() {
  const router = useRouter();
  const latest = useLatestFinished();
  const next = useSeason().data;
  if (!latest) return null;
  return (
    <div className="c0-seasonbar" role="status">
      <div className="c0-seasonbar__text">
        <strong>Season {latest.season} is over</strong>
        <Hand size={16}>{fmtW(latest.pot, 0)} WIF paid out{next ? ` · Season ${String(next.season)} is on` : ""}</Hand>
      </div>
      <Button variant="paper" size="compact" onClick={() => router.push(`/seasons?n=${latest.season}`)}>See the results</Button>
    </div>
  );
}

export function SeasonPrompt() {
  const router = useRouter();
  const session = useSession();
  const latest = useLatestFinished();
  const r = useSeasonResult(latest?.season ?? null).data;
  const next = useSeason().data;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!latest) return;
    try { if (localStorage.getItem(seenKey(latest.season))) return; } catch { return; }
    let done = false;
    // wait for other pop-ups (sign-in, While you were away, the vote) to close first
    const check = () => {
      if (done || document.querySelector(".c0-dialog-root")) return;
      done = true;
      try { localStorage.setItem(seenKey(latest.season), "1"); } catch { /* private mode */ }
      setShow(true);
    };
    const start = window.setTimeout(check, 2500);
    const every = window.setInterval(check, 1000);
    return () => { window.clearTimeout(start); window.clearInterval(every); };
  }, [latest]);

  if (!show || !latest || !r) return null;
  const mine = session.address ? r.colonies.find((c) => c.owner.toLowerCase() === session.address!.toLowerCase()) : undefined;
  const close = () => setShow(false);
  return (
    <Modal open onClose={close} title={`Season ${latest.season} is over`} kicker="The results are in">
      <p className="c0-wsheet__note">
        {fmtW(r.pot.total, 0)} WIF was shared by {r.pot.qualified} colonies. {r.totals.colonies} colonies played {r.totals.raids} raids, {r.totals.feedings} feedings and {fmtW(r.totals.tends, 0)} tends, all onchain.
      </p>
      {mine ? (
        <p className="c0-wsheet__note">
          {mine.rank ? <>You finished #{mine.rank} with a score of {fmtW(mine.score, 0)}{mine.share > 0 ? <> and won <Wif>{fmtW(mine.share)}</Wif></> : null}.</> : <>Your colony fed {mine.feeds} of the 2 times needed to share the pot.</>}
        </p>
      ) : null}
      {next ? <p className="c0-wsheet__note">Season {String(next.season)} has started: found a new colony to play for its pot.</p> : null}
      <Button variant="dark" fullWidth onClick={() => { close(); router.push(`/seasons?n=${latest.season}`); }}>See the results</Button>
      <Button variant="paper" fullWidth onClick={close}>Not now</Button>
    </Modal>
  );
}
