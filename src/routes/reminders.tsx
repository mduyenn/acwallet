import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";
import { useWallet, formatUsd } from "@/lib/wallet-store";
import { Bell, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/reminders")({
  component: RemindersPage,
});

function RemindersPage() {
  const { reminders, addReminder, removeReminder } = useWallet();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [repeat, setRepeat] = useState<"once" | "monthly" | "weekly">("monthly");

  const add = () => {
    if (!title) return;
    addReminder({ title, amount: Number(amount) || 0, date, repeat });
    setTitle(""); setAmount("");
  };

  return (
    <div className="px-4 lg:px-8">
      <PageHeader title="Payment reminders" />
      <div className="rounded-3xl bg-card p-4 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What for? (e.g. Rent)" className="rounded-2xl border border-input bg-background px-3 py-3 outline-none sm:col-span-2" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount USDC" type="number" className="rounded-2xl border border-input bg-background px-3 py-3 outline-none" />
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="rounded-2xl border border-input bg-background px-3 py-3 outline-none" />
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as "once" | "monthly" | "weekly")} className="rounded-2xl border border-input bg-background px-3 py-3 outline-none sm:col-span-2">
            <option value="once">One time</option>
            <option value="weekly">Repeat weekly</option>
            <option value="monthly">Repeat monthly</option>
          </select>
          <button onClick={add} className="flex items-center justify-center gap-2 rounded-2xl gradient-brand py-3 font-semibold text-white shadow-brand sm:col-span-2">
            <Plus className="h-4 w-4" /> Add reminder
          </button>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {reminders.length === 0 ? (
          <div className="rounded-3xl bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
            <Bell className="mx-auto mb-2 h-8 w-8" /> No reminders yet
          </div>
        ) : (
          reminders.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
              <div className="grid h-11 w-11 place-items-center rounded-2xl gradient-soft text-xl">🔔</div>
              <div className="flex-1">
                <div className="font-semibold">{r.title}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.date).toLocaleDateString()} · {r.repeat}</div>
              </div>
              <div className="text-right">
                <div className="font-bold tabular-nums">{formatUsd(r.amount)}</div>
                <button onClick={() => removeReminder(r.id)} className="text-xs text-rose-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}