import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Send, ShieldAlert, TrendingUp, PieChart, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/PageHeader";
import { useWallet, formatUsd, shortAddr } from "@/lib/wallet-store";
import { getPortfolio, type PortfolioSnapshot } from "@/lib/zerion.functions";

export const Route = createFileRoute("/pilot")({
  head: () => ({
    meta: [
      { title: "AC Pilot | AI copilot for your AC WALLET" },
      {
        name: "description",
        content:
          "Chat with AC Pilot, the AI copilot that explains your wallet activity, spending, portfolio and on-chain risks in plain language.",
      },
      { property: "og:title", content: "AC Pilot | AI copilot for your AC WALLET" },
      {
        property: "og:description",
        content: "Understand your USDC wallet, transactions and portfolio through natural conversation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PilotPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Summarise my wallet activity this week",
  "Where is my money going?",
  "Are there any risks in my wallet?",
  "How could my idle USDC earn yield?",
];

function PilotPage() {
  const { address, balance, txs, budgets, isDemo, lastSync, refresh, syncing } = useWallet();
  const fetchPortfolio = useServerFn(getPortfolio);
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!address || isDemo) return;
    let cancelled = false;
    fetchPortfolio({ data: { address } })
      .then((p) => !cancelled && setPortfolio(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, isDemo, fetchPortfolio]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const spent30d = txs
    .filter((t) => t.amount < 0 && Date.now() - t.timestamp < 30 * 86400_000)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const received30d = txs
    .filter((t) => t.amount > 0 && Date.now() - t.timestamp < 30 * 86400_000)
    .reduce((s, t) => s + t.amount, 0);

  function buildContext() {
    const lines: string[] = [
      `Mode: ${isDemo ? "DEMO / sandbox (simulated funds)" : "Live wallet on Arc Testnet"}`,
      `Address: ${address ?? "not connected"}`,
      `USDC balance on Arc Testnet: ${balance.toFixed(2)} USDC`,
      `Last sync: ${lastSync ? new Date(lastSync).toISOString() : "never"}`,
      `Outflow last 30d: ${spent30d.toFixed(2)} USDC · Inflow last 30d: ${received30d.toFixed(2)} USDC`,
      `Budgets: ${budgets.map((b) => `${b.name} ${b.spent.toFixed(2)}/${b.limit.toFixed(2)}`).join(", ") || "none"}`,
      `Recent transactions (newest first):`,
      ...txs
        .slice(0, 15)
        .map(
          (t) =>
            `- ${new Date(t.timestamp).toISOString().slice(0, 16)} ${t.type} ${t.amount > 0 ? "+" : ""}${t.amount.toFixed(2)} USDC "${t.label}" [${t.status}]${t.counterparty ? ` with ${t.counterparty}` : ""}`,
        ),
    ];
    if (portfolio?.available) {
      lines.push(
        `Zerion multi-chain portfolio: total $${portfolio.totalValue.toFixed(2)} (24h ${portfolio.dayChangePct.toFixed(2)}%), NFTs: ${portfolio.nftCount}, chains: ${portfolio.chains.join(", ") || "n/a"}`,
        `Allocation by type: ${portfolio.allocation.map((a) => `${a.label} $${a.value.toFixed(2)}`).join(", ") || "n/a"}`,
        `Top positions: ${portfolio.positions
          .slice(0, 12)
          .map((p) => `${p.symbol} $${p.value.toFixed(2)} on ${p.chain}${p.protocol ? ` via ${p.protocol}` : ""}`)
          .join(", ") || "none"}`,
      );
    } else {
      lines.push(`Zerion portfolio data unavailable${portfolio?.reason ? ` (${portfolio.reason})` : ""}.`);
    }
    return lines.join("\n");
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || streaming) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/pilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, context: buildContext() }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        setMessages([...next, { role: "assistant", content: msg || "AC Pilot could not answer right now." }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
      }
      if (!acc.trim()) {
        setMessages([...next, { role: "assistant", content: "I couldn't generate an answer — try rephrasing." }]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Network error while reaching AC Pilot." }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="px-4 lg:px-8">
      <PageHeader
        title="AC Pilot ✨"
        subtitle="Your AI financial copilot"
        action={
          <button
            onClick={() => refresh()}
            className="grid h-10 w-10 place-items-center rounded-2xl bg-secondary text-secondary-foreground"
            aria-label="Sync wallet"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </button>
        }
      />

      {/* Context header */}
      <div className="relative overflow-hidden rounded-3xl gradient-card p-5 text-white shadow-card">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs text-white/80">
            <Sparkles className="h-4 w-4" /> Live context · {shortAddr(address) || "no wallet"}
          </div>
          <div className="mt-2 text-3xl font-bold tabular-nums">
            {formatUsd(balance)} <span className="text-base font-medium text-white/80">USDC</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
            <Stat label="Out 30d" value={formatUsd(spent30d)} />
            <Stat label="In 30d" value={formatUsd(received30d)} />
            <Stat
              label="Portfolio"
              value={portfolio?.available ? `$${portfolio.totalValue.toFixed(0)}` : "—"}
            />
          </div>
        </div>
      </div>

      {/* Insight cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Insight
          icon={<TrendingUp className="h-4 w-4" />}
          title="Portfolio"
          body={
            portfolio?.available
              ? `${portfolio.positions.length} positions across ${portfolio.chains.length || 1} chain(s), 24h ${portfolio.dayChangePct.toFixed(2)}%`
              : isDemo
                ? "Demo mode — portfolio intelligence uses sandbox data."
                : "Multi-chain data will appear once the portfolio layer returns your positions."
          }
        />
        <Insight
          icon={<PieChart className="h-4 w-4" />}
          title="Spending"
          body={
            spent30d > 0
              ? `You moved out ${formatUsd(spent30d)} USDC in 30 days across ${txs.filter((t) => t.amount < 0).length} payments.`
              : "No outgoing payments in the last 30 days."
          }
        />
        <Insight
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Idle assets"
          body={
            balance > 10
              ? `${formatUsd(balance)} USDC is sitting idle — see Earn 🌱 for yield options.`
              : "Balance is low; top up before exploring yield."
          }
        />
      </div>

      {/* Chat */}
      <div className="mt-4 rounded-3xl border border-border/60 bg-card/70 p-4 shadow-card backdrop-blur">
        <div className="max-h-[52vh] min-h-[180px] space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
              Hi 👋 I'm AC Pilot. Ask me anything about your wallet, spending, transactions or portfolio.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "whitespace-pre-wrap gradient-brand text-white shadow-brand"
                    : "bg-muted/70 text-foreground"
                }`}
              >
                {m.role === "assistant" ? (
                  m.content ? (
                    <div className="pilot-md space-y-2 leading-relaxed [&_strong]:font-bold [&_strong]:text-foreground [&_ul]:space-y-1.5 [&_ul]:pl-4 [&_li]:list-disc [&_li]:leading-relaxed [&_p]:leading-relaxed">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : streaming ? (
                    "Thinking…"
                  ) : (
                    ""
                  )
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={streaming}
              className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AC Pilot about your wallet…"
            className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl gradient-brand text-white shadow-brand disabled:opacity-50"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>

      <p className="mt-3 pb-4 text-center text-[11px] text-muted-foreground">
        AC Pilot provides informational insights only — not financial advice. Always verify on-chain data yourself.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/15 p-2.5 backdrop-blur">
      <div className="text-white/70">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Insight({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2 text-xs font-semibold text-brand">
        {icon} {title}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
