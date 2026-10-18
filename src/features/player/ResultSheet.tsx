import { ScrollView, View } from 'react-native';
import { coachActionLabelIt, coachAdvice, type CoachAction } from '../../core/coach/coach';
import type { SessionResult } from '../../core/engine/session';
import { scoreLabelIt } from '../../core/scoring/score';
import type { SongSection } from '../../core/song/types';
import { Button } from '../../ui/components/Button';
import { Card } from '../../ui/components/Card';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { Stars } from '../../ui/components/Stars';
import { Text } from '../../ui/components/Text';
import { colors, scoreColor, spacing } from '../../ui/theme';

/**
 * Schermata di fine esercizio.
 *
 * Prima il numero, poi le tre misure, poi — soprattutto — che cosa fare
 * adesso. Un punteggio senza un passo successivo lascia l'allievo fermo:
 * la frase del maestro e il pulsante che la realizza sono il motivo per
 * cui questa schermata esiste.
 */
export function ResultSheet({
  result, section, isLastSection, attempts, onAction, onExit,
}: {
  result: SessionResult;
  section: SongSection | null;
  isLastSection: boolean;
  attempts: number;
  onAction: (action: CoachAction) => void;
  onExit: () => void;
}) {
  const { breakdown } = result;
  const advice = coachAdvice({
    breakdown,
    mode: result.mode,
    ratePct: result.ratePct,
    section,
    hands: result.hands,
    handStats: result.handStats,
    attempts,
    isLastSection,
  });

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <Text variant="label" tone="muted" center>{scoreLabelIt(breakdown.score)}</Text>
      <Text variant="metric" center style={{ color: scoreColor(breakdown.score), marginTop: spacing.xs }}>
        {breakdown.score}
        <Text variant="title" tone="muted">/100</Text>
      </Text>
      <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
        <Stars value={breakdown.stars} size={22} />
      </View>

      <Card style={{ marginTop: spacing.lg }}>
        <Misura label="Precisione" value={breakdown.accuracyPct} />
        <Misura label="Ritmo" value={breakdown.rhythmPct} />
        <Misura label="Tempo" value={breakdown.timingPct} />
      </Card>

      <Card style={{ marginTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Conteggio label="Giuste" value={breakdown.notesCorrect} tone="success" />
          <Conteggio label="Sbagliate" value={breakdown.notesWrong} tone={breakdown.notesWrong > 0 ? 'error' : 'default'} />
          <Conteggio label="Mancate" value={breakdown.notesMissed} tone={breakdown.notesMissed > 0 ? 'warning' : 'default'} />
          <Conteggio label="In piu" value={breakdown.notesExtra} />
        </View>
      </Card>

      {/* ---- Il maestro ---- */}
      <Card style={{ marginTop: spacing.lg, borderColor: colors.primary }}>
        <Text variant="heading">{advice.headline}</Text>
        <Text tone="muted" style={{ marginTop: spacing.xs, lineHeight: 21 }}>{advice.detail}</Text>
      </Card>

      <Button
        label={coachActionLabelIt(advice.action)}
        onPress={() => onAction(advice.action)}
        style={{ marginTop: spacing.md }}
      />
      {advice.alternatives.map((alt, i) => (
        <Button
          key={i}
          label={coachActionLabelIt(alt)}
          variant="secondary"
          onPress={() => onAction(alt)}
          style={{ marginTop: spacing.xs }}
        />
      ))}
      <Button label="Esci" variant="ghost" onPress={onExit} style={{ marginTop: spacing.xs }} />
    </ScrollView>
  );
}

function Misura({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
        <Text variant="label" tone="muted">{label.toUpperCase()}</Text>
        <Text variant="label">{Math.round(value)}%</Text>
      </View>
      <ProgressBar value={value / 100} color={scoreColor(value)} accessibilityLabel={`${label} ${Math.round(value)}%`} />
    </View>
  );
}

function Conteggio({
  label, value, tone = 'default',
}: { label: string; value: number; tone?: 'default' | 'success' | 'error' | 'warning' }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text variant="title" tone={tone}>{value}</Text>
      <Text variant="caption" tone="faint">{label}</Text>
    </View>
  );
}
