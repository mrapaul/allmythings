import { type ExpoSQLiteDatabase, drizzle } from 'drizzle-orm/expo-sqlite';
import { type SQLiteDatabase, openDatabaseSync } from 'expo-sqlite';
import { type MigrationsBundle, runMigrationsSync } from './migrate-sync';
import migrations from './migrations/migrations';
import * as schema from './schema';
import { ensureFtsSchema } from './triggers';

let _db: ExpoSQLiteDatabase<typeof schema> | null = null;

export function getDb(): ExpoSQLiteDatabase<typeof schema> {
  if (_db) return _db;
  const sqlite: SQLiteDatabase = openDatabaseSync('home-inventory.db', {
    enableChangeListener: true,
  });
  const db = drizzle(sqlite, { schema, logger: false });
  // Synchronous: the schema must exist before the FTS DDL below and before
  // any context issues its first query (fresh-install crash otherwise).
  runMigrationsSync(sqlite, migrations as MigrationsBundle);

  // FTS5 virtual table + sync triggers. Run via expo-sqlite's execSync, which
  // handles full DDL statements (including CREATE TRIGGER ... BEGIN ... END);
  // Drizzle's db.run() prepares a single statement and mangles the trigger body.
  // ensureFtsSchema also rebuilds + repopulates the index when an existing
  // install predates the `attributes` column.
  ensureFtsSchema({
    execSync: (sql) => sqlite.execSync(sql),
    getAllSync: (sql) => sqlite.getAllSync(sql),
  });
  _db = db;
  return db;
}

export { schema };
