import type { Artist } from '../core/song/types';

/**
 * Artisti del catalogo.
 *
 * Gli artisti italiani contemporanei sono presenti come SEGNAPOSTO
 * (`isPlaceholder: true`): nessun contenuto musicale e' associato a loro,
 * perche' il loro repertorio e' protetto e non abbiamo licenza. Servono a
 * due cose concrete:
 *  1. dimostrare che catalogo, categorie e ricerca funzionano gia' con la
 *     struttura definitiva;
 *  2. raccogliere l'interesse degli utenti, per capire quale repertorio
 *     conviene licenziare per primo.
 *
 * Il nome di un artista non e' materiale protetto: lo e' la sua musica.
 * Per questo qui c'e' il nome e non c'e' una sola nota.
 */

const PLACEHOLDER_COLORS: Array<[string, string]> = [
  ['#2B1B4D', '#5B3FA8'],
  ['#1B2A4D', '#3F72A8'],
  ['#4D1B2B', '#A83F5B'],
  ['#1B4D3A', '#3FA87C'],
  ['#4D3A1B', '#A8823F'],
  ['#3A1B4D', '#823FA8'],
];

const IN_ATTESA_DI_LICENZA = [
  'Lucio Battisti', 'Vasco Rossi', 'Ligabue', '883', 'Eros Ramazzotti', 'Ultimo',
  'Tiziano Ferro', 'Pino Daniele', 'Zucchero', 'Claudio Baglioni', 'Elisa', 'Giorgia',
];

export const ARTISTS: Artist[] = [
  {
    id: 'artist-maestro-originals',
    slug: 'maestro-originals',
    name: 'Maestro Originals',
    bio: 'Brani originali scritti per imparare, nello stile della canzone italiana.',
    isPlaceholder: false,
    coverColors: ['#3B2E7E', '#7C4DFF'],
    sortOrder: 0,
  },
  {
    id: 'artist-tradizionale',
    slug: 'tradizionale',
    name: 'Tradizionale e Classici',
    bio: 'Melodie di pubblico dominio: tradizione popolare e grande repertorio classico.',
    isPlaceholder: false,
    coverColors: ['#0F3D3E', '#2EC4B6'],
    sortOrder: 1,
  },
  ...IN_ATTESA_DI_LICENZA.map((name, index): Artist => ({
    id: `artist-${slugify(name)}`,
    slug: slugify(name),
    name,
    bio: 'Repertorio in attesa di licenza. Nessun brano ancora disponibile.',
    isPlaceholder: true,
    coverColors: PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length] as [string, string],
    sortOrder: 10 + index,
  })),
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function findArtist(id: string): Artist | null {
  return ARTISTS.find((a) => a.id === id) ?? null;
}
