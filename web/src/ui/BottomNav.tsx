import { PixelIcon, type IconName } from "./PixelIcon";

export type NavTab = "colony" | "raids" | "live" | "season";
const TABS: Array<{ id: NavTab; label: string; icon: IconName }> = [
  { id: "colony", label: "Colony", icon: "colony" },
  { id: "raids", label: "Raids", icon: "raids" },
  { id: "live", label: "Live", icon: "live" },
  { id: "season", label: "Season", icon: "trophy" },
];

/** `alerts` puts a red dot on those tabs: Raids while a raid involving you is underway, Live when there is new activity. */
export function BottomNav({ active, onSelect, alerts }: { active: NavTab; onSelect: (tab: NavTab) => void; alerts?: NavTab[] }) {
  return (
    <nav className="c0-nav" aria-label="Main">
      {TABS.map((t) => (
        <button key={t.id} type="button" className="c0-nav__tab" aria-current={active === t.id ? "page" : undefined} onClick={() => onSelect(t.id)}>
          <span className="c0-nav__icon">
            <PixelIcon name={t.icon} size={30} />
            {alerts?.includes(t.id) ? <span className="c0-raiddot" role="img" aria-label={t.id === "raids" ? "raid underway" : "new activity"} /> : null}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
