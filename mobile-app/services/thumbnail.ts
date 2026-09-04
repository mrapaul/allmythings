import type { NormBox } from '@/components/DrawBoxOverlay';
import { thumbCropRect, thumbResizeWidth } from '@/lib/thumb-crop';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Pre-rendered tile thumbnail: crop the ORIGINAL full-res capture around the
 * detection box (+15% context, ~600px JPEG). The processed upload is only
 * ~1280px wide, so small bbox regions go blurry under the runtime bbox-zoom
 * transform — a real crop from the source keeps tiles sharp. Returns null
 * (→ runtime-transform fallback) for full-frame boxes or any failure.
 */
export async function renderThumbnail(imageUri: string, box: NormBox): Promise<string | null> {
  try {
    const source = await Image.loadAsync(imageUri);
    try {
      const rect = thumbCropRect(box, source.width, source.height);
      if (!rect) return null;
      const rendered = await ImageManipulator.ImageManipulator.manipulate(source)
        .crop(rect)
        .resize({ width: thumbResizeWidth(rect.width) })
        .renderAsync();
      const saved = await rendered.saveAsync({
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      rendered.release();
      return saved.uri;
    } finally {
      source.release();
    }
  } catch {
    return null;
  }
}
