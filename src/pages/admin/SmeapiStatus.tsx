import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, RefreshCw, Zap, Wallet as WalletIcon, CheckCircle2, XCircle, Play, PowerOff } from "lucide-react";
import { GlassCard, PageHead, fmtNaira, logAdminAction } from "./_shared";
import { toast } from "sonner";

type StatusPayload = {
  provider?: string;
  base_url?: string;
  reachable?: boolean;
  status?: number;
  latency_ms?: number;
  balance?: number;
  raw?: any;
  error?: string;
};

export default function AdminSmeapiStatus() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [lastSuccess, setLastSuccess] = useState<Date | null>(null);
  const [lastFailure, setLastFailure] = useState<Date | null>(null);
  const [auto, setAuto] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const timer = useRef<number | null>(null);

  async function check(kind: "manual" | "auto" = "auto") {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("smeapi", {
        body: { action: "status" },
      });
      const now = new Date();
      setLastCheck(now);
      if (error || !res || res.reachable === false) {
        setLastFailure(now);
        setData({ error: error?.message || res?.error || "Provider unreachable", reachable: false, ...(res || {}) });
        if (kind === "manual") toast.error("SMEAPI not reachable");
      } else {
        setLastSuccess(now);
        setData(res as StatusPayload);
        if (kind === "manual") toast.success("SMEAPI reachable");
      }
    } catch (e: any) {
      setLastFailure(new Date());
      setData({ error: e?.message || "Request failed", reachable: false });
    } finally {
      setLoading(false);
    }
  }

  async function syncPlans() {
    setSyncing(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("smeapi", { body: { action: "sync-plans" } });
      if (error || !res?.success) throw new Error(error?.message || res?.error || "Sync failed");
      toast.success(`Plans synced • ${res.inserted} new, ${res.updated} updated`);
      await logAdminAction(supabase, "smeapi_sync_plans", "smeapi", null, res);
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    check("auto");
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, []);

  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (auto) timer.current = window.setInterval(() => check("auto"), 30_000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [auto]);

  const online = !!data?.reachable;

  return (
    <div>
      <PageHead
        title="SMEAPI Status"
        subtitle="Live health & balance for the VTU provider"
        icon={Activity}
        actions={
          <>
            <button onClick={() => setAuto((v) => !v)} className={`h-10 px-3 rounded-lg text-sm font-medium border ${auto ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-white/5 border-white/10 text-slate-300"}`}>
              {auto ? <><Zap className="h-4 w-4 inline mr-1" />Auto-refresh on</> : <><PowerOff className="h-4 w-4 inline mr-1" />Auto-refresh off</>}
            </button>
            <button disabled={loading} onClick={() => check("manual")} className="h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button disabled={loading} onClick={() => check("manual")} className="h-10 px-4 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold flex items-center gap-2">
              <Play className="h-4 w-4" /> Test Connection
            </button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-widest font-semibold">
            {online ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-rose-400" />} Connection
          </div>
          <p className={`text-2xl font-bold mt-2 ${online ? "text-emerald-300" : "text-rose-300"}`}>{online ? "Online" : "Offline"}</p>
          <p className="text-[11px] text-slate-500 mt-1">HTTP {data?.status ?? "—"}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-widest font-semibold">
            <WalletIcon className="h-4 w-4 text-cyan-300" /> Provider balance
          </div>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums">{data?.balance != null ? fmtNaira(data.balance) : "—"}</p>
          <p className="text-[11px] text-slate-500 mt-1">{data?.provider || "smeapi"}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-widest font-semibold">
            <Zap className="h-4 w-4 text-amber-300" /> Latency
          </div>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums">{data?.latency_ms != null ? `${data.latency_ms} ms` : "—"}</p>
          <p className="text-[11px] text-slate-500 mt-1">Round-trip to provider</p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-widest font-semibold">
            <Activity className="h-4 w-4 text-violet-300" /> Last check
          </div>
          <p className="text-lg font-semibold text-white mt-2">{lastCheck ? lastCheck.toLocaleTimeString() : "—"}</p>
          <p className="text-[11px] text-slate-500 mt-1">Auto every 30s</p>
        </GlassCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h3 className="font-semibold text-white mb-3">Recent activity</h3>
          <dl className="text-sm space-y-2">
            <Row k="Provider" v={data?.provider || "smeapi"} />
            <Row k="Base URL" v={data?.base_url || "—"} />
            <Row k="Last successful connection" v={lastSuccess?.toLocaleString() || "Never in this session"} tone={lastSuccess ? "ok" : "muted"} />
            <Row k="Last failed connection" v={lastFailure?.toLocaleString() || "None"} tone={lastFailure ? "bad" : "muted"} />
          </dl>
          <button
            disabled={syncing || !online}
            onClick={syncPlans}
            className="mt-4 w-full h-10 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing data plans…" : "Sync data plans from SMEAPI"}
          </button>
        </GlassCard>
        <GlassCard className="p-5">
          <h3 className="font-semibold text-white mb-3">Raw provider response</h3>
          <pre className="text-[11px] leading-relaxed text-slate-300 bg-black/40 border border-white/5 rounded-lg p-3 max-h-80 overflow-auto">
{JSON.stringify(data?.raw ?? data ?? {}, null, 2)}
          </pre>
          {data?.error && <p className="text-xs text-rose-300 mt-2">Error: {data.error}</p>}
        </GlassCard>
      </div>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "ok" | "bad" | "muted" }) {
  const cls = tone === "ok" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-400">{k}</dt>
      <dd className={`${cls} text-right break-all`}>{v}</dd>
    </div>
  );
}
