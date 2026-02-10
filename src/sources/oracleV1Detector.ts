import { isBytecodeMatch } from "../bytecodes/bytecodeMatch.js";
import {
  MORPHO_CHAINLINK_ORACLE_V1_COMMON,
  MORPHO_CHAINLINK_ORACLE_V1_MASK,
} from "../bytecodes/oracle-bytecode-constants.js";

/**
 * Pure bytecode check for MorphoChainlinkOracle V1.
 * Normalizes deployed bytecode (masks PUSH32 immutables) and compares.
 */
export function isMorphoChainlinkOracleV1Bytecode(deployedBytecode: string): boolean {
  return isBytecodeMatch(
    deployedBytecode,
    MORPHO_CHAINLINK_ORACLE_V1_MASK,
    MORPHO_CHAINLINK_ORACLE_V1_COMMON,
  );
}
