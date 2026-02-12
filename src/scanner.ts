import { matchCustomAdapter } from "./analyzers/customAdapters.js";
import { FeedProviderMatcher } from "./analyzers/feedProviderMatcher.js";
import {
  detectProxy,
  detectProxyViaEtherscan,
  needsImplRescan,
} from "./analyzers/proxyDetector.js";
import { ACTIVE_CHAINS, IMPL_RESCAN_INTERVAL_MS } from "./config.js";
import { fetchChainlinkProvider } from "./sources/chainlink.js";
import { fetchFactoryVerifiedMap } from "./sources/factoryVerifier.js";
import {
  fetchCompoundProvider,
  fetchLidoProvider,
  fetchOvalProvider,
  fetchPendleProvider,
  fetchPythProvider,
} from "./sources/hardcoded/index.js";
import { fetchOraclesFromMorphoApi } from "./sources/morphoApi.js";
import { fetchMetaOracleDeviationTimelockConfigs } from "./sources/metaOracleDeviationTimelock.js";
import { fetchMetaOraclesFromLogs } from "./sources/metaOracleContractLogs.js";
import { validateOraclesByBytecodeOneByOne } from "./sources/oracleBytecodeValidation.js";
import { fetchV1OracleFeedsBatch, fetchV2OracleFeedsBatch } from "./sources/oracleFeedFetcher.js";
import { fetchRedstoneProvider } from "./sources/redstone.js";
import { enrichVaults, lookupVault } from "./sources/vaultEnricher.js";
import { getChainState, loadState, saveToGist } from "./state/store.js";
import type {
  Address,
  ChainId,
  ChainState,
  ContractState,
  CustomOracleOutputData,
  EnrichedVault,
  MetaOracleDeviationTimelockConfig,
  MetadataFile,
  MetaOracleSources,
  OracleClassification,
  OracleOutput,
  OutputFile,
  ProxyInfo,
  ScannerState,
  StandardOracleFeeds,
  StandardOracleOutputData,
} from "./types.js";

interface ProcessOracleResult {
  isStandard: boolean;
  didProxyScan: boolean;
}

function asProxyInfo(proxy: ContractState["proxy"]): ProxyInfo | null {
  if (!proxy || !proxy.isProxy) {
    return null;
  }
  return proxy;
}

export interface RunScannerOptions {
  forceRescan?: boolean;
}

