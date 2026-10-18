import { MIDI_MAX, MIDI_MIN } from '../music/note';
import { DIFFICULTY_ORDER, type Song, type SongArrangement, type SongNote } from './types';

/**
 * Validazione dei contenuti a runtime.
 *
 * Motivo: un file di catalogo scritto a mano (o importato da un editore)
 * puo' contenere un errore. Se quell'errore arriva al player, l'utente
 * vede un crash durante una lezione. Meglio scartare il brano al
 * caricamento e dirlo con chiarezza.
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const MAX_REASONABLE_DURATION_MS = 30 * 60 * 1000;

export function validateSong(song: Song): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  if (song.schemaVersion !== 1) {
    err('schemaVersion', `versione di schema non supportata: ${String(song.schemaVersion)}`);
  }
  if (!song.id || !song.slug) err('id', 'id e slug sono obbligatori');
  if (!song.title?.trim()) err('title', 'titolo mancante');
  if (!(song.bpm > 20 && song.bpm < 300)) err('bpm', `bpm fuori intervallo: ${song.bpm}`);
  if (!(song.durationMs > 0) || song.durationMs > MAX_REASONABLE_DURATION_MS) {
    err('durationMs', `durata non plausibile: ${song.durationMs} ms`);
  }
  const [num, den] = song.timeSignature;
  if (!(num >= 1 && num <= 16) || ![2, 4, 8, 16].includes(den)) {
    err('timeSignature', `indicazione di tempo non valida: ${num}/${den}`);
  }

  // La licenza non e' un dettaglio burocratico: decide se il brano puo'
  // essere distribuito. Un contenuto senza licenza coerente e' un errore
  // bloccante, non un avviso.
  if (song.license.status === 'cleared' && !song.license.owner) {
    err('license.owner', 'un brano dichiarato "cleared" deve indicare il titolare dei diritti');
  }
  if (song.license.startDate && song.license.endDate && song.license.endDate < song.license.startDate) {
    err('license', 'la licenza finisce prima di iniziare');
  }

  if (song.arrangements.length === 0) err('arrangements', 'il brano non ha nessun arrangiamento');

  const longest = Math.max(0, ...song.arrangements.map((a) => a.durationMs));
  if (song.arrangements.length > 0 && Math.abs(longest - song.durationMs) > 1) {
    err('durationMs', `la durata del brano (${song.durationMs} ms) non coincide con quella dell'arrangiamento piu' lungo (${longest} ms)`);
  }

  const seenDifficulties = new Set<string>();
  for (const arrangement of song.arrangements) {
    const base = `arrangements[${arrangement.id}]`;
    if (seenDifficulties.has(arrangement.difficulty)) {
      err(base, `difficolta' duplicata: ${arrangement.difficulty}`);
    }
    seenDifficulties.add(arrangement.difficulty);

    if (!DIFFICULTY_ORDER.includes(arrangement.difficulty)) {
      err(base, `difficolta' sconosciuta: ${arrangement.difficulty}`);
    }
    if (!(arrangement.suggestedStartRate >= 0.25 && arrangement.suggestedStartRate <= 1)) {
      err(`${base}.suggestedStartRate`, `velocita' iniziale fuori intervallo: ${arrangement.suggestedStartRate}`);
    }

    validateArrangement(arrangement, base, err, warn);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateArrangement(
  arrangement: SongArrangement,
  base: string,
  err: (path: string, message: string) => void,
  warn: (path: string, message: string) => void,
): void {
  // ---- Sezioni ----
  const sectionIds = new Set<string>();
  let previousEnd = -1;
  const sections = [...arrangement.sections].sort((a, b) => a.startMs - b.startMs);

  if (sections.length === 0) {
    err(`${base}.sections`, 'nessuna sezione: il sistema di studio a sezioni non funzionerebbe');
  }

  for (const section of sections) {
    const path = `${base}.sections[${section.id}]`;
    if (sectionIds.has(section.id)) err(path, 'id di sezione duplicato');
    sectionIds.add(section.id);

    if (section.endMs <= section.startMs) err(path, 'sezione con durata nulla o negativa');
    if (section.startMs < 0) err(path, 'sezione con inizio negativo');
    if (section.endMs > arrangement.durationMs) {
      err(path, `la sezione finisce a ${section.endMs} ms, oltre la durata dell'arrangiamento (${arrangement.durationMs} ms)`);
    }
    // Sezioni sovrapposte renderebbero ambiguo "in che punto sono".
    if (section.startMs < previousEnd) err(path, 'sezione sovrapposta alla precedente');
    if (previousEnd >= 0 && section.startMs > previousEnd) {
      warn(path, `buco di ${section.startMs - previousEnd} ms fra le sezioni`);
    }
    previousEnd = section.endMs;
  }

  // ---- Note ----
  if (arrangement.notes.length === 0) err(`${base}.notes`, 'arrangiamento senza note');

  let lastStart = -1;
  // Ultimo istante occupato per mano+altezza: due note identiche
  // sovrapposte sono impossibili da distinguere per il matcher.
  const busyUntil = new Map<string, number>();

  arrangement.notes.forEach((note: SongNote, index: number) => {
    const path = `${base}.notes[${index}]`;

    if (note.midi < MIDI_MIN || note.midi > MIDI_MAX) {
      err(path, `nota fuori dalla tastiera 88 tasti: ${note.midi}`);
    }
    if (note.startMs < 0) err(path, 'nota con inizio negativo');
    if (!(note.durationMs > 0)) err(path, 'nota con durata nulla');
    if (note.startMs + note.durationMs > arrangement.durationMs + 1) {
      err(path, "nota oltre la fine dell'arrangiamento");
    }
    if (note.startMs < lastStart) err(path, 'note non ordinate per tempo di attacco');
    lastStart = note.startMs;

    if (!arrangement.hands.includes(note.hand)) {
      err(path, `mano "${note.hand}" non dichiarata in hands`);
    }
    if (note.finger !== undefined && (note.finger < 1 || note.finger > 5)) {
      err(path, `diteggiatura non valida: ${note.finger}`);
    }
    if (note.sectionId && !sectionIds.has(note.sectionId)) {
      err(path, `sezione inesistente: ${note.sectionId}`);
    }

    const key = `${note.hand}:${note.midi}`;
    const busy = busyUntil.get(key) ?? -1;
    if (note.startMs < busy) {
      err(path, `nota ${note.midi} ripetuta prima che la precedente sia finita`);
    }
    busyUntil.set(key, note.startMs + note.durationMs);
  });

  for (const chord of arrangement.chords) {
    if (chord.durationMs <= 0) err(`${base}.chords`, `accordo ${chord.symbol} con durata nulla`);
  }
}

/** Filtra una lista di brani tenendo solo quelli validi. */
export function selectValidSongs(songs: Song[]): {
  songs: Song[];
  rejected: Array<{ song: Song; result: ValidationResult }>;
} {
  const valid: Song[] = [];
  const rejected: Array<{ song: Song; result: ValidationResult }> = [];
  for (const song of songs) {
    const result = validateSong(song);
    if (result.valid) valid.push(song);
    else rejected.push({ song, result });
  }
  return { songs: valid, rejected };
}
