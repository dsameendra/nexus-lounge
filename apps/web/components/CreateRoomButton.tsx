"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { roomInfoSchema } from "@nexus/shared";

export function CreateRoomButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(password ? { password } : {}),
      });
      if (!response.ok) throw new Error();
      const room = roomInfoSchema.parse(await response.json());
      router.push(`/room/${room.id}`);
    } catch {
      setError("Could not create a room. Is the server running?");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        maxLength={64}
        placeholder="Room password (optional)"
        className="h-12 w-full rounded-xl bg-panel-2 px-4 text-base outline-none placeholder:text-label-3 focus:ring-2 focus:ring-accent"
      />
      <button
        onClick={create}
        disabled={busy}
        className="h-12 w-full rounded-xl bg-accent font-semibold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create room"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
