import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../ui/components/Card';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { Text } from '../../ui/components/Text';
import { colors, spacing } from '../../ui/theme';

/**
 * Struttura comune alle tre domande iniziali.
 *
 * Una domanda per schermata, risposte grandi, nessun pulsante "avanti":
 * si tocca la risposta e si va avanti. Ogni tocco in meno è un utente
 * in più che arriva alla prima lezione.
 */
export function OnboardingStep({
  step, total, question, hint, children,
}: {
  step: number; total: number; question: string; hint?: string; children: ReactNode;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg }}>
        <ProgressBar value={step / total} accessibilityLabel={`Passo ${step} di ${total}`} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}>
        <Text variant="title">{question}</Text>
        {hint ? (
          <Text tone="muted" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>{hint}</Text>
        ) : (
          <View style={{ height: spacing.lg }} />
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Option({
  title, subtitle, selected, onPress,
}: { title: string; subtitle?: string; selected?: boolean; onPress: () => void }) {
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={title}
      style={{
        marginBottom: spacing.sm,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.surfaceRaised : colors.surface,
      }}
    >
      <Text variant="heading">{title}</Text>
      {subtitle ? (
        <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>{subtitle}</Text>
      ) : null}
    </Card>
  );
}
