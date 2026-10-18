import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

export interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}

/**
 * Contenitore standard.
 *
 * Quando è premibile, l'etichetta di accessibilita' sta SOLO sul
 * Pressable: metterla anche sulla View interna creerebbe due nodi
 * sovrapposti con lo stesso nome, che confondono gli screen reader e
 * intercettano il tocco destinato al pulsante.
 */
export function Card({ onPress, padded = true, style, children, accessibilityLabel, ...rest }: CardProps) {
  const content = (
    <View
      style={[styles.card, padded && styles.padded, style]}
      {...(onPress ? {} : { accessibilityLabel })}
      {...rest}
    >
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
