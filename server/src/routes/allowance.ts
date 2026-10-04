import { Router } from 'express';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { allowanceInput, isoDate, weekOfYear, type AllowanceSummary } from '@budget/shared';
import { db } from '../db/index.js';
import { allowance, transaction, user } from '../db/schema.js';
import { HttpError, parseBody } from '../lib/http.js';
import { readScope, requireWriter } from '../middleware/auth.js';
import { selectTransactions } from './transactions.js';

export const allowanceRouter = Router();

function parseIds(json: string): number[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

/**
 * Allowance resets every Jan 1: earned = weekly amount x week of the year (Jan 1-7 = week 1),
 * spent = this year's spending in the chosen categories up to the "as of" day.
 */
allowanceRouter.get('/', (req, res) => {
  // The client sends its own local date so week boundaries follow the user's timezone.
  const todayRaw = typeof req.query.today === 'string' ? req.query.today : new Date().toISOString().slice(0, 10);
  const today = parseBody(isoDate, todayRaw);
  const year = Number(req.query.year ?? today.slice(0, 4));
  if (!Number.isInteger(year) || year < 1900 || year > 3000) throw new HttpError(400, 'Invalid year');

  const currentYear = Number(today.slice(0, 4));
  const asOf = year < currentYear ? `${year}-12-31` : year === currentYear ? today : null;
  const weeksElapsed = asOf ? weekOfYear(asOf) : 0;

  const scope = readScope(req);
  const users = db
    .select({ id: user.id, username: user.username, weeklyCents: allowance.weeklyCents, categoryIds: allowance.categoryIds })
    .from(user)
    .leftJoin(allowance, eq(allowance.userId, user.id))
    .where(scope ? eq(user.id, scope) : eq(user.role, 'user'))
    .orderBy(user.username)
    .all();

  const summaries: AllowanceSummary[] = users.map((u) => {
    const weeklyCents = u.weeklyCents ?? 0;
    const categoryIds = parseIds(u.categoryIds ?? '[]');
    const transactions =
      asOf && categoryIds.length > 0
        ? selectTransactions(
            and(
              eq(transaction.userId, u.id),
              inArray(transaction.categoryId, categoryIds),
              gte(transaction.date, `${year}-01-01`),
              lte(transaction.date, asOf),
            ),
          )
        : [];
    const earnedCents = weeklyCents * weeksElapsed;
    const spentCents = transactions.reduce((s, t) => s + t.amountCents, 0);
    return {
      userId: u.id,
      username: u.username ?? '',
      year,
      weeklyCents,
      categoryIds,
      weeksElapsed,
      earnedCents,
      spentCents,
      remainingCents: earnedCents - spentCents,
      transactions,
    };
  });
  res.json(summaries);
});

allowanceRouter.put('/', requireWriter, (req, res) => {
  const { weeklyCents, categoryIds } = parseBody(allowanceInput, req.body);
  const ids = JSON.stringify([...new Set(categoryIds)]);
  db.insert(allowance)
    .values({ userId: req.user!.id, weeklyCents, categoryIds: ids })
    .onConflictDoUpdate({ target: allowance.userId, set: { weeklyCents, categoryIds: ids } })
    .run();
  res.json({ ok: true });
});
