// Additional DDL applied after the drizzle migration. Splitting per-statement
// is required for any SQLite client that runs single-statement prepared
// statements (most of them).
export const FTS_STATEMENTS: string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS inventory_fts USING fts5(
     item_id UNINDEXED,
     label,
     description,
     category,
     tags,
     tokenize = 'porter unicode61'
   );`,

  `CREATE TRIGGER IF NOT EXISTS inventory_items_ai
   AFTER INSERT ON inventory_items
   BEGIN
     INSERT INTO inventory_fts (item_id, label, description, category, tags)
     VALUES (
       NEW.id,
       NEW.label,
       NEW.description,
       NEW.category,
       COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.id), '')
     );
   END;`,

  `CREATE TRIGGER IF NOT EXISTS inventory_items_au
   AFTER UPDATE ON inventory_items
   BEGIN
     DELETE FROM inventory_fts WHERE item_id = OLD.id;
     INSERT INTO inventory_fts (item_id, label, description, category, tags)
     VALUES (
       NEW.id,
       NEW.label,
       NEW.description,
       NEW.category,
       COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.id), '')
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
