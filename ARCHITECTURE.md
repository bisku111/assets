# ARCHITECTURE.md — Maestro (app pianoforte interattiva)

> Documento di architettura tecnica. Scritto **prima** dell'implementazione
> (FASE 1–2) e aggiornato al termine di ogni fase.

---

## 1. Analisi tecnica preliminare

### 1.1 Il problema reale

Un'app "che mostra le note che scendono" è un problema di UI. Un *personal piano
coach* è invece un problema di **elaborazione di segnale in tempo reale +
allineamento temporale + didattica adattiva**. Il rischio principale del progetto
non è la grafica: sono i quattro punti seguenti.

| # | Rischio | Impatto | Mitigazione adottata |
|---|---------|---------|----------------------|
| R1 | Nessuna API cross-platform standard espone il **PCM grezzo del microfono** in React Native | Senza PCM non esiste pitch detection | DSP scritto in TS puro e testato offline; cattura audio isolata dietro una *porta*, con implementazione Web reale e modulo nativo da aggiungere (§7) |
| R2 | **MIDI** non è disponibile in Expo Go né in React Native core | La modalità prioritaria non funziona | Parser MIDI in TS puro (reale e testato) + porta `NoteInputPort`; adapter Web MIDI reale; adapter nativo che dichiara `unavailable` finché il modulo non è compilato |
| R3 | **Jitter del timer JS**: `setInterval` accumula errore, il brano "scivola" | Il feedback ritmico diventa insensato | `Transport` senza accumulo: la posizione è sempre `(now - startedAt) * rate`, mai `pos += dt` |
| R4 | **Latenza** di ingresso (microfono, MIDI Bluetooth) da 5 ms a 150 ms | Note giuste giudicate come ritardate | Timestamp presi **alla sorgente**, non al render; offset di calibrazione persistente per utente e dispositivo |

### 1.2 Conseguenza architetturale

Tutta la logica che conta (clock, matching, scoring, coaching, DSP, parsing MIDI)
è **TypeScript puro, senza import di React o React Native**, in `src/core/`.
È eseguibile e testabile in Node — quindi verificabile davvero, non "verificabile
perché compila". Le piattaforme entrano solo tramite *adapter* (§4).
La regola è imposta da un test, non da una raccomandazione.

### 1.3 Cosa è realmente funzionante e cosa no

Regola imposta dal committente: *mai fingere che una funzione sia reale*.

| Funzione | Stato | Dove |
|----------|-------|------|
| Motore tempo/scheduling | ✅ reale, testato | `core/engine` |
| Matching note e punteggio | ✅ reale, testato | `core/engine`, `core/scoring` |
| Coach adattivo (decisioni + frasi) | ✅ reale, testato | `core/coach` |
| Parsing MIDI (note, velocity, sustain CC64, running status) | ✅ reale, testato | `core/midi` |
| Pitch detection YIN + tracciamento note | ✅ reale, testato su segnali sintetici | `core/dsp` |
| Ingresso MIDI su **web** (Web MIDI API) | ✅ reale | `adapters/midi/webMidi.ts` |
| Ingresso microfono su **web** (Web Audio) | ✅ reale | `adapters/audio/webAudio.ts` |
| Tastiera virtuale come sorgente di input | ✅ reale | `adapters/midi/virtualKeyboard.ts` |
| Ingresso MIDI/microfono su **iOS/Android** | ⛔ richiede modulo nativo (§7.3) | l'adapter riporta `unavailable` con motivo leggibile; **nessun dato finto** |
| Catalogo, progressi, statistiche | ✅ reali (locale + Supabase) | `adapters/storage`, `adapters/supabase` |
| Percorso didattico (6 lezioni a sblocco progressivo) | ✅ reale, testato | `core/learning/path`, `content/lessons` |
| Pagamenti | ⛔ non implementati per scelta | schema DB e gating pronti (§9) |
| Accompagnamento audio | ⛔ servono registrazioni, non incluse nel repository | le quattro modalità di studio ci sono |

La tastiera virtuale non è un ripiego cosmetico: implementa la stessa
`NoteInputPort` di MIDI e microfono, quindi su mobile l'esperienza completa
(tutorial → feedback → punteggio → progressi) è **realmente utilizzabile oggi**.

