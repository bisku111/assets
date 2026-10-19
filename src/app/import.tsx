import { useCallback, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createFilePicker } from '../adapters/filePicker';
import { emptyMeta } from '../adapters/storage/importedSongs';
import type { ImportMeta } from '../core/backup/format';
import type { ImportDocument } from '../core/import/document';
import { openImportFile, SCORE_LABEL, type ImportFormat } from '../core/import/open';
import {
  analyseDocument, buildImportedSong, partLabel,
  type ImportAnalysis, type ImportReport, type PartRole,
} from '../core/import/toSong';
import { noteNameIt } from '../core/music/note';
import { buildStaffScore, clefForHand, type Clef } from '../core/notation/staff';
import { formatDuration } from '../core/song/query';
import type { Hand, Song } from '../core/song/types';
import { addImportedSong } from '../state/appStore';
import { Button } from '../ui/components/Button';
import { Card } from '../ui/components/Card';
import { Text } from '../ui/components/Text';
import { StaffView, staffHeight } from '../ui/StaffView';
import { colors, radius, spacing, typography } from '../ui/theme';

/**
 * Importazione di un brano dai file dell'utente.
 *
 * Due regole guidano questa schermata.
 *
 * La prima: si dice subito cosa si sa fare e cosa no. Da un MIDI o da
 * un MusicXML le note si leggono; da un mp3 o da un video andrebbero
 * riconosciute, che è un problema diverso e non risolto qui.
 *
 * La seconda: **niente viene importato prima che l'utente abbia visto
 * cosa sta importando.** Quale parte è il pianoforte, quale mano suona
 * cosa, dove tagliare le sezioni sono decisioni che il programma
 * prende al posto suo, e che può sbagliare. Si mostrano tutte, si
 * possono cambiare tutte, e l'anteprima mostra il risultato prima di
 * confermare.
 */

type Fase =
  | { tipo: 'scelta' }
  | { tipo: 'lettura' }
  | { tipo: 'errore'; messaggio: string }
  | { tipo: 'revisione'; nome: string; formato: ImportFormat; documento: ImportDocument; analisi: ImportAnalysis }
  | { tipo: 'fatto'; songId: string; titolo: string; report: ImportReport };

