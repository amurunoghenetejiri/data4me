import { useState, useEffect, FormEvent } from "react";
import { BrandMark } from "@/components/BrandMark";

const STORAGE_KEY = "data4me_private_access";
const PASSWORD = import.meta.env.VITE_SITE_PASSWORD || "data4me-private-2026";

interface PrivateAccessProps {
  children: React.ReactNode;
}

export default function PrivateAccess({ children }: PrivateAccessProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if already unlocked in this browser
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "granted") {
      setUnlocked(true);
    }
    setChecking(false);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() === PASSWORD) {
      localStorage.setItem(STORAGE_KEY, "granted");
      setUnlocked(true);
      setError("");
    } else {
      setError("Incorrect password. Access denied.");
      setInput("");
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
        <div className="w-full max-w-md">
          <div className="bg-card border border-border rounded-2xl shadow-elevated p-8 space-y-6">
            <div className="flex flex-col items-center gap-3">
              <BrandMark className="h-12 w-12" />
              <h1 className="text-2xl font-bold tracking-tight">DATA4ME</h1>
              <p className="text-sm text-muted-foreground text-center">
                This site is temporarily private.
                <br />
                Enter the access password to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="sr-only">
                  Access Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Enter access password"
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                  autoFocus
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition shadow-md"
              >
                Unlock Site
              </button>
            </form>

            <p className="text-xs text-center text-muted-foreground">
              Site is currently closed to the public.
              <br />
              Only authorized access is allowed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
