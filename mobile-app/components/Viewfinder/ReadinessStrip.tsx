import type { ReadinessSignals, SignalState } from '@/lib/live-coaching';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Always-on capture readiness: three plain signals — steady, sharp, light —
 * so the viewfinder says "good to shoot" instead of staying silent when
 * nothing is wrong. Hints (one at a time, corroborated) live in CoachOverlay;
 * this strip is the instantaneous read behind them.
 */

const OK = '#4ade80';
const WARN = '#fbbf24';
const UNKNOWN = 'rgba(255,255,255,0.45)';

const SIGNALS: Array<{
  key: keyof ReadinessSignals;
  label: string;
  icon: 'crosshair' | 'aperture' | 'sun';
}> = [
  { key: 'steady', label: 'Steady', icon: 'crosshair' },
  { key: 'sharp', label: 'Sharp', icon: 'aperture' },
  { key: 'light', label: 'Light', icon: 'sun' },
];

function colorFor(state: SignalState): string {
  return state === 'ok' ? OK : state === 'warn' ? WARN : UNKNOWN;
}

interface ReadinessStripProps {
  signals: ReadinessSignals;
  /** Every signal ok and the frame corroborated: "Good to shoot". */
  ready: boolean;
}

export function ReadinessStrip({ signals, ready }: ReadinessStripProps) {
  return (
    <View style={styles.strip} testID="readiness-strip" accessibilityRole="summary">
      {SIGNALS.map(({ key, label, icon }) => {
        const state = signals[key];
        const color = colorFor(state);
        return (
          <View key={key} style={styles.signal} testID={`readiness-${key}-${state}`}>
            <Feather name={state === 'warn' ? 'alert-circle' : icon} size={13} color={color} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </View>
        );
      })}
      <View style={styles.divider} />
      <Text style={[styles.verdict, { color: ready ? OK : UNKNOWN }]} testID="readiness-verdict">
        {ready ? 'Good to shoot' : 'Settling…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2 },
  divider: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.25)' },
  verdict: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
