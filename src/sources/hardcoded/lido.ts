import type { Address, ChainId, FeedInfo, FeedProviderRegistry } from "../../types.js";

/**
 * Lido feeds - hardcoded registry
 * wstETH/stETH exchange rate feeds
 */
const LIDO_FEEDS: Record<ChainId, FeedInfo[]> = {
  1: [
    {
      address: "0x905b7dAbCD3Ce6B792D874e303D336424Cdb1421" as Address,
      chainId: 1,
      provider: "Lido",
      description: "wstETH/stETH exchange rate",
      pair: ["wstETH", "stETH"],
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

export function fetchLidoProvider(chainId: ChainId): FeedProviderRegistry {
  const feeds = LIDO_FEEDS[chainId] ?? [];
  const feedMap: Record<Address, FeedInfo> = {};

  for (const feed of feeds) {
    feedMap[feed.address.toLowerCase() as Address] = feed;
  }

  console.log(`[lido] Loaded ${feeds.length} hardcoded feeds for chain ${chainId}`);

  return {
    chainId,
    provider: "Lido",
    feeds: feedMap,
    updatedAt: new Date().toISOString(),
  };
}
