import type { ImportDocument, ImportNote, ImportPart, TempoChange, TimeSignature } from './document';
import { DEFAULT_US_PER_QUARTER } from './document';
import type { Hand } from '../song/types';
import { emptyMarks, expandRepeats, mergeMarks, type MeasureMarks } from './repeats';
import {
  child, childrenNamed, hasChild, numberOf, parseXml, textOf,
  XmlError, type XmlElement,
} from './xml';

/**
 * Da MusicXML al modello intermedio.
 *
 * Il MusicXML è uno spartito, non un'esecuzione: porta informazioni
 * che un MIDI non ha — titolo, autore, tonalità, numeri di battuta,
 * pentagrammi e soprattutto **la diteggiatura scritta dal curatore**.
 * Tutto quello che il modello sa rappresentare viene conservato; quello
 * che non sa rappresentare viene dichiarato, non perso in silenzio.
 *
 * Niente viene inventato. Se il file non ha diteggiature, il brano
 * importato non ne avrà.
 */

export class MusicXmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MusicXmlError';
  }
}

/**
 * Risoluzione interna. Alta e divisibile per 2, 3, 4 e 5, così le
 * divisioni dichiarate dai file — che cambiano da documento a
 * documento e anche dentro lo stesso — si convertono senza deriva.
 */
export const MUSICXML_TPQ = 960;

export const MAX_MUSICXML_NOTES = 50_000;

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const MAJOR_KEYS = [
  'Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#',
] as const;
const MINOR_KEYS = [
  'Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m',
] as const;

const PIANO_NAME = /piano|pianoforte|klavier|keyboard|harpsichord|clavicembalo|celesta/i;

export function parseMusicXml(source: string): ImportDocument {
  let radice: XmlElement;
  try {
    radice = parseXml(source);
  } catch (errore) {
    if (errore instanceof XmlError) throw errore;
    throw new MusicXmlError('il documento non è un XML leggibile');
  }

  if (radice.name === 'score-timewise') {
    throw new MusicXmlError(
      'questo MusicXML è in forma "timewise", che non so ancora leggere: riesportalo in forma "partwise"',
    );
  }
  if (radice.name !== 'score-partwise') {
    throw new MusicXmlError('non è un file MusicXML');
  }

  const notices: string[] = [];
  const anagrafica = leggiAnagrafica(radice);
  const strumenti = leggiElencoParti(radice);

  const tempoMap: TempoChange[] = [];
  const timeSignatures: TimeSignature[] = [];
  let keySignature: string | null = null;
  const perse = new Set<string>();
  let graziose = 0;
  let totale = 0;

  const parts: ImportPart[] = [];
  const parti = childrenNamed(radice, 'part');

  // I ritornelli riguardano tutto il brano: si leggono da tutte le
  // parti e si uniscono, perché molti file li segnano su un solo
  // pentagramma. L'ordine di esecuzione è lo stesso per tutti.
  const ritornelli = expandRepeats(mergeMarks(parti.map(leggiSegni)));
  notices.push(...ritornelli.notices);

  parti.forEach((parteXml, indice) => {
    const id = parteXml.attrs.id ?? `P${indice + 1}`;
    const info = strumenti.get(id);
    const lette = leggiParte(parteXml, ritornelli.order, {
      tempoMap, timeSignatures, perse,
      onKey: (k) => { if (keySignature === null) keySignature = k; },
      onGrace: () => { graziose++; },
    });
    totale += lette.length;
    if (totale > MAX_MUSICXML_NOTES) {
      throw new MusicXmlError('il file contiene troppe note per essere studiato come un brano');
    }

    const nome = info?.name ?? null;
    parts.push({
      index: indice,
      id,
      name: nome,
      instrument: info?.instrument ?? null,
      channel: info?.channel ?? null,
      program: info?.program ?? null,
      isDrums: info?.isDrums ?? false,
      looksLikePiano:
        !(info?.isDrums ?? false) &&
        (PIANO_NAME.test(`${nome ?? ''} ${info?.instrument ?? ''}`) ||
          (info?.program !== null && info?.program !== undefined && info.program < 8) ||
          // Nessuna dichiarazione di strumento: si considera suonabile.
          (info?.program === null && !PIANO_NAME.test(nome ?? '') ? true : false)),
      notes: lette,
    });
  });

  if (parts.length === 0) throw new MusicXmlError('il documento non contiene nessuna parte');
  if (parts.every((p) => p.notes.length === 0)) {
    throw new MusicXmlError('il documento non contiene nessuna nota');
  }

  if (graziose > 0) {
    notices.push(`${graziose} abbellimenti non sono stati importati: non hanno una durata propria.`);
  }
  for (const quale of perse) notices.push(quale);
  const conDiteggiatura = parts.reduce(
    (n, p) => n + p.notes.filter((x) => x.finger !== undefined).length, 0,
  );
  notices.push(
    conDiteggiatura > 0
      ? `${conDiteggiatura} diteggiature originali conservate dal file.`
      : 'Il file non contiene diteggiature: non ne vengono inventate.',
  );

  return {
    format: 'musicxml',
    title: anagrafica.title,
    composer: anagrafica.composer,
    ticksPerQuarter: MUSICXML_TPQ,
    tempoMap: tempoMap.sort((a, b) => a.tick - b.tick),
    timeSignatures: timeSignatures.sort((a, b) => a.tick - b.tick),
    keySignature,
    parts,
    notices,
  };
}

