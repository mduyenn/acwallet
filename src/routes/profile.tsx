import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useWallet, shortAddr } from "@/lib/wallet-store";
import { Copy, ExternalLink, LogOut, Moon, Languages, ShieldCheck } from "lucide-react";
import { explorerAddress } from "@/lib/arc";
import { toast } from "sonner";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { email, address, logout, isExternalWallet } = useWallet();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <div className="px-4 lg:px-8">
      <PageHeader title="Profile" />
      <div className="rounded-3xl gradient-card p-6 text-white shadow-card">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-white/20 text-2xl font-bold backdrop-blur">
            {email?.[0]?.toUpperCase() ?? "A"}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{email ?? "N/A"}</div>
            <div className="text-xs text-white/70">{isExternalWallet ? "External wallet" : "Smart wallet"}</div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-white/15 p-3 backdrop-blur">
          <div className="text-[10px] uppercase tracking-wider text-white/60">Wallet address</div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-sm">{shortAddr(address)}</span>
            <div className="flex gap-1">
              <button onClick={async () => { if (address) { await navigator.clipboard.writeText(address); toast.success("Copied"); } }} className="grid h-8 w-8 place-items-center rounded-xl bg-white/15">
                <Copy className="h-4 w-4" />
              </button>
              <a href={address ? explorerAddress(address) : "#"} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-xl bg-white/15">
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border overflow-hidden rounded-3xl bg-card shadow-sm">
        <Row icon={ShieldCheck} label="Network" value="Arc Testnet · 5042002" />
        <Row icon={Moon} label="Dark mode" right={<Switch on={dark} onChange={toggleDark} />} />
        <Row icon={Languages} label="Language" value="English" />
      </div>

      <button onClick={() => { logout(); navigate({ to: "/auth" }); }} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 font-semibold text-rose-600">
        <LogOut className="h-4 w-4" /> Log out
      </button>
    </div>
  );
}

function Row({ icon: Icon, label, value, right }: { icon: ComponentType<{ className?: string }>; label: string; value?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-muted"><Icon className="h-5 w-5" /></div>
      <div className="flex-1 text-sm font-medium">{label}</div>
      {value && <span className="text-xs text-muted-foreground">{value}</span>}
      {right}
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={`relative h-6 w-11 rounded-full transition ${on ? "gradient-brand" : "bg-muted"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-5" : "left-0.5"}`} />
    </button>
  );
}