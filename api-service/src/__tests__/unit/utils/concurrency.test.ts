import { describe, expect, it } from 'vitest';
import { DetectGate } from '../../../utils/concurrency';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('DetectGate', () => {
  it('tryAcquire admits up to maxConcurrent, then rejects', () => {
    const gate = new DetectGate(2, 0);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.running).toBe(2);
  });

  it('release frees a slot for the next tryAcquire', () => {
    const gate = new DetectGate(1, 0);
    gate.tryAcquire();
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });

  it('acquire queues FIFO and transfers the released slot to the waiter', async () => {
    const gate = new DetectGate(1, 2);
    gate.tryAcquire();

    const order: string[] = [];
    const w1 = (async () => {
      expect(await gate.acquire()).toBe(true);
      order.push('w1');
      gate.release();
    })();
    const w2 = (async () => {
      expect(await gate.acquire()).toBe(true);
      order.push('w2');
      gate.release();
    })();
    await tick();
    expect(gate.pending).toBe(2);

    gate.release(); // frees the only slot → w1 resumes, then w2
    await w1;
    await w2;
    expect(order).toEqual(['w1', 'w2']);
    expect(gate.running).toBe(0);
  });

  it('acquire returns false when the queue is full (fail fast)', async () => {
    const gate = new DetectGate(1, 1);
    gate.tryAcquire();
    const waiter = gate.acquire();
    await tick();
    expect(await gate.acquire()).toBe(false);
    gate.release();
    await waiter;
  });

  it('release is safe to over-call', () => {
    const gate = new DetectGate(1, 0);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });
});
