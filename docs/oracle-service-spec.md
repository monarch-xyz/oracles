# Monarch Oracle Service Specification

## TL;DR

Build an automated worker service that:
1. **Aggregates oracle data** from Chainlink, Redstone, Morpho API, and custom implementations
2. **Detects custom oracles** by analyzing proxy contracts and matching known patterns
3. **Publishes to GitHub** as JSON files (feeds + oracles) that Monarch frontend consumes
4. **Runs on a schedule** (cron) to keep data fresh without manual script runs

---

## Objectives

| Goal | Current State | Target State |
|------|---------------|--------------|
| Standard oracle feeds | ✅ Manual scripts, static JSON | 🎯 Auto-updated via worker |
| Custom oracle detection | ❌ Hidden from users | 🎯 Detected & displayed with metadata |
| Data freshness | ⚠️ Stale until scripts run | 🎯 Updated every 6-12 hours automatically |
| Feed enrichment | ⚠️ Partial (missing some vendors) | 🎯 Complete enrichment from all sources |
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
│  │  - Fetch all feed registries                                    │   │
│  │  - Fetch all market oracle addresses                            │   │
│  │  - Detect proxies & implementations                             │   │
│  └────────────────────────────┬────────────────────────────────────┘   │
│                               │                                        │
│                               ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    ORACLE ANALYZER                              │   │
│  │  - Match feeds to known vendors                                 │   │
│  │  - Detect custom oracle implementations                         │   │
│  │  - Extract oracle metadata (assets, decimals, etc.)             │   │
│  └────────────────────────────┬────────────────────────────────────┘   │
│                               │                                        │
│                               ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     OUTPUT GENERATOR                            │   │
│  │  - Generate feeds.json (all price feeds by chain)               │   │
│  │  - Generate oracles.json (market oracles with enrichment)       │   │
│  │  - Generate custom-impls.json (known custom implementations)    │   │
│  └────────────────────────────┬────────────────────────────────────┘   │
│                               │                                        │
└───────────────────────────────┼────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    GITHUB REPOSITORY / GIST                            │
│                                                                         │
│  monarch-oracle-data/                                                   │
│  ├── feeds/                                                             │
│  │   ├── chainlink/                                                     │
│  │   │   ├── mainnet.json                                               │
│  │   │   ├── base.json                                                  │
│  │   │   └── ...                                                        │
│  │   ├── redstone/                                                      │
│  │   │   └── ...                                                        │
│  │   └── all-feeds.json         # Merged feed registry                  │
│  ├── oracles/                                                           │
│  │   ├── mainnet.json           # Oracle -> feeds mapping               │
│  │   ├── base.json                                                      │
│  │   └── ...                                                            │
│  ├── custom-implementations/                                            │
│  │   └── registry.json          # Known custom oracle patterns          │
│  └── metadata.json              # Last update timestamp, stats          │
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
- **URL**: `https://reference-data-directory.vercel.app/feeds-{network}.json`
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
- **Purpose**: Get all oracles used by Morpho markets + feed decomposition for standard oracles
- **Rate Limit**: Should check, likely reasonable
- **Auth**: None required

### 4. Etherscan APIs (Multi-chain)
- **URLs**:
  - Mainnet: `https://api.etherscan.io/api`
  - Base: `https://api.basescan.org/api`
  - Polygon: `https://api.polygonscan.com/api`
  - Arbitrum: `https://api.arbiscan.io/api`
- **Purpose**: 
  - Detect proxy contracts → get implementation address
  - Fetch contract ABI for pattern matching
  - Get contract source code (optional, for deeper analysis)
- **Rate Limit**: 5 calls/sec (free), 10 calls/sec (paid)
- **Auth**: API key required (free tier available)

### 5. GitHub API
- **URL**: `https://api.github.com`
- **Purpose**: Commit updated JSON files to data repository
- **Rate Limit**: 5000 requests/hour with token
- **Auth**: GitHub PAT with repo write access

---

## Data Schemas

### 1. Unified Feed Schema (`feeds/all-feeds.json`)

```typescript
type UnifiedFeed = {
  address: string;                    // Feed contract address (lowercase)
  chainId: number;
  vendor: string;                     // "Chainlink" | "Redstone" | "Pyth" | "Oval" | "Lido" | "Pendle" | "Spectra" | ...
  
  // Asset pair
  baseAsset: string;                  // e.g., "ETH"
  quoteAsset: string;                 // e.g., "USD"
  
  // Feed metadata
  description?: string;               // Human-readable description
  decimals?: number;                  // Price decimals
  
  // Reliability metrics (vendor-specific)
  heartbeat?: number;                 // Seconds between updates
  deviationThreshold?: number;        // % deviation trigger
  
  // Source tracking
  source: "chainlink" | "redstone" | "morpho-api" | "manual";
  lastUpdated: string;                // ISO timestamp
};

type FeedsFile = {
  version: string;
  generatedAt: string;
  chainId: number;
  feeds: UnifiedFeed[];
};
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
  isProxy: boolean;
  proxyType?: "EIP1967" | "Transparent" | "UUPS" | "Custom" | null;
  
  // Source tracking
  source: "morpho-api" | "etherscan-analysis";
  lastUpdated: string;
};

type OraclesFile = {
  version: string;
  generatedAt: string;
  chainId: number;
  oracles: EnrichedOracle[];
};
```

