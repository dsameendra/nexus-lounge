"use client";

import { useRef, useState } from "react";
import { MoreIcon } from "./Icons";
import { Popover } from "./Popover";

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

const MENU_WIDTH = 224;

export function MenuButton({ items, label = "More actions" }: { items: MenuItem[]; label?: string }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closedAt = useRef(0);

  if (items.length === 0) return null;

  const dismiss = () => {
    closedAt.current = Date.now();
    setAnchor(null);
  };

  return (
    <>
      <button
        ref={trigger}
        aria-label={label}
        aria-expanded={anchor !== null}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          if (anchor || Date.now() - closedAt.current < 250) return;
          const box = event.currentTarget.getBoundingClientRect();
          setAnchor({ x: box.right - MENU_WIDTH, y: box.bottom + 4 });
        }}
        className="flex size-9 items-center justify-center rounded-full text-lg text-label-2 transition hover:bg-white/10 hover:text-white"
      >
        <MoreIcon />
      </button>
      {anchor && (
        <Popover x={anchor.x} y={anchor.y} label={label} onClose={dismiss} width="w-56" anchor={trigger.current} closeOnBlur={false}>
          <div className="p-1">
            {items.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setAnchor(null);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-white/10 ${item.danger ? "text-danger" : ""}`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}
