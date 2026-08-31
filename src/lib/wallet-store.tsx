import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ARC_CHAIN_ID, USDC_ADDRESS, USDC_DECIMALS, fetchUsdcBalance, fetchUsdcTransfers, publicClient } from "./arc";
import { parseUnits, encodeFunctionData, erc20Abi } from "viem";
import { supabase } from "@/integrations/supabase/client";

export type Tx = {
  id: string;
  type: "send" | "receive" | "bill" | "split" | "faucet";
  counterparty?: string;
  label: string;
  amount: number; // positive = in, negative = out
  status: "pending" | "confirmed" | "failed";
  hash?: string;
  timestamp: number;
  note?: string;
};

export type Reminder = {
  id: string;
  title: string;
  amount: number;
  date: string; // ISO
  repeat: "once" | "monthly" | "weekly";
};

export type BudgetCategory = {
  id: string;
  name: string;
  icon: string;
  limit: number;
  spent: number;
  color: string;
};

export type SplitGroup = {
  id: string;
  name: string;
  emoji: string;
  total: number;
  members: { name: string; paid: boolean; share: number }[];
  createdAt: number;
};

type WalletState = {
  email: string | null;
  address: string | null;
  isExternalWallet: boolean; // true if connected via injected
  isDemo: boolean; // demo/sandbox mode — no real funds, simulated transactions
  balance: number;
  syncing: boolean;
  lastSync: number | null;
  txs: Tx[];
  reminders: Reminder[];
  budgets: BudgetCategory[];
  splits: SplitGroup[];
};

type WalletCtx = WalletState & {
  hydrated: boolean;
  loginEmail: (email: string) => void;
  loginDemo: () => void;
  connectInjected: () => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  startAutoSync: () => void;
  stopAutoSync: () => void;
  boostSync: (durationMs?: number) => void;
  addTx: (tx: Omit<Tx, "id" | "timestamp">) => Tx;
  sendUsdc: (to: string, amount: number, note?: string) => Promise<Tx>;
  addReminder: (r: Omit<Reminder, "id">) => void;
  removeReminder: (id: string) => void;
  addBudget: (b: Omit<BudgetCategory, "id" | "spent">) => void;
  addSplit: (s: Omit<SplitGroup, "id" | "createdAt">) => void;
  togglePaid: (groupId: string, memberIdx: number) => void;
};

const Ctx = createContext<WalletCtx | null>(null);

const STORAGE_KEY = "acwallet.state.v1";
const IDLE_MS = 10 * 60 * 1000; // 10 minutes of inactivity → auto sign-out
const ACTIVITY_KEY = "acwallet.lastActivity";

function randomAddress(): string {
  const hex = "0123456789abcdef";
  let a = "0x";
  for (let i = 0; i < 40; i++) a += hex[Math.floor(Math.random() * 16)];
  return a;
}

async function ensureArcTestnet(eth: any) {
  const hexId = "0x" + ARC_CHAIN_ID.toString(16);
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (err: any) {
    // 4902 = chain not added; some wallets return -32603 / no code
    if (err?.code === 4902 || err?.code === -32603 || !err?.code) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: "Arc Testnet",
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
            rpcUrls: ["https://rpc.testnet.arc.network"],
            blockExplorerUrls: ["https://testnet.arcscan.app"],
          },
        ],
      });
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
    } else {
      throw err;
    }
  }
}

function defaultBudgets(): BudgetCategory[] {
  return [
    { id: "b1", name: "Food", icon: "🍜", limit: 500, spent: 230, color: "from-pink-400 to-rose-500" },
    { id: "b2", name: "Shopping", icon: "🛍️", limit: 800, spent: 410, color: "from-purple-400 to-fuchsia-500" },
    { id: "b3", name: "Entertainment", icon: "🎬", limit: 200, spent: 75, color: "from-blue-400 to-indigo-500" },
    { id: "b4", name: "Transport", icon: "🚗", limit: 300, spent: 120, color: "from-amber-400 to-orange-500" },
    { id: "b5", name: "Education", icon: "📚", limit: 400, spent: 80, color: "from-emerald-400 to-teal-500" },
    { id: "b6", name: "Healthcare", icon: "💊", limit: 250, spent: 40, color: "from-cyan-400 to-sky-500" },
  ];
}

