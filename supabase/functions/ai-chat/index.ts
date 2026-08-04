import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runTool, toolSchemas, type ToolCtx } from "./tools.ts";

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

const MODEL = "google/gemini-3.6-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const LANGS: Record<string, string> = {
  en: "Reply in clear simple English.",
  pcm: "Reply in friendly Nigerian Pidgin English.",
  yo: "Reply in Yoruba (add a short English summary line at the end).",
  ig: "Reply in Igbo (add a short English summary line at the end).",
  ha: "Reply in Hausa (add a short English summary line at the end).",
};

const BASE_PROMPT = `You are **D4 AI**, the AI Operations Agent built into **Data4Me**, a Nigerian VTU platform (airtime, data, electricity, cable TV, wallet, referrals).

You are an AGENT, not just a chatbot: you have real tools that execute real backend actions. Use them instead of telling the user to do it manually, whenever a tool exists for the job.

How to work:
1. Understand the natural-language request (e.g. "buy the cheapest MTN 1GB for 08012345678", "fund my wallet with 500").
2. Gather facts with read tools first (find_plans, get_wallet, list_transactions...). Never invent prices, balances or plan names.
3. For any action that spends money or changes data, state exactly what you are about to do (item, amount, recipient, total) and ask the user to confirm. Only then call the tool again with confirm:true.
4. If a tool returns requires_confirmation, do NOT retry silently — ask the user first.
5. If a tool returns an error, explain it plainly and offer the next best step.
6. After a successful action, confirm it with the amount, reference/transaction id and a markdown link to /transactions.

Style: friendly, professional, fast. Short answers (2-6 sentences), markdown, bold key numbers. Currency is NGN (₦).

App routes you may link to: /buy-data, /buy-airtime, /electricity, /cable, /wallet, /transfer, /withdraw, /transactions, /referrals, /notifications, /profile, /settings, /support, /faq, /pricing, /bank

Hard rules:
- NEVER ask for or accept passwords, PINs or OTPs.
- Never perform an action for a different user unless you are in Admin Mode.
- Never claim an action succeeded unless a tool returned success.
- Stay on Data4Me topics.`;

const ADMIN_PROMPT = `
ADMIN MODE: this user is a Data4Me administrator, so admin tools are available. You can manage users, wallets, funding approvals, refunds, products & pricing, charges/cashback, notifications, analytics and AI settings.
- Always name the exact user (email/username) and amount before an admin action, and get confirmation.
- Use admin_review_receipt before approving a funding request when receipt review is enabled; report the confidence and signals, and recommend approve/reject/flag. The admin makes the final call unless they explicitly tell you to auto-approve high-confidence receipts.
- When asked to write notification copy, output **Title:** and **Body:** then offer to send it with admin_send_notification.
- Bulk actions can affect many rows — always summarise the blast radius (how many users/plans) before confirming.`;

async function buildContext(svc: any, userId: string | null, isAdmin: boolean, page?: string) {
  const lines: string[] = [];
  if (page) lines.push(`Current page: ${page}`);
  if (!userId) {
    lines.push("The user is NOT logged in. Account actions are unavailable — encourage sign in / registration.");
    return lines.join("\n");
  }
  const [profile, wallet, txs] = await Promise.all([
    svc.from("profiles").select("full_name, username, email, phone, referral_code").eq("id", userId).maybeSingle(),
    svc.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
    svc.from("transactions").select("type, amount, status, created_at, reference, description")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
  ]);
  const p = profile.data;
  lines.push(`Signed-in user id: ${userId}`);
  lines.push(`Name: ${p?.full_name || "-"} (@${p?.username || "-"}), phone ${p?.phone || "-"}, referral code ${p?.referral_code || "-"}.`);
  lines.push(`Wallet balance: NGN ${Number(wallet.data?.balance ?? 0).toLocaleString()}`);
  if (txs.data?.length) {
    lines.push("Recent transactions:");
    for (const t of txs.data) {
      lines.push(`- ${t.created_at?.slice(0, 16)} | ${t.type} | NGN ${t.amount} | ${t.status} | ref ${t.reference ?? "-"}`);
    }
  } else lines.push("No transactions yet.");
  if (isAdmin) lines.push("This user has the ADMIN role.");
  return lines.join("\n");
}

function sse(obj: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") || "";
    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let userId: string | null = null;
    let email: string | null = null;
    if (authHeader) {
      const { data } = await svc.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = data?.user?.id ?? null;
      email = data?.user?.email ?? null;
    }

    let isAdmin = false;
    if (userId) {
      const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", userId);
      isAdmin = (roles || []).some((r: { role: string }) => r.role === "admin");
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: settingRows } = await svc.from("ai_settings").select("key, enabled");
    const settings: Record<string, boolean> = {};
    for (const r of settingRows ?? []) settings[r.key] = r.enabled;

    const body = await req.json();
    const incoming = (body.messages ?? []) as { role: string; content: unknown }[];
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    const lang = LANGS[body.lang as string] ?? LANGS.en;
    const context = await buildContext(svc, userId, isAdmin, body.page);
    const system = [
      BASE_PROMPT,
      isAdmin ? ADMIN_PROMPT : "",
      `\nAI CAPABILITY SWITCHES (off = tool refuses): ${JSON.stringify(settings)}`,
      `\nLANGUAGE: ${lang}`,
      `\nLIVE CONTEXT:\n${context}`,
    ].filter(Boolean).join("\n");

    const ctx: ToolCtx = { svc, userClient, authHeader, userId, email, isAdmin, settings, supabaseUrl };
    const tools = toolSchemas(isAdmin);
    const convo: any[] = [{ role: "system", content: system }, ...incoming.slice(-14)];

    const stream = new ReadableStream({
      async start(controller) {
        const fail = (msg: string) => {
          controller.enqueue(sse({ choices: [{ delta: { content: `⚠️ ${msg}` } }] }));
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        };

        try {
          // Tool-calling rounds (non-streaming), then a final streamed answer.
          for (let round = 0; round < 6; round++) {
            const res = await fetch(GATEWAY, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
              body: JSON.stringify({ model: MODEL, messages: convo, tools, tool_choice: "auto" }),
            });

            if (!res.ok) {
              const t = await res.text();
              console.error("gateway error", res.status, t);
              return fail(
                res.status === 429 ? "Too many requests. Please wait a moment and try again."
                : res.status === 402 ? "AI credits exhausted. Please contact support."
                : "AI service temporarily unavailable.",
              );
            }

            const data = await res.json();
            const msg = data.choices?.[0]?.message;
            const calls = msg?.tool_calls ?? [];
            if (!calls.length) {
              if (msg?.content) {
                controller.enqueue(sse({ choices: [{ delta: { content: msg.content } }] }));
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }
              break;
            }

            convo.push(msg);
            for (const call of calls) {
              const name = call.function?.name;
              let args: any = {};
              try { args = JSON.parse(call.function?.arguments || "{}"); } catch { /* noop */ }
              controller.enqueue(sse({ choices: [{ delta: { d4_tool: name } }] }));
              const result = await runTool(name, args, ctx);
              convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
            }
          }

          // Final answer, streamed.
          const finalRes = await fetch(GATEWAY, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
            body: JSON.stringify({ model: MODEL, messages: convo, stream: true }),
          });
          if (!finalRes.ok || !finalRes.body) return fail("AI service temporarily unavailable.");
          const reader = finalRes.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (e) {
          console.error("ai-chat stream error", e);
          try { fail("Something went wrong. Please try again."); } catch { /* closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    console.error("ai-chat error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
