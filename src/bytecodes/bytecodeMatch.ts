import { applyIgnoredByteIndices } from "./mask.js";
import { asHexString, type HexString } from "./hex.js";

/**
 * Normalizes deployed bytecode, applies the ignore mask, and compares to COMMON.
 */
export function isBytecodeMatch(
  deployedBytecode: string,
  mask: readonly number[],
  common: HexString,
): boolean {
  if (!common || common === "0x") {
    return false;
  }
  const normalizedInput = deployedBytecode.toLowerCase();
  if (!normalizedInput.startsWith("0x")) {
    return false;
  }
  const bytecode = asHexString(normalizedInput);
  const masked = applyIgnoredByteIndices(bytecode, mask);
  return masked === common;
}
