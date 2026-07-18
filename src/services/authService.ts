/**
 * This file owns the login/logout workflow and is the only place allowed to issue or revoke sessions.
 * What calls it: src/app/api/auth/login/route.ts and src/app/api/auth/logout/route.ts.
 * What it calls: user/session repositories and password hashing helpers.
 * One thing a junior engineer would likely get wrong when writing something similar: let route handlers manipulate session rows directly and duplicate auth behavior in multiple places.
 */
import { randomBytes } from "node:crypto";

import { RouteError } from "../lib/errors";
import { sessionExpiryDate } from "../lib/auth/cookies";
import { verifyPassword } from "../lib/auth/password";
import { createSession, deleteSessionByToken } from "../repositories/sessionRepository";
import { findUserByEmail } from "../repositories/userRepository";

export async function login(input: { email: string; password: string }) {
  const user = await findUserByEmail(input.email);

  if (!user) {
    throw new RouteError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw new RouteError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  const token = randomBytes(24).toString("hex");

  return createSession({
    token,
    userId: user.id,
    expiresAt: sessionExpiryDate(),
  });
}

export async function logout(token: string) {
  await deleteSessionByToken(token);
}
