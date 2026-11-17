"use client";

import { signOutAction } from "@/app/account/actions";
import { clearRecent } from "@/lib/recent-rooms";

// Signing out also forgets this browser's recent rooms.
export function SignOutButton({ className, formClassName }: { className: string; formClassName?: string }) {
  return (
    <form action={signOutAction} onSubmit={() => clearRecent()} className={formClassName}>
      <button className={className}>Sign out</button>
    </form>
  );
}
