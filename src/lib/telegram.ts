import { supabase } from "@/integrations/supabase/client";

// Fire-and-forget Telegram notification. Never throws — Telegram failures
// must never interrupt user flows.
export function notifyTelegram(
  title: string,
  emoji: string,
  rows: Record<string, string | number | null | undefined>,
) {
  try {
    supabase.functions
      .invoke("telegram-notify", { body: { action: "notify", title, emoji, rows } })
      .catch(() => {});
  } catch {
    /* swallow */
  }
}
