import { REDSTONE_REGISTRY_URL } from "../config.js";
import type { Address, ChainId, FeedInfo, FeedProviderRegistry } from "../types.js";

interface RedstoneFeed {
  adapterContractAddress?: string;
  name?: string;
  dataFeeds?: string[];
  priceFeedAddress?: string;
  updateTriggersOverrides?: {
    deviationPercentage?: number;
    timeSinceLastUpdateInMilliseconds?: number;
  };
}

interface RedstoneMultiFeedManifest {
  chain?: { name?: string; id?: number };
  adapterContract?: string;
  adapterContractType?: string;
  dataServiceId?: string;
  updateTriggers?: {
    deviationPercentage?: number;
    timeSinceLastUpdateInMilliseconds?: number;
  };
  priceFeeds?: Record<string, RedstoneFeed>;
}

type RedstoneManifest = Record<string, RedstoneFeed> | RedstoneMultiFeedManifest;

const NETWORK_NAMES: Partial<Record<ChainId, string>> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrumOne",  // File is arbitrumOneMultiFeed.json
  137: "polygon",
  999: "hyperevm",
  // Unichain, Monad - no Redstone registry yet
};

export async function fetchRedstoneProvider(
  chainId: ChainId
): Promise<FeedProviderRegistry> {
  const networkName = NETWORK_NAMES[chainId];

  if (!networkName) {
    console.log(`[redstone] No registry for chain ${chainId}`);
    return {
      chainId,
      provider: "Redstone",
      feeds: {},
      updatedAt: new Date().toISOString(),
    };
  }

  const url = REDSTONE_REGISTRY_URL.replace("{network}", networkName);
  console.log(`[redstone] Fetching feeds for ${networkName}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(
        `[redstone] No feeds found for ${networkName}: ${response.status}`
      );
      return {
        chainId,
        provider: "Redstone",
        feeds: {},
        updatedAt: new Date().toISOString(),
      };
    }

    const manifest = (await response.json()) as RedstoneManifest;
    const feeds: Record<Address, FeedInfo> = {};

    if ("priceFeeds" in manifest && manifest.priceFeeds) {
      for (const [key, feed] of Object.entries(manifest.priceFeeds)) {
        if (!feed.priceFeedAddress) continue;
        const address = feed.priceFeedAddress.toLowerCase() as Address;
        const pair = parsePair(key);

        feeds[address] = {
          address,
          chainId,
          provider: "Redstone",
          description: key,
          pair,
          heartbeat: feed.updateTriggersOverrides?.timeSinceLastUpdateInMilliseconds
            ? Math.floor(
                feed.updateTriggersOverrides.timeSinceLastUpdateInMilliseconds / 1000
              )
            : undefined,
          deviationThreshold: feed.updateTriggersOverrides?.deviationPercentage,
        };
      }
    } else {
      for (const [key, feed] of Object.entries(manifest)) {
        if (!feed.adapterContractAddress) continue;

        const address = feed.adapterContractAddress.toLowerCase() as Address;
        const dataFeeds = feed.dataFeeds || [];
        const pair =
          dataFeeds.length >= 2
            ? ([dataFeeds[0], dataFeeds[1]] as [string, string])
            : parsePair(key);

        feeds[address] = {
          address,
          chainId,
          provider: "Redstone",
          description: feed.name || key,
          pair,
        };
      }
    }

    console.log(`[redstone] Loaded ${Object.keys(feeds).length} feeds`);

    return {
      chainId,
      provider: "Redstone",
      feeds,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.log(`[redstone] Error fetching feeds: ${error}`);
    return {
      chainId,
      provider: "Redstone",
      feeds: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

function parsePair(key: string): [string, string] | null {
  // Try standard format: "ETH / USD"
  const slashMatch = key.match(/^(.+)\s*\/\s*(.+)$/);
  if (slashMatch) {
    return [slashMatch[1].trim(), slashMatch[2].trim()];
  }

  // Try Redstone FUNDAMENTAL format: "sYUSD_FUNDAMENTAL" → [sYUSD, USD]
  const fundamentalMatch = key.match(/^(.+?)_FUNDAMENTAL$/i);
  if (fundamentalMatch) {
    return [fundamentalMatch[1], 'USD'];
  }

  // Try underscore format: "WETH_ETH" → [WETH, ETH]
  const underscoreMatch = key.match(/^([A-Za-z0-9]+)_([A-Za-z0-9]+)$/);
  if (underscoreMatch) {
    return [underscoreMatch[1], underscoreMatch[2]];
  }

  return null;
}
