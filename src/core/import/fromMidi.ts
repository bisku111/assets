import type { ImportDocument, ImportNote, ImportPart } from './document';
import type { MidiFile, MidiTrack } from './midiFile';

/**
 * Da file MIDI al modello intermedio.
 *
 * Qui non si legge niente di nuovo: il lettore binario è gia' stato
 * provato per conto suo. Questo passaggio traduce soltanto, e serve a
 * far entrare il MIDI nello stesso imbuto del MusicXML.
 */

/** Il canale 10 (indice 9) è la batteria per definizione dello standard. */
const DRUM_CHANNEL = 9;
/** Programmi General MIDI della famiglia dei pianoforti. */
const PIANO_PROGRAMS = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
const PIANO_NAME = /piano|pf\b|klavier|keyboard|tastiera|rhodes|clav/i;

/**
 * Famiglie General MIDI: otto programmi ciascuna.
 *
 * Si dichiara la famiglia e non il singolo strumento perché è
 * l'informazione che serve davvero ("sono archi, non è il pianoforte")
 * senza una tabella di centoventotto nomi da mantenere.
 */
const GM_FAMILIES = [
  'Pianoforte', 'Percussioni intonate', 'Organo', 'Chitarra',
  'Basso', 'Archi', 'Ensemble', 'Ottoni',
  'Ance', 'Flauti', 'Sintetizzatore solista', 'Sintetizzatore d’accordi',
  'Sintetizzatore d’effetti', 'Strumenti etnici', 'Percussioni', 'Effetti',
] as const;

export function instrumentName(program: number | null, isDrums: boolean): string | null {
  if (isDrums) return 'Batteria';
  if (program === null) return null;
  return GM_FAMILIES[Math.floor(program / 8)] ?? null;
}

export function midiToDocument(file: MidiFile): ImportDocument {
  const notices: string[] = [];
  const parts: ImportPart[] = file.tracks
    .filter((t) => t.notes.length > 0)
    .map((t, posizione) => toPart(t, posizione));

  if (file.tracks.length > parts.length) {
    const vuote = file.tracks.length - parts.length;
    notices.push(`${vuote} ${vuote === 1 ? 'traccia non contiene' : 'tracce non contengono'} note.`);
  }
  // Il pedale di risonanza non si conserva: il giudizio si basa
  // sull'attacco della nota, quindi il pedale non cambierebbe il voto.
  notices.push('Il pedale non viene importato: il brano si giudica sull’attacco delle note.');
  notices.push('Un file MIDI non contiene la diteggiatura: i numeri delle dita non compariranno.');

  return {
    format: 'midi',
    title: null,
    composer: null,
    ticksPerQuarter: file.ticksPerQuarter,
    tempoMap: file.tempoMap,
    timeSignatures: file.timeSignatures,
    keySignature: null,
    parts,
    notices,
  };
}

function toPart(track: MidiTrack, index: number): ImportPart {
  const isDrums = track.channels.includes(DRUM_CHANNEL);
  const program = track.programs[0] ?? null;
  const nome = track.name ?? '';

  const notes: ImportNote[] = track.notes.map((n) => ({
    startTick: n.tick,
    durationTicks: n.durationTicks,
    midi: n.midi,
    velocity: Math.round((n.velocity / 127) * 100) / 100,
  }));

  return {
    index,
    id: `t${track.index}`,
    name: track.name,
    instrument: instrumentName(program, isDrums),
    channel: track.channels[0] ?? null,
    program,
    isDrums,
    // Senza nessuna dichiarazione di strumento si considera suonabile:
    // rifiutare un file valido sarebbe peggio che importarlo dicendolo.
    looksLikePiano:
      !isDrums && (
        track.programs.some((p) => PIANO_PROGRAMS.has(p)) ||
        (track.programs.length === 0 && !PIANO_NAME.test(nome) ? true : PIANO_NAME.test(nome))
      ),
    notes,
  };
}
