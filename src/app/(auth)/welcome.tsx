import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { continueOffline, useAppStore } from '../../state/appStore';
import { Button } from '../../ui/components/Button';
import { Text } from '../../ui/components/Text';
import { colors, spacing } from '../../ui/theme';

/**
 * Prima schermata.
 *
 * "Inizia subito" viene prima di "accedi": chi scarica un'app per
 * imparare il pianoforte vuole suonare, non compilare un modulo. L'account
 * serve a sincronizzare, e lo si propone quando c'e' qualcosa da
 * sincronizzare.
 */
export default function Welcome() {
  const router = useRouter();
  const [attesa, setAttesa] = useState(false);
  const remote = useAppStore((s) => s.remote);
  const errore = useAppStore((s) => s.error);

  const inizia = async () => {
    setAttesa(true);
    const ok = await continueOffline();
    setAttesa(false);
    if (ok) router.replace('/(onboarding)/level');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, justifyContent: 'center' }}>
        <View style={{ marginBottom: spacing.xxl }}>
          <Text variant="display">Maestro</Text>
          <Text variant="title" tone="primary" style={{ marginTop: spacing.sm }}>
            Impara il pianoforte{'\n'}con le canzoni italiane
          </Text>
          <Text tone="muted" style={{ marginTop: spacing.md, lineHeight: 22 }}>
            Scegli un brano, suona sul tuo pianoforte o sulla tastiera a schermo
            e ricevi un commento su ogni nota, come con un insegnante accanto.
          </Text>
        </View>

        <Button label="Inizia subito" onPress={inizia} loading={attesa} hint="Non serve registrarsi" />

        {remote ? (
          <>
            <Button
              label="Ho gia un account"
              variant="secondary"
              onPress={() => router.push('/(auth)/sign-in')}
              style={{ marginTop: spacing.sm }}
            />
            <Button
              label="Crea un account"
              variant="ghost"
              onPress={() => router.push('/(auth)/sign-up')}
              style={{ marginTop: spacing.xs }}
            />
          </>
        ) : (
          // Si dice la verita' invece di mostrare pulsanti che non
          // funzionerebbero: senza servizio configurato l'account non esiste.
          <Text variant="caption" tone="faint" center style={{ marginTop: spacing.lg }}>
            Il servizio di sincronizzazione non e' configurato: i tuoi progressi
            resteranno su questo dispositivo.
          </Text>
        )}

        {errore ? (
          <Text tone="error" center style={{ marginTop: spacing.md }}>{errore}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
