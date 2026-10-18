import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MODE_DESCRIPTION_IT, MODE_LABEL_IT, type PracticeMode } from '../../core/engine/matcher';
import { licenseLabelIt } from '../../core/song/license';
import { availableDifficulties, formatDuration, resolveArrangement } from '../../core/song/query';
import {
  DIFFICULTY_LABEL_IT, SECTION_LABEL_IT, type DifficultyKey,
} from '../../core/song/types';
import { suggestedRateFor } from '../../core/learning/progression';
import { useAppStore } from '../../state/appStore';
import { PremiumBadge } from '../../features/catalog/SongCard';
import { Button } from '../../ui/components/Button';
import { Card } from '../../ui/components/Card';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { Stars } from '../../ui/components/Stars';
import { Text } from '../../ui/components/Text';
import { colors, radius, spacing } from '../../ui/theme';

/**
 * Scheda del brano: si sceglie COSA studiare prima di iniziare.
 *
 * Difficolta', sezione e modalita' si decidono qui e non dentro il
 * tutorial: mentre si suona, ogni menu' in piu' e' una mano tolta dalla
 * tastiera.
 */
export default function SongDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const songs = useAppStore((s) => s.songs);
  const song = songs.find((s) => s.id === id || s.slug === id);

  const progressi = useAppStore((s) => s.progress);
  const progresso = song ? (progressi.find((p) => p.songId === song.id) ?? null) : null;

  const difficolta = useMemo(() => (song ? availableDifficulties(song) : []), [song]);
  const [livello, setLivello] = useState<DifficultyKey | null>(null);
  const [sezione, setSezione] = useState<string | null>(null);
  const [modalita, setModalita] = useState<PracticeMode>('learn');

  if (!song) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
        <Text variant="title">Brano non disponibile</Text>
        <Text tone="muted" style={{ marginTop: spacing.sm }}>
          Questo brano non e' piu' in catalogo, oppure non e' ancora stato scaricato.
        </Text>
        <Button label="Torna indietro" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
      </SafeAreaView>
    );
  }

  const livelloScelto = livello ?? difficolta[0] ?? song.baseDifficulty;
  const arrangement = resolveArrangement(song, livelloScelto);

  const avanzamentoSezioni = progresso?.sectionState ?? {};
  const velocita = arrangement
    ? suggestedRateFor(
        arrangement,
        { arrangementId: arrangement.id, sections: avanzamentoSezioni },
        sezione ?? arrangement.sections[0]?.id ?? '',
      )
    : 70;

  const [c1, c2] = song.coverColors;

  const inizia = () => {
    const params = new URLSearchParams({
      difficulty: livelloScelto,
      mode: modalita,
      rate: String(velocita),
    });
    if (sezione) params.set('section', sezione);
    router.push(`/play/${song.id}?${params.toString()}`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {/* ---- Copertina ---- */}
        <View style={{ height: 180, backgroundColor: c1, borderBottomWidth: 28, borderBottomColor: c2,
          justifyContent: 'flex-end', padding: spacing.lg }}>
          <Text variant="display" numberOfLines={2}>{song.title}</Text>
          <Text tone="muted">{song.artistName}</Text>
        </View>

        <View style={{ padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
            <Text variant="caption" tone="faint">
              {formatDuration(song.durationMs)} · {Math.round(song.bpm)} BPM · tonalita {song.keySignature}
            </Text>
            {!song.isFree ? <PremiumBadge /> : null}
          </View>

          {progresso && progresso.completionPct > 0 ? (
            <Card style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="label" tone="muted">Il tuo avanzamento</Text>
                <Stars value={progresso.stars} size={14} />
              </View>
              <View style={{ marginTop: spacing.sm }}>
                <ProgressBar value={progresso.completionPct / 100} />
              </View>
              <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
                {progresso.completionPct}% completato · miglior punteggio {progresso.bestScore}/100
              </Text>
            </Card>
          ) : null}

          {/* ---- Difficolta' ---- */}
          <Sezione titolo="Livello">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {difficolta.map((d) => (
                <Pill key={d} label={DIFFICULTY_LABEL_IT[d]} active={d === livelloScelto}
                  onPress={() => { setLivello(d); setSezione(null); }} />
              ))}
            </View>
          </Sezione>

          {/* ---- Sezioni ---- */}
          {arrangement ? (
            <Sezione titolo="Che parte vuoi studiare">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                <Pill label="Tutto il brano" active={sezione === null} onPress={() => setSezione(null)} />
                {arrangement.sections.map((s) => {
                  const superata = (avanzamentoSezioni[s.id]?.clearedRatePct ?? 0) >= 100;
                  return (
                    <Pill
                      key={s.id}
                      label={`${s.name}${superata ? ' ✓' : ''}`}
                      active={sezione === s.id}
                      onPress={() => setSezione(s.id)}
                    />
                  );
                })}
              </View>
              <Text variant="caption" tone="faint" style={{ marginTop: spacing.sm }}>
                {arrangement.sections.length} sezioni · {arrangement.notes.length} note ·
                {' '}{arrangement.hands.length === 2 ? 'due mani' : 'una mano'}
              </Text>
            </Sezione>
          ) : null}

          {/* ---- Modalita' ---- */}
          <Sezione titolo="Come vuoi suonare">
            {(['learn', 'practice', 'play', 'performance'] as PracticeMode[]).map((m) => (
              <Card
                key={m}
                onPress={() => setModalita(m)}
                accessibilityLabel={MODE_LABEL_IT[m]}
                style={{
                  marginBottom: spacing.xs,
                  borderColor: m === modalita ? colors.primary : colors.border,
                  backgroundColor: m === modalita ? colors.surfaceRaised : colors.surface,
                }}
              >
                <Text variant="heading">{MODE_LABEL_IT[m]}</Text>
                <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>{MODE_DESCRIPTION_IT[m]}</Text>
              </Card>
            ))}
          </Sezione>

          <Button
            label="Inizia"
            onPress={inizia}
            disabled={!arrangement}
            hint={`${sezione ? SECTION_LABEL_IT[arrangement?.sections.find((s) => s.id === sezione)?.kind ?? 'verse'] : 'Tutto il brano'} · ${velocita}% di velocita`}
          />

          <Text variant="caption" tone="faint" center style={{ marginTop: spacing.lg }}>
            {licenseLabelIt(song.license)}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>{titolo}</Text>
      {children}
    </View>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Card
      onPress={onPress}
      padded={false}
      accessibilityLabel={label}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.primary : colors.surface,
        borderColor: active ? colors.primary : colors.border,
      }}
    >
      <Text variant="label" style={{ color: active ? colors.text : colors.textMuted }}>{label}</Text>
    </Card>
  );
}
