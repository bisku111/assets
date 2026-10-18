import { Tabs } from 'expo-router';
import { Text } from '../../ui/components/Text';
import { colors } from '../../ui/theme';

/**
 * Quattro sezioni, non di più. Le icone sono caratteri: nessun font di
 * icone da caricare, nessuna immagine nel bundle, e si ridimensionano
 * con le impostazioni di accessibilita' del sistema.
 */
const ICONE: Record<string, string> = {
  index: '♪',
  catalog: '⌕',
  progress: '◴',
  profile: '☺',
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11 },
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 20, color }}>{ICONE[route.name] ?? '•'}</Text>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="catalog" options={{ title: 'Canzoni' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progressi' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profilo' }} />
    </Tabs>
  );
}