---

## 2. Stack

| Ambito | Scelta | Perché questa e non un'altra |
|--------|--------|------------------------------|
| App | **Expo SDK 57 + React Native 0.86 + TypeScript strict** | Un solo codebase iOS/Android/web; con *prebuild* e *dev client* i moduli nativi custom (audio/MIDI) sono ammessi: non c'è il tetto di Expo Go |
| Navigazione | **expo-router** (file-based) | Deep link gratuiti (`/song/:id`), necessari per campagne e ripresa sessione |
| Stato | **React + store minimale** con selettori | Il tutorial aggiorna a 60 fps: serve uno stato che non ri-renderizzi l'albero |
| Animazioni | **react-native-reanimated** | Le note scorrono sul thread UI: nessun frame perso quando JS è occupato dal matching |
| Backend | **Supabase** (Postgres + Auth + RLS + Storage) | Richiesto; RLS dà autorizzazione *nel database*, non nel client |
| Persistenza locale | **AsyncStorage** + catalogo demo **nel bundle** | L'app deve aprirsi e far esercitare anche offline |
| Test | **Jest**: progetto `core` (node) e progetto `app` (componenti) | |

### Perché non alternative
- **Flutter**: ottimo audio, ma serve estendibilità con moduli nativi ed
  ecosistema JS/Supabase già pronto; nessun vantaggio decisivo.
- **Nativo puro ×2**: latenza migliore, costo doppio. Non giustificato per un MVP.
- **Tone.js / WebAudio ovunque**: non esiste su RN senza WebView; una WebView
  aggiunge 30–60 ms di latenza. Escluso.

---

## 3. Struttura delle cartelle

```
.
├── src/
│   ├── app/                    # expo-router: SOLO routing e composizione
│   │   ├── (auth)/             # accesso e registrazione
│   │   ├── (onboarding)/       # tre domande iniziali
│   │   ├── (tabs)/             # home, catalogo, progressi, profilo
│   │   ├── song/[id].tsx       # scheda brano
│   │   └── play/[id].tsx       # tutorial interattivo (a schermo pieno)
│   ├── core/                   # ⬛ TS PURO — niente React, niente RN
│   │   ├── music/              # note, frequenze, nomi italiani, geometria tastiera
│   │   ├── song/               # modello brano, notazione compatta, validazione
│   │   ├── engine/             # Transport, NoteMatcher, PracticeSession
│   │   ├── scoring/            # precisione, ritmo, tempo, punteggio 0–100
│   │   ├── coach/              # decisioni didattiche + frasi in italiano
│   │   ├── learning/           # progressione 50→100%, avanzamento a sezioni
│   │   ├── notation/           # pentagramma, armature, diteggiatura
│   │   ├── import/             # lettura file MIDI, conversione in brano
│   │   ├── midi/               # parser byte MIDI, gestione pedale
│   │   ├── dsp/                # YIN, tracciamento note, calibrazione latenza
│   │   ├── gamification/       # XP, livelli, striscia, medaglie
│   │   └── ports/              # interfacce: NoteInputPort, ClockPort, dati
│   ├── adapters/               # ⬛ implementazioni delle porte
│   │   ├── midi/               # webMidi | nativeMidi | virtualKeyboard
│   │   ├── audio/              # webAudio | nativeAudio
│   │   ├── files/              # selettore di file: web | nativo
│   │   ├── storage/            # AsyncStorage, repository locale, brani importati
│   │   └── supabase/           # client, repository remoto
│   ├── features/               # UI per dominio (home, catalogo, player…)
│   ├── ui/                     # design system: tema, Text, Button, tastiera
│   ├── state/                  # store applicativo
│   └── content/                # catalogo DEMO (originali / pubblico dominio)
├── supabase/
│   ├── migrations/             # SQL versionato (schema + RLS + funzioni)
│   └── tests/                  # suite di test RLS
├── scripts/test-db.sh
├── ARCHITECTURE.md
└── README.md
```

**Regola di dipendenza (verificata da `src/core/architecture.test.ts`):**
`src/core/**` non può importare `react`, `react-native`, `expo*`, `@supabase/*`
né `src/adapters/**`, e non può usare `document`/`window`/`localStorage`.
La freccia va sempre dall'esterno verso il centro.

