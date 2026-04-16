import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { logger } from '../utils/logger';

const THUMB_WIDTH = 400;

export interface SavedPhoto {
  photoId: string;
  photoPath: string;
  thumbnailPath: string;
}

export class PhotoStorageService {
  private readonly photosDir: string;

  constructor(baseDir: string) {
    this.photosDir = path.join(baseDir, 'photos');
  }

  async save(imageBuffer: Buffer): Promise<SavedPhoto> {
    fs.mkdirSync(this.photosDir, { recursive: true });

    const photoId = randomUUID();
    const photoPath = path.join(this.photosDir, `${photoId}.jpg`);
    const thumbnailPath = path.join(this.photosDir, `${photoId}_thumb.jpg`);

    fs.writeFileSync(photoPath, imageBuffer);
    logger.info({ photoId, size: imageBuffer.length, path: photoPath }, 'Photo saved');

    try {
      await sharp(imageBuffer)
        .resize(THUMB_WIDTH, undefined, { fit: 'inside' })
        .jpeg({ quality: 85 })
        .toFile(thumbnailPath);
    } catch (err) {
      logger.warn({ photoId, error: (err as Error).message }, 'Thumbnail generation failed');
      fs.copyFileSync(photoPath, thumbnailPath);
    }

    return { photoId, photoPath, thumbnailPath };
  }

  getPhotoPath(photoId: string): string {
    return path.join(this.photosDir, `${photoId}.jpg`);
  }

  getThumbnailPath(photoId: string): string {
    return path.join(this.photosDir, `${photoId}_thumb.jpg`);
  }
}
