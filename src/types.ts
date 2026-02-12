export type Address = `0x${string}`;
// Mainnet, Base, Arbitrum, Polygon, Unichain, Hyperliquid EVM, Monad
export type ChainId = 1 | 8453 | 42161 | 137 | 130 | 999 | 143;

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
  proxy: ProxyState;
  classification: OracleClassification | null;
}

export type ProxyState = ProxyInfo | NonProxyInfo | null;

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

export interface NonProxyInfo {
  isProxy: false;
  lastProxyScanAt: string;
}

export type VerificationMethod = "factory" | "bytecode";

export type OracleClassification =
  | {
      kind: "MorphoChainlinkOracleV2";
      verifiedByFactory: boolean; // Legacy: true = factory, false = bytecode
      verificationMethod: VerificationMethod;
      feeds: StandardOracleFeeds;
    }
  | {
      kind: "MorphoChainlinkOracleV1";
      verificationMethod: "bytecode";
      feeds: StandardOracleFeeds;
    }
  | {
      kind: "MetaOracleDeviationTimelock";
      verificationMethod: "factory";
      config: MetaOracleDeviationTimelockConfig;
      oracleSources?: MetaOracleSources;
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

export interface MetaOracleDeviationTimelockConfig {
  primaryOracle: Address | null;
  backupOracle: Address | null;
  currentOracle: Address | null;
  deviationThreshold: string;
  challengeTimelockDuration: number;
  healingTimelockDuration: number;
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
  | "Compound"
  | "Pendle"
  | "Spectra"
  | "Unknown";

export type PendleFeedKind = "LinearDiscount" | "ChainlinkOracle";
export type PendleOracleType = "PT_TO_SY" | "PT_TO_ASSET" | "LP_TO_SY" | "LP_TO_ASSET";

export interface FeedInfo {
  address: Address;
  chainId: ChainId;
  provider: FeedProvider;
  description: string;
  pair: [string, string] | null;
  pendleFeedKind?: PendleFeedKind;
  pendleOracleType?: PendleOracleType;
  twapDuration?: number;
  baseDiscountPerYear?: string;
  innerOracle?: Address;
  pt?: Address;
  ptSymbol?: string;
  decimals?: number;
  heartbeat?: number;
  deviationThreshold?: number;
  tier?: string; // Chainlink feed category: "verified", "monitored", "high", "medium", "low", "custom", etc.
  ens?: string; // Chainlink ENS slug for feed URL (e.g., "eth-usd")
  feedType?: string; // Redstone feed type: "fundamental" (asset vs underlying) or "market" (asset vs USD)
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

export interface OracleOutputBase {
  address: Address;
  chainId: ChainId;
  verifiedByFactory: boolean;
  lastUpdated: string;
  isUpgradable: boolean;
  proxy: {
    isProxy: boolean;
    proxyType?: string;
    implementation?: Address;
    lastImplChangeAt?: string;
  };
  lastScannedAt: string;
}

export type OracleOutput =
  | (OracleOutputBase & {
      type: "standard";
      data: StandardOracleOutputData;
    })
  | (OracleOutputBase & {
      type: "meta";
      data: MetaOracleOutputData;
    })
  | (OracleOutputBase & {
      type: "custom";
      data: CustomOracleOutputData;
    })
  | (OracleOutputBase & {
      type: "unknown";
      data: UnknownOracleOutputData;
    });

export interface StandardOracleOutputData {
  baseFeedOne: EnrichedFeed | null;
  baseFeedTwo: EnrichedFeed | null;
  quoteFeedOne: EnrichedFeed | null;
  quoteFeedTwo: EnrichedFeed | null;
  baseVault: EnrichedVault | null;
  quoteVault: EnrichedVault | null;
}

export interface MetaOracleSources {
  primary: StandardOracleFeeds | null;
  backup: StandardOracleFeeds | null;
}

export interface MetaOracleOutputData {
  primaryOracle: Address | null;
  backupOracle: Address | null;
  currentOracle: Address | null;
  deviationThreshold: string;
  challengeTimelockDuration: number;
  healingTimelockDuration: number;
  oracleSources?: MetaOracleOutputSources;
}

export interface MetaOracleOutputSources {
  primary: StandardOracleOutputData | null;
  backup: StandardOracleOutputData | null;
}

export interface CustomOracleOutputData {
  adapterId: string;
  adapterName: string;
  feeds?: Partial<StandardOracleOutputData>;
  metadata?: Record<string, unknown>;
}

export interface UnknownOracleOutputData {
  reason: string;
}

export interface EnrichedFeed {
  address: Address;
  description: string;
  pair: [string, string] | [];
  provider: FeedProvider | null;
  pendleFeedKind?: PendleFeedKind;
  pendleOracleType?: PendleOracleType;
  twapDuration?: number;
  baseDiscountPerYear?: string;
  innerOracle?: Address;
  pt?: Address;
  ptSymbol?: string;
  decimals?: number;
  tier?: string; // Feed tier/category (e.g., Chainlink's "verified", "high", etc.)
  heartbeat?: number; // Update frequency in seconds (Chainlink, Redstone)
  deviationThreshold?: number; // Deviation % trigger (Chainlink, Redstone)
  ens?: string; // Chainlink ENS slug for building feed page URL (e.g., "eth-usd")
  feedType?: string; // Redstone feed type: "fundamental" (asset vs underlying) or "market" (asset vs USD)
}

/**
 * Enriched ERC4626 vault info for oracle price conversion.
 * Vaults convert share tokens to underlying assets using convertToAssets().
 */
export interface EnrichedVault {
  address: Address;
  symbol: string; // Vault share token symbol (e.g., "wstETH")
  asset: Address; // Underlying asset address
  assetSymbol: string; // Underlying asset symbol (e.g., "stETH")
  pair: [string, string]; // [symbol, assetSymbol] - the conversion pair
  conversionSample: string; // Sample amount used for conversion (bigint as string)
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
      metaCount: number;
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
