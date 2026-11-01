"use client";
// The full guide. Every number comes from the live game config (useGameConfig); the few fixed rules mirror
// constants in the contract (ColonyGame.sol, SeasonPot.sol).
import type { ReactNode } from "react";
import { Card, ResIcon, type ResIconName } from "../../ui";
import { Screen } from "../../shell/Screen";
import { fmtDuration, fmtWif } from "../../lib/format";
import { useGameConfig, type GameConfig } from "../../lib/game";

const STARVE_HOURS = 72;
const REVIVE_HOURS = 24;
const AVENGE_HOURS = 24;
const CLAIM_DAYS = 30;

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="c0-ht__card c0-ht__sec">
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
  const w = (v?: bigint) => (v === undefined ? "…" : `${fmtWif(v)} WIF`);
  const pct = (v?: number) => (v === undefined ? "…" : `${v}%`);
  return (
    <>
      <Sec title="The goal">
        <P>Keep your queen alive, grow your colony, and finish the season with a high score. Colonies that finish high share the season pot in WIF.</P>
      </Sec>

      <Sec title="Your queen">
        <UL
          items={[
            <>Feed her at most once every {d(c?.feedMinInterval)}. Feeding costs {w(c?.feedPrice)} and 3 <ResIcon name="leaf" size={16} label="leaves" />.</>,
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
            <>Hand foragers bring <ResIcon name="leaf" size={16} label="leaves" /> every {d(c?.leafForageCooldown)} and <ResIcon name="sugar" size={16} label="sugar" /> every {d(c?.sugarForageCooldown)}. Tend collects them.</>,
            <>Speed up finishes a forage now for {w(c?.speedUpPrice)}, once per {d(c?.speedUpCooldown)}.</>,
            <>Trails make leaves and farms make sugar nonstop while ants are assigned to them.</>,
          ]}
        />
      </Sec>

      <Sec title="Buildings">
        <table className="c0-ht__table">
          <thead><tr><th>Building</th><th>Holds</th><th>Cost</th></tr></thead>
          <tbody>
            <tr><td><Ico name="chamber">Chamber</Ico></td><td>5 ants</td><td>the most of 10, your chambers, or ants ÷ 5, in leaves</td></tr>
            <tr><td><Ico name="trail">Trail</Ico></td><td>up to 100 ants, makes leaves</td><td>the most of 50, 2 × chambers, or ants ÷ 2, in leaves</td></tr>
            <tr><td><Ico name="farm">Farm</Ico></td><td>up to 100 ants, makes sugar</td><td>the most of 25, chambers, or ants ÷ 4, in leaves and the same in sugar</td></tr>
          </tbody>
        </table>
        <P>Costs grow as your colony grows. Ants not assigned to a trail or farm are free ants: they can raid and guard.</P>
      </Sec>

      <Sec title="Raids">
        <UL
          items={[
            <>You need 10 ants. Send up to 30% of your free ants. Targets must be between half and double your size.</>,
            <>You seal your target, leaves or sugar, so nobody can see it. The defender has {d(c?.guardWindow)} to guard one of the two.</>,
            <>Your odds are {pct(c?.winOddsUnguarded)} if they guard nothing, and {pct(c?.winOddsGuardedOther)} if they guard the other resource.</>,
            <>If they guard the right one, you lose half your soldiers and the defender takes 10 to 15% of your stock of a random resource.</>,
            <>A win takes 20 to 30% of the target stock, capped at 5 per soldier.</>,
            <>Raids can be launched once per {d(c?.raidCooldown)}.</>,
            <>The roll comes from a public drand round, so anyone can check it was fair.</>,
          ]}
        />
      </Sec>

      <Sec title="Avenge">
        <P>If someone wins a raid against you, you get a free raid back at them for {AVENGE_HOURS} hours. It skips your raid cooldown and can be used once.</P>
      </Sec>

      <Sec title="Shield">
        <P>For {w(c?.shieldPrice)}, a shield stops new raids on you for {d(c?.shieldDuration)}. You can raise one once per {d(c?.shieldCooldown)}.</P>
      </Sec>

      <Sec title="The season and the pot">
        <UL
          items={[
            <>Of every WIF payment, 70% goes to the pot, 20% is burned and 10% goes to the treasury.</>,
            <>When the season ends, half the pot is shared by score among every colony alive at the end and fed at least twice. The other half is shared by score among the top quarter.</>,
            <>Claim your share from the Season tab after it ends. Unclaimed shares roll into the next pot after {CLAIM_DAYS} days.</>,
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
  return (
    <Screen back>
      <div className="c0-ht__logo"><img src="/logo.svg" alt="C0LONY" width={244} height={92} /></div>
      <Guide c={cfg} />
      {cfg ? <Card className="c0-ht__card"><P>Founding a colony costs {fmtWif(cfg.foundPrice)} WIF. Prices can change within limits set in the contract.</P></Card> : null}
    </Screen>
  );
}
