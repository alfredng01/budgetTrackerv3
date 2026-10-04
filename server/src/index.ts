import { env } from './env.js';
import { ensureAdminUser } from './auth.js';
import { runMigrations, sqlite } from './db/index.js';
import { syncLookupsFromConfig } from './services/lookups.js';
import { parserEnabled } from './services/statementParser.js';
import { createApp } from './app.js';

runMigrations();
syncLookupsFromConfig();
await ensureAdminUser();

const server = createApp().listen(env.PORT, () => {
  console.log(`Budget tracker listening on :${env.PORT} (${env.NODE_ENV})`);
  console.log(`Statement parser: ${parserEnabled() ? env.STATEMENT_PARSER_MODEL : 'disabled (no ANTHROPIC_API_KEY)'}`);
});

function shutdown() {
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
