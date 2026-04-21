import { ApplicationFailure, heartbeat, Context } from '@temporalio/activity';
import { propagation, context } from '@opentelemetry/api';
import { DetectInput, FlorenceDetection } from '../shared-types';
import { envConfig } from '../../config/env.config';
import { logger } from '../../utils/logger';

interface FlorenceHttpRegion {
  caption: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FlorenceHttpResponse {
  regions: FlorenceHttpRegion[];
  image_width: number;
  image_height: number;
}

export async function florenceDetect(input: DetectInput): Promise<FlorenceDetection> {
  const imageBuffer = Buffer.from(input.imageBase64, 'base64');
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);

  // Heartbeat every 5s during the call so a dead worker is detected fast.
  const heartbeatTimer = setInterval(() => {
    try {
      heartbeat({ phase: 'awaiting-florence' });
    } catch {
      /* not in activity context */
    }
  }, 5000);

  try {
    const form = new FormData();
    form.append('file', new Blob([imageBuffer], { type: input.mimeType }), 'image');

    const res = await fetch(`${envConfig.florenceUrl}/detect/florence`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(envConfig.detectionTimeoutMs),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      const retryable = res.status >= 500;
      throw ApplicationFailure.create({
        message: `Florence detector returned ${res.status}: ${body.slice(0, 200)}`,
        type: retryable ? 'FlorenceTransientError' : 'FlorenceBadRequestError',
        nonRetryable: !retryable,
      });
    }

    const data = (await res.json()) as FlorenceHttpResponse;
    let activityId = 'test';
    try {
      activityId = Context.current().info.activityId;
    } catch {
      /* unit-test mode */
    }
    logger.info(
      {
        count: data.regions.length,
        traceId: input.traceId,
        activity: activityId,
      },
      'Florence detection complete',
    );

    return {
      regions: data.regions.map((r, regionIndex) => ({
        caption: r.caption.trim(),
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        regionIndex,
      })),
      imageWidth: data.image_width,
      imageHeight: data.image_height,
    };
  } finally {
    clearInterval(heartbeatTimer);
  }
}
