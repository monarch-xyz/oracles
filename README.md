# Morpho Oracle Scanner

Standalone service that aggregates and publishes Morpho oracle data to GitHub Gist.

## Documentation

- **[Type System](docs/TYPES.md)** - Type definitions and data flow between oracles scanner and monarch frontend

## Features

- **Factory verification**: Only trusts oracles created via `MorphoChainlinkOracleV2Factory`
- **Feed matching**: Enriches feeds with Chainlink/Redstone registry metadata
- **Proxy detection**: Tracks upgradable oracles (EIP-1967) and rescans implementations every 24h
- **Custom adapters**: Pattern matching for Pendle, Spectra, Lido, Chronicle, Oval
- **Gist publishing**: Outputs JSON files consumable by frontend

## Setup

1. Create a GitHub Gist (can be private or public)
2. Generate a GitHub PAT with `gist` scope
3. Copy `.env.example` to `.env` and fill in:

```bash
GIST_ID=your_gist_id
GITHUB_TOKEN=ghp_your_token

# Optional but recommended for proxy detection (Etherscan V2 single key)
ETHERSCAN_API_KEY=your_key

# Optional: better RPC endpoints
RPC_MAINNET=https://eth-mainnet.g.alchemy.com/v2/your-key
RPC_BASE=https://base-mainnet.g.alchemy.com/v2/your-key
```

4. Run locally:

```bash
pnpm install
pnpm run scan
```

## Output Schema

### `oracles.{chainId}.json`

```typescript
{
  "version": "1.0.0",
  "generatedAt": "2024-01-15T12:00:00Z",
  "chainId": 1,
  "oracles": [
    {
      "address": "0x...",
      "chainId": 1,
      "type": "standard" | "custom" | "unknown",
      "verifiedByFactory": true,
      "lastUpdated": "2024-01-15T12:00:00Z",
      "isUpgradable": false,
      "proxy": {
        "isProxy": false,
        "proxyType": "EIP1967",
        "implementation": "0x...",
        "lastImplChangeAt": "2024-01-10T..."
      },
      "data": {
        "baseFeedOne": {
          "address": "0x...",
          "chain": { "id": 1 },
          "description": "ETH / USD",
          "pair": ["ETH", "USD"],
          "provider": "Chainlink",
          "decimals": 8
        },
        // baseFeedTwo, quoteFeedOne, quoteFeedTwo...
      },
      "lastScannedAt": "2024-01-15T12:00:00Z"
    }
  ]
}
```

## GitHub Actions

Runs every 6 hours automatically. Configure secrets in repo settings:

- `GIST_ID`
- `GIST_TOKEN` (PAT with gist scope)
- `ETHERSCAN_API_KEY`
- `RPC_MAINNET` (optional)
- `RPC_BASE` (optional)

## Adding Custom Adapters

Edit `src/analyzers/customAdapters.ts`:

```typescript
{
  id: "your-adapter-id",
  name: "Your Adapter Name",
  vendor: "VendorName",
  description: "Description",
  knownImplementations: {
    1: ["0x...implementation-address"],
  },
  priceMethod: "latestAnswer()",
}
```

## Architecture

```
src/
├── index.ts              # Entry point
├── scanner.ts            # Main orchestration
├── config.ts             # Chain configs, API URLs
├── types.ts              # TypeScript types
├── sources/
│   ├── morphoFactory.ts  # Factory event discovery + feed fetching
│   ├── chainlink.ts      # Chainlink feed provider registry
│   └── redstone.ts       # Redstone feed provider registry
├── analyzers/
│   ├── proxyDetector.ts  # EIP-1967 proxy detection
│   ├── customAdapters.ts # Known custom oracle patterns
│   └── feedProviderMatcher.ts # Match feeds to providers
└── state/
    └── store.ts          # Gist read/write
```
