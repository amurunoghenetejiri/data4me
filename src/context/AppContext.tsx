import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Transaction } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyTelegram } from "@/lib/telegram";
import { parseUserAgent, getClientIp } from "@/lib/clientInfo";

export interface User {
  id?: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  pin?: string;
  avatarId?: string;
  referralCode?: string;
  referredBy?: string;
  createdAt?: string;
}

export interface PaymentSettings {
  bankName: string;
  accountName: string;
  accountNumber: string;
  ussdCode: string;
  supportEmail: string;
  paystackPublicKey?: string;
  paystackMode?: "test" | "live";
}

interface AppState {
  user: User | null;
  /** Now async — resolves with success or throws */
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: { name: string; username: string; email: string; phone: string; password: string; pin?: string; avatarId?: string; referredBy?: string }) => Promise<{ needsOtp: boolean }>;
  logout: () => Promise<void>;
  authOpen: false | "login" | "register";
  openAuth: (mode: "login" | "register") => void;
  closeAuth: () => void;

  wallet: number;
  hideBalance: boolean;
  toggleHideBalance: () => void;
  fundWallet: (amount: number, note?: string) => void;
  deductWallet: (amount: number) => boolean;
  setPin: (pin: string) => void;
  verifyPin: (pin: string) => boolean;
  updateAvatar: (avatarId: string) => void;

  transactions: Transaction[];
  addTransaction: (t: Omit<Transaction, "id" | "date" | "reference">) => Transaction;

  settings: PaymentSettings;
  updateSettings: (s: Partial<PaymentSettings>) => void;

  notifications: { id: string; title: string; body: string; date: string; read: boolean }[];
  pushNotification: (n: { title: string; body: string }) => void;
  markAllRead: () => void;

  theme: "light" | "dark";
  toggleTheme: () => void;

  fundingRequests: FundingRequest[];
  pendingFunding: boolean;
  submitFundingRequest: (r: { amount: number; bank: string; receiptFile?: File | null }) => Promise<void>;
  approveFunding: (id: string) => void;
  rejectFunding: (id: string) => void;

  isAdmin: boolean;
  allUsers: { username: string; email: string; phone: string; createdAt?: string; referralCode?: string }[];

  refreshUser: () => Promise<void>;
}

export interface FundingRequest {
  id: string;
  username: string;
  amount: number;
  bank: string;
  receiptName: string;
  receiptDataUrl?: string;
  date: string;
  status: "pending" | "approved" | "rejected";
}

const defaultSettings: PaymentSettings = {
  bankName: "Opay",
  accountName: "Jaskitinana",
  accountNumber: "8165906606",
  ussdCode: "*955*8165906606*Amount#",
  supportEmail: "support@data4me.ng",
  paystackPublicKey: "",
  paystackMode: "test",
};

const Ctx = createContext<AppState | null>(null);

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

