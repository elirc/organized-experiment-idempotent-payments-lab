/**
 * This file resolves cookie-backed sessions into authenticated user context for routes and pages.
 * What calls it: src/lib/auth/guards.ts and server components under src/app/admin/**.
 * What it calls: Next.js cookies helpers, src/lib/auth/cookies.ts, and src/repositories/sessionRepository.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: trust the cookie value directly instead of loading a server-side session record.
 */
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import type { AppUserRole } from "../domain/paymentTypes";
import { SESSION_COOKIE_NAME, sessionExpiryDate } from "./cookies";
import { findSessionByToken } from "../../repositories/sessionRepository";

export type AuthenticatedSession = {
  sessionId: string;
  token: string;
  userId: string;
  email: string;
  name: string;
  role: AppUserRole;
};

export async function getSessionForRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await findSessionByToken(token);

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return {
    sessionId: session.id,
    token: session.token,
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  } satisfies AuthenticatedSession;
}

export async function getSessionForPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await findSessionByToken(token);

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return {
    sessionId: session.id,
    token: session.token,
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  } satisfies AuthenticatedSession;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: sessionExpiryDate(),
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}
