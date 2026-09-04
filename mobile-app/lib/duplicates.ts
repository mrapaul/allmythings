import type { ItemLabel } from './labels';

/**
 * Cheap client-side duplicate heuristic for review rows: a row is a
 * "possible duplicate" when an existing inventory item shares its type AND
 * its color (or both lack a color). Suggest-never-auto: flagged rows start
 * excluded from save-all but are one tap away from inclusion.
 */

function labelValue(labels: ItemLabel[], key: string): string | null {
  const v = labels.find((l) => l.key === key)?.value;
  return v ? v.toLowerCase() : null;
}

export function isPossibleDuplicate(
  rowLabels: ItemLabel[],
  inventoryLabelSets: ItemLabel[][],
): boolean {
  const type = labelValue(rowLabels, 'type');
  if (!type) return false;
  const color = labelValue(rowLabels, 'color');
  return inventoryLabelSets.some(
    (set) => labelValue(set, 'type') === type && labelValue(set, 'color') === color,
  );
}
