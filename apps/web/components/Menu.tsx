"use client";

import { useEffect, useRef, useState } from "react";
import { MoreIcon } from "./Icons";

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export function MenuButton({ items, label = "More actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={label}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="flex size-9 items-center justify-center rounded-full text-lg text-label-2 transition hover:bg-white/10 hover:text-white"
      >
        <MoreIcon />
      </button>
      {open && (
        <div role="menu" className="material animate-fade absolute top-10 right-0 z-40 min-w-48 overflow-hidden rounded-xl border border-line p-1 shadow-2xl">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-white/10 ${item.danger ? "text-danger" : ""}`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
