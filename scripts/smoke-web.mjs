/**
 * Prova end-to-end sull'app vera.
 *
 * Non verifica che il progetto compili — lo sa gia' il bundler. Verifica
 * che un utente possa davvero fare il percorso completo: primo avvio,
 * onboarding, catalogo, scheda brano, tutorial, suonare una nota giusta
 * e una sbagliata, e ricevere punteggio e consiglio del maestro.
 *
 * Uso:
 *   npx expo export --platform web --output-dir dist
 *   node scripts/smoke-web.mjs dist
 *
 * Richiede playwright e un Chromium: si puo' indicare con
 * PLAYWRIGHT_CHROMIUM (utile nei container che lo hanno gia' installato).
 */
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { chromium } from 'playwright';

const ROOT = process.argv[2] ?? 'dist';
const PORT = Number(process.env.SMOKE_PORT ?? 8099);

const TIPI = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
};

// Server statico con fallback su index.html: e' il comportamento di
// qualunque hosting per un'app a rotte lato client.
const server = createServer(async (req, res) => {
  try {
    const url = (req.url ?? '/').split('?')[0] ?? '/';
    let file = join(ROOT, url === '/' ? 'index.html' : url);
    try { await readFile(file); } catch { file = join(ROOT, 'index.html'); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TIPI[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
// Si concede il permesso MIDI: cosi' si prova il caso reale "permesso
// dato ma nessuno strumento collegato", invece di restare appesi alla
// richiesta del browser.
await context.grantPermissions(['midi']).catch(() => undefined);
const page = await context.newPage();

const erroriJs = [];
page.on('pageerror', (e) => erroriJs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') erroriJs.push(`console: ${m.text()}`); });

const passi = [];
const passo = (nome, ok, extra = '') => {
  passi.push({ nome, ok });
  console.log(`${ok ? '  OK ' : '  NO '} ${nome}${extra ? ` — ${extra}` : ''}`);
};

/**
 * Tocca l'elemento con quell'etichetta che e' davvero in primo piano.
 *
 * Due accorgimenti, entrambi dovuti a come funziona l'app vera e non a
 * capricci del test:
 *
 *  - il navigatore a schede tiene montate anche le schermate non
 *    visibili, quindi piu' elementi hanno la stessa etichetta e solo uno
 *    riceve il tocco: si sceglie quello che `elementFromPoint` conferma
 *    essere in primo piano;
 *  - si preme e si rilascia con una pausa in mezzo, invece di usare un
 *    click istantaneo: un tocco reale dura decine di millisecondi, e il
 *    sistema di gesture di React Native Web non assegna il responder a
 *    un contatto di durata zero.
 */
async function toccaVisibile(etichetta, { hold = 90 } = {}) {
  const tutti = page.getByLabel(etichetta);
  const quanti = await tutti.count();
  for (let i = 0; i < quanti; i++) {
    const elemento = tutti.nth(i);
    // Si porta l'elemento nel campo visibile: si tocca per coordinate,
    // quindi quello che sta sotto la piega non sarebbe raggiungibile.
    await elemento.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
    const box = await elemento.boundingBox();
    if (!box) continue;
    const handle = await elemento.elementHandle();
    const inPrimoPiano = handle
      ? await page.evaluate(
          ([nodo, x, y]) => {
            const sopra = document.elementFromPoint(x, y);
            return sopra !== null && (nodo === sopra || nodo.contains(sopra));
          },
          [handle, box.x + box.width / 2, box.y + box.height / 2],
        )
      : false;
    if (inPrimoPiano) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(hold);
      await page.mouse.up();
      return true;
    }
  }
  throw new Error(`nessun elemento in primo piano per ${etichetta}`);
}

const visibile = async (locator) => locator.first().isVisible().catch(() => false);

/** Apre il selettore e consegna un file di prova. */
async function scegliFile(nomeFixture) {
  const percorso = resolve('scripts/fixtures', nomeFixture);
  const [selettore] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    toccaVisibile('Scegli un file'),
  ]);
  await selettore.setFiles(percorso);
  await page.waitForTimeout(1500);
}

/** Legge il valore accanto a un'etichetta del riepilogo. */
async function valoreRiga(etichetta) {
  const riga = page.getByText(etichetta, { exact: true }).first();
  if (!(await riga.isVisible().catch(() => false))) return null;
  const testo = await riga.evaluate((el) => el.parentElement?.innerText ?? '');
  return testo.replace(etichetta, '').trim();
}

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // ---- 1. Primo avvio -------------------------------------------------
  // Non si cerca "Impara il pianoforte": quel testo compare anche nel
  // <title> della pagina, che e' nascosto e farebbe fallire il controllo
  // per il motivo sbagliato.
  passo('la schermata di benvenuto compare', await visibile(page.getByText('con le canzoni italiane')));

  await page.getByRole('button', { name: 'Inizia subito' }).first().click({ delay: 60 });
  await page.waitForTimeout(1200);
  passo('"Inizia subito" porta all onboarding', await visibile(page.getByText('Quanto sai suonare?')));

  // ---- 2. Le tre domande ----------------------------------------------
  await toccaVisibile('Non ho mai suonato');
  await page.waitForTimeout(800);
  passo('seconda domanda: i gusti musicali', await visibile(page.getByText('Quale musica ti piace?')));

  await page.getByRole('button', { name: /^(Continua|Salta)$/ }).first().click({ delay: 60 });
  await page.waitForTimeout(800);
  passo('terza domanda: l obiettivo giornaliero', await visibile(page.getByText('Quanto vuoi esercitarti?')));

  await toccaVisibile('10 minuti al giorno');
  await page.waitForTimeout(1500);

  // ---- 3. Home ---------------------------------------------------------
  passo('la Home mostra le fasce di brani', await visibile(page.getByText('Per cominciare')));
  passo("la Home mostra l'obiettivo del giorno", await visibile(page.getByText(/0 \/ 10 minuti/)));
  passo('la Home propone i brani a due mani', await visibile(page.getByText('A due mani')));
  passo('fra questi c e il valzer a due mani',
    await visibile(page.getByText('Valzer della domenica').first()));

  // ---- 4. Catalogo ------------------------------------------------------
  await page.getByText('Canzoni', { exact: true }).last().click({ force: true, delay: 60 });
  await page.waitForTimeout(1200);
  passo('il catalogo elenca i brani', await visibile(page.getByText('Ballata sul lungomare')));
  passo('gli artisti in attesa di licenza sono dichiarati', await visibile(page.getByText('Vasco Rossi')));

  // ---- 5. Scheda del brano ----------------------------------------------
  await toccaVisibile(/^Piano piano/);
  await page.waitForTimeout(1200);
  passo('la scheda del brano si apre', await visibile(page.getByText('Come vuoi suonare')));
  passo('la scheda propone le modalita di studio', await visibile(page.getByText('Impara', { exact: true })));

  // ---- 6. Tutorial -------------------------------------------------------
  await page.getByRole('button', { name: 'Inizia' }).first().click({ delay: 60 });
  await page.waitForTimeout(2000);
  passo('il tutorial mostra la tastiera', await visibile(page.getByLabel('DO4')));
  passo('la modalita IMPARA aspetta la prima nota', await visibile(page.getByText('Suona la nota indicata')));
  passo('il tutorial mostra lo spartito', await visibile(page.getByLabel('Pentagramma')));
  passo('il tutorial indica il dito da usare', await visibile(page.getByLabel('Diteggiatura')));

  // Il numero e' tutta l'informazione: senza, il pallino sul tasto
  // sarebbe una decorazione.
  // allTextContents e non allInnerTexts: innerText esiste solo sugli
  // elementi HTML, e questi sono <text> dentro un SVG.
  const scritte = await page.locator('svg text').allTextContents();
  passo(
    'il numero del dito e scritto sul tasto',
    scritte.some((t) => /^[1-5]$/.test(t.trim())),
    scritte.filter((t) => t.trim()).slice(0, 4).join(' '),
  );
  passo(
    'sotto il pentagramma c e il nome della nota',
    scritte.some((t) => /^(DO|RE|MI|FA|SOL|LA|SI)[#b]?$/.test(t.trim())),
  );
  // I nomi stanno anche sui tasti, neri compresi: e' quello che chiede
  // chi non sa ancora dove mettere le dita.
  passo('i tasti neri portano il loro nome', await visibile(page.getByText('FA#', { exact: true }).first()));

  // Finche' la nota non arriva, niente si muove: e' il senso della
  // modalita' IMPARA, e vale per il tempo, per lo spartito e per la corsia.
  const tempoPrima = await page.getByText(/^\d+:\d\d$/).first().innerText();
  await page.waitForTimeout(1200);
  const tempoDopo = await page.getByText(/^\d+:\d\d$/).first().innerText();
  passo('il brano resta fermo finche la nota giusta non arriva', tempoPrima === tempoDopo,
    `${tempoPrima} -> ${tempoDopo}`);

  // ---- 7. Nota sbagliata ---------------------------------------------------
  // Si sbaglia MENTRE il brano aspetta la prima nota: e' li' che una nota
  // diversa e' un errore vero. Suonata lontano dal momento previsto
  // sarebbe invece una "nota in piu'", che e' un'altra cosa.
  await toccaVisibile('SOL4');
  await page.waitForTimeout(600);
  passo('una nota sbagliata dice quale era prevista', await visibile(page.getByText(/Prevista:/)));

  // ---- 8. Si suona davvero ---------------------------------------------------
  // La nota attesa non e' stata consumata dall'errore: si puo' correggere.
  await toccaVisibile('DO4');
  await page.waitForTimeout(700);
  passo('dopo l errore si puo correggere e la nota e accettata', await visibile(page.getByText('Giusto')));
  passo('il contatore delle note giuste sale', await visibile(page.getByText(/1 giuste/)));

  // Suonata la nota giusta, il brano riparte: lo stesso orologio che
  // prima non si muoveva adesso avanza.
  const tempoRipreso = await page.getByText(/^\d+:\d\d$/).first().innerText();
  await page.waitForTimeout(1300);
  const tempoAvanzato = await page.getByText(/^\d+:\d\d$/).first().innerText();
  passo('dopo la nota giusta il brano riparte', tempoRipreso !== tempoAvanzato,
    `${tempoRipreso} -> ${tempoAvanzato}`);

  // ---- 8b. Spartito e diteggiatura si possono togliere ----------------------
  await toccaVisibile('Spartito');
  await page.waitForTimeout(400);
  passo('lo spartito si puo nascondere',
    !(await page.getByLabel('Pentagramma').first().isVisible().catch(() => false)));
  await toccaVisibile('Dita');
  await page.waitForTimeout(400);
  passo('la diteggiatura si puo nascondere',
    !(await page.getByLabel('Diteggiatura').first().isVisible().catch(() => false)));

  // ---- 9. Risultato e maestro -----------------------------------------------
  await page.getByRole('button', { name: 'Esci' }).first().click({ delay: 60 });
  await page.waitForTimeout(1800);
  passo('a fine esercizio compare il punteggio', await visibile(page.getByText('/100')));
  passo('il risultato separa precisione, ritmo e tempo', await visibile(page.getByText('PRECISIONE')));

  const bottoni = await page.getByRole('button').allInnerTexts();
  const consiglio = bottoni.some((t) =>
    /Rallenta|Prova all|Ripeti|Sezione successiva|Due mani|Concludi|Solo mano/.test(t));
  passo('il maestro propone un passo successivo', consiglio, bottoni.slice(0, 3).join(' | '));

  // ---- 10. Calibrazione del ritardo ------------------------------------
  // "Esci" riporta alla scheda del brano: si torna indietro ancora una
  // volta per ritrovare le schede principali.
  await page.getByRole('button', { name: 'Esci' }).first().click({ delay: 60 });
  await page.waitForTimeout(1000);
  await page.goBack();
  await page.waitForTimeout(1200);
  await page.getByText('Profilo', { exact: true }).last().click({ force: true, delay: 60 });
  await page.waitForTimeout(1000);
  await toccaVisibile('Calibra il ritardo');
  await page.waitForTimeout(1200);
  passo('la calibrazione si apre dal profilo', await visibile(page.getByText('Calibrazione del ritardo')));

  // Otto battiti piu' quattro di preparazione: si batte a tempo sulla
  // tastiera a schermo e si controlla che la misura esca.
  //
  // Ci si aggancia al METRONOMO DELL'APP, non all'orologio del test.
  // Contare i battiti con waitForTimeout a partire dal click presume
  // che l'app parta nello stesso istante: con un bundle pesante parte
  // qualche centinaio di millisecondi dopo, tutti i colpi slittano
  // oltre la finestra di mezzo battito e il test falliva a intermittenza
  // per colpa propria, non dell'app. La schermata pubblica il battito
  // corrente: si batte quando lo dice lei.
  await page.getByRole('button', { name: 'Avvia' }).first().click({ delay: 60 });

  const tasto = await page.getByLabel('DO4').first().boundingBox();
  if (!tasto) throw new Error('tastiera di calibrazione non trovata');
  const centro = { x: tasto.x + tasto.width / 2, y: tasto.y + tasto.height / 2 };

  const BATTITI = 8;
  let battutiAlVolo = 0;
  await page.mouse.move(centro.x, centro.y);

  for (let i = 1; i <= BATTITI; i++) {
    // L'attesa si valuta DENTRO la pagina, a ogni fotogramma: un
    // locator interrogato da fuori risponde con un ritardo variabile,
    // e un colpo che arriva oltre mezzo battito viene attribuito al
    // battito successivo, che risulta già occupato. Era così che si
    // perdevano due colpi su otto.
    // Si legge un solo attributo, non il testo della pagina:
    // `document.body.innerText` forza il layout di tastiera e SVG a
    // ogni fotogramma, e quel costo allungava i fotogrammi quanto
    // basta a far arrivare un colpo oltre mezzo battito. L'attesa non
    // deve disturbare cio' che sta misurando.
    const arrivato = await page.waitForFunction(
      (n) => document.querySelector('[aria-label^="Battito "]')
        ?.getAttribute('aria-label') === `Battito ${n}`,
      i, { polling: 'raf', timeout: 8000 },
    ).then(() => true).catch(() => false);
    if (!arrivato) break;

    // Il contatto deve durare: un tocco istantaneo non riceve il
    // responder di React Native Web e non suona nessuna nota.
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
    battutiAlVolo++;
  }
  passo('il metronomo scandisce tutti gli otto battiti', battutiAlVolo === BATTITI,
    `${battutiAlVolo}/${BATTITI}`);
  await page.waitForTimeout(1500);

  // Il controllo deve distinguere una misura vera da uno stato di
  // fallimento: "0 ms" accompagnato da "non ho registrato abbastanza
  // note" e' un fallimento, e un test che lo accetta non serve a nulla.
  // Un passo che fallisce deve dire cosa ha visto, non solo che è rosso.
  const testoRegistrate = await page.getByText(/note registrate/).first()
    .innerText().catch(() => '(nessun contatore a schermo)');
  passo('la calibrazione registra tutti i colpi', /^8 /.test(testoRegistrate), testoRegistrate);

  const nonAbbastanza = await page.getByText(/abbastanza note/).first().isVisible().catch(() => false);
  passo('la calibrazione produce una misura valida', !nonAbbastanza);
  passo('la misura si puo salvare', await visibile(page.getByRole('button', { name: 'Salva' })));

  // ---- 11. Verifica del collegamento MIDI --------------------------------
  // Qui non c'e' nessuno strumento collegato: ci si aspetta che l'app lo
  // dica chiaramente e spieghi cosa controllare, invece di restare muta.
  await page.getByRole('button', { name: 'Annulla' }).first().click({ delay: 60 });
  await page.waitForTimeout(1000);
  await toccaVisibile('Collega il pianoforte');
  await page.waitForTimeout(1500);
  passo('la verifica del collegamento si apre', await visibile(page.getByText('Prova: suona qualche nota')));
  passo('senza strumento lo dice invece di restare muta', await visibile(page.getByText('Non collegato')));
  passo('spiega cosa controllare', await visibile(page.getByText(/USB TO HOST/)));
  passo('non propone di usare un ingresso che non funziona',
    !(await visibile(page.getByRole('button', { name: /Usa il pianoforte/ }))));
  // L'aiuto dice "poi tocca Riprova": il pulsante deve esistere.
  passo('offre di riprovare dopo aver collegato il cavo',
    await visibile(page.getByRole('button', { name: 'Riprova' })));

  // ---- 12. Importazione da MIDI, con revisione ---------------------------
  // Si riparte dalla Home: la schermata di importazione si raggiunge da li'.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  await toccaVisibile('Aggiungi un brano da un file');
  await page.waitForTimeout(900);
  passo('la schermata di importazione si apre', await visibile(page.getByText('COSA POSSO IMPORTARE')));
  passo('dichiara di non saper leggere un audio',
    await visibile(page.getByText(/MP3, registrazioni, video o link/)));

  await scegliFile('prova-importazione.mid');
  passo('il file MIDI viene letto davvero',
    await visibile(page.getByText('Controlla il brano prima di importarlo')));
  passo('elenca le tracce trovate', await visibile(page.getByText(/Piano Right/)));
  passo('conta le note trovate', await visibile(page.getByText(/10 note ·/)));
  passo('mostra l anteprima delle prime battute',
    await visibile(page.getByLabel('Anteprima del brano')));
  passo('riepiloga cosa importera', await visibile(page.getByText('COSA IMPORTERÒ')));

  // Escludere una traccia deve cambiare il riepilogo, non solo l'aspetto.
  const destraPrima = await valoreRiga('Mano destra');
  await toccaVisibile('Escludi');
  await page.waitForTimeout(500);
  const destraDopo = await valoreRiga('Mano destra');
  passo('escludere una traccia cambia il riepilogo',
    destraPrima !== destraDopo && /^0 /.test(destraDopo ?? ''), `${destraPrima} -> ${destraDopo}`);

  await toccaVisibile('Destra');
  await page.waitForTimeout(500);
  passo('rimetterla cambia di nuovo il riepilogo', (await valoreRiga('Mano destra')) === destraPrima);

  // Con una traccia a due mani compare la soglia di divisione.
  await toccaVisibile('Due mani');
  await page.waitForTimeout(500);
  passo('su due mani compare la soglia di divisione',
    await visibile(page.getByText(/Divisione suggerita:/)));
  const sogliaPrima = await page.getByText(/Da .+ in su suona la destra/).first().innerText();
  await toccaVisibile('+ semitono');
  await page.waitForTimeout(400);
  const sogliaDopo = await page.getByText(/Da .+ in su suona la destra/).first().innerText();
  passo('la soglia si puo spostare di un semitono', sogliaPrima !== sogliaDopo,
    `${sogliaPrima} -> ${sogliaDopo}`);
  await toccaVisibile('Destra');
  await page.waitForTimeout(400);

  await toccaVisibile('Importa in Maestro');
  await page.waitForTimeout(1500);
  passo('il brano entra nella libreria', await visibile(page.getByText(/nella tua libreria/)));
  passo('dice come lo ha preparato', await visibile(page.getByText(/note in \d+ sezion/)));

  await toccaVisibile('Apri il brano');
  await page.waitForTimeout(1800);
  passo('la scheda del brano importato si apre', await visibile(page.getByText('Come vuoi suonare')));
  passo('il brano importato si puo esportare', await visibile(page.getByText('Esporta brano')));

  await page.getByRole('button', { name: 'Inizia' }).first().click({ delay: 60 });
  await page.waitForTimeout(2200);
  passo('il brano importato si puo suonare', await visibile(page.getByLabel('DO4')));
  passo('lo spartito mostra il brano importato', await visibile(page.getByLabel('Pentagramma')));

  await page.getByRole('button', { name: 'Esci' }).first().click({ delay: 60 });
  await page.waitForTimeout(1500);

  // Il brano deve sopravvivere a un riavvio: e' salvato sul dispositivo.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  passo('il brano importato resta dopo il riavvio',
    await visibile(page.getByText('I miei brani')) &&
    await visibile(page.getByText('prova importazione').first()));

  // ---- 13. Importazione da MusicXML --------------------------------------
  await toccaVisibile('Aggiungi un brano da un file');
  await page.waitForTimeout(900);
  await scegliFile('prova-importazione.musicxml');
  passo('il MusicXML viene letto',
    await visibile(page.getByText('Controlla il brano prima di importarlo')));
  passo('dal MusicXML arriva il titolo scritto nel file',
    (await page.getByLabel('Titolo').first().inputValue()) === 'Prova MusicXML');
  passo('dal MusicXML arriva anche l autore',
    (await page.getByLabel('Autore').first().inputValue()) === 'Maestro Originals');
  passo('riconosce la tonalita dichiarata nel file',
    await visibile(page.getByText(/· G ·|· G$/)));
  passo('le mani sono gia scritte nel file',
    await visibile(page.getByText('Le mani sono già scritte nel file')));
  passo('conserva le diteggiature originali',
    await visibile(page.getByText('Diteggiature dal file')));
  // Senza aprire i ritornelli l'allievo riceverebbe meta' del brano
  // che ha davanti sulla carta.
  passo('apre i ritornelli invece di importare meta brano',
    await visibile(page.getByText(/2 battute scritte diventano 4/)));

  await toccaVisibile('Importa in Maestro');
  await page.waitForTimeout(1500);
  await toccaVisibile('Apri il brano');
  await page.waitForTimeout(1800);
  passo('la scheda del brano MusicXML si apre', await visibile(page.getByText('Come vuoi suonare')));
  await page.getByRole('button', { name: 'Inizia' }).first().click({ delay: 60 });
  await page.waitForTimeout(2200);
  passo('il brano MusicXML si suona', await visibile(page.getByLabel('Pentagramma')));
  // La diteggiatura del file deve arrivare fino ai tasti.
  const scritteXml = await page.locator('svg text').allTextContents();
  passo('la diteggiatura del file arriva sui tasti',
    scritteXml.some((t) => /^[1-5]$/.test(t.trim())), scritteXml.filter((t) => t.trim()).slice(0, 3).join(' '));
  await page.getByRole('button', { name: 'Esci' }).first().click({ delay: 60 });
  await page.waitForTimeout(1200);

  // ---- 14. Importazione da MXL (MusicXML compresso) ----------------------
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await toccaVisibile('Aggiungi un brano da un file');
  await page.waitForTimeout(900);
  await scegliFile('prova-importazione.mxl');
  passo('l archivio .mxl viene estratto e letto',
    await visibile(page.getByText('MusicXML compresso')));
  await toccaVisibile('Importa in Maestro');
  await page.waitForTimeout(1500);
  await toccaVisibile('Apri il brano');
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Inizia' }).first().click({ delay: 60 });
  await page.waitForTimeout(2200);
  passo('il brano estratto dall archivio si suona', await visibile(page.getByLabel('DO4')));
  await page.getByRole('button', { name: 'Esci' }).first().click({ delay: 60 });
  await page.waitForTimeout(1200);

  // ---- 15. Backup: esporta, perdi i dati, ripristina ---------------------
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await toccaVisibile('Backup e trasferimento');
  await page.waitForTimeout(900);
  passo('la schermata di backup si apre', await visibile(page.getByText('Esporta tutta la libreria')));

  const [scaricato] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    toccaVisibile('Esporta la libreria'),
  ]);
  const percorsoBackup = await scaricato.path();
  passo('il backup viene scaricato',
    Boolean(percorsoBackup) && /\.maestro$/.test(scaricato.suggestedFilename()),
    scaricato.suggestedFilename());

  // Si simula un dispositivo che ha perso i dati locali dei brani.
  await page.evaluate(() => {
    for (const chiave of Object.keys(window.localStorage)) {
      if (chiave.includes('importedSongs')) window.localStorage.removeItem(chiave);
    }
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  passo('dopo la perdita dei dati la libreria e vuota',
    await visibile(page.getByText('Non hai ancora importato niente.')));

  await toccaVisibile('Backup e trasferimento');
  await page.waitForTimeout(900);
  const [selettoreBackup] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    toccaVisibile('Scegli un file di backup'),
  ]);
  await selettoreBackup.setFiles(percorsoBackup);
  await page.waitForTimeout(1500);
  passo('il backup viene ispezionato prima di applicarlo',
    await visibile(page.getByText('COSA CONTIENE IL BACKUP')));
  passo('dichiara data, versione e numero di brani',
    await visibile(page.getByText(/versione 1 · 3 brani/)));

  await toccaVisibile('Ripristina');
  await page.waitForTimeout(1800);
  passo('il ripristino dichiara cosa ha fatto',
    await visibile(page.getByText('Ripristino completato')));

  // Si riapre l'app da capo: il ripristino deve essere finito su disco,
  // non solo nello stato in memoria.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  const titoliRipristinati = await page.getByText(/Prova MusicXML|prova importazione/).allTextContents();
  passo('i brani sono tornati dopo il ripristino', titoliRipristinati.length >= 2,
    `${titoliRipristinati.length} titoli ritrovati`);

  // ---- 16. Duplicati: mai sovrascritti in silenzio -----------------------
  await toccaVisibile('Backup e trasferimento');
  await page.waitForTimeout(900);
  const [selettoreBis] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    toccaVisibile('Scegli un file di backup'),
  ]);
  await selettoreBis.setFiles(percorsoBackup);
  await page.waitForTimeout(1500);
  passo('riconosce i brani gia presenti',
    await visibile(page.getByText(/GIÀ NELLA TUA LIBRERIA/)));
  passo('offre le tre scelte sui duplicati',
    await visibile(page.getByText('Mantieni esistente')) &&
    await visibile(page.getByText('Importa come copia')) &&
    await visibile(page.getByText('Sostituisci', { exact: true })));

  await toccaVisibile('Importa come copia');
  await page.waitForTimeout(400);
  await toccaVisibile('Ripristina');
  await page.waitForTimeout(1800);
  passo('importare come copia non sovrascrive niente',
    await visibile(page.getByText(/3 come copia/)));
} catch (error) {
  passo('esecuzione senza eccezioni', false, String(error).split('\n')[0]);
}

await browser.close();
server.close();

const falliti = passi.filter((p) => !p.ok);
// Le richieste mancanti a favicon e manifest non dicono nulla sul prodotto.
const erroriVeri = erroriJs.filter((e) => !/favicon|manifest|404/i.test(e));

console.log(`\nPassi superati: ${passi.length - falliti.length}/${passi.length}`);
if (falliti.length) console.log(`Falliti: ${falliti.map((f) => f.nome).join('; ')}`);
if (erroriVeri.length) console.log(`Errori JavaScript:\n${erroriVeri.slice(0, 5).join('\n')}`);

process.exit(falliti.length === 0 && erroriVeri.length === 0 ? 0 : 1);
