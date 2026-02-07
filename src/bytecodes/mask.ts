/**
 * Applies a byte-index mask to a normalized hex bytecode string.
 * Each ignored byte index is replaced by 00.
 */
export function applyIgnoredByteIndices(
  normalizedBytecode: string,
  ignoredByteIndices: readonly number[],
): string {
  return applyByteMaskIndices(normalizedBytecode, ignoredByteIndices, "00");
}

/**
 * Applies a byte-index mask to a normalized hex bytecode string.
 * Each ignored byte index is replaced by the supplied byte value.
 */
export function applyByteMaskIndices(
  normalizedBytecode: string,
  ignoredByteIndices: readonly number[],
  maskByte: string,
): string {
  const hex = normalizedBytecode.startsWith("0x")
    ? normalizedBytecode.slice(2)
    : normalizedBytecode;
  const bytes = hex.match(/../g) || [];

  for (const byteIndex of ignoredByteIndices) {
    if (byteIndex >= 0 && byteIndex < bytes.length) {
      bytes[byteIndex] = maskByte;
    }
  }

  return `0x${bytes.join("")}`;
}
