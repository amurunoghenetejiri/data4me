import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Wifi, Phone, ShieldCheck, Zap, Wallet, Headphones, Star, CheckCircle2 } from "lucide-react";
import { networks, stats, testimonials } from "@/lib/data";
import { NetworkBadge } from "@/components/NetworkBadge";
import { Seo } from "@/components/Seo";

export default function Home() {
  return (
    <div>
      <Seo
        title="DATA4ME – Cheap Data & Airtime in Nigeria"
        description="Instant data bundles, airtime, cable TV renewals and electricity tokens for MTN, Glo, Airtel and 9mobile — powered by DATA4ME."
        path="/"
      />
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="absolute inset-0 -z-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]">
          <div className="absolute top-20 left-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl animate-float" />
          <div className="absolute bottom-10 right-10 h-96 w-96 rounded-full bg-info/20 blur-3xl animate-float" />
        </div>
        <div className="container relative py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-slide-up">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium mb-5">
              <Zap className="h-3.5 w-3.5" /> Instant delivery, every time
            </span>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Buy <span className="text-gradient">cheap data</span> & airtime in seconds.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">
              Data4Me is the fastest way to top up MTN, Glo, Airtel and 9mobile lines. One wallet, four networks, zero stress.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-gradient-primary shadow-glow hover:opacity-90"><Link to="/buy-data">Buy Data <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/buy-airtime">Buy Airtime</Link></Button>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Bank-grade security</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> 99.9% uptime</div>
            </div>
          </div>

          <div className="animate-scale-in">
            <Card className="bg-gradient-card border-border/60 shadow-elevated p-6 rounded-3xl">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-muted-foreground">Quick top-up</p>
                <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-medium">LIVE</span>
              </div>
              <div className="grid grid-cols-4 gap-3 mb-5">
                {networks.map((n) => (
                  <div key={n.id} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 hover-lift cursor-pointer">
                    <NetworkBadge id={n.id} />
                    <span className="text-xs font-medium">{n.name}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Link to="/buy-data" className="group p-4 rounded-2xl bg-gradient-primary text-primary-foreground shadow-md hover:shadow-glow transition">
                  <Wifi className="h-6 w-6 mb-2" />
                  <p className="font-semibold">Data Bundles</p>
                  <p className="text-xs opacity-80">From ₦200</p>
                </Link>
                <Link to="/buy-airtime" className="group p-4 rounded-2xl bg-secondary text-secondary-foreground shadow-md hover:shadow-elevated transition">
                  <Phone className="h-6 w-6 mb-2" />
                  <p className="font-semibold">Airtime</p>
                  <p className="text-xs opacity-80">Any amount</p>
                </Link>
              </div>
              <div className="mt-5 p-3 rounded-xl bg-muted/40 text-xs text-muted-foreground flex items-center justify-between">
                <span>Avg delivery</span><span className="font-semibold text-foreground">8.4s</span>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="container -mt-8 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-5 bg-gradient-card border-border/60 shadow-card hover-lift">
              <s.icon className="h-6 w-6 text-primary mb-2" />
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="container py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">Built to make your life easier</h2>
          <p className="text-muted-foreground mt-3">Everything you need to top up, manage and track in one beautiful dashboard.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: Zap, title: "Instant delivery", body: "Data and airtime hit your line in under 10 seconds — guaranteed." },
            { icon: Wallet, title: "Smart wallet", body: "Fund once, spend anywhere. Track every kobo across all your purchases." },
            { icon: ShieldCheck, title: "Bank-grade security", body: "2FA, encrypted sessions, and PIN-protected payments by default." },
            { icon: Headphones, title: "24/7 support", body: "Real humans answering chats and calls. We never sleep, so you can." },
            { icon: Wifi, title: "All networks", body: "MTN, Glo, Airtel & 9mobile — SME, gifting and corporate plans." },
            { icon: Star, title: "Loyalty rewards", body: "Earn cashback on every purchase. Redeem for free data or airtime." },
          ].map((f) => (
            <Card key={f.title} className="p-6 bg-gradient-card border-border/60 shadow-card hover-lift">
              <div className="h-11 w-11 rounded-xl bg-accent grid place-items-center text-accent-foreground mb-4"><f.icon className="h-5 w-5" /></div>
              <h3 className="font-semibold text-lg">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1.5">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="container py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold">Three steps. Done.</h2>
            <div className="mt-8 space-y-5">
              {["Create your free account in 30 seconds.", "Fund your Data4Me wallet via transfer, card or USSD.", "Pick a network, choose a plan, and we deliver instantly."].map((t, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="h-9 w-9 rounded-full bg-gradient-primary text-primary-foreground grid place-items-center font-bold shadow-md shrink-0">{i + 1}</div>
                  <p className="pt-1.5">{t}</p>
                </div>
              ))}
            </div>
          </div>
          <Card className="p-6 bg-secondary text-secondary-foreground rounded-3xl shadow-elevated">
            <p className="text-xs uppercase tracking-widest opacity-70">This week</p>
            <h3 className="text-2xl font-bold mt-1">You'd save ₦12,400 / yr</h3>
            <p className="opacity-80 mt-2 text-sm">Compared to buying direct, Data4Me users save up to 15% on data and 3% on airtime.</p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {networks.map((n) => (
                <div key={n.id} className="p-3 rounded-xl bg-white/5 flex items-center gap-3">
                  <NetworkBadge id={n.id} size="sm" />
                  <div><p className="font-semibold text-sm">{n.name}</p><p className="text-xs opacity-70">Up to 15% off</p></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="container py-16">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Loved by thousands</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {testimonials.map((t) => (
            <Card key={t.name} className="p-5 bg-gradient-card border-border/60 shadow-card hover-lift">
              <div className="flex gap-0.5 mb-3">{[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 fill-warning text-warning" />)}</div>
              <p className="text-sm">"{t.quote}"</p>
              <div className="mt-4 pt-4 border-t border-border">
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container py-16">
        <Card className="p-10 md:p-14 bg-gradient-primary text-primary-foreground text-center rounded-3xl shadow-elevated relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_top_left,white,transparent_50%)]" />
          <h2 className="relative text-3xl md:text-4xl font-bold">Ready to never run out of data?</h2>
          <p className="relative mt-3 opacity-90 max-w-lg mx-auto">Join 120,000+ Nigerians using Data4Me for instant top-ups and unbeatable prices.</p>
          <div className="relative mt-6 flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg" variant="secondary"><Link to="/buy-data">Get started free</Link></Button>
            <Button asChild size="lg" variant="outline" className="bg-transparent border-white/40 text-primary-foreground hover:bg-white/10"><Link to="/pricing">View pricing</Link></Button>
          </div>
        </Card>
      </section>
    </div>
  );
}