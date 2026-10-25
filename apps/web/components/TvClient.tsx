"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import { tvCredentialsSchema, tvPairingSchema, tvPollSchema, type TvCredentials } from "@nexus/shared";
import { RoomProvider } from "./RoomProvider";
import { TvRoom } from "./TvRoom";
import { useWakeLock } from "./useWakeLock";

type Credentials = TvCredentials & { wsUrl: string };

type Phase =
  | { kind: "boot" }
  | { kind: "error"; message: string }
  | { kind: "pairing"; code: string }
  | { kind: "ready"; credentials: Credentials }
  | { kind: "playing"; credentials: Credentials };

function tvSelf(ticket: string) {
  let id = "tv";
  try {
    const payload = JSON.parse(atob((ticket.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string };
    if (payload.sub) id = payload.sub;
  } catch {}
  return { id, name: "TV", image: null, guest: true };
}

export function TvClient({ roomId, signedIn }: { roomId: string; signedIn: boolean }) {
  useWakeLock();
  const [phase, setPhase] = useState<Phase>({ kind: "boot" });
  const cancelled = useRef(false);

  const pair = useCallback(async () => {
    while (!cancelled.current) {
      const created = await fetch("/api/tv/pairings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId }),
      }).catch(() => null);
      if (created?.status === 404) return setPhase({ kind: "error", message: "This room doesn't exist or has ended." });
      if (!created?.ok) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      const pairing = tvPairingSchema.parse(await created.json());
      setPhase({ kind: "pairing", code: pairing.code });

      while (!cancelled.current && Date.now() < pairing.expiresAt) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const polled = await fetch(`/api/tv/pairings/${pairing.code}`, { headers: { "x-pairing-secret": pairing.secret } }).catch(() => null);
        if (polled?.status === 404) break;
        if (!polled?.ok) continue;
        const json = (await polled.json()) as { wsUrl?: string };
        const poll = tvPollSchema.safeParse(json);
        if (poll.success && poll.data.status === "approved") {
          const { wsTicket, livekitToken, livekitUrl } = poll.data;
          return setPhase({ kind: "ready", credentials: { wsTicket, livekitToken, livekitUrl, wsUrl: json.wsUrl ?? "" } });
        }
      }
    }
  }, [roomId]);

  useEffect(() => {
    cancelled.current = false;
    (async () => {
      if (signedIn) {
        const response = await fetch(`/api/rooms/${roomId}/tv/session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }).catch(() => null);
        if (response?.status === 404) return setPhase({ kind: "error", message: "This room doesn't exist or has ended." });
        if (response?.ok) {
          const json = (await response.json()) as { wsUrl: string };
          return setPhase({ kind: "ready", credentials: { ...tvCredentialsSchema.parse(json), wsUrl: json.wsUrl } });
        }
      }
      await pair();
    })();
    return () => {
      cancelled.current = true;
    };
  }, [roomId, signedIn, pair]);

  if (phase.kind === "boot") return <Screen>Connecting…</Screen>;
  if (phase.kind === "error") return <Screen>{phase.message}</Screen>;

  if (phase.kind === "pairing") {
    return (
      <Screen>
        <p className="text-3xl text-label-2">Connect this TV</p>
        <p className="mt-8 font-mono text-[9rem] leading-none font-bold tracking-[0.2em] text-white">{phase.code}</p>
        <ol className="mt-12 space-y-3 text-left text-2xl text-label-2">
          <li>1. On your phone or laptop, open this room in Nexus Lounge.</li>
          <li>
            2. Tap <span className="font-semibold text-white">TV</span> at the top and enter the code.
          </li>
        </ol>
      </Screen>
    );
  }

  if (phase.kind === "ready") {
    return (
      <Screen>
        <p className="text-3xl text-label-2">Connected</p>
        <button
          autoFocus
          onClick={() => {
            void document.documentElement.requestFullscreen?.().catch(() => {});
            setPhase({ kind: "playing", credentials: phase.credentials });
          }}
          className="mt-10 h-24 cursor-pointer rounded-full bg-accent px-16 text-4xl font-semibold outline-offset-4 transition hover:scale-105 focus:scale-105 focus:outline-4 focus:outline-white"
        >
          Start watching
        </button>
        <p className="mt-6 text-xl text-label-3">Press OK on your remote, or click the button</p>
      </Screen>
    );
  }

  const { credentials } = phase;
  return (
    <RoomProvider
      roomId={roomId}
      ticket={credentials.wsTicket}
      wsUrl={credentials.wsUrl}
      self={tvSelf(credentials.wsTicket)}
      fallback={(status) => <Screen>{status === "failed" ? "Couldn't connect to the room." : "Connecting…"}</Screen>}
    >
      <LiveKitRoom token={credentials.livekitToken} serverUrl={credentials.livekitUrl} connect audio={false} video={false} className="h-dvh">
        <TvRoom />
      </LiveKitRoom>
    </RoomProvider>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center bg-black p-12 text-center text-3xl">{children}</main>;
}
