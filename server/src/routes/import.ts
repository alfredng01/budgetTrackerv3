import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { importCommitInput, prepareImportInput, type PrepareImportResult } from '@budget/shared';
import { db } from '../db/index.js';
import { cardPayment, transaction } from '../db/schema.js';
import { HttpError, parseBody } from '../lib/http.js';
import { requireWriter } from '../middleware/auth.js';
import { categoryHistory, findDuplicates, findPaymentDuplicates } from '../services/importHelpers.js';
import { resolveFunding } from '../services/lookups.js';
import { extractStatementText, parseStatement, parserEnabled } from '../services/statementParser.js';

export const importRouter = Router();

const ALLOWED = /\.(pdf|csv|txt)$/i;

// memoryStorage: the upload lives only in RAM for the duration of the request; nothing touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.test(file.originalname)) cb(null, true);
    else cb(new HttpError(400, 'Only PDF, CSV or TXT statements are supported'));
  },
});

// Each parse is a paid API call; keep accidental double-submits and loops in check.
const parseLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

importRouter.get('/status', (_req, res) => {
  res.json({ enabled: parserEnabled() });
});

importRouter.post('/statement', requireWriter, parseLimiter, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'No file uploaded');
  try {
    const text = await extractStatementText(file.buffer, file.originalname, file.mimetype);
    res.json(await parseStatement(text, req.user!.id));
  } finally {
    // Scrub the in-memory copy so statement bytes don't linger until GC.
    file.buffer.fill(0);
  }
});

/**
 * CSV rows are parsed in the browser (the file never reaches the server); this only
 * flags likely duplicates and suggests categories from the user's past transactions.
 */
importRouter.post('/prepare', requireWriter, (req, res) => {
  const { rows } = parseBody(prepareImportInput, req.body);
  const userId = req.user!.id;
  const purchases = rows.filter((r) => !r.isPayment);
  const payments = rows.filter((r) => r.isPayment);
  const fromHistory = categoryHistory(userId);
  const result: PrepareImportResult = {};
  findDuplicates(purchases, userId).forEach((dup, i) => {
    result[purchases[i].key] = { possibleDuplicate: dup, categoryId: fromHistory(purchases[i].description) };
  });
  findPaymentDuplicates(payments, userId).forEach((dup, i) => {
    result[payments[i].key] = { possibleDuplicate: dup, categoryId: null };
  });
  res.json(result);
});

/** Saves reviewed import rows (purchases and card payments) in a single SQLite transaction. */
importRouter.post('/commit', requireWriter, (req, res) => {
  const { transactions, payments } = parseBody(importCommitInput, req.body);
  const userId = req.user!.id;
  db.transaction((tx) => {
    for (const t of transactions) {
      const fundingAccountId = resolveFunding(t.cardId, t.fundingAccountId);
      tx.insert(transaction).values({ ...t, fundingAccountId, userId, source: 'import' }).run();
    }
    for (const p of payments) tx.insert(cardPayment).values({ ...p, userId }).run();
  });
  res.status(201).json({ transactions: transactions.length, payments: payments.length });
});
