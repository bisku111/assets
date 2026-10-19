import { emptyMeta, ImportedSongStore, MAX_IMPORTED_SONGS } from './importedSongs';
import { MemoryStore } from './keyValue';
import type { Song } from '../../core/song/types';

function brano(id: string): Song {
  return {
    schemaVersion: 1, id, slug: id, title: id,
    artistId: 'artist-importati', artistName: 'I tuoi brani',
    coverColors: ['#000000', '#111111'],
    bpm: 100, keySignature: 'C', timeSignature: [4, 4],
    durationMs: 2000, baseDifficulty: 'complete', isFree: true, tags: ['importato'],
    license: {
      status: 'user_import', owner: null, type: 'uso personale',
      territory: 'LOCAL', startDate: null, endDate: null,
    },
    arrangements: [{
      id: `${id}--complete`, difficulty: 'complete', hands: ['right'],
      suggestedStartRate: 0.5, durationMs: 2000,
      sections: [{ id: 's1', kind: 'verse', name: 'Tutto', startMs: 0, endMs: 2000 }],
      notes: [{ midi: 60, startMs: 0, durationMs: 400, hand: 'right' }],
      chords: [],
    }],
  };
}

describe('libreria dei brani importati', () => {
  it('parte vuota', async () => {
    expect(await new ImportedSongStore(new MemoryStore()).list()).toEqual([]);
  });

  it('salva e rilegge', async () => {
    const libreria = new ImportedSongStore(new MemoryStore());
    await libreria.add(brano('uno'), emptyMeta());
    expect((await libreria.list()).map((s) => s.id)).toEqual(['uno']);
  });

  it('mette il più recente per primo e non duplica', async () => {
    const libreria = new ImportedSongStore(new MemoryStore());
    await libreria.add(brano('uno'), emptyMeta());
    await libreria.add(brano('due'), emptyMeta());
    await libreria.add(brano('uno'), emptyMeta());
    expect((await libreria.list()).map((s) => s.id)).toEqual(['uno', 'due']);
  });

  it('toglie un brano', async () => {
    const libreria = new ImportedSongStore(new MemoryStore());
    await libreria.add(brano('uno'), emptyMeta());
    await libreria.remove('uno');
    expect(await libreria.list()).toEqual([]);
  });

  it('non cresce oltre il limite', async () => {
    const libreria = new ImportedSongStore(new MemoryStore());
    for (let i = 0; i < MAX_IMPORTED_SONGS + 5; i++) await libreria.add(brano(`b${i}`), emptyMeta());
    expect(await libreria.list()).toHaveLength(MAX_IMPORTED_SONGS);
  });

  it('scarta un brano non valido invece di far crashare il player', async () => {
    const store = new MemoryStore();
    const rotto = brano('rotto');
    rotto.arrangements[0]!.notes = []; // arrangiamento senza note
    await store.set('maestro.importedSongs', JSON.stringify([
      { song: rotto, meta: emptyMeta() }, { song: brano('buono'), meta: emptyMeta() },
    ]));
    expect((await new ImportedSongStore(store).list()).map((s) => s.id)).toEqual(['buono']);
  });

  it('conserva come è stato importato un brano', async () => {
    const libreria = new ImportedSongStore(new MemoryStore());
    await libreria.add(brano('uno'), {
      ...emptyMeta(), sourceName: 'mio.mxl', sourceFormat: 'mxl', quantizeDivision: 16,
    });
    expect(await libreria.getMeta('uno')).toMatchObject({ sourceName: 'mio.mxl', sourceFormat: 'mxl' });
  });

  it('legge anche i brani salvati dalla versione precedente', async () => {
    // Le prime versioni salvavano brani nudi, senza dati di importazione.
    const store = new MemoryStore();
    await store.set('maestro.importedSongs', JSON.stringify([brano('vecchio')]));
    const libreria = new ImportedSongStore(store);
    expect((await libreria.list()).map((s) => s.id)).toEqual(['vecchio']);
    // Non si inventa come era stato importato: i dati restano vuoti.
    expect(await libreria.getMeta('vecchio')).toEqual(emptyMeta());
  });

  it('riscrive l intera libreria per il ripristino da backup', async () => {
    const libreria = new ImportedSongStore(new MemoryStore());
    await libreria.add(brano('vecchio'), emptyMeta());
    await libreria.replaceAll([{ song: brano('nuovo'), meta: emptyMeta() }]);
    expect((await libreria.list()).map((s) => s.id)).toEqual(['nuovo']);
  });

  it('svuota la libreria', async () => {
    const libreria = new ImportedSongStore(new MemoryStore());
    await libreria.add(brano('uno'), emptyMeta());
    await libreria.clear();
    expect(await libreria.list()).toEqual([]);
  });

  it('sopravvive a un archivio corrotto', async () => {
    const store = new MemoryStore();
    await store.set('maestro.importedSongs', '{non json');
    expect(await new ImportedSongStore(store).list()).toEqual([]);
  });
});
