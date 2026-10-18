import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, typography } from '../theme';

type Variant = keyof typeof typography;
type Tone = 'default' | 'muted' | 'faint' | 'primary' | 'success' | 'error' | 'warning';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

const TONE_COLOR: Record<Tone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  faint: colors.textFaint,
  primary: colors.primary,
  success: colors.success,
  error: colors.error,
  warning: colors.warning,
};

/** Unico punto in cui si decide come appare il testo nell'app. */
export function Text({ variant = 'body', tone = 'default', center, style, ...rest }: TextProps) {
  const base: TextStyle = {
    ...typography[variant],
    color: TONE_COLOR[tone],
    ...(center ? { textAlign: 'center' as const } : null),
  };
  return <RNText {...rest} style={[base, style]} />;
}
