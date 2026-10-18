import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../../ui/components/Text';
import { spacing } from '../../ui/theme';

/** Una fascia orizzontale della Home: titolo e carrello di schede. */
export function HomeRow({
  title, subtitle, children, empty,
}: { title: string; subtitle?: string; children: ReactNode; empty?: string }) {
  const vuoto = Array.isArray(children) ? children.filter(Boolean).length === 0 : !children;
  if (vuoto && !empty) return null;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
        <Text variant="heading">{title}</Text>
        {subtitle ? <Text variant="caption" tone="muted">{subtitle}</Text> : null}
      </View>

      {vuoto ? (
        <Text variant="caption" tone="faint" style={{ paddingHorizontal: spacing.lg }}>{empty}</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg }}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}
