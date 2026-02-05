import {
  createPublicClient,
  http,
  defineChain,
} from "viem";
import { mainnet, base, arbitrum, polygon } from "viem/chains";
import { CHAIN_CONFIGS } from "../config.js";
import type { Address, ChainId, StandardOracleFeeds } from "../types.js";

const unichain = defineChain({
  id: 130,
  name: "Unichain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.unichain.org"] } },
});

const hyperliquid = defineChain({
  id: 999,
  name: "Hyperliquid EVM",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid.xyz/evm"] } },
});

const monad = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
});

const CHAINS = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
  137: polygon,
  130: unichain,
  999: hyperliquid,
  10143: monad,
} as const;

import { abi as MORPHO_CHAINLINK_V2_ABI } from "../abi/morpho-chainlink-oracle-v2.js";

export function getClient(chainId: ChainId) {
  const config = CHAIN_CONFIGS[chainId];
  const chain = CHAINS[chainId];
  return createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function toNullableAddress(addr: Address): Address | null {
  return addr === ZERO_ADDRESS ? null : addr;
}

export async function fetchOracleFeeds(
  chainId: ChainId,
  oracleAddress: Address
): Promise<StandardOracleFeeds | null> {
  const client = getClient(chainId);

  try {
    const [
      baseFeedOne,
      baseFeedTwo,
      quoteFeedOne,
      quoteFeedTwo,
      baseVault,
      quoteVault,
      baseVaultConversionSample,
      quoteVaultConversionSample,
    ] = await Promise.all([
      client.readContract({
        address: oracleAddress,
        abi: MORPHO_CHAINLINK_V2_ABI,
        functionName: "BASE_FEED_1",
      }),
      client.readContract({
        address: oracleAddress,
        abi: MORPHO_CHAINLINK_V2_ABI,
        functionName: "BASE_FEED_2",
      }),
      client.readContract({
        address: oracleAddress,
        abi: MORPHO_CHAINLINK_V2_ABI,
        functionName: "QUOTE_FEED_1",
      }),
      client.readContract({
        address: oracleAddress,
        abi: MORPHO_CHAINLINK_V2_ABI,
        functionName: "QUOTE_FEED_2",
      }),
      client.readContract({
        address: oracleAddress,
        abi: MORPHO_CHAINLINK_V2_ABI,
        functionName: "BASE_VAULT",
      }),
      client.readContract({
        address: oracleAddress,
        abi: MORPHO_CHAINLINK_V2_ABI,
        functionName: "QUOTE_VAULT",
      }),
      client.readContract({
        address: oracleAddress,
        abi: MORPHO_CHAINLINK_V2_ABI,
        functionName: "BASE_VAULT_CONVERSION_SAMPLE",
      }),
      client.readContract({
        address: oracleAddress,
        abi: MORPHO_CHAINLINK_V2_ABI,
        functionName: "QUOTE_VAULT_CONVERSION_SAMPLE",
      }),
    ]);

    return {
      baseFeedOne: toNullableAddress(baseFeedOne.toLowerCase() as Address),
      baseFeedTwo: toNullableAddress(baseFeedTwo.toLowerCase() as Address),
      quoteFeedOne: toNullableAddress(quoteFeedOne.toLowerCase() as Address),
      quoteFeedTwo: toNullableAddress(quoteFeedTwo.toLowerCase() as Address),
      baseVault: toNullableAddress(baseVault.toLowerCase() as Address),
      quoteVault: toNullableAddress(quoteVault.toLowerCase() as Address),
      baseVaultConversionSample,
      quoteVaultConversionSample,
    };
  } catch (error) {
    console.log(`[fetchOracleFeeds] Error for ${oracleAddress}:`, error);
    return null;
  }
}
