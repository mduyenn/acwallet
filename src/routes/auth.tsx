import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet-store";
import { Mail, Wallet, ArrowRight, Shield, Sparkles, ShieldCheck, Zap, Link2, FlaskConical, Palette } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import acWalletIcon from "@/assets/ac-wallet-icon.png.asset.json";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const THEMES = [
  {
    id: "aurora",
    label: "Aurora",
    swatch: "linear-gradient(135deg,#7c3aed,#06b6d4)",
    bg: "linear-gradient(140deg,#4c1d95 0%,#7c3aed 25%,#2563eb 70%,#06b6d4 100%)",
    blobs: ["bg-violet-400/40", "bg-cyan-400/35", "bg-fuchsia-500/35"],
    title: "linear-gradient(90deg,#c4b5fd,#ffffff,#67e8f9)",
  },
  {
    id: "midnight",
    label: "Midnight",
    swatch: "linear-gradient(135deg,#0f172a,#3b82f6)",
    bg: "linear-gradient(150deg,#020617 0%,#0f172a 40%,#1e293b 70%,#1d4ed8 100%)",
    blobs: ["bg-blue-500/30", "bg-indigo-500/30", "bg-sky-400/25"],
    title: "linear-gradient(90deg,#bfdbfe,#ffffff,#93c5fd)",
  },
  {
    id: "sunset",
    label: "Sunset",
    swatch: "linear-gradient(135deg,#f97316,#db2777)",
    bg: "linear-gradient(145deg,#7c2d12 0%,#db2777 45%,#9333ea 80%,#f59e0b 100%)",
    blobs: ["bg-orange-400/35", "bg-pink-500/35", "bg-amber-400/30"],
    title: "linear-gradient(90deg,#fed7aa,#ffffff,#fbcfe8)",
  },
] as const;

