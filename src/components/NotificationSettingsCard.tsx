import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";
import { Bell, BellOff, Loader2, Volume2, VolumeX } from "lucide-react";
import { NOTIFICATION_TYPES } from "@/lib/notificationTypes";
import { isSoundMuted, setSoundMuted, playNotificationSound } from "@/lib/notificationSound";
import { registerPushToken } from "@/lib/notifications";

type Prefs = Record<string, boolean>;

const DEFAULTS: Prefs = Object.fromEntries([
  ...NOTIFICATION_TYPES.map((t) => [t.key, true]),
  ["email", false],
  ["whatsapp", false],
]);

export function NotificationSettingsCard() {
  const { user } = useApp();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [muted, setMuted] = useState(isSoundMuted());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      const { data } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      if (data) {
        const next = { ...DEFAULTS };
        for (const key of Object.keys(DEFAULTS)) {
          const v = (data as Record<string, unknown>)[key];
          if (typeof v === "boolean") next[key] = v;
        }
        setPrefs(next);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user?.id]);

  async function update(key: string, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("notification_settings")
      .upsert({ user_id: user.id, [key]: value } as never, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      setPrefs((p) => ({ ...p, [key]: !value }));
      toast.error("Could not save preference");
    }
  }

  async function enablePush() {
    if (!user?.id) return;
    const res = await registerPushToken(user.id);
    setPermission("Notification" in window ? Notification.permission : "unsupported");
    if (res.ok) toast.success("Push notifications enabled on this device");
    else toast.error(res.error || "Could not enable push notifications");
  }

  function toggleSound() {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
    if (!next) playNotificationSound("cashback");
  }

  if (loading) {
    return (
      <Card className="p-6 shadow-card flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your preferences…
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold flex items-center gap-2">
              {permission === "granted" ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
              Device push notifications
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {permission === "granted"
                ? "This device receives push alerts, even when DATA4ME is closed."
                : permission === "denied"
                  ? "Blocked in your browser settings. Allow notifications for this site, then retry."
                  : "Get instant alerts on this device for wallet, purchases and security events."}
            </p>
          </div>
          {permission !== "granted" && (
            <Button onClick={enablePush} className="bg-gradient-primary shrink-0">Enable</Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 mt-5 pt-4 border-t border-border">
          <div>
            <p className="font-medium flex items-center gap-2">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} Notification sounds
            </p>
            <p className="text-sm text-muted-foreground">Play a short tone when a new alert arrives.</p>
          </div>
          <Switch checked={!muted} onCheckedChange={toggleSound} />
        </div>
      </Card>

      <Card className="p-5 sm:p-6 shadow-card">
        <p className="font-semibold mb-1">What you get notified about</p>
        <p className="text-sm text-muted-foreground mb-4">
          Turn categories off to stop both push and in-app alerts for them. {saving && <span className="text-primary">Saving…</span>}
        </p>
        <div className="divide-y divide-border">
          {NOTIFICATION_TYPES.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{t.emoji} {t.label}</p>
                <p className="text-sm text-muted-foreground">{t.description}</p>
              </div>
              <Switch checked={prefs[t.key]} onCheckedChange={(v) => update(t.key, v)} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 sm:p-6 shadow-card">
        <p className="font-semibold mb-3">Other channels</p>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium">📧 Email alerts</p>
              <p className="text-sm text-muted-foreground">Receipts and important account emails.</p>
            </div>
            <Switch checked={prefs.email} onCheckedChange={(v) => update("email", v)} />
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium">💬 WhatsApp alerts</p>
              <p className="text-sm text-muted-foreground">Get key updates on WhatsApp when available.</p>
            </div>
            <Switch checked={prefs.whatsapp} onCheckedChange={(v) => update("whatsapp", v)} />
          </div>
        </div>
      </Card>
    </div>
  );
}
