import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_COOKIE_NAME: z.string().min(1).default("payment_lab_session"),
  SESSION_DURATION_HOURS: z.coerce.number().int().positive().default(12),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  APP_URL: process.env.APP_URL,
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
  SESSION_DURATION_HOURS: process.env.SESSION_DURATION_HOURS,
});
