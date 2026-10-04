import fs from 'node:fs';
import path from 'node:path';
import { asc, eq, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Lookups, SettingsInput } from '@budget/shared';
import { db } from '../db/index.js';
import { card, category, moneyAccount } from '../db/schema.js';
import { env } from '../env.js';
import { HttpError } from '../lib/http.js';

const DEFAULT_ACCOUNTS = ['Checking', 'High Yield Savings', 'Savings', 'Venmo'];
/** Links applied when upgrading a config.json written before accounts existed. */
const LEGACY_CARD_LINKS: Record<string, string> = { 'checking account': 'Checking', venmo: 'Venmo' };

const cardEntry = z.union([
  z.string().trim().min(1),
  z.object({ name: z.string().trim().min(1), account: z.string().trim().min(1).nullable().optional() }),
]);
const configSchema = z.object({
  categories: z.array(z.string().trim().min(1)).min(1),
  cards: z.array(cardEntry).min(1),
  accounts: z.array(z.string().trim().min(1)).min(1).optional(),
  paymentAccount: z.string().trim().min(1).optional(),
});

interface AppConfig {
  categories: string[];
  cards: { name: string; account: string | null }[];
  accounts: string[];
  paymentAccount: string;
}

type LookupTable = typeof category | typeof card | typeof moneyAccount;

const configFile = () => path.resolve(env.CONFIG_PATH);
const lower = (s: string) => s.trim().toLowerCase();

/** Reads config.json, filling in accounts for files written by older versions. */
function readConfig(): AppConfig {
  const raw = configSchema.parse(JSON.parse(fs.readFileSync(configFile(), 'utf8')));
  const legacy = !raw.accounts;
  const accounts = raw.accounts ?? DEFAULT_ACCOUNTS;
  const cards = raw.cards.map((c) =>
    typeof c === 'string'
      ? { name: c, account: legacy ? (LEGACY_CARD_LINKS[lower(c)] ?? null) : null }
      : { name: c.name, account: c.account ?? null },
  );
  return { categories: raw.categories, cards, accounts, paymentAccount: raw.paymentAccount ?? accounts[0] };
}

/** Copies the bundled defaults to the writable config location on first start. */
function ensureConfigFile() {
  const file = configFile();
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(path.resolve(env.DEFAULT_CONFIG_PATH), file);
  console.log(`Created ${file} from defaults`);
}

