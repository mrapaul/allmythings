import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../utils/logger';

/**
 * Training-data flywheel intake: every detection outcome the user verified
 * (accepts, rejects, relabels, drawn boxes, photo verdicts) is appended as one
 * JSON line to a dated file under `<dataDir>/flywheel/`. Photos themselves are
 * already persisted by sha under `<dataDir>/photos/`, so a record + its photo
 * form a complete training sample for `make dataset-export`.
 */
export class FlywheelService {
  constructor(private readonly dataDir: string) {}

  async append(record: Record<string, unknown>): Promise<void> {
    const dir = path.join(this.dataDir, 'flywheel');
    await fs.mkdir(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `${day}.jsonl`);
    const line = `${JSON.stringify({ ...record, receivedAt: new Date().toISOString() })}\n`;
    await fs.appendFile(file, line, 'utf-8');
    logger.info(
      { file, photoSha256: record.photoSha256, events: Array.isArray(record.events) ? record.events.length : 0 },
      'flywheel_record_appended',
    );
  }
}
