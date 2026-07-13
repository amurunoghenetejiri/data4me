import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/context/AppContext";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Wallet as WalletIcon, ArrowDownLeft, Copy, CreditCard, Building2, CheckCircle2, Eye, EyeOff, Upload, FileCheck2, Printer, Loader2, Zap } from "lucide-react";
import { NetworkBadge } from "@/components/NetworkBadge";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";

const NIGERIAN_BANKS = [
  "Opay","PalmPay","Moniepoint","Access Bank","GTBank","First Bank","UBA",
  "Zenith Bank","Fidelity Bank","Union Bank","Sterling Bank","Wema Bank",
  "FCMB","Keystone Bank","Polaris Bank","Ecobank","Stanbic IBTC","Other Nigerian Banks"
];

export default function Wallet() {
  const { wallet, transactions, settings, user, openAuth, hideBalance, toggleHideBalance, submitFundingRequest, pushNotification, pendingFunding, refreshUser } = useApp();
  const [amount, setAmount] = useState(2000);
  const [psAmount, setPsAmount] = useState(2000);
  const [psLoading, setPsLoading] = useState(false);
  const [bank, setBank] = useState<string>("Opay");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [step, setStep] = useState<"idle" | "submitted">("idle");
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recent = transactions.slice(0, 6);
  const [searchParams, setSearchParams] = useSearchParams();

  // Live payment configuration (admin-controlled, real-time)
  const [paystackEnabled, setPaystackEnabled] = useState(true);
  const [manualEnabled, setManualEnabled] = useState(true);
  const [payBanks, setPayBanks] = useState<Array<{ id: string; bank_name: string; account_name: string; account_number: string; is_default: boolean; instructions: string | null }>>([]);
  useEffect(() => {
    const load = async () => {
      const { data: s } = await supabase.from("app_settings").select("paystack_enabled, manual_bank_enabled").eq("id", 1).maybeSingle();
      if (s) { setPaystackEnabled(s.paystack_enabled !== false); setManualEnabled(s.manual_bank_enabled !== false); }
      const { data: b } = await supabase.from("payment_bank_accounts").select("id, bank_name, account_name, account_number, is_default, instructions").eq("is_active", true).order("is_default", { ascending: false }).order("sort_order");
      setPayBanks((b || []) as any);
    };
    load();
    const ch = supabase.channel("wallet-pay-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_bank_accounts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  const activeBank = payBanks.find((b) => b.is_default) || payBanks[0];


  // Paystack return verification — server credits the wallet, we only display result
  useEffect(() => {
    const ref = searchParams.get("paystack_ref");
    if (!ref || !user) return;
    (async () => {
      toast.loading("Verifying Paystack payment…", { id: "psv" });
      const { data, error } = await supabase.functions.invoke("paystack-verify", { body: { reference: ref } });
      toast.dismiss("psv");
      if (error || !data?.success) { toast.error("Payment not confirmed yet. Please try again or contact support."); setSearchParams({}); return; }
      await refreshUser();
      pushNotification({ title: "✅ Payment Successful", body: `Your Paystack payment of ₦${Number(data.amount).toLocaleString()} was successful and your wallet has been credited instantly.` });
      toast.success(`Wallet credited with ₦${Number(data.amount).toLocaleString()}`);
      setSearchParams({});
    })();
  }, [searchParams, user]);

  async function payWithPaystack() {
    if (!user) { openAuth("login"); return; }
    if (psAmount < 100) return toast.error("Minimum funding is ₦100");
    setPsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("paystack-initialize", {
        body: { amount: psAmount, email: user.email || `${user.username}@data4me.ng`, username: user.username },
      });
      if (error || !data?.authorization_url) throw new Error(error?.message || "Could not start checkout");
      window.location.href = data.authorization_url;
    } catch (e: any) {
      toast.error(e.message || "Paystack initialization failed");
    } finally {
      setPsLoading(false);
    }
  }

  const [submitting, setSubmitting] = useState(false);
  async function submitFunding() {
    if (!user) { openAuth("login"); return; }
    if (pendingFunding) return toast.error("You already have a pending funding request. Wait for admin review.");
    if (amount < 100) return toast.error("Minimum funding is ₦100");
    if (!receipt) return toast.error("Please upload your payment receipt (JPG, PNG, or PDF)");
    const valid = ["image/jpeg", "image/png", "application/pdf"];
    if (!valid.includes(receipt.type)) return toast.error("Only JPG, PNG, or PDF receipts are allowed");
    if (receipt.size > 5 * 1024 * 1024) return toast.error("Receipt must be under 5MB");
    setSubmitting(true);
    try {
      await submitFundingRequest({ amount, bank, receiptFile: receipt });
      setStep("submitted");
      setOpen(true);
      setReceipt(null);
      if (fileRef.current) fileRef.current.value = "";
      notifyTelegram("Wallet Funding Request", "🧾", {
        "Event Type": "Funding Request",
        "User ID": user.id,
        Username: user.username || user.email,
        Amount: `₦${amount}`,
        Bank: bank,
        Status: "pending",
      });
      toast.success("Receipt submitted. Wallet will credit once approved.");
    } catch (e: any) {
      toast.error(e.message || "Could not submit receipt");
    } finally {
      setSubmitting(false);
    }
  }

  function printReceipt() {
    const w = window.open("", "_blank", "width=520,height=720");
    if (!w) return;
    w.document.write(`<html><head><title>Data4Me Funding Receipt</title>
    <style>body{font-family:system-ui;padding:32px;color:#0f172a}h1{color:#059669}table{width:100%;border-collapse:collapse;margin-top:12px}td{padding:8px;border-bottom:1px solid #e2e8f0}.l{color:#64748b}</style></head>
    <body><h1>Data4Me — Funding Request</h1>
    <table>
      <tr><td class="l">Username</td><td><b>${user?.username || "-"}</b></td></tr>
      <tr><td class="l">Amount</td><td><b>₦${amount.toLocaleString()}</b></td></tr>
      <tr><td class="l">Bank</td><td>${bank}</td></tr>
      <tr><td class="l">Pay to</td><td>${settings.accountName} · ${settings.accountNumber} (${settings.bankName})</td></tr>
      <tr><td class="l">Receipt file</td><td>${receipt?.name || "-"}</td></tr>
      <tr><td class="l">Date</td><td>${new Date().toLocaleString()}</td></tr>
      <tr><td class="l">Status</td><td><b>Pending review</b></td></tr>
    </table>
    <p style="margin-top:24px;font-size:12px;color:#64748b">Thank you for using Data4Me.</p>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold">Wallet</h1>
      <p className="text-muted-foreground mt-1 mb-8">Fund once. Spend anywhere on Data4Me.</p>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-8 bg-gradient-primary text-primary-foreground shadow-elevated overflow-hidden relative rounded-3xl">
          <div className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-sm opacity-80 flex items-center gap-2">
                Available balance
                <button onClick={toggleHideBalance} aria-label="Toggle balance visibility">
                  {hideBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </p>
              <p className="text-5xl font-bold mt-1 tabular-nums">
                {hideBalance ? "₦••••••" : `₦${wallet.toLocaleString()}`}
              </p>
              <p className="text-xs opacity-70 mt-2">Account: {user?.email || "Guest"}</p>
            </div>
            <WalletIcon className="h-10 w-10 opacity-50" />
          </div>
          <div className="relative mt-8 grid grid-cols-3 gap-3 text-sm">
            <div className="p-3 rounded-xl bg-white/10"><p className="opacity-70 text-xs">Spent</p><p className="font-semibold">₦{user ? transactions.filter(t=>t.type!=="wallet"&&t.type!=="eth").reduce((s,t)=>s+t.amount,0).toLocaleString() : "0"}</p></div>
            <div className="p-3 rounded-xl bg-white/10"><p className="opacity-70 text-xs">Funded</p><p className="font-semibold">₦{user ? transactions.filter(t=>t.type==="wallet").reduce((s,t)=>s+t.amount,0).toLocaleString() : "0"}</p></div>
            <div className="p-3 rounded-xl bg-white/10"><p className="opacity-70 text-xs">Cashback</p><p className="font-semibold">₦0</p></div>
          </div>
        </Card>

        <Card className="p-6 shadow-card bg-gradient-to-br from-card to-accent/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-600 grid place-items-center"><Zap className="h-4 w-4" /></div>
            <div>
          <h3 className="font-semibold mb-3">Fund Wallet</h3>
              <p className="text-xs text-muted-foreground">Bank transfer (admin approval)</p>
            </div>
          </div>
          <Label className="mb-1 block text-xs">Amount (₦) — minimum ₦100</Label>
          <Input type="number" min={100} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[500, 1000, 2000, 5000, 10000, 20000].map((a) => (
              <button key={a} onClick={() => setAmount(a)} className={`text-sm rounded-lg py-2 border ${amount === a ? "border-primary bg-accent" : "border-border hover:bg-muted"}`}>₦{a.toLocaleString()}</button>
            ))}
          </div>
          <Label className="mt-4 mb-1 block text-xs">Your bank</Label>
          <Select value={bank} onValueChange={setBank}>
            <SelectTrigger><SelectValue placeholder="Choose bank" /></SelectTrigger>
            <SelectContent>
              {NIGERIAN_BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>

          <Label className="mt-4 mb-1 block text-xs">Upload receipt (JPG, PNG, PDF)</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={(e) => setReceipt(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pendingFunding || submitting}
            className="w-full p-3 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-accent/40 transition text-sm flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {receipt ? <FileCheck2 className="h-4 w-4 text-success" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
            <span className="truncate">{pendingFunding ? "Awaiting admin review…" : receipt ? receipt.name : "Click to upload your receipt"}</span>
          </button>

          <Button onClick={submitFunding} disabled={pendingFunding || submitting} className="w-full mt-4 bg-gradient-primary">
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</> : pendingFunding ? "Pending review" : "Submit Funding"}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            {pendingFunding ? "Upload re-enables after admin approves or rejects your last receipt." : "Your payment receipt will be reviewed. You'll be notified once verified."}
          </p>
        </Card>

        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setStep("idle"); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-6 w-6 text-success" /> Funding submitted</DialogTitle>
              <DialogDescription>Your ₦{amount.toLocaleString()} funding request was submitted for verification. You'll be notified once approved.</DialogDescription>
            </DialogHeader>
            <div className="text-xs text-center p-3 rounded-lg bg-muted/50">
              <p>Pay to <span className="font-semibold">{settings.accountName}</span></p>
              <p className="font-mono">{settings.accountNumber} · {settings.bankName}</p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={printReceipt}><Printer className="h-4 w-4 mr-2" />Print receipt</Button>
              <Button onClick={() => setOpen(false)} className="bg-gradient-primary">Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        {manualEnabled && (
        <Card className="p-6 shadow-card border-2 border-primary/20 hover-lift">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white grid place-items-center shadow-md"><Building2 className="h-5 w-5" /></div>
            <div><h3 className="font-semibold text-lg">🏦 Fund via Bank Transfer</h3><p className="text-xs text-muted-foreground">Upload receipt for review</p></div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Send any amount to the account below. Your wallet is credited once approved.</p>
          <div className="space-y-2 text-sm bg-muted/40 rounded-xl p-4">
            <Row label="Bank">{activeBank?.bank_name || settings.bankName}</Row>
            <Row label="Account name">{activeBank?.account_name || settings.accountName}</Row>
            <Row label="Account number"><span className="flex items-center gap-2 font-mono">{activeBank?.account_number || settings.accountNumber}<Copy className="h-3.5 w-3.5 cursor-pointer hover:text-primary" onClick={() => { navigator.clipboard.writeText(activeBank?.account_number || settings.accountNumber); toast.success("Copied"); }} /></span></Row>
            {activeBank?.instructions && <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">{activeBank.instructions}</p>}
          </div>
          {payBanks.length > 1 && (
            <div className="mt-3 text-xs text-muted-foreground">Other accounts: {payBanks.filter(b=>b.id!==activeBank?.id).map(b=>b.bank_name).join(", ")}</div>
          )}
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => { navigator.clipboard.writeText(activeBank?.account_number || settings.accountNumber); toast.success("Account number copied!"); }}>
            <Copy className="h-4 w-4 mr-2" />Copy Account Number
          </Button>
        </Card>
        )}

        {paystackEnabled && (
        <Card className="p-6 shadow-card border-2 border-emerald-500/20 hover-lift bg-gradient-to-br from-card to-emerald-500/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white grid place-items-center shadow-md"><CreditCard className="h-5 w-5" /></div>
            <div><h3 className="font-semibold text-lg">💳 Fund via Paystack</h3><p className="text-xs text-muted-foreground">Instant — wallet credited automatically</p></div>
          </div>
          <Label className="mb-1 block text-xs">Amount (₦) — minimum ₦100</Label>
          <Input type="number" min={100} value={psAmount} onChange={(e) => setPsAmount(Number(e.target.value) || 0)} />
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[1000, 2000, 5000, 10000].map((a) => (
              <button key={a} onClick={() => setPsAmount(a)} className={`text-xs rounded-lg py-2 border ${psAmount === a ? "border-emerald-500 bg-emerald-500/10" : "border-border hover:bg-muted"}`}>₦{a.toLocaleString()}</button>
            ))}
          </div>
          <Button onClick={payWithPaystack} disabled={psLoading} className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-white">
            {psLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Initializing…</> : <>Pay ₦{psAmount.toLocaleString()} with Paystack</>}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">Secure checkout · Cards, USSD, Bank Transfer</p>
        </Card>
        )}
      </div>

      <Card className="p-6 shadow-card mt-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Recent activity</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No transactions yet.</p>
        ) : (
          <ul className="space-y-3">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center gap-3">
                {t.network ? <NetworkBadge id={t.network} size="sm" /> : <div className="h-7 w-7 rounded-full bg-success/15 text-success grid place-items-center"><ArrowDownLeft className="h-4 w-4" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.description}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString()}</p>
                </div>
                <span className={`text-sm font-semibold ${t.type === "wallet" ? "text-success" : ""}`}>{t.type === "wallet" ? "+" : "-"}₦{t.amount.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium">{children}</span></div>;
}