interface MetaOracleBootstrapResult {
  addresses: Address[];
  configs: Map<Address, MetaOracleDeviationTimelockConfig>;
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
    oraclesByChain.get(oracle.chainId)?.push(oracle.address);
  }

  // 3. Process each chain
  for (const chainId of ACTIVE_CHAINS) {
    console.log(`\n--- Processing chain ${chainId} ---`);

    // Load dynamic providers (fetched from external registries)
    const [chainlinkProvider, redstoneProvider] = await Promise.all([
      fetchChainlinkProvider(chainId),
      fetchRedstoneProvider(chainId),
    ]);

    const chainState = getChainState(state, chainId);
    const baseOracleAddresses = oraclesByChain.get(chainId) || [];
    const metaBootstrap = await bootstrapMetaOracles(chainId, baseOracleAddresses);
    const oracleAddresses = metaBootstrap.addresses;
    const metaConfigs = metaBootstrap.configs;

    // Load hardcoded providers
    const compoundProvider = fetchCompoundProvider(chainId);
    const lidoProvider = fetchLidoProvider(chainId);
    const ovalProvider = fetchOvalProvider(chainId);
    const pythProvider = fetchPythProvider(chainId);

    const pendleFeedAddresses = collectStandardOracleFeedAddresses(
      oracleAddresses,
      chainState,
      forceRescan,
    );
    const pendleProvider = await fetchPendleProvider(chainId, pendleFeedAddresses);

    // Add all providers to matcher
    feedProviderMatcher.addProvider(chainlinkProvider);
    feedProviderMatcher.addProvider(redstoneProvider);
    feedProviderMatcher.addProvider(compoundProvider);
    feedProviderMatcher.addProvider(lidoProvider);
    feedProviderMatcher.addProvider(ovalProvider);
    feedProviderMatcher.addProvider(pythProvider);
    feedProviderMatcher.addProvider(pendleProvider);
    const now = new Date().toISOString();
    const classificationTargets: Address[] = [];
    const newAddresses = new Set<Address>();
    let cachedClassificationCount = 0;

    console.log(`  Found ${baseOracleAddresses.length} oracles from Morpho API`);
    if (oracleAddresses.length !== baseOracleAddresses.length) {
      console.log(
        `  [meta] expanded oracle list to ${oracleAddresses.length} after including meta oracles`,
      );
    }

    for (const oracleAddress of oracleAddresses) {
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
        newAddresses.add(oracleAddress);
      }

      contractState.lastSeenAt = now;

      if (forceRescan && !isNew) {
        contractState.classification = null;
        contractState.proxy = null;
      }

      // Classification (factory + bytecode) is deterministic for immutable bytecode.
      // Re-run only for new/unclassified contracts, or on explicit force rescan.
      // Meta oracles must be re-classified every run to keep their config fresh.
      const isMetaAddress = metaConfigs.has(oracleAddress);
      const needsClassification =
        forceRescan || !contractState.classification || isMetaAddress;

      if (needsClassification) {
        classificationTargets.push(oracleAddress);
      } else {
        cachedClassificationCount += 1;
      }
    }

    console.log(
      `  [classification] targets=${classificationTargets.length}, cached=${cachedClassificationCount}`,
    );

    const cachedClassifications = new Map<Address, OracleClassification>();
    for (const [address, contract] of Object.entries(chainState.contracts)) {
      if (contract.classification) {
        cachedClassifications.set(address as Address, contract.classification);
      }
    }

    const resolvedClassifications = await resolveStandardClassifications(
      chainId,
      classificationTargets,
      metaConfigs,
      cachedClassifications,
    );
    const classificationTargetSet = new Set(classificationTargets);
    let standardSkippedProxyScanCount = 0;
    let cachedProxyScanCount = 0;
    let freshProxyScanCount = 0;

    // Process each oracle
    for (const oracleAddress of oracleAddresses) {
      const result = await processOracle(
        chainId,
        oracleAddress,
        chainState,
        feedProviderMatcher,
        resolvedClassifications,
        classificationTargetSet,
        logPerOracle,
        newAddresses.has(oracleAddress),
      );

      if (result.isStandard) {
        standardSkippedProxyScanCount += 1;
      } else if (result.didProxyScan) {
        freshProxyScanCount += 1;
      } else {
        cachedProxyScanCount += 1;
      }
    }

    console.log(
      `  [proxy] fresh-scans=${freshProxyScanCount}, cached=${cachedProxyScanCount}, standard-skipped=${standardSkippedProxyScanCount}`,
    );

    // Rescan upgradable oracles (24h check)
    await rescanUpgradableOracles(chainId, chainState, forceRescan);

    // Enrich vault metadata for all standard oracles
    const allFeeds = collectAllStandardFeeds(chainState);
    const vaultMap = await enrichVaults(chainId, allFeeds);
    if (vaultMap.size > 0) {
      console.log(`  [vault] Enriched ${vaultMap.size} vaults`);
    }

    const output = buildOutputFile(chainId, chainState, feedProviderMatcher, vaultMap);
    outputs.set(chainId, output);
  }

  const metadata = buildMetadata(state, outputs, feedProviderMatcher);
  state.generatedAt = new Date().toISOString();

  await saveToGist(state, outputs, metadata);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Scanner completed in ${elapsed}s ===`);
}

function collectStandardOracleFeedAddresses(
  oracleAddresses: Address[],
  chainState: ChainState,
  forceRescan: boolean,
): Address[] {
  const feedAddresses: Address[] = [];

  for (const oracleAddress of oracleAddresses) {
    const contract = chainState.contracts[oracleAddress];
    const classification = contract?.classification;
    if (!classification) continue;

    if (classification.kind === "MorphoChainlinkOracleV1") {
      const feeds = classification.feeds;
      if (feeds.baseFeedOne) feedAddresses.push(feeds.baseFeedOne);
      if (feeds.baseFeedTwo) feedAddresses.push(feeds.baseFeedTwo);
      if (feeds.quoteFeedOne) feedAddresses.push(feeds.quoteFeedOne);
      if (feeds.quoteFeedTwo) feedAddresses.push(feeds.quoteFeedTwo);
      continue;
    }

    if (classification.kind === "MorphoChainlinkOracleV2") {
      const feeds = classification.feeds;
      if (feeds.baseFeedOne) feedAddresses.push(feeds.baseFeedOne);
      if (feeds.baseFeedTwo) feedAddresses.push(feeds.baseFeedTwo);
      if (feeds.quoteFeedOne) feedAddresses.push(feeds.quoteFeedOne);
      if (feeds.quoteFeedTwo) feedAddresses.push(feeds.quoteFeedTwo);
      continue;
    }

    if (classification.kind === "MetaOracleDeviationTimelock") {
      const metaSources = classification.oracleSources;
      if (metaSources?.primary) {
        const feeds = metaSources.primary;
        if (feeds.baseFeedOne) feedAddresses.push(feeds.baseFeedOne);
        if (feeds.baseFeedTwo) feedAddresses.push(feeds.baseFeedTwo);
        if (feeds.quoteFeedOne) feedAddresses.push(feeds.quoteFeedOne);
        if (feeds.quoteFeedTwo) feedAddresses.push(feeds.quoteFeedTwo);
      }
      if (metaSources?.backup) {
        const feeds = metaSources.backup;
        if (feeds.baseFeedOne) feedAddresses.push(feeds.baseFeedOne);
        if (feeds.baseFeedTwo) feedAddresses.push(feeds.baseFeedTwo);
        if (feeds.quoteFeedOne) feedAddresses.push(feeds.quoteFeedOne);
        if (feeds.quoteFeedTwo) feedAddresses.push(feeds.quoteFeedTwo);
      }
    }
  }

  return feedAddresses;
}

/**
 * Collect all StandardOracleFeeds from the chain state for vault enrichment.
 */
function collectAllStandardFeeds(chainState: ChainState): StandardOracleFeeds[] {
  const feeds: StandardOracleFeeds[] = [];

  for (const contract of Object.values(chainState.contracts)) {
    const classification = contract?.classification;
    if (!classification) continue;

    if (
      classification.kind === "MorphoChainlinkOracleV1" ||
      classification.kind === "MorphoChainlinkOracleV2"
    ) {
      feeds.push(classification.feeds);
    }

    if (classification.kind === "MetaOracleDeviationTimelock") {
      const metaSources = classification.oracleSources;
      if (metaSources?.primary) feeds.push(metaSources.primary);
      if (metaSources?.backup) feeds.push(metaSources.backup);
    }
  }

  return feeds;
}

async function bootstrapMetaOracles(
  chainId: ChainId,
  oracleAddresses: Address[],
): Promise<MetaOracleBootstrapResult> {
  const configsFromLogs = await fetchMetaOraclesFromLogs(chainId);
  if (configsFromLogs.size === 0) {
    return { addresses: oracleAddresses, configs: new Map() };
  }

  const metaAddresses = Array.from(configsFromLogs.keys());
  const expanded = new Set<Address>(oracleAddresses);
  for (const metaAddress of metaAddresses) {
    expanded.add(metaAddress);
  }
  const mergedConfigs = new Map<Address, MetaOracleDeviationTimelockConfig>(configsFromLogs);

  for (const config of configsFromLogs.values()) {
    if (config.primaryOracle) expanded.add(config.primaryOracle);
    if (config.backupOracle) expanded.add(config.backupOracle);
  }

  const onchainConfigs = await fetchMetaOracleDeviationTimelockConfigs(chainId, metaAddresses);
  for (const [address, config] of onchainConfigs.entries()) {
    const existing = mergedConfigs.get(address);
    if (!existing) {
      mergedConfigs.set(address, config);
      continue;
    }
    mergedConfigs.set(address, {
      ...existing,
      currentOracle: config.currentOracle,
    });
  }

  return {
    addresses: Array.from(expanded),
    configs: mergedConfigs,
  };
}

async function processOracle(
  chainId: ChainId,
  oracleAddress: Address,
  chainState: ChainState,
  feedProviderMatcher: FeedProviderMatcher,
  resolvedClassifications: Map<Address, OracleClassification>,
  classificationTargets: Set<Address>,
  logPerOracle: boolean,
  isNew: boolean,
): Promise<ProcessOracleResult> {
  const contractState = chainState.contracts[oracleAddress];
  const now = contractState.lastSeenAt;
  let didProxyScan = false;

  if (classificationTargets.has(oracleAddress)) {
    contractState.classification = resolvedClassifications.get(oracleAddress) ?? null;
  }

  const isStandard =
    contractState.classification?.kind === "MorphoChainlinkOracleV2" ||
    contractState.classification?.kind === "MorphoChainlinkOracleV1";

  if (contractState.classification?.kind === "MetaOracleDeviationTimelock") {
    // Meta oracles are own contracts; still scan proxy status to detect upgrades.
    if (!contractState.proxy) {
      didProxyScan = true;
      contractState.proxy = await scanProxyStatus(chainId, oracleAddress, now);
    }
  } else if (isStandard) {
    // Standard Morpho oracles are not proxies; skip proxy detection.
    contractState.proxy = null;
  } else {
    // Only scan once for non-standard contracts. Later runs use cached proxy state.
    if (!contractState.proxy) {
      didProxyScan = true;
      contractState.proxy = await scanProxyStatus(chainId, oracleAddress, now);
    }
  }

  // Standard v1/v2 classification is set above. Everything else gets a cheap adapter check
  // which we intentionally re-run each scan (patterns can change between deployments).
  if (!isStandard && contractState.classification?.kind !== "MetaOracleDeviationTimelock") {
    const proxyInfo = asProxyInfo(contractState.proxy);
    const impl = proxyInfo?.implementation ?? null;
    const customMatch = matchCustomAdapter(oracleAddress, impl, chainId);
    if (customMatch) {
      contractState.classification = customMatch;
    } else if (!contractState.classification || contractState.classification.kind !== "Unknown") {
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
        : contractState.classification?.kind === "MetaOracleDeviationTimelock"
          ? "meta"
          : contractState.classification?.kind === "CustomAdapter"
            ? "custom"
            : "unknown";

  if (logPerOracle) {
    console.log(
      `  [${oracleAddress.slice(0, 10)}...] ${typeLabel}, proxy=${contractState.proxy?.isProxy === true}${isNew ? " (new)" : ""}`,
    );
  }

  return { isStandard, didProxyScan };
}

async function scanProxyStatus(
  chainId: ChainId,
  oracleAddress: Address,
  now: string,
): Promise<ContractState["proxy"]> {
  // Prefer Etherscan v2 because it is cheaper/faster than multiple storage reads.
  const etherscanProxy = await detectProxyViaEtherscan(chainId, oracleAddress);
  if (etherscanProxy?.isProxy) {
    return {
      isProxy: true,
      proxyType: "EIP1967",
      implementation: etherscanProxy.implementation,
      lastImplScanAt: now,
    };
  }

  // Fallback to onchain EIP-1967 slot checks.
  const proxyInfo = await detectProxy(chainId, oracleAddress);
  if (proxyInfo) {
    return proxyInfo;
  }

  return {
    isProxy: false,
    lastProxyScanAt: now,
  };
}

async function resolveStandardClassifications(
  chainId: ChainId,
  classificationTargets: Address[],
  metaConfigs: Map<Address, MetaOracleDeviationTimelockConfig>,
  cachedClassifications: Map<Address, OracleClassification>,
): Promise<Map<Address, OracleClassification>> {
  const resolved = new Map<Address, OracleClassification>();

  if (classificationTargets.length === 0) {
    return resolved;
  }

  const metaTargets = classificationTargets.filter((address) => metaConfigs.has(address));
  const remainingTargets = classificationTargets.filter((address) => !metaConfigs.has(address));
  if (remainingTargets.length === 0 && metaTargets.length === 0) {
    return resolved;
  }

  // Stage 1: Validate V2 by factory (batch).
  const factoryVerifiedMap = await fetchFactoryVerifiedMap(chainId, remainingTargets);
  const factoryV2Addresses = remainingTargets.filter((address) =>
    factoryVerifiedMap.get(address),
  );
  const nonFactoryAddresses = remainingTargets.filter(
    (address) => !factoryVerifiedMap.get(address),
  );
  console.log(
    `  [classification] factory-verified-v2=${factoryV2Addresses.length}, non-factory=${nonFactoryAddresses.length}, meta=${metaTargets.length}`,
  );

  // Stage 2: Fetch V2 feeds for factory-verified addresses (batch).
  const factoryV2Feeds = await fetchV2OracleFeedsBatch(chainId, factoryV2Addresses);
  for (const address of factoryV2Addresses) {
    const feeds = factoryV2Feeds.get(address);
    if (!feeds) continue;
    resolved.set(address, {
      kind: "MorphoChainlinkOracleV2",
      verifiedByFactory: true,
      verificationMethod: "factory",
      feeds,
    });
  }
  console.log(
    `  [classification] factory-v2-with-feeds=${factoryV2Feeds.size} / ${factoryV2Addresses.length}`,
  );

  // Stage 3: Validate by bytecode (1 by 1).
  const bytecodeResults = await validateOraclesByBytecodeOneByOne(chainId, nonFactoryAddresses);
  const v1BytecodeAddresses = bytecodeResults
    .filter((result) => result.kind === "v1")
    .map((result) => result.address);
  const v2BytecodeAddresses = bytecodeResults
    .filter((result) => result.kind === "v2")
    .map((result) => result.address);
  console.log(
    `  [classification] bytecode-v1=${v1BytecodeAddresses.length}, bytecode-v2=${v2BytecodeAddresses.length}`,
  );

  // Stage 4: Fetch info grouped by oracle type (batch).
  const [v1FeedsMap, v2FeedsMap] = await Promise.all([
    fetchV1OracleFeedsBatch(chainId, v1BytecodeAddresses),
    fetchV2OracleFeedsBatch(chainId, v2BytecodeAddresses),
  ]);

  for (const address of v1BytecodeAddresses) {
    const feeds = v1FeedsMap.get(address);
    if (!feeds) continue;
    resolved.set(address, {
      kind: "MorphoChainlinkOracleV1",
      verificationMethod: "bytecode",
      feeds,
    });
  }

  for (const address of v2BytecodeAddresses) {
    const feeds = v2FeedsMap.get(address);
    if (!feeds) continue;
    resolved.set(address, {
      kind: "MorphoChainlinkOracleV2",
      verifiedByFactory: false,
      verificationMethod: "bytecode",
      feeds,
    });
  }

  console.log(
    `  [classification] bytecode-v1-with-feeds=${v1FeedsMap.size}, bytecode-v2-with-feeds=${v2FeedsMap.size}`,
  );

  for (const address of metaTargets) {
    const config = metaConfigs.get(address);
    if (!config) continue;
    resolved.set(address, {
      kind: "MetaOracleDeviationTimelock",
      verificationMethod: "factory",
      config,
      oracleSources: resolveMetaSourcesFromResolvedMap(resolved, cachedClassifications, config),
    });
  }

  return resolved;
}

function resolveMetaSourcesFromResolvedMap(
  resolved: Map<Address, OracleClassification>,
  cached: Map<Address, OracleClassification>,
  config: MetaOracleDeviationTimelockConfig,
): MetaOracleSources {
  const primary = config.primaryOracle
    ? resolved.get(config.primaryOracle) ?? cached.get(config.primaryOracle)
    : undefined;
  const backup = config.backupOracle
    ? resolved.get(config.backupOracle) ?? cached.get(config.backupOracle)
    : undefined;

  return {
    primary: extractStandardFeeds(primary),
    backup: extractStandardFeeds(backup),
  };
}

function extractStandardFeeds(
  classification: OracleClassification | undefined,
): StandardOracleFeeds | null {
  if (!classification) return null;
  if (classification.kind === "MorphoChainlinkOracleV1") {
    return classification.feeds;
  }
  if (classification.kind === "MorphoChainlinkOracleV2") {
    return classification.feeds;
  }
  return null;
}

async function rescanUpgradableOracles(
  chainId: ChainId,
  chainState: ChainState,
  forceRescan: boolean,
): Promise<void> {
  const upgradable = Object.entries(chainState.contracts).filter(([_, contract]) => {
    const proxyInfo = asProxyInfo(contract.proxy);
    if (!proxyInfo) return false;
    return forceRescan ? true : needsImplRescan(proxyInfo, IMPL_RESCAN_INTERVAL_MS);
  });

  if (upgradable.length === 0) {
    console.log("  No upgradable oracles need rescanning");
    return;
  }

  console.log(`  Rescanning ${upgradable.length} upgradable oracles...`);

  for (const [address, contract] of upgradable) {
    const proxyInfo = asProxyInfo(contract.proxy);
    if (!proxyInfo) continue;

    const etherscanProxy = await detectProxyViaEtherscan(chainId, address as Address);
    if (etherscanProxy?.isProxy) {
      if (etherscanProxy.implementation !== proxyInfo.implementation) {
        console.log(
          `  [${address.slice(0, 10)}...] Implementation changed: ${proxyInfo.implementation} -> ${etherscanProxy.implementation}`,
        );
        proxyInfo.lastImplChangeAt = new Date().toISOString();
        const previousImplementation = proxyInfo.implementation;
        if (previousImplementation) {
          proxyInfo.previousImplementations = [
            ...(proxyInfo.previousImplementations || []),
            {
              address: previousImplementation,
              detectedAt: proxyInfo.lastImplScanAt,
            },
          ];
        }
        proxyInfo.implementation = etherscanProxy.implementation;
        const customMatch = matchCustomAdapter(
          address as Address,
          etherscanProxy.implementation,
          chainId,
        );
        contract.classification =
          customMatch ??
          ({
            kind: "Unknown",
            reason: "No standard feeds, no custom adapter match",
          } as const);
      }
      proxyInfo.lastImplScanAt = new Date().toISOString();
      continue;
    }

    // Etherscan might not support a chain or could be down; fallback to onchain detection.
    const onchainProxy = await detectProxy(chainId, address as Address);
    if (!onchainProxy) {
      continue;
    }
    if (!onchainProxy.isProxy) {
      continue;
    }

    if (onchainProxy.implementation !== proxyInfo.implementation) {
      console.log(
        `  [${address.slice(0, 10)}...] Implementation changed (onchain): ${proxyInfo.implementation} -> ${onchainProxy.implementation}`,
      );
      proxyInfo.lastImplChangeAt = new Date().toISOString();
      const previousImplementation = proxyInfo.implementation;
      if (previousImplementation) {
        proxyInfo.previousImplementations = [
          ...(proxyInfo.previousImplementations || []),
          {
            address: previousImplementation,
            detectedAt: proxyInfo.lastImplScanAt,
          },
        ];
      }
      proxyInfo.implementation = onchainProxy.implementation;

      const customMatch = matchCustomAdapter(
        address as Address,
        onchainProxy.implementation,
        chainId,
      );
      contract.classification =
        customMatch ??
        ({
          kind: "Unknown",
          reason: "No standard feeds, no custom adapter match",
        } as const);
    }

    proxyInfo.proxyType = onchainProxy.proxyType;
    proxyInfo.beacon = onchainProxy.beacon;
    proxyInfo.admin = onchainProxy.admin;
    proxyInfo.lastImplScanAt = new Date().toISOString();
  }
}

function buildOutputFile(
  chainId: ChainId,
  chainState: ChainState,
  feedProviderMatcher: FeedProviderMatcher,
  vaultMap: Map<Address, EnrichedVault>,
): OutputFile {
  const oracles: OracleOutput[] = [];

  for (const [address, contract] of Object.entries(chainState.contracts)) {
    const oracle = buildOracleOutput(address as Address, chainId, contract, feedProviderMatcher, vaultMap);
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
  feedProviderMatcher: FeedProviderMatcher,
  vaultMap: Map<Address, EnrichedVault>,
): OracleOutput {
  const classification = contract.classification;
  const proxyInfo = asProxyInfo(contract.proxy);
  const isProxy = proxyInfo !== null;

  const base = {
    address,
    chainId,
    verifiedByFactory: false,
    lastUpdated: contract.lastSeenAt,
    isUpgradable: isProxy,
    proxy: {
      isProxy,
      proxyType: proxyInfo?.proxyType,
      implementation: proxyInfo?.implementation ?? undefined,
      lastImplChangeAt: proxyInfo?.lastImplChangeAt,
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
        baseVault: lookupVault(vaultMap, feeds.baseVault),
        quoteVault: lookupVault(vaultMap, feeds.quoteVault),
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
        baseVault: lookupVault(vaultMap, feeds.baseVault),
        quoteVault: lookupVault(vaultMap, feeds.quoteVault),
      },
    };
  }

  if (classification?.kind === "MetaOracleDeviationTimelock") {
    const config = classification.config;
    const sources = classification.oracleSources;
    const enrichedSources = sources
      ? {
          primary: sources.primary
            ? enrichStandardFeeds(sources.primary, chainId, feedProviderMatcher, vaultMap)
            : null,
          backup: sources.backup
            ? enrichStandardFeeds(sources.backup, chainId, feedProviderMatcher, vaultMap)
            : null,
        }
      : undefined;

    return {
      ...base,
      type: "meta",
      verifiedByFactory: true,
      data: {
        primaryOracle: config.primaryOracle,
        backupOracle: config.backupOracle,
        currentOracle: config.currentOracle,
        deviationThreshold: config.deviationThreshold,
        challengeTimelockDuration: config.challengeTimelockDuration,
        healingTimelockDuration: config.healingTimelockDuration,
        oracleSources: enrichedSources,
      },
    };
  }

  if (classification?.kind === "CustomAdapter") {
    const data: CustomOracleOutputData = {
      adapterId: classification.adapterId,
      adapterName: classification.adapterName,
    };
    const feeds = enrichPartialFeeds(classification.feeds, chainId, feedProviderMatcher);
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

  const reason = classification?.kind === "Unknown" ? classification.reason : "Unclassified";
  return {
    ...base,
    type: "unknown",
    data: { reason },
  };
}

function enrichStandardFeeds(
  feeds: StandardOracleFeeds,
  chainId: ChainId,
  feedProviderMatcher: FeedProviderMatcher,
  vaultMap: Map<Address, EnrichedVault>,
): StandardOracleOutputData {
  return {
    baseFeedOne: feedProviderMatcher.enrichFeed(feeds.baseFeedOne, chainId),
    baseFeedTwo: feedProviderMatcher.enrichFeed(feeds.baseFeedTwo, chainId),
    quoteFeedOne: feedProviderMatcher.enrichFeed(feeds.quoteFeedOne, chainId),
    quoteFeedTwo: feedProviderMatcher.enrichFeed(feeds.quoteFeedTwo, chainId),
    baseVault: lookupVault(vaultMap, feeds.baseVault),
    quoteVault: lookupVault(vaultMap, feeds.quoteVault),
  };
}

function enrichPartialFeeds(
  feeds: Partial<StandardOracleFeeds> | undefined,
  chainId: ChainId,
  feedProviderMatcher: FeedProviderMatcher,
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
    out.quoteFeedOne = feedProviderMatcher.enrichFeed(feeds.quoteFeedOne, chainId);
  }
  if (feeds.quoteFeedTwo) {
    out.quoteFeedTwo = feedProviderMatcher.enrichFeed(feeds.quoteFeedTwo, chainId);
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function buildMetadata(
  state: ScannerState,
  outputs: Map<ChainId, OutputFile>,
  feedProviderMatcher: FeedProviderMatcher,
): MetadataFile {
  const chains: MetadataFile["chains"] = {} as MetadataFile["chains"];
  const stats = feedProviderMatcher.getStats();

  for (const [chainId, output] of outputs) {
    const oracles = output.oracles;
    chains[chainId] = {
      oracleCount: oracles.length,
      standardCount: oracles.filter((o) => o.type === "standard").length,
      metaCount: oracles.filter((o) => o.type === "meta").length,
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
        feedCount: Object.values(stats).reduce((sum, s) => sum + (s.Chainlink || 0), 0),
      },
      redstone: {
        updatedAt: new Date().toISOString(),
        feedCount: Object.values(stats).reduce((sum, s) => sum + (s.Redstone || 0), 0),
      },
    },
  };
}
