"use client";

import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as { standalone?: boolean }).standalone);
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (event) {
    return (
      <button
        onClick={async () => {
          await event.prompt();
          await event.userChoice;
          setEvent(null);
        }}
        className="mt-5 h-11 w-full rounded-xl bg-panel-2 text-sm font-semibold transition hover:bg-panel-3 active:scale-[0.99]"
      >
        Install the app
      </button>
    );
  }

  if (ios) {
    return <p className="mt-5 text-center text-xs text-label-2">To install: tap Share, then Add to Home Screen.</p>;
  }
  return null;
}
