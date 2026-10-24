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
    <div className="mt-6">
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        maxLength={64}
        placeholder="Room password (optional)"
        className="mb-3 w-full rounded-lg border border-line bg-bg px-3 py-3 text-base outline-none focus:border-accent"
      />
      <button
        onClick={create}
        disabled={busy}
        className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 py-3 font-semibold transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create room"}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
