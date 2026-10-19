/**
 * Costruttori di documenti MusicXML per i test.
 *
 * Non fa parte dell'applicazione: nessun file di `src/app` lo importa,
 * quindi non entra nel bundle.
 */

export interface NotaXml {
  step?: string;
  octave?: number;
  alter?: number;
  /** Durata in divisioni. */
  duration: number;
  rest?: boolean;
  chord?: boolean;
  staff?: number;
  voice?: number;
  finger?: number;
  tie?: 'start' | 'stop';
  grace?: boolean;
  dynamics?: number;
}

export function nota(n: NotaXml): string {
  const corpo: string[] = [];
  if (n.grace) corpo.push('<grace/>');
  if (n.chord) corpo.push('<chord/>');
  if (n.rest) {
    corpo.push('<rest/>');
  } else {
    corpo.push(
      `<pitch><step>${n.step ?? 'C'}</step>` +
      (n.alter !== undefined ? `<alter>${n.alter}</alter>` : '') +
      `<octave>${n.octave ?? 4}</octave></pitch>`,
    );
  }
  if (!n.grace) corpo.push(`<duration>${n.duration}</duration>`);
  if (n.tie) corpo.push(`<tie type="${n.tie}"/>`);
  corpo.push(`<voice>${n.voice ?? 1}</voice>`);
  if (n.staff !== undefined) corpo.push(`<staff>${n.staff}</staff>`);
  if (n.finger !== undefined) {
    corpo.push(`<notations><technical><fingering>${n.finger}</fingering></technical></notations>`);
  }
  const attributi = n.dynamics !== undefined ? ` dynamics="${n.dynamics}"` : '';
  return `<note${attributi}>${corpo.join('')}</note>`;
}

export interface BattutaXml {
  number: number;
  divisions?: number;
  staves?: number;
  fifths?: number;
  mode?: string;
  beats?: number;
  beatType?: number;
  tempo?: number;
  contenuto: string;
  /** `|:` all'inizio della battuta. */
  apreRitornello?: boolean;
  /** `:|` alla fine della battuta. */
  chiudeRitornello?: boolean;
  /** Esecuzioni totali volute dal `:|`. */
  volte?: number;
  /** Numeri della volta che comincia qui. */
  volta?: number[];
  /** Qui la volta finisce. */
  fineVolta?: boolean;
}

export function battuta(b: BattutaXml): string {
  const attributi: string[] = [];
  if (b.divisions !== undefined) attributi.push(`<divisions>${b.divisions}</divisions>`);
  if (b.fifths !== undefined) {
    attributi.push(`<key><fifths>${b.fifths}</fifths><mode>${b.mode ?? 'major'}</mode></key>`);
  }
  if (b.beats !== undefined) {
    attributi.push(`<time><beats>${b.beats}</beats><beat-type>${b.beatType ?? 4}</beat-type></time>`);
  }
  if (b.staves !== undefined) attributi.push(`<staves>${b.staves}</staves>`);

  const sinistra: string[] = [];
  if (b.apreRitornello) sinistra.push('<repeat direction="forward"/>');
  if (b.volta) sinistra.push(`<ending number="${b.volta.join(',')}" type="start"/>`);

  const destra: string[] = [];
  if (b.fineVolta) destra.push('<ending type="stop"/>');
  if (b.chiudeRitornello) {
    destra.push(`<repeat direction="backward"${b.volte ? ` times="${b.volte}"` : ''}/>`);
  }

  return (
    `<measure number="${b.number}">` +
    (sinistra.length > 0 ? `<barline location="left">${sinistra.join('')}</barline>` : '') +
    (attributi.length > 0 ? `<attributes>${attributi.join('')}</attributes>` : '') +
    (b.tempo !== undefined ? `<direction><sound tempo="${b.tempo}"/></direction>` : '') +
    b.contenuto +
    (destra.length > 0 ? `<barline location="right">${destra.join('')}</barline>` : '') +
    '</measure>'
  );
}

export interface ParteXml {
  id: string;
  name: string;
  program?: number;
  channel?: number;
  battute: string[];
}

export function partitura(parti: ParteXml[], meta: { title?: string; composer?: string } = {}): string {
  const elenco = parti.map((p) =>
    `<score-part id="${p.id}"><part-name>${p.name}</part-name>` +
    `<score-instrument id="${p.id}-I1"><instrument-name>${p.name}</instrument-name></score-instrument>` +
    (p.program !== undefined || p.channel !== undefined
      ? `<midi-instrument id="${p.id}-I1">` +
        (p.channel !== undefined ? `<midi-channel>${p.channel}</midi-channel>` : '') +
        (p.program !== undefined ? `<midi-program>${p.program}</midi-program>` : '') +
        '</midi-instrument>'
      : '') +
    '</score-part>').join('');

  const corpo = parti.map((p) => `<part id="${p.id}">${p.battute.join('')}</part>`).join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<score-partwise version="4.0">' +
    (meta.title ? `<work><work-title>${meta.title}</work-title></work>` : '') +
    (meta.composer
      ? `<identification><creator type="composer">${meta.composer}</creator></identification>`
      : '') +
    `<part-list>${elenco}</part-list>` +
    corpo +
    '</score-partwise>'
  );
}

/** Lo spartito minimo che abbia senso: una parte, una battuta, una nota. */
export const MINIMO = partitura([{
  id: 'P1', name: 'Piano', program: 1,
  battute: [battuta({ number: 1, divisions: 1, contenuto: nota({ step: 'C', octave: 4, duration: 4 }) })],
}]);
