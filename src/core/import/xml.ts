/**
 * Lettore XML minimo e deliberatamente limitato.
 *
 * È scritto a mano invece di usare una libreria per una ragione di
 * sicurezza, non di gusto: il modo più solido di non essere
 * vulnerabili a XXE è **non implementare affatto** le entità esterne.
 * Qui non esiste codice che risolva un SYSTEM o un PUBLIC, quindi non
 * esiste niente da ingannare. Un DOCTYPE che le dichiari viene
 * rifiutato invece di essere ignorato in silenzio.
 *
 * Non c'è nessun accesso alla rete, e non può essercene: il lettore
 * riceve una stringa e restituisce un albero.
 *
 * Tutti i limiti sono espliciti. Un file che li supera viene rifiutato
 * con un messaggio comprensibile: è il comportamento giusto davanti a
 * un documento ostile o semplicemente sbagliato.
 */

export class XmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlError';
  }
}

export class XmlSecurityError extends XmlError {
  constructor(message: string) {
    super(message);
    this.name = 'XmlSecurityError';
  }
}

export interface XmlLimits {
  maxLength: number;
  maxDepth: number;
  maxNodes: number;
  maxAttributes: number;
}

export const DEFAULT_XML_LIMITS: XmlLimits = {
  /** 24 milioni di caratteri: uno spartito lunghissimo ne usa meno di uno. */
  maxLength: 24_000_000,
  maxDepth: 100,
  maxNodes: 400_000,
  maxAttributes: 64,
};

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Testo diretto dell'elemento, già ripulito dalle entità. */
  text: string;
}

/** Le sole entità ammesse: quelle predefinite dallo standard. */
const ENTITIES: Record<string, string> = {
  lt: '<', gt: '>', amp: '&', quot: '"', apos: "'",
};

export function parseXml(source: string, limits: XmlLimits = DEFAULT_XML_LIMITS): XmlElement {
  if (source.length > limits.maxLength) {
    throw new XmlError('il documento è troppo grande');
  }

  let i = 0;
  let nodi = 0;
  const pila: XmlElement[] = [];
  let radice: XmlElement | null = null;

  const errore = (messaggio: string): never => {
    throw new XmlError(`${messaggio} (carattere ${i})`);
  };

  while (i < source.length) {
    const apertura = source.indexOf('<', i);

    if (apertura < 0) {
      aggiungiTesto(source.slice(i));
      break;
    }
    if (apertura > i) aggiungiTesto(source.slice(i, apertura));
    i = apertura;

    // ---- Commenti, CDATA, dichiarazioni -----------------------------
    if (source.startsWith('<!--', i)) {
      const fine = source.indexOf('-->', i + 4);
      if (fine < 0) errore('commento non chiuso');
      i = fine + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', i)) {
      const fine = source.indexOf(']]>', i + 9);
      if (fine < 0) errore('sezione CDATA non chiusa');
      // Dentro CDATA non si decodifica niente: è testo letterale.
      if (pila.length > 0) (pila[pila.length - 1] as XmlElement).text += source.slice(i + 9, fine);
      i = fine + 3;
      continue;
    }
    if (source.startsWith('<!DOCTYPE', i)) {
      i = saltaDoctype(source, i, errore);
      continue;
    }
    if (source.startsWith('<?', i)) {
      const fine = source.indexOf('?>', i + 2);
      if (fine < 0) errore('istruzione di elaborazione non chiusa');
      i = fine + 2;
      continue;
    }

    // ---- Tag di chiusura --------------------------------------------
    if (source.startsWith('</', i)) {
      const fine = source.indexOf('>', i);
      if (fine < 0) errore('tag di chiusura non chiuso');
      const nome = source.slice(i + 2, fine).trim();
      const corrente = pila.pop();
      if (!corrente) errore(`chiusura </${nome}> senza apertura`);
      if ((corrente as XmlElement).name !== nome) {
        errore(`chiusura </${nome}> non corrisponde a <${(corrente as XmlElement).name}>`);
      }
      i = fine + 1;
      continue;
    }

    // ---- Tag di apertura --------------------------------------------
    const fineTag = trovaFineTag(source, i, errore);
    const contenuto = source.slice(i + 1, fineTag);
    const autoChiuso = contenuto.endsWith('/');
    const corpo = autoChiuso ? contenuto.slice(0, -1) : contenuto;

    nodi++;
    if (nodi > limits.maxNodes) throw new XmlError('il documento contiene troppi elementi');

    const elemento = leggiTag(corpo, limits, errore);
    const genitore = pila[pila.length - 1];
    if (genitore) genitore.children.push(elemento);
    else if (radice) errore('il documento ha più di un elemento radice');
    else radice = elemento;

    if (!autoChiuso) {
      pila.push(elemento);
      if (pila.length > limits.maxDepth) throw new XmlError('il documento è annidato troppo in profondità');
    }
    i = fineTag + 1;
  }

  if (pila.length > 0) {
    throw new XmlError(`il documento finisce prima di chiudere <${(pila[pila.length - 1] as XmlElement).name}>`);
  }
  if (!radice) throw new XmlError('il documento non contiene nessun elemento');
  return radice;

  function aggiungiTesto(grezzo: string): void {
    if (pila.length === 0) return; // testo fuori dalla radice: si ignora
    (pila[pila.length - 1] as XmlElement).text += decodifica(grezzo, errore);
  }
}

