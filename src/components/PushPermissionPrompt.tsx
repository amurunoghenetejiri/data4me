import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { permissionState, pushSupported, registerPushToken, refreshPushToken } from "@/lib/notifications";
import { toast } from "sonner";

const SNOOZE_KEY = "d4m_push_prompt_snoozed_at";
const SNOOZE_MS = 1000 * 60 * 60 * 6; // re-ask every 6 hours until enabled

export function PushPermissionPrompt() {
  const { user } = useApp();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) { setShow(false); return; }
    if (!pushSupported()) return;

    const state = permissionState();
    if (state === "granted") {
      refreshPushToken(user.id);
      setShow(false);
      return;
    }

    const snoozed = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    if (Date.now() - snoozed < SNOOZE_MS) return;

    const t = window.setTimeout(() => setShow(true), 2500);
    return () => window.clearTimeout(t);
  }, [user?.id]);

  if (!show || !user) return null;

  const blocked = permissionState() === "denied";

  async function enable() {
    if (!user?.id) return;
    setBusy(true);
    const res = await registerPushToken(user.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Notifications enabled on this device 🔔");
      setShow(false);
    } else {
      toast.error(res.error || "Could not enable notifications");
      if (permissionState() === "denied") {
        localStorage.setItem(SNOOZE_KEY, String(Date.now()));
      }
    }
  }

  function later() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setShow(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[24rem] z-[60] animate-fade-in">
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-elevated p-4 flex gap-3">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Turn on DATA4ME alerts</p>
          <p className="text-xs text-muted-foreground mt-1">
            {blocked
              ? "Notifications are blocked. Allow them for this site in your browser settings, then tap Retry."
              : "Get instant alerts for wallet funding, purchases and security events — even when the app is closed."}
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="bg-gradient-primary" onClick={enable} disabled={busy}>
              {busy ? "Enabling…" : blocked ? "Retry" : "Enable"}
            </Button>
            <Button size="sm" variant="ghost" onClick={later}>Not now</Button>
          </div>
        </div>
        <button onClick={later} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default PushPermissionPrompt;
