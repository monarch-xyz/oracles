import { MORPHO_V1_NORMALIZED_BYTECODE } from "../bytecodes/morpho-chainlink-oracle-v1.js";
import { normalizeBytecode } from "../bytecodes/normalize.js";

/**
 * Pure bytecode check for MorphoChainlinkOracle V1.
 * Normalizes deployed bytecode (masks PUSH32 immutables) and compares.
 */
export function isMorphoChainlinkOracleV1BytecodeBytes(deployedBytecode: string): boolean {
  const normalizedDeployed = normalizeBytecode(deployedBytecode);
  return normalizedDeployed === MORPHO_V1_NORMALIZED_BYTECODE;
}
