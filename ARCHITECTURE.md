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
│   │   ├── import/             # MIDI, MusicXML, .mxl → modello unico → brano
│   │   │                       #   repeats.ts: apertura dei ritornelli
│   │   ├── backup/             # formato .maestro, duplicati, ripristino
│   │   ├── text/               # decodifica UTF-8 senza dipendenze
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

### L'imbuto: un solo modello musicale

```
file → lettore del formato → ImportDocument → brano → validazione → archivio
```

`core/import/document.ts` è il punto in cui i formati convergono. Un MIDI e un
MusicXML producono **lo stesso oggetto**, e da lì in poi il codice è uno solo:
scelta delle parti, divisione delle mani, allineamento, sezioni, fusione delle
note doppie, costruzione del brano. Senza questo strato ci sarebbero due motori
musicali paralleli da tenere d'accordo, che è il modo più sicuro di farli
divergere.

Il tempo nel modello intermedio è in **tick musicali**, non in millisecondi: è
l'unica unità in cui si possono allineare le note a una griglia e tagliare
sezioni su battute intere. I millisecondi si calcolano alla fine, seguendo
tutta la mappa dei tempi.

### Cosa si sa fare e cosa no

| Sorgente | Stato | Note |
|---|---|---|
| MIDI (.mid) | ✅ | Note, tempi, cambi di tempo, tracce, strumenti |
| MusicXML (.musicxml, .xml) | ✅ | In più: titolo, autore, tonalità, metro, battute, pentagrammi, mani, accordi, pause, alterazioni, legature di valore, **diteggiature originali** |
| MusicXML compresso (.mxl) | ✅ | Archivio ZIP letto con controlli di sicurezza |
| MP3, registrazioni, video, link | ⛔ **non risolvibile qui** | Richiede separazione delle sorgenti e trascrizione polifonica: un modello dedicato lato server. L'app riconosce i formati audio dai byte e lo dichiara |

### Le tre decisioni che il file non contiene

Un file dice **quali note e quando**. Non sempre dice quale parte è il
pianoforte, quale mano suona cosa, né dove finisce una frase.

1. **Quale parte.** Strumento General MIDI della famiglia pianoforte (0–7) o
   nome della parte; il canale 10 è batteria per definizione dello standard e
   viene sempre escluso.
2. **Quale mano.** Se il file la dichiara (pentagramma 1 e 2 del MusicXML)
   **vince sempre il file**. Altrimenti: due parti diventano una per mano, e
   una parte sola si divide per altezza con la soglia che separa meglio le
   note in due gruppi (criterio di Otsu su un istogramma di altezze).
3. **Dove tagliare le sezioni.** Blocchi di battute intere (8, 4 o 2 secondo
   la lunghezza), perché ripetere, rallentare e isolare una mano funzionano
   per sezione.

Nessuna viene presa in silenzio: la schermata **"Controlla il brano prima di
importarlo"** le mostra tutte, le lascia cambiare e aggiorna l'anteprima —
che usa lo stesso pentagramma del tutorial, non un disegno diverso.

### I ritornelli si aprono davvero

Uno spartito non è una sequenza di battute: è una sequenza di battute **più
le istruzioni per ripercorrerle**. Un file con `|: :|` contiene otto battute e
se ne suonano sedici. Importarlo senza aprirle darebbe all'allievo metà del
brano che ha davanti sulla carta — l'unico punto in cui Maestro gli mostrerebbe
qualcosa di diverso da quello che vede.

`core/import/repeats.ts` calcola **solo l'ordine in cui le battute vanno
suonate**: un elenco di indici. Non tocca nessuna nota e si prova senza XML.
Copre `|:`, `:|`, `<repeat times="n">`, le volte (1ª, 2ª, anche lunghe più di
una battuta o valide per più passaggi), ritornelli consecutivi, e il caso dello
standard in cui un `:|` senza apertura rimanda all'inizio del brano. Un file in
cui una volta non si chiude mai viene recuperato invece di far saltare la
seconda; un file che si richiude su se stesso viene interrotto con un avviso
invece di riempire la memoria.

