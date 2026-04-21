import { Client, Connection } from '@temporalio/client';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

let _client: Client | null = null;
let _connection: Connection | null = null;
let _pending: Promise<Client> | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (_client) return _client;
  if (_pending) return _pending;

  _pending = (async () => {
    logger.info({ host: envConfig.temporalHost, ns: envConfig.temporalNamespace }, 'Connecting to Temporal');
    _connection = await Connection.connect({ address: envConfig.temporalHost });
    _client = new Client({ connection: _connection, namespace: envConfig.temporalNamespace });
    return _client;
  })();

  try {
    return await _pending;
  } finally {
    _pending = null;
  }
}

export async function closeTemporalClient(): Promise<void> {
  if (_connection) {
    await _connection.close();
  }
  _client = null;
  _connection = null;
  _pending = null;
}
