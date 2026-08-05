import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET") || "";
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: due, error } = await svc
      .from("scheduled_notifications")
      .select("*")
      .eq("status", "scheduled")
      .lte("send_at", new Date().toISOString())
      .limit(20);

    if (error) return json({ success: false, error: error.message }, 500);
    if (!due || due.length === 0) return json({ success: true, processed: 0 });

    const pushUrl = supabaseUrl.replace(/\/+$/, "") + "/functions/v1/send-push";
    let processed = 0;

    for (const job of due) {
      // claim the job so a concurrent run cannot send it twice
      const { data: claimed } = await svc
        .from("scheduled_notifications")
        .update({ status: "sending" })
        .eq("id", job.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      let ids: string[] = job.user_ids || [];
      if (!ids.length) {
        const { data: profiles } = await svc.from("profiles").select("id").limit(20000);
        ids = (profiles || []).map((p: { id: string }) => p.id);
      }

      const base = {
        title: job.title,
        body: job.body,
        message: job.body,
        type: job.type || "promotion",
        image: job.image,
        action_url: job.action_url || "/notifications",
        read: false,
        is_read: false,
      };

      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500).map((user_id) => ({ ...base, user_id }));
        await svc.from("notifications").insert(chunk);
      }

      let pushed = 0;
      for (let i = 0; i < ids.length; i += 10) {
        const batch = ids.slice(i, i + 10);
        const results = await Promise.all(
          batch.map(async (uid) => {
            try {
              const res = await fetch(pushUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "Bearer " + serviceKey,
                  "x-internal-secret": dispatchSecret,
                },
                body: JSON.stringify({
                  internal: true,
                  user_id: uid,
                  title: job.title,
                  body: job.body,
                  type: job.type || "promotion",
                  action_url: job.action_url || "/notifications",
                  image: job.image ?? null,
                }),
              });
              const data = await res.json().catch(() => ({}));
              return res.ok && (data.pushed ?? 0) > 0 ? 1 : 0;
            } catch {
              return 0;
            }
          }),
        );
        pushed += results.reduce((a: number, b: number) => a + b, 0);
      }

      await svc
        .from("scheduled_notifications")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          result: { recipients: ids.length, pushed },
        })
        .eq("id", job.id);

      processed++;
    }

    return json({ success: true, processed });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
