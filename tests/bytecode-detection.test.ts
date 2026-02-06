import { describe, expect, it } from "vitest";
import { MORPHO_V1_NORMALIZED_BYTECODE } from "../src/bytecodes/morpho-chainlink-oracle-v1.js";
import { MORPHO_V2_MASKED_NORMALIZED_TARGET } from "../src/bytecodes/morpho-chainlink-oracle-v2-mask.js";
import { normalizeBytecode } from "../src/bytecodes/normalize.js";
import { classifyOracleBytecode } from "../src/sources/oracleBytecodeValidation.js";
import { isMorphoChainlinkOracleV1BytecodeBytes } from "../src/sources/oracleV1Detector.js";
import { isMorphoChainlinkOracleV2BytecodeBytes } from "../src/sources/oracleV2BytecodeDetector.js";

function mutateFirstPush32Immediate(normalizedBytecode: string): string {
  const hex = normalizedBytecode.startsWith("0x")
    ? normalizedBytecode.slice(2)
    : normalizedBytecode;
  const push32Index = hex.indexOf("7f");

  if (push32Index === -1 || push32Index + 2 + 64 > hex.length) {
    throw new Error("Could not find a complete PUSH32 immediate");
  }

  const mutatedImmediate = "11".repeat(32);
  const beforeImmediate = hex.slice(0, push32Index + 2);
  const afterImmediate = hex.slice(push32Index + 2 + 64);

  return `0x${beforeImmediate}${mutatedImmediate}${afterImmediate}`;
}

describe("bytecode validation logic", () => {
  it("detects V1 bytecode", () => {
    expect(isMorphoChainlinkOracleV1BytecodeBytes(MORPHO_V1_NORMALIZED_BYTECODE)).toBe(true);
    expect(classifyOracleBytecode(MORPHO_V1_NORMALIZED_BYTECODE)).toBe("v1");
  });

  it("detects V2 bytecode", () => {
    expect(isMorphoChainlinkOracleV2BytecodeBytes(MORPHO_V2_MASKED_NORMALIZED_TARGET)).toBe(true);
    expect(classifyOracleBytecode(MORPHO_V2_MASKED_NORMALIZED_TARGET)).toBe("v2");
  });

  it("normalization masks PUSH32 immutable values", () => {
    const mutated = mutateFirstPush32Immediate(MORPHO_V2_MASKED_NORMALIZED_TARGET);
    expect(normalizeBytecode(mutated)).toBe(MORPHO_V2_MASKED_NORMALIZED_TARGET);
    expect(isMorphoChainlinkOracleV2BytecodeBytes(mutated)).toBe(true);
  });
});
