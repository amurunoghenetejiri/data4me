import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { referralLink } from "@/lib/referral";
import { toast } from "sonner";
import { Gift, Copy, Share2, Users, Wallet, Check, TrendingUp } from "lucide-react";

type Reward = {
  id: string;
  amount: number;
  kind: string;
  status: string;
  created_at: string;
  referrer_id: string;
  referred_id: string;
  source_amount: number | null;
};

type Settings = { welcome_bonus: number; funding_percent: number; is_active: boolean };

export default function Referrals() {
  const { user, openAuth } = useApp();
  const [code, setCode] = useState<string>("");
  const [referrals, setReferrals] = useState<any[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [settings, setSettings] = useState<Settings>({ welcome_bonus: 100, funding_percent: 2, is_active: true });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [{ data: profile }, { data: list }, { data: rw }, { data: st }] = await Promise.all([
        supabase.from("profiles").select("referral_code").eq("id", user.id).maybeSingle(),
        supabase
          .from("profiles")
          .select("id, username, full_name, created_at")
          .eq("referred_by", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("referral_rewards")
          .select("*")
          .eq("referrer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("referral_settings")
          .select("welcome_bonus, funding_percent, is_active")
          .eq("id", 1)
          .maybeSingle(),
      ]);

      setCode(profile?.referral_code || user.referralCode || "");
      setReferrals(list || []);
      setRewards((rw || []) as Reward[]);
      if (st) {
        setSettings({
          welcome_bonus: Number(st.welcome_bonus),
          funding_percent: Number(st.funding_percent),
          is_active: !!st.is_active,
        });
      }
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
  const earned = rewards
    .filter((r) => r.referrer_id === user.id)
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const commissionEarned = rewards
    .filter((r) => r.kind === "funding")
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  const shareMessage =
    `Join DATA4ME using my referral link and receive a welcome bonus after registration. ` +
    `I'll also earn a reward whenever you fund your wallet.\n${link}`;

  function copyLink() {
    if (!link) return toast.error("Referral code not ready yet");
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Referral link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (!link) return toast.error("Referral code not ready yet");
    if (navigator.share) {
      try {
        await navigator.share({ title: "DATA4ME", text: shareMessage });
        return;
      } catch {
        /* user cancelled — fall through */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, "_blank");
  }

  return (
    <div className="container py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Gift className="h-7 w-7 text-primary" /> Refer & Earn
        </h1>
        <p className="text-muted-foreground mt-1">
          Friends get a <span className="text-foreground font-semibold">₦{settings.welcome_bonus.toLocaleString()}</span> welcome bonus.
          You earn <span className="text-foreground font-semibold">{settings.funding_percent}%</span> of every wallet funding they make.
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
              onClick={share}
              disabled={!link}
            >
              <Share2 className="h-4 w-4 mr-2" /> Share
            </Button>
          </div>
          {code && (
            <p className="text-xs opacity-80">
              Code: <span className="font-mono font-semibold">{code}</span>
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Users className="h-3.5 w-3.5" /> Referrals
          </div>
          <p className="text-2xl font-bold mt-1 tabular-nums">{referrals.length}</p>
        </Card>
        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Wallet className="h-3.5 w-3.5" /> Earned
          </div>
          <p className="text-2xl font-bold mt-1 tabular-nums">₦{earned.toLocaleString()}</p>
        </Card>
        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <TrendingUp className="h-3.5 w-3.5" /> Commission
          </div>
          <p className="text-2xl font-bold mt-1 tabular-nums">₦{commissionEarned.toLocaleString()}</p>
        </Card>
      </div>

      <Card className="p-5 shadow-card mb-6">
        <h3 className="font-semibold mb-3">How it works</h3>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Share your link with friends.</li>
          <li>They register — and instantly get a ₦{settings.welcome_bonus.toLocaleString()} welcome bonus.</li>
          <li>
            Every time they fund their wallet, you earn{" "}
            <b className="text-foreground">{settings.funding_percent}%</b> automatically.
          </li>
        </ol>
      </Card>

      <Card className="p-5 shadow-card mb-6">
        <h3 className="font-semibold mb-3">Earnings history</h3>
        {rewards.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No earnings yet. Share your link to start earning.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rewards.map((r) => (
              <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium capitalize">
                    {r.kind === "funding" ? "Funding commission" : "Referral bonus"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                    {r.source_amount ? ` • on ₦${Number(r.source_amount).toLocaleString()}` : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                  +₦{Number(r.amount).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
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
                <span className="text-xs text-muted-foreground shrink-0">
                  {settings.funding_percent}% per funding
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
