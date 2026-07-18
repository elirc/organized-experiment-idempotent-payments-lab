/**
 * This file turns request payloads into stable hashes so idempotency keys can detect payload misuse.
 * What calls it: src/services/paymentService.ts.
 * What it calls: Node crypto hashing.
 * One thing a junior engineer would likely get wrong when writing something similar: hash the raw JSON string without normalizing object key order, producing false mismatches.
 */
import { createHash } from "node:crypto";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

export function buildRequestFingerprint(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
