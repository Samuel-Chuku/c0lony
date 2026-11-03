"use client";
// Result-modal content for each game action, read from the transaction's own events.
import type { ReactNode } from "react";
import type { TransactionReceipt } from "viem";
import { ResIcon } from "../ui/ResIcon";
import { RES, fmtDuration, fmtRes, fmtWif } from "./format";
import { Outcome, Resource } from "./game";
import { eventsOf, type SuccessContent } from "./tx";

type Rec = TransactionReceipt;

const resName = (r: unknown) => (Number(r) === Resource.Leaves ? "leaves" : "sugar");
const iconOf = (r: unknown, size = 20) => (
  <ResIcon name={Number(r) === Resource.Leaves ? "leaf" : "sugar"} size={size} label={resName(r)} />
);
const amt = (units: bigint, kind: "leaf" | "sugar"): ReactNode => (
  <>{fmtRes(units)} <ResIcon name={kind} size={20} label={kind === "leaf" ? "leaves" : "sugar"} /></>
);

export const foundedResult = (): SuccessContent => ({
  title: "Colony founded",
  lines: [
    "10 ants and 2 nest chambers dug in.",
    "20 leaves and 20 sugar in the store.",
    "Your queen is fed for 72 hours.",
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
  const paid = eventsOf(r, "Paid")[0];
  if (paid) lines.push(`−${fmtWif(BigInt(paid.amount))} WIF · ${fmtWif(BigInt(paid.toPot))} to the pot · ${fmtWif(BigInt(paid.burned))} burned`);
  return { title: "The colony is fed", lines };
};

export const tendResult = (r: Rec): SuccessContent => {
  const e = eventsOf(r, "Tended")[0];
  if (!e) return { title: "Tended", lines: ["Everything that was home is in the store."] };
  const l = BigInt(e.leavesGained ?? 0);
  const s = BigInt(e.sugarGained ?? 0);
  const lines: ReactNode[] = [];
  if (l > 0n || s > 0n) lines.push(deltas(l > 0n ? delta(l, "leaf") : null, s > 0n ? delta(s, "sugar") : null));
  else lines.push("Nothing was ready yet.");
  return { title: "Tended", lines };
};

export const speedUpResult = (forage: number) => (r: Rec): SuccessContent => {
  const e = eventsOf(r, "Tended")[0];
  const kind = forage === Resource.Leaves ? "leaf" : "sugar";
  const got = e ? BigInt((forage === Resource.Leaves ? e.leavesGained : e.sugarGained) ?? 0) : 0n;
  return {
    title: `${forage === Resource.Leaves ? "Leaf" : "Sugar"} foragers are home`,
    lines: [got > 0n ? deltas(delta(got, kind)) : "Collected what they carried.", `Next ${forage === Resource.Leaves ? "leaf" : "sugar"} speed-up in 24h.`],
  };
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
    lines: [`No new raids can be sealed on you until ${t}.`, "Raids already marching still land."],
  };
};

export const revivedResult = (): SuccessContent => ({
  title: "The queen is back",
  lines: ["She is alive and fed again."],
});

export const guardResult = (resource: number): SuccessContent => ({
  title: "Guarding " + resName(resource),
  lines: [<>{iconOf(resource)} You&apos;re guarding {resName(resource)}.</>, "If they aim there, the raid fails and a quarter of their ants fall."],
});

export const sealedResult = (handle: string, soldiers: number, avenged: boolean) => (): SuccessContent => ({
  title: avenged ? `Avenge sealed on ${handle}` : `Raid sealed on ${handle}`,
  tone: "raid",
  lines: [`${soldiers} ${soldiers === 1 ? "ant" : "ants"} marching`, "Target hidden until the roll.", "Reveal it after their guard window closes."],
});

export const revealResult = (): SuccessContent => ({
  title: "Raid revealed",
  tone: "raid",
  lines: ["Your target is out. The roll comes from a public drand round.", "Settle it as soon as the round is published."],
});

export const settleResult = (r: Rec, myOwner: string | null): SuccessContent => {
  const e = eventsOf(r, "RaidSettled")[0];
  if (!e) return { title: "Raid settled" };
  const outcome = Number(e.outcome);
  const mineAsRaider = !!myOwner && String(e.raiderOwner).toLowerCase() === myOwner.toLowerCase();
  const lootKind = Number(e.lootResource) === Resource.Leaves ? "leaf" : "sugar";
  const loot = BigInt(e.lootAmount ?? 0);
  const lost = Number(e.soldiersLost);
  const lines: ReactNode[] = [];
  let title = "Raid settled";
  if (outcome === Outcome.RaiderWon) {
    title = mineAsRaider ? "Raid won" : "Raid settled: the raider won";
    lines.push(loot > 0n ? <>{mineAsRaider ? "Carried home" : "Taken"} {amt(loot, lootKind)} · {String(e.roll)}% of the store</> : "No loot this time.");
  } else if (outcome === Outcome.Guarded) {
    title = mineAsRaider ? "Raid lost" : "Raid stopped";
    lines.push("The guard held the right store.");
  } else {
    title = mineAsRaider ? "Raid lost" : "Raid held off";
    lines.push("The defenders held.");
  }
  if (lost > 0) lines.push(`${lost} marching ${lost === 1 ? "ant" : "ants"} fell`);
  return { title, tone: "raid", lines };
};

export const collectResult = (r: Rec): SuccessContent => {
  const e = eventsOf(r, "RaidCollected")[0];
  const lost = e ? Number(e.soldiersLost) : 0;
  return {
    title: "Raid closed",
    tone: "raid",
    lines: [lost > 0 ? `${lost} marching ${lost === 1 ? "ant was" : "ants were"} lost for missing the reveal.` : "Your ants are home."],
  };
};

export const claimResult = (amount: bigint, season: number): SuccessContent => ({
  title: "Pot share claimed",
  lines: [`${fmtWif(amount)} WIF sent to your wallet from season ${season}.`],
});
