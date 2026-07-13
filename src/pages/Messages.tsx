import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  sender_is_admin: boolean;
  created_at: string;
};

export default function Messages() {
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setMe({ id: session.user.id });
      // pick first admin recipient
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin").limit(1);
      const admin = roles?.[0]?.user_id || null;
      setAdminId(admin);
      await load(session.user.id, admin);
      const ch = supabase.channel("user_dm")
        .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${session.user.id}` }, () => load(session.user.id, admin))
        .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `sender_id=eq.${session.user.id}` }, () => load(session.user.id, admin))
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    })();
  }, []);

  async function load(myId: string, admin: string | null) {
    const { data } = await supabase.from("direct_messages" as any).select("*").order("created_at", { ascending: true }).limit(500);
    const rows = ((data || []) as unknown as Message[]).filter((m) => m.sender_id === myId || m.recipient_id === myId);
    setMessages(rows);
    // mark unread from admins as read
    const unread = rows.filter((m) => m.recipient_id === myId && !m.read_at).map((m) => m.id);
    if (unread.length) await supabase.from("direct_messages" as any).update({ read_at: new Date().toISOString() }).in("id", unread);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
  }

  async function send() {
    if (!text.trim() || !me || !adminId) {
      if (!adminId) toast.error("No admin available");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("direct_messages" as any).insert({
      sender_id: me.id, recipient_id: adminId, body: text.trim(), sender_is_admin: false,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    setText("");
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center"><MessageSquare className="h-5 w-5 text-white" /></div>
        <div>
          <h1 className="text-2xl font-bold">Support chat</h1>
          <p className="text-sm text-muted-foreground">Message the DATA4ME support team directly</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col h-[70vh]">
        <div className="p-4 border-b border-border flex items-center gap-2 bg-muted/30">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <p className="text-sm font-medium">DATA4ME Support</p>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-semibold">Live</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Start the conversation — we usually reply within minutes.</p>}
          {messages.map((m) => {
            const mine = me && m.sender_id === me.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
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
        <div className="p-3 border-t border-border flex gap-2 bg-background">
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message…" className="flex-1 h-10 px-3 rounded-lg bg-muted border border-border text-sm" />
          <button disabled={sending || !text.trim()} onClick={send}
            className="h-10 px-4 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50 flex items-center gap-2">
            <Send className="h-4 w-4" /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
