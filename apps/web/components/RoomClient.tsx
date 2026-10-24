"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import type { RoomOptions } from "livekit-client";
import { livekitTokenResponseSchema, type LivekitTokenResponse } from "@nexus/shared";
import { RoomView } from "./RoomView";

const roomOptions: RoomOptions = { adaptiveStream: true, dynacast: true };

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "password"; wrong: boolean }
  | { status: "ready"; data: LivekitTokenResponse };

const passwordKey = (roomId: string) => `room-password:${roomId}`;

function readStoredPassword(roomId: string) {
  try {
    return sessionStorage.getItem(passwordKey(roomId)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function RoomClient({ roomId, selfName }: { roomId: string; selfName: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [joined, setJoined] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");

  const requestToken = useCallback(
    async (password?: string, signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/rooms/${roomId}/token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(password ? { password } : {}),
          signal,
        });
        if (response.status === 404) return setState({ status: "error", message: "This room doesn't exist or has ended." });
        if (response.status === 403) {
          const { error } = (await response.json()) as { error: string };
          return setState({ status: "password", wrong: error === "wrong_password" });
        }
        if (!response.ok) return setState({ status: "error", message: "Could not reach the server." });
        if (password) {
          try {
            sessionStorage.setItem(passwordKey(roomId), password);
          } catch {}
        }
        setState({ status: "ready", data: livekitTokenResponseSchema.parse(await response.json()) });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Could not reach the server." });
      }
    },
    [roomId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void requestToken(readStoredPassword(roomId), controller.signal);
    return () => controller.abort();
  }, [roomId, requestToken]);

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

  if (state.status === "password") {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">Password required</h1>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void requestToken(passwordDraft);
          }}
        >
          <input
            type="password"
            autoFocus
            value={passwordDraft}
            onChange={(event) => setPasswordDraft(event.target.value)}
            maxLength={64}
            placeholder="Room password"
            className="w-full rounded-lg border border-line bg-bg px-3 py-3 text-base outline-none focus:border-accent"
          />
          {state.wrong && <p className="text-sm text-danger">Wrong password.</p>}
          <button className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 py-3 font-semibold transition hover:brightness-110">
            Continue
          </button>
        </form>
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
      options={roomOptions}
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
