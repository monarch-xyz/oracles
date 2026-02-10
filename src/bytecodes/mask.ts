import { asHexString, type HexString } from "./hex.js";

/**
 * Applies a byte-index mask to a normalized hex bytecode string.
 * Each ignored byte index is replaced by 00.
 */

export function applyIgnoredByteIndices(
  normalizedBytecode: HexString,
  ignoredByteIndices: readonly number[],
): HexString {
  return applyByteMaskIndices(normalizedBytecode, ignoredByteIndices, "00");
}

/**
 * Applies a byte-index mask to a normalized hex bytecode string.
 * Each ignored byte index is replaced by the supplied byte value.
 */
export function applyByteMaskIndices(
  normalizedBytecode: HexString,
  ignoredByteIndices: readonly number[],
  maskByte: string,
): HexString {
  const hex = normalizedBytecode.startsWith("0x")
    ? normalizedBytecode.slice(2)
    : normalizedBytecode;
  const bytes = hex.match(/../g) || [];

  for (const byteIndex of ignoredByteIndices) {
    if (byteIndex >= 0 && byteIndex < bytes.length) {
      bytes[byteIndex] = maskByte;
    }
  }

  return asHexString(`0x${bytes.join("")}`);
}
