import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";
import { useWallet, formatUsd } from "@/lib/wallet-store";
import { Plus, Users } from "lucide-react";

export const Route = createFileRoute("/split")({
  component: SplitPage,
});

function SplitPage() {
  const { splits, addSplit, togglePaid } = useWallet();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Friday dinner");
  const [emoji, setEmoji] = useState("🍣");
  const [total, setTotal] = useState("120");
  const [members, setMembers] = useState("Alice, Bao, Chi, Dao");

  const create = () => {
    const list = members.split(",").map((m) => m.trim()).filter(Boolean);
    const share = list.length ? Number(total) / list.length : 0;
    addSplit({
      name, emoji, total: Number(total),
      members: list.map((n) => ({ name: n, paid: false, share })),
    });
    setOpen(false);
  };

  return (
    <div className="px-4 lg:px-8">
      <PageHeader title="Split bill" action={
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-2xl gradient-brand px-3 py-2 text-xs font-semibold text-white shadow-brand">
          <Plus className="h-4 w-4" /> New
        </button>
      } />
      {splits.length === 0 && !open && (
        <div className="rounded-3xl bg-card p-10 text-center shadow-sm">
          <Users className="mx-auto h-10 w-10 text-muted-foreground" />
          <div className="mt-3 font-semibold">No groups yet</div>
          <p className="mt-1 text-sm text-muted-foreground">Create a group to split a bill with friends.</p>
        </div>
      )}
      <div className="space-y-3">
        {splits.map((g) => {
          const paidCount = g.members.filter((m) => m.paid).length;
          const pct = g.members.length ? (paidCount / g.members.length) * 100 : 0;
          return (
            <div key={g.id} className="rounded-3xl bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-soft text-2xl">{g.emoji}</div>
                <div className="flex-1">
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-muted-foreground">{formatUsd(g.total)} USDC · {g.members.length} people</div>
                </div>
                <div className="text-sm font-semibold text-brand">{Math.round(pct)}%</div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full gradient-brand transition-all" style={{ width: `${pct}%` }} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {g.members.map((m, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm">
                    <span>{m.name} <span className="text-xs text-muted-foreground">· {formatUsd(m.share)} USDC</span></span>
                    <button onClick={() => togglePaid(g.id, i)} className={`rounded-full px-3 py-1 text-xs font-semibold ${m.paid ? "bg-emerald-100 text-emerald-700" : "bg-white text-muted-foreground"}`}>
                      {m.paid ? "Paid" : "Mark paid"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 lg:items-center">
          <div className="w-full max-w-md space-y-3 rounded-3xl bg-card p-5 shadow-card">
            <h2 className="text-lg font-bold">New split group</h2>
            <div className="grid grid-cols-[64px_1fr] gap-2">
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="rounded-2xl border border-input bg-background px-3 py-3 text-center text-2xl outline-none" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-2xl border border-input bg-background px-3 py-3 outline-none" />
            </div>
            <input value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Total USDC" type="number" className="w-full rounded-2xl border border-input bg-background px-3 py-3 outline-none" />
            <textarea value={members} onChange={(e) => setMembers(e.target.value)} placeholder="Comma-separated names" className="w-full rounded-2xl border border-input bg-background px-3 py-3 outline-none" rows={2} />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setOpen(false)} className="rounded-2xl border border-border py-3 font-semibold">Cancel</button>
              <button onClick={create} className="rounded-2xl gradient-brand py-3 font-semibold text-white shadow-brand">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}