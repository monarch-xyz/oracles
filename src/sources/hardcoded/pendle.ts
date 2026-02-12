import { abi as ERC20_ABI } from "../../abi/erc20.js";
import { abi as PENDLE_CHAINLINK_ORACLE_ABI } from "../../abi/pendle-chainlink-oracle-feed.js";
import { abi as PENDLE_WRAPPER_ABI } from "../../abi/pendle-linear-discount-oracle-wrapper.js";
import { abi as PENDLE_MARKET_ABI } from "../../abi/pendle-market.js";
import { abi as PENDLE_ORACLE_ABI } from "../../abi/pendle-spark-linear-discount-oracle-feed.js";
import type {
  Address,
  ChainId,
  FeedInfo,
  FeedProviderRegistry,
  PendleOracleType,
} from "../../types.js";
import { getClient } from "../morphoFactory.js";
import { fetchOracleBytecode } from "../oracleBytecodeValidation.js";
import {
  isPendleChainlinkOracleFeedBytecode,
  isPendleLinearDiscountFeedBytecode,
} from "../pendleFeedDetector.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const PENDLE_ORACLE_TYPE_BY_ID: Record<number, PendleOracleType> = {
  0: "PT_TO_SY",
  1: "PT_TO_ASSET",
  2: "LP_TO_SY",
  3: "LP_TO_ASSET",
};

function toPendleOracleType(value: unknown): PendleOracleType | null {
  if (typeof value === "bigint") {
    return PENDLE_ORACLE_TYPE_BY_ID[Number(value)] ?? null;
  }
  if (typeof value === "number") {
    return PENDLE_ORACLE_TYPE_BY_ID[value] ?? null;
  }
  return null;
}

function isPtOracleType(value: PendleOracleType | null): boolean {
  return value === "PT_TO_SY" || value === "PT_TO_ASSET";
}

function isSyQuoteOracleType(value: PendleOracleType | null): boolean {
  return value === "PT_TO_SY" || value === "LP_TO_SY";
}

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

async function readErc20Symbol(
  client: ReturnType<typeof getClient>,
  address: Address,
  chainId: ChainId,
  label: string,
): Promise<string | null> {
  try {
    const result = (await client.readContract({
      address,
      abi: ERC20_ABI,
      functionName: "symbol",
    })) as string;
    const trimmed = result?.trim();
    return trimmed || null;
  } catch (error) {
    console.log(
      `[pendle] Failed to read ${label} symbol ${shortenAddress(address)} on ${chainId}: ${error}`,
    );
    return null;
  }
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
    const payload = (await response.json()) as {
      symbol?: string;
      data?: { symbol?: string };
    };
    const symbol = payload.data?.symbol ?? payload.symbol;
    return symbol?.trim() || null;
  } catch (error) {
    console.log(`[pendle] API error for ${ptAddress} (chain ${chainId}): ${error}`);
    return null;
  }
}

