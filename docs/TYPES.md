# Type System Documentation

This document defines the type hierarchy and data flow between the **oracles** scanner and **monarch** frontend.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Data Sources                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Chainlink API    Redstone API    Hardcoded (Compound, Lido, etc.)  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Oracles Scanner (this repo)                       │
│  - Fetches feed data from provider APIs                             │
│  - Scans Morpho oracles via Morpho API                              │
│  - Enriches oracle feeds with provider metadata                      │
│  - Publishes to GitHub Gist                                          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GitHub Gist (Output)                            │
│  oracles.{chainId}.json - Per-chain oracle metadata                 │
│  metadata.json - Summary statistics                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Monarch Frontend                                  │
│  - Fetches Gist via /api/oracle-metadata/{chainId}                  │
│  - Merges with Morpho API oracle data                               │
│  - Renders vendor badges, warnings, tooltips                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Type Definitions

### Oracles Scanner Types (`src/types.ts`)

#### `FeedInfo` - Raw Feed Data from Providers
```typescript
interface FeedInfo {
  address: Address;
  chainId: ChainId;
  provider: FeedProvider;       // "Chainlink" | "Redstone" | "Compound" | etc.
  description: string;          // Human-readable name, e.g., "ETH / USD"
  pair: [string, string] | null; // [baseAsset, quoteAsset]
  decimals?: number;
  heartbeat?: number;           // Seconds between updates
  deviationThreshold?: number;  // % deviation trigger
  tier?: string;                // Chainlink only: "verified", "high", "medium", "low", "custom"
}
```

#### `EnrichedFeed` - Output Feed Format (Gist)
```typescript
interface EnrichedFeed {
  address: Address;
  description: string;
  pair: [string, string] | [];
  provider: FeedProvider | null;
  decimals?: number;
  tier?: string;                // Only for Chainlink feeds
}
```

#### `OracleOutput` - Full Oracle Metadata (Gist)
```typescript
interface OracleOutput {
  address: Address;
  chainId: ChainId;
  type: "standard" | "custom" | "unknown";
  verifiedByFactory: boolean;
  isUpgradable: boolean;
  proxy: {
    isProxy: boolean;
    proxyType?: string;
    implementation?: Address;
  };
  data: {
    baseFeedOne: EnrichedFeed | null;
    baseFeedTwo: EnrichedFeed | null;
    quoteFeedOne: EnrichedFeed | null;
    quoteFeedTwo: EnrichedFeed | null;
  };
  lastScannedAt: string;
}
```

### Monarch Frontend Types

#### `OracleFeed` - From Morpho API (`src/utils/types.ts`)
```typescript
// Basic feed info from Morpho GraphQL API
type OracleFeed = {
  address: string;
  chain: { id: number };
  id: string;
  pair: string[] | null;
};
```

#### `EnrichedFeed` - From Oracles Gist (`src/hooks/useOracleMetadata.ts`)
```typescript
// Extended feed info from our oracle scanner
type EnrichedFeed = {
  address: string;
  description: string;
  pair: [string, string] | [];
  provider: OracleFeedProvider;  // "Chainlink" | "Redstone" | etc.
  decimals?: number;
  tier?: string;
};
```

#### `FeedData` - UI Component Type (`src/utils/oracle.ts`)
```typescript
// Simplified type for rendering in tooltips/badges
type FeedData = {
  address: string;
  vendor: string;
  description: string;
  pair: [string, string];
  decimals: number;
  tier?: string;
};
```

## Data Flow

### 1. Scanner → Gist

```
FeedInfo (from provider APIs)
    ↓
enrichFeed() in FeedProviderMatcher
    ↓
EnrichedFeed (stored in OracleOutput.data)
    ↓
JSON serialized to Gist
```

### 2. Gist → Frontend

```
Gist JSON (oracles.{chainId}.json)
    ↓
/api/oracle-metadata/{chainId} (Next.js API route)
    ↓
useOracleMetadata(chainId) hook
    ↓
OracleMetadataRecord (Map<address, OracleOutput>)
    ↓
getOracleFromMetadata() → OracleOutput
    ↓
getFeedFromOracleData() → EnrichedFeed
    ↓
detectFeedVendorFromMetadata() → FeedVendorResult { vendor, data: FeedData }
```

### 3. Type Mapping

| Oracles Scanner | Monarch Frontend | Purpose |
|-----------------|------------------|---------|
| `FeedProvider` | `OracleFeedProvider` | Provider enum |
| `EnrichedFeed` | `EnrichedFeed` | Extended feed metadata |
| `OracleOutput` | `OracleOutput` | Full oracle metadata |
| - | `OracleFeed` | Morpho API feed (basic) |
| - | `FeedData` | UI rendering |

## Provider-Specific Fields

### Chainlink
- `tier`: Feed risk category from Chainlink API
  - `"verified"` - Verified feeds (highest trust)
  - `"high"` / `"monitored"` - Monitored feeds
  - `"medium"` - Medium risk
  - `"low"` - Lower risk
  - `"custom"` - Custom/specialized feeds
- `heartbeat`: Update frequency in seconds
- `deviationThreshold`: Price deviation trigger (%)

### Redstone
- `heartbeat`: From `timeSinceLastUpdateInMilliseconds`
- `deviationThreshold`: From `deviationPercentage`

### Hardcoded Providers (Compound, Lido, Oval, Pyth)
- No tier/heartbeat (verified by manual inspection)
- Static feed lists maintained in `src/sources/hardcoded/`

## Adding New Fields

When adding a new field:

1. **Oracles Scanner:**
   - Add to `FeedInfo` in `src/types.ts`
   - Add to `EnrichedFeed` in `src/types.ts`
   - Update provider fetcher (e.g., `chainlink.ts`) to capture the field
   - Update `enrichFeed()` in `feedProviderMatcher.ts` to include the field

2. **Monarch Frontend:**
   - Add to `EnrichedFeed` in `src/hooks/useOracleMetadata.ts`
   - Add to `FeedData` in `src/utils/oracle.ts`
   - Update `detectFeedVendorFromMetadata()` to include the field
   - Update relevant tooltip components to display the field

3. **Re-run Scanner:**
   ```bash
   cd oracles && pnpm build && pnpm scan
   ```

## Versioning

- Gist output includes `version` field (currently `"1.0.0"`)
- Breaking changes to output format require version bump
- Frontend should handle missing fields gracefully (optional types)
