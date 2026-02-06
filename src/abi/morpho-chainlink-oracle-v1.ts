// MorphoChainlinkOracle V1 (legacy) - no vault functions
export const abi = [
  {
    inputs: [],
    name: "BASE_FEED_1",
    outputs: [{ internalType: "contract AggregatorV3Interface", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "BASE_FEED_2",
    outputs: [{ internalType: "contract AggregatorV3Interface", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "QUOTE_FEED_1",
    outputs: [{ internalType: "contract AggregatorV3Interface", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "QUOTE_FEED_2",
    outputs: [{ internalType: "contract AggregatorV3Interface", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "SCALE_FACTOR",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "price",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
