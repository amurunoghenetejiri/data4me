import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const LANGS: Record<string, string> = {
  en: "Reply in clear simple English.",
  pcm: "Reply in friendly Nigerian Pidgin English.",
  yo: "Reply in Yoruba (add a short English summary line at the end).",
  ig: "Reply in Igbo (add a short English summary line at the end).",
  ha: "Reply in Hausa (add a short English summary line at the end).",
};

const BASE_PROMPT = `You are **D4 AI**, the official assistant built into **Data4Me**, a Nigerian VTU platform (airtime, data, electricity, cable TV, wallet, transfers, referrals).

Personality: friendly, professional, intelligent, fast, conversational. Keep answers short (2–6 sentences) and use markdown (bold, short lists) when helpful.

You can help with:
- Navigating the site and guiding users step by step
- Registration, login, password reset, profile and KYC
- Wallet balance, funding (Paystack card or bank transfer + receipt), transfers, withdrawals
- Buying airtime, data, electricity and cable TV
- Transaction status, history, receipts, failed/pending explanations
- Referrals and rewards, notifications, FAQs, support tickets

App routes you may link to (use markdown links):
/buy-data, /buy-airtime, /electricity, /cable, /wallet, /transfer, /withdraw, /transactions, /referrals, /notifications, /profile, /settings, /support, /faq, /pricing, /bank

Rules:
- NEVER ask for or accept passwords, PINs or OTPs.
- Never invent prices, plans or balances. Only use the live context given below; otherwise tell the user to check the page.
- You cannot execute purchases yourself — guide the user to the right page and pre-fill instructions.
- Stay on Data4Me topics.`;

const ADMIN_PROMPT = `
ADMIN MODE: this user is a Data4Me administrator. You may also:
- Explain and summarise dashboard stats, revenue, deposits, withdrawals, transactions given in the context
- Help with user management, products & pricing, analytics questions (guide to /admin pages)
- WRITE professional notification copy on request: broadcasts, promotions, maintenance notices, wallet funding alerts, transaction success/pending/failed/refund messages, referral campaigns, security alerts, holiday announcements.
  When drafting a notification, always output it as:
  **Title:** ...
  **Body:** ...
  then tell them they can paste it in /admin/notifications to send to one user, selected users or everyone.`;

async function buildContext(supabase: any, userId: string | null, isAdmin: boolean, page?: string) {
  const lines: string[] = [];
  if (page) lines.push(`The user is currently on the page: ${page}`);
  if (!userId) {
    lines.push("The user is NOT logged in. Encourage sign in / registration for account actions.");
    return lines.join("\n");
  }
  const [profile, wallet, txs] = await Promise.all([
    supabase.from("profiles").select("full_name, username, email, phone, referral_code").eq("id", userId).maybeSingle(),
    supabase.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
    supabase.from("transactions").select("type, amount, status, created_at, reference, description")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
  ]);
  const p = profile.data;
  lines.push(`Logged-in user: ${p?.full_name || "-"} (@${p?.username || "-"}), phone ${p?.phone || "-"}, referral code ${p?.referral_code || "-"}.`);
  lines.push(`Wallet balance: NGN ${Number(wallet.data?.balance ?? 0).toLocaleString()}`);
  if (txs.data?.length) {
    lines.push("Recent transactions:");
    for (const t of txs.data) {
      lines.push(`- ${t.created_at?.slice(0, 16)} | ${t.type} | NGN ${t.amount} | ${t.status} | ref ${t.reference ?? "-"}${t.description ? ` | ${t.description}` : ""}`);
    }
  } else {
    lines.push("No transactions yet.");
  }

  if (isAdmin) {
    const [users, pending, deposits] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("funding_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("funding_requests").select("amount, status, created_at").order("created_at", { ascending: false }).limit(10),
    ]);
    lines.push(`ADMIN STATS — total users: ${users.count ?? "?"}, pending funding requests: ${pending.count ?? "?"}.`);
    if (deposits.data?.length) {
      lines.push(`Latest funding requests: ${deposits.data.map((d: any) => `NGN ${d.amount} (${d.status})`).join(", ")}`);
    }
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userId: string | null = null;
    if (authHeader) {
      const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = data?.user?.id ?? null;
    }

    let isAdmin = false;
    if (userId) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      isAdmin = (roles || []).some((r: { role: string }) => r.role === "admin");
    }

    const body = await req.json();
    const messages = (body.messages ?? []) as { role: string; content: unknown }[];
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }
    const lang = LANGS[body.lang as string] ?? LANGS.en;
    const context = await buildContext(supabase, userId, isAdmin, body.page);

    const system = [BASE_PROMPT, isAdmin ? ADMIN_PROMPT : "", `\nLANGUAGE: ${lang}`, `\nLIVE CONTEXT:\n${context}`]
      .filter(Boolean).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        stream: true,
        messages: [{ role: "system", content: system }, ...messages.slice(-14)],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("AI gateway error:", res.status, errText);
      if (res.status === 429) return json({ error: "Too many requests. Please wait a moment and try again." }, 429);
      if (res.status === 402) return json({ error: "AI credits exhausted. Please contact support." }, 402);
      return json({ error: "AI service temporarily unavailable" }, 502);
    }

    return new Response(res.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    console.error("ai-chat error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
