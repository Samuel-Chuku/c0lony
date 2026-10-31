"use client";
// The Colony tab's own header: "YOUR COLONY · DAY 6 OF 21", the WIF balance and the avatar that opens the Menu.
import { Avatar, PixelIcon } from "../../ui";
import { fmtWif } from "../../lib/format";
import { useBalances, useNow, useSeason, seasonDays } from "../../lib/game";
import { useSession } from "../../lib/session";
import { useXProfile } from "../../lib/useXProfile";
import { useShell } from "../../shell/Providers";

export function ColonyHeader() {
  const session = useSession();
  const shell = useShell();
  const season = useSeason();
  const balances = useBalances(session.address);
  const me = useXProfile(session.address);
  const now = useNow(60_000);
  const day = season.data ? seasonDays(season.data.start, season.data.end, now) : null;
  return (
    <header className="c0-colony__head">
      <h1 className="c0-header__title">
        YOUR COLONY
        {day ? <span className="c0-header__sub">· DAY {day.day} OF {day.total}</span> : null}
      </h1>
      {balances.data ? (
        <span className="c0-header__wif">
          <PixelIcon name="wif" />
          {fmtWif(balances.data.wif)}
        </span>
      ) : null}
      <button type="button" className="c0-header__avatar" aria-label="Open menu and profile" onClick={shell.openMenu}>
        <Avatar src={me?.xAvatar ?? null} address={session.address ?? undefined} alt="Your avatar" />
      </button>
    </header>
  );
}
