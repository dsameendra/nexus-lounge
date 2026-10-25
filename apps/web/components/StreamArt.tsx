"use client";

import { useState } from "react";
import { isDeviceSource, type Stream } from "@nexus/shared";
import { FilmIcon } from "./Icons";

export function thumbnailUrl(stream: Stream) {
  const { source } = stream;
  if (source.type === "youtube") return `https://i.ytimg.com/vi/${source.id}/hqdefault.jpg`;
  if (isDeviceSource(source)) return null;
  if (source.isLive) return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${source.id.toLowerCase()}-440x248.jpg`;
  return null;
}

export function StreamArt({ stream, className = "" }: { stream: Stream; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = thumbnailUrl(stream);
  const tint = { youtube: "from-youtube/40", twitch: "from-twitch/50", local: "from-white/15", torrent: "from-white/15", link: "from-white/15" }[stream.source.type];

  if (!url || failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-gradient-to-br ${tint} to-panel-2 text-2xl text-white/70`}>
        <FilmIcon />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" onError={() => setFailed(true)} className={`${className} object-cover`} />;
}
