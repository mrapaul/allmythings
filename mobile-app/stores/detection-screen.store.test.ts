import type { DetectedItem } from '@/api/types';
import { describe, expect, it } from 'vitest';
import { createDetectionStore } from './detection-screen.store';

const sample: DetectedItem = {
  label: 'Sofa',
  description: '',
  category: 'Furniture',
  tags: ['leather'],
  box: { x: 0, y: 0, width: 0.4, height: 0.4 },
};

describe('detectionStore', () => {
  it('transitions loading → streaming on first item, → review on done', () => {
    const s = createDetectionStore();
    expect(s.getState().phase).toBe('loading');
    s.getState().handleEvent({ type: 'meta', runId: 'r', traceId: 't' });
    expect(s.getState().phase).toBe('loading');
    s.getState().handleEvent({ type: 'item', item: sample });
    expect(s.getState().phase).toBe('streaming');
    expect(s.getState().rows).toHaveLength(1);
    s.getState().handleEvent({ type: 'done', runId: 'r', totalItems: 1 });
    expect(s.getState().phase).toBe('review');
  });

  it('toggles row include', () => {
    const s = createDetectionStore();
    s.getState().handleEvent({ type: 'item', item: sample });
    const id = s.getState().rows[0]?.id;
    expect(id).toBeTruthy();
    if (!id) return;
    s.getState().toggleInclude(id);
    expect(s.getState().rows[0]?.included).toBe(false);
  });

  it('marks rows as saving during save and saved after', () => {
    const s = createDetectionStore();
    s.getState().handleEvent({ type: 'item', item: sample });
    const id = s.getState().rows[0]?.id;
    expect(id).toBeTruthy();
    if (!id) return;
    s.getState().beginSave([id]);
    expect(s.getState().rows[0]?.saving).toBe(true);
    s.getState().endSave([id]);
    expect(s.getState().rows[0]?.saving).toBe(false);
    expect(s.getState().rows[0]?.saved).toBe(true);
  });

  it('captures runId and traceId on meta', () => {
    const s = createDetectionStore();
    s.getState().handleEvent({ type: 'meta', runId: 'r-1', traceId: 't-1' });
    expect(s.getState().runId).toBe('r-1');
    expect(s.getState().traceId).toBe('t-1');
  });

  it('captures error and moves to review', () => {
    const s = createDetectionStore();
    s.getState().handleEvent({ type: 'error', code: 'rate_limited', message: 'slow down' });
    expect(s.getState().phase).toBe('review');
    expect(s.getState().errorCode).toBe('rate_limited');
    expect(s.getState().errorMessage).toBe('slow down');
  });

  it('reset clears everything', () => {
    const s = createDetectionStore();
    s.getState().handleEvent({ type: 'meta', runId: 'r', traceId: 't' });
    s.getState().handleEvent({ type: 'item', item: sample });
    s.getState().reset();
    const state = s.getState();
    expect(state.phase).toBe('loading');
    expect(state.rows).toHaveLength(0);
    expect(state.runId).toBeNull();
    expect(state.traceId).toBeNull();
  });
});
