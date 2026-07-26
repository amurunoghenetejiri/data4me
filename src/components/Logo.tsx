import { Link } from "react-router-dom";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center ${className}`}>
      <img
        src="/data4me-logo.png"
        alt="DATA4ME brand logo"
        className="h-14 sm:h-14 md:h-14 w-auto object-contain drop-shadow-md group-hover:scale-105 transition"
        loading="eager"
        decoding="async"
      />
    </Link>
  );
}
