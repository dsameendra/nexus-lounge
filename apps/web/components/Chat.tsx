"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@livekit/components-react";
import { Avatar, parseImage } from "./Avatar";

export function Chat() {
  const { chatMessages, send, isSending } = useChat();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages.length]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await send(text);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {chatMessages.length === 0 && <li className="py-8 text-center text-sm text-label-2">No messages yet. Say hi 👋</li>}
        {chatMessages.map((message) => {
          const name = message.from?.name || message.from?.identity || "Unknown";
          return (
            <li key={message.id} className="flex gap-3">
              <Avatar name={name} image={parseImage(message.from?.metadata)} className="size-8" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{name}</span>
                  <time className="text-[11px] text-label-3">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
                <p className="text-[15px] leading-snug break-words text-white/90">{message.message}</p>
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
          maxLength={500}
          placeholder="Message"
          className="h-11 min-w-0 flex-1 rounded-full bg-panel-2 px-4 text-base outline-none placeholder:text-label-3 focus:ring-2 focus:ring-accent"
        />
        <button
          disabled={isSending || !draft.trim()}
          className="h-11 rounded-full bg-accent px-5 text-sm font-semibold transition hover:brightness-110 active:scale-95 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
