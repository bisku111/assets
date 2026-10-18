import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ACHIEVEMENTS, levelProgress } from '../../core/gamification/rules';
import { formatDuration } from '../../core/song/query';
import { useAppStore } from '../../state/appStore';
import { Card } from '../../ui/components/Card';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { Stars } from '../../ui/components/Stars';
import { StatTile } from '../../ui/components/StatTile';
import { Text } from '../../ui/components/Text';
import { colors, scoreColor, spacing } from '../../ui/theme';

/**
 * Progressi.
 *
 * Mostra i numeri che l'allievo puo' usare: non "quanto hai giocato" ma
 * "quanto sei migliorato e dove sbagli". La tendenza ritmica, in
 * particolare, e' l'informazione che un principiante non ha modo di
 * ricavare da solo.
 */
export default function Progress() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const sessions = useAppStore((s) => s.recentSessions);
  const progress = useAppStore((s) => s.progress);
  const songs = useAppStore((s) => s.songs);
  const achievements = useAppStore((s) => s.achievements);

  const statistiche = useMemo(() => {
    if (sessions.length === 0) {
      return { medio: 0, migliore: 0, giuste: 0, errate: 0, tendenza: 0, minuti: 0 };
    }
    const giuste = sessions.reduce((n, s) => n + s.notesCorrect, 0);
    const errate = sessions.reduce((n, s) => n + s.notesWrong + s.notesMissed, 0);
    return {
      medio: Math.round(sessions.reduce((n, s) => n + s.score, 0) / sessions.length),
      migliore: Math.max(...sessions.map((s) => s.score)),
      giuste,
      errate,
      // Media della precisione ritmica: dice se il problema e' il tempo
      // o le note, che e' la domanda che l'allievo si pone davvero.
      tendenza: Math.round(sessions.reduce((n, s) => n + s.timingPct, 0) / sessions.length),
      minuti: Math.round(sessions.reduce((n, s) => n + s.durationMs, 0) / 60_000),
    };
  }, [sessions]);

  const livello = levelProgress(profile?.xp ?? 0);
  const sbloccate = achievements.filter((a) => a.unlocked).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text variant="title">I tuoi progressi</Text>

        {sessions.length === 0 ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text variant="heading">Ancora nessun esercizio</Text>
            <Text tone="muted" style={{ marginTop: spacing.xs }}>
              Appena suonerai la prima sezione, qui troverai punteggi, precisione
              e l'andamento del tuo ritmo.
            </Text>
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <StatTile value={`${statistiche.medio}`} label="Punteggio medio"
                tone={statistiche.medio >= 85 ? 'success' : 'default'} />
              <StatTile value={`${statistiche.migliore}`} label="Il tuo record" tone="primary" />
              <StatTile value={`${statistiche.minuti}`} label="Minuti" suffix="min" />
            </View>

            <Card style={{ marginTop: spacing.md }}>
              <Text variant="label" tone="muted">Note</Text>
              <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text variant="title" tone="success">{statistiche.giuste}</Text>
                  <Text variant="caption" tone="faint">corrette</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="title" tone={statistiche.errate > 0 ? 'error' : 'default'}>
                    {statistiche.errate}
                  </Text>
                  <Text variant="caption" tone="faint">sbagliate o mancate</Text>
                </View>
              </View>
              <Text variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
                Precisione ritmica media: {statistiche.tendenza}%.{' '}
                {statistiche.tendenza >= 80
                  ? 'Il tempo e solido.'
                  : 'Prova a rallentare e contare a voce alta: il ritmo si consolida prima delle note.'}
              </Text>
            </Card>

            <Card style={{ marginTop: spacing.md }}>
              <Text variant="label" tone="muted">Livello {livello.level}</Text>
              <View style={{ marginTop: spacing.sm }}>
                <ProgressBar value={livello.pct / 100} color={colors.accent} />
              </View>
              <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
                {livello.current} / {livello.needed} XP al livello successivo
              </Text>
            </Card>
          </>
        )}

        {/* ---- Brani in corso ---- */}
        {progress.length > 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <Text variant="heading" style={{ marginBottom: spacing.sm }}>I tuoi brani</Text>
            {progress.map((p) => {
              const song = songs.find((s) => s.id === p.songId);
              if (!song) return null;
              return (
                <Card key={p.arrangementId} onPress={() => router.push(`/song/${song.id}`)}
                  accessibilityLabel={song.title} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>{song.title}</Text>
                    <Stars value={p.stars} size={13} />
                  </View>
                  <View style={{ marginTop: spacing.sm }}>
                    <ProgressBar value={p.completionPct / 100} color={scoreColor(p.bestScore)} />
                  </View>
                  <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
                    {p.completionPct}% · miglior punteggio {p.bestScore} · {p.attempts} tentativi ·
                    {' '}{formatDuration(p.totalPracticeMs)} di studio
                  </Text>
                </Card>
              );
            })}
          </View>
        ) : null}

        {/* ---- Medaglie ---- */}
        <View style={{ marginTop: spacing.lg }}>
          <Text variant="heading" style={{ marginBottom: spacing.sm }}>
            Medaglie {sbloccate > 0 ? `(${sbloccate}/${ACHIEVEMENTS.length})` : ''}
          </Text>
          {ACHIEVEMENTS.map((definizione) => {
            const stato = achievements.find((a) => a.key === definizione.key);
            const avanzamento = Math.min(1, (stato?.progress ?? 0) / definizione.threshold);
            return (
              <Card key={definizione.key} style={{ marginBottom: spacing.xs,
                borderColor: stato?.unlocked ? colors.success : colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="label" tone={stato?.unlocked ? 'success' : 'default'}>
                    {definizione.title}
                  </Text>
                  <Text variant="caption" tone="faint">
                    {Math.min(stato?.progress ?? 0, definizione.threshold)}/{definizione.threshold}
                  </Text>
                </View>
                <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>{definizione.description}</Text>
                {!stato?.unlocked ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <ProgressBar value={avanzamento} height={3} />
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
