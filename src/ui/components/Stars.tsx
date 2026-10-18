import { View } from 'react-native';
import { colors } from '../theme';
import { Text } from './Text';

export interface StarsProps {
  /** 0..5 */
  value: number;
  size?: number;
  label?: string;
}

/**
 * Stelle in testo invece che in immagini: pesano zero nel bundle, si
 * ridimensionano con la tipografia di sistema e restano leggibili dagli
 * screen reader senza etichette aggiuntive.
 */
export function Stars({ value, size = 16, label }: StarsProps) {
  const piene = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label ?? `${piene} stelle su 5`}
      style={{ flexDirection: 'row' }}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Text
          key={i}
          style={{ fontSize: size, color: i < piene ? colors.warning : colors.textFaint, marginRight: 1 }}
        >
          {i < piene ? '★' : '☆'}
        </Text>
      ))}
    </View>
  );
}
