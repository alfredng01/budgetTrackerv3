import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { extractText } from 'unpdf';
import { z } from 'zod';
import { toCents, type ParsedStatement } from '@budget/shared';
import { env } from '../env.js';
import { HttpError } from '../lib/http.js';
import { categoryHistory, findDuplicates, findPaymentDuplicates } from './importHelpers.js';
import { getLookups } from './lookups.js';

/** Models that accept the server-side `fallbacks: "default"` refusal fallback. */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);
const UNKNOWN_CARD = 'Unknown';
const MAX_TEXT_CHARS = 400_000;

const KINDS = ['purchase', 'refund', 'fee', 'interest', 'payment', 'transfer', 'deposit'] as const;
/** Not spending: transfers between own accounts and deposits are dropped; payments are returned separately. */
const NON_SPENDING_KINDS = new Set<string>(['payment', 'transfer', 'deposit']);

const client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

export const parserEnabled = () => client !== null;

/** Extracts plain text in memory; the uploaded bytes are never written to disk. */
export async function extractStatementText(buffer: Buffer, filename: string, mime: string): Promise<string> {
  const isPdf = mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
  const text = isPdf
    ? (await extractText(new Uint8Array(buffer), { mergePages: true })).text
    : buffer.toString('utf8');
  if (!text.trim()) {
    throw new HttpError(422, 'No text found in the file. Scanned/image-only PDFs are not supported.');
  }
  if (text.length > MAX_TEXT_CHARS) throw new HttpError(413, 'Statement is too long to parse');
  return text;
}

/**
 * Masks long digit runs (card/account/routing numbers) before the text leaves the server.
 * Amounts like 1,234.56 and dates like 01/02/2026 are untouched; only the last 4 digits are kept.
 */
export function redactAccountNumbers(text: string): string {
  return text.replace(/\b\d(?:[ -]?\d){7,18}\b/g, (match) => {
    const digits = match.replace(/\D/g, '');
    return `****${digits.slice(-4)}`;
  });
}

function buildOutputSchema(categories: string[], cards: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['card', 'transactions'],
    properties: {
      card: {
        type: 'string',
        enum: [...cards, UNKNOWN_CARD],
        description: 'Which of the known cards/accounts this statement belongs to, or Unknown.',
      },
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['date', 'description', 'amount', 'kind', 'category'],
          properties: {
            date: { type: 'string', description: 'Transaction date as YYYY-MM-DD' },
            description: { type: 'string', description: 'Merchant / description, cleaned up' },
            amount: { type: 'number', description: 'Absolute amount in dollars, always positive' },
            kind: { type: 'string', enum: [...KINDS] },
            category: { type: 'string', enum: categories },
          },
        },
      },
    },
  };
}

const outputSchema = z.object({
  card: z.string(),
  transactions: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string(),
      amount: z.number(),
      kind: z.enum(KINDS),
      category: z.string(),
    }),
  ),
});

const SYSTEM_PROMPT = `You extract transactions from bank and credit card statements for a personal budgeting app.

Return every individual transaction line in the statement. Ignore summary lines (balances, totals, minimum payment, credit limit, rewards summaries).

For each transaction:
- date: the transaction date (not the posting date, if both are shown) as YYYY-MM-DD. Statements often omit the year; infer it from the statement period, taking care with periods that span December to January.
- description: the merchant or payee, cleaned of reference numbers and noise, kept short and readable.
- amount: the absolute dollar amount as a positive number.
- kind:
  - purchase: money spent (card purchases, debit card purchases, checks, bill pay to a merchant).
  - refund: a merchant credit or return that reduces spending.
  - fee / interest: charges from the bank itself.
  - payment: a payment toward a credit card balance (on a card statement, or the outgoing payment on a checking statement).
  - transfer: movement between the account holder's own accounts.
  - deposit: paychecks or other money coming into a checking account.
- category: the best-fitting category from the allowed list based on the merchant. "Reimbursement" means the user paid for something on behalf of someone else (e.g. splitting a dinner bill), so only use it when the description makes that clear.

Also identify which of the listed cards/accounts the statement is from based on the issuer, product name, or account type; use "Unknown" if unclear.`;

export async function parseStatement(rawText: string, userId: string): Promise<ParsedStatement> {
  if (!client) throw new HttpError(503, 'Statement parsing is disabled: ANTHROPIC_API_KEY is not set');

  const { categories, cards } = getLookups();
  const model = env.STATEMENT_PARSER_MODEL;
  const useFallbacks = FALLBACK_MODELS.has(model);

  let message: Anthropic.Beta.BetaMessage;
  try {
    // Streaming avoids HTTP timeouts on long statements with many rows.
    message = await client.beta.messages
      .stream({
        model,
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: 'medium',
          format: {
            type: 'json_schema',
            schema: buildOutputSchema(
              categories.map((c) => c.name),
              cards.map((c) => c.name),
            ),
          },
        },
        ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        messages: [
          {
            role: 'user',
            content: `<statement>\n${redactAccountNumbers(rawText)}\n</statement>`,
          },
        ],
      })
      .finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(502, 'Anthropic API key is invalid');
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Parser rate limited, try again shortly');
    if (err instanceof Anthropic.APIError) throw new HttpError(502, `Statement parser error: ${err.message}`);
    throw err;
  }

  if (message.stop_reason === 'refusal') throw new HttpError(422, 'The parser declined to process this file');
  if (message.stop_reason === 'max_tokens') {
    throw new HttpError(413, 'Statement has too many transactions to parse at once; try splitting it');
  }

  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const parsed = outputSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new HttpError(502, 'Parser returned an unexpected format');

  const categoryIds = new Map(categories.map((c) => [c.name, c.id]));
  const all = parsed.data.transactions.filter((t) => t.amount !== 0);
  const kept = all.filter((t) => !NON_SPENDING_KINDS.has(t.kind));
  const paymentRows = all.filter((t) => t.kind === 'payment');

  // The user's own past choice for a merchant beats the model's guess.
  const fromHistory = categoryHistory(userId);
  const rows = kept.map((t) => {
    const description = t.description.trim().slice(0, 200);
    return {
      key: randomUUID(),
      date: t.date,
      description,
      amountCents: (t.kind === 'refund' ? -1 : 1) * Math.abs(toCents(t.amount)),
      categoryId: fromHistory(description) ?? categoryIds.get(t.category) ?? null,
      possibleDuplicate: false,
    };
  });
  findDuplicates(rows, userId).forEach((dup, i) => (rows[i].possibleDuplicate = dup));

  // Card payments become payment records (lowering the payment account and updating "last paid").
  const payments = paymentRows.map((t) => ({
    key: randomUUID(),
    date: t.date,
    description: t.description.trim().slice(0, 200),
    amountCents: Math.abs(toCents(t.amount)),
    possibleDuplicate: false,
  }));
  findPaymentDuplicates(payments, userId).forEach((dup, i) => (payments[i].possibleDuplicate = dup));

  return {
    suggestedCardId: cards.find((c) => c.name === parsed.data.card)?.id ?? null,
    rows,
    payments,
    skippedCount: all.length - kept.length - payments.length,
  };
}
