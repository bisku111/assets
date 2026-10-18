import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Riga piccola sotto l'etichetta: usata dal maestro per il "perché". */
  hint?: string;
  style?: ViewStyle;
  testID?: string;
}

export function Button({
  label, onPress, variant = 'primary', disabled = false, loading = false,
  fullWidth = true, hint, style, testID,
}: ButtonProps) {
  const inattivo = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={inattivo ? undefined : onPress}
      disabled={inattivo}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inattivo, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        VARIANT_STYLE[variant],
        fullWidth && styles.fullWidth,
        // Il feedback al tocco è immediato e leggero: su un pulsante che
        // si preme mentre si suona, un'animazione lunga da' fastidio.
        pressed && !inattivo && styles.pressed,
        inattivo && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.text : colors.primary} />
      ) : (
        <View>
          <Text style={[typography.heading, { color: LABEL_COLOR[variant], textAlign: 'center' }]}>
            {label}
          </Text>
          {hint ? (
            <Text variant="caption" tone="muted" center style={{ marginTop: 2 }}>{hint}</Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const VARIANT_STYLE: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.error },
};

const LABEL_COLOR: Record<ButtonVariant, string> = {
  primary: colors.text,
  secondary: colors.text,
  ghost: colors.textMuted,
  danger: colors.error,
};

const styles = StyleSheet.create({
  base: {
    minHeight: 52, // bersaglio comodo anche con le mani sulla tastiera
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.4 },
});
