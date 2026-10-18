import type { SongProgressRecord } from '../ports/repository';

/**
 * Percorso didattico a sblocco progressivo.
 *
 * Lo sblocco non serve a trattenere l'utente: serve a impedirgli di
 * iniziare dalla scala con passaggio del pollice senza aver mai tenuto
 * cinque dita ferme. Chi comincia dalla lezione sbagliata non impara
 * piu' lentamente: si convince di non essere portato e smette.
 *
 * La soglia e' bassa di proposito (non serve la perfezione per andare
 * avanti) e la lezione successiva resta visibile anche da bloccata, con
 * scritto che cosa manca.
 */

/** Completamento minimo di una lezione per sbloccare la successiva. */
export const UNLOCK_COMPLETION_PCT = 60;

export interface LessonState {
  /** Id del brano-esercizio. */
  songId: string;
  index: number;
  unlocked: boolean;
  completionPct: number;
  bestScore: number;
  /** Prima lezione non ancora completata: e' quella da proporre. */
  current: boolean;
}

export function buildLessonPath(
  lessonSongIds: readonly string[],
  progress: readonly SongProgressRecord[],
): LessonState[] {
  const avanzamento = (songId: string) => progress.find((p) => p.songId === songId) ?? null;

  const stati: LessonState[] = [];
  let precedenteSuperata = true; // la prima e' sempre aperta
  let correnteAssegnata = false;

  lessonSongIds.forEach((songId, index) => {
    const p = avanzamento(songId);
    const completionPct = p?.completionPct ?? 0;
    const unlocked = precedenteSuperata;
    const current = unlocked && !correnteAssegnata && completionPct < 100;
    if (current) correnteAssegnata = true;

    stati.push({
      songId,
      index,
      unlocked,
      completionPct,
      bestScore: p?.bestScore ?? 0,
      current,
    });

    precedenteSuperata = precedenteSuperata && completionPct >= UNLOCK_COMPLETION_PCT;
  });

  return stati;
}

/** Quante lezioni sono state completate del tutto. */
export function lessonsCompleted(path: readonly LessonState[]): number {
  return path.filter((l) => l.completionPct >= 100).length;
}

/** Messaggio su cosa manca per aprire una lezione bloccata. */
export function lockMessageIt(path: readonly LessonState[], index: number): string | null {
  const lezione = path[index];
  if (!lezione || lezione.unlocked) return null;
  const precedente = path[index - 1];
  if (!precedente) return null;
  const mancante = Math.max(0, UNLOCK_COMPLETION_PCT - precedente.completionPct);
  return `Completa ancora ${mancante}% della lezione ${index} per aprire questa.`;
}
