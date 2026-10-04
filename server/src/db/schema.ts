import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date()),
};

// ---------- Better Auth tables (user / session / account / verification) ----------

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  username: text('username').unique(),
  displayUsername: text('display_username'),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  ...timestamps,
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    /** Better Auth stores a salted scrypt hash here, never the plain password. */
    password: text('password'),
    ...timestamps,
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    ...timestamps,
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// ---------- App tables ----------

export const category = sqliteTable('category', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

/** Where money actually sits: Checking, High Yield Savings, Savings, Venmo... Balances are per user. */
export const moneyAccount = sqliteTable('money_account', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const card = sqliteTable('card', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  /** Debit-style cards draw from an account directly; null = credit card. */
  accountId: integer('account_id').references(() => moneyAccount.id),
});

export const transaction = sqliteTable(
  'transaction',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** YYYY-MM-DD; lexical order == chronological order, so range scans use the index. */
    date: text('date').notNull(),
    description: text('description').notNull(),
    note: text('note').notNull().default(''),
    /** Positive = spend, negative = refund/credit. */
    amountCents: integer('amount_cents').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => category.id),
    cardId: integer('card_id')
      .notNull()
      .references(() => card.id),
    /** Account the money left (debit card / Venmo); null for credit card purchases. */
    fundingAccountId: integer('funding_account_id').references(() => moneyAccount.id),
    source: text('source', { enum: ['manual', 'import'] }).notNull().default('manual'),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    // Covers per-user month queries, dashboard aggregates and duplicate checks.
    index('transaction_user_date_idx').on(t.userId, t.date),
    index('transaction_date_idx').on(t.date),
  ],
);

export const income = sqliteTable(
  'income',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    source: text('source').notNull(),
    amountCents: integer('amount_cents').notNull(),
    accountId: integer('account_id').references(() => moneyAccount.id),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('income_user_date_idx').on(t.userId, t.date), index('income_date_idx').on(t.date)],
);

export const budget = sqliteTable(
  'budget',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'cascade' }),
    limitCents: integer('limit_cents').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);

export const cardPayment = sqliteTable(
  'card_payment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    cardId: integer('card_id')
      .notNull()
      .references(() => card.id),
    fromAccountId: integer('from_account_id').references(() => moneyAccount.id),
    amountCents: integer('amount_cents').notNull(),
    description: text('description').notNull().default(''),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('card_payment_user_date_idx').on(t.userId, t.date), index('card_payment_user_card_idx').on(t.userId, t.cardId, t.date)],
);

/** Balance corrections (starting balance, re-syncs) and both legs of transfers. */
export const accountEntry = sqliteTable(
  'account_entry',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: integer('account_id')
      .notNull()
      .references(() => moneyAccount.id),
    date: text('date').notNull(),
    /** Signed change to the balance. */
    amountCents: integer('amount_cents').notNull(),
    kind: text('kind', { enum: ['adjustment', 'transfer'] }).notNull(),
    note: text('note').notNull().default(''),
    /** Shared by the two legs of a transfer so they're deleted together. */
    transferGroup: text('transfer_group'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('account_entry_user_account_idx').on(t.userId, t.accountId, t.date)],
);

export const allowance = sqliteTable('allowance', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  weeklyCents: integer('weekly_cents').notNull().default(0),
  /** JSON array of category ids whose spending comes out of the allowance. */
  categoryIds: text('category_ids').notNull().default('[]'),
});
