import { CHAIN_CONFIGS } from "../src/config.js";
import { fetchMetaOraclesFromLogs } from "../src/sources/metaOracleContractLogs.js";
import type { ChainId } from "../src/types.js";

function usage(): void {
  console.log(
    [
      "Usage:",
      "  pnpm dlx tsx scripts/check-meta-oracles.ts --chain <id>",
      "",
      "Examples:",
      "  pnpm dlx tsx scripts/check-meta-oracles.ts --chain 1",
      "  pnpm dlx tsx scripts/check-meta-oracles.ts --chain 8453",
    ].join("\n"),
  );
}

function parseChainId(args: string[]): ChainId | null {
  const index = args.findIndex((arg) => arg === "--chain" || arg === "-c");
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (!(parsed in CHAIN_CONFIGS)) return null;
  return parsed as ChainId;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const chainId = parseChainId(args);
  if (!chainId) {
    usage();
    process.exit(1);
  }

  const configs = await fetchMetaOraclesFromLogs(chainId);
  const factories = CHAIN_CONFIGS[chainId].metaOracleDeviationTimelockFactories;

  console.log(`MetaOracleDeviationTimelock factories: ${factories.length}`);
  factories.forEach((factory) => console.log(`  - ${factory}`));
  console.log(`MetaOracleDeviationTimelock oracles found: ${configs.size}`);

  const entries = Array.from(configs.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [address, config] of entries) {
    console.log(`\n${address}`);
    console.log(`  primaryOracle: ${config.primaryOracle ?? "null"}`);
    console.log(`  backupOracle: ${config.backupOracle ?? "null"}`);
    console.log(`  currentOracle: ${config.currentOracle ?? "null"}`);
    console.log(`  deviationThreshold: ${config.deviationThreshold}`);
    console.log(`  challengeTimelockDuration: ${config.challengeTimelockDuration}`);
    console.log(`  healingTimelockDuration: ${config.healingTimelockDuration}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
