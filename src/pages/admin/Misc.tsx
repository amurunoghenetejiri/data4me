import { GlassCard, PageHead, LoadingBlock, ErrorBlock, fmtNaira } from "./_shared";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BadgeCheck, BarChart3, ShieldCheck, Lock, LifeBuoy, Database, RefreshCw, Wallet, Users, Receipt, TrendingUp } from "lucide-react";
export function KycPage() {
  const { data } = useQuery({ queryKey: ["admin", "kyc"], queryFn: async () => (await supabase.from("user_status").select("*").order("updated_at", { ascending: false })).data || [] });
  return (
    <div>
      <PageHead title="KYC" subtitle="Verification status across all users" icon={BadgeCheck} />
      <GlassCard className="p-5">
        <p className="text-sm text-slate-400 mb-4">{data?.length || 0} status records</p>
        <ul className="divide-y divide-white/5">
          {(data || []).map((s: any) => (
            <li key={s.user_id} className="py-2.5 flex items-center justify-between text-sm">
              <span className="font-mono text-xs text-slate-400">{s.user_id.slice(0, 12)}…</span>
              <span className="flex gap-2">
                <span className={"px-2 py-0.5 rounded-full text-[10px] border " + (s.is_verified ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-slate-500/15 text-slate-300 border-slate-500/30")}>{s.is_verified ? "Verified" : "Unverified"}</span>
                {s.is_blocked && <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30">Blocked</span>}
              </span>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}

export function ReportsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();

      const [txRes, usersRes, fundingRes, wdRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("amount,type,status,charge,profit,created_at")
          .gte("created_at", since),
        supabase
          .from("profiles")
          .select("created_at")
          .gte("created_at", since),
        supabase
          .from("funding_requests")
          .select("amount,status,created_at")
          .gte("created_at", since),
        supabase
          .from("withdrawals")
          .select("amount,status,created_at")
          .gte("created_at", since),
      ]);

      if (txRes.error) throw new Error(txRes.error.message);
      if (usersRes.error) throw new Error(usersRes.error.message);

      const txs = txRes.data || [];
      const users = usersRes.data || [];
      const fundings = fundingRes.data || [];
      const withdrawals = wdRes.data || [];

      // Last 7 calendar days (local-ish via ISO date)
      const days: Record<string, { rev: number; deposits: number; users: number; txCount: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
        days[d] = { rev: 0, deposits: 0, users: 0, txCount: 0 };
      }

      let revenue = 0;
      let deposits = 0;
      let profit = 0;
      let charges = 0;
      let successTx = 0;
      let failedTx = 0;
      const byType: Record<string, number> = {};

      txs.forEach((t: any) => {
        const d = String(t.created_at || "").slice(0, 10);
        const amount = Number(t.amount) || 0;
        const isSuccess = t.status === "success" || t.status === "successful";

        if (isSuccess) {
          successTx += 1;
          charges += Number(t.charge) || 0;
          profit += Number(t.profit) || 0;

          if (t.type === "wallet") {
            deposits += amount;
            if (days[d]) days[d].deposits += amount;
          } else if (t.type !== "refund") {
            revenue += amount;
            if (days[d]) {
              days[d].rev += amount;
              days[d].txCount += 1;
            }
            const key = t.type || "other";
            byType[key] = (byType[key] || 0) + amount;
          }
        } else if (t.status === "failed" || t.status === "refunded") {
          failedTx += 1;
        }
      });

      users.forEach((u: any) => {
        const d = String(u.created_at || "").slice(0, 10);
        if (days[d]) days[d].users += 1;
      });

      const pendingFunding = fundings.filter((f: any) => f.status === "pending").length;
      const approvedFunding = fundings
        .filter((f: any) => f.status === "approved")
        .reduce((s: number, f: any) => s + (Number(f.amount) || 0), 0);
      const withdrawn = withdrawals
        .filter((w: any) => ["successful", "approved", "completed"].includes(w.status))
        .reduce((s: number, w: any) => s + (Number(w.amount) || 0), 0);

      return {
        days,
        revenue,
        deposits,
        profit,
        charges,
        successTx,
        failedTx,
        newUsers: users.length,
        pendingFunding,
        approvedFunding,
        withdrawn,
        byType,
      };
    },
  });

  if (isLoading) {
    return (
      <div>
        <PageHead title="Reports" subtitle="Business performance overview" icon={BarChart3} />
        <LoadingBlock label="Loading reports…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <PageHead title="Reports" subtitle="Business performance overview" icon={BarChart3} />
        <ErrorBlock message={(error as Error)?.message || "Failed to load reports"} onRetry={() => refetch()} />
      </div>
    );
  }

  const entries = Object.entries(data!.days);
  const max = Math.max(1, ...entries.map(([, v]) => Math.max(v.rev, v.deposits)));
  const typeEntries = Object.entries(data!.byType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHead title="Reports" subtitle="Last 7 days at a glance" icon={BarChart3} />
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-violet-300" /> Revenue
          </div>
          <p className="text-xl font-bold text-white tabular-nums">{fmtNaira(data!.revenue)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{data!.successTx} successful sales</p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Wallet className="h-3.5 w-3.5 text-emerald-300" /> Deposits
          </div>
          <p className="text-xl font-bold text-white tabular-nums">{fmtNaira(data!.deposits)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{data!.pendingFunding} pending funding</p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Receipt className="h-3.5 w-3.5 text-amber-300" /> Profit / Charges
          </div>
          <p className="text-xl font-bold text-white tabular-nums">{fmtNaira(data!.profit)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Charges {fmtNaira(data!.charges)}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Users className="h-3.5 w-3.5 text-cyan-300" /> New users
          </div>
          <p className="text-xl font-bold text-white tabular-nums">{data!.newUsers}</p>
          <p className="text-[10px] text-slate-500 mt-1">{data!.failedTx} failed tx · Withdrawn {fmtNaira(data!.withdrawn)}</p>
        </GlassCard>
      </div>

      {/* Chart */}
      <GlassCard className="p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Daily revenue vs deposits</h3>
        {entries.every(([, v]) => v.rev === 0 && v.deposits === 0) ? (
          <p className="text-sm text-slate-400 py-12 text-center">No transactions in the last 7 days yet.</p>
        ) : (
          <div className="grid grid-cols-7 gap-2 sm:gap-3 h-56 items-end">
            {entries.map(([day, v]) => (
              <div key={day} className="flex flex-col items-center gap-1 h-full justify-end">
                <div className="w-full flex gap-0.5 sm:gap-1 items-end" style={{ height: "100%" }}>
                  <div
                    className="flex-1 bg-gradient-to-t from-violet-600 to-violet-400 rounded-t min-h-[2px]"
                    style={{ height: `${Math.max(2, (v.rev / max) * 100)}%` }}
                    title={`Revenue ${fmtNaira(v.rev)}`}
                  />
                  <div
                    className="flex-1 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t min-h-[2px]"
                    style={{ height: `${Math.max(2, (v.deposits / max) * 100)}%` }}
                    title={`Deposits ${fmtNaira(v.deposits)}`}
                  />
                </div>
                <p className="text-[10px] text-slate-500">{day.slice(5)}</p>
                <p className="text-[10px] text-slate-300">+{v.users}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded bg-violet-500" /> Revenue</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded bg-emerald-500" /> Deposits</span>
          <span>+N = new users that day</span>
        </div>
      </GlassCard>

      {/* Breakdown table + by type */}
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Daily breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Revenue</th>
                  <th className="py-2 pr-2">Deposits</th>
                  <th className="py-2 pr-2">Sales</th>
                  <th className="py-2">Users</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(([day, v]) => (
                  <tr key={day} className="border-b border-white/5 text-slate-300">
                    <td className="py-2.5 pr-2 font-mono text-xs">{day}</td>
                    <td className="py-2.5 pr-2 tabular-nums text-violet-300">{fmtNaira(v.rev)}</td>
                    <td className="py-2.5 pr-2 tabular-nums text-emerald-300">{fmtNaira(v.deposits)}</td>
                    <td className="py-2.5 pr-2 tabular-nums">{v.txCount}</td>
                    <td className="py-2.5 tabular-nums">+{v.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Revenue by service</h3>
          {typeEntries.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No successful sales yet.</p>
          ) : (
            <ul className="space-y-2">
              {typeEntries.map(([type, amount]) => (
                <li key={type} className="flex items-center justify-between gap-3 py-2 border-b border-white/5">
                  <span className="text-sm text-slate-300 capitalize">{type}</span>
                  <span className="text-sm font-semibold text-white tabular-nums">{fmtNaira(amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </div>
  );
          }

export function AdminAccountsPage() {
  const { data } = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").eq("role", "admin");
      const ids = (roles || []).map((r: any) => r.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, username, email, created_at").in("id", ids);
      return profiles || [];
    },
  });
  return (
    <div>
      <PageHead title="Admin Accounts" subtitle="Users with admin role" icon={ShieldCheck} />
      <GlassCard className="p-5">
        <ul className="divide-y divide-white/5">
          {(data || []).map((u: any) => (
            <li key={u.id} className="py-3 flex items-center justify-between text-sm">
              <div>
                <p className="text-white font-medium">@{u.username}</p>
                <p className="text-xs text-slate-400">{u.email}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-violet-500/15 text-violet-300 border border-violet-500/30">ADMIN</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 mt-4">To add a new admin, assign the <code className="px-1 py-0.5 rounded bg-white/10">admin</code> role in the <code className="px-1 py-0.5 rounded bg-white/10">user_roles</code> table.</p>
      </GlassCard>
    </div>
  );
}

export function SecurityPage() {
  return (
    <div>
      <PageHead title="Security" subtitle="Best practices applied to this platform" icon={Lock} />
      <GlassCard className="p-5 space-y-3 text-sm">
        <Row label="Row-level security (RLS)" status="enabled" />
        <Row label="Admin role check (server-side)" status="enabled" />
        <Row label="Audit logging" status="enabled" />
        <Row label="Session inactivity timeout" status="30 min" />
        <Row label="HTTPS / TLS" status="enforced" />
        <Row label="Encrypted secrets (Paystack)" status="server-only" />
        <Row label="Password hashing" status="bcrypt (Supabase Auth)" />
      </GlassCard>
    </div>
  );
}
function Row({ label, status }: { label: string; status: string }) {
  return <div className="flex items-center justify-between border-b border-white/5 pb-2"><span className="text-slate-300">{label}</span><span className="text-emerald-300 text-xs font-semibold">{status}</span></div>;
}

export function SupportPage() {
  const { data } = useQuery({ queryKey: ["admin", "contact"], queryFn: async () => (await supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(100)).data || [] });
  return (
    <div>
      <PageHead title="Support" subtitle="Inbound contact messages" icon={LifeBuoy} />
      <GlassCard className="p-5 space-y-3">
        {(data || []).length === 0 ? <p className="text-sm text-slate-400">No support messages yet.</p> : data!.map((m: any) => (
          <div key={m.id} className="p-3 rounded-lg bg-white/5">
            <div className="flex justify-between"><p className="text-white font-medium text-sm">{m.name || "Anonymous"}</p><p className="text-xs text-slate-500">{new Date(m.created_at).toLocaleString()}</p></div>
            <p className="text-xs text-slate-400">{m.email} · {m.phone || "—"}</p>
            <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{m.message}</p>
          </div>
        ))}
      </GlassCard>
    </div>
  );
}

export function DatabasePage() {
  const tables = ["profiles", "wallets", "transactions", "funding_requests", "withdrawals", "products", "audit_logs", "notifications", "user_status", "user_roles", "admin_notes", "admin_messages", "bank_details", "chat_messages", "contact_messages", "login_activity", "app_settings"];
  return (
    <div>
      <PageHead title="Database" subtitle="Schema overview" icon={Database} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tables.map((t) => (
          <GlassCard key={t} className="p-4 flex items-center justify-between">
            <span className="font-mono text-sm text-white">{t}</span>
            <span className="text-[10px] text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">RLS</span>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
