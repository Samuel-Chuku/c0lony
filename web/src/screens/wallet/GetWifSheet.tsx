"use client";
// The "Get WIF" sheet. Mainnet: ETH to WIF through KyberSwap (0.5% fee to the treasury). Testnet: free mint.
import { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import { BottomSheet, Button, Chip, ChipRow } from "../../ui";
import { NETWORK, NETWORK_NAME } from "../../config";
import { fmtEth, fmtWif } from "../../lib/format";
import { usePrices, useGameConfig, WIF } from "../../lib/game";
import { useSession } from "../../lib/session";
import { txUrl } from "../../lib/chain";
import { useAction } from "../../lib/tx";
import { buildSwap, FEE_BPS, getQuote, type Quote } from "./kyber";
import "./wallet.css";

const mintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;
const FAUCET = "https://faucet.testnet.chain.robinhood.com"; // recorded in docs/DEPLOYMENTS.md
const HIGH_IMPACT = 3;

export function GetWifSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Get WIF">
      {NETWORK_NAME === "mainnet" ? <Swap /> : <Mint />}
    </BottomSheet>
  );
}

function Mint() {
  const session = useSession();
  const mint = useAction("Minting");
  return (
    <div className="c0-wsheet">
      <p className="c0-wsheet__note">Testnet WIF is free.</p>
      <Button
        variant="paper"
        fullWidth
        busy={mint.busy ? "Minting…" : undefined}
        disabledReason={session.address ? undefined : "Sign in to mint"}
        error={mint.error}
        onClick={() =>
          void mint.run((client) =>
            client.writeContract({ address: WIF, abi: mintAbi, functionName: "mint", args: [client.account.address, 10_000n * 10n ** 18n] }),
          )
        }
      >
        Mint 10,000 test WIF
      </Button>
      {mint.hash ? <a className="c0-wsheet__note" href={txUrl(mint.hash)} target="_blank" rel="noreferrer">Minted · view transaction</a> : null}
      <p className="c0-wsheet__note">Testnet ETH for gas comes from the founder drip after you found a colony. You can also use the <a href={FAUCET} target="_blank" rel="noreferrer">Robinhood Chain testnet faucet</a>.</p>
    </div>
  );
}

function Swap() {
  const session = useSession();
  const prices = usePrices(session.address);
  const cfg = useGameConfig();
  const swap = useAction("Swap");
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
