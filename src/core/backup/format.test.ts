import {
  BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, BackupError, backupFileName, buildBackup,
  findDuplicates, inspectBackup, mergeBackup, serializeBackup, songFingerprint,
  type BackupEntry,
} from './format';
import type { Song } from '../song/types';
import type { SongProgressRecord } from '../ports/repository';

function brano(id: string, over: Partial<Song> = {}): Song {
  return {
    schemaVersion: 1, id, slug: id, title: id.toUpperCase(),
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
    ...over,
  };
}

function progresso(songId: string): SongProgressRecord {
  return {
    songId, arrangementId: `${songId}--complete`, difficulty: 'complete',
    bestScore: 88, stars: 4, completionPct: 70, currentRatePct: 80,
    attempts: 3, totalPracticeMs: 120_000, lastPracticedAt: '2026-10-01T10:00:00.000Z',
    sectionState: {},
  };
}

const voce = (id: string, conProgresso = false): BackupEntry => ({
  song: brano(id),
  meta: {
    importedAt: '2026-10-01T09:00:00.000Z', sourceName: `${id}.mid`, sourceFormat: 'midi',
    splitMidi: 60, quantizeDivision: 16, partsUsed: [0], partsExcluded: [],
  },
  progress: conProgresso ? [progresso(id)] : [],
});

describe('scrittura del backup', () => {
  it('scrive un file versionato e leggibile', () => {
    const backup = buildBackup([voce('uno')], { createdAt: '2026-10-05T12:00:00.000Z' });
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(JSON.parse(serializeBackup(backup)).entries).toHaveLength(1);
  });

  it('non mette nel backup i brani del catalogo', () => {
    // Il catalogo non è roba dell'utente e non va duplicata in un file
    // che può girare.
    const diMaestro = brano('originale', {
      license: {
        status: 'original', owner: 'Maestro', type: 'proprietary',
        territory: 'WW', startDate: null, endDate: null,
      },
    });
    const backup = buildBackup([voce('mio'), { song: diMaestro, meta: voce('x').meta, progress: [] }]);
    expect(backup.entries.map((e) => e.song.id)).toEqual(['mio']);
  });

  it('propone un nome con la data', () => {
    expect(backupFileName('2026-10-05T12:00:00.000Z')).toBe('maestro-2026-10-05.maestro');
  });
});

describe('lettura del backup', () => {
  it('rilegge quello che ha scritto, progressi compresi', () => {
    const testo = serializeBackup(buildBackup([voce('uno', true), voce('due')]));
    const esito = inspectBackup(testo);
    expect(esito.errors).toEqual([]);
    expect(esito.songs.map((s) => s.title)).toEqual(['UNO', 'DUE']);
    expect(esito.songs[0]?.hasProgress).toBe(true);
    expect(esito.entries[0]?.progress[0]?.bestScore).toBe(88);
    expect(esito.entries[0]?.meta.sourceName).toBe('uno.mid');
  });

  it('rifiuta un file che non è un backup', () => {
    expect(() => inspectBackup('{"ciao":1}')).toThrow(BackupError);
  });

  it('rifiuta un file illeggibile', () => {
    expect(() => inspectBackup('{non json')).toThrow(/non riesco a leggerlo/);
  });

  it('dichiara incompatibile uno schema più recente invece di provarci', () => {
    const futuro = JSON.stringify({
      format: BACKUP_FORMAT, schemaVersion: 99, createdAt: 'x', app: 'Maestro', entries: [],
    });
    const esito = inspectBackup(futuro);
    expect(esito.incompatible).toBe(true);
    expect(esito.errors[0]).toMatch(/più recente/);
    expect(esito.entries).toEqual([]);
  });

  it('salta un brano danneggiato e lo dice, senza perdere gli altri', () => {
    const rotto = voce('rotto');
    rotto.song.arrangements[0]!.notes = [];
    const testo = JSON.stringify({
      format: BACKUP_FORMAT, schemaVersion: 1, createdAt: 'x', app: 'Maestro',
      entries: [rotto, voce('buono')],
    });
    const esito = inspectBackup(testo);
    expect(esito.songs.map((s) => s.id)).toEqual(['buono']);
    expect(esito.errors[0]).toMatch(/ROTTO/);
  });

  it('salta una voce senza brano', () => {
    const testo = JSON.stringify({
      format: BACKUP_FORMAT, schemaVersion: 1, createdAt: 'x', app: 'Maestro',
      entries: [{ meta: {} }, voce('buono')],
    });
    expect(inspectBackup(testo).errors[0]).toMatch(/non contiene nessun brano/);
  });

  it('rifiuta un brano del catalogo infilato in un backup', () => {
    const intruso = {
      song: brano('intruso', {
        license: {
          status: 'original' as const, owner: 'X', type: null,
          territory: 'WW', startDate: null, endDate: null,
        },
      }),
      meta: voce('x').meta, progress: [],
    };
    const testo = JSON.stringify({
      format: BACKUP_FORMAT, schemaVersion: 1, createdAt: 'x', app: 'Maestro', entries: [intruso],
    });
    expect(inspectBackup(testo).errors[0]).toMatch(/non è un brano personale/);
  });

  it('sopporta un backup senza metadati di importazione', () => {
    const testo = JSON.stringify({
      format: BACKUP_FORMAT, schemaVersion: 1, createdAt: 'x', app: 'Maestro',
      entries: [{ song: brano('nudo') }],
    });
    const esito = inspectBackup(testo);
    expect(esito.entries[0]?.meta.quantizeDivision).toBe(0);
    expect(esito.entries[0]?.progress).toEqual([]);
  });
});

