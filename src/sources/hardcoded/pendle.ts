import { abi as ERC20_ABI } from "../../abi/erc20.js";
import { abi as PENDLE_WRAPPER_ABI } from "../../abi/pendle-linear-discount-oracle-wrapper.js";
import { abi as PENDLE_ORACLE_ABI } from "../../abi/pendle-spark-linear-discount-oracle-feed.js";
import type { Address, ChainId, FeedInfo, FeedProviderRegistry } from "../../types.js";
import { getClient } from "../morphoFactory.js";
import { fetchOracleBytecode } from "../oracleBytecodeValidation.js";
import { isPendleLinearDiscountOracleWrapper } from "../pendleFeedDetector.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

function isNonZeroAddress(address: Address | null | undefined): address is Address {
  return !!address && address !== ZERO_ADDRESS;
}

function shortenAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parsePendlePair(symbol: string): [string, string] | null {
  const firstDash = symbol.indexOf("-");
  const lastDash = symbol.lastIndexOf("-");
  if (firstDash <= 0 || lastDash <= firstDash) {
    return null;
  }
  const underlying = symbol.slice(firstDash + 1, lastDash);
  if (!underlying) {
    return null;
  }
  return [symbol, underlying];
}

async function fetchPendleAssetSymbol(
  chainId: ChainId,
  ptAddress: Address,
): Promise<string | null> {
  const url = `https://api-v2.pendle.finance/core/v1/${chainId}/assets/${ptAddress}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[pendle] No API data for ${ptAddress} (chain ${chainId}): ${response.status}`);
      return null;
    }
    const payload = (await response.json()) as { symbol?: string } | { data?: { symbol?: string } };
    const symbol = "data" in payload ? payload.data?.symbol : payload.symbol;
    return symbol?.trim() || null;
  } catch (error) {
    console.log(`[pendle] API error for ${ptAddress} (chain ${chainId}): ${error}`);
    return null;
  }
}

async function fetchPendleFeedInfo(
  chainId: ChainId,
  feedAddress: Address,
): Promise<FeedInfo | null> {
  const deployedBytecode = await fetchOracleBytecode(chainId, feedAddress);
  if (!deployedBytecode || !isPendleLinearDiscountOracleWrapper(deployedBytecode)) {
    return null;
  }

  const client = getClient(chainId);

  try {
    const innerOracle = (await client.readContract({
      address: feedAddress,
      abi: PENDLE_WRAPPER_ABI,
      functionName: "innerOracle",
    })) as Address;

    if (!isNonZeroAddress(innerOracle)) {
      return null;
    }

    const [pt, baseDiscountPerYear] = (await client.multicall({
      allowFailure: true,
      contracts: [
        { address: innerOracle, abi: PENDLE_ORACLE_ABI, functionName: "PT" },
        { address: innerOracle, abi: PENDLE_ORACLE_ABI, functionName: "baseDiscountPerYear" },
      ],
    })) as Array<{ status: "success" | "failure"; result?: unknown }>;

    if (pt?.status !== "success" || !isNonZeroAddress(pt.result as Address)) {
      return null;
    }

    const ptAddress = (pt.result as Address).toLowerCase() as Address;
    const baseDiscount =
      baseDiscountPerYear?.status === "success" ? (baseDiscountPerYear.result as bigint) : null;

    const apiSymbol = await fetchPendleAssetSymbol(chainId, ptAddress);
    if (!apiSymbol) {
      return null;
    }

    let ptSymbol = apiSymbol;
    try {
      const ptSymbolResult = (await client.readContract({
        address: ptAddress,
        abi: ERC20_ABI,
        functionName: "symbol",
      })) as string;
      if (ptSymbolResult?.trim()) {
        ptSymbol = ptSymbolResult.trim();
      }
    } catch (error) {
      console.log(
        `[pendle] Failed to read PT symbol ${shortenAddress(ptAddress)} on ${chainId}: ${error}`,
      );
    }

    const pair = parsePendlePair(apiSymbol) ?? [apiSymbol, "USD"];
    const description = `Pendle ${pair[0]} / ${pair[1]}`;

    return {
      address: feedAddress,
      chainId,
      provider: "Pendle",
      description,
      pair,
      baseDiscountPerYear: baseDiscount ? baseDiscount.toString() : undefined,
      innerOracle: innerOracle.toLowerCase() as Address,
      pt: ptAddress,
      ptSymbol,
    };
  } catch (error) {
    console.log(
      `[pendle] Failed to read feed ${shortenAddress(feedAddress)} on ${chainId}: ${error}`,
    );
    return null;
  }
}

export async function fetchPendleProvider(
  chainId: ChainId,
  feedAddresses: Address[],
): Promise<FeedProviderRegistry> {
  const uniqueFeeds = Array.from(new Set(feedAddresses));
  if (uniqueFeeds.length === 0) {
    return {
      chainId,
      provider: "Pendle",
      feeds: {},
      updatedAt: new Date().toISOString(),
    };
  }

  console.log(`[pendle] Checking ${uniqueFeeds.length} feed addresses...`);
  const feeds: Record<Address, FeedInfo> = {};

  for (const feedAddress of uniqueFeeds) {
    const info = await fetchPendleFeedInfo(chainId, feedAddress);
    if (info) {
      feeds[feedAddress] = info;
    }
  }

  console.log(`[pendle] Loaded ${Object.keys(feeds).length} feeds`);

  return {
    chainId,
    provider: "Pendle",
    feeds,
    updatedAt: new Date().toISOString(),
  };
}
