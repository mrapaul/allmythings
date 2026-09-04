import Bonjour from 'bonjour-service';
import { logger } from './logger';

export function advertiseService(port: number): () => void {
  const bonjour = new Bonjour(undefined, (err: Error) => {
    logger.warn({ err: err.message }, 'Bonjour advertisement error — mDNS unavailable');
  });
  const service = bonjour.publish({ name: 'allmythings-server', type: 'http', port });
  service.on('error', (err: Error) => {
    logger.warn({ err: err.message }, 'Bonjour advertisement error — mDNS unavailable');
  });
  return () => bonjour.destroy();
}
