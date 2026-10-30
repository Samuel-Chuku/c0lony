import { keccak256, type Address, type Hash } from "viem";

/** The message a raider's wallet signs to derive a raid's salt. Deterministic, so any device can regenerate it. */
export function raidSaltMessage(chainId: number, game: Address, raidId: bigint): string {
  return `C0LONY raid salt\nchain: ${chainId}\ngame: ${game.toLowerCase()}\nraid: ${raidId}`;
}

/**
 * salt = keccak256(signature of raidSaltMessage). ECDSA signatures from standard wallets are deterministic
 * (RFC 6979), so signing again on another device gives the same salt, and nobody without the key can compute it.
 */
export async function raidSalt(
  wallet: { signMessage: (args: { message: string }) => Promise<Hash> },
  chainId: number,
  game: Address,
  raidId: bigint,
): Promise<Hash> {
  return keccak256(await wallet.signMessage({ message: raidSaltMessage(chainId, game, raidId) }));
}
