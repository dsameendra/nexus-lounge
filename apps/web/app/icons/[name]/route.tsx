import { ImageResponse } from "next/og";
import { iconDataUri, iconMarkup } from "@/lib/icon-markup";

const ICONS: Record<string, { size: number; maskable: boolean }> = {
  "32": { size: 32, maskable: false },
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "maskable-512": { size: 512, maskable: true },
  apple: { size: 180, maskable: false },
};

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  if (name === "svg") {
    return new Response(iconMarkup({ rounded: true }), { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
  }
  const icon = ICONS[name];
  if (!icon) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={iconDataUri({ size: icon.size, maskable: icon.maskable })} width={icon.size} height={icon.size} alt="" />,
    { width: icon.size, height: icon.size },
  );
}
