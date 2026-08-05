import { getToken, onMessage } from "firebase/messaging";
import { getFirebaseMessaging, VAPID_KEY } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";

function deviceName() {
  const ua = navigator.userAgent;
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /opr\//i.test(ua)
      ? "Opera"
      : /chrome|crios/i.test(ua)
        ? "Chrome"
        : /firefox|fxios/i.test(ua)
          ? "Firefox"
          : /safari/i.test(ua)
            ? "Safari"
            : "Browser";
  const os = /android/i.test(ua)
    ? "Android"
    : /iphone|ipad|ipod/i.test(ua)
      ? "iOS"
      : /windows/i.test(ua)
        ? "Windows"
        : /mac os/i.test(ua)
          ? "macOS"
          : /linux/i.test(ua)
            ? "Linux"
            : "Unknown";
  return { label: `${browser} on ${os}`, browser, os };
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function permissionState(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

export async function registerPushToken(userId: string, opts?: { silent?: boolean }) {
  if (typeof window === "undefined") {
    return { ok: false, error: "Not in browser" };
  }

  if (!pushSupported()) {
    return { ok: false, error: "Push not supported on this browser" };
  }

  const permission = opts?.silent
    ? Notification.permission
    : await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Permission denied" };
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/firebase-cloud-messaging-push-scope",
    });
    await navigator.serviceWorker.ready;
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Service worker failed" };
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return { ok: false, error: "Messaging not supported" };
  }

  if (!VAPID_KEY) {
    return { ok: false, error: "Missing VAPID key" };
  }

  let token: string | null = null;
  try {
    token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Could not get device token" };
  }

  if (!token) {
    return { ok: false, error: "No FCM token" };
  }

  const info = deviceName();
  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      token,
      device_name: info.label,
      device_type: /android|iphone|ipad|ipod/i.test(navigator.userAgent) ? "mobile" : "web",
      browser: info.browser,
      platform: info.os,
      is_active: true,
      failure_count: 0,
      last_error: null,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "user_id,token" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, token };
}

/** Refresh the token / last_seen on every authenticated visit once permission exists. */
export async function refreshPushToken(userId: string) {
  if (permissionState() !== "granted") return;
  await registerPushToken(userId, { silent: true });
}

/** Report delivery / open receipts so admins see real delivery status. */
export async function ackPush(kind: "delivered" | "opened", notificationId?: string) {
  try {
    await supabase.functions.invoke("send-push", {
      body: { ack: kind, notification_id: notificationId },
    });
  } catch {
    /* non-fatal */
  }
}

export async function listenForegroundMessages(
  onPayload: (payload: unknown) => void,
) {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    const id = (payload as { data?: Record<string, string> })?.data?.notification_id;
    ackPush("delivered", id);
    onPayload(payload);
  });
}
