import { abi as ERC4626_ABI } from "../abi/erc4626.js";
import { abi as ERC20_ABI } from "../abi/erc20.js";
import type { Address, ChainId, EnrichedVault, StandardOracleFeeds } from "../types.js";
import { getClient } from "./morphoFactory.js";

/**
 * Enriches vault addresses with symbol, asset, and assetSymbol info.
 * Uses multicall to batch read from all vaults efficiently.
 */
export async function enrichVaults(
  chainId: ChainId,
  feeds: StandardOracleFeeds[],
): Promise<Map<Address, EnrichedVault>> {
  const client = getClient(chainId);
  const result = new Map<Address, EnrichedVault>();

  // Collect unique vault addresses
  const vaultAddresses = new Set<Address>();
  const conversionSamples = new Map<Address, bigint>();

  for (const feed of feeds) {
    if (feed.baseVault) {
      vaultAddresses.add(feed.baseVault);
      conversionSamples.set(feed.baseVault, feed.baseVaultConversionSample);
    }
    if (feed.quoteVault) {
      vaultAddresses.add(feed.quoteVault);
      conversionSamples.set(feed.quoteVault, feed.quoteVaultConversionSample);
    }
  }

  if (vaultAddresses.size === 0) {
    return result;
  }

  const vaultList = Array.from(vaultAddresses);

  try {
    // Step 1: Batch read vault.symbol() and vault.asset() for all vaults
    const vaultCalls = vaultList.flatMap((vault) => [
      { address: vault, abi: ERC4626_ABI, functionName: "symbol" as const },
      { address: vault, abi: ERC4626_ABI, functionName: "asset" as const },
    ]);

    const vaultResults = await client.multicall({
      contracts: vaultCalls,
      allowFailure: true,
    });

    // Parse vault results and collect asset addresses
    const vaultData = new Map<Address, { symbol: string; asset: Address }>();
    const assetAddresses = new Set<Address>();

    for (let i = 0; i < vaultList.length; i++) {
      const symbolResult = vaultResults[i * 2];
      const assetResult = vaultResults[i * 2 + 1];

      if (symbolResult.status === "success" && assetResult.status === "success") {
        const vault = vaultList[i];
        const symbol = symbolResult.result as string;
        const asset = (assetResult.result as string).toLowerCase() as Address;

        vaultData.set(vault, { symbol, asset });
        assetAddresses.add(asset);
      }
    }

    if (assetAddresses.size === 0) {
      return result;
    }

    // Step 2: Batch read asset.symbol() for all underlying assets
    const assetList = Array.from(assetAddresses);
    const assetCalls = assetList.map((asset) => ({
      address: asset,
      abi: ERC20_ABI,
      functionName: "symbol" as const,
    }));

    const assetResults = await client.multicall({
      contracts: assetCalls,
      allowFailure: true,
    });

    // Build asset symbol map
    const assetSymbols = new Map<Address, string>();
    for (let i = 0; i < assetList.length; i++) {
      const assetResult = assetResults[i];
      if (assetResult.status === "success") {
        assetSymbols.set(assetList[i], assetResult.result as string);
      }
    }

    // Step 3: Build enriched vault objects
    for (const [vault, data] of vaultData) {
      const assetSymbol = assetSymbols.get(data.asset);
      if (assetSymbol) {
        const conversionSample = conversionSamples.get(vault) ?? 0n;
        result.set(vault, {
          address: vault,
          symbol: data.symbol,
          asset: data.asset,
          assetSymbol,
          pair: [data.symbol, assetSymbol],
          conversionSample: conversionSample.toString(),
        });
      }
    }
  } catch (error) {
    console.log(`[vault-enricher] Error enriching vaults for chain ${chainId}: ${error}`);
  }

  return result;
}

/**
 * Lookup a single vault from the enriched map.
 */
export function lookupVault(
  vaultMap: Map<Address, EnrichedVault>,
  address: Address | null,
): EnrichedVault | null {
  if (!address) return null;
  return vaultMap.get(address) ?? null;
}
