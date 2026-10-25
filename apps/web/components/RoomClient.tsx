"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LiveKitRoom } from "@livekit/components-react";
import type { RoomOptions } from "livekit-client";
import { joinResponseSchema, type JoinResponse } from "@nexus/shared";
import { LocalFilesProvider } from "./LocalFilesProvider";
import { RoomProvider, type Self } from "./RoomProvider";
import { RoomView } from "./RoomView";
import { SoundCues } from "./SoundCues";
import { VoiceAudio } from "./VoiceAudio";
import { destroyAllEntries } from "@/lib/local-entry";
import { unlockAudio } from "@/lib/sounds";
import { PushToTalkProvider } from "./PushToTalk";
import { VoiceSettingsProvider } from "./VoiceSettings";

const roomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "password"; wrong: boolean }
  | { status: "waiting" }
  | { status: "denied"; message: string }
  | { status: "ready"; data: JoinResponse };

const passwordKey = (roomId: string) => `room-password:${roomId}`;

function readStoredPassword(roomId: string) {
  try {
    return sessionStorage.getItem(passwordKey(roomId)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function RoomClient({ roomId, self }: { roomId: string; self: Self }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [joined, setJoined] = useState(false);
  const [deafened, setDeafened] = useState(true);
  const [voiceLost, setVoiceLost] = useState(false);
  const [voiceKey, setVoiceKey] = useState(0);
  const [passwordDraft, setPasswordDraft] = useState("");
  const passwordRef = useRef<string | undefined>(undefined);

  useEffect(() => () => destroyAllEntries(), []);

  const requestToken = useCallback(
    async (password?: string, signal?: AbortSignal) => {
      passwordRef.current = password ?? passwordRef.current;
      try {
        const response = await fetch(`/api/rooms/${roomId}/token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(password ? { password } : {}),
          signal,
        });
        if (response.status === 404) return setState({ status: "error", message: "This room doesn't exist or has ended." });
        if (response.status === 202) return setState({ status: "waiting" });
        if (response.status === 403) {
          const { error } = (await response.json()) as { error: string };
          if (error === "removed") return setState({ status: "denied", message: "You were removed from this room by the owner." });
          if (error === "declined") return setState({ status: "denied", message: "The room owner didn't let you in." });
          if (error === "locked") return setState({ status: "denied", message: "This room is locked by the owner." });
          if (error === "closed") return setState({ status: "denied", message: "This room doesn't allow guests. Sign in with Discord to join." });
          return setState({ status: "password", wrong: error === "wrong_password" });
        }
        if (!response.ok) return setState({ status: "error", message: "Could not reach the server." });
        if (password) {
          try {
            sessionStorage.setItem(passwordKey(roomId), password);
          } catch {}
        }
        setState({ status: "ready", data: joinResponseSchema.parse(await response.json()) });
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

  useEffect(() => {
    if (state.status !== "waiting") return;
    const id = setInterval(() => void requestToken(passwordRef.current), 2000);
    return () => clearInterval(id);
  }, [state.status, requestToken]);

  if (state.status === "loading") return <Centered>Loading room…</Centered>;

  if (state.status === "waiting") {
    return (
      <Centered>
        <span className="mx-auto mb-5 block size-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <h1 className="text-xl font-semibold">Waiting to be let in</h1>
        <p className="mt-2 text-sm text-label-2">The room owner has been asked to let you in. This page will open as soon as they do.</p>
        <Link href="/" className="mt-6 inline-block text-sm text-label-2 transition hover:text-white">
          Cancel
        </Link>
      </Centered>
    );
  }

  if (state.status === "denied") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Can't join</h1>
        <p className="mt-2 text-sm text-label-2">{state.message}</p>
        <Link href="/" className="mt-6 inline-block text-accent hover:underline">
          Back home
        </Link>
      </Centered>
    );
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
        <h1 className="text-xl font-semibold">Password required</h1>
        <form
          className="mt-5 space-y-3"
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
            className="h-12 w-full rounded-xl bg-panel-2 px-4 text-base outline-none placeholder:text-label-3 focus:ring-2 focus:ring-accent"
          />
          {state.wrong && <p className="text-sm text-danger">Wrong password.</p>}
          <PrimaryButton>Continue</PrimaryButton>
        </form>
      </Centered>
    );
  }

  if (!joined) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Join room {roomId}</h1>
        <p className="mt-2 text-sm text-label-2">
          You'll join as {self.name}
          {self.guest ? " (guest)" : ""}, muted and deafened. Unmute whenever you like; your browser only asks for the microphone then.
        </p>
        <div className="mt-6">
          <PrimaryButton
            onClick={() => {
              unlockAudio();
              setJoined(true);
            }}
          >
            Join room
          </PrimaryButton>
        </div>
      </Centered>
    );
  }

  const { data } = state;
  return (
    <RoomProvider
      roomId={roomId}
      ticket={data.wsTicket}
      wsUrl={data.wsUrl}
      self={self}
      fallback={(status) =>
        status === "kicked" ? (
          <Centered>
            <h1 className="text-xl font-semibold">You were removed</h1>
            <p className="mt-2 text-sm text-label-2">The room owner removed you from this room.</p>
            <Link href="/" className="mt-6 inline-block text-accent hover:underline">
              Back home
            </Link>
          </Centered>
        ) : status === "failed" ? (
          <Centered>
            <p className="text-danger">Couldn't connect to the room.</p>
            <Link href="/" className="mt-4 inline-block text-accent hover:underline">
              Back home
            </Link>
          </Centered>
        ) : (
          <Centered>Connecting…</Centered>
        )
      }
    >
      <LiveKitRoom
        key={voiceKey}
        token={data.token}
        serverUrl={data.url}
        connect
        audio={false}
        video={false}
        options={roomOptions}
        onConnected={() => setVoiceLost(false)}
        onDisconnected={() => setVoiceLost(true)}
        className="h-dvh"
      >
        <VoiceSettingsProvider>
          <PushToTalkProvider deafened={deafened}>
          <VoiceAudio deafened={deafened} />
          <SoundCues deafened={deafened} />
          <LocalFilesProvider deafened={deafened}>
            <RoomView
              deafened={deafened}
              onDeafenedChange={setDeafened}
              onLeave={() => router.push("/")}
              voiceLost={voiceLost}
              onReconnectVoice={() => {
                setVoiceLost(false);
                setVoiceKey((key) => key + 1);
              }}
            />
          </LocalFilesProvider>
          </PushToTalkProvider>
        </VoiceSettingsProvider>
      </LiveKitRoom>
    </RoomProvider>
  );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-12 w-full rounded-xl bg-accent px-6 font-semibold transition hover:brightness-110 active:scale-[0.99]"
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[var(--radius-sheet)] bg-panel p-8 text-center">{children}</div>
    </main>
  );
}
