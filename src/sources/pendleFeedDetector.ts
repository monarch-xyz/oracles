import { isBytecodeMatch } from "../bytecodes/bytecodeMatch.js";
import {
  PENDLE_CHAINLINK_ORACLE_FEED_COMMON,
  PENDLE_CHAINLINK_ORACLE_FEED_MASK,
  PENDLE_LINEAR_DISCOUNT_ORACLE_FEED_COMMON,
  PENDLE_LINEAR_DISCOUNT_ORACLE_FEED_MASK,
} from "../bytecodes/oracle-bytecode-constants.js";

/**
 * Bytecode check for Pendle linear discount feed wrappers.
 */
export function isPendleLinearDiscountFeedBytecode(deployedBytecode: string): boolean {
  return isBytecodeMatch(
    deployedBytecode,
    PENDLE_LINEAR_DISCOUNT_ORACLE_FEED_MASK,
    PENDLE_LINEAR_DISCOUNT_ORACLE_FEED_COMMON,
  );
}

/**
 * Bytecode check for Pendle Chainlink oracle feeds.
 */
export function isPendleChainlinkOracleFeedBytecode(deployedBytecode: string): boolean {
  return isBytecodeMatch(
    deployedBytecode,
    PENDLE_CHAINLINK_ORACLE_FEED_MASK,
    PENDLE_CHAINLINK_ORACLE_FEED_COMMON,
  );
}

// Backwards-compatible aliases
export const isPendleLinearDiscountOracleWrapper = isPendleLinearDiscountFeedBytecode;
export const isPendleChainlinkOracleFeed = isPendleChainlinkOracleFeedBytecode;
