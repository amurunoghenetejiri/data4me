import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You are **D4 AI**, the official smart assistant of **Data4Me** – a popular Nigerian VTU platform for buying airtime, data, electricity, cable TV, and more.

Your personality:
- Friendly, helpful, and professional
- Speak simple clear English (you can use light Nigerian Pidgin when it feels natural)
- Always be accurate about Data4Me services
- Never invent prices or plans. If you don't know the exact current price, tell the user to check the app.

What you can help with:
1. How to buy airtime, data, electricity, cable
2. How to fund wallet (Paystack or bank transfer)
3. Explaining transaction status, refunds, pending funding
4. Recommending the best data plans
5. Answering FAQs about the platform
6. Guiding users step-by-step

Rules:
- Never ask for or store passwords, PINs, or OTP
- Never process real payments yourself
- If a user wants to buy something, guide them to the correct page in the app
- If the question is outside Data4Me, politely redirect them
- Keep answers short and useful (prefer 2–6 sentences)

Current main services on Data4Me:
- Airtime (MTN, Glo, Airtel, 9mobile)
- Data plans
- Electricity
- Cable TV (DSTV, GOTV, Startimes)
- Wallet funding
- Referrals

Always end helpful answers with a short question if it makes sense (e.g. "Would you like me to guide you step by step?").`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return json({ error: "OpenAI key not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        global: { headers: { Authorization: authHeader || "" } },
      }
    );

    // Get user if logged in (optional)
    let userId: string | null = null;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }

    const body = await req.json();
    const messages = body.messages as { role: string; content: string }[];

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    // Call OpenAI
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",          // fast + cheap, very good
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.slice(-12),      // keep last 12 messages for context
        ],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error("OpenAI error:", err);
      return json({ error: "AI service temporarily unavailable" }, 502);
    }

    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate a reply.";

    return json({
      reply,
      model: "gpt-4o-mini",
    });

  } catch (err) {
    console.error("ai-chat error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
