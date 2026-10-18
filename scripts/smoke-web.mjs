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
import { extname, join } from 'path';
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

  // Otto battiti a 80 bpm piu' quattro di preparazione: si batte a tempo
  // sulla tastiera a schermo e si controlla che la misura esca.
  await page.getByRole('button', { name: 'Avvia' }).first().click({ delay: 60 });
  const intervallo = 60_000 / 80;
  const hold = 50;
  const tasto = await page.getByLabel('DO4').first().boundingBox();
  if (!tasto) throw new Error('tastiera di calibrazione non trovata');
  const centro = { x: tasto.x + tasto.width / 2, y: tasto.y + tasto.height / 2 };

  await page.waitForTimeout(intervallo * 4);
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(centro.x, centro.y);
    await page.mouse.down();
    await page.waitForTimeout(hold);
    await page.mouse.up();
    await page.waitForTimeout(intervallo - hold);
  }
  await page.waitForTimeout(1300);

  // Il controllo deve distinguere una misura vera da uno stato di
  // fallimento: "0 ms" accompagnato da "non ho registrato abbastanza
  // note" e' un fallimento, e un test che lo accetta non serve a nulla.
  const registrate = await page.getByText(/8 note registrate/).first().isVisible().catch(() => false);
  passo('la calibrazione registra tutti i colpi', registrate);

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
