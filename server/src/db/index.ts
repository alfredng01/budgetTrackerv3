import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from '../env.js';
import * as schema from './schema.js';

const dbPath = path.resolve(env.DATABASE_PATH);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const sqlite = new Database(dbPath);
// WAL gives concurrent reads during writes; NORMAL sync is safe with WAL and much faster.
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;

export function runMigrations() {
  migrate(db, { migrationsFolder: path.resolve('drizzle') });
}
