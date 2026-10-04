import { Router } from 'express';
import { and, asc, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { incomeInput, monthRange } from '@budget/shared';
import { db } from '../db/index.js';
import { income, moneyAccount, user } from '../db/schema.js';
import { HttpError, idParam, monthParam, parseBody } from '../lib/http.js';
import { readScope, requireWriter } from '../middleware/auth.js';

export const incomeRouter = Router();

incomeRouter.get('/', (req, res) => {
  const { start, end } = monthRange(monthParam(req));
  const scope = readScope(req);
  const where: SQL[] = [gte(income.date, start), lt(income.date, end)];
  if (scope) where.push(eq(income.userId, scope));

  const rows = db
    .select({
      id: income.id,
      userId: income.userId,
      username: user.username,
      date: income.date,
      source: income.source,
      amountCents: income.amountCents,
      accountId: income.accountId,
      accountName: moneyAccount.name,
    })
    .from(income)
    .innerJoin(user, eq(user.id, income.userId))
    .leftJoin(moneyAccount, eq(moneyAccount.id, income.accountId))
    .where(and(...where))
    .orderBy(desc(income.date), asc(income.id))
    .all();
  res.json(rows);
});

incomeRouter.post('/', requireWriter, (req, res) => {
  const input = parseBody(incomeInput, req.body);
  const row = db
    .insert(income)
    .values({ ...input, userId: req.user!.id })
    .returning({ id: income.id })
    .get();
  res.status(201).json(row);
});

incomeRouter.put('/:id', requireWriter, (req, res) => {
  const input = parseBody(incomeInput, req.body);
  const result = db
    .update(income)
    .set(input)
    .where(and(eq(income.id, idParam(req)), eq(income.userId, req.user!.id)))
    .run();
  if (result.changes === 0) throw new HttpError(404, 'Income entry not found');
  res.json({ ok: true });
});

incomeRouter.delete('/:id', requireWriter, (req, res) => {
  const result = db
    .delete(income)
    .where(and(eq(income.id, idParam(req)), eq(income.userId, req.user!.id)))
    .run();
  if (result.changes === 0) throw new HttpError(404, 'Income entry not found');
  res.status(204).end();
});
