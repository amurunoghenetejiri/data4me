import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function PageHead({ title, subtitle, icon: Icon, actions }: { title: string; subtitle?: string; icon?: any; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-4 mb-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 border border-violet-500/30 grid place-items-center">
            <Icon className="h-5 w-5 text-violet-300" />
          </div>
        )}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function GlassCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-white/5 shadow-xl shadow-black/20", className)}>{children}</div>
  );
}

export function Stat({ label, value, icon: Icon, accent = "violet", hint, to }: { label: string; value: React.ReactNode; icon: any; accent?: "violet" | "emerald" | "amber" | "rose" | "cyan"; hint?: string; to?: string }) {
  const tint = {
    violet: "from-violet-500/20 to-indigo-500/5 border-violet-500/30 text-violet-300",
    emerald: "from-emerald-500/20 to-teal-500/5 border-emerald-500/30 text-emerald-300",
    amber: "from-amber-500/20 to-orange-500/5 border-amber-500/30 text-amber-300",
    rose: "from-rose-500/20 to-pink-500/5 border-rose-500/30 text-rose-300",
    cyan: "from-cyan-500/20 to-sky-500/5 border-cyan-500/30 text-cyan-300",
  }[accent];
  const inner = (
    <GlassCard className={cn("p-5 h-full", to && "transition hover:border-white/20 hover:bg-slate-900/80 cursor-pointer")}>
      <div className={cn("h-10 w-10 rounded-xl bg-gradient-to-br border grid place-items-center mb-3", tint)}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
      {hint && <p className="text-[10px] text-slate-500 mt-1">{hint}</p>}
    </GlassCard>
  );
  if (to) return <a href={to} className="block">{inner}</a>;
  return inner;
}


export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="py-16 grid place-items-center text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin mb-2" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyBlock({ icon: Icon, title, body, action }: { icon: any; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="py-16 grid place-items-center text-center px-6">
      <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 grid place-items-center mb-3"><Icon className="h-6 w-6 text-slate-400" /></div>
      <p className="text-white font-semibold">{title}</p>
      {body && <p className="text-sm text-slate-400 mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-16 grid place-items-center text-center px-6">
      <div className="h-14 w-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 grid place-items-center mb-3 text-rose-300">!</div>
      <p className="text-white font-semibold">Something went wrong</p>
      <p className="text-sm text-rose-300 mt-1 max-w-md">{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500">Retry</button>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    processing: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    rejected: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    failed: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    blocked: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  };
  const cls = map[status?.toLowerCase()] || "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border", cls)}>{status}</span>;
}

export function maskAcct(s?: string | null) {
  if (!s) return "—";
  if (s.length <= 4) return "*".repeat(s.length);
  return s.slice(0, 2) + "•".repeat(Math.max(2, s.length - 4)) + s.slice(-2);
}

export function fmtNaira(n?: number | string | null) {
  const v = typeof n === "string" ? Number(n) : n || 0;
  return "₦" + (v || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function logAdminAction(supabase: any, action: string, target_type?: string, target_id?: string, details: any = {}) {
  try { await supabase.rpc("log_admin_action", { _action: action, _target_type: target_type ?? null, _target_id: target_id ?? null, _details: details }); } catch {}
}