import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";
import { useWallet, formatUsd, shortAddr } from "@/lib/wallet-store";
import { toast } from "sonner";
import { explorerTx } from "@/lib/arc";
import { CheckCircle2, ExternalLink, Send } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/transfer")({
  validateSearch: (s: Record<string, unknown>) => ({
    to: typeof s.to === "string" ? s.to : "",
    amount: typeof s.amount === "string" ? s.amount : "",
  }),
  component: TransferPage,
});

const contacts = [
  { name: "Alice", emoji: "👩‍🎨", addr: "0xA1ce" + "0".repeat(36) },
  { name: "Bao", emoji: "🧑‍🚀", addr: "0xB400" + "0".repeat(36) },
  { name: "Chi", emoji: "🦊", addr: "0xC400" + "0".repeat(36) },
  { name: "Dao", emoji: "🐼", addr: "0xD400" + "0".repeat(36) },
];

function TransferPage() {
  const search = useSearch({ from: "/transfer" });
  const { sendUsdc, balance } = useWallet();
  const navigate = useNavigate();
  const [to, setTo] = useState(search.to);
  const [amount, setAmount] = useState(search.amount);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<null | { hash: string; amount: number; to: string }>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const n = Number(amount);
    if (!to.startsWith("0x") || to.length < 10) return toast.error("Invalid wallet address");
    if (!n || n <= 0) return toast.error("Enter an amount");
    if (n > balance) return toast.error("Insufficient balance");
    setLoading(true);
    const tx = await sendUsdc(to, n, note);
    setLoading(false);
    setConfirm({ hash: tx.hash!, amount: n, to });
  };

  if (confirm) {
    return (
      <div className="px-4 lg:px-8">
        <PageHeader title="Sent" />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-3xl bg-card p-6 text-center shadow-sm">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full gradient-brand text-white shadow-brand">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="mt-4 text-2xl font-bold">{formatUsd(confirm.amount)} USDC</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sent to {shortAddr(confirm.to)}</p>
          <div className="mt-4 rounded-2xl bg-muted p-3 text-left text-xs">
            <div className="text-muted-foreground">Transaction hash</div>
            <div className="break-all font-mono">{confirm.hash}</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={explorerTx(confirm.hash)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-medium">
              <ExternalLink className="h-4 w-4" /> Explorer
            </a>
            <button onClick={() => navigate({ to: "/" })} className="rounded-2xl gradient-brand py-3 text-sm font-semibold text-white shadow-brand">
              Done
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8">
      <PageHeader title="Transfer" subtitle={`Available: ${formatUsd(balance)} USDC`} />
      <div className="space-y-4">
        <div className="rounded-3xl bg-card p-4 shadow-sm">
          <label className="text-xs font-semibold text-muted-foreground">Recipient address</label>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" className="mt-1 w-full bg-transparent text-base font-mono outline-none" />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Quick contacts</div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {contacts.map((c) => (
              <button key={c.name} onClick={() => setTo(c.addr)} className="flex shrink-0 flex-col items-center gap-1">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-pink-200 to-purple-200 text-2xl">{c.emoji}</div>
                <span className="text-xs font-medium">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-3xl gradient-soft p-6 text-center">
          <div className="text-xs font-semibold text-muted-foreground">Amount (USDC)</div>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="mt-1 w-full bg-transparent text-center text-5xl font-bold tabular-nums outline-none placeholder:text-foreground/30" />
          <div className="mt-2 flex justify-center gap-2">
            {[10, 50, 100, 500].map((v) => (
              <button key={v} onClick={() => setAmount(String(v))} className="rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm">+{v}</button>
            ))}
          </div>
        </div>
        <div className="rounded-3xl bg-card p-4 shadow-sm">
          <label className="text-xs font-semibold text-muted-foreground">Message (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lunch yesterday 🍣" className="mt-1 w-full bg-transparent outline-none" />
        </div>
        <button onClick={submit} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-brand py-4 font-semibold text-white shadow-brand disabled:opacity-50">
          <Send className="h-5 w-5" /> {loading ? "Sending…" : "Send USDC"}
        </button>
      </div>
    </div>
  );
}