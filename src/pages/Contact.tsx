import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";

export default function Contact() {
  const { settings } = useApp();
  return (
    <div className="container py-12">
      <div className="grid lg:grid-cols-2 gap-10">
        <div>
          <h1 className="text-4xl font-bold">Talk to us.</h1>
          <p className="text-muted-foreground mt-3 max-w-md">Questions, partnerships, or feedback — we read every message.</p>
          <div className="space-y-4 mt-8">
            <Info icon={Mail} title="Email" value="data4me12@gmail.com" />
            <Info icon={Phone} title="Support phone" value="08165906606" />
            <Info icon={MapPin} title="Developer" value="Destiny" />
          </div>
        </div>
        <Card className="p-6 shadow-card bg-gradient-card">
          <h2 className="font-semibold text-xl mb-4">Send us a message</h2>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); toast.success("Message sent! We'll reply within 24 hours."); (e.target as HTMLFormElement).reset(); }}>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Full name</Label><Input required placeholder="Your name" /></div>
              <div><Label>Email</Label><Input required type="email" placeholder="you@example.com" /></div>
            </div>
            <div><Label>Subject</Label><Input required placeholder="How can we help?" /></div>
            <div><Label>Message</Label><Textarea required rows={5} placeholder="Tell us more…" /></div>
            <Button className="w-full bg-gradient-primary" size="lg">Send message</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Info({ icon: Icon, title, value }: { icon: any; title: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-10 w-10 rounded-xl bg-accent text-accent-foreground grid place-items-center"><Icon className="h-5 w-5" /></div>
      <div><p className="text-xs text-muted-foreground">{title}</p><p className="font-medium">{value}</p></div>
    </div>
  );
}
