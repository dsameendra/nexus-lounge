import { z } from "zod";
import { ADMIN_SECRET_MIN, parseAdminIds } from "@nexus/shared/admin-token";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  AUTH_SECRET: z.string().min(16),
  LIVEKIT_URL: z.string().min(1),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  ADMIN_SECRET: z.string().optional(),
  ADMIN_DISCORD_IDS: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  console.error(`Invalid or missing environment variables: ${missing}. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}

export const config = parsed.data;

if (config.ADMIN_SECRET && (config.ADMIN_SECRET.length < ADMIN_SECRET_MIN || config.ADMIN_SECRET === config.AUTH_SECRET)) {
  console.error(`ADMIN_SECRET must be at least ${ADMIN_SECRET_MIN} characters and different from AUTH_SECRET.`);
  process.exit(1);
}

export const adminIds = parseAdminIds(config.ADMIN_DISCORD_IDS);
export const adminEnabled = Boolean(config.ADMIN_SECRET) && adminIds.size > 0;
