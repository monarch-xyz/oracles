import type { Address, ChainId } from "../types.js";

const MORPHO_API_URL = "https://blue-api.morpho.org/graphql";

const MARKETS_QUERY = `
  query Markets {
    markets(first: 1000) {
      items {
        uniqueKey
        oracle {
          address
          chain {
            id
          }
        }
      }
    }
  }
`;

interface MarketItem {
  uniqueKey: string;
  oracle: {
    address: string;
    chain: {
      id: number;
    };
  };
}

interface MarketsResponse {
  data: {
    markets: {
      items: MarketItem[];
    };
  };
}

export interface OracleFromApi {
  address: Address;
  chainId: ChainId;
  marketIds: string[];
}

export async function fetchOraclesFromMorphoApi(): Promise<OracleFromApi[]> {
  console.log("[morpho-api] Fetching all market oracles...");

  const response = await fetch(MORPHO_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: MARKETS_QUERY }),
  });

  if (!response.ok) {
    throw new Error(`Morpho API error: ${response.status}`);
  }

  const result = (await response.json()) as MarketsResponse;
  const items = result.data?.markets?.items || [];

  const oracleMap = new Map<string, OracleFromApi>();

  for (const item of items) {
    if (!item.oracle?.address) continue;

    const address = item.oracle.address.toLowerCase() as Address;
    const chainId = item.oracle.chain.id as ChainId;
    const key = `${chainId}-${address}`;

    if (oracleMap.has(key)) {
      oracleMap.get(key)!.marketIds.push(item.uniqueKey);
    } else {
      oracleMap.set(key, {
        address,
        chainId,
        marketIds: [item.uniqueKey],
      });
    }
  }

  const oracles = Array.from(oracleMap.values());
  console.log(`[morpho-api] Found ${oracles.length} unique oracles across all chains`);

  return oracles;
}

export async function fetchOraclesForChain(chainId: ChainId): Promise<OracleFromApi[]> {
  const allOracles = await fetchOraclesFromMorphoApi();
  const filtered = allOracles.filter((o) => o.chainId === chainId);
  console.log(`[morpho-api] ${filtered.length} oracles on chain ${chainId}`);
  return filtered;
}
