import type { Address, ChainId, FeedInfo, FeedProviderRegistry } from "../../types.js";

/**
 * API3 feeds — hardcoded registry
 *
 * Each proxy address was verified on-chain and cross-checked against:
 *   - Etherscan verified source: contract name = Api3ReaderProxyV1 or ProductApi3ReaderProxyV1
 *   - On-chain api3ServerV1() returns 0x709944a48cAf83535e43471680fDA4905FB3920a (canonical Api3ServerV1)
 *   - On-chain dappId() matches @api3/contracts compute-dapp-id output
 *   - On-chain read() returns (int224, uint32) with 18 decimals
 *
 * Reference: https://docs.api3.org/oev-searchers/in-depth/#oev-dapps
 *
 * Morpho markets on Ethereum using API3 OEV proxies:
 *   - morpho-cbbtc-usdc-860-lltv  → dAppId 93893943...  (cbBTC/USDC 86% LLTV)
 *   - morpho-wsteth-usdc-860-lltv → dAppId 97381820...  (wstETH/USDC 86% LLTV)
 *   - morpho-wbtc-usdc-860-lltv   → dAppId 17365895...  (WBTC/USDC 86% LLTV)
 *   - morpho-mvl-usdc-770-lltv    → dAppId 48280407...  (MVL/USDC 77% LLTV)
 */
const API3_FEEDS: Record<ChainId, FeedInfo[]> = {
  1: [
    // --- morpho-cbbtc-usdc-860-lltv (dAppId: 93893943139351759563087983285516099397217584741419818881631089342612251447123) ---
    // Oracle: 0xc7be7593fd5453db5adcc1d7103f2211d4f2e40d
    // Market: https://app.morpho.org/ethereum/market/0xba3ba077d9c838696b76e29a394ae9f0d1517a372e30fd9a0fc19c516fb4c5a7/cbbtc-usdc
    {
      address: "0xACE21E4A3cd5B5519FB6A999dF8B63b0Ce5A046A" as Address, // ERC1967Proxy → Api3ReaderProxyV1
      chainId: 1,
      provider: "API3",
      description: "API3: cbBTC / USD",
      pair: ["cbBTC", "USD"],
      decimals: 18,
    },
    {
      address: "0x8E5e906761677E24D3AFd77DB6A19Dd9ed83F8c2" as Address, // ERC1967Proxy → Api3ReaderProxyV1
      chainId: 1,
      provider: "API3",
      description: "API3: USDC / USD",
      pair: ["USDC", "USD"],
      decimals: 18,
    },

    // --- morpho-wsteth-usdc-860-lltv (dAppId: 97381820396112656280419316871158196729529109392117797943603702394619445769965) ---
    // Oracle: 0x167d283acac1b9ff39466a75aa82902f340f1f4d
    // Market: https://app.morpho.org/ethereum/market/0x6d2fba32b8649d92432d036c16aa80779034b7469b63abc259b17678857f31c2/wsteth-usdc
    {
      address: "0xeC4031539b851eEc918b41FE3e03d7236fEc7be8" as Address, // ProductApi3ReaderProxyV1 (verified on Etherscan)
      chainId: 1,
      provider: "API3",
      description: "API3: wstETH / USD",
      pair: ["wstETH", "USD"],
      decimals: 18,
    },
    {
      address: "0x4C7A561D15001C6ee5E05996591419b11962fa1A" as Address, // ERC1967Proxy → Api3ReaderProxyV1
      chainId: 1,
      provider: "API3",
      description: "API3: USDC / USD",
      pair: ["USDC", "USD"],
      decimals: 18,
    },

    // --- morpho-wbtc-usdc-860-lltv (dAppId: 17365895289527114663535864735618425419649114899813330533457675828227311300257) ---
    // Oracle: 0x56c136fc58686c8409f46458056c3f960d3ef21d
    // Market: https://app.morpho.org/ethereum/market/0x704e020b95cbf452e7a30545d5f72a241c4238eebf9d1c67657fdd4a488581e0/wbtc-usdc
    {
      address: "0xfA5d16e31bd7325119d8C718eAC1Fd6F5b2D1526" as Address, // ERC1967Proxy → Api3ReaderProxyV1
      chainId: 1,
      provider: "API3",
      description: "API3: WBTC / USD",
      pair: ["WBTC", "USD"],
      decimals: 18,
    },
    {
      address: "0x2bB37d8bEa49b4E7DFE3e95337D9662C9E120874" as Address, // ERC1967Proxy → Api3ReaderProxyV1
      chainId: 1,
      provider: "API3",
      description: "API3: USDC / USD",
      pair: ["USDC", "USD"],
      decimals: 18,
    },

    // --- morpho-mvl-usdc-770-lltv (dAppId: 48280407351147054740803812548131809395167594181763408799978884234267582637699) ---
    // Oracle: 0x856e1fbf235561A31bA6A20654814A30F96459a6
    // Market: https://app.morpho.org/ethereum/market/0x972b343b611a3cf2559a04bf2c0b8e45d1c69a1c1d94dc852ca6e16a924b006b/mvl-usdc
    {
      address: "0xD26674Cbb8047A0C608e21Cb29e82b608EA1823A" as Address, // ERC1967Proxy → Api3ReaderProxyV1
      chainId: 1,
      provider: "API3",
      description: "API3: MVL / USD",
      pair: ["MVL", "USD"],
      decimals: 18,
    },
    {
      address: "0x549D08c7D4779EbC22A2c5031Da3bf1f14A08bb7" as Address, // ERC1967Proxy → Api3ReaderProxyV1
      chainId: 1,
      provider: "API3",
      description: "API3: USDC / USD",
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

export function fetchApi3Provider(chainId: ChainId): FeedProviderRegistry {
  const feeds = API3_FEEDS[chainId] ?? [];
  const feedMap: Record<Address, FeedInfo> = {};

  for (const feed of feeds) {
    feedMap[feed.address.toLowerCase() as Address] = feed;
  }

  console.log(`[api3] Loaded ${feeds.length} hardcoded feeds for chain ${chainId}`);

  return {
    chainId,
    provider: "API3",
    feeds: feedMap,
    updatedAt: new Date().toISOString(),
  };
}
