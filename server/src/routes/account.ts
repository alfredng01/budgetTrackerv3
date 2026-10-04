import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { resetUserPassword } from '../auth.js';
import { db } from '../db/index.js';
import { user } from '../db/schema.js';
import { HttpError, parseBody } from '../lib/http.js';
import { requireSelfService, selfServiceAllowed } from '../lib/selfService.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { getLookups } from '../services/lookups.js';

/** Routes that don't require a session (login-page options, password reset). */
export const publicAccountRouter = Router();

/** Tells the login page whether to offer Sign up / Forgot password for this connection. */
publicAccountRouter.get('/login-options', (req, res) => {
  res.json({ selfService: selfServiceAllowed(req) });
});

const resetLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

const resetInput = z.object({
  username: z.string().trim().min(1),
  newPassword: z.string().min(8).max(128),
});

publicAccountRouter.post('/reset-password', requireSelfService, resetLimiter, async (req, res) => {
  const { username, newPassword } = parseBody(resetInput, req.body);
  const ok = await resetUserPassword(username, newPassword);
  if (!ok) throw new HttpError(404, 'No account with that username');
  res.json({ ok: true });
});

/** Authenticated helpers: current user, lookups, user list for the admin. */
export const accountRouter = Router();
accountRouter.use(requireAuth);

accountRouter.get('/me', (req, res) => {
  res.json(req.user);
});

accountRouter.get('/lookups', (_req, res) => {
  res.json(getLookups());
});

accountRouter.get('/users', requireAdmin, (_req, res) => {
  const rows = db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(eq(user.role, 'user'))
    .orderBy(asc(user.username))
    .all();
  res.json(rows);
});
