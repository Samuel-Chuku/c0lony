"use client";
// Result-modal content for each game action, read from the transaction's own events.
import type { ReactNode } from "react";
import type { TransactionReceipt } from "viem";
import { ResIcon } from "../ui/ResIcon";
import { RES, displayName, fmtDuration, fmtRes, fmtWif } from "./format";
import { Outcome, Resource } from "./game";
import { eventsOf, type SuccessContent } from "./tx";

type Rec = TransactionReceipt;

const resName = (r: unknown) => (Number(r) === Resource.Leaves ? "leaves" : "sugar");
const iconOf = (r: unknown, size = 20) => (
  <ResIcon name={Number(r) === Resource.Leaves ? "leaf" : "sugar"} size={size} label={resName(r)} />
);
export const foundedResult = () => (r?: Rec): SuccessContent => ({
  title: "Colony founded",
  lines: [
    deltas(delta(10n, "ant"), delta(whole(20), "leaf"), delta(whole(20), "sugar")),
    "2 nest chambers dug · queen fed for 72 hours",
    ...(r ? [paidLine(r)].filter(Boolean) : []),
    "New wallets also get a little gas ETH sent to them.",
  ],
});

/** A gain or a loss: "+8 [ant]" or "−3 [leaf]". */
const delta = (n: bigint, kind: "leaf" | "sugar" | "ant"): ReactNode => (
  <span className="c0-delta" key={kind + String(n)}>
    <b>{n < 0n ? "−" : "+"}{kind === "ant" ? String(n < 0n ? -n : n) : fmtRes(n < 0n ? -n : n)}</b>
    <ResIcon name={kind} size={20} label={kind === "leaf" ? "leaves" : kind === "sugar" ? "sugar" : "ants"} />
  </span>
);
const deltas = (...parts: Array<ReactNode | null>): ReactNode => <span className="c0-deltas">{parts}</span>;
const whole = (n: unknown) => BigInt(String(n ?? 0)) * RES; // events carry ant counts and build costs in whole units

/** "−100 WIF · 70 to the pot · 20 burned", from the transaction's Paid event. */
const paidLine = (r: Rec): ReactNode => {
  const paid = eventsOf(r, "Paid")[0];
  return paid ? `−${fmtWif(BigInt(paid.amount))} WIF · ${fmtWif(BigInt(paid.toPot))} to the pot · ${fmtWif(BigInt(paid.burned))} burned` : null;
};

