import { Router } from 'express';
import { settingsInput } from '@budget/shared';
import { parseBody } from '../lib/http.js';
import { getLookups, saveSettings } from '../services/lookups.js';

/** Category / card configuration. Any signed-in user (including the admin) may edit it. */
export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json(getLookups());
});

settingsRouter.put('/', (req, res) => {
  res.json(saveSettings(parseBody(settingsInput, req.body)));
});
