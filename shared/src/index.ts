import { z } from 'zod';

// ---------- Primitives ----------

/** Calendar date stored as `YYYY-MM-DD`. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
/** Month key `YYYY-MM`. */
export const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

/** All money is stored and transported as integer cents to avoid float drift. */
export const cents = z.number().int().safe();

const id = z.number().int().positive();

export type Role = 'user' | 'admin';

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

// ---------- Lookup data (categories / cards / accounts) ----------

export interface LookupItem {
  id: number;
  name: string;
}

export interface CardItem extends LookupItem {
  /**
   * Account the card draws from directly (debit card -> Checking, Venmo -> Venmo).
   * null means a credit card: purchases don't touch an account until the card is paid.
   */
  accountId: number | null;
}

export interface Lookups {
  categories: LookupItem[];
  cards: CardItem[];
  accounts: LookupItem[];
  /** Account that credit card payments (and the "pay from bank" Venmo option) come from. */
  paymentAccountId: number | null;
  /** Every category id ever created, removed ones included; fixes each category's colour slot. */
  categoryIdsByAge: number[];
}

const settingsItem = z.object({
  /** Present for existing entries so renames keep their history; omitted for new ones. */
  id: id.optional(),
  name: z.string().trim().min(1, 'Name is required').max(60),
});

/** Full replacement lists from the Settings page, in display order. Accounts are referenced by name. */
export const settingsInput = z.object({
  categories: z.array(settingsItem).min(1, 'Keep at least one category').max(100),
  cards: z
    .array(settingsItem.extend({ account: z.string().trim().max(60).nullable() }))
    .min(1, 'Keep at least one card')
    .max(100),
  accounts: z.array(settingsItem).min(1, 'Keep at least one account').max(50),
  paymentAccount: z.string().trim().min(1, 'Choose the account card payments come from'),
});
export type SettingsInput = z.infer<typeof settingsInput>;

// ---------- Transactions ----------

export const transactionInput = z.object({
  date: isoDate,
  description: z.string().trim().min(1).max(200),
  note: z.string().trim().max(500).optional().default(''),
  /** Positive = money spent, negative = refund/credit. */
  amountCents: cents.refine((v) => v !== 0, 'Amount cannot be zero'),
  categoryId: id,
  cardId: id,
  /**
   * Account the money actually left. Only meaningful for cards linked to an account
   * (e.g. Venmo: its own balance or the payment account); the server fills the default.
   */
  fundingAccountId: id.nullable().optional(),
});
export type TransactionInput = z.input<typeof transactionInput>;

export interface Transaction {
  id: number;
  userId: string;
  username: string;
  date: string;
  description: string;
  note: string;
  amountCents: number;
  categoryId: number;
  categoryName: string;
  cardId: number;
  cardName: string;
  fundingAccountId: number | null;
  fundingAccountName: string | null;
  source: 'manual' | 'import';
}

// ---------- Income ----------

export const incomeInput = z.object({
  date: isoDate,
  source: z.string().trim().min(1).max(200),
  amountCents: cents.positive(),
  accountId: id,
});
export type IncomeInput = z.input<typeof incomeInput>;

export interface Income {
  id: number;
  userId: string;
  username: string;
  date: string;
  source: string;
  amountCents: number;
  accountId: number | null;
  accountName: string | null;
}

// ---------- Credit card payments ----------

export const cardPaymentInput = z.object({
  date: isoDate,
  cardId: id,
  fromAccountId: id,
  amountCents: cents.positive(),
  description: z.string().trim().max(200).optional().default(''),
});
export type CardPaymentInput = z.input<typeof cardPaymentInput>;

export interface CardPayment {
  id: number;
  userId: string;
  username: string;
  date: string;
  cardId: number;
  cardName: string;
  fromAccountId: number | null;
  fromAccountName: string | null;
  amountCents: number;
  description: string;
}

export interface CardLastPaid {
  userId: string;
  username: string;
  cardId: number;
  cardName: string;
  lastPaidDate: string | null;
  lastAmountCents: number | null;
}

export interface PaymentsOverview {
  lastPaid: CardLastPaid[];
  recent: CardPayment[];
}

// ---------- Accounts ----------

export interface AccountBalance {
  userId: string;
  username: string;
  accountId: number;
  accountName: string;
  balanceCents: number;
}

export interface AccountActivity {
  /** Unique within one listing, e.g. "income-12". */
  key: string;
  date: string;
  description: string;
  /** Signed effect on the balance. */
  amountCents: number;
  kind: 'income' | 'purchase' | 'card-payment' | 'adjustment' | 'transfer';
  /** For adjustments/transfers, which can be undone. */
  entryId: number | null;
}

