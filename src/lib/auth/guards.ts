/**
 * This file wraps route handlers and pages with shared auth + RBAC enforcement.
 * What calls it: API routes under src/app/api/** and server pages like src/app/admin/layout.tsx.
 * What it calls: src/lib/auth/session.ts, src/lib/auth/authorization.ts, and RouteError helpers.
 * One thing a junior engineer would likely get wrong when writing something similar: check auth in the page but forget the API route, leaving the real data path exposed.
 */
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { RouteError } from "../api/route-helpers";
import type { AuthenticatedSession } from "./session";
import { Permission, type PermissionValue } from "../permissions";
import { requirePermission } from "./authorization";
import { getSessionForPage, getSessionForRequest } from "./session";

type RouteAuthOptions = {
  permission: PermissionValue;
};

export function withRouteAuth<TParams>(
  options: RouteAuthOptions,
  handler: (args: {
    request: NextRequest;
    params: TParams;
    session: AuthenticatedSession;
  }) => Promise<Response>,
) {
  return async (
    request: NextRequest,
    context: { params?: Promise<TParams> | TParams } = {},
  ) => {
    const session = requirePermission(await getSessionForRequest(request), options.permission);
    const params = context.params ? await context.params : ({} as TParams);
    return handler({ request, params, session });
  };
}

export async function requirePagePermission(permission: PermissionValue) {
  const session = await getSessionForPage();

  if (!session) {
    redirect("/login");
  }

  try {
    return requirePermission(session, permission);
  } catch (error) {
    if (error instanceof RouteError && error.status === 403) {
      redirect("/");
    }

    throw error;
  }
}

export async function requireStaffPaymentsPage() {
  return requirePagePermission(Permission.PAYMENT_READ_ANY);
}
