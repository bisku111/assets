import { buildSong, type SongDef } from './builder';
import { validateSong } from './validate';
import type { Song } from './types';

const BASE: SongDef = {
  id: 'test', slug: 'test', title: 'Test', artistId: 'a', artistName: 'A',
  coverColors: ['#000', '#fff'], bpm: 100, keySignature: 'C', isFree: true,
  license: { status: 'original', owner: 'Maestro', type: 'proprietary', territory: 'WW', startDate: null, endDate: null },
  arrangements: [{
    difficulty: 'beginner',
    sections: [{ id: 's', kind: 'verse', name: 'V', right: 'DO4 RE4 MI4 FA4', loopRecommended: true }],
  }],
};

/** Un brano valido a cui rompere una cosa per volta. */
function song(mutate: (s: Song) => void = () => {}): Song {
  const built = buildSong(BASE);
  mutate(built);
  return built;
}

const messaggi = (s: Song) => validateSong(s).errors.map((e) => e.message);

describe('validazione dei brani', () => {
  it('accetta un brano corretto', () => {
    const result = validateSong(song());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  // Un validatore che non rifiuta niente non serve a nulla: qui si
  // verifica che ogni controllo scatti davvero.

  it('rifiuta una nota fuori dalla tastiera 88 tasti', () => {
    expect(messaggi(song((s) => { s.arrangements[0]!.notes[0]!.midi = 12; })))
      .toEqual(expect.arrayContaining([expect.stringContaining('fuori dalla tastiera')]));
  });

  it('rifiuta note non ordinate per tempo', () => {
    expect(messaggi(song((s) => { s.arrangements[0]!.notes.reverse(); })))
      .toEqual(expect.arrayContaining([expect.stringContaining('non ordinate')]));
  });

  it('rifiuta due note identiche sovrapposte, che il matcher non potrebbe distinguere', () => {
    expect(messaggi(song((s) => {
      const notes = s.arrangements[0]!.notes;
      notes[0]!.durationMs = 10_000;
      notes[1]!.midi = notes[0]!.midi;
    }))).toEqual(expect.arrayContaining([expect.stringContaining('ripetuta prima')]));
  });

  it('rifiuta una sezione che sfora la fine dell arrangiamento', () => {
    expect(messaggi(song((s) => { s.arrangements[0]!.sections[0]!.endMs += 60_000; })))
      .toEqual(expect.arrayContaining([expect.stringContaining('oltre la durata')]));
  });

  it('rifiuta un riferimento a una sezione inesistente', () => {
    expect(messaggi(song((s) => { s.arrangements[0]!.notes[0]!.sectionId = 'fantasma'; })))
      .toEqual(expect.arrayContaining([expect.stringContaining('sezione inesistente')]));
  });

  it('rifiuta una mano non dichiarata', () => {
    expect(messaggi(song((s) => { s.arrangements[0]!.notes[0]!.hand = 'left'; })))
      .toEqual(expect.arrayContaining([expect.stringContaining('non dichiarata')]));
  });

  it('rifiuta una licenza "cleared" senza titolare dei diritti', () => {
    expect(messaggi(song((s) => { s.license = { ...s.license, status: 'cleared', owner: null }; })))
      .toEqual(expect.arrayContaining([expect.stringContaining('titolare dei diritti')]));
  });

  it('rifiuta una licenza che finisce prima di iniziare', () => {
    expect(messaggi(song((s) => { s.license = { ...s.license, startDate: '2026-01-01', endDate: '2025-01-01' }; })))
      .toEqual(expect.arrayContaining([expect.stringContaining('finisce prima')]));
  });

  it('rifiuta un bpm impossibile e una durata assurda', () => {
    expect(messaggi(song((s) => { s.bpm = 5; }))).toEqual(expect.arrayContaining([expect.stringContaining('bpm')]));
    expect(messaggi(song((s) => { s.durationMs = -1; }))).toEqual(expect.arrayContaining([expect.stringContaining('durata')]));
  });

  it('rifiuta difficolta duplicate', () => {
    expect(messaggi(song((s) => { s.arrangements.push({ ...s.arrangements[0]! }); })))
      .toEqual(expect.arrayContaining([expect.stringContaining('duplicata')]));
  });

  it('segnala come avviso, non come errore, un buco fra due sezioni', () => {
    const built = buildSong({
      ...BASE,
      arrangements: [{
        difficulty: 'beginner',
        sections: [
          { id: 'a', kind: 'intro', name: 'A', right: 'DO4:4', loopRecommended: true },
          { id: 'b', kind: 'verse', name: 'B', right: 'RE4:4' },
        ],
      }],
    });
    built.arrangements[0]!.sections[1]!.startMs += 1000;
    expect(validateSong(built).warnings.map((w) => w.message))
      .toEqual(expect.arrayContaining([expect.stringContaining('buco')]));
  });
});
