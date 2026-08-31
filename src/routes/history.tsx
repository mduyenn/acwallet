import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useWallet, formatUsd } from "@/lib/wallet-store";
import { explorerTx } from "@/lib/arc";
import { ExternalLink, Search, Download } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { txs } = useWallet();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");

  const filtered = txs.filter((t) => {
    if (filter === "in" && t.amount <= 0) return false;
    if (filter === "out" && t.amount > 0) return false;
    if (q && !(t.label.toLowerCase().includes(q.toLowerCase()) || t.hash?.includes(q))) return false;
    return true;
  });

  const exportCsv = () => {
    const rows = [["date", "type", "label", "amount", "status", "hash"]];
    txs.forEach((t) => rows.push([new Date(t.timestamp).toISOString(), t.type, t.label, String(t.amount), t.status, t.hash ?? ""]));
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ac-wallet-history.csv"; a.click();
  };

  return (
    <div className="px-4 lg:px-8">
      <PageHeader title="Activity" action={
        <button onClick={exportCsv} className="hidden items-center gap-1.5 rounded-2xl bg-secondary px-3 py-2 text-xs font-medium lg:flex">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      } />
      <div className="mb-3 rounded-2xl bg-card p-2 shadow-sm">
        <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input placeholder="Search by label or hash" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" />
        </div>
      </div>
      <div className="mb-3 flex gap-2">
        {(["all", "in", "out"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${filter === f ? "gradient-brand text-white" : "bg-secondary text-secondary-foreground"}`}>
            {f === "all" ? "All" : f === "in" ? "Received" : "Sent"}
          </button>
        ))}
      </div>
      <div className="rounded-3xl bg-card p-2 shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No transactions</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-3">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg ${t.amount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{t.amount > 0 ? "↓" : "↑"}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{t.label}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(t.timestamp).toLocaleString()} · <span className="capitalize">{t.status}</span></div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-sm font-bold tabular-nums ${t.amount > 0 ? "text-emerald-600" : "text-foreground"}`}>{t.amount > 0 ? "+" : ""}{formatUsd(t.amount)}</div>
                  {t.hash && <a href={explorerTx(t.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-brand">Explorer <ExternalLink className="h-3 w-3" /></a>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}