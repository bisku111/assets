/**
 * Costruttori di file MIDI per i test.
 *
 * Provare un parser binario su un file vero significa non sapere quale
 * byte ha rotto cosa. Qui i byte si scrivono uno per uno.
 *
 * Non fa parte dell'applicazione: nessun file di `src/app` lo importa,
 * quindi non entra nel bundle.
 */

export function vlq(value: number): number[] {
  const out = [value & 0x7f];
  let v = value >> 7;
  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return out;
}

export function chunk(tipo: string, corpo: number[]): number[] {
  const n = corpo.length;
  return [
    ...[...tipo].map((c) => c.charCodeAt(0)),
    (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff,
    ...corpo,
  ];
}

export function smf(tracce: number[][], { division = 480, format = 1 } = {}): Uint8Array {
  const header = chunk('MThd', [
    0, format, 0, tracce.length, (division >> 8) & 0xff, division & 0xff,
  ]);
  return new Uint8Array([...header, ...tracce.flatMap((t) => chunk('MTrk', t))]);
}

export const FINE = [0x00, 0xff, 0x2f, 0x00];

export function nomeTraccia(nome: string): number[] {
  const bytes = [...nome].map((c) => c.charCodeAt(0));
  return [0x00, 0xff, 0x03, bytes.length, ...bytes];
}

export function tempo(usPerQuarter: number, delta = 0): number[] {
  return [
    ...vlq(delta), 0xff, 0x51, 0x03,
    (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff,
  ];
}

export function indicazioneTempo(numeratore: number, denominatore: number): number[] {
  return [0x00, 0xff, 0x58, 0x04, numeratore, Math.log2(denominatore), 24, 8];
}

export function programma(canale: number, programma_: number): number[] {
  return [0x00, 0xc0 | canale, programma_];
}

/** Una nota: accensione, attesa, spegnimento. */
export function nota(
  midi: number,
  { da = 0, durata = 480, canale = 0, forza = 100 }: {
    da?: number; durata?: number; canale?: number; forza?: number;
  } = {},
): { on: number[]; offTick: number; midi: number; canale: number; forza: number; da: number } {
  return { on: [], offTick: da + durata, midi, canale, forza, da };
}

/**
 * Costruisce una traccia da un elenco di note assolute, ordinando gli
 * eventi e calcolando i delta: scriverli a mano è dove si sbaglia.
 */
export function traccia(
  note: { midi: number; da: number; durata: number; canale?: number; forza?: number }[],
  prefisso: number[] = [],
): number[] {
  const eventi: { tick: number; dati: number[] }[] = [];
  for (const n of note) {
    const canale = n.canale ?? 0;
    eventi.push({ tick: n.da, dati: [0x90 | canale, n.midi, n.forza ?? 100] });
    eventi.push({ tick: n.da + n.durata, dati: [0x80 | canale, n.midi, 0] });
  }
  eventi.sort((a, b) => a.tick - b.tick);

  const corpo = [...prefisso];
  let ultimo = 0;
  for (const e of eventi) {
    corpo.push(...vlq(e.tick - ultimo), ...e.dati);
    ultimo = e.tick;
  }
  corpo.push(...FINE);
  return corpo;
}