async function fetchPendleLinearDiscountFeedInfo(
  chainId: ChainId,
  feedAddress: Address,
): Promise<FeedInfo | null> {
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

    const ptSymbol = (await readErc20Symbol(client, ptAddress, chainId, "PT")) ?? apiSymbol;

    const pair = parsePendlePair(apiSymbol) ?? [apiSymbol, "USD"];
    const description = `Pendle ${pair[0]} / ${pair[1]}`;

    return {
      address: feedAddress,
      chainId,
      provider: "Pendle",
      description,
      pair,
      pendleFeedKind: "LinearDiscount",
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

async function fetchPendleChainlinkFeedInfo(
  chainId: ChainId,
  feedAddress: Address,
): Promise<FeedInfo | null> {
  const client = getClient(chainId);

  try {
    const [marketResult, oracleTypeResult, twapDurationResult] = (await client.multicall({
      allowFailure: true,
      contracts: [
        { address: feedAddress, abi: PENDLE_CHAINLINK_ORACLE_ABI, functionName: "market" },
        { address: feedAddress, abi: PENDLE_CHAINLINK_ORACLE_ABI, functionName: "baseOracleType" },
        { address: feedAddress, abi: PENDLE_CHAINLINK_ORACLE_ABI, functionName: "twapDuration" },
      ],
    })) as Array<{ status: "success" | "failure"; result?: unknown }>;

    if (marketResult?.status !== "success" || !isNonZeroAddress(marketResult.result as Address)) {
      return null;
    }

    const marketAddress = (marketResult.result as Address).toLowerCase() as Address;
    const oracleType = toPendleOracleType(oracleTypeResult?.result);
    const twapDurationRaw = twapDurationResult?.status === "success" ? twapDurationResult.result : null;
    const twapDuration =
      typeof twapDurationRaw === "bigint"
        ? Number(twapDurationRaw)
        : typeof twapDurationRaw === "number"
          ? twapDurationRaw
          : undefined;

    const tokens = (await client.readContract({
      address: marketAddress,
      abi: PENDLE_MARKET_ABI,
      functionName: "readTokens",
    })) as [Address, Address, Address];

    if (!tokens?.[1]) {
      return null;
    }

    const ptAddress = tokens[1].toLowerCase() as Address;
    if (!isNonZeroAddress(ptAddress)) {
      return null;
    }

    const apiSymbol = await fetchPendleAssetSymbol(chainId, ptAddress);
    const ptSymbol = (await readErc20Symbol(client, ptAddress, chainId, "PT")) ?? apiSymbol ?? null;
    const parsedPair = (apiSymbol ? parsePendlePair(apiSymbol) : null) ?? (ptSymbol ? parsePendlePair(ptSymbol) : null);
    const underlying = parsedPair?.[1] ?? null;

    let baseSymbol: string | null = null;
    if (oracleType && isPtOracleType(oracleType)) {
      baseSymbol = ptSymbol ?? apiSymbol ?? null;
    } else if (oracleType) {
      const marketSymbol = await readErc20Symbol(client, marketAddress, chainId, "LP");
      baseSymbol = marketSymbol ?? (underlying ? `LP-${underlying}` : null);
    } else {
      baseSymbol = ptSymbol ?? apiSymbol ?? null;
    }

    let quoteSymbol: string | null = null;
    if (oracleType && underlying) {
      quoteSymbol = isSyQuoteOracleType(oracleType) ? `SY-${underlying}` : underlying;
    }

    const pair: [string, string] | null =
      baseSymbol && quoteSymbol ? [baseSymbol, quoteSymbol] : null;
    const description = pair ? `Pendle ${pair[0]} / ${pair[1]}` : "Pendle Chainlink Oracle";

    return {
      address: feedAddress,
      chainId,
      provider: "Pendle",
      description,
      pair,
      pendleFeedKind: "ChainlinkOracle",
      pendleOracleType: oracleType ?? undefined,
      twapDuration,
      pt: ptAddress,
      ptSymbol: ptSymbol ?? undefined,
    };
  } catch (error) {
    console.log(
      `[pendle] Failed to read chainlink feed ${shortenAddress(feedAddress)} on ${chainId}: ${error}`,
    );
    return null;
  }
}

async function fetchPendleFeedInfo(
  chainId: ChainId,
  feedAddress: Address,
): Promise<FeedInfo | null> {
  const deployedBytecode = await fetchOracleBytecode(chainId, feedAddress);
  if (!deployedBytecode) {
    return null;
  }

  if (isPendleLinearDiscountFeedBytecode(deployedBytecode)) {
    return fetchPendleLinearDiscountFeedInfo(chainId, feedAddress);
  }

  if (isPendleChainlinkOracleFeedBytecode(deployedBytecode)) {
    return fetchPendleChainlinkFeedInfo(chainId, feedAddress);
  }

  return null;
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
