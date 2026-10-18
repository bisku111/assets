import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createMetronome } from '../adapters/metronome';
import { createMicrophoneInput, createMidiInput, createVirtualKeyboardInput } from '../adapters/inputs';
import { LatencyCalibrator, type CalibrationFrame } from '../core/dsp/calibrationSession';
import { DEFAULT_LATENCY_MS, calibrationMessageIt, type CalibrationResult } from '../core/dsp/latency';
import { metronomeHintIt } from '../core/ports/metronome';
import { systemClock } from '../core/ports/clock';
import { inputStatusMessageIt, type InputStatus, type NoteInputPort } from '../core/ports/noteInput';
import { updateProfile, useAppStore } from '../state/appStore';
import { PianoKeyboard } from '../ui/PianoKeyboard';
import { Button } from '../ui/components/Button';
import { Card } from '../ui/components/Card';
import { ProgressBar } from '../ui/components/ProgressBar';
import { Text } from '../ui/components/Text';
import { colors, radius, spacing } from '../ui/theme';

const BPM = 80;
const BATTITI = 8;
const PREPARAZIONE = 4;

/**
 * Calibrazione del ritardo di ingresso.
 *
 * Serve soprattutto a chi collega un pianoforte digitale via Bluetooth,
 * dove il ritardo arriva a un decimo di secondo: senza compensazione un
 * allievo preciso verrebbe giudicato sistematicamente in ritardo, ed è
 * l'errore che fa perdere fiducia nell'app più di qualunque altro.
 */
