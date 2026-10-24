"use client";

import { useState } from "react";
import type { RoomInfo } from "@nexus/shared";
import { Chat } from "./Chat";
import { MuteBar } from "./MuteBar";
import { ParticipantList } from "./ParticipantList";
import { RoomHeader } from "./RoomHeader";
import { WatchArea } from "./WatchArea";

type Tab = "chat" | "people";

export function RoomView({
  room,
  deafened,
  onDeafenedChange,
}: {
  room: RoomInfo;
  deafened: boolean;
  onDeafenedChange: (value: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="flex h-full flex-col">
      <RoomHeader roomId={room.id} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden border-b border-line bg-black/40 lg:aspect-auto lg:flex-1 lg:border-b-0 lg:border-r">
          <WatchArea />
        </section>

        <aside className="flex min-h-0 flex-1 flex-col bg-panel lg:w-96 lg:flex-none">
          <div className="flex border-b border-line lg:hidden">
            {(["chat", "people"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`flex-1 py-3 text-sm font-medium capitalize ${tab === value ? "border-b-2 border-accent text-white" : "text-slate-400"}`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className={`${tab === "people" ? "flex" : "hidden"} min-h-0 flex-1 flex-col lg:flex lg:max-h-[40%] lg:flex-none lg:border-b lg:border-line`}>
            <ParticipantList hostId={room.hostId} />
          </div>
          <div className={`${tab === "chat" ? "flex" : "hidden"} min-h-0 flex-1 flex-col lg:flex`}>
            <Chat />
          </div>

          <MuteBar deafened={deafened} onDeafenedChange={onDeafenedChange} />
        </aside>
      </div>
    </div>
  );
}
