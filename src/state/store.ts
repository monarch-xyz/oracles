import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GIST_ID, GITHUB_TOKEN } from "../config.js";
import type {
  Address,
  ChainId,
  ChainState,
  MetadataFile,
  OutputFile,
  ScannerState,
} from "../types.js";

const LOCAL_OUTPUT_DIR = process.env.LOCAL_OUTPUT_DIR || ".scanner";
const LOCAL_STATE_FILE = join(LOCAL_OUTPUT_DIR, "_state.json");

const DEFAULT_STATE: ScannerState = {
  version: 1,
  generatedAt: new Date().toISOString(),
  chains: {},
};

export async function loadState(): Promise<ScannerState> {
  if (!GIST_ID || !GITHUB_TOKEN) {
    const localState = await loadLocalState();
    return localState;
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
      files: Record<
        string,
        {
          content?: string;
          truncated?: boolean;
          raw_url?: string;
        }
      >;
    };
    const stateFile = gist.files["_state.json"];

    if (!stateFile) {
      console.log("[state] No state file in Gist");
      return DEFAULT_STATE;
    }

    const stateContent = await resolveStateFileContent(stateFile);
    if (!stateContent) {
      console.log("[state] State file is empty");
      return DEFAULT_STATE;
    }

    return JSON.parse(stateContent) as ScannerState;
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
    await saveToLocal(state, outputs, metadata);
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

async function loadLocalState(): Promise<ScannerState> {
  try {
    const content = await readFile(LOCAL_STATE_FILE, "utf8");
    console.log(`[state] Loaded local state from ${LOCAL_STATE_FILE}`);
    return JSON.parse(content) as ScannerState;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "ENOENT") {
      console.log(`[state] No Gist configured and no local state at ${LOCAL_STATE_FILE}`);
    } else {
      console.log(`[state] Error loading local state: ${error}`);
    }
    return DEFAULT_STATE;
  }
}

async function saveToLocal(
  state: ScannerState,
  outputs: Map<ChainId, OutputFile>,
  metadata: MetadataFile,
): Promise<void> {
  await mkdir(LOCAL_OUTPUT_DIR, { recursive: true });

  const writes: Array<Promise<void>> = [];
  writes.push(
    writeFile(join(LOCAL_OUTPUT_DIR, "_state.json"), JSON.stringify(state, bigintReplacer, 2)),
  );
  writes.push(writeFile(join(LOCAL_OUTPUT_DIR, "meta.json"), JSON.stringify(metadata, null, 2)));

  for (const [chainId, output] of outputs) {
    writes.push(
      writeFile(join(LOCAL_OUTPUT_DIR, `oracles.${chainId}.json`), JSON.stringify(output, null, 2)),
    );
  }

  await Promise.all(writes);
  console.log(`[state] Wrote local outputs to ${LOCAL_OUTPUT_DIR}/`);
}

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

async function resolveStateFileContent(stateFile: {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}): Promise<string | null> {
  // Gist API truncates inline `content` over ~1MB. Use raw_url for full file.
  if (stateFile.truncated && stateFile.raw_url) {
    const raw = await fetchRawStateContent(stateFile.raw_url);
    if (raw !== null) {
      return raw;
    }
    console.log("[state] Falling back to truncated inline state content");
  }

  if (stateFile.content) {
    return stateFile.content;
  }

  if (stateFile.raw_url) {
    return fetchRawStateContent(stateFile.raw_url);
  }

  return null;
}

async function fetchRawStateContent(rawUrl: string): Promise<string | null> {
  try {
    const rawResponse = await fetch(rawUrl, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!rawResponse.ok) {
      console.log(`[state] Failed to load raw state file: ${rawResponse.status}`);
      return null;
    }

    return await rawResponse.text();
  } catch (error) {
    console.log(`[state] Error loading raw state file: ${error}`);
    return null;
  }
}