---

## 4. Porte e adapter

```ts
export interface NoteInputPort {
  readonly id: 'midi' | 'microphone' | 'virtual-keyboard';
  readonly polyphonic: boolean;      // il microfono monofonico lo dichiara
  getStatus(): InputStatus;          // ready | denied | unavailable | error
  start(): Promise<InputStatus>;
  stop(): void;
  subscribe(listener: (e: PlayedNoteEvent) => void): Unsubscribe;
}

export interface PlayedNoteEvent {
  type: 'note-on' | 'note-off';
  midi: number;        // 21..108
  velocity: number;    // 0..1
  timestamp: number;   // ms, preso ALLA SORGENTE
  confidence: number;  // 1 per MIDI, 0..1 per microfono
  source: InputSourceId;
}
```

Tutto il resto dell'app conosce **solo** questa interfaccia. Aggiungere Bluetooth
MIDI, USB MIDI o un nuovo algoritmo di pitch detection significa aggiungere un
file in `src/adapters/`, senza toccare il motore.

| Adapter | Piattaforma | Stato |
|---|---|---|
| `VirtualKeyboardInput` | tutte | reale |
| `WebMidiInput` | web (Chrome/Edge) | reale |
| `WebAudioMicrophoneInput` | web | reale (usa il YIN del core) |
| `NativeMidiInput` | iOS/Android | porta pronta, modulo nativo da compilare (§7.3) |
| `NativeMicrophoneInput` | iOS/Android | idem |

---

## 5. Motore audio e temporale

```
Transport ──posizione(ms)──▶ PracticeSession ──▶ NoteMatcher ──▶ Scoring ──▶ Coach
    ▲                                                ▲
 monotonic                                   PlayedNoteEvent
 (performance.now)                          (da NoteInputPort)
```

- **Transport**: `posizione = ancoraggio + (adesso − istanteAncoraggio) × rate`.
  Nessun accumulo ⇒ nessuna deriva. `rate` implementa il rallentamento (0.25–1.0).
  È "a lettura": non ha timer propri, è chi disegna il frame a chiedere che ora è.
- **NoteMatcher**: per ogni `note-on` cerca la nota attesa più vicina non ancora
  consumata entro `±tolleranza`. Giudica **l'attacco, non il rilascio**: è il
  motivo per cui il pedale di risonanza non falsa il punteggio. Gestisce accordi,
  note extra, note mancanti e la latenza (`inputLatencyMs`).
  Tolleranze: IMPARA 400 ms · ESERCITATI 220 ms · SUONA 150 ms · PERFORMANCE 90 ms.
- **Calibrazione latenza**: l'utente suona su un metronomo (quattro battiti di
  preparazione, otto misurati); si prende la **mediana** degli scarti, robusta
  agli outlier, non la media. Ogni colpo è associato al battito *più vicino*,
  non al successivo in ordine: così un colpo saltato non sfasa tutti gli altri.
  La misura comprende sia il ritardo tecnico sia la tendenza personale di chi
  suona — il ritardo del tasto non è osservabile senza un riferimento umano — e
  **la schermata lo dichiara** invece di spacciare il numero per una misura
  puramente tecnica, offrendo la correzione manuale.
  Il riferimento del battito è una porta (`MetronomePort`): click udibile con
  Web Audio su web, impulso tattile su mobile, perché il repository non
  contiene file audio.

**Pitch detection (microfono)** — `core/dsp`:
1. gate su RMS (rumore ambientale);
2. **YIN**: funzione di differenza → media cumulativa normalizzata → prima valle
   sotto soglia → interpolazione parabolica ⇒ f0 in Hz;
3. f0 → MIDI (`69 + 12·log2(f/440)`), scarto in cent, `confidence = 1 − d'(τ)`;
4. tracciamento: conferma su più blocchi, chiarezza minima, scarto di
   intonazione, estensione del brano.

Limiti **dichiarati**: YIN è **monofonico** (gli accordi al microfono non sono
riconoscibili in modo affidabile) e il riattacco della stessa nota si rileva solo
dal balzo di energia. `MicrophoneInput` espone `polyphonic: false` e l'app
consiglia il MIDI a chi vuole studiare gli accordi.

