import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi 👋 I'm **D4 AI**, your Data4Me assistant.\n\nHow can I help you today? You can ask about data plans, airtime, funding your wallet, transactions, and more.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setIsTyping(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to get reply");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I'm having trouble right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 group",
          "h-16 w-16 rounded-full",
          "bg-black border-2 border-cyan-400",
          "shadow-[0_0_20px_rgba(34,211,238,0.6)]",
          "flex items-center justify-center",
          "transition-all duration-300",
          "hover:scale-110 hover:shadow-[0_0_30px_rgba(34,211,238,0.9)]",
          open && "scale-0 opacity-0 pointer-events-none"
        )}
        aria-label="Open D4 AI Assistant"
      >
        {/* Glow ring */}
        <div className="absolute inset-0 rounded-full border border-cyan-400/40 animate-ping opacity-20" />
        
        {/* Logo text */}
        <div className="relative text-center leading-none">
          <div className="text-cyan-400 font-bold text-lg tracking-tight flex items-center justify-center gap-0.5">
            <span className="text-xs opacity-70">››</span>
            <span>D4</span>
          </div>
          <div className="text-[10px] text-white font-medium -mt-0.5">AI</div>
        </div>

        {/* Chat bubble indicator */}
        <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-cyan-400 flex items-center justify-center">
          <span className="text-[10px] text-black font-bold">•</span>
        </div>
      </button>

      {/* Chat Panel */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-6">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Chat window */}
          <div className="relative w-full sm:w-[400px] h-[85vh] sm:h-[600px] max-h-[700px] bg-background border border-border sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
            
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-cyan-950/40 to-background">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-black border-2 border-cyan-400 flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.5)]">
                  <div className="text-center leading-none">
                    <div className="text-cyan-400 font-bold text-sm">D4</div>
                    <div className="text-[8px] text-white">AI</div>
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-sm">D4 AI Assistant</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    Online • Ready to help
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-cyan-600 text-white rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border bg-background">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Ask me anything about Data4Me..."
                  disabled={loading}
                  className="flex-1 h-11 rounded-xl border border-border bg-muted/50 px-4 text-sm outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="h-11 w-11 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center disabled:opacity-40 transition"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                D4 AI can make mistakes. Always double-check important info.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
    }
