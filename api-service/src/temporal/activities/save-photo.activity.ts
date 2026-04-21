import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ApplicationFailure } from '@temporalio/activity';
import { DetectInput, SavedPhoto } from '../shared-types';
import { envConfig } from '../../config/env.config';
import { logger } from '../../utils/logger';
import { timed } from '../../telemetry/metrics';

const SUPPORTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const THUMB_WIDTH = 400;

export async function savePhoto(input: DetectInput): Promise<SavedPhoto> {
  return timed('savePhoto', 1, async () => {
    if (!SUPPORTED_MIMES.has(input.mimeType)) {
      throw ApplicationFailure.create({
        message: `Unsupported mime type: ${input.mimeType}`,
        type: 'UnsupportedMediaType',
        nonRetryable: true,
      });
    }

    const photosDir = path.join(envConfig.photoDir, 'photos');
    fs.mkdirSync(photosDir, { recursive: true });

    const photoId = randomUUID();
    const photoPath = path.join(photosDir, `${photoId}.jpg`);
    const thumbnailPath = path.join(photosDir, `${photoId}_thumb.jpg`);

    const imageBuffer = Buffer.from(input.imageBase64, 'base64');
    fs.writeFileSync(photoPath, imageBuffer);

    try {
      await sharp(imageBuffer)
        .resize(THUMB_WIDTH, undefined, { fit: 'inside' })
        .jpeg({ quality: 85 })
        .toFile(thumbnailPath);
    } catch (err) {
      logger.warn(
        { photoId, err: (err as Error).message },
        'Thumbnail failed; using original as fallback',
      );
      fs.copyFileSync(photoPath, thumbnailPath);
    }

    logger.info(
      { photoId, bytes: imageBuffer.length, traceId: input.traceId },
      'Photo saved',
    );

    return { photoId, photoPath, thumbnailPath, bytes: imageBuffer.length };
  });
}