// ---------------------------------------------------------------------
// Anagrafica e elenco delle parti
// ---------------------------------------------------------------------

function leggiAnagrafica(radice: XmlElement): { title: string | null; composer: string | null } {
  const titolo =
    textOf(child(radice, 'work'), 'work-title') ??
    textOf(radice, 'movement-title');

  const autori = childrenNamed(child(radice, 'identification'), 'creator');
  const compositore =
    autori.find((c) => c.attrs.type === 'composer')?.text.trim() ||
    autori[0]?.text.trim() ||
    null;

  return { title: titolo, composer: compositore || null };
}

interface InfoParte {
  name: string | null;
  instrument: string | null;
  channel: number | null;
  /** 0-based come nel MIDI: il MusicXML lo scrive da 1. */
  program: number | null;
  isDrums: boolean;
}

function leggiElencoParti(radice: XmlElement): Map<string, InfoParte> {
  const mappa = new Map<string, InfoParte>();
  for (const parte of childrenNamed(child(radice, 'part-list'), 'score-part')) {
    const id = parte.attrs.id;
    if (!id) continue;
    const midi = child(parte, 'midi-instrument');
    const canale = numberOf(midi, 'midi-channel');
    const programma = numberOf(midi, 'midi-program');
    mappa.set(id, {
      name: textOf(parte, 'part-name'),
      instrument: textOf(child(parte, 'score-instrument'), 'instrument-name'),
      channel: canale !== null ? canale - 1 : null,
      // Nel MusicXML i programmi vanno da 1 a 128.
      program: programma !== null ? Math.max(0, programma - 1) : null,
      isDrums: canale === 10 || hasChild(midi, 'midi-unpitched'),
    });
  }
  return mappa;
}

// ---------------------------------------------------------------------
// Lettura di una parte
// ---------------------------------------------------------------------

/**
 * Legge i segni di ritornello dalle stanghette di una parte.
 *
 * `|:` e `:|` stanno dentro `<barline>`, insieme alle volte. Qui si
 * raccolgono soltanto: aprirli è compito di `expandRepeats`, che non
 * sa niente di XML e si prova da sola.
 */
function leggiSegni(parteXml: XmlElement): MeasureMarks[] {
  return childrenNamed(parteXml, 'measure').map((battuta) => {
    const segni = emptyMarks();
    for (const barline of childrenNamed(battuta, 'barline')) {
      const repeat = child(barline, 'repeat');
      if (repeat) {
        if (repeat.attrs.direction === 'forward') segni.forwardRepeat = true;
        if (repeat.attrs.direction === 'backward') {
          segni.backwardRepeat = true;
          const volte = Number.parseInt(repeat.attrs.times ?? '', 10);
          if (Number.isFinite(volte) && volte >= 2) segni.repeatTimes = volte;
        }
      }

      const ending = child(barline, 'ending');
      if (ending) {
        const tipo = ending.attrs.type;
        if (tipo === 'start') {
          const numeri = (ending.attrs.number ?? '1')
            .split(/[,\s]+/)
            .map((n) => Number.parseInt(n, 10))
            .filter((n) => Number.isFinite(n) && n > 0);
          segni.endingStart = numeri.length > 0 ? numeri : [1];
        }
        // "discontinue" è la volta aperta a destra: finisce lo stesso qui.
        if (tipo === 'stop' || tipo === 'discontinue') segni.endingStop = true;
      }
    }
    return segni;
  });
}

