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
          sm:h-17
          md:h-19
          lg:h-21
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
