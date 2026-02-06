# Oracle Service Spec (Current Implementation)

This document describes how the scanner currently works in this repository.

## Scope

- Input: Morpho market oracle addresses across active chains
- Processing: standard oracle classification, feed enrichment, proxy/custom analysis
- Output: Gist JSON files (`oracles.{chainId}.json`, `meta.json`, `_state.json`)

## Active Chains

Defined in `src/config.ts`:
- `1` (mainnet)
- `8453` (base)
- `42161` (arbitrum)
- `137` (polygon)
- `130` (unichain)
- `999` (hyperevm)
- `143` (monad testnet)

## Pipeline

All orchestration is in `src/scanner.ts`.

### Stage 1: Oracle Address Discovery

- Source: `src/sources/morphoApi.ts`
- Fetches all market pages from Morpho GraphQL API
- Deduplicates by `(chainId, oracleAddress)`

### Stage 2: Feed Registry Load

- Dynamic providers:
- `src/sources/chainlink.ts`
- `src/sources/redstone.ts`
- Hardcoded providers:
- `src/sources/hardcoded/compound.ts`
- `src/sources/hardcoded/lido.ts`
- `src/sources/hardcoded/oval.ts`
- `src/sources/hardcoded/pyth.ts`
- Registries are added to `FeedProviderMatcher`

### Stage 3: Standard Oracle Classification

Implemented by `resolveStandardClassifications()` in `src/scanner.ts`.

1. Validate V2 by factory (batch)
- `fetchFactoryVerifiedMap()` in `src/sources/factoryVerifier.ts`

2. Fetch V2 feeds for factory-verified addresses (batch multicall)
- `fetchV2OracleFeedsBatch()` in `src/sources/oracleFeedFetcher.ts`

3. Validate remaining addresses by bytecode (1-by-1)
- `validateOraclesByBytecodeOneByOne()` in `src/sources/oracleBytecodeValidation.ts`
- Bytecode checks:
- V1: `src/sources/oracleV1Detector.ts`
- V2: `src/sources/oracleV2BytecodeDetector.ts`

4. Fetch feeds grouped by resolved type (batch)
- V1 bytecode-verified group: `fetchV1OracleFeedsBatch()`
- V2 bytecode-verified group: `fetchV2OracleFeedsBatch()`

### Stage 4: Non-Standard Contracts

If standard classification fails:
- Detect proxy information with Etherscan V2 and EIP-1967 slots (`src/analyzers/proxyDetector.ts`)
- Match known custom adapters (`src/analyzers/customAdapters.ts`)
- Else classify as unknown

### Stage 5: Build and Publish Output

- Build per-chain outputs (`OutputFile`) and metadata (`MetadataFile`)
- Persist to Gist in `src/state/store.ts`

## Bytecode Validation Spec

### V1

- Reference target: `src/bytecodes/morpho-chainlink-oracle-v1.ts`
- Comparator: normalize then exact compare
- Normalization logic: `src/bytecodes/normalize.ts` (masks PUSH32 immediates)

### V2

- Masked target + ignored indices: `src/bytecodes/morpho-chainlink-oracle-v2-mask.ts`
- Comparator: normalize, apply ignored-byte mask, compare to masked target
- Mask helper: `src/bytecodes/mask.ts`

## Real Bytecode Test Procedure

1. Paste real bytecode strings in `tests/bytecode-real-input.test.ts`:
- `REAL_V1_BYTECODE`
- `REAL_V2_BYTECODE`
- `REAL_V2_BYTECODE_2`

2. Run validation tests:

```bash
pnpm test tests/bytecode-real-input.test.ts
```

3. If V2 requires updated mask from two valid deployments:

```bash
pnpm run bytecode:mask:v2
```

4. Paste output into `src/bytecodes/morpho-chainlink-oracle-v2-mask.ts`, or run:

```bash
pnpm run bytecode:mask:v2:write
```

5. Re-run full checks:

```bash
pnpm test
pnpm run lint
```

## Scheduling

Workflow file: `.github/workflows/oracle-sync.yml`
- Cron: every 6 hours
- Also supports manual trigger (`workflow_dispatch`)
