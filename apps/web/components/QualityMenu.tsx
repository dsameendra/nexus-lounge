"use client";

import { useState } from "react";
import type { QualityOption } from "@/lib/players/types";
import { CheckIcon, GearIcon } from "./Icons";
import { Popover } from "./Popover";

export function QualityMenu({
  options,
  value,
  note,
  link,
  onSelect,
}: {
  options: QualityOption[];
  value: string;
  note?: string;
  link?: { href: string; label: string };
  onSelect: (id: string) => void;
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  if (options.length === 0 && !note) return null;
  const current = options.find((option) => option.id === value)?.label ?? "Auto";

  return (
    <>
      <button
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { x: box.right - 224, y: box.top - 8 });
        }}
        aria-label="Video quality"
        aria-expanded={Boolean(anchor)}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm text-label-2 transition hover:bg-white/10 hover:text-white active:scale-95"
      >
        <span className="text-xl">
          <GearIcon />
        </span>
        <span className="hidden max-w-24 truncate sm:inline">{options.length > 0 ? current : "Auto"}</span>
      </button>
      {anchor && (
        <Popover x={anchor.x} y={anchor.y} placement="above" width="w-56" label="Video quality" onClose={() => setAnchor(null)}>
          <QualityPanel options={options} value={value} note={note} link={link} onSelect={(id) => { onSelect(id); setAnchor(null); }} />
        </Popover>
      )}
    </>
  );
}

export function QualityPanel({
  options,
  value,
  note,
  link,
  onSelect,
}: {
  options: QualityOption[];
  value: string;
  note?: string;
  link?: { href: string; label: string };
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <p className="border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wide text-label-2 uppercase">Quality</p>
      {options.length > 0 ? (
        <ul className="scroll-thin max-h-64 overflow-y-auto py-1">
          {options.map((option) => (
            <li key={option.id}>
              <button
                role="menuitemradio"
                aria-checked={option.id === value}
                onClick={() => onSelect(option.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-white/10"
              >
                {option.label}
                {option.id === value && <CheckIcon className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-3 py-3 text-sm">
          <p className="flex items-center justify-between">
            Auto <CheckIcon className="text-accent" />
          </p>
          <p className="mt-2 text-xs leading-relaxed text-label-2">{note}</p>
          {link && (
            <a href={link.href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent hover:underline">
              {link.label}
            </a>
          )}
        </div>
      )}
    </>
  );
}
