import type { Lookups } from '@budget/shared';

export interface FundingChoice {
  value: string;
  label: string;
}

/**
 * "Paid from" choices for a card. Credit cards have none (paid later via a card payment).
 * A card linked to an account (e.g. Venmo) can be paid from that account's balance or from the
 * payment account (Checking); the first choice is the default.
 */
export function fundingChoices(lookups: Lookups | undefined, cardId: string | number | null): FundingChoice[] {
  if (!lookups || !cardId) return [];
  const card = lookups.cards.find((c) => c.id === Number(cardId));
  if (!card?.accountId) return [];
  const name = (id: number | null) => lookups.accounts.find((a) => a.id === id)?.name ?? '';
  const own = { value: String(card.accountId), label: `${name(card.accountId)} balance` };
  if (!lookups.paymentAccountId || lookups.paymentAccountId === card.accountId) return [own];
  return [own, { value: String(lookups.paymentAccountId), label: name(lookups.paymentAccountId) }];
}

/** Default funding account for a card, as a select value. */
export const defaultFunding = (lookups: Lookups | undefined, cardId: string | number | null) =>
  fundingChoices(lookups, cardId)[0]?.value ?? null;
