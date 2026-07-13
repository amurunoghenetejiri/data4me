import brandAsset from "@/assets/data4me-logo.png.asset.json";

/**
 * Official DATA4ME brand mark. Use anywhere the app is represented
 * (auth modal, footer, admin header, receipts, empty states, etc.)
 * instead of generic placeholder icons.
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
      src={brandAsset.url}
      alt={alt}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      style={{ height: size, width: "auto" }}
    />
  );
}
