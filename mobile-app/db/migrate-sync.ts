import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Synchronous Drizzle migration runner.
 *
 * Drizzle's expo-sqlite `migrate()` is async; calling it un-awaited from
 * `getDb()` let FTS trigger DDL and first queries race a half-created schema
 * on FRESH installs ("no such table: inventory_items" → native abort). This
 * runner applies the bundled migrations with execSync so the schema is
 * guaranteed complete before getDb() returns.
 */

export interface MigrationsBundle {
  journal: { entries: Array<{ idx: number; when: number; tag: string }> };
  migrations: Record<string, string>;
}

const MIGRATIONS_TABLE =
  'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)';

/** Drizzle separates statements inside one migration file with this marker. */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function runMigrationsSync(sqlite: SQLiteDatabase, bundle: MigrationsBundle): void {
  sqlite.execSync(MIGRATIONS_TABLE);
  const appliedCount = sqlite.getAllSync<{ hash: string }>(
    'SELECT hash FROM "__drizzle_migrations"',
  ).length;
  const entries = [...bundle.journal.entries].sort((a, b) => a.idx - b.idx);
  // Rows may have been written by drizzle's async migrator (sha256 hashes) on
  // existing installs — count, not content, decides what still needs to run.
  const pending = entries.slice(appliedCount);
  for (const entry of pending) {
    const key = `m${String(entry.idx).padStart(4, '0')}`;
    const sql = bundle.migrations[key];
    if (!sql) continue;
    sqlite.withTransactionSync(() => {
      for (const stmt of splitSqlStatements(sql)) {
        sqlite.execSync(stmt);
      }
      sqlite.runSync('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)', [
        entry.tag,
        entry.when,
      ]);
    });
  }
}
