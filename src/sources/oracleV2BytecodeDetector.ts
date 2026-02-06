import { MORPHO_V2_NORMALIZED_BYTECODE } from "../bytecodes/morpho-chainlink-oracle-v2.js";
import { normalizeBytecode } from "../bytecodes/normalize.js";

/**
 * Pure bytecode check for MorphoChainlinkOracle V2.
 * Normalizes deployed bytecode (masks PUSH32 immutables) and compares.
 */
export function isMorphoChainlinkOracleV2BytecodeBytes(deployedBytecode: string): boolean {
  const normalizedDeployed = normalizeBytecode(deployedBytecode);
  return normalizedDeployed === MORPHO_V2_NORMALIZED_BYTECODE;
}
