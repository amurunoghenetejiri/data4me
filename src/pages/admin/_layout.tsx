import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bot,
  LayoutDashboard, Users, Receipt, ArrowDownToLine, ArrowUpFromLine, BadgeCheck,
  Package, BarChart3, Bell, Settings, ShieldCheck, FileClock, Lock, LifeBuoy,
  Database, LogOut, Menu, X, Wifi, CreditCard, Activity, Inbox, Sliders, ArrowLeft, Send, Server, Wallet, Smartphone
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const D4AIAssistant = lazy(() => import("@/components/ai/D4AIAssistant"));

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "User Management", icon: Users },
  { to: "/admin/transactions", label: "Transactions", icon: Receipt },
  { to: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine },
  { to: "/admin/receipt-queue", label: "Receipt Queue", icon: Inbox },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
  { to: "/admin/kyc", label: "KYC", icon: BadgeCheck },
  { to: "/admin/messages", label: "Messages", icon: LifeBuoy },
  { to: "/admin/products", label: "Product Management", icon: Package },
  { to: "/admin/data-plans", label: "Data Plans Management", icon: Wifi },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/activity", label: "Activity Center", icon: Activity },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/devices", label: "Registered Devices", icon: Smartphone },
  { to: "/admin/payment-settings", label: "Payment Settings", icon: CreditCard },
  { to: "/admin/pricing-charges", label: "Pricing & API Settings", icon: Sliders },
  { to: "/admin/vtu-providers", label: "VTU Providers", icon: Server },
  { to: "/admin/telegram", label: "Telegram Integration", icon: Send },
  { to: "/admin/ai-control", label: "D4 AI Control", icon: Bot },
  { to: "/admin/settings", label: "System Settings", icon: Settings },
  { to: "/admin/accounts", label: "Admin Accounts", icon: ShieldCheck },
  { to: "/admin/audit", label: "Audit Logs", icon: FileClock },
  { to: "/admin/security", label: "Security", icon: Lock },
  { to: "/admin/support", label: "Support", icon: LifeBuoy },
  { to: "/admin/database", label: "Database", icon: Database },
];

