"use client";
// The "Get WIF" sheet. Mainnet: ETH to WIF through KyberSwap (0.5% fee to the treasury). Testnet: a daily faucet.
import { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import { BottomSheet, BrandName, Button, Chip, ChipRow } from "../../ui";
import { NETWORK, NETWORK_NAME } from "../../config";
import { fmtDuration, fmtEth, fmtWif } from "../../lib/format";
import { usePrices, useGameConfig, useNow } from "../../lib/game";
import { useSession } from "../../lib/session";
import { txUrl } from "../../lib/chain";
import { gasProgressLabel, useStarterGas } from "../../lib/starterGas";
import { invalidate } from "../../lib/store";
import { showResult } from "../../lib/result";
import { useAction } from "../../lib/tx";
import { buildSwap, FEE_BPS, getQuote, type Quote } from "./kyber";
import "./wallet.css";

const FAUCET = "https://faucet.testnet.chain.robinhood.com"; // recorded in docs/DEPLOYMENTS.md
const HIGH_IMPACT = 3;

export function GetWifSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Get WIF">
      {NETWORK_NAME === "mainnet" ? <Swap /> : <Mint />}
    </BottomSheet>
  );
}

// Testnet faucet: the keeper mints 10,000 test WIF to the player's wallet, once a day per wallet. The player pays
// no gas for it, and the app never calls the token's open mint directly, so the daily limit holds.
const FAUCET_KEY = (wallet: string) => `c0lony:faucet:${wallet}`;

function Mint() {
  const session = useSession();
  const now = useNow();
  const gas = useStarterGas();
  const gasLabel = gasProgressLabel(gas);
  const [nextAt, setNextAt] = useState(0);
  const [state, setState] = useState<"idle" | "asking" | "coming" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session.address) setNextAt(Number(localStorage.getItem(FAUCET_KEY(session.address)) ?? 0));
  }, [session.address]);

  // While a mint is on its way, refresh balances every 5 s for up to a minute.
  useEffect(() => {
    if (state !== "coming") return;
    const id = setInterval(() => void invalidate("balances:"), 5000);
    const stop = setTimeout(() => setState("idle"), 60_000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [state]);

  const ask = async () => {
    if (!session.address) return;
    setState("asking");
    setMessage(null);
    try {
      const token = await session.getToken();
      const res = await fetch("/api/wif/faucet", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet: session.address }),
      });
      const body = (await res.json().catch(() => ({}))) as { status?: string; nextAt?: number; message?: string; error?: string };
      if (!res.ok) throw new Error(body.error || `The server answered ${res.status}.`);
      if (body.nextAt) {
        localStorage.setItem(FAUCET_KEY(session.address), String(body.nextAt));
        setNextAt(body.nextAt);
      }
      setMessage(body.message ?? null);
      showResult({ title: body.status === "queued" ? "Test WIF is on its way" : "Test WIF", lines: [body.message ?? "10,000 test WIF will reach your wallet in a few seconds."] });
      setState(body.status === "queued" ? "coming" : "idle");
    } catch (err) {
      const why = err instanceof Error ? err.message : "The faucet didn't answer. Try again.";
      setMessage(why);
      showResult({ title: "Getting test WIF failed", failed: true, lines: [why] });
      setState("error");
    }
  };

  const wait = nextAt > now ? nextAt - now : 0;
  return (
    <div className="c0-wsheet">
      <p className="c0-wsheet__note">Testnet WIF is free: 10,000 once a day. <BrandName /> pays the gas.</p>
      {gasLabel ? (
        <div className="c0-underway" role="status"><div className="c0-underway__bar" aria-hidden="true" /><span>{gasLabel}</span></div>
      ) : null}
      {state === "coming" ? (
        <div className="c0-underway" role="status"><div className="c0-underway__bar" aria-hidden="true" /><span>10,000 test WIF on its way · a few seconds</span></div>
      ) : null}
      <Button
        variant="paper"
        fullWidth
        busy={state === "asking" ? "Asking…" : undefined}
        disabledReason={!session.address ? "Sign in to get test WIF" : wait > 0 && state !== "coming" ? `Next test WIF in ${fmtDuration(wait)}` : undefined}
        error={state === "error" ? `Getting test WIF failed · ${message}` : undefined}
        onClick={() => void ask()}
      >
        Get 10,000 test WIF
      </Button>
      {message && state !== "error" ? <p className="c0-wsheet__note">{message}</p> : null}
      <p className="c0-wsheet__note">New wallets get a little testnet ETH for gas automatically. You can also use the <a href={FAUCET} target="_blank" rel="noreferrer">Robinhood Chain testnet faucet</a>.</p>
    </div>
  );
}

