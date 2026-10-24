import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  AUTH_SECRET: z.string().min(16),
  LIVEKIT_URL: z.string().min(1),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  console.error(`Invalid or missing environment variables: ${missing}. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}

export const config = parsed.data;
