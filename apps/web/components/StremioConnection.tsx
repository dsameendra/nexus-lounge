"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SERVER, normalizeServerUrl, statusMessage, useStremio } from "@/lib/stremio";
import { CheckIcon } from "./Icons";

// Whether this browser can reach the Stremio app on this computer, with the address it should use.
export function StremioConnection({ className = "" }: { className?: string }) {
  const { base, status, check, setBase } = useStremio();
  const [address, setAddress] = useState(base);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (status === "unknown") void check();
  }, [status, check]);
  useEffect(() => setAddress(base), [base]);

  const connected = status === "connected";
  const checking = status === "checking" || status === "unknown";

  return (
    <div className={`rounded-xl bg-panel-2 px-4 py-3 text-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p role="status" className="flex min-w-0 flex-1 basis-48 items-center gap-2">
          {checking ? (
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-label-3" />
          ) : connected ? (
            <CheckIcon className="shrink-0 text-live" />
          ) : (
            <span className="size-2 shrink-0 rounded-full bg-warn" />
          )}
          <span className={connected ? "text-label" : "text-label-2"}>{connected ? "Stremio is connected" : checking ? "Looking for Stremio…" : "Stremio isn't connected"}</span>
        </p>
        {!connected && !checking && (
          <button type="button" onClick={() => void check()} className="h-9 shrink-0 rounded-full bg-white/10 px-4 text-sm font-medium transition hover:bg-white/15 active:scale-95">
            Try Stremio again
          </button>
        )}
      </div>
      {!connected && !checking && <p className="mt-2 leading-snug text-label-2">{statusMessage[status]}</p>}
      <details className="group mt-2">
        <summary className="cursor-pointer text-label-2 transition select-none hover:text-white">Stremio address</summary>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const ok = setBase(address);
            setInvalid(!ok);
            if (ok) void check();
          }}
        >
          <input
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setInvalid(false);
            }}
            aria-label="Stremio address"
            aria-invalid={invalid}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={DEFAULT_SERVER}
            className="h-10 min-w-0 flex-1 basis-48 rounded-lg bg-panel px-3 text-base outline-none focus:ring-2 focus:ring-accent"
          />
          <button className="h-10 shrink-0 rounded-lg bg-white/10 px-4 font-medium transition hover:bg-white/15 active:scale-95">Save</button>
          {address !== DEFAULT_SERVER && (
            <button
              type="button"
              onClick={() => {
                setBase(DEFAULT_SERVER);
                setInvalid(false);
                void check();
              }}
              className="h-10 shrink-0 rounded-lg px-3 text-label-2 transition hover:text-white"
            >
              Reset
            </button>
          )}
          {invalid && (
            <p role="alert" className="basis-full text-danger">
              Enter an address like {DEFAULT_SERVER}.
            </p>
          )}
          <p className="basis-full leading-snug text-label-3">Only needed if your Stremio runs on another computer or port. It is kept in this browser.</p>
        </form>
      </details>
    </div>
  );
}
