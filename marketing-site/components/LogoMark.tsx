import Image from "next/image";

/**
 * The Azura AI brand mark (transparent PNG).
 * Used everywhere a logo is needed: header, footer, auth pages,
 * chat empty states, favicon (app/icon.png).
 *
 * variant="white" — white strokes, for dark surfaces (default)
 * variant="black" — black strokes, for light surfaces (e.g. white tiles)
 */
export default function LogoMark({
  size = 36,
  variant = "white",
  className = "",
}: {
  size?: number;
  variant?: "white" | "black";
  className?: string;
}) {
  return (
    <Image
      src={variant === "black" ? "/logo-mark-black.png" : "/logo-mark.png"}
      alt=""
      width={size}
      height={size}
      priority
      className={className}
      draggable={false}
    />
  );
}