/** Sets the balance as of a date; the server records the difference as an adjustment. */
export const setBalanceInput = z.object({
  accountId: id,
  date: isoDate,
  balanceCents: cents,
});

export const transferInput = z
  .object({
    date: isoDate,
    fromAccountId: id,
    toAccountId: id,
    amountCents: cents.positive(),
    note: z.string().trim().max(200).optional().default(''),
  })
  .refine((t) => t.fromAccountId !== t.toAccountId, 'Pick two different accounts');
export type TransferInput = z.input<typeof transferInput>;

// ---------- Allowance ----------

export const allowanceInput = z.object({
  weeklyCents: cents.nonnegative(),
  categoryIds: z.array(id).max(100),
});
export type AllowanceInput = z.infer<typeof allowanceInput>;

export interface AllowanceSummary {
  userId: string;
  username: string;
  year: number;
  weeklyCents: number;
  categoryIds: number[];
  /** Week number of the year as of the date the summary is for (week 1 = Jan 1-7). */
  weeksElapsed: number;
  earnedCents: number;
  spentCents: number;
  remainingCents: number;
  transactions: Transaction[];
}

/** Week of the year counted from Jan 1 (Jan 1-7 = week 1, Dec 31 = week 53). */
export function weekOfYear(isoDay: string): number {
  const [y, m, d] = isoDay.split('-').map(Number);
  const dayIndex = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000);
  return Math.floor(dayIndex / 7) + 1;
}

// ---------- Budgets ----------

export const budgetInput = z.object({
  /** null/0 removes the limit for that category. */
  limitCents: cents.nonnegative().nullable(),
});

export interface BudgetRow {
  categoryId: number;
  categoryName: string;
  limitCents: number | null;
}

// ---------- Dashboard ----------

export interface CategoryTotal {
  categoryId: number;
  categoryName: string;
  totalCents: number;
}

export interface BudgetProgress {
  categoryId: number;
  categoryName: string;
  limitCents: number;
  spentCents: number;
  /** spent - limit, positive when over budget. */
  overCents: number;
}

export interface DashboardSummary {
  month: string;
  spentCents: number;
  incomeCents: number;
  netCents: number;
  byCategory: CategoryTotal[];
  budgets: BudgetProgress[];
}

export interface MonthTotals {
  month: string;
  spentCents: number;
  incomeCents: number;
}

export interface YearSummary {
  year: number;
  months: MonthTotals[];
}

// ---------- Statement import ----------

export interface ParsedStatementRow {
  /** Client-side key for the review table. */
  key: string;
  date: string;
  description: string;
  amountCents: number;
  categoryId: number | null;
  possibleDuplicate: boolean;
}

export interface ParsedPaymentRow {
  key: string;
  date: string;
  description: string;
  /** Always positive. */
  amountCents: number;
  possibleDuplicate: boolean;
}

/** Rows parsed locally (CSV import) sent to the server for duplicate checks and category hints. */
export const prepareImportInput = z.object({
  rows: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        date: isoDate,
        description: z.string().max(500),
        amountCents: cents,
        /** Card payment rows are checked against recorded payments instead of transactions. */
        isPayment: z.boolean().optional(),
      }),
    )
    .max(5000),
});
export type PrepareImportInput = z.infer<typeof prepareImportInput>;

export type PrepareImportResult = Record<string, { possibleDuplicate: boolean; categoryId: number | null }>;

export interface ParsedStatement {
  suggestedCardId: number | null;
  rows: ParsedStatementRow[];
  payments: ParsedPaymentRow[];
  /** Rows dropped as transfers between own accounts or deposits. */
  skippedCount: number;
}

/** Saves reviewed import rows (purchases and card payments) in one go. */
export const importCommitInput = z
  .object({
    transactions: z.array(transactionInput).max(1000),
    payments: z.array(cardPaymentInput).max(500),
  })
  .refine((v) => v.transactions.length + v.payments.length > 0, 'Nothing to save');

// ---------- Helpers ----------

export function formatCents(value: number): string {
  return (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Parses a user-entered dollar string/number into integer cents. */
export function toCents(dollars: number | string): number {
  const n = typeof dollars === 'string' ? Number(dollars.replace(/[$,\s]/g, '')) : dollars;
  return Math.round(n * 100);
}

export function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive start / exclusive end dates for a `YYYY-MM` month, as ISO strings. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start: `${month}-01`, end: `${next}-01` };
}
