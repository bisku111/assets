import { View } from 'react-native';
import { colors, spacing } from '../theme';
import { Card } from './Card';
import { Text } from './Text';

export interface StatTileProps {
  value: string;
  label: string;
  tone?: 'default' | 'primary' | 'success' | 'warning';
  suffix?: string;
}

/** Una cifra grande e una parola: il formato con cui si legge un numero al volo. */
export function StatTile({ value, label, tone = 'default', suffix }: StatTileProps) {
  const color =
    tone === 'primary' ? colors.primary
    : tone === 'success' ? colors.success
    : tone === 'warning' ? colors.warning
    : colors.text;

  return (
    <Card style={{ flex: 1, minWidth: 96 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text variant="title" style={{ color }}>{value}</Text>
        {suffix ? (
          <Text variant="caption" tone="muted" style={{ marginLeft: 2 }}>{suffix}</Text>
        ) : null}
      </View>
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>{label}</Text>
    </Card>
  );
}
