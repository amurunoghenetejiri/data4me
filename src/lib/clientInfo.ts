// Best-effort client environment info for Telegram notifications.
// Everything here is fire-and-forget and must never throw.

export function parseUserAgent(ua: string = navigator.userAgent): { device: string; os: string } {
  const os = /Windows NT 10/i.test(ua) ? "Windows 10/11"
    : /Windows NT/i.test(ua) ? "Windows"
    : /Mac OS X ([\d_\.]+)/i.test(ua) ? `macOS ${(ua.match(/Mac OS X ([\d_\.]+)/i)?.[1] || "").replace(/_/g, ".")}`
    : /Android ([\d\.]+)/i.test(ua) ? `Android ${ua.match(/Android ([\d\.]+)/i)?.[1]}`
    : /iPhone OS ([\d_]+)/i.test(ua) ? `iOS ${(ua.match(/iPhone OS ([\d_]+)/i)?.[1] || "").replace(/_/g, ".")}`
    : /Linux/i.test(ua) ? "Linux"
    : "Unknown";

  const device = /Edg\//i.test(ua) ? "Edge"
    : /OPR\//i.test(ua) ? "Opera"
    : /Chrome\/([\d\.]+)/i.test(ua) ? `Chrome ${ua.match(/Chrome\/([\d\.]+)/i)?.[1].split(".")[0]}`
    : /Firefox\/([\d\.]+)/i.test(ua) ? `Firefox ${ua.match(/Firefox\/([\d\.]+)/i)?.[1].split(".")[0]}`
    : /Safari\//i.test(ua) ? "Safari"
    : "Unknown browser";

  return { device, os };
}

let cachedIp: string | null = null;
export async function getClientIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
    clearTimeout(to);
    const j = await res.json().catch(() => ({}));
    cachedIp = (j?.ip as string) || "";
    return cachedIp || "unknown";
  } catch {
    return "unknown";
  }
}
