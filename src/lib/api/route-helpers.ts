/**
 * This file centralizes API responses and typed route errors.
 * What calls it: route handlers in src/app/api/** and auth guards in src/lib/auth/guards.ts.
 * What it calls: NextResponse from next/server.
 * One thing a junior engineer would likely get wrong when writing something similar: scatter raw JSON/error handling in every route until response shapes drift across the API.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { RouteError } from "../errors";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof RouteError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  console.error(error);

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something unexpected happened.",
      },
    },
    { status: 500 },
  );
}

export async function parseJson<T>(request: Request, parser: (input: unknown) => T) {
  const payload = (await request.json()) as unknown;
  return parser(payload);
}
