import { type Abi, type Hex, decodeEventLog, encodeEventTopics } from "viem";
import { abi as ERC20_ABI } from "../../abi/erc20.js";
import { abi as PENDLE_CHAINLINK_ORACLE_ABI } from "../../abi/pendle-chainlink-oracle-feed.js";
import { abi as PENDLE_WRAPPER_ABI } from "../../abi/pendle-linear-discount-oracle-wrapper.js";
import { abi as PENDLE_MARKET_ABI } from "../../abi/pendle-market.js";
import { abi as PENDLE_SPARK_ORACLE_ABI } from "../../abi/pendle-spark-linear-discount-oracle-feed.js";
import type {
  Address,
  ChainId,
  FeedInfo,
  FeedProviderRegistry,
  PendleOracleType,
} from "../../types.js";
import { CHAIN_CONFIGS } from "../../config.js";
import { fetchEtherscanLogs } from "../etherscanLogs.js";
import { getClient } from "../morphoFactory.js";
import { fetchOracleBytecode } from "../oracleBytecodeValidation.js";
import {
  isPendleChainlinkOracleFeedBytecode,
  isPendleLinearDiscountFeedBytecode,
} from "../pendleFeedDetector.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const PENDLE_SPARK_ORACLE_ABI_TYPED = PENDLE_SPARK_ORACLE_ABI as Abi;
const PENDLE_SPARK_FACTORY_EVENT = {
  name: "OracleCreated",
  type: "event",
  inputs: [
    { name: "pt", type: "address", indexed: true },
    { name: "baseDiscountPerYear", type: "uint256", indexed: false },
    { name: "oracle", type: "address", indexed: false },
  ],
} as const;
const PENDLE_SPARK_EVENT_ABI = [PENDLE_SPARK_FACTORY_EVENT] as const;
const PENDLE_SPARK_EVENT_TOPIC = encodeEventTopics({
  abi: PENDLE_SPARK_EVENT_ABI,
  eventName: "OracleCreated",
})[0];
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

function parseSparkLinearDiscountPair(symbol: string): [string, string] {
  const parsed = parsePendlePair(symbol);
  if (!parsed) {
    return [symbol, symbol];
  }
  return [symbol, parsed[1]];
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
        { address: innerOracle, abi: PENDLE_SPARK_ORACLE_ABI, functionName: "PT" },
        { address: innerOracle, abi: PENDLE_SPARK_ORACLE_ABI, functionName: "baseDiscountPerYear" },
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
      pendleFeedSubtype: "LinearDiscountWrapper",
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
    const twapDurationRaw =
      twapDurationResult?.status === "success" ? twapDurationResult.result : null;
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
    const parsedPair =
      (apiSymbol ? parsePendlePair(apiSymbol) : null) ??
      (ptSymbol ? parsePendlePair(ptSymbol) : null);
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
      pendleFeedSubtype: "ChainlinkOracle",
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

async function fetchPendleSparkOracleFactoryFeeds(
  chainId: ChainId,
): Promise<Map<Address, { pt: Address; baseDiscountPerYear?: string }>> {
  const config = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS];
  if (!config?.pendleSparkLinearDiscountOracleFactories?.length) {
    return new Map();
  }

  if (!PENDLE_SPARK_EVENT_TOPIC) {
    return new Map();
  }

  const results = new Map<Address, { pt: Address; baseDiscountPerYear?: string }>();

  for (const factory of config.pendleSparkLinearDiscountOracleFactories) {
    const logs = await fetchEtherscanLogs({
      chainId,
      address: factory.toLowerCase() as Address,
      fromBlock: 0,
      toBlock: "latest",
      topic0: PENDLE_SPARK_EVENT_TOPIC,
    });

    for (const log of logs) {
      try {
        const topics = log.topics as Hex[];
        const decoded = decodeEventLog({
          abi: PENDLE_SPARK_EVENT_ABI,
          data: log.data as Hex,
          topics: topics.length ? (topics as [Hex, ...Hex[]]) : [],
          strict: false,
        });

        if (decoded.eventName !== "OracleCreated") {
          continue;
        }

        const args = decoded.args as {
          pt: Address;
          baseDiscountPerYear: bigint;
          oracle: Address;
        };

        const oracle = args.oracle?.toLowerCase() as Address | undefined;
        const pt = args.pt?.toLowerCase() as Address | undefined;

        if (!oracle || !pt) {
          continue;
        }

        results.set(oracle, {
          pt,
          baseDiscountPerYear: args.baseDiscountPerYear?.toString(),
        });
      } catch {}
    }
  }

  return results;
}

