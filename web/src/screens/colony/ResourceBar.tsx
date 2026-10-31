"use client";
import { PixelIcon } from "../../ui";
import { fmtInt, fmtRes } from "../../lib/format";
import type { Profile } from "../../lib/game";

/** Leaves, sugar and ants in one button; the whole bar opens the Build sheet. */
export function ResourceBar({ profile, onOpen }: { profile: Profile; onOpen: () => void }) {
  const leaves = fmtRes(profile.leaves);
  const sugar = fmtRes(profile.sugar);
  const cap = fmtInt(profile.capacity);
  return (
    <div className="c0-resbar-wrap">
      <button
        type="button"
        className="c0-resbar"
        onClick={onOpen}
        aria-label={`Resources: ${leaves} leaves, ${sugar} sugar, ${profile.ants} of ${cap} ants. Open build panel`}
      >
        <span className="c0-resbar__item"><PixelIcon name="leaf" />{leaves}</span>
        <span className="c0-resbar__item"><PixelIcon name="sugar" />{sugar}</span>
        <span className="c0-resbar__item"><PixelIcon name="ant" />{profile.ants}/{cap}</span>
        <span className="c0-resbar__tag" aria-hidden="true">+ BUILD</span>
      </button>
    </div>
  );
}
