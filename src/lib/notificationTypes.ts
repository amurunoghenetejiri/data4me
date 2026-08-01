/**
 * Notification type metadata: icon, tone, colour and the settings key that gates it.
 * Kept in one place so the bell, notification centre and settings stay in sync.
 */
export type NotificationType =
  | "wallet"
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "cashback"
  | "referral"
  | "promotion"
  | "security"
  | "system"
  | "ai";

export const NOTIFICATION_TYPES: {
  key: NotificationType;
  label: string;
  description: string;
  emoji: string;
}[] = [
  { key: "wallet", label: "Wallet & funding", description: "Deposits, withdrawals and transfers", emoji: "💰" },
  { key: "airtime", label: "Airtime", description: "Airtime purchase updates", emoji: "📱" },
  { key: "data", label: "Data", description: "Data bundle purchase updates", emoji: "🌐" },
  { key: "electricity", label: "Electricity", description: "Meter token and bill alerts", emoji: "💡" },
  { key: "cable", label: "Cable TV", description: "Subscription renewals", emoji: "📺" },
  { key: "cashback", label: "Cashback", description: "Cashback rewards you earn", emoji: "🎁" },
  { key: "referral", label: "Referrals", description: "Referral signups and bonuses", emoji: "🤝" },
  { key: "promotion", label: "Promotions", description: "Discounts, offers and announcements", emoji: "📣" },
  { key: "security", label: "Security", description: "Logins, PIN and password changes", emoji: "🔐" },
  { key: "system", label: "System", description: "Service status and important notices", emoji: "🔔" },
  { key: "ai", label: "AI assistant", description: "Smart tips and usage insights", emoji: "✨" },
];

const ALIASES: Record<string, NotificationType> = {
  funding: "wallet",
  transfer: "wallet",
  withdrawal: "wallet",
  refund: "wallet",
  login: "security",
  auth: "security",
  transaction: "system",
};

export function normalizeType(raw?: string | null): NotificationType {
  const t = (raw || "system").toLowerCase();
  if (ALIASES[t]) return ALIASES[t];
  return (NOTIFICATION_TYPES.find((n) => n.key === t)?.key ?? "system") as NotificationType;
}

export function typeMeta(raw?: string | null) {
  const key = normalizeType(raw);
  return NOTIFICATION_TYPES.find((n) => n.key === key)!;
}

/** Tailwind classes for the coloured avatar bubble on each notification. */
export function typeAccent(raw?: string | null) {
  switch (normalizeType(raw)) {
    case "wallet":
      return "bg-emerald-500/15 text-emerald-500";
    case "airtime":
      return "bg-sky-500/15 text-sky-500";
    case "data":
      return "bg-violet-500/15 text-violet-500";
    case "electricity":
      return "bg-amber-500/15 text-amber-500";
    case "cable":
      return "bg-fuchsia-500/15 text-fuchsia-500";
    case "cashback":
      return "bg-teal-500/15 text-teal-500";
    case "referral":
      return "bg-indigo-500/15 text-indigo-500";
    case "promotion":
      return "bg-orange-500/15 text-orange-500";
    case "security":
      return "bg-rose-500/15 text-rose-500";
    case "ai":
      return "bg-primary/15 text-primary";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Human friendly day grouping used by the notification centre. */
export function groupLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  if (diffDays < 30) return "This month";
  return "Earlier";
}

export function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
