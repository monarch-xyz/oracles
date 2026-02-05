import { REDSTONE_REGISTRY_URL } from "../config.js";
import type { Address, ChainId, FeedInfo, FeedRegistry } from "../types.js";

interface RedstoneFeed {
  adapterContractAddress: string;
  name?: string;
  dataFeeds?: string[];
}

interface RedstoneManifest {
  [key: string]: RedstoneFeed;
}

const NETWORK_NAMES: Partial<Record<ChainId, string>> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrum",
  137: "polygon",
  // Unichain, Hyperliquid, Monad - no Redstone registry yet
};

export async function fetchRedstoneFeeds(
  chainId: ChainId
): Promise<FeedRegistry> {
  const networkName = NETWORK_NAMES[chainId];

  if (!networkName) {
    console.log(`[redstone] No registry for chain ${chainId}`);
    return {
      chainId,
      vendor: "Redstone",
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
        vendor: "Redstone",
        feeds: {},
        updatedAt: new Date().toISOString(),
      };
    }

    const manifest = (await response.json()) as RedstoneManifest;
    const feeds: Record<Address, FeedInfo> = {};

    for (const [key, feed] of Object.entries(manifest)) {
      if (!feed.adapterContractAddress) continue;

      const address = feed.adapterContractAddress.toLowerCase() as Address;
      const dataFeeds = feed.dataFeeds || [];
      const pair = dataFeeds.length >= 2 ? [dataFeeds[0], dataFeeds[1]] as [string, string] : null;

      feeds[address] = {
        address,
        chainId,
        vendor: "Redstone",
        description: feed.name || key,
        pair,
      };
    }

    console.log(`[redstone] Loaded ${Object.keys(feeds).length} feeds`);

    return {
      chainId,
      vendor: "Redstone",
      feeds,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.log(`[redstone] Error fetching feeds: ${error}`);
    return {
      chainId,
      vendor: "Redstone",
      feeds: {},
      updatedAt: new Date().toISOString(),
    };
  }
}
