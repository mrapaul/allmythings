import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';
import { type MigrationsBundle, runMigrationsSync, splitSqlStatements } from './migrate-sync';

/** Adapt better-sqlite3 to the expo-sqlite sync surface the runner uses. */
function expoLike(sqlite: InstanceType<typeof Database>): SQLiteDatabase {
  return {
    execSync: (sql: string) => sqlite.exec(sql),
    getAllSync: (sql: string) => sqlite.prepare(sql).all(),
    runSync: (sql: string, params: unknown[]) => sqlite.prepare(sql).run(...(params as [])),
    withTransactionSync: (fn: () => void) => sqlite.transaction(fn)(),
  } as unknown as SQLiteDatabase;
}

function loadRealBundle(): MigrationsBundle {
  const dir = path.resolve(__dirname, './migrations');
  const journal = JSON.parse(fs.readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8'));
  const migrations: Record<string, string> = {};
  for (const entry of journal.entries) {
    const key = `m${String(entry.idx).padStart(4, '0')}`;
    migrations[key] = fs.readFileSync(path.join(dir, `${entry.tag}.sql`), 'utf8');
  }
  return { journal, migrations };
}

describe('splitSqlStatements', () => {
  it('splits on the drizzle breakpoint marker and drops empties', () => {
    const out = splitSqlStatements(
      'CREATE TABLE a (x);--> statement-breakpoint\n\nCREATE INDEX i ON a (x);--> statement-breakpoint',
    );
    expect(out).toEqual(['CREATE TABLE a (x);', 'CREATE INDEX i ON a (x);']);
  });
});

describe('runMigrationsSync', () => {
  it('creates the full schema on a fresh database before returning', () => {
    const raw = new Database(':memory:');
    runMigrationsSync(expoLike(raw), loadRealBundle());
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain('inventory_items');
    expect(tables).toContain('__drizzle_migrations');
  });

  it('is idempotent across launches', () => {
    const raw = new Database(':memory:');
    const bundle = loadRealBundle();
    runMigrationsSync(expoLike(raw), bundle);
    expect(() => runMigrationsSync(expoLike(raw), bundle)).not.toThrow();
    const rows = raw.prepare('SELECT COUNT(*) AS n FROM "__drizzle_migrations"').get() as {
      n: number;
    };
    expect(rows.n).toBe(bundle.journal.entries.length);
  });

  it('skips migrations already applied by the old async migrator (hash rows)', () => {
    const raw = new Database(':memory:');
    const bundle = loadRealBundle();
    // Simulate an existing install: schema present, drizzle-style sha rows.
    runMigrationsSync(expoLike(raw), bundle);
    raw.exec('DELETE FROM "__drizzle_migrations"');
    raw
      .prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)')
      .run('sha256-of-something', Date.now());
    expect(() => runMigrationsSync(expoLike(raw), bundle)).not.toThrow();
  });
});