export default function Calibrate() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const preferredInput = profile?.preferredInput ?? 'virtual-keyboard';

  const metronomo = useMemo(() => createMetronome(), []);
  const calibratore = useMemo(
    () => new LatencyCalibrator({ clock: systemClock, bpm: BPM, beats: BATTITI, countInBeats: PREPARAZIONE }),
    [],
  );

  const [frame, setFrame] = useState<CalibrationFrame>({
    phase: 'idle', beatIndex: -PREPARAZIONE, beatProgress: 0, collected: 0, totalBeats: BATTITI,
  });
  const [risultato, setRisultato] = useState<CalibrationResult | null>(null);
  const [correzione, setCorrezione] = useState(profile?.inputLatencyMs ?? 0);
  const [statoIngresso, setStatoIngresso] = useState<InputStatus>({ state: 'idle' });
  const [premuti, setPremuti] = useState<number[]>([]);

  const tastieraRef = useRef<ReturnType<typeof createVirtualKeyboardInput> | null>(null);
  if (tastieraRef.current === null) tastieraRef.current = createVirtualKeyboardInput();
  const tastiera = tastieraRef.current;
  const inCorsa = frame.phase === 'count-in' || frame.phase === 'measuring';

  // ---- Sorgenti di ingresso ------------------------------------------
  useEffect(() => {
    const porte: NoteInputPort[] = [tastiera];
    if (preferredInput === 'midi') porte.unshift(createMidiInput());
    if (preferredInput === 'microphone') porte.unshift(createMicrophoneInput());

    const stop = porte.map((porta) =>
      porta.subscribe((evento) => {
        if (evento.type === 'note-on') {
          setPremuti((c) => (c.includes(evento.midi) ? c : [...c, evento.midi]));
          calibratore.record(evento.timestamp);
        } else {
          setPremuti((c) => c.filter((m) => m !== evento.midi));
        }
      }),
    );

    void (async () => {
      for (const porta of porte) {
        const stato = await porta.start();
        if (porta.id === preferredInput) setStatoIngresso(stato);
      }
    })();

    return () => {
      for (const u of stop) u();
      for (const porta of porte) porta.stop();
    };
  }, [preferredInput, calibratore, tastiera]);

  useEffect(() => () => metronomo.dispose(), [metronomo]);

  // ---- Ciclo: battiti del metronomo e aggiornamento a schermo ----------
  const ultimoBattito = useRef<number>(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    let attivo = true;
    let handle: number;

    const loop = () => {
      if (!attivo) return;
      const corrente = calibratore.tick();
      setFrame(corrente);

      // Il battito suona una volta sola: il ciclo gira a 60 fps.
      const assoluto = corrente.beatIndex + PREPARAZIONE;
      if (
        (corrente.phase === 'count-in' || corrente.phase === 'measuring') &&
        assoluto !== ultimoBattito.current
      ) {
        ultimoBattito.current = assoluto;
        metronomo.tick(assoluto % 4 === 0);
      }

      if (corrente.phase === 'done' && !risultato) setRisultato(calibratore.result());
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);

    return () => { attivo = false; cancelAnimationFrame(handle); };
  }, [calibratore, metronomo, risultato]);

  const avvia = useCallback(() => {
    setRisultato(null);
    ultimoBattito.current = Number.NEGATIVE_INFINITY;
    calibratore.start();
  }, [calibratore]);

  useEffect(() => {
    if (risultato) setCorrezione(risultato.latencyMs);
  }, [risultato]);

  const salva = async () => {
    await updateProfile({ inputLatencyMs: Math.max(-500, Math.min(500, Math.round(correzione))) });
    router.back();
  };

  // Con lo strumento collegato e pronto si batte su quello.
  const mostraTastiera = preferredInput === 'virtual-keyboard' || statoIngresso.state !== 'ready';

  const etichettaSorgente =
    preferredInput === 'midi' ? 'tastiera MIDI'
    : preferredInput === 'microphone' ? 'microfono'
    : 'tastiera a schermo';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.md }}>
        <Text variant="title">Calibrazione del ritardo</Text>
        <Text tone="muted" style={{ marginTop: spacing.xs, lineHeight: 21 }}>
          Suona una nota qualsiasi su ogni battito, sulla tua {etichettaSorgente}.
          Quattro battiti di preparazione, poi otto da misurare.
        </Text>

        <Card style={{ marginTop: spacing.md }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 19 }}>
            {metronomeHintIt(metronomo.kind)}
          </Text>
        </Card>

        {statoIngresso.state !== 'ready' && preferredInput !== 'virtual-keyboard' ? (
          <Card style={{ marginTop: spacing.sm, borderColor: colors.warning }}>
            <Text variant="caption" tone="warning">
              {inputStatusMessageIt(statoIngresso, preferredInput)}
            </Text>
          </Card>
        ) : null}

        {/* ---- Indicatore del battito ---- */}
        <View style={{ alignItems: 'center', marginVertical: spacing.xl }}>
          <Battito frame={frame} />
          <Text variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
            {frame.phase === 'idle' ? 'Pronto quando vuoi'
              : frame.phase === 'count-in' ? 'Preparati...'
              : frame.phase === 'measuring' ? `Battito ${frame.beatIndex + 1} di ${frame.totalBeats}`
              : 'Fatto'}
          </Text>
          <View style={{ width: '70%', marginTop: spacing.sm }}>
            <ProgressBar
              value={frame.collected / frame.totalBeats}
              color={colors.accent}
              accessibilityLabel={`${frame.collected} colpi su ${frame.totalBeats}`}
            />
          </View>
          <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
            {frame.collected} note registrate
          </Text>
        </View>

        {/* ---- Risultato ---- */}
        {risultato ? (
          <Card style={{ borderColor: risultato.reliable ? colors.success : colors.warning }}>
            <Text variant="metric" center tone={risultato.reliable ? 'success' : 'warning'}>
              {correzione > 0 ? '+' : ''}{Math.round(correzione)}
              <Text variant="title" tone="muted"> ms</Text>
            </Text>
            <Text variant="caption" tone="muted" center style={{ marginTop: spacing.sm, lineHeight: 19 }}>
              {calibrationMessageIt(risultato)}
            </Text>

            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, justifyContent: 'center' }}>
              <Regola label="−5 ms" onPress={() => setCorrezione((c) => c - 5)} />
              <Regola label="+5 ms" onPress={() => setCorrezione((c) => c + 5)} />
              <Regola label="Azzera" onPress={() => setCorrezione(0)} />
            </View>

            {/*
              Si dice che cosa comprende il numero. Il ritardo del tasto
              non è osservabile da solo: serve un riferimento, e l'unico
              è l'utente che suona a tempo. Quindi la misura include
              anche la sua tendenza personale — ed è giusto così, visto
              che l'obiettivo è che il giudizio coincida con quello che
              l'allievo sente.
            */}
            <Text variant="caption" tone="faint" style={{ marginTop: spacing.md, lineHeight: 18 }}>
              Questo valore comprende sia il ritardo tecnico del tuo strumento
              sia la tua tendenza ad anticipare o ritardare. È quello che serve
              perché il giudizio dell'app corrisponda a come ti senti mentre
              suoni. Puoi correggerlo a mano quando vuoi.
            </Text>
          </Card>
        ) : null}

        <Button
          label={inCorsa ? 'In corso...' : risultato ? 'Ripeti la misura' : 'Avvia'}
          onPress={avvia}
          disabled={inCorsa}
          style={{ marginTop: spacing.lg }}
        />
        {risultato ? (
          <Button label="Salva" variant="secondary" onPress={() => void salva()} style={{ marginTop: spacing.xs }} />
        ) : null}
        <Button label="Annulla" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.xs }} />

        <Text variant="caption" tone="faint" center style={{ marginTop: spacing.lg }}>
          Valore tipico: {DEFAULT_LATENCY_MS.midi} ms via USB, fino a 100 ms via Bluetooth.
        </Text>
      </ScrollView>

      {/*
        La tastiera sta FUORI dall'area che scorre: durante la misura
        deve restare sotto il pollice. Dentro lo ScrollView finirebbe
        sotto la piega, e chi non ha lo strumento collegato dovrebbe
        scorrere mentre il metronomo già va.

        Sparisce quando lo strumento vero è collegato e pronto: in quel
        caso si batte sul pianoforte, e la tastiera a schermo toglierebbe
        soltanto spazio al risultato e ai pulsanti.
      */}
      {mostraTastiera ? (
        <View style={{ paddingHorizontal: spacing.sm, paddingTop: spacing.xs }}>
          <Text variant="caption" tone="faint" center style={{ marginBottom: spacing.xs }}>
            Puoi battere anche qui, se non hai lo strumento collegato.
          </Text>
          <PianoKeyboard
            fromMidi={60}
            toMidi={72}
            pressed={premuti}
            onPressKey={(midi) => tastiera.press(midi)}
            onReleaseKey={(midi) => tastiera.release(midi)}
            height={110}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/** Cerchio che pulsa sul battito. */
function Battito({ frame }: { frame: CalibrationFrame }) {
  const attivo = frame.phase === 'count-in' || frame.phase === 'measuring';
  // Pulsa forte all'attacco e si sgonfia: è l'attacco il riferimento,
  // non il centro del battito.
  const scala = attivo ? 1 + 0.35 * Math.max(0, 1 - frame.beatProgress * 3) : 1;
  const colore = frame.phase === 'measuring' ? colors.primary
    : frame.phase === 'count-in' ? colors.warning
    : colors.surfaceRaised;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={attivo ? `Battito ${frame.beatIndex + 1}` : 'Metronomo fermo'}
      style={{
        width: 120, height: 120, borderRadius: 60,
        backgroundColor: colore, opacity: attivo ? 1 : 0.4,
        transform: [{ scale: scala }],
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text variant="display" style={{ color: colors.background }}>
        {attivo ? Math.abs(frame.beatIndex + (frame.beatIndex < 0 ? 0 : 1)) || PREPARAZIONE : '♪'}
      </Text>
    </View>
  );
}

function Regola({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} padded={false} accessibilityLabel={label}
      style={{
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
        borderRadius: radius.pill, backgroundColor: colors.surfaceRaised,
      }}>
      <Text variant="label" tone="muted">{label}</Text>
    </Card>
  );
}
