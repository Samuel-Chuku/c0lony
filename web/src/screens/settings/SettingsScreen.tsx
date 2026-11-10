"use client";
import { useExportWallet, useLinkAccount } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { Button, PixelIcon, Switch, withBrand } from "../../ui";
import { Screen } from "../../shell/Screen";
import { useShell } from "../../shell/Providers";
import { useSession } from "../../lib/session";
import { useProfile } from "../../lib/game";
import { useXProfile } from "../../lib/useXProfile";
import { shortAddress } from "../../lib/format";
import {
  currentEndpoint, DEFAULT_PREFS, disablePush, enablePush, isIos, isStandalone, pushSupport, savePushPrefs,
  type PushPrefs, type PushSupport,
} from "../../lib/push";
import { TELEGRAM_ON, tgLinkUrl, tgSavePrefs, tgStatus, tgUnlink } from "../../lib/telegram";
import { WithdrawSheet } from "../wallet/WithdrawSheet";
import { VoterPass } from "./VoterPass";
import { WifGasRow } from "./WifGasRow";
import { IdentityRows } from "./IdentityRows";
import "./settings.css";

const PREFS_KEY = "c0lony:pushPrefs";
const PREF_ROWS: { key: keyof PushPrefs; label: string; hint?: string }[] = [
  { key: "raided", label: "Raided by another player" },
  { key: "result", label: "Raid result is in", hint: "your raids and raids on you" },
  { key: "hungry12", label: "Queen hungry in 12h" },
  { key: "hungry2", label: "Queen hungry in 2h" },
  { key: "forage", label: "Foragers home" },
  { key: "avenge", label: "Free avenge about to expire" },
  { key: "season", label: "Season ending soon" },
  { key: "gift", label: "WIF sent to you", hint: "by another player" },
];

type InstallEvent = Event & { prompt: () => Promise<void> };

function XRow() {
  const session = useSession();
  const x = useXProfile(session.address);
  return (
    <div className="c0-srow">
      <div className="c0-srow__text">
        <span>X account</span>
        <span className="c0-srow__hint">{x?.xHandle ? `@${x.xHandle} · shows on your profile` : "Not linked"}</span>
      </div>
      {session.configured ? <LinkX linked={!!x?.xHandle} /> : null}
    </div>
  );
}
function LinkX({ linked }: { linked: boolean }) {
  const { linkTwitter } = useLinkAccount();
  return <Button variant="paper" size="compact" onClick={() => linkTwitter()}>{linked ? "Change" : "Link"}</Button>;
}

function WalletRow() {
  const session = useSession();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className="c0-srow">
        <div className="c0-srow__text">
          <span>Wallet</span>
          <span className="c0-srow__hint">
            {session.address ? (session.embedded ? "export keys or link your own wallet" : shortAddress(session.address)) : "Sign in to see your wallet"}
          </span>
        </div>
        {session.embedded ? <Button variant="paper" size="compact" onClick={() => setConfirm((c) => !c)}>Manage</Button> : null}
      </div>
      {confirm && session.configured ? <ExportConfirm onDone={() => setConfirm(false)} /> : null}
    </>
  );
}
function ExportConfirm({ onDone }: { onDone: () => void }) {
  const { exportWallet } = useExportWallet();
  return (
    <div className="c0-set__note">
      Exporting shows your private key. Anyone who sees it can take your funds. Only continue if you are alone and want to back it up.
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Button variant="paper" size="compact" onClick={() => { void exportWallet(); onDone(); }}>Show my key</Button>
        <Button variant="paper" size="compact" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function Notifications() {
  const session = useSession();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<PushPrefs>) });
    } catch {}
    const s = pushSupport();
    setSupport(s);
    if (s === "ok") void currentEndpoint().then(setEndpoint).catch(() => {});
  }, []);

  const on = endpoint !== null;
  const canUse = support === "ok" && !!session.address;

  async function master(next: boolean) {
    setError(null);
    setBusy(true);
    try {
      const token = await session.getToken();
      if (!token || !session.address) throw new Error("Sign in first, then try again.");
      if (next) setEndpoint(await enablePush(session.address, token, prefs));
      else {
        await disablePush(token);
        setEndpoint(null);
      }
    } catch (e) {
      setError(`Alerts didn't change · ${e instanceof Error ? e.message : "try again"}`);
    } finally {
      setBusy(false);
    }
  }

  async function pref(key: keyof PushPrefs, v: boolean) {
    const next = { ...prefs, [key]: v };
    setPrefs(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch {}
    if (!endpoint || !session.address) return;
    try {
      const token = await session.getToken();
      if (token) await savePushPrefs(session.address, token, endpoint, next);
    } catch {
      setError("Couldn't save that change. Check your connection and try again.");
    }
  }

  const hint =
    support === "needs-install" ? "On iPhone, alerts work once C0LONY is on your home screen (iOS 16.4 or later). Tap Share, then Add to Home Screen."
    : support === "not-configured" ? "Alerts switch on soon."
    : support === "unsupported" ? "This browser can't receive alerts."
    : !session.address ? "Sign in to turn on alerts."
    : "on this device";

  return (
    <>
      <Switch id="n-master" label="Notifications" hint={withBrand(hint)} checked={on} onChange={(v) => { if (canUse && !busy) void master(v); }} />
      {PREF_ROWS.map((r) => (
        <Switch key={r.key} id={`n-${r.key}`} label={r.label} hint={r.hint} checked={prefs[r.key]} onChange={(v) => void pref(r.key, v)} />
      ))}
      {error ? <div className="c0-blocked" role="alert">{error}</div> : null}
    </>
  );
}

