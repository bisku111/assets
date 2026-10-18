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
| Pagamenti | ⛔ non implementati per scelta | schema DB e gating pronti (§9) |

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
│   │   ├── music/              # note, frequenze, nomi italiani (DO RE MI)
│   │   ├── song/               # modello brano, notazione compatta, validazione
│   │   ├── engine/             # Transport, NoteMatcher, PracticeSession
│   │   ├── scoring/            # precisione, ritmo, tempo, punteggio 0–100
│   │   ├── coach/              # decisioni didattiche + frasi in italiano
│   │   ├── learning/           # progressione 50→100%, avanzamento a sezioni
│   │   ├── midi/               # parser byte MIDI, gestione pedale
│   │   ├── dsp/                # YIN, tracciamento note, calibrazione latenza
│   │   ├── gamification/       # XP, livelli, striscia, medaglie
│   │   └── ports/              # interfacce: NoteInputPort, ClockPort, dati
│   ├── adapters/               # ⬛ implementazioni delle porte
│   │   ├── midi/               # webMidi | nativeMidi | virtualKeyboard
│   │   ├── audio/              # webAudio | nativeAudio
│   │   ├── storage/            # AsyncStorage, repository locale
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
- **Calibrazione latenza**: l'utente suona su un metronomo; si prende la
  **mediana** degli scarti (robusta agli outlier), non la media.

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
LA4:2@1       nota LA4, due movimenti, pollice
DO4+MI4+SOL4:2  accordo
-:2           pausa
LA3:4~        nota tenuta (pedale)
```

Scrivere migliaia di millisecondi a mano produce errori di sincronizzazione che
poi si scaricano sull'utente durante la lezione.

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
- **Testing**: `npm run verify` (typecheck + Jest) e `npm run test:db`
  (migrazioni + suite RLS su un Postgres usa-e-getta).
- **CI**: GitHub Actions su push e pull request.
