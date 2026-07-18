/**
 * This file contains all user lookups used by auth and ownership-aware services.
 * What calls it: src/services/authService.ts and src/services/paymentService.ts.
 * What it calls: Prisma via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: let services query the user table directly until auth assumptions start leaking across the codebase.
 */
import { prisma, type DatabaseClient } from "../lib/db";

export function findUserByEmail(email: string, db: DatabaseClient = prisma) {
  return db.user.findUnique({
    where: { email },
  });
}

export function findUserById(id: string, db: DatabaseClient = prisma) {
  return db.user.findUnique({
    where: { id },
  });
}

export function listUsers(db: DatabaseClient = prisma) {
  return db.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });
}
