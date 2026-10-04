import { Router } from 'express';
import { and, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import { monthRange, type DashboardSummary, type MonthTotals, type YearSummary } from '@budget/shared';
import { db } from '../db/index.js';
import { category, income, transaction } from '../db/schema.js';
import { HttpError, monthParam } from '../lib/http.js';
import { readScope } from '../middleware/auth.js';
import { getLookups } from '../services/lookups.js';
import { budgetLimits } from './budgets.js';

export const dashboardRouter = Router();

function rangeFilter(table: typeof transaction | typeof income, start: string, end: string, scope: string | null) {
  const where: SQL[] = [gte(table.date, start), lt(table.date, end)];
  if (scope) where.push(eq(table.userId, scope));
  return and(...where);
}

dashboardRouter.get('/', (req, res) => {
  const month = monthParam(req);
  const { start, end } = monthRange(month);
  const scope = readScope(req);

  // One aggregate per table; both are index range scans on (user_id, date) or (date).
  const byCategory = db
    .select({
      categoryId: transaction.categoryId,
      categoryName: category.name,
      totalCents: sql<number>`sum(${transaction.amountCents})`,
    })
    .from(transaction)
    .innerJoin(category, eq(category.id, transaction.categoryId))
    .where(rangeFilter(transaction, start, end, scope))
    .groupBy(transaction.categoryId)
    .orderBy(sql`3 desc`)
    .all();

  const incomeRow = db
    .select({ total: sql<number>`coalesce(sum(${income.amountCents}), 0)` })
    .from(income)
    .where(rangeFilter(income, start, end, scope))
    .get();

  const spentCents = byCategory.reduce((s, c) => s + c.totalCents, 0);
  const incomeCents = incomeRow?.total ?? 0;

  const spentByCat = new Map(byCategory.map((c) => [c.categoryId, c]));
  const limits = budgetLimits(scope);
  const budgets = getLookups()
    .categories.filter((c) => limits.has(c.id))
    .map((c) => {
      const limitCents = limits.get(c.id)!;
      const spent = spentByCat.get(c.id)?.totalCents ?? 0;
      return { categoryId: c.id, categoryName: c.name, limitCents, spentCents: spent, overCents: spent - limitCents };
    });

  const summary: DashboardSummary = {
    month,
    spentCents,
    incomeCents,
    netCents: incomeCents - spentCents,
    byCategory,
    budgets,
  };
  res.json(summary);
});

/** Monthly spent/income totals for a whole year (history view). */
dashboardRouter.get('/year', (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 1900 || year > 3000) throw new HttpError(400, 'Invalid year');
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const scope = readScope(req);

  const monthExpr = (t: typeof transaction | typeof income) => sql<string>`substr(${t.date}, 1, 7)`;
  const spent = db
    .select({ month: monthExpr(transaction), total: sql<number>`sum(${transaction.amountCents})` })
    .from(transaction)
    .where(rangeFilter(transaction, start, end, scope))
    .groupBy(monthExpr(transaction))
    .all();
  const earned = db
    .select({ month: monthExpr(income), total: sql<number>`sum(${income.amountCents})` })
    .from(income)
    .where(rangeFilter(income, start, end, scope))
    .groupBy(monthExpr(income))
    .all();

  const spentMap = new Map(spent.map((r) => [r.month, r.total]));
  const earnedMap = new Map(earned.map((r) => [r.month, r.total]));
  const months: MonthTotals[] = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { month, spentCents: spentMap.get(month) ?? 0, incomeCents: earnedMap.get(month) ?? 0 };
  });
  const summary: YearSummary = { year, months };
  res.json(summary);
});