---

## 6. Modello dati del brano

Formato versionato (`schemaVersion`), validato a runtime da `validateSong()`:
un file di contenuto malformato non deve mai far crashare il player durante una
lezione, viene scartato al caricamento.

Le difficoltà (`beginner`/`easy`/`intermediate`/`advanced`/`complete`) sono
**arrangiamenti distinti** dello stesso brano, non filtri: cambiano le note.
Ogni arrangiamento ha la **propria durata**, altrimenti la barra di avanzamento
del livello Principiante seguirebbe la lunghezza del livello Completo.

I contenuti si scrivono in **notazione compatta** invece che in JSON a mano:

```
LA4:2@1            nota LA4, due movimenti, pollice
DO4+MI4+SOL4:2     accordo
DO3@5+SOL3@1:1     accordo con un dito diverso per ogni nota
-:2                pausa
LA3:4~             nota tenuta (pedale)
```

La diteggiatura per singola nota non è un vezzo: un accordo di valzer in
mano sinistra si prende col mignolo e col pollice, e scrivere lo stesso
numero su entrambe le note sarebbe un dato falso, non una semplificazione.

Scrivere migliaia di millisecondi a mano produce errori di sincronizzazione che
poi si scaricano sull'utente durante la lezione.

---

## 6bis. Lettura: pentagramma, mani, corsia

La stessa musica si mostra in tre modi contemporaneamente, e tutti e tre
leggono lo stesso istante dal `Transport`: se il motore si ferma ad aspettare
una nota, si fermano insieme. Non ci sono tre orologi.

| Rappresentazione | A cosa serve | Dove sta |
|---|---|---|
| Pentagramma | imparare a leggere la musica scritta | `core/notation/staff.ts` + `ui/StaffView.tsx` |
| Corsia delle note | capire *quando* suonare, senza saper leggere | `ui/NoteHighway.tsx` |
| Numero del dito sul tasto | capire *con quale dito* | `core/notation/fingering.ts` + `ui/FingerHints.tsx` |

