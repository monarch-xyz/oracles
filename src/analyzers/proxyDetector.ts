import { ETHERSCAN_API_KEY, ETHERSCAN_V2_API_URL } from "../config.js";
import { getClient } from "../sources/morphoFactory.js";
import type { Address, ChainId, ProxyInfo } from "../types.js";

const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const EIP1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const EIP1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

export async function detectProxy(chainId: ChainId, address: Address): Promise<ProxyInfo | null> {
  const client = getClient(chainId);

  try {
    const [implSlot, beaconSlot, adminSlot] = await Promise.all([
      client.getStorageAt({ address, slot: EIP1967_IMPL_SLOT as `0x${string}` }),
      client.getStorageAt({ address, slot: EIP1967_BEACON_SLOT as `0x${string}` }),
      client.getStorageAt({ address, slot: EIP1967_ADMIN_SLOT as `0x${string}` }),
    ]);

    const impl = slotToAddress(implSlot);
    const beacon = slotToAddress(beaconSlot);
    const admin = slotToAddress(adminSlot);

    if (impl || beacon) {
      return {
        isProxy: true,
        proxyType: beacon ? "Beacon" : "EIP1967",
        implementation: impl,
        beacon: beacon || undefined,
        admin: admin || undefined,
        lastImplScanAt: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    console.log(`[proxy] Error detecting proxy for ${address}: ${error}`);
    return null;
  }
}

export async function detectProxyViaEtherscan(
  chainId: ChainId,
  address: Address,
): Promise<{ implementation: Address | null; isProxy: boolean } | null> {
  if (!ETHERSCAN_API_KEY) {
    return null;
  }

  try {
    const url = `${ETHERSCAN_V2_API_URL}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${ETHERSCAN_API_KEY}`;
    const response = await fetch(url);
    const data = (await response.json()) as {
      status: string;
      result: Array<{
        Implementation?: string;
        Proxy?: string;
        IsProxy?: string;
      }>;
    };

    if (data.status === "1" && data.result?.[0]) {
      const result = data.result[0];
      const isProxy = result.Proxy === "1" || result.IsProxy === "1";
      const implementation = result.Implementation
        ? (result.Implementation.toLowerCase() as Address)
        : null;

      return { implementation, isProxy };
    }

    return null;
  } catch (e) {
    console.log(`[etherscan] Error fetching proxy info: ${e}`);
    return null;
  }
}

function slotToAddress(slot: string | undefined): Address | null {
  if (
    !slot ||
    slot === "0x" ||
    slot === "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    return null;
  }
  const addr = `0x${slot.slice(-40)}`;
  if (addr === "0x0000000000000000000000000000000000000000") {
    return null;
  }
  return addr.toLowerCase() as Address;
}

export function needsImplRescan(proxyInfo: ProxyInfo | null, rescanIntervalMs: number): boolean {
  if (!proxyInfo) return false;
  const lastScan = new Date(proxyInfo.lastImplScanAt).getTime();
  return Date.now() - lastScan >= rescanIntervalMs;
}
