"use client";
// The full guide. Every number comes from the live game config (useGameConfig); the few fixed rules mirror
// constants in the contract (ColonyGame.sol, SeasonPot.sol).
import { useEffect, useState, type ReactNode } from "react";
import { Button, Card, ResIcon, type ResIconName, Wif } from "../../ui";
import { openGuide } from "../../shell/GuideHost";
import { Screen } from "../../shell/Screen";
import { fmtDuration, fmtWif } from "../../lib/format";
import { NETWORK_NAME } from "../../config";
import { useGameConfig, type GameConfig } from "../../lib/game";
import { SHORTCUTS } from "../../shell/Shortcuts";

const STARVE_HOURS = 72;
const REVIVE_HOURS = 24;
const AVENGE_HOURS = 24;
const CLAIM_DAYS = 30;
const REFUND_HOURS = 48;

/** "Voter's Pass" -> "voters-pass": the anchor other screens link to, e.g. /how-to-play#raids. */
const slug = (t: string) => t.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const SECTIONS = ["The goal", "Getting started", "Your queen", "Leaves and sugar", "Buildings", "Raids", "Avenge", "Shield", "The season and the pot", "The app", "Voter's Pass"];

/** Section links: chips on top on a phone, a fixed list on the left on a computer. Marks the section in view. */
function Contents() {
  const [now, setNow] = useState(slug(SECTIONS[0]));
  useEffect(() => {
    const els = SECTIONS.map((t) => document.getElementById(slug(t))).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setNow(top.target.id);
      },
      { rootMargin: "-10% 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="c0-ht__toc" aria-label="On this page">
      <span className="c0-ht__tocCap">ON THIS PAGE</span>
      {SECTIONS.map((t) => (
        <a key={t} href={`#${slug(t)}`} aria-current={now === slug(t) ? "location" : undefined}>{t}</a>
      ))}
    </nav>
  );
}

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card id={slug(title)} className="c0-ht__card c0-ht__sec">
      <h2 className="c0-pf__h2">{title}</h2>
      {children}
    </Card>
  );
}
const P = ({ children }: { children: ReactNode }) => <p className="c0-ht__p">{children}</p>;
const UL = ({ items }: { items: ReactNode[] }) => (
  <ul className="c0-ht__ul">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
);
const Ico = ({ name, children }: { name: ResIconName; children: ReactNode }) => (
  <span className="c0-ht__ico"><ResIcon name={name} size={20} />{children}</span>
);

