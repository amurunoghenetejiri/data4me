import { Wifi, Phone, CreditCard, Sparkles } from "lucide-react";

export type NetworkId = "mtn" | "glo" | "airtel" | "9mobile";
export type PlanCategory = "daily" | "weekly" | "monthly" | "night";

export const networks: { id: NetworkId; name: string; color: string; tagline: string }[] = [
  { id: "mtn", name: "MTN", color: "hsl(var(--mtn))", tagline: "Everywhere you go" },
  { id: "glo", name: "Glo", color: "hsl(var(--glo))", tagline: "Grandmasters of data" },
  { id: "airtel", name: "Airtel", color: "hsl(var(--airtel))", tagline: "The smartphone network" },
  { id: "9mobile", name: "9mobile", color: "hsl(var(--ninemobile))", tagline: "Now is good" },
];

export const categories: { id: PlanCategory; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "night", label: "Night" },
];

export interface DataPlan {
  id: string;
  network: NetworkId;
  size: string;
  validity: string;
  price: number;
  originalPrice: number;
  discount: number;
  cashback: number;
  category: PlanCategory;
  type: "SME" | "Gifting" | "Corporate" | "Direct";
  popular?: boolean;
}

const sizesByCat: Record<PlanCategory, { size: string; validity: string; price: number }[]> = {
  daily: [
    { size: "100MB", validity: "1 day", price: 50 },
    { size: "200MB", validity: "1 day", price: 100 },
    { size: "300MB", validity: "1 day", price: 125 },
    { size: "500MB", validity: "1 day", price: 100 },
    { size: "700MB", validity: "1 day", price: 150 },
    { size: "1GB", validity: "1 day", price: 210 },
    { size: "1.5GB", validity: "1 day", price: 220 },
    { size: "2GB", validity: "1 day", price: 250 },
    { size: "3GB", validity: "1 day", price: 410 },
    { size: "4GB", validity: "1 day", price: 500 },
    { size: "5GB", validity: "1 day", price: 600 },
    { size: "7GB", validity: "1 day", price: 1500 },
    { size: "10GB", validity: "1 day", price: 2200 },
  ],
  weekly: [
    { size: "1GB", validity: "7 days", price: 170 },
    { size: "2GB", validity: "7 days", price: 250 },
    { size: "3GB", validity: "7 days", price: 410 },
    { size: "5GB", validity: "7 days", price: 490 },
    { size: "7GB", validity: "7 days", price: 1200 },
    { size: "10GB", validity: "7 days", price: 3000 },
    { size: "12GB", validity: "7 days", price: 3800 },
    { size: "15GB", validity: "7 days", price: 6000 },
    { size: "20GB", validity: "7 days", price: 7500 },
    { size: "25GB", validity: "7 days", price: 8300 },
    { size: "30GB", validity: "7 days", price: 10000 },
    { size: "40GB", validity: "7 days", price: 20000 },
    { size: "50GB", validity: "7 days", price: 30800 },
  ],
  monthly: [
    { size: "1GB", validity: "30 days", price: 350 },
    { size: "2GB", validity: "30 days", price: 700 },
    { size: "3GB", validity: "30 days", price: 1100 },
    { size: "5GB", validity: "30 days", price: 1800 },
    { size: "10GB", validity: "30 days", price: 3500 },
    { size: "15GB", validity: "30 days", price: 5500 },
    { size: "20GB", validity: "30 days", price: 7000 },
    { size: "30GB", validity: "30 days", price: 10500 },
    { size: "40GB", validity: "30 days", price: 13500 },
    { size: "50GB", validity: "30 days", price: 16500 },
    { size: "75GB", validity: "30 days", price: 24000 },
    { size: "100GB", validity: "30 days", price: 32000 },
    { size: "150GB", validity: "30 days", price: 48000 },
  ],
  night: [
    { size: "500MB", validity: "Night 12am–5am", price: 80 },
    { size: "1GB", validity: "Night 12am–5am", price: 150 },
    { size: "2GB", validity: "Night 12am–5am", price: 280 },
    { size: "3GB", validity: "Night 12am–5am", price: 400 },
    { size: "5GB", validity: "Night 12am–5am", price: 600 },
    { size: "7GB", validity: "Night 12am–5am", price: 850 },
    { size: "10GB", validity: "Night 12am–5am", price: 1200 },
    { size: "15GB", validity: "Night 12am–5am", price: 1800 },
    { size: "20GB", validity: "Night 12am–5am", price: 2400 },
    { size: "25GB", validity: "Night 12am–5am", price: 2900 },
    { size: "30GB", validity: "Night 12am–5am", price: 3500 },
    { size: "40GB", validity: "Night 12am–5am", price: 4500 },
    { size: "50GB", validity: "Night 12am–5am", price: 5500 },
  ],
};

