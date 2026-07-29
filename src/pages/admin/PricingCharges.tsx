import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sliders, Plug, Save, Loader2, Plus, Trash2, Power } from "lucide-react";
import { GlassCard, PageHead, LoadingBlock } from "./_shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Charge = { service: string; label: string; mode: "fixed" | "percent"; value: number; is_active: boolean };
type Cashback = { service: string; label: string; percent: number; is_active: boolean };
type Provider = {
  id: string; slug: string; name: string; base_url: string; environment: "live" | "test";
  webhook_url: string | null; is_active: boolean;
  api_key_secret: string | null; api_secret_secret: string | null; extra_secret: string | null;
  config: any;
};

export default function PricingCharges() {
  const [tab, setTab] = useState<"charges" | "cashback" | "providers">("charges");
const [loading, setLoading] = useState(true);
const [charges, setCharges] = useState<Charge[]>([]);
const [cashbacks, setCashbacks] = useState<Cashback[]>([]);
const [providers, setProviders] = useState<Provider[]>([]);
const [saving, setSaving] = useState<string | null>(null);

async function load() {
  setLoading(true);
  const [{ data: c }, { data: cb }, { data: p }] = await Promise.all([
    supabase.from("charge_settings").select("*").order("label"),
    supabase.from("cashback_settings").select("*").order("label"),
    supabase.from("api_providers").select("*").order("name"),
  ]);
  setCharges((c || []) as any);
  setCashbacks((cb || []) as any);
  setProviders((p || []) as any);
  setLoading(false);
}
  useEffect(() => { load(); }, []);

  async function saveCharge(row: Charge) {
    setSaving(row.service);
    const { error } = await supabase.from("charge_settings").update({
      mode: row.mode, value: Number(row.value) || 0, is_active: row.is_active,
    }).eq("service", row.service);
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success(`${row.label} updated`);
  }

  async function saveCashback(row: Cashback) {
  setSaving("cb-" + row.service);
  const { error } = await supabase.from("cashback_settings").update({
    percent: Number(row.percent) || 0,
    is_active: row.is_active,
  }).eq("service", row.service);
  setSaving(null);
  if (error) return toast.error(error.message);
  toast.success(row.label + " cashback updated");
  }

  async function saveProvider(p: Provider) {
    setSaving(p.id);
    const { error } = await supabase.from("api_providers").update({
      name: p.name, base_url: p.base_url, environment: p.environment,
      webhook_url: p.webhook_url, is_active: p.is_active,
      api_key_secret: p.api_key_secret, api_secret_secret: p.api_secret_secret,
      extra_secret: p.extra_secret, config: p.config || {},
    }).eq("id", p.id);
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success(`${p.name} saved`);
    load();
  }

  async function addProvider() {
    const slug = prompt("Provider slug (e.g. gsubz)")?.trim().toLowerCase();
    if (!slug) return;
    const { error } = await supabase.from("api_providers").insert({
      slug, name: slug, base_url: "https://", environment: "live", is_active: false,
    } as any);
    if (error) return toast.error(error.message);
    load();
  }

  async function removeProvider(id: string) {
    if (!confirm("Delete this provider?")) return;
    const { error } = await supabase.from("api_providers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div>
      <PageHead
        title="Pricing, Charges & API Settings"
        subtitle="One place to configure per-service charges and every VTU provider you use."
        icon={Sliders}
        actions={<button onClick={load} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm">Refresh</button>}
      />

     <div className="mb-5 inline-flex rounded-xl bg-slate-900/60 border border-white/10 p-1">
  {(["charges", "cashback", "providers"] as const).map((t) => (
    <button key={t} onClick={() => setTab(t)}
      className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}>
      {t === "charges" ? "Service Charges" : t === "cashback" ? "Cashback" : "API Providers"}
    </button>
  ))}
</div>

      {loading ? <LoadingBlock /> : tab === "charges" ? (
  <GlassCard className="p-5">
    <p className="text-xs text-slate-400 mb-4">
      Each charge applies automatically to its service. Percent example: 20% on ₦1,000 funding → user pays ₦1,200, wallet gets ₦1,000, you earn ₦200.
    </p>
    <div className="grid gap-3">
      {charges.map((c, i) => (
        <div key={c.service} className="grid sm:grid-cols-[1.4fr_1fr_1fr_auto_auto] items-end gap-3 p-4 rounded-xl bg-slate-950/50 border border-white/5">
          <div>
            <p className="text-white font-medium">{c.label}</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">{c.service}</p>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Mode</Label>
            <select value={c.mode}
              onChange={(e) => setCharges((arr) => arr.map((x, j) => j === i ? { ...x, mode: e.target.value as any } : x))}
              className="w-full h-10 rounded-lg bg-slate-900 border border-white/10 text-white px-3 text-sm">
              <option value="percent">Percentage (%)</option>
              <option value="fixed">Fixed (₦)</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Value</Label>
            <Input type="number" step="0.01" min="0" value={c.value}
              onChange={(e) => setCharges((arr) => arr.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))}
              className="bg-slate-900 border-white/10 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={c.is_active} onCheckedChange={(v) => setCharges((arr) => arr.map((x, j) => j === i ? { ...x, is_active: v } : x))} />
            <span className="text-xs text-slate-400">Active</span>
          </div>
          <Button onClick={() => saveCharge(c)} disabled={saving === c.service} className="bg-violet-600 hover:bg-violet-500">
            {saving === c.service ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />Save</>}
          </Button>
        </div>
      ))}
    </div>
  </GlassCard>
) : tab === "cashback" ? (
  <GlassCard className="p-5">
    <p className="text-xs text-slate-400 mb-4">
      Cashback is credited to the user wallet only after a purchase is confirmed successful.
      Example: 2% on a ₦200 data purchase credits ₦4 cashback.
    </p>
    <div className="grid gap-3">
      {cashbacks.map((c, i) => (
        <div key={c.service} className="grid sm:grid-cols-[1.4fr_1fr_auto_auto] items-end gap-3 p-4 rounded-xl bg-slate-950/50 border border-white/5">
          <div>
            <p className="text-white font-medium">{c.label}</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">{c.service}</p>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Cashback %</Label>
            <Input type="number" step="0.01" min="0" max="100" value={c.percent}
              onChange={(e) => setCashbacks((arr) => arr.map((x, j) => j === i ? { ...x, percent: Number(e.target.value) } : x))}
              className="bg-slate-900 border-white/10 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={c.is_active} onCheckedChange={(v) => setCashbacks((arr) => arr.map((x, j) => j === i ? { ...x, is_active: v } : x))} />
            <span className="text-xs text-slate-400">Active</span>
          </div>
          <Button onClick={() => saveCashback(c)} disabled={saving === "cb-" + c.service} className="bg-violet-600 hover:bg-violet-500">
            {saving === "cb-" + c.service ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />Save</>}
          </Button>
        </div>
      ))}
    </div>
  </GlassCard>
) : (
  <div className="space-y-4">
    <div className="flex justify-end">
      <Button onClick={addProvider} className="bg-emerald-600 hover:bg-emerald-500"><Plus className="h-4 w-4 mr-1" />Add provider</Button>
    </div>
    {providers.map((p, i) => (
      <GlassCard key={p.id} className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl grid place-items-center border ${p.is_active ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-slate-800 border-white/10 text-slate-400"}`}>
              <Plug className="h-5 w-5" />
            </div>
            <div>
              <p className="text-white font-semibold">{p.name} <span className="text-xs text-slate-400 font-mono">({p.slug})</span></p>
              <p className="text-[11px] text-slate-500">{p.is_active ? "Active provider — used for every VTU request" : "Inactive"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setProviders((arr) => arr.map((x, j) => j === i ? { ...x, is_active: !x.is_active } : x))}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1">
              <Power className="h-3.5 w-3.5" />{p.is_active ? "Disable" : "Enable"}
            </button>
            <button onClick={() => removeProvider(p.id)} className="p-2 rounded-lg text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Display name" value={p.name} onChange={(v) => update(i, "name", v)} />
          <Field label="Base URL" value={p.base_url} onChange={(v) => update(i, "base_url", v)} />
          <div>
            <Label className="text-xs text-slate-400">Environment</Label>
            <select value={p.environment} onChange={(e) => update(i, "environment", e.target.value)} className="w-full h-10 rounded-lg bg-slate-900 border border-white/10 text-white px-3 text-sm">
              <option value="live">Live</option><option value="test">Test</option>
            </select>
          </div>
          <Field label="Webhook URL" value={p.webhook_url || ""} onChange={(v) => update(i, "webhook_url", v)} />
          <Field label="API Key — Cloud secret name" value={p.api_key_secret || ""} onChange={(v) => update(i, "api_key_secret", v)} placeholder="e.g. SMEAPI_API_KEY" />
          <Field label="API Secret — Cloud secret name" value={p.api_secret_secret || ""} onChange={(v) => update(i, "api_secret_secret", v)} placeholder="optional" />
          <Field label="Extra secret (PIN/etc.) — Cloud secret name" value={p.extra_secret || ""} onChange={(v) => update(i, "extra_secret", v)} placeholder="e.g. SMEAPI_PIN" />
          <Field label="Config JSON" value={JSON.stringify(p.config || {})} onChange={(v) => { try { update(i, "config", JSON.parse(v || "{}")); } catch { /* ignore */ } }} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => saveProvider(p)} disabled={saving === p.id} className="bg-violet-600 hover:bg-violet-500">
            {saving === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />Save provider</>}
          </Button>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Secret <em>names</em> live here; the actual keys stay in Cloud secrets. Add them under Payment Settings or via the platform.
        </p>
      </GlassCard>
    ))}
  </div>
)}
              </p>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );

  function update(i: number, k: keyof Provider, v: any) {
    setProviders((arr) => arr.map((x, j) => j === i ? { ...x, [k]: v } : x));
  }
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs text-slate-400">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-slate-900 border-white/10 text-white" />
    </div>
  );
}
