import type { Address, ChainId, FeedInfo, FeedProviderRegistry } from "../../types.js";

/**
 * API3 feeds - hardcoded registry
 */
const API3_FEEDS: Record<ChainId, FeedInfo[]> = {
  1: [
    {
      address: "0xACE21E4A3cd5B5519FB6A999dF8B63b0Ce5A046A" as Address,
      chainId: 1,
      provider: "API3",
      description: "API3: cbBTC / USD",
      pair: ["cbBTC", "USD"],
      decimals: 18,
    },
    {
      address: "0x8E5e906761677E24D3AFd77DB6A19Dd9ed83F8c2" as Address,
      chainId: 1,
      provider: "API3",
      description: "API3: USDC / USD",
      pair: ["USDC", "USD"],
      decimals: 18,
    },
    {
      address: "0xeC4031539b851eEc918b41FE3e03d7236fEc7be8" as Address,
      chainId: 1,
      provider: "API3",
      description: "API3: wstETH / USD",
      pair: ["wstETH", "USD"],
      decimals: 18,
    },
    {
      address: "0x4C7A561D15001C6ee5E05996591419b11962fa1A" as Address,
      chainId: 1,
      provider: "API3",
      description: "API3: USDC / USD",
      pair: ["USDC", "USD"],
      decimals: 18,
    },
  ],
  8453: [],
  42161: [],
  137: [],
  130: [],
  999: [],
  143: [],
};

export function fetchApi3Provider(chainId: ChainId): FeedProviderRegistry {
  const feeds = API3_FEEDS[chainId] ?? [];
  const feedMap: Record<Address, FeedInfo> = {};

  for (const feed of feeds) {
    feedMap[feed.address.toLowerCase() as Address] = feed;
  }

  console.log(`[api3] Loaded ${feeds.length} hardcoded feeds for chain ${chainId}`);

  return {
    chainId,
    provider: "API3",
    feeds: feedMap,
    updatedAt: new Date().toISOString(),
  };
}
