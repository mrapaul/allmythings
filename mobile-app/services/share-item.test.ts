import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ShareModule,
  buildShareMessage,
  setShareModuleForTests,
  shareItemCard,
} from './share-item';

const ITEM = { label: 'Pendant lamp', createdAt: 1_763_000_000_000 };

function shareMock(impl?: () => Promise<unknown>): ShareModule & {
  share: ReturnType<typeof vi.fn>;
} {
  return { share: vi.fn(impl ?? (async () => ({}))) };
}

afterEach(() => {
  setShareModuleForTests(undefined);
});

describe('buildShareMessage', () => {
  it('is Label — added <date> without a location', () => {
    const added = new Date(ITEM.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    expect(buildShareMessage(ITEM)).toBe(`Pendant lamp — added ${added}`);
  });

  it('slots the location between label and date when present', () => {
    expect(buildShareMessage({ ...ITEM, location: 'Attic' })).toBe(
      `Pendant lamp — Attic — added ${new Date(ITEM.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })}`,
    );
  });

  it('ignores blank locations', () => {
    expect(buildShareMessage({ ...ITEM, location: '  ' })).toBe(buildShareMessage(ITEM));
  });
});

describe('shareItemCard', () => {
  it('shares message + photo url when a photo is available', async () => {
    const mock = shareMock();
    setShareModuleForTests(mock);
    const result = await shareItemCard(ITEM, 'file:///lamp.jpg');
    expect(result).toBe('shared');
    expect(mock.share).toHaveBeenCalledTimes(1);
    expect(mock.share).toHaveBeenCalledWith({
      message: buildShareMessage(ITEM),
      url: 'file:///lamp.jpg',
    });
  });

  it('goes text-only when there is no photo', async () => {
    const mock = shareMock();
    setShareModuleForTests(mock);
    const result = await shareItemCard(ITEM);
    expect(result).toBe('text-only');
    expect(mock.share).toHaveBeenCalledWith({ message: buildShareMessage(ITEM) });
  });

  it('falls back to text-only when the photo share is rejected', async () => {
    const mock = shareMock();
    mock.share
      .mockRejectedValueOnce(new Error('file refused'))
      .mockResolvedValueOnce({ action: 'sharedAction' });
    setShareModuleForTests(mock);
    const result = await shareItemCard(ITEM, 'file:///lamp.jpg');
    expect(result).toBe('text-only');
    expect(mock.share).toHaveBeenCalledTimes(2);
    expect(mock.share).toHaveBeenNthCalledWith(1, {
      message: buildShareMessage(ITEM),
      url: 'file:///lamp.jpg',
    });
    expect(mock.share).toHaveBeenNthCalledWith(2, { message: buildShareMessage(ITEM) });
  });

  it('resolves unavailable when the text-only share also fails', async () => {
    const mock = shareMock();
    mock.share.mockRejectedValue(new Error('dismissed'));
    setShareModuleForTests(mock);
    await expect(shareItemCard(ITEM, 'file:///lamp.jpg')).resolves.toBe('unavailable');
    // Photo attempt + one text-only retry, then it gives up quietly.
    expect(mock.share).toHaveBeenCalledTimes(2);
  });

  it('resolves unavailable when the Share module is missing', async () => {
    setShareModuleForTests(null);
    await expect(shareItemCard(ITEM, 'file:///lamp.jpg')).resolves.toBe('unavailable');
  });
});
