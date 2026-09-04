import { describe, expect, it } from 'vitest';
import { isPendingCapture, removePendingCapture, upsertPendingCapture } from './pending-captures';

describe('upsertPendingCapture', () => {
  it('appends a new capture with zero attempts', () => {
    // Arrange + Act
    const list = upsertPendingCapture([], 'file:///a.jpg', 1000);

    // Assert
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ imageUri: 'file:///a.jpg', createdAt: 1000, attempts: 0 });
  });

  it('bumps attempts for an already-queued capture without mutating the input', () => {
    // Arrange
    const original = upsertPendingCapture([], 'file:///a.jpg', 1000);

    // Act
    const bumped = upsertPendingCapture(original, 'file:///a.jpg', 2000);

    // Assert
    expect(bumped[0]?.attempts).toBe(1);
    expect(original[0]?.attempts).toBe(0);
    expect(bumped).toHaveLength(1);
  });
});

describe('removePendingCapture', () => {
  it('removes only the matching capture', () => {
    // Arrange
    const list = upsertPendingCapture(
      upsertPendingCapture([], 'file:///a.jpg', 1),
      'file:///b.jpg',
      2,
    );

    // Act
    const next = removePendingCapture(list, 'file:///a.jpg');

    // Assert
    expect(next).toHaveLength(1);
    expect(next[0]?.imageUri).toBe('file:///b.jpg');
  });
});

describe('isPendingCapture', () => {
  it('accepts a well-formed capture and rejects malformed values', () => {
    expect(
      isPendingCapture({ id: 'c1', imageUri: 'file:///a.jpg', createdAt: 1, attempts: 0 }),
    ).toBe(true);
    expect(isPendingCapture(null)).toBe(false);
    expect(isPendingCapture({ imageUri: 'file:///a.jpg' })).toBe(false);
  });
});
