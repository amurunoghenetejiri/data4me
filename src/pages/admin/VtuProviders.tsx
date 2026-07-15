import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, RefreshCw, Zap, Wallet as WalletIcon, CheckCircle2, XCircle, Play, PowerOff, Server } from "lucide-react";
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

type ProviderKey = "smeapi" | "smeplug";

const PROVIDERS: { key: ProviderKey; label: string; fn: string; accent: string }[] = [
  { key: "smeapi", label: "SME API", fn: "smeapi", accent: "from-emerald-500 to-teal-600" },
  { key: "smeplug", label: "SMEPlug", fn: "smeplug", accent: "from-violet-500 to-indigo-600" },
];

type Row = {
  data: StatusPayload | null;
  loading: boolean;
  syncing: boolean;
  lastCheck: Date | null;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  lastSync: Date | null;
};

const empty: Row = { data: null, loading: false, syncing: false, lastCheck: null, lastSuccess: null, lastFailure: null, lastSync: null };

export default function AdminVtuProviders() {
  const [rows, setRows] = useState<Record<ProviderKey, Row>>({ smeapi: { ...empty }, smeplug: { ...empty } });
  const [auto, setAuto] = useState(true);
  const timer = useRef<number | null>(null);

  function update(key: ProviderKey, patch: Partial<Row>) {
    setRows((r) => ({ ...r, [key]: { ...r[key], ...patch } }));
  }

  async function check(key: ProviderKey, kind: "manual" | "auto" = "auto") {
    update(key, { loading: true });
    try {
      const fn = PROVIDERS.find((p) => p.key === key)!.fn;
      const { data: res, error } = await supabase.functions.invoke(fn, { body: { action: "status" } });
      const now = new Date();
      if (error || !res || res.reachable === false) {
        update(key, { loading: false, lastCheck: now, lastFailure: now, data: { error: error?.message || res?.error || "Provider unreachable", reachable: false, ...(res || {}) } });
        if (kind === "manual") toast.error(`${key.toUpperCase()} not reachable`);
      } else {
        update(key, { loading: false, lastCheck: now, lastSuccess: now, data: res as StatusPayload });
        if (kind === "manual") toast.success(`${key.toUpperCase()} reachable`);
      }
    } catch (e: any) {
      update(key, { loading: false, lastCheck: new Date(), lastFailure: new Date(), data: { error: e?.message || "Request failed", reachable: false } });
    }
  }

  async function syncPlans(key: ProviderKey) {
    update(key, { syncing: true });
    try {
      const fn = PROVIDERS.find((p) => p.key === key)!.fn;
      const { data: res, error } = await supabase.functions.invoke(fn, { body: { action: "sync-plans" } });
      if (error || !res?.success) throw new Error(error?.message || res?.error || "Sync failed");
      toast.success(`${key.toUpperCase()} plans synced — ${res.imported ?? 0} new · ${res.updated ?? 0} updated · ${res.removed ?? 0} removed`);
      update(key, { syncing: false, lastSync: new Date() });
      await logAdminAction(supabase, `${key}_sync_plans`, key, null, res);
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
      update(key, { syncing: false });
    }
  }

  useEffect(() => {
    check("smeapi", "auto");
    check("smeplug", "auto");
    return () => { if (timer.current) window.clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (auto) timer.current = window.setInterval(() => { check("smeapi", "auto"); check("smeplug", "auto"); }, 30_000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <div>
      <PageHead
        title="VTU Providers"
        subtitle="Monitor and manage every VTU provider in one place"
        icon={Server}
        actions={
          <>
            <button onClick={() => setAuto((v) => !v)} className={`h-10 px-3 rounded-lg text-sm font-medium border ${auto ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-white/5 border-white/10 text-slate-300"}`}>
              {auto ? <><Zap className="h-4 w-4 inline mr-1" />Auto-refresh on</> : <><PowerOff className="h-4 w-4 inline mr-1" />Auto-refresh off</>}
            </button>
            <button onClick={() => { check("smeapi", "manual"); check("smeplug", "manual"); }} className="h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh all
            </button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {PROVIDERS.map((p) => {
          const r = rows[p.key];
          const d = r.data;
          const online = !!d?.reachable;
          return (
            <GlassCard key={p.key} className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${p.accent} grid place-items-center shadow-lg`}>
                    <Server className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{p.label}</h3>
                    <p className="text-[11px] text-slate-500">Provider · {p.key}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${online ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/15 text-rose-300 border border-rose-500/30"}`}>
                  {online ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {online ? "Online" : "Offline"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold"><WalletIcon className="h-3 w-3 text-cyan-300" /> Balance</div>
                  <p className="text-lg font-bold text-white tabular-nums mt-1">{d?.balance != null ? fmtNaira(d.balance) : "—"}</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold"><Zap className="h-3 w-3 text-amber-300" /> Latency</div>
                  <p className="text-lg font-bold text-white tabular-nums mt-1">{d?.latency_ms != null ? `${d.latency_ms}ms` : "—"}</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold"><Activity className="h-3 w-3 text-violet-300" /> HTTP</div>
                  <p className="text-lg font-bold text-white tabular-nums mt-1">{d?.status ?? "—"}</p>
                </div>
              </div>

              <dl className="text-xs space-y-1.5 mb-4">
                <RowKV k="Base URL" v={d?.base_url || "—"} />
                <RowKV k="Last check" v={r.lastCheck?.toLocaleString() || "—"} />
                <RowKV k="Last successful" v={r.lastSuccess?.toLocaleString() || "Never"} tone={r.lastSuccess ? "ok" : "muted"} />
                <RowKV k="Last failure" v={r.lastFailure?.toLocaleString() || "None"} tone={r.lastFailure ? "bad" : "muted"} />
                <RowKV k="Last plan sync" v={r.lastSync?.toLocaleString() || "Never in this session"} />
              </dl>

              <div className="grid grid-cols-2 gap-2">
                <button disabled={r.loading} onClick={() => check(p.key, "manual")} className="h-10 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  <Play className={`h-4 w-4 ${r.loading ? "animate-pulse" : ""}`} /> Test Connection
                </button>
                <button disabled={r.syncing || !online} onClick={() => syncPlans(p.key)} className="h-10 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  <RefreshCw className={`h-4 w-4 ${r.syncing ? "animate-spin" : ""}`} /> {r.syncing ? "Syncing…" : "Sync Products"}
                </button>
              </div>

              {d?.error && <p className="text-xs text-rose-300 mt-3 bg-rose-500/10 border border-rose-500/20 rounded p-2">Error: {d.error}</p>}

              <details className="mt-3">
                <summary className="text-[11px] text-slate-500 cursor-pointer">Raw provider response</summary>
                <pre className="text-[10px] leading-relaxed text-slate-300 bg-black/40 border border-white/5 rounded-lg p-2 max-h-56 overflow-auto mt-2">
{JSON.stringify(d?.raw ?? d ?? {}, null, 2)}
                </pre>
              </details>
            </GlassCard>
          );
        })}
      </div>

      <GlassCard className="p-5 mt-6">
        <h3 className="font-semibold text-white mb-2">Automatic failover</h3>
        <p className="text-sm text-slate-400">
          When a customer places a data or airtime purchase, the assigned provider is called first. If it returns a recoverable
          error (timeout, 5xx, "service unavailable", etc.) the system automatically retries the equivalent product on the alternate
          provider. Wallets are only permanently debited after a confirmed success — failed attempts release the reserved balance.
        </p>
      </GlassCard>
    </div>
  );
}

function RowKV({ k, v, tone }: { k: string; v: string; tone?: "ok" | "bad" | "muted" }) {
  const cls = tone === "ok" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-400">{k}</dt>
      <dd className={`${cls} text-right break-all`}>{v}</dd>
    </div>
  );
}
