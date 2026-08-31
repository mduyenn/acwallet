import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Home, Send, QrCode, Receipt, User, LayoutDashboard, Wallet, PieChart, Bell, Users, Sparkles, Leaf } from "lucide-react";
import { useWallet } from "@/lib/wallet-store";
import acWalletLogo from "@/assets/ac-wallet-icon.png.asset.json";

type NavItem = { to: string; label: string; icon: typeof Home; primary?: boolean };
const navItems: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/scan", label: "Scan", icon: QrCode },
  { to: "/pilot", label: "Pilot", icon: Sparkles, primary: true },
  { to: "/earn", label: "Earn", icon: Leaf },
  { to: "/profile", label: "Profile", icon: User },
];

const sideItems: { to: string; label: string; icon: typeof Home }[] = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/pilot", label: "AC Pilot ✨", icon: Sparkles },
  { to: "/earn", label: "Earn 🌱", icon: Leaf },
  { to: "/transfer", label: "Transfer", icon: Send },
  { to: "/receive", label: "Receive", icon: Wallet },
  { to: "/scan", label: "Scan QR", icon: QrCode },
  { to: "/history", label: "Activity", icon: Receipt },
  { to: "/bills", label: "Bills", icon: Receipt },
  { to: "/split", label: "Split Bill", icon: Users },
  { to: "/budget", label: "Budget", icon: PieChart },
  { to: "/reminders", label: "Reminders", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
];


export function AppShell() {
  const { address, email, hydrated, isDemo, startAutoSync, stopAutoSync } = useWallet();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated && !address && !email && path !== "/auth") {
      navigate({ to: "/auth" });
    }
  }, [hydrated, address, email, path, navigate]);

  useEffect(() => {
    if (address) startAutoSync();
    return () => stopAutoSync();
  }, [address, startAutoSync, stopAutoSync]);

  if (path === "/auth") {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-background">
      {isDemo && (
        <div className="sticky top-0 z-50 bg-amber-500/95 px-4 py-1.5 text-center text-[11px] font-semibold text-amber-950">
          Demo mode · sandbox balance, simulated transactions
        </div>
      )}
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-sidebar lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-6 py-6">
          <Logo />
          <div>
            <div className="text-xl font-bold tracking-tight">AC WALLET</div>
            <div className="text-sm text-muted-foreground">Arc Testnet</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {sideItems.map((item) => {
            const active = path === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as string}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold transition ${
                  active
                    ? "gradient-brand text-white shadow-brand"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 rounded-2xl gradient-soft p-4 text-xs">
          <div className="font-semibold text-foreground">Powered by</div>
          <div className="mt-0.5 text-muted-foreground">Arc Testnet · Chain 5042002</div>
        </div>
      </aside>

      {/* Main */}
      <main className="lg:pl-64">
        <div
          className="mx-auto w-full max-w-2xl lg:max-w-5xl lg:pb-10"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 112px)" }}
        >
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md px-3 lg:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        <div className="glass relative grid grid-cols-5 items-end rounded-[28px] px-1.5 pb-2 pt-2 shadow-card">
          {navItems.map((item) => {
            const active = path === item.to;
            const Icon = item.icon;
            if (item.primary) {
              return (
                <Link
                  key={item.to}
                  to={item.to as string}
                  aria-label={item.label}
                  className="flex min-w-0 flex-col items-center gap-1"
                >
                  <span className="-mt-9 flex h-[58px] w-[58px] items-center justify-center rounded-full gradient-brand text-white shadow-brand ring-4 ring-background animate-pulse-glow transition active:scale-95">
                    <Icon className="h-7 w-7" />
                  </span>
                  <span className={`text-[11px] font-bold ${active ? "text-brand" : "text-muted-foreground"}`}>
                    {item.label}
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={item.to}
                to={item.to as string}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-[11px] font-semibold transition ${
                  active ? "text-brand" : "text-muted-foreground"
                }`}
              >
                <Icon className={`h-[22px] w-[22px] ${active ? "scale-110" : ""} transition-transform`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function Logo({ width = 52, height = 40 }: { width?: number; height?: number }) {
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-[12px] bg-white/10 shadow-brand ring-1 ring-white/20 p-1"
      style={{ width, height }}
    >
      <img src={acWalletLogo.url} alt="AC WALLET" className="h-full w-full object-contain" />
    </div>
  );
}