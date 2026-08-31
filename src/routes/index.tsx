import { createFileRoute, Link } from "@tanstack/react-router";
import { useWallet, formatUsd, shortAddr } from "@/lib/wallet-store";
import { CountUp } from "@/components/CountUp";
import { CIRCLE_FAUCET_URL, explorerAddress } from "@/lib/arc";
import {
  ArrowDownToLine,
  ArrowUpRight,
  QrCode,
  ScanLine,
  ExternalLink,
  Copy,
  RefreshCw,
  Bell,
  Sparkles,
  Zap,
  Wifi,
  Droplet,
  Tv,
  Phone,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { email, address, balance, syncing, lastSync, refresh, boostSync, startAutoSync, stopAutoSync, txs } = useWallet();

  // Continuous background sync with Arc Testnet + explorer while home is open.
  useEffect(() => {
    if (!address) return;
    startAutoSync();
    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopAutoSync();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [address, refresh, startAutoSync, stopAutoSync]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    toast.success("Address copied");
  };

  const openFaucet = async () => {
    if (!address) {
      toast.error("Connect a wallet first");
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
    } catch {}
    window.open(CIRCLE_FAUCET_URL, "_blank", "noopener,noreferrer");
    toast.success("Address copied — paste it into Circle faucet", {
      description:
        "Select USDC · Arc Testnet, paste your address, and confirm. Your balance will update here automatically.",
      duration: 6000,
    });
    // Aggressive real-time poll (3s) for ~3 minutes so the faucet drop shows up instantly.
    boostSync(180_000);
  };

  return (
    <div className="px-4 pt-4 lg:px-8 lg:pt-8">
      {/* Top header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl gradient-brand text-lg font-bold text-white shadow-brand">
            {email?.[0]?.toUpperCase() ?? "A"}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Hello,</div>
            <div className="truncate text-base font-semibold">{email ?? "Welcome"}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground transition hover:bg-accent">
            <Bell className="h-5 w-5" />
          </button>
          <Link to="/profile" className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground transition hover:bg-accent">
            <Sparkles className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Balance card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[28px] gradient-card p-6 text-white shadow-card"
      >
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-pink-300/30 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium backdrop-blur">
              Arc Testnet · USDC
            </span>
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur ${address ? "bg-emerald-400/20 text-emerald-100" : "bg-white/10"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${address ? "bg-emerald-300 animate-pulse" : "bg-white/50"}`} />
              {address ? "Connected" : "Offline"}
            </span>
          </div>

          <div className="mt-6">
            <div className="text-sm/none text-white/70">Available balance</div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-bold tracking-tight tabular-nums lg:text-5xl">
                <CountUp value={balance} />
              </span>
              <span className="pb-1 text-base font-medium text-white/80">USDC</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-white/70">
              {syncing ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Synchronizing with Arc Testnet…
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  Last sync {lastSync ? new Date(lastSync).toLocaleTimeString() : "—"}
                </>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-white/60">Wallet</div>
              <div className="truncate text-sm font-mono">{address ? shortAddr(address) : "Not connected"}</div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button onClick={copyAddress} className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25">
                <Copy className="h-4 w-4" />
              </button>
              <button onClick={() => void refresh()} className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25">
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              </button>
              <a
                href={address ? explorerAddress(address) : "https://testnet.arcscan.app"}
                target="_blank"
                rel="noreferrer"
                className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Action buttons */}
      <div className="mt-5 grid grid-cols-4 gap-2 lg:gap-3">
        <ActionTile icon={ArrowDownToLine} label="Deposit" onClick={openFaucet} />
        <ActionTile icon={ArrowUpRight} label="Transfer" to="/transfer" />
        <ActionTile icon={QrCode} label="Receive" to="/receive" />
        <ActionTile icon={ScanLine} label="Scan" to="/scan" />
      </div>

      {/* Faucet card */}
      <button
        onClick={openFaucet}
        className="mt-5 flex w-full items-center gap-3 rounded-3xl gradient-soft p-4 text-left shadow-sm transition hover:scale-[1.01]"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-2xl shadow-sm">💧</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Get Test USDC</div>
          <div className="truncate text-xs text-muted-foreground">Claim free USDC from Circle Faucet — auto-sync on return</div>
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Services grid */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold lg:text-lg">Pay bills</h2>
          <Link to="/bills" className="text-xs font-medium text-brand">See all</Link>
        </div>
        <div className="grid grid-cols-4 gap-3 lg:grid-cols-8">
          {[
            { icon: Zap, label: "Electric", color: "from-amber-400 to-orange-500" },
            { icon: Droplet, label: "Water", color: "from-cyan-400 to-blue-500" },
            { icon: Wifi, label: "Internet", color: "from-violet-400 to-purple-500" },
            { icon: Phone, label: "Phone", color: "from-emerald-400 to-teal-500" },
            { icon: Tv, label: "Netflix", color: "from-red-500 to-rose-600" },
            { icon: Sparkles, label: "Spotify", color: "from-green-400 to-emerald-500" },
            { icon: Receipt, label: "Steam", color: "from-slate-500 to-slate-700" },
            { icon: Sparkles, label: "Apple", color: "from-zinc-400 to-zinc-600" },
          ].map((b) => {
            const Icon = b.icon;
            return (
              <Link key={b.label} to="/bills" className="flex flex-col items-center gap-2">
                <div className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${b.color} text-white shadow-md`}>
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-[11px] font-medium text-foreground">{b.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent activity */}
      <section className="mt-6 pb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold lg:text-lg">Recent activity</h2>
          <Link to="/history" className="text-xs font-medium text-brand">View all</Link>
        </div>
        <div className="rounded-3xl bg-card p-2 shadow-sm">
          {txs.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No activity yet. Claim USDC from the faucet to get started.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {txs.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg ${t.amount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {t.amount > 0 ? "↓" : "↑"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(t.timestamp).toLocaleString()}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-sm font-bold tabular-nums ${t.amount > 0 ? "text-emerald-600" : "text-foreground"}`}>
                      {t.amount > 0 ? "+" : ""}{formatUsd(t.amount)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.status}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function ActionTile({
  icon: Icon,
  label,
  to,
  onClick,
}: {
  icon: typeof ArrowDownToLine;
  label: string;
  to?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-brand">
      <div className="grid h-11 w-11 place-items-center rounded-2xl gradient-brand text-white shadow-brand">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-[11px] font-semibold">{label}</span>
    </div>
  );
  if (to) return <Link to={to as string}>{inner}</Link>;
  return <button onClick={onClick} className="text-left">{inner}</button>;
}