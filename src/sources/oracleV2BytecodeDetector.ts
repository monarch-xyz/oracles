import { applyIgnoredByteIndices } from "../bytecodes/mask.js";
import {
  MORPHO_V2_IGNORED_BYTE_INDICES,
  MORPHO_V2_MASKED_NORMALIZED_TARGET,
} from "../bytecodes/morpho-chainlink-oracle-v2-mask.js";
import { normalizeBytecode } from "../bytecodes/normalize.js";

/**
 * Pure bytecode check for MorphoChainlinkOracle V2.
 * Normalizes deployed bytecode (masks PUSH32 immutables) and compares.
 */
export function isMorphoChainlinkOracleV2BytecodeBytes(deployedBytecode: string): boolean {
  const normalizedDeployed = normalizeBytecode(deployedBytecode);
  const maskedDeployed = applyIgnoredByteIndices(
    normalizedDeployed,
    MORPHO_V2_IGNORED_BYTE_INDICES,
  );
  return maskedDeployed === MORPHO_V2_MASKED_NORMALIZED_TARGET;
}
