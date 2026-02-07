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
  | (OracleOutputBase & { type: "custom"; data: CustomOracleOutputData })
  | (OracleOutputBase & { type: "unknown"; data: UnknownOracleOutputData });

interface StandardOracleOutputData {
  baseFeedOne: EnrichedFeed | null;
  baseFeedTwo: EnrichedFeed | null;
  quoteFeedOne: EnrichedFeed | null;
  quoteFeedTwo: EnrichedFeed | null;
}
```

```ts
interface EnrichedFeed {
  address: Address;
  description: string;
  pair: [string, string] | [];
  provider: FeedProvider | null;
  decimals?: number;
  tier?: string;
  heartbeat?: number;            // Update frequency in seconds (Chainlink, Redstone)
  deviationThreshold?: number;   // Deviation % trigger (Chainlink, Redstone)
  ens?: string;                  // Chainlink ENS slug for feed page URL (e.g., "eth-usd")
  feedType?: string;             // Redstone feed type: "fundamental" or "market"
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

Use these commands when updating V2 masking:

```bash
pnpm run bytecode:mask:v2
pnpm run bytecode:mask:v2:write
```
