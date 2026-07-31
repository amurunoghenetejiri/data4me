import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Body = {
  user_id?: string;
  title?: string;
  body?: string;
  type?: string;
  action_url?: string;
  data?: Record<string, string>;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getPrivateKey() {
  const raw = Deno.env.get("FIREBASE_PRIVATE_KEY") || "";
  return raw.replace(/\\n/g, "\n");
}

async function getAccessToken() {
  const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") || "";
  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const claim = btoa(
    JSON.stringify({
      iss: clientEmail,
      sub: clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    }),
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const unsigned = `\( {header}. \){claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `\( {unsigned}. \){sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(tokenJson.error_description || "Failed to get Google token");
  }
  return tokenJson.access_token as string;
}

function pemToArrayBuffer(pem: string) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function sendFcm(
  accessToken: string,
  projectId: string,
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title, body },
        data,
        webpush: {
          fcmOptions: {
            link: data.action_url || "/",
          },
        },
      },
    }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const projectId = Deno.env.get("FIREBASE_PROJECT_ID") || "data4me";

    const svc = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const payload = (await req.json()) as Body;
    const userId = payload.user_id || userData.user.id;
    const title = payload.title || "DATA4ME";
    const body = payload.body || "";
    const type = payload.type || "system";
    const actionUrl = payload.action_url || "/";
    const extra = payload.data || {};

    // Only allow sending to self unless admin
    if (userId !== userData.user.id) {
      const { data: roles } = await svc
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      const isAdmin = (roles || []).some((r: any) => r.role === "admin");
      if (!isAdmin) {
        return json({ success: false, error: "Forbidden" }, 403);
      }
    }

    await svc.from("notifications").insert({
      user_id: userId,
      title,
      body,
      message: body,
      type,
      action_url: actionUrl,
      is_read: false,
      sent_by: userData.user.id,
    });

    const { data: tokens, error: tokErr } = await svc
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId);

    if (tokErr) {
      return json({ success: false, error: tokErr.message }, 500);
    }

    if (!tokens || tokens.length === 0) {
      return json({
        success: true,
        pushed: 0,
        message: "Saved in notifications, but no push tokens for user",
      });
    }

    const accessToken = await getAccessToken();
    const dataMap: Record<string, string> = {
      type,
      action_url: actionUrl,
      ...Object.fromEntries(
        Object.entries(extra).map(([k, v]) => [k, String(v)]),
      ),
    };

    const results = [];
    for (const row of tokens) {
      const r = await sendFcm(
        accessToken,
        projectId,
        row.token,
        title,
        body,
        dataMap,
      );
      results.push(r);
    }

    const pushed = results.filter((r) => r.ok).length;
    return json({ success: true, pushed, total: tokens.length, results });
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Unknown error" }, 500);
  }
});
