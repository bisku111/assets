import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CoachAction } from '../../core/coach/coach';
import type { PracticeMode } from '../../core/engine/matcher';
import type { SessionResult } from '../../core/engine/session';
import { nextRate, previousRate } from '../../core/learning/progression';
import { inputStatusMessageIt, type InputSourceId } from '../../core/ports/noteInput';
import { formatDuration, midiRange, resolveArrangement } from '../../core/song/query';
import type { DifficultyKey, Hand, Song, SongArrangement } from '../../core/song/types';
import { ResultSheet } from '../../features/player/ResultSheet';
import { useKeepScreenAwake } from '../../features/player/useKeepScreenAwake';
import { usePracticeSession } from '../../features/player/usePracticeSession';
import { recordPractice, useAppStore } from '../../state/appStore';
import { NoteHighway } from '../../ui/NoteHighway';
import { PianoKeyboard } from '../../ui/PianoKeyboard';
import { Button } from '../../ui/components/Button';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { Text } from '../../ui/components/Text';
import { colors, handColor, radius, spacing } from '../../ui/theme';

/**
 * Tutorial interattivo.
 *
 * Tre fasce verticali: comandi in alto (piccoli), note in arrivo al
 * centro (tutto lo spazio restante), tastiera in basso, dove stanno le
 * mani. L'ordine non e' estetico: si guarda al centro e si suona in
 * basso, quindi i comandi non devono mai stare fra i due.
 */
export default function Play() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string; difficulty?: string; mode?: string; section?: string; rate?: string;
  }>();

  const songs = useAppStore((s) => s.songs);
  const song = songs.find((s) => s.id === params.id || s.slug === params.id);
  const arrangement = song
    ? resolveArrangement(song, (params.difficulty ?? song.baseDifficulty) as DifficultyKey)
    : null;

  if (!song || !arrangement) {
    return (
      <SafeAreaView style={styles.schermo}>
        <View style={{ padding: spacing.lg }}>
          <Text variant="title">Brano non disponibile</Text>
          <Text tone="muted" style={{ marginTop: spacing.sm }}>
            Le note di questo brano non sono accessibili. Se e' un brano premium,
            serve un abbonamento attivo.
          </Text>
          <Button label="Torna indietro" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <PlaySession
      song={song}
      arrangement={arrangement}
      mode={(params.mode ?? 'learn') as PracticeMode}
      initialRatePct={Number(params.rate ?? 70)}
      initialSectionId={params.section ?? null}
      onExit={() => router.back()}
    />
  );
}

interface PlaySessionProps {
  song: Song;
  arrangement: SongArrangement;
  mode: PracticeMode;
  initialRatePct: number;
  initialSectionId: string | null;
  onExit: () => void;
}

/**
 * Tiene le scelte dell'utente (velocita', sezione, mani) e ricrea la
 * sessione quando cambiano. Sono parametri del motore, non valori
 * modificabili a caldo: cambiarli a meta' esercizio falserebbe il voto.
 */
function PlaySession({ song, arrangement, mode, initialRatePct, initialSectionId, onExit }: PlaySessionProps) {
  const [ratePct, setRatePct] = useState(initialRatePct);
  const [sectionId, setSectionId] = useState(initialSectionId);
  const [hands, setHands] = useState<Hand[] | null>(null);
  const [loop, setLoop] = useState(false);
  const [tentativi, setTentativi] = useState(0);

  const maniAttive = hands ?? arrangement.hands;

  return (
    <PlayStage
      // La chiave forza una sessione nuova e pulita ad ogni cambio di
      // parametro: piu' sicuro che tentare di riconfigurare il motore.
      key={`${arrangement.id}|${sectionId}|${ratePct}|${maniAttive.join('')}|${loop}`}
      song={song}
      arrangement={arrangement}
      mode={mode}
      ratePct={ratePct}
      sectionId={sectionId}
      hands={maniAttive}
      loop={loop}
      attempts={tentativi}
      onAttempt={() => setTentativi((n) => n + 1)}
      onSetRate={setRatePct}
      onSetSection={setSectionId}
      onSetHands={setHands}
      onToggleLoop={() => setLoop((v) => !v)}
      onExit={onExit}
    />
  );
}

interface PlayStageProps extends Omit<PlaySessionProps, 'initialRatePct' | 'initialSectionId'> {
  ratePct: number;
  sectionId: string | null;
  hands: Hand[];
  loop: boolean;
  attempts: number;
  onAttempt: () => void;
  onSetRate: (rate: number) => void;
  onSetSection: (sectionId: string | null) => void;
  onSetHands: (hands: Hand[] | null) => void;
  onToggleLoop: () => void;
}

