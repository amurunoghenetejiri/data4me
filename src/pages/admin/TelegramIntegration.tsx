import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, CheckCircle2, XCircle, MessageCircle, Save, Zap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, PageHead } from "./_shared";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "connected"; bot?: any; chat?: any }
  | { kind: "error"; label: string; detail?: string };

const STATUS_LABEL: Record<string, string> = {
  invalid_bot_token: "Invalid Bot Token",
  invalid_chat_id: "Invalid Chat ID",
  telegram_api_error: "Telegram API Error",
  network_error: "Network Error",
  offline: "Offline",
};

// supabase.functions.invoke marks any non-2xx as `error`, hiding the JSON body.
// Read the real payload so admins see the actual Telegram error.
async function invokeFn(body: any, method?: "GET" | "POST") {
  const opts: any = {};
  if (body !== undefined) opts.body = body;
  if (method) opts.method = method;
  const { data, error } = await supabase.functions.invoke("telegram-notify", opts);
  if (error && (error as any).context && typeof (error as any).context.text === "function") {
    try {
      const txt = await (error as any).context.text();
      try { return { data: JSON.parse(txt), error: null }; } catch { return { data: { error: txt }, error: null }; }
    } catch { /* fall through */ }
  }
  return { data, error };
}

export default function AdminTelegramIntegration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [form, setForm] = useState({
    botToken: "",
    chatId: "",
    extraChatIds: "",
    enabled: true,
  });
  const [meta, setMeta] = useState<{ botTokenSet: boolean; masked: string }>({
    botTokenSet: false,
    masked: "",
  });

  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await invokeFn(undefined, "GET");
      if (!error && data) {
        setForm((f) => ({
          ...f,
          chatId: data.chatId || "",
          extraChatIds: data.extraChatIds || "",
          enabled: data.enabled !== false,
        }));
        setMeta({ botTokenSet: !!data.botTokenSet, masked: data.botTokenMasked || "" });
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    const payload: any = {
      chatId: form.chatId.trim(),
      extraChatIds: form.extraChatIds.trim(),
      enabled: form.enabled,
    };
    if (form.botToken.trim()) payload.botToken = form.botToken.trim();
    const { data, error } = await invokeFn({ action: "save", settings: payload });
    setSaving(false);
    if (error || data?.error) return toast.error(data?.error || error?.message || "Save failed");
    toast.success("Telegram configuration saved");
    setForm((f) => ({ ...f, botToken: "", chatId: payload.chatId, extraChatIds: payload.extraChatIds }));
    setMeta((m) => ({ botTokenSet: true, masked: payload.botToken ? "••••" + payload.botToken.slice(-4) : m.masked }));
  }

  async function testConnection() {
    setTesting(true);
    setStatus({ kind: "checking" });
    const body: any = { action: "test" };
    if (form.botToken.trim()) body.botToken = form.botToken.trim();
    if (form.chatId.trim()) body.chatId = form.chatId.trim();
    const { data, error } = await invokeFn(body);
    setTesting(false);
    if (error) {
      setStatus({ kind: "error", label: "Network Error", detail: error.message });
      return;
    }
    if (data?.status === "connected") {
      setStatus({ kind: "connected", bot: data.bot, chat: data.chat });
      toast.success("Telegram bot connected");
    } else {
      setStatus({
        kind: "error",
        label: STATUS_LABEL[data?.status] || "Unknown Error",
        detail: data?.error || data?.telegramError,
      });
    }
  }

  async function verifyChatId() {
    setVerifying(true);
    const body: any = { action: "verify_chat" };
    if (form.botToken.trim()) body.botToken = form.botToken.trim();
    if (form.chatId.trim()) body.chatId = form.chatId.trim();
    const { data, error } = await invokeFn(body);
    setVerifying(false);
    if (error) return toast.error(error.message || "Verification failed");
    if (data?.status === "verified") {
      setStatus({ kind: "connected", chat: { id: data.chatId, title: "Verified via getUpdates", type: "verified" } });
      toast.success(`Chat ID ${data.chatId} verified — user has started the bot.`);
    } else if (data?.status === "not_started") {
      toast.error("This Chat ID has never started the bot. Open Telegram, press Start, then Verify again.");
      setStatus({ kind: "error", label: "Chat has not started bot", detail: data.error });
    } else {
      toast.error(data?.error || "Verification failed");
      setStatus({ kind: "error", label: STATUS_LABEL[data?.status] || "Verification Error", detail: data?.error });
    }
  }

  async function sendTestMessage() {
    setSending(true);
    const { data, error } = await invokeFn({ action: "send_test" });
    setSending(false);
    if (error || data?.error || !data?.ok) {
      const msg = data?.error || error?.message || "Failed to send message";
      toast.error(msg);
      setStatus({ kind: "error", label: "Send Failed", detail: msg });
      return;
    }
    toast.success(`Test message sent to ${data.sent} chat(s)`);
  }

  async function registerWebhook() {
    const { data, error } = await invokeFn({ action: "set_webhook" });
    if (error || !data?.ok) {
      toast.error(data?.result?.description || error?.message || "Webhook registration failed");
      return;
    }
    toast.success("Webhook registered — inline buttons are live");
  }


  return (
    <div>
      <PageHead
        title="Telegram Integration"
        subtitle="Route real-time DATA4ME notifications to Telegram"
        icon={MessageCircle}
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-300" /> Configuration
          </h3>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <>
              <Field label={`Telegram Bot Token ${meta.botTokenSet ? `(saved: ${meta.masked})` : ""}`}>
                <input
                  type="password"
                  autoComplete="off"
                  value={form.botToken}
                  onChange={(e) => setForm({ ...form, botToken: e.target.value })}
                  placeholder={meta.botTokenSet ? "Leave blank to keep current" : "1234567890:AA…"}
                  className="w-full h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm font-mono"
                />
              </Field>
              <Field label="Primary Chat ID">
                <input
                  value={form.chatId}
                  onChange={(e) => setForm({ ...form, chatId: e.target.value })}
                  placeholder="-1001234567890"
                  className="w-full h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm font-mono"
                />
              </Field>
              <Field label="Additional Chat IDs (comma-separated, optional)">
                <input
                  value={form.extraChatIds}
                  onChange={(e) => setForm({ ...form, extraChatIds: e.target.value })}
                  placeholder="123456789,-1009876543210"
                  className="w-full h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm font-mono"
                />
              </Field>
              <label className="flex items-center gap-2 mt-2 mb-4 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-white/20 bg-slate-800"
                />
                Enable Telegram Notifications
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 h-10 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Configuration
                </button>
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="px-4 h-10 rounded-lg bg-white/10 border border-white/10 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Test Connection
                </button>
                <button
                  onClick={verifyChatId}
                  disabled={verifying}
                  className="px-4 h-10 rounded-lg bg-white/10 border border-white/10 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Verify Chat ID
                </button>
                <button
                  onClick={sendTestMessage}
                  disabled={sending}
                  className="px-4 h-10 rounded-lg bg-emerald-600/90 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Test Message
                </button>
                <button
                  onClick={registerWebhook}
                  className="px-4 h-10 rounded-lg bg-violet-600/90 text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Zap className="h-4 w-4" /> Register Webhook
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-3">
                Tokens are stored server-side in the encrypted secrets table and never exposed to the browser.
              </p>
            </>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="font-semibold text-white mb-4">Connection Status</h3>
          {status.kind === "idle" && <p className="text-sm text-slate-400">Run a connection test to view live status.</p>}
          {status.kind === "checking" && (
            <p className="text-sm text-slate-300 inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking bot & chat…
            </p>
          )}
          {status.kind === "connected" && (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Connected
              </div>
              {status.bot && (
                <p className="text-sm text-slate-300">
                  Bot: <span className="font-mono">@{status.bot.username}</span> ({status.bot.first_name})
                </p>
              )}
              {status.chat && (
                <p className="text-sm text-slate-300">
                  Chat: <span className="font-mono">{status.chat.title || status.chat.username || status.chat.id}</span>{" "}
                  <span className="text-slate-500">type={status.chat.type}</span>
                </p>
              )}
            </div>
          )}
          {status.kind === "error" && (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-semibold">
                <XCircle className="h-4 w-4" /> {status.label}
              </div>
              {status.detail && (
                <p className="text-xs text-rose-300/80 bg-rose-500/10 rounded-lg px-3 py-2 border border-rose-500/20 whitespace-pre-wrap">
                  {status.detail}
                </p>
              )}
            </div>
          )}

          <hr className="border-white/10 my-5" />
          <h4 className="text-sm font-semibold text-white mb-2">Events routed to Telegram</h4>
          <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
            <li>New user registration</li>
            <li>Wallet funding request / approval / credit</li>
            <li>Airtime, Data, Cable, Electricity purchases</li>
            <li>Failed transactions with wallet refund</li>
            <li>Admin actions & security alerts</li>
            <li>SMEAPI provider status changes</li>
          </ul>
        </GlassCard>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
