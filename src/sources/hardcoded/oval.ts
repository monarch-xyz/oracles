import type { Address, ChainId, FeedInfo, FeedProviderRegistry } from "../../types.js";

/**
 * Oval feeds - hardcoded registry
 * Oval wraps Chainlink feeds with MEV protection
 */
const OVAL_FEEDS: Record<ChainId, FeedInfo[]> = {
  1: [
    {
      address: "0x0F0072fdDB300f9375C999cBcf9BDec07E7227d3" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: USDT / ETH",
      pair: ["USDT", "ETH"],
      decimals: 18,
    },
    {
      address: "0xc47641ed51f73A82C62Ba439d90096bccC376fe8" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: stETH / ETH",
      pair: ["STETH", "ETH"],
      decimals: 18,
    },
    {
      address: "0xb21d661fd6a3769ADB03e373dc00265f3c78cBfD" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: ezETH / ETH",
      pair: ["ezETH", "ETH"],
      decimals: 18,
    },
    {
      address: "0xE8f0CA2d311a9B669f525BFA306eBf59d4b64297" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: USDC / ETH",
      pair: ["USDC", "ETH"],
      decimals: 18,
    },
    {
      address: "0x4F78027C9e9B8E11dEc8139e248D74b9dDE05ceb" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: weETH / ETH",
      pair: ["weETH", "ETH"],
      decimals: 18,
    },
    {
      address: "0xAd73fF895dC265b5229e61f45226319471C4685e" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: USDC / ETH",
      pair: ["USDC", "ETH"],
      decimals: 18,
    },
    {
      address: "0x6a5a24455e5c9C288632944A88ceA923e0496024" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: USDC / USD",
      pair: ["USDC", "USD"],
      decimals: 8,
    },
    {
      address: "0xCf17f459F4D1D9e6fb5aa5013Bd2D7EB6083bd45" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: TBTC / USD",
      pair: ["TBTC", "USD"],
      decimals: 8,
    },
    {
      address: "0x4fC22E5f89891B6bd00d554B6250503d38EE5E4D" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: pufETH / ETH",
      pair: ["pufETH", "ETH"],
      decimals: 8,
    },
    {
      address: "0x12A52946cFB6761c3cA69389C5FEFfe9CF3Ef4e3" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: USDC / ETH",
      pair: ["USDC", "ETH"],
      decimals: 18,
    },
    {
      address: "0xE2380c199F07e78012c6D0b076A4137E6D1Ba022" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: SAND / USD",
      pair: ["SAND", "USD"],
      decimals: 8,
    },
    {
      address: "0x09717Bb4EE122Bb5dBf2457F727FfE8Ed3097F48" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: USDC / USD",
      pair: ["USDC", "USD"],
      decimals: 8,
    },
    {
      address: "0x171b10e16223F86500D558D426Bf4fa5EF280087" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: cbBTC / USD",
      pair: ["cbBTC", "USD"],
      decimals: 18,
    },
    {
      address: "0x206B4846F1257252a64781f442626ce82FD3C6Cc" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: ETH / USD",
      pair: ["ETH", "USD"],
      decimals: 18,
    },
    {
      address: "0x6BC34c19AEbf6049e5AD42969EF0EfF3db665b0c" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: cbBTC / USD",
      pair: ["cbBTC", "USD"],
      decimals: 18,
    },
    {
      address: "0xf11125B453dA3283ab0F520972Fd8DF857Fd61ef" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: USDT / USD",
      pair: ["USDT", "USD"],
      decimals: 18,
    },
    {
      address: "0x82b26825D02deB266466f563F03ef2B87f8f37B9" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: cbBTC / USD",
      pair: ["cbBTC", "USD"],
      decimals: 18,
    },
    {
      address: "0xDF7f88EAd7832D2efCf7c874174538e9EAAf6930" as Address,
      chainId: 1,
      provider: "Oval",
      description: "Oval: USDC / USD",
      pair: ["USDC", "USD"],
      decimals: 18,
    },
  ],
  8453: [],
  42161: [],
  137: [],
  130: [],
  999: [],
  143: [],
};

export function fetchOvalProvider(chainId: ChainId): FeedProviderRegistry {
  const feeds = OVAL_FEEDS[chainId] ?? [];
  const feedMap: Record<Address, FeedInfo> = {};

  for (const feed of feeds) {
    feedMap[feed.address.toLowerCase() as Address] = feed;
  }

  console.log(`[oval] Loaded ${feeds.length} hardcoded feeds for chain ${chainId}`);

  return {
    chainId,
    provider: "Oval",
    feeds: feedMap,
    updatedAt: new Date().toISOString(),
  };
}
