/**
 * Identical detections in one photo become one review row.
 *
 * A stack of nine books is nine correct detections and nine identical labels.
 * As inventory rows that is noise: indistinguishable entries, nine taps, and a
 * collection you cannot search meaningfully. Rows whose label matches exactly
 * are therefore shown once with a count, and can still be expanded and saved
 * individually — the data is never collapsed, only the presentation.
 */

/** Below this, showing each row separately is clearer than a count. */
export const MIN_GROUP_SIZE = 3;

export interface GroupableRow {
  id: string;
  label: string;
}

export interface RowGroup {
  /** Stable key: the normalized label the group formed on. */
  key: string;
  /** Row ids in their original order; the first is the one rendered. */
  rowIds: string[];
  label: string;
}

function normalize(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Groups consecutive-or-not rows by exact normalized label, preserving the
 * order in which each label first appeared. Groups smaller than
 * MIN_GROUP_SIZE are returned as single-row groups, so callers can render
 * one code path for everything.
 */
export function groupRows(rows: readonly GroupableRow[]): RowGroup[] {
  const byLabel = new Map<string, RowGroup>();
  const order: string[] = [];
  for (const row of rows) {
    const key = normalize(row.label);
    const existing = byLabel.get(key);
    if (existing) {
      existing.rowIds.push(row.id);
      continue;
    }
    byLabel.set(key, { key, rowIds: [row.id], label: row.label });
    order.push(key);
  }
  const groups: RowGroup[] = [];
  for (const key of order) {
    const group = byLabel.get(key);
    if (!group) continue;
    if (group.rowIds.length < MIN_GROUP_SIZE) {
      // Too small to be worth a count: emit each row on its own.
      for (const id of group.rowIds) groups.push({ key: id, rowIds: [id], label: group.label });
      continue;
    }
    groups.push(group);
  }
  return groups;
}

/** How the count chip reads; empty for a group of one. */
export function groupCountLabel(group: RowGroup): string {
  return group.rowIds.length > 1 ? `× ${group.rowIds.length}` : '';
}
