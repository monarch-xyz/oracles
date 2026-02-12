import { ETHERSCAN_API_KEY, ETHERSCAN_V2_API_URL } from "../config.js";
import type { Address, ChainId } from "../types.js";

export interface EtherscanLogEntry {
  address: Address;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

export interface FetchLogsOptions {
  chainId: ChainId;
  address: Address;
  fromBlock: number;
  toBlock: number | "latest";
  page?: number;
  offset?: number;
  topic0?: string;
}

export async function fetchEtherscanLogs(
  options: FetchLogsOptions,
): Promise<EtherscanLogEntry[]> {
  if (!ETHERSCAN_API_KEY) {
    return [];
  }

  const params = new URLSearchParams({
    chainid: options.chainId.toString(),
    module: "logs",
    action: "getLogs",
    address: options.address,
    fromBlock: options.fromBlock.toString(),
    toBlock: options.toBlock.toString(),
    page: (options.page ?? 1).toString(),
    offset: (options.offset ?? 10000).toString(),
    apikey: ETHERSCAN_API_KEY,
  });

  if (options.topic0) {
    params.set("topic0", options.topic0);
  }

  const url = `${ETHERSCAN_V2_API_URL}?${params.toString()}`;
  const response = await fetch(url);
  const data = (await response.json()) as {
    status: string;
    message: string;
    result: EtherscanLogEntry[] | string;
  };

  if (data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  return data.result.map((entry) => ({
    ...entry,
    address: entry.address.toLowerCase() as Address,
  }));
}
