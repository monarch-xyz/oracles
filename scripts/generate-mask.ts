import fs from "node:fs";
import path from "node:path";

import { type HexString, asHexString } from "../src/bytecodes/hex.js";
import { applyIgnoredByteIndices } from "../src/bytecodes/mask.js";
import { CHAIN_CONFIGS } from "../src/config.js";
import { fetchOracleBytecode } from "../src/sources/oracleBytecodeValidation.js";
import type { Address, ChainId } from "../src/types.js";

type InputKind = "address" | "bytecode";

interface ParsedInput {
  kind: InputKind;
  value: Address | HexString;
  source?: string;
}

function usage(): void {
  console.log(
    [
      "Usage:",
      "  pnpm dlx tsx scripts/generate-mask.ts <bytecode|address|file> <bytecode|address|file> [--chain <id>] [--const PREFIX]",
      "",
      "Examples:",
      "  pnpm dlx tsx scripts/generate-mask.ts 0x... 0x... --const MORPHO_CHAINLINK_ORACLE_V1",
      "  pnpm dlx tsx scripts/generate-mask.ts 0xabc... 0xdef... --chain 1 --const PENDLE_LINEAR_DISCOUNT_FEED",
      "  pnpm dlx tsx scripts/generate-mask.ts ./bytecode-a.txt ./bytecode-b.txt --const MORPHO_CHAINLINK_ORACLE_V2",
    ].join("\n"),
  );
}

function isHex(value: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(value);
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function parseInput(input: string): ParsedInput {
  const resolved = path.resolve(process.cwd(), input);
  if (fs.existsSync(resolved)) {
    const contents = fs.readFileSync(resolved, "utf8").trim();
    if (!contents) {
      throw new Error(`Input file is empty: ${input}`);
    }
    return parseInput(contents);
  }

  if (isAddress(input)) {
    return { kind: "address", value: input.toLowerCase() as Address, source: input };
  }

  if (isHex(input)) {
    return { kind: "bytecode", value: asHexString(input.toLowerCase()), source: input };
  }

  throw new Error(`Unrecognized input: ${input}`);
}

function toChainId(value: string | null): ChainId {
  if (!value) {
    throw new Error("Missing --chain <id> when using address inputs.");
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid chain id: ${value}`);
  }
  if (!(parsed in CHAIN_CONFIGS)) {
    throw new Error(`Unsupported chain id: ${value}`);
  }
  return parsed as ChainId;
}

function toBytes(hex: HexString): string[] {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error("Hex string must have an even number of characters.");
  }
  return normalized.match(/../g) || [];
}

function findMaskIndices(hexA: HexString, hexB: HexString): number[] {
  const bytesA = toBytes(hexA);
  const bytesB = toBytes(hexB);
  if (bytesA.length !== bytesB.length) {
    throw new Error(`Length mismatch: ${bytesA.length} vs ${bytesB.length}`);
  }
  const indices = new Set<number>();
  let i = 0;
  while (i < bytesA.length) {
    const byteA = bytesA[i];
    const byteB = bytesB[i];

    if (byteA !== byteB) {
      indices.add(i);
      i += 1;
      continue;
    }

    // PUSH32 opcode (0x7f) => mask full 32-byte immediate if any byte differs.
    if (byteA === "7f") {
      let differs = false;
      for (let j = 1; j <= 32 && i + j < bytesA.length; j += 1) {
        if (bytesA[i + j] !== bytesB[i + j]) {
          differs = true;
          break;
        }
      }
      if (differs) {
        for (let j = 1; j <= 32 && i + j < bytesA.length; j += 1) {
          indices.add(i + j);
        }
      }
      i += 33;
      continue;
    }

    i += 1;
  }

  return Array.from(indices).sort((a, b) => a - b);
}

async function resolveBytecode(input: ParsedInput, chainId: ChainId | null): Promise<HexString> {
  if (input.kind === "bytecode") {
    return input.value as HexString;
  }
  const address = input.value as Address;
  if (!chainId) {
    throw new Error("Chain id required to fetch bytecode for addresses.");
  }
  const bytecode = await fetchOracleBytecode(chainId, address);
  if (!bytecode || bytecode === "0x") {
    throw new Error(`No bytecode found for ${address} on chain ${chainId}`);
  }
  return asHexString(bytecode.toLowerCase());
}

function formatMask(indices: number[]): string {
  return indices.length ? indices.join(", ") : "";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    usage();
    process.exit(1);
  }

  const inputs: string[] = [];
  let chainArg: string | null = null;
  let constPrefix: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--chain" || arg === "-c") {
      chainArg = args[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--const") {
      constPrefix = args[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    inputs.push(arg);
  }

  if (inputs.length < 2) {
    usage();
    process.exit(1);
  }

  const parsedA = parseInput(inputs[0]);
  const parsedB = parseInput(inputs[1]);

  const needsChain = parsedA.kind === "address" || parsedB.kind === "address";
  const chainId = needsChain ? toChainId(chainArg) : null;

  const bytecodeA = await resolveBytecode(parsedA, chainId);
  const bytecodeB = await resolveBytecode(parsedB, chainId);

  const maskIndices = findMaskIndices(bytecodeA, bytecodeB);
  const common = applyIgnoredByteIndices(bytecodeA, maskIndices);

  const maskedB = applyIgnoredByteIndices(bytecodeB, maskIndices);
  if (maskedB !== common) {
    throw new Error("Generated COMMON mismatch: bytecodes diverge after masking.");
  }

  const length = toBytes(bytecodeA).length;
  console.log(`Bytecode length: ${length} bytes`);
  console.log(`Mask indices: ${maskIndices.length}`);

  if (!constPrefix) {
    console.log("COMMON=", common);
    console.log("MASK=", maskIndices);
    return;
  }

  console.log("\n=== Paste Into src/bytecodes/oracle-bytecode-constants.ts ===");
  console.log(`// For ${constPrefix.replace(/_/g, " ")} contract, created with these 2 addresses`);
  if (parsedA.kind === "address") {
    console.log(`// Address 1: ${parsedA.value}`);
  }
  if (parsedB.kind === "address") {
    console.log(`// Address 2: ${parsedB.value}`);
  }
  if (chainId) {
    const chainName = CHAIN_CONFIGS[chainId].name;
    console.log(`// Chain: ${chainId} (${chainName})`);
  }
  console.log(`export const ${constPrefix}_COMMON = "${common}";`);
  console.log(`export const ${constPrefix}_MASK = [${formatMask(maskIndices)}] as const;`);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
