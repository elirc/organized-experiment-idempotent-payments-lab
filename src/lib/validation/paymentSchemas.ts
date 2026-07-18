/**
 * This file defines the payment API's validation boundary so malformed requests never reach business logic.
 * What calls it: src/app/api/payments/route.ts, src/app/api/payments/[paymentId]/refund/route.ts, and tests in tests/validation/paymentSchemas.test.ts.
 * What it calls: Zod.
 * One thing a junior engineer would likely get wrong when writing something similar: validate field types but forget cross-field rules like refund amounts needing to stay positive.
 */
import { z } from "zod";

export const paymentSimulationModeSchema = z.enum([
  "SUCCEED",
  "FAIL",
  "PARTIAL_SUCCESS",
  "NETWORK_UNKNOWN",
]);

export const createPaymentSchema = z.object({
  amountMinor: z.number().int().positive().max(1_000_000),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  ownerUserId: z.string().cuid().optional(),
  description: z.string().trim().min(3).max(120),
  simulationMode: paymentSimulationModeSchema.default("SUCCEED"),
});

export const refundPaymentSchema = z
  .object({
    amountMinor: z.number().int().positive().max(1_000_000),
    reason: z.string().trim().min(5).max(200),
  })
  .superRefine((input, ctx) => {
    if (input.reason.toLowerCase() === "test") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Refund reason must be specific enough for audit review.",
      });
    }
  });
