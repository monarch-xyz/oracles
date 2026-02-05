import { ACTIVE_CHAINS, IMPL_RESCAN_INTERVAL_MS } from "./config.js";
import { fetchOraclesFromMorphoApi } from "./sources/morphoApi.js";
import { fetchOracleFeeds } from "./sources/morphoFactory.js";
import { fetchFactoryVerifiedMap } from "./sources/factoryVerifier.js";
import { fetchChainlinkProvider } from "./sources/chainlink.js";
import { fetchRedstoneProvider } from "./sources/redstone.js";
import {
  detectProxy,
  detectProxyViaEtherscan,
  needsImplRescan,
} from "./analyzers/proxyDetector.js";
import { matchCustomAdapter } from "./analyzers/customAdapters.js";
import { FeedProviderMatcher } from "./analyzers/feedProviderMatcher.js";
import { loadState, saveToGist, getChainState } from "./state/store.js";
import type {
  Address,
  ChainId,
  ChainState,
  ContractState,
  MetadataFile,
  OracleOutput,
  OracleOutputData,
  OutputFile,
  ScannerState,
} from "./types.js";

export async function runScanner(): Promise<void> {
  console.log("=== Oracle Scanner Starting ===");
  const startTime = Date.now();
  const logPerOracle = process.env.LOG_PER_ORACLE === "1";

  const state = await loadState();
  const feedProviderMatcher = new FeedProviderMatcher();
  const outputs = new Map<ChainId, OutputFile>();

  // 1. Fetch all oracles from Morpho API (all chains at once)
  const allOracles = await fetchOraclesFromMorphoApi();

  // 2. Group by chain
  const oraclesByChain = new Map<ChainId, Address[]>();
  for (const oracle of allOracles) {
    if (!ACTIVE_CHAINS.includes(oracle.chainId)) continue;
    if (!oraclesByChain.has(oracle.chainId)) {
      oraclesByChain.set(oracle.chainId, []);
    }
    oraclesByChain.get(oracle.chainId)!.push(oracle.address);
  }

  // 3. Process each chain
  for (const chainId of ACTIVE_CHAINS) {
    console.log(`\n--- Processing chain ${chainId} ---`);

    const [chainlinkProvider, redstoneProvider] = await Promise.all([
      fetchChainlinkProvider(chainId),
      fetchRedstoneProvider(chainId),
    ]);

    feedProviderMatcher.addProvider(chainlinkProvider);
    feedProviderMatcher.addProvider(redstoneProvider);

    const chainState = getChainState(state, chainId);
    const oracleAddresses = oraclesByChain.get(chainId) || [];

    console.log(`  Found ${oracleAddresses.length} oracles from Morpho API`);

    const factoryCheckTargets: Address[] = [];
    for (const oracleAddress of oracleAddresses) {
      const existing = chainState.contracts[oracleAddress];
      const hasStandardClassification =
        existing?.classification?.kind === "MorphoChainlinkOracleV2";
      const shouldCheckFactory = !(hasStandardClassification && !existing?.proxy);
      if (shouldCheckFactory) {
        factoryCheckTargets.push(oracleAddress);
      }
    }

    const factoryVerifiedMap = await fetchFactoryVerifiedMap(
      chainId,
      factoryCheckTargets
    );
    if (factoryCheckTargets.length > 0) {
      let trueCount = 0;
      for (const address of factoryCheckTargets) {
        if (factoryVerifiedMap.get(address)) trueCount += 1;
      }
      console.log(
        `  [factory] multicall results: ${trueCount} true / ${factoryCheckTargets.length} total`
      );
    }

    // Process each oracle
    for (const oracleAddress of oracleAddresses) {
      await processOracle(
        chainId,
        oracleAddress,
        chainState,
        feedProviderMatcher,
        factoryVerifiedMap,
        logPerOracle
      );
    }

    // Rescan upgradable oracles (24h check)
    await rescanUpgradableOracles(chainId, chainState);

    const output = buildOutputFile(chainId, chainState, feedProviderMatcher);
    outputs.set(chainId, output);
  }

  const metadata = buildMetadata(state, outputs, feedProviderMatcher);
  state.generatedAt = new Date().toISOString();

  await saveToGist(state, outputs, metadata);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Scanner completed in ${elapsed}s ===`);
}

async function processOracle(
  chainId: ChainId,
  oracleAddress: Address,
  chainState: ChainState,
  feedProviderMatcher: FeedProviderMatcher,
  factoryVerifiedMap: Map<Address, boolean>,
  logPerOracle: boolean
): Promise<void> {
  const now = new Date().toISOString();

  let contractState = chainState.contracts[oracleAddress];
  const isNew = !contractState;

  if (!contractState) {
    contractState = {
      firstSeenAt: now,
      lastSeenAt: now,
      proxy: null,
      classification: null,
    };
    chainState.contracts[oracleAddress] = contractState;
  }
  contractState.lastSeenAt = now;

  // Check proxy status (prefer Etherscan v2, fallback to EIP-1967)
  const etherscanProxy = await detectProxyViaEtherscan(chainId, oracleAddress);
  if (etherscanProxy?.isProxy) {
    contractState.proxy = {
      isProxy: true,
      proxyType: "EIP1967",
      implementation: etherscanProxy.implementation,
      lastImplScanAt: now,
    };
  } else {
    // Fallback to onchain EIP-1967 check
    const proxyInfo = await detectProxy(chainId, oracleAddress);
    contractState.proxy = proxyInfo;
  }

  // Check if factory-verified first - only fetch feeds if verified
  const hasStandardClassification =
    contractState.classification?.kind === "MorphoChainlinkOracleV2";
  const shouldCheckFactory = !(hasStandardClassification && !contractState.proxy);

  if (shouldCheckFactory) {
    const isVerified = factoryVerifiedMap.get(oracleAddress) || false;
    if (isVerified) {
      const feeds = await fetchOracleFeeds(chainId, oracleAddress);
      if (feeds) {
        contractState.classification = {
          kind: "MorphoChainlinkOracleV2",
          verifiedByFactory: true,
          feeds,
        };
      }
    }
  }

  // If not verified or feeds fetch failed, try custom adapter match
  if (!contractState.classification) {
    // Try to match custom adapter
    const impl = contractState.proxy?.implementation || null;
    const customMatch = matchCustomAdapter(oracleAddress, impl, chainId);
    if (customMatch) {
      contractState.classification = customMatch;
    } else {
      contractState.classification = {
        kind: "Unknown",
        reason: "No standard feeds, no custom adapter match",
      };
    }
  }

  const typeLabel =
    contractState.classification?.kind === "MorphoChainlinkOracleV2"
      ? "standard"
      : contractState.classification?.kind === "CustomAdapter"
        ? "custom"
        : "unknown";

  if (logPerOracle) {
    console.log(
      `  [${oracleAddress.slice(0, 10)}...] ${typeLabel}, proxy=${!!contractState.proxy}${isNew ? " (new)" : ""}`
    );
  }
}

async function rescanUpgradableOracles(
  chainId: ChainId,
  chainState: ChainState
): Promise<void> {
  const upgradable = Object.entries(chainState.contracts).filter(
    ([_, contract]) =>
      contract.proxy && needsImplRescan(contract.proxy, IMPL_RESCAN_INTERVAL_MS)
  );

  if (upgradable.length === 0) {
    console.log(`  No upgradable oracles need rescanning`);
    return;
  }

  console.log(`  Rescanning ${upgradable.length} upgradable oracles...`);

  for (const [address, contract] of upgradable) {
    const etherscanProxy = await detectProxyViaEtherscan(
      chainId,
      address as Address
    );
    if (etherscanProxy && contract.proxy) {
      if (etherscanProxy.implementation !== contract.proxy.implementation) {
        console.log(
          `  [${address.slice(0, 10)}...] Implementation changed: ${contract.proxy.implementation} -> ${etherscanProxy.implementation}`
        );
        contract.proxy.lastImplChangeAt = new Date().toISOString();
        contract.proxy.previousImplementations = [
          ...(contract.proxy.previousImplementations || []),
          {
            address: contract.proxy.implementation!,
            detectedAt: contract.proxy.lastImplScanAt,
          },
        ];
        contract.proxy.implementation = etherscanProxy.implementation;
      }
      contract.proxy.lastImplScanAt = new Date().toISOString();
    }
  }
}

function buildOutputFile(
  chainId: ChainId,
  chainState: ChainState,
  feedProviderMatcher: FeedProviderMatcher
): OutputFile {
  const oracles: OracleOutput[] = [];

  for (const [address, contract] of Object.entries(chainState.contracts)) {
    const oracle = buildOracleOutput(
      address as Address,
      chainId,
      contract,
      feedProviderMatcher
    );
    oracles.push(oracle);
  }

  oracles.sort((a, b) => a.address.localeCompare(b.address));

  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    chainId,
    oracles,
  };
}

function buildOracleOutput(
  address: Address,
  chainId: ChainId,
  contract: ContractState,
  feedProviderMatcher: FeedProviderMatcher
): OracleOutput {
  const classification = contract.classification;
  let type: "standard" | "custom" | "unknown" = "unknown";
  let verifiedByFactory = false;
  let data: OracleOutputData = {
    baseFeedOne: null,
    baseFeedTwo: null,
    quoteFeedOne: null,
    quoteFeedTwo: null,
  };

  if (classification?.kind === "MorphoChainlinkOracleV2") {
    type = "standard";
    verifiedByFactory = classification.verifiedByFactory;
    const feeds = classification.feeds;
    data = {
      baseFeedOne: feedProviderMatcher.enrichFeed(feeds.baseFeedOne, chainId),
      baseFeedTwo: feedProviderMatcher.enrichFeed(feeds.baseFeedTwo, chainId),
      quoteFeedOne: feedProviderMatcher.enrichFeed(feeds.quoteFeedOne, chainId),
      quoteFeedTwo: feedProviderMatcher.enrichFeed(feeds.quoteFeedTwo, chainId),
    };
  } else if (classification?.kind === "CustomAdapter") {
    type = "custom";
  }

  return {
    address,
    chainId,
    type,
    verifiedByFactory,
    lastUpdated: contract.lastSeenAt,
    isUpgradable: !!contract.proxy,
    proxy: {
      isProxy: !!contract.proxy,
      proxyType: contract.proxy?.proxyType,
      implementation: contract.proxy?.implementation || undefined,
      lastImplChangeAt: contract.proxy?.lastImplChangeAt,
    },
    data,
    lastScannedAt: contract.lastSeenAt,
  };
}

function buildMetadata(
  state: ScannerState,
  outputs: Map<ChainId, OutputFile>,
  feedProviderMatcher: FeedProviderMatcher
): MetadataFile {
  const chains: MetadataFile["chains"] = {} as MetadataFile["chains"];
  const stats = feedProviderMatcher.getStats();

  for (const [chainId, output] of outputs) {
    const oracles = output.oracles;
    chains[chainId] = {
      oracleCount: oracles.length,
      standardCount: oracles.filter((o) => o.type === "standard").length,
      customCount: oracles.filter((o) => o.type === "custom").length,
      unknownCount: oracles.filter((o) => o.type === "unknown").length,
      upgradableCount: oracles.filter((o) => o.proxy.isProxy).length,
    };
  }

  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    chains,
    providerSources: {
      chainlink: {
        updatedAt: new Date().toISOString(),
        feedCount: Object.values(stats).reduce(
          (sum, s) => sum + (s.Chainlink || 0),
          0
        ),
      },
      redstone: {
        updatedAt: new Date().toISOString(),
        feedCount: Object.values(stats).reduce(
          (sum, s) => sum + (s.Redstone || 0),
          0
        ),
      },
    },
  };
}
