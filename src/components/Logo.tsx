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
          h-11 w-auto object-contain
          sm:h-12
          md:h-14
          lg:h-16
          drop-shadow-lg
          ring-2 ring-primary/30
          rounded-xl
          bg-background/80
          p-0.5
          group-hover:scale-105
          group-hover:ring-primary/60
          transition duration-200
        "
        loading="eager"
        decoding="async"
      />
    </Link>
  );
}
