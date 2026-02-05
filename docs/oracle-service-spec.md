# Monarch Oracle Service Specification

## TL;DR

Build an automated worker service that:
1. **Fetches oracle addresses** from Morpho API (addresses only)
2. **Enriches standard oracles** using Chainlink/Redstone feed provider registries
3. **Detects proxies & custom adapters** via onchain + Etherscan V2
4. **Publishes to GitHub Gist** as JSON files (`oracles.{chainId}.json`, `meta.json`, `_state.json`)
5. **Runs on a schedule** (cron) to keep data fresh without manual script runs

---

## Objectives

| Goal | Current State | Target State |
|------|---------------|--------------|
| Standard oracle enrichment | ✅ Enriched via provider registries | 🎯 Auto-updated via worker |
| Custom oracle detection | ❌ Hidden from users | 🎯 Detected & displayed with metadata |
| Data freshness | ⚠️ Stale until scripts run | 🎯 Updated every 6-12 hours automatically |
| Feed enrichment | ⚠️ Partial (missing some providers) | 🎯 Complete enrichment from all sources |
| Deployment friction | ⚠️ Must redeploy frontend | 🎯 Just fetch new JSON from GitHub |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MONARCH ORACLE WORKER                          │
│                    (GitHub Actions / Cloudflare Worker)                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Chainlink  │  │  Redstone   │  │   Morpho    │  │  Etherscan  │    │
│  │  Registry   │  │   GitHub    │  │    API      │  │    APIs     │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │           │
│         ▼                ▼                ▼                ▼           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      DATA AGGREGATOR                            │   │
│  │  - Fetch all feed provider registries                           │   │
│  │  - Fetch all market oracle addresses                            │   │
│  │  - Detect proxies & implementations                             │   │
│  └────────────────────────────┬────────────────────────────────────┘   │
│                               │                                        │
│                               ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    ORACLE ANALYZER                              │   │
│  │  - Match feeds to known providers                               │   │
│  │  - Detect custom oracle implementations                         │   │
│  │  - Extract oracle metadata (assets, decimals, etc.)             │   │
│  └────────────────────────────┬────────────────────────────────────┘   │
│                               │                                        │
│                               ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     OUTPUT GENERATOR                            │   │
│  │  - Generate oracles.{chainId}.json                              │   │
│  │  - Generate meta.json (stats)                                   │   │
│  │  - Generate _state.json (internal state)                        │   │
│  └────────────────────────────┬────────────────────────────────────┘   │
│                               │                                        │
└───────────────────────────────┼────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GITHUB GIST OUTPUT                             │
│                                                                         │
│  - oracles.{chainId}.json     # Enriched oracle list per chain          │
│  - meta.json                  # Stats + provider counts                │
│  - _state.json                # Internal scanner state                 │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      MONARCH FRONTEND                                  │
│                                                                         │
│  useOracleData() hook                                                   │
│  - Fetches from GitHub raw URLs (cached via React Query)               │
│  - Falls back to bundled static data if fetch fails                    │
│  - Supports both standard and custom oracles                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## External Services Required

### 1. Chainlink Reference Data Directory
- **URLs**:
  - Mainnet: `https://reference-data-directory.vercel.app/feeds-mainnet.json`
  - Base: `https://reference-data-directory.vercel.app/feeds-ethereum-mainnet-base-1.json`
  - Polygon: `https://reference-data-directory.vercel.app/feeds-polygon-mainnet-katana.json`
  - Arbitrum: `https://reference-data-directory.vercel.app/feeds-ethereum-mainnet-arbitrum-1.json`
- **Purpose**: Get all Chainlink price feeds with metadata
- **Rate Limit**: None (public CDN)
- **Auth**: None required

### 2. Redstone Oracle Config
- **URL**: `https://raw.githubusercontent.com/redstone-finance/redstone-oracles-monorepo/main/packages/relayer-remote-config/main/relayer-manifests-multi-feed/{network}MultiFeed.json`
- **Purpose**: Get all Redstone price feeds
- **Rate Limit**: GitHub raw file limits
- **Auth**: None required

### 3. Morpho Blue API
- **URL**: `https://blue-api.morpho.org/graphql`
- **Purpose**: Get all oracle addresses used by Morpho markets (addresses only)
- **Rate Limit**: Should check, likely reasonable
- **Auth**: None required

