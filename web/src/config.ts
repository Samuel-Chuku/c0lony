// Every public value the site needs, per network, in one committed file (see docs/DEPLOYMENTS.md for sources).
// Nothing here is secret: all of it ships inside the static site anyway. The build only picks the network:
//   NEXT_PUBLIC_NETWORK = "testnet" (default) | "mainnet"
// Changing an address means editing this file and pushing; no hosting dashboard changes.

export const NETWORKS = {
  testnet: {
    chainId: 46630,
    telegram: false, // Telegram alerts run on mainnet only
    names: false, // this deployment predates setName; names arrive with the next deploy
    // First block of the current game deployment. The live feed ignores older events (earlier test games).
    deployBlock: 149189109,
    name: "Robinhood Chain Testnet",
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    contracts: {
      colonyGame: "0x8CCc67AcC8C3Cd70576501bC37a4755C4562504b",
      seasonPot: "0xdD9a1c89455e74106E534AD207CB2e306f271F6f",
      treasury: "0x98Aa85b93555459Ce4Cc4c1372Be33cD46453411", // also receives the 0.5% swap fee
      wif: "0xC7524F3D78E5f6150aff0Eac811e9Bd0D0Fd9B68", // MockWIF
      courier: "0xec86Fe12db326eBf69CFD3edE3EFa1F6b8405bFD", // WIF sends with gas paid in WIF (2026-11-10)
    },
  },
  mainnet: {
    chainId: 4663,
    telegram: true,
    names: true, // ColonyGame.setName (colony names on the NFT and in place of addresses)
    deployBlock: 108987777, // 2026-11-08 mainnet deploy (DrandVerifier, the first transaction)
    name: "Robinhood Chain",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    contracts: {
      colonyGame: "0x403988c9cAdE46293a4561ADC6fbb0BDA02647FF",
      seasonPot: "0x74f955C7b01Ad3649d50a93149b9ad9C5594c8b9",
      treasury: "0x653a93f2018DfcCf6bE8b70d7cA227b27ADE6037", // also receives the 0.5% swap fee
      wif: "0x5173b8eA6923c2d40267890D45C46a3480954773",
      courier: "0xABD01eb9A641A25aB69dBaDe0C25F8386153bE31", // WIF sends with gas paid in WIF (2026-11-10)
    },
    // World is Flat final: vote for C0LONY from inside the game (2026-11-18). From worldisflat.fun/build/api/vote-window
    // and /build/api/projects/c0lony. vote(submissionId, amount, deadline) burns the WIF; a vote mined after the
    // deadline reverts and burns nothing. Remove once the final is over.
    vote: {
      contract: "0xd1b711917a405782da2ec650a0ee4711a76a5535",
      projectId: 43,
      deadline: 1795022999, // 2026-11-18 17:29:59 UTC, the last second a vote counts
      page: "https://worldisflat.fun/build/projects/c0lony/vote",
    },
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;
// Guarded so the Pages Functions (no `process`) can import NETWORKS from this file too.
export const NETWORK_NAME: NetworkName =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
export const NETWORK = NETWORKS[NETWORK_NAME];

export const CONFIG = {
  // The browser RPC switches to the /api/rpc function once it exists.
  rpcUrl: NETWORK.rpcUrl,
  keeperUrl: "https://keeper.c0lony.xyz",
  proofsBaseUrl: "https://keeper.c0lony.xyz/voters", // <base>/proofs/<address>.json
  walletConnectProjectId: "6211841b582ba25061a906fad00dd9f8", // public by design (cloud.reown.com)
  // Privy app ID (dashboard.privy.io > App settings). Public by design; empty until the app is created.
  privyAppId: "cmvwkvslr010a0gl2xf09usrq",
  // Web Push VAPID public key (base64url). The private half lives only in the keeper env.
  vapidPublicKey: "BHMH_F2YSTImqn0X_HFl2ZMFwblYM2c0xPhrUhWLP3uuryqE4cDaEJt-KwQ_DBlSpl7W_PPWmqhcLPGx-lhwVMM", // rotated 2026-11-03
  drand: {
    apiUrl: "https://api.drand.sh",
    chainHash: "04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3",
  },
  // Pons page for buying WIF with ETH (offered to players on their own wallet, opens in a new tab). Empty = hidden.
  ponsWifUrl: "https://ponsfamily.com/launchpad/0x5173b8eA6923c2d40267890D45C46a3480954773",
  kyber: {
    apiUrl: "https://aggregator-api.kyberswap.com/robinhood/api/v1",
    clientId: "c0lony", // sent as x-client-id and source
  },
} as const;

// Get WIF from other chains through LI.FI (docs/design/2026-11-18-lifi-cross-chain-wif.md). Mainnet only: routes
// land WIF on Robinhood Chain. `lifi` is the only contract the app approves or calls on that chain: LI.FI's
// LiFiDiamond from github.com/lifinance/contracts deployments/<chain>.json, checked against live quotes 2026-11-18.
// Tokens from li.quest/v1/tokens. NATIVE = the chain's gas token. No fee is charged by C0LONY.
const NATIVE = "0x0000000000000000000000000000000000000000";
export const CROSS_CHAIN = {
  enabled: NETWORK_NAME === "mainnet",
  api: "https://li.quest/v1",
  integrator: "c0lony",
  slippage: 0.01,
  chains: [
    { id: 8453, name: "Base", gas: "ETH", lifi: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", tokens: [
      { symbol: "ETH", address: NATIVE, decimals: 18 },
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 } ] },
    { id: 42161, name: "Arbitrum", gas: "ETH", lifi: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", tokens: [
      { symbol: "ETH", address: NATIVE, decimals: 18 },
      { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
      { symbol: "USDT0", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 } ] },
    { id: 1, name: "Ethereum", gas: "ETH", lifi: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", tokens: [
      { symbol: "ETH", address: NATIVE, decimals: 18 },
      { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 } ] },
    { id: 10, name: "Optimism", gas: "ETH", lifi: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", tokens: [
      { symbol: "ETH", address: NATIVE, decimals: 18 },
      { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
      { symbol: "USDT0", address: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071", decimals: 6 } ] },
    { id: 130, name: "Unichain", gas: "ETH", lifi: "0x864b314D4C5a0399368609581d3E8933a63b9232", tokens: [
      { symbol: "ETH", address: NATIVE, decimals: 18 },
      { symbol: "USDC", address: "0x078D782b760474a361dDA0AF3839290b0EF57AD6", decimals: 6 },
      { symbol: "USDT0", address: "0x9151434b16b9763660705744891fA906F660EcC5", decimals: 6 } ] },
    { id: 56, name: "BSC", gas: "BNB", lifi: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", tokens: [
      { symbol: "BNB", address: NATIVE, decimals: 18 },
      { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
      { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 } ] },
    { id: 143, name: "Monad", gas: "MON", lifi: "0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37", tokens: [
      { symbol: "MON", address: NATIVE, decimals: 18 },
      { symbol: "USDC", address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", decimals: 6 },
      { symbol: "USDT0", address: "0xe7cd86e13AC4309349F30B3435a9d337750fC82D", decimals: 6 } ] },
    { id: 999, name: "HyperEVM", gas: "HYPE", lifi: "0x0a0758d937d1059c356D4714e57F5df0239bce1A", tokens: [
      { symbol: "HYPE", address: NATIVE, decimals: 18 },
      { symbol: "USDC", address: "0xb88339CB7199b77E23DB6E890353E22632Ba630f", decimals: 6 },
      { symbol: "USDT0", address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", decimals: 6 } ] },
    // Arc's gas token is USDC; LI.FI routes it through its ERC-20 interface at 0x3600… (6 decimals).
    { id: 5042, name: "Arc", gas: "USDC", lifi: "0xA4072583658Fae592A3506A42431cb6316a8d40b", tokens: [
      { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 } ] },
  ],
} as const;
