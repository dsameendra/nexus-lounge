import { ImageResponse } from "next/og";

const SIZES: Record<string, { size: number; scale: number }> = {
  "192": { size: 192, scale: 0.6 },
  "512": { size: 512, scale: 0.6 },
  "maskable-512": { size: 512, scale: 0.44 },
  "apple": { size: 180, scale: 0.6 },
};

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const spec = SIZES[(await params).name];
  if (!spec) return new Response("Not found", { status: 404 });
  const icon = Math.round(spec.size * spec.scale);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0b0f" }}>
        <svg width={icon} height={icon} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11.5" fill="#0a84ff" />
          <path d="M9.6 7.4v9.2a.8.8 0 0 0 1.2.7l7.3-4.6a.8.8 0 0 0 0-1.4l-7.3-4.6a.8.8 0 0 0-1.2.7Z" fill="#ffffff" />
        </svg>
      </div>
    ),
    { width: spec.size, height: spec.size },
  );
}