function PlayStage({
  song, arrangement, mode, ratePct, sectionId, hands, loop, attempts,
  onAttempt, onSetRate, onSetSection, onSetHands, onToggleLoop, onExit,
}: PlayStageProps) {
  useKeepScreenAwake(); // durante una lezione lo schermo non deve spegnersi

  const { height } = useWindowDimensions();
  const profile = useAppStore((s) => s.profile);
  const preferredInput: InputSourceId = profile?.preferredInput ?? 'virtual-keyboard';
  const lookAheadMs = 3000;

  const { view, start, pause, resume, restart, finish, pressKey, releaseKey } = usePracticeSession({
    arrangement, mode, ratePct, sectionId, hands, loopSection: loop,
    inputLatencyMs: profile?.inputLatencyMs ?? 0, preferredInput, lookAheadMs,
  });

  const [risultato, setRisultato] = useState<SessionResult | null>(null);
  /**
   * Altezza reale della corsia, misurata invece che calcolata da una
   * percentuale dello schermo. Su un portatile una frazione fissa
   * lascerebbe un terzo di schermo vuoto sotto la tastiera, e la
   * tastiera non starebbe dove stanno le mani.
   */
  const [altezzaCorsia, setAltezzaCorsia] = useState(0);

  // Estensione mostrata: quella del brano, allargata di poco perche' una
  // nota incollata al bordo e' difficile da leggere.
  const estensione = useMemo(() => {
    const range = midiRange(arrangement.notes) ?? { min: 60, max: 72 };
    return { from: Math.max(21, range.min - 2), to: Math.min(108, range.max + 2) };
  }, [arrangement]);

  useEffect(() => { start(); }, [start]);

  const concludi = useCallback(() => {
    if (risultato) return;
    const esito = finish();
    onAttempt();
    setRisultato(esito);
    void recordPractice({ song, arrangement, result: esito });
  }, [risultato, finish, onAttempt, song, arrangement]);

  // Fine del brano: si conclude da soli, senza aspettare un tocco.
  useEffect(() => {
    if (view.frame.state === 'ended') concludi();
  }, [view.frame.state, concludi]);

  const sezioneCorrente = view.frame.currentSection;
  const indiceSezione = arrangement.sections.findIndex((s) => s.id === sezioneCorrente?.id);
  const ultimaSezione = indiceSezione === arrangement.sections.length - 1;

  const applicaAzione = (action: CoachAction) => {
    setRisultato(null);
    switch (action.type) {
      case 'increase-rate': onSetRate(nextRate(ratePct)); break;
      case 'decrease-rate': onSetRate(previousRate(ratePct)); break;
      case 'repeat-section': restart(); break;
      case 'isolate-hand': onSetHands([action.hand]); break;
      case 'both-hands': onSetHands(null); break;
      case 'next-section': onSetSection(arrangement.sections[indiceSezione + 1]?.id ?? null); break;
      case 'finish': onExit(); break;
    }
  };

  if (risultato) {
    return (
      <SafeAreaView style={styles.schermo}>
        <ResultSheet
          result={risultato}
          section={sezioneCorrente}
          isLastSection={ultimaSezione}
          attempts={attempts}
          onAction={applicaAzione}
          onExit={onExit}
        />
      </SafeAreaView>
    );
  }

  const inPausa = view.frame.state === 'paused' && !view.frame.waitingFor;
  // La tastiera cresce con lo schermo ma entro limiti: troppo bassa non
  // si colpisce, troppo alta ruba spazio alle note in arrivo.
  const altezzaTastiera = Math.min(220, Math.max(130, height * 0.22));
  const errori = view.frame.live.wrong + view.frame.live.missed;

  return (
    <SafeAreaView style={styles.schermo} edges={['top', 'bottom']}>
      {/* ---- Barra dei comandi ---- */}
      <View style={styles.barra}>
        <Comando label="Esci" onPress={concludi} />
        <View style={{ flex: 1, marginHorizontal: spacing.md }}>
          <Text variant="caption" numberOfLines={1}>{song.title}</Text>
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {sezioneCorrente?.name ?? 'Tutto il brano'} · {ratePct}% · {Math.round((song.bpm * ratePct) / 100)} BPM
          </Text>
        </View>
        <Comando label={inPausa ? 'Riprendi' : 'Pausa'} onPress={() => (inPausa ? resume() : pause())} />
        <Comando label="Ripeti" onPress={restart} />
      </View>

      <View style={{ paddingHorizontal: spacing.md }}>
        <ProgressBar value={view.frame.progress} height={3} accessibilityLabel="Avanzamento del brano" />
      </View>

      {/* ---- Velocita', mani, loop ---- */}
      <View style={styles.regolazioni}>
        <Comando label="− lento" onPress={() => onSetRate(previousRate(ratePct))} />
        <Comando label="+ veloce" onPress={() => onSetRate(nextRate(ratePct))} />
        {arrangement.hands.length === 2 ? (
          <>
            <Comando label="Destra" attivo={hands.length === 1 && hands[0] === 'right'}
              colore={handColor('right')} onPress={() => onSetHands(['right'])} />
            <Comando label="Sinistra" attivo={hands.length === 1 && hands[0] === 'left'}
              colore={handColor('left')} onPress={() => onSetHands(['left'])} />
            <Comando label="Due mani" attivo={hands.length === 2} onPress={() => onSetHands(null)} />
          </>
        ) : null}
        {sectionId ? <Comando label="Loop" attivo={loop} onPress={onToggleLoop} /> : null}
      </View>

      {/* ---- Note in arrivo: prendono tutto lo spazio che avanza ---- */}
      <View
        style={{ flex: 1, minHeight: 160 }}
        onLayout={(e) => setAltezzaCorsia(e.nativeEvent.layout.height)}
      >
        {altezzaCorsia > 0 ? (
          <NoteHighway
            notes={view.visibleNotes}
            positionMs={view.frame.positionMs}
            lookAheadMs={lookAheadMs}
            fromMidi={estensione.from}
            toMidi={estensione.to}
            height={altezzaCorsia}
          />
        ) : null}
      </View>

      {/* ---- Riga del maestro ---- */}
      <View style={styles.feedback}>
        {/*
          Le correzioni hanno la precedenza sull'invito ad attendere: in
          modalita' IMPARA il brano resta fermo, e se l'invito coprisse il
          messaggio l'allievo vedrebbe "suona la nota indicata" senza mai
          sapere quale nota ha sbagliato.
        */}
        {view.feedbackKind === 'error' && view.feedback ? (
          <Text variant="heading" center tone="error">{view.feedback}</Text>
        ) : view.frame.waitingFor ? (
          <Text variant="heading" tone="primary" center>Suona la nota indicata</Text>
        ) : view.feedback ? (
          <Text variant="heading" center tone={view.feedbackKind === 'correct' ? 'success' : 'error'}>
            {view.feedback}
          </Text>
        ) : (
          <Text variant="caption" tone="faint" center>
            {view.frame.live.streak > 2 ? `${view.frame.live.streak} note di fila` : ' '}
          </Text>
        )}
      </View>

      {/* ---- Tastiera ---- */}
      <View style={{ paddingHorizontal: spacing.sm }}>
        <PianoKeyboard
          fromMidi={estensione.from}
          toMidi={estensione.to}
          pressed={view.pressed}
          expected={view.expectedNow}
          wrong={view.wrong}
          showNoteNames={mode === 'learn'}
          onPressKey={pressKey}
          onReleaseKey={releaseKey}
          height={altezzaTastiera}
        />
      </View>

      {/* ---- Stato della sorgente: dichiarato, mai nascosto ---- */}
      {view.inputStatus.state !== 'ready' && preferredInput !== 'virtual-keyboard' ? (
        <Text variant="caption" tone="warning" center
          style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          {inputStatusMessageIt(view.inputStatus, preferredInput)}
        </Text>
      ) : null}

      <View style={styles.contatori}>
        <Text variant="caption" tone="faint">{formatDuration(view.frame.positionMs)}</Text>
        <Text variant="caption" tone="success">{view.frame.live.correct} giuste</Text>
        <Text variant="caption" tone={errori > 0 ? 'error' : 'faint'}>{errori} errori</Text>
      </View>
    </SafeAreaView>
  );
}

function Comando({
  label, onPress, attivo, colore,
}: { label: string; onPress: () => void; attivo?: boolean; colore?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: attivo }}
      style={({ pressed }) => [
        styles.comando,
        attivo ? { backgroundColor: colore ?? colors.primary, borderColor: colore ?? colors.primary } : null,
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      <Text variant="label" style={{ color: attivo ? colors.background : colors.textMuted }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  schermo: { flex: 1, backgroundColor: colors.background },
  barra: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  regolazioni: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  comando: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    minHeight: 38, justifyContent: 'center',
  },
  feedback: { minHeight: 44, justifyContent: 'center', paddingVertical: spacing.sm },
  contatori: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
  },
});
