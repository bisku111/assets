import { DEFAULT_MXL_LIMITS, MxlError, decodeUtf8, readMxl } from './mxl';
import { buildMxl, buildZip, CONTAINER_XML } from './__fixtures__/mxl';
import { MINIMO } from './__fixtures__/musicxml';
import { parseMusicXml } from './musicXml';

describe('archivio valido', () => {
  it('estrae il documento indicato dal container', () => {
    const mxl = buildMxl(MINIMO, 'score.musicxml');
    const esito = readMxl(mxl);
    expect(esito.path).toBe('score.musicxml');
    expect(esito.xml).toContain('score-partwise');
    expect(esito.notices).toEqual([]);
  });

  it('il documento estratto si legge davvero come MusicXML', () => {
    // È la prova che conta: estrazione e lettura si incastrano.
    const doc = parseMusicXml(readMxl(buildMxl(MINIMO)).xml);
    expect(doc.parts[0]?.notes[0]?.midi).toBe(60);
  });

  it('segue il percorso dichiarato anche in una sottocartella', () => {
    const mxl = buildMxl(MINIMO, 'spartiti/mio.musicxml');
    expect(readMxl(mxl).path).toBe('spartiti/mio.musicxml');
  });

  it('legge anche gli archivi senza compressione', () => {
    const mxl = buildMxl(MINIMO);
    expect(readMxl(mxl).xml.length).toBeGreaterThan(0);
  });
});

describe('container mancante', () => {
  it('usa l unico documento presente, dicendolo', () => {
    const mxl = buildZip({ 'brano.musicxml': MINIMO });
    const esito = readMxl(mxl);
    expect(esito.path).toBe('brano.musicxml');
    expect(esito.notices[0]).toMatch(/non ha un container/);
  });

  it('si ferma se i candidati sono più di uno', () => {
    const mxl = buildZip({ 'uno.musicxml': MINIMO, 'due.musicxml': MINIMO });
    expect(() => readMxl(mxl)).toThrow(/non ha un unico documento/);
  });

  it('si ferma se non c è nessun documento', () => {
    const mxl = buildZip({ 'lettura.txt': 'niente musica qui' });
    expect(() => readMxl(mxl)).toThrow(/unico documento/);
  });
});

describe('container sbagliato', () => {
  it('si ferma se il container indica un file che non c è', () => {
    const mxl = buildZip({
      'META-INF/container.xml': CONTAINER_XML('manca.musicxml'),
      'altro.musicxml': MINIMO,
    });
    expect(() => readMxl(mxl)).toThrow(/non c/);
  });

  it('si ferma se il container non indica niente', () => {
    const mxl = buildZip({
      'META-INF/container.xml': '<container><rootfiles/></container>',
      'altro.musicxml': MINIMO,
    });
    expect(() => readMxl(mxl)).toThrow(/non indica nessun documento/);
  });
});

describe('archivi ostili', () => {
  it('rifiuta un percorso che esce dall archivio', () => {
    const mxl = buildZip({ '../fuori.musicxml': MINIMO });
    expect(() => readMxl(mxl)).toThrow(/esce dall/);
  });

  it('rifiuta un percorso assoluto', () => {
    const mxl = buildZip({ '/etc/passwd': 'x' });
    expect(() => readMxl(mxl)).toThrow(/percorso assoluto/);
  });

  it('rifiuta un percorso in stile Windows', () => {
    const mxl = buildZip({ 'cartella\\file.musicxml': MINIMO });
    expect(() => readMxl(mxl)).toThrow(/percorso assoluto/);
  });

  it('rifiuta una bomba di decompressione guardando l indice', () => {
    // Un megabyte di zeri si comprime a pochissimo: il rapporto si vede
    // dall'indice, prima di allocare qualunque cosa.
    const bomba = buildZip({
      'META-INF/container.xml': CONTAINER_XML('score.musicxml'),
      'score.musicxml': new Uint8Array(1024 * 1024),
    });
    expect(() => readMxl(bomba)).toThrow(/tutta la memoria/);
  });

  it('rifiuta un archivio che dichiara troppi dati in totale', () => {
    const mxl = buildMxl(MINIMO);
    expect(() => readMxl(mxl, { ...DEFAULT_MXL_LIMITS, maxTotalBytes: 10 }))
      .toThrow(/molti più dati/);
  });

  it('rifiuta un archivio con troppi file', () => {
    const molti: Record<string, string> = { 'META-INF/container.xml': CONTAINER_XML('score.musicxml') };
    for (let i = 0; i < 20; i++) molti[`f${i}.txt`] = 'x';
    molti['score.musicxml'] = MINIMO;
    expect(() => readMxl(buildZip(molti), { ...DEFAULT_MXL_LIMITS, maxEntries: 5 }))
      .toThrow(/troppi file/);
  });

  it('rifiuta un archivio più grande del limite', () => {
    expect(() => readMxl(buildMxl(MINIMO), { ...DEFAULT_MXL_LIMITS, maxArchiveBytes: 10 }))
      .toThrow(/troppo grande/);
  });

  it('rifiuta un singolo file più grande del limite', () => {
    expect(() => readMxl(buildMxl(MINIMO), { ...DEFAULT_MXL_LIMITS, maxEntryBytes: 10 }))
      .toThrow(/troppo grande/);
  });
});

describe('archivi danneggiati', () => {
  it('rifiuta un file che non è un archivio', () => {
    expect(() => readMxl(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(MxlError);
  });

  it('rifiuta un archivio troncato', () => {
    const mxl = buildMxl(MINIMO);
    expect(() => readMxl(mxl.subarray(0, mxl.length - 30))).toThrow(MxlError);
  });

  it('rifiuta un archivio con l indice corrotto', () => {
    const mxl = buildMxl(MINIMO);
    const rotto = new Uint8Array(mxl);
    // Si sposta l'inizio dell'indice su un punto qualsiasi.
    const eocd = rotto.length - 22;
    new DataView(rotto.buffer).setUint32(eocd + 16, 7, true);
    expect(() => readMxl(rotto)).toThrow(/danneggiato|valido/);
  });

  it('rifiuta un archivio con i dati corrotti', () => {
    const mxl = buildMxl(MINIMO);
    const rotto = new Uint8Array(mxl);
    // Si sporca il corpo compresso, lasciando intatto l'indice.
    for (let i = 60; i < Math.min(120, rotto.length); i++) rotto[i] = 0xff;
    expect(() => readMxl(rotto)).toThrow(MxlError);
  });
});

describe('decodifica del testo', () => {
  it('legge i caratteri accentati', () => {
    expect(decodeUtf8(new Uint8Array([0x70, 0x65, 0x72, 0x63, 0x68, 0xc3, 0xa9])))
      .toBe('perché');
  });

  it('toglie il marcatore di ordine dei byte', () => {
    expect(decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
  });

  it('legge i caratteri fuori dal piano base', () => {
    expect(decodeUtf8(new Uint8Array([0xf0, 0x9d, 0x84, 0x9e]))).toBe('\u{1D11E}');
  });
});