interface ContestoParte {
  tempoMap: TempoChange[];
  timeSignatures: TimeSignature[];
  perse: Set<string>;
  onKey: (key: string) => void;
  onGrace: () => void;
}

interface NotaInLavorazione extends ImportNote {
  staff: number | null;
  voice: number;
  tieStart: boolean;
  tieStop: boolean;
}

function leggiParte(
  parteXml: XmlElement,
  ordine: readonly number[],
  ctx: ContestoParte,
): ImportNote[] {
  let divisions = 1;
  let staves = 1;
  let battutaTick = 0;
  // Movimenti per battuta secondo l'indicazione metrica corrente:
  // serve a far avanzare una parte anche quando la sua battuta è
  // vuota (vedi sotto).
  let battitiPerBattuta = 4;
  const note: NotaInLavorazione[] = [];

  const battute = childrenNamed(parteXml, 'measure');
  // Si percorre l'ordine di esecuzione, non l'elenco scritto: una
  // battuta dentro un ritornello passa di qui più di una volta, e ogni
  // volta le sue note finiscono a un tempo diverso.
  const giaVista = new Set<number>();

  for (const indice of ordine) {
    const battuta = battute[indice];
    if (!battuta) continue;
    const primaVolta = !giaVista.has(indice);
    giaVista.add(indice);
    const numero = Number.parseInt(battuta.attrs.number ?? '', 10);
    let posDiv = 0;
    let ultimoInizioDiv = 0;
    let maxDiv = 0;

    const inTick = (div: number) => battutaTick + Math.round((div * MUSICXML_TPQ) / divisions);

    for (const elemento of battuta.children) {
      switch (elemento.name) {
        case 'attributes': {
          const d = numberOf(elemento, 'divisions');
          if (d !== null && d > 0) divisions = d;
          const s = numberOf(elemento, 'staves');
          if (s !== null && s > 0) staves = s;

          const chiave = child(elemento, 'key');
          const quinte = numberOf(chiave, 'fifths');
          if (quinte !== null) {
            const modo = (textOf(chiave, 'mode') ?? 'major').toLowerCase();
            const nome = keyName(quinte, modo);
            if (nome) ctx.onKey(nome);
          }

          const tempoScritto = child(elemento, 'time');
          const battiti = numberOf(tempoScritto, 'beats');
          const valore = numberOf(tempoScritto, 'beat-type');
          if (battiti !== null && valore !== null && valore > 0) {
            ctx.timeSignatures.push({
              tick: inTick(posDiv), numerator: battiti, denominator: valore,
            });
            battitiPerBattuta = (battiti * 4) / valore;
          }
          break;
        }

        case 'direction': {
          leggiTempo(elemento, inTick(posDiv), ctx);
          segnaliDiRipresa(child(elemento, 'sound'), ctx);
          if (child(elemento, 'direction-type')) {
            const tipo = child(elemento, 'direction-type');
            if (hasChild(tipo, 'dynamics')) ctx.perse.add(SEGNI_DINAMICI);
            if (hasChild(tipo, 'pedal')) ctx.perse.add(SEGNO_PEDALE);
          }
          break;
        }

        case 'sound':
          leggiTempoDiretto(elemento, inTick(posDiv), ctx);
          segnaliDiRipresa(elemento, ctx);
          break;

        case 'backup': {
          // Si torna indietro per scrivere l'altra voce o l'altra mano.
          const d = numberOf(elemento, 'duration') ?? 0;
          posDiv = Math.max(0, posDiv - d);
          break;
        }

        case 'forward': {
          const d = numberOf(elemento, 'duration') ?? 0;
          posDiv += d;
          maxDiv = Math.max(maxDiv, posDiv);
          break;
        }

        case 'barline':
          // I ritornelli ora si aprono davvero: non c'è più niente da
          // dichiarare perso qui.
          break;

        case 'note': {
          // Gli abbellimenti si contano una volta sola, anche se la
          // battuta viene suonata due volte.
          if (hasChild(elemento, 'grace')) { if (primaVolta) ctx.onGrace(); break; }

          const durata = numberOf(elemento, 'duration') ?? 0;
          const accordo = hasChild(elemento, 'chord');
          const inizioDiv = accordo ? ultimoInizioDiv : posDiv;

          if (!hasChild(elemento, 'rest') && !hasChild(elemento, 'unpitched')) {
            const midi = altezza(child(elemento, 'pitch'));
            if (midi !== null && durata > 0) {
              const staff = numberOf(elemento, 'staff');
              const nota: NotaInLavorazione = {
                startTick: inTick(inizioDiv),
                durationTicks: Math.max(1, Math.round((durata * MUSICXML_TPQ) / divisions)),
                midi,
                staff,
                voice: numberOf(elemento, 'voice') ?? 1,
                tieStart: legature(elemento).start,
                tieStop: legature(elemento).stop,
              };
              const mano = manoDa(staff, staves);
              if (mano) nota.hand = mano;
              const dito = diteggiatura(elemento);
              if (dito !== null) nota.finger = dito;
              const dinamica = Number.parseFloat(elemento.attrs.dynamics ?? '');
              if (Number.isFinite(dinamica)) {
                nota.velocity = Math.min(1, Math.max(0.05, Math.round(dinamica) / 100));
              }
              if (Number.isFinite(numero)) nota.measure = numero;
              note.push(nota);
            }
          } else if (hasChild(elemento, 'unpitched')) {
            ctx.perse.add(NON_INTONATE);
          }

          if (!accordo) {
            ultimoInizioDiv = posDiv;
            posDiv += durata;
            maxDiv = Math.max(maxDiv, posDiv);
          }

          if (hasChild(child(elemento, 'notations'), 'articulations')) ctx.perse.add(ARTICOLAZIONI);
          if (hasChild(child(elemento, 'notations'), 'slur')) ctx.perse.add(LEGATURE_FRASE);
          if (hasChild(elemento, 'lyric')) ctx.perse.add(TESTO_CANTATO);
          break;
        }

        default:
          break;
      }
    }

    // La battuta dura quanto la voce più lunga: regge anche le battute
    // di levare e quelle irregolari, che una formula fissa sbaglierebbe.
    //
    // Se però questa parte non ha scritto niente in questa battuta —
    // capita nei file che omettono le pause — il suo tempo non
    // avanzerebbe, e da lì in poi le due mani suonerebbero sfasate.
    // In quel caso vale l'indicazione metrica.
    const avanzamento = maxDiv > 0
      ? Math.round((maxDiv * MUSICXML_TPQ) / divisions)
      : Math.round(battitiPerBattuta * MUSICXML_TPQ);
    battutaTick += avanzamento;
  }

  return uniscileLegate(note);
}

