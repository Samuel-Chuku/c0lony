// Dev-only sample data for screenshots (?demo=1). Never reached in production builds.
import type { ColonyRow, GameConfig, Profile, Raid } from "../../lib/game";

const RES = 1_000_000_000n;
const row = (id: number, workers: number, sugar: number, extra: Partial<ColonyRow> = {}): ColonyRow => ({
  id: BigInt(id), owner: `0x${id.toString(16).padStart(40, "a")}`, status: 1, workers, capacity: 60, idle: workers, leaves: 0n,
  sugar: BigInt(sugar) * RES, score: 0n, feedCount: 2, fedUntil: Math.floor(Date.now() / 1000) + 60 * 3600, shieldUntil: 0, openIncoming: 0, lastRaidLaunch: 0, foundedAt: 0, ...extra,
});

export const demoCfg = { winOddsUnguarded: 65, winOddsGuardedOther: 50, guardWindow: 14400n, revealWindow: 86400n, raidCooldown: 21600n, shieldPrice: 1000n * 10n ** 18n, shieldCooldown: 86400n } as unknown as GameConfig;

export function demoData(now: number) {
  const me = "0x00000000000000000000000000000000000000d0";
  const colonies = [
    row(2, 24, 1900), row(3, 15, 820), row(4, 31, 2600), row(5, 22, 1750), row(6, 9, 1300), row(7, 12, 640, { feedCount: 0 }),
    row(8, 18, 500, { shieldUntil: now + 3 * 3600 }), row(1, 20, 900, { owner: me }),
  ];
  const profile = { colonyId: 1n, status: 1, ants: 20, freeAnts: 20, shieldUntil: 0n, season: 1 } as unknown as Profile;
  const raids = [
    { id: 10n, raider: 2n, defender: 1n, soldiers: 6, status: 1, guard: 0, target: 0, outcome: 0, launchedAt: BigInt(now - 3600), round: 0n, commitment: "0x00" },
    { id: 11n, raider: 1n, defender: 3n, soldiers: 5, status: 1, guard: 0, target: 0, outcome: 0, launchedAt: BigInt(now - 20000), round: 0n, commitment: "0x00" },
  ] as unknown as Raid[];
  return { me, colonies, profile, raids };
}
