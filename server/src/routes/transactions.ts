import { Router } from 'express';
import { and, asc, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { monthRange, transactionInput, type Transaction } from '@budget/shared';
import { db } from '../db/index.js';
import { card, category, moneyAccount, transaction, user } from '../db/schema.js';
import { HttpError, idParam, monthParam, parseBody } from '../lib/http.js';
import { readScope, requireWriter } from '../middleware/auth.js';
import { resolveFunding } from '../services/lookups.js';

export const transactionsRouter = Router();

const selectFields = {
  id: transaction.id,
  userId: transaction.userId,
  username: user.username,
  date: transaction.date,
  description: transaction.description,
  note: transaction.note,
  amountCents: transaction.amountCents,
  categoryId: transaction.categoryId,
  categoryName: category.name,
  cardId: transaction.cardId,
  cardName: card.name,
  fundingAccountId: transaction.fundingAccountId,
  fundingAccountName: moneyAccount.name,
  source: transaction.source,
};

/** Shared SELECT for transaction listings (month view, allowance view). */
export function selectTransactions(where: SQL | undefined): Transaction[] {
  return db
    .select(selectFields)
    .from(transaction)
    .innerJoin(user, eq(user.id, transaction.userId))
    .innerJoin(category, eq(category.id, transaction.categoryId))
    .innerJoin(card, eq(card.id, transaction.cardId))
    .leftJoin(moneyAccount, eq(moneyAccount.id, transaction.fundingAccountId))
    .where(where)
    .orderBy(desc(transaction.date), asc(transaction.id))
    .all()
    .map((r) => ({ ...r, username: r.username ?? '' }));
}

transactionsRouter.get('/', (req, res) => {
  const { start, end } = monthRange(monthParam(req));
  const scope = readScope(req);
  const where: SQL[] = [gte(transaction.date, start), lt(transaction.date, end)];
  if (scope) where.push(eq(transaction.userId, scope));

  res.json(selectTransactions(and(...where)));
});

transactionsRouter.post('/', requireWriter, (req, res) => {
  const input = parseBody(transactionInput, req.body);
  const fundingAccountId = resolveFunding(input.cardId, input.fundingAccountId);
  const row = db
    .insert(transaction)
    .values({ ...input, fundingAccountId, userId: req.user!.id, source: 'manual' })
    .returning({ id: transaction.id })
    .get();
  res.status(201).json(row);
});

transactionsRouter.put('/:id', requireWriter, (req, res) => {
  const input = parseBody(transactionInput, req.body);
  const fundingAccountId = resolveFunding(input.cardId, input.fundingAccountId);
  const result = db
    .update(transaction)
    .set({ ...input, fundingAccountId })
    .where(and(eq(transaction.id, idParam(req)), eq(transaction.userId, req.user!.id)))
    .run();
  if (result.changes === 0) throw new HttpError(404, 'Transaction not found');
  res.json({ ok: true });
});

transactionsRouter.delete('/:id', requireWriter, (req, res) => {
  const result = db
    .delete(transaction)
    .where(and(eq(transaction.id, idParam(req)), eq(transaction.userId, req.user!.id)))
    .run();
  if (result.changes === 0) throw new HttpError(404, 'Transaction not found');
  res.status(204).end();
});
