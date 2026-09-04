import {
  type MergeSuggestion,
  computeLocalSuggestions,
  mergeSuggestionLists,
  parseServerSuggestions,
  pruneSuggestions,
} from '@/lib/suggestions';
import type { Prefs } from '@/stores/prefs';
import type { InventoryItem } from '@/types/inventory';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * Reactive tidy-up queue, mirrored into MMKV. Dismissals are permanent, so
 * the store keeps them separately and every write filters against them.
 */

interface SuggestionsState {
  suggestions: MergeSuggestion[];
}

const store = createStore<SuggestionsState>(() => ({ suggestions: [] }));
let prefsRef: Prefs | null = null;

/** True when two queues hold the same pairs in the same order. */
function sameQueue(a: MergeSuggestion[], b: MergeSuggestion[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.id === b[i]?.id);
}

/**
 * Writes only on a real change. The background scan is re-run whenever the
 * collection changes, so an unconditional setState here would publish a new
 * array reference on every pass and spin any subscriber that re-renders.
 */
function commit(suggestions: MergeSuggestion[]): void {
  if (sameQueue(store.getState().suggestions, suggestions)) return;
  store.setState({ suggestions });
  prefsRef?.setMergeSuggestions(suggestions);
}

export function initSuggestionsStore(prefs: Prefs): void {
  prefsRef = prefs;
  store.setState({ suggestions: prefs.getMergeSuggestions() });
}

function dismissedKeys(): string[] {
  return prefsRef?.getDismissedSuggestions() ?? [];
}

/**
 * Background scan: recompute local duplicate pairs across the whole
 * inventory, fold them in with anything already queued, and drop pairs whose
 * items are gone. Cheap and idempotent — safe to run whenever items change.
 */
export function refreshLocalSuggestions(items: InventoryItem[]): void {
  const existing = pruneSuggestions(
    store.getState().suggestions,
    items.map((i) => i.id),
  );
  commit(mergeSuggestionLists(existing, computeLocalSuggestions(items), dismissedKeys()));
}

/** Folds a server `mergeSuggestions` payload in (no-op when absent/malformed). */
export function addServerSuggestions(payload: unknown): void {
  const incoming = parseServerSuggestions(payload);
  if (incoming.length === 0) return;
  commit(mergeSuggestionLists(store.getState().suggestions, incoming, dismissedKeys()));
}

/** Removes a resolved pair from the queue (merge performed). */
export function resolveSuggestion(id: string): void {
  commit(store.getState().suggestions.filter((s) => s.id !== id));
}

/** "Not the same" — removed now and never suggested again. */
export function dismissSuggestion(id: string): void {
  if (prefsRef) {
    const next = prefsRef.getDismissedSuggestions();
    if (!next.includes(id)) prefsRef.setDismissedSuggestions([...next, id]);
  }
  resolveSuggestion(id);
}

export function useSuggestionsStore<T>(selector: (s: SuggestionsState) => T): T {
  return useStore(store, selector);
}

export function getSuggestionsStore() {
  return store;
}
