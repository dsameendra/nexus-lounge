"use client";

import { useState } from "react";
import { FilmIcon } from "./Icons";

export function Thumbnail({ videoId, className = "" }: { videoId: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-gradient-to-br from-youtube/40 to-panel-2 text-lg text-white/70`}>
        <FilmIcon />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy" onError={() => setFailed(true)} className={`${className} bg-panel-2 object-cover`} />;
}
