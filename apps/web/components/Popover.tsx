"use client";

import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Popover({
  x,
  y,
  onClose,
  label,
  placement = "below",
  width = "w-72",
  anchor = null,
  closeOnBlur = true,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  label: string;
  placement?: "below" | "above";
  width?: string;
  anchor?: HTMLElement | null;
  closeOnBlur?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const margin = 8;
    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - box.width - margin)),
      top: Math.max(margin, Math.min(placement === "above" ? y - box.height : y, window.innerHeight - box.height - margin)),
    });
  }, [x, y, placement]);

  useEffect(() => {
    const away = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", onClose);
    if (closeOnBlur) window.addEventListener("blur", onClose);
    const openedAt = Date.now();
    const scrolled = (event: Event) => {
      if (Date.now() - openedAt < 250) return;
      const target = event.target;
      if (anchor && target instanceof Node && target !== document && !target.contains(anchor)) return;
      onClose();
    };
    document.addEventListener("scroll", scrolled, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      document.removeEventListener("scroll", scrolled, true);
    };
  }, [onClose, anchor, closeOnBlur]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: position?.left ?? x, top: position?.top ?? y, visibility: position ? "visible" : "hidden" }}
      className={`material animate-fade fixed z-[60] ${width} overflow-hidden rounded-2xl border border-line shadow-2xl`}
    >
      {children}
    </div>,
    document.fullscreenElement ?? document.body,
  );
}
