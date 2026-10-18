import { buildSong } from '../core/song/builder';
import { selectValidSongs } from '../core/song/validate';
import type { Artist, Song } from '../core/song/types';
import { ARTISTS } from './artists';
import { LESSON_SONGS } from './lessons';
import { ORIGINAL_SONGS } from './songs/originals';
import { PUBLIC_DOMAIN_SONGS } from './songs/publicDomain';

/**
 * Catalogo dimostrativo incluso nel bundle.
 *
 * E' quello che rende l'app utilizzabile senza backend e senza rete: al
 * primo avvio, offline, su un telefono appena installato. Quando Supabase
 * e' configurato, il catalogo remoto si aggiunge a questo, non lo
 * sostituisce.
 *
 * I brani non validi vengono scartati invece di far crashare il player.
 * Un test del core garantisce che, in questo repository, non ce ne siano.
 */

const BUILT_SONGS: Song[] = [...LESSON_SONGS, ...ORIGINAL_SONGS, ...PUBLIC_DOMAIN_SONGS].map(buildSong);

const validation = selectValidSongs(BUILT_SONGS);

if (validation.rejected.length > 0 && typeof console !== 'undefined') {
  for (const { song, result } of validation.rejected) {
    console.warn(
      `[catalogo] brano "${song.slug}" scartato:`,
      result.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
    );
  }
}

export const DEMO_SONGS: Song[] = validation.songs;
export const DEMO_ARTISTS: Artist[] = ARTISTS;
/** Esposti per i test: qui devono essere sempre zero. */
export const DEMO_REJECTED = validation.rejected;

export function demoSongBySlug(slug: string): Song | null {
  return DEMO_SONGS.find((s) => s.slug === slug) ?? null;
}

export function demoSongById(id: string): Song | null {
  return DEMO_SONGS.find((s) => s.id === id) ?? null;
}

/** Gli id delle lezioni, nell'ordine del percorso didattico. */
export const LESSON_SONG_IDS: string[] = LESSON_SONGS.map((l) => l.id);

/** Brani veri e propri: il catalogo senza gli esercizi del percorso. */
export const DEMO_REPERTOIRE: Song[] = DEMO_SONGS.filter((s) => !s.tags.includes('lezione'));