/** The feeding result: gains and losses as + and −, then the queen, the colony, the score and the WIF. */
export const fedResult = (r: Rec): SuccessContent => {
  const e = eventsOf(r, "QueenFed")[0];
  if (!e) return { title: "The colony is fed", lines: ["Fed for 72 hours."] };
  const born = Number(e.born);
  const died = Number(e.died);
  const after = Number(e.workersAfter);
  const ate = after - born; // every ant that lived through the meal ate 1 sugar
  const sugarUsed = whole(ate + born * 2);
  const by = new Date(Number(e.fedUntil) * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const lines: ReactNode[] = [
    deltas(
      delta(-whole(3), "leaf"),
      sugarUsed > 0n ? delta(-sugarUsed, "sugar") : null,
      born > 0 ? delta(BigInt(born), "ant") : null,
      died > 0 ? delta(-BigInt(died), "ant") : null,
    ),
    `Queen fed · feed her again by ${by}`,
    `${after} ${after === 1 ? "ant" : "ants"} in the colony · +${String(e.scoreAdded ?? 0)} score`,
  ];
  const paid = paidLine(r);
  if (paid) lines.push(paid);
  return { title: "The colony is fed", lines };
};

/** What was waiting when the player tapped Tend, used to split the totals by source. */
export type TendSnapshot = { leafTrips: number; sugarTrips: number; trip: { leaves: number; sugar: number } };

const icon = (kind: "leaf" | "sugar") => <ResIcon name={kind} size={16} label={kind === "leaf" ? "leaves" : "sugar"} />;

/** The tend result: totals as + amounts, then where they came from (trails, farms, forage trips). */
export const tendResult = (r: Rec, snap?: TendSnapshot | null): SuccessContent => {
  const e = eventsOf(r, "Tended")[0];
  if (!e) return { title: "Tended", lines: ["Everything that was home is in the store."] };
  const l = BigInt(e.leavesGained ?? 0);
  const s = BigInt(e.sugarGained ?? 0);
  if (l < RES && s < RES) return { title: "Tended", lines: ["Nothing was ready yet."] };
  const lines: ReactNode[] = [deltas(l >= RES ? delta(l, "leaf") : null, s >= RES ? delta(s, "sugar") : null)];
  if (snap) {
    // Forage trips are whole amounts; whatever is left over came from trails and farms.
    const fl = whole(snap.leafTrips * snap.trip.leaves);
    const fs = whole(snap.sugarTrips * snap.trip.sugar);
    const trails = l > fl ? l - fl : 0n;
    const farms = s > fs ? s - fs : 0n;
    if (trails >= RES) lines.push(<>Trails · +{fmtRes(trails)} {icon("leaf")}</>);
    if (farms >= RES) lines.push(<>Farms · +{fmtRes(farms)} {icon("sugar")}</>);
    const trips = snap.leafTrips + snap.sugarTrips;
    if (trips > 0) {
      lines.push(
        <>
          Foragers · {trips} {trips === 1 ? "trip" : "trips"}
          {fl > 0n ? <> · +{fmtRes(fl)} {icon("leaf")}</> : null}
          {fs > 0n ? <> · +{fmtRes(fs)} {icon("sugar")}</> : null}
        </>,
      );
      lines.push("Pantry emptied");
    }
  }
  return { title: "Tended", lines };
};

/** Speed-up: everything waiting in that side of the pantry plus one extra trip, paid in WIF. */
export const speedUpResult = (forage: number, snap?: TendSnapshot | null) => (r: Rec): SuccessContent => {
  const leaf = forage === Resource.Leaves;
  const kind = leaf ? "leaf" : "sugar";
  const waiting = snap ? (leaf ? snap.leafTrips : snap.sugarTrips) : null;
  const per = snap ? (leaf ? snap.trip.leaves : snap.trip.sugar) : null;
  const lines: ReactNode[] = [];
  if (waiting !== null && per !== null) {
    lines.push(deltas(delta(whole((waiting + 1) * per), kind)));
    lines.push(waiting > 0 ? `${waiting} ${waiting === 1 ? "trip" : "trips"} from the pantry + 1 extra trip` : "1 extra trip");
  } else {
    lines.push("Your foragers brought one extra trip home.");
  }
  const paid = paidLine(r);
  if (paid) lines.push(paid);
  lines.push(`Next ${leaf ? "leaf" : "sugar"} speed-up in 24h`);
  return { title: `${leaf ? "Leaf" : "Sugar"} foragers are home`, lines };
};

export const builtResult = (noun: string, plural: string) => (r: Rec): SuccessContent => {
  const e = eventsOf(r, "Built")[0];
  const n = e ? Number(e.newCount) : null;
  const lines: ReactNode[] = [n !== null ? `You now have ${n} ${n === 1 ? noun : plural}.` : `Built.`];
  if (e) {
    const l = whole(e.leavesCost);
    const s = whole(e.sugarCost);
    if (l > 0n || s > 0n) lines.unshift(deltas(l > 0n ? delta(-l, "leaf") : null, s > 0n ? delta(-s, "sugar") : null));
  }
  return { title: noun === "nest chamber" ? "Chamber dug" : noun === "leafcutter trail" ? "Trail built" : "Farm built", lines };
};

export const assignResult = (r: Rec): SuccessContent => {
  const e = eventsOf(r, "WorkersAssigned")[0];
  if (!e) return { title: "Assignments saved" };
  return {
    title: "Assignments saved",
    lines: [
      <><ResIcon name="trail" size={20} label="trails" /> {Number(e.trailWorkers)} on trails</>,
      <><ResIcon name="farm" size={20} label="farms" /> {Number(e.farmWorkers)} on farms</>,
      <><ResIcon name="ant" size={20} label="ants" /> {Number(e.idle)} free</>,
    ],
  };
};

export const shieldResult = (r: Rec, duration: number): SuccessContent => {
  const e = eventsOf(r, "Shielded")[0];
  const until = e ? new Date(Number(e.until) * 1000) : new Date(Date.now() + duration * 1000);
  const t = until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return {
    title: `Shielded for ${fmtDuration(duration)}`,
    lines: [`No new raids can be sealed on you until ${t}.`, "Raids already marching still land.", paidLine(r)].filter(Boolean),
  };
};

export const revivedResult = () => (r?: Rec): SuccessContent => ({
  title: "The queen is back",
  lines: ["She is alive and fed for 72 hours.", ...(r ? [paidLine(r)].filter(Boolean) : [])],
});

export const guardResult = (resource: number): SuccessContent => ({
  title: "Guarding " + resName(resource),
  lines: [<>{iconOf(resource)} You&apos;re guarding {resName(resource)}.</>, "If they aim there, the raid fails and a quarter of their ants fall."],
});

/** Raid launched: who marches, and when the guard window closes (the raid reveals itself after it). */
export const sealedResult = (handle: string, soldiers: number, avenged: boolean, guardWindow = 0, revealWindow = 0, cooldown = 0) => (): SuccessContent => {
  const at = (sec: number) => {
    const d = new Date(Date.now() + sec * 1000);
    const sameDay = d.toDateString() === new Date().toDateString();
    return d.toLocaleString([], sameDay ? { hour: "2-digit", minute: "2-digit" } : { weekday: "short", hour: "2-digit", minute: "2-digit" });
  };
  return {
    title: avenged ? `Avenge sealed on ${handle}` : `Raid sealed on ${handle}`,
    tone: "raid",
    link: { href: "/?tab=raids", label: "Follow it on the Raids tab" },
    lines: [
      <span className="c0-deltas" key="m"><span className="c0-delta"><b>{soldiers}</b><ResIcon name="ant" size={20} label="ants" /></span> marching out</span>,
      "Your target stays hidden until the roll",
      guardWindow > 0 ? `They can guard until ${at(guardWindow)} · then it reveals itself` : "It reveals itself after their guard window closes",
      avenged ? "Free raid back · no cooldown used" : cooldown > 0 ? `Next raid in ${fmtDuration(cooldown)}` : null,
    ].filter((l) => l !== null),
  };
};

export const revealResult = (): SuccessContent => ({
  title: "Raid revealed",
  tone: "raid",
  lines: ["Your target is out. The roll comes from a public drand round.", "Settle it as soon as the round is published."],
});

/** A settled raid, from the chain event or a feed row, told from one side. */
export type RaidOutcome = {
  raidId: string;
  outcome: "won" | "guarded" | "held";
  raider: string;
  defender: string;
  lootKind: "leaf" | "sugar";
  loot: bigint; // resource units
  pct: number;
  lost: number;
};

// Raids whose result window has already been shown in this app load, so the raid watcher doesn't repeat it.
const shownRaids = new Set<string>();
export const raidShown = (id: string) => shownRaids.has(id);
export const markRaidShown = (id: string) => void shownRaids.add(id);

/** The raid result window: + and − first, then what happened, then the score it earns. */
export function raidResult(o: RaidOutcome, me: string | null): SuccessContent {
  markRaidShown(o.raidId);
  const meL = me?.toLowerCase() ?? "";
  const asRaider = o.raider.toLowerCase() === meL;
  const asDefender = o.defender.toLowerCase() === meL;
  const them = displayName(asRaider ? o.defender : o.raider);
  const lostAnts = o.lost > 0 ? delta(-BigInt(o.lost), "ant") : null;
  const report = { href: `/report?raid=${o.raidId}`, label: "Read the raid report" };
  if (o.outcome === "won") {
    if (asRaider) {
      return { title: "Raid won", tone: "raid", link: report, lines: [
        deltas(o.loot >= RES ? delta(o.loot, o.lootKind) : null, lostAnts),
        `Your ants raided ${them} and took ${o.pct}% of the ${o.lootKind === "leaf" ? "leaves" : "sugar"}`,
        "+25 score at your next feeding",
      ] };
    }
    if (asDefender) {
      return { title: "You were raided", tone: "raid", link: { href: `/?tab=raids&avenge=${o.raider.toLowerCase()}`, label: "Avenge · raid them back for free" }, lines: [
        deltas(o.loot >= RES ? delta(-o.loot, o.lootKind) : null),
        `${them} took ${o.pct}% of your ${o.lootKind === "leaf" ? "leaves" : "sugar"}`,
      ] };
    }
  }
  if (o.outcome === "guarded") {
    if (asRaider) return { title: "Raid lost", tone: "raid", link: report, lines: [deltas(lostAnts), `${them} guarded the right store`, `${o.lost} of your marching ants fell`] };
    if (asDefender) return { title: "Your guard held", tone: "raid", link: report, lines: [`You guarded the right store against ${them}`, o.lost > 0 ? `${o.lost} of their ants fell` : "Their ants went home empty", "+10 score at your next feeding"] };
  }
  if (asRaider) return { title: "Raid lost", tone: "raid", link: report, lines: [lostAnts ? deltas(lostAnts) : "No loot this time", `${them} held your ants off`] };
  if (asDefender) return { title: "Raid held off", tone: "raid", link: report, lines: ["Nothing taken", `Your colony held off ${them}`] };
  return { title: "Raid settled", tone: "raid", link: report, lines: [o.outcome === "won" ? `${displayName(o.raider)} raided ${displayName(o.defender)}` : `${displayName(o.defender)} held`] };
}

export const settleResult = (r: Rec, myOwner: string | null): SuccessContent => {
  const e = eventsOf(r, "RaidSettled")[0];
  if (!e) return { title: "Raid settled" };
  const out = Number(e.outcome);
  return raidResult({
    raidId: String(e.raidId),
    outcome: out === Outcome.RaiderWon ? "won" : out === Outcome.Guarded ? "guarded" : "held",
    raider: String(e.raiderOwner),
    defender: String(e.defenderOwner),
    lootKind: Number(e.lootResource) === Resource.Leaves ? "leaf" : "sugar",
    loot: BigInt(e.lootAmount ?? 0),
    pct: Number(e.roll),
    lost: Number(e.soldiersLost),
  }, myOwner);
};

/** A raid closed without a roll: missed reveal (raiders lost) or no settle in 48h (raiders home). */
export function collectedResult(raidId: string, lost: number, asRaider: boolean): SuccessContent {
  markRaidShown(raidId);
  return {
    title: "Raid closed",
    tone: "raid",
    lines: asRaider
      ? [lost > 0 ? deltas(delta(-BigInt(lost), "ant")) : "Your ants are home.", lost > 0 ? "Lost for missing the reveal" : "No roll came, so nothing was taken"]
      : ["The raid on you ended without a roll", "Nothing was taken"],
  };
}

export const collectResult = (r: Rec): SuccessContent => {
  const e = eventsOf(r, "RaidCollected")[0];
  return collectedResult(e ? String(e.raidId) : "", e ? Number(e.soldiersLost) : 0, true);
};

export const claimResult = (amount: bigint, season: number): SuccessContent => ({
  title: "Pot share claimed",
  lines: [`${fmtWif(amount)} WIF sent to your wallet from season ${season}.`],
});
