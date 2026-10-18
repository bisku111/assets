import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DIFFICULTY_LABEL_IT, DIFFICULTY_ORDER, type DifficultyKey } from '../../core/song/types';
import { useAppStore } from '../../state/appStore';
import { SongCard } from '../../features/catalog/SongCard';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { colors, radius, spacing, typography } from '../../ui/theme';

/** Catalogo con ricerca e filtri. */
export default function Catalog() {
  const router = useRouter();
  const songs = useAppStore((s) => s.songs);
  const artists = useAppStore((s) => s.artists);
  const progress = useAppStore((s) => s.progress);
  const [query, setQuery] = useState('');
  const [difficolta, setDifficolta] = useState<DifficultyKey | null>(null);
  const [artista, setArtista] = useState<string | null>(null);

  const risultati = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Gli esercizi del percorso stanno nella Home, non in catalogo:
    // chi cerca "una canzone" non cerca "Le cinque dita".
    return songs.filter((s) => !s.tags.includes('lezione')).filter((s) => {
      if (q && !`${s.title} ${s.artistName}`.toLowerCase().includes(q)) return false;
      if (difficolta && !s.arrangements.some((a) => a.difficulty === difficolta)) return false;
      if (artista && s.artistId !== artista) return false;
      return true;
    });
  }, [songs, query, difficolta, artista]);

  // Artisti in attesa di licenza: si mostrano, ma è chiaro che non
  // hanno brani. Nascondere la cosa genererebbe solo ricerche a vuoto.
  const inAttesa = artists.filter((a) => a.isPlaceholder);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <Text variant="title">Canzoni</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca un brano o un artista"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Cerca"
          style={{
            ...typography.body,
            color: colors.text,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            minHeight: 46,
            marginTop: spacing.md,
          }}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}
        style={{ flexGrow: 0, marginBottom: spacing.sm }}>
        <Chip label="Tutti" active={difficolta === null} onPress={() => setDifficolta(null)} />
        {DIFFICULTY_ORDER.map((d) => (
          <Chip key={d} label={DIFFICULTY_LABEL_IT[d]} active={difficolta === d}
            onPress={() => setDifficolta(difficolta === d ? null : d)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}
        style={{ flexGrow: 0, marginBottom: spacing.md }}>
        {artists.filter((a) => !a.isPlaceholder).map((a) => (
          <Chip key={a.id} label={a.name} active={artista === a.id}
            onPress={() => setArtista(artista === a.id ? null : a.id)} />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}>
        {risultati.length === 0 ? (
          <Text tone="muted" center style={{ marginTop: spacing.xl }}>
            Nessun brano corrisponde alla ricerca.
          </Text>
        ) : (
          risultati.map((song) => (
            <SongCard key={song.id} song={song}
              progress={progress.find((p) => p.songId === song.id) ?? null}
              onPress={() => router.push(`/song/${song.id}`)} />
          ))
        )}

        {inAttesa.length > 0 && !query ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text variant="heading">In arrivo</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
              Stiamo lavorando per portare qui il repertorio di questi artisti.
              Finché la licenza non c'è, non trovi nessun loro brano: preferiamo
              dirlo invece di far cercare a vuoto.
            </Text>
            <Text variant="caption" tone="faint" style={{ marginTop: spacing.sm }}>
              {inAttesa.map((a) => a.name).join(' · ')}
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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
