export type HexString = `0x${string}`;

export function asHexString(value: string): HexString {
  if (!value.startsWith("0x")) {
    throw new Error(`Expected 0x-prefixed hex string, got: ${value.slice(0, 10)}...`);
  }
  return value as HexString;
}
