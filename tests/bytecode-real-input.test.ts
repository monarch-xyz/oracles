import { describe, expect, it } from "vitest";
import { normalizeBytecode } from "../src/bytecodes/normalize.js";
import { classifyOracleBytecode } from "../src/sources/oracleBytecodeValidation.js";
import { isMorphoChainlinkOracleV1BytecodeBytes } from "../src/sources/oracleV1Detector.js";
import { isMorphoChainlinkOracleV2BytecodeBytes } from "../src/sources/oracleV2BytecodeDetector.js";

/**
 * Paste real deployed bytecodes here.
 * Use full hex with 0x prefix.
 */
const REAL_V1_BYTECODE = "0x";
const REAL_V2_BYTECODE = "0x";
const REAL_UNKNOWN_BYTECODE = "0x";

const itIfV1 = REAL_V1_BYTECODE === "0x" ? it.skip : it;
const itIfV2 = REAL_V2_BYTECODE === "0x" ? it.skip : it;
const itIfUnknown = REAL_UNKNOWN_BYTECODE === "0x" ? it.skip : it;

describe("real bytecode validation inputs", () => {
  itIfV1("validates real V1 bytecode", () => {
    expect(isMorphoChainlinkOracleV1BytecodeBytes(REAL_V1_BYTECODE)).toBe(true);
    expect(classifyOracleBytecode(REAL_V1_BYTECODE)).toBe("v1");
    expect(normalizeBytecode(REAL_V1_BYTECODE).startsWith("0x")).toBe(true);
  });

  itIfV2("validates real V2 bytecode", () => {
    expect(isMorphoChainlinkOracleV2BytecodeBytes(REAL_V2_BYTECODE)).toBe(true);
    expect(classifyOracleBytecode(REAL_V2_BYTECODE)).toBe("v2");
    expect(normalizeBytecode(REAL_V2_BYTECODE).startsWith("0x")).toBe(true);
  });

  itIfUnknown("validates non-morpho bytecode as unknown", () => {
    expect(classifyOracleBytecode(REAL_UNKNOWN_BYTECODE)).toBe("unknown");
    expect(isMorphoChainlinkOracleV1BytecodeBytes(REAL_UNKNOWN_BYTECODE)).toBe(false);
    expect(isMorphoChainlinkOracleV2BytecodeBytes(REAL_UNKNOWN_BYTECODE)).toBe(false);
  });
});
