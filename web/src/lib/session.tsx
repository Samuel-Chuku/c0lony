"use client";
// Sign-in and the player's wallet. Privy gives each player an embedded wallet (no pop-ups during play);
// players who connect their own wallet keep it and approve in it, by their choice.
import { PrivyProvider, usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CONFIG } from "../config";
import { BRAND } from "../brand";
import { chain } from "./chain";
import { postProfile } from "./api";

export type Session = {
  configured: boolean; // false until the Privy app ID is in config.ts
  ready: boolean;
  signedIn: boolean;
  address: string | null; // lowercase
  wallet: ConnectedWallet | null;
  embedded: boolean; // true when playing from the Privy embedded wallet
  login: () => void;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
};

const off: Session = {
  configured: false,
  ready: true,
  signedIn: false,
  address: null,
  wallet: null,
  embedded: false,
  login: () => {},
  logout: async () => {},
  getToken: async () => null,
};

const SessionContext = createContext<Session>(off);
export const useSession = () => useContext(SessionContext);

function PrivySession({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

  // Prefer the embedded wallet; otherwise the first connected external wallet linked to this user.
  const wallet = useMemo(() => {
    if (!authenticated) return null;
    const linked = new Set(
      (user?.linkedAccounts ?? []).flatMap((a) => (a.type === "wallet" ? [a.address.toLowerCase()] : [])),
    );
    return (
      wallets.find((w) => w.walletClientType === "privy") ??
      wallets.find((w) => linked.has(w.address.toLowerCase())) ??
      null
    );
  }, [authenticated, wallets, user]);

  // Save the verified X profile once per sign-in so handles show everywhere.
  const posted = useRef<string | null>(null);
  useEffect(() => {
    if (!authenticated || !user || posted.current === user.id) return;
    posted.current = user.id;
    getAccessToken()
      .then((t) => (t ? postProfile(t) : null))
      .catch(() => {
        posted.current = null;
      });
  }, [authenticated, user, getAccessToken]);

  const value: Session = {
    configured: true,
    ready: ready && (!authenticated || walletsReady),
    signedIn: authenticated,
    address: wallet ? wallet.address.toLowerCase() : null,
    wallet,
    embedded: wallet?.walletClientType === "privy",
    login,
    logout,
    getToken: getAccessToken,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Development only: `?as=0x…` views the app as that wallet, read-only (no transactions), so screens can be
 * checked against real testnet colonies without signing in. Stripped from production builds.
 */
function useDevViewAs(): string | null {
  const [as, setAs] = useState<string | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const q = new URLSearchParams(location.search).get("as");
    if (q && /^0x[0-9a-fA-F]{40}$/.test(q)) sessionStorage.setItem("c0lony:dev-as", q.toLowerCase());
    setAs(sessionStorage.getItem("c0lony:dev-as"));
  }, []);
  return as;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const devAs = useDevViewAs();
  if (process.env.NODE_ENV !== "production" && devAs) {
    const viewer: Session = { ...off, configured: true, signedIn: true, address: devAs };
    return <SessionContext.Provider value={viewer}>{children}</SessionContext.Provider>;
  }
  if (!CONFIG.privyAppId) return <SessionContext.Provider value={off}>{children}</SessionContext.Provider>;
  return (
    <PrivyProvider
      appId={CONFIG.privyAppId}
      config={{
        loginMethods: ["twitter", "email", "wallet"],
        appearance: { theme: "dark", accentColor: "#E7B13C", logo: BRAND.logo, walletChainType: "ethereum-only" },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        defaultChain: chain,
        supportedChains: [chain],
        walletConnectCloudProjectId: CONFIG.walletConnectProjectId,
      }}
    >
      <PrivySession>{children}</PrivySession>
    </PrivyProvider>
  );
}
