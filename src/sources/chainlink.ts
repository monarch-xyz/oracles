import { CHAINLINK_REGISTRY_URL } from "../config.js";
import type { Address, ChainId, FeedInfo, FeedRegistry } from "../types.js";

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

const NETWORK_NAMES: Partial<Record<ChainId, string>> = {
  1: "mainnet",
  8453: "base",
  42161: "arbitrum",
  137: "matic",
  // Unichain, Hyperliquid, Monad - no Chainlink registry yet
};

export async function fetchChainlinkFeeds(
  chainId: ChainId
): Promise<FeedRegistry> {
  const networkName = NETWORK_NAMES[chainId];

  if (!networkName) {
    console.log(`[chainlink] No registry for chain ${chainId}`);
    return {
      chainId,
      vendor: "Chainlink",
      feeds: {},
      updatedAt: new Date().toISOString(),
    };
  }

  const url = CHAINLINK_REGISTRY_URL.replace("{network}", networkName);
  console.log(`[chainlink] Fetching feeds for ${networkName}...`);

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
      vendor: "Chainlink",
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
    vendor: "Chainlink",
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
