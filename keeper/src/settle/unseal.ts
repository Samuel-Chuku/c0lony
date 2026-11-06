// Opens a raid's timelocked target. At launch the app encrypts 33 bytes (the target, 1 = leaves or 2 = sugar,
// then the 32-byte salt) to a drand quicknet round that comes after the guard window, and posts the armored
// ciphertext with the raid (RaidSealed). Nobody can open it before that round, the keeper included. After it,
// anyone can, and the keeper reveals the raid so the raider never has to come back.
//
// quicknet is used only for this timelock (tlock-js supports BLS12-381 networks, not evmnet). The raid's roll still
// comes from an evmnet round assigned at reveal and verified onchain.
import { encodeAbiParameters, hexToString, keccak256, toHex, type Hex } from "viem";
import { mainnetClient, timelockDecrypt } from "tlock-js";

export type Opened = { target: number; salt: Hex };
/** "early": the round has not opened it yet (or drand could not be reached), try again later. null: it never will. */
export type Unsealer = (sealedHex: Hex) => Promise<Opened | "early" | null>;

/** The 33-byte payload the app timelocks. */
export function parsePayload(bytes: Uint8Array): Opened | null {
  if (bytes.length !== 33) return null;
  const target = bytes[0];
  if (target !== 1 && target !== 2) return null;
  return { target, salt: toHex(bytes.slice(1)) };
}

/** keccak256(abi.encode(target, salt, raidId)), as ColonyGame.commitmentFor. */
export function commitmentFor(target: number, salt: Hex, raidId: bigint): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }, { type: "uint256" }], [target, salt, raidId]));
}

export function makeUnsealer(): Unsealer {
  const client = mainnetClient(); // drand quicknet, with its public key pinned so beacons are verified
  return async (sealedHex) => {
    let armored: string;
    try {
      armored = hexToString(sealedHex);
    } catch {
      return null;
    }
    try {
      return parsePayload(new Uint8Array(await timelockDecrypt(armored, client)));
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      if (/too early|fetch|network|ECONN|ETIMEDOUT|5\d\d/i.test(m)) return "early";
      return null; // malformed or not a tlock ciphertext
    }
  };
}
