import { BrandMark } from "@/components/BrandMark";

/**
 * Full site lockdown.
 * The website is completely closed. No password, no access.
 * Remove this component (or restore the previous version) when ready to reopen.
 */
export default function PrivateAccess({ children }: { children: React.ReactNode }) {
  // Always show closed screen – site is fully shut down
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl shadow-elevated p-8 space-y-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <BrandMark size={56} />
            <h1 className="text-2xl font-bold tracking-tight">DATA4ME</h1>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Site Temporarily Closed
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This website is currently closed and not available to the public.
              <br /><br />
              We will reopen soon. Thank you for your understanding.
            </p>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              DATA4ME &mdash; Fast. Secure. Reliable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
