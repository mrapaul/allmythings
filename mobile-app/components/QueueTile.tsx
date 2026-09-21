import type { useColors } from '@/hooks/useColors';
import type { DetectionJob } from '@/lib/jobs';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

interface QueueTileProps {
  job: DetectionJob;
  /** Position in the queue row; drives the testID. */
  index: number;
  colors: ReturnType<typeof useColors>;
  onPress: (job: DetectionJob) => void;
}

/**
 * First-class home-grid tile for an in-flight or failed capture job. Running
 * jobs wear a spinner ring over the photo; failed jobs are dimmed with a
 * warning badge — the thumbnail itself is the status, one glance at the top
 * of the grid. Tapping opens the job's detection screen, which already owns
 * retry/rerun handling.
 */
export function QueueTile({ job, index, colors, onPress }: QueueTileProps) {
  const failed = job.status === 'failed';
  return (
    <Pressable
      testID={`queue-tile-${index}`}
      accessibilityLabel={failed ? 'Photo failed — open to retry' : 'Photo being cataloged'}
      accessibilityHint={
        failed
          ? 'Opens this photo with retry options'
          : 'Opens this photo’s live detection progress'
      }
      onPress={() => onPress(job)}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: failed ? colors.destructive : colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Image source={job.photoUri} style={StyleSheet.absoluteFill} contentFit="cover" />
      {failed ? (
        <>
          <View style={styles.dim} pointerEvents="none" />
          <View
            testID={`queue-tile-warning-${index}`}
            style={[styles.warningBadge, { backgroundColor: colors.destructive }]}
          >
            <Feather name="alert-triangle" size={13} color={colors.destructiveForeground} />
          </View>
        </>
      ) : (
        <View style={styles.ringOverlay} pointerEvents="none">
          <View
            testID={`queue-tile-spinner-${index}`}
            style={[styles.spinnerRing, { borderColor: colors.primary }]}
          >
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 27, 63, 0.45)',
  },
  warningBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  ringOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  spinnerRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
});

export default QueueTile;
