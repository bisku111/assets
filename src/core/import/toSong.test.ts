import { parseMidiFile } from './midiFile';
import { analyseMidi, buildImportedSong, suggestHandSplit, type ImportOptions } from './toSong';
import { isSongServable } from '../song/license';
import { validateSong } from '../song/validate';
import { indicazioneTempo, nomeTraccia, programma, smf, tempo, traccia } from './__fixtures__/smf';

const OPZIONI: ImportOptions = { title: 'Prova', handSplit: 60, quantizeDivision: 0 };

/** 480 tick per semiminima: una battuta di 4/4 sono 1920 tick. */
const TPQ = 480;
const BATTUTA = TPQ * 4;

function importa(bytes: Uint8Array, opzioni: Partial<ImportOptions> = {}) {
  return buildImportedSong(parseMidiFile(bytes), { ...OPZIONI, ...opzioni });
}

describe('divisione delle mani suggerita', () => {
  it('trova il confine fra due gruppi di altezze distinti', () => {
    const basse = [40, 42, 43, 45, 47];
    const alte = [72, 74, 76, 77, 79];
    const soglia = suggestHandSplit([...basse, ...alte]);
    expect(soglia).toBeGreaterThan(47);
    expect(soglia).toBeLessThanOrEqual(72);
  });

  it('non si inventa un confine su una lista vuota', () => {
    expect(suggestHandSplit([])).toBe(60);
  });

  it('resta dentro l estensione anche con tutte le note vicine', () => {
    const soglia = suggestHandSplit([60, 60, 61, 62]);
    expect(soglia).toBeGreaterThan(59);
    expect(soglia).toBeLessThanOrEqual(62);
  });
});

describe('analisi del file', () => {
  it('riconosce la traccia di pianoforte e scarta la batteria', () => {
    const pianoforte = traccia(
      [{ midi: 60, da: 0, durata: TPQ }],
      [...nomeTraccia('Piano'), ...programma(0, 0)],
    );
    // Canale 10 (indice 9): batteria per definizione dello standard.
    const batteria = traccia([{ midi: 38, da: 0, durata: TPQ, canale: 9 }], [...nomeTraccia('Drums')]);

    const analisi = analyseMidi(parseMidiFile(smf([pianoforte, batteria])));
    expect(analisi.pianoFound).toBe(true);
    expect(analisi.suggestedTracks).toEqual([0]);
    expect(analisi.tracks.find((t) => t.index === 1)?.isDrums).toBe(true);
  });

  it('dichiara quando nessuna traccia si presenta come pianoforte', () => {
    const archi = traccia([{ midi: 60, da: 0, durata: TPQ }], [...nomeTraccia('Strings'), ...programma(0, 48)]);
    const analisi = analyseMidi(parseMidiFile(smf([archi])));
    expect(analisi.pianoFound).toBe(false);
    // Si importa comunque: rifiutare un file valido sarebbe peggio.
    expect(analisi.suggestedTracks).toEqual([0]);
  });

  it('legge tempo e indicazione di tempo del file', () => {
    const t = traccia([{ midi: 60, da: 0, durata: TPQ }], [...tempo(750_000), ...indicazioneTempo(3, 4)]);
    const analisi = analyseMidi(parseMidiFile(smf([t])));
    expect(analisi.bpm).toBe(80);
    expect(analisi.timeSignature).toEqual([3, 4]);
  });
});

describe('divisione delle mani', () => {
  it('crede ai nomi delle tracce quando li dichiarano', () => {
    const destra = traccia([{ midi: 48, da: 0, durata: TPQ }], nomeTraccia('Piano Right'));
    const sinistra = traccia([{ midi: 72, da: 0, durata: TPQ }], nomeTraccia('Piano Left'));

    const { song } = importa(smf([destra, sinistra]), { handSplit: 'tracks' });
    const note = song.arrangements[0]!.notes;
    // I nomi vincono sull'altezza: qui sono volutamente al contrario.
    expect(note.find((n) => n.midi === 48)?.hand).toBe('right');
    expect(note.find((n) => n.midi === 72)?.hand).toBe('left');
  });

  it('senza nomi assegna la destra alla traccia più acuta', () => {
    const bassa = traccia([{ midi: 45, da: 0, durata: TPQ }], nomeTraccia('A'));
    const alta = traccia([{ midi: 76, da: 0, durata: TPQ }], nomeTraccia('B'));

    const { song } = importa(smf([bassa, alta]), { handSplit: 'tracks' });
    const note = song.arrangements[0]!.notes;
    expect(note.find((n) => n.midi === 76)?.hand).toBe('right');
    expect(note.find((n) => n.midi === 45)?.hand).toBe('left');
  });

  it('su una traccia sola divide per altezza alla soglia scelta', () => {
    const unica = traccia([
      { midi: 48, da: 0, durata: TPQ },
      { midi: 67, da: TPQ, durata: TPQ },
    ], nomeTraccia('Piano'));

    const { song, report } = importa(smf([unica]), { handSplit: 64 });
    expect(report.handSplitMidi).toBe(64);
    const note = song.arrangements[0]!.notes;
    expect(note.find((n) => n.midi === 48)?.hand).toBe('left');
    expect(note.find((n) => n.midi === 67)?.hand).toBe('right');
  });
});

