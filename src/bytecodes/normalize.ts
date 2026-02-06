/**
 * Normalize bytecode by replacing PUSH32 (0x7f) values with zeros.
 * This allows comparing bytecode regardless of immutable values.
 */
export function normalizeBytecode(bytecode: string): string {
  let hex = bytecode.toLowerCase();
  if (hex.startsWith("0x")) hex = hex.slice(2);

  let result = "";
  let i = 0;

  while (i < hex.length) {
    const opcode = hex.slice(i, i + 2);
    result += opcode;
    i += 2;

    // PUSH32 = 0x7f, followed by 32 bytes (64 hex chars)
    if (opcode === "7f" && i + 64 <= hex.length) {
      result += "0000000000000000000000000000000000000000000000000000000000000000";
      i += 64;
    }
  }

  return `0x${result}`;
}
