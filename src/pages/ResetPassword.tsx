import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BrandMark } from "@/components/BrandMark";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash. The client picks it up automatically.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 6) return toast.error("Password must be at least 6 characters");
    if (pwd !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. Please log in again.");
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div className="container py-16 max-w-md">
      <Card className="p-6">
        <div className="flex items-center gap-1 mb-4">
          <BrandMark size={52} />
          <h1 className="text-2xl font-bold">Reset password</h1>
        </div>
        {!ready ? (
          <p className="text-sm text-muted-foreground">Open this page from the password-reset email link. Waiting for a valid recovery session…</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div><Label>New password</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} minLength={6} required /></div>
            <div><Label>Confirm password</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required /></div>
            <Button type="submit" className="w-full bg-gradient-primary" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