### 4. Etherscan API V2 (Multichain)
- **Base URL**: `https://api.etherscan.io/v2/api`
- **Usage**: pass `chainid` for the target network (e.g., `chainid=1` for mainnet)
- **Purpose**:
  - Detect proxy contracts → get implementation address
  - Fetch contract ABI for pattern matching
  - Get contract source code (optional, for deeper analysis)
- **Auth**: one Etherscan API key works across all supported chains (V2 unified API)
- **Note**: Etherscan API V1 endpoints were deprecated on **August 15, 2025**; use V2 format with `chainid`

### 5. GitHub API
- **URL**: `https://api.github.com`
- **Purpose**: Update Gist files with latest outputs
- **Rate Limit**: 5000 requests/hour with token
- **Auth**: GitHub PAT with `gist` scope

---

## Data Schemas

### 1. Feed Provider Schema (internal, not published)

Provider data comes only from provider APIs (Chainlink/Redstone). We do not emit a separate feeds file yet.

```typescript
type UnifiedFeed = {
  address: string;                    // Feed contract address (lowercase)
  chainId: number;
  provider: string;                   // "Chainlink" | "Redstone" | "Pyth" | "Oval" | "Lido" | "Pendle" | "Spectra" | ...
  
  // Asset pair
  baseAsset: string;                  // e.g., "ETH"
  quoteAsset: string;                 // e.g., "USD"
  
  // Feed metadata
  description?: string;               // Human-readable description
  decimals?: number;                  // Price decimals
  
  // Reliability metrics (provider-specific)
  heartbeat?: number;                 // Seconds between updates
  deviationThreshold?: number;        // % deviation trigger
  
  // Source tracking
  lastUpdated: string;                // ISO timestamp (provider API fetch time)
};

// (No feeds file is published in the current implementation.)
```

### 2. Oracle Schema (`oracles/{chainId}.json`)

```typescript
type OracleType = "standard" | "custom";

type StandardOracleData = {
  type: "standard";
  baseFeedOne: string | null;         // Feed address
  baseFeedTwo: string | null;
  quoteFeedOne: string | null;
  quoteFeedTwo: string | null;
};

// Standard oracles require feed providers (Chainlink/Redstone/etc.).
// Custom oracles may not have provider-backed feeds.

type CustomOracleData = {
  type: "custom";
  implementation: string;              // Implementation address (if proxy)
  implName: string | null;             // e.g., "PendlePTOracleAdapter"
  implVendor: string | null;           // e.g., "Pendle"
  priceMethod: string | null;          // e.g., "latestAnswer()"
  description: string | null;
  
  // Inferred assets (if detectable)
  baseAsset: string | null;
  quoteAsset: string | null;
};

type EnrichedOracle = {
  address: string;                     // Oracle contract address (lowercase)
  chainId: number;
  data: StandardOracleData | CustomOracleData;
  
  // Metadata
  lastUpdated: string;                 // ISO timestamp
  isUpgradable: boolean;
  isProxy: boolean;
  proxyType?: "EIP1967" | "Transparent" | "UUPS" | "Custom" | null;
};

type OraclesFile = {
  version: string;
  generatedAt: string;
  chainId: number;
  oracles: EnrichedOracle[];
};
```

### 3. Metadata Schema (`meta.json`)

```typescript
type MetadataFile = {
  version: string;
  generatedAt: string;
  chains: {
    [chainId: number]: {
      oracleCount: number;
      standardCount: number;
      customCount: number;
      unknownCount: number;
      upgradableCount: number;
    };
  };
  providerSources: {
    chainlink: { updatedAt: string; feedCount: number };
    redstone: { updatedAt: string; feedCount: number };
  };
};
```

### 4. State Schema (`_state.json`) (internal)

```typescript
type ScannerState = {
  version: number;
  generatedAt: string;
  chains: {
    [chainId: number]: {
      cursor: { lastProcessedBlock: number };
      contracts: Record<string, unknown>;
    };
  };
};
```

### 5. Custom Implementation Registry (`custom-implementations/registry.json`) (planned)

