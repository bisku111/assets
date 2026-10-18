import { View } from 'react-native';
import { DIFFICULTY_LABEL_IT, type Song } from '../../core/song/types';
import type { SongProgressRecord } from '../../core/ports/repository';
import { formatDuration } from '../../core/song/query';
import { Card } from '../../ui/components/Card';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { Stars } from '../../ui/components/Stars';
import { Text } from '../../ui/components/Text';
import { colors, radius, spacing } from '../../ui/theme';

/**
 * Scheda di un brano in elenco.
 *
 * La copertina è un blocco di colore e non un'immagine: il repository
 * non contiene copertine protette, e un colore stabile per brano si
 * riconosce comunque a colpo d'occhio nella lista.
 */
export function SongCard({
  song, progress, onPress, compact = false,
}: {
  song: Song;
  progress?: SongProgressRecord | null;
  onPress: () => void;
  compact?: boolean;
}) {
  const [c1, c2] = song.coverColors;

  return (
    <Card
      onPress={onPress}
      padded={false}
      accessibilityLabel={`${song.title}, ${song.artistName}`}
      style={compact ? { width: 160, marginRight: spacing.sm } : { marginBottom: spacing.sm }}
    >
      <View style={{ flexDirection: compact ? 'column' : 'row' }}>
        <View
          style={{
            width: compact ? '100%' : 88,
            height: compact ? 96 : 88,
            backgroundColor: c1,
            borderTopWidth: 18,
            borderTopColor: c2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="title" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {song.title.slice(0, 1).toUpperCase()}
          </Text>
        </View>

        <View style={{ flex: 1, padding: spacing.md, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>{song.title}</Text>
            {!song.isFree ? <PremiumBadge /> : null}
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
            {song.artistName}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs }}>
            <Text variant="caption" tone="faint">
              {DIFFICULTY_LABEL_IT[song.baseDifficulty]} · {formatDuration(song.durationMs)} · {Math.round(song.bpm)} BPM
            </Text>
          </View>

          {progress && progress.completionPct > 0 ? (
            <View style={{ marginTop: spacing.sm }}>
              <ProgressBar
                value={progress.completionPct / 100}
                height={4}
                accessibilityLabel={`Completato al ${progress.completionPct}%`}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs }}>
                <Stars value={progress.stars} size={12} />
                <Text variant="caption" tone="faint" style={{ marginLeft: spacing.sm }}>
                  {progress.completionPct}%
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

export function PremiumBadge() {
  return (
    <View
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.primaryDim,
      }}
    >
      <Text variant="caption" style={{ color: colors.text }}>Premium</Text>
    </View>
  );
}
