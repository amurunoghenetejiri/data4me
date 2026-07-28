const STORAGE_KEY = "d4m_ref";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Read ?ref= from the current URL and store it. Safe to call on every page load. */
export function captureReferralFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref =
      params.get("ref") ||
      params.get("referral") ||
      params.get("referral_code");
    if (!ref) return getPendingReferral();

    const code = ref.trim().toUpperCase();
    if (!code || code.length < 3) return getPendingReferral();

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ code, savedAt: Date.now() })
    );

    // Clean URL so refresh doesn't look messy (keep path/hash)
    params.delete("ref");
    params.delete("referral");
    params.delete("referral_code");
    const qs = params.toString();
    const clean =
      window.location.pathname +
      (qs ? `?${qs}` : "") +
      window.location.hash;
    window.history.replaceState({}, "", clean);

    return code;
  } catch {
    return null;
  }
}

/** Code saved from a previous visit (or null if missing/expired). */
export function getPendingReferral(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: string; savedAt?: number };
    if (!parsed?.code) return null;
    if (parsed.savedAt && Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return String(parsed.code).trim().toUpperCase();
  } catch {
    return null;
  }
}

/** Clear after successful signup so it is not reused. */
export function clearPendingReferral() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Public referral link for a code. */
export function referralLink(code: string): string {
  return `https://data4me.name.ng/?ref=${encodeURIComponent(code)}`;
      }
