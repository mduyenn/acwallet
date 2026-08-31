import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";
import { useWallet, formatUsd } from "@/lib/wallet-store";
import { explorerTx } from "@/lib/arc";
import { toast } from "sonner";
import { Zap, Droplet, Wifi, Phone, Tv, Sparkles, Receipt, Wallet } from "lucide-react";

export const Route = createFileRoute("/bills")({
  component: BillsPage,
});

// Real BillReceiver contracts deployed on Arc Testnet.
// Source: contracts/BillReceiver.sol (deployed via scripts/deploy.mjs).
// Each contract accepts native USDC via receive() and emits BillPaid(payer, amount, timestamp).
const bills = [
  { id: "electric", name: "Electricity", icon: Zap, color: "from-amber-400 to-orange-500", price: 0.5, to: "0xc75fc2669a2d4816b89b61a063866e043bb5d8d9" },
  { id: "water", name: "Water", icon: Droplet, color: "from-cyan-400 to-blue-500", price: 0.2, to: "0xa58ec21a75874325435754c85296f67f35619844" },
  { id: "internet", name: "Internet", icon: Wifi, color: "from-violet-400 to-purple-500", price: 0.3, to: "0x32fe4d4adff3a62c2c2b7f40796c7031fcf529ee" },
  { id: "phone", name: "Phone", icon: Phone, color: "from-emerald-400 to-teal-500", price: 0.1, to: "0x797a8af5a6e93fbde9f58c01c49eaa19735a7712" },
  { id: "netflix", name: "Netflix", icon: Tv, color: "from-red-500 to-rose-600", price: 0.15, to: "0x8a5947bdc5406644ef497ad3805b8f984f2209cc" },
  { id: "spotify", name: "Spotify", icon: Sparkles, color: "from-green-400 to-emerald-500", price: 0.1, to: "0x18173756ea87123270606cfd5fe758f0e1849e19" },
  { id: "steam", name: "Steam wallet", icon: Receipt, color: "from-slate-500 to-slate-700", price: 0.25, to: "0x4532a17735c1a6886818b2b288dae5b68fb2a54e" },
  { id: "google", name: "Google Play", icon: Sparkles, color: "from-blue-400 to-sky-500", price: 0.2, to: "0x5ffd8a532106bddbcb9ae69ae3b72a3c41b13341" },
  { id: "apple", name: "Apple", icon: Sparkles, color: "from-zinc-400 to-zinc-600", price: 0.2, to: "0x9869011005647a88dda7c864358041d05675ff38" },
];

function BillsPage() {
  const { balance, sendUsdc, isExternalWallet, address } = useWallet();
  const [paying, setPaying] = useState<string | null>(null);

  const pay = async (b: (typeof bills)[number]) => {
    if (!address) return toast.error("Connect a wallet first");
    if (b.price > balance) return toast.error("Insufficient USDC balance");
    setPaying(b.id);
    try {
      const tx = await sendUsdc(b.to, b.price, `${b.name} bill`);
      if (isExternalWallet && tx.hash) {
        toast.success(`${b.name} — signed on-chain`, {
          description: "Tap to view on ArcScan",
          action: { label: "Explorer", onClick: () => window.open(explorerTx(tx.hash!), "_blank") },
        });
      } else {
        toast.success(`${b.name} paid`);
      }
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Transaction rejected");
    } finally {
      setPaying(null);
    }
  };

  return (
    <div className="px-4 lg:px-8">
      <PageHeader
        title="Bills & services"
        subtitle={`Balance: ${formatUsd(balance)} USDC${isExternalWallet ? " · signed on Arc Testnet" : ""}`}
      />
      {isExternalWallet && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500/10 to-cyan-500/10 px-4 py-2 text-xs font-medium text-foreground/80">
          <Wallet className="h-4 w-4" /> Payments will prompt your connected wallet to approve each on-chain transaction.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {bills.map((b) => {
          const Icon = b.icon;
          return (
            <div key={b.id} className="rounded-3xl bg-card p-4 shadow-sm">
              <div className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${b.color} text-white shadow-md`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="mt-3 font-semibold">{b.name}</div>
              <div className="text-xs text-muted-foreground">Due now</div>
              <div className="mt-2 text-lg font-bold tabular-nums">{formatUsd(b.price)} <span className="text-xs font-medium text-muted-foreground">USDC</span></div>
              <button onClick={() => pay(b)} disabled={paying === b.id} className="mt-3 w-full rounded-2xl gradient-brand py-2 text-sm font-semibold text-white shadow-brand disabled:opacity-50">
                {paying === b.id ? "Paying…" : "Pay now"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}