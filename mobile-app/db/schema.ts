import type { ItemAttributes } from '@/lib/attributes';
import type { ItemLabel } from '@/lib/labels';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const homes = sqliteTable('homes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const inventoryItems = sqliteTable(
  'inventory_items',
  {
    id: text('id').primaryKey(),
    homeId: text('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull(),
    primaryPhotoUri: text('primary_photo_uri').notNull(),
    /**
     * Pre-rendered per-item crop (bbox + padding from the capture) shown in
     * grid/list tiles. Null for legacy items and full-frame captures — tiles
     * then fall back to the runtime bbox-zoom transform.
     */
    thumbnailUri: text('thumbnail_uri'),
    /**
     * Characteristics from the detect response ({color, material, style,
     * brand, era}). Null for legacy/manual items — the UI derives a
     * render-time fallback from label + description (lib/attributes.ts).
     */
    attributes: text('attributes', { mode: 'json' }).$type<ItemAttributes | null>(),
    /**
     * Label-first model: ordered {key, value} chips (type/category/color/…
     * plus free 'tag' labels). Null → derived at render from the legacy
     * columns, which stay untouched as non-editable internals.
     */
    labels: text('labels', { mode: 'json' }).$type<ItemLabel[] | null>(),
    additionalPhotoUris: text('additional_photo_uris', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    boxX: real('box_x').notNull(),
    boxY: real('box_y').notNull(),
    boxWidth: real('box_width').notNull(),
    boxHeight: real('box_height').notNull(),
    notes: text('notes').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    homeIdx: index('inventory_items_home_idx').on(t.homeId),
    createdAtIdx: index('inventory_items_created_at_idx').on(t.createdAt),
  }),
);

export const itemTags = sqliteTable(
  'item_tags',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.itemId, t.tag] }),
    itemIdx: index('item_tags_item_idx').on(t.itemId),
    tagIdx: index('item_tags_tag_idx').on(t.tag),
  }),
);

export type HomeRow = typeof homes.$inferSelect;
export type ItemRow = typeof inventoryItems.$inferSelect;
export type TagRow = typeof itemTags.$inferSelect;
