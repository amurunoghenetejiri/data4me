import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { airtimeAmounts, networks, NetworkId } from "@/lib/data";
import { NetworkBadge } from "@/components/NetworkBadge";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";
import { CheckCircle2, Phone, Loader2 } from "lucide-react";
import { PinDialog } from "@/components/PinDialog";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { Transaction } from "@/lib/data";
import { buyAirtime, estimateCharge } from "@/services/vtuPurchase";

export default function BuyAirtime() {
  const { user, openAuth, wallet, addTransaction, pushNotification, refreshUser } = useApp();
  const [network, setNetwork] = useState<NetworkId>("mtn");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState<number>(500);
  const [pinOpen, setPinOpen] = useState(false);
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [processing, setProcessing] = useState(false);
  const [estimatedCharge, setEstimatedCharge] = useState<number | null>(null);
  const [estimatedTotal, setEstimatedTotal] = useState<number | null>(null);

  async function attempt() {
    if (!user) {
      openAuth("login");
      return;
    }
    if (!/^0[789][01]\d{8}$/.test(phone)) {
      toast.error("Enter a valid Nigerian phone number.");
      return;
    }
    if (amount < 50) {
      toast.error("Minimum airtime is ₦50.");
      return;
    }

    setProcessing(true);
    try {
      const charge = await estimateCharge("airtime", amount).catch(() => 1);
      const required = amount + (Number(charge) || 0);
      if (wallet < required) {
        toast.error(
          "Insufficient balance. You need ₦" +
            required.toLocaleString() +
            " (airtime + charge)."
        );
        return;
      }
      setEstimatedCharge(Number(charge) || 0);
      setEstimatedTotal(required);
      setPinOpen(true);
    } finally {
      setProcessing(false);
    }
  }

  async function confirmBuy() {
    setPinOpen(false);
    if (!user) {
      toast.error("Please sign in and try again.");
      return;
    }

    const checkTotal = estimatedTotal ?? amount;
    if (wallet < checkTotal) {
      toast.error("Insufficient wallet balance. Fund your wallet and try again.");
      return;
    }

    setProcessing(true);
    const toastId = toast.loading("Processing ₦" + amount.toLocaleString() + " airtime...");

    try {
      const result = await buyAirtime(network, phone, amount);

      if (!result.success) {
        toast.error(result.error || "Transaction failed. Please try again.", { id: toastId });
        refreshUser();
        setProcessing(false);
        return;
      }

      const tx = addTransaction({
        type: "airtime",
        network,
        phone,
        amount: result.total || amount,
        status: "success",
        description: network.toUpperCase() + " ₦" + amount.toLocaleString() + " airtime",
        meta: { tx_id: result.tx_id, charge: result.charge ?? estimatedCharge },
      });

      pushNotification({
        title: "Airtime purchase successful",
        body: "₦" + amount.toLocaleString() + " airtime sent to " + phone + ".",
      });

      toast.success("₦" + amount.toLocaleString() + " airtime sent to " + phone, { id: toastId });
      setReceipt(tx);
      setPhone("");
      setAmount(500);
      setEstimatedCharge(null);
      setEstimatedTotal(null);

      setTimeout(() => refreshUser(), 1000);
    } catch (err: any) {
      toast.error(err?.message || "Transaction failed. Please try again.", { id: toastId });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold">Buy Airtime</h1>
      <p className="text-muted-foreground mt-1 mb-8">Top up any line in Nigeria, instantly.</p>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card className="p-6 bg-gradient-card shadow-card">
          <Label className="mb-2 block">Network</Label>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {networks.map((n) => (
              <button
                key={n.id}
                onClick={() => setNetwork(n.id)}
                disabled={processing}
                className={
                  "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition disabled:opacity-50 " +
                  (network === n.id
                    ? "border-primary bg-accent"
                    : "border-transparent bg-muted/40 hover:bg-muted")
                }
              >
                <NetworkBadge id={n.id} />
                <span className="text-sm font-medium">{n.name}</span>
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <div>
              <Label htmlFor="aphone" className="mb-2 block">
                Phone number
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="aphone"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="08012345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  className="pl-9"
                  disabled={processing}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="amt" className="mb-2 block">
                Amount (₦)
              </Label>
              <Input
                id="amt"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
                disabled={processing}
              />
            </div>
          </div>

          <Label className="mb-2 block">Quick amounts</Label>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-6">
            {airtimeAmounts.map((a) => (
              <button
                key={a}
                onClick={() => setAmount(a)}
                disabled={processing}
                className={
                  "px-3 py-2 rounded-lg text-sm font-medium border transition disabled:opacity-50 " +
                  (amount === a
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border hover:bg-muted")
                }
              >
                ₦{a.toLocaleString()}
              </button>
            ))}
          </div>

          <Button
            onClick={attempt}
            size="lg"
            className="w-full bg-gradient-primary shadow-glow"
            disabled={processing}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>Send Airtime ₦{amount.toLocaleString()}</>
            )}
          </Button>
        </Card>

        <aside className="space-y-4">
          <Card className="p-5 bg-secondary text-secondary-foreground shadow-elevated">
            <p className="text-xs opacity-70">Wallet balance</p>
            <p className="text-3xl font-bold">₦{wallet.toLocaleString()}</p>
          </Card>
          <Card className="p-5 shadow-card">
            <h3 className="font-semibold mb-2">Did you know?</h3>
            <p className="text-sm text-muted-foreground">
              Top up ₦5,000 or more in one purchase to unlock 3% cashback to your wallet.
            </p>
          </Card>
          <Card className="p-5 shadow-card">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" /> Delivery promise
            </h3>
            <p className="text-sm text-muted-foreground">
              If your airtime does not arrive in 5 minutes, we refund automatically.
            </p>
          </Card>
        </aside>
      </div>

      <PinDialog
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onVerified={confirmBuy}
        title="Authorise airtime purchase"
        description={
          "Confirm ₦" +
          amount.toLocaleString() +
          " " +
          network.toUpperCase() +
          " airtime to " +
          phone +
          (estimatedCharge && estimatedCharge > 0
            ? " (charge ₦" + estimatedCharge.toLocaleString() + ")"
            : "") +
          "."
        }
      />
      <ReceiptDialog tx={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
      }
