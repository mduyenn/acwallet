import { createServerFn } from "@tanstack/react-start";

export type PortfolioPosition = {
  name: string;
  symbol: string;
  chain: string;
  value: number;
  quantity: number;
  type: string;
  protocol?: string;
  changePct?: number;
};

export type PortfolioSnapshot = {
  available: boolean;
  reason?: string;
  totalValue: number;
  dayChangePct: number;
  dayChangeAbs: number;
  allocation: { label: string; value: number }[];
  positions: PortfolioPosition[];
  nftCount: number;
  chains: string[];
};

const EMPTY: PortfolioSnapshot = {
  available: false,
  totalValue: 0,
  dayChangePct: 0,
  dayChangeAbs: 0,
  allocation: [],
  positions: [],
  nftCount: 0,
  chains: [],
};

export const getPortfolio = createServerFn({ method: "POST" })
  .inputValidator((input: { address: string }) => {
    if (!input?.address || !/^0x[a-fA-F0-9]{40}$/.test(input.address)) {
      throw new Error("A valid wallet address is required");
    }
    return { address: input.address.toLowerCase() };
  })
  .handler(async ({ data }): Promise<PortfolioSnapshot> => {
    const key = process.env["ZERION_API_KEY"];
    if (!key) return { ...EMPTY, reason: "Zerion API key is not configured" };

    const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
    const headers = { accept: "application/json", authorization: auth };
    const base = "https://api.zerion.io/v1";

    try {
      const [portfolioRes, positionsRes, nftRes] = await Promise.allSettled([
        fetch(`${base}/wallets/${data.address}/portfolio?currency=usd`, { headers }),
        fetch(`${base}/wallets/${data.address}/positions/?currency=usd&page[size]=25&sort=-value`, { headers }),
        fetch(`${base}/wallets/${data.address}/nft-portfolio?currency=usd`, { headers }),
      ]);

      let totalValue = 0;
      let dayChangePct = 0;
      let dayChangeAbs = 0;
      const allocation: { label: string; value: number }[] = [];
      const chains = new Set<string>();

      if (portfolioRes.status === "fulfilled" && portfolioRes.value.ok) {
        const json: any = await portfolioRes.value.json();
        const attr = json?.data?.attributes ?? {};
        totalValue = Number(attr?.total?.positions ?? 0);
        dayChangeAbs = Number(attr?.changes?.absolute_1d ?? 0);
        dayChangePct = Number(attr?.changes?.percent_1d ?? 0);
        const dist = attr?.positions_distribution_by_type ?? {};
        for (const [label, value] of Object.entries(dist)) {
          if (Number(value) > 0) allocation.push({ label, value: Number(value) });
        }
        for (const chain of Object.keys(attr?.positions_distribution_by_chain ?? {})) {
          if (Number(attr.positions_distribution_by_chain[chain]) > 0) chains.add(chain);
        }
      } else if (portfolioRes.status === "fulfilled" && portfolioRes.value.status === 401) {
        return { ...EMPTY, reason: "Zerion API key was rejected" };
      }

      const positions: PortfolioPosition[] = [];
      if (positionsRes.status === "fulfilled" && positionsRes.value.ok) {
        const json: any = await positionsRes.value.json();
        for (const item of json?.data ?? []) {
          const a = item?.attributes ?? {};
          const chain = item?.relationships?.chain?.data?.id ?? "unknown";
          chains.add(chain);
          positions.push({
            name: a?.fungible_info?.name ?? "Unknown",
            symbol: a?.fungible_info?.symbol ?? "?",
            chain,
            value: Number(a?.value ?? 0),
            quantity: Number(a?.quantity?.float ?? 0),
            type: a?.position_type ?? "wallet",
            protocol: a?.protocol ?? undefined,
            changePct: Number(a?.changes?.percent_1d ?? 0),
          });
        }
      }

      let nftCount = 0;
      if (nftRes.status === "fulfilled" && nftRes.value.ok) {
        const json: any = await nftRes.value.json();
        nftCount = Number(json?.data?.attributes?.total?.positions ?? 0);
      }

      return {
        available: true,
        totalValue,
        dayChangePct,
        dayChangeAbs,
        allocation,
        positions,
        nftCount,
        chains: [...chains],
      };
    } catch (e) {
      return { ...EMPTY, reason: e instanceof Error ? e.message : "Zerion request failed" };
    }
  });