/** Resolve username -> email for Supabase login */
async function resolveEmail(identifier: string): Promise<string> {
  if (identifier.includes("@")) return identifier.trim().toLowerCase();
  const id = identifier.trim().toLowerCase();
  // Quick aliases
  if (id === "admin") return "admin@gmail.com";
  // Look up profile
  const { data } = await supabase.from("profiles").select("email").or(`username.eq.${id},phone.eq.${identifier}`).maybeSingle();
  if (data?.email) return data.email;
  throw new Error("No account found for that username or phone");
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState<false | "login" | "register">(false);
  const [wallet, setWallet] = useState<number>(0);
  const [hideBalance, setHideBalance] = useState<boolean>(() => load("d4m_hide_balance", false));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<PaymentSettings>(() => load("d4m_settings", defaultSettings));
  const [notifications, setNotifications] = useState<AppState["notifications"]>([]);
  const [theme, setTheme] = useState<"light" | "dark">(() => load("d4m_theme", "light"));
  const [fundingRequests, setFundingRequests] = useState<FundingRequest[]>(() => load("d4m_funding_requests", []));
  const [allUsers, setAllUsers] = useState<AppState["allUsers"]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Persist UI-only state
  useEffect(() => { localStorage.setItem("d4m_settings", JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem("d4m_hide_balance", JSON.stringify(hideBalance)); }, [hideBalance]);
  useEffect(() => { localStorage.setItem("d4m_funding_requests", JSON.stringify(fundingRequests)); }, [fundingRequests]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("d4m_theme", JSON.stringify(theme));
  }, [theme]);

  async function hydrateForSession(session: { user: { id: string; email?: string | null } } | null) {
    if (!session) {
      setUser(null); setWallet(0); setTransactions([]); setNotifications([]); setIsAdmin(false);
      return;
    }
    const uid = session.user.id;
    const [profileRes, walletRes, availRes, txRes, notifRes, rolesRes, frRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("wallets").select("balance").eq("user_id", uid).maybeSingle(),
      supabase.rpc("wallet_available", { _user_id: uid }),
      supabase.from("transactions").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
      supabase.from("notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("funding_requests").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
    ]);
    const p = profileRes.data;
    setFundingRequests(((frRes.data as any[]) || []).map((f) => ({
      id: f.id, username: p?.username || "", amount: Number(f.amount), bank: f.bank || f.provider,
      receiptName: f.reference, receiptDataUrl: f.receipt_url || undefined,
      date: f.created_at, status: f.status,
    })));
    setUser({
      id: uid,
      name: p?.full_name || session.user.email?.split("@")[0] || "User",
      username: p?.username || session.user.email?.split("@")[0] || "user",
      email: p?.email || session.user.email || "",
      phone: p?.phone || "",
      avatarId: (p as any)?.avatar_id || "anonymous",
      createdAt: p?.created_at,
    });
    const avail = (availRes as any)?.data;
    setWallet(Number(avail ?? walletRes.data?.balance ?? 0));
    setTransactions(((txRes.data as any[]) || []).map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      status: t.status,
      date: t.created_at,
      reference: t.reference || "",
      description: t.description || "",
      network: t.meta?.network,
      phone: t.meta?.phone,
      meta: t.meta,
    })));
    setNotifications(((notifRes.data as any[]) || []).map((n) => ({
      id: n.id, title: n.title, body: n.body, date: n.created_at, read: !!n.read,
    })));
    setIsAdmin(!!rolesRes.data?.some((r: any) => r.role === "admin"));
  }

  // Bootstrap session + listen to auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { hydrateForSession(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer to avoid deadlocks inside the listener
      setTimeout(() => hydrateForSession(session), 0);
      if (event === "SIGNED_IN" && session) {
        // log login activity (best-effort)
        supabase.from("login_activity").insert({ user_id: session.user.id, event: "login", user_agent: navigator.userAgent });
        // Telegram login notification (best-effort, non-blocking)
        setTimeout(async () => {
          try {
            const uid = session.user.id;
            const [{ data: profile }, { data: rolesData }, ip] = await Promise.all([
              supabase.from("profiles").select("full_name, username, email, phone").eq("id", uid).maybeSingle(),
              supabase.from("user_roles").select("role").eq("user_id", uid),
              getClientIp(),
            ]);
            const { device, os } = parseUserAgent();
            const isAdminUser = !!rolesData?.some((r: any) => r.role === "admin");
            notifyTelegram(isAdminUser ? "Admin Logged In" : "User Logged In", "🔐", {
              "Event Type": "user_login",
              "Full Name": profile?.full_name || "-",
              Username: profile?.username || "-",
              Email: profile?.email || session.user.email || "-",
              Phone: profile?.phone || "-",
              "User ID": uid,
              "Login Time": new Date().toISOString(),
              Device: device,
              OS: os,
              IP: ip,
            });
          } catch { /* noop */ }
        }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Realtime: wallet, transactions, notifications - FIXED
  useEffect(() => {
    if (!user?.id) return;
    
    const ch = supabase
      .channel(`user-${user.id}`)
      // Wallet updates
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` }, (p) => {
        const bal = (p.new as any)?.balance;
        if (bal != null) {
          setWallet(Number(bal));
        }
      })
      // Transaction inserts
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions", filter: `user_id=eq.${user.id}` }, (p) => {
        const t: any = p.new;
        setTransactions((cur) => [{
          id: t.id, type: t.type, amount: Number(t.amount), status: t.status,
          date: t.created_at, reference: t.reference || "", description: t.description || "",
          network: t.meta?.network, phone: t.meta?.phone, meta: t.meta,
        }, ...cur]);
      })
      // Notification inserts - SHOW TOAST
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (p) => {
        const n: any = p.new;
        const newNotif = { id: n.id, title: n.title, body: n.body, date: n.created_at, read: !!n.read };
        setNotifications((cur) => [newNotif, ...cur]);
        
        // Show toast notification to user immediately
        if (n.title.includes("✅") || n.title.includes("Approved")) {
          toast.success(n.title, { description: n.body });
        } else if (n.title.includes("❌") || n.title.includes("Rejected")) {
          toast.error(n.title, { description: n.body });
        } else {
          toast.info(n.title, { description: n.body });
        }
      })
      // Funding request status updates (approve/reject/cancel)
      .on("postgres_changes", { event: "*", schema: "public", table: "funding_requests", filter: `user_id=eq.${user.id}` }, (p) => {
        const f: any = p.new || p.old;
        if (!f) return;
        setFundingRequests((cur) => {
          const others = cur.filter((x) => x.id !== f.id);
          if (p.eventType === "DELETE") return others;
          return [{
            id: f.id, username: user.username, amount: Number(f.amount), bank: f.bank || f.provider,
            receiptName: f.reference, receiptDataUrl: f.receipt_url || undefined,
            date: f.created_at, status: f.status,
          }, ...others];
        });
      })
      .subscribe();
    
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const value = useMemo<AppState>(() => ({
    user,
    login: async (identifier, password) => {
      const email = await resolveEmail(identifier);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setAuthOpen(false);
    },
    register: async ({ name, username, email, phone, password }) => {
      // username uniqueness check (best effort)
      const { data: dup } = await supabase.from("profiles").select("username").eq("username", username.toLowerCase()).maybeSingle();
      if (dup) throw new Error("Username already taken");
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { full_name: name, username: username.toLowerCase(), phone },
        },
      });
      if (error) throw error;
      // If a session is returned, email confirmation is disabled → user logged in immediately
      return { needsOtp: !data.session };
    },
    logout: async () => {
      if (user?.id) {
        await supabase.from("login_activity").insert({ user_id: user.id, event: "logout", user_agent: navigator.userAgent });
        // Telegram logout notification — send BEFORE signOut so JWT is still valid.
        try {
          const { device, os } = parseUserAgent();
          const ip = await getClientIp();
          // Await so the fetch is issued before we drop the session.
          await supabase.functions.invoke("telegram-notify", {
            body: {
              action: "notify",
              title: isAdmin ? "Admin Logged Out" : "User Logged Out",
              emoji: "🚪",
              rows: {
                "Event Type": "user_logout",
                "Full Name": user.name,
                Username: user.username,
                "User ID": user.id,
                "Logout Time": new Date().toISOString(),
                Device: device,
                OS: os,
                IP: ip,
              },
            },
          });
        } catch { /* noop */ }
      }
      await supabase.auth.signOut();
    },
    authOpen,
    openAuth: (m) => setAuthOpen(m),
    closeAuth: () => setAuthOpen(false),
    wallet,
    hideBalance,
    toggleHideBalance: () => setHideBalance((h) => !h),
    fundWallet: (amount, note) => {
      if (!user?.id) {
        setWallet((w) => w + amount);
        return;
      }
      supabase.rpc("credit_wallet", { _user_id: user.id, _amount: amount, _reference: "D4M-" + Math.floor(Math.random() * 100000), _description: note || "Wallet funding" });
    },
    deductWallet: (amount) => {
      if (wallet < amount) return false;
      setWallet((w) => w - amount); // optimistic; DB call by caller via rpc when needed
      return true;
    },
    setPin: (pin) => setUser((u) => (u ? { ...u, pin } : u)),
    verifyPin: (pin) => !!user?.pin && user.pin === pin,
    updateAvatar: async (avatarId) => {
      setUser((u) => (u ? { ...u, avatarId } : u));
      if (user?.id) await supabase.from("profiles").update({ avatar_id: avatarId } as any).eq("id", user.id);
    },
    transactions,
    addTransaction: (t) => {
      const full: Transaction = { ...t, id: crypto.randomUUID(), date: new Date().toISOString(), reference: "D4M-" + Math.floor(Math.random() * 100000) };
      setTransactions((tx) => [full, ...tx]);
      if (user?.id) {
        supabase.from("transactions").insert({
          user_id: user.id, type: t.type, amount: t.amount, status: t.status,
          reference: full.reference, description: t.description, meta: (t.meta || {}) as any,
        });
      }
      return full;
    },
    settings,
    updateSettings: (s) => setSettings((cur) => ({ ...cur, ...s })),
    notifications,
    pushNotification: (n) => {
      setNotifications((cur) => [{ id: crypto.randomUUID(), title: n.title, body: n.body, date: new Date().toISOString(), read: false }, ...cur]);
      if (user?.id) supabase.from("notifications").insert({ user_id: user.id, title: n.title, body: n.body });
    },
    markAllRead: async () => {
      setNotifications((n) => n.map((x) => ({ ...x, read: true })));
      if (user?.id) await supabase.from("notifications").update({ read: true } as any).eq("user_id", user.id).eq("read", false);
    },
    theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    fundingRequests,
    pendingFunding: fundingRequests.some((f) => f.status === "pending"),
    submitFundingRequest: async ({ amount, bank, receiptFile }) => {
      if (!user?.id) throw new Error("Please log in first");
      if (!receiptFile) throw new Error("Receipt file is required");
      const reference = "FR-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
      const ext = receiptFile.name.split(".").pop() || "bin";
      const path = `${user.id}/${reference}.${ext}`;
      const up = await supabase.storage.from("receipts").upload(path, receiptFile, { upsert: false, contentType: receiptFile.type });
      if (up.error) throw new Error(up.error.message);
      const { data: signed } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 60 * 24 * 30);
      const receipt_url = signed?.signedUrl || path;
      const { error } = await supabase.from("funding_requests").insert({
        user_id: user.id, amount, bank, reference, provider: "manual", status: "pending", receipt_url,
      } as any);
      if (error) throw new Error(error.message);
      // Update local mirror for immediate UI
      setFundingRequests((cur) => [{ id: reference, username: user.username, amount, bank, receiptName: receiptFile.name, receiptDataUrl: receipt_url, date: new Date().toISOString(), status: "pending" }, ...cur]);
    },
    approveFunding: (id) => setFundingRequests((cur) => cur.map((r) => (r.id === id ? { ...r, status: "approved" } : r))),
    rejectFunding: (id) => setFundingRequests((cur) => cur.map((r) => (r.id === id ? { ...r, status: "rejected" } : r))),
    isAdmin,
    allUsers,
    refreshUser: async () => {
      const { data } = await supabase.auth.getSession();
      await hydrateForSession(data.session);
    },
  }), [user, authOpen, wallet, hideBalance, transactions, settings, notifications, theme, fundingRequests, allUsers, isAdmin]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}
