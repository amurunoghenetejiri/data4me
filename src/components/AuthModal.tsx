import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { notifyTelegram } from "@/lib/telegram";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, CheckCircle2, Loader2, ArrowRight, ArrowLeft, Building2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const NIGERIAN_BANKS = [
  "Opay","PalmPay","Moniepoint","Kuda","Access Bank","GTBank","First Bank","UBA",
  "Zenith Bank","Fidelity Bank","Union Bank","Sterling Bank","Wema Bank",
  "FCMB","Keystone Bank","Polaris Bank","Ecobank","Stanbic IBTC",
];

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

type RegisterStep = "account" | "bank" | "verify" | "confirm" | "otp" | "done";

export function AuthModal() {
  const { authOpen, closeAuth, login, register, openAuth } = useApp();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loginError, setLoginError] = useState<string>("");
  const [loginBusy, setLoginBusy] = useState(false);

  // Registration wizard state
  const [step, setStep] = useState<RegisterStep>("account");
  const [acct, setAcct] = useState({ name: "", username: "", email: "", phone: "", password: "" });
  const [bank, setBank] = useState({ bank_name: "Opay", account_number: "" });
  const [verified, setVerified] = useState<{ account_name: string; account_number: string; bank_name: string } | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [signupBusy, setSignupBusy] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpToastId = useRef<string | number | undefined>();

  useEffect(() => { if (authOpen) setTab(authOpen); }, [authOpen]);
  useEffect(() => {
    if (!authOpen) {
      setStep("account"); setOtp(""); setVerified(null); setLoginError("");
    }
  }, [authOpen]);

  // 60-second resend countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [resendIn]);

  function announceOtp(message: string) {
    if (otpToastId.current) toast.dismiss(otpToastId.current);
    otpToastId.current = toast.success(message, { duration: 30_000 });
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginError("");
    const fd = new FormData(e.currentTarget);
    const identifier = String(fd.get("identifier"));
    const password = String(fd.get("password"));
    setLoginBusy(true);
    try {
      await login(identifier, password);
      toast.success("Welcome back!");
    } catch (err: any) {
      setLoginError(err.message || "Login failed");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleForgotPassword(email: string) {
    const target = email || acct.email || prompt("Enter your account email") || "";
    if (!target) return;
    const { error } = await supabase.auth.resetPasswordForEmail(target.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Password reset link sent. Check your email.");
  }

  function submitAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = {
      name: String(fd.get("name") || "").trim(),
      username: String(fd.get("username") || "").trim().toLowerCase(),
      email: String(fd.get("email") || "").trim().toLowerCase(),
      phone: String(fd.get("phone") || "").trim(),
      password: String(fd.get("password") || ""),
    };
    if (!next.name || !next.username || !next.email || !next.phone || next.password.length < 6) {
      return toast.error("Fill all fields. Password must be at least 6 characters.");
    }
    setAcct(next);
    setStep("bank");
  }

  async function verifyBank() {
    if (bank.account_number.length < 10) return toast.error("Enter a 10-digit account number");
    setVerifyBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("paystack-resolve", {
        body: { account_number: bank.account_number, bank_name: bank.bank_name },
      });
      if (error || !data?.account_name) throw new Error((data as any)?.error || error?.message || "Could not verify");
      setVerified({ account_name: data.account_name, account_number: data.account_number, bank_name: bank.bank_name });
      setStep("verify");
    } catch (e: any) {
      toast.error(e.message || "Bank verification failed");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function confirmAndSendOtp() {
    if (!verified) return;
    setSignupBusy(true);
    try {
      const { needsOtp } = await register({
        name: acct.name, username: acct.username, email: acct.email,
        phone: acct.phone, password: acct.password,
      });
      // Save bank to localStorage so we can persist after OTP confirms session
      try { localStorage.setItem("d4m_pending_bank", JSON.stringify(verified)); } catch { /* noop */ }
      if (!needsOtp) {
        await persistBankIfNeeded();
        toast.success("Account created!");
        closeAuth();
        return;
      }
      setStep("otp");
      setResendIn(60);
      announceOtp(`OTP sent to ${acct.email}`);
    } catch (e: any) {
      toast.error(e.message || "Registration failed");
    } finally {
      setSignupBusy(false);
    }
  }

  async function persistBankIfNeeded() {
    try {
      const raw = localStorage.getItem("d4m_pending_bank");
      if (!raw) return;
      const v = JSON.parse(raw);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("bank_details").upsert({
        user_id: user.id,
        bank_name: v.bank_name,
        account_number: v.account_number,
        account_name: v.account_name,
      } as any, { onConflict: "user_id" });
      localStorage.removeItem("d4m_pending_bank");
    } catch { /* noop */ }
  }

  async function verifyOtp() {
    if (otp.length < 6) return toast.error("Enter the 6-digit OTP from your email");
    setOtpBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: acct.email, token: otp, type: "signup" });
      if (error) throw error;
      await persistBankIfNeeded();
      notifyTelegram("New User Registration", "🎉", {
        "Event Type": "User Registered",
        Username: acct.username || acct.email,
        Email: acct.email,
        Phone: acct.phone || "-",
        Status: "verified",
      });
      toast.success("Account verified! Welcome to Data4Me.");
      setStep("done");
      closeAuth();
    } catch (e: any) {
      toast.error(e.message || "Invalid or expired OTP");
    } finally {
      setOtpBusy(false);
    }
  }

  async function resendOtp() {
    if (resendIn > 0) return;
    const { error } = await supabase.auth.resend({ type: "signup", email: acct.email });
    if (error) return toast.error(error.message);
    announceOtp(`New OTP sent to ${acct.email}`);
    setResendIn(60);
  }

  const wizardTitle = useMemo(() => ({
    account: "Create your account",
    bank: "Bank information",
    verify: "Verifying bank account…",
    confirm: "Confirm details",
    otp: "Enter verification code",
    done: "Done",
  })[step], [step]);

  return (
    <Dialog open={!!authOpen} onOpenChange={(o) => !o && closeAuth()}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto overflow-x-visible p-5 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-1">
            <BrandMark size={56} />
            <div>
              <DialogTitle>Welcome to Data4Me</DialogTitle>
              <DialogDescription>{tab === "register" ? wizardTitle : "Sign in to your account"}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as any); openAuth(v as any); }}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4 pt-4">
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1.5"><Label>Email, phone or username</Label><Input name="identifier" required placeholder="you@example.com / araye / 0801…" /></div>
              <div className="space-y-1.5"><Label>Password</Label><PasswordInput name="password" required placeholder="••••••••" /></div>
              {loginError && <div role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{loginError}</div>}
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" defaultChecked className="accent-primary" /> Remember me</label>
                <button type="button" className="text-primary hover:underline" onClick={() => handleForgotPassword("")}>Forgot password?</button>
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={loginBusy}>
                {loginBusy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in…</> : "Login"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">users are redirected to the user console automatically.</p>
            </form>
          </TabsContent>

          <TabsContent value="register" className="space-y-4 pt-4">
            <Stepper step={step} />

            {step === "account" && (
              <form onSubmit={submitAccount} className="space-y-3">
                <div className="space-y-1.5"><Label>Full name</Label><Input name="name" defaultValue={acct.name} required placeholder="Araye David" /></div>
                <div className="space-y-1.5"><Label>Username</Label><Input name="username" defaultValue={acct.username} required minLength={3} pattern="[a-zA-Z0-9_]+" placeholder="Frederick" /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input name="email" defaultValue={acct.email} type="email" required placeholder="you@example.com" /></div>
                <div className="space-y-1.5"><Label>Phone number</Label><Input name="phone" defaultValue={acct.phone} type="tel" required pattern="[0-9+ ]{7,15}" placeholder="08012345678" /></div>
                <div className="space-y-1.5"><Label>Password</Label><PasswordInput name="password" defaultValue={acct.password} required minLength={6} placeholder="At least 6 characters" /></div>
                <Button type="submit" className="w-full" size="lg">Continue <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </form>
            )}

            {step === "bank" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Bank name</Label>
                  <Input
  placeholder="Search bank..."
  value={bank.bank_name}
  onChange={(e) => {
    setBank({
      ...bank,
      bank_name: e.target.value,
    });
    setVerified(null);
  }}
/>

{bank.bank_name !== "" &&
  NIGERIAN_BANKS.filter((b) =>
    b.toLowerCase().includes(bank.bank_name.toLowerCase())
  ).length > 0 && (
    <div className="max-h-48 overflow-y-auto rounded-md border bg-background mt-1">
      {NIGERIAN_BANKS.filter((b) =>
        b.toLowerCase().includes(bank.bank_name.toLowerCase())
      ).map((b) => (
        <button
          key={b}
          type="button"
          onClick={() => {
            setBank({
              ...bank,
              bank_name: b,
            });
            setVerified(null);
          }}
          className="block w-full px-3 py-2 text-left hover:bg-muted"
        >
          {b}
        </button>
      ))}
    </div>
)}
                </div>
                <div className="space-y-1.5">
                  <Label>Account number</Label>
                  <Input value={bank.account_number} onChange={(e) => { setBank({ ...bank, account_number: e.target.value.replace(/\D/g, "").slice(0, 10) }); setVerified(null); }} placeholder="0123456789" inputMode="numeric" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setStep("account")}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
                  <Button onClick={verifyBank} disabled={verifyBusy || bank.account_number.length < 10} className="bg-gradient-primary">
                    {verifyBusy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying…</> : <>Verify <ArrowRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVerified({ account_name: acct.name || acct.username, account_number: bank.account_number || "0000000000", bank_name: bank.bank_name });
                    setStep("verify");
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Skip bank verification for now — add it later in Settings
                </button>
              </div>
            )}

            {step === "verify" && verified && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-success/40 bg-success/5 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-success font-semibold"><CheckCircle2 className="h-5 w-5" /> Bank account verified</div>
                  <p className="text-sm"><span className="text-muted-foreground">Account name:</span> <b>{verified.account_name}</b></p>
                  <p className="text-sm"><span className="text-muted-foreground">Bank:</span> {verified.bank_name}</p>
                  <p className="text-sm font-mono"><span className="text-muted-foreground font-sans">Account #:</span> {verified.account_number}</p>
                </div>
                <p className="text-xs text-muted-foreground">Confirm these details — they will be saved to your profile and used for withdrawals. An OTP will be sent <em>only after</em> you confirm.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => { setVerified(null); setStep("bank"); }}><ArrowLeft className="h-4 w-4 mr-2" />Edit</Button>
                  <Button onClick={confirmAndSendOtp} disabled={signupBusy} className="bg-gradient-primary">
                    {signupBusy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending OTP…</> : "Confirm & send OTP"}
                  </Button>
                </div>
              </div>
            )}

            {step === "otp" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Enter the 6-digit code we sent to <b>{acct.email}</b>.</p>
                <div className="grid place-items-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      {[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-10 text-lg" />)}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button onClick={verifyOtp} disabled={otpBusy || otp.length < 6} className="w-full bg-gradient-primary">
                  {otpBusy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying…</> : "Verify & finish"}
                </Button>
                <div className="text-center text-xs text-muted-foreground">
                  {resendIn > 0
                    ? <>Resend available in <b>{resendIn}s</b></>
                    : <button onClick={resendOtp} className="text-primary hover:underline">Resend OTP</button>}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }: { step: RegisterStep }) {
  const order: RegisterStep[] = ["account", "bank", "verify", "otp"];
  const idx = order.indexOf(step === "confirm" ? "verify" : step === "done" ? "otp" : step);
  return (
    <div className="flex items-center gap-1.5">
      {order.map((s, i) => (
        <div key={s} className={cn(
          "h-1.5 flex-1 rounded-full transition",
          i <= idx ? "bg-gradient-primary" : "bg-muted",
        )} />
      ))}
    </div>
  );
}
