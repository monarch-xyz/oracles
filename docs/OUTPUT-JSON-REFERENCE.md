# Output JSON Reference (Frontend)

This document describes every JSON file the oracle scanner publishes and exactly what each field contains. Use this as the contract between the scanner backend and the frontend.

---

## Files Overview

| File | Description |
| --- | --- |
| `oracles.{chainId}.json` | All oracle data for a single chain (one file per chain) |
| `meta.json` | Aggregate stats across all chains + provider metadata |
| `_state.json` | Internal scanner state (not for frontend use) |

Active chain IDs: `1` (Mainnet), `8453` (Base), `42161` (Arbitrum), `137` (Polygon), `130` (Unichain), `999` (Hyperliquid EVM), `143` (Monad)

---

## `oracles.{chainId}.json`

Top-level wrapper for all oracles on one chain.

```jsonc
{
  "version": "1.0.0",            // Schema version
  "generatedAt": "2026-02-07T10:30:45.123Z",  // ISO-8601 timestamp
  "chainId": 1,                  // Chain ID (number)
  "oracles": [ /* OracleOutput[] */ ]
}
```

### `OracleOutput`

Every oracle entry has a shared base plus a `type` discriminator with type-specific `data`.

#### Shared base fields (all oracle types)

| Field | Type | Description |
| --- | --- | --- |
| `address` | `"0x..."` | Oracle contract address |
| `chainId` | `number` | Chain ID |
| `verifiedByFactory` | `boolean` | `true` if verified via Morpho factory; `false` otherwise |
| `lastUpdated` | `string` | ISO-8601 timestamp of last observed activity |
| `isUpgradable` | `boolean` | `true` if the contract is behind a proxy |
| `proxy` | `object` | Proxy details (see below) |
| `lastScannedAt` | `string` | ISO-8601 timestamp of the last scan that processed this oracle |
| `type` | `"standard" \| "meta" \| "custom" \| "unknown"` | Discriminator for the `data` shape |
| `data` | `object` | Type-specific data (see below) |

#### `proxy` object

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `isProxy` | `boolean` | always | Whether the contract is a proxy |
| `proxyType` | `string` | if `isProxy` | `"EIP1967"`, `"Beacon"`, or `"Unknown"` |
| `implementation` | `"0x..."` | if `isProxy` | Current implementation address |
| `lastImplChangeAt` | `string` | optional | ISO-8601 timestamp when the implementation last changed |

---

### Type: `"standard"`

Standard Morpho Chainlink Oracle (V1 or V2). Has up to 4 price feed slots.

```jsonc
{
  // ...base fields...
  "type": "standard",
  "data": {
    "baseFeedOne":  /* EnrichedFeed | null */,
    "baseFeedTwo":  /* EnrichedFeed | null */,
    "quoteFeedOne": /* EnrichedFeed | null */,
    "quoteFeedTwo": /* EnrichedFeed | null */
  }
}
```

Each feed slot is either `null` (unused) or an `EnrichedFeed` object.

#### `EnrichedFeed`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | `"0x..."` | always | Feed contract address |
| `description` | `string` | always | Human-readable name, e.g. `"ETH / USD"`. `"Unknown Feed"` if not found in any registry. |
| `pair` | `[string, string] \| []` | always | Parsed trading pair, e.g. `["ETH", "USD"]`. Empty array if unknown. Pendle uses API symbol parsing: `PT-reUSD-25JUN2026` → `["PT-reUSD-25JUN2026", "reUSD"]`. |
| `provider` | `string \| null` | always | Feed provider name (see values below). `null` if not found in any registry. |
| `decimals` | `number` | optional | Answer precision (e.g. `8` for Chainlink USD feeds) |
| `tier` | `string` | optional | Feed quality tier. Chainlink values: `"verified"`, `"monitored"`, `"high"`, `"medium"`, `"low"`, `"custom"`. |
| `heartbeat` | `number` | optional | Maximum update interval in **seconds**. E.g. `3600` = feed updates at least every hour. Present for Chainlink and Redstone feeds. |
| `deviationThreshold` | `number` | optional | Price deviation percentage that triggers an update. E.g. `0.5` = a 0.5% price move triggers an update. Present for Chainlink and Redstone feeds. |
| `ens` | `string` | optional | Chainlink ENS slug for building the feed page URL. E.g. `"eth-usd"` → `https://data.chain.link/feeds/ethereum/mainnet/eth-usd`. Only present for Chainlink feeds. |
| `feedType` | `string` | optional | Redstone feed pricing type. `"fundamental"` = asset priced vs its underlying (e.g. wstETH vs ETH). `"market"` = asset priced vs USD. Only present for Redstone feeds. |
| `pendleFeedKind` | `string` | optional | Pendle feed variant: `"LinearDiscount"` or `"ChainlinkOracle"`. |
| `pendleOracleType` | `string` | optional | Pendle Chainlink oracle pricing direction: `"PT_TO_SY"`, `"PT_TO_ASSET"`, `"LP_TO_SY"`, `"LP_TO_ASSET"`. |
| `twapDuration` | `number` | optional | Pendle Chainlink oracle TWAP window, in seconds. |
| `baseDiscountPerYear` | `string` | optional | Pendle feed parameter returned from the inner oracle. |
| `innerOracle` | `string` | optional | Pendle inner oracle address. |
| `pt` | `string` | optional | Pendle PT token address. |
| `ptSymbol` | `string` | optional | Pendle PT token symbol. |

**Provider values:** `"Chainlink"`, `"Redstone"`, `"Chronicle"`, `"Pyth"`, `"Oval"`, `"Lido"`, `"Compound"`, `"Pendle"`, `"Spectra"`, `"Unknown"`

