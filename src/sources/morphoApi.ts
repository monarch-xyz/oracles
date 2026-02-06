import type { Address, ChainId } from "../types.js";

const MORPHO_API_URL = "https://blue-api.morpho.org/graphql";

const MARKETS_QUERY = `
  query Markets($skip: Int!) {
    markets(first: 1000, skip: $skip) {
      items {
        oracle {
          address
          chain {
            id
          }
        }
        collateralAsset {
          address
        }
      }
      pageInfo {
        countTotal
      }
    }
  }
`;

const BLACKLIST_TOKENS = new Set<Address>([
  "0xda1c2c3c8fad503662e41e324fc644dc2c5e0ccd",
  "0x8413d2a624a9fa8b6d3ec7b22cf7f62e55d6bc83",
]);

interface MarketItem {
  oracle: {
    address: string;
    chain: {
      id: number;
    };
  };
  collateralAsset?: {
    address?: string;
  };
}

interface MarketsResponse {
  data: {
    markets: {
      items: MarketItem[];
      pageInfo: {
        countTotal: number;
      };
    };
  };
}

export interface OracleFromApi {
  address: Address;
  chainId: ChainId;
}

export async function fetchOraclesFromMorphoApi(): Promise<OracleFromApi[]> {
  console.log("[morpho-api] Fetching all market oracles...");

  const oracleMap = new Map<string, OracleFromApi>();
  let blacklistedMarkets = 0;
  let skip = 0;
  let totalFetched = 0;
  let countTotal = 0;

  // Paginate through all markets
  while (true) {
    const response = await fetch(MORPHO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: MARKETS_QUERY,
        variables: { skip },
      }),
    });

    if (!response.ok) {
      throw new Error(`Morpho API error: ${response.status}`);
    }

    const result = (await response.json()) as MarketsResponse;
    const items = result.data?.markets?.items || [];
    countTotal = result.data?.markets?.pageInfo?.countTotal || 0;

    if (items.length === 0) break;

    totalFetched += items.length;
    console.log(`[morpho-api] Fetched ${totalFetched}/${countTotal} markets...`);

    for (const item of items) {
      const collateralAddress = item.collateralAsset?.address?.toLowerCase() as Address | undefined;
      if (collateralAddress && BLACKLIST_TOKENS.has(collateralAddress)) {
        blacklistedMarkets += 1;
        continue;
      }
      if (!item.oracle?.address) continue;

      const address = item.oracle.address.toLowerCase() as Address;
      const chainId = item.oracle.chain.id as ChainId;
      const key = `${chainId}-${address}`;

      if (!oracleMap.has(key)) {
        oracleMap.set(key, { address, chainId });
      }
    }

    skip += items.length;

    // Exit if we've fetched all
    if (totalFetched >= countTotal) break;
  }

  const oracles = Array.from(oracleMap.values());
  if (blacklistedMarkets > 0) {
    console.log(`[morpho-api] Skipped ${blacklistedMarkets} markets with blacklisted collateral`);
  }
  console.log(`[morpho-api] Found ${oracles.length} unique oracles from ${countTotal} total markets`);

  return oracles;
}

export async function fetchOraclesForChain(chainId: ChainId): Promise<OracleFromApi[]> {
  const allOracles = await fetchOraclesFromMorphoApi();
  const filtered = allOracles.filter((o) => o.chainId === chainId);
  console.log(`[morpho-api] ${filtered.length} oracles on chain ${chainId}`);
  return filtered;
}