### 3. Custom Implementation Registry (`custom-implementations/registry.json`)

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
      - run: pnpm run oracle:sync
        env:
          ETHERSCAN_API_KEY: ${{ secrets.ETHERSCAN_API_KEY }}
          BASESCAN_API_KEY: ${{ secrets.BASESCAN_API_KEY }}
          ARBISCAN_API_KEY: ${{ secrets.ARBISCAN_API_KEY }}
          POLYGONSCAN_API_KEY: ${{ secrets.POLYGONSCAN_API_KEY }}
      
      - name: Commit and push
        run: |
          git config user.name "Oracle Bot"
          git config user.email "bot@monarch.xyz"
          git add data/
          git diff --staged --quiet || git commit -m "chore: update oracle data $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          git push
```

### Option B: Cloudflare Worker (For Real-time)

**Pros**: Can be triggered on-demand, faster response
**Cons**: More complex setup, costs for high frequency

---

## Migration Plan: Existing Scripts → Worker

### Current Scripts to Migrate

| Script | Data Source | Output | Migration Status |
|--------|-------------|--------|------------------|
| `generate-chainlink-data.ts` | Chainlink Reference Dir | `chainlink-data/*.json` | 🔄 Migrate |
| `generate-redstone-data.ts` | Redstone GitHub | `redstone-data/*.json` | 🔄 Migrate |
| `generate-oracle-cache.ts` | Morpho API | `oracle-cache.json` | 🔄 Migrate + Enhance |

### Migration Steps

#### Phase 1: Consolidate Scripts (Week 1)

1. Create new unified worker script: `scripts/oracle-worker/index.ts`
2. Import logic from existing scripts
3. Add Etherscan integration for proxy detection
4. Output to new unified schema
5. Test locally with all data sources

#### Phase 2: Add Custom Oracle Detection (Week 2)

1. Create `custom-implementations/registry.json` with known patterns:
   - Pendle PT Oracle adapters
   - Spectra Linear Discount oracles
   - Chronicle oracles
   - Any other known custom implementations
   
2. Implement detection logic:
   ```typescript
   async function detectCustomOracle(address: string, chainId: number) {
     // 1. Check if it's a proxy
     const implAddress = await getImplementation(address, chainId);
     
     // 2. Match against known patterns
     const pattern = await matchKnownPattern(implAddress || address, chainId);
     
     // 3. Return enriched data
     return pattern ? {
       type: 'custom',
       implementation: implAddress,
       implName: pattern.name,
       implVendor: pattern.vendor,
       ...
     } : null;
   }
   ```

#### Phase 3: GitHub Actions Setup (Week 2)

1. Create data repository or use existing (as a separate branch or folder)
2. Set up GitHub Actions workflow
3. Add required secrets (API keys)
4. Test scheduled runs

#### Phase 4: Frontend Integration (Week 3)

1. Update `useOracleDataQuery` to fetch from GitHub raw URLs
2. Add fallback to bundled data
3. Update `detectFeedVendor` to use new unified feed format
4. Add UI for custom oracles in `OracleTypeInfo`

---

## File Structure for Worker

```
scripts/oracle-worker/
├── index.ts                    # Main entry point
├── sources/
│   ├── chainlink.ts            # Fetch Chainlink feeds
│   ├── redstone.ts             # Fetch Redstone feeds  
│   ├── morpho.ts               # Fetch from Morpho API
│   └── etherscan.ts            # Proxy detection & ABI fetching
├── analyzers/
│   ├── proxy-detector.ts       # Detect proxy type & implementation
│   ├── pattern-matcher.ts      # Match against known custom patterns
│   └── feed-enricher.ts        # Combine data from all sources
├── output/
│   ├── feeds-generator.ts      # Generate feeds/*.json
│   ├── oracles-generator.ts    # Generate oracles/*.json
│   └── github-publisher.ts     # Commit to GitHub (if needed)
├── types.ts                    # Shared types
└── config.ts                   # API endpoints, chain configs
```

---

## Requirements Checklist

### Infrastructure
- [ ] GitHub repository for oracle data (or use existing monarch repo with `/data` folder)
- [ ] GitHub Actions workflow file
- [ ] GitHub PAT with repo write access (if separate repo)

### API Keys (Secrets)
- [ ] `ETHERSCAN_API_KEY` - Ethereum mainnet
- [ ] `BASESCAN_API_KEY` - Base
- [ ] `ARBISCAN_API_KEY` - Arbitrum
- [ ] `POLYGONSCAN_API_KEY` - Polygon
- [ ] (Optional) Additional chain explorers as needed

### Development
- [ ] New script files under `scripts/oracle-worker/`
- [ ] Custom implementation registry with initial patterns
- [ ] Test suite for pattern matching
- [ ] Local testing with mock data

### Frontend Changes
- [ ] Update `useOracleDataQuery` hook
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

1. **Create the oracle-worker script structure** - consolidate existing scripts
2. **Register Etherscan API keys** - free tier for all chains
3. **Build custom implementation registry** - start with Pendle, Spectra
4. **Test proxy detection** - verify Etherscan API works for your use cases
5. **Set up GitHub Actions** - schedule and test
6. **Update frontend hooks** - consume new data format

