"use client";
// App-wide state for app.c0lony.xyz: sign-in, the Menu drawer, offline and update notices, and the in-app
// reduce-motion switch. The landing site never mounts this.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SessionProvider } from "../lib/session";
import { registerServiceWorker } from "../lib/push";
import { MenuDrawer } from "./MenuDrawer";
import { WelcomeBack } from "./WelcomeBack";
import { QueenAlert } from "./QueenAlert";

type Shell = {
  openMenu: () => void;
  online: boolean;
  lastOnline: number | null; // unix seconds of the last successful load while online
  updateReady: boolean;
  applyUpdate: () => void;
  reduceMotion: boolean;
  setReduceMotion: (on: boolean) => void;
  sound: boolean;
  setSound: (on: boolean) => void;
};

const ShellContext = createContext<Shell | null>(null);
export function useShell(): Shell {
  const s = useContext(ShellContext);
  if (!s) throw new Error("useShell outside Providers");
  return s;
}

const MOTION_KEY = "c0lony:reduce-motion";
const SOUND_KEY = "c0lony:sound";

export function Providers({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastOnline, setLastOnline] = useState<number | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [reduceMotion, setReduceMotionState] = useState(false);
  const [sound, setSoundState] = useState(false);

  useEffect(() => {
    setReduceMotionState(localStorage.getItem(MOTION_KEY) === "1");
    setSoundState(localStorage.getItem(SOUND_KEY) === "1");
    const up = () => {
      setOnline(true);
      setLastOnline(Math.floor(Date.now() / 1000));
    };
    const down = () => setOnline(false);
    if (navigator.onLine) up();
    else down();
    window.addEventListener("online", up);
    window.addEventListener("offline", down);

    // Service worker: offline shell, push alerts, and an in-place "update ready" notice (no toast).
    void registerServiceWorker().then((reg) => {
      if (!reg) return;
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    });
    let reloaded = false;
    navigator.serviceWorker?.addEventListener("controllerchange", () => {
      if (!reloaded) {
        reloaded = true;
        location.reload();
      }
    });
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("c0-reduce-motion", reduceMotion);
  }, [reduceMotion]);

  const setReduceMotion = useCallback((on: boolean) => {
    localStorage.setItem(MOTION_KEY, on ? "1" : "0");
    setReduceMotionState(on);
  }, []);
  const setSound = useCallback((on: boolean) => {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
    setSoundState(on);
  }, []);

  const shell: Shell = {
    openMenu: () => setMenu(true),
    online,
    lastOnline,
    updateReady: !!waiting,
    applyUpdate: () => waiting?.postMessage("skip-waiting"),
    reduceMotion,
    setReduceMotion,
    sound,
    setSound,
  };

  return (
    <SessionProvider>
      <ShellContext.Provider value={shell}>
        {children}
        <MenuDrawer open={menu} onClose={() => setMenu(false)} />
        <WelcomeBack />
        <QueenAlert />
      </ShellContext.Provider>
    </SessionProvider>
  );
}
