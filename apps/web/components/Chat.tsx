"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH } from "@nexus/shared";
import { Avatar } from "./Avatar";
import { useRoom } from "./RoomProvider";

export function Chat() {
  const { chat, sendChat, memberById } = useRoom();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = chat.at(-1)?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (sendChat(text)) setDraft("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul aria-label="Messages" aria-live="polite" className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {chat.length === 0 && <li className="py-8 text-center text-sm text-label-2">No messages yet. Say hi 👋</li>}
        {chat.map((message) => {
          const name = message.from.name || "Unknown";
          return (
            <li key={message.id} className="flex gap-3">
              <Avatar name={name} image={memberById(message.from.id)?.image ?? null} className="size-8" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{name}</span>
                  <time className="text-[11px] text-label-3">
                    {new Date(message.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
                <p className="text-[15px] leading-snug break-words text-white/90">{message.text}</p>
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ul>
      <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Message"
          aria-label="Message"
          className="h-11 min-w-0 flex-1 rounded-full bg-panel-2 px-4 text-base outline-none placeholder:text-label-3 focus:ring-2 focus:ring-accent"
        />
        <button
          disabled={!draft.trim()}
          className="h-11 rounded-full bg-accent px-5 text-sm font-semibold transition hover:brightness-110 active:scale-95 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
