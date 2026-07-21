import { useColors } from '@/hooks/useColors';
import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

export interface NormBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Smallest drag (in view px) that counts as a deliberate box. */
export const MIN_DRAW_SIZE_PX = 24;
/** Movement before a touch is treated as a draw instead of a tap/scroll. */
const DRAG_ACTIVATION_PX = 12;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Convert a drag rect (any corner order) into a clamped normalized box. */
export function viewRectToNormBox(rect: ViewRect, viewW: number, viewH: number): NormBox {
  const left = clamp(Math.min(rect.x1, rect.x2), 0, viewW);
  const top = clamp(Math.min(rect.y1, rect.y2), 0, viewH);
  const right = clamp(Math.max(rect.x1, rect.x2), 0, viewW);
  const bottom = clamp(Math.max(rect.y1, rect.y2), 0, viewH);
  return {
    x: left / viewW,
    y: top / viewH,
    width: (right - left) / viewW,
    height: (bottom - top) / viewH,
  };
}

export function isDrawnRectUsable(rect: ViewRect): boolean {
  return (
    Math.abs(rect.x2 - rect.x1) >= MIN_DRAW_SIZE_PX &&
    Math.abs(rect.y2 - rect.y1) >= MIN_DRAW_SIZE_PX
  );
}

interface DrawBoxOverlayProps {
  viewWidth: number;
  viewHeight: number;
  enabled: boolean;
  onBoxDrawn: (box: NormBox) => void;
}

/**
 * Draw-to-teach surface: drag on the photo to box a missed object. Taps and
 * tiny movements pass through untouched, so existing interactions keep
 * working; only a deliberate drag becomes a box.
 */
export function DrawBoxOverlay({
  viewWidth,
  viewHeight,
  enabled,
  onBoxDrawn,
}: DrawBoxOverlayProps) {
  const colors = useColors();
  const [draft, setDraft] = useState<ViewRect | null>(null);
  const draftRef = useRef<ViewRect | null>(null);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > DRAG_ACTIVATION_PX || Math.abs(gesture.dy) > DRAG_ACTIVATION_PX,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const rect = { x1: locationX, y1: locationY, x2: locationX, y2: locationY };
        draftRef.current = rect;
        setDraft(rect);
      },
      onPanResponderMove: (evt) => {
        const start = draftRef.current;
        if (!start) return;
        const { locationX, locationY } = evt.nativeEvent;
        const rect = { ...start, x2: locationX, y2: locationY };
        draftRef.current = rect;
        setDraft(rect);
      },
      onPanResponderRelease: () => {
        const rect = draftRef.current;
        draftRef.current = null;
        setDraft(null);
        if (rect && isDrawnRectUsable(rect)) {
          onBoxDrawn(viewRectToNormBox(rect, viewWidth, viewHeight));
        }
      },
      onPanResponderTerminate: () => {
        draftRef.current = null;
        setDraft(null);
      },
    }),
  ).current;

  if (!enabled) return null;

  const preview =
    draft === null
      ? null
      : {
          left: Math.min(draft.x1, draft.x2),
          top: Math.min(draft.y1, draft.y2),
          width: Math.abs(draft.x2 - draft.x1),
          height: Math.abs(draft.y2 - draft.y1),
        };

  return (
    <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
      {preview && (
        <View
          pointerEvents="none"
          style={[
            styles.draft,
            preview,
            { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  draft: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
});
