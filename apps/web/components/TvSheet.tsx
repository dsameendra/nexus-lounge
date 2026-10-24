"use client";

import { useState } from "react";
import { useAppleAirPlaySupport } from "./useAirPlay";
import { CheckIcon, LinkIcon, TvIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
import { Sheet } from "./Sheet";

export function TvSheet({ onClose }: { onClose: () => void }) {
  const { state } = useRoom();
  const roomId = state.room.id;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const appleAirPlay = useAppleAirPlaySupport();
  const tvUrl = `${typeof window === "undefined" ? "" : window.location.origin}/room/${roomId}/tv`;

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rooms/${roomId}/tv/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      if (response.ok) {
        setConnected(true);
        setTimeout(onClose, 1800);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Couldn't connect that TV.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(tvUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <Sheet title="TV mode" onClose={onClose}>
      <p className="mb-4 text-sm text-label-2">
        TV mode shows only the video on a big screen. Voice and chat stay on this device.
      </p>

      <section className="mb-4">
        <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">Pair a TV</h3>
        <div className="space-y-3 rounded-2xl bg-panel-2 p-4">
          <p className="text-sm text-label-2">
            On your TV&apos;s browser open <span className="font-mono text-white">{tvUrl.replace(/^https?:\/\//, "")}</span>, then enter the code it shows.
          </p>
          <button onClick={copy} className="flex items-center gap-2 text-sm text-accent hover:underline">
            {copied ? <CheckIcon /> : <LinkIcon />}
            {copied ? "Link copied" : "Copy TV link"}
          </button>
          <form onSubmit={connect} className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder="CODE"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label="TV code"
              className="h-12 min-w-0 flex-1 rounded-xl bg-panel px-4 text-center font-mono text-xl tracking-[0.3em] outline-none placeholder:text-label-3 focus:ring-2 focus:ring-accent"
            />
            <button
              disabled={code.length !== 6 || busy || connected}
              className="h-12 rounded-xl bg-accent px-6 font-semibold transition hover:brightness-110 active:scale-95 disabled:opacity-40"
            >
              {connected ? "Connected" : busy ? "…" : "Connect"}
            </button>
          </form>
          {error && <p className="text-sm text-danger">{error}</p>}
          {connected && <p className="flex items-center gap-2 text-sm text-live"><CheckIcon /> Your TV is connected. Press OK on its remote to start.</p>}
        </div>
      </section>

      {appleAirPlay && (
        <section className="mb-4">
          <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">AirPlay</h3>
          <div className="rounded-2xl bg-panel-2 p-4 text-sm text-label-2">
            <p>
              YouTube and Twitch play inside their own players, which can&apos;t be sent to AirPlay directly. Mirror a clean full-screen view instead:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Open the TV view below on this device.</li>
              <li>
                Open <span className="text-white">Control Center</span>, tap <span className="text-white">Screen Mirroring</span> and choose your Apple TV.
              </li>
            </ol>
            <p className="mt-2">Screen shares can be sent to AirPlay from their AirPlay button when your browser offers it.</p>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">Cast a tab</h3>
        <div className="rounded-2xl bg-panel-2 p-4">
          <p className="mb-3 text-sm text-label-2">Open the TV view in its own tab, then cast that tab with Chrome&apos;s Cast option.</p>
          <a
            href={`/room/${roomId}/tv`}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-panel-3 font-semibold transition hover:brightness-125 active:scale-[0.99]"
          >
            <TvIcon /> Open TV view
          </a>
        </div>
      </section>
    </Sheet>
  );
}
