# Morpho Oracle Scanner

Scans Morpho market oracles across supported chains, classifies each oracle from first principles (factory verification + bytecode checks), enriches feeds with provider metadata, and publishes JSON outputs to a GitHub Gist.

## What It Does

- Fetches oracle addresses from Morpho API
- Classifies standard Morpho Chainlink oracles with a staged flow:
  1. Validate V2 by factory (batch)
  2. Fetch V2 feeds for factory-verified addresses (multicall)
  3. Validate non-factory addresses by bytecode one-by-one (V1/V2)
  4. Fetch feeds in batch by resolved oracle type (V1 batch + V2 batch)
- Detects and tracks proxy implementations for non-standard contracts
- Matches feed addresses to provider registries (Chainlink, Redstone, hardcoded providers)
- Writes `oracles.{chainId}.json`, `meta.json`, and `_state.json` to a Gist

## Supported Oracles And Feeds

Standard oracles can include embedded feed addresses (Morpho Chainlink V1/V2). Non-standard
oracles are tracked separately and may or may not expose feeds.

Supported oracle types:
- Morpho Chainlink Oracle V2 (factory verified or bytecode verified)
- Morpho Chainlink Oracle V1 (bytecode verified)
- Custom adapters (known patterns; see `src/analyzers/customAdapters.ts`)
- Unknown (fallback when no standard or custom match)

Supported feed providers:
- Chainlink (registry fetch)
- Redstone (registry fetch)
- Compound (hardcoded wrapper feeds)
- Lido (hardcoded stETH rate feeds)
- Oval (hardcoded wrapper feeds)
- Pyth (hardcoded feeds)
- Pendle (bytecode detection + factory events)

### Oracle vs Feed (First Principles)

Oracles are on-chain contracts that compute Morpho prices using one or more feeds.
Feeds are on-chain price sources (Chainlink, Redstone, Pendle, etc.) that return raw
price data. The scanner classifies oracles, then separately enriches feeds by provider.

- Oracles live in `src/scanner.ts` and are classified into standard, meta, custom, or unknown.
- Feeds are matched in `src/analyzers/feedProviderMatcher.ts` using provider registries.
- Providers load their own registries in `src/sources/` and return `FeedInfo` objects.

### Pendle Feeds

Pendle feeds are part of the feed enrichment pipeline (not oracle classification) and are tagged
with `pendleFeedKind` plus a `pendleFeedSubtype` for frontend-specific UX. All Pendle feeds
set `provider: "Pendle"` and include PT metadata when available.

Supported Pendle feed subtypes:
- `LinearDiscountWrapper`: bytecode-detected wrapper that points to an inner linear discount oracle.
- `SparkLinearDiscountOracle`: factory-event detected feed contract created by
  `PendleSparkLinearDiscountOracleFactory` (mainnet: `0x34c91651a070664279866e5f3d6b4d5f65cbbffb`).
- `ChainlinkOracle`: bytecode-detected Pendle Chainlink oracle feed.

Pendle feed discovery flow:
1. The scanner gathers feed addresses from classified Morpho oracles.
2. The Pendle provider augments feed addresses with Spark Linear Discount oracles discovered from
   factory events (`OracleCreated`) via Etherscan logs.
3. Pendle feeds are enriched with PT symbols, pairs, and discount parameters before matching.

## Setup

1. Copy `.env.example` to `.env` and configure:

```bash
GIST_ID=your_gist_id
GITHUB_TOKEN=ghp_your_token
ETHERSCAN_API_KEY=your_etherscan_v2_key

# Optional RPC overrides
RPC_MAINNET=https://eth-mainnet.g.alchemy.com/v2/your-key
RPC_BASE=https://base-mainnet.g.alchemy.com/v2/your-key
RPC_ARBITRUM=https://arb-mainnet.g.alchemy.com/v2/your-key
RPC_POLYGON=https://polygon-mainnet.g.alchemy.com/v2/your-key
RPC_UNICHAIN=https://mainnet.unichain.org
RPC_HYPEREVM=https://rpc.hyperliquid.xyz/evm
RPC_MONAD=https://testnet-rpc.monad.xyz
```

