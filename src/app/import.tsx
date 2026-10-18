import { useCallback, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createFilePicker } from '../adapters/filePicker';
import { MidiFileError, parseMidiFile, type MidiFile } from '../core/import/midiFile';
import {
  analyseMidi, buildImportedSong, suggestHandSplit,
  type ImportAnalysis, type ImportResult,
} from '../core/import/toSong';
import { noteNameIt } from '../core/music/note';
import { formatDuration } from '../core/song/query';
import { addImportedSong } from '../state/appStore';
import { Button } from '../ui/components/Button';
import { Card } from '../ui/components/Card';
import { Text } from '../ui/components/Text';
import { colors, radius, spacing, typography } from '../ui/theme';

/**
 * Importazione di un brano dai file dell'utente.
 *
 * Due regole guidano questa schermata.
 *
 * La prima: si dice subito cosa si sa fare e cosa no. Da un file MIDI
 * le note si leggono; da un mp3 o da un video andrebbero riconosciute,
 * che è un problema diverso e non risolto qui. Lasciare l'utente a
 * scoprirlo caricando un file sarebbe una perdita di tempo spacciata
 * per funzione.
 *
 * La seconda: ogni scelta che il programma fa al posto suo — quale
 * traccia è il pianoforte, quale mano suona cosa, dove tagliare le
 * sezioni — viene mostrata e si può cambiare. Sono scelte che possono
 * essere sbagliate, e nasconderle le renderebbe solo più difficili da
 * correggere.
 */

type Fase =
  | { tipo: 'scelta' }
  | { tipo: 'lettura' }
  | { tipo: 'pronto'; nome: string; file: MidiFile; analisi: ImportAnalysis }
  | { tipo: 'errore'; messaggio: string }
  | { tipo: 'fatto'; songId: string; titolo: string; report: ImportResult['report'] };

