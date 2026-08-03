import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

type Body = {
  internal?: boolean;
  notification_id?: string;
  user_id?: string;
  title?: string;
  body?: string;
  type?: string;
  action_url?: string;
  icon?: string | null;
  image?: string | null;
  data?: Record<string, string>;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SETTING_COLUMN: Record<string, string> = {
  wallet: "wallet",
  funding: "wallet",
  transfer: "wallet",
  airtime: "airtime",
  data: "data",
  electricity: "electricity",
  cable: "cable",
  cashback: "cashback",
  referral: "referral",
  promotion: "promotion",
  security: "security",
  login: "security",
  ai: "ai",
  system: "system",
};

function getPrivateKey() {
  const raw = Deno.env.get("FIREBASE_PRIVATE_KEY") || "";
  return raw.replace(/\\n/g, "\n");
}

function b64url(input: string) {
  return btoa(input).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
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

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;

  const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") || "";
  const privateKey = getPrivateKey();
  if (!clientEmail || !privateKey) throw new Error("Firebase admin credentials missing");

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: clientEmail,
      sub: clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    }),
  );
  const unsigned = header + "." + claim;

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

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + sig,
    }),
  });

  const tokenJson = await res.json();
  if (!res.ok) throw new Error(tokenJson.error_description || "Failed to get Google token");
  cachedToken = { token: tokenJson.access_token as string, exp: now + 3300 };
  return cachedToken.token;
}

async function sendFcm(
  accessToken: string,
  projectId: string,
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
  icon?: string | null,
  image?: string | null,
) {
  const url = "https://fcm.googleapis.com/v1/projects/" + projectId + "/messages:send";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title, body, ...(image ? { image } : {}) },
        data,
        webpush: {
          notification: {
            icon: icon || "/data4me-logo.png",
            badge: "/favicon.png",
          },
          fcmOptions: { link: data.action_url || "/notifications" },
        },
      },
    }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function isDeadToken(status: number, text: string) {
  if (status === 404) return true;
  const t = text.toUpperCase();
  return (
    t.includes("UNREGISTERED") ||
    (t.includes("INVALID_ARGUMENT") && t.includes("TOKEN")) ||
    t.includes("NOT_FOUND")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const projectId = Deno.env.get("FIREBASE_PROJECT_ID") || "data4me";
    const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET") || "";

    const svc = createClient(supabaseUrl, serviceKey);

    const payload = (await req.json().catch(() => ({}))) as Body;

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const internalHeader = req.headers.get("x-internal-secret") || "";

    const isServiceRole = !!jwt && jwt === serviceKey;
    const isInternal =
      !!payload.internal &&
      (isServiceRole || (!!dispatchSecret && internalHeader === dispatchSecret));

    let callerId: string | null = null;
    let callerIsAdmin = false;

    if (!isInternal) {
      const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
      if (userErr || !userData?.user) {
        return json({ success: false, error: "Unauthorized" }, 401);
      }
      callerId = userData.user.id;
      const { data: roles } = await svc
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId);
      callerIsAdmin = (roles || []).some((r: { role: string }) => r.role === "admin");
    }

    const userId = payload.user_id || callerId;
    if (!userId) return json({ success: false, error: "user_id required" }, 400);

    if (!isInternal && userId !== callerId && !callerIsAdmin) {
      return json({ success: false, error: "Forbidden" }, 403);
    }

    const title = payload.title || "DATA4ME";
    const body = payload.body || "";
    const type = (payload.type || "system").toLowerCase();
    const actionUrl = payload.action_url || "/notifications";
    const icon = payload.icon ?? null;
    const image = payload.image ?? null;

    const column = SETTING_COLUMN[type];
    if (column) {
      const { data: prefs } = await svc
        .from("notification_settings")
        .select(column)
        .eq("user_id", userId)
        .maybeSingle();
      if (prefs && (prefs as Record<string, boolean>)[column] === false) {
        return json({ success: true, pushed: 0, skipped: "user_disabled_type" });
      }
    }

    if (!isInternal) {
      const { error: insErr } = await svc.from("notifications").insert({
        user_id: userId,
        title,
        body,
        message: body,
        type,
        icon,
        image,
        action_url: actionUrl,
        read: false,
        is_read: false,
        sent_by: callerId,
      });
      if (insErr) console.error("[send-push] history insert failed:", insErr.message);
    }

    const { data: tokens, error: tokErr } = await svc
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId);

    if (tokErr) {
      console.error("[send-push] token lookup failed:", tokErr.message);
      return json({ success: true, pushed: 0, error: tokErr.message });
    }

    if (!tokens || tokens.length === 0) {
      return json({ success: true, pushed: 0, message: "No push tokens for user" });
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch (e) {
      console.error("[send-push] firebase auth failed:", (e as Error).message);
      return json({ success: true, pushed: 0, error: "firebase_auth_failed" });
    }

    const dataMap: Record<string, string> = {
      type,
      action_url: actionUrl,
      title,
      body,
      ...(payload.notification_id ? { notification_id: payload.notification_id } : {}),
      ...Object.fromEntries(
        Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)]),
      ),
    };

    let pushed = 0;
    const dead: string[] = [];

    for (const row of tokens) {
      try {
        const r = await sendFcm(
          accessToken,
          projectId,
          row.token,
          title,
          body,
          dataMap,
          icon,
          image,
        );
        if (r.ok) pushed++;
        else {
          console.error("[send-push] fcm error", r.status, r.text);
          if (isDeadToken(r.status, r.text)) dead.push(row.token);
        }
      } catch (e) {
        console.error("[send-push] fcm exception:", (e as Error).message);
      }
    }

    if (dead.length) {
      await svc.from("push_tokens").delete().in("token", dead);
    }

    return json({ success: true, pushed, total: tokens.length, removed: dead.length });
  } catch (e) {
    console.error("[send-push] fatal:", (e as Error).message);
    return json({ success: false, error: (e as Error).message || "Unknown error" }, 200);
  }
});
