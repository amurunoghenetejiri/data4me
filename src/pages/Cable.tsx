import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";
import { Tv } from "lucide-react";
import { PinDialog } from "@/components/PinDialog";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { Transaction } from "@/lib/data";
import { buyCable } from "@/services/vtuPurchase";

const PROVIDERS = {
  DStv: [{ name: "Padi", price: 2950 }, { name: "Yanga", price: 4200 }, { name: "Confam", price: 7400 }, { name: "Compact", price: 12500 }, { name: "Premium", price: 29500 }],
  GOtv: [{ name: "Smallie", price: 1575 }, { name: "Jinja", price: 3300 }, { name: "Jolli", price: 4850 }, { name: "Max", price: 7200 }, { name: "Supa", price: 9600 }],
  StarTimes: [{ name: "Nova", price: 1500 }, { name: "Basic", price: 3300 }, { name: "Smart", price: 4500 }, { name: "Classic", price: 5300 }],
  Showmax: [{ name: "Mobile", price: 1450 }, { name: "Entertainment", price: 2900 }, { name: "Pro", price: 6300 }],
};

export default function Cable() {
  const { user, openAuth, wallet, addTransaction, pushNotification, refreshUser } = useApp();
  const [processing, setProcessing] = useState(false);
  const [provider, setProvider] = useState<keyof typeof PROVIDERS>("DStv");
  const [packageName, setPackageName] = useState(PROVIDERS.DStv[0].name);
  const [smartcard, setSmartcard] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [receipt, setReceipt] = useState<Transaction | null>(null);

  const price = PROVIDERS[provider].find((p) => p.name === packageName)?.price ?? 0;

  function attempt() {
    if (!user) { openAuth("login"); return; }
    if (!/^\d{10,12}$/.test(smartcard)) return toast.error("Enter a valid smartcard / IUC number");
    if (wallet < price) return toast.error("Insufficient wallet balance");
    setPinOpen(true);
  }

  async function confirm() {
    setPinOpen(false);
    setProcessing(true);
    const toastId = toast.loading(`Processing ${provider} ${packageName}...`);
    try {
      const result = await buyCable(provider, packageName, smartcard, price);
      if (!result.success) {
        toast.error(result.error || "Transaction failed. Please try again.", { id: toastId });
        refreshUser();
        return;
      }
      const tx = addTransaction({
        type: "cable", amount: result.total || price, status: "success",
        description: `${provider} ${packageName}`,
        meta: { Provider: provider, Package: packageName, "Smartcard": smartcard, tx_id: result.tx_id },
      });
      pushNotification({ title: "Cable subscription successful", body: `${provider} ${packageName} renewed on ${smartcard}.` });
      toast.success("Cable subscription successful", { id: toastId });
      setReceipt(tx);
      setSmartcard("");
      setTimeout(() => refreshUser(), 1000);
    } catch (err: any) {
      toast.error(err?.message || "Transaction failed. Please try again.", { id: toastId });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="container py-10 max-w-4xl">
      <h1 className="text-3xl font-bold flex items-center gap-2"><Tv className="h-7 w-7 text-primary" /> Cable TV Subscriptions</h1>
      <p className="text-muted-foreground mt-1 mb-8">Renew your DStv, GOtv, StarTimes or Showmax in seconds.</p>

      <Card className="p-6 shadow-card bg-gradient-card">
        <div className="grid sm:grid-cols-4 gap-3 mb-6">
          {(Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map((p) => (
            <button key={p} onClick={() => { setProvider(p); setPackageName(PROVIDERS[p][0].name); }} className={`p-4 rounded-2xl border-2 text-left transition ${provider === p ? "border-primary bg-accent" : "border-transparent bg-muted/40 hover:bg-muted"}`}>
              <Tv className="h-5 w-5 mb-2 text-primary" />
              <p className="font-semibold">{p}</p>
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="mb-2 block">Package</Label>
            <Select value={packageName} onValueChange={setPackageName}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROVIDERS[provider].map((p) => <SelectItem key={p.name} value={p.name}>{p.name} — ₦{p.price.toLocaleString()}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">Smartcard / IUC number</Label>
            <Input inputMode="numeric" maxLength={12} value={smartcard} onChange={(e) => setSmartcard(e.target.value.replace(/\D/g, ""))} placeholder="1234567890" />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between p-4 rounded-xl bg-muted/40">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-2xl font-bold">₦{price.toLocaleString()}</span>
        </div>
        <Button onClick={attempt} disabled={processing} className="mt-4 w-full bg-gradient-primary" size="lg">{processing ? "Processing..." : "Subscribe"}</Button>
      </Card>

      <PinDialog open={pinOpen} onClose={() => setPinOpen(false)} onVerified={confirm} title="Authorise subscription" description={`Confirm ₦${price.toLocaleString()} ${provider} ${packageName}.`} />
      <ReceiptDialog tx={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}