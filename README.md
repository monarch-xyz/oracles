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
- `pnpm run bytecode:mask:v2`: generate pasteable V2 mask constants from real test inputs
- `pnpm run bytecode:mask:v2:write`: same as above, but writes directly to `src/bytecodes/morpho-chainlink-oracle-v2-mask.ts`

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

4. If two valid V2 bytecodes differ because of runtime immutables, regenerate the mask:

```bash
pnpm run bytecode:mask:v2
```

5. Paste the printed output into `src/bytecodes/morpho-chainlink-oracle-v2-mask.ts`.
   Alternatively:

```bash
pnpm run bytecode:mask:v2:write
```

6. Re-run tests:

```bash
pnpm test
pnpm run lint
```

## Outputs

- `oracles.{chainId}.json`: classified and enriched oracle list per chain
- `meta.json`: summary counts and provider stats
- `_state.json`: scanner state used for incremental context and proxy tracking

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
