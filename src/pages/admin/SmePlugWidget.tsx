import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "./_shared";
import { Zap, RefreshCw, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function SmePlugWidget() {
  const [syncing, setSyncing] = useState(false);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "smeplug-balance"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("smeplug", {
        headers: { Authorization: `Bearer ${token}` },
        body: { action: "balance" },
      });
      if (error) throw error;
      return data as { success: boolean; balance: number | null; error?: string };
    },
    refetchInterval: 60_000,
    retry: false,
  });

  const sync = useMutation({
    mutationFn: async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const { data, error } = await supabase.functions.invoke("smeplug", {
        headers: { Authorization: `Bearer ${token}` },
        body: { action: "sync-plans" },
      });
      if (error) throw error;
      return data as any;
    },
    onMutate: () => setSyncing(true),
    onSettled: () => setSyncing(false),
    onSuccess: (d) => {
      toast.success(`Synced ${d.networks_synced || 0} networks, ${d.plans_synced || 0} plans`);
    },
    onError: (e: any) => toast.error(e.message || "Sync failed"),
  });

  const online = data?.success && data.balance !== null && data.balance !== undefined;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" /> SME Plug (VTU)
        </h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-violet-300 hover:text-violet-200 flex items-center gap-1"
        >
          <RefreshCw className={"h-3 w-3 " + (isFetching ? "animate-spin" : "")} />
          Refresh
        </button>
      </div>

      <div className="p-4 rounded-xl bg-slate-950/50 border border-white/5 mb-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500">Provider wallet balance</p>
        {isLoading ? (
          <p className="text-slate-400 text-sm mt-2">Loading…</p>
        ) : online ? (
          <p className="text-3xl font-bold text-white tabular-nums mt-1">
            ₦{Number(data!.balance).toLocaleString()}
          </p>
        ) : (
          <p className="text-rose-300 text-sm mt-2 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> {data?.error || "Unable to reach SME Plug"}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs mb-3">
        <span className="text-slate-400">API status</span>
        <span className={
          "px-2 py-1 rounded-full font-semibold border " +
          (online
            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
            : "bg-rose-500/15 text-rose-300 border-rose-500/30")
        }>
          {online ? (
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Online</span>
          ) : "Offline"}
        </span>
      </div>

      <button
        onClick={() => sync.mutate()}
        disabled={syncing}
        className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {syncing ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</> : "Sync networks & plans"}
      </button>
      <p className="text-[10px] text-slate-500 mt-2">
        Pulls current networks and data plans from SME Plug and updates the catalogue.
      </p>
    </GlassCard>
  );
}
