import { createWalletClient, type Address, type Hash, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { colonyGameAbi } from "../abi.ts";
import { makeChain, rpcTransport } from "../chain.ts";
import type { Config } from "../config.ts";
import type { SettleWallet } from "./settler.ts";

/** The keeper wallet: sends reveal/settle/collect and waits for the receipt before returning. */
export function makeSettleWallet(cfg: Config, client: PublicClient): SettleWallet {
  const account = privateKeyToAccount(cfg.keeperPrivateKey as Hash);
  const wallet = createWalletClient({ account, chain: makeChain(cfg), transport: rpcTransport(cfg.rpcUrls) });
  const address = cfg.colonyGameAddress as Address;
  return {
    balance: () => client.getBalance({ address: account.address }),
    async send(fn, raidId, arg) {
      const hash =
        fn === "settle"
          ? await wallet.writeContract({ address, abi: colonyGameAbi, functionName: "settle", args: [raidId, arg as `0x${string}`] })
          : fn === "reveal" && arg && typeof arg === "object"
            ? await wallet.writeContract({ address, abi: colonyGameAbi, functionName: "reveal", args: [raidId, arg.target, arg.salt] })
            : await wallet.writeContract({ address, abi: colonyGameAbi, functionName: "collect", args: [raidId] });
      const receipt = await client.waitForTransactionReceipt({ hash });
      return receipt.status === "success";
    },
  };
}
