import type {
  Address,
  ChainId,
  CustomAdapterPattern,
  CustomAdapterRegistry,
  OracleClassification,
} from "../types.js";

export const CUSTOM_ADAPTER_REGISTRY: CustomAdapterRegistry = {
  version: "1.0.0",
  patterns: [
    {
      id: "pendle-pt-oracle",
      name: "Pendle PT Oracle",
      vendor: "Pendle",
      description: "Pendle Principal Token oracle adapter",
      knownImplementations: {
        1: ["0x66a1096C6366b2529274dF4f5D8247827fe4CEA8".toLowerCase() as Address],
      },
      priceMethod: "getOraclePrice()",
      documentationUrl: "https://docs.pendle.finance",
    },
    {
      id: "spectra-linear-discount",
      name: "Spectra Linear Discount Oracle",
      vendor: "Spectra",
      description: "Spectra linear discount oracle for PT tokens",
      knownImplementations: {
        1: [],
      },
      priceMethod: "latestAnswer()",
      documentationUrl: "https://docs.spectra.finance",
    },
    {
      id: "chronicle",
      name: "Chronicle Oracle",
      vendor: "Chronicle",
      description: "Chronicle oracle feed",
      knownImplementations: {
        1: [],
      },
      priceMethod: "read()",
      documentationUrl: "https://chroniclelabs.org",
    },
    {
      id: "lido-steth",
      name: "Lido stETH Rate",
      vendor: "Lido",
      description: "Lido stETH/ETH exchange rate",
      knownImplementations: {
        1: ["0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84".toLowerCase() as Address],
      },
      priceMethod: "getPooledEthByShares()",
      documentationUrl: "https://docs.lido.fi",
    },
    {
      id: "oval-wrapper",
      name: "Oval Price Feed Wrapper",
      vendor: "Oval",
      description: "UMA Oval wrapped price feed",
      knownImplementations: {
        1: [],
      },
      priceMethod: "latestAnswer()",
      documentationUrl: "https://docs.uma.xyz/oval",
    },
  ],
};

export function matchCustomAdapter(
  address: Address,
  implementation: Address | null,
  chainId: ChainId,
): OracleClassification | null {
  const addrToCheck = implementation || address;

  for (const pattern of CUSTOM_ADAPTER_REGISTRY.patterns) {
    const knownAddrs = pattern.knownImplementations[chainId] || [];
    if (knownAddrs.includes(addrToCheck.toLowerCase() as Address)) {
      return {
        kind: "CustomAdapter",
        adapterId: pattern.id,
        adapterName: pattern.name,
        metadata: {
          vendor: pattern.vendor,
          priceMethod: pattern.priceMethod,
          documentationUrl: pattern.documentationUrl,
        },
      };
    }
  }

  return null;
}

export function getAdapterById(adapterId: string): CustomAdapterPattern | undefined {
  return CUSTOM_ADAPTER_REGISTRY.patterns.find((p) => p.id === adapterId);
}

export function addKnownImplementation(
  adapterId: string,
  chainId: ChainId,
  address: Address,
): void {
  const pattern = getAdapterById(adapterId);
  if (pattern) {
    if (!pattern.knownImplementations[chainId]) {
      pattern.knownImplementations[chainId] = [];
    }
    const lowered = address.toLowerCase() as Address;
    if (!pattern.knownImplementations[chainId]?.includes(lowered)) {
      pattern.knownImplementations[chainId]?.push(lowered);
    }
  }
}
