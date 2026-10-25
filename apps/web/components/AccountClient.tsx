"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAction } from "@/app/account/actions";
import { AVATARS, avatarPath } from "@/lib/avatars";
import { canRememberFiles, forgetFiles } from "@/lib/local-files";
import { Avatar } from "./Avatar";
import { CheckIcon } from "./Icons";
import { LegalLinks } from "./LegalLinks";

export function AccountClient({ name: initialName, image: initialImage, guest, id }: { name: string; image: string | null; guest: boolean; id: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<string | null>(initialImage && initialImage.startsWith("/avatars/") ? initialImage : null);
  const [saved, setSaved] = useState({ name: initialName, avatar: initialImage && initialImage.startsWith("/avatars/") ? initialImage : null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [canForget, setCanForget] = useState(false);
  const [forgotten, setForgotten] = useState(false);
  useEffect(() => setCanForget(canRememberFiles()), []);

  const trimmed = name.trim();
  const dirty = trimmed !== saved.name || avatar !== saved.avatar;
  const valid = trimmed.length >= 2 && trimmed.length <= 24;
  const preview = avatar ?? (initialImage && !initialImage.startsWith("/avatars/") ? initialImage : null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || !valid) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed, avatar }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
      return setMessage({ kind: "error", text: body?.error ?? "Couldn't save your changes. Try again." });
    }
    setSaved({ name: trimmed, avatar });
    setName(trimmed);
    setMessage({ kind: "ok", text: "Saved. Your new name and avatar show up the next time you join a room." });
    router.refresh();
  }

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    const response = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (response?.ok) {
      window.location.href = "/login?deleted=1";
      return;
    }
    const body = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
    setDeleteError(
      body?.error === "in_room"
        ? "You're still in a room, maybe in another tab or on another device. Leave it first, then try again."
        : (body?.error ?? "Couldn't delete your account. Try again."),
    );
    setDeleting(false);
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-5 py-8">
      <Link href="/" className="text-sm text-label-2 transition hover:text-white">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-label-2">{guest ? "You're signed in as a guest." : "You're signed in with Discord."}</p>
      {!guest && (
        <p className="mt-1 text-xs text-label-3">
          Your ID <span className="font-mono select-all text-label-2">{id}</span>
        </p>
      )}

      <form onSubmit={save} className="mt-6 space-y-5 rounded-[var(--radius-sheet)] bg-panel p-5">
        <div className="flex items-center gap-4">
          <Avatar name={trimmed || initialName} image={preview} className="size-16" />
          <div className="min-w-0 flex-1">
            <label htmlFor="display-name" className="mb-1.5 block text-xs font-semibold tracking-wide text-label-2 uppercase">
              Display name
            </label>
            <input
              id="display-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={24}
              autoComplete="nickname"
              className="h-11 w-full rounded-xl bg-panel-2 px-4 text-base outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold tracking-wide text-label-2 uppercase">Avatar</legend>
          <div className="grid grid-cols-6 gap-2.5">
            {!guest && (
              <button
                type="button"
                onClick={() => setAvatar(null)}
                aria-pressed={avatar === null}
                title="Use my Discord picture"
                className={`flex aspect-square items-center justify-center rounded-full bg-panel-2 text-[11px] leading-tight font-semibold text-label-2 transition hover:bg-panel-3 ${avatar === null ? "ring-2 ring-accent" : ""}`}
              >
                Discord
              </button>
            )}
            {AVATARS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setAvatar(avatarPath(id))}
                aria-pressed={avatar === avatarPath(id)}
                aria-label={`Avatar ${id}`}
                className={`relative aspect-square overflow-hidden rounded-full transition active:scale-95 ${avatar === avatarPath(id) ? "ring-2 ring-accent ring-offset-2 ring-offset-[var(--color-panel)]" : "hover:brightness-110"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarPath(id)} alt="" className="size-full" />
                {avatar === avatarPath(id) && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                    <CheckIcon />
                  </span>
                )}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            disabled={!dirty || !valid || busy}
            className="h-11 rounded-xl bg-accent px-6 font-semibold transition hover:brightness-110 active:scale-95 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          {!valid && <span className="text-sm text-warn">Names are 2 to 24 characters.</span>}
        </div>
        {message && (
          <p role="status" className={`text-sm ${message.kind === "ok" ? "text-live" : "text-danger"}`}>
            {message.text}
          </p>
        )}
      </form>

      <form action={signOutAction} className="mt-4">
        <button className="h-11 w-full rounded-xl bg-panel font-semibold transition hover:bg-panel-2 active:scale-[0.99]">Sign out</button>
      </form>

      {canForget && (
        <section className="mt-8 rounded-[var(--radius-sheet)] bg-panel p-5">
          <h2 className="font-semibold">Remembered video files</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-label-2">
            This browser remembers which video files you picked so they can reopen after a refresh. Only a reference is kept, in this browser, and the files stay where they are.
          </p>
          <button
            onClick={() => void forgetFiles().then(() => setForgotten(true))}
            className="mt-4 h-11 rounded-xl bg-panel-2 px-5 font-semibold transition hover:bg-panel-3 active:scale-95"
          >
            {forgotten ? "Forgotten" : "Forget remembered files"}
          </button>
        </section>
      )}

      <section className="mt-8 rounded-[var(--radius-sheet)] border border-danger/40 p-5">
        <h2 className="font-semibold text-danger">Delete account</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-label-2">
          This signs you out and removes your profile and your membership records from rooms. You can&apos;t be in a room while you do this.
          {!guest && " Your Discord account itself isn't touched."}
        </p>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="mt-4 h-11 rounded-xl bg-danger/15 px-5 font-semibold text-danger transition hover:bg-danger/25 active:scale-95"
          >
            Delete my account…
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <label htmlFor="confirm-delete" className="block text-sm text-label-2">
              Type <span className="font-mono text-white">DELETE</span> to confirm.
            </label>
            <input
              id="confirm-delete"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              className="h-11 w-full rounded-xl bg-panel-2 px-4 font-mono outline-none focus:ring-2 focus:ring-danger"
            />
            <div className="flex gap-2">
              <button
                onClick={remove}
                disabled={confirmText !== "DELETE" || deleting}
                className="h-11 rounded-xl bg-danger px-5 font-semibold transition hover:brightness-110 active:scale-95 disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                  setDeleteError(null);
                }}
                className="h-11 rounded-xl bg-panel px-5 font-semibold transition hover:bg-panel-2 active:scale-95"
              >
                Cancel
              </button>
            </div>
            {deleteError && (
              <p role="alert" className="text-sm text-danger">
                {deleteError}
              </p>
            )}
          </div>
        )}
      </section>

      <LegalLinks className="mt-10 pb-6" />
    </main>
  );
}
