import type { Address, ChainId } from "./types.js";

export interface ChainConfig {
  id: ChainId;
  name: string;
  rpcUrl: string;
  morphoChainlinkV2Factory: Address;
  metaOracleDeviationTimelockFactories: Address[];
}

export const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
export const ETHERSCAN_V2_API_URL = "https://api.etherscan.io/v2/api";

export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  1: {
    id: 1,
    name: "mainnet",
    rpcUrl: process.env.RPC_MAINNET || "https://eth.llamarpc.com",
    morphoChainlinkV2Factory: "0x3A7bB36Ee3f3eE32A60e9f2b33c1e5f2E83ad766",
    metaOracleDeviationTimelockFactories: [
      "0xeC34e4e892061f368F915aDb9467B656ae5C42e8",
      "0x44d049eed4ad33807859c45bbd3a8eb47917a9f4",
    ],
  },
  8453: {
    id: 8453,
    name: "base",
    rpcUrl: process.env.RPC_BASE || "https://mainnet.base.org",
    morphoChainlinkV2Factory: "0x2DC205F24BCb6B311E5cdf0745B0741648Aebd3d",
    metaOracleDeviationTimelockFactories: [
      "0x83910ae3f4a7bb8606402289a60feb95bc39a060",
    ],
  },
  42161: {
    id: 42161,
    name: "arbitrum",
    rpcUrl: process.env.RPC_ARBITRUM || "https://arb1.arbitrum.io/rpc",
    morphoChainlinkV2Factory: "0x98Ce5D183DC0c176f54D37162F87e7eD7f2E41b5",
    metaOracleDeviationTimelockFactories: [
      "0x4f3f56a045a2d33ceef1d1fd5f4c776b8bfb2168"
    ],
  },
  137: {
    id: 137,
    name: "polygon",
    rpcUrl: process.env.RPC_POLYGON || "https://polygon-rpc.com",
    morphoChainlinkV2Factory: "0x1ff7895Eb842794c5d07C4c547b6730e61295215",
    metaOracleDeviationTimelockFactories: [],
  },
  130: {
    id: 130,
    name: "unichain",
    rpcUrl: process.env.RPC_UNICHAIN || "https://mainnet.unichain.org",
    morphoChainlinkV2Factory: "0x43269546e1D586a1f7200a0AC07e26f9631f7539",
    metaOracleDeviationTimelockFactories: [
      "0xd058Fc46edd745B6c883Ef3F775669039235753d"
    ],
  },
  999: {
    id: 999,
    name: "hyperevm",
    rpcUrl: process.env.RPC_HYPEREVM || "https://rpc.hyperliquid.xyz/evm",
    morphoChainlinkV2Factory: "0xeb476f124FaD625178759d13557A72394A6f9aF5",
    metaOracleDeviationTimelockFactories: ["0x9fAE9968e4e68bEE5ddcb48bb68Fb27CC57ff384"],
  },
  143: {
    id: 143,
    name: "monad",
    rpcUrl: process.env.RPC_MONAD || "https://testnet-rpc.monad.xyz",
    morphoChainlinkV2Factory: "0xC8659Bcd5279DB664Be973aEFd752a5326653739",
    metaOracleDeviationTimelockFactories: ["0x1C1FD6dc5D84C16cD152aC2E91F80327FE3aEd9F"],
  },
};

export const ACTIVE_CHAINS: ChainId[] = [1, 8453, 42161, 137, 130, 999, 143];

export const REDSTONE_REGISTRY_URL =
  "https://raw.githubusercontent.com/redstone-finance/redstone-oracles-monorepo/main/packages/relayer-remote-config/main/relayer-manifests-multi-feed/{network}MultiFeed.json";

export const GIST_ID = process.env.GIST_ID || "";
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

export const IMPL_RESCAN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