function Swap() {
  const session = useSession();
  const prices = usePrices(session.address);
  const cfg = useGameConfig();
  const swap = useAction("Swap", { success: { title: "WIF bought", lines: ["The swap landed. Your WIF balance updates in a few seconds."] } });
  const [eth, setEth] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [sError, setSError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [armed, setArmed] = useState(false);
  const [preset, setPreset] = useState<"week" | "found" | null>(null);

  const wei = (() => {
    try {
      return eth ? parseEther(eth) : 0n;
    } catch {
      return 0n;
    }
  })();

  useEffect(() => {
    setArmed(false);
    setSError(null);
    setQError(null);
    setQuote(null);
    if (wei <= 0n) return;
    const ctl = new AbortController();
    setQuoting(true);
    const t = setTimeout(() => {
      getQuote(wei, ctl.signal)
        .then((q) => setQuote(q))
        .catch((e: unknown) => {
          if (!ctl.signal.aborted) setQError(e instanceof Error ? e.message : "The swap service didn't answer. Try again in a moment.");
        })
        .finally(() => !ctl.signal.aborted && setQuoting(false));
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
      setQuoting(false);
    };
  }, [wei]);

  // Preset: probe the rate with 0.001 ETH, then size the ETH amount for the target WIF with 5% headroom.
  async function pick(kind: "week" | "found") {
    if (!prices.data || !cfg.data) return;
    setPreset(kind);
    setQError(null);
    const target = kind === "week" ? 7n * prices.data.feed : prices.data.found + 7n * prices.data.feed;
    try {
      const probeIn = parseEther("0.001");
      const probe = await getQuote(probeIn);
      if (probe.amountOut === 0n) throw new Error("No route for that amount right now. Try a different amount.");
      const need = (target * probeIn * 105n) / (probe.amountOut * 100n) + 1n;
      setEth(formatEther(need));
    } catch (e) {
      setQError(e instanceof Error ? e.message : "The swap service didn't answer. Try again in a moment.");
    }
  }

  const impact = quote?.impactPct ?? null;
  const high = impact !== null && impact > HIGH_IMPACT;
  const fee = (wei * BigInt(FEE_BPS)) / 10_000n;

  async function go() {
    if (!quote || !session.wallet || !session.address) return;
    if (high && !armed) {
      setArmed(true);
      return;
    }
    setBuilding(true);
    setSError(null);
    try {
      const tx = await buildSwap(quote, session.address);
      setBuilding(false);
      await swap.run((client) => client.sendTransaction({ to: tx.to, data: tx.data, value: tx.value }));
    } catch (e) {
      setBuilding(false);
      setSError(e instanceof Error ? e.message : "The swap service didn't answer. Try again in a moment.");
    }
  }

  const reason = !session.address ? "Sign in to buy WIF" : !NETWORK.contracts.treasury ? "Buying WIF opens soon" : wei <= 0n ? "Enter an ETH amount" : null;

  return (
    <div className="c0-wsheet">
      <ChipRow>
        <Chip selected={preset === "found"} onClick={() => void pick("found")}>Found + one week</Chip>
        <Chip selected={preset === "week"} onClick={() => void pick("week")}>One week of feeding</Chip>
      </ChipRow>
      <label className="c0-wsheet__input">
        <input inputMode="decimal" placeholder="0.00" aria-label="ETH to spend" value={eth} onChange={(e) => { setPreset(null); setEth(e.target.value.replace(/[^0-9.]/g, "")); }} />
        <span>ETH</span>
      </label>
      {quoting ? <div className="c0-underway" role="status"><div className="c0-underway__bar" aria-hidden="true" /><span>Finding the best price…</span></div> : null}
      {quote ? (
        <dl className="c0-wsheet__rows">
          <div><dt>You get</dt><dd className="c0-wsheet__wif">{fmtWif(quote.amountOut)} WIF</dd></div>
          <div><dt>Fee (0.5%)</dt><dd>{fmtEth(fee)} ETH</dd></div>
          <div><dt>Price impact</dt><dd>{impact === null ? "unknown" : `${impact.toFixed(2)}%`}</dd></div>
        </dl>
      ) : null}
      {high ? (
        <div className="c0-blocked" role="alert">
          Price impact is {impact!.toFixed(1)}%. You lose a lot of value at this size. {armed ? "Tap again to swap anyway." : "Try a smaller amount."}
        </div>
      ) : null}
      {qError ? <div className="c0-blocked" role="alert">{qError}</div> : null}
      <Button
        variant="wif"
        fullWidth
        busy={building || swap.busy ? "Swapping…" : undefined}
        disabledReason={reason ?? (quote ? undefined : quoting ? "Finding the best price" : "No price yet")}
        error={sError ?? swap.error}
        onClick={() => void go()}
      >
        {armed ? "Swap anyway" : "Get WIF"}
      </Button>
      {swap.hash ? <a className="c0-wsheet__note" href={txUrl(swap.hash)} target="_blank" rel="noreferrer">Swapped · view transaction</a> : null}
      <p className="c0-wsheet__note">Prefer another route? <a href="https://jumper.exchange/" target="_blank" rel="noreferrer">Bridge ETH in with LI.FI</a></p>
    </div>
  );
}
