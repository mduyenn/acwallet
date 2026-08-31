import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/scan")({
  component: ScanPage,
});

function ScanPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let scanner: any;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new mod.Html5Qrcode("acwallet-qr-reader");
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (text: string) => {
            scanner.stop().catch(() => {});
            navigate({ to: "/transfer", search: { to: text, amount: "" } });
          },
          () => {},
        );
        setRunning(true);
      } catch (e) {
        console.warn("Camera unavailable", e);
      }
    })();
    return () => {
      cancelled = true;
      if (scanner) scanner.stop().catch(() => {});
    };
  }, [navigate]);

  const useManual = () => {
    if (!manual.startsWith("0x")) return toast.error("Enter a valid 0x address");
    navigate({ to: "/transfer", search: { to: manual, amount: "" } });
  };

  return (
    <div className="px-4 lg:px-8">
      <PageHeader title="Scan to pay" />
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-black shadow-card">
        <div id="acwallet-qr-reader" ref={ref} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-white/70" />
        {!running && <div className="absolute inset-0 grid place-items-center text-sm text-white/80">Requesting camera…</div>}
      </div>
      <div className="mt-4 rounded-3xl bg-card p-4 shadow-sm">
        <label className="text-xs font-semibold text-muted-foreground">Or paste address</label>
        <div className="mt-1 flex gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="0x…" className="flex-1 rounded-2xl border border-input bg-background px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-brand" />
          <button onClick={useManual} className="rounded-2xl gradient-brand px-4 text-sm font-semibold text-white">Use</button>
        </div>
      </div>
    </div>
  );
}