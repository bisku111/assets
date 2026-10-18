import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { bootstrap, useAppStore } from '../state/appStore';
import { Text } from '../ui/components/Text';
import { colors } from '../ui/theme';

/**
 * Radice dell'applicazione.
 *
 * Fa tre cose e basta: avvia il caricamento, mostra una schermata di
 * attesa finche' non sa chi e' l'utente, e lo manda dove deve andare.
 * Decidere qui la destinazione evita che ogni schermata debba
 * controllare da sola se c'e' una sessione.
 */
export default function RootLayout() {
  const [avviato, setAvviato] = useState(false);
  const ready = useAppStore((s) => s.ready);
  const session = useAppStore((s) => s.session);
  const onboardingCompleted = useAppStore((s) => s.profile?.onboardingCompleted ?? false);

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (avviato) return;
    setAvviato(true);
    void bootstrap();
  }, [avviato]);

  useEffect(() => {
    if (!ready) return;

    const gruppo = segments[0];
    const inAuth = gruppo === '(auth)';
    const inOnboarding = gruppo === '(onboarding)';

    if (!session && !inAuth) {
      router.replace('/(auth)/welcome');
    } else if (session && !onboardingCompleted && !inOnboarding) {
      router.replace('/(onboarding)/level');
    } else if (session && onboardingCompleted && (inAuth || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [ready, session, onboardingCompleted, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="light" />
        <Text variant="display" style={{ marginBottom: 24 }}>Maestro</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="song/[id]" options={{ presentation: 'card' }} />
        {/* Il tutorial copre tutto: niente barre, niente distrazioni. */}
        <Stack.Screen name="play/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}
