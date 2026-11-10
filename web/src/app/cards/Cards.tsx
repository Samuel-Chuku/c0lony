"use client";
import { BrandName } from "../../ui/BrandName";
import { ResIcon, type ResIconName } from "../../ui/ResIcon";

type Card = { id: string; tone: "raid" | "wif" | "calm"; kicker: string; title: string; icons: ResIconName[]; note: string };

// One per Telegram alert. Red only for raids, gold only for WIF (the queen's fed time and the pot).
const CARDS: Card[] = [
  { id: "raided", tone: "raid", kicker: "RAID INCOMING", title: "They're marching on you", icons: ["ant", "ant", "ant"], note: "guard leaves or sugar" },
  { id: "won", tone: "raid", kicker: "RAID WON", title: "Your ants came home loaded", icons: ["ant", "leaf", "sugar"], note: "rolled fair by drand" },
  { id: "lost", tone: "raid", kicker: "RAIDED", title: "They took some of your store", icons: ["ant", "chamber"], note: "you can avenge for free" },
  { id: "held", tone: "calm", kicker: "RAID OVER", title: "The colony held", icons: ["chamber", "ant"], note: "rolled fair by drand" },
  { id: "hungry", tone: "wif", kicker: "THE QUEEN", title: "She's getting hungry", icons: ["queen"], note: "feed her before she starves" },
  { id: "forage", tone: "calm", kicker: "FORAGERS HOME", title: "Leaves and sugar are in", icons: ["leaf", "ant", "sugar"], note: "tend to bring them in" },
  { id: "avenge", tone: "raid", kicker: "AVENGE", title: "Your free raid back ends soon", icons: ["ant", "ant"], note: "use it before it expires" },
  { id: "gift", tone: "wif", kicker: "WIF RECEIVED", title: "A neighbour sent you WIF", icons: ["ant", "wif", "ant"], note: "it's already in your wallet" },
  { id: "season", tone: "wif", kicker: "SEASON POT", title: "The season ends in 24h", icons: ["wif", "queen", "wif"], note: "top colonies share the pot" },
];

export function Cards() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24, background: "#111" }}>
      {CARDS.map((c) => <TgCard key={c.id} c={c} />)}
    </div>
  );
}

function TgCard({ c }: { c: Card }) {
  const band = c.tone === "raid" ? "#B4473A" : c.tone === "wif" ? "#E7B13C" : "#4A3020";
  const bandText = c.tone === "wif" ? "#1A110A" : "#FBF3DE";
  return (
    <div
      data-card={c.id}
      style={{
        width: 800, height: 400, boxSizing: "border-box", position: "relative", overflow: "hidden",
        background: "#24180F url(/soil-pattern.svg) 0 0 / 192px 192px", display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 704, height: 304, boxSizing: "border-box", background: "#E9D8B4", border: "6px solid #1A110A",
          boxShadow: "10px 10px 0 #0E0905", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ background: band, color: bandText, borderBottom: "6px solid #1A110A", padding: "8px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'Jersey 10'", fontSize: 44, letterSpacing: 4, lineHeight: 1 }}>{c.kicker}</span>
          <span style={{ fontFamily: "'Jersey 10'", fontSize: 36, letterSpacing: 2, lineHeight: 1 }}><BrandName /></span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 24, padding: "0 32px" }}>
          <div style={{ display: "flex", gap: 4, flex: "none" }}>
            {c.icons.map((n, i) => <ResIcon key={i} name={n} size={c.icons.length === 1 ? 160 : c.icons.length === 2 ? 112 : 88} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontFamily: "'Jersey 10'", fontSize: 54, lineHeight: 0.95, color: "#1A110A" }}>{c.title}</span>
            <span style={{ fontFamily: "Gaegu", fontWeight: 700, fontSize: 30, color: "#4A3020" }}>{c.note}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
