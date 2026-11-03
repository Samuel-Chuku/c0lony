"use client";
// The one-tap mute in the header, next to the WIF balance. Same switch as Settings > Sound.
import { PixelIcon } from "../ui";
import { useShell } from "./Providers";

export function SoundToggle() {
  const { sound, setSound } = useShell();
  return (
    <button
      type="button"
      className="c0-header__sound"
      aria-label={sound ? "Mute sound" : "Turn sound on"}
      aria-pressed={!sound}
      data-shortcut="s"
      data-tip={sound ? "Mute · S" : "Sound on · S"}
      onClick={() => setSound(!sound)}
    >
      <PixelIcon name={sound ? "sound" : "mute"} />
    </button>
  );
}
