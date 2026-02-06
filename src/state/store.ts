import { GIST_ID, GITHUB_TOKEN } from "../config.js";
import type {
  Address,
  ChainId,
  ChainState,
  MetadataFile,
  OutputFile,
  ScannerState,
} from "../types.js";

const DEFAULT_STATE: ScannerState = {
  version: 1,
  generatedAt: new Date().toISOString(),
  chains: {},
};

export async function loadState(): Promise<ScannerState> {
  if (!GIST_ID || !GITHUB_TOKEN) {
    console.log("[state] No Gist configured, using empty state");
    return DEFAULT_STATE;
  }

  try {
    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      console.log(`[state] Failed to load Gist: ${response.status}`);
      return DEFAULT_STATE;
    }

    const gist = (await response.json()) as {
      files: Record<string, { content: string }>;
    };
    const stateFile = gist.files["_state.json"];

    if (!stateFile?.content) {
      console.log("[state] No state file in Gist");
      return DEFAULT_STATE;
    }

    return JSON.parse(stateFile.content) as ScannerState;
  } catch (error) {
    console.log(`[state] Error loading state: ${error}`);
    return DEFAULT_STATE;
  }
}

export async function saveToGist(
  state: ScannerState,
  outputs: Map<ChainId, OutputFile>,
  metadata: MetadataFile,
): Promise<void> {
  if (!GIST_ID || !GITHUB_TOKEN) {
    console.log("[state] No Gist configured, saving locally");
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }

  const files: Record<string, { content: string }> = {
    "_state.json": { content: JSON.stringify(state, bigintReplacer, 2) },
    "meta.json": { content: JSON.stringify(metadata, null, 2) },
  };

  for (const [chainId, output] of outputs) {
    files[`oracles.${chainId}.json`] = {
      content: JSON.stringify(output, null, 2),
    };
  }

  try {
    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ files }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update Gist: ${response.status}`);
    }

    console.log(`[state] Successfully updated Gist ${GIST_ID}`);
  } catch (error) {
    console.error(`[state] Error saving to Gist: ${error}`);
    throw error;
  }
}

export function getChainState(state: ScannerState, chainId: ChainId): ChainState {
  if (!state.chains[chainId]) {
    state.chains[chainId] = {
      cursor: { lastProcessedBlock: 0 },
      contracts: {},
    };
  }
  return state.chains[chainId];
}

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}
