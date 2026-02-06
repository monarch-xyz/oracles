import { describe, expect, it } from "vitest";
import { MORPHO_HYPEREVM_NORMALIZED_BYTECODE } from "../src/bytecodes/morpho-chainlink-oracle-hyperevm.js";
import { MORPHO_V1_NORMALIZED_BYTECODE } from "../src/bytecodes/morpho-chainlink-oracle-v1.js";
import { MORPHO_V2_NORMALIZED_BYTECODE } from "../src/bytecodes/morpho-chainlink-oracle-v2.js";
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
    expect(isMorphoChainlinkOracleV2BytecodeBytes(MORPHO_V2_NORMALIZED_BYTECODE)).toBe(true);
    expect(classifyOracleBytecode(MORPHO_V2_NORMALIZED_BYTECODE)).toBe("v2");
  });

  it("rejects HyperEVM bytecode in strict V2 checker", () => {
    expect(isMorphoChainlinkOracleV2BytecodeBytes(MORPHO_HYPEREVM_NORMALIZED_BYTECODE)).toBe(false);
    expect(classifyOracleBytecode(MORPHO_HYPEREVM_NORMALIZED_BYTECODE)).toBe("unknown");
  });

  it("rejects V2 bytecode in V1 checker", () => {
    expect(isMorphoChainlinkOracleV1BytecodeBytes(MORPHO_V2_NORMALIZED_BYTECODE)).toBe(false);
  });

  it("rejects V1 bytecode in V2 checker", () => {
    expect(isMorphoChainlinkOracleV2BytecodeBytes(MORPHO_V1_NORMALIZED_BYTECODE)).toBe(false);
  });

  it("normalization masks PUSH32 immutable values", () => {
    const mutated = mutateFirstPush32Immediate(MORPHO_V2_NORMALIZED_BYTECODE);
    expect(normalizeBytecode(mutated)).toBe(MORPHO_V2_NORMALIZED_BYTECODE);
    expect(isMorphoChainlinkOracleV2BytecodeBytes(mutated)).toBe(true);
  });

  it("normalization lowercases and adds 0x prefix", () => {
    const simple = `7F${"AA".repeat(32)}60`;
    expect(normalizeBytecode(simple)).toBe(`0x7f${"0".repeat(64)}60`);
  });

  it("keeps incomplete PUSH32 payload unchanged", () => {
    expect(normalizeBytecode("7f11")).toBe("0x7f11");
  });
});
