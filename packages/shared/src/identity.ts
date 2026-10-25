import { DISCORD_ID } from "./admin-token.ts";

// Auth.js gives OAuth users a random UUID when there is no database. Discord users get their stable Discord ID instead.
export function stableSubject(current: string | undefined, account: { provider?: string; providerAccountId?: string } | null | undefined) {
  if (account?.provider === "discord" && account.providerAccountId && DISCORD_ID.test(account.providerAccountId)) return account.providerAccountId;
  return current;
}
