import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createFilePicker } from '../adapters/filePicker';
import { emptyMeta } from '../adapters/storage/importedSongs';
import {
  findDuplicates, inspectBackup,
  type BackupEntry, type BackupInspection, type DuplicatePolicy,
} from '../core/backup/format';
import { BACKUP_EXTENSIONS } from '../core/ports/filePicker';
import { decodeUtf8 } from '../core/text/utf8';
import { formatDuration } from '../core/song/query';
import {
  exportLibraryBackup, restoreBackup, useAppStore,
  type BackupSaved, type RestoreOutcome,
} from '../state/appStore';
import { Button } from '../ui/components/Button';
import { Card } from '../ui/components/Card';
import { Text } from '../ui/components/Text';
import { colors, spacing } from '../ui/theme';

/**
 * Backup e trasferimento dei brani personali.
 *
 * I brani importati vivono solo sul dispositivo, e un telefono si
 * perde. Questo è il modo di portarli altrove **senza caricarli da
 * nessuna parte**: tutto resta dentro un file che l'utente possiede e
 * sposta come vuole. Niente cloud, niente account necessario.
 *
 * Sul ripristino vale una regola sola: un brano già presente non viene
 * mai sovrascritto senza che l'utente l'abbia scelto.
 */

type Fase =
  | { tipo: 'riposo' }
  | { tipo: 'lavoro' }
  | { tipo: 'errore'; messaggio: string }
  | { tipo: 'esportato'; esito: BackupSaved }
  | { tipo: 'letto'; nome: string; ispezione: BackupInspection; duplicati: string[] }
  | { tipo: 'ripristinato'; esito: RestoreOutcome };

