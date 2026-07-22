/**
 * Minimal pushable async queue: event-driven producers (XHR callbacks) on one
 * side, `for await` consumers on the other.
 */

export interface AsyncQueue<T> {
  push: (value: T) => void;
  end: () => void;
  fail: (err: Error) => void;
  iterate: () => AsyncGenerator<T, void, unknown>;
}

export function makeAsyncQueue<T>(): AsyncQueue<T> {
  const buffered: T[] = [];
  let done = false;
  let error: Error | null = null;
  let wake: (() => void) | null = null;

  const notify = (): void => {
    wake?.();
    wake = null;
  };

  return {
    push: (value) => {
      if (done) return;
      buffered.push(value);
      notify();
    },
    end: () => {
      done = true;
      notify();
    },
    fail: (err) => {
      if (done) return;
      error = err;
      done = true;
      notify();
    },
    iterate: async function* () {
      while (true) {
        while (buffered.length > 0) {
          yield buffered.shift() as T;
        }
        if (error) throw error;
        if (done) return;
        await new Promise<void>((r) => {
          wake = r;
        });
      }
    },
  };
}
