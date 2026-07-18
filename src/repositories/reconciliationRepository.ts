/**
 * This file stores reconciliation runs and the issues they discover.
 * What calls it: src/services/reconciliationService.ts.
 * What it calls: Prisma via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong when writing something similar: overwrite the latest reconciliation report instead of keeping historical runs.
 */
import { Prisma, ReconciliationRunStatus } from "@prisma/client";

import { prisma, type DatabaseClient } from "../lib/db";

export function createReconciliationRun(
  input: {
    startedByUserId?: string;
  },
  db: DatabaseClient = prisma,
) {
  return db.reconciliationRun.create({
    data: {
      status: ReconciliationRunStatus.RUNNING,
      startedByUserId: input.startedByUserId,
    },
  });
}

export function completeReconciliationRun(
  input: {
    runId: string;
    summary: Prisma.InputJsonValue;
  },
  db: DatabaseClient = prisma,
) {
  return db.reconciliationRun.update({
    where: { id: input.runId },
    data: {
      status: ReconciliationRunStatus.COMPLETED,
      summary: input.summary,
      completedAt: new Date(),
      errorMessage: null,
    },
  });
}

export function failReconciliationRun(runId: string, errorMessage: string, db: DatabaseClient = prisma) {
  return db.reconciliationRun.update({
    where: { id: runId },
    data: {
      status: ReconciliationRunStatus.FAILED,
      completedAt: new Date(),
      errorMessage,
    },
  });
}

export function createReconciliationIssues(
  issues: Prisma.ReconciliationIssueCreateManyInput[],
  db: DatabaseClient = prisma,
) {
  if (issues.length === 0) {
    return Promise.resolve({ count: 0 });
  }

  return db.reconciliationIssue.createMany({
    data: issues,
  });
}

export function listLatestReconciliationIssues(db: DatabaseClient = prisma) {
  return db.reconciliationIssue.findMany({
    include: {
      payment: {
        include: {
          owner: true,
          providerPayment: true,
        },
      },
      run: true,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
  });
}
