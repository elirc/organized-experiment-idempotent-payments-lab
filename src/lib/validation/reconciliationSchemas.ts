/**
 * This file validates operational payloads for reconciliation and webhook delivery endpoints.
 * What calls it: admin API routes under src/app/api/admin/**.
 * What it calls: Zod.
 * One thing a junior engineer would likely get wrong when writing something similar: leave admin actions unvalidated because “only staff will call them.”
 */
import { z } from "zod";

export const webhookDeliverySchema = z.object({
  limit: z.number().int().positive().max(50).default(10),
});

export const reconciliationRunSchema = z.object({
  includeResolved: z.boolean().default(false),
});
