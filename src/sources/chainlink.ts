import type { Address, ChainId, FeedInfo, FeedProviderRegistry } from "../types.js";

interface ChainlinkFeed {
  name: string;
  path: string;
  proxyAddress: string;
  decimals: number;
  heartbeat?: number;
  threshold?: number; // deviation threshold
  feedCategory?: string; // tier: "verified", "high", "medium", "low", "custom", etc.
  docs?: {
    baseAsset?: string;
    quoteAsset?: string;
  };
}

const CHAINLINK_PROVIDER_URLS: Partial<Record<ChainId, string>> = {
  1: "https://reference-data-directory.vercel.app/feeds-mainnet.json",
  8453: "https://reference-data-directory.vercel.app/feeds-ethereum-mainnet-base-1.json",
  137: "https://reference-data-directory.vercel.app/feeds-polygon-mainnet-katana.json",
  42161: "https://reference-data-directory.vercel.app/feeds-ethereum-mainnet-arbitrum-1.json",
  999: "https://reference-data-directory.vercel.app/feeds-hyperliquid-mainnet.json",
  143: "https://reference-data-directory.vercel.app/feeds-monad-mainnet.json",
};

export async function fetchChainlinkProvider(chainId: ChainId): Promise<FeedProviderRegistry> {
  const url = CHAINLINK_PROVIDER_URLS[chainId];
  if (!url) {
    console.log(`[chainlink] No registry for chain ${chainId}`);
    return {
      chainId,
      provider: "Chainlink",
      feeds: {},
      updatedAt: new Date().toISOString(),
    };
  }

  console.log(`[chainlink] Fetching feeds for chain ${chainId}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Chainlink feeds: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ChainlinkFeed[];
  const feeds: Record<Address, FeedInfo> = {};

  for (const feed of data) {
    if (!feed.proxyAddress) continue;

    const address = feed.proxyAddress.toLowerCase() as Address;
    // Prefer docs.baseAsset/quoteAsset, fallback to parsing name
    const pair = extractPair(feed);

    feeds[address] = {
      address,
      chainId,
      provider: "Chainlink",
      description: feed.name || feed.path,
      pair,
      decimals: feed.decimals,
      heartbeat: feed.heartbeat,
      deviationThreshold: feed.threshold,
      tier: feed.feedCategory || undefined,
    };
  }

  console.log(`[chainlink] Loaded ${Object.keys(feeds).length} feeds`);

  return {
    chainId,
    provider: "Chainlink",
    feeds,
    updatedAt: new Date().toISOString(),
  };
}

function extractPair(feed: ChainlinkFeed): [string, string] | null {
  // Prefer structured docs data
  if (feed.docs?.baseAsset && feed.docs?.quoteAsset) {
    return [feed.docs.baseAsset, feed.docs.quoteAsset];
  }

  // Fallback: parse from name (e.g., "DAI / USD")
  const name = feed.name || feed.path;
  const match = name.match(/^(.+)\s*\/\s*(.+)$/);
  if (match) {
    return [match[1].trim(), match[2].trim()];
  }

  return null;
}