I segni si leggono da **tutte le parti e si uniscono**: molti file li scrivono
su un pentagramma solo, e prendere solo il primo significherebbe perderli.

**Da capo, dal segno, coda e fine non vengono aperti**, e viene dichiarato.
Sono salti che dipendono da segni sparsi nel documento e da convenzioni meno
uniformi: fingere di averli aperti sarebbe peggio che dire che non lo sono.

### Quello che si fa al materiale, e si dichiara

Allineamento opzionale alla griglia; silenzio iniziale tolto fino alla
battuta; note doppie fuse (lo stesso tasto raddoppiato è una nota sola per chi
suona); note legate di valore unite in un attacco solo; note fuori dagli 88
tasti scartate e contate; **nessuna diteggiatura inventata**. Quello che il
modello non sa rappresentare — dinamiche, articolazioni, pedale, ritornelli,
abbellimenti, testo cantato — viene **elencato all'utente**, non perso in
silenzio.

### Sicurezza dei formati che arrivano da fuori

**XML.** Il lettore in `core/import/xml.ts` è scritto a mano per una ragione
di sicurezza, non di gusto: il modo più solido di non essere vulnerabili a XXE
è **non implementare affatto** le entità esterne. Non esiste codice che
risolva un `SYSTEM` o un `PUBLIC`, quindi non c'è niente da ingannare. Un
DOCTYPE che le dichiari viene rifiutato, non ignorato; un'entità non
predefinita fa fallire la lettura; limiti espliciti su dimensione, profondità,
numero di nodi e di attributi. La "bomba delle entità" non ha effetto perché
nessuna entità viene espansa.

**ZIP (.mxl).** L'indice dell'archivio — che non è compresso — si legge a
mano, e **si decide cosa estrarre prima di estrarlo**: nomi (niente percorsi
assoluti, niente `..`, niente backslash), dimensione dichiarata, totale
dichiarato, numero di file e **rapporto di compressione**, che è la firma di
una bomba zip e si vede dall'indice senza allocare niente. L'inflate è
`fflate`, l'unica dipendenza aggiunta; la politica di sicurezza è codice
nostro. Lo ZIP64 viene dichiarato non leggibile invece di essere interpretato
male.

### Dove finiscono

Licenza `user_import`, **volutamente fuori dagli stati servibili**: restano
nell'archivio locale, non vengono caricati da nessuna parte, non entrano nel
catalogo. La Home tiene separate **"Brani Maestro"** e **"I miei brani"**.

---

## 6quater. Backup e trasferimento

I brani importati vivono solo sul dispositivo, e un telefono si perde. Il
backup è l'unico modo di portarli altrove **senza caricarli da nessuna parte**:
tutto resta dentro un file che l'utente possiede.

- **Formato** `maestro-backup-v1`, estensione `.maestro`, JSON leggibile e
  versionato di proposito: un archivio binario illeggibile sarebbe un formato
  ostaggio.
- **Contenuto**: brani, metadati, struttura musicale già normalizzata, *come*
  erano stati importati (parti, soglia delle mani, allineamento) e i
  **progressi collegati**, presi dal loro archivio invece che duplicati.
- **Prima di applicare** si mostra: data, versione, numero di brani, errori,
  incompatibilità e duplicati. Uno schema più recente viene dichiarato
  illeggibile invece di essere interpretato male; un brano danneggiato viene
  saltato dicendolo, senza perdere gli altri.
- **Un duplicato non viene mai sovrascritto in silenzio**: la politica è una
  scelta esplicita fra *mantieni esistente*, *importa come copia*,
  *sostituisci*. Il duplicato si riconosce anche quando l'identificatore è
  diverso, perché reimportando lo stesso file si ottiene un id nuovo ma la
  stessa musica: l'impronta è `slug|durata|numero di note`.
- Dalla scheda di un brano personale si esporta **il singolo brano**.

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
