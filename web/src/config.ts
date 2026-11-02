// Every public value the site needs, per network, in one committed file (see docs/DEPLOYMENTS.md for sources).
// Nothing here is secret: all of it ships inside the static site anyway. The build only picks the network:
//   NEXT_PUBLIC_NETWORK = "testnet" (default) | "mainnet"
// Changing an address means editing this file and pushing; no hosting dashboard changes.

export const NETWORKS = {
  testnet: {
    chainId: 46630,
    // First block of the current game deployment. The live feed ignores older events (earlier test games).
    deployBlock: 147191275,
    name: "Robinhood Chain Testnet",
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    contracts: {
      colonyGame: "0xb826C232193B2EF12fdf60E55EE341e3edE9D672",
      seasonPot: "0xDd1b353DF1AB32e6E2A601586e0446A7bAa60FAA",
      treasury: "0xe23673FA3A54F1C84c45c386400000194Bf52a26", // also receives the 0.5% swap fee
      wif: "0xC7524F3D78E5f6150aff0Eac811e9Bd0D0Fd9B68", // MockWIF
    },
  },
  mainnet: {
    chainId: 4663,
    deployBlock: 0, // set with the mainnet deploy
    name: "Robinhood Chain",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    contracts: {
      colonyGame: "", // filled in after the mainnet deploy
      seasonPot: "",
      treasury: "",
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
  vapidPublicKey: "BPnqEZ4l0ptYz8W5DVCCIsI-gajTI2iO6DlOitM49eM-cXuS5_JTodjBhQkUy_XfqDNvzCOZXjVxDcJmNG3gIhg",
  drand: {
    apiUrl: "https://api.drand.sh",
    chainHash: "04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3",
  },
  kyber: {
    apiUrl: "https://aggregator-api.kyberswap.com/robinhood/api/v1",
    clientId: "c0lony", // sent as x-client-id and source
  },
} as const;
