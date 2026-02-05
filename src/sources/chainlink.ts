import type { Address, ChainId, FeedInfo, FeedProviderRegistry } from "../types.js";

interface ChainlinkFeed {
  name: string;
  path: string;
  proxyAddress: string;
  decimals: number;
  heartbeat?: number;
  deviationThreshold?: number;
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
  // Unichain, Hyperliquid, Monad - no Chainlink registry yet
};

export async function fetchChainlinkProvider(
  chainId: ChainId
): Promise<FeedProviderRegistry> {
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
    throw new Error(
      `Failed to fetch Chainlink feeds: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as ChainlinkFeed[];
  const feeds: Record<Address, FeedInfo> = {};

  for (const feed of data) {
    if (!feed.proxyAddress) continue;

    const address = feed.proxyAddress.toLowerCase() as Address;
    const pair = parsePair(feed.path || feed.name);

    feeds[address] = {
      address,
      chainId,
      provider: "Chainlink",
      description: feed.name || feed.path,
      pair,
      decimals: feed.decimals,
      heartbeat: feed.heartbeat,
      deviationThreshold: feed.deviationThreshold,
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

function parsePair(path: string): [string, string] | null {
  const match = path.match(/^(.+)\s*\/\s*(.+)$/);
  if (match) {
    return [match[1].trim(), match[2].trim()];
  }
  return null;
}
