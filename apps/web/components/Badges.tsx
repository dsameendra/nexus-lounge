import type { MediaSource } from "@nexus/shared";

export function ProviderBadge({ source }: { source: MediaSource }) {
  const youtube = source.type === "youtube";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
        youtube ? "bg-youtube/20 text-youtube" : "bg-twitch/25 text-[#b794ff]"
      }`}
    >
      {youtube ? "YouTube" : "Twitch"}
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