function loadState(): Partial<WalletState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function saveState(s: WalletState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(() => ({
    email: null,
    address: null,
    isExternalWallet: false,
    isDemo: false,
    balance: 0,
    syncing: false,
    lastSync: null,
    txs: [],
    reminders: [],
    budgets: defaultBudgets(),
    splits: [],
  }));
  const [hydrated, setHydrated] = useState(false);
  const pollRef = useRef<number | null>(null);
  const boostRef = useRef<number | null>(null);
  const boostEndsRef = useRef<number>(0);
  const idleRef = useRef<number | null>(null);
  const logoutRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const loaded = loadState();
    setState((s) => ({ ...s, ...loaded, syncing: false }));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  // ---- Idle auto sign-out (20 minutes of no activity) ----
  useEffect(() => {
    if (!hydrated || !state.address) return;
    const bump = () => {
      try {
        localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      } catch {}
    };
    bump();
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    idleRef.current = window.setInterval(() => {
      try {
        const last = Number(localStorage.getItem(ACTIVITY_KEY) || "0");
        if (last && Date.now() - last > IDLE_MS) {
          logoutRef.current?.();
        }
      } catch {}
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      if (idleRef.current) {
        clearInterval(idleRef.current);
        idleRef.current = null;
      }
    };
  }, [hydrated, state.address]);

  const refresh = useCallback(async () => {
    if (state.isDemo) {
      setState((s) => ({ ...s, syncing: false, lastSync: Date.now() }));
      return;
    }
    setState((s) => {
      if (!s.address) return s;
      return { ...s, syncing: true };
    });
    const addr = state.address;
    if (!addr) {
      setState((s) => ({ ...s, syncing: false }));
      return;
    }
    // Query RPC + explorer in parallel so on-chain activity shows up
    // even when we only have HTTP access to the explorer.
    const [bal, transfers] = await Promise.all([
      fetchUsdcBalance(addr),
      fetchUsdcTransfers(addr, 15),
    ]);
    setState((s) => {
      const existingHashes = new Set(s.txs.map((t) => t.hash).filter(Boolean) as string[]);
      const imported: Tx[] = transfers
        .filter((t) => t.hash && !existingHashes.has(t.hash))
        .map((t) => {
          const isFaucet = t.amount > 0 && /faucet/i.test(t.from) === false;
          return {
            id: crypto.randomUUID(),
            type: t.amount > 0 ? (isFaucet ? "faucet" : "receive") : "send",
            counterparty: t.amount > 0 ? t.from : t.to,
            label:
              t.amount > 0
                ? `From ${t.from.slice(0, 6)}…${t.from.slice(-4)}`
                : `To ${t.to.slice(0, 6)}…${t.to.slice(-4)}`,
            amount: t.amount,
            status: t.status,
            hash: t.hash,
            timestamp: t.timestamp,
          } as Tx;
        });
      const merged = [...imported, ...s.txs]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 200);
      return { ...s, balance: bal, txs: merged, syncing: false, lastSync: Date.now() };
    });
  }, [state.address]);

  const startAutoSync = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(() => {
      void refresh();
    }, 10000);
  }, [refresh]);

  const stopAutoSync = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const boostSync = useCallback(
    (durationMs = 90_000) => {
      boostEndsRef.current = Date.now() + durationMs;
      if (boostRef.current) return;
      void refresh();
      boostRef.current = window.setInterval(() => {
        if (Date.now() > boostEndsRef.current) {
          if (boostRef.current) {
            clearInterval(boostRef.current);
            boostRef.current = null;
          }
          return;
        }
        void refresh();
      }, 3000);
    },
    [refresh],
  );

  useEffect(
    () => () => {
      stopAutoSync();
      if (boostRef.current) clearInterval(boostRef.current);
    },
    [stopAutoSync],
  );

  // Auto refresh once when address becomes available
  useEffect(() => {
    if (state.address) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.address]);

  const loginEmail = useCallback((email: string) => {
    setState((s) => {
      const addr = s.address && !s.isExternalWallet ? s.address : randomAddress();
      return { ...s, email, address: addr, isExternalWallet: false };
    });
    // Tell every other open tab to sign in too
    try {
      new BroadcastChannel("acwallet.auth").postMessage({ type: "login", email });
    } catch {}
  }, []);


  const loginDemo = useCallback(() => {
    const addr = randomAddress();
    const now = Date.now();
    const demoTxs: Tx[] = [
      {
        id: crypto.randomUUID(),
        type: "faucet",
        counterparty: "Demo faucet",
        label: "Demo faucet top-up",
        amount: 500,
        status: "confirmed",
        timestamp: now - 1000 * 60 * 60 * 5,
      },
      {
        id: crypto.randomUUID(),
        type: "send",
        counterparty: "0xDEMO000000000000000000000000000000000001",
        label: "To 0xDEMO…0001",
        amount: -12.5,
        status: "confirmed",
        note: "Coffee with team",
        timestamp: now - 1000 * 60 * 60 * 2,
      },
      {
        id: crypto.randomUUID(),
        type: "receive",
        counterparty: "0xDEMO000000000000000000000000000000000002",
        label: "From 0xDEMO…0002",
        amount: 42,
        status: "confirmed",
        note: "Split bill refund",
        timestamp: now - 1000 * 60 * 30,
      },
    ];
    setState((s) => ({
      ...s,
      email: "demo@acwallet.app",
      address: addr,
      isExternalWallet: false,
      isDemo: true,
      balance: 529.5,
      lastSync: now,
      txs: demoTxs,
    }));
  }, []);

  const connectInjected = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) {
      throw new Error("No injected wallet found. Install MetaMask or use email login.");
    }
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    const addr = accounts[0];
    await ensureArcTestnet(eth);
    setState((s) => ({ ...s, address: addr, isExternalWallet: true, email: s.email ?? "wallet@acwallet.app" }));
  }, []);

  const logout = useCallback(() => {
    stopAutoSync();
    if (idleRef.current) {
      clearInterval(idleRef.current);
      idleRef.current = null;
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVITY_KEY);
      try {
        void supabase.auth.signOut();
      } catch {}
    }
    setState({
      email: null,
      address: null,
      isExternalWallet: false,
      isDemo: false,
      balance: 0,
      syncing: false,
      lastSync: null,
      txs: [],
      reminders: [],
      budgets: defaultBudgets(),
      splits: [],
    });
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  }, [stopAutoSync]);

  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  // ---- Cross-tab session sync ----
  // Clicking the magic link in one tab signs in every other open tab.
  useEffect(() => {
    if (!hydrated) return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("acwallet.auth");
      channel.onmessage = (ev) => {
        const data = ev.data as { type?: string; email?: string } | null;
        if (data?.type === "login" && data.email) {
          setState((s) => {
            if (s.email === data.email && s.address) return s;
            const addr = s.address && !s.isExternalWallet ? s.address : randomAddress();
            return { ...s, email: data.email!, address: addr, isExternalWallet: false };
          });
        }
      };
    } catch {}

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") && session?.user?.email) {
        const mail = session.user.email;
        setState((s) => {
          if (s.email === mail && s.address) return s;
          const addr = s.address && !s.isExternalWallet ? s.address : randomAddress();
          return { ...s, email: mail, address: addr, isExternalWallet: false };
        });
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      channel?.close();
    };
  }, [hydrated]);


  const addTx: WalletCtx["addTx"] = useCallback((tx) => {
    const full: Tx = { ...tx, id: crypto.randomUUID(), timestamp: Date.now() };
    setState((s) => ({ ...s, txs: [full, ...s.txs].slice(0, 200) }));
    return full;
  }, []);

  // Simulated wallet signature prompt (demo mode / email wallets)
  const [approvalReq, setApprovalReq] = useState<{ to: string; amount: number; note?: string } | null>(null);
  const approvalResolver = useRef<((ok: boolean) => void) | null>(null);
  const requestApproval = useCallback((req: { to: string; amount: number; note?: string }) => {
    return new Promise<boolean>((resolve) => {
      approvalResolver.current = resolve;
      setApprovalReq(req);
    });
  }, []);
  const settleApproval = useCallback((ok: boolean) => {
    approvalResolver.current?.(ok);
    approvalResolver.current = null;
    setApprovalReq(null);
  }, []);



  const sendUsdc: WalletCtx["sendUsdc"] = useCallback(async (to, amount, note) => {
    const isExternal = state.isExternalWallet;
    const from = state.address;
    const eth = typeof window !== "undefined" ? (window as any).ethereum : null;

    if (!state.isDemo && isExternal && eth && from) {
      // Ensure connected wallet is on Arc Testnet before requesting signature
      await ensureArcTestnet(eth);
      const currentChain: string = await eth.request({ method: "eth_chainId" });
      if (parseInt(currentChain, 16) !== ARC_CHAIN_ID) {
        throw new Error("Please switch your wallet to Arc Testnet before paying.");
      }

      const value = parseUnits(String(amount), USDC_DECIMALS);
      // Always use the ERC-20 transfer() interface at the USDC contract.
      // Wallets read decimals=6 from the token contract and display the
      // correct amount (e.g. "1 USDC"), whereas a native value transfer
      // gets rendered with the chain's 18-decimal nativeCurrency metadata.
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [to as `0x${string}`, value],
      });
      let hash: string;
      try {
        hash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from, to: USDC_ADDRESS, data }],
        });
      } catch (e) {
        // Fallback: some biller CAs are plain receive() contracts and don't
        // implement ERC-20 — fall back to native value transfer.
        hash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from, to, value: "0x" + value.toString(16) }],
        });
      }

      const tx: Tx = {
        id: crypto.randomUUID(),
        type: "send",
        counterparty: to,
        label: `To ${to.slice(0, 6)}…${to.slice(-4)}`,
        amount: -Math.abs(amount),
        status: "pending",
        hash,
        timestamp: Date.now(),
        note,
      };
      setState((s) => ({ ...s, txs: [tx, ...s.txs] }));
      (async () => {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
          setState((s) => ({
            ...s,
            txs: s.txs.map((t) =>
              t.id === tx.id ? { ...t, status: receipt.status === "success" ? "confirmed" : "failed" } : t,
            ),
          }));
        } catch {
          setState((s) => ({
            ...s,
            txs: s.txs.map((t) => (t.id === tx.id ? { ...t, status: "failed" } : t)),
          }));
        }
        void refresh();
      })();
      return tx;
    }

    // Simulated path (demo mode or email login without a signer).
    // Still ask for an explicit Confirm / Cancel, like a real wallet prompt.
    const approved = await requestApproval({ to, amount, note });
    if (!approved) {
      const err: any = new Error("Transaction rejected");
      err.shortMessage = "Transaction rejected";
      throw err;
    }
    const hash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    const tx: Tx = {
      id: crypto.randomUUID(),
      type: "send",
      counterparty: to,
      label: `To ${to.slice(0, 6)}…${to.slice(-4)}`,
      amount: -Math.abs(amount),
      status: "pending",
      hash,
      timestamp: Date.now(),
      note,
    };
    setState((s) => ({ ...s, txs: [tx, ...s.txs] }));
    setTimeout(() => {
      setState((s) => ({
        ...s,
        txs: s.txs.map((t) => (t.id === tx.id ? { ...t, status: "confirmed" } : t)),
        balance: Math.max(0, s.balance - Math.abs(amount)),
      }));
    }, 1800);
    return tx;
  }, [state.isExternalWallet, state.address, state.isDemo, refresh, requestApproval]);

  const addReminder: WalletCtx["addReminder"] = useCallback((r) => {
    setState((s) => ({ ...s, reminders: [{ ...r, id: crypto.randomUUID() }, ...s.reminders] }));
  }, []);
  const removeReminder: WalletCtx["removeReminder"] = useCallback((id) => {
    setState((s) => ({ ...s, reminders: s.reminders.filter((r) => r.id !== id) }));
  }, []);

  const addBudget: WalletCtx["addBudget"] = useCallback((b) => {
    setState((s) => ({
      ...s,
      budgets: [...s.budgets, { ...b, id: crypto.randomUUID(), spent: 0 }],
    }));
  }, []);

  const addSplit: WalletCtx["addSplit"] = useCallback((sp) => {
    setState((s) => ({
      ...s,
      splits: [{ ...sp, id: crypto.randomUUID(), createdAt: Date.now() }, ...s.splits],
    }));
  }, []);

  const togglePaid: WalletCtx["togglePaid"] = useCallback((groupId, idx) => {
    setState((s) => ({
      ...s,
      splits: s.splits.map((g) =>
        g.id === groupId
          ? { ...g, members: g.members.map((m, i) => (i === idx ? { ...m, paid: !m.paid } : m)) }
          : g,
      ),
    }));
  }, []);

  const value: WalletCtx = useMemo(
    () => ({
      ...state,
      hydrated,
      loginEmail,
      loginDemo,
      connectInjected,
      logout,
      refresh,
      startAutoSync,
      stopAutoSync,
      boostSync,
      addTx,
      sendUsdc,
      addReminder,
      removeReminder,
      addBudget,
      addSplit,
      togglePaid,
    }),
    [state, hydrated, loginEmail, loginDemo, connectInjected, logout, refresh, startAutoSync, stopAutoSync, boostSync, addTx, sendUsdc, addReminder, removeReminder, addBudget, addSplit, togglePaid],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {approvalReq && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {state.isDemo ? "Demo wallet · Signature request" : "Confirm payment"}
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {state.isDemo ? "Sandbox" : "Arc Testnet"}
              </span>
            </div>
            <div className="mt-4 text-center">
              <div className="text-3xl font-black tabular-nums">
                {formatUsd(approvalReq.amount)} <span className="text-base font-semibold text-muted-foreground">USDC</span>
              </div>
              {approvalReq.note && <div className="mt-1 text-xs text-muted-foreground">{approvalReq.note}</div>}
            </div>
            <div className="mt-4 space-y-2 rounded-2xl bg-muted/50 p-3 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">From</span>
                <span className="font-medium">{shortAddr(state.address)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">To</span>
                <span className="font-medium">{shortAddr(approvalReq.to)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Network fee</span>
                <span className="font-medium">~0.0001 USDC</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => settleApproval(false)}
                className="rounded-2xl bg-muted py-3 text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => settleApproval(true)}
                className="rounded-2xl gradient-brand py-3 text-sm font-semibold text-white shadow-brand"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );

}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export function formatUsd(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shortAddr(a?: string | null) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}