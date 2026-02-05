import { getClient } from "./morphoFactory.js";
import { CHAIN_CONFIGS } from "../config.js";
import type { Address, ChainId } from "../types.js";

const FACTORY_ABI = [
  {
    name: "isMorphoChainlinkOracleV2",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "oracle", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export async function isFactoryVerifiedOracle(
  chainId: ChainId,
  oracleAddress: Address
): Promise<boolean> {
  const config = CHAIN_CONFIGS[chainId];
  const factoryAddress = config.morphoChainlinkV2Factory;

  if (factoryAddress === "0x0000000000000000000000000000000000000000") {
    return false;
  }

  const client = getClient(chainId);

  try {
    const result = await client.readContract({
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: "isMorphoChainlinkOracleV2",
      args: [oracleAddress],
    });
    
    console.log('calling result', result);
    return result;
  } catch {
    // Factory might not have this method, fall back to false
    return false;
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function fetchFactoryVerifiedMap(
  chainId: ChainId,
  oracleAddresses: Address[]
): Promise<Map<Address, boolean>> {
  const verified = new Map<Address, boolean>();

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
        `[factory] Multicall failed on chain ${chainId}: ${error}. Falling back to individual calls.`
      );
      for (const address of batch) {
        const isVerified = await isFactoryVerifiedOracle(chainId, address);
        verified.set(address, isVerified);
      }
    }
  }

  return verified;
}