export default function Importa() {
  const router = useRouter();
  const picker = useMemo(() => createFilePicker(), []);

  const [fase, setFase] = useState<Fase>({ tipo: 'scelta' });
  const [titolo, setTitolo] = useState('');
  const [autore, setAutore] = useState('');
  const [ruoli, setRuoli] = useState<PartRole[]>([]);
  const [soglia, setSoglia] = useState(60);
  const [griglia, setGriglia] = useState<0 | 8 | 16>(16);

  const scegli = useCallback(async () => {
    setFase({ tipo: 'lettura' });
    try {
      const file = await picker.pick();
      if (!file) return setFase({ tipo: 'scelta' });

      const aperto = openImportFile(file.bytes, file.name);
      const analisi = analyseDocument(aperto.document);

      setRuoli(analisi.suggestedRoles);
      setSoglia(analisi.suggestedSplitMidi);
      // Uno spartito è già scritto in tempo: allinearlo non serve.
      // Un MIDI può essere la registrazione di un'esecuzione.
      setGriglia(aperto.format === 'midi' ? 16 : 0);
      setTitolo(analisi.title ?? nomeDaFile(file.name));
      setAutore(analisi.composer ?? '');
      setFase({
        tipo: 'revisione', nome: file.name, formato: aperto.format,
        documento: aperto.document, analisi,
      });
    } catch (errore) {
      setFase({ tipo: 'errore', messaggio: messaggioDi(errore) });
    }
  }, [picker]);

  // L'anteprima si ricostruisce a ogni modifica: è l'unico modo perché
  // quello che si vede sia davvero quello che si importerà.
  const costruito = useMemo(() => {
    if (fase.tipo !== 'revisione') return null;
    try {
      return {
        esito: buildImportedSong(fase.documento, {
          title: titolo, composer: autore, roles: ruoli, splitMidi: soglia, quantizeDivision: griglia,
        }),
        errore: null as string | null,
      };
    } catch (errore) {
      return { esito: null, errore: messaggioDi(errore) };
    }
  }, [fase, titolo, autore, ruoli, soglia, griglia]);

  const importa = useCallback(async () => {
    if (fase.tipo !== 'revisione' || !costruito?.esito) return;
    const { song, report } = costruito.esito;
    const meta: ImportMeta = {
      ...emptyMeta(),
      importedAt: new Date().toISOString(),
      sourceName: fase.nome,
      sourceFormat: fase.formato,
      splitMidi: report.splitMidiUsed,
      quantizeDivision: griglia,
      partsUsed: report.partsUsed,
      partsExcluded: report.partsExcluded,
    };
    try {
      await addImportedSong(song, meta);
      setFase({ tipo: 'fatto', songId: song.id, titolo: song.title, report });
    } catch (errore) {
      setFase({ tipo: 'errore', messaggio: messaggioDi(errore) });
    }
  }, [fase, costruito, griglia]);

  const serveSoglia = fase.tipo === 'revisione' &&
    ruoli.some((r, i) => r === 'split' && !fase.analisi.parts[i]?.hasDeclaredHands);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text variant="title">Aggiungi un brano</Text>

        {fase.tipo === 'scelta' || fase.tipo === 'errore' || fase.tipo === 'lettura' ? (
          <CosaSiPuoFare />
        ) : null}

        {fase.tipo === 'errore' ? (
          <Card style={{ marginTop: spacing.lg, borderColor: colors.error }}>
            <Text tone="error">{fase.messaggio}</Text>
          </Card>
        ) : null}

        {fase.tipo === 'scelta' || fase.tipo === 'errore' ? (
          <Button label="Scegli un file" onPress={() => void scegli()} style={{ marginTop: spacing.lg }} />
        ) : null}

        {fase.tipo === 'lettura' ? (
          <Text tone="muted" style={{ marginTop: spacing.lg }}>Sto leggendo il file…</Text>
        ) : null}

        {fase.tipo === 'revisione' ? (
          <>
            <Text variant="heading" style={{ marginTop: spacing.lg }}>
              Controlla il brano prima di importarlo
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {fase.nome} · {SCORE_LABEL[fase.formato]}
            </Text>

            <Scheda analisi={fase.analisi} />

            <Campo label="Titolo">
              <TextInput
                value={titolo} onChangeText={setTitolo}
                accessibilityLabel="Titolo" placeholder="Titolo del brano"
                placeholderTextColor={colors.textFaint} style={stileInput}
              />
            </Campo>
            <Campo label="Autore">
              <TextInput
                value={autore} onChangeText={setAutore}
                accessibilityLabel="Autore" placeholder="Se il file non lo dice, puoi scriverlo tu"
                placeholderTextColor={colors.textFaint} style={stileInput}
              />
            </Campo>

            <Parti
              analisi={fase.analisi}
              ruoli={ruoli}
              onCambia={(indice, ruolo) =>
                setRuoli((attuali) => attuali.map((r, i) => (i === indice ? ruolo : r)))}
            />

            {serveSoglia ? (
              <Campo label="Divisione delle mani">
                <Text tone="muted">
                  Divisione suggerita: <Text tone="primary">{noteNameIt(soglia)}</Text>
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
                  <Scelta label="− semitono" onPress={() => setSoglia((v) => Math.max(21, v - 1))} />
                  <Scelta label="+ semitono" onPress={() => setSoglia((v) => Math.min(108, v + 1))} />
                </View>
                <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
                  Da {noteNameIt(soglia)} in su suona la destra, sotto la sinistra.
                </Text>
              </Campo>
            ) : null}

            <Campo label="Allinea le note alla griglia">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                <Scelta label="Semicrome" attiva={griglia === 16} onPress={() => setGriglia(16)} />
                <Scelta label="Crome" attiva={griglia === 8} onPress={() => setGriglia(8)} />
                <Scelta label="Come nel file" attiva={griglia === 0} onPress={() => setGriglia(0)} />
              </View>
              <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
                Può rendere più leggibile un MIDI registrato dal vivo, modificando leggermente
                il ritmo scritto.
              </Text>
            </Campo>

            {costruito?.errore ? (
              <Card style={{ marginTop: spacing.lg, borderColor: colors.error }}>
                <Text tone="error">{costruito.errore}</Text>
              </Card>
            ) : null}

            {costruito?.esito ? (
              <>
                <Anteprima song={costruito.esito.song} />
                <Riepilogo report={costruito.esito.report} analisi={fase.analisi} />
                <Button label="Importa in Maestro" onPress={() => void importa()} style={{ marginTop: spacing.md }} />
              </>
            ) : null}

            <Button label="Scegli un altro file" variant="ghost" onPress={() => void scegli()} style={{ marginTop: spacing.sm }} />
          </>
        ) : null}

        {fase.tipo === 'fatto' ? (
          <Fatto
            titolo={fase.titolo}
            report={fase.report}
            onApri={() => router.replace(`/song/${fase.songId}`)}
            onAltro={() => setFase({ tipo: 'scelta' })}
          />
        ) : null}

        <Button label="Chiudi" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------

function CosaSiPuoFare() {
  return (
    <Card style={{ marginTop: spacing.md }}>
      <Text variant="label" tone="muted">COSA POSSO IMPORTARE</Text>
      <Text style={{ marginTop: spacing.sm }}>
        <Text tone="success">Sì</Text>
        {'  '}MIDI (.mid) e MusicXML (.musicxml, .xml, .mxl): le note ci sono già scritte dentro.
        Dal MusicXML prendo anche titolo, autore, tonalità, mani e la diteggiatura originale.
      </Text>
      <Text style={{ marginTop: spacing.sm }}>
        <Text tone="error">No</Text>
        {'  '}MP3, registrazioni, video o link. Da un audio le note andrebbero riconosciute a orecchio,
        separando il pianoforte dal resto: è un lavoro che non so ancora fare, e preferisco dirtelo
        adesso invece di darti un risultato inventato.
      </Text>
      <Text variant="caption" tone="faint" style={{ marginTop: spacing.md }}>
        I brani che importi restano su questo dispositivo. Non vengono caricati da nessuna parte e non
        entrano nel catalogo: sono tuoi, non del progetto.
      </Text>
    </Card>
  );
}

function Scheda({ analisi }: { analisi: ImportAnalysis }) {
  return (
    <Card style={{ marginTop: spacing.md }}>
      <Text variant="label" tone="muted">COSA HO TROVATO</Text>
      <Text tone="muted" style={{ marginTop: spacing.xs }}>
        {analisi.totalNotes} note · {analisi.bars} battute · {formatDuration(analisi.durationMs)} ·{' '}
        {analisi.bpm} BPM · {analisi.timeSignature[0]}/{analisi.timeSignature[1]}
        {analisi.keySignature ? ` · ${analisi.keySignature}` : ''}
        {analisi.tempoChanges > 1 ? ` · ${analisi.tempoChanges} cambi di tempo` : ''}
      </Text>

      {!analisi.pianoFound ? (
        <Text tone="warning" variant="caption" style={{ marginTop: spacing.sm }}>
          Nessuna parte si dichiara pianoforte: controlla qui sotto che sia la parte giusta.
        </Text>
      ) : null}

      {analisi.notices.map((avviso) => (
        <Text key={avviso} variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
          · {avviso}
        </Text>
      ))}
    </Card>
  );
}

const ETICHETTE: Record<PartRole, string> = {
  excluded: 'Escludi',
  right: 'Destra',
  left: 'Sinistra',
  split: 'Due mani',
};

function Parti({
  analisi, ruoli, onCambia,
}: {
  analisi: ImportAnalysis;
  ruoli: readonly PartRole[];
  onCambia: (indice: number, ruolo: PartRole) => void;
}) {
  return (
    <Campo label={analisi.format === 'midi' ? 'Tracce' : 'Parti'}>
      {analisi.parts.map((parte, indice) => {
        const ruolo = ruoli[indice] ?? 'excluded';
        return (
          <Card key={parte.index} style={{ marginBottom: spacing.sm }}>
            <Text numberOfLines={1}>{partLabel(parte, indice)}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {parte.instrument ?? 'strumento non dichiarato'}
              {parte.channel !== null ? ` · canale ${parte.channel + 1}` : ''}
              {' · '}{parte.noteCount} note
              {' · '}da {noteNameIt(parte.lowestMidi)} a {noteNameIt(parte.highestMidi)}
            </Text>
            {parte.isDrums ? (
              <Text variant="caption" tone="warning">Batteria</Text>
            ) : null}
            {parte.hasDeclaredHands ? (
              <Text variant="caption" tone="success">Le mani sono già scritte nel file</Text>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
              {(['split', 'right', 'left', 'excluded'] as PartRole[]).map((candidato) => (
                <Scelta
                  key={candidato}
                  label={candidato === 'split' && parte.hasDeclaredHands ? 'Come nel file' : ETICHETTE[candidato]}
                  attiva={ruolo === candidato}
                  onPress={() => onCambia(indice, candidato)}
                />
              ))}
            </View>
          </Card>
        );
      })}
    </Campo>
  );
}

/**
 * Anteprima delle prime battute.
 *
 * Usa lo stesso pentagramma del tutorial: se l'anteprima usasse un
 * disegno diverso, non sarebbe un'anteprima.
 */
function Anteprima({ song }: { song: Song }) {
  const [larghezza, setLarghezza] = useState(0);
  const arrangement = song.arrangements[0];

  const msPerBeat = 60_000 / song.bpm;
  const msPerBar = msPerBeat * song.timeSignature[0] * (4 / song.timeSignature[1]);

  const spartito = useMemo(
    () => buildStaffScore(arrangement?.notes ?? [], { keySignature: song.keySignature, msPerBeat }),
    [arrangement, song.keySignature, msPerBeat],
  );
  const righi = useMemo<Clef[]>(
    () => (['right', 'left'] as Hand[])
      .filter((h) => arrangement?.hands.includes(h))
      .map(clefForHand),
    [arrangement],
  );

  if (!arrangement || righi.length === 0) return null;

  return (
    <Campo label="Anteprima delle prime battute">
      <View
        style={{ height: staffHeight(righi.length), borderRadius: radius.sm, overflow: 'hidden' }}
        onLayout={(e) => setLarghezza(e.nativeEvent.layout.width)}
        accessibilityLabel="Anteprima del brano"
      >
        {larghezza > 0 ? (
          <StaffView
            score={spartito}
            positionMs={0}
            msPerBar={msPerBar}
            width={larghezza}
            statuses={VUOTO}
            waitingIndex={null}
            windowMs={msPerBar * 3}
            clefs={righi}
          />
        ) : null}
      </View>
    </Campo>
  );
}

const VUOTO = new Map<number, 'hit' | 'missed'>();

function Riepilogo({ report, analisi }: { report: ImportReport; analisi: ImportAnalysis }) {
  const escluse = report.partsExcluded
    .map((i) => partLabel(analisi.parts.find((p) => p.index === i) ?? analisi.parts[0]!, i))
    .join(', ');

  return (
    <Card style={{ marginTop: spacing.md }}>
      <Text variant="label" tone="muted">COSA IMPORTERÒ</Text>
      <Riga etichetta="Note importate" valore={`${report.notesImported}`} />
      <Riga etichetta="Mano destra" valore={`${report.rightNotes} note`} />
      <Riga etichetta="Mano sinistra" valore={`${report.leftNotes} note`} />
      <Riga etichetta="Durata" valore={`${formatDuration(report.durationMs)} · ${report.bars} battute`} />
      <Riga etichetta="Sezioni" valore={`${report.sections}`} />
      <Riga
        etichetta="Allineamento"
        valore={report.quantized ? 'alla griglia' : 'come nel file'}
      />
      {report.splitMidiUsed !== null ? (
        <Riga etichetta="Divisione mani" valore={`da ${noteNameIt(report.splitMidiUsed)} in su`} />
      ) : null}
      {report.fingeringsKept > 0 ? (
        <Riga etichetta="Diteggiature dal file" valore={`${report.fingeringsKept}`} />
      ) : null}
      {report.notesOutOfRange > 0 ? (
        <Riga etichetta="Note scartate" valore={`${report.notesOutOfRange} fuori dagli 88 tasti`} tono="warning" />
      ) : null}
      {report.notesMerged > 0 ? (
        <Riga etichetta="Note doppie unite" valore={`${report.notesMerged}`} />
      ) : null}
      {escluse ? <Riga etichetta="Parti escluse" valore={escluse} /> : null}
    </Card>
  );
}

function Riga({ etichetta, valore, tono }: { etichetta: string; valore: string; tono?: 'warning' }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs }}>
      <Text variant="caption" tone="muted">{etichetta}</Text>
      <Text variant="caption" tone={tono ?? 'default'} style={{ flexShrink: 1, textAlign: 'right' }}>
        {valore}
      </Text>
    </View>
  );
}

