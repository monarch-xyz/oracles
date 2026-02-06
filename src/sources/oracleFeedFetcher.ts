import { abi as MORPHO_CHAINLINK_V1_ABI } from "../abi/morpho-chainlink-oracle-v1.js";
import { abi as MORPHO_CHAINLINK_V2_ABI } from "../abi/morpho-chainlink-oracle-v2.js";
import type { Address, ChainId, StandardOracleFeeds } from "../types.js";
import { getClient } from "./morphoFactory.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function toNullableAddress(addr: Address): Address | null {
  return addr === ZERO_ADDRESS ? null : addr;
}

export async function fetchV1OracleFeeds(
  chainId: ChainId,
  oracleAddress: Address,
): Promise<StandardOracleFeeds | null> {
  const client = getClient(chainId);

  try {
    const results = await client.multicall({
      contracts: [
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V1_ABI, functionName: "BASE_FEED_1" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V1_ABI, functionName: "BASE_FEED_2" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V1_ABI, functionName: "QUOTE_FEED_1" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V1_ABI, functionName: "QUOTE_FEED_2" },
      ],
      allowFailure: true,
    });

    if (results.some((result) => result.status !== "success")) {
      return null;
    }

    const [baseFeedOne, baseFeedTwo, quoteFeedOne, quoteFeedTwo] = results.map(
      (result) => result.result,
    ) as [Address, Address, Address, Address];

    return {
      baseFeedOne: toNullableAddress(baseFeedOne.toLowerCase() as Address),
      baseFeedTwo: toNullableAddress(baseFeedTwo.toLowerCase() as Address),
      quoteFeedOne: toNullableAddress(quoteFeedOne.toLowerCase() as Address),
      quoteFeedTwo: toNullableAddress(quoteFeedTwo.toLowerCase() as Address),
      baseVault: null,
      quoteVault: null,
      baseVaultConversionSample: 0n,
      quoteVaultConversionSample: 0n,
    };
  } catch {
    return null;
  }
}

export async function fetchV2OracleFeeds(
  chainId: ChainId,
  oracleAddress: Address,
): Promise<StandardOracleFeeds | null> {
  const client = getClient(chainId);

  try {
    const results = await client.multicall({
      contracts: [
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "BASE_FEED_1" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "BASE_FEED_2" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "QUOTE_FEED_1" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "QUOTE_FEED_2" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "BASE_VAULT" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "QUOTE_VAULT" },
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

    if (results.some((result) => result.status !== "success")) {
      return null;
    }

    const [
      baseFeedOne,
      baseFeedTwo,
      quoteFeedOne,
      quoteFeedTwo,
      baseVault,
      quoteVault,
      baseVaultConversionSample,
      quoteVaultConversionSample,
    ] = results.map((result) => result.result) as [
      Address,
      Address,
      Address,
      Address,
      Address,
      Address,
      bigint,
      bigint,
    ];

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
  } catch {
    return null;
  }
}

async function fetchFeedsBatch(
  addresses: Address[],
  fetcher: (address: Address) => Promise<StandardOracleFeeds | null>,
): Promise<Map<Address, StandardOracleFeeds>> {
  const entries = await Promise.all(
    addresses.map(async (address) => {
      const feeds = await fetcher(address);
      return [address, feeds] as const;
    }),
  );

  const result = new Map<Address, StandardOracleFeeds>();
  for (const [address, feeds] of entries) {
    if (feeds) {
      result.set(address, feeds);
    }
  }

  return result;
}

export async function fetchV1OracleFeedsBatch(
  chainId: ChainId,
  oracleAddresses: Address[],
): Promise<Map<Address, StandardOracleFeeds>> {
  return fetchFeedsBatch(oracleAddresses, (address) => fetchV1OracleFeeds(chainId, address));
}

export async function fetchV2OracleFeedsBatch(
  chainId: ChainId,
  oracleAddresses: Address[],
): Promise<Map<Address, StandardOracleFeeds>> {
  return fetchFeedsBatch(oracleAddresses, (address) => fetchV2OracleFeeds(chainId, address));
}
