"use client";

import { useState } from "react";
import { SCHEDULE_MAX_AHEAD_MS } from "@nexus/shared";
import { exactTime, fromLocalInput, toLocalInput, upcoming } from "@/lib/schedule";
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
            aria-label="Room name"
            className="h-12 w-full rounded-xl bg-panel-2 px-4 text-base outline-none placeholder:text-label-3 focus:ring-2 focus:ring-accent"
          />
        </section>

        <StartTime />

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

function StartTime() {
  const { state, send } = useRoom();
  const { startsAt } = state.room;
  const scheduled = upcoming(startsAt) ? startsAt : null;
  const [draft, setDraft] = useState(scheduled ? toLocalInput(scheduled) : "");
  const [error, setError] = useState<string | null>(null);
  const picked = fromLocalInput(draft);
  const changed = picked !== null && picked !== scheduled;

  function save() {
    if (picked === null) return;
    const now = Date.now();
    if (picked <= now) return setError("Pick a time in the future.");
    if (picked > now + SCHEDULE_MAX_AHEAD_MS) return setError("Pick a time within the next 30 days.");
    setError(null);
    send({ type: "settings.update", startsAt: picked });
  }

  return (
    <section>
      <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">Start time</h3>
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={draft}
          min={toLocalInput(Date.now())}
          max={toLocalInput(Date.now() + SCHEDULE_MAX_AHEAD_MS)}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => event.key === "Enter" && save()}
          aria-label="Start time"
          className="h-12 min-w-0 flex-1 rounded-xl bg-panel-2 px-4 text-base outline-none focus:ring-2 focus:ring-accent [color-scheme:dark]"
        />
        <button
          onClick={save}
          disabled={!changed}
          className="h-12 rounded-xl bg-accent px-5 font-semibold transition hover:brightness-110 active:scale-95 disabled:opacity-40"
        >
          Set
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 px-1 text-xs text-danger">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 px-1 text-xs text-label-2">
          {scheduled ? (
            <>
              Starts {exactTime(scheduled)}, your time. Everyone sees it, and invites include it.{" "}
              <button
                onClick={() => {
                  setDraft("");
                  send({ type: "settings.update", startsAt: null });
                }}
                className="font-medium text-accent hover:underline"
              >
                Clear
              </button>
            </>
          ) : (
            "Optional. Shown in the header and in invites. The room stays open until then."
          )}
        </p>
      )}
    </section>
  );
}
