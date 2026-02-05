import "dotenv/config";
import { fetchOraclesForChain } from "./sources/morphoApi.js";
import { fetchChainlinkProvider } from "./sources/chainlink.js";
import { fetchRedstoneProvider } from "./sources/redstone.js";
import { fetchOracleFeeds } from "./sources/morphoFactory.js";
import { fetchFactoryVerifiedMap } from "./sources/factoryVerifier.js";
import { detectProxy, detectProxyViaEtherscan } from "./analyzers/proxyDetector.js";
import { FeedProviderMatcher } from "./analyzers/feedProviderMatcher.js";
import { ETHERSCAN_API_KEY, CHAIN_CONFIGS } from "./config.js";
import type { ChainId } from "./types.js";

const CHAIN_ID: ChainId = 1;
const SAMPLE_SIZE = 3;

async function testMainnet() {
  console.log("=== Testing Mainnet Oracle Scanner ===\n");
  console.log(`Etherscan API Key: ${ETHERSCAN_API_KEY ? "configured" : "NOT SET"}\n`);

  // 1. Fetch oracles from Morpho API
  const oracles = await fetchOraclesForChain(CHAIN_ID);
  console.log(`\nOracles to process: ${oracles.length}\n`);

  // 2. Load feed registries
  const [chainlinkProvider, redstoneProvider] = await Promise.all([
    fetchChainlinkProvider(CHAIN_ID),
    fetchRedstoneProvider(CHAIN_ID),
  ]);

  const feedProviderMatcher = new FeedProviderMatcher();
  feedProviderMatcher.addProvider(chainlinkProvider);
  feedProviderMatcher.addProvider(redstoneProvider);

  // 3. Process sample oracles
  const sample = oracles.slice(0, SAMPLE_SIZE);
  console.log(`\n--- Processing ${sample.length} sample oracles ---\n`);

  for (const oracle of sample) {
    console.log(`\nOracle: ${oracle.address}`);

    // Check proxy via Etherscan v2 (fast, single API)
    const etherscanProxy = await detectProxyViaEtherscan(CHAIN_ID, oracle.address);
    if (etherscanProxy) {
      console.log(`  Etherscan: isProxy=${etherscanProxy.isProxy}, impl=${etherscanProxy.implementation || "n/a"}`);
    }

    // Also check via EIP-1967 slots (onchain)
    const proxyInfo = await detectProxy(CHAIN_ID, oracle.address);
    console.log(`  EIP-1967: isProxy=${!!proxyInfo}`);
    if (proxyInfo) {
      console.log(`    Type: ${proxyInfo.proxyType}, impl: ${proxyInfo.implementation}`);
    }

    // Check factory verification
    const verifiedMap = await fetchFactoryVerifiedMap(CHAIN_ID, [oracle.address]);
    const isVerified = verifiedMap.get(oracle.address) || false;
    console.log(`  Factory verified: ${isVerified}`);

    if (isVerified) {
      // Only fetch feeds if factory-verified
      const feeds = await fetchOracleFeeds(CHAIN_ID, oracle.address);
      if (feeds) {
        console.log(`  Type: MorphoChainlinkOracleV2 (standard)`);
        
        for (const [name, addr] of [
          ["baseFeedOne", feeds.baseFeedOne],
          ["baseFeedTwo", feeds.baseFeedTwo],
          ["quoteFeedOne", feeds.quoteFeedOne],
          ["quoteFeedTwo", feeds.quoteFeedTwo],
        ] as const) {
          if (addr) {
            const matched = feedProviderMatcher.match(addr, CHAIN_ID);
            console.log(`    ${name}: ${addr.slice(0, 10)}... -> ${matched ? `${matched.provider}: ${matched.description}` : "unknown"}`);
          }
        }
      }
    } else {
      console.log(`  Type: Custom/Unknown (not factory-verified)`);
    }
  }

  console.log("\n=== Test Complete ===");
}

testMainnet().catch(console.error);