describe('duplicati', () => {
  const libreria = [voce('uno'), voce('due')];

  it('riconosce lo stesso brano reimportato con un altro identificatore', () => {
    // Reimportando lo stesso file si ottiene un id nuovo ma la stessa
    // musica: l'identificatore da solo non basta.
    const stessaMusica: BackupEntry = {
      ...voce('uno'),
      song: { ...brano('uno'), id: 'import-uno-999' },
    };
    expect(songFingerprint(stessaMusica.song)).toBe(songFingerprint(libreria[0]!.song));
    expect(findDuplicates(libreria, [stessaMusica])).toEqual(['UNO']);
  });

  it('"mantieni esistente" non tocca la libreria', () => {
    const esito = mergeBackup(libreria, [voce('uno')], 'keep');
    expect(esito.kept).toBe(1);
    expect(esito.entries).toHaveLength(2);
    expect(esito.duplicates).toEqual(['UNO']);
  });

  it('"sostituisci" mette il brano del backup al posto di quello', () => {
    const nuovo = voce('uno', true);
    const esito = mergeBackup(libreria, [nuovo], 'replace');
    expect(esito.replaced).toBe(1);
    expect(esito.entries).toHaveLength(2);
    expect(esito.entries.find((e) => e.song.id === 'uno')?.progress).toHaveLength(1);
  });

  it('"importa come copia" aggiunge un brano distinto', () => {
    const esito = mergeBackup(libreria, [voce('uno')], 'copy');
    expect(esito.copied).toBe(1);
    expect(esito.entries).toHaveLength(3);
    const copia = esito.entries.find((e) => e.song.title.includes('copia'));
    expect(copia?.song.id).not.toBe('uno');
    // Anche gli arrangiamenti devono cambiare identificatore, altrimenti
    // i progressi della copia si confonderebbero con l'originale.
    expect(copia?.song.arrangements[0]?.id).toContain(copia?.song.id ?? '');
  });

  it('i brani nuovi entrano sempre, qualunque sia la politica', () => {
    for (const politica of ['keep', 'copy', 'replace'] as const) {
      const esito = mergeBackup(libreria, [voce('tre')], politica);
      expect(esito.added).toBe(1);
      expect(esito.entries).toHaveLength(3);
    }
  });

  it('non segnala duplicati quando non ce ne sono', () => {
    expect(findDuplicates(libreria, [voce('tre')])).toEqual([]);
  });
});

describe('ripristino completo', () => {
  it('su una libreria vuota rimette tutto com era', () => {
    const originali = [voce('uno', true), voce('due')];
    const testo = serializeBackup(buildBackup(originali));

    // Si simula un dispositivo nuovo: libreria vuota.
    const letto = inspectBackup(testo);
    const esito = mergeBackup([], letto.entries, 'keep');

    expect(esito.added).toBe(2);
    expect(esito.entries.map((e) => e.song.id).sort()).toEqual(['due', 'uno']);
    const ripristinato = esito.entries.find((e) => e.song.id === 'uno');
    expect(ripristinato?.progress[0]?.bestScore).toBe(88);
    expect(ripristinato?.song.arrangements[0]?.notes).toHaveLength(1);
    expect(ripristinato?.meta.sourceFormat).toBe('midi');
  });
});
