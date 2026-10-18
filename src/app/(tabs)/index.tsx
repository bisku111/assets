import { useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { welcomeBackIt } from '../../core/coach/coach';
import { levelProgress } from '../../core/gamification/rules';
import {
  appStore, continueLearning, loadCatalog, minutesPracticedToday, progressForSong, useAppStore,
} from '../../state/appStore';
import { HomeRow } from '../../features/home/HomeRow';
import { LessonPath } from '../../features/home/LessonPath';
import { SongCard } from '../../features/catalog/SongCard';
import { Card } from '../../ui/components/Card';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { StatTile } from '../../ui/components/StatTile';
import { Text } from '../../ui/components/Text';
import { colors, spacing } from '../../ui/theme';

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

  // Ogni valore derivato parte da una fetta sottoscritta: leggere lo
  // stato con getState() durante il render darebbe numeri che non si
  // aggiornano quando cambiano.
  const progress = useAppStore((s) => s.progress);
  const daRiprendere = useMemo(
    () => continueLearning({ ...appStore.getState(), progress, songs }),
    [progress, songs],
  );
  const minutiOggi = useMemo(
    () => minutesPracticedToday({ ...appStore.getState(), recentSessions }),
    [recentSessions],
  );

  const livello = levelProgress(profile?.xp ?? 0);
  const obiettivo = profile?.dailyGoalMinutes ?? 10;
  const ultimoPunteggio = recentSessions[0]?.score ?? null;

  // Gli esercizi del percorso hanno una sezione dedicata: nelle fasce
  // del catalogo si mostra solo il repertorio.
  const repertorio = songs.filter((s) => !s.tags.includes('lezione'));
  const italiane = repertorio.filter((s) => s.tags.includes('italiana') || s.tags.includes('ballata'));
  const principianti = repertorio.filter((s) => s.baseDifficulty === 'beginner');
  const gratuite = repertorio.filter((s) => s.isFree);

  const apri = (id: string) => router.push(`/song/${id}`);
  const scheda = (song: (typeof songs)[number]) => (
    <SongCard key={song.id} song={song} compact
      progress={progressForSong({ ...appStore.getState(), progress }, song.id)}
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
        {/* Il percorso viene prima del catalogo: a chi non sa da dove
            cominciare, un elenco di canzoni non risponde. */}
        <LessonPath />

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
