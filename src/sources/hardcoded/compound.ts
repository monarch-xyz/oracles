import type { Address, ChainId, FeedInfo, FeedProviderRegistry } from "../../types.js";

/**
 * Compound feeds - hardcoded registry
 * These are wrappers around Chainlink feeds with additional logic
 */
const COMPOUND_FEEDS: Record<ChainId, FeedInfo[]> = {
  1: [
    {
      address: "0x4F67e4d9BD67eFa28236013288737D39AeF48e79" as Address,
      chainId: 1,
      provider: "Compound",
      description: "wstETH / ETH (Compound wrapper)",
      pair: ["wstETH", "ETH"],
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

export function fetchCompoundProvider(chainId: ChainId): FeedProviderRegistry {
  const feeds = COMPOUND_FEEDS[chainId] ?? [];
  const feedMap: Record<Address, FeedInfo> = {};

  for (const feed of feeds) {
    feedMap[feed.address.toLowerCase() as Address] = feed;
  }

  console.log(`[compound] Loaded ${feeds.length} hardcoded feeds for chain ${chainId}`);

  return {
    chainId,
    provider: "Compound",
    feeds: feedMap,
    updatedAt: new Date().toISOString(),
  };
}
