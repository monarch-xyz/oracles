import { describe, expect, it } from "vitest";
import { isMorphoChainlinkOracleV1Bytecode } from "../src/sources/oracleV1Detector.js";
import { MORPHO_CHAINLINK_ORACLE_V1_COMMON, MORPHO_CHAINLINK_ORACLE_V1_MASK } from "../src/bytecodes/oracle-bytecode-constants.js";
import { applyByteMaskIndices } from "../src/bytecodes/mask.js";

function mutateByteAt(hex: string, index: number): string {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = cleanHex.match(/../g) || [];
  if (index >= bytes.length) return hex;
  // Change byte to something else
  bytes[index] = bytes[index] === "00" ? "ff" : "00";
  return "0x" + bytes.join("");
}

describe("Verification of Mask Logic", () => {
  it("should match the common bytecode itself (sanity)", () => {
     // NOTE: COMMON has 00s in masked places. To get a "valid" bytecode that matches, 
     // we can just use COMMON (since masked(COMMON) == COMMON if COMMON has 00s in mask).
     // Actually, we should use a real bytecode, but let's see.
     expect(isMorphoChainlinkOracleV1Bytecode(MORPHO_CHAINLINK_ORACLE_V1_COMMON)).toBe(true);
  });

  it("should match if we mutate a masked byte", () => {
    // Pick an index from the mask
    const maskIndex = MORPHO_CHAINLINK_ORACLE_V1_MASK[0]; // 195
    
    // Create a bytecode that looks like COMMON but has random junk at the masked index
    // Note: COMMON already has 00 at masked indices.
    const mutated = mutateByteAt(MORPHO_CHAINLINK_ORACLE_V1_COMMON, maskIndex);
    
    expect(isMorphoChainlinkOracleV1Bytecode(mutated)).toBe(true);
  });

  it("should NOT match if we mutate an UNMASKED byte", () => {
    // Pick an index NOT in the mask
    let unmaskedIndex = 0;
    while (Array.from(MORPHO_CHAINLINK_ORACLE_V1_MASK).includes(unmaskedIndex)) {
      unmaskedIndex++;
    }
    
    const mutated = mutateByteAt(MORPHO_CHAINLINK_ORACLE_V1_COMMON, unmaskedIndex);
    expect(isMorphoChainlinkOracleV1Bytecode(mutated)).toBe(false);
  });
});
