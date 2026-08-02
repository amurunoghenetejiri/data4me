import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Copy, ImagePlus, Loader2, Mic, Send, Sparkle, Volume2, VolumeX, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

type Msg = { id: string; role: "user" | "assistant"; content: string; image?: string };

const LANGS = [
  { id: "en", label: "English" },
  { id: "pcm", label: "Pidgin" },
  { id: "yo", label: "Yorùbá" },
  { id: "ig", label: "Igbo" },
  { id: "ha", label: "Hausa" },
];

const PAGE_ACTIONS: Record<string, string[]> = {
  "/": ["What is Data4Me?", "How do I fund my wallet?", "Show me the cheapest data plans"],
  "/dashboard": ["What is my wallet balance?", "Explain my last transaction", "How do referrals work?"],
  "/wallet": ["How do I fund with bank transfer?", "Why is my funding pending?", "How long does funding take?"],
  "/buy-data": ["Which plan is best for me?", "Why did my data purchase fail?", "How do I buy data?"],
  "/transactions": ["Explain my failed transactions", "How do I get a receipt?", "What does pending mean?"],
  "/admin": ["Summarise today's stats", "Write a promo broadcast", "Draft a maintenance notice"],
};

function quickActions(path: string, isAdmin: boolean) {
  if (isAdmin && path.startsWith("/admin")) return PAGE_ACTIONS["/admin"];
  return PAGE_ACTIONS[path] ?? ["How do I buy data?", "Check my wallet balance", "Talk to support"];
}

export default function D4AIAssistant() {
  const { user, isAdmin } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState("en");
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);

  const actions = useMemo(() => quickActions(location.pathname, isAdmin), [location.pathname, isAdmin]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => { if (open) setUnseen(false); }, [open]);
  useEffect(() => {
    const t = setTimeout(() => { if (!open && messages.length === 0) setUnseen(true); }, 12000);
    return () => clearTimeout(t);
  }, [open, messages.length]);

  function say(text: string) {
    if (!speak || typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text.replace(/[*_`#>[\]()]/g, ""));
    u.lang = lang === "en" || lang === "pcm" ? "en-NG" : "en-NG";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function toggleMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = "en-NG";
    rec.interimResults = false;
    rec.onresult = (e: any) => setInput((prev) => (prev ? prev + " " : "") + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  async function pickImage(f: File | null) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if ((!content && !image) || busy) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: content || "What does this image show?", image: image ?? undefined };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setImage(null);
    setBusy(true);

    const assistantId = crypto.randomUUID();
    try {
      const { data: sess } = await supabase.auth.getSession();
      const payload = {
        page: location.pathname,
        lang,
        messages: next.map((m) => ({
          role: m.role,
          content: m.image
            ? [{ type: "text", text: m.content }, { type: "image_url", image_url: { url: m.image } }]
            : m.content,
        })),
      };
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(sess.session ? { Authorization: `Bearer ${sess.session.access_token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "D4 AI is unavailable right now.");
      }

      setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: full } : x)));
            }
          } catch { /* partial chunk */ }
        }
      }
      say(full);
    } catch (e) {
      setMessages((m) => [
        ...m.filter((x) => x.id !== assistantId),
        { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${(e as Error).message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onLinkClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest("a");
    const href = target?.getAttribute("href");
    if (href?.startsWith("/")) {
      e.preventDefault();
      navigate(href);
      setOpen(false);
    }
  }

  return (
    <>
      {/* Orb */}
      <button
        aria-label="Open D4 AI assistant"
        onClick={() => setOpen((o) => !o)}
        className="d4-orb fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[60] h-16 w-16 rounded-full grid place-items-center group"
      >
        <span className="d4-orb-ring" />
        <span className="d4-orb-ring d4-orb-ring-2" />
        <span className="d4-orb-core grid place-items-center">
          {open ? <X className="h-6 w-6 text-primary-foreground" /> : <Sparkle className="h-6 w-6 text-primary-foreground" />}
          <span className="absolute -bottom-0.5 right-1 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-background" />
        </span>
        {unseen && !open && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground grid place-items-center animate-pulse">1</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed inset-x-2 bottom-24 sm:inset-x-auto sm:right-6 sm:bottom-28 z-[59] w-auto sm:w-[400px] max-h-[72vh] flex flex-col rounded-3xl overflow-hidden d4-glass animate-scale-in">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-primary/20 bg-gradient-primary/10">
            <span className="d4-orb-core-sm grid place-items-center"><Sparkle className="h-4 w-4 text-primary-foreground" /></span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">D4 AI</p>
              <p className="text-[11px] text-success flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success" />Online{isAdmin ? " · Admin mode" : ""}</p>
            </div>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="text-[11px] bg-transparent border border-primary/30 rounded-lg px-1.5 py-1 text-muted-foreground focus:outline-none">
              {LANGS.map((l) => <option key={l.id} value={l.id} className="bg-background text-foreground">{l.label}</option>)}
            </select>
            <button aria-label="Toggle voice replies" onClick={() => setSpeak((s) => !s)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground">
              {speak ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button aria-label="Close" onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4" onClick={onLinkClick}>
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Hi{user ? ` @${user.username}` : ""} 👋 I'm <span className="text-primary font-semibold">D4 AI</span>. Ask me anything about Data4Me — data, airtime, wallet, transactions or referrals.
                </p>
                <div className="flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <button key={a} onClick={() => send(a)} className="text-xs px-3 py-1.5 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition">{a}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                {m.image && <img src={m.image} alt="Attachment" className="max-w-[70%] rounded-xl border border-primary/20" />}
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "text-foreground",
                )}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_a]:text-primary [&_p]:my-1 [&_ul]:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "…"}</ReactMarkdown>
                    </div>
                  ) : m.content}
                </div>
                {m.role === "assistant" && m.content && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(m.content); setCopied(m.id); setTimeout(() => setCopied(null), 1500); }}
                    className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                  >
                    {copied === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied === m.id ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
            ))}

            {busy && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-1.5 items-center text-primary"><span className="d4-dot" /><span className="d4-dot d4-dot-2" /><span className="d4-dot d4-dot-3" /></div>
            )}
            <div ref={endRef} />
          </div>

          {image && (
            <div className="px-4 pb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <img src={image} alt="" className="h-9 w-9 rounded-lg object-cover border border-primary/30" />
              attached
              <button onClick={() => setImage(null)} className="text-destructive">remove</button>
            </div>
          )}

          <div className="p-3 border-t border-primary/20 flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
            <button aria-label="Attach image" onClick={() => fileRef.current?.click()} className="p-2 rounded-xl hover:bg-primary/10 text-muted-foreground"><ImagePlus className="h-4 w-4" /></button>
            <button aria-label="Voice input" onClick={toggleMic} className={cn("p-2 rounded-xl hover:bg-primary/10", listening ? "text-destructive animate-pulse" : "text-muted-foreground")}><Mic className="h-4 w-4" /></button>
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask D4 AI anything…"
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-24 py-2"
            />
            <button onClick={() => send()} disabled={busy} className="p-2.5 rounded-xl bg-gradient-primary text-primary-foreground shadow-glow disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
