import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __paymentLabPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__paymentLabPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__paymentLabPrisma = prisma;
}

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;
