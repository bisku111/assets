import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createMidiInput } from '../adapters/inputs';
import { noteNameIt } from '../core/music/note';
import { inputStatusMessageIt, type InputStatus } from '../core/ports/noteInput';
import { updateProfile, useAppStore } from '../state/appStore';
import { PianoKeyboard } from '../ui/PianoKeyboard';
import { Button } from '../ui/components/Button';
import { Card } from '../ui/components/Card';
import { Text } from '../ui/components/Text';
import { colors, radius, spacing } from '../ui/theme';

/**
 * Verifica del collegamento MIDI.
 *
 * Esiste per rispondere alla domanda che si fa chiunque colleghi un
 * pianoforte per la prima volta: "l'app lo sta vedendo?". Senza una
 * risposta esplicita, un utente con un cavo difettoso o un browser che
 * non supporta il MIDI passerebbe dal tutorial, non sentirebbe reagire
 * niente e concluderebbe che l'app è rotta.
 *
 * Mostra tre cose, in ordine di utilita': lo stato del collegamento, il
 * nome dello strumento riconosciuto, e le note che arrivano davvero
 * mentre si suona.
 */
export default function MidiSetup() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);

  const ingresso = useMemo(() => createMidiInput(), []);
  const [stato, setStato] = useState<InputStatus>({ state: 'starting' });
  const [dispositivi, setDispositivi] = useState<string[]>([]);
  const [premuti, setPremuti] = useState<number[]>([]);
  const [ultime, setUltime] = useState<number[]>([]);
  const [ricevute, setRicevute] = useState(0);
  /**
   * Il permesso MIDI del browser è una domanda all'utente: finché non
   * risponde, la promessa resta appesa. Senza questo avviso la
   * schermata direbbe "Cerco..." per sempre, e chi ha chiuso la
   * finestrella del permesso senza accorgersene non saprebbe perché.
   */
  const [attesaLunga, setAttesaLunga] = useState(false);
  /**
   * Chi collega il pianoforte DOPO aver aperto la schermata deve poter
   * riprovare senza uscire e rientrare: è la sequenza più naturale,
   * perché si apre la schermata proprio per sapere dove attaccare il cavo.
   */
  const [tentativo, setTentativo] = useState(0);
  const montato = useRef(true);

  useEffect(() => {
    montato.current = true;
    setStato({ state: 'starting' });
    setAttesaLunga(false);

    const stop = ingresso.subscribe((evento) => {
      if (evento.type === 'note-on') {
        setPremuti((c) => (c.includes(evento.midi) ? c : [...c, evento.midi]));
        setUltime((c) => [evento.midi, ...c].slice(0, 8));
        setRicevute((n) => n + 1);
      } else {
        setPremuti((c) => c.filter((m) => m !== evento.midi));
      }
    });

    const avviso = setTimeout(() => {
      if (montato.current) setAttesaLunga(true);
    }, 6000);

    void (async () => {
      const risultato = await ingresso.start();
      if (!montato.current) return;
      clearTimeout(avviso);
      setAttesaLunga(false);
      setStato(risultato);
      setDispositivi(ingresso.devices?.() ?? []);
    })();

    return () => {
      montato.current = false;
      clearTimeout(avviso);
      stop();
      ingresso.stop();
    };
  }, [ingresso, tentativo]);

  const collegato = stato.state === 'ready';
  const estensione = useMemo(() => {
    if (ultime.length === 0) return { from: 48, to: 72 };
    // La tastiera si adatta a quello che arriva: così si vede subito
    // se lo strumento manda le note che ci si aspetta.
    const min = Math.min(...ultime, 60);
    const max = Math.max(...ultime, 72);
    return { from: Math.max(21, min - 2), to: Math.min(108, max + 2) };
  }, [ultime]);

  const usaMidi = async () => {
    await updateProfile({ preferredInput: 'midi' });
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
        <Text variant="title">Collega il pianoforte</Text>

        {/* ---- Stato ---- */}
        <Card
          style={{
            marginTop: spacing.md,
            borderColor: collegato ? colors.success : stato.state === 'starting' ? colors.border : colors.warning,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm,
                backgroundColor: collegato ? colors.success : stato.state === 'starting' ? colors.textFaint : colors.warning,
              }}
            />
            <Text variant="heading">
              {collegato ? 'Collegato' : stato.state === 'starting' ? 'Cerco...' : 'Non collegato'}
            </Text>
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs, lineHeight: 19 }}>
            {attesaLunga
              ? 'Sto ancora aspettando il permesso di accedere ai dispositivi MIDI. Il browser dovrebbe averlo chiesto in alto: se la richiesta e sparita, ricarica la pagina e accetta.'
              : inputStatusMessageIt(stato, 'midi')}
          </Text>

          {dispositivi.length > 0 ? (
            <View style={{ marginTop: spacing.md }}>
              <Text variant="label" tone="muted">Strumenti riconosciuti</Text>
              {dispositivi.map((nome) => (
                <Text key={nome} style={{ marginTop: spacing.xs }}>· {nome}</Text>
              ))}
            </View>
          ) : null}
        </Card>

        {/* ---- Prova pratica ---- */}
        <Card style={{ marginTop: spacing.sm }}>
          <Text variant="label" tone="muted">Prova: suona qualche nota</Text>
          <Text variant="metric" center tone={ricevute > 0 ? 'success' : 'faint'} style={{ marginVertical: spacing.sm }}>
            {ricevute}
          </Text>
          <Text variant="caption" tone="faint" center>
            {ricevute === 0 ? 'note ricevute: nessuna, per ora' : 'note ricevute'}
          </Text>

          {ultime.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md, justifyContent: 'center' }}>
              {ultime.map((midi, i) => (
                <View
                  key={`${midi}-${i}`}
                  style={{
                    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill,
                    backgroundColor: i === 0 ? colors.primary : colors.surfaceRaised,
                  }}
                >
                  <Text variant="label" style={{ color: i === 0 ? colors.text : colors.textMuted }}>
                    {noteNameIt(midi)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        <View style={{ marginTop: spacing.md }}>
          <PianoKeyboard fromMidi={estensione.from} toMidi={estensione.to} pressed={premuti} height={120} />
        </View>

        {/* ---- Aiuto, solo se serve ---- */}
        {!collegato && (stato.state !== 'starting' || attesaLunga) ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text variant="label" tone="muted">Cosa controllare</Text>
            <Aiuto testo="Collega il cavo alla presa USB quadrata del pianoforte (quella tipo stampante, marcata USB TO HOST), non alla presa per la chiavetta." />
            <Aiuto testo="Accendi lo strumento prima di aprire questa schermata, poi tocca Riprova." />
            {Platform.OS === 'web' ? (
              <Aiuto testo="Su computer usa Chrome o Edge: Safari non supporta il MIDI nel browser." />
            ) : (
              <Aiuto testo="Su telefono e tablet il MIDI richiede una versione dell'app con il modulo nativo: per ora puoi suonare sulla tastiera a schermo." />
            )}
            <Aiuto testo="Nessun driver da installare: i pianoforti digitali sono quasi sempre riconosciuti da soli." />
          </Card>
        ) : null}

        {collegato ? (
          <Button
            label={profile?.preferredInput === 'midi' ? 'Gia impostato come ingresso' : 'Usa il pianoforte per studiare'}
            onPress={() => void usaMidi()}
            disabled={profile?.preferredInput === 'midi'}
            style={{ marginTop: spacing.md }}
          />
        ) : null}

        {collegato ? (
          <Button
            label="Calibra il ritardo"
            variant="secondary"
            hint="Consigliato se il collegamento e via Bluetooth"
            onPress={() => router.push('/calibrate')}
            style={{ marginTop: spacing.xs }}
          />
        ) : null}

        {!collegato ? (
          <Button
            label="Riprova"
            variant="secondary"
            hint="Collega il cavo e accendi lo strumento, poi tocca qui"
            onPress={() => setTentativo((n) => n + 1)}
            style={{ marginTop: spacing.md }}
          />
        ) : null}

        <Button label="Chiudi" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.xs }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Aiuto({ testo }: { testo: string }) {
  return (
    <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm, lineHeight: 19 }}>
      · {testo}
    </Text>
  );
}
