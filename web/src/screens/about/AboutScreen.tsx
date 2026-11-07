"use client";
// The About page: one journal card (the raid report's look) with what the game is, who built it and where to
// find them. The copy is the owner's, word for word.
import type { ReactNode } from "react";
import { PixelIcon, type IconName } from "../../ui";
import { Screen } from "../../shell/Screen";
import "./about.css";

const P = ({ children }: { children: ReactNode }) => <p className="c0-about__p">{children}</p>;
const Label = ({ children }: { children: ReactNode }) => <h2 className="c0-about__label">{children}</h2>;

const PROJECTS = [
  { name: "ProofStream", href: "https://proofstream.site", line: "Programmable milestone payouts, where AI agents verify finished work and release USDC on their own." },
  { name: "Bezant", href: "https://bezant.trade", line: "Trade settlement for businesses paying in stablecoins, with USDC escrow and verifiable delivery." },
  { name: "Vintage", href: "https://usevintage.site", line: "Proves shielded Zcash coins are older than a hack or cutoff without revealing amounts or addresses, so honest deposits can clear and stay private. Live on mainnet." },
];

const LINKS: Array<{ label: string; handle: string; href: string; icon: IconName; aria: string }> = [
  { label: "X", handle: "@0xpixy", href: "https://x.com/0xpixy", icon: "x", aria: "Hirving on X, opens in a new tab" },
  { label: "GitHub", handle: "Samuel-Chuku", href: "https://github.com/Samuel-Chuku", icon: "github", aria: "Hirving on GitHub, opens in a new tab" },
  { label: "Portfolio", handle: "hirving.is-a.dev", href: "https://hirving.is-a.dev", icon: "globe", aria: "Hirving's portfolio, opens in a new tab" },
];

export function AboutScreen() {
  return (
    <Screen back wide title="About">
      <article className="c0-journal c0-about">
        <span className="c0-journal__margin" aria-hidden="true" />
        <div className="c0-about__logo"><img src="/logo-compact.svg" alt="C0LONY" width={244} height={56} /></div>

        <section className="c0-about__sec c0-about__main">
          <Label>About</Label>
          <P>C0LONY is a daily, social game played onchain. You found a colony, keep your queen fed, dig chambers, send foragers down leafcutter trails and herd aphids for sugar, and every so often you march on a neighbour&apos;s colony to carry off what they have stored, or stand guard while someone marches on yours.</P>
          <P>It runs on Robinhood Chain and is paid in $WIF. Every WIF spent on founding, feeding, shields and speed-ups is split three ways: most of it goes into the season pot, a share is burned for good, and the rest keeps the treasury able to cover gas for new players. When a season ends, the colonies that finished in the top quarter, still alive and properly fed, share the pot between them. Nothing about the payout is decided by hand.</P>
          <P>Raids are sealed until they land, so nobody can see what you are after, and every result is rolled with drand, a public source of randomness run by the League of Entropy and checked by the contract itself. Any roll can be verified from the raid report. Nobody running the game can tilt it, and that includes us.</P>
          <p className="c0-about__hand">We built C0LONY because most onchain games ask you to trade before they ask you to play. This one asks you to come back each day, look after something small, and keep an eye on the neighbours.</p>
        </section>

        <div className="c0-about__side">
        <section className="c0-about__sec">
          <Label>The builder</Label>
          <P>C0LONY is built by Hirving, the founder of Hirving Labs, a design and development studio in Lagos. Hirving builds production AI agents, automation systems and onchain products, and spent close to a decade in crypto communities before building for them full time.</P>
          <P>Other things Hirving has built:</P>
          <ul className="c0-about__projects">
            {PROJECTS.map((p) => (
              <li key={p.name} className="c0-about__project">
                <a className="c0-about__pname" href={p.href} target="_blank" rel="noopener noreferrer" aria-label={`${p.name}, opens in a new tab`}>{p.name}</a>
                <span className="c0-about__pline">{p.line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="c0-about__sec">
          <Label>Find Hirving</Label>
          <div className="c0-about__links">
            {LINKS.map((l) => (
              <a key={l.href} className="c0-about__row" href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.aria}>
                <PixelIcon name={l.icon} size={20} />
                <span className="c0-about__rowlabel">{l.label}</span>
                <span className="c0-about__handle">{l.handle}</span>
                <span className="c0-about__chev" aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        </section>
        </div>
      </article>
      <p className="c0-about__disclaimer">C0LONY is an independent project built for the World is Flat hackathon. It is not affiliated with Robinhood.</p>
    </Screen>
  );
}