2. Install and run:

```bash
pnpm install
pnpm run scan
```

## Commands

- `pnpm run scan`: run scanner
- `pnpm run build`: compile TypeScript
- `pnpm run typecheck`: TypeScript no-emit check
- `pnpm run lint`: biome checks
- `pnpm run test`: run tests
- `pnpm run bytecode:mask`: generate COMMON + MASK constants from two bytecodes or addresses

## Classification Refresh Behavior

The scanner only reclassifies oracles when they are new, unclassified, or when
`--force-rescan` / `--force-reclassify` is provided. That means a previously
recognized standard oracle will not automatically downgrade to `unknown` unless
you force a rescan. The one exception is proxy contracts: if an implementation
changes, the scanner will re-run custom adapter matching and set the
classification to `Unknown` when no match is found.

## Real Bytecode Validation Workflow

This is the place to validate against real deployed bytecode, not only reference constants.

1. Open `tests/bytecode-real-input.test.ts`.
2. Paste real bytecode hex values into:
- `REAL_V1_BYTECODE`
- `REAL_V2_BYTECODE`
- `REAL_V2_BYTECODE_2`
3. Run:

```bash
pnpm test tests/bytecode-real-input.test.ts
```

4. If two valid bytecodes differ because of runtime immutables, regenerate the mask/common:

```bash
pnpm run bytecode:mask -- <bytecodeA|addressA> <bytecodeB|addressB> --chain <id> --const MORPHO_CHAINLINK_ORACLE_V2
```

5. Paste the printed output into `src/bytecodes/oracle-bytecode-constants.ts`.

6. Re-run tests:

```bash
pnpm test
pnpm run lint
```

## Outputs

- `oracles.{chainId}.json`: classified and enriched oracle list per chain
- `meta.json`: summary counts and provider stats
- `_state.json`: scanner state used for incremental context and proxy tracking

`oracles.{chainId}.json` includes feed metadata for standard oracles. Each feed is serialized as
an `EnrichedFeed` object (see `src/types.ts`) with provider-specific fields. For Pendle feeds,
the output includes:

- `provider: "Pendle"`
- `pendleFeedKind`: `LinearDiscount` or `ChainlinkOracle`
- `pendleFeedSubtype`: `LinearDiscountWrapper`, `SparkLinearDiscountOracle`, or `ChainlinkOracle`
- `baseDiscountPerYear`, `pt`, `ptSymbol`, plus optional oracle-type data (`pendleOracleType`, `twapDuration`)

## Current Source Layout

```text
src/
  scanner.ts                         # Main orchestration
  types.ts                           # Shared types and output schemas
  sources/
    morphoApi.ts                     # Oracle address source
    factoryVerifier.ts               # V2 factory verification (batch)
    oracleBytecodeValidation.ts      # Bytecode validation stage (1-by-1)
    oracleFeedFetcher.ts             # V1/V2 feed multicalls (batch)
    etherscanLogs.ts                 # Event log fetch helper (factory discovery)
    hardcoded/pendle.ts              # Pendle feed enrichment + factory log discovery
    oracleV1Detector.ts              # V1 bytecode check
    oracleV2BytecodeDetector.ts      # V2 masked bytecode check
  bytecodes/
    normalize.ts                     # PUSH32 immutable normalization
    mask.ts                          # Byte-index mask helper
    morpho-chainlink-oracle-v1.ts    # V1 normalized target
    morpho-chainlink-oracle-v2-mask.ts # V2 masked target + ignored byte indices
```

## CI

GitHub Action `.github/workflows/oracle-sync.yml` runs every 6 hours and on manual trigger.
