// viem adapters for the courier relay and the fee swap (the logic lives in relay.ts and swap.ts behind small interfaces).
import { BaseError, ContractFunctionRevertedError, keccak256, type Address, type Hash, type Hex, type PublicClient, type WalletClient } from "viem";
import { COURIER_ABI, type CourierChain } from "./relay.ts";
import type { PackChain } from "./gaspack.ts";
import type { SwapChain } from "./swap.ts";

const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

function revertName(err: unknown): string {
  if (err instanceof BaseError) {
    const r = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? r.reason ?? "reverted";
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

export function viemCourierChain(client: PublicClient, wallet: WalletClient, courier: Address, token: Address): CourierChain {
  const account = wallet.account!;
  const chain = wallet.chain;
  return {
    keeperBalance: () => client.getBalance({ address: account.address }),
    nonceOf: (a) => client.readContract({ address: courier, abi: COURIER_ABI, functionName: "nonces", args: [a as Address] }),
    tokenBalance: (a) => client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [a as Address] }),
    allowance: (a) => client.readContract({ address: token, abi: ERC20, functionName: "allowance", args: [a as Address, courier] }),
    async simulate(send, sig) {
      try {
        await client.simulateContract({ address: courier, abi: COURIER_ABI, functionName: "send", args: [send, sig], account });
        return null;
      } catch (err) {
        return revertName(err);
      }
    },
    send: (send, sig) =>
      wallet.writeContract({ address: courier, abi: COURIER_ABI, functionName: "send", args: [send, sig], account, chain }),
    async receipt(hash, timeoutMs) {
      try {
        const r = await client.waitForTransactionReceipt({ hash: hash as Hash, timeout: timeoutMs });
        return r.status === "success" ? "success" : "reverted";
      } catch {
        return "timeout";
      }
    },
  };
}

export function viemSwapChain(client: PublicClient, wallet: WalletClient, wif: Address): SwapChain {
  const account = wallet.account!;
  const chain = wallet.chain;
  const wait = async (hash: Hash) => (await client.waitForTransactionReceipt({ hash, timeout: 120_000 })).status === "success";
  return {
    ethBalance: () => client.getBalance({ address: account.address }),
    wifBalance: () => client.readContract({ address: wif, abi: ERC20, functionName: "balanceOf", args: [account.address] }),
    allowance: (spender) => client.readContract({ address: wif, abi: ERC20, functionName: "allowance", args: [account.address, spender as Address] }),
    async approve(spender, amount) {
      const hash = await wallet.writeContract({ address: wif, abi: ERC20, functionName: "approve", args: [spender as Address, amount], account, chain });
      if (!(await wait(hash))) throw new Error("the approval reverted");
    },
    async simulate(to, data, value) {
      try {
        await client.call({ account: account.address, to: to as Address, data: data as Hex, value });
        return true;
      } catch {
        return false;
      }
    },
    async send(to, data, value) {
      const hash = await wallet.sendTransaction({ to: to as Address, data: data as Hex, value, account, chain });
      return wait(hash);
    },
  };
}

/** Gas packs: plain ETH transfers from the keeper, signed first so the relay can save the hash before broadcasting. */
export function viemPackChain(client: PublicClient, wallet: WalletClient): PackChain {
  const account = wallet.account!;
  const chain = wallet.chain;
  return {
    ethBalance: (a) => client.getBalance({ address: a as Address }),
    gasPrice: () => client.getGasPrice(),
    async signEth(to, value) {
      const req = await wallet.prepareTransactionRequest({ account, chain, to: to as Address, value });
      // Headroom over the estimate: the chain can charge an L1 data component inside the gas limit. Unused gas isn't paid.
      const gas = req.gas !== undefined && req.gas * 2n > 30_000n ? req.gas * 2n : 30_000n;
      const raw = await wallet.signTransaction({ ...req, gas, account, chain } as never);
      return { hash: keccak256(raw), raw, nonce: Number(req.nonce) };
    },
    async broadcast(raw) {
      await client.sendRawTransaction({ serializedTransaction: raw as Hex });
    },
    keeperNonce: () => client.getTransactionCount({ address: account.address, blockTag: "latest" }),
  };
}
