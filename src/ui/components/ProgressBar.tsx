import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';

export interface ProgressBarProps {
  /** 0..1 */
  value: number;
  color?: string;
  height?: number;
  trackColor?: string;
  accessibilityLabel?: string;
}

export function ProgressBar({
  value, color = colors.primary, height = 6, trackColor = colors.surfaceSunken, accessibilityLabel,
}: ProgressBarProps) {
  const pct = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={[styles.track, { height, backgroundColor: trackColor, borderRadius: height / 2 }]}
    >
      <View style={{ width: `${pct * 100}%`, height, backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden', borderRadius: radius.pill },
});
