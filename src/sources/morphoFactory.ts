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
  id: 143,
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
  143: monad,
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
    const results = await client.multicall({
      contracts: [
        {
          address: oracleAddress,
          abi: MORPHO_CHAINLINK_V2_ABI,
          functionName: "BASE_FEED_1",
        },
        {
          address: oracleAddress,
          abi: MORPHO_CHAINLINK_V2_ABI,
          functionName: "BASE_FEED_2",
        },
        {
          address: oracleAddress,
          abi: MORPHO_CHAINLINK_V2_ABI,
          functionName: "QUOTE_FEED_1",
        },
        {
          address: oracleAddress,
          abi: MORPHO_CHAINLINK_V2_ABI,
          functionName: "QUOTE_FEED_2",
        },
        {
          address: oracleAddress,
          abi: MORPHO_CHAINLINK_V2_ABI,
          functionName: "BASE_VAULT",
        },
        {
          address: oracleAddress,
          abi: MORPHO_CHAINLINK_V2_ABI,
          functionName: "QUOTE_VAULT",
        },
        {
          address: oracleAddress,
          abi: MORPHO_CHAINLINK_V2_ABI,
          functionName: "BASE_VAULT_CONVERSION_SAMPLE",
        },
        {
          address: oracleAddress,
          abi: MORPHO_CHAINLINK_V2_ABI,
          functionName: "QUOTE_VAULT_CONVERSION_SAMPLE",
        },
      ],
      allowFailure: true,
    });

    // Only require feed functions (0-3) to succeed - vault functions (4-7) are optional (V1 vs V2)
    const feedResults = results.slice(0, 4);
    if (feedResults.some((result) => result.status !== "success")) {
      console.log(`[fetchOracleFeeds] Feed multicall incomplete for ${oracleAddress}`);
      return null;
    }

    const [
      baseFeedOne,
      baseFeedTwo,
      quoteFeedOne,
      quoteFeedTwo,
    ] = feedResults.map((result) => result.result) as [Address, Address, Address, Address];

    // Vault functions are optional (V1 oracles don't have them)
    const vaultResults = results.slice(4);
    const [baseVault, quoteVault, baseVaultConversionSample, quoteVaultConversionSample] =
      vaultResults.map((r) => (r.status === "success" ? r.result : null)) as [
        Address | null,
        Address | null,
        bigint | null,
        bigint | null,
      ];

    return {
      baseFeedOne: toNullableAddress(baseFeedOne.toLowerCase() as Address),
      baseFeedTwo: toNullableAddress(baseFeedTwo.toLowerCase() as Address),
      quoteFeedOne: toNullableAddress(quoteFeedOne.toLowerCase() as Address),
      quoteFeedTwo: toNullableAddress(quoteFeedTwo.toLowerCase() as Address),
      baseVault: baseVault ? toNullableAddress(baseVault.toLowerCase() as Address) : null,
      quoteVault: quoteVault ? toNullableAddress(quoteVault.toLowerCase() as Address) : null,
      baseVaultConversionSample: baseVaultConversionSample ?? 0n,
      quoteVaultConversionSample: quoteVaultConversionSample ?? 0n,
    };
  } catch (error) {
    console.log(`[fetchOracleFeeds] Error for ${oracleAddress}:`, error);
    return null;
  }
}
