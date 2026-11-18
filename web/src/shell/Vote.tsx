"use client";
// World is Flat final: vote for C0LONY from inside the game. Three parts share one sheet:
// - VoteSheet: pick an amount, approve exactly that much, vote. The WIF is burned and counted for C0LONY.
// - VotePrompt: a pop-up right after signing in (once per app load), and once more in the last hour.
// - VoteBanner: a strip on every tab with the time left and the same button.
// All of it disappears 20 seconds before voting closes, and never shows on testnet.
import { useEffect, useState } from "react";
import { Button, Chip, ChipRow, Hand, Modal } from "../ui";
import { fmtDuration, fmtInt, fmtWif } from "../lib/format";
import { useBalances, useNow } from "../lib/game";
import { useSession } from "../lib/session";
import { useAction } from "../lib/tx";
import { castVote, closeVote, openVote, useVoteOpen, VOTE, voteLeft } from "../lib/vote";
import "../screens/wallet/wallet.css";

const E18 = 10n ** 18n;
const PRESETS = [100, 300, 1000];
const closesAt = VOTE ? new Date((VOTE.deadline + 1) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

export function VoteSheet() {
  const isOpen = useVoteOpen();
  const session = useSession();
  const now = useNow(1000);
  const wifBal = useBalances(session.address).data?.wif ?? null;
  const [text, setText] = useState("");
  const [step, setStep] = useState<"approving" | "voting" | null>(null);
  const action = useAction("Voting", {
    success: () => ({
      title: "Your votes are in",
      tone: "wif",
      lines: [
        `${fmtInt(Number(amountOf(text) / E18))} WIF burned for C0LONY. Thank you!`,
        <>The total updates in a minute or so on the <a href={VOTE?.page} target="_blank" rel="noreferrer">World is Flat vote page ›</a></>,
      ],
    }),
  });
  useEffect(() => { if (!isOpen) { setText(""); setStep(null); action.reset(); } }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const left = voteLeft(now);
  if (!VOTE || !isOpen) return null;
  const amount = amountOf(text);
  const whole = wifBal === null ? null : wifBal / E18;
  const reason = left <= 0 ? "Voting has closed"
    : !session.address ? "Sign in to vote"
    : wifBal === null ? "Checking your WIF…"
    : amount <= 0n ? "Enter a whole number of WIF"
    : amount > wifBal ? "Not enough WIF · Buy WIF in the Menu"
    : null;

  const vote = async () => {
    const hash = await action.run((client) => castVote(client, amount, setStep));
    setStep(null);
    if (hash) closeVote();
  };

  return (
    <Modal open onClose={closeVote} title="Vote for C0LONY" kicker={left > 0 ? `World is Flat final · closes in ${fmtDuration(left)}` : "World is Flat final"}>
      <p className="c0-wsheet__note">
        C0LONY is in the top 10. The finalist with the most votes wins. Every $WIF you burn is one vote.
      </p>
      <div className="c0-wd__label"><span>How many WIF</span><span>You have {whole === null ? "…" : fmtInt(Number(whole))} WIF</span></div>
      <div className="c0-wsheet__input">
        <input inputMode="numeric" autoComplete="off" placeholder="0" aria-label="WIF to burn as votes"
          value={text} onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))} />
        <span>WIF</span>
      </div>
      <ChipRow>
        {PRESETS.map((n) => <Chip key={n} selected={text === String(n)} onClick={() => setText(String(n))}>{fmtInt(n)}</Chip>)}
        <Chip selected={whole !== null && whole > 0n && text === String(whole)} onClick={() => whole !== null && setText(String(whole))}>Max</Chip>
      </ChipRow>
      <p className="c0-wsheet__note">
        {amount > 0n ? `${fmtInt(Number(amount / E18))} votes. ` : ""}Votes burn WIF for good and can't be undone. Two wallet steps: approve, then vote. Voting closes at {closesAt}.
      </p>
      <a className="c0-votelink" href={VOTE.page} target="_blank" rel="noreferrer">See C0LONY's votes on the World is Flat page ›</a>
      <Button variant="wif" fullWidth disabledReason={reason ?? undefined} error={action.error ?? undefined}
        busy={action.busy ? (step === "approving" ? "Approving WIF (1 of 2)…" : "Voting (2 of 2)…") : undefined} onClick={() => void vote()}>
        Vote{amount > 0n ? ` · ${fmtWif(amount)} WIF` : ""}
      </Button>
    </Modal>
  );
}

function amountOf(text: string): bigint {
  return /^\d{1,12}$/.test(text) ? BigInt(text) * E18 : 0n;
}

const LAST_HOUR = 3600;
const promptedThisLoad = new Set<string>();
const lastHourKey = (w: string) => `c0lony:voteLastHour:${w}`;

/** Opens the vote right after sign-in (once per app load) and once more in the last hour, but never on top of
 *  another pop-up: it waits until none is open. */
export function VotePrompt() {
  const session = useSession();
  const now = useNow(15_000);
  const wallet = session.address?.toLowerCase() ?? null;
  const left = voteLeft(now);
  const [ask, setAsk] = useState<"start" | "lastHour" | null>(null);

  useEffect(() => {
    if (!VOTE || !wallet || left <= 0 || ask) return;
    if (!promptedThisLoad.has(wallet)) { setAsk("start"); return; }
    if (left <= LAST_HOUR) {
      try {
        if (localStorage.getItem(lastHourKey(wallet))) return;
        localStorage.setItem(lastHourKey(wallet), "1");
      } catch { return; }
      setAsk("lastHour");
    }
  }, [wallet, left, ask]);

  // wait for any other pop-up (While you were away, a result) to close first; once shown, stop looking
  const [clear, setClear] = useState(false);
  useEffect(() => {
    if (!ask) { setClear(false); return; }
    let done = false;
    const check = () => { if (!done && !document.querySelector(".c0-dialog-root")) { done = true; setClear(true); } };
    const start = window.setTimeout(check, 1500); // let the sign-in pop-ups mount first
    const every = window.setInterval(check, 1000);
    return () => { window.clearTimeout(start); window.clearInterval(every); };
  }, [ask]);

  // marked only once it is really on screen: the shell can remount this while the session loads
  if (ask && clear && wallet) promptedThisLoad.add(wallet);
  if (!ask || !clear || left <= 0) return null;
  const done = () => setAsk(null);
  return (
    <Modal open onClose={done} title={ask === "lastHour" ? "Last hour to vote" : "Vote for C0LONY"} kicker={`World is Flat final · closes in ${fmtDuration(left)}`}>
      <p className="c0-wsheet__note">
        C0LONY made the top 10, and the community vote decides the winner. Burn a little $WIF to vote, right here in the game. Every WIF is one vote.
      </p>
      <Button variant="wif" fullWidth onClick={() => { done(); openVote(); }}>Vote for C0LONY</Button>
      <Button variant="paper" fullWidth onClick={done}>Not now</Button>
    </Modal>
  );
}

/** A strip on every tab while the vote is open. */
export function VoteBanner() {
  const session = useSession();
  const now = useNow(30_000);
  const left = voteLeft(now);
  if (!VOTE || left <= 0 || !session.address) return null;
  return (
    <div className="c0-votebar" role="status">
      <div className="c0-votebar__text">
        <strong>{left <= LAST_HOUR ? "Last hour to vote" : "Final vote is on"}</strong>
        <Hand size={16}>C0LONY is in the World is Flat final · closes in {fmtDuration(left)}</Hand>
      </div>
      <Button variant="wif" size="compact" onClick={openVote}>Vote for C0LONY</Button>
    </div>
  );
}
