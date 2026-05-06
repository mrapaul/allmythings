import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { FTS_STATEMENTS } from './triggers';

export function makeTestDb(): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  const migrationDir = path.resolve(__dirname, './migrations');
  const sqlFiles = fs
    .readdirSync(migrationDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of sqlFiles) {
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }
  for (const stmt of FTS_STATEMENTS) sqlite.exec(stmt);
  return drizzle(sqlite, { schema, logger: false });
}
