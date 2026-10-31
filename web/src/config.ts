// Every public value the site needs, per network, in one committed file (see docs/DEPLOYMENTS.md for sources).
// Nothing here is secret: all of it ships inside the static site anyway. The build only picks the network:
//   NEXT_PUBLIC_NETWORK = "testnet" (default) | "mainnet"
// Changing an address means editing this file and pushing; no hosting dashboard changes.

const NETWORKS = {
  testnet: {
    chainId: 46630,
    name: "Robinhood Chain Testnet",
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    contracts: {
      colonyGame: "0x6E9a1547eA9981428e1de95A00C9a4D6224a949B",
      seasonPot: "0x70dDd0057b0E41A30F96690eeDFc4F35A9e10A14",
      treasury: "0xB39eA612B09bc6DEdCE717E7e199D4a0bDD0A2C4", // also receives the 0.5% swap fee
      wif: "0xC7524F3D78E5f6150aff0Eac811e9Bd0D0Fd9B68", // MockWIF
    },
  },
  mainnet: {
    chainId: 4663,
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
export const NETWORK_NAME: NetworkName = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
export const NETWORK = NETWORKS[NETWORK_NAME];

export const CONFIG = {
  // The browser RPC switches to the /api/rpc function once it exists.
  rpcUrl: NETWORK.rpcUrl,
  keeperUrl: "https://keeper.c0lony.xyz",
  proofsBaseUrl: "https://keeper.c0lony.xyz/voters", // <base>/proofs/<address>.json
  walletConnectProjectId: "6211841b582ba25061a906fad00dd9f8", // public by design (cloud.reown.com)
  drand: {
    apiUrl: "https://api.drand.sh",
    chainHash: "04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3",
  },
  kyber: {
    apiUrl: "https://aggregator-api.kyberswap.com/robinhood/api/v1",
    clientId: "c0lony", // sent as x-client-id and source
  },
} as const;
