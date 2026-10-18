import type { PracticeMode } from '../engine/matcher';
import {
  PASS_SCORE, STRUGGLE_SCORE, isTopRate, nextRate, previousRate, weakerHand, type HandStats,
} from '../learning/progression';
import { noteNameIt } from '../music/note';
import { timingTendencyIt, type ScoreBreakdown } from '../scoring/score';
import type { Hand, SongSection } from '../song/types';

/**
 * Il maestro.
 *
 * Questo modulo e' il motivo per cui l'app non e' "una schermata che
 * mostra le note". Prende il risultato di un tentativo e decide COSA
 * FARE DOPO, come farebbe un insegnante: rallentare, ripetere solo il
 * ritornello, isolare la sinistra, o dire che si puo' salire di velocita'.
 *
 * E' TypeScript puro e deterministico: nessun modello, nessuna rete.
 * Una decisione didattica sbagliata deve essere riproducibile in un test,
 * non dipendere da cosa risponde oggi un servizio esterno.
 */

export type CoachAction =
  | { type: 'increase-rate'; ratePct: number }
  | { type: 'decrease-rate'; ratePct: number }
  | { type: 'repeat-section'; sectionId: string | null }
  | { type: 'isolate-hand'; hand: Hand }
  | { type: 'both-hands' }
  | { type: 'next-section' }
  | { type: 'finish' };

export type CoachTone = 'celebrate' | 'encourage' | 'correct' | 'neutral';

export interface CoachAdvice {
  /** Una frase breve: e' quella che l'utente legge per prima. */
  headline: string;
  /** Il perche', in una riga. */
  detail: string;
  tone: CoachTone;
  /** Cosa proporre con il pulsante principale. */
  action: CoachAction;
  /** Le altre strade, per il pulsante secondario. */
  alternatives: CoachAction[];
}

export interface CoachContext {
  breakdown: ScoreBreakdown;
  mode: PracticeMode;
  ratePct: number;
  section: SongSection | null;
  /** Mani attive in questo tentativo. */
  hands: Hand[];
  /** Statistiche divise per mano, quando si suona a due mani. */
  handStats?: Partial<Record<Hand, HandStats>>;
  attempts: number;
  isLastSection: boolean;
}

