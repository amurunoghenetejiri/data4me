import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Smartphone, Send, Trash2, RefreshCw, Search, CheckCircle2, XCircle } from "lucide-react";
import { GlassCard, PageHead, LoadingBlock } from "./_shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Device = {
  id: string;
  user_id: string;
  token: string;
  device_name: string | null;
  device_type: string | null;
  browser: string | null;
  platform: string | null;
  is_active: boolean;
  failure_count: number;
  last_error: string | null;
  last_success_at: string | null;
  last_seen: string;
  created_at: string;
};

type Profile = { id: string; username: string | null; full_name: string | null; email: string | null };

function ago(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function RegisteredDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("push_tokens")
      .select("*")
      .order("last_seen", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    const rows = (data || []) as Device[];
    setDevices(rows);

    const ids = [...new Set(rows.map((d) => d.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, full_name, email")
        .in("id", ids);
      const map: Record<string, Profile> = {};
      for (const p of profs || []) map[p.id] = p as Profile;
      setProfiles(map);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return devices;
    return devices.filter((d) => {
      const p = profiles[d.user_id];
      return (
        (p?.username || "").toLowerCase().includes(term) ||
        (p?.email || "").toLowerCase().includes(term) ||
        (p?.full_name || "").toLowerCase().includes(term) ||
        (d.device_name || "").toLowerCase().includes(term) ||
        (d.platform || "").toLowerCase().includes(term)
      );
    });
  }, [devices, profiles, q]);

  async function sendTest(d: Device) {
    setBusy(d.id);
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        user_id: d.user_id,
        title: "DATA4ME test notification",
        body: "If you can see this, push notifications are working on this device 🎉",
        type: "system",
        action_url: "/notifications",
      },
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    const pushed = (data as { pushed?: number })?.pushed ?? 0;
    if (pushed > 0) toast.success(`Test sent to ${pushed} device(s)`);
    else toast.error("Push not delivered — check the device token status");
    load();
  }

  async function removeDevice(d: Device) {
    setBusy(d.id);
    const { error } = await supabase.from("push_tokens").delete().eq("id", d.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Device removed");
    setDevices((list) => list.filter((x) => x.id !== d.id));
  }

  const activeCount = devices.filter((d) => d.is_active).length;
  const users = new Set(devices.map((d) => d.user_id)).size;

  return (
    <div className="space-y-4">
      <PageHead
        icon={Smartphone}
        title="Registered Devices"
        subtitle="Everyone who enabled push notifications, with token health and last activity."
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <GlassCard className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Devices</p>
          <p className="text-2xl font-bold tabular-nums">{devices.length}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Active tokens</p>
          <p className="text-2xl font-bold tabular-nums">{activeCount}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Users reachable</p>
          <p className="text-2xl font-bold tabular-nums">{users}</p>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user, email or device…" className="pl-9" />
          </div>
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
        </div>

        {loading ? (
          <LoadingBlock />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No registered devices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[46rem]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Device / Browser</th>
                  <th className="py-2 pr-3">Token</th>
                  <th className="py-2 pr-3">Last active</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d) => {
                  const p = profiles[d.user_id];
                  return (
                    <tr key={d.id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium">@{p?.username || "user"}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[12rem]">{p?.email || d.user_id}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <p>{d.device_name || d.browser || "Unknown device"}</p>
                        <p className="text-xs text-muted-foreground">{d.platform || d.device_type || "web"}</p>
                      </td>
                      <td className="py-3 pr-3">
                        {d.is_active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Healthy
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
                            <XCircle className="h-3.5 w-3.5" /> Failing
                          </span>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          {d.failure_count > 0 ? `${d.failure_count} failure(s)` : "no failures"}
                        </p>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{ago(d.last_seen)}</td>
                      <td className="py-3 pr-3">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => sendTest(d)}>
                            <Send className="h-3.5 w-3.5 mr-1" /> Test
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === d.id} onClick={() => removeDevice(d)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
