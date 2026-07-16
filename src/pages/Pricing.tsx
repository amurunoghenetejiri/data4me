import { Card } from "@/components/ui/card";
import { dataPlans, networks, NetworkId } from "@/lib/data";
import { NetworkBadge } from "@/components/NetworkBadge";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Seo } from "@/components/Seo";

export default function Pricing() {
  const [tab, setTab] = useState<NetworkId>("mtn");
  const tiers = [
    { name: "Starter", price: "Free", desc: "For everyday users", features: ["Pay retail prices", "Wallet & history", "Email support"] },
    { name: "Pro", price: "₦999/mo", desc: "For frequent buyers", features: ["Up to 5% data discount", "Priority delivery", "Chat support", "Auto top-up"], featured: true },
    { name: "Reseller", price: "₦4,999/mo", desc: "For agents & shops", features: ["Up to 8% discount", "Bulk purchase", "API access", "Dedicated manager"] },
  ];
  return (
    <div className="container py-10">
      <Seo
        title="DATA4ME Pricing – Data & Airtime Rates in Nigeria"
        description="Compare DATA4ME data bundle and airtime prices for MTN, Glo, Airtel and 9mobile with transparent per-plan pricing."
        path="/pricing"
      />
      <h1 className="text-3xl font-bold">Pricing</h1>
      <p className="text-muted-foreground mt-1 mb-8">Transparent prices for every network. Plus optional plans for power users.</p>

      <div className="grid md:grid-cols-3 gap-5 mb-12">
        {tiers.map((t) => (
          <Card key={t.name} className={`p-6 shadow-card hover-lift relative ${t.featured ? "bg-gradient-primary text-primary-foreground shadow-glow" : "bg-gradient-card"}`}>
            {t.featured && <span className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-warning text-black text-xs font-bold">MOST POPULAR</span>}
            <h3 className="font-bold text-xl">{t.name}</h3>
            <p className={`text-sm ${t.featured ? "opacity-80" : "text-muted-foreground"}`}>{t.desc}</p>
            <p className="text-4xl font-bold mt-4">{t.price}</p>
            <ul className="space-y-2 mt-5 text-sm">
              {t.features.map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 mt-0.5" />{f}</li>)}
            </ul>
            <Button className={`w-full mt-6 ${t.featured ? "bg-white text-primary hover:bg-white/90" : "bg-gradient-primary"}`} asChild><Link to="/buy-data">Get started</Link></Button>
          </Card>
        ))}
      </div>

      <Card className="p-5 shadow-card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-xl font-bold">Data plan prices</h2>
          <Tabs value={tab} onValueChange={(v) => setTab(v as NetworkId)}>
            <TabsList>{networks.map((n) => <TabsTrigger key={n.id} value={n.id}><NetworkBadge id={n.id} size="sm" /><span className="ml-2">{n.name}</span></TabsTrigger>)}</TabsList>
          </Tabs>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Plan</TableHead><TableHead>Type</TableHead><TableHead>Validity</TableHead><TableHead className="text-right">Price</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {dataPlans.filter((p) => p.network === tab).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-semibold">{p.size}</TableCell>
                <TableCell><span className="text-xs px-2 py-1 rounded-full bg-muted">{p.type}</span></TableCell>
                <TableCell>{p.validity}</TableCell>
                <TableCell className="text-right font-medium">₦{p.price.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}