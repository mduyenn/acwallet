import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Send, ShieldAlert, TrendingUp, PieChart, RefreshCw, Check, ShieldCheck, Loader2, Leaf, ArrowRight, QrCode, Receipt, Users } from "lucide-react";
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

type Intent = "transfer" | "earn" | "receive" | "scan" | "bills" | "split" | null;

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/(chuyển tiền|chuyen tien|chuyển|gửi tiền|gui tien|transfer|send (usdc|money|to)|thanh toán cho ví|địa chỉ ví)/.test(t))
    return "transfer";
  if (/(earn|yield|lãi|lai suat|lãi suất|staking|stake|apr|apy|chiến lược|chien luoc|đầu tư|dau tu|pool)/.test(t))
    return "earn";
  if (/(nhận tiền|nhan tien|receive|qr của tôi|my qr)/.test(t)) return "receive";
  if (/(quét|quet|scan)/.test(t)) return "scan";
  if (/(hóa đơn|hoa don|bill|điện|nước|internet)/.test(t)) return "bills";
  if (/(chia tiền|chia bill|split)/.test(t)) return "split";
  return null;
}

function extractAddress(text: string): string {
  const m = text.match(/0x[a-fA-F0-9]{40}/);
  return m ? m[0] : "";
}

function extractAmount(text: string): string {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(usdc|usd|\$)?/i);
  return m ? m[1].replace(",", ".") : "";
}

const SUGGESTIONS = [
  "Summarise my wallet activity this week",
  "Where is my money going?",
  "Are there any risks in my wallet?",
  "How could my idle USDC earn yield?",
];

