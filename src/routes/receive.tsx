import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useWallet } from "@/lib/wallet-store";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";

export const Route = createFileRoute("/receive")({
  component: ReceivePage,
});

function ReceivePage() {
  const { address } = useWallet();
  const ref = useRef<HTMLDivElement>(null);

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    toast.success("Address copied");
  };
  const share = async () => {
    if (!address) return;
    if (navigator.share) {
      try { await navigator.share({ title: "My AC WALLET", text: address }); } catch {}
    } else copy();
  };
  const download = () => {
    const canvas = ref.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = "ac-wallet.png"; a.click();
  };

  return (
    <div className="px-4 lg:px-8">
      <PageHeader title="Receive USDC" subtitle="Arc Testnet" />
      <div className="rounded-3xl gradient-soft p-6 text-center">
        <div ref={ref} className="mx-auto inline-block rounded-3xl bg-white p-5 shadow-card">
          {address ? <QRCodeCanvas value={address} size={220} fgColor="#9d174d" /> : <div className="grid h-[220px] w-[220px] place-items-center text-sm text-muted-foreground">No wallet</div>}
        </div>
        <div className="mt-5 text-xs text-muted-foreground">Your wallet address</div>
        <div className="mt-1 break-all rounded-2xl bg-white/70 px-3 py-2 font-mono text-sm">{address ?? "—"}</div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button onClick={copy} className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-medium shadow-sm"><Copy className="h-4 w-4" /> Copy</button>
          <button onClick={share} className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-medium shadow-sm"><Share2 className="h-4 w-4" /> Share</button>
          <button onClick={download} className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-medium shadow-sm"><Download className="h-4 w-4" /> Save</button>
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] text-muted-foreground">Only send USDC on Arc Testnet to this address. Funds on other networks will be lost.</p>
    </div>
  );
}