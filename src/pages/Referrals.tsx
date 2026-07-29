import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { referralLink } from "@/lib/referral";
import { toast } from "sonner";
import { Gift, Copy, Share2, Users, Wallet, Check } from "lucide-react";

export default function Referrals() {
  const { user, openAuth } = useApp();
  const [code, setCode] = useState<string>("");
  const [referrals, setReferrals] = useState<any[]>([]);
  const [earned, setEarned] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("referral_code")
        .eq("id", user.id)
        .maybeSingle();
      setCode(profile?.referral_code || user.referralCode || "");

      const { data: list } = await supabase
        .from("profiles")
        .select("id, username, full_name, created_at")
        .eq("referred_by", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setReferrals(list || []);

      const { data: rewards } = await supabase
        .from("referral_rewards")
        .select("amount")
        .eq("referrer_id", user.id);
      const total = (rewards || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      setEarned(total);
    })();
  }, [user?.id, user?.referralCode]);

  if (!user) {
    return (
      <div className="container py-20 text-center">
        <h1 className="text-3xl font-bold">Refer & Earn</h1>
        <p className="text-muted-foreground mt-2">Log in to get your referral link.</p>
        <Button className="mt-6" onClick={() => openAuth("login")}>Login</Button>
      </div>
    );
  }

  const link = code ? referralLink(code) : "";

  function copyLink() {
    if (!link) return toast.error("Referral code not ready yet");
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Referral link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    if (!link) return toast.error("Referral code not ready yet");
    const text =
      `Join DATA4ME — buy data & airtime easily.\n` +
      `Use my link and I earn ₦100 when you sign up:\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  return (
    <div className="container py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Gift className="h-7 w-7 text-primary" /> Refer & Earn
        </h1>
        <p className="text-muted-foreground mt-1">
          Invite friends. Earn <span className="text-foreground font-semibold">₦100</span> for every signup.
        </p>
      </div>

      <Card className="p-6 mb-4 bg-gradient-primary text-primary-foreground shadow-elevated rounded-3xl overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_top_right,white,transparent_55%)]" />
        <div className="relative space-y-4">
          <p className="text-sm opacity-90">Your referral link</p>
          <div className="rounded-xl bg-black/20 border border-white/20 px-3 py-2.5 font-mono text-sm break-all">
            {link || "Generating your code…"}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copyLink} disabled={!link}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              variant="outline"
              className="bg-transparent border-white/40 text-primary-foreground hover:bg-white/10"
              onClick={shareWhatsApp}
              disabled={!link}
            >
              <Share2 className="h-4 w-4 mr-2" /> WhatsApp
            </Button>
          </div>
          {code && (
            <p className="text-xs opacity-80">
              Code: <span className="font-mono font-semibold">{code}</span>
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Users className="h-3.5 w-3.5" /> Friends joined
          </div>
          <p className="text-2xl font-bold mt-1 tabular-nums">{referrals.length}</p>
        </Card>
        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Wallet className="h-3.5 w-3.5" /> Total earned
          </div>
          <p className="text-2xl font-bold mt-1 tabular-nums">
            ₦{earned.toLocaleString()}
          </p>
        </Card>
      </div>

      <Card className="p-5 shadow-card mb-6">
        <h3 className="font-semibold mb-3">How it works</h3>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Copy your link and share it (WhatsApp, etc.).</li>
          <li>Your friend opens the link and creates an account.</li>
          <li>You get <b className="text-foreground">₦100</b> in your wallet automatically.</li>
        </ol>
      </Card>

      <Card className="p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Your referrals</h3>
          <Link to="/wallet" className="text-sm text-primary hover:underline">Wallet</Link>
        </div>
        {referrals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No referrals yet. Share your link to start earning.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {referrals.map((r) => (
              <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">@{r.username || "user"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                  +₦100
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
  }
