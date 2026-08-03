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

type Body = {
  title?: string;
  body?: string;
  type?: string;
  icon?: string | null;
  image?: string | null;
  action_url?: string;
  user_ids?: string[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET") || "";

    const svc = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const { data: userData, error: userErr } = await svc.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ success: false, error: "Unauthorized" }, 401);

    const { data: roles } = await svc
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (!(roles || []).some((r: { role: string }) => r.role === "admin")) {
      return json({ success: false, error: "Forbidden" }, 403);
    }

    const payload = (await req.json()) as Body;
    const title = (payload.title || "").trim();
    const body = (payload.body || "").trim();
    if (!title || !body) return json({ success: false, error: "Title and body are required" }, 400);

    const type = (payload.type || "promotion").toLowerCase();
    const actionUrl = payload.action_url || "/notifications";

    let ids = payload.user_ids?.filter(Boolean) ?? [];
    if (ids.length === 0) {
      const { data: profiles, error } = await svc.from("profiles").select("id");
      if (error) return json({ success: false, error: error.message }, 500);
      ids = (profiles || []).map((p: { id: string }) => p.id);
    }

    const base = {
      title,
      body,
      message: body,
      type,
      icon: payload.icon ?? null,
      image: payload.image ?? null,
      action_url: actionUrl,
      read: false,
      is_read: false,
      sent_by: userData.user.id,
    };

    let inserted = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500).map((user_id) => ({ ...base, user_id }));
      const { error } = await svc.from("notifications").insert(chunk);
      if (error) {
        console.error("[broadcast] insert failed:", error.message);
        return json({ success: false, error: error.message, inserted }, 500);
      }
      inserted += chunk.length;
    }

    if (!payload.user_ids?.length) {
      await svc.from("notifications").insert({ ...base, user_id: null });
    }

    await svc.from("audit_logs").insert({
      admin_id: userData.user.id,
      admin_email: userData.user.email,
      action: "notification_broadcast",
      target_type: "notification",
      details: { title, type, recipients: inserted },
    });

    // Send real device push (this was missing before)
    const pushUrl = supabaseUrl.replace(/\/+$/, "") + "/functions/v1/send-push";
    let pushedUsers = 0;
    let pushErrors = 0;
    const BATCH = 10;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
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
                title,
                body,
                type,
                action_url: actionUrl,
                icon: payload.icon ?? null,
                image: payload.image ?? null,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data && (data.pushed > 0 || data.success)) return "ok";
            console.error("[broadcast] push failed for", uid, data);
            return "err";
          } catch (e) {
            console.error("[broadcast] push exception", (e as Error).message);
            return "err";
          }
        }),
      );
      for (const r of results) {
        if (r === "ok") pushedUsers++;
        else pushErrors++;
      }
    }

    return json({
      success: true,
      recipients: inserted,
      push_attempted: ids.length,
      push_ok: pushedUsers,
      push_errors: pushErrors,
    });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
