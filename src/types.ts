export type Address = `0x${string}`;
// Mainnet, Base, Arbitrum, Polygon, Unichain, Hyperliquid EVM, Monad
export type ChainId = 1 | 8453 | 42161 | 137 | 130 | 999 | 10143;

// ============================================================================
// Scanner State (internal, persisted to Gist)
// ============================================================================

export interface ScannerState {
  version: 1;
  generatedAt: string;
  chains: Partial<Record<ChainId, ChainState>>;
}

export interface ChainState {
  cursor: {
    lastProcessedBlock: number;
  };
  contracts: Record<Address, ContractState>;
}

export interface ContractState {
  firstSeenAt: string;
  lastSeenAt: string;
  proxy: ProxyInfo | null;
  classification: OracleClassification | null;
}

export interface ProxyInfo {
  isProxy: true;
  proxyType: "EIP1967" | "Beacon" | "Unknown";
  implementation: Address | null;
  beacon?: Address;
  admin?: Address;
  lastImplScanAt: string;
  lastImplChangeAt?: string;
  previousImplementations?: Array<{
    address: Address;
    detectedAt: string;
  }>;
}

export type OracleClassification =
  | {
      kind: "MorphoChainlinkOracleV2";
      verifiedByFactory: boolean;
      feeds: StandardOracleFeeds;
    }
  | {
      kind: "CustomAdapter";
      adapterId: string;
      adapterName: string;
      feeds?: Partial<StandardOracleFeeds>;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: "Unknown";
      reason: string;
    };

export interface StandardOracleFeeds {
  baseFeedOne: Address | null;
  baseFeedTwo: Address | null;
  quoteFeedOne: Address | null;
  quoteFeedTwo: Address | null;
  baseVault: Address | null;
  quoteVault: Address | null;
  baseVaultConversionSample: bigint;
  quoteVaultConversionSample: bigint;
}

// ============================================================================
// Feed Provider Registry (Chainlink, Redstone, etc.)
// ============================================================================

export type FeedProvider =
  | "Chainlink"
  | "Redstone"
  | "Chronicle"
  | "Pyth"
  | "Oval"
  | "Lido"
  | "Pendle"
  | "Spectra"
  | "Unknown";

export interface FeedInfo {
  address: Address;
  chainId: ChainId;
  provider: FeedProvider;
  description: string;
  pair: [string, string] | null;
  decimals?: number;
  heartbeat?: number;
  deviationThreshold?: number;
}

export interface FeedProviderRegistry {
  chainId: ChainId;
  provider: FeedProvider;
  feeds: Record<Address, FeedInfo>;
  updatedAt: string;
}

// ============================================================================
// Output Format (published to Gist for frontend consumption)
// ============================================================================

export interface OracleOutput {
  address: Address;
  chainId: ChainId;
  type: "standard" | "custom" | "unknown";
  verifiedByFactory: boolean;
  lastUpdated: string;
  isUpgradable: boolean;
  proxy: {
    isProxy: boolean;
    proxyType?: string;
    implementation?: Address;
    lastImplChangeAt?: string;
  };
  data: OracleOutputData;
  lastScannedAt: string;
}

export interface OracleOutputData {
  baseFeedOne: EnrichedFeed | null;
  baseFeedTwo: EnrichedFeed | null;
  quoteFeedOne: EnrichedFeed | null;
  quoteFeedTwo: EnrichedFeed | null;
}

export interface EnrichedFeed {
  address: Address;
  chain: { id: ChainId };
  description: string;
  pair: [string, string] | [];
  provider: FeedProvider | null;
  decimals?: number;
}

export interface OutputFile {
  version: string;
  generatedAt: string;
  chainId: ChainId;
  oracles: OracleOutput[];
}

export interface MetadataFile {
  version: string;
  generatedAt: string;
  gitSha?: string;
  chains: Record<
    ChainId,
    {
      oracleCount: number;
      standardCount: number;
      customCount: number;
      unknownCount: number;
      upgradableCount: number;
    }
  >;
  providerSources: {
    chainlink: { updatedAt: string; feedCount: number };
    redstone: { updatedAt: string; feedCount: number };
  };
}

// ============================================================================
// Custom Adapter Registry
// ============================================================================

export interface CustomAdapterPattern {
  id: string;
  name: string;
  vendor: string;
  description: string;
  knownImplementations: Partial<Record<ChainId, Address[]>>;
  functionSelectors?: string[];
  priceMethod?: string;
  documentationUrl?: string;
}

export interface CustomAdapterRegistry {
  version: string;
  patterns: CustomAdapterPattern[];
}
