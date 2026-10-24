"use client";

import { useEffect, useState } from "react";
import { isTypingTarget } from "@nexus/shared";
import { useChat, useParticipants } from "@livekit/components-react";
import { AddStreamSheet } from "./AddStreamSheet";
import { Chat } from "./Chat";
import { ChatIcon, FilmIcon, PeopleIcon } from "./Icons";
import { VoicePanel } from "./Dock";
import { JoinRequests } from "./JoinRequests";
import { ShareNotices } from "./ShareNotices";
import { PeoplePanel } from "./PeoplePanel";
import { RoomHeader } from "./RoomHeader";
import { useRoom } from "./RoomProvider";
import { Segmented } from "./Segmented";
import { Stage } from "./Stage";
import { StreamLibrary } from "./StreamLibrary";
import { useEffectiveSource } from "./useEffectiveSource";
import { useMediaQuery } from "./useMediaQuery";

type Tab = "chat" | "streams" | "people";

const PANEL_KEY = "nexus-panel-open";

function loadPanelOpen() {
  try {
    return localStorage.getItem(PANEL_KEY) !== "0";
  } catch {
    return true;
  }
}

function useVisualViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
      root.style.setProperty("--app-top", `${Math.round(viewport.offsetTop)}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
    };
  }, []);
}

export function RoomView({
  deafened,
  onDeafenedChange,
  onLeave,
  voiceLost,
  onReconnectVoice,
}: {
  deafened: boolean;
  onDeafenedChange: (value: boolean) => void;
  onLeave: () => void;
  voiceLost: boolean;
  onReconnectVoice: () => void;
}) {
  const { send, status, lastError } = useRoom();
  const { effectiveId } = useEffectiveSource();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [tab, setTab] = useState<Tab>("chat");
  const [panelOpen, setPanelOpen] = useState(loadPanelOpen);
  const [adding, setAdding] = useState(false);
  const { chatMessages } = useChat();
  const participantCount = useParticipants().length;
  const [seenChat, setSeenChat] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  useVisualViewportHeight();

  useEffect(() => {
    if (status === "open") send({ type: "presence.watch", streamId: effectiveId });
  }, [effectiveId, status, send]);

  useEffect(() => {
    if (status === "open") send({ type: "presence.voice", deafened });
  }, [deafened, status, send]);

  useEffect(() => {
    if (!lastError) return;
    setToast(lastError.message);
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [lastError]);

  function togglePanel() {
    setPanelOpen((open) => {
      try {
        localStorage.setItem(PANEL_KEY, open ? "0" : "1");
      } catch {}
      return !open;
    });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Backslash" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (isTypingTarget(target?.tagName, Boolean(target?.isContentEditable))) return;
      event.preventDefault();
      togglePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sideTab = tab === "people" ? "people" : "chat";
  const collapsed = desktop && !panelOpen;
  const chatVisible = tab === "chat" && !collapsed;
  const unread = chatVisible ? 0 : chatMessages.slice(seenChat).filter((message) => !message.from?.isLocal).length;

  useEffect(() => {
    if (chatVisible) setSeenChat(chatMessages.length);
  }, [chatVisible, chatMessages.length]);
  const openAdd = () => setAdding(true);

  return (
    <div
      className="relative flex flex-col overflow-hidden pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
      style={{ height: "var(--app-height, 100dvh)", top: "var(--app-top, 0px)" }}
    >
      <RoomHeader panelOpen={panelOpen} onTogglePanel={togglePanel} unread={unread} deafened={deafened} onDeafenedChange={onDeafenedChange} onLeave={onLeave} />
      {voiceLost && (
        <div role="alert" className="flex items-center justify-center gap-3 bg-warn/15 px-4 py-2 text-sm text-warn">
          Voice disconnected.
          <button onClick={onReconnectVoice} className="rounded-full bg-warn px-3 py-1 text-xs font-semibold text-black transition active:scale-95">
            Reconnect
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col max-lg:landscape:flex-row lg:flex-row">
        <main className="scroll-thin flex shrink-0 flex-col max-lg:landscape:min-h-0 max-lg:landscape:flex-1 max-lg:landscape:shrink max-lg:landscape:overflow-y-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:p-6 lg:pb-0">
          <div className="w-full lg:mx-auto lg:max-w-[max(24rem,calc((100dvh-15rem)*16/9))]">
            <Stage onAdd={openAdd} />
            <div className="hidden lg:block">
              <StreamLibrary onAdd={openAdd} />
            </div>
          </div>
        </main>

        <aside
          inert={collapsed}
          aria-hidden={collapsed}
          className={`flex min-h-0 flex-1 flex-col overflow-hidden border-line bg-bg transition-[width,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] max-lg:landscape:w-72 max-lg:landscape:flex-none max-lg:landscape:border-l lg:flex-none lg:border-l ${
            panelOpen ? "lg:w-[22rem] xl:w-96" : "lg:w-0 lg:border-l-0 lg:opacity-0"
          }`}
        >
          <div className="flex min-h-0 flex-1 flex-col lg:w-[22rem] xl:w-96">
            <div className="p-3 lg:hidden">
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: "chat", label: "Chat", icon: <ChatIcon />, badge: unread },
                  { value: "streams", label: "Streams", icon: <FilmIcon /> },
                  { value: "people", label: "People", icon: <PeopleIcon />, badge: participantCount, badgeTone: "quiet" as const },
                ]}
              />
            </div>
            <div className="hidden p-3 lg:block">
              <Segmented
                value={sideTab}
                onChange={setTab}
                options={[
                  { value: "chat", label: "Chat", icon: <ChatIcon />, badge: unread },
                  { value: "people", label: "People", icon: <PeopleIcon />, badge: participantCount, badgeTone: "quiet" as const },
                ]}
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className={`${sideTab === "chat" && tab !== "streams" ? "flex" : "hidden"} min-h-0 flex-1 flex-col`}>
                <Chat />
              </div>
              <div className={`${sideTab === "people" && tab !== "streams" ? "flex" : "hidden"} min-h-0 flex-1 flex-col`}>
                <PeoplePanel />
              </div>
              {tab === "streams" && (
                <div className="scroll-thin min-h-0 flex-1 overflow-y-auto lg:hidden">
                  <StreamLibrary onAdd={openAdd} />
                </div>
              )}
            </div>
            <VoicePanel deafened={deafened} onDeafenedChange={onDeafenedChange} onLeave={onLeave} />
          </div>
        </aside>
      </div>

      <JoinRequests />
      <ShareNotices />

      {adding && <AddStreamSheet onClose={() => setAdding(false)} />}

      {toast && (
        <div role="status" className="material animate-sheet fixed bottom-24 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full border border-line px-4 py-2.5 text-sm shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
