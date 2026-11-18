"use client";
// Get WIF from another chain (LI.FI): pick a chain and a token, see the WIF you get, sign on that chain, and the
// WIF lands in the same wallet on Robinhood Chain. A transfer in flight is tracked through reloads.
import { useEffect, useRef, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { Button, Wif } from "../../ui";
import { CROSS_CHAIN } from "../../config";
import { fmtWif, shortAddress } from "../../lib/format";
import { useSession } from "../../lib/session";
import { invalidate } from "../../lib/store";
import { showResult } from "../../lib/result";
import { reasonOf } from "../../lib/tx";
import { play } from "../../lib/sound";
import { addressUrl } from "../../lib/chain";
import {
  balanceOf, explorerTx, getLifiQuote, lifiStatus, loadPending, NATIVE, savePending, sendLifi,
  type CrossChain as Src, type CrossToken, type LifiQuote, type Pending, type SendStep,
} from "../../lib/lifi";

const CHAIN_FILE: Record<number, string> = { 1: "ethereum", 10: "optimism", 56: "bsc", 130: "unichain", 143: "monad", 999: "hyperevm", 5042: "arc", 8453: "base", 42161: "arbitrum" };
const chainLogo = (id: number) => `/xchain/chain-${CHAIN_FILE[id]}.svg`;
const tokenLogo = (symbol: string) => symbol === "USDT0" ? "/xchain/token-usdt0.png" : `/xchain/token-${symbol.toLowerCase()}.svg`;

const STEP: Record<SendStep, string> = { switching: "Switching network…", approving: "Approving…", sending: "Sending…" };

function parseAmount(text: string, decimals: number): bigint {
  const t = text.trim();
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return 0n;
  try { return parseUnits(t, decimals); } catch { return 0n; }
}
const show = (v: bigint, decimals: number) => {
  const n = Number(formatUnits(v, decimals));
  return n === 0 ? "0" : n < 0.0001 ? "<0.0001" : n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 4 });
};

