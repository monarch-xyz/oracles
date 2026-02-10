import type { Address, ChainId } from "../types.js";
import { getClient } from "./morphoFactory.js";
import { isMorphoChainlinkOracleV1Bytecode } from "./oracleV1Detector.js";
import { isMorphoChainlinkOracleV2Bytecode } from "./oracleV2BytecodeDetector.js";

export type OracleBytecodeKind = "v1" | "v2" | "unknown";

export interface BytecodeValidationResult {
  address: Address;
  kind: OracleBytecodeKind;
}

/**
 * Fetches deployed bytecode for one oracle.
 */
export async function fetchOracleBytecode(
  chainId: ChainId,
  oracleAddress: Address,
): Promise<string | null> {
  const client = getClient(chainId);

  try {
    const deployedBytecode = await client.getCode({ address: oracleAddress });
    return deployedBytecode ?? null;
  } catch {
    return null;
  }
}

/**
 * Pure bytecode classification (no RPC calls).
 */
export function classifyOracleBytecode(deployedBytecode: string): OracleBytecodeKind {
  if (isMorphoChainlinkOracleV1Bytecode(deployedBytecode)) {
    return "v1";
  }
  if (isMorphoChainlinkOracleV2Bytecode(deployedBytecode)) {
    return "v2";
  }
  return "unknown";
}

/**
 * Bytecode validation stage, intentionally one-by-one.
 */
export async function validateOraclesByBytecodeOneByOne(
  chainId: ChainId,
  oracleAddresses: Address[],
): Promise<BytecodeValidationResult[]> {
  const results: BytecodeValidationResult[] = [];

  for (const address of oracleAddresses) {
    const deployedBytecode = await fetchOracleBytecode(chainId, address);
    const kind = deployedBytecode ? classifyOracleBytecode(deployedBytecode) : "unknown";
    results.push({ address, kind });
  }

  return results;
}
