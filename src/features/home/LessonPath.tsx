import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { LESSON_GOALS } from '../../content/lessons';
import { buildLessonPath, lessonsCompleted, lockMessageIt } from '../../core/learning/path';
import { LESSON_SONG_IDS } from '../../content/catalog';
import { useAppStore } from '../../state/appStore';
import { Card } from '../../ui/components/Card';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { Text } from '../../ui/components/Text';
import { colors, radius, spacing } from '../../ui/theme';

/**
 * Il percorso didattico.
 *
 * Le lezioni bloccate restano visibili, con scritto che cosa manca:
 * nascondere quello che viene dopo toglie all'allievo il senso di dove
 * sta andando, che e' meta' della motivazione.
 */
export function LessonPath() {
  const router = useRouter();
  const songs = useAppStore((s) => s.songs);
  const progress = useAppStore((s) => s.progress);

  const path = buildLessonPath(LESSON_SONG_IDS, progress);
  const completate = lessonsCompleted(path);

  return (
    <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="heading">Il tuo percorso</Text>
        <Text variant="caption" tone="muted">{completate}/{path.length} lezioni</Text>
      </View>
      <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
        Una cosa nuova per volta, in ordine.
      </Text>

      {path.map((lezione) => {
        const song = songs.find((s) => s.id === lezione.songId);
        if (!song) return null;
        const bloccata = !lezione.unlocked;
        const completata = lezione.completionPct >= 100;

        return (
          <Card
            key={lezione.songId}
            {...(bloccata ? {} : { onPress: () => router.push(`/song/${song.id}`) })}
            accessibilityLabel={`Lezione ${lezione.index + 1}: ${song.title}${bloccata ? ', bloccata' : ''}`}
            style={{
              marginBottom: spacing.xs,
              opacity: bloccata ? 0.55 : 1,
              borderColor: lezione.current ? colors.primary : colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 34, height: 34, borderRadius: radius.pill,
                  backgroundColor: completata ? colors.success : lezione.current ? colors.primary : colors.surfaceRaised,
                  alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
                }}
              >
                <Text variant="label" style={{ color: completata || lezione.current ? colors.background : colors.textMuted }}>
                  {completata ? '✓' : lezione.index + 1}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text variant="heading" numberOfLines={1}>{song.title}</Text>
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {bloccata
                    ? lockMessageIt(path, lezione.index)
                    : (LESSON_GOALS[lezione.songId] ?? song.subtitle)}
                </Text>
              </View>
            </View>

            {!bloccata && lezione.completionPct > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <ProgressBar
                  value={lezione.completionPct / 100}
                  height={4}
                  color={completata ? colors.success : colors.primary}
                  accessibilityLabel={`Completata al ${lezione.completionPct}%`}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}
