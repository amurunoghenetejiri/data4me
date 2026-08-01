import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/context/AppContext";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { BankDetailsCard } from "@/components/BankDetailsCard";
import { NotificationSettingsCard } from "@/components/NotificationSettingsCard";

export default function Settings() {
  const { user, settings, updateSettings } = useApp();
  const [form, setForm] = useState(settings);

  return (
    <div className="container py-10 max-w-4xl">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="text-muted-foreground mt-1 mb-8">Manage your profile, notifications and admin-only payment settings.</p>

      <Tabs defaultValue="profile">
        <TabsList className="mb-5 flex-wrap h-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="bank">Bank Account</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="payment">Payment (Admin)</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="bank">
          <BankDetailsCard />
        </TabsContent>


        <TabsContent value="profile">
          <Card className="p-6 shadow-card">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name" defaultValue={user?.name || ""} />
              <Field label="Email" defaultValue={user?.email || ""} />
              <Field label="Phone" defaultValue={user?.phone || ""} placeholder="08012345678" />
              <Field label="Default network" defaultValue="MTN" />
            </div>
            <Button className="mt-5 bg-gradient-primary" onClick={() => toast.success("Profile updated")}>Save changes</Button>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettingsCard />
        </TabsContent>


        <TabsContent value="payment">
          <Card className="p-6 shadow-card">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-accent text-accent-foreground mb-5">
              <ShieldCheck className="h-5 w-5 mt-0.5" />
              <div className="text-sm"><p className="font-semibold">Site owner only</p><p>These details are shown to customers during checkout and wallet funding. Never hard-coded.</p></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Bank name" value={form.bankName} onChange={(v) => setForm({ ...form, bankName: v })} />
              <Field label="Account name" value={form.accountName} onChange={(v) => setForm({ ...form, accountName: v })} />
              <Field label="Account number" value={form.accountNumber} onChange={(v) => setForm({ ...form, accountNumber: v })} />
              <Field label="USSD code" value={form.ussdCode} onChange={(v) => setForm({ ...form, ussdCode: v })} />
              <Field label="Support email" value={form.supportEmail} onChange={(v) => setForm({ ...form, supportEmail: v })} />
            </div>
            <Button className="mt-5 bg-gradient-primary" onClick={() => { updateSettings(form); toast.success("Payment settings saved"); }}>Save payment settings</Button>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="p-6 shadow-card space-y-4">
            <Field label="Current password" type="password" placeholder="••••••••" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="New password" type="password" />
              <Field label="Confirm password" type="password" />
            </div>
            <div className="flex items-center justify-between py-2">
              <div><p className="font-medium">Two-factor authentication</p><p className="text-sm text-muted-foreground">Add a layer of security to your account.</p></div>
              <Switch />
            </div>
            <Button className="bg-gradient-primary" onClick={() => toast.success("Security updated")}>Update security</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value, onChange, defaultValue, ...rest }: { label: string; value?: string; onChange?: (v: string) => void; defaultValue?: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <Input value={value} defaultValue={defaultValue} onChange={onChange ? (e) => onChange(e.target.value) : undefined} {...rest} />
    </div>
  );
}