import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useWallet, formatUsd } from "@/lib/wallet-store";

export const Route = createFileRoute("/budget")({
  component: BudgetPage,
});

function BudgetPage() {
  const { budgets } = useWallet();
  const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const pct = totalLimit ? (totalSpent / totalLimit) * 100 : 0;

  return (
    <div className="px-4 lg:px-8">
      <PageHeader title="Budget planner" subtitle="This month" />
      <div className="rounded-3xl gradient-card p-6 text-white shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-white/70">Spent this month</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{formatUsd(totalSpent)} <span className="text-base font-medium text-white/80">USDC</span></div>
            <div className="text-xs text-white/70">of {formatUsd(totalLimit)} budget</div>
          </div>
          <RingProgress pct={pct} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
            <div className="text-xs text-white/70">Remaining</div>
            <div className="font-bold tabular-nums">{formatUsd(Math.max(0, totalLimit - totalSpent))}</div>
          </div>
          <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
            <div className="text-xs text-white/70">Daily avg</div>
            <div className="font-bold tabular-nums">{formatUsd(totalSpent / Math.max(1, new Date().getDate()))}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {budgets.map((b) => {
          const p = Math.min(100, (b.spent / b.limit) * 100);
          const over = b.spent > b.limit;
          return (
            <div key={b.id} className="rounded-3xl bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-2xl">{b.icon}</div>
                <div className="flex-1">
                  <div className="font-semibold">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{formatUsd(b.spent)} / {formatUsd(b.limit)} USDC</div>
                </div>
                <div className={`text-sm font-bold ${over ? "text-rose-500" : "text-brand"}`}>{Math.round(p)}%</div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full bg-gradient-to-r ${b.color} transition-all`} style={{ width: `${p}%` }} />
              </div>
              {over && <div className="mt-2 text-xs font-medium text-rose-500">Over budget!</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RingProgress({ pct }: { pct: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, pct) / 100) * c;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
      <circle cx="40" cy="40" r={r} stroke="currentColor" strokeWidth="8" className="text-white/20" fill="none" />
      <circle cx="40" cy="40" r={r} stroke="white" strokeWidth="8" fill="none" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
}