export default function AdminLayout() {
  const [state, setState] = useState<"loading" | "denied" | "ok">("loading");
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [smeapiBal, setSmeapiBal] = useState<number | null>(null);
  const [smeplugBal, setSmeplugBal] = useState<number | null>(null);
  const [balLoading, setBalLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (active) setState("denied"); return; }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
      const ok = !!roles?.some((r: any) => r.role === "admin");
      if (!active) return;
      if (!ok) { setState("denied"); return; }
      setMe({ id: session.user.id, email: session.user.email || "" });
      setState("ok");
    }
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    // session timeout — 30 min inactivity
    let timer: number;
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(async () => { await supabase.auth.signOut(); toast.info("Admin session timed out"); navigate("/admin/login"); }, 30 * 60 * 1000); };
    const events = ["mousemove", "keydown", "click", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { active = false; sub.subscription.unsubscribe(); window.clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [navigate]);

  useEffect(() => {
    if (state !== "ok") return;

    let cancelled = false;

    async function loadBalances() {
      setBalLoading(true);
      try {
        const [a, b] = await Promise.all([
          supabase.functions.invoke("smeapi", { body: { action: "status" } }),
          supabase.functions.invoke("smeplug", { body: { action: "status" } }),
        ]);
        if (cancelled) return;

        const aBal = a.data?.balance;
        const bBal = b.data?.balance;

        setSmeapiBal(typeof aBal === "number" ? aBal : null);
        setSmeplugBal(typeof bBal === "number" ? bBal : null);
      } catch {
        if (!cancelled) {
          setSmeapiBal(null);
          setSmeplugBal(null);
        }
      } finally {
        if (!cancelled) setBalLoading(false);
      }
    }

    loadBalances();
    const id = window.setInterval(loadBalances, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [state]);

  if (state === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950">
        <div className="space-y-3 w-72">
          <Skeleton className="h-8 w-40 bg-slate-800" />
          <Skeleton className="h-32 w-full bg-slate-800" />
          <Skeleton className="h-4 w-full bg-slate-800" />
        </div>
      </div>
    );
  }

  if (state === "denied") {
    return <AdminLogin onSuccess={() => setState("loading")} />;
  }

  const SidebarBody = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-white/5 flex items-center gap-2">
        <BrandMark size={44} />
        <div>
          <p className="text-white font-bold leading-tight">DATA4ME</p>
          <p className="text-[10px] uppercase tracking-widest text-violet-300 font-semibold">Admin Console</p>
        </div>
      </div>
      <div className="px-3 pt-3">
        <button
          onClick={() => { setMobileOpen(false); navigate("/dashboard"); }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/20 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to User Dashboard
        </button>
      </div>
      {/* Provider balances */}
      <div className="px-3 pt-3 space-y-2">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-emerald-300/90 font-semibold">
            <Wallet className="h-3 w-3" />
            SME API
          </div>
          <p className="text-base font-bold text-white tabular-nums mt-0.5">
            {balLoading ? "…" : smeapiBal != null ? `₦${smeapiBal.toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-violet-300/90 font-semibold">
            <Wallet className="h-3 w-3" />
            SMEPlug
          </div>
          <p className="text-base font-bold text-white tabular-nums mt-0.5">
            {balLoading ? "…" : smeplugBal != null ? `₦${smeplugBal.toLocaleString()}` : "—"}
          </p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
              isActive
                ? "bg-gradient-to-r from-violet-600/30 to-indigo-600/10 text-white border border-violet-500/30 shadow-[0_0_20px_-8px] shadow-violet-500/60"
                : "text-slate-400 hover:text-white hover:bg-white/5",
            )}
          >
            <n.icon className="h-4 w-4" />
            <span className="font-medium">{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-white/5 space-y-2">
        <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <p className="text-[10px] uppercase tracking-widest text-violet-300 font-semibold">Signed in</p>
          <p className="text-xs text-white truncate">{me?.email}</p>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); toast.success("Logged out"); navigate("/"); }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10 transition"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100 dark">
      <aside className="hidden lg:flex w-64 flex-col border-r border-white/5 bg-slate-900/60 backdrop-blur-xl">
        {SidebarBody}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-slate-900 border-r border-white/10 animate-in slide-in-from-left">
            <div className="absolute right-2 top-2"><Button size="icon" variant="ghost" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></Button></div>
            {SidebarBody}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b border-white/5 bg-slate-900/80 backdrop-blur-xl">
          <button onClick={() => setMobileOpen(true)} className="h-9 w-9 grid place-items-center rounded-lg bg-white/5"><Menu className="h-5 w-5" /></button>
          <div className="flex items-center gap-1">
            <BrandMark size={36} />
            <p className="font-bold text-white text-sm">Admin</p>
          </div>
          <span className="ml-auto px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30">LIVE</span>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
      <Suspense fallback={null}>
        <D4AIAssistant />
      </Suspense>
    </div>
  );
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setErr(error.message); setBusy(false); return; }
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!roles?.some((r: any) => r.role === "admin")) {
      await supabase.auth.signOut();
      setErr("This account does not have admin privileges.");
      setBusy(false);
      return;
    }
    toast.success("Welcome, admin");
    onSuccess();
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-950 via-violet-950/40 to-slate-950 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-slate-900/70 backdrop-blur-xl border border-white/10 p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 grid place-items-center shadow-[0_0_40px_-8px] shadow-violet-500">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Admin Console</h1>
            <p className="text-xs text-slate-400">Restricted area — admins only</p>
          </div>
        </div>
        <label className="block text-xs uppercase tracking-widest text-slate-400 font-semibold mb-1">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" className="w-full mb-3 h-11 rounded-lg bg-slate-800/60 border border-white/10 px-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500" placeholder="admin@data4me.ng" />
        <label className="block text-xs uppercase tracking-widest text-slate-400 font-semibold mb-1">Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="current-password" className="w-full mb-4 h-11 rounded-lg bg-slate-800/60 border border-white/10 px-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500" placeholder="••••••••" />
        {err && <div role="alert" className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 mb-3">{err}</div>}
        <button disabled={busy} className="w-full h-11 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold shadow-lg shadow-violet-900/50 disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
        <p className="text-[11px] text-slate-500 mt-4 text-center">Sessions auto-expire after 30 minutes of inactivity.</p>
      </form>
    </div>
  );
}
