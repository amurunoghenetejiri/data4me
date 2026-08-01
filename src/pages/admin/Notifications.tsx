import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Megaphone, Send, Users, User as UserIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, PageHead } from "./_shared";
import { NOTIFICATION_TYPES } from "@/lib/notificationTypes";

export default function AdminNotifications() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("promotion");
  const [actionUrl, setActionUrl] = useState("/notifications");
  const [mode, setMode] = useState<"all" | "one">("all");
  const [target, setTarget] = useState("");
  const [sending, setSending] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin", "broadcast"],
    queryFn: async () =>
      (await supabase.from("notifications").select("*").is("user_id", null).order("created_at", { ascending: false }).limit(50)).data || [],
  });

  const { data: users } = useQuery({
    queryKey: ["admin", "notify-users"],
    queryFn: async () => (await supabase.from("profiles").select("id, username, email").order("username")).data || [],
  });

  const { data: stats } = useQuery({
    queryKey: ["admin", "notify-stats"],
    queryFn: async () => {
      const [{ count: total }, { count: unread }, { count: devices }] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("read", false),
        supabase.from("push_tokens").select("id", { count: "exact", head: true }),
      ]);
      return { total: total || 0, unread: unread || 0, devices: devices || 0 };
    },
  });

  async function send() {
    if (!title.trim() || !body.trim()) return toast.error("Title and body required");
    if (mode === "one" && !target) return toast.error("Pick a user to send to");
    setSending(true);
    const { data: res, error } = await supabase.functions.invoke("broadcast-notification", {
      body: {
        title: title.trim(),
        body: body.trim(),
        type,
        action_url: actionUrl || "/notifications",
        user_ids: mode === "one" ? [target] : [],
      },
    });
    setSending(false);
    if (error || !res?.success) return toast.error(error?.message || res?.error || "Failed to send");
    toast.success(`Sent to ${res.recipients} user${res.recipients === 1 ? "" : "s"}`);
    setTitle(""); setBody("");
    qc.invalidateQueries({ queryKey: ["admin", "broadcast"] });
    qc.invalidateQueries({ queryKey: ["admin", "notify-stats"] });
  }

  return (
    <div>
      <PageHead title="Notifications" subtitle="Send push + in-app alerts to your users" icon={Bell} />

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          ["Total sent", stats?.total ?? "—"],
          ["Unread", stats?.unread ?? "—"],
          ["Registered devices", stats?.devices ?? "—"],
        ].map(([label, value]) => (
          <GlassCard key={label as string} className="p-4">
            <p className="text-xs text-slate-400">{label as string}</p>
            <p className="text-xl font-bold text-white mt-1">{String(value)}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-3"><Megaphone className="h-4 w-4" /> New notification</h3>

          <div className="flex gap-2 mb-3">
            <button onClick={() => setMode("all")} className={`flex-1 h-9 rounded-lg text-sm flex items-center justify-center gap-1.5 border ${mode === "all" ? "bg-violet-600 text-white border-violet-500" : "border-white/10 text-slate-300"}`}>
              <Users className="h-3.5 w-3.5" /> All users
            </button>
            <button onClick={() => setMode("one")} className={`flex-1 h-9 rounded-lg text-sm flex items-center justify-center gap-1.5 border ${mode === "one" ? "bg-violet-600 text-white border-violet-500" : "border-white/10 text-slate-300"}`}>
              <UserIcon className="h-3.5 w-3.5" /> One user
            </button>
          </div>

          {mode === "one" && (
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full h-10 px-3 mb-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm">
              <option value="">Select a user…</option>
              {(users || []).map((u: { id: string; username: string | null; email: string | null }) => (
                <option key={u.id} value={u.id}>{u.username || u.email}</option>
              ))}
            </select>
          )}

          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-10 px-3 mb-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm">
            {NOTIFICATION_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>
            ))}
          </select>

          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline" className="w-full h-10 px-3 mb-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Tell your users…" className="w-full min-h-28 px-3 py-2 mb-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm" />
          <input value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} placeholder="Link when tapped (e.g. /wallet)" className="w-full h-10 px-3 mb-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm" />

          <button onClick={send} disabled={sending} className="w-full h-11 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {mode === "all" ? "Send to all users" : "Send to user"}
          </button>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="font-semibold text-white mb-3">Past broadcasts</h3>
          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {(data || []).length === 0 ? <p className="text-sm text-slate-400">No broadcasts yet.</p> : data!.map((n: { id: string; title: string; body: string | null; type: string | null; created_at: string }) => (
              <div key={n.id} className="p-3 rounded-lg bg-white/5">
                <p className="text-sm text-white font-medium">{n.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{n.body}</p>
                <p className="text-[10px] text-slate-500 mt-1">{n.type || "system"} • {new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
