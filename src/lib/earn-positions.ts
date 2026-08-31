import { useCallback, useEffect, useState } from "react";

export type LockPeriod = {
  id: string;
  label: string;
  days: number;
  /** APR multiplier applied to the strategy base APY */
  boost: number;
};

/** Longer lock, higher APR. Boost is applied to each strategy base APY. */
export const LOCK_PERIODS: LockPeriod[] = [
  { id: "7d", label: "7 days", days: 7, boost: 1.0 },
  { id: "14d", label: "14 days", days: 14, boost: 1.08 },
  { id: "30d", label: "30 days", days: 30, boost: 1.2 },
  { id: "60d", label: "60 days", days: 60, boost: 1.35 },
  { id: "90d", label: "90 days", days: 90, boost: 1.55 },
  { id: "12m", label: "12 months", days: 365, boost: 2.0 },
];

/** Early exit before the lock ends returns principal only; all accrued yield is forfeited. */
export const EARLY_EXIT_PENALTY = 1; // 100% of accrued yield is forfeited on early exit

export type EarnPosition = {
  id: string;
  strategyId: string;
  protocol: string;
  emoji: string;
  vault: string;
  principal: number;
  baseApy: number;
  apr: number; // boosted APR at deposit time
  periodId: string;
  periodLabel: string;
  days: number;
  startedAt: number;
  unlockAt: number;
  hash?: string;
  status: "active" | "withdrawn";
};

const KEY = "acwallet.earn.positions.v1";

function read(): EarnPosition[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as EarnPosition[]) : [];
  } catch {
    return [];
  }
}

export function accruedYield(p: EarnPosition, now = Date.now()) {
  const elapsedDays = Math.max(0, (Math.min(now, p.unlockAt) - p.startedAt) / 86_400_000);
  return (p.principal * (p.apr / 100) * elapsedDays) / 365;
}

export function projectedYield(p: EarnPosition) {
  return (p.principal * (p.apr / 100) * p.days) / 365;
}

export function useEarnPositions() {
  const [positions, setPositions] = useState<EarnPosition[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPositions(read());
    setReady(true);
  }, []);

  const persist = useCallback((next: EarnPosition[]) => {
    setPositions(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const addPosition = useCallback(
    (p: Omit<EarnPosition, "id" | "status">) => {
      const full: EarnPosition = { ...p, id: crypto.randomUUID(), status: "active" };
      persist([full, ...read()]);
      return full;
    },
    [persist],
  );

  const closePosition = useCallback(
    (id: string) => {
      persist(read().map((p) => (p.id === id ? { ...p, status: "withdrawn" as const } : p)));
    },
    [persist],
  );

  return { positions, ready, addPosition, closePosition };
}
