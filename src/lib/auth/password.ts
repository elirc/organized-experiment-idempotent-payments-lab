/**
 * This file owns password hashing and verification for the demo login flow.
 * What calls it: prisma/seed.ts and src/services/authService.ts.
 * What it calls: Node's crypto.scrypt primitives.
 * One thing a junior engineer would likely get wrong when writing something similar: store plaintext passwords during local prototyping and then forget to replace them.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_COST = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_COST).toString("hex");
  return `${salt}:${derivedKey}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":");

  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, SCRYPT_COST).toString("hex");
  return timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(actualHash, "hex"));
}