export function CrossChainSwap() {
  const session = useSession();
  const me = session.address as Address | null;
  const [src, setSrc] = useState<Src>(CROSS_CHAIN.chains[0]);
  const [token, setToken] = useState<CrossToken>(CROSS_CHAIN.chains[0].tokens[1] ?? CROSS_CHAIN.chains[0].tokens[0]);
  const [text, setText] = useState("");
  const [bal, setBal] = useState<bigint | null>(null);
  const [quote, setQuote] = useState<LifiQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [step, setStep] = useState<SendStep | null>(null);
  const [sError, setSError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState<"chain" | "token" | null>("chain");
  const [listBal, setListBal] = useState<Record<string, bigint | null>>({});
  const amount = parseAmount(text, token.decimals);

  // a transfer from an earlier visit keeps being tracked
  useEffect(() => { if (me) setPending(loadPending(me)); }, [me]);

  useEffect(() => {
    setBal(null);
    if (!me) return;
    let live = true;
    balanceOf(src, token, me).then((b) => live && setBal(b)).catch(() => live && setBal(null));
    return () => { live = false; };
  }, [src, token, me, pending]);

  useEffect(() => {
    setQuote(null); setQError(null); setSError(null);
    if (!me || amount <= 0n) return;
    const ctl = new AbortController();
    setQuoting(true);
    const t = setTimeout(() => {
      getLifiQuote(src, token, amount, me, ctl.signal)
        .then(setQuote)
        .catch((e: unknown) => { if (!ctl.signal.aborted) setQError(e instanceof Error ? e.message : "No route right now. Try again."); })
        .finally(() => !ctl.signal.aborted && setQuoting(false));
    }, 500);
    const refresh = setInterval(() => { // keep the quote fresh while they look at it
      getLifiQuote(src, token, amount, me).then(setQuote).catch(() => {});
    }, 30_000);
    return () => { clearTimeout(t); clearInterval(refresh); ctl.abort(); setQuoting(false); };
  }, [src, token, amount, me]);

  // follow the transfer until the WIF lands
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    if (!pending || !me) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const s = await lifiStatus(pending.hash, pending.fromChain);
        if (s.state === "pending") return;
        stop = true;
        savePending(me, null);
        setPending(null);
        void invalidate("balances:");
        if (s.state === "done") {
          play("done");
          showResult({ title: "WIF arrived", tone: "wif", lines: [<><Wif>+{fmtWif(s.receivedAmount)}</Wif> landed in your wallet from {pending.chainName}.</>], hash: (s.receivedTx as `0x${string}` | null) ?? null });
        } else if (s.state === "partial") {
          showResult({ title: "Arrived as another token", lines: [`The bridge delivered ${s.receivedSymbol} instead of WIF on Robinhood Chain. It's in your wallet; swap it for WIF with ETH on Robinhood.`] });
        } else {
          showResult({ title: s.state === "refunded" ? "Refunded" : "The transfer failed", failed: true, lines: [s.state === "refunded" ? `The bridge couldn't finish, so it sent your funds back on ${pending.chainName}.` : `The bridge reported a failure. Check the transfer on ${pending.chainName}; if funds left your wallet they are refunded there.`] });
        }
      } catch { /* try again on the next tick */ }
    };
    void tick();
    const id = setInterval(() => void tick(), 5000);
    return () => { stop = true; clearInterval(id); };
  }, [pending, me]);

  // balances of every coin on the chosen chain, for the coin list
  useEffect(() => {
    if (picking !== "token" || !me) return;
    let live = true;
    setListBal({});
    for (const t of src.tokens) {
      balanceOf(src, t, me).then((b) => live && setListBal((m) => ({ ...m, [t.symbol]: b }))).catch(() => live && setListBal((m) => ({ ...m, [t.symbol]: null })));
    }
    return () => { live = false; };
  }, [picking, src, me]);

  const pickChain = (c: Src) => { setSrc(c); setPicking(c.tokens.length === 1 ? null : "token"); if (c.tokens.length === 1) setToken(c.tokens[0]); setText(""); };
  const pickToken = (t: CrossToken) => { setToken(t); setPicking(null); setText(""); };
  const max = () => {
    if (bal === null) return;
    const v = token.address === NATIVE ? (bal * 97n) / 100n : bal; // leave a little of the gas token for gas
    setText(formatUnits(v, token.decimals));
  };

  async function go() {
    if (!quote || !session.wallet || !me) return;
    setSError(null);
    try {
      const fresh = await getLifiQuote(src, token, amount, me); // re-quote right before signing
      setQuote(fresh);
      const hash = await sendLifi(session.wallet, fresh, setStep);
      const p: Pending = { hash, fromChain: src.id, chainName: src.name, at: Date.now(), expected: fresh.toAmount.toString() };
      savePending(me, p);
      setPending(p);
      setText("");
    } catch (e) {
      const r = reasonOf(e);
      setSError(`Not sent · ${e instanceof Error && /safety|route|small/i.test(e.message) ? e.message : r}`);
      play("fail");
    } finally {
      setStep(null);
    }
  }

  const reason = !me ? "Sign in to get WIF"
    : pending ? "A transfer is on its way"
    : amount <= 0n ? `Enter an amount of ${token.symbol}`
    : bal !== null && amount > bal ? `Not enough ${token.symbol} on ${src.name}`
    : null;
  const empty = bal !== null && bal === 0n;

  return (
    <div className="c0-wsheet">
      {pending ? (
        <div className="c0-underway" role="status">
          <div className="c0-underway__bar" aria-hidden="true" />
          <span>
            On its way from {pending.chainName} · usually under a minute.{" "}
            <a href={explorerTx(pending.fromChain, pending.hash)} target="_blank" rel="noreferrer">View the transfer</a>
          </span>
        </div>
      ) : null}

      {picking === "chain" ? (
        <>
          <div className="c0-wd__label"><span>Step 1 · pick the chain your coins are on</span></div>
          <div className="c0-xpick__chains">
            {CROSS_CHAIN.chains.map((c) => (
              <button key={c.id} type="button" className="c0-xpick__chain" onClick={() => pickChain(c)}>
                <img src={chainLogo(c.id)} alt="" width={36} height={36} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : picking === "token" ? (
        <>
          <div className="c0-xpick__head">
            <button type="button" className="c0-wd__mini" onClick={() => setPicking("chain")}>‹ Chains</button>
            <img src={chainLogo(src.id)} alt="" width={24} height={24} />
            <span>Step 2 · pick a coin on {src.name}</span>
          </div>
          <div className="c0-xpick__tokens">
            {src.tokens.map((t) => (
              <button key={t.symbol} type="button" className="c0-xpick__token" onClick={() => pickToken(t)}>
                <img src={tokenLogo(t.symbol)} alt="" width={36} height={36} />
                <span className="c0-xpick__sym">{t.symbol}{t.address === NATIVE || (src.id === 5042 && t.symbol === "USDC") ? <small> · gas token</small> : null}</span>
                <span className="c0-xpick__bal">{!me ? "" : listBal[t.symbol] === undefined ? "…" : listBal[t.symbol] === null ? "?" : show(listBal[t.symbol]!, t.decimals)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button type="button" className="c0-xpick__picked" onClick={() => setPicking("chain")} aria-label={`Paying with ${token.symbol} on ${src.name}. Change`}>
          <span className="c0-xpick__logo">
            <img src={tokenLogo(token.symbol)} alt="" width={40} height={40} />
            <img className="c0-xpick__badge" src={chainLogo(src.id)} alt="" width={20} height={20} />
          </span>
          <span className="c0-xpick__what"><strong>{token.symbol} on {src.name}</strong><small>gas there: {src.gas}</small></span>
          <span className="c0-xpick__change">Change ›</span>
        </button>
      )}

      {picking ? null : (<>
      <div className="c0-wd__label">
        <span>Amount</span>
        <span>You have {bal === null ? "…" : show(bal, token.decimals)} {token.symbol} on {src.name}</span>
      </div>
      <div className="c0-wsheet__input">
        <input inputMode="decimal" autoComplete="off" placeholder="0" aria-label={`${token.symbol} to spend`}
          value={text} onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))} />
        <span>{token.symbol}</span>
        <button type="button" className="c0-wd__mini" onClick={max} disabled={bal === null || bal === 0n}>Max</button>
      </div>

      {empty && me ? (
        <p className="c0-wsheet__note">
          Your wallet has the same address on {src.name}: {shortAddress(me)}. Send {token.symbol} there first, then come back.{" "}
          <button type="button" className="c0-wd__mini" onClick={() => { void navigator.clipboard?.writeText(me).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
            {copied ? "Copied" : "Copy address"}
          </button>
        </p>
      ) : null}

      {quoting ? <div className="c0-underway" role="status"><div className="c0-underway__bar" aria-hidden="true" /><span>Finding a route…</span></div> : null}
      {quote ? (
        <dl className="c0-wsheet__rows">
          <div><dt>You get</dt><dd className="c0-wsheet__wif"><Wif>{fmtWif(quote.toAmount)}</Wif></dd></div>
          <div><dt>At least</dt><dd>{fmtWif(quote.toAmountMin)} WIF</dd></div>
          <div><dt>Route fees</dt><dd>${(quote.feesUsd).toFixed(2)} + gas ${quote.gasUsd.toFixed(3)}</dd></div>
          <div><dt>Arrives in</dt><dd>{quote.seconds <= 60 ? "under a minute" : `about ${Math.ceil(quote.seconds / 60)} min`} · via {quote.tool}</dd></div>
        </dl>
      ) : null}
      {qError ? <div className="c0-blocked" role="alert">{qError}</div> : null}

      </>)}

      {picking ? null : (<>
      <Button variant="wif" fullWidth busy={step ? STEP[step] : undefined}
        disabledReason={reason ?? (quote ? undefined : quoting ? "Finding a route" : "No route yet")}
        error={sError ?? undefined} onClick={() => void go()}>
        Get WIF
      </Button>
      <p className="c0-wsheet__note">
        You sign on {src.name} and need a little {src.gas} there for gas. The WIF arrives in this same wallet on Robinhood Chain. Routed by LI.FI; C0LONY charges nothing.
        {me ? <> Your wallet on Robinhood Chain: <a href={addressUrl(me)} target="_blank" rel="noreferrer">{shortAddress(me)}</a>.</> : null}
      </p>
      </>)}
    </div>
  );
}
