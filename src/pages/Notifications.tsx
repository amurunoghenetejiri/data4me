import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { Bell, Check, RefreshCw, Volume2, VolumeX, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Seo } from "@/components/Seo";
import { NOTIFICATION_TYPES, groupLabel, timeAgo, typeAccent, typeMeta } from "@/lib/notificationTypes";
import { isSoundMuted, setSoundMuted, playNotificationSound } from "@/lib/notificationSound";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  ...NOTIFICATION_TYPES.map((t) => ({ key: t.key, label: t.label })),
];

export default function Notifications() {
  const { notifications, markAllRead, markRead, refreshNotifications, user, openAuth, unreadCount } = useApp();
  const [filter, setFilter] = useState("all");
  const [muted, setMuted] = useState(isSoundMuted());
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "all") return notifications;
    if (filter === "unread") return notifications.filter((n) => !n.read);
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const n of filtered) {
      const key = groupLabel(n.date);
      map.set(key, [...(map.get(key) || []), n]);
    }
    return [...map.entries()];
  }, [filtered]);

  if (!user) {
    return (
      <div className="container py-20 text-center">
        <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-muted-foreground mt-2">Login to see your notifications.</p>
        <Button className="mt-6 bg-gradient-primary" onClick={() => openAuth("login")}>Login</Button>
      </div>
    );
  }

  async function refresh() {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  }

  function toggleSound() {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
    if (!next) playNotificationSound("wallet");
  }

  return (
    <div className="container py-8 sm:py-10 max-w-3xl">
      <Seo title="Notifications | DATA4ME" description="All your DATA4ME alerts: wallet, purchases, cashback, referrals and security updates in one place." />

      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground text-sm">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={toggleSound} aria-label={muted ? "Unmute sounds" : "Mute sounds"}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={refresh} aria-label="Refresh notifications">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0} className="hidden sm:inline-flex">
            <Check className="h-4 w-4 mr-2" />Mark all read
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1 mb-4 scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors",
              filter === f.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0} className="w-full mb-4 sm:hidden">
        <Check className="h-4 w-4 mr-2" />Mark all read
      </Button>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Nothing here yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {filter === "all" ? "Your alerts will show up here." : "No notifications match this filter."}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([label, items]) => (
            <section key={label}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</h2>
              <div className="space-y-2.5">
                {items.map((n) => {
                  const Wrapper: React.ElementType = n.actionUrl ? Link : "div";
                  return (
                    <Wrapper
                      key={n.id}
                      {...(n.actionUrl ? { to: n.actionUrl } : {})}
                      onClick={() => !n.read && markRead(n.id)}
                      className={cn(
                        "block rounded-xl border p-3.5 sm:p-4 shadow-card transition-colors bg-card",
                        !n.read ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40",
                      )}
                    >
                      <div className="flex gap-3">
                        <div className={cn("h-10 w-10 shrink-0 rounded-full grid place-items-center text-lg", typeAccent(n.type))}>
                          {typeMeta(n.type).emoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <p className={cn("text-sm sm:text-base leading-snug", n.read ? "font-medium" : "font-semibold")}>{n.title}</p>
                            {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                          </div>
                          {n.body && <p className="text-sm text-muted-foreground mt-0.5 break-words">{n.body}</p>}
                          {n.image && (
                            <img src={n.image} alt="" loading="lazy" className="mt-2 rounded-lg max-h-40 object-cover" />
                          )}
                          <p className="text-[11px] text-muted-foreground/80 mt-1.5">
                            {typeMeta(n.type).label} • {timeAgo(n.date)}
                          </p>
                        </div>
                      </div>
                    </Wrapper>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
