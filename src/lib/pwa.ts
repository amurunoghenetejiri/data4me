/**
 * Guarded service-worker registration for DATA4ME.
 * Never registers the app-shell worker in dev / Lovable preview / iframes.
 * The Firebase messaging worker (/firebase-messaging-sw.js) is separate and untouched.
 */
const APP_SW_PATH = "/sw.js";

function blockedHost(host: string) {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

export function shouldRegisterServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  if (window.self !== window.top) return false;
  if (blockedHost(window.location.hostname)) return false;
  if (new URLSearchParams(window.location.search).has("sw")) {
    return new URLSearchParams(window.location.search).get("sw") !== "off";
  }
  return true;
}

async function unregisterAppWorker() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => (r.active?.scriptURL || r.installing?.scriptURL || "").includes(APP_SW_PATH))
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export async function registerAppServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!shouldRegisterServiceWorker()) {
    await unregisterAppWorker();
    return;
  }
  try {
    await navigator.serviceWorker.register(APP_SW_PATH, { scope: "/" });
  } catch {
    /* ignore */
  }
}

/** True when the app is running as an installed PWA. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
