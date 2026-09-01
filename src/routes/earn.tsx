import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Sparkles, Info, Leaf, Loader2, Wand2, CheckCircle2, ExternalLink, Lock, Timer, ArrowDownToLine, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/PageHeader";
import { useWallet, formatUsd, shortAddr } from "@/lib/wallet-store";
import { explorerTx } from "@/lib/arc";
import {
  LOCK_PERIODS,
  EARLY_EXIT_PENALTY,
  useEarnPositions,
  accruedYield,
  projectedYield,
  type EarnPosition,
} from "@/lib/earn-positions";

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
        content: "Compare APY, risk and estimated earnings on idle USDC. Informational only, never financial advice.",
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
  const { balance, address, isDemo, sendUsdc, withdrawUsdc, txs } = useWallet();
  const [amount, setAmount] = useState<string>("");
  const [poolAmounts, setPoolAmounts] = useState<Record<string, string>>({});
  const [poolErrors, setPoolErrors] = useState<Record<string, string>>({});
  const [staking, setStaking] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Risk>("all");
  const [appetite, setAppetite] = useState<Appetite>("Balanced");
  const [periodId, setPeriodId] = useState<string>("30d");

  const { positions, addPosition, closePosition } = useEarnPositions();
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [positionsOpen, setPositionsOpen] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null);

  const [advice, setAdvice] = useState("");
  const [asking, setAsking] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [allocResult, setAllocResult] = useState<{ label: string; hash?: string; ok: boolean }[]>([]);
  const [allocError, setAllocError] = useState<string | null>(null);

  const period = LOCK_PERIODS.find((p) => p.id === periodId) ?? LOCK_PERIODS[0]!;
  const boosted = (apy: number) => Math.round(apy * period.boost * 100) / 100;

  const principal = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0 ? n : balance;
  }, [amount, balance]);

  const list = OPPORTUNITIES.filter((o) => filter === "all" || o.risk === filter).sort((a, b) => b.apy - a.apy);
  const best = OPPORTUNITIES.reduce((a, b) => (b.apy > a.apy ? b : a));
  const plan = useMemo(() => buildAllocation(principal, appetite), [principal, appetite]);
  const blendedApy = plan.length
    ? (plan.reduce((s, a) => s + a.amount * a.opp.apy, 0) / Math.max(0.01, plan.reduce((s, a) => s + a.amount, 0))) *
      period.boost
    : 0;

  const active = positions.filter((p) => p.status === "active");
  const staked = active.reduce((s, p) => s + p.principal, 0);
  const accrued = active.reduce((s, p) => s + accruedYield(p), 0);

  function recordPosition(opp: Opportunity, amt: number, hash?: string) {
    const now = Date.now();
    addPosition({
      strategyId: opp.id,
      protocol: opp.protocol,
      emoji: opp.emoji,
      vault: opp.vault,
      principal: amt,
      baseApy: opp.apy,
      apr: boosted(opp.apy),
      periodId: period.id,
      periodLabel: period.label,
      days: period.days,
      startedAt: now,
      unlockAt: now + period.days * 86_400_000,
      hash,
    });
  }

  async function withdrawPosition(p: EarnPosition) {
    if (withdrawing) return;
    setWithdrawing(p.id);
    setWithdrawMsg(null);
    const unlocked = Date.now() >= p.unlockAt;
    const yieldNow = accruedYield(p);
    const payout = Math.round((p.principal + (unlocked ? yieldNow : yieldNow * (1 - EARLY_EXIT_PENALTY))) * 100) / 100;
    try {
      await withdrawUsdc(p.vault, payout, `Earn withdrawal: ${p.protocol}`);
      closePosition(p.id);
      setWithdrawMsg(
        unlocked
          ? `${formatUsd(payout)} USDC withdrawn from ${p.protocol}: principal plus full yield.`
          : `${formatUsd(payout)} USDC principal withdrawn from ${p.protocol}. Early exit: yield forfeited.`,
      );
    } catch (e: any) {
      setWithdrawMsg(e?.shortMessage || e?.message || "Withdrawal failed.");
    } finally {
      setWithdrawing(null);
    }
  }


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
      if (!acc.trim()) setAdvice("I couldn't generate an answer. Try again.");
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
          const tx = await sendUsdc(a.opp.vault, a.amount, `Earn deposit ${period.label}: ${a.opp.protocol}`);
          recordPosition(a.opp, a.amount, tx.hash);
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
            <strong>{formatUsd(principal * (1 + best.apy / 100))}</strong> after a year. Rates are variable and not
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

      {/* Lock period selector */}
      <div className="mt-4 rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 text-base font-bold">
          <Lock className="h-5 w-5 text-brand" /> Staking period · APR boost
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          The longer you lock capital, the higher the APR applied on top of each strategy base rate.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {LOCK_PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriodId(p.id)}
              className={`rounded-2xl px-2 py-3 text-center transition ${
                periodId === p.id ? "gradient-brand text-white shadow-brand" : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              <div className="text-sm font-extrabold">{p.label}</div>
              <div className="mt-0.5 text-[11px] font-bold opacity-90">x{p.boost.toFixed(2)} APR</div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/50 px-3 py-2.5">
          <div className="flex items-center gap-2 rounded-xl bg-brand-soft px-2.5 py-1.5 text-sm font-bold text-brand">
            <Timer className="h-4 w-4" />
            Unlocks {new Date(Date.now() + period.days * 86_400_000).toLocaleDateString()}
          </div>
          <span className="text-sm font-bold">
            Best boosted APR <span className="text-brand tabular-nums">{boosted(best.apy).toFixed(2)}%</span>
          </span>
        </div>
      </div>

      {/* Active positions (collapsible) */}
      {active.length > 0 && (
        <div className="mt-4 rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
          <button
            onClick={() => setPositionsOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2 text-base font-bold">
              <Timer className="h-5 w-5 text-brand" /> Your staked positions
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                {active.length}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Staked <strong className="text-foreground">{formatUsd(staked)}</strong> · Earned{" "}
                <strong className="text-emerald-600">{formatUsd(accrued)}</strong>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${positionsOpen ? "rotate-180" : ""}`}
              />
            </div>
          </button>

          {positionsOpen && (
          <div className="mt-3 space-y-3">
            {active.map((p) => {
              const now = Date.now();
              const unlocked = now >= p.unlockAt;
              const progress = Math.min(100, ((now - p.startedAt) / (p.unlockAt - p.startedAt)) * 100);
              const y = accruedYield(p, now);
              const payout = p.principal + (unlocked ? y : y * (1 - EARLY_EXIT_PENALTY));
              return (
                <div key={p.id} className="rounded-2xl border border-border/60 bg-background/70 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{p.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-bold">{p.protocol}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="rounded-lg bg-brand-soft px-2 py-0.5 font-bold text-brand">{p.periodLabel} lock</span>
                        <span>APR {p.apr.toFixed(2)}%</span>
                        <span>target {formatUsd(projectedYield(p))} USDC</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold tabular-nums">{formatUsd(p.principal)}</div>
                      <div className="text-xs font-bold text-emerald-600 tabular-nums">+{formatUsd(y)}</div>
                    </div>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full gradient-brand" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {unlocked ? (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-2.5 py-1.5 text-xs font-bold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Unlocked: withdraw principal plus full yield
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-brand-soft px-2.5 py-1.5 text-xs font-bold text-brand">
                        <Timer className="h-3.5 w-3.5" />
                        Unlocks {new Date(p.unlockAt).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Early exit returns principal only, no yield.
                    </span>
                    <button
                      onClick={() => withdrawPosition(p)}
                      disabled={withdrawing === p.id}
                      className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-rose-500 to-red-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:from-rose-600 hover:to-red-700 hover:shadow-rose-500/40 disabled:opacity-60"
                    >
                      {withdrawing === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                      )}
                      Withdraw {formatUsd(payout)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
          {withdrawMsg && <div className="mt-2 text-sm font-bold text-brand">{withdrawMsg}</div>}
        </div>
      )}

      {/* Risk appetite + auto allocate */}
      <div className="mt-4 rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 text-base font-bold">
          <Sparkles className="h-5 w-5 text-brand" /> Pilot strategy · risk appetite
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["Conservative", "Balanced", "Adventurous"] as Appetite[]).map((a) => (
            <button
              key={a}
              onClick={() => setAppetite(a)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                appetite === a ? "gradient-brand text-white shadow-brand" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-1.5 rounded-2xl bg-muted/50 p-3 text-sm">
          {plan.map((a) => (
            <div key={a.opp.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {a.opp.emoji} {a.opp.protocol} · <span className={`font-bold`}>{a.opp.risk}</span>
              </span>
              <span className="font-bold tabular-nums">{formatUsd(a.amount)} USDC</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border/60 pt-1.5 font-bold">
            <span>Blended APR ({period.label} lock)</span>
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
          const raw = poolAmounts[o.id] ?? "";
          const poolAmt = Number(raw);
          const validAmt = Number.isFinite(poolAmt) && poolAmt > 0 ? poolAmt : 0;
          const periodYield = (validAmt * (boosted(o.apy) / 100) * period.days) / 365;
          const err = poolErrors[o.id];
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
                  <div className="truncate text-base font-bold">{o.protocol}</div>
                  <div className="text-xs text-muted-foreground">
                    {o.asset} · {o.chain}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold tabular-nums text-brand">{boosted(o.apy).toFixed(1)}%</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    APR · {period.label}
                  </div>
                </div>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{o.what}</p>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${riskStyle[o.risk]}`}>
                  {o.risk} risk
                </span>
              </div>

              {/* Per-pool amount input + inline APR calc */}
              <div className="mt-3 rounded-2xl border border-border/60 bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={raw}
                    onChange={(e) => {
                      setPoolAmounts((m) => ({ ...m, [o.id]: e.target.value }));
                      setPoolErrors((m) => ({ ...m, [o.id]: "" }));
                    }}
                    placeholder="Enter USDC amount"
                    className={`w-full rounded-xl bg-background px-3 py-2 text-sm font-bold tabular-nums outline-none ring-1 transition focus:ring-2 ${
                      err ? "ring-rose-400 focus:ring-rose-500" : "ring-border/60 focus:ring-brand"
                    }`}
                  />
                  <span className="shrink-0 text-xs font-bold text-muted-foreground">USDC</span>
                </div>
                {err ? (
                  <div className="mt-1.5 text-[11px] font-bold text-rose-600">{err}</div>
                ) : validAmt > 0 ? (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold">
                    <span className="text-muted-foreground">
                      {boosted(o.apy).toFixed(2)}% APR · {period.label}
                    </span>
                    <span className="text-emerald-600 tabular-nums">≈ +{formatUsd(periodYield)} USDC</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full bg-gradient-to-r ${o.gradient}`}
                  style={{ width: `${Math.min(100, (boosted(o.apy) / 20) * 100)}%` }}
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
                    if (staking) return;
                    const n = Number(poolAmounts[o.id] ?? "");
                    if (!poolAmounts[o.id]?.trim() || !Number.isFinite(n) || n <= 0) {
                      setPoolErrors((m) => ({ ...m, [o.id]: "Please enter an amount greater than 0." }));
                      return;
                    }
                    setAllocError(null);
                    setAllocResult([]);
                    setStaking(o.id);
                    try {
                      const amt = Math.round(n * 100) / 100;
                      const tx = await sendUsdc(o.vault, amt, `Earn deposit ${period.label}: ${o.protocol}`);
                      recordPosition(o, amt, tx.hash);
                      setAllocResult([{ label: `${formatUsd(amt)} USDC → ${o.protocol}`, hash: tx.hash, ok: true }]);
                      setPoolAmounts((m) => ({ ...m, [o.id]: "" }));
                    } catch (e: any) {
                      setPoolErrors((m) => ({ ...m, [o.id]: e?.shortMessage || e?.message || "Deposit failed." }));
                    } finally {
                      setStaking(null);
                    }
                  }}
                  disabled={staking === o.id}
                  className="rounded-2xl gradient-brand py-2 text-xs font-semibold text-white shadow-brand disabled:opacity-60"
                >
                  {staking === o.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `Stake ${period.label}`}
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
          risk. You can lose funds. Always do your own research.
        </p>
      </div>
    </div>
  );
}