export default function Importa() {
  const router = useRouter();
  const picker = useMemo(() => createFilePicker(), []);

  const [fase, setFase] = useState<Fase>({ tipo: 'scelta' });
  const [titolo, setTitolo] = useState('');
  const [perTracce, setPerTracce] = useState(true);
  const [soglia, setSoglia] = useState(60);
  const [griglia, setGriglia] = useState<0 | 8 | 16>(16);

  const scegli = useCallback(async () => {
    setFase({ tipo: 'lettura' });
    try {
      const file = await picker.pick();
      if (!file) return setFase({ tipo: 'scelta' });

      const midi = parseMidiFile(file.bytes);
      const analisi = analyseMidi(midi);
      if (analisi.tracks.length === 0) {
        return setFase({ tipo: 'errore', messaggio: 'Questo file non contiene note da suonare.' });
      }

      const altezze = midi.tracks
        .filter((t) => analisi.suggestedTracks.includes(t.index))
        .flatMap((t) => t.notes.map((n) => n.midi));
      setSoglia(suggestHandSplit(altezze));
      setPerTracce(analisi.suggestedTracks.length >= 2);
      setTitolo(file.name.replace(/\.(mid|midi)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Brano importato');
      setFase({ tipo: 'pronto', nome: file.name, file: midi, analisi });
    } catch (errore) {
      setFase({
        tipo: 'errore',
        // I messaggi del lettore sono già scritti per una persona.
        // Tutto il resto diventa una frase comprensibile invece di uno
        // stack trace, che all'utente non dice niente.
        messaggio: errore instanceof MidiFileError
          ? `Non riesco a leggere questo file: ${errore.message}.`
          : 'Non riesco a leggere questo file. Assicurati che sia un file MIDI (.mid).',
      });
    }
  }, [picker]);

  const aggiungi = useCallback(async () => {
    if (fase.tipo !== 'pronto') return;
    try {
      const esito = buildImportedSong(fase.file, {
        title: titolo.trim() || 'Brano importato',
        handSplit: perTracce ? 'tracks' : soglia,
        quantizeDivision: griglia,
      });
      await addImportedSong(esito.song);
      setFase({ tipo: 'fatto', songId: esito.song.id, titolo: esito.song.title, report: esito.report });
    } catch {
      setFase({
        tipo: 'errore',
        messaggio: 'Non sono riuscito a ricavare un brano studiabile da questo file.',
      });
    }
  }, [fase, titolo, perTracce, soglia, griglia]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text variant="title">Aggiungi un brano</Text>

        <CosaSiPuoFare />

        {fase.tipo === 'errore' ? (
          <Card style={{ marginTop: spacing.lg, borderColor: colors.error }}>
            <Text tone="error">{fase.messaggio}</Text>
          </Card>
        ) : null}

        {fase.tipo === 'scelta' || fase.tipo === 'errore' ? (
          <Button
            label="Scegli un file MIDI"
            onPress={() => void scegli()}
            style={{ marginTop: spacing.lg }}
          />
        ) : null}

        {fase.tipo === 'lettura' ? (
          <Text tone="muted" style={{ marginTop: spacing.lg }}>Sto leggendo il file…</Text>
        ) : null}

        {fase.tipo === 'pronto' ? (
          <>
            <CosaHoTrovato nome={fase.nome} analisi={fase.analisi} />

            <Text variant="heading" style={{ marginTop: spacing.lg }}>Come lo preparo</Text>

            <Campo label="Titolo">
              <TextInput
                value={titolo}
                onChangeText={setTitolo}
                accessibilityLabel="Titolo"
                placeholder="Titolo del brano"
                placeholderTextColor={colors.textFaint}
                style={stileInput}
              />
            </Campo>

            <Campo label="Divisione delle mani">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {fase.analisi.suggestedTracks.length >= 2 ? (
                  <Scelta
                    label="Una traccia per mano"
                    attiva={perTracce}
                    onPress={() => setPerTracce(true)}
                  />
                ) : null}
                <Scelta
                  label={`Per altezza, da ${noteNameIt(soglia)} in su`}
                  attiva={!perTracce}
                  onPress={() => setPerTracce(false)}
                />
              </View>
              {!perTracce ? (
                <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
                  <Scelta label="− grave" onPress={() => setSoglia((v) => Math.max(21, v - 1))} />
                  <Scelta label="+ acuto" onPress={() => setSoglia((v) => Math.min(108, v + 1))} />
                </View>
              ) : null}
            </Campo>

            <Campo label="Allineamento al tempo">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                <Scelta label="Semicrome" attiva={griglia === 16} onPress={() => setGriglia(16)} />
                <Scelta label="Crome" attiva={griglia === 8} onPress={() => setGriglia(8)} />
                <Scelta label="Come nel file" attiva={griglia === 0} onPress={() => setGriglia(0)} />
              </View>
              <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
                Se il file è la registrazione di un'esecuzione, i tempi non sono esatti.
                Allinearli rende lo spartito leggibile, ma cambia leggermente il ritmo scritto.
              </Text>
            </Campo>

            <Button label="Aggiungi alla mia libreria" onPress={() => void aggiungi()} style={{ marginTop: spacing.md }} />
            <Button label="Scegli un altro file" variant="ghost" onPress={() => void scegli()} style={{ marginTop: spacing.sm }} />
          </>
        ) : null}

        {fase.tipo === 'fatto' ? (
          <Fatto
            titolo={fase.titolo}
            report={fase.report}
            onApri={() => router.replace(`/song/${fase.songId}`)}
            onAltro={() => { setFase({ tipo: 'scelta' }); }}
          />
        ) : null}

        <Button label="Chiudi" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function CosaSiPuoFare() {
  return (
    <Card style={{ marginTop: spacing.md }}>
      <Text variant="label" tone="muted">COSA POSSO IMPORTARE</Text>
      <Text style={{ marginTop: spacing.sm }}>
        <Text tone="success">Sì</Text>
        {'  '}File MIDI (.mid): le note ci sono già scritte dentro, le leggo tutte.
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

function CosaHoTrovato({ nome, analisi }: { nome: string; analisi: ImportAnalysis }) {
  return (
    <Card style={{ marginTop: spacing.lg }}>
      <Text variant="label" tone="muted">COSA HO TROVATO</Text>
      <Text variant="heading" style={{ marginTop: spacing.xs }} numberOfLines={1}>{nome}</Text>
      <Text tone="muted" style={{ marginTop: spacing.xs }}>
        {analisi.totalNotes} note · {formatDuration(analisi.durationMs)} ·{' '}
        {analisi.bpm} BPM · {analisi.timeSignature[0]}/{analisi.timeSignature[1]}
        {analisi.tempoChanges > 1 ? ` · ${analisi.tempoChanges} cambi di tempo` : ''}
      </Text>

      {!analisi.pianoFound ? (
        <Text tone="warning" variant="caption" style={{ marginTop: spacing.sm }}>
          Nessuna traccia si dichiara pianoforte: importo quello che c'è, controlla che sia la parte giusta.
        </Text>
      ) : null}

      <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
        {analisi.tracks.map((t) => {
          const usata = analisi.suggestedTracks.includes(t.index);
          return (
            <Text
              key={t.index}
              variant="caption"
              tone={usata ? 'default' : 'faint'}
              numberOfLines={1}
            >
              {usata ? '●' : '○'} {t.name || `Traccia ${t.index + 1}`} — {t.noteCount} note,{' '}
              da {noteNameIt(t.lowestMidi)} a {noteNameIt(t.highestMidi)}
              {t.isDrums ? ' · batteria, esclusa' : ''}
            </Text>
          );
        })}
      </View>
    </Card>
  );
}

function Fatto({
  titolo, report, onApri, onAltro,
}: {
  titolo: string;
  report: ImportResult['report'];
  onApri: () => void;
  onAltro: () => void;
}) {
  return (
    <Card style={{ marginTop: spacing.lg }}>
      <Text variant="heading">{titolo} è nella tua libreria</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
        {report.notesImported} note in {report.sections} sezioni
        {report.handSplitMidi !== null
          ? `, mani divise da ${noteNameIt(report.handSplitMidi)} in su`
          : ', una traccia per mano'}
        {report.quantized ? ', tempi allineati alla griglia' : ', tempi come nel file'}.
      </Text>
      {report.notesOutOfRange > 0 ? (
        <Text variant="caption" tone="warning" style={{ marginTop: spacing.xs }}>
          {report.notesOutOfRange} note erano fuori dagli 88 tasti e non sono state importate.
        </Text>
      ) : null}
      {report.notesMerged > 0 ? (
        <Text variant="caption" tone="faint" style={{ marginTop: spacing.xs }}>
          {report.notesMerged} note doppie sono state unite: erano lo stesso tasto suonato due volte insieme.
        </Text>
      ) : null}
      <Text variant="caption" tone="faint" style={{ marginTop: spacing.sm }}>
        Le sezioni sono blocchi di battute: un file MIDI non dice dove finisce una strofa.
        Nessuna diteggiatura, perché nel file non c'è.
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
      style={{ paddingHorizontal: spacing.md, minHeight: 40 }}
    />
  );
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
