"use client";
import { useExportWallet, useLinkAccount } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { Button, Switch } from "../../ui";
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
import { VoterPass } from "./VoterPass";
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
      <Switch id="n-master" label="Notifications" hint={hint} checked={on} onChange={(v) => { if (canUse && !busy) void master(v); }} />
      {PREF_ROWS.map((r) => (
        <Switch key={r.key} id={`n-${r.key}`} label={r.label} hint={r.hint} checked={prefs[r.key]} onChange={(v) => void pref(r.key, v)} />
      ))}
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
      <Switch id="a-sound" label="Sound effects" checked={shell.sound} onChange={shell.setSound} />
      <Switch id="a-motion" label="Reduce motion" checked={shell.reduceMotion} onChange={shell.setReduceMotion} />
    </>
  );
}

export function SettingsScreen() {
  const session = useSession();
  const profile = useProfile(session.address);
  const [pass, setPass] = useState(false);
  return (
    <Screen back title="Settings">
      <div className="c0-set">
        <h2 className="c0-set__label">Account</h2>
        <XRow />
        <WalletRow />
        <div className="c0-srow">
          <div className="c0-srow__text">
            <span>Voter's Pass</span>
            <span className="c0-srow__hint">{profile.data?.hasVoterPass ? "linked · 20% off founding and feeding" : "not linked"}</span>
          </div>
          <Button variant="paper" size="compact" onClick={() => setPass(true)}>View</Button>
        </div>
        <h2 className="c0-set__label">Notifications</h2>
        <Notifications />
        <h2 className="c0-set__label">App</h2>
        <AppRows />
      </div>
      <VoterPass open={pass} onClose={() => setPass(false)} />
    </Screen>
  );
}