const SEGNI_DINAMICI = 'Le indicazioni dinamiche (p, f, crescendo) non vengono conservate.';
const SEGNO_PEDALE = 'Le indicazioni di pedale non vengono conservate: il brano si giudica sull’attacco delle note.';
const ARTICOLAZIONI = 'Le articolazioni (staccato, accento) non vengono conservate.';
const LEGATURE_FRASE = 'Le legature di frase non vengono conservate; quelle di valore sì.';
const RIPRESE = 'Da capo, dal segno e coda non vengono aperti: i ritornelli con |: :| sì.';
const TESTO_CANTATO = 'Il testo cantato non viene importato.';
const NON_INTONATE = 'Le note non intonate (percussioni) sono state ignorate.';

/** Da capo, dal segno, coda, fine: letti per dichiararli, non aperti. */
function segnaliDiRipresa(suono: XmlElement | null, ctx: ContestoParte): void {
  if (!suono) return;
  const a = suono.attrs;
  if (a.dacapo || a.dalsegno || a.segno || a.coda || a.tocoda || a.fine) {
    ctx.perse.add(RIPRESE);
  }
}

function leggiTempo(direzione: XmlElement, tick: number, ctx: ContestoParte): void {
  const suono = child(direzione, 'sound');
  if (suono) leggiTempoDiretto(suono, tick, ctx);
}

