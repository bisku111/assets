import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_LATENCY_MS } from '../../core/dsp/latency';
import type { InputPreference, SkillLevel } from '../../core/ports/repository';
import { signOut, updateProfile, useAppStore } from '../../state/appStore';
import { Button } from '../../ui/components/Button';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { colors, radius, spacing } from '../../ui/theme';

const LIVELLI: Array<{ key: SkillLevel; label: string }> = [
  { key: 'never_played', label: 'Mai suonato' },
  { key: 'beginner', label: 'Principiante' },
  { key: 'plays_already', label: 'So suonare' },
  { key: 'advanced', label: 'Avanzato' },
];

const SORGENTI: Array<{ key: InputPreference; label: string; nota: string }> = [
  { key: 'virtual-keyboard', label: 'Tastiera a schermo', nota: 'Funziona sempre, su qualsiasi dispositivo.' },
  { key: 'midi', label: 'Tastiera MIDI', nota: 'La piu precisa. Su web funziona con Chrome ed Edge.' },
  { key: 'microphone', label: 'Microfono', nota: 'Ascolta il pianoforte acustico. Una nota per volta: gli accordi non sono affidabili.' },
];

const OBIETTIVI = [5, 10, 20, 30];

export default function Profile() {
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const remote = useAppStore((s) => s.remote);
  if (!profile) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text variant="title">{profile.displayName}</Text>
        <Text variant="caption" tone="muted">
          {session?.email ?? 'Account solo su questo dispositivo'}
        </Text>

        {!remote ? (
          <Card style={{ marginTop: spacing.md, borderColor: colors.warning }}>
            <Text variant="label" tone="warning">Nessuna sincronizzazione</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
              I tuoi progressi sono salvati solo qui. Se disinstalli l'app o cambi
              telefono, vanno persi. Lo diciamo perche' succede, non per allarmare.
            </Text>
          </Card>
        ) : null}

        <Gruppo titolo="Il tuo livello">
          <Righe>
            {LIVELLI.map((l) => (
              <Pill key={l.key} label={l.label} active={profile.skillLevel === l.key}
                onPress={() => void updateProfile({ skillLevel: l.key })} />
            ))}
          </Righe>
        </Gruppo>

        <Gruppo titolo="Obiettivo giornaliero">
          <Righe>
            {OBIETTIVI.map((m) => (
              <Pill key={m} label={`${m} min`} active={profile.dailyGoalMinutes === m}
                onPress={() => void updateProfile({ dailyGoalMinutes: m })} />
            ))}
          </Righe>
        </Gruppo>

        <Gruppo titolo="Come suoni">
          {SORGENTI.map((s) => (
            <Card
              key={s.key}
              onPress={() => void updateProfile({
                preferredInput: s.key,
                // Si riparte dalla latenza tipica della sorgente: e' una
                // stima onesta finche' l'utente non calibra davvero.
                inputLatencyMs: DEFAULT_LATENCY_MS[s.key],
              })}
              accessibilityLabel={s.label}
              style={{
                marginBottom: spacing.xs,
                borderColor: profile.preferredInput === s.key ? colors.primary : colors.border,
              }}
            >
              <Text variant="heading">{s.label}</Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>{s.nota}</Text>
            </Card>
          ))}
          <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
            Compensazione del ritardo in uso: {profile.inputLatencyMs} ms.
          </Text>
        </Gruppo>

        <Gruppo titolo="Privacy">
          <Card>
            <Text variant="caption" tone="muted" style={{ lineHeight: 20 }}>
              Quando usi il microfono, l'audio viene elaborato solo sul dispositivo
              per riconoscere le note: non viene registrato, non viene salvato e non
              viene inviato a nessun server. Puoi revocare il permesso in qualsiasi
              momento dalle impostazioni di sistema e continuare con la tastiera a
              schermo.
            </Text>
          </Card>
        </Gruppo>

        <Gruppo titolo="Abbonamento">
          <Card>
            <Text variant="heading">Piano gratuito</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs, lineHeight: 20 }}>
              Hai accesso ai brani gratuiti e ai livelli Principiante e Facile.
              I pagamenti non sono ancora attivi in questa versione: quando lo
              saranno, troverai qui il piano mensile e annuale.
            </Text>
          </Card>
        </Gruppo>

        <Button label="Esci" variant="danger" onPress={() => void signOut()} style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Gruppo({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>{titolo}</Text>
      {children}
    </View>
  );
}

function Righe({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>{children}</View>;
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Card onPress={onPress} padded={false} accessibilityLabel={label}
      style={{
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
        backgroundColor: active ? colors.primary : colors.surface,
        borderColor: active ? colors.primary : colors.border,
      }}>
      <Text variant="label" style={{ color: active ? colors.text : colors.textMuted }}>{label}</Text>
    </Card>
  );
}
