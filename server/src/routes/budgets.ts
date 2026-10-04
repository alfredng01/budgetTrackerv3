import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { budgetInput, type BudgetRow } from '@budget/shared';
import { db } from '../db/index.js';
import { budget } from '../db/schema.js';
import { HttpError, parseBody } from '../lib/http.js';
import { readScope, requireWriter } from '../middleware/auth.js';
import { getLookups } from '../services/lookups.js';

export const budgetsRouter = Router();

/** Limit per category for one user, or summed across all users for the admin overview. */
export function budgetLimits(scope: string | null): Map<number, number> {
  const rows = db
    .select({ categoryId: budget.categoryId, limitCents: sql<number>`sum(${budget.limitCents})` })
    .from(budget)
    .where(scope ? eq(budget.userId, scope) : undefined)
    .groupBy(budget.categoryId)
    .all();
  return new Map(rows.map((r) => [r.categoryId, r.limitCents]));
}

budgetsRouter.get('/', (req, res) => {
  const limits = budgetLimits(readScope(req));
  const rows: BudgetRow[] = getLookups().categories.map((c) => ({
    categoryId: c.id,
    categoryName: c.name,
    limitCents: limits.get(c.id) ?? null,
  }));
  res.json(rows);
});

budgetsRouter.put('/:categoryId', requireWriter, (req, res) => {
  const categoryId = Number(req.params.categoryId);
  if (!getLookups().categories.some((c) => c.id === categoryId)) throw new HttpError(404, 'Unknown category');
  const { limitCents } = parseBody(budgetInput, req.body);
  const userId = req.user!.id;

  if (!limitCents) {
    db.delete(budget).where(and(eq(budget.userId, userId), eq(budget.categoryId, categoryId))).run();
  } else {
    db.insert(budget)
      .values({ userId, categoryId, limitCents })
      .onConflictDoUpdate({ target: [budget.userId, budget.categoryId], set: { limitCents } })
      .run();
  }
  res.json({ ok: true });
});
