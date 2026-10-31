import { createPublicClient, defineChain, http } from "viem";
import { CONFIG, NETWORK } from "../config";

// Robinhood Chain (or its testnet) as a viem chain, from config.ts. Gas is paid in ETH.
export const chain = defineChain({
  id: NETWORK.chainId,
  name: NETWORK.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.rpcUrl] } },
  blockExplorers: { default: { name: "Explorer", url: NETWORK.explorerUrl } },
  testnet: NETWORK.chainId !== 4663,
});

export const publicClient = createPublicClient({ chain, transport: http(CONFIG.rpcUrl) });

export const txUrl = (hash: string) => `${NETWORK.explorerUrl}/tx/${hash}`;
export const addressUrl = (address: string) => `${NETWORK.explorerUrl}/address/${address}`;
