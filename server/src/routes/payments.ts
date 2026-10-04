import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { cardPaymentInput, type CardLastPaid, type PaymentsOverview } from '@budget/shared';
import { db } from '../db/index.js';
import { card, cardPayment, moneyAccount, user } from '../db/schema.js';
import { HttpError, idParam, parseBody } from '../lib/http.js';
import { readScope, requireWriter } from '../middleware/auth.js';
import { getLookups } from '../services/lookups.js';

export const paymentsRouter = Router();

/** Last payment per credit card (cards with no linked account), plus recent payment history. */
paymentsRouter.get('/', (req, res) => {
  const scope = readScope(req);
  const userFilter = scope ? eq(cardPayment.userId, scope) : undefined;

  const recent = db
    .select({
      id: cardPayment.id,
      userId: cardPayment.userId,
      username: user.username,
      date: cardPayment.date,
      cardId: cardPayment.cardId,
      cardName: card.name,
      fromAccountId: cardPayment.fromAccountId,
      fromAccountName: moneyAccount.name,
      amountCents: cardPayment.amountCents,
      description: cardPayment.description,
    })
    .from(cardPayment)
    .innerJoin(user, eq(user.id, cardPayment.userId))
    .innerJoin(card, eq(card.id, cardPayment.cardId))
    .leftJoin(moneyAccount, eq(moneyAccount.id, cardPayment.fromAccountId))
    .where(userFilter)
    .orderBy(desc(cardPayment.date), desc(cardPayment.id))
    .limit(200)
    .all()
    .map((r) => ({ ...r, username: r.username ?? '' }));

  // Latest payment per (user, card); MAX(date) uses the (user_id, card_id, date) index.
  const latest = db
    .select({
      userId: cardPayment.userId,
      cardId: cardPayment.cardId,
      lastDate: sql<string>`max(${cardPayment.date})`,
    })
    .from(cardPayment)
    .where(userFilter)
    .groupBy(cardPayment.userId, cardPayment.cardId)
    .all();
  const amountOn = (userId: string, cardId: number, date: string) =>
    db
      .select({ total: sql<number>`sum(${cardPayment.amountCents})` })
      .from(cardPayment)
      .where(and(eq(cardPayment.userId, userId), eq(cardPayment.cardId, cardId), eq(cardPayment.date, date)))
      .get()?.total ?? null;

  const users = scope
    ? db.select({ id: user.id, username: user.username }).from(user).where(eq(user.id, scope)).all()
    : db.select({ id: user.id, username: user.username }).from(user).where(eq(user.role, 'user')).orderBy(user.username).all();
  const creditCards = getLookups().cards.filter((c) => c.accountId === null);
  const latestByKey = new Map(latest.map((l) => [`${l.userId}|${l.cardId}`, l.lastDate]));

  const lastPaid: CardLastPaid[] = users.flatMap((u) =>
    creditCards.map((c) => {
      const lastPaidDate = latestByKey.get(`${u.id}|${c.id}`) ?? null;
      return {
        userId: u.id,
        username: u.username ?? '',
        cardId: c.id,
        cardName: c.name,
        lastPaidDate,
        lastAmountCents: lastPaidDate ? amountOn(u.id, c.id, lastPaidDate) : null,
      };
    }),
  );

  const overview: PaymentsOverview = { lastPaid, recent };
  res.json(overview);
});

paymentsRouter.post('/', requireWriter, (req, res) => {
  const input = parseBody(cardPaymentInput, req.body);
  const row = db
    .insert(cardPayment)
    .values({ ...input, userId: req.user!.id })
    .returning({ id: cardPayment.id })
    .get();
  res.status(201).json(row);
});

paymentsRouter.delete('/:id', requireWriter, (req, res) => {
  const result = db
    .delete(cardPayment)
    .where(and(eq(cardPayment.id, idParam(req)), eq(cardPayment.userId, req.user!.id)))
    .run();
  if (result.changes === 0) throw new HttpError(404, 'Payment not found');
  res.status(204).end();
});