function leggiTempoDiretto(suono: XmlElement, tick: number, ctx: ContestoParte): void {
  const bpm = Number.parseFloat(suono.attrs.tempo ?? '');
  if (!Number.isFinite(bpm) || bpm <= 0) return;
  const usPerQuarter = Math.round(60_000_000 / bpm);
  // Lo stesso tempo scritto su più parti produrrebbe doppioni inutili.
  if (ctx.tempoMap.some((t) => t.tick === tick && t.usPerQuarter === usPerQuarter)) return;
  ctx.tempoMap.push({ tick, usPerQuarter });
}

function altezza(pitch: XmlElement | null): number | null {
  if (!pitch) return null;
  const passo = textOf(pitch, 'step');
  const ottava = numberOf(pitch, 'octave');
  if (!passo || ottava === null) return null;
  const semitoni = STEP_SEMITONES[passo.toUpperCase()];
  if (semitoni === undefined) return null;
  const alterazione = numberOf(pitch, 'alter') ?? 0;
  const midi = (ottava + 1) * 12 + semitoni + Math.round(alterazione);
  return Number.isFinite(midi) ? midi : null;
}

function legature(nota: XmlElement): { start: boolean; stop: boolean } {
  // Conta <tie>, che è la legatura che suona; <tied> è solo il disegno.
  const tutte = childrenNamed(nota, 'tie');
  return {
    start: tutte.some((t) => t.attrs.type === 'start'),
    stop: tutte.some((t) => t.attrs.type === 'stop'),
  };
}

function diteggiatura(nota: XmlElement): number | null {
  for (const notations of childrenNamed(nota, 'notations')) {
    for (const technical of childrenNamed(notations, 'technical')) {
      for (const dito of childrenNamed(technical, 'fingering')) {
        const valore = Number.parseInt(dito.text.trim(), 10);
        // Solo 1..5: il resto non è una diteggiatura pianistica.
        if (valore >= 1 && valore <= 5) return valore;
      }
    }
  }
  return null;
}

/** Pentagramma 1 = mano destra, 2 = sinistra: convenzione del pianoforte. */
function manoDa(staff: number | null, staves: number): Hand | null {
  if (staves < 2 || staff === null) return null;
  if (staff === 1) return 'right';
  if (staff === 2) return 'left';
  return null;
}

/**
 * Unisce le note legate di valore.
 *
 * Una minima legata a una semiminima è **una nota sola** che dura tre
 * movimenti: importarle separate farebbe contare un attacco che non
 * esiste, e l'allievo si vedrebbe segnare un errore per aver fatto la
 * cosa giusta.
 */
function uniscileLegate(note: NotaInLavorazione[]): ImportNote[] {
  const ordinate = [...note].sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
  const aperte = new Map<string, NotaInLavorazione>();
  const risultato: NotaInLavorazione[] = [];

  for (const nota of ordinate) {
    const chiave = `${nota.midi}:${nota.staff ?? '-'}:${nota.voice}`;
    const precedente = aperte.get(chiave);

    if (nota.tieStop && precedente) {
      precedente.durationTicks = Math.max(
        precedente.durationTicks,
        nota.startTick + nota.durationTicks - precedente.startTick,
      );
      if (precedente.finger === undefined && nota.finger !== undefined) {
        precedente.finger = nota.finger;
      }
      if (!nota.tieStart) aperte.delete(chiave);
      continue;
    }

    risultato.push(nota);
    if (nota.tieStart) aperte.set(chiave, nota);
    else aperte.delete(chiave);
  }

  return risultato.map(({ staff, voice, tieStart, tieStop, ...resto }) => {
    void staff; void voice; void tieStart; void tieStop;
    return resto;
  });
}

function keyName(fifths: number, mode: string): string | null {
  const indice = Math.round(fifths) + 7;
  if (indice < 0 || indice > 14) return null;
  return mode === 'minor' ? (MINOR_KEYS[indice] ?? null) : (MAJOR_KEYS[indice] ?? null);
}

/** Esposto per i test: 120 BPM quando il file non dichiara un tempo. */
export const MUSICXML_DEFAULT_TEMPO = DEFAULT_US_PER_QUARTER;
