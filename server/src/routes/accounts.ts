import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { setBalanceInput, transferInput, type AccountActivity, type AccountBalance } from '@budget/shared';
import { db } from '../db/index.js';
import { accountEntry, card, cardPayment, income, transaction, user } from '../db/schema.js';
import { HttpError, idParam, parseBody } from '../lib/http.js';
import { readScope, requireWriter } from '../middleware/auth.js';
import { getLookups } from '../services/lookups.js';

export const accountsRouter = Router();

type Totals = Map<string, number>; // key: `${userId}|${accountId}`

/**
 * Balance = adjustments/transfers + income deposited - purchases funded from the account
 * - card payments made from it. Four grouped aggregates, one per source table.
 */
function balanceTotals(scope: string | null): Totals {
  const totals: Totals = new Map();
  const add = (rows: { userId: string; accountId: number | null; total: number }[], sign: 1 | -1) => {
    for (const r of rows) {
      if (r.accountId === null) continue;
      const key = `${r.userId}|${r.accountId}`;
      totals.set(key, (totals.get(key) ?? 0) + sign * r.total);
    }
  };
  add(
    db
      .select({ userId: accountEntry.userId, accountId: accountEntry.accountId, total: sql<number>`sum(${accountEntry.amountCents})` })
      .from(accountEntry)
      .where(scope ? eq(accountEntry.userId, scope) : undefined)
      .groupBy(accountEntry.userId, accountEntry.accountId)
      .all(),
    1,
  );
  add(
    db
      .select({ userId: income.userId, accountId: income.accountId, total: sql<number>`sum(${income.amountCents})` })
      .from(income)
      .where(and(isNotNull(income.accountId), scope ? eq(income.userId, scope) : undefined))
      .groupBy(income.userId, income.accountId)
      .all(),
    1,
  );
  add(
    db
      .select({
        userId: transaction.userId,
        accountId: transaction.fundingAccountId,
        total: sql<number>`sum(${transaction.amountCents})`,
      })
      .from(transaction)
      .where(and(isNotNull(transaction.fundingAccountId), scope ? eq(transaction.userId, scope) : undefined))
      .groupBy(transaction.userId, transaction.fundingAccountId)
      .all(),
    -1,
  );
  add(
    db
      .select({
        userId: cardPayment.userId,
        accountId: cardPayment.fromAccountId,
        total: sql<number>`sum(${cardPayment.amountCents})`,
      })
      .from(cardPayment)
      .where(and(isNotNull(cardPayment.fromAccountId), scope ? eq(cardPayment.userId, scope) : undefined))
      .groupBy(cardPayment.userId, cardPayment.fromAccountId)
      .all(),
    -1,
  );
  return totals;
}

function currentBalance(userId: string, accountId: number): number {
  return balanceTotals(userId).get(`${userId}|${accountId}`) ?? 0;
}

accountsRouter.get('/', (req, res) => {
  const scope = readScope(req);
  const totals = balanceTotals(scope);
  const users = db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(scope ? eq(user.id, scope) : eq(user.role, 'user'))
    .orderBy(user.username)
    .all();
  const rows: AccountBalance[] = users.flatMap((u) =>
    getLookups().accounts.map((a) => ({
      userId: u.id,
      username: u.username ?? '',
      accountId: a.id,
      accountName: a.name,
      balanceCents: totals.get(`${u.id}|${a.id}`) ?? 0,
    })),
  );
  res.json(rows);
});

