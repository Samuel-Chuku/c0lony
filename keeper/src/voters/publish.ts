import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Publishes the Voter's Pass as static files that Caddy serves from the VPS:
 *   <dir>/voters.json            the full public list and root (anyone can rebuild the root from it)
 *   <dir>/proofs/<address>.json  { address, root, proof } for each voter, address lowercased
 * An address with no file has no pass. The proofs folder is built beside the live one and swapped in with
 * renames, so readers never see a half-written set. Each file carries the root it was built for; the app
 * uses a proof only if that root matches ColonyGame.voterRoot().
 */
export function publishVoterFiles(dir: string, list: { root: string } & Record<string, unknown>, proofs: Record<string, string[]>) {
  mkdirSync(dir, { recursive: true });
  const live = join(dir, "proofs");
  const next = join(dir, "proofs.next");
  const old = join(dir, "proofs.old");
  rmSync(next, { recursive: true, force: true });
  mkdirSync(next);
  for (const [address, proof] of Object.entries(proofs)) {
    const a = address.toLowerCase();
    writeFileSync(join(next, `${a}.json`), JSON.stringify({ address: a, root: list.root, proof }) + "\n");
  }
  rmSync(old, { recursive: true, force: true });
  if (existsSync(live)) renameSync(live, old);
  renameSync(next, live);
  rmSync(old, { recursive: true, force: true });

  const tmp = join(dir, "voters.json.tmp");
  writeFileSync(tmp, JSON.stringify(list, null, 2) + "\n");
  renameSync(tmp, join(dir, "voters.json"));
}
