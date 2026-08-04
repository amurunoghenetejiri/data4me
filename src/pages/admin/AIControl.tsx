import { useEffect, useState } from "react";
import { Bot, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Setting = { key: string; label: string; enabled: boolean; description: string | null };
type LogRow = {
  id: string; tool: string; actor_email: string | null; is_admin: boolean;
  success: boolean; error: string | null; created_at: string; input: any;
};

export default function AdminAIControl() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from("ai_settings").select("key, label, enabled, description").order("key"),
      supabase.from("ai_action_logs")
        .select("id, tool, actor_email, is_admin, success, error, created_at, input")
        .order("created_at", { ascending: false }).limit(40),
    ]);
    setSettings((s as Setting[]) ?? []);
    setLogs((l as LogRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggle(key: string, enabled: boolean) {
    setSaving(key);
    const { error } = await supabase.from("ai_settings").update({ enabled }).eq("key", key);
    setSaving(null);
    if (error) return toast.error(error.message);
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, enabled } : s)));
    toast.success(`${key} ${enabled ? "enabled" : "disabled"}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">D4 AI Control</h1>
          <p className="text-sm text-muted-foreground">Turn D4 AI capabilities on or off and audit every action it takes.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {settings.map((s) => (
              <div key={s.key} className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={s.enabled}
                  aria-label={`Toggle ${s.label}`}
                  disabled={saving === s.key}
                  onClick={() => toggle(s.key, !s.enabled)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${s.enabled ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${s.enabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <p className="font-medium text-foreground text-sm">AI action audit log</p>
            </div>
            <div className="max-h-[480px] overflow-y-auto divide-y divide-border">
              {logs.length === 0 && <p className="p-4 text-sm text-muted-foreground">No AI actions yet.</p>}
              {logs.map((l) => (
                <div key={l.id} className="p-3 text-sm flex items-start gap-3">
                  <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${l.success ? "bg-success" : "bg-destructive"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {l.tool} <span className="text-xs text-muted-foreground">· {l.actor_email ?? "guest"}{l.is_admin ? " (admin)" : ""}</span>
                    </p>
                    {l.error && <p className="text-xs text-destructive break-words">{l.error}</p>}
                    <p className="text-[11px] text-muted-foreground break-words">{JSON.stringify(l.input).slice(0, 180)}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
