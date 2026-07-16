import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { faqs } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";
import { Seo } from "@/components/Seo";

export default function FAQ() {
  const [q, setQ] = useState("");
  const filtered = faqs.filter((f) => f.q.toLowerCase().includes(q.toLowerCase()) || f.a.toLowerCase().includes(q.toLowerCase()));
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <div className="container py-12 max-w-3xl">
      <Seo
        title="DATA4ME FAQs – Data, Airtime & Wallet Questions"
        description="Answers to common questions about DATA4ME data bundles, airtime top-ups, wallet funding, refunds and supported networks in Nigeria."
        path="/faq"
        jsonLd={faqJsonLd}
      />
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold">Frequently asked questions</h1>
        <p className="text-muted-foreground mt-2">Everything you need to know about Data4Me.</p>
      </div>
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search FAQs…" className="pl-9 h-12" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Accordion type="single" collapsible className="space-y-3">
        {filtered.map((f, i) => (
          <AccordionItem key={i} value={`i${i}`} className="bg-gradient-card border border-border/60 rounded-2xl shadow-card px-4">
            <AccordionTrigger className="text-left font-semibold">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
