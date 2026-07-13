import { Link } from "react-router-dom";
import logoAsset from "@/assets/data4me-logo.png.asset.json";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 group ${className}`}>
      <img
        src={logoAsset.url}
        alt="DATA4ME logo"
        className="h-9 w-auto object-contain group-hover:scale-105 transition"
      />
      <span className="font-bold text-lg tracking-tight">
        DATA<span className="text-gradient">4ME</span>
      </span>
    </Link>
  );
}
