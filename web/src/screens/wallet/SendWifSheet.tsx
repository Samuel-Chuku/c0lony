"use client";
// Send WIF to a colony: another player's colony name, X handle or wallet address. A plain WIF transfer from the
// game wallet (no burn, nothing to the pot). The sheet shows who it resolved to, with the address, before the
// button works, and checks the name again right before sending in case it changed hands.
import { useEffect, useMemo, useState } from "react";
import { erc20Abi, parseUnits, type Address } from "viem";
import { Avatar, BottomSheet, Button, Chip, ChipRow, Wif } from "../../ui";
import { NETWORK } from "../../config";
import { publicClient } from "../../lib/chain";
import { Status, WIF, useBalances, useColonies, useProfile } from "../../lib/game";
import { displayName, fmtInt, fmtWif, shortAddress } from "../../lib/format";
import { cleanQuery, findRecipient, type Recipient } from "../../lib/recipient";
import { showResult } from "../../lib/result";
import { useSession } from "../../lib/session";
import { invalidate } from "../../lib/store";
import { reasonOf, walletClientFor } from "../../lib/tx";
import { useXProfile } from "../../lib/useXProfile";
import { Handle } from "../live/feedText";
import "./wallet.css";

const PRESETS = [100, 500, 1000];

function parseWif(text: string): bigint | null {
  const t = text.trim();
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  try {
    return parseUnits(t, 18);
  } catch {
    return null;
  }
}
const plain = (wei: bigint) => {
  const s = (Number(wei) / 1e18).toFixed(18).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" ? "0" : s;
};

type Lookup = { state: "idle" | "looking" | "none" | "error" } | { state: "found"; r: Recipient };