**Il calcolo sta nel core, il disegno nella UI.** `staff.ts` non disegna
niente: decide come si scrive una nota (DO# o REb, secondo l'armatura), su
quale riga o spazio cade, se serve un'alterazione o un taglio addizionale, che
valore ritmico ha, da che parte va il gambo e quali teste vanno spostate
perché a distanza di seconda si toccherebbero. Sono tutte decisioni che si
possono sbagliare in silenzio, e un test in Node le verifica una per una —
compreso il DO centrale, che deve finire su un taglio addizionale sotto il
violino e sopra il basso.

**Una sola geometria per tastiera, corsia e mani.** `core/music/keyboard.ts`
dice dove cade ogni tasto, in frazioni di larghezza. La usano i tre
componenti: se ognuno ricalcolasse le posizioni, un dito finirebbe accanto al
tasto che indica, e un aiuto visivo disallineato è peggio di nessun aiuto.

**Tutto quello che si può scrivere, si scrive.** Il nome della nota compare
sul tasto (neri compresi, in verticale perché per largo non ci sta) e sotto
la testa sul pentagramma; le teste portano il colore della loro mano, lo
stesso delle note che scendono. Tre rappresentazioni, un solo codice colore.

**Niente glifi musicali presi dai font.** Chiavi, diesis, bemolli e bequadri
sono disegnati. U+266F e U+1D11E non esistono in tutti i font di sistema, e
un'armatura che sparisce cambia la tonalità del brano agli occhi di chi
legge. L'armatura è stata effettivamente invisibile finché non me ne sono
accorto guardando uno screenshot.

**Le dita sono dati, non disegno.** Ogni nota del catalogo porta la sua
diteggiatura scritta nel contenuto (`DO4:1@3` = DO4, un movimento, dito
medio), e il numero compare sul tasto da premere poco prima che serva.
Quando una nota non ha diteggiatura non compare nulla: non se ne inventa una.

Una prima versione disegnava le due mani intere sopra la tastiera, come fanno
le app di riferimento. È stata tolta dopo la prova sul campo: la sagoma copre
i tasti e distrae dall'unica informazione che deve dare, cioè il numero del
dito. Resta il numero, nel colore della mano, sul tasto giusto.

**Le finestre si misurano in movimenti, non in secondi.** Otto movimenti di
pentagramma e quattro di corsia restano tali anche al 50% di velocità: la
pagina non cambia aspetto mentre si accelera. A secondi fissi, una minima a 50
BPM riempirebbe tutto lo schermo.

**Si disegna solo quello che serve.** Un brano per sola mano destra non ha un
rigo di basso vuoto, e isolando una mano l'altro rigo sparisce: su un portatile
quei cinquanta pixel sono quelli che mancano alla tastiera.

---

## 6ter. Importare un brano dai file dell'utente

### Cosa si sa fare e cosa no

| Sorgente | Stato | Perché |
|---|---|---|
| File MIDI (.mid) | ✅ implementato | Le note sono già scritte nel file: il lavoro è leggerle senza sbagliare i tempi |
| MusicXML | ⛔ non implementato | Porta anche mani e diteggiatura: è il formato giusto da aggiungere dopo. Serve un parser XML, che oggi non è fra le dipendenze |
| MP3, registrazioni, video, link | ⛔ **non risolvibile qui** | Richiede separazione delle sorgenti e trascrizione polifonica: un modello dedicato lato server, non codice a bordo. Dichiarato all'utente nella schermata stessa |

La schermata di importazione dice questo in testa, prima di chiedere un
file. Lasciare che l'utente lo scopra caricando un mp3 sarebbe una
funzione finta.

### Le tre decisioni che il file non contiene

Un file MIDI dice **quali note e quando**. Non dice quale parte è il
pianoforte, quale mano suona cosa, né dove finisce una frase. Sono tre
decisioni prese con criteri dichiarati, tutte modificabili dall'utente:

1. **Quale traccia.** Strumento General MIDI della famiglia pianoforte
   (program 0–7), oppure nome della traccia; il canale 10 è batteria per
   definizione dello standard e viene sempre escluso. Se nessuna traccia
   si dichiara pianoforte si importa comunque quello che c'è, dicendolo.
2. **Quale mano.** Con due tracce vincono i nomi (`Right`/`Left`/
   `Destra`…), altrimenti la traccia più acuta è la destra. Con una
   traccia sola si divide per altezza, e la soglia suggerita è quella
   che separa meglio le note in due gruppi — criterio di Otsu su un
   istogramma di altezze. È un criterio, non una verità: l'utente lo
   sposta di un semitono alla volta.
3. **Dove tagliare le sezioni.** Blocchi di battute intere (8, 4 o 2
   secondo la lunghezza). Servono perché ripetere, rallentare e isolare
   una mano funzionano per sezione.

### Quello che si fa al materiale, e si dichiara

- **Allineamento alla griglia** (semicrome per impostazione predefinita).
  Se il file è la registrazione di un'esecuzione i tempi non sono
  esatti, e senza allineamento lo spartito diventa illeggibile. Cambia
  leggermente il ritmo scritto, quindi è una scelta visibile e
  disattivabile.
- **Silenzio iniziale tolto** fino alla battuta.
- **Note doppie fuse**: lo stesso tasto raddoppiato su due tracce è una
  nota sola per chi suona; tenerle separate farebbe contare un errore a
  ogni ripetizione.
- **Note fuori dagli 88 tasti scartate**, e contate nel resoconto.
- **Nessuna diteggiatura**: nel file non c'è, e inventarla sarebbe un
  dato falso. Sui brani importati i numeri delle dita semplicemente non
  compaiono.
- **Nessun cambio di tempo perso**: i tick diventano millisecondi
  seguendo tutta la mappa dei tempi. Con il solo tempo iniziale, un
  brano che rallenta finirebbe secondi fuori sincrono, e l'allievo si
  sentirebbe dire che sbaglia quando sbaglia il software.

### Dove finiscono

I brani importati hanno licenza `user_import` e **non sono nell'elenco
degli stati servibili**: restano nell'archivio locale del dispositivo,
non vengono caricati da nessuna parte, non entrano nel catalogo. È la
distinzione che tiene in piedi la funzione senza toccare i diritti di
nessuno: un file che l'utente possiede, studiato da lui, sul suo
dispositivo.

Il lettore di file MIDI è provato su byte costruiti a mano (running
status, note spente con intensità zero, SysEx, tracce troncate,
divisione SMPTE, mappa dei tempi): un parser binario non si verifica a
occhio su un file vero, perché quando si rompe non si sa quale byte sia
stato.

---

## 7. Audio, MIDI e moduli nativi

### 7.1 Web (funzionante oggi)
`navigator.requestMIDIAccess()` e `AudioContext` + `MediaStreamSource`.

### 7.2 Mobile — perché serve un modulo nativo
Né `expo-audio` né RN core espongono un flusso PCM a bassa latenza: registrano
su file. Per il coach serve il buffer frame per frame.

### 7.3 Modulo nativo previsto (`modules/piano-io`)
Expo Module locale, API identica alle porte del core:
- **iOS**: `AVAudioEngine` (tap sul nodo input, 44.1 kHz mono) + `CoreMIDI`
  (`MIDIClientCreateWithBlock`, Bluetooth LE compreso).
- **Android**: `AudioRecord` (`VOICE_RECOGNITION`, buffer minimo) +
  `android.media.midi` (`MidiManager`, USB e BLE).
- Espone: `startPcm()`, `onPcmFrame(Float32Array)`, `listMidiDevices()`,
  `onMidiMessage(Uint8Array, timestamp)`.

Finché non è compilato, gli adapter nativi restituiscono
`{ state: 'unavailable', reason: 'native-module-missing' }` e la UI mostra un
messaggio comprensibile con l'alternativa. Nessun mock silenzioso.

---

## 8. Autenticazione, sicurezza, privacy

- **Auth**: Supabase Auth (email+password nell'MVP; OAuth predisposto).
- **RLS attiva su tutte le tabelle**, verificata da un test strutturale.
  Nessuna policy `using (true)` sui dati personali.
- I contenuti sono leggibili solo se la licenza è valida **adesso**; il gating
  premium è la funzione SQL `public.can_access_song()`, quindi **non è
  aggirabile dal client**. Il brano premium resta visibile in catalogo; le sue
  **note** no.
- **Scritture sui contenuti e sugli abbonamenti**: negate a tutti i ruoli
  client; solo `service_role` (import backend, webhook dello store).
- **Privacy microfono**: l'audio è elaborato **solo in memoria sul
  dispositivo**; nessun frame viene inviato o salvato. Consenso esplicito e
  revocabile; stringhe `NSMicrophoneUsageDescription` / `RECORD_AUDIO` motivate.

---

## 9. Monetizzazione

- Tabelle `subscriptions` / `payments`; accesso derivato da
  `public.has_active_subscription()` in SQL.
- Free: brani `is_free`, difficoltà fino a `easy`, modalità IMPARA/ESERCITATI.
  Premium: catalogo completo, tutte le difficoltà, PERFORMANCE, statistiche.
- **Nessun pagamento reale implementato**: manca per scelta l'SDK di billing.
  Il punto di aggancio è uno solo, da collegare a RevenueCat/StoreKit/Play
  Billing con webhook → Edge Function → `subscriptions`.

---

## 10. Deployment e testing

- **Build**: EAS Build (`development` con dev-client per i moduli nativi,
  `preview` interno, `production` per gli store). `expo prebuild` genera
  `ios/` e `android/`, non versionati.
- **Testing**, su tre livelli che rispondono a domande diverse:
  1. `npm test` — la logica è corretta? 258 test sul core e sui componenti.
  2. `npm run test:db` — le policy fanno quello che dicono? Le migrazioni
     vengono applicate davvero su Postgres e si contano le righe visibili per
     ruolo. Verificato che la suite fallisce se una policy viene indebolita.
  3. `npm run test:e2e` — un utente riesce davvero a usarla? L'app viene
     costruita e percorsa in un browser: onboarding, catalogo, tutorial, nota
     giusta, nota sbagliata, punteggio, consiglio del maestro.
  `npm run verify:all` esegue tutti e tre.
- **CI**: GitHub Actions, un job per livello.
