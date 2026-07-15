import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, RefreshCw, History, Power, Tag, Database, Sparkles, TrendingUp } from "lucide-react";

type Plan = {
  id: string;
  network: string;
  plan_id: string;
  plan_name: string;
  category: string | null;
  validity: string | null;
  duration: string | null;
  data_size: string | null;
  cost_price: number;
  selling_price: number;
  discount_percent: number;
  service_fee_percent: number;
  is_promo: boolean;
  is_active: boolean;
  description: string | null;
  provider: string;
  created_at: string;
  updated_at: string;
};

const NETWORKS = ["mtn", "glo", "airtel", "9mobile"];
const CATEGORIES = ["daily", "weekly", "monthly", "night"];
const empty: Partial<Plan> = {
  network: "mtn", plan_id: "", plan_name: "", category: "monthly",
  data_size: "", duration: "30 days", validity: "30 days",
  cost_price: 0, selling_price: 0, discount_percent: 0, service_fee_percent: 0,
  is_promo: false, is_active: true, description: "",
};

export default function AdminDataPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fNet, setFNet] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPromo, setFPromo] = useState<string>("all");
  const [fDuration, setFDuration] = useState<string>("all");
  const [fMin, setFMin] = useState<string>("");
  const [fMax, setFMax] = useState<string>("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Partial<Plan> | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from("data_plans").select("*").order("network").order("category").order("selling_price"),
      supabase.from("data_plan_audit").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setPlans((p as Plan[]) || []);
    setAudit(a || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => plans.filter((p) => {
    if (fNet !== "all" && p.network !== fNet) return false;
    if (fStatus === "active" && !p.is_active) return false;
    if (fStatus === "inactive" && p.is_active) return false;
    if (fPromo === "promo" && !p.is_promo) return false;
    if (fDuration !== "all" && p.category !== fDuration) return false;
    if (fMin && p.selling_price < Number(fMin)) return false;
    if (fMax && p.selling_price > Number(fMax)) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!`${p.plan_name} ${p.data_size} ${p.plan_id} ${p.network}`.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [plans, q, fNet, fStatus, fPromo, fDuration, fMin, fMax]);

  const stats = useMemo(() => ({
    total: plans.length,
    active: plans.filter((p) => p.is_active).length,
    inactive: plans.filter((p) => !p.is_active).length,
    promo: plans.filter((p) => p.is_promo).length,
    recent: plans.filter((p) => new Date(p.updated_at).getTime() > Date.now() - 7 * 86400000).length,
  }), [plans]);

  async function save() {
    if (!editing) return;
    const { id, ...rest } = editing;
    if (!rest.plan_id || !rest.plan_name || !rest.network) return toast.error("Network, Plan ID and Name are required");
    if (Number(rest.selling_price) <= 0) return toast.error("Selling price must be greater than 0");
    const payload = { ...rest, cost_price: Number(rest.cost_price || 0), selling_price: Number(rest.selling_price), discount_percent: Number(rest.discount_percent || 0), service_fee_percent: Number(rest.service_fee_percent || 0) };
    const { error } = id
      ? await supabase.from("data_plans").update(payload).eq("id", id)
      : await supabase.from("data_plans").insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success(id ? "Plan updated" : "Plan created");
    setEditing(null);
    load();
  }

  async function toggleActive(p: Plan) {
    const { error } = await supabase.from("data_plans").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(p.is_active ? "Disabled" : "Enabled");
    load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this plan? This cannot be undone.")) return;
    const { error } = await supabase.from("data_plans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }

  async function bulkUpdate(patch: Partial<Plan>) {
    if (!selected.length) return toast.error("Select at least one plan");
    const { error } = await supabase.from("data_plans").update(patch).in("id", selected);
    if (error) return toast.error(error.message);
    toast.success(`Updated ${selected.length} plan(s)`);
    setSelected([]); load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Plans Management</h1>
          <p className="text-sm text-slate-400">Create, price and publish data bundles across all networks.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={load} className="border-white/10"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          {(["smeapi", "smeplug"] as const).map((prov) => (
            <Button key={prov} variant="outline" className="border-emerald-500/40 text-emerald-300" onClick={async () => {
              const t = toast.loading(`Syncing ${prov.toUpperCase()} plans…`);
              const { data, error } = await supabase.functions.invoke(prov, { body: { action: "sync-plans" } });
              if (error || !data?.success) {
                toast.error(error?.message || data?.error || "Sync failed", { id: t });
                return;
              }
              toast.success(
                `${prov.toUpperCase()}: ${data.imported || 0} imported · ${data.updated || 0} updated · ${data.removed || 0} removed`,
                { id: t, duration: 6000 }
              );
              load();
            }}><Database className="h-4 w-4 mr-2" />Sync {prov.toUpperCase()}</Button>
          ))}
        </div>

      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={Database} label="Total" value={stats.total} color="from-violet-500 to-indigo-600" />
        <Stat icon={Power} label="Active" value={stats.active} color="from-emerald-500 to-teal-600" />
        <Stat icon={Power} label="Disabled" value={stats.inactive} color="from-rose-500 to-pink-600" />
        <Stat icon={Sparkles} label="Promo" value={stats.promo} color="from-amber-500 to-orange-600" />
        <Stat icon={TrendingUp} label="Updated 7d" value={stats.recent} color="from-sky-500 to-cyan-600" />
      </div>

      <Tabs defaultValue="plans">
        <TabsList className="bg-slate-900 border border-white/5">
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1" />Change history</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-4">
          <Card className="p-4 bg-slate-900/60 border-white/5">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <div className="relative col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 bg-slate-950 border-white/10 text-white" placeholder="Search by name, size, ID…" />
              </div>
              <Select value={fNet} onValueChange={setFNet}><SelectTrigger className="bg-slate-950 border-white/10 text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All networks</SelectItem>{NETWORKS.map((n) => <SelectItem key={n} value={n}>{n.toUpperCase()}</SelectItem>)}</SelectContent></Select>
              <Select value={fDuration} onValueChange={setFDuration}><SelectTrigger className="bg-slate-950 border-white/10 text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All durations</SelectItem>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              <Select value={fStatus} onValueChange={setFStatus}><SelectTrigger className="bg-slate-950 border-white/10 text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="active">Active only</SelectItem><SelectItem value="inactive">Disabled only</SelectItem></SelectContent></Select>
              <Select value={fPromo} onValueChange={setFPromo}><SelectTrigger className="bg-slate-950 border-white/10 text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="promo">Promo only</SelectItem></SelectContent></Select>
              <Input type="number" placeholder="Min ₦" value={fMin} onChange={(e) => setFMin(e.target.value)} className="bg-slate-950 border-white/10 text-white" />
              <Input type="number" placeholder="Max ₦" value={fMax} onChange={(e) => setFMax(e.target.value)} className="bg-slate-950 border-white/10 text-white" />
            </div>
            {selected.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 p-2 rounded-lg bg-violet-500/10 border border-violet-500/30">
                <span className="text-sm text-violet-200">{selected.length} selected</span>
                <Button size="sm" variant="outline" className="border-white/10" onClick={() => bulkUpdate({ is_active: true })}>Enable</Button>
                <Button size="sm" variant="outline" className="border-white/10" onClick={() => bulkUpdate({ is_active: false })}>Disable</Button>
                <Button size="sm" variant="outline" className="border-white/10" onClick={() => bulkUpdate({ is_promo: true })}>Mark promo</Button>
                <Button size="sm" variant="outline" className="border-white/10" onClick={() => bulkUpdate({ is_promo: false })}>Clear promo</Button>
                <Button size="sm" variant="ghost" className="text-slate-400" onClick={() => setSelected([])}>Clear</Button>
              </div>
            )}
          </Card>

          <Card className="bg-slate-900/60 border-white/5 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="w-8"><input type="checkbox" checked={selected.length > 0 && selected.length === filtered.length} onChange={(e) => setSelected(e.target.checked ? filtered.map((p) => p.id) : [])} /></TableHead>
                  <TableHead>Network</TableHead><TableHead>Plan</TableHead><TableHead>Size</TableHead>
                  <TableHead>Duration</TableHead><TableHead>Cost</TableHead><TableHead>Sell</TableHead>
                  <TableHead>Disc%</TableHead><TableHead>Fee%</TableHead><TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={11} className="text-center text-slate-500 py-10">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center text-slate-500 py-10">No plans match filters.</TableCell></TableRow>
                ) : filtered.map((p) => (
                  <TableRow key={p.id} className="border-white/5">
                    <TableCell><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} /></TableCell>
                    <TableCell><Badge variant="outline" className="border-white/10 uppercase">{p.network}</Badge></TableCell>
                    <TableCell className="font-medium text-white">{p.plan_name}{p.is_promo && <Tag className="inline h-3 w-3 ml-1 text-amber-400" />}</TableCell>
                    <TableCell>{p.data_size}</TableCell>
                    <TableCell className="text-slate-400">{p.duration || p.validity}</TableCell>
                    <TableCell>₦{Number(p.cost_price).toLocaleString()}</TableCell>
                    <TableCell className="font-semibold">₦{Number(p.selling_price).toLocaleString()}</TableCell>
                    <TableCell>{p.discount_percent}%</TableCell>
                    <TableCell>{p.service_fee_percent}%</TableCell>
                    <TableCell><Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-rose-400" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="bg-slate-900/60 border-white/5 overflow-hidden">
            <Table>
              <TableHeader><TableRow className="border-white/5 hover:bg-transparent"><TableHead>When</TableHead><TableHead>Admin</TableHead><TableHead>Action</TableHead><TableHead>Plan</TableHead><TableHead>Change</TableHead></TableRow></TableHeader>
              <TableBody>
                {audit.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-10">No changes recorded yet.</TableCell></TableRow>
                ) : audit.map((a) => (
                  <TableRow key={a.id} className="border-white/5">
                    <TableCell className="text-xs text-slate-400 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{a.admin_email || "—"}</TableCell>
                    <TableCell><Badge className={a.action === 'delete' ? "bg-rose-500/20 text-rose-300" : a.action === 'create' ? "bg-emerald-500/20 text-emerald-300" : "bg-sky-500/20 text-sky-300"}>{a.action}</Badge></TableCell>
                    <TableCell className="text-sm">{(a.after_data?.plan_name || a.before_data?.plan_name) ?? "—"}</TableCell>
                    <TableCell className="text-xs text-slate-400 max-w-md truncate">{a.action === 'update' ? diffSummary(a.before_data, a.after_data) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl bg-slate-900 border-white/10 text-white">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit plan" : "New data plan"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Network"><Select value={editing.network} onValueChange={(v) => setEditing({ ...editing, network: v })}><SelectTrigger className="bg-slate-950 border-white/10"><SelectValue /></SelectTrigger><SelectContent>{NETWORKS.map((n) => <SelectItem key={n} value={n}>{n.toUpperCase()}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Category"><Select value={editing.category || ""} onValueChange={(v) => setEditing({ ...editing, category: v })}><SelectTrigger className="bg-slate-950 border-white/10"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="API Plan ID"><Input value={editing.plan_id || ""} onChange={(e) => setEditing({ ...editing, plan_id: e.target.value })} className="bg-slate-950 border-white/10" /></Field>
              <Field label="Plan name"><Input value={editing.plan_name || ""} onChange={(e) => setEditing({ ...editing, plan_name: e.target.value })} className="bg-slate-950 border-white/10" /></Field>
              <Field label="Data size"><Input value={editing.data_size || ""} onChange={(e) => setEditing({ ...editing, data_size: e.target.value })} placeholder="e.g. 5GB" className="bg-slate-950 border-white/10" /></Field>
              <Field label="Duration"><Input value={editing.duration || ""} onChange={(e) => setEditing({ ...editing, duration: e.target.value, validity: e.target.value })} placeholder="e.g. 30 days" className="bg-slate-950 border-white/10" /></Field>
              <Field label="Cost price (₦)"><Input type="number" value={editing.cost_price ?? 0} onChange={(e) => setEditing({ ...editing, cost_price: Number(e.target.value) })} className="bg-slate-950 border-white/10" /></Field>
              <Field label="Selling price (₦)"><Input type="number" value={editing.selling_price ?? 0} onChange={(e) => setEditing({ ...editing, selling_price: Number(e.target.value) })} className="bg-slate-950 border-white/10" /></Field>
              <Field label="Discount %"><Input type="number" value={editing.discount_percent ?? 0} onChange={(e) => setEditing({ ...editing, discount_percent: Number(e.target.value) })} className="bg-slate-950 border-white/10" /></Field>
              <Field label="Service fee %"><Input type="number" value={editing.service_fee_percent ?? 0} onChange={(e) => setEditing({ ...editing, service_fee_percent: Number(e.target.value) })} className="bg-slate-950 border-white/10" /></Field>
              <Field label="Description" full><Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="bg-slate-950 border-white/10" /></Field>
              <div className="flex items-center gap-6 col-span-2">
                <label className="flex items-center gap-2 text-sm"><Switch checked={!!editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /> Active</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={!!editing.is_promo} onCheckedChange={(v) => setEditing({ ...editing, is_promo: v })} /> Promo</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} className="bg-gradient-to-r from-violet-600 to-indigo-600">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: any) {
  return (
    <Card className="p-4 bg-slate-900/60 border-white/5">
      <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${color} grid place-items-center mb-2`}><Icon className="h-4 w-4 text-white" /></div>
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </Card>
  );
}
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (<div className={full ? "col-span-2" : ""}><Label className="text-xs text-slate-400">{label}</Label>{children}</div>);
}
function diffSummary(before: any, after: any) {
  if (!before || !after) return "";
  const keys = ["selling_price", "cost_price", "discount_percent", "service_fee_percent", "is_active", "is_promo", "plan_name", "data_size", "duration"];
  return keys.filter((k) => String(before[k]) !== String(after[k])).map((k) => `${k}: ${before[k]} → ${after[k]}`).join(" · ") || "—";
}
