import { ACTIVE_CHAINS, IMPL_RESCAN_INTERVAL_MS } from "./config.js";
import { fetchOraclesFromMorphoApi } from "./sources/morphoApi.js";
import { fetchOracleFeeds } from "./sources/morphoFactory.js";
import { fetchFactoryVerifiedMap } from "./sources/factoryVerifier.js";
import { detectAndFetchV1Oracle } from "./sources/oracleV1Detector.js";
import { fetchChainlinkProvider } from "./sources/chainlink.js";
import { fetchRedstoneProvider } from "./sources/redstone.js";
import {
  fetchCompoundProvider,
  fetchLidoProvider,
  fetchOvalProvider,
  fetchPythProvider,
} from "./sources/hardcoded/index.js";
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
  CustomOracleOutputData,
  OracleOutput,
  OutputFile,
  ScannerState,
  StandardOracleOutputData,
  StandardOracleFeeds,
} from "./types.js";

export interface RunScannerOptions {
  forceRescan?: boolean;
}

export async function runScanner(options: RunScannerOptions = {}): Promise<void> {
  console.log("=== Oracle Scanner Starting ===");
  const startTime = Date.now();
  const logPerOracle = process.env.LOG_PER_ORACLE === "1";
  const forceRescan = options.forceRescan === true;
  if (forceRescan) {
    console.log("  [scanner] Force rescan enabled");
  }

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

    // Load dynamic providers (fetched from external registries)
    const [chainlinkProvider, redstoneProvider] = await Promise.all([
      fetchChainlinkProvider(chainId),
      fetchRedstoneProvider(chainId),
    ]);

    // Load hardcoded providers
    const compoundProvider = fetchCompoundProvider(chainId);
    const lidoProvider = fetchLidoProvider(chainId);
    const ovalProvider = fetchOvalProvider(chainId);
    const pythProvider = fetchPythProvider(chainId);

    // Add all providers to matcher
    feedProviderMatcher.addProvider(chainlinkProvider);
    feedProviderMatcher.addProvider(redstoneProvider);
    feedProviderMatcher.addProvider(compoundProvider);
    feedProviderMatcher.addProvider(lidoProvider);
    feedProviderMatcher.addProvider(ovalProvider);
    feedProviderMatcher.addProvider(pythProvider);

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
        logPerOracle,
        forceRescan
      );
    }

    // Rescan upgradable oracles (24h check)
    await rescanUpgradableOracles(chainId, chainState, forceRescan);

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
  logPerOracle: boolean,
  forceRescan: boolean
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

  if (forceRescan && !isNew) {
    contractState.classification = null;
    contractState.proxy = null;
  }

  // Determine if we need to reclassify
  const hasV1Classification = contractState.classification?.kind === "MorphoChainlinkOracleV1";
  const hasV2Classification = contractState.classification?.kind === "MorphoChainlinkOracleV2";
  const needsClassification = forceRescan || (!hasV1Classification && !hasV2Classification);

  if (needsClassification) {
    // V2: Verify via factory, then read feeds
    const isFactoryVerified = factoryVerifiedMap.get(oracleAddress) || false;
    if (isFactoryVerified) {
      const feeds = await fetchOracleFeeds(chainId, oracleAddress);
      if (feeds) {
        contractState.classification = {
          kind: "MorphoChainlinkOracleV2",
          verifiedByFactory: true,
          feeds,
        };
      }
    } else {
      // Try V1 bytecode detection first
      const v1Result = await detectAndFetchV1Oracle(chainId, oracleAddress);
      if (v1Result.isV1 && v1Result.feeds) {
        contractState.classification = {
          kind: "MorphoChainlinkOracleV1",
          feeds: v1Result.feeds,
        };
      } else {
        // Fallback: Try reading feeds directly (for non-standard bytecode like HyperEVM)
        const feeds = await fetchOracleFeeds(chainId, oracleAddress);
        if (feeds) {
          contractState.classification = {
            kind: "MorphoChainlinkOracleV2", // Treat as V2-compatible
            verifiedByFactory: false,
            feeds,
          };
        }
      }
    }
  }

  const isStandard =
    contractState.classification?.kind === "MorphoChainlinkOracleV2" ||
    contractState.classification?.kind === "MorphoChainlinkOracleV1";

  if (isStandard) {
    // Standard Morpho oracles are not proxies; skip proxy detection.
    contractState.proxy = null;
  } else {
    // Check proxy status (prefer Etherscan v2, fallback to EIP-1967)
    const etherscanProxy = await detectProxyViaEtherscan(
      chainId,
      oracleAddress
    );
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
      ? "standard-v2"
      : contractState.classification?.kind === "MorphoChainlinkOracleV1"
        ? "standard-v1"
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
  chainState: ChainState,
  forceRescan: boolean
): Promise<void> {
  const upgradable = Object.entries(chainState.contracts).filter(
    ([_, contract]) => {
      if (!contract.proxy) return false;
      return forceRescan
        ? true
        : needsImplRescan(contract.proxy, IMPL_RESCAN_INTERVAL_MS);
    }
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
  const base = {
    address,
    chainId,
    verifiedByFactory: false,
    lastUpdated: contract.lastSeenAt,
    isUpgradable: !!contract.proxy,
    proxy: {
      isProxy: !!contract.proxy,
      proxyType: contract.proxy?.proxyType,
      implementation: contract.proxy?.implementation || undefined,
      lastImplChangeAt: contract.proxy?.lastImplChangeAt,
    },
    lastScannedAt: contract.lastSeenAt,
  };

  if (classification?.kind === "MorphoChainlinkOracleV2") {
    const feeds = classification.feeds;
    return {
      ...base,
      type: "standard",
      verifiedByFactory: classification.verifiedByFactory,
      data: {
        baseFeedOne: feedProviderMatcher.enrichFeed(feeds.baseFeedOne, chainId),
        baseFeedTwo: feedProviderMatcher.enrichFeed(feeds.baseFeedTwo, chainId),
        quoteFeedOne: feedProviderMatcher.enrichFeed(feeds.quoteFeedOne, chainId),
        quoteFeedTwo: feedProviderMatcher.enrichFeed(feeds.quoteFeedTwo, chainId),
      },
    };
  }

  if (classification?.kind === "MorphoChainlinkOracleV1") {
    const feeds = classification.feeds;
    return {
      ...base,
      type: "standard",
      verifiedByFactory: false, // V1 has no factory verification
      data: {
        baseFeedOne: feedProviderMatcher.enrichFeed(feeds.baseFeedOne, chainId),
        baseFeedTwo: feedProviderMatcher.enrichFeed(feeds.baseFeedTwo, chainId),
        quoteFeedOne: feedProviderMatcher.enrichFeed(feeds.quoteFeedOne, chainId),
        quoteFeedTwo: feedProviderMatcher.enrichFeed(feeds.quoteFeedTwo, chainId),
      },
    };
  }

  if (classification?.kind === "CustomAdapter") {
    const data: CustomOracleOutputData = {
      adapterId: classification.adapterId,
      adapterName: classification.adapterName,
    };
    const feeds = enrichPartialFeeds(
      classification.feeds,
      chainId,
      feedProviderMatcher
    );
    if (feeds) {
      data.feeds = feeds;
    }
    if (classification.metadata && Object.keys(classification.metadata).length > 0) {
      data.metadata = classification.metadata;
    }
    return {
      ...base,
      type: "custom",
      data,
    };
  }

  const reason =
    classification?.kind === "Unknown" ? classification.reason : "Unclassified";
  return {
    ...base,
    type: "unknown",
    data: { reason },
  };
}

function enrichPartialFeeds(
  feeds: Partial<StandardOracleFeeds> | undefined,
  chainId: ChainId,
  feedProviderMatcher: FeedProviderMatcher
): Partial<StandardOracleOutputData> | undefined {
  if (!feeds) return undefined;

  const out: Partial<StandardOracleOutputData> = {};
  if (feeds.baseFeedOne) {
    out.baseFeedOne = feedProviderMatcher.enrichFeed(feeds.baseFeedOne, chainId);
  }
  if (feeds.baseFeedTwo) {
    out.baseFeedTwo = feedProviderMatcher.enrichFeed(feeds.baseFeedTwo, chainId);
  }
  if (feeds.quoteFeedOne) {
    out.quoteFeedOne = feedProviderMatcher.enrichFeed(
      feeds.quoteFeedOne,
      chainId
    );
  }
  if (feeds.quoteFeedTwo) {
    out.quoteFeedTwo = feedProviderMatcher.enrichFeed(
      feeds.quoteFeedTwo,
      chainId
    );
  }

  return Object.keys(out).length > 0 ? out : undefined;
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
