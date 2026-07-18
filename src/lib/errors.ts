/**
 * This file defines framework-agnostic application errors that can be shared by routes, services, and tests.
 * What calls it: route helpers, auth/policy utilities, and domain services throughout src/**.
 * What it calls: nothing.
 * One thing a junior engineer would likely get wrong when writing something similar: bake HTTP framework types into the error class and make pure business logic hard to test.
 */
export class RouteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