/** Atomic write: a crash mid-save never leaves a truncated config.json behind. */
function writeConfig(config: AppConfig) {
  const file = configFile();
  const tmp = `${file}.tmp`;
  const json = {
    categories: config.categories,
    // Plain strings for credit cards keep the file easy to edit by hand.
    cards: config.cards.map((c) => (c.account ? { name: c.name, account: c.account } : c.name)),
    accounts: config.accounts,
    paymentAccount: config.paymentAccount,
  };
  fs.writeFileSync(tmp, `${JSON.stringify(json, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function syncTableByName(table: LookupTable, names: string[]) {
  db.transaction((tx) => {
    const existing = new Set(tx.select({ name: table.name }).from(table).all().map((r) => r.name));
    names.forEach((name, i) => {
      // Update-or-insert rather than an upsert: an upsert reserves a new AUTOINCREMENT id on every
      // conflict, so ids would jump on each restart (category colours are keyed by id).
      if (existing.has(name)) {
        tx.update(table).set({ sortOrder: i, active: true }).where(eq(table.name, name)).run();
      } else {
        tx.insert(table).values({ name, sortOrder: i, active: true }).run();
      }
    });
    // Entries removed from the config are hidden, not deleted, so old records keep their labels.
    tx.update(table).set({ active: false }).where(notInArray(table.name, names)).run();
  });
}

/** Points each card at its linked account (by account name), or none for credit cards. */
function applyCardLinks(links: { name: string; account: string | null }[]) {
  const accounts = db.select({ id: moneyAccount.id, name: moneyAccount.name }).from(moneyAccount).where(eq(moneyAccount.active, true)).all();
  const accountIds = new Map(accounts.map((a) => [lower(a.name), a.id]));
  const cards = db.select({ id: card.id, name: card.name }).from(card).where(eq(card.active, true)).all();
  const cardIds = new Map(cards.map((c) => [lower(c.name), c.id]));
  db.transaction((tx) => {
    for (const link of links) {
      const cardId = cardIds.get(lower(link.name));
      if (!cardId) continue;
      const accountId = link.account ? accountIds.get(lower(link.account)) : undefined;
      if (link.account && !accountId) throw new HttpError(400, `"${link.name}" is linked to an unknown account`);
      tx.update(card).set({ accountId: accountId ?? null }).where(eq(card.id, cardId)).run();
    }
  });
}

let paymentAccountName = '';

/** Syncs config.json into the database on startup (matching by name). */
export function syncLookupsFromConfig() {
  ensureConfigFile();
  const config = readConfig();
  syncTableByName(moneyAccount, config.accounts);
  syncTableByName(category, config.categories);
  syncTableByName(card, config.cards.map((c) => c.name));
  applyCardLinks(config.cards);
  paymentAccountName = config.paymentAccount;
  cached = null;
  // Persist upgrades (e.g. accounts added to an older config.json).
  writeConfig(config);
}

/**
 * Applies a list edited on the Settings page. Items carry their id when they already exist,
 * so a rename updates the row in place and existing records follow the new name.
 */
function applyList(table: LookupTable, items: { id?: number; name: string }[]) {
  const names = items.map((i) => lower(i.name));
  if (new Set(names).size !== names.length) throw new HttpError(400, 'Names must be unique');

  db.transaction((tx) => {
    const existing = tx.select({ id: table.id, name: table.name }).from(table).all();
    const byId = new Map(existing.map((r) => [r.id, r]));
    const keptIds = new Set(items.flatMap((i) => (i.id && byId.has(i.id) ? [i.id] : [])));

    // Park renamed rows on temporary names first so swaps (A<->B) don't hit the unique constraint.
    for (const id of keptIds) tx.update(table).set({ name: `__tmp_${id}` }).where(eq(table.id, id)).run();

    // A hidden row may already own a name being (re)used; reactivate it for new items, or move it aside.
    const hiddenByName = new Map(existing.filter((r) => !keptIds.has(r.id)).map((r) => [lower(r.name), r]));

    items.forEach((item, sortOrder) => {
      const name = item.name.trim();
      const hidden = hiddenByName.get(lower(name));
      if (item.id && keptIds.has(item.id)) {
        if (hidden) {
          tx.update(table).set({ name: `${hidden.name} (archived ${hidden.id})` }).where(eq(table.id, hidden.id)).run();
          hiddenByName.delete(lower(name));
        }
        tx.update(table).set({ name, sortOrder, active: true }).where(eq(table.id, item.id)).run();
      } else if (hidden) {
        tx.update(table).set({ name, sortOrder, active: true }).where(eq(table.id, hidden.id)).run();
        keptIds.add(hidden.id);
        hiddenByName.delete(lower(name));
      } else {
        const row = tx.insert(table).values({ name, sortOrder, active: true }).returning({ id: table.id }).get();
        keptIds.add(row.id);
      }
    });

    const removed = existing.filter((r) => !keptIds.has(r.id)).map((r) => r.id);
    for (const id of removed) tx.update(table).set({ active: false }).where(eq(table.id, id)).run();
  });
}

export function saveSettings(input: SettingsInput): Lookups {
  const accountNames = new Set(input.accounts.map((a) => lower(a.name)));
  if (!accountNames.has(lower(input.paymentAccount))) {
    throw new HttpError(400, 'The card payment account must be one of the accounts');
  }
  for (const c of input.cards) {
    if (c.account && !accountNames.has(lower(c.account))) {
      throw new HttpError(400, `"${c.name}" is linked to an account that isn't in the list`);
    }
  }

  applyList(moneyAccount, input.accounts);
  applyList(category, input.categories);
  applyList(card, input.cards);
  applyCardLinks(input.cards.map((c) => ({ name: c.name, account: c.account })));
  paymentAccountName = input.paymentAccount.trim();
  cached = null;

  const lookups = getLookups();
  const accountName = new Map(lookups.accounts.map((a) => [a.id, a.name]));
  writeConfig({
    categories: lookups.categories.map((c) => c.name),
    cards: lookups.cards.map((c) => ({ name: c.name, account: c.accountId ? (accountName.get(c.accountId) ?? null) : null })),
    accounts: lookups.accounts.map((a) => a.name),
    paymentAccount: lookups.accounts.find((a) => a.id === lookups.paymentAccountId)?.name ?? lookups.accounts[0].name,
  });
  return lookups;
}

let cached: Lookups | null = null;

export function getLookups(): Lookups {
  if (cached) return cached;
  const select = (table: typeof category | typeof moneyAccount) =>
    db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(eq(table.active, true))
      .orderBy(asc(table.sortOrder))
      .all();
  const accounts = select(moneyAccount);
  cached = {
    categories: select(category),
    cards: db
      .select({ id: card.id, name: card.name, accountId: card.accountId })
      .from(card)
      .where(eq(card.active, true))
      .orderBy(asc(card.sortOrder))
      .all(),
    accounts,
    paymentAccountId: accounts.find((a) => lower(a.name) === lower(paymentAccountName))?.id ?? accounts[0]?.id ?? null,
    categoryIdsByAge: db.select({ id: category.id }).from(category).orderBy(asc(category.id)).all().map((c) => c.id),
  };
  return cached;
}

/**
 * Which account a purchase actually came out of. Credit cards: none (paid later).
 * Linked cards: their own account, or the payment account if requested (e.g. Venmo topped up from Checking).
 */
export function resolveFunding(cardId: number, requested: number | null | undefined): number | null {
  const row = db.select({ accountId: card.accountId }).from(card).where(eq(card.id, cardId)).get();
  if (!row) throw new HttpError(400, 'Unknown card');
  if (!row.accountId) return null;
  const { paymentAccountId } = getLookups();
  if (requested && (requested === row.accountId || requested === paymentAccountId)) return requested;
  return row.accountId;
}
