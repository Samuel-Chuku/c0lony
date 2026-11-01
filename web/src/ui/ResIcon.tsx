// Full-colour vector icons for the game's things (owner's call, 2026-11-01: resources read better as real icons
// than as one-colour pixel glyphs). Flat shapes with a 1.5px ink outline so they sit with the journal style.
// The one-colour pixel icons (PixelIcon) stay for navigation and controls.
import type { ReactElement, SVGProps } from "react";

export type ResIconName = "leaf" | "sugar" | "ant" | "chamber" | "trail" | "farm" | "queen";

const INK = "#1A110A";

const paths: Record<ResIconName, ReactElement> = {
  leaf: (
    <>
      <path d="M4 20C4 11 10 4 20 4c0 10-6 16-15 16Z" fill="#6FA03C" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M5 19 16 8M10 14h4M8 12V9" stroke="#3E6420" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </>
  ),
  sugar: (
    <>
      <path d="M3 9.5 9 6.5l6 3v7l-6 3-6-3Z" fill="#FBF3DE" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 9.5 9 12.5l6-3M9 12.5v7" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M13 6.5 17.5 4.25 22 6.5v5l-4.5 2.25L15 12.5" fill="#E9D8B4" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M13 6.5l4.5 2.25L22 6.5M17.5 8.75v5" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </>
  ),
  ant: (
    <>
      <path d="M8 9 5 6M10 8.5 9.5 5M14 15l2 4M11 15.5 11 19.5M8 15l-3 3.5M15 9l3-3" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="6.5" cy="11" rx="3" ry="2.6" fill="#7A4A2A" stroke={INK} strokeWidth="1.5" />
      <ellipse cx="11.5" cy="12" rx="2.6" ry="2.2" fill="#7A4A2A" stroke={INK} strokeWidth="1.5" />
      <ellipse cx="17.5" cy="13" rx="4.2" ry="3.4" fill="#7A4A2A" stroke={INK} strokeWidth="1.5" />
      <circle cx="5.6" cy="10.4" r="0.9" fill="#FBF3DE" />
    </>
  ),
  chamber: (
    <>
      <ellipse cx="12" cy="13" rx="10" ry="7" fill="#4A3020" stroke={INK} strokeWidth="1.5" />
      <ellipse cx="12" cy="14" rx="6.5" ry="4" fill="#24180F" />
      <path d="M12 2v4" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="9.5" cy="14.5" rx="1.6" ry="1.1" fill="#FBF3DE" />
      <ellipse cx="13.5" cy="15" rx="1.6" ry="1.1" fill="#FBF3DE" />
    </>
  ),
  trail: (
    <>
      <path d="M2 19c5-1 6-6 10-6s5 4 10 3" stroke="#8A5A3B" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M2 19c5-1 6-6 10-6s5 4 10 3" stroke={INK} strokeWidth="1" strokeDasharray="1.5 2.5" fill="none" />
      <path d="M8 11c0-4 3-7 8-7 0 5-3 8-8 7Z" fill="#6FA03C" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
  farm: (
    <>
      <path d="M3 21c2-6 3-10 4-15M9 21c0-5 1-9 3-13M15 21c1-4 3-8 6-11" stroke="#55702C" strokeWidth="2" strokeLinecap="round" fill="none" />
      <ellipse cx="9" cy="11" rx="3.4" ry="2.6" fill="#9CCB5A" stroke={INK} strokeWidth="1.5" />
      <ellipse cx="16" cy="15" rx="3" ry="2.3" fill="#9CCB5A" stroke={INK} strokeWidth="1.5" />
      <circle cx="7.6" cy="10.4" r="0.8" fill={INK} />
      <circle cx="14.8" cy="14.5" r="0.8" fill={INK} />
    </>
  ),
  queen: (
    <>
      <path d="M4 5 6 9h6l2-4-3 2-2-3-2 3Z" fill="#E7B13C" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      <ellipse cx="7" cy="12.5" rx="3" ry="2.6" fill="#7A4A2A" stroke={INK} strokeWidth="1.5" />
      <ellipse cx="11.5" cy="13.5" rx="2.2" ry="2" fill="#7A4A2A" stroke={INK} strokeWidth="1.5" />
      <ellipse cx="17.5" cy="14.5" rx="5" ry="4" fill="#8A5A3B" stroke={INK} strokeWidth="1.5" />
      <path d="M16 11v7M19 11.2v6.6" stroke="#5A3A1C" strokeWidth="1.3" />
    </>
  ),
};

export function ResIcon({
  name,
  size = 20,
  label,
  ...rest
}: { name: ResIconName; size?: number; label?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ display: "inline-block", flex: "none", verticalAlign: "middle" }}
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
