import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Send, User as UserIcon } from "lucide-react";
import { GlassCard, PageHead } from "./_shared";
import { toast } from "sonner";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  delivered_at: string | null;
  sender_is_admin: boolean;
  created_at: string;
};

type Convo = {
  otherId: string;
  otherEmail: string;
  otherName: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};

export default function AdminMessages() {
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { email: string; full_name: string }>>({});
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setMe({ id: session.user.id });
      await load(session.user.id);
      const ch = supabase.channel("admin_dm")
        .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, () => load(session.user.id))
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    })();
  }, []);

  async function load(myId: string) {
    const { data } = await supabase.from("direct_messages" as any).select("*").order("created_at", { ascending: true }).limit(1000);
    const rows = (data || []) as Message[];
    setMessages(rows);
    const ids = new Set<string>();
    rows.forEach((m) => { if (m.sender_id !== myId) ids.add(m.sender_id); if (m.recipient_id !== myId) ids.add(m.recipient_id); });
    if (ids.size) {
      const { data: profs } = await supabase.from("profiles").select("id, email, full_name").in("id", Array.from(ids));
      const map: Record<string, { email: string; full_name: string }> = {};
      (profs || []).forEach((p: any) => { map[p.id] = { email: p.email, full_name: p.full_name || p.email }; });
      setProfiles(map);
    }
  }

  const convos = useMemo<Convo[]>(() => {
    if (!me) return [];
    const map = new Map<string, Convo>();
    for (const m of messages) {
      const otherId = m.sender_id === me.id ? m.recipient_id : m.sender_id;
      const p = profiles[otherId];
      const existing = map.get(otherId);
      const unread = m.recipient_id === me.id && !m.read_at ? 1 : 0;
      if (!existing || existing.lastAt < m.created_at) {
        map.set(otherId, {
          otherId,
          otherEmail: p?.email || otherId.slice(0, 8),
          otherName: p?.full_name || p?.email || otherId.slice(0, 8),
          lastBody: m.body,
          lastAt: m.created_at,
          unread: (existing?.unread || 0) + unread,
        });
      } else {
        existing.unread += unread;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [messages, profiles, me]);

  const thread = useMemo(() => messages.filter((m) => me && active && (
    (m.sender_id === me.id && m.recipient_id === active) ||
    (m.sender_id === active && m.recipient_id === me.id)
  )), [messages, me, active]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread.length]);

  useEffect(() => {
    if (!me || !active) return;
    const unread = thread.filter((m) => m.recipient_id === me.id && !m.read_at).map((m) => m.id);
    if (unread.length) supabase.from("direct_messages" as any).update({ read_at: new Date().toISOString() }).in("id", unread).then(() => {});
  }, [active, thread, me]);

  async function send() {
    if (!text.trim() || !me || !active) return;
    setSending(true);
    const { error } = await supabase.from("direct_messages" as any).insert({
      sender_id: me.id, recipient_id: active, body: text.trim(), sender_is_admin: true,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    setText("");
  }

  return (
    <div>
      <PageHead title="Messages" subtitle="Real-time chat with users" icon={MessageSquare} />
      <div className="grid lg:grid-cols-[320px_1fr] gap-4 min-h-[70vh]">
        <GlassCard className="p-2 overflow-y-auto max-h-[70vh]">
          {convos.length === 0 && <p className="text-sm text-slate-400 p-6 text-center">No conversations yet.</p>}
          {convos.map((c) => (
            <button key={c.otherId} onClick={() => setActive(c.otherId)}
              className={`w-full text-left p-3 rounded-lg flex gap-3 items-start hover:bg-white/5 ${active === c.otherId ? "bg-white/10" : ""}`}>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 grid place-items-center flex-shrink-0"><UserIcon className="h-4 w-4 text-white" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white truncate">{c.otherName}</p>
                  {c.unread > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-semibold">{c.unread}</span>}
                </div>
                <p className="text-xs text-slate-400 truncate">{c.lastBody}</p>
              </div>
            </button>
          ))}
        </GlassCard>

        <GlassCard className="flex flex-col max-h-[70vh]">
          {!active ? (
            <div className="flex-1 grid place-items-center text-slate-400 text-sm">Select a conversation</div>
          ) : (
            <>
              <div className="p-4 border-b border-white/5">
                <p className="font-semibold text-white">{profiles[active]?.full_name || profiles[active]?.email || "User"}</p>
                <p className="text-xs text-slate-400">{profiles[active]?.email}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {thread.map((m) => {
                  const mine = me && m.sender_id === me.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${mine ? "bg-violet-600 text-white rounded-br-sm" : "bg-white/10 text-slate-100 rounded-bl-sm"}`}>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className="text-[10px] opacity-70 mt-1 text-right">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {mine && (m.read_at ? " • Read" : " • Sent")}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div className="p-3 border-t border-white/5 flex gap-2">
                <input value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type a reply…" className="flex-1 h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm" />
                <button disabled={sending || !text.trim()} onClick={send}
                  className="h-10 px-4 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold disabled:opacity-50 flex items-center gap-2">
                  <Send className="h-4 w-4" /> Send
                </button>
              </div>
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