function PilotPage() {
  const { address, balance, txs, budgets, isDemo, lastSync, refresh, syncing, sendUsdc } = useWallet();
  const fetchPortfolio = useServerFn(getPortfolio);
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [intent, setIntent] = useState<Intent>(null);
  const [quickTo, setQuickTo] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payStep, setPayStep] = useState<"recipient" | "amount" | "review" | "done">("recipient");
  const [payError, setPayError] = useState("");
  const [paying, setPaying] = useState(false);
  const [payHash, setPayHash] = useState("");

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
    const detected = detectIntent(text);
    setIntent(detected);
    if (detected === "transfer") {
      setQuickTo(extractAddress(text));
      setQuickAmount(extractAmount(text));
    }
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
        setMessages([...next, { role: "assistant", content: "I couldn't generate an answer. Try rephrasing." }]);
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
              value={portfolio?.available ? `$${portfolio.totalValue.toFixed(0)}` : "N/A"}
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
                ? "Demo mode: portfolio intelligence uses sandbox data."
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
              ? `${formatUsd(balance)} USDC is sitting idle. See Earn 🌱 for yield options.`
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

        {intent === "transfer" && (
          <div className="mt-3 rounded-2xl border border-brand/30 bg-brand/5 p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-brand">
              <Send className="h-4 w-4" /> Lệnh thanh toán dịch vụ trên Arc Testnet
            </div>

            <div className="mt-3 flex items-center gap-1.5">
              {["Địa chỉ", "Số tiền", "Xác nhận"].map((s, i) => {
                const idx = payStep === "recipient" ? 0 : payStep === "amount" ? 1 : 2;
                const done = i < idx || payStep === "done";
                const active = i === idx && payStep !== "done";
                return (
                  <div key={s} className="flex flex-1 items-center gap-1.5">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        done
                          ? "bg-emerald-500 text-white"
                          : active
                            ? "gradient-brand text-white shadow-brand"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span
                      className={`truncate text-[11px] font-semibold ${active ? "text-brand" : "text-muted-foreground"}`}
                    >
                      {s}
                    </span>
                  </div>
                );
              })}
            </div>

            {payStep === "recipient" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Bước 1: nhập địa chỉ ví người nhận (định dạng EVM 0x..., mạng Arc Testnet).
                </p>
                <input
                  value={quickTo}
                  onChange={(e) => setQuickTo(e.target.value)}
                  placeholder="0x... địa chỉ ví người nhận"
                  spellCheck={false}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-brand"
                />
                {payError && <p className="text-[11px] font-semibold text-destructive">{payError}</p>}
                <button
                  onClick={() => {
                    if (!/^0x[a-fA-F0-9]{40}$/.test(quickTo.trim())) {
                      setPayError("Địa chỉ ví không hợp lệ, cần đúng 42 ký tự bắt đầu bằng 0x.");
                      return;
                    }
                    setPayError("");
                    setPayStep("amount");
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl gradient-brand px-4 py-2.5 text-sm font-bold text-white shadow-brand"
                >
                  Tiếp tục <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {payStep === "amount" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Bước 2: nhập số tiền USDC và mô tả dịch vụ cần thanh toán.
                </p>
                <input
                  value={quickAmount}
                  onChange={(e) => setQuickAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="Số tiền USDC"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand"
                />
                <input
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Nội dung, ví dụ: Thanh toán dịch vụ Pizza"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand"
                />
                <p className="text-[11px] text-muted-foreground">
                  Số dư khả dụng: <span className="font-semibold text-foreground">{formatUsd(balance)} USDC</span>
                </p>
                {payError && <p className="text-[11px] font-semibold text-destructive">{payError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setPayError("");
                      setPayStep("recipient");
                    }}
                    className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold"
                  >
                    Quay lại
                  </button>
                  <button
                    onClick={() => {
                      const amt = Number(quickAmount.replace(",", "."));
                      if (!amt || amt <= 0) {
                        setPayError("Vui lòng nhập số tiền lớn hơn 0.");
                        return;
                      }
                      if (amt > balance) {
                        setPayError("Số dư không đủ để thực hiện giao dịch này.");
                        return;
                      }
                      setPayError("");
                      setPayStep("review");
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl gradient-brand px-4 py-2.5 text-sm font-bold text-white shadow-brand"
                  >
                    Xem lại <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {payStep === "review" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Bước 3: kiểm tra và ký xác nhận cuối cùng bằng ví hoặc tài khoản email của bạn.
                </p>
                <div className="rounded-xl border border-border bg-background p-3 text-sm">
                  <Row label="Người nhận" value={quickTo} mono />
                  <Row label="Số tiền" value={`${Number(quickAmount.replace(",", ".")).toFixed(2)} USDC`} />
                  <Row label="Nội dung" value={payNote || "Thanh toán dịch vụ"} />
                  <Row label="Mạng" value={isDemo ? "Sandbox demo" : "Arc Testnet (5042002)"} />
                </div>
                {payError && <p className="text-[11px] font-semibold text-destructive">{payError}</p>}
                <div className="flex gap-2">
                  <button
                    disabled={paying}
                    onClick={() => setPayStep("amount")}
                    className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Sửa
                  </button>
                  <button
                    disabled={paying}
                    onClick={async () => {
                      setPaying(true);
                      setPayError("");
                      try {
                        const tx = await sendUsdc(
                          quickTo.trim(),
                          Number(quickAmount.replace(",", ".")),
                          payNote || "Thanh toán dịch vụ",
                        );
                        setPayHash(tx.hash ?? "");
                        setPayStep("done");
                      } catch (e) {
                        setPayError(e instanceof Error ? e.message : "Giao dịch bị hủy hoặc thất bại.");
                      } finally {
                        setPaying(false);
                      }
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl gradient-brand px-4 py-2.5 text-sm font-bold text-white shadow-brand disabled:opacity-60"
                  >
                    {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    {paying ? "Đang chờ ký..." : "Ký & thanh toán"}
                  </button>
                </div>
              </div>
            )}

            {payStep === "done" && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-600">
                  <Check className="h-4 w-4" /> Thanh toán thành công
                </div>
                {payHash && (
                  <p className="break-all rounded-xl border border-border bg-background p-3 font-mono text-[11px] text-muted-foreground">
                    Tx: {payHash}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setPayStep("recipient");
                      setQuickAmount("");
                      setPayNote("");
                      setPayHash("");
                    }}
                    className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold"
                  >
                    Lệnh mới
                  </button>
                  <button
                    onClick={() => navigate({ to: "/history" })}
                    className="flex-1 rounded-xl gradient-brand px-4 py-2.5 text-sm font-bold text-white shadow-brand"
                  >
                    Xem lịch sử
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {intent && intent !== "transfer" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-brand/30 bg-brand/5 p-3">
            <span className="text-xs font-bold text-brand">Shortcut</span>
            <Shortcut intent={intent} onGo={(to) => navigate({ to })} />
          </div>
        )}


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
        AC Pilot provides informational insights only, not financial advice. Always verify on-chain data yourself.
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

const SHORTCUTS: Record<string, { to: string; label: string; icon: typeof Leaf }> = {
  earn: { to: "/earn", label: "Mở Earn 🌱", icon: Leaf },
  receive: { to: "/receive", label: "Nhận tiền (QR)", icon: QrCode },
  scan: { to: "/scan", label: "Quét mã QR", icon: QrCode },
  bills: { to: "/bills", label: "Thanh toán hóa đơn", icon: Receipt },
  split: { to: "/split", label: "Chia hóa đơn", icon: Users },
};

function Shortcut({ intent, onGo }: { intent: Exclude<Intent, null | "transfer">; onGo: (to: string) => void }) {
  const item = SHORTCUTS[intent];
  if (!item) return null;
  const Icon = item.icon;
  return (
    <button
      onClick={() => onGo(item.to)}
      className="flex items-center gap-2 rounded-xl gradient-brand px-4 py-2 text-sm font-bold text-white shadow-brand"
    >
      <Icon className="h-4 w-4" /> {item.label} <ArrowRight className="h-4 w-4" />
    </button>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={`text-right text-xs font-semibold ${mono ? "break-all font-mono" : ""}`}>{value}</span>
    </div>
  );
}
