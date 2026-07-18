import { env } from "../env";

export const SESSION_COOKIE_NAME = env.SESSION_COOKIE_NAME;

export function sessionExpiryDate() {
  return new Date(Date.now() + env.SESSION_DURATION_HOURS * 60 * 60 * 1000);
}
