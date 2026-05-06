import { type ExpoSQLiteDatabase, drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { type SQLiteDatabase, openDatabaseSync } from 'expo-sqlite';
import migrations from './migrations/migrations';
import * as schema from './schema';
import { FTS_STATEMENTS } from './triggers';

let _db: ExpoSQLiteDatabase<typeof schema> | null = null;

export function getDb(): ExpoSQLiteDatabase<typeof schema> {
  if (_db) return _db;
  const sqlite: SQLiteDatabase = openDatabaseSync('home-inventory.db', {
    enableChangeListener: true,
  });
  const db = drizzle(sqlite, { schema, logger: false });
  void migrate(db, migrations);

  for (const stmt of FTS_STATEMENTS) {
    void db.run(stmt as unknown as never);
  }
  _db = db;
  return db;
}

export { schema };
