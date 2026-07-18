/**
 * This file validates auth payloads before they reach the auth service.
 * What calls it: src/app/api/auth/login/route.ts and tests in tests/validation/authSchemas.test.ts.
 * What it calls: Zod.
 * One thing a junior engineer would likely get wrong when writing something similar: let empty strings through and then debug weird auth failures much later in the call stack.
 */
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