```typescript
type CustomOraclePattern = {
  id: string;                          // Unique identifier
  name: string;                        // e.g., "PendlePTOracleAdapter"
  vendor: string;                      // e.g., "Pendle"
  
  // Detection patterns
  bytecodeSignatures?: string[];       // First N bytes of bytecode
  functionSelectors?: string[];        // Known function selectors
  knownAddresses?: {                   // Hardcoded known implementations
    [chainId: number]: string[];
  };
  
  // Extraction logic
  priceMethod: string;                 // Method to call for price
  assetExtractionMethod?: string;      // How to get asset info
  
  // Display info
  description: string;
  riskNotes?: string;
  documentationUrl?: string;
};

type CustomImplRegistry = {
  version: string;
  patterns: CustomOraclePattern[];
};
```

---

## Worker Implementation

### Option A: GitHub Actions (Recommended for Start)

**Pros**: Free, simple, integrates with GitHub output naturally
**Cons**: Limited to schedule (min 5 min), no real-time updates

```yaml
# .github/workflows/oracle-sync.yml
name: Oracle Data Sync

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:        # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm run scan
        env:
          GIST_ID: ${{ secrets.GIST_ID }}
          GITHUB_TOKEN: ${{ secrets.GIST_TOKEN }}
          ETHERSCAN_API_KEY: ${{ secrets.ETHERSCAN_API_KEY }}
          RPC_MAINNET: ${{ secrets.RPC_MAINNET }}
          RPC_BASE: ${{ secrets.RPC_BASE }}
```

### Option B: Cloudflare Worker (For Real-time)

**Pros**: Can be triggered on-demand, faster response
**Cons**: More complex setup, costs for high frequency

---

## Current Implementation

The current implementation is in `src/` and publishes outputs to a GitHub Gist. It does **not** emit separate `feeds/*.json` or custom implementation registry files yet.

```
src/
├── index.ts              # Entry point
├── scanner.ts            # Main orchestration
├── config.ts             # Chain configs, API URLs
├── types.ts              # TypeScript types
├── sources/
│   ├── morphoApi.ts      # Oracle address discovery (Morpho API)
│   ├── morphoFactory.ts  # Onchain feed reads for standard oracles
│   ├── factoryVerifier.ts# Factory verification (onchain)
│   ├── chainlink.ts      # Chainlink feed provider registry
│   └── redstone.ts       # Redstone feed provider registry
├── analyzers/
│   ├── proxyDetector.ts  # EIP-1967 proxy detection
│   ├── customAdapters.ts # Known custom oracle patterns
│   └── feedProviderMatcher.ts # Match feeds to providers
└── state/
    └── store.ts          # Gist read/write
```

---

## Requirements Checklist

### Infrastructure
- [ ] GitHub Gist for oracle outputs
- [ ] GitHub Actions workflow file
- [ ] GitHub PAT with `gist` scope

### API Keys (Secrets)
- [ ] `ETHERSCAN_API_KEY` - Etherscan API V2 (single key for all chains)

### Development
- [ ] Custom implementation registry with initial patterns
- [ ] Skip re-fetching feeds for non-upgradable standard oracles; only re-validate feed provider support
- [ ] Test suite for pattern matching
- [ ] Local testing with mock data

### Frontend Changes
- [ ] Update `useOracleDataQuery` hook to read from Gist outputs
- [ ] Add custom oracle display components
- [ ] Remove warning for known custom oracles
- [ ] Add vendor icons for new vendors (Pendle, Spectra, etc.)

---

## Open Questions

1. **Data storage**: 
   - Same repo (`/data` folder) vs separate repo?
   - GitHub Gist vs full repository?
   
2. **Update frequency**:
   - Every 6 hours sufficient?
   - Need on-demand trigger (webhook when new market created)?

3. **Custom oracle scope**:
   - Start with top 5-10 known implementations?
   - Manual curation vs automated detection?

4. **Fallback behavior**:
   - Bundle last-known-good data in frontend?
   - How long to cache fetched data?

---

## Next Steps

1. **Validate Gist publishing** with a local run and scheduled GitHub Actions
2. **Decide storage target** (Gist vs repo for discoverability)
3. **Expand custom adapter registry** and output richer custom metadata
4. **Optionally publish provider feeds** as separate JSON files
