import { Card } from "@/components/ui/card";
import { stats } from "@/lib/data";
import { Target, Heart, Users, Rocket } from "lucide-react";
import { Seo } from "@/components/Seo";

export default function About() {
  return (
    <div className="container py-12">
      <Seo
        title="About DATA4ME: Affordable Data and Airtime in Nigeria"
        description="DATA4ME by DEST-GLOBAL LIMITED delivers affordable data bundles, airtime and wallet services to every Nigerian state, starting from Delta State."
        path="/about"
      />
      <div className="max-w-3xl">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">About us</span>
        <h1 className="text-4xl md:text-5xl font-bold mt-2">About DATA4ME: Affordable Data and Airtime in Nigeria</h1>
        <p className="text-lg text-muted-foreground mt-4">DATA4ME is a product of <span className="font-semibold text-foreground">D4 TECH</span>. Our mission is to provide affordable data subscriptions, airtime services, and seamless wallet funding for all users across Nigeria — starting from Delta State and serving every state nationwide.</p>
        <p className="text-lg text-muted-foreground mt-3">Thank you for choosing DATA4ME.</p>
        <div className="mt-6 p-5 rounded-2xl bg-accent/40 border border-border">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Coverage</p>
          <p className="text-sm text-muted-foreground">We serve customers in <span className="font-semibold text-foreground">Delta State</span>, and across all other Nigerian states: Abia, Adamawa, Akwa Ibom, Anambra, Bauchi, Bayelsa, Benue, Borno, Cross River, Ebonyi, Edo, Ekiti, Enugu, FCT (Abuja), Gombe, Imo, Jigawa, Kaduna, Kano, Katsina, Kebbi, Kogi, Kwara, Lagos, Nasarawa, Niger, Ogun, Ondo, Osun, Oyo, Plateau, Rivers, Sokoto, Taraba, Yobe and Zamfara.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
        {stats.map((s) => (
          <Card key={s.label} className="p-5 bg-gradient-card shadow-card"><s.icon className="h-6 w-6 text-primary mb-2" /><p className="text-2xl font-bold">{s.value}</p><p className="text-sm text-muted-foreground">{s.label}</p></Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-12">
        {[
          { icon: Target, title: "Our mission", body: "Make digital essentials — data and airtime — instant, affordable and stress-free for every Nigerian." },
          { icon: Heart, title: "Our values", body: "Customer first. Reliability over flash. Transparency by default. Build for the long term." },
          { icon: Users, title: "Our people", body: "A remote team of 22 engineers, designers and customer champions across Lagos, Abuja and Nairobi." },
          { icon: Rocket, title: "What's next", body: "Bills, electricity, education pins, and a Data4Me-powered fintech wallet — coming soon." },
        ].map((b) => (
          <Card key={b.title} className="p-6 bg-gradient-card shadow-card hover-lift">
            <div className="h-11 w-11 rounded-xl bg-accent text-accent-foreground grid place-items-center mb-3"><b.icon className="h-5 w-5" /></div>
            <h2 className="font-semibold text-lg">{b.title}</h2>
            <p className="text-muted-foreground text-sm mt-1.5">{b.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
