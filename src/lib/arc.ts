import { createPublicClient, defineChain, http, formatUnits, parseUnits, erc20Abi } from "viem";

export const ARC_CHAIN_ID = 5042002;

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "Arc", symbol: "ARC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
    public: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

// On Arc, USDC IS the native gas token. An optional ERC-20 interface at the
// address below shares the same underlying balance (6 decimals).
// Source: https://docs.arc.io/arc/references/contract-addresses
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const USDC_DECIMALS = 6;

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

export async function fetchUsdcBalance(address: string): Promise<number> {
  // USDC is native on Arc, so getBalance() returns the USDC balance directly.
  // We also try the ERC-20 interface as a fallback and take the max — some
  // RPCs report native balance with 18 decimals while the ERC-20 view uses 6.
  const addr = address as `0x${string}`;
  const [nativeRes, erc20Res] = await Promise.allSettled([
    publicClient.getBalance({ address: addr }),
    publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [addr],
    }),
  ]);
  let best = 0;
  if (erc20Res.status === "fulfilled") {
    try {
      best = Math.max(best, Number(formatUnits(erc20Res.value as bigint, USDC_DECIMALS)));
    } catch {}
  }
  if (nativeRes.status === "fulfilled") {
    try {
      // Native is reported in the chain's native unit. Arc treats USDC as native
      // with 6 decimals, but some clients still return 18-decimal wei — pick the
      // interpretation that matches the ERC-20 view, defaulting to 6.
      const raw = nativeRes.value as bigint;
      const as6 = Number(formatUnits(raw, USDC_DECIMALS));
      const as18 = Number(formatUnits(raw, 18));
      // Prefer the 6-decimal reading unless it's absurd (>10^9) which means it's actually 18.
      const nativeVal = as6 > 1e9 ? as18 : as6;
      best = Math.max(best, nativeVal);
    } catch {}
  }
  if (nativeRes.status === "rejected" && erc20Res.status === "rejected") {
    console.warn("USDC balance fetch failed", nativeRes.reason, erc20Res.reason);
  }
  return best;
}

export function explorerAddress(addr: string) {
  return `https://testnet.arcscan.app/address/${addr}`;
}
export function explorerTx(hash: string) {
  return `https://testnet.arcscan.app/tx/${hash}`;
}

export { formatUnits, parseUnits, erc20Abi };

export const CIRCLE_FAUCET_URL = "https://faucet.circle.com/";

// ---- Arcscan (Blockscout-style) explorer API ----
// Testnet explorer exposes a Blockscout v2 REST API for address activity.
const ARCSCAN_API = "https://testnet.arcscan.app/api/v2";

export type ExplorerTransfer = {
  hash: string;
  timestamp: number; // ms
  from: string;
  to: string;
  amount: number; // signed relative to the wallet
  status: "confirmed" | "pending" | "failed";
};

/**
 * Fetch recent USDC transfers involving `address` from the Arc Testnet
 * block explorer. Returned amounts are signed:
 *   +  incoming (address is receiver, e.g. faucet drop)
 *   -  outgoing (address is sender)
 */
export async function fetchUsdcTransfers(address: string, limit = 20): Promise<ExplorerTransfer[]> {
  try {
    const url = `${ARCSCAN_API}/addresses/${address}/token-transfers?type=ERC-20&filter=to%20%7C%20from`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: any[] };
    const items = Array.isArray(data.items) ? data.items : [];
    const me = address.toLowerCase();
    const usdc = USDC_ADDRESS.toLowerCase();
    const out: ExplorerTransfer[] = [];
    for (const it of items) {
      const tokenAddr: string | undefined = it?.token?.address?.toLowerCase?.();
      if (tokenAddr && tokenAddr !== usdc) continue;
      const rawValue: string = it?.total?.value ?? it?.value ?? "0";
      const dec = Number(it?.total?.decimals ?? it?.token?.decimals ?? USDC_DECIMALS);
      let value = 0;
      try {
        value = Number(formatUnits(BigInt(rawValue), dec));
      } catch {
        value = 0;
      }
      const from: string = (it?.from?.hash ?? "").toLowerCase();
      const to: string = (it?.to?.hash ?? "").toLowerCase();
      const incoming = to === me;
      const outgoing = from === me;
      if (!incoming && !outgoing) continue;
      const ts = it?.timestamp ? new Date(it.timestamp).getTime() : Date.now();
      out.push({
        hash: it?.transaction_hash ?? it?.tx_hash ?? "",
        timestamp: ts,
        from,
        to,
        amount: incoming ? value : -value,
        status: it?.status === "error" ? "failed" : "confirmed",
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.warn("Explorer transfer fetch failed", e);
    return [];
  }
}