import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are AC Pilot, the AI financial copilot inside AC WALLET (a mobile-first Web3 wallet on Arc Testnet, USDC-native).

Your job:
- Explain wallet activity, transactions, spending patterns and portfolio performance like a professional fintech analyst.
- Answer natural-language questions about the user's on-chain data using ONLY the WALLET CONTEXT provided.
- Surface personalized insights, flag risks (idle funds, unusual outflows, concentration, low balance vs. budgets), and point out yield opportunities (Morpho, Aave, Spark, and similar) when assets sit idle.
- Use the user's language (reply in Vietnamese if they write Vietnamese).

Formatting rules (the app renders your answer as Markdown):
- Use short sections with bold headings (e.g. **Tổng quan**, **Phân tích chi tiêu**, **Khuyến nghị**), never raw symbols like ## or ** inside plain text mid-sentence.
- Put a blank line between sections and bullets so everything is clearly spaced.
- Bold ONLY the important figures: amounts, inflow/outflow, balances, APY, dates, percentages (e.g. **90 USDC**, **+25.5 USDC/tháng**, **4.2% APY**).
- Use clean bullet lists (- item), at most 4-6 bullets per section; keep each bullet to one line when possible.
- NEVER use long dashes (— or –) or decorative symbols. Use a colon (:) or a period instead, like a professional banking report.
- Keep the whole answer concise and scannable: premium fintech tone, no filler, no emojis except a single ✨ or 🌱 when truly relevant.

Hard rules:
- Never invent balances, transactions or APYs that are not in the context. If data is missing, say so and suggest syncing the wallet.
- Everything you say is informational only, never financial advice, and yields are variable and not guaranteed. Add a brief reminder when you discuss earning or risk.
- Never ask for private keys or seed phrases.`;

export const Route = createFileRoute("/api/pilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        const openaiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey && !openaiKey) return new Response("AI is not configured", { status: 500 });


        let body: { messages?: Msg[]; context?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
        if (messages.length === 0) return new Response("No messages", { status: 400 });

        const input = [
          { role: "system" as const, content: [{ type: "input_text" as const, text: SYSTEM }] },
          {
            role: "system" as const,
            content: [
              {
                type: "input_text" as const,
                text: `WALLET CONTEXT (live snapshot):\n${body.context ?? "No wallet data available."}`,
              },
            ],
          },
          ...messages.map((m) => ({
            role: m.role,
            content: [
              m.role === "assistant"
                ? { type: "output_text" as const, text: m.content }
                : { type: "input_text" as const, text: m.content },
            ],
          })),
        ];

        const callOpenAI = () =>
          fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              input,
              stream: true,
              store: false,
            }),
          });

        const callGateway = () =>
          fetch("https://ai.gateway.lovable.dev/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": apiKey!,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: "openai/gpt-5.6-sol",
              input,
              stream: true,
              store: false,
              reasoning: { effort: "low", summary: "auto" },
            }),
          });

        // Prefer the app's own OpenAI API key; fall back to the hosted AI gateway.
        let upstream = openaiKey ? await callOpenAI() : await callGateway();
        if ((!upstream.ok || !upstream.body) && openaiKey && apiKey) {
          upstream = await callGateway();
        }

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          const message =
            upstream.status === 429
              ? "AC Pilot is rate limited right now. Please try again in a moment."
              : upstream.status === 402
                ? "AI credits are exhausted for this workspace. Add credits to keep chatting with AC Pilot."
                : text || "AC Pilot could not answer right now.";
          return new Response(message, { status: upstream.status || 500 });
        }


        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const reader = upstream.body!.getReader();
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.startsWith("data:")) continue;
                  const payload = line.slice(5).trim();
                  if (!payload || payload === "[DONE]") continue;
                  try {
                    const evt = JSON.parse(payload);
                    if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
                      controller.enqueue(encoder.encode(evt.delta));
                    }
                  } catch {
                    /* ignore partial frames */
                  }
                }
              }
            } catch (e) {
              console.error("AC Pilot stream error", e);
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});
