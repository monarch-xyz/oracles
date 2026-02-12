import { isBytecodeMatch } from "../bytecodes/bytecodeMatch.js";
import {
  MORPHO_CHAINLINK_ORACLE_V2_COMMON,
  MORPHO_CHAINLINK_ORACLE_V2_MASK,
} from "../bytecodes/oracle-bytecode-constants.js";

/**
 * Pure bytecode check for MorphoChainlinkOracle V2.
 * Normalizes deployed bytecode (masks PUSH32 immutables) and compares.
 */
export function isMorphoChainlinkOracleV2Bytecode(deployedBytecode: string): boolean {
  return (
    isBytecodeMatch(
      deployedBytecode,
      MORPHO_CHAINLINK_ORACLE_V2_MASK,
      MORPHO_CHAINLINK_ORACLE_V2_COMMON,
    )
  );
}
