import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

export interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}

export function Card({ onPress, padded = true, style, children, ...rest }: CardProps) {
  const content = (
    <View style={[styles.card, padded && styles.padded, style]} {...rest}>
      {children}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  padded: { padding: spacing.md },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
