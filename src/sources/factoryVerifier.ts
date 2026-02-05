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
