"use client";

import { useState } from "react";
import { languageCode } from "@nexus/shared";
import { onlineSubtitles, searchTitles, type SubtitleOption, type TitleResult } from "@/lib/subtitles";
import { SearchIcon } from "./Icons";
import { Sheet } from "./Sheet";

// Find subtitles online by title (Stremio's catalogue and its OpenSubtitles add-on). Choosing one shows it for this viewer only.
export function SubtitleSearchSheet({ onPick, onClose }: { onPick: (option: SubtitleOption) => Promise<void>; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TitleResult[] | null>(null);
  const [title, setTitle] = useState<TitleResult | null>(null);
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");
  const [options, setOptions] = useState<SubtitleOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (busy || !query.trim()) return;
    setBusy("Searching…");
    setError(null);
    setTitle(null);
    setOptions(null);
    try {
      const found = await searchTitles(query);
      setResults(found);
      if (found.length === 0) setError("Nothing found. Try the title as it appears on IMDb.");
    } catch {
      setError("The title search didn't answer. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function list(chosen: TitleResult) {
    const s = Number(season);
    const e = Number(episode);
    if (chosen.type === "series" && (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e < 1)) return setError("Enter the season and episode numbers.");
    setBusy("Finding subtitles…");
    setError(null);
    try {
      const found = await onlineSubtitles(chosen, chosen.type === "series" ? { season: s, episode: e } : null);
      const mine = languageCode(navigator.language);
      setOptions([...found].sort((a, b) => Number(b.lang === mine) - Number(a.lang === mine) || (a.label < b.label ? -1 : 1)));
      if (found.length === 0) setError("No subtitles for that title yet.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Couldn't get subtitles.");
    } finally {
      setBusy(null);
    }
  }

  async function choose(option: SubtitleOption) {
    if (busy) return;
    setBusy("Loading the subtitles…");
    setError(null);
    try {
      await onPick(option);
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Couldn't load these subtitles.");
      setBusy(null);
    }
  }

  const row = "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-white/10 disabled:opacity-50";

  return (
    <Sheet title="Find subtitles" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
        className="space-y-3"
      >
        <label className="flex items-center gap-3 rounded-xl bg-panel-2 px-4 py-3 focus-within:ring-2 focus-within:ring-accent">
          <SearchIcon className="shrink-0 text-lg text-label-2" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Movie or series title"
            aria-label="Movie or series title"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-label-3"
          />
        </label>
        <p className="text-xs leading-relaxed text-label-3">Only what you type here and the title you pick are sent to Stremio and OpenSubtitles, from your browser. Nothing goes to the room.</p>
        <div className="min-h-5 text-sm" aria-live="polite">
          {busy && <p className="text-label-2">{busy}</p>}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
        </div>
        {!title && results && results.length > 0 && (
          <ul className="scroll-thin max-h-64 space-y-0.5 overflow-y-auto">
            {results.map((item) => (
              <li key={`${item.type}:${item.id}`}>
                <button
                  type="button"
                  disabled={busy !== null}
                  className={row}
                  onClick={() => {
                    setTitle(item);
                    if (item.type === "movie") void list(item);
                  }}
                >
                  <span className="truncate">
                    {item.name}
                    {item.year ? ` (${item.year})` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-label-2">{item.type === "series" ? "Series" : "Movie"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {title && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold">{title.name}</p>
              <button
                type="button"
                onClick={() => {
                  setTitle(null);
                  setOptions(null);
                  setError(null);
                }}
                className="shrink-0 text-sm text-accent hover:underline"
              >
                Change
              </button>
            </div>
            {title.type === "series" && !options && (
              <div className="flex items-end gap-3">
                {[
                  { label: "Season", value: season, set: setSeason },
                  { label: "Episode", value: episode, set: setEpisode },
                ].map((field) => (
                  <label key={field.label} className="block flex-1 text-xs text-label-2">
                    {field.label}
                    <input
                      value={field.value}
                      onChange={(event) => field.set(event.target.value.replace(/\D/g, "").slice(0, 3))}
                      inputMode="numeric"
                      className="mt-1 h-11 w-full rounded-xl bg-panel-2 px-3 text-base text-white outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                ))}
                <button type="button" disabled={busy !== null} onClick={() => void list(title)} className="h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-semibold transition hover:brightness-110 active:scale-95 disabled:opacity-50">
                  Find
                </button>
              </div>
            )}
            {options && options.length > 0 && (
              <ul className="scroll-thin max-h-64 space-y-0.5 overflow-y-auto" aria-label="Available subtitles">
                {options.map((option) => (
                  <li key={option.id}>
                    <button type="button" disabled={busy !== null} className={row} onClick={() => void choose(option)}>
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {!title && (
          <button type="submit" disabled={busy !== null || !query.trim()} className="h-12 w-full rounded-xl bg-accent px-4 font-semibold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40">
            Search
          </button>
        )}
      </form>
    </Sheet>
  );
}
