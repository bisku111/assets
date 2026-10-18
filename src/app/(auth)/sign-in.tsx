import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signIn, useAppStore } from '../../state/appStore';
import { Button } from '../../ui/components/Button';
import { Text } from '../../ui/components/Text';
import { colors, radius, spacing, typography } from '../../ui/theme';

export default function SignIn() {
  const router = useRouter();
  const errore = useAppStore((s) => s.error);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [attesa, setAttesa] = useState(false);

  const accedi = async () => {
    setAttesa(true);
    const ok = await signIn(email.trim(), password);
    setAttesa(false);
    if (ok) router.replace('/(tabs)');
  };

  const valido = email.includes('@') && password.length >= 6;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, flexGrow: 1, justifyContent: 'center' }}>
          <Text variant="title">Bentornato</Text>
          <Text tone="muted" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
            Accedi per ritrovare i tuoi progressi su tutti i dispositivi.
          </Text>

          <Campo label="Email" value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" />
          <Campo label="Password" value={password} onChangeText={setPassword}
            secureTextEntry textContentType="password" />

          {errore ? <Text tone="error" style={{ marginBottom: spacing.md }}>{errore}</Text> : null}

          <Button label="Accedi" onPress={accedi} loading={attesa} disabled={!valido} />
          <Button label="Indietro" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.xs }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Campo({
  label, ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        style={{
          ...typography.body,
          color: colors.text,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          minHeight: 50,
        }}
      />
    </View>
  );
}