/** Everything that moved one account's balance, newest first. */
accountsRouter.get('/:id/activity', (req, res) => {
  const accountId = idParam(req);
  const scope = readScope(req) ?? req.user!.id;
  const LIMIT = 200;

  const activity: AccountActivity[] = [
    ...db
      .select({ id: income.id, date: income.date, source: income.source, amount: income.amountCents })
      .from(income)
      .where(and(eq(income.userId, scope), eq(income.accountId, accountId)))
      .orderBy(desc(income.date))
      .limit(LIMIT)
      .all()
      .map((r) => ({
        key: `income-${r.id}`,
        date: r.date,
        description: `Income: ${r.source}`,
        amountCents: r.amount,
        kind: 'income' as const,
        entryId: null,
      })),
    ...db
      .select({ id: transaction.id, date: transaction.date, description: transaction.description, amount: transaction.amountCents, cardName: card.name })
      .from(transaction)
      .innerJoin(card, eq(card.id, transaction.cardId))
      .where(and(eq(transaction.userId, scope), eq(transaction.fundingAccountId, accountId)))
      .orderBy(desc(transaction.date))
      .limit(LIMIT)
      .all()
      .map((r) => ({
        key: `txn-${r.id}`,
        date: r.date,
        description: `${r.description} (${r.cardName})`,
        amountCents: -r.amount,
        kind: 'purchase' as const,
        entryId: null,
      })),
    ...db
      .select({ id: cardPayment.id, date: cardPayment.date, amount: cardPayment.amountCents, cardName: card.name })
      .from(cardPayment)
      .innerJoin(card, eq(card.id, cardPayment.cardId))
      .where(and(eq(cardPayment.userId, scope), eq(cardPayment.fromAccountId, accountId)))
      .orderBy(desc(cardPayment.date))
      .limit(LIMIT)
      .all()
      .map((r) => ({
        key: `payment-${r.id}`,
        date: r.date,
        description: `Payment to ${r.cardName}`,
        amountCents: -r.amount,
        kind: 'card-payment' as const,
        entryId: null,
      })),
    ...db
      .select({ id: accountEntry.id, date: accountEntry.date, amount: accountEntry.amountCents, kind: accountEntry.kind, note: accountEntry.note })
      .from(accountEntry)
      .where(and(eq(accountEntry.userId, scope), eq(accountEntry.accountId, accountId)))
      .orderBy(desc(accountEntry.date))
      .limit(LIMIT)
      .all()
      .map((r) => ({
        key: `entry-${r.id}`,
        date: r.date,
        description: r.note || (r.kind === 'transfer' ? 'Transfer' : 'Balance adjustment'),
        amountCents: r.amount,
        kind: r.kind,
        entryId: r.id,
      })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, LIMIT);

  res.json(activity);
});

/** "Set balance": records the difference from the computed balance as an adjustment. */
accountsRouter.post('/set-balance', requireWriter, (req, res) => {
  const { accountId, date, balanceCents } = parseBody(setBalanceInput, req.body);
  const userId = req.user!.id;
  const delta = balanceCents - currentBalance(userId, accountId);
  if (delta !== 0) {
    db.insert(accountEntry)
      .values({ userId, accountId, date, amountCents: delta, kind: 'adjustment', note: 'Balance set' })
      .run();
  }
  res.status(201).json({ adjustedByCents: delta });
});

accountsRouter.post('/transfer', requireWriter, (req, res) => {
  const t = parseBody(transferInput, req.body);
  const userId = req.user!.id;
  const names = new Map(getLookups().accounts.map((a) => [a.id, a.name]));
  if (!names.has(t.fromAccountId) || !names.has(t.toAccountId)) throw new HttpError(400, 'Unknown account');
  const transferGroup = randomUUID();
  const suffix = t.note ? `: ${t.note}` : '';
  db.transaction((tx) => {
    tx.insert(accountEntry)
      .values({
        userId,
        accountId: t.fromAccountId,
        date: t.date,
        amountCents: -t.amountCents,
        kind: 'transfer',
        note: `Transfer to ${names.get(t.toAccountId)}${suffix}`,
        transferGroup,
      })
      .run();
    tx.insert(accountEntry)
      .values({
        userId,
        accountId: t.toAccountId,
        date: t.date,
        amountCents: t.amountCents,
        kind: 'transfer',
        note: `Transfer from ${names.get(t.fromAccountId)}${suffix}`,
        transferGroup,
      })
      .run();
  });
  res.status(201).json({ ok: true });
});

/** Undo an adjustment, or both legs of a transfer. */
accountsRouter.delete('/entries/:id', requireWriter, (req, res) => {
  const userId = req.user!.id;
  const entry = db
    .select({ id: accountEntry.id, transferGroup: accountEntry.transferGroup })
    .from(accountEntry)
    .where(and(eq(accountEntry.id, idParam(req)), eq(accountEntry.userId, userId)))
    .get();
  if (!entry) throw new HttpError(404, 'Entry not found');
  db.delete(accountEntry)
    .where(
      and(
        eq(accountEntry.userId, userId),
        entry.transferGroup ? eq(accountEntry.transferGroup, entry.transferGroup) : eq(accountEntry.id, entry.id),
      ),
    )
    .run();
  res.status(204).end();
});
