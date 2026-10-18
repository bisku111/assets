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
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

const erroriJs = [];
page.on('pageerror', (e) => erroriJs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') erroriJs.push(`console: ${m.text()}`); });

const passi = [];
const passo = (nome, ok, extra = '') => {
  passi.push({ nome, ok });
  console.log(`${ok ? '  OK ' : '  NO '} ${nome}${extra ? ` — ${extra}` : ''}`);
};

/**
 * Clicca l'elemento con quell'etichetta che e' davvero in primo piano.
 *
 * Serve perche' il navigatore a schede tiene montate anche le schermate
 * non visibili: piu' elementi hanno la stessa etichetta e solo uno
 * riceve il tocco.
 *
 * Il ritardo non e' un espediente: un tocco reale dura decine di
 * millisecondi, e con 0 ms il sistema di gesture di React Native Web non
 * fa in tempo ad assegnare il responder.
 */
async function toccaVisibile(etichetta, { delay = 80 } = {}) {
  const tutti = page.getByLabel(etichetta);
  const quanti = await tutti.count();
  for (let i = 0; i < quanti; i++) {
    const elemento = tutti.nth(i);
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
      await elemento.click({ delay });
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
  passo('la schermata di benvenuto compare', await visibile(page.getByText('Impara il pianoforte')));

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

  // ---- 9. Risultato e maestro -----------------------------------------------
  await page.getByRole('button', { name: 'Esci' }).first().click({ delay: 60 });
  await page.waitForTimeout(1800);
  passo('a fine esercizio compare il punteggio', await visibile(page.getByText('/100')));
  passo('il risultato separa precisione, ritmo e tempo', await visibile(page.getByText('PRECISIONE')));

  const bottoni = await page.getByRole('button').allInnerTexts();
  const consiglio = bottoni.some((t) =>
    /Rallenta|Prova all|Ripeti|Sezione successiva|Due mani|Concludi|Solo mano/.test(t));
  passo('il maestro propone un passo successivo', consiglio, bottoni.slice(0, 3).join(' | '));
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
