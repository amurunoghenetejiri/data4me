import { useEffect, useState } from "react";
import { Download, Share, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isIos, isStandalone } from "@/lib/pwa";

const SNOOZE_KEY = "d4m_install_prompt_snoozed_at";
const SNOOZE_MS = 1000 * 60 * 60 * 12; // keep reminding until installed

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const snoozed = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    const snoozeOver = Date.now() - snoozed > SNOOZE_MS;

    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      if (snoozeOver) setShow(true);
    }

    function onInstalled() {
      setShow(false);
      setDeferred(null);
      localStorage.removeItem(SNOOZE_KEY);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no beforeinstallprompt — show manual instructions instead.
    let t: number | undefined;
    if (isIos() && snoozeOver) {
      t = window.setTimeout(() => { setIosHelp(true); setShow(true); }, 4000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) window.clearTimeout(t);
    };
  }, []);

  if (!show) return null;

  function later() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setShow(false);
    } else {
      later();
    }
    setDeferred(null);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 sm:inset-x-auto sm:left-4 sm:bottom-4 sm:w-[23rem] z-[60] animate-fade-in">
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-elevated p-4 flex gap-3">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Install DATA4ME App</p>
          {iosHelp && !deferred ? (
            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-1">
              Tap <Share className="h-3.5 w-3.5 inline" /> Share, then
              <span className="inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add to Home Screen</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Faster loading, offline access and instant alerts — straight from your home screen.
            </p>
          )}
          <div className="flex gap-2 mt-3">
            {deferred && (
              <Button size="sm" className="bg-gradient-primary" onClick={install}>Install</Button>
            )}
            <Button size="sm" variant="ghost" onClick={later}>Maybe later</Button>
          </div>
        </div>
        <button onClick={later} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default InstallAppPrompt;
