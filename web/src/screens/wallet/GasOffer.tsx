"use client";
// Swap WIF for gas: a small offer shown only in the result of an action that failed because the wallet has no ETH
// left. The player can take it or say "No thanks" (hidden on this device for a day).
import { useState } from "react";
import { Button, Hand } from "../../ui";
import { Wif } from "../../ui/Wif";
import { fmtEth, fmtWif } from "../../lib/format";
import { txUrl } from "../../lib/chain";
import { COURIER, useCourierConfig } from "../../lib/courier";
import { buyGasPack, decline, declinedRecently, RAID_GAS, STEP_LABEL } from "../../lib/gasPack";
import { closeResult } from "../../lib/result";
import { useQuery } from "../../lib/store";
import { publicClient } from "../../lib/chain";
import { useSession } from "../../lib/session";

export function GasOffer() {
  const session = useSession();
  const cfg = useCourierConfig().data;
  const gasPrice = useQuery("gasPrice", () => publicClient.getGasPrice(), 60_000).data;
  const [hidden, setHidden] = useState(() => declinedRecently());
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ gasTx: string | null } | null>(null);

  if (!COURIER || hidden || !session.wallet || !cfg?.enabled || !cfg.gasPack) return null;
  const price = BigInt(cfg.gasPack.wif);
  const fee = BigInt(cfg.fee);
  const wei = BigInt(cfg.gasPack.wei);
  const raids = gasPrice && gasPrice > 0n ? Number(wei / (gasPrice * RAID_GAS)) : null;

  if (done) {
    return (
      <div className="c0-gasoffer">
        <p className="c0-result__line">Gas topped up · {fmtEth(wei)} ETH {done.gasTx ? "is in your wallet" : "is on its way"}. Try that again now.</p>
        {done.gasTx ? <a className="c0-result__tx" href={txUrl(done.gasTx as `0x${string}`)} target="_blank" rel="noreferrer">View the top-up</a> : null}
      </div>
    );
  }

  async function swap() {
    if (!session.wallet || !cfg) return;
    setError(null);
    try {
      const r = await buyGasPack(session.wallet, cfg, session.getToken, (s) => setBusy(STEP_LABEL[s]));
      setDone({ gasTx: r.gasTx });
    } catch (e) {
      setError(`Not swapped · ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="c0-gasoffer">
      <Hand size={15}>or swap some WIF for gas, no ETH needed</Hand>
      <p className="c0-result__line">
        Get {fmtEth(wei)} ETH{raids ? `, about ${raids} raids' worth` : ""} for <Wif>{fmtWif(price + fee)}</Wif> ({fmtWif(fee)} WIF fee included).
      </p>
      <Button variant="wif" fullWidth busy={busy} error={error ?? undefined} onClick={swap}>
        Swap {fmtWif(price)} WIF for gas
      </Button>
      {busy ? null : (
        <Button variant="paper" fullWidth onClick={() => { decline(); setHidden(true); closeResult(); }}>
          No thanks
        </Button>
      )}
    </div>
  );
}
