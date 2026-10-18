import { useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { welcomeBackIt } from '../../core/coach/coach';
import { levelProgress } from '../../core/gamification/rules';
import {
  continueLearning, loadCatalog, minutesPracticedToday, progressForSong, useAppStore,
} from '../../state/appStore';
import { HomeRow } from '../../features/home/HomeRow';
import { SongCard } from '../../features/catalog/SongCard';
import { Card } from '../../ui/components/Card';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { StatTile } from '../../ui/components/StatTile';
import { Text } from '../../ui/components/Text';
import { colors, spacing } from '../../ui/theme';
import { appStore } from '../../state/appStore';

/**
 * Home.
 *
 * Prima riga: riprendere quello che si stava facendo. E' l'azione che
 * l'utente abituale compie nove volte su dieci, e metterla sopra a tutto
 * le fa risparmiare due tocchi ogni sessione.
 */
export default function Home() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const songs = useAppStore((s) => s.songs);
  const recentSessions = useAppStore((s) => s.recentSessions);
  const errore = useAppStore((s) => s.error);

  const stato = appStore.getState();
  const daRiprendere = useMemo(() => continueLearning(stato), [stato.progress, stato.songs]);
  const minutiOggi = minutesPracticedToday(stato);

  const livello = levelProgress(profile?.xp ?? 0);
  const obiettivo = profile?.dailyGoalMinutes ?? 10;
  const ultimoPunteggio = recentSessions[0]?.score ?? null;

  const italiane = songs.filter((s) => s.tags.includes('italiana') || s.tags.includes('ballata'));
  const principianti = songs.filter((s) => s.baseDifficulty === 'beginner');
  const gratuite = songs.filter((s) => s.isFree);

  const apri = (id: string) => router.push(`/song/${id}`);
  const scheda = (song: (typeof songs)[number]) => (
    <SongCard key={song.id} song={song} compact progress={progressForSong(stato, song.id)}
      onPress={() => apri(song.id)} />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void loadCatalog()} tintColor={colors.primary} />}
      >
        {/* ---- Intestazione ---- */}
        <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
          <Text variant="caption" tone="muted">Ciao {profile?.displayName ?? 'Pianista'}</Text>
          <Text variant="title" style={{ marginTop: 2 }}>{welcomeBackIt(ultimoPunteggio, profile?.streakCurrent ?? 0)}</Text>
        </View>

        {errore ? (
          <Card style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md, borderColor: colors.warning }}>
            <Text variant="caption" tone="warning">{errore}</Text>
          </Card>
        ) : null}

        {/* ---- Obiettivo di oggi ---- */}
        <Card style={{ marginHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="label" tone="muted">Oggi</Text>
            <Text variant="caption" tone={minutiOggi >= obiettivo ? 'success' : 'muted'}>
              {minutiOggi} / {obiettivo} minuti
            </Text>
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <ProgressBar
              value={minutiOggi / Math.max(1, obiettivo)}
              color={minutiOggi >= obiettivo ? colors.success : colors.primary}
              accessibilityLabel={`${minutiOggi} minuti su ${obiettivo}`}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <StatTile value={`${livello.level}`} label="Livello" tone="primary" />
            <StatTile value={`${profile?.streakCurrent ?? 0}`} label="Giorni di fila"
              tone={(profile?.streakCurrent ?? 0) > 0 ? 'warning' : 'default'} />
            <StatTile value={`${Math.round((profile?.totalPracticeMs ?? 0) / 60_000)}`}
              label="Minuti totali" suffix="min" />
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Text variant="caption" tone="faint" style={{ marginBottom: spacing.xs }}>
              {livello.current} / {livello.needed} XP al livello {livello.level + 1}
            </Text>
            <ProgressBar value={livello.pct / 100} height={4} color={colors.accent} />
          </View>
        </Card>

        {/* ---- Fasce di brani ---- */}
        <HomeRow title="Continua a imparare" subtitle="Riprendi da dove eri rimasto"
          empty="Non hai ancora brani in corso: scegline uno qui sotto.">
          {daRiprendere.map(scheda)}
        </HomeRow>

        <HomeRow title="Per cominciare" subtitle="Brani che si imparano al primo tentativo">
          {principianti.map(scheda)}
        </HomeRow>

        <HomeRow title="Canzoni italiane" subtitle="Ballate originali nello stile della canzone italiana">
          {italiane.map(scheda)}
        </HomeRow>

        <HomeRow title="Gratis per te" subtitle="Nessun abbonamento richiesto">
          {gratuite.map(scheda)}
        </HomeRow>
      </ScrollView>
    </SafeAreaView>
  );
}