const networkOffset: Record<NetworkId, number> = { mtn: 0, airtel: 10, glo: 15, "9mobile": 20 };
const discountPool = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 65];

export const dataPlans: DataPlan[] = (Object.keys(sizesByCat) as PlanCategory[]).flatMap((cat) =>
  networks.flatMap((n) =>
    sizesByCat[cat].map((s, i) => {
      const price = s.price + networkOffset[n.id];
      const discount = discountPool[(i + n.id.length + cat.length) % discountPool.length];
      const originalPrice = Math.round(price / (1 - discount / 100));
      const cashback = Math.round(price * (0.04 + (i % 3) * 0.01));
      return {
        id: `${n.id}-${cat}-${i}`,
        network: n.id,
        size: s.size,
        validity: s.validity,
        price,
        originalPrice,
        discount,
        cashback,
        category: cat,
        type: (["SME", "Gifting", "Corporate", "Direct"] as const)[i % 4],
        popular: cat === "monthly" && (i === 3 || i === 4),
      };
    }),
  ),
);

export const airtimeAmounts = [100, 200, 500, 1000, 2000, 5000, 10000];

export interface Transaction {
  id: string;
  type: "data" | "airtime" | "wallet" | "refund" | "transfer" | "eth" | "cable" | "electricity";
  network?: NetworkId;
  phone?: string;
  amount: number;
  status: "success" | "pending" | "failed";
  date: string;
  reference: string;
  description: string;
  meta?: Record<string, string | number>;
}

export const sampleTransactions: Transaction[] = [
  { id: "t1", type: "data", network: "mtn", phone: "08031234567", amount: 1200, status: "success", date: "2026-06-13T10:24:00Z", reference: "D4M-83271", description: "MTN 3GB / 7 days" },
  { id: "t2", type: "airtime", network: "airtel", phone: "08087654321", amount: 500, status: "success", date: "2026-06-12T18:02:00Z", reference: "D4M-83244", description: "Airtel ₦500 airtime" },
  { id: "t3", type: "wallet", amount: 5000, status: "success", date: "2026-06-12T08:11:00Z", reference: "D4M-83198", description: "Wallet funding" },
  { id: "t4", type: "data", network: "glo", phone: "08051112233", amount: 700, status: "pending", date: "2026-06-11T15:33:00Z", reference: "D4M-83134", description: "Glo 2GB / 2 days" },
  { id: "t5", type: "data", network: "9mobile", phone: "08091112233", amount: 2200, status: "failed", date: "2026-06-10T11:01:00Z", reference: "D4M-83100", description: "9mobile 5GB / 30 days" },
  { id: "t6", type: "airtime", network: "mtn", phone: "08031234567", amount: 1000, status: "success", date: "2026-06-09T09:45:00Z", reference: "D4M-83042", description: "MTN ₦1000 airtime" },
];

export const stats = [
  { label: "Instant Delivery", value: "10–30 SecondsAverage delivery time", icon: Sparkles },
  { label: "Secure Payments", value: "256-bit EncryptionYour transactions are protected", icon: CreditCard },
  { label: "Networks", value: "4 Networks SupportedMTN, Airtel, Glo & 9mobile", icon: Wifi },
  { label: "Support", value: "24/7 Customer SupportWe're here whenever you need help", icon: Phone },
];

export const testimonials = [
  { name: "Chiamaka O.", role: "Student, UNILAG", quote: "I get my data in seconds and the prices are way better than buying directly. Data4Me saved my data life!" },
  { name: "Tunde B.", role: "Freelance designer", quote: "The wallet is super smooth and I love seeing all my transactions in one place. Top tier UX." },
  { name: "Aisha M.", role: "Small business owner", quote: "I top up airtime for my team every week. Bulk and fast. Customer support is always responsive." },
  { name: "Emeka K.", role: "Developer", quote: "Clean interface, instant delivery, and the FAQ answers everything. 10/10." },
];

export const faqs = [
  { q: "How fast is data delivered?", a: "Most data and airtime purchases are delivered to your phone within 10 seconds. Pending transactions usually resolve within 5 minutes." },
  { q: "Which networks are supported?", a: "We support MTN, Glo, Airtel, and 9mobile across Nigeria for both data and airtime purchases." },
  { q: "How does the wallet work?", a: "Fund your wallet once and pay for any service instantly. You can top up via bank transfer, card, or USSD." },
  { q: "What happens if a transaction fails?", a: "Failed transactions are automatically refunded to your Data4Me wallet within minutes. You will receive a notification." },
  { q: "Do you offer reseller pricing?", a: "Yes. Active resellers get up to 8% off our retail prices. Contact support to upgrade your account." },
  { q: "Is my data safe?", a: "We use bank-grade encryption, 2FA, and never share your personal information with third parties." },
];
