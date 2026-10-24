import { AppIconSvg } from "@/lib/app-icon";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-block shrink-0 drop-shadow-sm" style={{ width: size, height: size }} aria-hidden="true">
      <AppIconSvg size={size} rounded />
    </span>
  );
}