export function coachAdvice(context: CoachContext): CoachAdvice {
  const { breakdown, ratePct, section, hands, attempts, isLastSection } = context;
  const nome = section ? section.name.toLowerCase() : 'questa parte';
  const errori = breakdown.notesWrong + breakdown.notesMissed;

  // ---- 1. Una mano e' molto piu' indietro dell'altra ------------------
  // Ha la precedenza su tutto: rallentare due mani che vanno a velocita'
  // diverse non risolve niente, isolarle si'.
  const debole = hands.length === 2 ? weakerHand(context.handStats ?? {}) : null;
  if (debole && breakdown.accuracyPct < 85) {
    const label = debole === 'left' ? 'sinistra' : 'destra';
    return {
      headline: `La mano ${label} e' rimasta indietro.`,
      detail: `Proviamo ${nome} con la sola mano ${label}: quando va da sola, le due insieme vengono molto prima.`,
      tone: 'correct',
      action: { type: 'isolate-hand', hand: debole },
      alternatives: [
        { type: 'decrease-rate', ratePct: previousRate(ratePct) },
        { type: 'repeat-section', sectionId: section?.id ?? null },
      ],
    };
  }

  // ---- 2. Troppo difficile cosi': si rallenta -------------------------
  if (breakdown.score < STRUGGLE_SCORE) {
    const piuLento = previousRate(ratePct);
    if (piuLento < ratePct) {
      return {
        headline: `${capitalize(nome)} e' ancora difficile.`,
        detail: `Hai sbagliato ${errori} ${errori === 1 ? 'nota' : 'note'}. Proviamo a rallentare al ${piuLento}%: piu' lento adesso significa piu' veloce fra dieci minuti.`,
        tone: 'encourage',
        action: { type: 'decrease-rate', ratePct: piuLento },
        alternatives: [{ type: 'repeat-section', sectionId: section?.id ?? null }],
      };
    }
    // Gia' alla velocita' minima: non resta che ripetere.
    return {
      headline: 'Andiamo con calma.',
      detail: `Siamo gia' alla velocita' piu' bassa. Ripetiamo ${nome} ancora una volta: guarda le dita indicate a schermo.`,
      tone: 'encourage',
      action: { type: 'repeat-section', sectionId: section?.id ?? null },
      alternatives: hands.length === 2 ? [{ type: 'isolate-hand', hand: 'right' }] : [{ type: 'next-section' }],
    };
  }

  // ---- 3. Note giuste ma ritmo irregolare -----------------------------
  // Caso classico e frustrante: l'allievo "sa il pezzo" ma non va a tempo.
  // Dirgli che ha sbagliato le note sarebbe falso e demotivante.
  if (breakdown.accuracyPct >= 85 && breakdown.rhythmPct < 60) {
    return {
      headline: 'Le note sono giuste, il ritmo no.',
      detail: `${timingTendencyIt(breakdown.averageDeviationMs)}. Ripetiamo ${nome} contando a voce alta: uno, due, tre, quattro.`,
      tone: 'correct',
      action: { type: 'repeat-section', sectionId: section?.id ?? null },
      alternatives: [{ type: 'decrease-rate', ratePct: previousRate(ratePct) }],
    };
  }

  // ---- 4. Superato: si sale di velocita' o si passa avanti ------------
  if (breakdown.score >= PASS_SCORE) {
    if (!isTopRate(ratePct)) {
      const piuVeloce = nextRate(ratePct);
      return {
        headline: 'Perfetto.',
        detail: `${breakdown.score}/100. Ora proviamo all'${piuVeloce}%.`,
        tone: 'celebrate',
        action: { type: 'increase-rate', ratePct: piuVeloce },
        alternatives: [{ type: 'repeat-section', sectionId: section?.id ?? null }],
      };
    }

    if (hands.length === 1) {
      return {
        headline: 'Questa mano e a posto.',
        detail: 'A velocita piena e senza errori. Adesso proviamo con tutte e due le mani.',
        tone: 'celebrate',
        action: { type: 'both-hands' },
        alternatives: [{ type: 'next-section' }],
      };
    }

    if (isLastSection) {
      return {
        headline: 'Brano completato.',
        detail: `${breakdown.score}/100 a velocita' piena. Hai finito tutte le sezioni.`,
        tone: 'celebrate',
        action: { type: 'finish' },
        alternatives: [{ type: 'repeat-section', sectionId: section?.id ?? null }],
      };
    }

    return {
      headline: 'Sezione superata.',
      detail: `${breakdown.score}/100 a velocita' piena. Passiamo alla parte successiva.`,
      tone: 'celebrate',
      action: { type: 'next-section' },
      alternatives: [{ type: 'repeat-section', sectionId: section?.id ?? null }],
    };
  }

  // ---- 5. Quasi: si consolida ripetendo -------------------------------
  const dettaglio =
    breakdown.notesMissed > breakdown.notesWrong
      ? `Ti sono sfuggite ${breakdown.notesMissed} note.`
      : `${breakdown.notesWrong} note fuori posto.`;

  return {
    headline: attempts >= 3 ? 'Ci sei quasi.' : 'Buono.',
    detail: `${dettaglio} Ancora una ripetizione di ${nome} e ci siamo: serve ${PASS_SCORE} per salire di velocita', sei a ${breakdown.score}.`,
    tone: 'neutral',
    action: { type: 'repeat-section', sectionId: section?.id ?? null },
    alternatives: [{ type: 'decrease-rate', ratePct: previousRate(ratePct) }],
  };
}

/**
 * Commento immediato durante l'esecuzione, non a fine esercizio.
 * Usato per la riga sotto la tastiera: deve essere corto.
 */
export function liveFeedbackIt(
  outcome:
    | { kind: 'correct' }
    | { kind: 'wrong'; expectedMidi: number; playedMidi: number }
    | { kind: 'extra'; playedMidi: number },
): string {
  switch (outcome.kind) {
    case 'correct':
      return 'Giusto';
    case 'wrong':
      // Il formato richiesto: "Prevista: MI — Suonata: RE".
      return `Prevista: ${noteNameIt(outcome.expectedMidi, false)} — Suonata: ${noteNameIt(outcome.playedMidi, false)}`;
    case 'extra':
      return `Nota in piu': ${noteNameIt(outcome.playedMidi, false)}`;
  }
}

/** Frase di apertura della sessione, in base a come e' andata l'ultima volta. */
export function welcomeBackIt(lastScore: number | null, streakDays: number): string {
  if (streakDays >= 7) return `${streakDays} giorni di fila. Continuiamo cosi'.`;
  if (lastScore === null) return 'Cominciamo. Metti le mani sulla tastiera.';
  if (lastScore >= PASS_SCORE) return "L'ultima volta era andata bene. Riprendiamo da li'.";
  return 'Riprendiamo da dove eravamo rimasti, con calma.';
}

/** Testo del pulsante principale per ciascuna azione del maestro. */
export function coachActionLabelIt(action: CoachAction): string {
  switch (action.type) {
    case 'increase-rate': return `Prova all'${action.ratePct}%`;
    case 'decrease-rate': return `Rallenta al ${action.ratePct}%`;
    case 'repeat-section': return 'Ripeti';
    case 'isolate-hand': return action.hand === 'left' ? 'Solo mano sinistra' : 'Solo mano destra';
    case 'both-hands': return 'Due mani insieme';
    case 'next-section': return 'Sezione successiva';
    case 'finish': return 'Concludi';
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
