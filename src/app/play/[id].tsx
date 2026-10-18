import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CoachAction } from '../../core/coach/coach';
import type { PracticeMode } from '../../core/engine/matcher';
import type { SessionResult } from '../../core/engine/session';
import { nextRate, previousRate } from '../../core/learning/progression';
import { keyboardGeometry } from '../../core/music/keyboard';
import { nextFingerTargets } from '../../core/notation/fingering';
import type { Clef } from '../../core/notation/staff';
import { buildStaffScore, clefForHand } from '../../core/notation/staff';
import { inputStatusMessageIt, type InputSourceId } from '../../core/ports/noteInput';
import { formatDuration, midiRange, resolveArrangement } from '../../core/song/query';
import type { DifficultyKey, Hand, Song, SongArrangement, SongNote } from '../../core/song/types';
import { ResultSheet } from '../../features/player/ResultSheet';
import { useKeepScreenAwake } from '../../features/player/useKeepScreenAwake';
import { usePracticeSession } from '../../features/player/usePracticeSession';
import { recordPractice, useAppStore } from '../../state/appStore';
import { FingerHints, type FingerHint } from '../../ui/FingerHints';
import { NoteHighway } from '../../ui/NoteHighway';
import { PianoKeyboard } from '../../ui/PianoKeyboard';
import { StaffView, staffHeight } from '../../ui/StaffView';
import { Button } from '../../ui/components/Button';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { Text } from '../../ui/components/Text';
import { colors, handColor, radius, spacing } from '../../ui/theme';

/**
 * Tutorial interattivo.
 *
 * Quattro fasce verticali, nell'ordine in cui l'occhio le usa:
 * comandi in alto (piccoli), spartito, note in arrivo al centro (tutto
 * lo spazio restante), tastiera in basso con le mani sopra. Si legge
 * in alto, si segue al centro, si suona in basso: i comandi non devono
 * mai finire in mezzo a questo percorso.
 *
 * Tutte e tre le rappresentazioni mostrano lo stesso istante: quando il
 * motore si ferma ad aspettare una nota, si fermano insieme.
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
            Le note di questo brano non sono accessibili. Se è un brano premium,
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
 * Tiene le scelte dell'utente (velocità, sezione, mani) e ricrea la
 * sessione quando cambiano. Sono parametri del motore, non valori
 * modificabili a caldo: cambiarli a metà esercizio falserebbe il voto.
 */
