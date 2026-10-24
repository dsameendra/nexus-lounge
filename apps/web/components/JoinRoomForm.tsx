"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parseRoomCode } from "@nexus/shared";

interface RoomPreview {
  id: string;
  name: string;
  hasPassword: boolean;
}

const inputClass =
  "h-12 w-full rounded-xl bg-panel-2 px-4 text-base outline-none placeholder:text-label-3 focus:ring-2 focus:ring-accent";

export function JoinRoomForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [room, setRoom] = useState<RoomPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.location.hash === "#join") codeInput.current?.focus();
  }, []);

  function enter(target: RoomPreview, secret?: string) {
    if (secret) {
      try {
        sessionStorage.setItem(`room-password:${target.id}`, secret);
      } catch {}
    }
    router.push(`/room/${target.id}`);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (room) {
      if (!password) return setError("Enter the room password.");
      return enter(room, password);
    }

    const parsed = parseRoomCode(code);
    if (!parsed) return setError("That doesn't look like a room code. Codes have 8 letters and numbers.");
    setBusy(true);
    try {
      const response = await fetch(`/api/rooms/${parsed}`);
      if (response.status === 404) return setError("There's no room with that code. Check it and try again.");
      if (response.status === 429) return setError("Too many tries. Wait a moment and try again.");
      if (!response.ok) return setError("Couldn't look that room up. Try again.");
      const found = (await response.json()) as RoomPreview;
      if (found.hasPassword) setRoom(found);
      else enter(found);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="join" onSubmit={submit} className="space-y-3" aria-label="Join a room with a code">
      {room ? (
        <>
          <p className="px-1 text-sm text-label-2">
            <span className="font-medium text-white">{room.name || `Room ${room.id}`}</span> is password protected.
          </p>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={64}
            placeholder="Room password"
            aria-label="Room password"
            className={inputClass}
          />
        </>
      ) : (
        <input
          ref={codeInput}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Room code or invite link"
          aria-label="Room code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${inputClass} font-mono`}
        />
      )}
      <div className="flex gap-2">
        {room && (
          <button
            type="button"
            onClick={() => {
              setRoom(null);
              setPassword("");
              setError(null);
            }}
            className="h-12 rounded-xl bg-panel-2 px-5 font-semibold transition hover:bg-panel-3 active:scale-[0.99]"
          >
            Back
          </button>
        )}
        <button
          disabled={busy || (!room && code.trim().length === 0)}
          className="h-12 flex-1 rounded-xl bg-panel-2 font-semibold transition hover:bg-panel-3 active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? "Looking…" : room ? "Join room" : "Join with code"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