/**
 * Salta il DOCTYPE, rifiutando tutto ciò che potrebbe far caricare
 * qualcosa da fuori o far esplodere il lettore.
 */
function saltaDoctype(source: string, start: number, errore: (m: string) => never): number {
  // Si guarda fin dove arriva la dichiarazione, sottoinsieme interno compreso.
  let i = start + 9;
  let profondita = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '[') profondita++;
    else if (c === ']') profondita--;
    else if (c === '>' && profondita <= 0) { i++; break; }
    i++;
  }
  const dichiarazione = source.slice(start, i);

  if (/<!ENTITY/i.test(dichiarazione)) {
    throw new XmlSecurityError(
      'il documento dichiara entità personalizzate: non vengono eseguite per sicurezza',
    );
  }
  if (/\b(SYSTEM|PUBLIC)\b/.test(dichiarazione)) {
    throw new XmlSecurityError(
      'il documento fa riferimento a un file esterno: non viene caricato per sicurezza',
    );
  }
  if (i >= source.length && !dichiarazione.endsWith('>')) errore('DOCTYPE non chiuso');
  return i;
}

/** Trova il `>` che chiude il tag, saltando quelli dentro le virgolette. */
function trovaFineTag(source: string, start: number, errore: (m: string) => never): number {
  let virgolette: string | null = null;
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i] as string;
    if (virgolette) {
      if (c === virgolette) virgolette = null;
    } else if (c === '"' || c === "'") virgolette = c;
    else if (c === '>') return i;
  }
  return errore('tag non chiuso');
}

function leggiTag(
  corpo: string,
  limits: XmlLimits,
  errore: (m: string) => never,
): XmlElement {
  const spazio = corpo.search(/\s/);
  const nome = (spazio < 0 ? corpo : corpo.slice(0, spazio)).trim();
  if (!nome) errore('tag senza nome');

  const attrs: Record<string, string> = {};
  if (spazio >= 0) {
    const resto = corpo.slice(spazio);
    const re = /([^\s=/<>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let quanti = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(resto)) !== null) {
      quanti++;
      if (quanti > limits.maxAttributes) throw new XmlError('troppi attributi su un elemento');
      attrs[m[1] as string] = decodifica((m[3] ?? m[4] ?? '') as string, errore);
    }
  }

  return { name: nome, attrs, children: [], text: '' };
}

/**
 * Decodifica le entità ammesse.
 *
 * Qualunque altra entità fa fallire la lettura: in un documento senza
 * DTD non esiste, e accettarla in silenzio significherebbe avere una
 * strada per farne risolvere una. Meglio un errore chiaro.
 */
function decodifica(testo: string, errore: (m: string) => never): string {
  if (!testo.includes('&')) return testo;

  return testo.replace(/&(#x?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, (intero, nome: string) => {
    if (nome.startsWith('#x') || nome.startsWith('#X')) {
      const codice = Number.parseInt(nome.slice(2), 16);
      if (!Number.isFinite(codice) || codice <= 0 || codice > 0x10ffff) errore(`riferimento non valido: ${intero}`);
      return String.fromCodePoint(codice);
    }
    if (nome.startsWith('#')) {
      const codice = Number.parseInt(nome.slice(1), 10);
      if (!Number.isFinite(codice) || codice <= 0 || codice > 0x10ffff) errore(`riferimento non valido: ${intero}`);
      return String.fromCodePoint(codice);
    }
    const sostituto = ENTITIES[nome];
    if (sostituto === undefined) {
      throw new XmlSecurityError(`il documento usa un'entità non dichiarata (${intero})`);
    }
    return sostituto;
  });
}

// ---------------------------------------------------------------------
// Navigazione
// ---------------------------------------------------------------------

export function child(el: XmlElement | null | undefined, name: string): XmlElement | null {
  return el?.children.find((c) => c.name === name) ?? null;
}

export function childrenNamed(el: XmlElement | null | undefined, name: string): XmlElement[] {
  return el?.children.filter((c) => c.name === name) ?? [];
}

export function textOf(el: XmlElement | null | undefined, name?: string): string | null {
  const target = name ? child(el, name) : el;
  if (!target) return null;
  const testo = target.text.trim();
  return testo.length > 0 ? testo : null;
}

export function numberOf(el: XmlElement | null | undefined, name?: string): number | null {
  const testo = textOf(el, name);
  if (testo === null) return null;
  const valore = Number.parseFloat(testo);
  return Number.isFinite(valore) ? valore : null;
}

export function hasChild(el: XmlElement | null | undefined, name: string): boolean {
  return child(el, name) !== null;
}
