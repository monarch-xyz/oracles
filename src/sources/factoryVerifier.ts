import { CHAIN_CONFIGS } from "../config.js";
import type { Address, ChainId } from "../types.js";
import { getClient } from "./morphoFactory.js";

const FACTORY_ABI = [
  {
    name: "isMorphoChainlinkOracleV2",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "oracle", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function fetchFactoryVerifiedMap(
  chainId: ChainId,
  oracleAddresses: Address[],
): Promise<Map<Address, boolean>> {
  const verified = new Map<Address, boolean>();
  const logMulticall = process.env.LOG_MULTICALL === "1";

  if (oracleAddresses.length === 0) return verified;

  const config = CHAIN_CONFIGS[chainId];
  const factoryAddress = config.morphoChainlinkV2Factory;

  if (factoryAddress === "0x0000000000000000000000000000000000000000") {
    for (const address of oracleAddresses) {
      verified.set(address, false);
    }
    return verified;
  }

  const client = getClient(chainId);
  const batches = chunkArray(oracleAddresses, 100);

  for (const batch of batches) {
    try {
      const results = await client.multicall({
        contracts: batch.map((oracle) => ({
          address: factoryAddress,
          abi: FACTORY_ABI,
          functionName: "isMorphoChainlinkOracleV2",
          args: [oracle],
        })),
        allowFailure: true,
      });

      if (logMulticall) {
        const trueCount = results.filter(
          (result) => result.status === "success" && result.result,
        ).length;
        console.log(
          `[factory] multicall batch size=${batch.length} true=${trueCount} false=${batch.length - trueCount}`,
        );
      }

      results.forEach((result, index) => {
        const address = batch[index];
        if (result.status === "success") {
          verified.set(address, !!result.result);
        } else {
          verified.set(address, false);
        }
      });
    } catch (error) {
      console.log(
        `[factory] Multicall batch factory verification failed on chain ${chainId}: ${error}.`,
      );
    }
  }

  return verified;
}