function PlaySession({ song, arrangement, mode, initialRatePct, initialSectionId, onExit }: PlaySessionProps) {
  const [ratePct, setRatePct] = useState(initialRatePct);
  const [sectionId, setSectionId] = useState(initialSectionId);
  const [hands, setHands] = useState<Hand[] | null>(null);
  const [loop, setLoop] = useState(false);
  const [tentativi, setTentativi] = useState(0);
  const [spartito, setSpartito] = useState(true);
  const [dita, setDita] = useState(true);

  const maniAttive = hands ?? arrangement.hands;

  return (
    <PlayStage
      // La chiave forza una sessione nuova e pulita ad ogni cambio di
      // parametro: più sicuro che tentare di riconfigurare il motore.
      key={`${arrangement.id}|${sectionId}|${ratePct}|${maniAttive.join('')}|${loop}`}
      song={song}
      arrangement={arrangement}
      mode={mode}
      ratePct={ratePct}
      sectionId={sectionId}
      hands={maniAttive}
      loop={loop}
      showStaff={spartito}
      showFingers={dita}
      onToggleStaff={() => setSpartito((v) => !v)}
      onToggleFingers={() => setDita((v) => !v)}
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
  showStaff: boolean;
  showFingers: boolean;
  onToggleStaff: () => void;
  onToggleFingers: () => void;
  attempts: number;
  onAttempt: () => void;
  onSetRate: (rate: number) => void;
  onSetSection: (sectionId: string | null) => void;
  onSetHands: (hands: Hand[] | null) => void;
  onToggleLoop: () => void;
}

function PlayStage({
  song, arrangement, mode, ratePct, sectionId, hands, loop, attempts,
  showStaff, showFingers, onToggleStaff, onToggleFingers,
  onAttempt, onSetRate, onSetSection, onSetHands, onToggleLoop, onExit,
}: PlayStageProps) {
  useKeepScreenAwake(); // durante una lezione lo schermo non deve spegnersi


  const { height } = useWindowDimensions();
  const profile = useAppStore((s) => s.profile);
  const preferredInput: InputSourceId = profile?.preferredInput ?? 'virtual-keyboard';

  // Il pentagramma si misura in battute, non in secondi: otto movimenti
  // a schermo restano otto movimenti anche al 50% di velocità, così la
  // lettura non cambia aspetto mentre si accelera.
  const msPerBeat = 60_000 / song.bpm;
  const msPerBar = msPerBeat * song.timeSignature[0] * (4 / song.timeSignature[1]);
  const staffWindowMs = msPerBeat * 8;
  const staffBehindMs = staffWindowMs * 0.32;
  // Anche la corsia si misura in movimenti: a secondi fissi, una minima
  // a 50 BPM riempirebbe tutto lo schermo e non si capirebbe più nulla.
  const lookAheadMs = Math.min(6000, Math.max(2200, msPerBeat * 4));

  const { view, start, pause, resume, restart, finish, pressKey, releaseKey } = usePracticeSession({
    arrangement, mode, ratePct, sectionId, hands, loopSection: loop,
    inputLatencyMs: profile?.inputLatencyMs ?? 0, preferredInput, lookAheadMs,
    staffAheadMs: staffWindowMs, staffBehindMs,
  });

  const [risultato, setRisultato] = useState<SessionResult | null>(null);
  /**
   * Altezza reale della corsia, misurata invece che calcolata da una
   * percentuale dello schermo. Su un portatile una frazione fissa
   * lascerebbe un terzo di schermo vuoto sotto la tastiera, e la
   * tastiera non starebbe dove stanno le mani.
   */
  const [altezzaCorsia, setAltezzaCorsia] = useState(0);
  const [larghezzaSpartito, setLarghezzaSpartito] = useState(0);
  const [larghezzaTastiera, setLarghezzaTastiera] = useState(0);

  // Estensione mostrata: quella del brano, allargata di poco perché una
  // nota incollata al bordo è difficile da leggere.
  const estensione = useMemo(() => {
    const range = midiRange(arrangement.notes) ?? { min: 60, max: 72 };
    return { from: Math.max(21, range.min - 2), to: Math.min(108, range.max + 2) };
  }, [arrangement]);

  const geometria = useMemo(
    () => keyboardGeometry(estensione.from, estensione.to),
    [estensione],
  );

  const spartito = useMemo(
    () => buildStaffScore(arrangement.notes, { keySignature: song.keySignature, msPerBeat }),
    [arrangement, song.keySignature, msPerBeat],
  );

  // Si scrivono solo i righi che hanno qualcosa da dire: isolando una
  // mano, l'altro rigo sparisce invece di restare vuoto.
  const righi = useMemo<Clef[]>(
    () => (['right', 'left'] as Hand[]).filter((h) => hands.includes(h)).map(clefForHand),
    [hands],
  );

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

  // Stato per testa di nota. Si ricostruisce a ogni frame: sono poche
  // decine di note, e memorizzarlo richiederebbe di dichiarare una
  // dipendenza che cambia comunque a ogni frame.
  const statiNote = new Map<number, 'hit' | 'missed'>();
  for (const stato of view.staffNotes) {
    if (stato.status !== 'pending') statiNote.set(stato.index, stato.status);
  }

  const daSuonare: SongNote[] = [];
  for (const stato of view.visibleNotes) if (stato.status === 'pending') daSuonare.push(stato.note);

  const diteggiatura: FingerHint[] = [];
  if (showFingers) {
    for (const hand of hands) {
      for (const target of nextFingerTargets(daSuonare, hand, view.frame.positionMs, ANTICIPO_DITA_MS)) {
        diteggiatura.push({ hand, midi: target.midi, finger: target.finger });
      }
    }
  }
  // La tastiera cresce con lo schermo ma entro limiti: troppo bassa non
  // si colpisce, troppo alta ruba spazio alle note in arrivo.
  const altezzaTastiera = Math.min(260, Math.max(140, height * 0.3));
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

      {/* ---- Velocità, mani, loop ---- */}
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
        <Comando label="Spartito" attivo={showStaff} onPress={onToggleStaff} />
        <Comando label="Dita" attivo={showFingers} onPress={onToggleFingers} />
      </View>

      {/* ---- Spartito: la stessa musica, scritta ---- */}
      {showStaff ? (
        <View
          style={{ height: staffHeight(righi.length) }}
          onLayout={(e) => setLarghezzaSpartito(e.nativeEvent.layout.width)}
        >
          {larghezzaSpartito > 0 ? (
            <StaffView
              score={spartito}
              positionMs={view.frame.positionMs}
              msPerBar={msPerBar}
              width={larghezzaSpartito}
              statuses={statiNote}
              waitingIndex={view.frame.waitingForIndex}
              windowMs={staffWindowMs}
              clefs={righi}
            />
          ) : null}
        </View>
      ) : null}

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
          modalità IMPARA il brano resta fermo, e se l'invito coprisse il
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

      {/* ---- Tastiera, con il numero del dito sui tasti da premere ---- */}
      <View
        style={{ paddingHorizontal: spacing.sm }}
        onLayout={(e) => setLarghezzaTastiera(e.nativeEvent.layout.width - spacing.sm * 2)}
      >
        <View>
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
          {larghezzaTastiera > 0 ? (
            <FingerHints
              hints={diteggiatura}
              geometry={geometria}
              width={larghezzaTastiera}
              height={altezzaTastiera}
            />
          ) : null}
        </View>
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

/**
 * Quanto prima compare il numero del dito. Troppo presto e indicherebbe
 * tasti che non servono ancora; troppo tardi e non si farebbe in tempo
 * a spostare la mano.
 */
const ANTICIPO_DITA_MS = 1600;

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
