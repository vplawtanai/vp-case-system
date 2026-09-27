import Image from "next/image";

/** Static copy of the official company mark; independent of document Storage/auth. */
export default function BrandMark({ size = 38 }: { size?: 38 | 52 }) {
  return (
    <Image
      src="/branding/vp-partners-logo.png"
      alt="VP Partners"
      width={size}
      height={size}
      loading="eager"
      style={{ display: "block", flexShrink: 0, objectFit: "contain" }}
    />
  );
}
