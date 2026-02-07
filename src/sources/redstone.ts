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
  42161: "arbitrumOne", // File is arbitrumOneMultiFeed.json
  137: "polygon",
  130: "unichain",
  999: "hyperevm",
  // Monad - no Redstone registry yet
};

export async function fetchRedstoneProvider(chainId: ChainId): Promise<FeedProviderRegistry> {
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
      console.log(`[redstone] No feeds found for ${networkName}: ${response.status}`);
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
      const multiFeed = manifest as RedstoneMultiFeedManifest;
      // Top-level defaults for heartbeat/deviation
      const defaultHeartbeatMs = multiFeed.updateTriggers?.timeSinceLastUpdateInMilliseconds;
      const defaultDeviation = multiFeed.updateTriggers?.deviationPercentage;

      for (const [key, feed] of Object.entries(manifest.priceFeeds)) {
        if (!feed.priceFeedAddress) continue;
        const address = feed.priceFeedAddress.toLowerCase() as Address;
        const pair = parsePair(key);
        const isFundamental = /_FUNDAMENTAL$/i.test(key);

        const heartbeatMs =
          feed.updateTriggersOverrides?.timeSinceLastUpdateInMilliseconds ?? defaultHeartbeatMs;
        const deviation =
          feed.updateTriggersOverrides?.deviationPercentage ?? defaultDeviation;

        feeds[address] = {
          address,
          chainId,
          provider: "Redstone",
          description: key,
          pair,
          heartbeat: heartbeatMs ? Math.floor(heartbeatMs / 1000) : undefined,
          deviationThreshold: deviation,
          feedType: isFundamental ? "fundamental" : "market",
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

        const heartbeatMs = feed.updateTriggersOverrides?.timeSinceLastUpdateInMilliseconds;
        const deviation = feed.updateTriggersOverrides?.deviationPercentage;

        feeds[address] = {
          address,
          chainId,
          provider: "Redstone",
          description: feed.name || key,
          pair,
          heartbeat: heartbeatMs ? Math.floor(heartbeatMs / 1000) : undefined,
          deviationThreshold: deviation,
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

/**
 * Infer the underlying asset from a wrapped/staked token symbol.
 * e.g. kHYPE → HYPE, wstETH → ETH, weETH → ETH, sUSDe → USDe
 */
function inferUnderlying(symbol: string): string | null {
  // Known specific mappings for edge cases
  const knownMappings: Record<string, string> = {
    LBTC: "BTC", // Lombard BTC
    eBTC: "BTC", // ether.fi BTC
    cbBTC: "BTC", // Coinbase BTC
    UBTC: "BTC", // Usual BTC
    SolvBTC: "BTC",
    pumpBTC: "BTC",
  };

  if (knownMappings[symbol]) {
    return knownMappings[symbol];
  }

  // Known prefix patterns for wrapped/staked/liquid tokens
  const prefixPatterns: Array<{ pattern: RegExp; extract: (m: RegExpMatchArray) => string }> = [
    // Single letter prefixes: k, m, w, s (but not for simple symbols)
    { pattern: /^([kmsw])([A-Z]{3,})$/i, extract: (m) => m[2] },
    // Two letter prefixes: st, ez, rs, hb, be, cm
    { pattern: /^(st|ez|rs|hb|be|cm|hw)([A-Z]{2,})$/i, extract: (m) => m[2] },
    // Three letter prefixes: wst, lst, puf, rsw
    { pattern: /^(wst|lst|puf|rsw|rsr)([A-Z]{2,})$/i, extract: (m) => m[2] },
    // Four+ letter prefixes: weETH → ETH (we prefix)
    { pattern: /^we([A-Z]{2,})$/i, extract: (m) => m[1] },
  ];

  for (const { pattern, extract } of prefixPatterns) {
    const match = symbol.match(pattern);
    if (match) {
      return extract(match);
    }
  }

  return null;
}

function parsePair(key: string): [string, string] | null {
  // Try standard format: "ETH / USD"
  const slashMatch = key.match(/^(.+)\s*\/\s*(.+)$/);
  if (slashMatch) {
    return [slashMatch[1].trim(), slashMatch[2].trim()];
  }

  // Try Redstone FUNDAMENTAL format: "kHYPE_FUNDAMENTAL" → [kHYPE, HYPE]
  // FUNDAMENTAL means the asset vs its underlying, not vs USD
  const fundamentalMatch = key.match(/^(.+?)_FUNDAMENTAL$/i);
  if (fundamentalMatch) {
    const symbol = fundamentalMatch[1];
    const underlying = inferUnderlying(symbol);
    // If we can infer the underlying, use it; otherwise default to USD
    return [symbol, underlying ?? "USD"];
  }

  // Try underscore format: "WETH_ETH" → [WETH, ETH]
  const underscoreMatch = key.match(/^([A-Za-z0-9]+)_([A-Za-z0-9]+)$/);
  if (underscoreMatch) {
    return [underscoreMatch[1], underscoreMatch[2]];
  }

  // Simple symbol with no separator: "HYPE", "BTC", "ETH" → [symbol, USD]
  const simpleMatch = key.match(/^[A-Za-z0-9]+$/);
  if (simpleMatch) {
    return [key, "USD"];
  }

  return null;
}
