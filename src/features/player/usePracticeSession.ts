import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createVirtualKeyboardInput, createMidiInput, createMicrophoneInput } from '../../adapters/inputs';
import type { VirtualKeyboardInput } from '../../adapters/midi/virtualKeyboard';
import { liveFeedbackIt } from '../../core/coach/coach';
import type { ExpectedNoteState, PracticeMode } from '../../core/engine/matcher';
import { PracticeSession, type SessionFrame, type SessionResult } from '../../core/engine/session';
import { systemClock } from '../../core/ports/clock';
import type { InputSourceId, InputStatus, NoteInputPort } from '../../core/ports/noteInput';
import type { Hand, SongArrangement } from '../../core/song/types';

/**
 * Collega il motore (TS puro) a React.
 *
 * Due responsabilita', e nessuna logica musicale:
 *  1. far girare un ciclo di animazione che chiama `tick()` e porta a
 *     schermo lo stato corrente;
 *  2. accendere e spegnere la sorgente di ingresso scelta.
 *
 * Il motore non sa che esiste React, e React non sa come si giudica una
 * nota: e' la separazione che permette di testare il difficile in Node.
 */

export interface UsePracticeSessionOptions {
  arrangement: SongArrangement;
  mode: PracticeMode;
  ratePct: number;
  sectionId: string | null;
  hands: Hand[];
  loopSection: boolean;
  inputLatencyMs: number;
  preferredInput: InputSourceId;
  /** Quanti ms di brano sono visibili nella corsia delle note. */
  lookAheadMs: number;
}

export interface PracticeView {
  frame: SessionFrame;
  visibleNotes: readonly ExpectedNoteState[];
  /** Note che il brano sta chiedendo adesso, con la mano. */
  expectedNow: ReadonlyMap<number, Hand>;
  pressed: readonly number[];
  wrong: readonly number[];
  feedback: string | null;
  inputStatus: InputStatus;
  /** Sorgente effettivamente in uso: puo' differire da quella preferita. */
  activeInput: InputSourceId;
}

const FRAME_VUOTO: SessionFrame = {
  positionMs: 0, progress: 0, state: 'idle', waitingFor: null, currentSection: null,
  lastOutcome: null, notesJustMissed: [],
  live: { expected: 0, correct: 0, wrong: 0, missed: 0, extra: 0, streak: 0 },
};

export function usePracticeSession(options: UsePracticeSessionOptions) {
  const {
    arrangement, mode, ratePct, sectionId, hands, loopSection,
    inputLatencyMs, preferredInput, lookAheadMs,
  } = options;

  // La sessione viene ricreata quando cambia qualcosa di strutturale:
  // sezione, mani, velocita' o modalita' sono parametri del motore, non
  // valori che si possono cambiare a caldo senza falsare il punteggio.
  const session = useMemo(
    () =>
      new PracticeSession({
        arrangement, clock: systemClock, mode, ratePct, sectionId, hands,
        loopSection, inputLatencyMs, countInMs: mode === 'learn' ? 0 : 2000,
      }),
    [arrangement, mode, ratePct, sectionId, hands, loopSection, inputLatencyMs],
  );

  const [frame, setFrame] = useState<SessionFrame>(FRAME_VUOTO);
  const [pressed, setPressed] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [inputStatus, setInputStatus] = useState<InputStatus>({ state: 'idle' });
  const [activeInput, setActiveInput] = useState<InputSourceId>('virtual-keyboard');

  const keyboardRef = useRef<VirtualKeyboardInput | null>(null);
  if (keyboardRef.current === null) keyboardRef.current = createVirtualKeyboardInput();
  const keyboard = keyboardRef.current;

  // ---- Ciclo di animazione -------------------------------------------
  useEffect(() => {
    let attivo = true;
    let handle: ReturnType<typeof requestAnimationFrame> | number;

    const loop = () => {
      if (!attivo) return;
      setFrame(session.tick());
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);

    return () => {
      attivo = false;
      cancelAnimationFrame(handle as number);
    };
  }, [session]);

  // ---- Sorgente di ingresso -------------------------------------------
  useEffect(() => {
    let annullato = false;
    const porte: NoteInputPort[] = [keyboard];
    if (preferredInput === 'midi') porte.unshift(createMidiInput());
    if (preferredInput === 'microphone') porte.unshift(createMicrophoneInput());

    const disiscrizioni = porte.map((porta) =>
      porta.subscribe((event) => {
        if (event.type === 'note-on') {
          setPressed((current) => (current.includes(event.midi) ? current : [...current, event.midi]));
          const esito = session.handleInput(event);
          if (esito) {
            setFeedback(
              esito.kind === 'correct'
                ? liveFeedbackIt({ kind: 'correct' })
                : esito.kind === 'wrong'
                  ? liveFeedbackIt({ kind: 'wrong', expectedMidi: esito.expected.midi, playedMidi: esito.playedMidi })
                  : liveFeedbackIt({ kind: 'extra', playedMidi: esito.playedMidi }),
            );
            if (esito.kind !== 'correct') {
              setWrong((current) => [...current, event.midi]);
              // Il lampeggio rosso dura poco: deve segnalare, non accusare.
              setTimeout(() => setWrong((c) => c.filter((m) => m !== event.midi)), 350);
            }
          }
        } else {
          setPressed((current) => current.filter((m) => m !== event.midi));
        }
      }),
    );

    void (async () => {
      for (const porta of porte) {
        const status = await porta.start();
        if (annullato) return;
        if (porta.id === preferredInput) setInputStatus(status);
        // La prima sorgente pronta diventa quella attiva. La tastiera a
        // schermo e' sempre in fondo alla lista, quindi funge da rete di
        // sicurezza quando MIDI o microfono non sono disponibili.
        if (status.state === 'ready') setActiveInput((current) => (current === 'virtual-keyboard' ? porta.id : current));
      }
    })();

    return () => {
      annullato = true;
      for (const u of disiscrizioni) u();
      for (const porta of porte) porta.stop();
    };
  }, [session, preferredInput, keyboard]);

  // ---- Dati derivati per il disegno ------------------------------------
  const visibleNotes = useMemo(
    () => session.visibleNotes(lookAheadMs),
    // La posizione cambia ad ogni frame: e' lei a far scorrere la finestra.
    [session, lookAheadMs, frame.positionMs],
  );

  const expectedNow = useMemo(() => {
    const mappa = new Map<number, Hand>();
    for (const state of visibleNotes) {
      if (state.status !== 'pending') continue;
      const delta = state.note.startMs - frame.positionMs;
      if (delta >= -session.toleranceMs && delta <= session.toleranceMs) {
        mappa.set(state.note.midi, state.note.hand);
      }
    }
    return mappa;
  }, [visibleNotes, frame.positionMs, session.toleranceMs]);

  const pressKey = useCallback((midi: number) => keyboard.press(midi), [keyboard]);
  const releaseKey = useCallback((midi: number) => keyboard.release(midi), [keyboard]);

  const start = useCallback(() => session.start(), [session]);
  const pause = useCallback(() => session.pause(), [session]);
  const resume = useCallback(() => session.resume(), [session]);
  const restart = useCallback(() => {
    setFeedback(null);
    session.restart();
  }, [session]);
  const finish = useCallback((): SessionResult => session.finish(), [session]);

  const view: PracticeView = {
    frame, visibleNotes, expectedNow, pressed, wrong, feedback, inputStatus, activeInput,
  };

  return { session, view, start, pause, resume, restart, finish, pressKey, releaseKey };
}
