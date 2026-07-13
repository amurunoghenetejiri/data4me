import { Link } from "react-router-dom";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-1 group ${className}`}>
      <img
        src="/data4me-logo.png"
        alt="DATA4ME logo"
        className="h-14 w-auto object-contain drop-shadow-md group-hover:scale-105 transition"
        loading="eager"
        decoding="async"
      />
      <span className="font-bold text-lg tracking-tight">
        DATA<span className="text-gradient">4ME</span>
      </span>
    </Link>
  );
}
