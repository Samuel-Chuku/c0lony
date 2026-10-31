"use client";
// Sending game transactions. Each button owns one useAction(): busy while pending, a plain-English error
// under that same button when it fails (never a toast), and every cached read refreshed when it lands.
import { useCallback, useState } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  custom,
  keccak256,
  maxUint256,
  type Address,
  type Hash,
} from "viem";
import { colonyGameAbi, erc20Abi } from "./abi";
import { chain, publicClient } from "./chain";
import { GAME, WIF } from "./game";
import { useSession } from "./session";
import { invalidate } from "./store";
import type { ConnectedWallet } from "@privy-io/react-auth";

const ERRORS: Record<string, string> = {
  NotEnoughLeaves: "not enough leaves",
  NotEnoughSugar: "not enough sugar",
  NotReady: "not ready yet",
  AlreadyHasColony: "you already have a living colony",
  NoColony: "you have no colony this season",
  NotAlive: "that colony isn't alive",
  NotStarving: "the queen isn't starving",
  TooManyWorkers: "not enough ants for that",
  CannotRaidSelf: "you can't raid yourself",
  TooFewWorkers: "you need 10 ants to raid",
  OutOfRange: "they are out of raid range",
  TargetShielded: "they are shielded",
  TargetBusy: "they already have two raids coming",
  BadSoldiers: "up to 30% of your free ants can march",
  CollectFirst: "settle your finished raids first",
  GuardWindowClosed: "the guard window has closed",
  GuardWindowOpen: "the guard window is still open",
  AlreadyGuarded: "you already guarded this raid",
  RevealWindowClosed: "the reveal window has closed",
  BadCommitment: "this raid was sealed from another wallet",
  RoundNotPublished: "the drand round isn't out yet",
  SettleExpired: "this raid can only be collected now",
  BadSignature: "the drand signature didn't verify",
  NothingToCollect: "nothing to collect yet",
  NoAvenge: "this avenge has expired or was used",
  WrongStatus: "this raid has already moved on",
  NotRaider: "only the raider can do that",
  NotDefender: "only the defender can do that",
  ERC20InsufficientBalance: "not enough WIF",
  NothingToClaim: "nothing to claim",
  AlreadyClaimed: "already claimed",
  NotFinalized: "the season isn't settled yet",
  VoterAlreadyUsed: "this voting wallet already gave its pass",
  NotOnVoterList: "that wallet isn't on the voter list",
  BadVoterSignature: "the voting wallet's signature didn't match",
  AlreadyHasPass: "you already have a Voter's Pass",
};

/** Turns any wallet, RPC or contract error into a short reason for the Blocked line. */
export function reasonOf(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && ERRORS[name]) return ERRORS[name];
      if (name) return name;
    }
    const msg = `${err.shortMessage} ${err.details ?? ""}`.toLowerCase();
    if (msg.includes("rejected") || msg.includes("denied")) return "you cancelled it in your wallet";
    if (msg.includes("insufficient funds")) return "not enough ETH for gas. Add funds";
  }
  const text = String((err as { message?: string })?.message ?? err).toLowerCase();
  if (text.includes("rejected") || text.includes("denied")) return "you cancelled it in your wallet";
  if (text.includes("fetch") || text.includes("network") || text.includes("timeout")) return "the network didn't answer. Try again";
  return "something on the chain refused it. Try again";
}

export async function walletClientFor(wallet: ConnectedWallet) {
  await wallet.switchChain(chain.id);
  const provider = await wallet.getEthereumProvider();
  return createWalletClient({ account: wallet.address as Address, chain, transport: custom(provider) });
}

type GameCall = {
  functionName: string;
  args?: readonly unknown[];
  /** WIF this call spends; approves the game once (silently in the embedded wallet) when needed. */
  wif?: bigint;
};

export type ActionState = { busy: boolean; error: string | null; hash: Hash | null };

/**
 * One action per button. `run` returns the receipt's hash, or null when it failed (the error is in state).
 * `failVerb` starts the Blocked line: "Feeding failed · not enough WIF".
 */
export function useAction(failVerb: string) {
  const session = useSession();
  const [state, setState] = useState<ActionState>({ busy: false, error: null, hash: null });

  const run = useCallback(
    async (call: GameCall | ((client: Awaited<ReturnType<typeof walletClientFor>>) => Promise<Hash>)): Promise<Hash | null> => {
      if (!session.wallet) {
        setState({ busy: false, error: `${failVerb} failed · sign in first`, hash: null });
        return null;
      }
      setState({ busy: true, error: null, hash: null });
      try {
        const client = await walletClientFor(session.wallet);
        const account = client.account.address;
        let hash: Hash;
        if (typeof call === "function") {
          hash = await call(client);
        } else {
          if (call.wif && call.wif > 0n) {
            const allowance = await publicClient.readContract({ address: WIF, abi: erc20Abi, functionName: "allowance", args: [account, GAME] });
            if (allowance < call.wif) {
              const approve = await client.writeContract({ address: WIF, abi: erc20Abi, functionName: "approve", args: [GAME, maxUint256] });
              await publicClient.waitForTransactionReceipt({ hash: approve });
            }
          }
          const { request } = await publicClient.simulateContract({
            account,
            address: GAME,
            abi: colonyGameAbi,
            functionName: call.functionName as never,
            args: (call.args ?? []) as never,
          });
          hash = await client.writeContract(request as never);
        }
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("reverted");
        setState({ busy: false, error: null, hash });
        void invalidate();
        return hash;
      } catch (err) {
        setState({ busy: false, error: `${failVerb} failed · ${reasonOf(err)}`, hash: null });
        return null;
      }
    },
    [session.wallet, failVerb],
  );

  return { ...state, run, reset: () => setState({ busy: false, error: null, hash: null }) };
}

// ---- raids

/** Must match keeper/src/raidSalt.ts: the raider's wallet signs this, salt = keccak256(signature). */
export function raidSaltMessage(chainId: number, game: string, raidId: bigint): string {
  return `C0LONY raid salt\nchain: ${chainId}\ngame: ${game.toLowerCase()}\nraid: ${raidId}`;
}

export async function raidSalt(client: Awaited<ReturnType<typeof walletClientFor>>, raidId: bigint): Promise<Hash> {
  const signature = await client.signMessage({ account: client.account, message: raidSaltMessage(chain.id, GAME, raidId) });
  return keccak256(signature);
}
