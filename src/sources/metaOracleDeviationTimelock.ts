import { abi as META_ORACLE_ABI } from "../abi/meta-oracle-deviation-timelock.js";
import type { Address, ChainId, MetaOracleDeviationTimelockConfig } from "../types.js";
import { getClient } from "./morphoFactory.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function toNullableAddress(address: Address): Address | null {
  return address === ZERO_ADDRESS ? null : (address.toLowerCase() as Address);
}

export async function fetchMetaOracleDeviationTimelockConfig(
  chainId: ChainId,
  oracleAddress: Address,
): Promise<MetaOracleDeviationTimelockConfig | null> {
  const client = getClient(chainId);

  try {
    const results = await client.multicall({
      contracts: [
        { address: oracleAddress, abi: META_ORACLE_ABI, functionName: "primaryOracle" },
        { address: oracleAddress, abi: META_ORACLE_ABI, functionName: "backupOracle" },
        { address: oracleAddress, abi: META_ORACLE_ABI, functionName: "currentOracle" },
        { address: oracleAddress, abi: META_ORACLE_ABI, functionName: "deviationThreshold" },
        {
          address: oracleAddress,
          abi: META_ORACLE_ABI,
          functionName: "challengeTimelockDuration",
        },
        {
          address: oracleAddress,
          abi: META_ORACLE_ABI,
          functionName: "healingTimelockDuration",
        },
      ],
      allowFailure: true,
    });

    if (results.some((result) => result.status !== "success")) {
      return null;
    }

    const [
      primaryOracle,
      backupOracle,
      currentOracle,
      deviationThreshold,
      challengeTimelockDuration,
      healingTimelockDuration,
    ] = results.map((result) => result.result) as [
      Address,
      Address,
      Address,
      bigint,
      bigint,
      bigint,
    ];

    return {
      primaryOracle: toNullableAddress(primaryOracle),
      backupOracle: toNullableAddress(backupOracle),
      currentOracle: toNullableAddress(currentOracle),
      deviationThreshold: deviationThreshold.toString(),
      challengeTimelockDuration: Number(challengeTimelockDuration),
      healingTimelockDuration: Number(healingTimelockDuration),
    };
  } catch {
    return null;
  }
}

export async function fetchMetaOracleDeviationTimelockConfigs(
  chainId: ChainId,
  oracleAddresses: Address[],
): Promise<Map<Address, MetaOracleDeviationTimelockConfig>> {
  const entries = await Promise.all(
    oracleAddresses.map(async (address) => {
      const config = await fetchMetaOracleDeviationTimelockConfig(chainId, address);
      return [address, config] as const;
    }),
  );

  const result = new Map<Address, MetaOracleDeviationTimelockConfig>();
  for (const [address, config] of entries) {
    if (config) {
      result.set(address, config);
    }
  }

  return result;
}
