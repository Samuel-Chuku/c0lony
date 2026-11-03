"use client";
// Keyboard play for desktop. A control opts in with data-shortcut="<key>"; pressing the key clicks it, so a
// shortcut can never do more than the button it stands for. No key ever feeds, shields or buys: spending WIF
// always takes a deliberate click.
import { useEffect } from "react";
import { Modal } from "../ui";

export const SHORTCUTS: Array<{ keys: string; what: string }> = [
  { keys: "1 · 2 · 3 · 4", what: "Colony · Raids · Live · Season" },
  { keys: "B", what: "Open Build (Colony)" },
  { keys: "T", what: "Tend: collect everything that is home" },
  { keys: "M", what: "Menu, wallet and Look" },
  { keys: "S", what: "Sound on or off" },
  { keys: "?", what: "This list" },
  { keys: "Esc", what: "Close the open window" },
];

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** Global key handler. Ignores keys while typing, with modifiers, or while any dialog is open. */
export function useShortcuts(onHelp: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (document.querySelector(".c0-dialog-root")) return;
      if (e.key === "?") {
        e.preventDefault();
        onHelp();
        return;
      }
      const key = e.key.toLowerCase();
      if (key.length !== 1) return;
      const target = Array.from(document.querySelectorAll<HTMLElement>(`[data-shortcut="${key}"]`)).find(
        (el) => el.offsetParent !== null && !(el as HTMLButtonElement).disabled,
      );
      if (!target) return;
      e.preventDefault();
      target.click();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onHelp]);
}

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard" kicker="for playing at a desk">
      <dl className="c0-keys">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="c0-keys__row">
            <dt>{s.keys.split(" · ").map((k) => <kbd key={k} className="c0-kbd">{k}</kbd>)}</dt>
            <dd>{s.what}</dd>
          </div>
        ))}
      </dl>
      <p className="c0-keys__note">Keys never spend WIF. Feeding, shields and buying always take a click.</p>
    </Modal>
  );
}
