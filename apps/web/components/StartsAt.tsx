"use client";

import { useEffect, useState } from "react";
import { exactTime, startsIn, upcoming } from "@/lib/schedule";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// "Starts in 2 hours", with the exact local time on hover, on tap (toggle) or always (exact).
export function StartsAt({ startsAt, exact = false, toggle = false, className = "" }: { startsAt: number | null | undefined; exact?: boolean; toggle?: boolean; className?: string }) {
  const now = useNow(typeof startsAt === "number");
  const [showExact, setShowExact] = useState(false);
  if (!upcoming(startsAt, now)) return null;
  const when = exactTime(startsAt);
  const relative = startsIn(startsAt, now);
  const text = exact ? `${relative} · ${when}` : showExact ? `Starts ${when}` : relative;
  const time = (
    <time dateTime={new Date(startsAt).toISOString()} title={when} data-starts-at={startsAt}>
      {text}
    </time>
  );
  if (!toggle) return <span className={className}>{time}</span>;
  return (
    <button type="button" onClick={() => setShowExact((value) => !value)} aria-label={`${relative}, ${when}`} className={`text-left ${className}`}>
      {time}
    </button>
  );
}