---

### Type: `"meta"`

MetaOracleDeviationTimelock (combines primary + backup oracle sources with timelocks).

```jsonc
{
  // ...base fields...
  "type": "meta",
  "data": {
    "primaryOracle": "0x...",                 // Primary oracle address
    "backupOracle": "0x...",                  // Backup oracle address
    "currentOracle": "0x...",                 // Active oracle address
    "deviationThreshold": "10000000000000000", // Scaled by 1e18 (e.g., 1% = 0.01e18)
    "challengeTimelockDuration": 3600,        // Seconds
    "healingTimelockDuration": 86400,         // Seconds
    "oracleSources": {
      "primary": { /* StandardOracleOutputData | null */ },
      "backup": { /* StandardOracleOutputData | null */ }
    }
  }
}
```

`oracleSources` mirrors the standard `data` shape, but nested under `primary` and `backup` to
show the oracle hierarchy and make it easy for the frontend to render both paths.

---

### Type: `"custom"`

A non-standard oracle matched to a known adapter pattern (e.g. Uniswap V3 TWAP, Pendle PT).

```jsonc
{
  // ...base fields...
  "type": "custom",
  "data": {
    "adapterId": "uniswap-v3",         // Machine-readable adapter ID
    "adapterName": "Uniswap V3 TWAP",  // Human-readable name
    "feeds": { /* partial StandardOracleOutputData, optional */ },
    "metadata": { /* adapter-specific key-value pairs, optional */ }
  }
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `adapterId` | `string` | always | Identifier for the adapter pattern |
| `adapterName` | `string` | always | Display name |
| `feeds` | `object` | optional | Partial feed data (same shape as standard `data`, but any slot may be missing) |
| `metadata` | `object` | optional | Free-form adapter-specific info (e.g. pool address, TWAP window) |

---

### Type: `"unknown"`

An oracle that could not be classified.

```jsonc
{
  // ...base fields...
  "type": "unknown",
  "data": {
    "reason": "No standard feeds, no custom adapter match"
  }
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `reason` | `string` | always | Why classification failed |

---

## `meta.json`

Aggregate metadata across all chains, useful for dashboards and summaries.

```jsonc
{
  "version": "1.0.0",
  "generatedAt": "2026-02-07T10:30:45.123Z",
  "gitSha": "c3b67bc...",           // optional, commit hash of the scanner run
  "chains": {
    "1": {
      "oracleCount": 42,            // Total oracles on this chain
      "standardCount": 35,          // type: "standard"
      "metaCount": 2,               // type: "meta"
      "customCount": 5,             // type: "custom"
      "unknownCount": 2,            // type: "unknown"
      "upgradableCount": 8          // isUpgradable: true
    },
    "8453": { /* same shape */ }
    // ...one entry per active chain
  },
  "providerSources": {
    "chainlink": {
      "updatedAt": "2026-02-07T10:20:00Z",  // When the Chainlink registry was last fetched
      "feedCount": 2500                       // Total feeds loaded from Chainlink
    },
    "redstone": {
      "updatedAt": "2026-02-07T10:15:00Z",
      "feedCount": 1200
    }
  }
}
```

---

## Full Example: `oracles.1.json`

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-02-07T10:30:45.123Z",
  "chainId": 1,
  "oracles": [
    {
      "address": "0x0123456789abcdef0123456789abcdef01234567",
      "chainId": 1,
      "verifiedByFactory": true,
      "lastUpdated": "2026-02-07T10:30:00Z",
      "isUpgradable": false,
      "proxy": { "isProxy": false },
      "lastScannedAt": "2026-02-07T10:30:00Z",
      "type": "standard",
      "data": {
        "baseFeedOne": {
          "address": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "description": "ETH / USD",
          "pair": ["ETH", "USD"],
          "provider": "Chainlink",
          "decimals": 8,
          "tier": "verified",
          "heartbeat": 3600,
          "deviationThreshold": 0.5,
          "ens": "eth-usd"
        },
        "baseFeedTwo": null,
        "quoteFeedOne": {
          "address": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "description": "USDC / USD",
          "pair": ["USDC", "USD"],
          "provider": "Chainlink",
          "decimals": 8,
          "tier": "verified",
          "heartbeat": 86400,
          "deviationThreshold": 1,
          "ens": "usdc-usd"
        },
        "quoteFeedTwo": null
      }
    },
    {
      "address": "0x0234567890abcdef0234567890abcdef02345678",
      "chainId": 1,
      "verifiedByFactory": false,
      "lastUpdated": "2026-02-07T10:25:00Z",
      "isUpgradable": true,
      "proxy": {
        "isProxy": true,
        "proxyType": "EIP1967",
        "implementation": "0x1234567890abcdef1234567890abcdef12345678",
        "lastImplChangeAt": "2026-01-20T15:45:00Z"
      },
      "lastScannedAt": "2026-02-07T10:25:00Z",
      "type": "custom",
      "data": {
        "adapterId": "uniswap-v3",
        "adapterName": "Uniswap V3 TWAP Oracle",
        "metadata": {
          "pool": "0xaabbccddaabbccddaabbccddaabbccddaabbccdd",
          "twapWindow": 600
        }
      }
    },
    {
      "address": "0x0345678901bcdef0345678901bcdef0345678901",
      "chainId": 1,
      "verifiedByFactory": false,
      "lastUpdated": "2026-02-07T10:20:00Z",
      "isUpgradable": false,
      "proxy": { "isProxy": false },
      "lastScannedAt": "2026-02-07T10:20:00Z",
      "type": "unknown",
      "data": {
        "reason": "No standard feeds, no custom adapter match"
      }
    }
  ]
}
```
