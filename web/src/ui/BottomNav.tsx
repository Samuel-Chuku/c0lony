import { PixelIcon, type IconName } from "./PixelIcon";

export type NavTab = "colony" | "raids" | "live";
const TABS: Array<{ id: NavTab; label: string; icon: IconName }> = [
  { id: "colony", label: "Colony", icon: "colony" },
  { id: "raids", label: "Raids", icon: "raids" },
  { id: "live", label: "Live", icon: "live" },
];

export function BottomNav({ active, onSelect }: { active: NavTab; onSelect: (tab: NavTab) => void }) {
  return (
    <nav className="c0-nav" aria-label="Main">
      {TABS.map((t) => (
        <button key={t.id} type="button" className="c0-nav__tab" aria-current={active === t.id ? "page" : undefined} onClick={() => onSelect(t.id)}>
          <PixelIcon name={t.icon} size={30} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}
