"use client";
// Desktop navigation (1024px and wider): a rail down the left edge with the four tabs, the secondary pages and
// the keyboard hints. Phones never see it; they keep the bottom nav. Compact (icons over labels) below 1440px,
// expanded with the wordmark and shortcut keys from 1440px.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "../brand";
import { PixelIcon, type IconName, type NavTab } from "../ui";
import { useShell } from "./Providers";

export const MAIN_TABS: Array<{ id: NavTab; label: string; icon: IconName; key: string }> = [
  { id: "colony", label: "Colony", icon: "colony", key: "1" },
  { id: "raids", label: "Raids", icon: "raids", key: "2" },
  { id: "live", label: "Live", icon: "live", key: "3" },
  { id: "season", label: "Season", icon: "trophy", key: "4" },
];

const MORE: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/leaderboard", label: "Leaderboard", icon: "board" },
  { href: "/how-to-play", label: "How to play", icon: "book" },
  { href: "/invite", label: "Invite", icon: "invite" },
  { href: "/about", label: "About", icon: "colony" },
  { href: "/settings", label: "Settings", icon: "gear" },
];

export const tabHref = (tab: NavTab) => (tab === "colony" ? "/" : `/?tab=${tab}`);

export function SideRail({ active, alert }: { active?: NavTab; alert?: NavTab | null }) {
  const path = usePathname();
  const shell = useShell();
  return (
    <nav className="c0-rail" aria-label="Main">
      <Link href="/" className="c0-rail__brand" aria-label={`${BRAND.name} home`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="c0-rail__word" src={BRAND.logoCompact} alt="" width={200} height={46} />
        <span className="c0-rail__mark" aria-hidden="true">C0</span>
      </Link>
      <div className="c0-rail__group">
        {MAIN_TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            className="c0-rail__item"
            aria-current={active === t.id ? "page" : undefined}
            data-shortcut={t.key}
          >
            <span className="c0-nav__icon">
              <PixelIcon name={t.icon} size={30} />
              {alert === t.id ? <span className="c0-raiddot" role="img" aria-label="raid underway" /> : null}
            </span>
            <span className="c0-rail__label">{t.label}</span>
            <kbd className="c0-kbd c0-rail__key">{t.key}</kbd>
          </Link>
        ))}
      </div>
      <div className="c0-rail__group c0-rail__group--more">
        {MORE.map((m) => (
          <Link key={m.href} href={m.href} className="c0-rail__item c0-rail__item--small" aria-current={path === m.href ? "page" : undefined}>
            <PixelIcon name={m.icon} />
            <span className="c0-rail__label">{m.label}</span>
          </Link>
        ))}
      </div>
      <button type="button" className="c0-rail__help" onClick={shell.openShortcuts} data-tip="Keyboard shortcuts">
        <kbd className="c0-kbd">?</kbd>
        <span className="c0-rail__label">Shortcuts</span>
      </button>
    </nav>
  );
}
