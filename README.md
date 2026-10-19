# 🎹 Maestro — impara il pianoforte con le canzoni italiane

App mobile (iOS · Android · web) che insegna il pianoforte **ascoltando quello
che suoni** e correggendoti in tempo reale, come farebbe un insegnante seduto
accanto a te.

> Vedi [`ARCHITECTURE.md`](./ARCHITECTURE.md) per l'analisi tecnica e la sezione
> [Cosa funziona davvero](#cosa-funziona-davvero) per l'elenco onesto di ciò che
> è implementato e ciò che richiede ancora lavoro nativo.

---

## Indice

- [Requisiti](#requisiti)
- [Installazione](#installazione)
- [Configurazione](#configurazione)
- [Database Supabase](#database-supabase)
- [Sviluppo locale](#sviluppo-locale)
- [Test](#test)
- [Build iOS / Android](#build-ios--android)
- [Cosa funziona davvero](#cosa-funziona-davvero)
- [Contenuti e copyright](#contenuti-e-copyright)

---

## Requisiti

| Strumento | Versione |
|---|---|
| Node.js | ≥ 20 (sviluppato su 22) |
| npm | ≥ 10 |
| Expo CLI | incluso nel progetto (`npx expo`) |
| Xcode | 16+ — solo per build iOS |
| Android Studio | SDK 35+ — solo per build Android |

Per provare l'app **non serve** né Xcode né Android Studio: `npm run web` la apre
nel browser, dove funzionano anche MIDI e microfono.

### Collegare un pianoforte digitale

Sul computer il percorso migliore è **browser + MIDI**: è preciso e non richiede
alcun modulo nativo.

| Browser | Pianoforte via MIDI | Microfono |
|---|---|---|
| Chrome, Edge | ✅ | ✅ |
| Safari | ❌ non supporta la Web MIDI API | ✅ |

Collega lo strumento alla presa **USB di tipo B** (quella quadrata, marcata
*USB TO HOST*) con un cavo verso il computer, oppure via Bluetooth MIDI. I
pianoforti digitali sono quasi sempre *class-compliant*: nessun driver da
installare.

Poi, in *Profilo*:

1. **Collega il pianoforte** — verifica che l'app veda lo strumento, ne mostra
   il nome e conta le note che arrivano mentre suoni. Se non lo vede, dice cosa
   controllare invece di restare muta.
2. **Calibra il ritardo** — consigliato con il Bluetooth, dove il ritardo arriva
   a un decimo di secondo; via USB di solito risponderà "il tuo strumento
   risponde subito".

---

## Installazione

```bash
git clone <repo>
cd maestro-piano
npm install
cp .env.example .env       # facoltativo: senza .env l'app parte in modalità locale
```

---

## Configurazione

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | no | URL del progetto Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | no | Chiave pubblica (anon) del progetto |

**Senza queste variabili l'app funziona lo stesso**, in *modalità locale*:
profilo sul dispositivo, catalogo demo incluso nel bundle, progressi salvati
offline. È voluto: l'MVP deve essere provabile senza backend, e l'app deve
restare usabile quando la rete non c'è.

⚠️ Non inserire mai la `service_role key` in una variabile `EXPO_PUBLIC_*`:
finirebbe dentro il bundle dell'app, quindi in mano a chiunque.

---

## Database Supabase

Le migrazioni SQL sono in [`supabase/migrations/`](./supabase/migrations), in
ordine di applicazione: schema, indici, **Row Level Security** e funzioni di
autorizzazione.

```bash
npm install -g supabase
supabase link --project-ref <project-ref>
supabase db push
```

Ciclo di sviluppo interamente locale:

```bash
supabase start      # Postgres + Auth + Storage in Docker
supabase db reset   # applica le migrazioni
```

Verifica della sicurezza, senza Docker e senza progetto Supabase:

```bash
npm run test:db     # avvia un Postgres usa-e-getta, applica tutto, esegue i test RLS
```

Garanzie dello schema:
- RLS **attiva su tutte le tabelle**, con un test che fallisce se ne compare una senza;
- nessuna policy permissiva `using (true)` sui dati personali, verificato da un test;
- l'accesso ai brani premium è deciso da una funzione SQL (`public.can_access_song`),
  quindi **non è aggirabile modificando il client**;
- un brano con licenza scaduta o non pubblicato **non esce dal database**;
- abbonamenti e pagamenti sono in sola lettura per i client: solo il `service_role`
  (webhook dello store) può scriverli.

---

## Sviluppo locale

```bash
npm run web        # browser — MIDI e microfono reali (Chrome/Edge)
npm run ios        # simulatore iOS       (richiede macOS + Xcode)
npm run android    # emulatore Android    (richiede Android Studio)
```

Consiglio: sviluppa la logica in `src/core/` con `npm run test:watch`. Il core
non dipende da React né da React Native, quindi il ciclo di feedback è
immediato — millisecondi, non ricompilazioni.

---

## Test

```bash
npm run typecheck   # tsc --noEmit (strict)
npm test            # Jest: progetto "core" (node) + progetto "app" (componenti)
npm run test:db     # migrazioni + test RLS su un Postgres usa-e-getta
npm run test:e2e    # build web + percorso completo dell'app in un browser vero
npm run verify      # typecheck + test
npm run verify:all  # tutto quanto sopra
npm run lint        # ESLint, configurazione versionata nel repository
```

Tre livelli di verifica, perche' rispondono a domande diverse:

1. **Unitari** (`npm test`) — la logica e' corretta? Coprono teoria musicale,
   notazione e validazione dei brani, trasporto, matching (accordi, note extra,
   mancate, pedale, latenza), punteggio, coach, progressione, pitch detection
   YIN su segnali sintetici, tracciamento note, parser MIDI, gamification,
   archivio locale e la regola di dipendenza del core.
2. **Database** (`npm run test:db`) — le policy fanno quello che dicono?
   Applica davvero le migrazioni su Postgres e conta le righe visibili per
   ruolo. Verificato che la suite fallisce se una policy viene indebolita.
3. **End-to-end** (`npm run test:e2e`) — un utente riesce davvero a usarla?
   Apre l'app nel browser e percorre primo avvio, onboarding, catalogo, scheda
   brano, tutorial, nota giusta, nota sbagliata, punteggio e consiglio del
   maestro. E' il test che ha trovato, fra gli altri, un difetto per cui in
   modalita' IMPARA il messaggio "Prevista: MI — Suonata: RE" veniva coperto
   dall'invito ad attendere.

Il progetto `core` copre: teoria musicale, notazione e validazione dei brani,
trasporto, matching (accordi, note extra, mancate, pedale, latenza), punteggio,
coach, progressione, pitch detection YIN su segnali sintetici, tracciamento
note, parser MIDI, gamification, archivio locale e la regola di dipendenza del
core.

---

## Build iOS / Android

Le funzioni MIDI e microfono native richiedono un **development build** (non
Expo Go), perché usano un modulo nativo.

```bash
npm install -g eas-cli
eas build --profile development --platform ios      # o android
eas build --profile production  --platform all
npx expo prebuild                                   # genera ios/ e android/ in locale
```

---

## Cosa funziona davvero

Elenco onesto. Niente è simulato con dati finti.

| Area | Stato |
|---|---|
| Motore temporale, matching, punteggio, coach | ✅ implementati e testati |
| Pitch detection (YIN) e parser MIDI | ✅ implementati e testati |
| Tastiera a schermo come sorgente di input reale | ✅ |
| Pentagramma scorrevole (chiavi, armatura, alterazioni, tagli addizionali, gambi, accordi) | ✅ calcolato nel core e verificato da test, non un'immagine. Simboli disegnati, non glifi di un font |
| Teste di nota colorate per mano, con il nome scritto sotto il rigo | ✅ |
| Nome della nota su tutti i tasti, neri compresi | ✅ scritto in verticale sui neri, dove per largo non ci starebbe |
| Numero del dito sul tasto da premere, nel colore della mano | ✅ la diteggiatura è scritta nel contenuto, nota per nota |
| Modalità IMPARA: spartito, note e tempo restano fermi finché non si suona la nota giusta | ✅ |
| MIDI e microfono su **web** | ✅ reali (Web MIDI / Web Audio) |
| MIDI e microfono su **iOS/Android** | ⛔ richiedono il modulo nativo `piano-io` (ARCHITECTURE.md §7.3). L'app lo dichiara all'utente e propone la tastiera a schermo |
| Percorso didattico in 6 lezioni, a sblocco progressivo | ✅ |
| Travature fra le crome sul pentagramma | ⛔ non implementate: le crome portano la codetta singola, che è scrittura corretta ma meno compatta |
| Importare un brano da un file **MIDI** (.mid) | ✅ tracce di pianoforte riconosciute, mani separate, sezioni automatiche, brano suonabile come gli altri |
| Importare da **MusicXML** (.musicxml, .xml) | ✅ conserva titolo, autore, tonalità, metro, battute, pentagrammi, mani, accordi, legature di valore e **diteggiature originali** |
| **Ritornelli** `\|: :\|` e volte (1ª, 2ª) | ✅ aperti davvero: le battute ripetute si suonano due volte, non una. Da capo e dal segno non sono aperti, e viene dichiarato |
| Importare da **MusicXML compresso** (.mxl) | ✅ archivio ZIP letto con protezione da percorsi ostili e bombe di decompressione |
| Schermata di revisione prima di importare | ✅ tracce, mani, soglia di divisione, allineamento, anteprima delle prime battute e riepilogo di cosa entrerà |
| **Backup** della libreria personale (.maestro) | ✅ offline, con progressi collegati; duplicati mai sovrascritti in silenzio |
| Importare da **MP3, registrazione, video o link** | ⛔ non implementato e non previsto a bordo: serve separazione delle sorgenti e trascrizione polifonica. L'app riconosce i file audio dai byte e lo dichiara invece di provarci |
| Pagamenti | ⛔ non implementati. Schema e gating pronti, manca l'SDK di billing |
| Accompagnamento audio ("suona con la base") | ⛔ non implementato: servono registrazioni, che il repository non contiene. Le quattro modalità di studio ci sono |
| Calibrazione guidata della latenza | ✅ metronomo + otto battiti; click udibile su web, impulso tattile su mobile |
| Verifica del collegamento MIDI (nome strumento, note ricevute, diagnostica) | ✅ |

---

## Contenuti e copyright

Il repository contiene **esclusivamente**:

- **brani originali** scritti per questo progetto;
- **brani di pubblico dominio** (autori deceduti da oltre settant'anni, o
  melodie tradizionali anonime);
- esercizi didattici, che non sono materiale tutelabile.

Non sono inclusi spartiti, MIDI, registrazioni, testi o copertine di brani
protetti. Gli artisti italiani contemporanei compaiono in catalogo come **voci
in attesa di licenza** (`is_placeholder`), senza alcun contenuto musicale
associato: servono a dimostrare che l'architettura è pronta a ricevere
repertorio ufficiale. Un test fallisce se qualcuno aggiunge al bundle un brano
che non sia originale o di pubblico dominio.

Ogni brano nel database porta con sé `license_status`, `license_owner`,
`license_type`, `territory`, `start_date`, `end_date`. Un brano la cui licenza
non è valida **non viene servito dal database**: il filtro è in SQL, non nel
client.
