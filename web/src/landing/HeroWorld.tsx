"use client";
import { useNow } from "../lib/game";
import { ColonyWorld } from "../world/ColonyWorld";

// The living colony as the hero picture. 390x280 at 1x; whole-number scale only (CSS, see landing.css).
export function HeroWorld() {
  const now = useNow(60_000);
  return (
    <figure className="l-world">
      <div className="l-world__box">
        <ColonyWorld invite fedUntil={now + 72 * 3600} now={now} />
      </div>
      <figcaption className="l-world__cap">A colony in cross-section. The queen's chamber glows while she is fed.</figcaption>
    </figure>
  );
}
