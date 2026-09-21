import GlowBackdrop from '@/components/GlowBackdrop';
import { useColors } from '@/hooks/useColors';
import {
  type DetectionJob,
  RUN_LOST_ERROR_CODE,
  RUN_LOST_MESSAGE,
  inboxJobs,
  sessionDisplayName,
} from '@/lib/jobs';
import { dispatchShot } from '@/services/walk-capture';
import { removeJob, useJobsStore } from '@/stores/jobs.store';
import { Prefs } from '@/stores/prefs';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Review inbox (walk mode): completed-but-unreviewed detection jobs plus
 * failures needing a retry — one consistent place. Tapping a ready card
 * opens the existing review screen resumed onto that run.
 */
export default function InboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const jobs = useJobsStore((s) => s.jobs);
  const cards = inboxJobs(jobs);
  const prefs = useMemo(() => {
    try {
      return Prefs.makeMmkv();
    } catch {
      return Prefs.makeInMemory();
    }
  }, []);

  const openReview = (job: DetectionJob) => {
    router.push({ pathname: '/detection', params: { imageUri: job.photoUri, runId: job.runId } });
  };

  // Re-dispatch replaces the dead job: fresh runId, SAME room session, so
  // the retry stays grouped with the walk it came from.
  const retry = (job: DetectionJob) => {
    removeJob(job.runId);
    void dispatchShot(prefs, job.photoUri, { roomSessionId: job.roomSessionId });
  };

  const paddingTop = Platform.OS === 'web' ? 16 : insets.top + 4;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlowBackdrop />

      <View style={[styles.header, { paddingTop }]}>
        <Pressable
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Review inbox</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {cards.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All caught up</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Shots you take land here once they're catalogued — keep walking, we'll keep up.
            </Text>
          </View>
        ) : (
          cards.map((job, index) => (
            <Pressable
              key={job.runId}
              testID={`inbox-card-${index}`}
              disabled={job.status !== 'ready'}
              onPress={() => openReview(job)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Image source={job.photoUri} style={styles.thumb} contentFit="cover" />
              <View style={styles.cardBody}>
                {job.status === 'ready' ? (
                  <>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                      {job.itemCount} item{job.itemCount === 1 ? '' : 's'} found
                    </Text>
                    <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
                      {sessionDisplayName(job.roomSessionId)} · tap to review
                    </Text>
                    {/* Semantic verdict that arrived after dispatch — shown
                        here rather than interrupting the walk. */}
                    {job.advice && (
                      <Text
                        testID={`inbox-advice-${index}`}
                        style={[styles.cardAdvice, { color: colors.mutedForeground }]}
                      >
                        {job.advice}
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                      {job.errorCode === RUN_LOST_ERROR_CODE
                        ? RUN_LOST_MESSAGE
                        : 'Saved — will catalog when the server is reachable'}
                    </Text>
                    <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
                      {sessionDisplayName(job.roomSessionId)}
                    </Text>
                    <Pressable
                      testID={`inbox-retry-${index}`}
                      accessibilityLabel="Retry this photo"
                      accessibilityHint="Re-runs detection on the saved photo"
                      onPress={() => retry(job)}
                      style={({ pressed }) => [
                        styles.retryBtn,
                        { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Feather name="rotate-cw" size={16} color={colors.primaryForeground} />
                    </Pressable>
                  </>
                )}
              </View>
              {job.status === 'ready' && (
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  headerSpacer: { width: 44 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
  },
  emptyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
  cardBody: { flex: 1 },
  cardTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 15,
  },
  cardMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  cardAdvice: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