describe('allineamento alla griglia', () => {
  it('riporta sulla griglia una nota suonata fuori tempo', () => {
    // 470 tick su 480: una semicroma di griglia la riporta a 480.
    const t = traccia([{ midi: 60, da: 470, durata: 455 }], nomeTraccia('Piano'));
    const { song } = importa(smf([t]), { quantizeDivision: 16 });
    // 480 tick a 120 BPM sono 500 ms, e il silenzio iniziale è meno di
    // una battuta quindi non viene tolto.
    expect(song.arrangements[0]!.notes[0]!.startMs).toBe(500);
  });

  it('lascia i tempi come sono quando non si chiede la griglia', () => {
    const t = traccia([{ midi: 60, da: 470, durata: 455 }], nomeTraccia('Piano'));
    const { song, report } = importa(smf([t]), { quantizeDivision: 0 });
    expect(report.quantized).toBe(false);
    expect(song.arrangements[0]!.notes[0]!.startMs).toBe(490);
  });
});

describe('costruzione del brano', () => {
  const brano = (opzioni: Partial<ImportOptions> = {}) => {
    const t = traccia([
      { midi: 60, da: 0, durata: TPQ },
      { midi: 64, da: TPQ, durata: TPQ },
      { midi: 67, da: TPQ * 2, durata: TPQ * 2 },
      { midi: 48, da: 0, durata: BATTUTA },
      { midi: 50, da: BATTUTA, durata: BATTUTA },
      { midi: 72, da: BATTUTA, durata: BATTUTA },
    ], [...nomeTraccia('Piano'), ...programma(0, 0)]);
    return importa(smf([t]), opzioni);
  };

  it('produce un brano che supera la validazione del catalogo', () => {
    // È la prova che conta: il brano importato passa dalle stesse
    // regole del contenuto scritto a mano, senza scorciatoie.
    const { song } = brano();
    const esito = validateSong(song);
    expect(esito.errors).toEqual([]);
    expect(esito.valid).toBe(true);
  });

  it('marca il brano come importato e non distribuibile', () => {
    const { song } = brano();
    expect(song.license.status).toBe('user_import');
    // Suonabile sul dispositivo, mai servibile ad altri.
    expect(isSongServable(song)).toBe(false);
  });

  it('taglia il silenzio iniziale fino alla battuta', () => {
    const t = traccia([{ midi: 60, da: BATTUTA * 3 + TPQ, durata: TPQ }], nomeTraccia('Piano'));
    const { song } = importa(smf([t]));
    // Restano i 480 tick dentro la battuta, non le tre battute vuote.
    expect(song.arrangements[0]!.notes[0]!.startMs).toBe(500);
  });

  it('copre tutto il brano con sezioni contigue', () => {
    const { song } = brano();
    const a = song.arrangements[0]!;
    expect(a.sections.length).toBeGreaterThan(0);
    expect(a.sections[0]!.startMs).toBe(0);
    expect(a.sections[a.sections.length - 1]!.endMs).toBe(a.durationMs);
    for (let i = 1; i < a.sections.length; i++) {
      expect(a.sections[i]!.startMs).toBe(a.sections[i - 1]!.endMs);
    }
  });

  it('assegna ogni nota alla sua sezione', () => {
    const { song } = brano();
    expect(song.arrangements[0]!.notes.every((n) => n.sectionId)).toBe(true);
  });

  it('fonde le note identiche sovrapposte invece di contarle due volte', () => {
    // Melodia raddoppiata su due tracce: per chi suona è una nota sola.
    const uno = traccia([{ midi: 60, da: 0, durata: BATTUTA }], nomeTraccia('Piano 1'));
    const due = traccia([{ midi: 60, da: TPQ, durata: BATTUTA }], nomeTraccia('Piano 2'));
    const { song, report } = importa(smf([uno, due]), { handSplit: 48 });
    expect(report.notesMerged).toBe(1);
    expect(song.arrangements[0]!.notes).toHaveLength(1);
    // La nota fusa dura fino alla fine della più lunga.
    expect(song.arrangements[0]!.notes[0]!.durationMs).toBe(2500);
  });

  it('scarta le note fuori dalla tastiera e lo dichiara', () => {
    const t = traccia([
      { midi: 12, da: 0, durata: TPQ },   // sotto il LA0
      { midi: 60, da: TPQ, durata: TPQ },
    ], nomeTraccia('Piano'));
    const { song, report } = importa(smf([t]));
    expect(report.notesOutOfRange).toBe(1);
    expect(song.arrangements[0]!.notes.map((n) => n.midi)).toEqual([60]);
  });

  it('rifiuta un file senza note utilizzabili invece di creare un brano vuoto', () => {
    const vuota = traccia([{ midi: 12, da: 0, durata: TPQ }], nomeTraccia('Piano'));
    expect(() => importa(smf([vuota]))).toThrow();
  });

  it('dichiara nel resoconto cosa ha fatto', () => {
    const { report } = brano({ quantizeDivision: 16 });
    expect(report).toMatchObject({ quantized: true, handSplitMidi: 60, notesOutOfRange: 0 });
    expect(report.notesImported).toBe(6);
    expect(report.sections).toBeGreaterThan(0);
  });
});
