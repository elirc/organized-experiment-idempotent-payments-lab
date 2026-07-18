import { NextResponse } from "next/server";

import { clearSessionCookie } from "../../../../lib/auth/session";
import { SESSION_COOKIE_NAME } from "../../../../lib/auth/cookies";
import { logout } from "../../../../services/authService";

export async function POST(request: Request) {
  const token = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];

  if (token) {
    await logout(token);
  }

  const response = NextResponse.redirect(new URL("/login", request.url));
  clearSessionCookie(response);
  return response;
}
