"use client";
// Send ETH or WIF from the game wallet to any address on the game's network.
import { useEffect, useState } from "react";
import { erc20Abi, isAddress, parseEther, parseUnits, type Address } from "viem";
import { BottomSheet, Button, Chip, ChipRow } from "../../ui";
import { NETWORK } from "../../config";
import { publicClient } from "../../lib/chain";
import { WIF, useBalances } from "../../lib/game";
import { fmtEth, fmtWif } from "../../lib/format";
import { showResult } from "../../lib/result";
import { useSession } from "../../lib/session";
import { invalidate } from "../../lib/store";
import { reasonFor, walletClientFor } from "../../lib/tx";
import "./wallet.css";

type Asset = "ETH" | "WIF";
const GAS_RESERVE = 50_000_000_000_000n; // 0.00005 ETH kept back by MAX

function parseAmount(text: string, asset: Asset): bigint | null {
  const t = text.trim();
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  try {
    return asset === "ETH" ? parseEther(t) : parseUnits(t, 18);
  } catch {
    return null;
  }
}
const plain = (wei: bigint) => {
  const s = (Number(wei) / 1e18).toFixed(18).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" ? "0" : s;
};

export function WithdrawSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const me = session.address;
  const balances = useBalances(me);
  const [asset, setAsset] = useState<Asset>("ETH");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setAmount(""); setTo(""); setError(null); setBusy(false); }
  }, [open]);

  const balance = balances.data ? (asset === "ETH" ? balances.data.eth : balances.data.wif) : null;
  const balanceText = balance === null ? "…" : asset === "ETH" ? fmtEth(balance) : fmtWif(balance);

  const toTrim = to.trim();
  const value = parseAmount(amount, asset);
  let problem: string | null = null;
  if (toTrim && !isAddress(toTrim)) problem = "That isn't a valid address. Check it and try again.";
  else if (toTrim && me && toTrim.toLowerCase() === me.toLowerCase()) problem = "That's your own address. Paste the address you want to send to.";
  else if (amount.trim() && (value === null || value <= 0n)) problem = "Enter an amount above zero.";
  else if (value !== null && balance !== null && value > balance) problem = `You only have ${balanceText} ${asset}. Lower the amount.`;
  else if (value !== null && asset === "ETH" && balance !== null && value + GAS_RESERVE > balance && value <= balance) problem = "Leave about 0.00005 ETH for gas. Lower the amount or tap Max.";

  const ready = !!me && value !== null && value > 0n && isAddress(toTrim) && !problem;

  const max = () => {
    if (balance === null) return;
    const v = asset === "ETH" ? (balance > GAS_RESERVE ? balance - GAS_RESERVE : 0n) : balance;
    setAmount(plain(v));
  };
  const paste = async () => {
    try { setTo((await navigator.clipboard.readText()).trim()); } catch {}
  };

  async function send() {
    if (!ready || value === null || !session.wallet) return;
    setBusy(true);
    setError(null);
    try {
      const client = await walletClientFor(session.wallet);
      const dest = toTrim as Address;
      const hash = asset === "ETH"
        ? await client.sendTransaction({ to: dest, value })
        : await client.writeContract({ address: WIF, abi: erc20Abi, functionName: "transfer", args: [dest, value] });
      await publicClient.waitForTransactionReceipt({ hash });
      void invalidate();
      onClose();
      showResult({
        title: "Sent",
        lines: [`${plain(value)} ${asset} sent to ${toTrim.slice(0, 6)}…${toTrim.slice(-4)}.`],
        tone: asset === "WIF" ? "wif" : "plain",
        hash,
      });
    } catch (e) {
      setError(`Not sent · ${await reasonFor(e, (session.wallet?.address as `0x${string}` | undefined) ?? null)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Withdraw">
      <div className="c0-wsheet">
        <ChipRow>
          <Chip selected={asset === "ETH"} onClick={() => { setAsset("ETH"); setAmount(""); }}>ETH</Chip>
          <Chip selected={asset === "WIF"} onClick={() => { setAsset("WIF"); setAmount(""); }}>WIF</Chip>
        </ChipRow>
        <div className="c0-wd__label"><span>Amount</span><span>Balance {balanceText} {asset}</span></div>
        <div className="c0-wsheet__input">
          <input
            inputMode="decimal" autoComplete="off" placeholder="0" aria-label={`Amount of ${asset}`}
            value={amount} onChange={(e) => setAmount(e.target.value)}
          />
          <button type="button" className="c0-wd__mini" onClick={max}>Max</button>
        </div>
        <div className="c0-wd__label"><span>To</span></div>
        <div className="c0-wsheet__input">
          <input
            className="c0-wd__addr" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="0x…" aria-label="Destination address"
            value={to} onChange={(e) => setTo(e.target.value)}
          />
          <button type="button" className="c0-wd__mini" onClick={() => void paste()}>Paste</button>
        </div>
        {problem ? <div className="c0-blocked" role="alert">{problem}</div> : null}
        <p className="c0-wsheet__note">Sent from your game wallet on {NETWORK.name}. Withdrawals can&apos;t be undone.</p>
        <Button variant={asset === "WIF" ? "wif" : "paper"} fullWidth busy={busy ? "Sending…" : undefined} disabled={!ready} onClick={() => void send()}>
          Send {asset}
        </Button>
        {error ? <div className="c0-blocked" role="alert">{error}</div> : null}
        <button type="button" className="c0-wd__cancel" onClick={onClose}>Cancel</button>
      </div>
    </BottomSheet>
  );
}
