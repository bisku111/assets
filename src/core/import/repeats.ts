/**
 * Apertura dei ritornelli.
 *
 * Uno spartito scritto non è una sequenza di battute: è una sequenza
 * di battute **più le istruzioni per ripercorrerle**. Un file con
 * `|: :|` contiene otto battute e se ne suonano sedici. Importarlo
 * senza aprire i ritornelli dà all'allievo metà del brano che ha
 * davanti sulla carta, ed è l'unico punto in cui Maestro gli
 * mostrerebbe qualcosa di diverso da quello che vede.
 *
 * Qui si calcola soltanto **l'ordine in cui le battute vanno
 * suonate**: un elenco di indici. Non si tocca nessuna nota, e la
 * logica si prova senza XML.
 */

export interface MeasureMarks {
  /** `|:` all'inizio della battuta. */
  forwardRepeat: boolean;
  /** `:|` alla fine della battuta. */
  backwardRepeat: boolean;
  /** Esecuzioni totali volute da `<repeat times="n">`. */
  repeatTimes: number | null;
  /** Numeri della volta che comincia qui (1ª, 2ª…), se comincia. */
  endingStart: number[] | null;
  /** Qui la volta finisce. */
  endingStop: boolean;
}

export function emptyMarks(): MeasureMarks {
  return {
    forwardRepeat: false, backwardRepeat: false,
    repeatTimes: null, endingStart: null, endingStop: false,
  };
}

export interface ExpandResult {
  /** Indici delle battute nell'ordine di esecuzione. */
  order: number[];
  notices: string[];
}

/**
 * Oltre questo non è più uno spartito ma un ciclo: si interrompe e lo
 * si dice, invece di riempire la memoria.
 */
const MAX_PLAYED_MEASURES = 4000;

export function expandRepeats(
  marks: readonly MeasureMarks[],
  { maxMeasures = MAX_PLAYED_MEASURES }: { maxMeasures?: number } = {},
): ExpandResult {
  const n = marks.length;
  const order: number[] = [];
  const notices: string[] = [];
  if (n === 0) return { order, notices };

  let i = 0;
  /** Dove ricomincia il ritornello in corso. Senza `|:` è l'inizio del brano. */
  let sectionStart = 0;
  /** Quante volte stiamo percorrendo la sezione: la 1ª volta, la 2ª… */
  let pass = 1;
  /** Esecuzioni già fatte di ogni `:|`. */
  const fatte = new Map<number, number>();
  let interrotto = false;

  while (i < n) {
    if (order.length >= maxMeasures) { interrotto = true; break; }
    const m = marks[i] as MeasureMarks;

    // Un nuovo `|:` apre una sezione: da qui in poi si torna qui.
    if (m.forwardRepeat && sectionStart !== i) {
      sectionStart = i;
      pass = 1;
    }

    // Volta che non è la nostra: si salta tutta, non solo questa battuta.
    if (m.endingStart !== null && !m.endingStart.includes(pass)) {
      i = fineDellaVolta(marks, i);
      continue;
    }

    order.push(i);

    if (m.backwardRepeat) {
      const volte = Math.max(2, m.repeatTimes ?? 2);
      const giaFatte = fatte.get(i) ?? 1;
      if (giaFatte < volte) {
        fatte.set(i, giaFatte + 1);
        pass += 1;
        i = sectionStart;
        continue;
      }
      // Ritornello esaurito: quello che viene dopo è un'altra sezione.
      fatte.delete(i);
      sectionStart = i + 1;
      pass = 1;
    }

    i++;
  }

  if (interrotto) {
    notices.push(
      'I ritornelli di questo file si richiudono su se stessi: ho importato le prime ' +
      `${order.length} battute invece di continuare all’infinito.`,
    );
  } else if (order.length > n) {
    notices.push(`Ritornelli aperti: ${n} battute scritte diventano ${order.length} da suonare.`);
  }

  return { order, notices };
}

/** Prima battuta dopo la volta che comincia in `inizio`. */
function fineDellaVolta(marks: readonly MeasureMarks[], inizio: number): number {
  for (let j = inizio; j < marks.length; j++) {
    // L'inizio di un'altra volta chiude questa, e si controlla PRIMA
    // della chiusura esplicita: in un file dove la prima volta non si
    // chiude mai, fermarsi sulla chiusura della seconda farebbe
    // saltare anche quella.
    if (j > inizio && (marks[j] as MeasureMarks).endingStart !== null) return j;
    if ((marks[j] as MeasureMarks).endingStop) return j + 1;
  }
  return inizio + 1;
}

/**
 * Unisce i segni letti da parti diverse.
 *
 * I ritornelli riguardano tutto il brano, ma molti file li scrivono
 * solo sul primo pentagramma. Prendere solo la prima parte
 * significherebbe perderli quando il curatore li ha messi altrove.
 */
export function mergeMarks(perParte: readonly (readonly MeasureMarks[])[]): MeasureMarks[] {
  const battute = Math.max(0, ...perParte.map((p) => p.length));
  const uniti: MeasureMarks[] = [];

  for (let i = 0; i < battute; i++) {
    const corrente = emptyMarks();
    for (const parte of perParte) {
      const m = parte[i];
      if (!m) continue;
      corrente.forwardRepeat ||= m.forwardRepeat;
      corrente.backwardRepeat ||= m.backwardRepeat;
      corrente.endingStop ||= m.endingStop;
      if (m.repeatTimes !== null) corrente.repeatTimes = m.repeatTimes;
      if (m.endingStart !== null) {
        corrente.endingStart = [...new Set([...(corrente.endingStart ?? []), ...m.endingStart])];
      }
    }
    uniti.push(corrente);
  }
  return uniti;
}
