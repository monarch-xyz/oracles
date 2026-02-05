import type { Address, ChainId } from "./types.js";

export interface ChainConfig {
  id: ChainId;
  name: string;
  rpcUrl: string;
  morphoChainlinkV2Factory: Address;
}

export const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
export const ETHERSCAN_V2_API_URL = "https://api.etherscan.io/v2/api";

export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  1: {
    id: 1,
    name: "mainnet",
    rpcUrl: process.env.RPC_MAINNET || "https://eth.llamarpc.com",
    morphoChainlinkV2Factory: "0x3A7bB36Ee3f3eE32A60e9f2b33c1e5f2E83ad766",
  },
  8453: {
    id: 8453,
    name: "base",
    rpcUrl: process.env.RPC_BASE || "https://mainnet.base.org",
    morphoChainlinkV2Factory: "0x2DC205F24BCb6B311E5cdf0745B0741648Aebd3d",
  },
  42161: {
    id: 42161,
    name: "arbitrum",
    rpcUrl: process.env.RPC_ARBITRUM || "https://arb1.arbitrum.io/rpc",
    morphoChainlinkV2Factory: "0x98Ce5D183DC0c176f54D37162F87e7eD7f2E41b5",
  },
  137: {
    id: 137,
    name: "polygon",
    rpcUrl: process.env.RPC_POLYGON || "https://polygon-rpc.com",
    morphoChainlinkV2Factory: "0x1ff7895Eb842794c5d07C4c547b6730e61295215",
  },
  130: {
    id: 130,
    name: "unichain",
    rpcUrl: process.env.RPC_UNICHAIN || "https://mainnet.unichain.org",
    morphoChainlinkV2Factory: "0x0000000000000000000000000000000000000000",
  },
  999: {
    id: 999,
    name: "hyperevm",
    rpcUrl: process.env.RPC_HYPEREVM || "https://rpc.hyperliquid.xyz/evm",
    morphoChainlinkV2Factory: "0x0000000000000000000000000000000000000000",
  },
  10143: {
    id: 10143,
    name: "monad",
    rpcUrl: process.env.RPC_MONAD || "https://testnet-rpc.monad.xyz",
    morphoChainlinkV2Factory: "0x0000000000000000000000000000000000000000",
  },
};

export const ACTIVE_CHAINS: ChainId[] = [1, 8453, 42161, 137, 130, 999, 10143];

export const REDSTONE_REGISTRY_URL =
  "https://raw.githubusercontent.com/redstone-finance/redstone-oracles-monorepo/main/packages/relayer-remote-config/main/relayer-manifests-multi-feed/{network}MultiFeed.json";

export const GIST_ID = process.env.GIST_ID || "";
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

export const IMPL_RESCAN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