const LINK_FRESH_MS = 10 * 60_000; // the server's start codes last 15 minutes

/** Telegram alerts: one tap opens the bot with a one-time code; pressing Start there links this wallet. */
function TelegramAlerts() {
  const session = useSession();
  const [status, setStatus] = useState<{ linked: boolean; prefs: PushPrefs } | null>(null);
  const [link, setLink] = useState<{ url: string; at: number } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const addr = session.address;
  const chosen = useRef<PushPrefs | null>(null); // switches picked before linking, saved once the link lands

  // Read whether this wallet is linked; when it isn't, have a fresh start link ready so Connect is one tap.
  useEffect(() => {
    if (!TELEGRAM_ON || !addr) return;
    let live = true;
    const load = async () => {
      try {
        const token = await session.getToken();
        if (!token || !live) return;
        const st = await tgStatus(addr, token);
        if (!live) return;
        if (st.linked && chosen.current) {
          const picked = chosen.current;
          chosen.current = null;
          await tgSavePrefs(addr, token, picked).catch(() => {});
          st.prefs = picked;
        }
        setStatus((cur) => (st.linked || !cur ? st : { ...st, prefs: cur.prefs }));
        if (!st.linked && (!link || Date.now() - link.at > LINK_FRESH_MS)) {
          const url = await tgLinkUrl(addr, token, st.prefs);
          if (live) setLink({ url, at: Date.now() });
        }
        if (st.linked) setWaiting(false);
      } catch (e) {
        if (live) setError((e as { status?: number }).status === 404 ? "Telegram alerts aren't switched on yet." : "Couldn't reach the server. Try again shortly.");
      }
    };
    void load();
    // While waiting for Start in Telegram, check every 3s; otherwise refresh the link before it expires.
    const t = setInterval(load, waiting ? 3_000 : LINK_FRESH_MS);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr, waiting]);

  if (!TELEGRAM_ON) {
    return (
      <div className="c0-srow">
        <PixelIcon name="telegram" size={30} />
        <div className="c0-srow__text">
          <span>Telegram alerts</span>
          <span className="c0-srow__hint">Raids, results and a hungry queen, sent to Telegram with a button to act. Opens with the mainnet launch.</span>
        </div>
      </div>
    );
  }

  async function savePref(key: keyof PushPrefs, v: boolean) {
    if (!addr) return;
    const next = { ...(status?.prefs ?? DEFAULT_PREFS), [key]: v };
    setStatus({ linked: !!status?.linked, prefs: next });
    if (!status?.linked) { chosen.current = next; return; }
    try {
      const token = await session.getToken();
      if (token) await tgSavePrefs(addr, token, next);
    } catch {
      setError("Couldn't save that change. Check your connection and try again.");
    }
  }

  async function unlink() {
    if (!addr) return;
    setBusy(true);
    setError(null);
    try {
      const token = await session.getToken();
      if (token) await tgUnlink(addr, token);
      setStatus((s) => (s ? { ...s, linked: false } : s));
      setLink(null);
    } catch {
      setError("Couldn't unlink Telegram. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const linked = !!status?.linked;
  const prefs = status?.prefs ?? DEFAULT_PREFS;
  return (
    <>
      <div className="c0-srow">
        <PixelIcon name="telegram" size={30} />
        <div className="c0-srow__text">
          <span className="c0-tgtitle">Telegram alerts{linked ? <span className="c0-tgon">CONNECTED</span> : null}</span>
          <span className="c0-srow__hint">
            {!addr ? "Sign in to get alerts on Telegram."
              : linked ? "Your alerts arrive in Telegram with a button to act."
              : waiting ? "Press Start in Telegram. This page updates once you do."
              : "Raids, results and a hungry queen on Telegram, with a picture and a button to act."}
          </span>
        </div>
        {addr ? (
          <Button variant="paper" size="compact" aria-expanded={open} aria-controls="tg-drop" onClick={() => setOpen((o) => !o)}>
            {open ? "Done" : linked ? "Choose alerts" : "Connect"}
          </Button>
        ) : null}
      </div>
      {open && addr ? (
        <div className="c0-tgdrop" id="tg-drop">
          <p className="c0-tgdrop__cap">{linked ? "Alerts sent to Telegram" : "Pick the alerts you want, then open Telegram and press Start."}</p>
          {PREF_ROWS.map((r) => (
            <Switch key={r.key} id={`t-${r.key}`} label={r.label} hint={r.hint} checked={prefs[r.key]} onChange={(v) => void savePref(r.key, v)} />
          ))}
          <div className="c0-tgdrop__foot">
            {linked ? (
              <Button variant="paper" size="compact" busy={busy ? "Unlinking…" : undefined} onClick={() => void unlink()}>Unlink Telegram</Button>
            ) : link ? (
              <a className="c0-btn c0-btn--paper c0-btn--compact c0-tglink" href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => setWaiting(true)}>
                {waiting ? "Open Telegram again ›" : "Open Telegram ›"}
              </a>
            ) : (
              <Button variant="paper" size="compact" busy="Loading…" />
            )}
          </div>
        </div>
      ) : null}
      {error ? <div className="c0-blocked" role="alert">{error}</div> : null}
    </>
  );
}

function AppRows() {
  const shell = useShell();
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIos());
    const h = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  return (
    <>
      {!standalone ? (
        <div className="c0-srow">
          <div className="c0-srow__text">
            <span>Add to home screen</span>
            <span className="c0-srow__hint">{ios && !install ? "Tap Share, then Add to Home Screen" : "needed for alerts on iPhone"}</span>
          </div>
          {install ? <Button variant="paper" size="compact" onClick={() => { void install.prompt(); setInstall(null); }}>Install</Button> : null}
        </div>
      ) : null}
      <Switch id="a-sound" label="Sound" hint="clicks, actions and the colony's hum · also in the top bar" checked={shell.sound} onChange={shell.setSound} />
      <Switch id="a-motion" label="Reduce motion" checked={shell.reduceMotion} onChange={shell.setReduceMotion} />
    </>
  );
}

export function SettingsScreen() {
  const session = useSession();
  const profile = useProfile(session.address);
  const [pass, setPass] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  return (
    <Screen back title="Settings">
      <div className="c0-set">
        <h2 className="c0-set__label">Account</h2>
        <XRow />
        <IdentityRows />
        <WalletRow />
        {session.signedIn && session.wallet ? (
          <div className="c0-srow">
            <div className="c0-srow__text">
              <span>Withdraw</span>
              <span className="c0-srow__hint">send ETH or WIF to another address</span>
            </div>
            <Button variant="paper" size="compact" onClick={() => setWithdraw(true)}>Withdraw</Button>
          </div>
        ) : null}
        <WifGasRow />
        <div className="c0-srow">
          <div className="c0-srow__text">
            <span>Voter's Pass</span>
            <span className="c0-srow__hint">{profile.data?.hasVoterPass ? "linked · 20% off founding and feeding" : "not linked"}</span>
          </div>
          <Button variant="paper" size="compact" onClick={() => setPass(true)}>View</Button>
        </div>
        <h2 className="c0-set__label">Alerts on this device</h2>
        <Notifications />
        <h2 className="c0-set__label">Alerts on Telegram</h2>
        <TelegramAlerts />
        <h2 className="c0-set__label">App</h2>
        <AppRows />
      </div>
      <WithdrawSheet open={withdraw} onClose={() => setWithdraw(false)} />
      <VoterPass open={pass} onClose={() => setPass(false)} />
    </Screen>
  );
}
