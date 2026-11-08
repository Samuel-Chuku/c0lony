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
