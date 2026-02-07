import type {
  Address,
  ChainId,
  EnrichedFeed,
  FeedInfo,
  FeedProvider,
  FeedProviderRegistry,
} from "../types.js";

export class FeedProviderMatcher {
  private providers: Map<string, FeedProviderRegistry> = new Map();

  addProvider(registry: FeedProviderRegistry): void {
    const key = `${registry.chainId}-${registry.provider}`;
    this.providers.set(key, registry);
  }

  match(address: Address, chainId: ChainId): FeedInfo | null {
    for (const registry of this.providers.values()) {
      if (registry.chainId !== chainId) continue;
      const feed = registry.feeds[address];
      if (feed) return feed;
    }
    return null;
  }

  enrichFeed(address: Address | null, chainId: ChainId): EnrichedFeed | null {
    if (!address) return null;

    const matched = this.match(address, chainId);
    if (matched) {
      return {
        address,
        description: matched.description,
        pair: matched.pair || [],
        provider: matched.provider,
        baseDiscountPerYear: matched.baseDiscountPerYear,
        innerOracle: matched.innerOracle,
        pt: matched.pt,
        ptSymbol: matched.ptSymbol,
        decimals: matched.decimals,
        tier: matched.tier,
        heartbeat: matched.heartbeat,
        deviationThreshold: matched.deviationThreshold,
        ens: matched.ens,
        feedType: matched.feedType,
      };
    }

    return {
      address,
      description: "Unknown Feed",
      pair: [],
      provider: null,
    };
  }

  getStats(): Record<ChainId, Record<FeedProvider, number>> {
    const stats: Record<ChainId, Record<FeedProvider, number>> = {} as Record<
      ChainId,
      Record<FeedProvider, number>
    >;
    for (const registry of this.providers.values()) {
      if (!stats[registry.chainId]) {
        stats[registry.chainId] = {} as Record<FeedProvider, number>;
      }
      stats[registry.chainId][registry.provider] = Object.keys(registry.feeds).length;
    }
    return stats;
  }
}
