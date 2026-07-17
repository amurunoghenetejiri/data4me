import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { Link } from "react-router-dom";
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Wifi, Phone, Tv, Zap, Send, History, Settings as SettingsIcon, Plus, Sparkles, Bell, User as UserIcon, ArrowUpFromLine, Receipt } from "lucide-react";
import { NetworkBadge } from "@/components/NetworkBadge";
import { cn } from "@/lib/utils";
import { getAvatar } from "@/lib/avatars";
import { useMemo } from "react";

const ACTIONS = [
  { to: "/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/wallet", label: "Fund Wallet", icon: Plus, accent: true },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/transactions", label: "History", icon: History },
  { to: "/buy-airtime", label: "Airtime", icon: Phone },
  { to: "/buy-data", label: "Data", icon: Wifi },
  { to: "/cable", label: "Cable TV", icon: Tv },
  { to: "/electricity", label: "Electricity", icon: Zap },
  { to: "/transfer", label: "Transfer", icon: Send },
  { to: "/withdraw", label: "Withdraw", icon: ArrowUpFromLine },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "Profile", icon: UserIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Dashboard() {
  const { user, wallet, transactions, openAuth } = useApp();
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return { emoji: "☀️", text: "Good Morning" };
    if (h < 17) return { emoji: "🌤️", text: "Good Afternoon" };
    return { emoji: "🌙", text: "Good Evening" };
  }, []);
  const welcomeLine = useMemo(() => {
    const lines = [
      "🌟 You've been missed. Your dashboard is ready and everything is up to date.",
      "🎉 New opportunities, rewards and discounts are waiting for you today.",
      "🚀 Your account is secured, updated and ready for action.",
      "💎 Thank you for choosing Data4Me. Let's make today productive.",
      "🔥 Your wallet, rewards and latest offers are waiting for you.",
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }, [user?.username]);

  if (!user) {
    return (
      <div className="container py-20 text-center">
        <h1 className="text-3xl font-bold">Welcome to your Dashboard</h1>
        <p className="text-muted-foreground mt-2">Log in to view your wallet, transactions and quick actions.</p>
        <Button className="mt-6 bg-gradient-primary" onClick={() => openAuth("login")}>Login</Button>
      </div>
    );
  }

  const recent = transactions.slice(0, 5);

  return (
    <div className="container py-10">
      <Card className="p-5 sm:p-6 mb-6 bg-gradient-to-br from-card via-card to-primary/5 border-primary/20 shadow-elevated relative overflow-hidden">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="relative">
            <div className="h-20 w-20 rounded-2xl overflow-hidden avatar-3d avatar-glow ring-2 ring-primary/30">
              <img src={getAvatar(user.avatarId).url} alt="User profile avatar" className="h-full w-full object-cover avatar-wave" />
            </div>
            <span className="sparkle absolute -top-1 -right-1 text-yellow-400"><Sparkles className="h-4 w-4" /></span>
          </div>
          <div className="flex-1 min-w-[240px]">
            <p className="text-sm text-muted-foreground">{greeting.emoji} {greeting.text}, {user.username}</p>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">✨ Welcome Back, {user.name}! <span className="animate-fade-in">👋</span></h1>
            <p className="text-sm text-muted-foreground mt-1">{welcomeLine}</p>
          </div>
          <p className="text-xs text-muted-foreground self-start">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </Card>

      <Card className="p-6 bg-gradient-primary text-primary-foreground shadow-elevated rounded-3xl overflow-hidden relative mb-6">
        <div className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_top_right,white,transparent_55%)]" />
        <div className="relative grid sm:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <p className="text-xs opacity-80 flex items-center gap-1"><WalletIcon className="h-3.5 w-3.5" /> Wallet balance</p>
            <p className="text-3xl sm:text-4xl font-bold mt-1 break-all">₦{wallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            <p className="text-xs opacity-80 mt-1">@{user.username}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/wallet"><Button variant="secondary"><Plus className="h-4 w-4 mr-2" />Fund</Button></Link>
            <Link to="/transfer"><Button variant="outline" className="bg-transparent border-white/40 text-primary-foreground hover:bg-white/10"><Send className="h-4 w-4 mr-2" />Transfer</Button></Link>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3 mb-6">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className={cn("flex flex-col items-center justify-center gap-2 p-4 rounded-2xl shadow-card hover-lift transition", a.accent ? "bg-gradient-primary text-primary-foreground" : "bg-card")}>
            <a.icon className="h-5 w-5" />
            <span className="text-xs font-medium text-center">{a.label}</span>
          </Link>
        ))}
      </div>

      <Card className="p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Recent transactions</h3>
          <Link to="/transactions" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No transactions yet. Fund your wallet to get started.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                {t.network ? <NetworkBadge id={t.network} size="sm" /> : <div className={cn("h-8 w-8 rounded-full grid place-items-center", t.type === "wallet" || t.type === "eth" ? "bg-success/15 text-success" : "bg-muted")}>{t.type === "wallet" || t.type === "eth" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.description}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.date).toLocaleString()} · {t.reference}</p>
                </div>
                <span className={cn("text-sm font-semibold", (t.type === "wallet" || t.type === "eth") && "text-success")}>{(t.type === "wallet" || t.type === "eth") ? "+" : "-"}₦{t.amount.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}