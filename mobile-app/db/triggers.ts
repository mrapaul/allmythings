// Additional DDL applied after the drizzle migration. Splitting per-statement
// is required for any SQLite client that runs single-statement prepared
// statements (most of them).
//
// The FTS corpus indexes label, description, category, tags, and the VALUES
// of the `attributes` JSON ({color: "gold"} indexes "gold", not "color"), so
// searching an attribute finds items whose visible title never mentions it.

/** Attribute JSON → space-joined values ('' when null/absent). */
const ATTRIBUTE_VALUES = (col: string) =>
  `CASE WHEN ${col} IS NULL THEN ''
        ELSE COALESCE((SELECT GROUP_CONCAT(value, ' ') FROM json_each(${col})), '')
   END`;

/**
 * Labels JSON ([{key, value}, …]) → "key value key value …" so both plain
 * value searches ("gold") and key:value searches ("color gold" after query
 * sanitization) match.
 */
const LABEL_TERMS = (col: string) =>
  `CASE WHEN ${col} IS NULL THEN ''
        ELSE COALESCE((SELECT GROUP_CONCAT(
               json_extract(value, '$.key') || ' ' || json_extract(value, '$.value'), ' ')
             FROM json_each(${col})), '')
   END`;

export const FTS_STATEMENTS: string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS inventory_fts USING fts5(
     item_id UNINDEXED,
     label,
     description,
     category,
     tags,
     attributes,
     labels,
     tokenize = 'porter unicode61'
   );`,

  `CREATE TRIGGER IF NOT EXISTS inventory_items_ai
   AFTER INSERT ON inventory_items
   BEGIN
     INSERT INTO inventory_fts (item_id, label, description, category, tags, attributes, labels)
     VALUES (
       NEW.id,
       NEW.label,
       NEW.description,
       NEW.category,
       COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.id), ''),
       ${ATTRIBUTE_VALUES('NEW.attributes')},
       ${LABEL_TERMS('NEW.labels')}
     );
   END;`,

  `CREATE TRIGGER IF NOT EXISTS inventory_items_au
   AFTER UPDATE ON inventory_items
   BEGIN
     DELETE FROM inventory_fts WHERE item_id = OLD.id;
     INSERT INTO inventory_fts (item_id, label, description, category, tags, attributes, labels)
     VALUES (
       NEW.id,
       NEW.label,
       NEW.description,
       NEW.category,
       COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.id), ''),
       ${ATTRIBUTE_VALUES('NEW.attributes')},
       ${LABEL_TERMS('NEW.labels')}
     );
   END;`,

  `CREATE TRIGGER IF NOT EXISTS inventory_items_ad
   AFTER DELETE ON inventory_items
   BEGIN
     DELETE FROM inventory_fts WHERE item_id = OLD.id;
   END;`,

  `CREATE TRIGGER IF NOT EXISTS item_tags_ai
   AFTER INSERT ON item_tags
   BEGIN
     UPDATE inventory_fts
        SET tags = COALESCE(
          (SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.item_id), ''
        )
      WHERE item_id = NEW.item_id;
   END;`,

  `CREATE TRIGGER IF NOT EXISTS item_tags_ad
   AFTER DELETE ON item_tags
   BEGIN
     UPDATE inventory_fts
        SET tags = COALESCE(
          (SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = OLD.item_id), ''
        )
      WHERE item_id = OLD.item_id;
   END;`,
];

/**
 * Statements that tear down the previous FTS shape. The triggers must go
 * with the table: `CREATE TRIGGER IF NOT EXISTS` never updates an existing
 * trigger, so stale trigger bodies would keep writing the old column list.
 */
export const FTS_DROP_STATEMENTS: string[] = [
  'DROP TABLE IF EXISTS inventory_fts;',
  'DROP TRIGGER IF EXISTS inventory_items_ai;',
  'DROP TRIGGER IF EXISTS inventory_items_au;',
  'DROP TRIGGER IF EXISTS inventory_items_ad;',
  'DROP TRIGGER IF EXISTS item_tags_ai;',
  'DROP TRIGGER IF EXISTS item_tags_ad;',
];

/** Refills the index from the source tables after a shape rebuild. */
export const FTS_REPOPULATE = `
  INSERT INTO inventory_fts (item_id, label, description, category, tags, attributes, labels)
  SELECT id, label, description, category,
    COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = inventory_items.id), ''),
    ${ATTRIBUTE_VALUES('inventory_items.attributes')},
    ${LABEL_TERMS('inventory_items.labels')}
  FROM inventory_items;`;

/** Columns any current-shape FTS table must carry. */
const FTS_REQUIRED_COLUMNS = ['attributes', 'labels'];

/** True when an existing FTS table predates the current column set. */
export function ftsNeedsRebuild(existingColumns: string[]): boolean {
  return (
    existingColumns.length > 0 && FTS_REQUIRED_COLUMNS.some((col) => !existingColumns.includes(col))
  );
}

/** Minimal sync surface shared by expo-sqlite and test adapters. */
export interface FtsSqlite {
  execSync(sql: string): void;
  getAllSync(sql: string): unknown[];
}

/**
 * Idempotent FTS bootstrap: detects a stale table shape (pre-`attributes`
 * installs), drops table + triggers, recreates the current shape, and
 * repopulates from the source tables. Fresh installs just create.
 */
export function ensureFtsSchema(sqlite: FtsSqlite): void {
  const cols = (
    sqlite.getAllSync("SELECT name FROM pragma_table_info('inventory_fts')") as {
      name: string;
    }[]
  ).map((c) => c.name);
  const rebuild = ftsNeedsRebuild(cols);
  if (rebuild) {
    for (const stmt of FTS_DROP_STATEMENTS) sqlite.execSync(stmt);
  }
  for (const stmt of FTS_STATEMENTS) sqlite.execSync(stmt);
  if (rebuild) sqlite.execSync(FTS_REPOPULATE);
}
