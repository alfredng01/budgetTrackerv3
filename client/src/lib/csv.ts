import Papa from 'papaparse';
import { toCents } from '@budget/shared';

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export interface CsvMapping {
  date: string | null;
  description: string | null;
  amountMode: 'single' | 'split';
  amount: string | null;
  debit: string | null;
  credit: string | null;
  /** Single-column mode: how purchases appear in this bank's export. */
  purchasesAre: 'positive' | 'negative';
}

export interface CsvTransaction {
  date: string;
  description: string;
  /** Positive = spend, negative = refund/credit (the app's convention). */
  amountCents: number;
  /** Card payments are recorded as payments, not spending. */
  kind: 'purchase' | 'payment';
  flag: string | null;
}

/** Parses the file in the browser; nothing is uploaded. Skips preamble lines above the header. */
export function readCsv(file: File): Promise<CsvTable> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      complete: ({ data }) => {
        const scan = data.slice(0, 20);
        let headerIdx = scan.findIndex((r) => r.some((c) => /date/i.test(c)) && r.filter((c) => c.trim()).length >= 3);
        if (headerIdx < 0) headerIdx = 0;
        const headers = (data[headerIdx] ?? []).map((h, i) => h.trim() || `Column ${i + 1}`);
        const rows = data.slice(headerIdx + 1).filter((r) => r.filter((c) => c.trim()).length >= 2);
        if (headers.length < 2 || rows.length === 0) reject(new Error('No transactions found in this CSV'));
        else resolve({ headers, rows });
      },
      error: (err) => reject(err),
    });
  });
}

const find = (headers: string[], ...patterns: RegExp[]) => {
  for (const p of patterns) {
    const h = headers.find((x) => p.test(x));
    if (h) return h;
  }
  return null;
};

/** Best-effort column detection for common bank exports (Chase, Discover, Amex, Capital One, Apple...). */
export function guessMapping(table: CsvTable): CsvMapping {
  const h = table.headers;
  const debit = find(h, /debit/i, /withdraw/i, /money out/i);
  const credit = find(h, /credit/i, /deposit/i, /money in/i);
  const amount = find(h, /^amount/i, /amount/i);
  const mapping: CsvMapping = {
    date: find(h, /trans(action)?\.? ?date/i, /^date$/i, /^(?!.*post).*date/i, /date/i),
    description: find(h, /description/i, /merchant/i, /payee/i, /^name$/i, /details/i, /memo/i),
    amountMode: debit && credit && !amount ? 'split' : 'single',
    amount,
    debit,
    credit,
    purchasesAre: 'positive',
  };
  if (amount) mapping.purchasesAre = guessPurchaseSign(table, h.indexOf(amount), mapping.description);
  return mapping;
}

/** Descriptions that are always money coming in, whatever the account type. */
const CREDIT_MARKER = /thank you|payroll|dir(ect)? ?dep/i;

/**
 * Purchases have the opposite sign to known credits ("PAYMENT - THANK YOU", payroll);
 * without any, assume the majority sign is purchases.
 */
function guessPurchaseSign(table: CsvTable, amountIdx: number, descCol: string | null): CsvMapping['purchasesAre'] {
  const descIdx = descCol ? table.headers.indexOf(descCol) : -1;
  let creditSign = 0;
  let negatives = 0;
  let total = 0;
  for (const r of table.rows) {
    const v = parseAmount(r[amountIdx] ?? '');
    if (!v) continue;
    total++;
    if (v < 0) negatives++;
    if (descIdx >= 0 && CREDIT_MARKER.test(r[descIdx] ?? '')) creditSign += Math.sign(v);
  }
  if (creditSign !== 0) return creditSign > 0 ? 'negative' : 'positive';
  return negatives > total / 2 ? 'negative' : 'positive';
}

export function parseDate(raw: string): string | null {
  const s = raw.trim();
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m && valid(+m[2], +m[3])) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (valid(+m[1], +m[2])) return `${y}-${pad(+m[1])}-${pad(+m[2])}`;
  }

  // Textual dates such as "Oct 1, 2026".
  if (/[a-z]/i.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

/** "$1,234.56", "(12.00)", "12.00-", "-5" -> dollars as a number. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/usd|[$,\s]/gi, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

const CARD_PAYMENT = /payment\s*(-\s*)?thank|autopay|auto pay|online payment|payment received|e-?payment|crd(t)? (pmt|epay)|card payment|mobile payment|payment to/i;
const INCOMING = /payroll|direct dep|dir dep|deposit|transfer from|zelle from|interest (paid|payment)|venmo cashout/i;
const OUTGOING_TRANSFER = /transfer to|online transfer|to savings|to checking/i;

/** Applies the column mapping. Rows with an unreadable date or amount are counted, not guessed. */
export function applyMapping(table: CsvTable, m: CsvMapping): { rows: CsvTransaction[]; unreadable: number } {
  const col = (name: string | null) => (name ? table.headers.indexOf(name) : -1);
  const [di, desci, ai, debi, credi] = [col(m.date), col(m.description), col(m.amount), col(m.debit), col(m.credit)];

  const rows: CsvTransaction[] = [];
  let unreadable = 0;
  for (const r of table.rows) {
    const date = parseDate(r[di] ?? '');
    const description = (r[desci] ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);

    let spend: number | null;
    if (m.amountMode === 'single') {
      const v = parseAmount(r[ai] ?? '');
      spend = v === null ? null : m.purchasesAre === 'positive' ? v : -v;
    } else {
      const out = parseAmount(r[debi] ?? '');
      const inc = parseAmount(r[credi] ?? '');
      spend = out === null && inc === null ? null : Math.abs(out ?? 0) - Math.abs(inc ?? 0);
    }

    if (!date || spend === null || spend === 0 || !description) {
      unreadable++;
      continue;
    }

    if (CARD_PAYMENT.test(description)) {
      rows.push({ date, description, amountCents: Math.abs(toCents(spend)), kind: 'payment', flag: null });
      continue;
    }
    let flag: string | null = null;
    if (spend < 0 && INCOMING.test(description)) flag = 'Looks like a deposit';
    else if (OUTGOING_TRANSFER.test(description)) flag = 'Looks like a transfer';

    rows.push({ date, description, amountCents: toCents(spend), kind: 'purchase', flag });
  }
  return { rows, unreadable };
}
