import { PixelIcon, type IconName } from "./PixelIcon";

export type NavTab = "colony" | "raids" | "live" | "season";
const TABS: Array<{ id: NavTab; label: string; icon: IconName }> = [
  { id: "colony", label: "Colony", icon: "colony" },
  { id: "raids", label: "Raids", icon: "raids" },
  { id: "live", label: "Live", icon: "live" },
  { id: "season", label: "Season", icon: "trophy" },
];

/** `alert` puts a red raid dot on that tab (a raid involving you is underway). */
export function BottomNav({ active, onSelect, alert }: { active: NavTab; onSelect: (tab: NavTab) => void; alert?: NavTab | null }) {
  return (
    <nav className="c0-nav" aria-label="Main">
      {TABS.map((t) => (
        <button key={t.id} type="button" className="c0-nav__tab" aria-current={active === t.id ? "page" : undefined} onClick={() => onSelect(t.id)}>
          <span className="c0-nav__icon">
            <PixelIcon name={t.icon} size={30} />
            {alert === t.id ? <span className="c0-raiddot" role="img" aria-label="raid underway" /> : null}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
