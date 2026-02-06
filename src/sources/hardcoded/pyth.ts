import type { Address, ChainId, FeedInfo, FeedProviderRegistry } from "../../types.js";

/**
 * Pyth Network feeds - hardcoded registry
 */
const PYTH_FEEDS: Record<ChainId, FeedInfo[]> = {
  1: [
    { address: "0xF2d7B0F5cB09928DB0f0686F4e64b4aD96E04562" as Address, chainId: 1, provider: "Pyth", description: "Pyth: UNI / USD", pair: ["UNI", "USD"], decimals: 8 },
    { address: "0xC5774412Dbd3734A5925936f320EE91a2940488D" as Address, chainId: 1, provider: "Pyth", description: "Pyth: USDC / USD", pair: ["USDC", "USD"], decimals: 8 },
    { address: "0x7C4561Bb0F2d6947BeDA10F667191f6026E7Ac0c" as Address, chainId: 1, provider: "Pyth", description: "Pyth: PAXG / USD", pair: ["PAXG", "USD"], decimals: 8 },
    { address: "0x596cDF5D33486b035e8482688c638E7dcAf25a7b" as Address, chainId: 1, provider: "Pyth", description: "Pyth: BOLD / USD", pair: ["BOLD", "USD"], decimals: 8 },
  ],
  8453: [
    { address: "0x903ab5FAE9ba089B1D4fCe55BBb40e1a07Acef59" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: pufETH / USD", pair: ["pufETH", "USD"], decimals: 8 },
    { address: "0x4429B7c2a044DD41fb8CA64d64398e8eF37814e4" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: weETH / USD", pair: ["weETH", "USD"], decimals: 8 },
    { address: "0xB9A063eC10abFE6C03D974a82E7A6429F88602bF" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: ezETH / USD", pair: ["ezETH", "USD"], decimals: 8 },
    { address: "0x75c5034e268Df404A839Ed89D507F26309217548" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: cbETH / USD", pair: ["cbETH", "USD"], decimals: 8 },
    { address: "0xb2c122567229A413bd8fe2aBADedaD2ED97436dB" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: wstETH / USD", pair: ["wstETH", "USD"], decimals: 8 },
    { address: "0x4af3E0d3A45Ac89234F5dEAc723d5eE6C0224De3" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: USDC / USD", pair: ["USDC", "USD"], decimals: 8 },
    { address: "0xC0F566304A44d27c40d4F81D629520Ac4eD1850E" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: uXRP / USD", pair: ["uXRP", "USD"], decimals: 8 },
    { address: "0x1b4671313DfA19B2F9B20eC2410712BC7CE6A89F" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: SUI / USD", pair: ["SUI", "USD"], decimals: 8 },
    { address: "0x59F78DE21a0b05d96Ae00c547BA951a3B905602f" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: ETH / USD", pair: ["ETH", "USD"], decimals: 8 },
    { address: "0x19feFdd35B67C2694F3532a8e0Be75dFf0f8bFBb" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: USR / USD", pair: ["USR", "USD"], decimals: 8 },
    { address: "0xCd76c50c3210C5AaA9c39D53A4f95BFd8b1a3a19" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: USR / USD", pair: ["USR", "USD"], decimals: 8 },
    { address: "0x9924a529d15067518Bf5182202BfAd71E4B64a74" as Address, chainId: 8453, provider: "Pyth", description: "Pyth: RLP / USD", pair: ["RLP", "USD"], decimals: 8 },
  ],
  42161: [],
  137: [],
  130: [],
  999: [],
  143: [],
};

export function fetchPythProvider(chainId: ChainId): FeedProviderRegistry {
  const feeds = PYTH_FEEDS[chainId] ?? [];
  const feedMap: Record<Address, FeedInfo> = {};

  for (const feed of feeds) {
    feedMap[feed.address.toLowerCase() as Address] = feed;
  }

  console.log(`[pyth] Loaded ${feeds.length} hardcoded feeds for chain ${chainId}`);

  return {
    chainId,
    provider: "Pyth",
    feeds: feedMap,
    updatedAt: new Date().toISOString(),
  };
}
