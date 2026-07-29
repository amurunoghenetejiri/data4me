import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dataPlans as staticPlans, networks, NetworkId, DataPlan, categories, PlanCategory } from "@/lib/data";
import { NetworkBadge } from "@/components/NetworkBadge";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, CheckCircle2, Wallet, CreditCard, Copy, Sparkles, Gift, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PinDialog } from "@/components/PinDialog";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { Transaction } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { buyData } from "@/services/vtuPurchase";

  /** Map DB network values (names or provider IDs) → mtn|glo|airtel|9mobile */
function normalizeNetwork(raw: string, provider?: string): NetworkId | null {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "mtn" || v === "glo" || v === "airtel" || v === "9mobile") return v;
  if (v === "etisalat") return "9mobile";

  const p = String(provider || "").toLowerCase();
  // SME Plug: 1=MTN, 2=AIRTEL, 3=GLO, 4=9MOBILE
  if (p.includes("smeplug")) {
    if (v === "1") return "mtn";
    if (v === "2") return "airtel";
    if (v === "3") return "glo";
    if (v === "4") return "9mobile";
  }
  // SME API: 1=MTN, 2=GLO, 3=9MOBILE, 4=AIRTEL
  if (p.includes("smeapi") || !p) {
    if (v === "1") return "mtn";
    if (v === "2") return "glo";
    if (v === "3") return "9mobile";
    if (v === "4") return "airtel";
  }
  return null;
}

