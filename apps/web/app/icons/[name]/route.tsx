import { ImageResponse } from "next/og";
import { AppIconSvg } from "@/lib/app-icon";

const ICONS: Record<string, { size: number; maskable: boolean }> = {
  "32": { size: 32, maskable: false },
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "maskable-512": { size: 512, maskable: true },
  apple: { size: 180, maskable: false },
};

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const icon = ICONS[(await params).name];
  if (!icon) return new Response("Not found", { status: 404 });
  return new ImageResponse(<AppIconSvg size={icon.size} maskable={icon.maskable} />, { width: icon.size, height: icon.size });
}
