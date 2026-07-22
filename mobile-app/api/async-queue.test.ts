import { describe, expect, it } from 'vitest';
import { makeAsyncQueue } from './async-queue';

describe('makeAsyncQueue', () => {
  it('delivers pushed values in order and finishes on end', async () => {
    const q = makeAsyncQueue<number>();
    q.push(1);
    q.push(2);
    setTimeout(() => {
      q.push(3);
      q.end();
    }, 0);
    const out: number[] = [];
    for await (const v of q.iterate()) out.push(v);
    expect(out).toEqual([1, 2, 3]);
  });

  it('throws the failure into the consumer after draining buffered values', async () => {
    const q = makeAsyncQueue<number>();
    q.push(1);
    q.fail(new Error('boom'));
    const out: number[] = [];
    await expect(async () => {
      for await (const v of q.iterate()) out.push(v);
    }).rejects.toThrow('boom');
    expect(out).toEqual([1]);
  });

  it('ignores pushes after end', async () => {
    const q = makeAsyncQueue<number>();
    q.end();
    q.push(9);
    const out: number[] = [];
    for await (const v of q.iterate()) out.push(v);
    expect(out).toEqual([]);
  });
});
