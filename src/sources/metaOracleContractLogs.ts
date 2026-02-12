import { decodeEventLog, encodeEventTopics } from "viem";
import { CHAIN_CONFIGS } from "../config.js";
import type { Address, ChainId, MetaOracleDeviationTimelockConfig } from "../types";
import { fetchEtherscanLogs } from "./etherscanLogs.js";

const META_ORACLE_DEPLOYED_EVENT = {
  name: "MetaOracleDeployed",
  type: "event",
  inputs: [
    { name: "metaOracleAddress", type: "address", indexed: true },
    { name: "implementationAddress", type: "address", indexed: false },
    { name: "primaryOracle", type: "address", indexed: true },
    { name: "backupOracle", type: "address", indexed: true },
    { name: "deviationThreshold", type: "uint256", indexed: false },
    { name: "challengeTimelockDuration", type: "uint256", indexed: false },
    { name: "healingTimelockDuration", type: "uint256", indexed: false },
  ],
} as const;

const META_ORACLE_EVENT_ABI = [META_ORACLE_DEPLOYED_EVENT] as const;
const META_ORACLE_EVENT_TOPIC = encodeEventTopics({
  abi: META_ORACLE_EVENT_ABI,
  eventName: "MetaOracleDeployed",
})[0];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function toNullableAddress(address: Address): Address | null {
  return address === ZERO_ADDRESS ? null : (address.toLowerCase() as Address);
}

export async function fetchMetaOraclesFromLogs(
  chainId: ChainId,
): Promise<Map<Address, MetaOracleDeviationTimelockConfig>> {
  const config = CHAIN_CONFIGS[chainId];
  const factories = config.metaOracleDeviationTimelockFactories;
  const results = new Map<Address, MetaOracleDeviationTimelockConfig>();

  if (!factories || factories.length === 0) {
    return results;
  }

  if (!META_ORACLE_EVENT_TOPIC) {
    return results;
  }

  for (const factory of factories) {
    const logs = await fetchEtherscanLogs({
      chainId,
      address: factory.toLowerCase() as Address,
      fromBlock: 0,
      toBlock: "latest",
      offset: 0,
      topic0: META_ORACLE_EVENT_TOPIC,
    });

    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: META_ORACLE_EVENT_ABI,
          data: log.data,
          topics: log.topics as readonly string[],
          strict: false,
        });

        if (decoded.eventName !== "MetaOracleDeployed") {
          continue;
        }

        const args = decoded.args as {
          metaOracleAddress: Address;
          primaryOracle: Address;
          backupOracle: Address;
          deviationThreshold: bigint;
          challengeTimelockDuration: bigint;
          healingTimelockDuration: bigint;
        };

        const metaOracleAddress = args.metaOracleAddress.toLowerCase() as Address;
        results.set(metaOracleAddress, {
          primaryOracle: toNullableAddress(args.primaryOracle),
          backupOracle: toNullableAddress(args.backupOracle),
          currentOracle: null,
          deviationThreshold: args.deviationThreshold.toString(),
          challengeTimelockDuration: Number(args.challengeTimelockDuration),
          healingTimelockDuration: Number(args.healingTimelockDuration),
        });
      } catch {
        continue;
      }
    }
  }

  return results;
}
