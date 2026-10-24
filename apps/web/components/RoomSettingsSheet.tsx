"use client";

import { useState } from "react";
import { Segmented } from "./Segmented";
import { useRoom } from "./RoomProvider";
import { Sheet } from "./Sheet";
import { Switch } from "./Switch";

type Guests = "ask" | "open" | "closed";
type Sharing = "everyone" | "controllers";

const GUEST_HINT: Record<Guests, string> = {
  ask: "Guests wait until you let them in.",
  open: "Guests can walk straight in.",
  closed: "Only people signed in with Discord can join.",
};

export function RoomSettingsSheet({ onClose }: { onClose: () => void }) {
  const { state, send } = useRoom();
  const { settings } = state.room;
  const [name, setName] = useState(state.room.name);

  function commitName() {
    const next = name.trim();
    if (next !== state.room.name) send({ type: "settings.update", name: next });
  }

  return (
    <Sheet title="Room settings" onClose={onClose}>
      <div className="space-y-5">
        <section>
          <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">Name</h3>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            maxLength={40}
            placeholder="Give the room a name"
            className="h-12 w-full rounded-xl bg-panel-2 px-4 text-base outline-none placeholder:text-label-3 focus:ring-2 focus:ring-accent"
          />
        </section>

        <section>
          <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">Guests</h3>
          <Segmented<Guests>
            value={settings.guests}
            onChange={(guests) => send({ type: "settings.update", guests })}
            options={[
              { value: "ask", label: "Ask me" },
              { value: "open", label: "Let in" },
              { value: "closed", label: "Not allowed" },
            ]}
            className="bg-panel-2"
          />
          <p className="mt-1.5 px-1 text-xs text-label-2">{GUEST_HINT[settings.guests]}</p>
        </section>

        <section>
          <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">Who can share their screen</h3>
          <Segmented<Sharing>
            value={settings.sharing}
            onChange={(sharing) => send({ type: "settings.update", sharing })}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: "controllers", label: "Controllers only" },
            ]}
            className="bg-panel-2"
          />
          <p className="mt-1.5 px-1 text-xs text-label-2">
            {settings.sharing === "everyone" ? "Anyone signed in with Discord can share. Several people can share at once." : "Only you and controllers can share. Guests can never share."}
          </p>
        </section>

        <div className="divide-y divide-line overflow-hidden rounded-2xl bg-panel-2">
          <Switch
            checked={settings.locked}
            onChange={(locked) => send({ type: "settings.update", locked })}
            label="Lock room"
            description="No new people can join. People who were already in can come back."
          />
          <Switch
            checked={settings.autoplayNext}
            onChange={(autoplayNext) => send({ type: "settings.update", autoplayNext })}
            label="Auto-play next"
            description="When a video ends, the next one in the list starts. A controller needs to be watching."
          />
          <Switch
            checked={settings.reactions}
            onChange={(reactions) => send({ type: "settings.update", reactions })}
            label="Reactions"
            description="Let everyone send emoji reactions."
          />
        </div>
      </div>
    </Sheet>
  );
}
