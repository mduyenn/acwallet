import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Sparkles, Info, Leaf, Loader2, Wand2, CheckCircle2, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/PageHeader";
import { useWallet, formatUsd, shortAddr } from "@/lib/wallet-store";
import { explorerTx } from "@/lib/arc";

export const Route = createFileRoute("/earn")({
  head: () => ({
    meta: [
      { title: "Earn | Yield opportunities in AC WALLET" },
      {
        name: "description",
        content:
          "Discover USDC yield opportunities from Morpho, Aave, Spark and other protocols, with APY, risk level and estimated earnings.",
      },
      { property: "og:title", content: "Earn | Yield opportunities in AC WALLET" },
      {
        property: "og:description",
        content: "Compare APY, risk and estimated earnings on idle USDC — informational only, never financial advice.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EarnPage,
});

type Risk = "Low" | "Medium" | "Higher";
type Appetite = "Conservative" | "Balanced" | "Adventurous";

type Opportunity = {
  id: string;
  protocol: string;
  emoji: string;
  asset: string;
  chain: string;
  apy: number;
  risk: Risk;
  gradient: string;
  what: string;
  /** YieldVault contract deployed on Arc Testnet (deposits are real on-chain txs) */
  vault: string;
};

const OPPORTUNITIES: Opportunity[] = [
  {
    id: "aave-usdc",
    protocol: "Aave v3",
    emoji: "👻",
    asset: "USDC",
    chain: "Ethereum",
    apy: 4.8,
    risk: "Low",
    gradient: "from-violet-500 to-fuchsia-500",
    what: "Lend USDC into a large, battle-tested money market. Borrowers pay interest and you can withdraw any time liquidity allows.",
    vault: "0xd16f65fa6d0df3ea8104a1b67431371e973346f7",
  },
  {
    id: "morpho-usdc",
    protocol: "Morpho",
    emoji: "🦋",
    asset: "USDC",
    chain: "Base",
    apy: 6.4,
    risk: "Medium",
    gradient: "from-sky-500 to-indigo-500",
    what: "Curated lending vaults route your USDC to the best-matched markets, usually improving the rate versus plain lending.",
    vault: "0x87911cd75fb18d1b49a561be34037b4c6ea8d6dc",
  },
  {
    id: "spark-dai",
    protocol: "Spark",
    emoji: "⚡",
    asset: "USDS / DAI",
    chain: "Ethereum",
    apy: 5.2,
    risk: "Low",
    gradient: "from-amber-400 to-orange-500",
    what: "Savings rate on Sky/Maker stablecoins, funded by protocol revenue. Simple deposit-and-hold style yield.",
    vault: "0xba95ac280f0e6954581cbd33dc1844a8a229c968",
  },
  {
    id: "compound-usdc",
    protocol: "Compound v3",
    emoji: "🏦",
    asset: "USDC",
    chain: "Arbitrum",
    apy: 4.1,
    risk: "Low",
    gradient: "from-emerald-500 to-teal-500",
    what: "One of the oldest lending markets. Supply USDC and earn variable interest plus incentives.",
    vault: "0xe5a058545a4a7c606d78d4522ee99f88e2932307",
  },
  {
    id: "pendle-fixed",
    protocol: "Pendle",
    emoji: "🧭",
    asset: "USDC yield tokens",
    chain: "Ethereum",
    apy: 9.7,
    risk: "Higher",
    gradient: "from-rose-500 to-pink-500",
    what: "Trade or lock future yield for a fixed rate. More moving parts, more complexity, and price risk on yield tokens.",
    vault: "0xb2db09c5096042a60b5aa7f76d39c16920f2a00a",
  },
  {
    id: "arc-staking",
    protocol: "Arc Testnet pool",
    emoji: "🧪",
    asset: "USDC",
    chain: "Arc Testnet",
    apy: 3.5,
    risk: "Low",
    gradient: "from-cyan-500 to-blue-500",
    what: "Testnet-only demonstration pool for practising deposits and withdrawals with no real value at stake.",
    vault: "0xd44d0e893026f43403770d1aedea0cba254d1060",
  },
];

const riskStyle: Record<Risk, string> = {
  Low: "bg-emerald-500/15 text-emerald-600",
  Medium: "bg-amber-500/15 text-amber-600",
  Higher: "bg-rose-500/15 text-rose-600",
};

const APPETITE_MIX: Record<Appetite, Record<Risk, number>> = {
  Conservative: { Low: 0.85, Medium: 0.15, Higher: 0 },
  Balanced: { Low: 0.5, Medium: 0.35, Higher: 0.15 },
  Adventurous: { Low: 0.25, Medium: 0.4, Higher: 0.35 },
};

type Alloc = { opp: Opportunity; amount: number };

function buildAllocation(principal: number, appetite: Appetite): Alloc[] {
  const mix = APPETITE_MIX[appetite];
  const out: Alloc[] = [];
  (["Low", "Medium", "Higher"] as Risk[]).forEach((risk) => {
    const share = mix[risk];
    if (share <= 0) return;
    const pool = OPPORTUNITIES.filter((o) => o.risk === risk).sort((a, b) => b.apy - a.apy).slice(0, 2);
    if (pool.length === 0) return;
    const per = (principal * share) / pool.length;
    pool.forEach((opp) => out.push({ opp, amount: Math.round(per * 100) / 100 }));
  });
  return out.filter((a) => a.amount >= 0.01);
}

function EarnPage() {
  const { balance, address, isDemo, sendUsdc, txs } = useWallet();
  const [amount, setAmount] = useState<string>("");
  const [filter, setFilter] = useState<"all" | Risk>("all");
  const [appetite, setAppetite] = useState<Appetite>("Balanced");

  const [advice, setAdvice] = useState("");
  const [asking, setAsking] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [allocResult, setAllocResult] = useState<{ label: string; hash?: string; ok: boolean }[]>([]);
  const [allocError, setAllocError] = useState<string | null>(null);

  const principal = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0 ? n : balance;
  }, [amount, balance]);

  const list = OPPORTUNITIES.filter((o) => filter === "all" || o.risk === filter).sort((a, b) => b.apy - a.apy);
  const best = OPPORTUNITIES.reduce((a, b) => (b.apy > a.apy ? b : a));
  const plan = useMemo(() => buildAllocation(principal, appetite), [principal, appetite]);
  const blendedApy = plan.length
    ? plan.reduce((s, a) => s + a.amount * a.opp.apy, 0) / Math.max(0.01, plan.reduce((s, a) => s + a.amount, 0))
    : 0;

  function buildContext() {
    const lines = [
      `Wallet: ${address ?? "not connected"}${isDemo ? " (demo sandbox)" : " (Arc Testnet)"}`,
      `Idle USDC balance: ${formatUsd(balance)}`,
      `Amount being planned: ${formatUsd(principal)} USDC`,
      `Selected risk appetite: ${appetite}`,
      `Recent transactions: ${txs.slice(0, 5).map((t) => `${t.type} ${t.amount}`).join(", ") || "none"}`,
      "Available strategies:",
      ...OPPORTUNITIES.map((o) => `- ${o.protocol} (${o.asset} on ${o.chain}) APY ${o.apy}% · ${o.risk} risk`),
      "Proposed auto-allocation plan:",
      ...plan.map((a) => `- ${formatUsd(a.amount)} USDC → ${a.opp.protocol} (${a.opp.apy}% APY, ${a.opp.risk} risk)`),
    ];
    return lines.join("\n");
  }

  async function askPilot(question: string) {
    if (asking) return;
    setAsking(true);
    setAdvice("");
    try {
      const res = await fetch("/api/pilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: question }], context: buildContext() }),
      });
      if (!res.ok || !res.body) {
        setAdvice((await res.text().catch(() => "")) || "AC Pilot could not answer right now.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setAdvice(acc);
      }
      if (!acc.trim()) setAdvice("I couldn't generate an answer — try again.");
    } catch {
      setAdvice("Network error while reaching AC Pilot.");
    } finally {
      setAsking(false);
    }
  }

  async function autoAllocate() {
    if (allocating || plan.length === 0) return;
    setAllocating(true);
    setAllocError(null);
    setAllocResult([]);
    try {
      for (const a of plan) {
        try {
          const tx = await sendUsdc(a.opp.vault, a.amount, `Earn deposit · ${a.opp.protocol}`);
          setAllocResult((r) => [...r, { label: `${formatUsd(a.amount)} USDC → ${a.opp.protocol}`, hash: tx.hash, ok: true }]);
        } catch (e: any) {
          setAllocResult((r) => [...r, { label: `${a.opp.protocol}: ${e?.shortMessage || e?.message || "failed"}`, ok: false }]);
          throw e;
        }
      }
      void askPilot(
        `Tôi vừa phân bổ ${formatUsd(principal)} USDC theo khẩu vị rủi ro ${appetite}. Hãy tóm tắt danh mục mới, rủi ro chính và điều cần theo dõi.`,
      );
    } catch (e: any) {
      setAllocError(e?.shortMessage || e?.message || "Allocation stopped.");
    } finally {
      setAllocating(false);
    }
  }

  return (
    <div className="px-4 pb-6 lg:px-8">
      <PageHeader title="Earn 🌱" subtitle="Put idle assets to work" />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl gradient-card p-6 text-white shadow-card">
        <div className="absolute -left-8 -bottom-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs text-white/80">
            <Leaf className="h-4 w-4" /> Idle balance
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {formatUsd(balance)} <span className="text-base font-medium text-white/80">USDC</span>
          </div>
          <p className="mt-2 max-w-md text-xs text-white/80">
            At {best.apy}% APY on {best.protocol}, {formatUsd(principal)} USDC would be worth about{" "}
            <strong>{formatUsd(principal * (1 + best.apy / 100))}</strong> after a year — rates are variable and not
            guaranteed.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Simulate amount (${balance.toFixed(2)})`}
              className="w-full rounded-2xl bg-white/20 px-4 py-2.5 text-sm text-white placeholder:text-white/60 outline-none backdrop-blur focus:ring-2 focus:ring-white/50"
            />
            <Link
              to="/pilot"
              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-white/20 px-3 py-2.5 text-xs font-semibold backdrop-blur"
            >
              <Sparkles className="h-4 w-4" /> Open Pilot
            </Link>
          </div>
        </div>
      </div>

      {/* Risk appetite + auto allocate */}
      <div className="mt-4 rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-brand" /> Pilot strategy · risk appetite
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["Conservative", "Balanced", "Adventurous"] as Appetite[]).map((a) => (
            <button
              key={a}
              onClick={() => setAppetite(a)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                appetite === a ? "gradient-brand text-white shadow-brand" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-1.5 rounded-2xl bg-muted/50 p-3 text-xs">
          {plan.map((a) => (
            <div key={a.opp.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {a.opp.emoji} {a.opp.protocol} · <span className={`font-semibold`}>{a.opp.risk}</span>
              </span>
              <span className="font-semibold tabular-nums">{formatUsd(a.amount)} USDC</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border/60 pt-1.5 font-semibold">
            <span>Blended APY</span>
            <span className="text-brand tabular-nums">{blendedApy.toFixed(2)}%</span>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            onClick={() =>
              askPilot(
                `Chiến lược Earn nào phù hợp với khẩu vị rủi ro ${appetite} của tôi? Phân tích kế hoạch phân bổ ${formatUsd(principal)} USDC ở trên, nêu rủi ro và lợi suất kỳ vọng.`,
              )
            }
            disabled={asking}
            className="flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-semibold text-secondary-foreground disabled:opacity-60"
          >
            {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Ask Pilot about this
          </button>
          <button
            onClick={autoAllocate}
            disabled={allocating || plan.length === 0 || principal <= 0}
            className="flex items-center justify-center gap-2 rounded-2xl gradient-brand py-3 text-sm font-semibold text-white shadow-brand disabled:opacity-60"
          >
            {allocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Auto-allocate & sign
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {isDemo
            ? "Demo mode: each deposit still asks for an explicit Confirm / Cancel signature."
            : `Each deposit is a real signature on Arc Testnet from ${shortAddr(address) || "your wallet"} into the strategy vault contract.`}
        </p>

        {allocResult.length > 0 && (
          <div className="mt-3 space-y-1.5 text-xs">
            {allocResult.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className={r.ok ? "text-emerald-600" : "text-rose-600"}>
                  {r.ok ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : null}
                  {r.label}
                </span>
                {r.hash && !isDemo && (
                  <a
                    href={explorerTx(r.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-brand"
                  >
                    Tx <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        {allocError && <div className="mt-2 text-xs font-medium text-rose-600">{allocError}</div>}

        {(advice || asking) && (
          <div className="mt-3 rounded-2xl border border-border/60 bg-background/70 p-3 text-sm leading-relaxed">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-brand">
              <Sparkles className="h-3.5 w-3.5" /> AC Pilot
            </div>
            {advice ? (
              <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-2 [&_ul]:my-2 [&_li]:my-0.5">
                <ReactMarkdown>{advice}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pilot is analysing…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mt-4 flex gap-2">
        {(["all", "Low", "Medium", "Higher"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              filter === f ? "gradient-brand text-white shadow-brand" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {f === "all" ? "All" : `${f} risk`}
          </button>
        ))}
      </div>

      {/* Opportunities */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {list.map((o) => {
          const yearly = principal * (o.apy / 100);
          return (
            <div
              key={o.id}
              className="overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur transition hover:shadow-card"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${o.gradient} text-2xl shadow-sm`}
                >
                  {o.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{o.protocol}</div>
                  <div className="text-xs text-muted-foreground">
                    {o.asset} · {o.chain}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold tabular-nums text-brand">{o.apy.toFixed(1)}%</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">APY</div>
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{o.what}</p>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${riskStyle[o.risk]}`}>
                  {o.risk} risk
                </span>
                <span className="text-xs text-muted-foreground">
                  ≈ <strong className="text-foreground">{formatUsd(yearly)}</strong> / year on {formatUsd(principal)}
                </span>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full bg-gradient-to-r ${o.gradient}`}
                  style={{ width: `${Math.min(100, (o.apy / 10) * 100)}%` }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    askPilot(
                      `Chiến lược ${o.protocol} (${o.apy}% APY, rủi ro ${o.risk}) có phù hợp với khẩu vị ${appetite} của tôi không? Giải thích ngắn gọn ưu, nhược và mức phân bổ hợp lý.`,
                    )
                  }
                  className="rounded-2xl bg-secondary py-2 text-xs font-semibold text-secondary-foreground"
                >
                  Ask Pilot
                </button>
                <button
                  onClick={async () => {
                    setAllocError(null);
                    setAllocResult([]);
                    try {
                      const amt = Math.round(principal * 100) / 100;
                      const tx = await sendUsdc(o.vault, amt, `Earn deposit · ${o.protocol}`);
                      setAllocResult([{ label: `${formatUsd(amt)} USDC → ${o.protocol}`, hash: tx.hash, ok: true }]);
                    } catch (e: any) {
                      setAllocError(e?.shortMessage || e?.message || "Deposit failed.");
                    }
                  }}
                  className="rounded-2xl gradient-brand py-2 text-xs font-semibold text-white shadow-brand"
                >
                  Deposit & sign
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-3xl border border-border/60 bg-muted/40 p-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          All opportunities shown are informational only and are not financial advice or a recommendation. APYs are
          indicative, variable, and can change at any time. DeFi protocols carry smart-contract, market and liquidity
          risk — you can lose funds. Always do your own research.
        </p>
      </div>
    </div>
  );
}
