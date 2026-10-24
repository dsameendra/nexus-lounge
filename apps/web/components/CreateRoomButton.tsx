"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { roomInfoSchema } from "@nexus/shared";

export function CreateRoomButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms", { method: "POST" });
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
