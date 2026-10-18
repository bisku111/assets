import type { PracticeSessionRecord, UserProfile } from '../ports/repository';

/**
 * XP, livelli, striscia e medaglie.
 *
 * Calcolati dai FATTI (le sessioni salvate) e non da contatori che si
 * incrementano qua e la': un contatore, prima o poi, si desincronizza e
 * l'utente vede numeri che non tornano. Le stesse regole valgono in SQL
 * lato server (vedi 0006_stats.sql).
 */

export interface AchievementDefinition {
  key: string;
  title: string;
  description: string;
  category: 'songs' | 'streak' | 'notes' | 'time' | 'skill';
  threshold: number;
  xpReward: number;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { key: 'first_song', title: 'Prima canzone completata', description: 'Hai portato a termine il tuo primo brano.', category: 'songs', threshold: 1, xpReward: 100 },
  { key: 'streak_7', title: '7 giorni consecutivi', description: 'Hai suonato per sette giorni di fila.', category: 'streak', threshold: 7, xpReward: 150 },
  { key: 'streak_30', title: 'Un mese di costanza', description: 'Trenta giorni consecutivi di pratica.', category: 'streak', threshold: 30, xpReward: 500 },
  { key: 'notes_1000', title: '1000 note corrette', description: 'Hai suonato mille note giuste.', category: 'notes', threshold: 1000, xpReward: 200 },
  { key: 'notes_10000', title: '10.000 note corrette', description: 'La mano ormai sa dove andare.', category: 'notes', threshold: 10_000, xpReward: 800 },
  { key: 'perfect_song', title: 'Prima canzone al 100%', description: 'Un brano completato a velocita piena.', category: 'songs', threshold: 1, xpReward: 300 },
  { key: 'both_hands', title: 'Due mani insieme', description: 'Hai completato una sezione con entrambe le mani.', category: 'skill', threshold: 1, xpReward: 150 },
  { key: 'minutes_60', title: 'Prima ora di studio', description: 'Sessanta minuti di pratica totali.', category: 'time', threshold: 60, xpReward: 120 },
  { key: 'minutes_600', title: 'Dieci ore al pianoforte', description: 'Seicento minuti di pratica totali.', category: 'time', threshold: 600, xpReward: 600 },
  { key: 'performance_mode', title: 'Sotto i riflettori', description: 'Un brano in modalita Performance.', category: 'skill', threshold: 1, xpReward: 250 },
];

/** XP guadagnati da una sessione. Premiano il risultato, non il tempo passato. */
export function sessionXp(
  session: Pick<PracticeSessionRecord, 'score' | 'notesCorrect' | 'ratePct' | 'mode'>,
): number {
  const base = Math.round(session.score * 0.5);
  const note = Math.min(60, Math.round(session.notesCorrect * 0.5));
  // Suonare a velocita' piena vale piu' che suonare al rallentatore.
  const bonusVelocita = Math.round((session.ratePct / 100) * 20);
  const bonusModalita = session.mode === 'performance' ? 25 : 0;
  return Math.max(1, base + note + bonusVelocita + bonusModalita);
}

/**
 * Livello a partire dagli XP totali.
 * Curva quadratica: i primi livelli arrivano subito (servono a capire che
 * il sistema esiste), poi rallentano.
 */
export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

export function xpForLevel(level: number): number {
  return (level - 1) ** 2 * 100;
}

export function levelProgress(xp: number): { level: number; current: number; needed: number; pct: number } {
  const level = levelForXp(xp);
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const current = xp - start;
  const needed = next - start;
  return { level, current, needed, pct: Math.round((current / needed) * 100) };
}

/**
 * Aggiorna la striscia di giorni consecutivi.
 * Stesso giorno = nessun cambiamento; giorno successivo = +1; salto = si riparte.
 */
export function updateStreak(
  profile: Pick<UserProfile, 'streakCurrent' | 'streakLongest' | 'lastPracticeDate'>,
  todayIsoDate: string,
): { streakCurrent: number; streakLongest: number; lastPracticeDate: string } {
  const last = profile.lastPracticeDate;
  if (last === todayIsoDate) {
    return {
      streakCurrent: profile.streakCurrent,
      streakLongest: profile.streakLongest,
      lastPracticeDate: todayIsoDate,
    };
  }

  const consecutivo = last !== null && daysBetween(last, todayIsoDate) === 1;
  const streakCurrent = consecutivo ? profile.streakCurrent + 1 : 1;
  return {
    streakCurrent,
    streakLongest: Math.max(profile.streakLongest, streakCurrent),
    lastPracticeDate: todayIsoDate,
  };
}

export interface AchievementState {
  key: string;
  progress: number;
  unlocked: boolean;
}

export interface AchievementInputs {
  songsCompleted: number;
  songsAtFullSpeed: number;
  streakDays: number;
  notesCorrect: number;
  practiceMinutes: number;
  sectionsWithBothHands: number;
  performanceRuns: number;
}

export function evaluateAchievements(inputs: AchievementInputs): AchievementState[] {
  const valore: Record<string, number> = {
    first_song: inputs.songsCompleted,
    perfect_song: inputs.songsAtFullSpeed,
    streak_7: inputs.streakDays,
    streak_30: inputs.streakDays,
    notes_1000: inputs.notesCorrect,
    notes_10000: inputs.notesCorrect,
    minutes_60: inputs.practiceMinutes,
    minutes_600: inputs.practiceMinutes,
    both_hands: inputs.sectionsWithBothHands,
    performance_mode: inputs.performanceRuns,
  };

  return ACHIEVEMENTS.map((a) => {
    const progress = valore[a.key] ?? 0;
    return { key: a.key, progress, unlocked: progress >= a.threshold };
  });
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / 86_400_000);
}

export function todayIso(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}
