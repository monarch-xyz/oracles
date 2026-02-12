# MetaOracleDeviationTimelock Summary

This document captures the current implementation state for MetaOracleDeviationTimelock support.

## Output Shape

- New oracle output type: `type: "meta"`.
- `data` includes:
  - `primaryOracle`, `backupOracle`, `currentOracle`
  - `deviationThreshold` (string, scaled by 1e18)
  - `challengeTimelockDuration`, `healingTimelockDuration` (seconds)
  - `oracleSources` with nested `primary` + `backup` standard feed shapes.

See:
- `docs/OUTPUT-JSON-REFERENCE.md`
- `docs/TYPES.md`
- `src/types.ts`

## Detection + Config Gathering

- Meta oracles are discovered by reading Etherscan logs from factory contracts.
- The event used is `MetaOracleDeployed`.
- Factory addresses configured in `src/config.ts`:
  - Mainnet: `0xeC34e4e892061f368F915aDb9467B656ae5C42e8`, `0x44d049eed4ad33807859c45bbd3a8eb47917a9f4`
  - Base: `0x83910ae3f4a7bb8606402289a60feb95bc39a060`
- Log parsing lives in `src/sources/metaOracleContractLogs.ts` using the Etherscan logs endpoint.
- `currentOracle` is refreshed from onchain calls via `src/sources/metaOracleDeviationTimelock.ts`.

## Oracle Hierarchy Handling

- When meta oracles are discovered, their primary/backup oracle addresses are added to the scan list.
- Standard feed scanning runs for those primary/backup oracles as usual.
- The meta oracle output embeds those feeds under `oracleSources` to preserve hierarchy.

## Helper Script

- `scripts/check-meta-oracles.ts` prints all meta oracles detected from logs, along with config values.
- Requires `ETHERSCAN_API_KEY` to be set (same as the main scan) because it uses the Etherscan logs endpoint.
- Example:
  - `pnpm dlx tsx scripts/check-meta-oracles.ts --chain 1`

## Tests

- No tests or linting were executed yet for this change set.
