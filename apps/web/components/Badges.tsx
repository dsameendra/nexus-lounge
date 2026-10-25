import type { MediaSource } from "@nexus/shared";

export function ProviderBadge({ source }: { source: MediaSource }) {
  const tone = { youtube: "bg-youtube/20 text-youtube", twitch: "bg-twitch/25 text-[#b794ff]", local: "bg-white/15 text-label-2", torrent: "bg-white/15 text-label-2", link: "bg-white/15 text-label-2" }[source.type];
  const label = { youtube: "YouTube", twitch: "Twitch", local: "File", torrent: "Stremio", link: "Link" }[source.type];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${tone}`}>
      {label}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "live" | "warn" }) {
  const tones = {
    neutral: "bg-white/10 text-label-2",
    accent: "bg-accent/20 text-accent",
    live: "bg-live/20 text-live",
    warn: "bg-warn/20 text-warn",
  };
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}