async function fetchPendleSparkLinearDiscountFeeds(
  chainId: ChainId,
  feedDataByAddress: Map<Address, { pt: Address; baseDiscountPerYear?: string }>,
): Promise<Record<Address, FeedInfo>> {
  const feeds: Record<Address, FeedInfo> = {};
  const feedAddresses = Array.from(feedDataByAddress.keys());

  if (feedAddresses.length === 0) {
    return feeds;
  }

  const client = getClient(chainId);

  try {
    const contracts = feedAddresses.flatMap((address) => [
      { address, abi: PENDLE_SPARK_ORACLE_ABI_TYPED, functionName: "PT" },
      { address, abi: PENDLE_SPARK_ORACLE_ABI_TYPED, functionName: "baseDiscountPerYear" },
    ]);

    const results = (await client.multicall({
      allowFailure: true,
      contracts,
    })) as Array<{ status: "success" | "failure"; result?: unknown }>;

    const feedSnapshots = new Map<Address, { ptAddress: Address | null; baseDiscount?: string }>();
    const ptAddresses = new Set<Address>();

    feedAddresses.forEach((feedAddress, index) => {
      const ptResult = results[index * 2];
      const baseDiscountResult = results[index * 2 + 1];
      const fallback = feedDataByAddress.get(feedAddress);

      const ptAddress =
        ptResult?.status === "success" && isNonZeroAddress(ptResult.result as Address)
          ? ((ptResult.result as Address).toLowerCase() as Address)
          : (fallback?.pt ?? null);

      const baseDiscount =
        baseDiscountResult?.status === "success"
          ? (baseDiscountResult.result as bigint).toString()
          : fallback?.baseDiscountPerYear;

      feedSnapshots.set(feedAddress, { ptAddress, baseDiscount });
      if (ptAddress && isNonZeroAddress(ptAddress)) {
        ptAddresses.add(ptAddress);
      }
    });

    const ptList = Array.from(ptAddresses);
    const symbolResults = ptList.length
      ? ((await client.multicall({
          allowFailure: true,
          contracts: ptList.map((address) => ({
            address,
            abi: ERC20_ABI,
            functionName: "symbol",
          })),
        })) as Array<{ status: "success" | "failure"; result?: unknown }>)
      : [];

    const symbolByPt = new Map<Address, string>();
    ptList.forEach((address, index) => {
      const result = symbolResults[index];
      if (result?.status === "success" && typeof result.result === "string") {
        const trimmed = result.result.trim();
        if (trimmed) {
          symbolByPt.set(address, trimmed);
        }
      }
    });

    const missingSymbols = ptList.filter((address) => !symbolByPt.has(address));
    const apiSymbols = await Promise.all(
      missingSymbols.map((address) => fetchPendleAssetSymbol(chainId, address)),
    );
    missingSymbols.forEach((address, index) => {
      const symbol = apiSymbols[index];
      if (symbol) {
        symbolByPt.set(address, symbol);
      }
    });

    for (const feedAddress of feedAddresses) {
      const snapshot = feedSnapshots.get(feedAddress);
      if (!snapshot?.ptAddress || !isNonZeroAddress(snapshot.ptAddress)) {
        continue;
      }

      const ptSymbol = symbolByPt.get(snapshot.ptAddress) ?? null;
      if (!ptSymbol) {
        continue;
      }

      const pair = parseSparkLinearDiscountPair(ptSymbol);
      const description = `Pendle ${pair[0]} / ${pair[1]}`;

      feeds[feedAddress] = {
        address: feedAddress,
        chainId,
        provider: "Pendle",
        description,
        pair,
        pendleFeedKind: "LinearDiscount",
        pendleFeedSubtype: "SparkLinearDiscountOracle",
        baseDiscountPerYear: snapshot.baseDiscount,
        pt: snapshot.ptAddress,
        ptSymbol,
      };
    }
  } catch (error) {
    console.log(`[pendle] Failed to batch spark feeds on ${chainId}: ${error}`);
  }

  return feeds;
}

export async function fetchPendleProvider(
  chainId: ChainId,
  feedAddresses: Address[],
): Promise<FeedProviderRegistry> {
  const uniqueFeeds = Array.from(new Set(feedAddresses));
  const sparkFactoryFeeds = await fetchPendleSparkOracleFactoryFeeds(chainId);
  const sparkFeedAddresses = Array.from(sparkFactoryFeeds.keys());
  const allFeeds = Array.from(new Set([...uniqueFeeds, ...sparkFeedAddresses]));
  if (allFeeds.length === 0) {
    return {
      chainId,
      provider: "Pendle",
      feeds: {},
      updatedAt: new Date().toISOString(),
    };
  }

  console.log(`[pendle] Checking ${allFeeds.length} feed addresses...`);
  const feeds: Record<Address, FeedInfo> = {};
  const sparkFeeds = await fetchPendleSparkLinearDiscountFeeds(chainId, sparkFactoryFeeds);
  Object.assign(feeds, sparkFeeds);

  const remainingFeeds = allFeeds.filter((address) => !feeds[address]);
  for (const feedAddress of remainingFeeds) {
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
