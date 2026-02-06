/**
 * Applies a byte-index mask to a normalized hex bytecode string.
 * Each ignored byte index is replaced by 00.
 */
export function applyIgnoredByteIndices(
  normalizedBytecode: string,
  ignoredByteIndices: readonly number[],
): string {
  const hex = normalizedBytecode.startsWith("0x")
    ? normalizedBytecode.slice(2)
    : normalizedBytecode;
  const bytes = hex.match(/../g) || [];

  for (const byteIndex of ignoredByteIndices) {
    if (byteIndex >= 0 && byteIndex < bytes.length) {
      bytes[byteIndex] = "00";
    }
  }

  return `0x${bytes.join("")}`;
}