function AuthPage() {
  const { loginEmail, loginDemo, connectInjected } = useWallet();
  const navigate = useNavigate();
  const [step, setStep] = useState<"choose" | "email" | "otp">("choose");
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [themeId, setThemeId] = useState<string>(() => {
    if (typeof window === "undefined") return "aurora";
    return localStorage.getItem("acwallet.authTheme") ?? "aurora";
  });
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  useEffect(() => {
    try {
      localStorage.setItem("acwallet.authTheme", themeId);
    } catch {}
  }, [themeId]);
  const handledRef = useRef(false);

  // Auto-login: works both when the magic link is clicked (this tab is
  // re-opened with a session) and when the link is opened elsewhere while
  // this tab stays open.
  useEffect(() => {
    const enter = (userEmail?: string | null) => {
      if (handledRef.current) return;
      handledRef.current = true;
      loginEmail(userEmail ?? email);
      toast.success("Welcome to AC WALLET");
      navigate({ to: "/" });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) enter(data.session.user.email);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
        enter(session.user.email);
      }
    });
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("acwallet.auth");
      channel.onmessage = (ev) => {
        const data = ev.data as { type?: string; email?: string } | null;
        if (data?.type === "login" && data.email) enter(data.email);
      };
    } catch {}
    return () => {
      sub.subscription.unsubscribe();
      channel?.close();
    };
  }, [email, loginEmail, navigate]);


  // 5-minute OTP validity countdown
  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step, secondsLeft]);

  const sendOtp = async () => {
    if (!email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: mode === "signup", emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) {
      if (mode === "signin" && /signups not allowed|not found|user/i.test(error.message)) {
        toast.error("No account for this email. Tap Sign up to create one");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success(
      mode === "signup"
        ? "Account created. We sent a 6-digit code to your email (valid 5 minutes)"
        : "We sent a 6-digit code to your email (valid 5 minutes)",
    );
    setOtp("");
    setSecondsLeft(300);
    setStep("otp");
  };

  const verify = async () => {
    if (otp.length < 6) {
      toast.error("Enter the OTP");
      return;
    }
    if (secondsLeft <= 0) {
      toast.error("Code expired. Request a new one");
      return;
    }
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    setVerifying(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    handledRef.current = true;
    loginEmail(email);
    toast.success("Welcome to AC WALLET");
    navigate({ to: "/" });
  };

  const connectWallet = async () => {
    try {
      await connectInjected();
      toast.success("Wallet connected to Arc Testnet");
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to connect");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      {/* AC WALLET gradient background: purple to cyan */}
      <motion.div
        key={theme.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="absolute inset-0 -z-10"
        style={{ backgroundImage: theme.bg }}
      />
      <div className={`pointer-events-none absolute -left-40 top-10 -z-10 h-[32rem] w-[32rem] rounded-full blur-[120px] transition-colors duration-700 ${theme.blobs[0]}`} />
      <div className={`pointer-events-none absolute -right-40 top-1/3 -z-10 h-[32rem] w-[32rem] rounded-full blur-[120px] transition-colors duration-700 ${theme.blobs[1]}`} />
      <div className={`pointer-events-none absolute -bottom-40 left-1/4 -z-10 h-[32rem] w-[32rem] rounded-full blur-[120px] transition-colors duration-700 ${theme.blobs[2]}`} />
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
        {/* Top badge */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider backdrop-blur-md ring-1 ring-white/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
            Arc Testnet · Live
          </span>
          <span className="text-[11px] font-medium text-white/70">v1.0</span>
        </div>

        {/* Centered AC WALLET logo */}
        <div className="mt-4 flex flex-1 flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.75, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 14 }}
            className="relative"
          >
            {/* Soft glow halo */}
            <div className="absolute left-1/2 top-1/2 -z-10 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25 blur-[70px]" />
            {/* Floating 3D icon with soft edges */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="relative h-44 w-44"
            >
              <img
                src={acWalletIcon.url}
                alt="AC WALLET"
                className="h-full w-full object-contain [filter:drop-shadow(0_2px_2px_rgba(255,255,255,0.35))_drop-shadow(0_18px_28px_rgba(23,10,60,0.35))_drop-shadow(0_36px_60px_rgba(10,5,40,0.28))]"
              />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 flex w-full flex-col items-center text-center"
          >
            <h1 className="font-display text-[56px] font-black leading-[0.95] tracking-[-0.04em] drop-shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
              <span className="block bg-clip-text text-transparent" style={{ backgroundImage: theme.title }}>
                AC WALLET
              </span>
            </h1>
            <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold">
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/20 backdrop-blur">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Secure
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/20 backdrop-blur">
                <Zap className="h-3.5 w-3.5 text-amber-300" /> Fast
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/20 backdrop-blur">
                <Link2 className="h-3.5 w-3.5 text-cyan-300" /> Simple
              </span>
            </div>
          </motion.div>
        </div>

        <div className="mt-auto space-y-3 pt-8">
          {step === "choose" && (
            <>
              <button
                onClick={() => setStep("email")}
                className="group flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-violet-700 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)] ring-1 ring-white/50 transition hover:scale-[1.02]"
              >
                <span className="flex items-center gap-3 font-semibold">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 text-white">
                    <Mail className="h-4 w-4" />
                  </span>
                  Continue with email
                </span>
                <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </button>
              <button
                onClick={connectWallet}
                className="group flex w-full items-center justify-between rounded-2xl bg-white/10 px-5 py-4 text-white backdrop-blur-md ring-1 ring-white/25 transition hover:bg-white/15"
              >
                <span className="flex items-center gap-3 font-semibold">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <Wallet className="h-4 w-4" />
                  </span>
                  Connect existing wallet
                </span>
                <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </button>
              <button
                onClick={() => {
                  loginDemo();
                  toast.success("Demo mode: sandbox funds, no real money");
                  navigate({ to: "/" });
                }}
                className="group flex w-full items-center justify-between rounded-2xl bg-white/10 px-5 py-4 text-white backdrop-blur-md ring-1 ring-white/25 transition hover:bg-white/15"
              >
                <span className="flex items-center gap-3 font-semibold">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <FlaskConical className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col items-start leading-tight">
                    Try demo mode
                    <span className="text-[11px] font-medium text-white/70">No real data · full app experience</span>
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </button>

              {/* Theme switcher */}
              <div className="flex items-center justify-center gap-2 pt-3">
                <Palette className="h-3.5 w-3.5 text-white/60" />
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setThemeId(t.id)}
                    aria-label={t.label}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold backdrop-blur transition ${
                      themeId === t.id
                        ? "bg-white/25 ring-1 ring-white/60"
                        : "bg-white/10 ring-1 ring-white/20 hover:bg-white/15"
                    }`}
                  >
                    <span className="h-3 w-3 rounded-full ring-1 ring-white/50" style={{ backgroundImage: t.swatch }} />
                    {t.label}
                  </button>
                ))}
              </div>

              <p className="pt-4 text-center text-[11px] text-white/70">
                <Shield className="mr-1 inline h-3 w-3" />
                Non-custodial · No keys leave your device
              </p>
            </>
          )}
          {step === "email" && (
            <div className="space-y-3 rounded-3xl bg-white/95 p-5 text-foreground shadow-2xl backdrop-blur">
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1 text-sm font-semibold">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-xl py-2 transition ${
                      mode === m ? "gradient-brand text-white shadow-brand" : "text-muted-foreground"
                    }`}
                  >
                    {m === "signin" ? "Sign in" : "Sign up"}
                  </button>
                ))}
              </div>
              <label className="text-sm font-semibold">Email address</label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-brand"
              />
              <p className="text-[11px] text-muted-foreground">
                {mode === "signup"
                  ? "We'll create your AC WALLET account and a wallet address for you."
                  : "Sign in to an existing AC WALLET account."}
              </p>
              <button
                onClick={sendOtp}
                disabled={sending}
                className="w-full rounded-2xl gradient-brand py-3 font-semibold text-white shadow-brand disabled:opacity-60"
              >
                {sending ? "Sending…" : mode === "signup" ? "Create account & send OTP" : "Send OTP"}
              </button>
              <button onClick={() => setStep("choose")} className="w-full text-xs text-muted-foreground">
                Back
              </button>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-3 rounded-3xl bg-white/95 p-5 text-foreground shadow-2xl backdrop-blur">
              <div className="text-sm">
                We sent a code to <span className="font-semibold">{email}</span>
              </div>
              <input
                inputMode="numeric"
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="text-center text-xs font-medium text-muted-foreground">
                {secondsLeft > 0 ? (
                  <>
                    Code expires in{" "}
                    <span className="font-semibold text-foreground">
                      {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
                      {String(secondsLeft % 60).padStart(2, "0")}
                    </span>
                  </>
                ) : (
                  <span className="text-destructive">Code expired. Request a new one</span>
                )}
              </div>
              <button
                onClick={verify}
                disabled={verifying || secondsLeft <= 0}
                className="w-full rounded-2xl gradient-brand py-3 font-semibold text-white shadow-brand disabled:opacity-60"
              >
                {verifying ? "Verifying…" : "Verify & enter AC WALLET"}
              </button>
              <button
                onClick={sendOtp}
                disabled={sending}
                className="w-full text-xs font-semibold text-brand disabled:opacity-60"
              >
                {sending ? "Sending…" : "Resend code"}
              </button>
              <button onClick={() => setStep("email")} className="w-full text-xs text-muted-foreground">
                Change email
              </button>
              <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-[11px] text-emerald-800">
                <Sparkles className="h-3.5 w-3.5" /> Enter the 6-digit code, or just tap the link in the
                email. This page signs you in automatically.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
