import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Gift, Save, Loader2 } from "lucide-react";
import { GlassCard } from "@/pages/admin/_shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Settings = {
  welcome_bonus: number;
  funding_percent: number;
  min_funding_amount: number;
  is_active: boolean;
};

const DEFAULTS: Settings = {
  welcome_bonus: 100,
  funding_percent: 2,
  min_funding_amount: 100,
  is_active: true,
};

export function ReferralSettingsCard() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("referral_settings")
        .select("welcome_bonus, funding_percent, min_funding_amount, is_active")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        setS({
          welcome_bonus: Number(data.welcome_bonus),
          funding_percent: Number(data.funding_percent),
          min_funding_amount: Number(data.min_funding_amount),
          is_active: !!data.is_active,
        });
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("referral_settings")
      .update({ ...s, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Referral settings saved");
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <Gift className="h-4 w-4 text-violet-300" />
        <h3 className="font-semibold text-white">Referral Program</h3>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Welcome bonus paid to a new user, and the commission a referrer earns on every wallet funding.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-slate-300">Welcome bonus (₦)</Label>
              <Input
                type="number" min={0} step="1" value={s.welcome_bonus}
                onChange={(e) => setS({ ...s, welcome_bonus: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-slate-300">Funding commission (%)</Label>
              <Input
                type="number" min={0} max={100} step="0.1" value={s.funding_percent}
                onChange={(e) => setS({ ...s, funding_percent: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-slate-300">Minimum funding (₦)</Label>
              <Input
                type="number" min={0} step="1" value={s.min_funding_amount}
                onChange={(e) => setS({ ...s, min_funding_amount: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-white">Referral program active</p>
              <p className="text-xs text-slate-400">Turn off to pause bonuses and commissions.</p>
            </div>
            <Switch checked={s.is_active} onCheckedChange={(v) => setS({ ...s, is_active: v })} />
          </div>

          <Button onClick={save} disabled={saving} className="bg-gradient-primary">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save referral settings
          </Button>
        </div>
      )}
    </GlassCard>
  );
}

export default ReferralSettingsCard;
