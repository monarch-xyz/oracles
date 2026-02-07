import { applyByteMaskIndices } from "../bytecodes/mask.js";
import { normalizeBytecode } from "../bytecodes/normalize.js";
import {
  PENDLE_FEED_IGNORED_BYTE_INDICES,
  PENDLE_FEED_MASKED_TARGET,
} from "../bytecodes/pendle-linear-discount-feed-mask.js";

/**
 * Bytecode check for Pendle linear discount feed wrappers.
 * Normalizes deployed bytecode (masks PUSH32 immutables) and compares.
 */
export function isPendleLinearDiscountOracleWrapper(deployedBytecode: string): boolean {
  const normalizedDeployed = normalizeBytecode(deployedBytecode);
  const maskedDeployed = applyByteMaskIndices(
    normalizedDeployed,
    PENDLE_FEED_IGNORED_BYTE_INDICES,
    "ff",
  );
  return maskedDeployed === PENDLE_FEED_MASKED_TARGET;
}
