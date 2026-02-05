import type {
  Address,
  ChainId,
  EnrichedFeed,
  FeedInfo,
  FeedRegistry,
  FeedVendor,
} from "../types.js";

export class FeedMatcher {
  private registries: Map<string, FeedRegistry> = new Map();

  addRegistry(registry: FeedRegistry): void {
    const key = `${registry.chainId}-${registry.vendor}`;
    this.registries.set(key, registry);
  }

  match(address: Address, chainId: ChainId): FeedInfo | null {
    for (const registry of this.registries.values()) {
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
        chain: { id: chainId },
        description: matched.description,
        pair: matched.pair || [],
        vendor: matched.vendor,
        decimals: matched.decimals,
      };
    }

    return {
      address,
      chain: { id: chainId },
      description: "Unknown Feed",
      pair: [],
      vendor: null,
    };
  }

  getStats(): Record<ChainId, Record<FeedVendor, number>> {
    const stats: Record<ChainId, Record<FeedVendor, number>> = {} as Record<ChainId, Record<FeedVendor, number>>;
    for (const registry of this.registries.values()) {
      if (!stats[registry.chainId]) {
        stats[registry.chainId] = {} as Record<FeedVendor, number>;
      }
      stats[registry.chainId][registry.vendor] = Object.keys(registry.feeds).length;
    }
    return stats;
  }
}
