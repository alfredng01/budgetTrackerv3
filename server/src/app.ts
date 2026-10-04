import fs from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';
import multer from 'multer';
import { auth, CLIENT_IP_HEADER } from './auth.js';
import { env } from './env.js';
import { HttpError } from './lib/http.js';
import { requireSelfService } from './lib/selfService.js';
import { requireAuth } from './middleware/auth.js';
import { accountRouter, publicAccountRouter } from './routes/account.js';
import { accountsRouter } from './routes/accounts.js';
import { allowanceRouter } from './routes/allowance.js';
import { budgetsRouter } from './routes/budgets.js';
import { dashboardRouter } from './routes/dashboard.js';
import { importRouter } from './routes/import.js';
import { incomeRouter } from './routes/income.js';
import { paymentsRouter } from './routes/payments.js';
import { settingsRouter } from './routes/settings.js';
import { transactionsRouter } from './routes/transactions.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) {
    const hops = Number(env.TRUST_PROXY);
    app.set('trust proxy', Number.isInteger(hops) ? hops : env.TRUST_PROXY.split(',').map((s) => s.trim()));
  }
  app.use(
    helmet({
      // Served over plain HTTP on the LAN; HSTS/upgrade-insecure-requests would break that.
      strictTransportSecurity: false,
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );

  // Hand Better Auth the client IP Express resolved (socket address, or X-Forwarded-For from a
  // trusted proxy). Overwriting the header means a client can't spoof it to dodge rate limits.
  app.use((req, _res, next) => {
    req.headers[CLIENT_IP_HEADER] = req.ip ?? req.socket.remoteAddress ?? '';
    next();
  });

  app.use('/api/auth/sign-up', requireSelfService);
  // Better Auth must see the raw body, so it's mounted before express.json().
  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/account', publicAccountRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/transactions', requireAuth, transactionsRouter);
  app.use('/api/income', requireAuth, incomeRouter);
  app.use('/api/budgets', requireAuth, budgetsRouter);
  app.use('/api/dashboard', requireAuth, dashboardRouter);
  app.use('/api/import', requireAuth, importRouter);
  app.use('/api/settings', requireAuth, settingsRouter);
  app.use('/api/accounts', requireAuth, accountsRouter);
  app.use('/api/payments', requireAuth, paymentsRouter);
  app.use('/api/allowance', requireAuth, allowanceRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // In production the built React app is served from the same origin.
  const clientDist = path.resolve(process.env.CLIENT_DIST ?? '../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 15 MB)' : err.message });
      return;
    }
    // e.g. a cardId/accountId that doesn't exist
    if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      res.status(400).json({ error: 'Refers to a card, category or account that does not exist' });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'Malformed request' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
