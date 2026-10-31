import { createWalletClient, http, type Address, type Hash, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { colonyGameAbi } from "../abi.ts";
import { makeChain } from "../chain.ts";
import type { Config } from "../config.ts";
import type { SettleWallet } from "./settler.ts";

/** The keeper wallet: sends settle/collect and waits for the receipt before returning. */
export function makeSettleWallet(cfg: Config, client: PublicClient): SettleWallet {
  const account = privateKeyToAccount(cfg.keeperPrivateKey as Hash);
  const wallet = createWalletClient({ account, chain: makeChain(cfg), transport: http(cfg.rpcUrl) });
  const address = cfg.colonyGameAddress as Address;
  return {
    balance: () => client.getBalance({ address: account.address }),
    async send(fn, raidId, signature) {
      const hash =
        fn === "settle"
          ? await wallet.writeContract({ address, abi: colonyGameAbi, functionName: "settle", args: [raidId, signature as `0x${string}`] })
          : await wallet.writeContract({ address, abi: colonyGameAbi, functionName: "collect", args: [raidId] });
      const receipt = await client.waitForTransactionReceipt({ hash });
      return receipt.status === "success";
    },
  };
}
