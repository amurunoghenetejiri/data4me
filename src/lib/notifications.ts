import { getToken, onMessage } from "firebase/messaging";
import { getFirebaseMessaging, VAPID_KEY } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";

export async function registerPushToken(userId: string) {
  if (typeof window === "undefined") {
    return { ok: false, error: "Not in browser" };
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, error: "Push not supported on this browser" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Permission denied" };
  }

  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js"
  );

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return { ok: false, error: "Messaging not supported" };
  }

  if (!VAPID_KEY) {
    return { ok: false, error: "Missing VAPID key" };
  }

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    return { ok: false, error: "No FCM token" };
  }

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      token,
      device_type: "web",
      browser: navigator.userAgent,
      platform: navigator.platform,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "user_id,token" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, token };
}

export async function listenForegroundMessages(
  onPayload: (payload: unknown) => void
) {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, onPayload);
}