export default function BuyData() {
  const { user, openAuth, wallet, addTransaction, settings, pushNotification, refreshUser } = useApp();
  const [network, setNetwork] = useState<NetworkId>("mtn");
  const [phone, setPhone] = useState("");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<PlanCategory>("monthly");
  const [selected, setSelected] = useState<DataPlan | null>(null);
  const [step, setStep] = useState<"review" | "pay" | "done">("review");
  const [pinOpen, setPinOpen] = useState(false);
  const [dataCharge, setDataCharge] = useState<{ mode: "fixed" | "percent"; value: number }>({
    mode: "fixed",
    value: 0,
  });
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [processing, setProcessing] = useState(false);

  const [livePlans, setLivePlans] = useState<DataPlan[] | null>(null);

  useEffect(() => {
    supabase.from("data_plans").select("*").eq("is_active", true).then(({ data }) => {
      if (!data || data.length === 0) { setLivePlans(null); return; }
      const mapped: DataPlan[] = [];
      for (const p of data as any[]) {
        const net = normalizeNetwork(p.network, p.provider || p.supplier);
        if (!net) continue; // skip unknown networks
        const price = Number(p.selling_price);
        const discount = Number(p.discount_percent) || 0;
        const originalPrice = discount > 0 ? Math.round(price / (1 - discount / 100)) : price;
        mapped.push({
          id: p.id,
          network: net,
          size: p.data_size || p.plan_name,
          validity: p.duration || p.validity || "",
          price,
          originalPrice,
          discount,
          cashback: Math.round(price * 0.04),
          category: (p.category || "monthly") as PlanCategory,
          type: "SME",
          popular: !!p.is_promo,
        });
      }
      setLivePlans(mapped);
    });
  }, []);

  useEffect(() => {
    supabase
      .from("charge_settings")
      .select("mode, value, is_active")
      .eq("service", "data")
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.is_active) {
          setDataCharge({
            mode: data.mode === "percent" ? "percent" : "fixed",
            value: Number(data.value) || 0,
          });
        } else {
          setDataCharge({ mode: "fixed", value: 0 });
        }
      });
  }, []);
  
  const allPlans = livePlans ?? staticPlans;
  const plans = useMemo(() => allPlans.filter((p) =>
    p.network === network &&
    p.category === cat &&
    (query === "" || p.size.toLowerCase().includes(query.toLowerCase())),
  ), [allPlans, network, cat, query]);
  function calcCharge(price: number) {
    if (!price || dataCharge.value <= 0) return 0;
    if (dataCharge.mode === "percent") {
      return Math.round((price * dataCharge.value) / 100 * 100) / 100;
    }
    return Number(dataCharge.value) || 0;
  }

  const chargeAmount = selected ? calcCharge(selected.price) : 0;
  const totalAmount = selected ? selected.price + chargeAmount : 0;

  function start(p: DataPlan) {
    if (!user) { openAuth("login"); return; }
    if (!/^0[789][01]\d{8}$/.test(phone)) { toast.error("Enter a valid Nigerian phone number"); return; }
    setSelected(p); setStep("review");
  }

  function payWallet() {
    if (!selected) return;
    if (wallet < totalAmount) {
      toast.error(`Insufficient balance. You need ₦${totalAmount.toLocaleString()} (plan + charge).`);
      return;
    }
    setPinOpen(true);
    }

  async function confirmData() {
    if (!selected) return;
    setPinOpen(false);
    if (!user) { toast.error("Not authenticated"); return; }
    if (wallet < totalAmount) {
      toast.error(`Insufficient balance. You need ₦${totalAmount.toLocaleString()}.`);
      return;
    }

    setProcessing(true);
    const toastId = toast.loading(`Processing ${selected.size}...`);

    try {
      const result = await buyData(selected.id, phone);

      if (!result.success) {
        toast.error(result.error || "Purchase failed", { id: toastId });
        setProcessing(false);
        return;
      }

      // Success: create local transaction record for UI
      const tx = addTransaction({
        type: "data",
        network: selected.network,
        phone,
        amount: result.total || selected.price,
        status: "success",
        description: `${selected.network.toUpperCase()} ${selected.size} / ${selected.validity}`,
        meta: { tx_id: result.tx_id, charge: result.charge, provider_response: result.response },
      });

      // Award cashback (client-side only, for demo)
      if (selected.cashback > 0) {
        addTransaction({
          type: "wallet",
          amount: selected.cashback,
          status: "success",
          description: `Cashback on ${selected.size} ${selected.network.toUpperCase()}`,
        });
      }

      pushNotification({
        title: "✅ Data purchase successful",
        body: `${selected.size} delivered to ${phone}. Cashback: ₦${selected.cashback}. Charge: ₦${result.charge || 0}`,
      });

      toast.success(`${selected.size} delivered! +₦${selected.cashback} cashback`, { id: toastId });
      setStep("done");
      setReceipt(tx);
      
      // Refresh wallet from server
      setTimeout(() => refreshUser(), 1000);
    } catch (err: any) {
      toast.error(err.message || "Failed to process data purchase", { id: toastId });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Buy Data</h1>
        <p className="text-muted-foreground mt-1">Pick a network, choose a plan, and we deliver in seconds.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <Card className="p-5 mb-5 bg-gradient-card shadow-card">
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="mb-2 block">Network</Label>
                <div className="grid grid-cols-4 gap-2">
                  {networks.map((n) => (
                    <button key={n.id} onClick={() => setNetwork(n.id)} disabled={processing} className={`flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition disabled:opacity-50 ${network === n.id ? "border-primary bg-accent" : "border-transparent bg-muted/40 hover:bg-muted"}`.trim()}>
                      <NetworkBadge id={n.id} size="sm" />
                      <span className="text-xs font-medium">{n.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="phone" className="mb-2 block">Phone number</Label>
                <Input id="phone" inputMode="numeric" maxLength={11} placeholder="08012345678" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} disabled={processing} />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Tabs value={cat} onValueChange={(v) => setCat(v as PlanCategory)} className="flex-1">
                <TabsList>
                  {categories.map((c) => <TabsTrigger key={c.id} value={c.id} disabled={processing}>{c.label}</TabsTrigger>)}
                </TabsList>
              </Tabs>
              <div className="relative sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search size (e.g. 5GB)" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" disabled={processing} />
              </div>
            </div>
          </Card>

          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {plans.map((p) => (
              <Card key={p.id} className="relative p-5 bg-gradient-card shadow-card hover-lift overflow-hidden">
                <Badge className="absolute top-3 right-3 bg-destructive text-destructive-foreground shadow-md">{p.discount}% OFF</Badge>
                {p.popular && <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-warning/90 text-black text-[10px] font-bold flex items-center gap-1"><Sparkles className="h-3 w-3" /> PROMO</span>}
                <div className="flex items-center gap-3 mb-3 mt-4">
                  <NetworkBadge id={p.network} size="sm" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.category} · {p.type}</p>
                    <p className="font-semibold">{p.size}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Valid for {p.validity}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <p className="text-2xl font-bold">₦{p.price.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground line-through">₦{p.originalPrice.toLocaleString()}</p>
                </div>
                <p className="mt-1 text-xs text-success flex items-center gap-1"><Gift className="h-3 w-3" /> Earn ₦{p.cashback} cashback</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">⏳ Flash sale</span>
                  <Button size="sm" onClick={() => start(p)} disabled={processing} className="bg-gradient-primary">Buy</Button>
                </div>
              </Card>
            ))}
            {plans.length === 0 && <p className="col-span-full text-center text-sm text-muted-foreground py-10">No plans match your filters.</p>}
          </div>
        </div>

        <aside className="space-y-4">
          <Card className="p-5 bg-gradient-primary text-primary-foreground shadow-elevated">
            <p className="text-xs opacity-80">Wallet balance</p>
            <p className="text-3xl font-bold">₦{wallet.toLocaleString()}</p>
            <Button variant="secondary" size="sm" className="mt-3" asChild><a href="/wallet">Fund wallet</a></Button>
          </Card>
          <Card className="p-5 shadow-card">
            <h3 className="font-semibold mb-2">Why Data4Me?</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {["Instant delivery on all networks", "Refund to wallet on failure", "Lowest prices, no hidden fees"].map((x) => (
                <li key={x} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />{x}</li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setStep("review"); } }}>
        <DialogContent className="sm:max-w-md">
          {selected && step === "review" && (
            <>
              <DialogHeader>
                <DialogTitle>Review your order</DialogTitle>
                <DialogDescription>Confirm before payment.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <Row label="Network"><div className="flex items-center gap-2"><NetworkBadge id={selected.network} size="sm" /><span className="font-medium">{selected.network.toUpperCase()}</span></div></Row>
                <Row label="Plan">{selected.size} • {selected.type}</Row>
                <Row label="Validity">{selected.validity}</Row>
                <Row label="Phone">{phone}</Row>
                <Row label="Plan price">₦{selected.price.toLocaleString()}</Row>
               <Row label="Service charge">
                  {chargeAmount > 0 ? "₦" + chargeAmount.toLocaleString() : "₦0"}
                </Row>
                <Row label="Total to pay" highlight>
                  ₦{totalAmount.toLocaleString()}
                </Row>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setSelected(null)} disabled={processing}>Cancel</Button>
                <Button onClick={() => setStep("pay")} className="bg-gradient-primary" disabled={processing}>Proceed</Button>
              </div>
            </>
          )}
          {selected && step === "pay" && (
            <>
              <DialogHeader>
                <DialogTitle>Choose payment</DialogTitle>
                <DialogDescription>Your wallet will be charged.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <button onClick={payWallet} disabled={processing} className="w-full p-4 rounded-xl border-2 border-primary bg-accent text-left hover:shadow-card transition disabled:opacity-50">
                  <div className="flex items-center gap-3"><Wallet className="h-5 w-5 text-primary" /><div className="flex-1"><p className="font-semibold">Pay with wallet</p><p className="text-xs text-muted-foreground">Balance: ₦{wallet.toLocaleString()}</p></div><span className="font-bold">₦{totalAmount.toLocaleString()}</span></div>
                </button>
                <div className="p-4 rounded-xl border border-border bg-muted/30">
                  <div className="flex items-center gap-2 mb-2"><CreditCard className="h-5 w-5 text-primary" /><p className="font-semibold">Bank transfer</p></div>
                  <div className="text-sm space-y-1">
                    <Row label="Bank">{settings.bankName}</Row>
                    <Row label="Account">{settings.accountName}</Row>
                    <Row label="Number"><span className="flex items-center gap-2 font-mono">{settings.accountNumber}<Copy className="h-3.5 w-3.5 cursor-pointer hover:text-primary" onClick={() => { navigator.clipboard.writeText(settings.accountNumber); toast.success("Copied"); }} /></span></Row>
                  </div>
                </div>
              </div>
            </>
          )}
          {selected && step === "done" && (
            <div className="text-center py-6">
              <div className="h-16 w-16 rounded-full bg-success/15 text-success grid place-items-center mx-auto mb-4"><CheckCircle2 className="h-8 w-8" /></div>
              <h3 className="text-xl font-bold">Delivered!</h3>
              <p className="text-muted-foreground text-sm mt-1">{selected.size} sent to {phone}</p>
              <Button className="mt-5 w-full bg-gradient-primary" onClick={() => { setSelected(null); setStep("review"); }}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <PinDialog
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onVerified={confirmData}
        title="Authorise data purchase"
        description={
          selected
            ? "Confirm " +
              selected.size +
              " " +
              selected.network.toUpperCase() +
              ". Plan ₦" +
              selected.price.toLocaleString() +
              " + charge ₦" +
              chargeAmount.toLocaleString() +
              " = ₦" +
              totalAmount.toLocaleString() +
              "."
            : ""
        }
      />
      <ReceiptDialog tx={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function Row({ label, children, highlight }: { label: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${highlight ? "pt-2 border-t border-border text-lg font-semibold" : "text-sm"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "" : "font-medium"}>{children}</span>
    </div>
  );
}