export function SendWifSheet({ open, onClose, to: preset }: { open: boolean; onClose: () => void; to?: string }) {
  const session = useSession();
  const me = session.address;
  const balances = useBalances(me);
  const colonies = useColonies();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setTo(preset ?? ""); setAmount(""); setError(null); setBusy(false); }
  }, [open, preset]);

  // Resolve what was typed, 400 ms after the last keystroke.
  const query = cleanQuery(to);
  useEffect(() => {
    if (!open || !query) { setLookup({ state: "idle" }); return; }
    let live = true;
    setLookup({ state: "looking" });
    const t = setTimeout(() => {
      findRecipient(query, colonies.data)
        .then((r) => { if (live) setLookup(r ? { state: "found", r } : { state: "none" }); })
        .catch(() => { if (live) setLookup({ state: "error" }); });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [open, query, colonies.data]);

  const recipient = lookup.state === "found" ? lookup.r : null;
  const wif = balances.data?.wif ?? null;
  const eth = balances.data?.eth ?? null;
  const value = parseWif(amount);

  let problem: string | null = null;
  if (lookup.state === "none") problem = "No colony goes by that name. Check the spelling, or paste their wallet address.";
  else if (lookup.state === "error") problem = "Couldn't look that up right now. Try again in a moment.";
  else if (recipient && me && recipient.address === me.toLowerCase()) problem = "That's you. Pick another colony.";
  else if (amount.trim() && (value === null || value <= 0n)) problem = "Enter an amount above zero.";
  else if (value !== null && wif !== null && value > wif) problem = `You have ${fmtWif(wif)} WIF. Lower the amount or buy more.`;
  else if (eth !== null && eth === 0n) problem = "You need a little ETH for gas. Add funds from the menu.";

  const ready = !!me && !!recipient && value !== null && value > 0n && !problem;

  async function send() {
    if (!ready || !recipient || value === null || !session.wallet) return;
    setBusy(true);
    setError(null);
    try {
      // A name or handle can move to another wallet; check it still points where the card says.
      if (recipient.via !== "address") {
        const again = await findRecipient(query, colonies.data);
        if (!again || again.address !== recipient.address) {
          setLookup(again ? { state: "found", r: again } : { state: "none" });
          setError("That name now points to a different wallet. Check the card and send again.");
          return;
        }
      }
      const client = await walletClientFor(session.wallet);
      const hash = await client.writeContract({ address: WIF, abi: erc20Abi, functionName: "transfer", args: [recipient.address as Address, value] });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      void invalidate();
      onClose();
      showResult({
        title: "WIF sent",
        tone: "wif",
        art: "gift",
        lines: [<>Sent <Wif>{fmtWif(value)}</Wif> to <Handle addr={recipient.address} /></>, "It's in their wallet now. They'll get an alert."],
        hash,
      });
    } catch (e) {
      setError(`Not sent · ${reasonOf(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const paste = async () => {
    try { setTo((await navigator.clipboard.readText()).trim()); } catch { /* clipboard blocked */ }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Send WIF to a colony">
      <div className="c0-wsheet">
        <div className="c0-wd__label"><span>To</span><span>colony name, @handle or 0x address</span></div>
        <div className="c0-wsheet__input">
          <input
            className="c0-wd__addr" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="@name or 0x…" aria-label="Who to send to"
            value={to} onChange={(e) => setTo(e.target.value)}
          />
          <button type="button" className="c0-wd__mini" onClick={() => void paste()}>Paste</button>
        </div>
        {lookup.state === "looking" ? <p className="c0-wsheet__note">Looking them up…</p> : null}
        {recipient && !(me && recipient.address === me.toLowerCase()) ? <RecipientCard addr={recipient.address} /> : null}

        <div className="c0-wd__label"><span>Amount</span><span>You have {wif === null ? "…" : fmtWif(wif)} WIF</span></div>
        <div className="c0-wsheet__input">
          <input
            inputMode="decimal" autoComplete="off" placeholder="0" aria-label="Amount of WIF"
            value={amount} onChange={(e) => setAmount(e.target.value)}
          />
          <span>WIF</span>
        </div>
        <ChipRow>
          {PRESETS.map((n) => <Chip key={n} selected={amount === String(n)} onClick={() => setAmount(String(n))}>{fmtInt(n)}</Chip>)}
          <Chip selected={wif !== null && amount === plain(wif) && wif > 0n} onClick={() => wif !== null && setAmount(plain(wif))}>Max</Chip>
        </ChipRow>
        {problem ? <div className="c0-blocked" role="alert">{problem}</div> : null}
        <p className="c0-wsheet__note">Straight from your game wallet on {NETWORK.name}. Nothing is burned. Sends can&apos;t be undone.</p>
        <Button variant="wif" fullWidth busy={busy ? "Sending…" : undefined} disabled={!ready} onClick={() => void send()}>
          {value !== null && value > 0n ? `Send · ${fmtWif(value)} WIF` : "Send WIF"}
        </Button>
        {error ? <div className="c0-blocked" role="alert">{error}</div> : null}
        <button type="button" className="c0-wd__cancel" onClick={onClose}>Cancel</button>
      </div>
    </BottomSheet>
  );
}

/** Who the WIF goes to: picture, name, full address, and their colony this season. */
function RecipientCard({ addr }: { addr: string }) {
  const x = useXProfile(addr);
  const profile = useProfile(addr).data;
  const colonies = useColonies().data;
  const rank = useMemo(() => {
    if (!colonies) return null;
    const sorted = [...colonies].sort((a, b) => (a.score === b.score ? (a.id < b.id ? -1 : 1) : a.score > b.score ? -1 : 1));
    const i = sorted.findIndex((r) => r.owner === addr);
    return i >= 0 ? i + 1 : null;
  }, [colonies, addr]);
  const none = profile && profile.colonyId === 0n;
  const state = !profile ? "…" : none ? null
    : profile.status === Status.Alive ? "alive" : profile.status === Status.Starving ? "starving" : "collapsed";
  return (
    <div className="c0-sendto">
      <div className="c0-sendto__who">
        <Avatar size={40} src={x?.xAvatar ?? null} address={addr} alt={displayName(addr, x)} />
        <div className="c0-sendto__text">
          <span className="c0-sendto__name">{displayName(addr, x)}</span>
          <span className="c0-sendto__addr">{addr}</span>
          {state ? (
            <span className="c0-sendto__meta">
              {state}{profile ? ` · ${fmtInt(profile.ants)} ants` : ""}{rank ? ` · rank #${rank}` : ""}
            </span>
          ) : null}
        </div>
      </div>
      {none ? <div className="c0-blocked">No colony here this season. They'll still get the WIF, so check the address is right.</div> : null}
    </div>
  );
}
