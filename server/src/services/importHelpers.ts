import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cardPayment, category, transaction } from '../db/schema.js';

interface ImportRow {
  date: string;
  description: string;
  amountCents: number;
}

/** Merchant fingerprint: lowercase alphanumerics, first 10 chars ("TRADER JOE'S #123" -> "traderjoes"). */
const fingerprint = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);

/** Merchant name without store/reference numbers ("SHELL OIL 5741" -> "shelloil"), for category hints. */
const merchantKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12);

/** For each row, whether it matches an existing transaction on date + amount + similar description. */
export function findDuplicates(rows: ImportRow[], userId: string): boolean[] {
  if (rows.length === 0) return [];
  const dates = rows.map((r) => r.date).sort();
  const existing = db
    .select({ date: transaction.date, amountCents: transaction.amountCents, description: transaction.description })
    .from(transaction)
    .where(
      and(eq(transaction.userId, userId), gte(transaction.date, dates[0]), lte(transaction.date, dates[dates.length - 1])),
    )
    .all();

  const index = new Map<string, string[]>();
  for (const e of existing) {
    const k = `${e.date}|${e.amountCents}`;
    index.set(k, [...(index.get(k) ?? []), fingerprint(e.description)]);
  }
  return rows.map((row) => {
    const candidates = index.get(`${row.date}|${row.amountCents}`);
    if (!candidates) return false;
    const fp = fingerprint(row.description);
    return candidates.some((c) => !c || !fp || c.startsWith(fp) || fp.startsWith(c));
  });
}

/**
 * Builds a "merchant -> category" lookup from the user's own recent transactions,
 * so a merchant they've categorised before gets the same category again.
 */
export function categoryHistory(userId: string): (description: string) => number | null {
  const recent = db
    .select({ description: transaction.description, categoryId: transaction.categoryId })
    .from(transaction)
    .innerJoin(category, eq(category.id, transaction.categoryId))
    .where(and(eq(transaction.userId, userId), eq(category.active, true)))
    .orderBy(desc(transaction.id))
    .limit(5000)
    .all();

  const map = new Map<string, number>();
  for (const r of recent) {
    const key = merchantKey(r.description);
    if (key && !map.has(key)) map.set(key, r.categoryId); // newest choice wins
  }
  return (description) => map.get(merchantKey(description)) ?? null;
}

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * For each payment row, whether a payment of the same amount was already recorded within 5 days.
 * The window catches the same payment seen on both the card statement and the checking statement.
 */
export function findPaymentDuplicates(rows: { date: string; amountCents: number }[], userId: string): boolean[] {
  if (rows.length === 0) return [];
  const dates = rows.map((r) => r.date).sort();
  const existing = db
    .select({ date: cardPayment.date, amountCents: cardPayment.amountCents })
    .from(cardPayment)
    .where(
      and(
        eq(cardPayment.userId, userId),
        gte(cardPayment.date, shiftDays(dates[0], -5)),
        lte(cardPayment.date, shiftDays(dates[dates.length - 1], 5)),
      ),
    )
    .all();
  return rows.map((r) =>
    existing.some((e) => e.amountCents === Math.abs(r.amountCents) && dayDiff(e.date, r.date) <= 5),
  );
}
