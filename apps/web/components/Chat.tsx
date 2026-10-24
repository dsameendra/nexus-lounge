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
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {chatMessages.map((message) => {
          const name = message.from?.name || message.from?.identity || "Unknown";
          return (
            <li key={message.id} className="flex gap-3">
              <Avatar name={name} image={parseImage(message.from?.metadata)} className="size-8 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{name}</span>
                  <time className="text-[11px] text-slate-500">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
                <p className="text-sm break-words text-slate-300">{message.message}</p>
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
          placeholder="Message the room"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"
        />
        <button
          disabled={isSending || !draft.trim()}
          className="rounded-lg bg-accent px-4 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
