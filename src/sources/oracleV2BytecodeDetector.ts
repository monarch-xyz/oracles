import { getClient } from "./morphoFactory.js";
import type { Address, ChainId, StandardOracleFeeds } from "../types.js";
import { abi as MORPHO_CHAINLINK_V2_ABI } from "../abi/morpho-chainlink-oracle-v2.js";
import { MORPHO_V2_NORMALIZED_BYTECODE } from "../bytecodes/morpho-chainlink-oracle-v2.js";
import { MORPHO_HYPEREVM_NORMALIZED_BYTECODE } from "../bytecodes/morpho-chainlink-oracle-hyperevm.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Normalize bytecode by replacing PUSH32 (0x7f) values with zeros.
 * This allows comparing bytecode regardless of immutable values.
 */
function normalizeBytecode(bytecode: string): string {
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

  return "0x" + result;
}

function toNullableAddress(addr: Address): Address | null {
  return addr === ZERO_ADDRESS ? null : addr;
}

export interface V2BytecodeDetectionResult {
  isV2Bytecode: boolean;
  feeds: StandardOracleFeeds | null;
}

/**
 * Check if bytecode matches MorphoChainlinkOracle V2 or HyperEVM variant.
 * Returns true for both standard V2 bytecode and HyperEVM-specific variant.
 */
async function isMorphoChainlinkOracleV2Bytecode(
  chainId: ChainId,
  oracleAddress: Address
): Promise<boolean> {
  const client = getClient(chainId);

  try {
    const deployedBytecode = await client.getCode({ address: oracleAddress });
    if (!deployedBytecode) return false;

    const normalizedDeployed = normalizeBytecode(deployedBytecode);
    
    // Check against known V2-compatible bytecode patterns
    return (
      normalizedDeployed === MORPHO_V2_NORMALIZED_BYTECODE ||
      normalizedDeployed === MORPHO_HYPEREVM_NORMALIZED_BYTECODE
    );
  } catch {
    return false;
  }
}

/**
 * Fetch feeds from a bytecode-verified V2 oracle.
 */
async function fetchV2OracleFeeds(
  chainId: ChainId,
  oracleAddress: Address
): Promise<StandardOracleFeeds | null> {
  const client = getClient(chainId);

  try {
    const results = await client.multicall({
      contracts: [
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "BASE_FEED_1" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "BASE_FEED_2" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "QUOTE_FEED_1" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "QUOTE_FEED_2" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "BASE_VAULT" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "QUOTE_VAULT" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "BASE_VAULT_CONVERSION_SAMPLE" },
        { address: oracleAddress, abi: MORPHO_CHAINLINK_V2_ABI, functionName: "QUOTE_VAULT_CONVERSION_SAMPLE" },
      ],
      allowFailure: true,
    });

    // All 8 functions should succeed for V2
    if (results.some((r) => r.status !== "success")) {
      return null;
    }

    const [
      baseFeedOne, baseFeedTwo, quoteFeedOne, quoteFeedTwo,
      baseVault, quoteVault, baseVaultConversionSample, quoteVaultConversionSample,
    ] = results.map((r) => r.result) as [
      Address, Address, Address, Address,
      Address, Address, bigint, bigint,
    ];

    return {
      baseFeedOne: toNullableAddress(baseFeedOne.toLowerCase() as Address),
      baseFeedTwo: toNullableAddress(baseFeedTwo.toLowerCase() as Address),
      quoteFeedOne: toNullableAddress(quoteFeedOne.toLowerCase() as Address),
      quoteFeedTwo: toNullableAddress(quoteFeedTwo.toLowerCase() as Address),
      baseVault: toNullableAddress(baseVault.toLowerCase() as Address),
      quoteVault: toNullableAddress(quoteVault.toLowerCase() as Address),
      baseVaultConversionSample,
      quoteVaultConversionSample,
    };
  } catch {
    return null;
  }
}

/**
 * Detect V2 oracle by bytecode verification, then fetch feeds if verified.
 */
export async function detectAndFetchV2OracleByBytecode(
  chainId: ChainId,
  oracleAddress: Address
): Promise<V2BytecodeDetectionResult> {
  const isV2 = await isMorphoChainlinkOracleV2Bytecode(chainId, oracleAddress);
  if (!isV2) {
    return { isV2Bytecode: false, feeds: null };
  }

  const feeds = await fetchV2OracleFeeds(chainId, oracleAddress);
  return { isV2Bytecode: true, feeds };
}
