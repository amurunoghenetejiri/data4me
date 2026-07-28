import { Link, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Bell, Menu, Search, Sparkles, Wallet, LogOut, User as UserIcon, Settings as SettingsIcon, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getAvatar } from "@/lib/avatars";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/wallet", label: "Wallet" },
  { to: "/buy-airtime", label: "Buy Airtime" },
  { to: "/buy-data", label: "Buy Data" },
  { to: "/cable", label: "Cable" },
  { to: "/electricity", label: "Electricity" },
  { to: "/transfer", label: "Transfer" },
  { to: "/transactions", label: "Transactions" },
];

const moreItems = [
  { to: "/networks", label: "Networks" },
  { to: "/pricing", label: "Pricing" },
  { to: "/chat", label: "Community Chat" },
  { to: "/bank", label: "Bank Details" },
  { to: "/withdraw", label: "Withdraw" },
  { to: "/notifications", label: "Notifications" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact" },
  { to: "/faq", label: "FAQ" },
  { to: "/support", label: "Support" },
  { to: "/settings", label: "Settings" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
];

export function Navbar() {
  const { user, openAuth, logout, notifications, markAllRead, wallet, hideBalance, toggleHideBalance, isAdmin } = useApp();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;
  const balanceLabel = hideBalance ? "₦••••••" : `₦${wallet.toLocaleString()}`;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur-xl">
      <div className="container flex h-12 sm:h-14 md:h-16 items-center gap-1 px-2 sm:px-4 min-w-0">
        <Logo />

        <nav className="hidden lg:flex items-center gap-1 ml-4">
          {navItems.map((it) => (
            <NavLink key={it.to} to={it.to} className={({ isActive }) => cn(
              "px-3 py-2 text-sm rounded-lg transition-colors",
              isActive ? "text-primary bg-accent" : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}>{it.label}</NavLink>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger className="px-3 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">More</DropdownMenuTrigger>
            <DropdownMenuContent>
              {moreItems.map((m) => (
                <DropdownMenuItem key={m.to} asChild><Link to={m.to}>{m.label}</Link></DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="hidden md:flex relative ml-auto w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search plans, transactions…" className="pl-9 bg-muted/40 border-transparent focus-visible:bg-background" />
        </div>

       <div className="flex items-center gap-0.5 sm:gap-1.5 md:gap-2 ml-auto md:ml-0 shrink-0">
          {user && (
            <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-full bg-accent text-accent-foreground text-sm font-medium">
              <Wallet className="h-4 w-4" />
              <Link to="/wallet" className="ml-1 tabular-nums">{balanceLabel}</Link>
              <button
                onClick={toggleHideBalance}
                aria-label={hideBalance ? "Show balance" : "Hide balance"}
                className="ml-1 p-1 rounded-full hover:bg-background/40"
              >
                {hideBalance ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          {/* <ThemeToggle /> */}

          <DropdownMenu>
            <DropdownMenuTrigger className="relative h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 grid place-items-center rounded-full hover:bg-muted text-foreground">
  <Bell className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5" />
              {unread > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="flex items-center justify-between p-2">
                <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>
              </div>
              <DropdownMenuSeparator />
              {notifications.slice(0, 6).map((n) => (
                <div key={n.id} className="px-3 py-2 hover:bg-muted/60">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", n.read ? "bg-muted-foreground/40" : "bg-primary")} />
                    <p className="font-medium text-sm">{n.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-4">{n.body}</p>
                </div>
              ))}
              <DropdownMenuSeparator />
              <Link to="/notifications" className="block px-3 py-2 text-center text-sm text-primary hover:bg-muted/60">View all notifications</Link>
            </DropdownMenuContent>
          </DropdownMenu>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="h-8 w-8 sm:h-10 sm:w-10 rounded-full overflow-hidden bg-gradient-primary text-primary-foreground font-semibold grid place-items-center shadow-md ring-2 ring-background">
                <img src={getAvatar(user.avatarId).url} alt="User profile avatar" className="h-full w-full object-cover" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/profile"><UserIcon className="h-4 w-4 mr-2" />Profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/wallet"><Wallet className="h-4 w-4 mr-2" />Wallet</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/transactions"><UserIcon className="h-4 w-4 mr-2" />Transactions</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/settings"><SettingsIcon className="h-4 w-4 mr-2" />Settings</Link></DropdownMenuItem>
                {isAdmin && <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck className="h-4 w-4 mr-2" />Admin</Link></DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setConfirmLogout(true); }}><LogOut className="h-4 w-4 mr-2" />Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8 sm:h-9 sm:w-9">
  <Menu className="h-5 w-5" />
</Button>
              <Button onClick={() => openAuth("register")} className="bg-gradient-primary hover:opacity-90 shadow-md">Register</Button>
            </div>
          )}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden"><Menu /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <div className="mb-6"><Logo /></div>
              {!user && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <Button variant="outline" onClick={() => { openAuth("login"); setMobileOpen(false); }}>Login</Button>
                  <Button onClick={() => { openAuth("register"); setMobileOpen(false); }} className="bg-gradient-primary">Register</Button>
                </div>
              )}
              <nav className="flex flex-col gap-1">
                {[...navItems, ...moreItems].map((it) => (
                  <NavLink key={it.to} to={it.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => cn(
                    "px-3 py-2.5 rounded-lg text-sm",
                    isActive ? "bg-accent text-primary font-medium" : "hover:bg-muted",
                  )}>{it.label}</NavLink>
                ))}
              </nav>
              {user && (
                <div className="mt-6 p-4 rounded-xl bg-gradient-primary text-primary-foreground">
                  <p className="text-xs opacity-80 flex items-center gap-2">
                    Wallet balance
                    <button onClick={toggleHideBalance} className="ml-auto">
                      {hideBalance ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </p>
                  <p className="text-2xl font-bold tabular-nums">{balanceLabel}</p>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
            <AlertDialogDescription>You'll need to sign in again to access your wallet and transactions.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { logout(); setConfirmLogout(false); navigate("/"); }}>Yes, logout</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