export default function Backup() {
  const router = useRouter();
  const picker = useMemo(() => createFilePicker(), []);
  // Il selettore deve restituire un riferimento stabile: filtrare qui
  // dentro creerebbe un array nuovo a ogni render, e lo store
  // vedrebbe uno stato sempre diverso — ciclo infinito di aggiornamenti.
  const songs = useAppStore((s) => s.songs);
  const miei = useMemo(() => songs.filter((x) => x.tags.includes('importato')), [songs]);

  const [fase, setFase] = useState<Fase>({ tipo: 'riposo' });
  const [politica, setPolitica] = useState<DuplicatePolicy>('keep');

  const esporta = useCallback(async () => {
    setFase({ tipo: 'lavoro' });
    try {
      setFase({ tipo: 'esportato', esito: await exportLibraryBackup() });
    } catch (errore) {
      setFase({ tipo: 'errore', messaggio: messaggioDi(errore) });
    }
  }, []);

  const scegli = useCallback(async () => {
    setFase({ tipo: 'lavoro' });
    try {
      const file = await picker.pick(BACKUP_EXTENSIONS);
      if (!file) return setFase({ tipo: 'riposo' });

      const ispezione = inspectBackup(decodeUtf8(file.bytes));
      const esistenti: BackupEntry[] = miei.map((song) => ({
        song, meta: emptyMeta(), progress: [],
      }));
      const duplicati = findDuplicates(esistenti, ispezione.entries);
      setPolitica(duplicati.length > 0 ? 'keep' : 'keep');
      setFase({ tipo: 'letto', nome: file.name, ispezione, duplicati });
    } catch (errore) {
      setFase({ tipo: 'errore', messaggio: messaggioDi(errore) });
    }
  }, [picker, miei]);

  const ripristina = useCallback(async () => {
    if (fase.tipo !== 'letto') return;
    setFase({ tipo: 'lavoro' });
    try {
      setFase({ tipo: 'ripristinato', esito: await restoreBackup(fase.ispezione.entries, politica) });
    } catch (errore) {
      setFase({ tipo: 'errore', messaggio: messaggioDi(errore) });
    }
  }, [fase, politica]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text variant="title">Backup e trasferimento</Text>
        <Text tone="muted" style={{ marginTop: spacing.sm }}>
          I tuoi brani importati stanno solo su questo dispositivo. Il backup è un file che resta tuo:
          non viene caricato da nessuna parte e funziona senza rete.
        </Text>

        {fase.tipo === 'errore' ? (
          <Card style={{ marginTop: spacing.lg, borderColor: colors.error }}>
            <Text tone="error">{fase.messaggio}</Text>
          </Card>
        ) : null}

        {fase.tipo === 'lavoro' ? (
          <Text tone="muted" style={{ marginTop: spacing.lg }}>Un momento…</Text>
        ) : null}

        {/* ---- Esportazione ---- */}
        <Card style={{ marginTop: spacing.lg }}>
          <Text variant="heading">Esporta tutta la libreria</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
            {miei.length === 0
              ? 'Non hai ancora brani importati.'
              : `${miei.length} ${miei.length === 1 ? 'brano' : 'brani'}, con i progressi collegati.`}
          </Text>
          <Button
            label="Esporta la libreria"
            onPress={() => void esporta()}
            disabled={miei.length === 0}
            style={{ marginTop: spacing.md }}
          />
          {fase.tipo === 'esportato' ? (
            <Text tone="success" variant="caption" style={{ marginTop: spacing.sm }}>
              {fase.esito.delivered
                ? `Fatto: ${fase.esito.name} (${fase.esito.songs} ${fase.esito.songs === 1 ? 'brano' : 'brani'}).`
                : `Il file è stato scritto qui: ${fase.esito.where ?? fase.esito.name}.`}
            </Text>
          ) : null}
        </Card>

        {/* ---- Ripristino ---- */}
        <Card style={{ marginTop: spacing.lg }}>
          <Text variant="heading">Importa un backup Maestro</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
            Ti mostro cosa contiene prima di toccare la tua libreria.
          </Text>
          <Button label="Scegli un file di backup" onPress={() => void scegli()} style={{ marginTop: spacing.md }} />
        </Card>

        {fase.tipo === 'letto' ? (
          <Contenuto
            nome={fase.nome}
            ispezione={fase.ispezione}
            duplicati={fase.duplicati}
            politica={politica}
            onPolitica={setPolitica}
            onConferma={() => void ripristina()}
          />
        ) : null}

        {fase.tipo === 'ripristinato' ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text variant="heading">Ripristino completato</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
              {fase.esito.added} aggiunti · {fase.esito.copied} come copia ·{' '}
              {fase.esito.replaced} sostituiti · {fase.esito.kept} lasciati com'erano
              {fase.esito.restoredProgress > 0 ? ` · ${fase.esito.restoredProgress} progressi ripristinati` : ''}.
            </Text>
            <Button label="Vai ai miei brani" onPress={() => router.replace('/')} style={{ marginTop: spacing.md }} />
          </Card>
        ) : null}

        <Button label="Chiudi" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const POLITICHE: { valore: DuplicatePolicy; etichetta: string; spiegazione: string }[] = [
  { valore: 'keep', etichetta: 'Mantieni esistente', spiegazione: 'Il brano che hai già resta com’è.' },
  { valore: 'copy', etichetta: 'Importa come copia', spiegazione: 'Entrambi restano, come brani distinti.' },
  { valore: 'replace', etichetta: 'Sostituisci', spiegazione: 'Il brano del backup prende il posto di quello attuale.' },
];

function Contenuto({
  nome, ispezione, duplicati, politica, onPolitica, onConferma,
}: {
  nome: string;
  ispezione: BackupInspection;
  duplicati: string[];
  politica: DuplicatePolicy;
  onPolitica: (p: DuplicatePolicy) => void;
  onConferma: () => void;
}) {
  const data = ispezione.createdAt ? new Date(ispezione.createdAt) : null;

  return (
    <Card style={{ marginTop: spacing.lg }}>
      <Text variant="label" tone="muted">COSA CONTIENE IL BACKUP</Text>
      <Text numberOfLines={1} style={{ marginTop: spacing.xs }}>{nome}</Text>
      <Text variant="caption" tone="muted">
        {data && !Number.isNaN(data.getTime())
          ? `Del ${data.toLocaleDateString('it-IT')} alle ${data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
          : 'Data non indicata'}
        {' · '}versione {ispezione.schemaVersion ?? '?'}
        {' · '}{ispezione.songs.length} {ispezione.songs.length === 1 ? 'brano' : 'brani'}
      </Text>

      {ispezione.songs.map((s) => (
        <Text key={s.id} variant="caption" tone="faint" numberOfLines={1} style={{ marginTop: spacing.xs }}>
          · {s.title} — {s.notes} note, {formatDuration(s.durationMs)}
          {s.hasProgress ? ', con i tuoi progressi' : ''}
        </Text>
      ))}

      {ispezione.errors.map((errore) => (
        <Text key={errore} variant="caption" tone="warning" style={{ marginTop: spacing.xs }}>
          · {errore}
        </Text>
      ))}

      {duplicati.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <Text variant="label" tone="warning">
            {duplicati.length === 1 ? 'UN BRANO È GIÀ NELLA TUA LIBRERIA' : `${duplicati.length} BRANI SONO GIÀ NELLA TUA LIBRERIA`}
          </Text>
          <Text variant="caption" tone="faint" numberOfLines={2}>{duplicati.join(', ')}</Text>
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            {POLITICHE.map((p) => (
              <View key={p.valore}>
                <Button
                  label={p.etichetta}
                  variant={politica === p.valore ? 'primary' : 'ghost'}
                  onPress={() => onPolitica(p.valore)}
                  style={{ minHeight: 38 }}
                />
                <Text variant="caption" tone="faint" style={{ marginTop: 2 }}>{p.spiegazione}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Button
        label="Ripristina"
        onPress={onConferma}
        disabled={ispezione.entries.length === 0}
        style={{ marginTop: spacing.md }}
      />
      {ispezione.entries.length === 0 ? (
        <Text variant="caption" tone="warning" style={{ marginTop: spacing.xs }}>
          Non c'è niente da ripristinare da questo file.
        </Text>
      ) : null}
    </Card>
  );
}

function messaggioDi(errore: unknown): string {
  if (errore instanceof Error && errore.message) return errore.message;
  return 'Qualcosa non ha funzionato con questo file.';
}
