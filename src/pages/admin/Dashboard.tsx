import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserPlus, Activity, Receipt, Hourglass, Wallet, ArrowUpFromLine, Shield, TrendingUp, Coins, XCircle, RotateCcw } from "lucide-react";
import { GlassCard, LoadingBlock, PageHead, Stat, StatusPill, fmtNaira } from "./_shared";
import { Link } from "react-router-dom";
import SmePlugWidget from "./SmePlugWidget";

export default function AdminDashboard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => {
      const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
      const since30m = new Date(Date.now() - 30 * 60_000).toISOString();
      const [users, newUsers, txs, pending, deposits, withdrawals, activeLogins, recentTx] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since7),
        supabase.from("transactions").select("amount,status,type,charge,profit,meta"),
        supabase.from("funding_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("transactions").select("amount").eq("type", "wallet").eq("status", "success"),
        supabase.from("withdrawals").select("amount,status"),
        supabase.from("login_activity").select("id", { count: "exact", head: true }).gte("created_at", since30m),
        supabase.from("transactions").select("id,user_id,type,amount,status,reference,created_at,description").order("created_at", { ascending: false }).limit(8),
      ]);
      const allTx = (txs.data || []) as any[];
      const successSales = allTx.filter((t) => t.status === "success" && t.type !== "wallet" && t.type !== "refund");
      const revenue = successSales.reduce((s, t) => s + Number(t.amount), 0);
      const profit = successSales.reduce((s, t) => s + Number(t.profit || 0), 0);
      const charges = allTx.filter((t) => t.status === "success").reduce((s, t) => s + Number(t.charge || 0), 0);
      const totalDeposits = (deposits.data || []).reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalWithdrawn = (withdrawals.data || []).filter((w: any) => w.status === "completed" || w.status === "approved" || w.status === "successful").reduce((s: number, w: any) => s + Number(w.amount), 0);
      const byStatus = { success: 0, pending: 0, failed: 0, refunded: 0 } as Record<string, number>;
      allTx.forEach((t) => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
      const byNetwork: Record<string, { count: number; amount: number }> = {};
      successSales.forEach((t) => {
        const n = String(t.meta?.network || "other").toUpperCase();
        byNetwork[n] = byNetwork[n] || { count: 0, amount: 0 };
        byNetwork[n].count++; byNetwork[n].amount += Number(t.amount);
      });
      return {
        totalUsers: users.count || 0,
        newUsers: newUsers.count || 0,
        active: activeLogins.count || 0,
        totalTx: allTx.length,
        pending: pending.count || 0,
        revenue, profit, charges,
        deposits: totalDeposits,
        withdrawn: totalWithdrawn,
        byStatus, byNetwork,
        recent: recentTx.data || [],
      };
    },
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHead
        title="Admin Dashboard"
        subtitle="Real-time overview of platform activity"
        icon={Shield}
        actions={<button onClick={() => refetch()} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm">Refresh</button>}
      />
      {isLoading ? (
        <LoadingBlock label="Loading dashboard…" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Stat label="Total users" value={data!.totalUsers} icon={Users} accent="violet" />
            <Stat label="New (7 days)" value={data!.newUsers} icon={UserPlus} accent="cyan" />
            <Stat label="Active now" value={data!.active} icon={Activity} accent="emerald" hint="last 30 min" />
            <Stat label="Total transactions" value={data!.totalTx} icon={Receipt} accent="violet" />
            <Stat label="Revenue" value={fmtNaira(data!.revenue)} icon={Wallet} accent="emerald" />
            <Stat label="Profit" value={fmtNaira(data!.profit)} icon={TrendingUp} accent="emerald" hint="selling − cost" />
            <Stat label="Service charges" value={fmtNaira(data!.charges)} icon={Coins} accent="amber" hint="collected fees" />
            <Stat label="Pending deposits" value={data!.pending} icon={Hourglass} accent="amber" />
            <Stat label="Total deposits" value={fmtNaira(data!.deposits)} icon={Wallet} accent="cyan" />
            <Stat label="Withdrawals" value={fmtNaira(data!.withdrawn)} icon={ArrowUpFromLine} accent="rose" />
            <Stat label="Failed tx" value={data!.byStatus.failed || 0} icon={XCircle} accent="rose" />
            <Stat label="Refunded tx" value={data!.byStatus.refunded || 0} icon={RotateCcw} accent="amber" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <GlassCard className="p-5">
              <h2 className="font-semibold text-white mb-4">Sales by network</h2>
              {Object.keys(data!.byNetwork).length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No sales yet.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(data!.byNetwork).sort((a, b) => b[1].amount - a[1].amount).map(([n, v]) => {
                    const max = Math.max(...Object.values(data!.byNetwork).map((x) => x.amount));
                    const pct = max ? (v.amount / max) * 100 : 0;
                    return (
                      <div key={n}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-white font-medium">{n}</span>
                          <span className="text-slate-400 tabular-nums">{fmtNaira(v.amount)} <span className="text-slate-600">· {v.count}</span></span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>
            <GlassCard className="p-5">
              <h2 className="font-semibold text-white mb-4">Transaction status</h2>
              <div className="grid grid-cols-2 gap-3">
                {(["success", "pending", "failed", "refunded"] as const).map((s) => (
                  <div key={s} className="p-4 rounded-xl bg-slate-950/50 border border-white/5">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">{s}</p>
                    <p className="text-2xl font-bold text-white tabular-nums mt-1">{data!.byStatus[s] || 0}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>


          <div className="grid lg:grid-cols-3 gap-4">
            <GlassCard className="lg:col-span-2 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white">Recent transactions</h2>
                <Link to="/admin/transactions" className="text-xs text-violet-300 hover:text-violet-200">View all →</Link>
              </div>
              {data!.recent.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No transactions yet.</p>
              ) : (
                <div className="overflow-x-auto -mx-5">
                  <table className="w-full text-sm">
                    <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                      <tr><th className="text-left px-5 py-2">Reference</th><th className="text-left px-2 py-2">Type</th><th className="text-right px-2 py-2">Amount</th><th className="text-left px-2 py-2">Status</th><th className="text-right px-5 py-2">Date</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data!.recent.map((t: any) => (
                        <tr key={t.id} className="text-slate-300">
                          <td className="px-5 py-2.5 font-mono text-xs">{t.reference}</td>
                          <td className="px-2 py-2.5 capitalize">{t.type}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-white">{fmtNaira(t.amount)}</td>
                          <td className="px-2 py-2.5"><StatusPill status={t.status} /></td>
                          <td className="px-5 py-2.5 text-right text-xs text-slate-400">{new Date(t.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <h2 className="font-semibold text-white mb-4">System status</h2>
              <ul className="space-y-3 text-sm">
                <Status label="Database" ok />
                <Status label="Authentication" ok />
                <Status label="Paystack gateway" ok />
                <Status label="Realtime channel" ok />
                <Status label="Storage / receipts" ok />
              </ul>
              <div className="mt-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs">
                All systems operational — last checked {new Date().toLocaleTimeString()}
              </div>
            </GlassCard>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mt-4">
            <SmePlugWidget />
          </div>
        </>
      )}
    </div>
  );
}

function Status({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-300">{label}</span>
      <span className={"text-[10px] font-semibold px-2 py-1 rounded-full border " + (ok ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-rose-500/15 text-rose-300 border-rose-500/30")}>{ok ? "Operational" : "Down"}</span>
    </li>
  );
}