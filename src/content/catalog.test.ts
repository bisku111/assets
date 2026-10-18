import { isSongServable } from '../core/song/license';
import { validateSong } from '../core/song/validate';
import { DEMO_ARTISTS, DEMO_REJECTED, DEMO_SONGS } from './catalog';

describe('catalogo dimostrativo', () => {
  it('non scarta nessun brano: i contenuti del repository sono validi', () => {
    const motivi = DEMO_REJECTED.map(
      ({ song, result }) => `${song.slug}: ${result.errors.map((e) => `${e.path} ${e.message}`).join(', ')}`,
    );
    expect(motivi).toEqual([]);
  });

  it('contiene brani su piu livelli di difficolta', () => {
    expect(DEMO_SONGS.length).toBeGreaterThanOrEqual(6);
    expect(DEMO_SONGS.filter((s) => s.arrangements.length >= 2).length).toBeGreaterThanOrEqual(5);
  });

  it('ogni brano supera la validazione completa', () => {
    for (const song of DEMO_SONGS) {
      const result = validateSong(song);
      expect({ slug: song.slug, errori: result.errors }).toEqual({ slug: song.slug, errori: [] });
    }
  });

  // Questo test e' un vincolo legale, non tecnico: se qualcuno aggiunge
  // un brano protetto al catalogo del bundle, la build deve fallire.
  it('contiene SOLO brani originali o di pubblico dominio', () => {
    for (const song of DEMO_SONGS) {
      expect(['original', 'public_domain']).toContain(song.license.status);
      expect(isSongServable(song)).toBe(true);
    }
  });

  it('gli artisti in attesa di licenza non hanno brani associati', () => {
    const placeholder = DEMO_ARTISTS.filter((a) => a.isPlaceholder);
    expect(placeholder.length).toBeGreaterThan(0);
    for (const artist of placeholder) {
      expect(DEMO_SONGS.filter((s) => s.artistId === artist.id)).toEqual([]);
    }
  });

  it('offre abbastanza brani gratuiti per provare l app davvero', () => {
    expect(DEMO_SONGS.filter((s) => s.isFree).length).toBeGreaterThanOrEqual(4);
  });

  it('le sezioni coprono il brano senza buchi ne sovrapposizioni', () => {
    for (const song of DEMO_SONGS) {
      for (const arrangement of song.arrangements) {
        let cursor = 0;
        for (const section of arrangement.sections) {
          expect({ slug: song.slug, sezione: section.id, inizio: section.startMs })
            .toEqual({ slug: song.slug, sezione: section.id, inizio: cursor });
          cursor = section.endMs;
        }
      }
    }
  });

  it('ogni arrangiamento ha almeno una sezione consigliata per il loop', () => {
    for (const song of DEMO_SONGS) {
      for (const arrangement of song.arrangements) {
        expect(arrangement.sections.some((s) => s.loopRecommended)).toBe(true);
      }
    }
  });

  it('la diteggiatura resta nelle cinque dita', () => {
    for (const song of DEMO_SONGS) {
      for (const arrangement of song.arrangements) {
        for (const note of arrangement.notes) {
          if (note.finger !== undefined) {
            expect(note.finger).toBeGreaterThanOrEqual(1);
            expect(note.finger).toBeLessThanOrEqual(5);
          }
        }
      }
    }
  });
});