function Fatto({
  titolo, report, onApri, onAltro,
}: {
  titolo: string;
  report: ImportReport;
  onApri: () => void;
  onAltro: () => void;
}) {
  return (
    <Card style={{ marginTop: spacing.lg }}>
      <Text variant="heading">{titolo} è nella tua libreria</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
        {report.notesImported} note in {report.sections} sezioni,{' '}
        {report.quantized ? 'tempi allineati alla griglia' : 'tempi come nel file'}.
      </Text>
      <Text variant="caption" tone="faint" style={{ marginTop: spacing.sm }}>
        Le sezioni sono blocchi di battute: un file non dice dove finisce una strofa.
        {report.fingeringsKept === 0
          ? ' Nessuna diteggiatura, perché nel file non c’era.'
          : ` ${report.fingeringsKept} diteggiature conservate dal file.`}
      </Text>

      <Button label="Apri il brano" onPress={onApri} style={{ marginTop: spacing.md }} />
      <Button label="Importane un altro" variant="ghost" onPress={onAltro} style={{ marginTop: spacing.sm }} />
    </Card>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>{label}</Text>
      {children}
    </View>
  );
}

function Scelta({ label, attiva, onPress }: { label: string; attiva?: boolean; onPress: () => void }) {
  return (
    <Button
      label={label}
      variant={attiva ? 'primary' : 'ghost'}
      onPress={onPress}
      style={{ paddingHorizontal: spacing.md, minHeight: 38 }}
    />
  );
}

function nomeDaFile(nome: string): string {
  return nome.replace(/\.(mid|midi|musicxml|xml|mxl)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Brano importato';
}

/** Mai uno stack trace a schermo: solo frasi che una persona può leggere. */
function messaggioDi(errore: unknown): string {
  if (errore instanceof Error && errore.message) {
    const testo = errore.message;
    return /^[A-Z]/.test(testo) ? testo : `Non riesco a leggere questo file: ${testo}.`;
  }
  return 'Non riesco a leggere questo file.';
}

const stileInput = {
  ...typography.body,
  color: colors.text,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  minHeight: 44,
};
