import "dotenv/config";
import { fetchChainlinkProvider } from "./sources/chainlink.js";
import { fetchRedstoneProvider } from "./sources/redstone.js";
import {
  fetchCompoundProvider,
  fetchLidoProvider,
  fetchOvalProvider,
  fetchPythProvider,
} from "./sources/hardcoded/index.js";
import { FeedProviderMatcher } from "./analyzers/feedProviderMatcher.js";
import type { ChainId, Address } from "./types.js";

const TEST_CHAIN: ChainId = 1;

// Test addresses from the old FE codebase
const TEST_FEEDS = {
  chainlink: "0xaed0c38402a5d19df6e4c03f4e2dced6e29c1ee9" as Address, // DAI/USD
  redstone: "0xfdfd9c85ad200c506cf9e21f1fd8dd01932fbb23" as Address, // WBTC/BTC
  compound: "0x4F67e4d9BD67eFa28236013288737D39AeF48e79" as Address, // wstETH/ETH
  lido: "0x905b7dAbCD3Ce6B792D874e303D336424Cdb1421" as Address, // wstETH/stETH
  oval: "0xE2380c199F07e78012c6D0b076A4137E6D1Ba022" as Address, // SAND/USD
  pyth: "0xF2d7B0F5cB09928DB0f0686F4e64b4aD96E04562" as Address, // UNI/USD
};

async function testProviders() {
  console.log("=== Testing Feed Providers ===\n");

  const matcher = new FeedProviderMatcher();

  // Load all providers
  console.log("Loading providers...");
  
  const [chainlink, redstone] = await Promise.all([
    fetchChainlinkProvider(TEST_CHAIN),
    fetchRedstoneProvider(TEST_CHAIN),
  ]);
  
  const compound = fetchCompoundProvider(TEST_CHAIN);
  const lido = fetchLidoProvider(TEST_CHAIN);
  const oval = fetchOvalProvider(TEST_CHAIN);
  const pyth = fetchPythProvider(TEST_CHAIN);

  matcher.addProvider(chainlink);
  matcher.addProvider(redstone);
  matcher.addProvider(compound);
  matcher.addProvider(lido);
  matcher.addProvider(oval);
  matcher.addProvider(pyth);

  console.log("\n--- Provider Stats ---");
  console.log(`Chainlink: ${Object.keys(chainlink.feeds).length} feeds`);
  console.log(`Redstone: ${Object.keys(redstone.feeds).length} feeds`);
  console.log(`Compound: ${Object.keys(compound.feeds).length} feeds`);
  console.log(`Lido: ${Object.keys(lido.feeds).length} feeds`);
  console.log(`Oval: ${Object.keys(oval.feeds).length} feeds`);
  console.log(`Pyth: ${Object.keys(pyth.feeds).length} feeds`);

  console.log("\n--- Test Feed Matching ---");
  
  for (const [name, address] of Object.entries(TEST_FEEDS)) {
    const result = matcher.match(address.toLowerCase() as Address, TEST_CHAIN);
    if (result) {
      console.log(`✅ ${name.padEnd(10)} → ${result.provider}: ${result.description} [${result.pair?.join("/")}]`);
    } else {
      console.log(`❌ ${name.padEnd(10)} → NOT FOUND`);
    }
  }

  console.log("\n=== Test Complete ===");
}

testProviders().catch(console.error);