function Guide({ c }: { c?: GameConfig }) {
  const d = (v?: bigint | number) => (v === undefined ? "…" : fmtDuration(Number(v)));
  const w = (v?: bigint) => (v === undefined ? "…" : <Wif>{fmtWif(v)}</Wif>);
  const pct = (v?: number) => (v === undefined ? "…" : `${v}%`);
  return (
    <>
      <Sec title="The goal">
        <P>Keep your queen alive, grow your colony, and finish the season with a high score. Colonies that finish high share the season pot in WIF.</P>
      </Sec>

      <Sec title="Getting started">
        <UL
          items={[
            <>Sign in with X or email. A wallet is made for you inside the game; you can also connect your own.</>,
            <>New wallets get a little ETH for gas, once.{NETWORK_NAME === "testnet" ? " On testnet, Get test WIF in the Menu gives you free WIF once a day." : " Buy WIF in the Menu swaps ETH for WIF in one step."}</>,
            <>Send WIF to a colony from the Menu, or from any player&apos;s profile. Type their colony name, @handle or address; nothing is burned and they get an alert.</>,
            <>Found your colony for {w(c?.foundPrice)}. You start with 10 ants, 2 chambers, and 20 <ResIcon name="leaf" size={16} label="leaves" /> and 20 <ResIcon name="sugar" size={16} label="sugar" />, and your queen is fed for {STARVE_HOURS} hours.</>,
            <>A good day: tend, feed the colony, build, then raid a neighbour or guard against one. The three stamps on the Colony tab track today&apos;s orders.</>,
          ]}
        />
      </Sec>

      <Sec title="Your queen">
        <UL
          items={[
            <>Feed the colony at most once every {d(c?.feedMinInterval)}. Feeding costs {w(c?.feedPrice)} and 3 <ResIcon name="leaf" size={16} label="leaves" />, which the queen eats. Leaves held back by a raid can still feed her.</>,
            <>She must be fed within {STARVE_HOURS} hours or she starves.</>,
            <>A starving queen can be revived for {REVIVE_HOURS} hours: {w(c?.reviveBasePrice)} plus {w(c?.revivePerWorkerPrice)} per ant. After that the colony falls.</>,
          ]}
        />
        <P>Each feeding does this, in order:</P>
        <UL
          items={[
            <>Every ant eats 1 <ResIcon name="sugar" size={16} label="sugar" />. If there is not enough, that many ants die.</>,
            <>Leftover sugar becomes new ants at 2 sugar each, up to the room in your chambers.</>,
            <>Your score grows by your ants, plus 25 for each raid you won and 10 for each raid you guarded since the last feeding.</>,
          ]}
        />
      </Sec>

      <Sec title="Leaves and sugar">
        <UL
          items={[
            <>Hand foragers bring <ResIcon name="leaf" size={16} label="leaves" /> every {d(c?.leafForageCooldown)}: 6, plus 0.5 for each free ant. And <ResIcon name="sugar" size={16} label="sugar" /> every {d(c?.sugarForageCooldown)}: 4, plus 0.3 for each free ant. Only your first 30 free ants count. Tend collects them.</>,
            <>If you are away, up to two trips of each wait in your pantry (the jar next to Tend). Once it is full, new trips are lost, so claim it.</>,
            <>Speed up collects what is home plus one more trip for {w(c?.speedUpPrice)}, once per {d(c?.speedUpCooldown)}.</>,
            <>Every ant on a trail or farm brings 2 a day, earned every second. Your first farm costs leaves only.</>,
          ]}
        />
      </Sec>

      <Sec title="Buildings">
        <table className="c0-ht__table">
          <thead><tr><th>Building</th><th>Holds</th><th>Cost</th></tr></thead>
          <tbody>
            <tr><td><Ico name="chamber">Chamber</Ico></td><td>5 ants</td><td>the most of {c?.chamberBase ?? "…"}, your chambers, or ants ÷ 5, in leaves</td></tr>
            <tr><td><Ico name="trail">Trail</Ico></td><td>up to 100 ants, makes leaves</td><td>the most of {c?.trailBase ?? "…"}, 2 × chambers, or ants ÷ 2, in leaves</td></tr>
            <tr><td><Ico name="farm">Farm</Ico></td><td>up to 100 ants, makes sugar</td><td>the most of {c?.farmLeafBase ?? "…"}, chambers, or ants ÷ 4, in leaves; from the second farm on, also the most of {c?.farmSugarBase ?? "…"}, chambers, or ants ÷ 4, in sugar</td></tr>
          </tbody>
        </table>
        <P>Costs grow as your colony grows. Ants not assigned to a trail or farm are free ants: they can raid and guard.</P>
      </Sec>

      <Sec title="Raids">
        <UL
          items={[
            <>You need 10 ants. All your free ants march; ants on trails and farms stay home. Targets must be between half and double your size.</>,
            <>You seal your target, leaves or sugar, so nobody can see it. The defender has {d(c?.guardWindow)} to guard one of the two.</>,
            <>No guard: you win and take 30 to 60% of the target. Guard on the other resource: you win and take 45 to 60%.</>,
            <>Guard on your target: the raid fails, a quarter of your marching ants fall, and the defender takes 10 to 15% of your stock of a random resource.</>,
            <>Each marching ant carries at most 8, so bigger raids carry more.</>,
            <>While a raid marches on you, 60% of your leaves and sugar is held back until it lands. Your ants still eat.</>,
            <>You can launch one raid per {d(c?.raidCooldown)}. A colony can be raided once at a time, then not again for {d(c?.raidProtection)}. You can&apos;t launch a raid while one is marching on you.</>,
            <>The share comes from a public drand round, so anyone can check it was fair.</>,
          ]}
        />
        <P>How a raid plays out:</P>
        <UL
          items={[
            <>After the guard window, the raid reveals itself. At launch the target is timelocked to a drand round that comes after the window, so nobody can read it early, and the game&apos;s keeper opens it and reveals. The raider can also reveal by hand within {d(c?.revealWindow)}. If no one does, the marching ants are lost.</>,
            <>The roll uses the first drand round about 30 seconds after the reveal. Anyone can settle it then; the game&apos;s keeper settles every raid within about a minute, and the app offers one-tap settle too.</>,
            <>If a raid is never settled, the ants come home after {REFUND_HOURS} hours with nothing.</>,
            <>Finished raids must be settled or collected before you launch another. The Raids tab shows when you can raid, and when you can be raided again.</>,
          ]}
        />
      </Sec>

      <Sec title="Avenge">
        <P>If someone wins a raid against you, you get a free raid back at them for {AVENGE_HOURS} hours. It skips your raid cooldown and their raid protection, and can be used once.</P>
      </Sec>

      <Sec title="Shield">
        <P>For {w(c?.shieldPrice)}, a shield stops new raids on you for {d(c?.shieldDuration)}. You can raise one once per {d(c?.shieldCooldown)}.</P>
      </Sec>

      <Sec title="The season and the pot">
        <UL
          items={[
            <>Of every WIF payment, 70% goes to the pot, 20% is burned and 10% goes to the treasury.</>,
            <>When the season ends, half the pot is shared by score among every colony that was fed at least twice and whose queen was fed within {STARVE_HOURS} hours of the end. The other half is shared by score among the top quarter.</>,
            <>Claim your share from the Season tab after it ends. Unclaimed shares roll into the next pot after {CLAIM_DAYS} days.</>,
          ]}
        />
      </Sec>

      <Sec title="The app">
        <UL
          items={[
            <>Look: tap your picture for the Menu and pick Auto, Soil or Daylight. Auto follows your phone or computer.</>,
            <>Sound: the speaker in the top bar mutes and unmutes clicks, action sounds and the colony&apos;s hum.</>,
            <>Alerts: turn on notifications in Settings to hear when you are raided, a raid result is in, or the queen is getting hungry. On iPhone, add the app to your home screen first.</>,
            <>On a computer the tabs sit on the left and these keys work: {SHORTCUTS.map((s) => `${s.keys} ${s.what.toLowerCase()}`).join(" · ")}. No key ever spends WIF.</>,
          ]}
        />
      </Sec>

      <Sec title="Voter's Pass">
        <P>
          Wallets that voted with WIF in World is Fair get {pct(c?.voterDiscountPct)} off founding and feeding. Votes are checked every 3 hours. Link the voting wallet in Settings.
        </P>
      </Sec>
    </>
  );
}

export function HowToPlayScreen() {
  const cfg = useGameConfig().data;
  // Links like /how-to-play#raids arrive by in-app navigation, which doesn't jump to the section on its own.
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
    };
    const t = setTimeout(go, 50);
    window.addEventListener("hashchange", go);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", go);
    };
  }, []);
  return (
    <Screen back wide>
      <div className="c0-ht">
        <aside className="c0-ht__side"><Contents /></aside>
        <div className="c0-ht__body">
          <div className="c0-ht__logo"><img src="/logo.svg" alt="C0LONY" width={244} height={92} /></div>
          <Button variant="paper" fullWidth icon="live" onClick={openGuide}>Watch the 1-minute guide</Button>
          <Guide c={cfg} />
          <Card className="c0-ht__card"><P>Prices can change within limits set in the contract, and every change is public onchain.</P></Card>
        </div>
      </div>
    </Screen>
  );
}
