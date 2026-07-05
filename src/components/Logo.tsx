import { Link } from "react-router-dom";
import logoAsset from "@/assets/data4me-logo.png.asset.json";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center group ${className}`} aria-label="DATA4ME home">
      <img
        src={logoAsset.url}
        alt="DATA4ME — Fast, Secure, Reliable"
        className="h-10 w-auto object-contain group-hover:scale-105 transition"
      />
    </Link>
  );
}
