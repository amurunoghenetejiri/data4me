import { Link } from "react-router-dom";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`group flex items-center shrink-0 ${className}`}
      aria-label="DATA4ME home"
    >
      <img
        src="/data4me-logo.png"
        alt="DATA4ME"
        className="
          h-12 w-auto object-contain
          sm:h-15
          md:h-17
          lg:h-19
          drop-shadow-md
          group-hover:scale-105
          transition duration-200
        "
        loading="eager"
        decoding="async"
      />
    </Link>
  );
}
