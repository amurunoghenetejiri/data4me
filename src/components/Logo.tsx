import { Link } from "react-router-dom";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-3 group ${className}`}>
      <img src="/logo.png" alt="DATA4ME logo" className="h-9 w-9 rounded-xl shadow-glow object-cover group-hover:scale-105 transition" />
      <span className="font-bold text-lg tracking-tight">DATA<span className="text-gradient">4ME</span></span>
    </Link>
  );
}
