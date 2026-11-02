"use client";
// App-wide state for app.c0lony.xyz: sign-in, the Menu drawer, offline and update notices, and the in-app
// reduce-motion switch, and the Soil/Daylight look. The landing site never mounts this.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SessionProvider } from "../lib/session";
import { registerServiceWorker } from "../lib/push";
import { MenuDrawer } from "./MenuDrawer";
import { WelcomeBack } from "./WelcomeBack";
import { ResultModal } from "./ResultModal";
import { QueenAlert } from "./QueenAlert";
import { ShortcutsHelp, useShortcuts } from "./Shortcuts";

type Shell = {
  openMenu: () => void;
  openShortcuts: () => void;
  online: boolean;
  lastOnline: number | null; // unix seconds of the last successful load while online
  updateReady: boolean;
  applyUpdate: () => void;
  reduceMotion: boolean;
  setReduceMotion: (on: boolean) => void;
  sound: boolean;
  setSound: (on: boolean) => void;
  look: Look;
  setLook: (look: Look) => void;
};

/** "auto" follows the device's light/dark setting. */
export type Look = "auto" | "soil" | "day";

const ShellContext = createContext<Shell | null>(null);
export function useShell(): Shell {
  const s = useContext(ShellContext);
  if (!s) throw new Error("useShell outside Providers");
  return s;
}

const MOTION_KEY = "c0lony:reduce-motion";
const SOUND_KEY = "c0lony:sound";
export const LOOK_KEY = "c0lony:look";
const THEME_COLOR = { soil: "#24180F", day: "#D2BB91" } as const;

/** Runs in <head> before first paint so a Daylight player never sees a flash of soil. */
export const LOOK_SCRIPT = `try{var l=localStorage.getItem("${LOOK_KEY}");if(l!=="soil"&&l!=="day")l=matchMedia("(prefers-color-scheme: light)").matches?"day":"soil";document.documentElement.dataset.theme=l}catch(e){}`;

export function Providers({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [keys, setKeys] = useState(false);
  const openShortcuts = useCallback(() => setKeys(true), []);
  useShortcuts(openShortcuts);
  const [online, setOnline] = useState(true);
  const [lastOnline, setLastOnline] = useState<number | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [reduceMotion, setReduceMotionState] = useState(false);
  const [sound, setSoundState] = useState(false);
  const [look, setLookState] = useState<Look>("auto");

  useEffect(() => {
    setReduceMotionState(localStorage.getItem(MOTION_KEY) === "1");
    setSoundState(localStorage.getItem(SOUND_KEY) === "1");
    const saved = localStorage.getItem(LOOK_KEY);
    if (saved === "soil" || saved === "day") setLookState(saved);
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

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const theme = look === "auto" ? (media.matches ? "day" : "soil") : look;
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
    };
    apply();
    if (look !== "auto") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [look]);

  const setLook = useCallback((next: Look) => {
    try {
      if (next === "auto") localStorage.removeItem(LOOK_KEY);
      else localStorage.setItem(LOOK_KEY, next);
    } catch { /* storage blocked */ }
    setLookState(next);
  }, []);

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
    openShortcuts,
    online,
    lastOnline,
    updateReady: !!waiting,
    applyUpdate: () => waiting?.postMessage("skip-waiting"),
    reduceMotion,
    setReduceMotion,
    sound,
    setSound,
    look,
    setLook,
  };

  return (
    <SessionProvider>
      <ShellContext.Provider value={shell}>
        {children}
        <MenuDrawer open={menu} onClose={() => setMenu(false)} />
        <ShortcutsHelp open={keys} onClose={() => setKeys(false)} />
        <WelcomeBack />
        <QueenAlert />
        <ResultModal />
      </ShellContext.Provider>
    </SessionProvider>
  );
}
