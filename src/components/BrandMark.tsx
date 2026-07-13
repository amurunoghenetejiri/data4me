/**
 * Official DATA4ME brand mark. Use anywhere the app is represented
 * (auth modal, footer, admin header, receipts, empty states, etc.)
 * instead of generic placeholder icons.
 *
 * The logo lives in /public/data4me-logo.png so it is served as a
 * static asset by any host (Lovable, Vercel, Netlify, etc.).
 */
export function BrandMark({
  className = "",
  size = 40,
  alt = "DATA4ME",
}: {
  className?: string;
  size?: number;
  alt?: string;
}) {
  return (
    <img
      src="/data4me-logo.png"
      alt={alt}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      style={{ height: size, width: "auto" }}
      loading="eager"
      decoding="async"
    />
  );
}
