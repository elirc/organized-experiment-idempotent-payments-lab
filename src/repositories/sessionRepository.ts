/**
 * This file owns database-backed session persistence.
 * What calls it: src/services/authService.ts and src/lib/auth/session.ts.
 * What it calls: Prisma via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: never expire or revoke sessions in the database, making server-side logout impossible.
 */
import { prisma, type DatabaseClient } from "../lib/db";

export function createSession(
  input: {
    token: string;
    userId: string;
    expiresAt: Date;
  },
  db: DatabaseClient = prisma,
) {
  return db.session.create({
    data: input,
    include: {
      user: true,
    },
  });
}

export function findSessionByToken(token: string, db: DatabaseClient = prisma) {
  return db.session.findUnique({
    where: { token },
    include: {
      user: true,
    },
  });
}

export function deleteSessionByToken(token: string, db: DatabaseClient = prisma) {
  return db.session.deleteMany({
    where: { token },
  });
}
