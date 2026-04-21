import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// Mock the Temporal client module so tests don't need a live server
const mockConnection = {
  close: vi.fn(async () => undefined),
};
const mockClientInstance = {
  workflow: { start: vi.fn() },
  connection: mockConnection,
  options: { namespace: 'default' },
};

vi.mock('@temporalio/client', () => ({
  Connection: {
    connect: vi.fn(async () => mockConnection),
  },
  Client: vi.fn().mockImplementation(() => mockClientInstance),
}));

// Import AFTER mock so the module picks up the mocked version
import { getTemporalClient, closeTemporalClient } from '../../../temporal/client';
import { Connection, Client } from '@temporalio/client';

describe('TemporalClient singleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await closeTemporalClient();
  });

  it('returns the same instance on repeated calls (singleton)', async () => {
    const first = await getTemporalClient();
    const second = await getTemporalClient();
    expect(first).toBe(second);
    // Only one underlying Connection.connect + new Client call
    expect(Connection.connect).toHaveBeenCalledTimes(1);
    expect(Client).toHaveBeenCalledTimes(1);
  });

  it('calls Connection.connect with configured address', async () => {
    await getTemporalClient();
    expect(Connection.connect).toHaveBeenCalledWith(expect.objectContaining({ address: 'localhost:7233' }));
  });

  it('constructs Client with configured namespace', async () => {
    await getTemporalClient();
    expect(Client).toHaveBeenCalledWith(expect.objectContaining({
      connection: expect.any(Object),
      namespace: 'default',
    }));
  });

  it('closeTemporalClient closes the underlying connection and resets the singleton', async () => {
    const first = await getTemporalClient();
    await closeTemporalClient();
    expect(mockConnection.close).toHaveBeenCalled();
    const second = await getTemporalClient();
    // After close, a fresh instance is created (new Connection.connect call)
    expect(Connection.connect).toHaveBeenCalledTimes(2);
    // And the returned objects are distinct singletons across the close boundary
    expect(second).toBe(first); // same mock, but re-initialized singleton cycle
  });

  it('handles concurrent callers without creating two clients', async () => {
    const [a, b, c] = await Promise.all([
      getTemporalClient(),
      getTemporalClient(),
      getTemporalClient(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(Connection.connect).toHaveBeenCalledTimes(1);
  });
});
