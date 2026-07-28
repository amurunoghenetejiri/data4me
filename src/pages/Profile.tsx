import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { Link } from "react-router-dom";
import { User as UserIcon, Mail, Phone, Wallet as WalletIcon, AtSign, Gift, Calendar, Copy, Eye, EyeOff, Check } from "lucide-react";
import { AVATARS, getAvatar } from "@/lib/avatars";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function Profile() {
  const { user, wallet, openAuth, hideBalance, toggleHideBalance, updateAvatar } = useApp();
  const [showPicker, setShowPicker] = useState(false);

  if (!user) {
    return (
      <div className="container py-20 text-center">
        <h1 className="text-3xl font-bold">Your profile</h1>
        <p className="text-muted-foreground mt-2">Log in to view your profile and wallet.</p>
        <Button className="mt-6 bg-gradient-primary" onClick={() => openAuth("login")}>Login</Button>
      </div>
    );
  }

  const rows = [
    { icon: UserIcon, label: "Full name", value: user.name },
    { icon: AtSign, label: "Username", value: user.username },
    { icon: Mail, label: "Email address", value: user.email || "—" },
    { icon: Phone, label: "Phone number", value: user.phone || "—" },
    { icon: WalletIcon, label: "Dedicated account", value: user.dedicatedAccountNumber
        ? `\( {user.dedicatedAccountNumber} ( \){user.dedicatedBankName || "Paystack"})`
        : "Generating…" },
    { icon: Gift, label: "Referral code", value: user.referralCode || "—" },
    { icon: Calendar, label: "Member since", value: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—" },
  ];

  const avatar = getAvatar(user.avatarId);

  return (
    <div className="container py-10 max-w-3xl">
      <h1 className="text-3xl font-bold">Profile</h1>
      <p className="text-muted-foreground mt-1 mb-6">Your account details and wallet balance.</p>

      <Card className="p-6 bg-gradient-primary text-primary-foreground shadow-elevated rounded-3xl overflow-hidden relative mb-6">
        <div className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_top_right,white,transparent_55%)]" />
        <div className="relative flex items-center gap-5">
          <img src={avatar.url} alt={avatar.label} className="h-20 w-20 rounded-2xl ring-4 ring-white/30 bg-white/20 object-cover" />
          <div className="flex-1 min-w-0">
            <p className="text-xs opacity-80 flex items-center gap-1">
              <WalletIcon className="h-3.5 w-3.5" /> Wallet balance
              <button onClick={toggleHideBalance} className="ml-1">
                {hideBalance ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </p>
            <p className="text-3xl sm:text-4xl font-bold mt-1 tabular-nums">
              {hideBalance ? "₦••••••" : `₦${wallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              <span className="text-sm font-normal opacity-80 ml-1">NGN</span>
            </p>
            <p className="text-xs opacity-80 mt-1">@{user.username}</p>
          </div>
          <Link to="/wallet"><Button variant="secondary">Fund</Button></Link>
        </div>
      </Card>

      <Card className="p-4 shadow-card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Profile avatar</p>
            <p className="text-xs text-muted-foreground">Choose from 15 themed avatars.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowPicker((s) => !s)}>{showPicker ? "Close" : "Change"}</Button>
        </div>
        {showPicker && (
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 mt-4">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                onClick={() => { updateAvatar(a.id); toast.success(`Avatar set to ${a.label}`); }}
                title={a.label}
                className={cn(
                  "relative aspect-square rounded-xl overflow-hidden border-2 transition",
                  user.avatarId === a.id ? "border-primary shadow-glow" : "border-transparent hover:border-border",
                )}
              >
                <img src={a.url} alt={a.label} className="h-full w-full object-cover bg-muted" loading="lazy" />
                {user.avatarId === a.id && (
                  <div className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground grid place-items-center">
                    <Check className="h-2.5 w-2.5" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-2 shadow-card divide-y divide-border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-xl bg-accent text-accent-foreground grid place-items-center">
              <r.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">{r.label}</p>
              <p className="font-medium truncate flex items-center gap-2">
                <span className="truncate">{r.value}</span>
                {r.label === "Referral code" && user.referralCode && (
                  <button onClick={() => { navigator.clipboard.writeText(user.referralCode!); toast.success("Referral code copied"); }} aria-label="Copy referral code">
                    <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                  </button>
                )}
              </p>
            </div>
          </div>
        ))}
      </Card>

      <div className="mt-6 flex gap-3">
        <Link to="/settings"><Button variant="outline">Edit in Settings</Button></Link>
        <Link to="/transactions"><Button variant="outline">View transactions</Button></Link>
      </div>
    </div>
  );
}
