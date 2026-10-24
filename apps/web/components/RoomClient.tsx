"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { livekitTokenResponseSchema, type LivekitTokenResponse } from "@nexus/shared";
import { RoomView } from "./RoomView";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LivekitTokenResponse };

export function RoomClient({ roomId, selfName }: { roomId: string; selfName: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [joined, setJoined] = useState(false);
  const [deafened, setDeafened] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/rooms/${roomId}/token`, { method: "POST", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return setState({ status: "error", message: "This room doesn't exist or has ended." });
        if (!response.ok) return setState({ status: "error", message: "Could not reach the server." });
        setState({ status: "ready", data: livekitTokenResponseSchema.parse(await response.json()) });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Could not reach the server." });
      });
    return () => controller.abort();
  }, [roomId]);

  if (state.status === "loading") {
    return <Centered>Loading room…</Centered>;
  }

  if (state.status === "error") {
    return (
      <Centered>
        <p className="text-danger">{state.message}</p>
        <Link href="/" className="mt-4 inline-block text-accent hover:underline">
          Back home
        </Link>
      </Centered>
    );
  }

  if (!joined) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">Room {roomId}</h1>
        <p className="mt-2 text-sm text-slate-400">Joining as {selfName}. Your browser will ask for microphone access.</p>
        <button
          onClick={() => setJoined(true)}
          className="mt-6 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-8 py-3 font-semibold transition hover:brightness-110"
        >
          Join room
        </button>
      </Centered>
    );
  }

  return (
    <LiveKitRoom
      token={state.data.token}
      serverUrl={state.data.url}
      connect
      audio={{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }}
      video={false}
      onDisconnected={() => setJoined(false)}
      className="h-dvh"
    >
      <RoomAudioRenderer muted={deafened} />
      <RoomView room={state.data.room} deafened={deafened} onDeafenedChange={setDeafened} />
    </LiveKitRoom>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-8 text-center">{children}</div>
    </main>
  );
}
