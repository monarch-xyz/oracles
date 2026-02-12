# Type System

This document mirrors the current type model in `src/types.ts`.

## Core Primitives

```ts
type Address = `0x${string}`;
type ChainId = 1 | 8453 | 42161 | 137 | 130 | 999 | 143;
```

## Scanner State (Internal)

State is persisted to `_state.json`.

```ts
interface ScannerState {
  version: 1;
  generatedAt: string;
  chains: Partial<Record<ChainId, ChainState>>;
}

interface ChainState {
  cursor: { lastProcessedBlock: number };
  contracts: Record<Address, ContractState>;
}

interface ContractState {
  firstSeenAt: string;
  lastSeenAt: string;
  proxy: ProxyInfo | null;
  classification: OracleClassification | null;
}
```

## Classification Types

```ts
type VerificationMethod = "factory" | "bytecode";

type OracleClassification =
  | {
      kind: "MorphoChainlinkOracleV2";
      verifiedByFactory: boolean;
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
```

## Standard Oracle Feed Shape

```ts
interface StandardOracleFeeds {
  baseFeedOne: Address | null;
  baseFeedTwo: Address | null;
  quoteFeedOne: Address | null;
  quoteFeedTwo: Address | null;
  baseVault: Address | null;
  quoteVault: Address | null;
  baseVaultConversionSample: bigint;
  quoteVaultConversionSample: bigint;
}

interface MetaOracleDeviationTimelockConfig {
  primaryOracle: Address | null;
  backupOracle: Address | null;
  currentOracle: Address | null;
  deviationThreshold: string;
  challengeTimelockDuration: number;
  healingTimelockDuration: number;
}

interface MetaOracleSources {
  primary: StandardOracleFeeds | null;
  backup: StandardOracleFeeds | null;
}
```

## Feed Registry Types

Provider registries are loaded from Chainlink/Redstone/hardcoded sources and consumed by `FeedProviderMatcher`.

```ts
type FeedProvider =
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

interface FeedInfo {
  address: Address;
  chainId: ChainId;
  provider: FeedProvider;
  description: string;
  pair: [string, string] | null;
  pendleFeedKind?: "LinearDiscount" | "ChainlinkOracle";
  pendleOracleType?: "PT_TO_SY" | "PT_TO_ASSET" | "LP_TO_SY" | "LP_TO_ASSET";
  twapDuration?: number;
  baseDiscountPerYear?: string;
  innerOracle?: Address;
  pt?: Address;
  ptSymbol?: string;
  decimals?: number;
  heartbeat?: number;
  deviationThreshold?: number;
  tier?: string;
  ens?: string;
  feedType?: string;
}
```

## Output Types (Published)

Published files are `oracles.{chainId}.json` and `meta.json`.

```ts
interface OracleOutputBase {
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

type OracleOutput =
  | (OracleOutputBase & { type: "standard"; data: StandardOracleOutputData })
  | (OracleOutputBase & { type: "meta"; data: MetaOracleOutputData })
  | (OracleOutputBase & { type: "custom"; data: CustomOracleOutputData })
  | (OracleOutputBase & { type: "unknown"; data: UnknownOracleOutputData });

interface StandardOracleOutputData {
  baseFeedOne: EnrichedFeed | null;
  baseFeedTwo: EnrichedFeed | null;
  quoteFeedOne: EnrichedFeed | null;
  quoteFeedTwo: EnrichedFeed | null;
  baseVault: EnrichedVault | null;
  quoteVault: EnrichedVault | null;
}

interface MetaOracleOutputData {
  primaryOracle: Address | null;
  backupOracle: Address | null;
  currentOracle: Address | null;
  deviationThreshold: string;
  challengeTimelockDuration: number;
  healingTimelockDuration: number;
  oracleSources?: MetaOracleOutputSources;
}

interface MetaOracleOutputSources {
  primary: StandardOracleOutputData | null;
  backup: StandardOracleOutputData | null;
}
```

```ts
interface EnrichedFeed {
  address: Address;
  description: string;
  pair: [string, string] | [];
  provider: FeedProvider | null;
  pendleFeedKind?: "LinearDiscount" | "ChainlinkOracle";
  pendleOracleType?: "PT_TO_SY" | "PT_TO_ASSET" | "LP_TO_SY" | "LP_TO_ASSET";
  twapDuration?: number;
  baseDiscountPerYear?: string;
  innerOracle?: Address;
  pt?: Address;
  ptSymbol?: string;
  decimals?: number;
  tier?: string;
  heartbeat?: number;            // Update frequency in seconds (Chainlink, Redstone)
  deviationThreshold?: number;   // Deviation % trigger (Chainlink, Redstone)
  ens?: string;                  // Chainlink ENS slug for feed page URL (e.g., "eth-usd")
  feedType?: string;             // Redstone feed type: "fundamental" or "market"
}

/**
 * Enriched ERC4626 vault info for oracle price conversion.
 * Vaults convert share tokens to underlying assets using convertToAssets().
 */
interface EnrichedVault {
  address: Address;
  symbol: string;             // Vault share token symbol (e.g., "wstETH", "pufETH")
  asset: Address;             // Underlying asset address
  assetSymbol: string;        // Underlying asset symbol (e.g., "stETH", "WETH")
  pair: [string, string];     // [symbol, assetSymbol] - the conversion pair
  conversionSample: string;   // Sample amount used for conversion (bigint as string)
}

interface OutputFile {
  version: string;
  generatedAt: string;
  chainId: ChainId;
  oracles: OracleOutput[];
}

interface MetadataFile {
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
```

## Bytecode Validation Types

`src/sources/oracleBytecodeValidation.ts`:

```ts
type OracleBytecodeKind = "v1" | "v2" | "unknown";

interface BytecodeValidationResult {
  address: Address;
  kind: OracleBytecodeKind;
}
```

## Real Bytecode Test Inputs

Update real bytecode constants in `tests/bytecode-real-input.test.ts`:
- `REAL_V1_BYTECODE`
- `REAL_V2_BYTECODE`
- `REAL_V2_BYTECODE_2`

Use this command when updating bytecode masks:

```bash
pnpm run bytecode:mask -- <bytecodeA|addressA> <bytecodeB|addressB> --chain <id> --const MORPHO_CHAINLINK_ORACLE_V2
```
